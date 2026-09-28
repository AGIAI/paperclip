import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

// This test runs real pinned Pi RPC without issuing a prompt or loading keys.
const packageRoot = process.env.PAPERCLIP_TEST_PI_RUNTIME_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const extensionSource = await readFile(new URL("../src/drivers/acpx/pi-runtime-extension.ts", import.meta.url), "utf8");

for (const brokenCatalog of [false, true]) {
  test(`real pinned Pi ${brokenCatalog ? "withholds" : "registers"} readiness after MCP initialization`, { timeout: 20_000 }, async (t) => {
    assert.equal(metadata.version, "0.84.2");
    const root = await realpath(await mkdtemp(join(tmpdir(), "paperclip-pi-native-contract-")));
    await mkdir(join(root, "workspace")); await mkdir(join(root, "agent"));
    const extension = join(root, "extension.mjs");
    await writeFile(extension, stripTypeScriptTypes(extensionSource));
    await writeFile(join(root, "pi-acp-runtime.js"), stripTypeScriptTypes(await readFile(new URL("../src/drivers/acpx/pi-acp-runtime.ts", import.meta.url), "utf8")));
    const calls = [];
    const server = createServer(async (request, response) => {
      assert.equal(request.headers.authorization, "Bearer 0123456789abcdef0123456789abcdef");
      let body = ""; for await (const chunk of request) body += chunk;
      const rpc = JSON.parse(body); calls.push(rpc.method);
      response.setHeader("Content-Type", "application/json");
      const result = rpc.method === "initialize"
        ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
        : { tools: [{ name: brokenCatalog ? "invalid/name" : "report_progress", description: "Report progress", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] };
      response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = server.address().port;
    const child = spawn(await realpath(process.execPath), [join(packageRoot, "dist/cli.js"), "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-approve", "--offline", "-e", extension], {
      cwd: join(root, "workspace"), stdio: "pipe",
      env: {
        PATH: process.env.PATH, HOME: root, PI_CODING_AGENT_DIR: join(root, "agent"), PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
        PAPERCLIP_PI_RUNTIME_CONFIGURATION: JSON.stringify({
          invocationNamespace: "00000000-0000-4000-8000-000000000000",
          workspace: join(root, "workspace"), readOnly: true, readRoots: [], protectedRoots: [join(root, "agent")], instructions: "Use the assigned tools",
          servers: [{ type: "http", name: "paperclip", url: `http://127.0.0.1:${port}/mcp`, headers: [{ name: "Authorization", value: "Bearer 0123456789abcdef0123456789abcdef" }] }],
        }),
      },
    });
    let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
    t.after(async () => {
      child.stdin.end();
      if (child.exitCode === null) { const timer = setTimeout(() => child.kill("SIGKILL"), 2000); await once(child, "exit"); clearTimeout(timer); }
      server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    const admission = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Pi RPC admission timed out: ${stderr}`)), 15_000);
      const decoder = new StringDecoder("utf8"); let buffered = "";
      child.stdout.on("data", (chunk) => {
        buffered += decoder.write(chunk);
        for (;;) {
          const at = buffered.indexOf("\n"); if (at < 0) break;
          const line = buffered.slice(0, at); buffered = buffered.slice(at + 1); if (!line.trim()) continue;
          const value = JSON.parse(line);
          if (value.type === "response" && value.id === "admission") { clearTimeout(timer); resolve(value); }
        }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(`Pi RPC exited before admission: ${stderr}`)); });
      child.stdin.write(JSON.stringify({ type: "get_commands", id: "admission" }) + "\n");
    });
    if (brokenCatalog) {
      await assert.rejects(admission, /Pi RPC exited before admission: Error: Failed to load extension/);
      assert.deepEqual(calls, ["initialize", "tools/list"]);
      return;
    }
    const result = await admission;
    assert.equal(result.success, true);
    assert.deepEqual(calls, ["initialize", "tools/list"]);
    const readiness = result.data.commands.find((command) => command.name === "paperclip-runtime-ready-v1");
    assert.equal(readiness?.description, "Paperclip runtime gate v1");
  });
}

test("real pinned Pi model iterations align owned identities across warm prompts", { timeout: 20_000 }, async () => {
  assert.equal(metadata.version, "0.84.2");
  const load = (name) => import(pathToFileURL(join(packageRoot, `dist/core/${name}.js`)).href);
  const [{ createAgentSession }, { DefaultResourceLoader }, { ModelRuntime }, { SessionManager }, { SettingsManager }, { AuthStorage }] = await Promise.all(
    ["sdk", "resource-loader", "model-runtime", "session-manager", "settings-manager", "auth-storage"].map(load),
  );
  const root = await realpath(await mkdtemp(join(tmpdir(), "paperclip-pi-native-order-")));
  let session;
  try {
    await writeFile(join(root, "helper.mjs"), stripTypeScriptTypes(await readFile(new URL("../src/drivers/acpx/pi-acp-runtime.ts", import.meta.url), "utf8")));
    const { PiToolIdentities } = await import(pathToFileURL(join(root, "helper.mjs")).href);
    const namespace = "00000000-0000-4000-8000-000000000000";
    const extensionIds = new PiToolIdentities(namespace); const wrapperIds = new PiToolIdentities(namespace);
    const events = []; const delivered = []; const displayed = []; let streams = 0;
    const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const modelRuntime = await ModelRuntime.create({ credentials: AuthStorage.inMemory({}), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    const model = { id: "fixture", name: "Fixture", api: "openai-completions", provider: "fixture", baseUrl: "http://127.0.0.1:1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 64 };
    const resourceLoader = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [(pi) => {
      pi.on("turn_start", (event) => { extensionIds.begin(); events.push({ surface: "extension", type: event.type, turnIndex: event.turnIndex }); });
      pi.on("turn_end", () => extensionIds.end());
      pi.on("tool_call", (event) => { extensionIds.bind(event.toolCallId, event.toolName, event.input, true); });
      pi.registerTool({ name: "fixture_echo", label: "Fixture echo", description: "No side effects", parameters: { type: "object", properties: {}, additionalProperties: false }, execute: async (nativeId, args) => {
        delivered.push(extensionIds.bind(nativeId, "fixture_echo", args));
        return { content: [{ type: "text", text: "fixture result" }] };
      } });
    }] });
    await resourceLoader.reload();
    ({ session } = await createAgentSession({ cwd: root, agentDir: root, model, modelRuntime, settingsManager: settings, sessionManager: SessionManager.inMemory(root), resourceLoader, noTools: "builtin", thinkingLevel: "off" }));
    const extensionErrors = [];
    await session.bindExtensions({ onError: (error) => extensionErrors.push(error.event) });
    session.subscribe((event) => {
      const normalized = wrapperIds.normalize(event);
      if (event.type === "turn_start") events.push({ surface: "session", type: event.type });
      if (event.type === "tool_execution_start") displayed.push(normalized.toolCallId);
    });
    // Only the model stream is replaced. These are actual pinned Agent loop,
    // AgentSession dispatch, extension hooks, and tool execution paths. No key,
    // network model lookup, provider request, or inference is involved.
    session.agent.streamFunction = () => {
      const index = ++streams; const isTool = index % 3 !== 0;
      const message = { role: "assistant", content: isTool ? [{ type: "toolCall", id: "call_0", name: "fixture_echo", arguments: {} }] : [{ type: "text", text: "done" }], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: isTool ? "toolUse" : "stop", timestamp: index };
      return { async *[Symbol.asyncIterator]() { yield { type: "start", partial: message }; yield { type: "done", reason: message.stopReason, message }; }, result: async () => message };
    };
    await session.agent.prompt("fixture first"); await session.agent.waitForIdle();
    await session.agent.prompt("fixture warm"); await session.agent.waitForIdle();
    assert.deepEqual(extensionErrors, []);
    assert.equal(streams, 6); assert.equal(delivered.length, 4);
    assert.deepEqual(displayed, delivered); assert.equal(new Set(delivered).size, 4);
    assert.deepEqual(events.filter((event) => event.surface === "extension").map((event) => event.turnIndex), [0, 1, 2, 0, 1, 2]);
    for (let index = 0; index < events.length; index++) if (events[index].surface === "session") assert.equal(events[index - 1]?.surface, "extension");
  } finally {
    session?.dispose(); await rm(root, { recursive: true, force: true });
  }
});
