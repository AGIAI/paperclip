import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

const require = createRequire(path.resolve(import.meta.dirname, "../../server/package.json"));
const { Client } = await import(require.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StreamableHTTPClientTransport } = await import(require.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js"));
export const origin = `http://127.0.0.1:${process.env.PAPERCLIP_RUNNER_E2E_PORT ?? process.env.PAPERCLIP_PUBLIC_MCP_EVAL_PORT ?? 3298}`;
export const resource = origin + "/mcp/paperclip";
export interface Team { id: string; name: string; issuePrefix: string }
export interface Agent { id: string; name: string; status: string }
export interface Task { id: string; companyId: string; title: string; status: string; assigneeAgentId: string | null }
export interface Run { id: string; agentId: string; status: string }
export interface Document { body: string; createdByAgentId: string | null; latestRevisionId: string }
export interface Comment { id: string; body: string; authorUserId: string | null; authorAgentId: string | null }
export interface Tokens { access_token: string; refresh_token: string; expires_in: number; scope: string }
export interface ToolResult { isError?: boolean; structuredContent?: Record<string, unknown>; content: Array<{ type: string; text?: string }> }

export async function api<T>(context: BrowserContext, method: string, route: string, data?: unknown): Promise<T> {
  const response = await context.request.fetch(origin + route, { method, data, headers: { Origin: origin } });
  // Never include response bodies, cookies or OAuth codes in diagnostic errors.
  if (!response.ok()) throw new Error(`Public API ${method} ${route.split("?")[0]} returned HTTP ${response.status()}`);
  return response.status() === 204 ? undefined as T : await response.json() as T;
}
export async function oauthPost(route: string, body: unknown) {
  return fetch(origin + "/mcp/oauth/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function beginConnection(write = true, redirect = origin + "/eval-client-callback") {
  const registration = await oauthPost("register", { client_name: "Paperclip acceptance client", redirect_uris: [redirect] });
  expect(registration.status, "public client registration").toBe(201);
  const { client_id: clientId } = await registration.json() as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", resource, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state, scope: `paperclip:read ${write ? "paperclip:write " : ""}offline_access` });
  const response = await fetch(origin + "/mcp/oauth/authorize?" + params, { redirect: "manual" });
  expect(response.status, "authorization request").toBe(303);
  const consentUrl = response.headers.get("location")!;
  return { clientId, verifier, state, redirect, params, consentUrl, requestId: new URL(consentUrl).pathname.split("/").at(-1)! };
}

export async function connect(context: BrowserContext, team: Team, write = true, page?: Page, secrets: string[] = []) {
  // A real assistant callback has its own origin. A same-origin fake callback
  // would be intercepted by Paperclip's service worker and render the board.
  const callbackServer = page ? createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); res.end("<h1>Assistant connected</h1>"); }) : undefined;
  if (callbackServer) { callbackServer.listen(0, "127.0.0.1"); await once(callbackServer, "listening"); }
  const address = callbackServer?.address();
  const redirect = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}/callback` : undefined;
  try {
  const request = await beginConnection(write, redirect);
  let redirectUrl: string;
  if (page) {
    await page.goto(request.consentUrl);
    await expect(page.getByRole("heading", { name: "Connect your assistant to Paperclip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect team", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: team.name, exact: true }).check();
    if (write) await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Connect team", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Assistant connected" })).toBeVisible();
    redirectUrl = page.url();
    // Leave the secret-bearing callback before any later assertions/evidence.
    await page.goto(origin + "/assistant-connections");
  } else {
    ({ redirectUrl } = await api<{ redirectUrl: string }>(context, "POST", `/api/mcp/requests/${request.requestId}/consent`, { decision: "approve", companyId: team.id, allowWrites: write }));
  }
  const callback = new URL(redirectUrl);
  secrets.push(request.verifier, callback.searchParams.get("code") ?? "");
  expect(callback.searchParams.get("state") === request.state, "OAuth state returned intact").toBe(true);
  const exchange = { grant_type: "authorization_code", client_id: request.clientId, redirect_uri: request.redirect, resource, code: callback.searchParams.get("code"), code_verifier: request.verifier };
  const tokenResponse = await oauthPost("token", exchange);
  expect(tokenResponse.status, "code exchange").toBe(200);
  const tokens = await tokenResponse.json() as Tokens;
  secrets.push(tokens.access_token, tokens.refresh_token);
  return { ...request, tokens, exchange };
  } finally {
    if (callbackServer) { callbackServer.closeAllConnections(); await new Promise<void>(resolve => callbackServer.close(() => resolve())); }
  }
}

export async function mcp(tokens: Tokens) {
  const client = new Client({ name: "paperclip-product-eval", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
  return {
    list: async () => await client.listTools() as { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown>; annotations: { readOnlyHint: boolean } }> },
    call: async (name: string, args: Record<string, unknown> = {}) => await client.callTool({ name, arguments: args }) as ToolResult,
    close: async () => { await client.close(); },
  };
}
export function content<T>(result: ToolResult): T {
  expect(result.isError === true, "MCP operation succeeded").toBe(false);
  expect(result.structuredContent, "MCP returned structured outcome").toBeTruthy();
  return result.structuredContent as T;
}
