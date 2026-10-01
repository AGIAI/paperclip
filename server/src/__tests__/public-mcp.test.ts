import { createHash, randomBytes, randomUUID } from "node:crypto";
import express, { type Request } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, authUsers, companies, companyMemberships, mcpOauthTokens, mcpOauthGrants, mcpOauthClients, mcpMutationReceipts, agents, issues, issueComments, instanceUserRoles } from "@paperclipai/db";
import { createPublicMcpOAuth, publicMcpConfig, hashMcpSecret } from "../services/public-mcp/oauth.js";
import { createMcpApiDispatch, createPublicMcpExecutor, publicMcpCapabilities } from "../services/public-mcp/capabilities.js";
import { publicMcpIngressRoutes, publicMcpManagementRoutes } from "../routes/public-mcp.js";
import { authorizationService } from "../services/authorization.js";
import { issueRoutes } from "../routes/issues.js";
import { activityRoutes } from "../routes/activity.js";
import { documentService } from "../services/documents.js";
import { createStorageService } from "../storage/service.js";
import { createLocalDiskStorageProvider } from "../storage/local-disk-provider.js";
import * as assignmentWakeups from "../services/issue-assignment-wakeup.js";
import { assertCompanyAccess } from "../routes/authz.js";
import { actorMiddleware } from "../middleware/auth.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const config = { origin: "https://paperclip.example", resource: "https://paperclip.example/mcp/paperclip" };
const redirectUri = "https://client.example/callback";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("public MCP configuration", () => {
  it("is opt-in and requires an HTTPS origin outside loopback", () => {
    expect(publicMcpConfig({})).toBeNull();
    expect(() => publicMcpConfig({ PAPERCLIP_PUBLIC_MCP_ENABLED: "true", PAPERCLIP_PUBLIC_URL: "http://example.com" })).toThrow();
    expect(publicMcpConfig({ PAPERCLIP_PUBLIC_MCP_ENABLED: "true", PAPERCLIP_PUBLIC_URL: "http://localhost:3100" })?.resource).toBe("http://localhost:3100/mcp/paperclip");
    expect(publicMcpCapabilities.map((c) => c.name)).not.toEqual(expect.arrayContaining(["run_tool", "call_api"]));
  });
});

describe.skipIf(!support.supported)("public MCP OAuth and tool boundary", () => {
  let temp: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let oauth: ReturnType<typeof createPublicMcpOAuth>;
  beforeAll(async () => {
    temp = await startEmbeddedPostgresTestDatabase("paperclip-public-mcp-");
    db = createDb(temp.connectionString);
    oauth = createPublicMcpOAuth(db, config);
  }, 90000);
  afterAll(async () => { await temp?.cleanup(); });

  async function fixture(role = "member", write = true) {
    const userId = randomUUID();
    await db.insert(authUsers).values({ id: userId, name: "Human", email: userId + "@example.com", createdAt: new Date(), updatedAt: new Date() });
    const [company] = await db.insert(companies).values({ name: "Team", issuePrefix: "M" + randomBytes(4).toString("hex") }).returning();
    const [membership] = await db.insert(companyMemberships).values({ companyId: company!.id, principalType: "user", principalId: userId, membershipRole: role, status: "active" }).returning();
    const actor: Request["actor"] = { type: "board", source: "session", userId };
    const client = await oauth.register({ client_name: "Test client", redirect_uris: [redirectUri] });
    const url = await oauth.authorize({ client_id: client.client_id, redirect_uri: redirectUri, resource: config.resource, scope: "paperclip:read paperclip:write offline_access", state: "state", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
    const id = url.split("/").at(-1)!;
    const consent = await oauth.consent(id, actor, { decision: "approve", companyId: company!.id, allowWrites: write });
    const code = new URL(consent.redirectUrl).searchParams.get("code")!;
    const exchange = { grant_type: "authorization_code", client_id: client.client_id, redirect_uri: redirectUri, resource: config.resource, code, code_verifier: verifier };
    const tokens = await oauth.token(exchange);
    return { actor, company: company!, membership: membership!, client, tokens, exchange };
  }

  it("requires exact redirect, resource, S256 PKCE and real browser consent", async () => {
    await expect(oauth.register({ client_name: "bad", redirect_uris: ["https://u:p@example.com"] })).rejects.toThrow();
    const client = await oauth.register({ client_name: "Client", redirect_uris: [redirectUri] });
    const input = { client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", resource: config.resource, code_challenge: challenge, code_challenge_method: "S256" };
    await expect(oauth.authorize({ ...input, redirect_uri: "https://evil.example" })).rejects.toThrow();
    await expect(oauth.authorize({ ...input, resource: "https://other.example/mcp/paperclip" })).rejects.toThrow();
    await expect(oauth.authorize({ ...input, code_challenge_method: "plain" })).rejects.toThrow();
    const id = (await oauth.authorize(input)).split("/").at(-1)!;
    await expect(oauth.consent(id, { type: "board", source: "local_implicit", userId: "board" }, { decision: "approve", companyId: randomUUID(), allowWrites: true })).rejects.toThrow();
    const f = await fixture();
    const pendingId = (await oauth.authorize(input)).split("/").at(-1)!;
    const pendingConsent = await oauth.consent(pendingId, f.actor, { decision: "approve", companyId: f.company.id, allowWrites: false });
    const pendingCode = new URL(pendingConsent.redirectUrl).searchParams.get("code")!;
    const pendingExchange = { grant_type: "authorization_code", client_id: client.client_id, resource: config.resource, redirect_uri: redirectUri, code: pendingCode, code_verifier: verifier };
    await expect(oauth.token({ ...pendingExchange, code_verifier: randomBytes(32).toString("base64url") })).rejects.toThrow();
    await expect(oauth.token(pendingExchange)).resolves.toHaveProperty("access_token");
    expect(new URL((await oauth.authorize(input)))).toHaveProperty("origin", config.origin);
    await expect(oauth.token(f.exchange)).rejects.toThrow();
    await expect(oauth.token({ ...f.exchange, code_verifier: randomBytes(32).toString("base64url") })).rejects.toThrow();
    const principal = await oauth.authenticate(f.tokens.access_token);
    expect(principal.actor).toMatchObject({ type: "board", source: "mcp_oauth", userId: f.actor.userId, companyIds: [f.company.id], isInstanceAdmin: false });
    const stored = await db.select().from(mcpOauthTokens).where(eq(mcpOauthTokens.grantId, principal.grant.id));
    expect(stored.map((t) => t.tokenHash)).toContain(hashMcpSecret(f.tokens.access_token));
    expect(JSON.stringify(stored)).not.toContain(f.tokens.access_token);
  });

  it("rotates refresh tokens and persists revocation on replay", async () => {
    const f = await fixture();
    const refresh = { grant_type: "refresh_token", client_id: f.client.client_id, resource: config.resource, refresh_token: f.tokens.refresh_token };
    await expect(oauth.token({ ...refresh, resource: "https://other.example" })).rejects.toThrow();
    const next = await oauth.token(refresh);
    expect(next.refresh_token).not.toBe(f.tokens.refresh_token);
    await expect(oauth.token(refresh)).rejects.toThrow();
    await expect(oauth.authenticate(next.access_token)).rejects.toThrow();
  });

  it("rejects token expiry, revocation and membership loss on the next call", async () => {
    const f = await fixture();
    await db.update(mcpOauthTokens).set({ expiresAt: new Date(0) }).where(eq(mcpOauthTokens.tokenHash, hashMcpSecret(f.tokens.access_token)));
    await expect(oauth.authenticate(f.tokens.access_token)).rejects.toThrow();
    const g = await fixture();
    await db.update(companyMemberships).set({ status: "inactive" }).where(eq(companyMemberships.id, g.membership.id));
    await expect(oauth.authenticate(g.tokens.access_token)).rejects.toThrow();
    const h = await fixture();
    await oauth.revokeToken(h.tokens.access_token, h.client.client_id);
    await expect(oauth.authenticate(h.tokens.access_token)).rejects.toThrow();
  });

  it("rejects cross-company calls, missing write scope and changed viewer roles before dispatch", async () => {
    const f = await fixture("member", false);
    const dispatch = vi.fn();
    const execute = createPublicMcpExecutor(db, oauth, dispatch);
    await expect(execute(f.tokens.access_token, "paperclip_list_agents", { companyId: randomUUID() })).rejects.toThrow();
    const args = { companyId: f.company.id, requestId: randomUUID(), taskId: randomUUID(), body: "feedback" };
    await expect(execute(f.tokens.access_token, "paperclip_add_comment", args)).rejects.toThrow();
    const g = await fixture();
    await db.update(companyMemberships).set({ membershipRole: "viewer" }).where(eq(companyMemberships.id, g.membership.id));
    await expect(execute(g.tokens.access_token, "paperclip_add_comment", { ...args, companyId: g.company.id })).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not accept MCP bearer tokens as ordinary board or agent API credentials", async () => {
    const f = await fixture();
    const app = express();
    app.use(actorMiddleware(db, { deploymentMode: "authenticated", resolveSession: async () => null }));
    app.get("/api/actor", (req, res) => res.json(req.actor));
    const response = await request(app).get("/api/actor").set("Authorization", `Bearer ${f.tokens.access_token}`);
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("type", "board");
    expect(response.body).not.toHaveProperty("type", "agent");
  });

  it("isolates concurrent calls and preserves normal HTTP actor permissions", async () => {
    const f = await fixture(); const g = await fixture();
    const api = express.Router(); api.use(boardMutationGuard());
    api.post("/companies/:companyId/issues", (req, res) => { assertCompanyAccess(req, String(req.params.companyId)); res.json({ userId: req.actor.userId, companyId: req.params.companyId, body: req.body }); });
    const dispatch = createMcpApiDispatch(api);
    const fp = await oauth.authenticate(f.tokens.access_token); const gp = await oauth.authenticate(g.tokens.access_token);
    const [one, two] = await Promise.all([dispatch(fp, "POST", `/companies/${f.company.id}/issues`, { title: "one" }), dispatch(gp, "POST", `/companies/${g.company.id}/issues`, { title: "two" })]);
    expect(one).toMatchObject({ userId: f.actor.userId, body: { title: "one" } });
    expect(two).toMatchObject({ userId: g.actor.userId, body: { title: "two" } });
    const unicodeDescription = "字".repeat(50000);
    expect(await dispatch(fp, "POST", `/companies/${f.company.id}/issues`, { description: unicodeDescription })).toHaveProperty("body.description", unicodeDescription);
    await expect(dispatch(fp, "POST", `/companies/${g.company.id}/issues`, {})).rejects.toThrow("403");
  });

  it("replays completed writes, rejects argument changes and contains concurrent/unknown outcomes", async () => {
    const f = await fixture();
    const dispatch = vi.fn().mockResolvedValue({ id: randomUUID(), title: "durable" });
    const execute = createPublicMcpExecutor(db, oauth, dispatch);
    const args = { companyId: f.company.id, requestId: randomUUID(), title: "durable", description: "A report", assigneeAgentId: randomUUID() };
    const first = await execute(f.tokens.access_token, "paperclip_create_task", args);
    expect(await execute(f.tokens.access_token, "paperclip_create_task", args)).toEqual(first);
    const reconnectedClient = await oauth.register({ client_name: "Reconnected assistant", redirect_uris: [redirectUri] });
    const reconnectId = (await oauth.authorize({ client_id: reconnectedClient.client_id, redirect_uri: redirectUri, resource: config.resource, scope: "paperclip:read paperclip:write", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" })).split("/").at(-1)!;
    const reconnectConsent = await oauth.consent(reconnectId, f.actor, { decision: "approve", companyId: f.company.id, allowWrites: true });
    const reconnected = await oauth.token({ grant_type: "authorization_code", client_id: reconnectedClient.client_id, resource: config.resource, redirect_uri: redirectUri, code: new URL(reconnectConsent.redirectUrl).searchParams.get("code"), code_verifier: verifier });
    expect(await execute(reconnected.access_token, "paperclip_create_task", args)).toEqual(first);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[3]).toMatchObject({ status: "todo", title: "durable" });
    await expect(execute(f.tokens.access_token, "paperclip_create_task", { ...args, title: "changed" })).rejects.toThrow("different arguments");
    dispatch.mockRejectedValueOnce(new Error("lost response"));
    const uncertain = { ...args, requestId: randomUUID() };
    expect(await execute(f.tokens.access_token, "paperclip_create_task", uncertain)).toHaveProperty("outcome", "unknown");
    expect(await execute(f.tokens.access_token, "paperclip_create_task", uncertain)).toHaveProperty("outcome", "unknown");
    expect(dispatch).toHaveBeenCalledTimes(2);
    const concurrent = { ...args, requestId: randomUUID() };
    await Promise.all([execute(f.tokens.access_token, "paperclip_create_task", concurrent), execute(f.tokens.access_token, "paperclip_create_task", concurrent)]);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(await db.select().from(mcpMutationReceipts).where(eq(mcpMutationReceipts.requestId, concurrent.requestId))).toHaveLength(1);
  });

  it("does not re-elevate an instance administrator beyond company-role permissions", async () => {
    const f = await fixture("viewer", false);
    await db.insert(instanceUserRoles).values({ userId: f.actor.userId!, role: "instance_admin" });
    const principal = await oauth.authenticate(f.tokens.access_token);
    const decision = await authorizationService(db).decide({ actor: principal.actor, action: "tasks:assign", resource: { type: "company", companyId: f.company.id } });
    expect(decision.allowed).toBe(false);
  });

  it("uses real task/document routes, creates one durable task, and attributes feedback to the person", async () => {
    const f = await fixture();
    // Capture the existing scheduling boundary without launching a paid/local agent.
    const wake = vi.spyOn(assignmentWakeups, "queueIssueAssignmentWakeup").mockResolvedValue(null);
    try {
      const [agent] = await db.insert(agents).values({ companyId: f.company.id, name: "Researcher", role: "researcher", adapterType: "process", status: "idle" }).returning();
      const api = express.Router(); api.use(boardMutationGuard());
      api.use(issueRoutes(db, createStorageService(createLocalDiskStorageProvider("/tmp/paperclip-public-mcp-unused-storage"))));
      api.use(activityRoutes(db));
      const execute = createPublicMcpExecutor(db, oauth, createMcpApiDispatch(api));
      const args = { companyId: f.company.id, requestId: randomUUID(), title: "Write a durable report", description: "Research the supplied material", assigneeAgentId: agent!.id };
      const result = await execute(f.tokens.access_token, "paperclip_create_task", args);
      expect(result).toHaveProperty("task");
      const task = result.task as { id: string; status: string };
      expect(task.status).toBe("todo");
      expect(await execute(f.tokens.access_token, "paperclip_create_task", args)).toEqual(result);
      expect(await db.select().from(issues).where(eq(issues.companyId, f.company.id))).toHaveLength(1);
      expect(wake).toHaveBeenCalledTimes(1);
      expect(wake.mock.calls[0]?.[0]).toMatchObject({ requestedByActorType: "user", requestedByActorId: f.actor.userId });
      // Avoid starting execution when adding feedback; the existing route accepts a completed task without reopening it.
      await db.update(issues).set({ status: "done", assigneeAgentId: null }).where(eq(issues.id, task.id));
      const commentArgs = { companyId: f.company.id, taskId: task.id, requestId: randomUUID(), body: "Please include the source citations." };
      const feedback = await execute(f.tokens.access_token, "paperclip_add_comment", commentArgs);
      expect(feedback).toHaveProperty("comment.authorUserId", f.actor.userId);
      expect(await execute(f.tokens.access_token, "paperclip_add_comment", commentArgs)).toEqual(feedback);
      expect(await db.select().from(issueComments).where(eq(issueComments.issueId, task.id))).toHaveLength(1);
      await documentService(db).upsertIssueDocument({ issueId: task.id, key: "report", title: "Research report", format: "markdown", body: "A concrete durable result.", createdByUserId: f.actor.userId });
      // A fresh executor represents another assistant conversation; no mutable company/session state is shared.
      const later = createPublicMcpExecutor(db, oauth, createMcpApiDispatch(api));
      expect(await later(f.tokens.access_token, "paperclip_read_document", { companyId: f.company.id, taskId: task.id, key: "report" })).toHaveProperty("document.body", "A concrete durable result.");
      const g = await fixture();
      await expect(later(g.tokens.access_token, "paperclip_read_document", { companyId: g.company.id, taskId: task.id, key: "report" })).rejects.toThrow();
      const unavailable = { ...args, requestId: randomUUID(), assigneeAgentId: randomUUID() };
      const rejected = await execute(f.tokens.access_token, "paperclip_create_task", unavailable);
      expect(rejected).toHaveProperty("outcome", "rejected");
      expect(await execute(f.tokens.access_token, "paperclip_create_task", unavailable)).toEqual(rejected);
      expect(wake).toHaveBeenCalledTimes(1);
      // Human assignment to a paused agent is deliberate and allowed by existing routes.
      // Creating its queued task must neither unpause the agent nor claim execution started.
      await db.update(agents).set({ status: "paused" }).where(eq(agents.id, agent!.id));
      const paused = await execute(f.tokens.access_token, "paperclip_create_task", { ...args, requestId: randomUUID(), title: "Wait for the paused researcher" });
      expect(paused).toHaveProperty("task.status", "todo");
      expect(paused.scheduling).toContain("does not guarantee execution has started");
      expect((await db.select().from(agents).where(eq(agents.id, agent!.id)))[0]?.status).toBe("paused");
    } finally { wake.mockRestore(); }
  });

  it("exposes discovery and individually named protocol tools, with CSRF-protected management", async () => {
    const f = await fixture();
    const dispatch = vi.fn().mockResolvedValue([{ id: randomUUID(), name: "Engineer", adapterConfig: { secret: "hidden" } }]);
    const app = express(); app.use(express.json());
    app.use(publicMcpIngressRoutes(oauth, createPublicMcpExecutor(db, oauth, dispatch)));
    app.use((req, _res, next) => { req.actor = f.actor; next(); }); app.use("/api", publicMcpManagementRoutes(oauth));
    const discovery = await request(app).get("/.well-known/oauth-authorization-server");
    expect(discovery.body.code_challenge_methods_supported).toEqual(["S256"]);
    expect((await request(app).post("/mcp/paperclip").send({})).status).toBe(401);
    const rpc = (method: string, params?: unknown) => request(app).post("/mcp/paperclip").timeout({ response: 5000, deadline: 7000 }).set("Authorization", `Bearer ${f.tokens.access_token}`).set("Accept", "application/json, text/event-stream").send({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) });
    expect((await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } })).body.result.serverInfo.name).toBe("paperclip");
    const catalog = await rpc("tools/list");
    expect(catalog.body.result.tools).toHaveLength(10);
    expect(catalog.body.result.tools.find((t: { name: string }) => t.name === "paperclip_create_task").annotations.readOnlyHint).toBe(false);
    const result = await rpc("tools/call", { name: "paperclip_list_agents", arguments: { companyId: f.company.id } });
    expect(JSON.stringify(result.body)).not.toContain("hidden");
    expect(result.body.result.structuredContent.agents[0].name).toBe("Engineer");
    dispatch.mockRejectedValueOnce(new Error("Internal database details: tenant-secret"));
    const failed = await rpc("tools/call", { name: "paperclip_list_agents", arguments: { companyId: f.company.id } });
    expect(failed.body.result.isError).toBe(true);
    expect(JSON.stringify(failed.body)).not.toContain("tenant-secret");
    expect(failed.body.result.content[0].text).toContain("could not confirm");
    const pending = await oauth.authorize({ client_id: f.client.client_id, redirect_uri: redirectUri, resource: config.resource, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
    vi.stubEnv("PAPERCLIP_CLOUD_API_ORIGIN", "https://cloud.example.test");
    try {
      const described = await request(app).get(`/api/mcp/requests/${pending.split("/").at(-1)}`);
      expect(described.body.setupUrl).toBe("https://cloud.example.test/orgs/new");
    } finally { vi.unstubAllEnvs(); }
    const connection = (await oauth.authenticate(f.tokens.access_token)).grant;
    expect((await request(app).delete(`/api/mcp/connections/${connection.id}`)).status).toBe(403);
    expect((await request(app).delete(`/api/mcp/connections/${connection.id}`).set("Origin", config.origin)).status).toBe(204);
    expect((await db.select().from(mcpOauthGrants).where(eq(mcpOauthGrants.id, connection.id)))[0]?.revokedAt).not.toBeNull();
  });
  it("shares registration quotas across replicas and preserves consented clients during retention", async () => {
    const f = await fixture();
    const stale = "stale-" + randomUUID();
    const old = new Date(Date.now() - 2 * 86_400_000);
    await db.insert(mcpOauthClients).values({ id: stale, name: "Never connected", redirectUris: [redirectUri], createdAt: old });
    await db.update(mcpOauthClients).set({ createdAt: old });
    const replica = createPublicMcpOAuth(db, config);
    const registrations = await Promise.allSettled(Array.from({ length: 70 }, (_, index) => (index % 2 ? oauth : replica).register({ client_name: "Quota fixture", redirect_uris: [redirectUri] })));
    const accepted = registrations.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof oauth.register>>> => r.status === "fulfilled");
    try {
      expect(accepted).toHaveLength(60);
      for (const rejected of registrations.filter(r => r.status === "rejected")) expect((rejected as PromiseRejectedResult).reason).toMatchObject({ status: 429 });
      expect(await db.select().from(mcpOauthClients).where(eq(mcpOauthClients.id, stale))).toHaveLength(0);
      expect(await oauth.authenticate(f.tokens.access_token)).toMatchObject({ grant: { clientId: f.client.client_id } });
    } finally {
      for (const row of accepted) await db.delete(mcpOauthClients).where(eq(mcpOauthClients.id, row.value.client_id));
    }
  });

});
