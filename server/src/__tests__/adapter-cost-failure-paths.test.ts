import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";

const processResult = vi.hoisted(() => vi.fn());
vi.mock("@paperclipai/adapter-utils/execution-target", async (original) => ({
  ...await original<typeof import("@paperclipai/adapter-utils/execution-target")>(),
  runAdapterExecutionTargetProcess: processResult,
}));

type Execute = (context: AdapterExecutionContext) => Promise<AdapterExecutionResult>;
const cases: Array<{ name: string; execute: () => Promise<Execute>; event: unknown; tokens?: { inputTokens: number; outputTokens: number; cachedInputTokens: number }; price: number | null }> = [
  { name: "codex", execute: async () => (await import("../../../packages/adapters/codex-local/src/server/execute.js")).execute,
    event: { type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 100, output_tokens: 10 } }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: null },
  { name: "claude", execute: async () => (await import("../../../packages/adapters/claude-local/src/server/execute.js")).execute,
    event: { type: "assistant", message: { id: "m1", usage: { input_tokens: 20, cache_read_input_tokens: 100, output_tokens: 10 }, content: [] } }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: null },
  { name: "opencode", execute: async () => (await import("../../../packages/adapters/opencode-local/src/server/execute.js")).execute,
    event: { type: "step_finish", part: { tokens: { input: 20, output: 10, cache: { read: 100 } }, cost: 0.004 } }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: 0.004 },
  { name: "pi", execute: async () => (await import("../../../packages/adapters/pi-local/src/server/execute.js")).execute,
    event: { type: "turn_end", message: { role: "assistant", content: [], usage: { input: 20, output: 10, cacheRead: 100, cost: { total: 0.004 } } } }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: 0.004 },
  { name: "cursor", execute: async () => (await import("../../../packages/adapters/cursor-local/src/server/execute.js")).execute,
    event: { type: "result", usage: { input_tokens: 20, cache_read_input_tokens: 100, output_tokens: 10 }, total_cost_usd: 0.004 }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: 0.004 },
  { name: "gemini", execute: async () => (await import("../../../packages/adapters/gemini-local/src/server/execute.js")).execute,
    event: { type: "result", usage: { input_tokens: 120, cached_input_tokens: 100, output_tokens: 10 }, total_cost_usd: 0.004 }, tokens: { inputTokens: 20, cachedInputTokens: 100, outputTokens: 10 }, price: 0.004 },
  { name: "kimi", execute: async () => (await import("../../../packages/adapters/kimi-local/src/server/execute.js")).execute,
    event: { type: "assistant", content: "partial work" }, price: null },
];

describe("CLI adapter accounting on timeout", () => {
  const directories: string[] = [];
  afterEach(async () => { vi.clearAllMocks(); for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
  it.each(cases.filter(fixture => fixture.name !== "kimi"))("$name flushes its attempt and surfaces checkpoint persistence failures", async (fixture) => {
    const dir = await mkdtemp(join(tmpdir(), "paperclip-accounting-adapter-")); directories.push(dir);
    const command = join(dir, "runtime"); await writeFile(command, "#!/bin/sh\nprintf 'openai  test\\n'\n", { mode: 0o755 });
    const stdout = JSON.stringify(fixture.event);
    processResult.mockImplementation(async (_run, _target, _command, _args, options) => {
      // Local process logging catches callback failures. Finalization must
      // independently enforce receipt durability despite that contract.
      await options.onLog("stdout", stdout).catch(() => {});
      return { exitCode: 0, signal: null, timedOut: false, stdout, stderr: "", pid: 123, startedAt: new Date().toISOString() };
    });
    const onUsage = vi.fn();
    const context: AdapterExecutionContext = {
      runId: "test-run", agent: { id: "test-agent", companyId: "test-company", name: "Accounting", adapterType: `${fixture.name}_local`, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { engine: "cli", command, cwd: dir, model: ["opencode", "pi"].includes(fixture.name) ? "openai/test" : fixture.name === "cursor" ? "gpt-5" : "test", paperclipRuntimeSkills: [],
        env: { OPENAI_API_KEY: "test-placeholder", ANTHROPIC_API_KEY: "test-placeholder", GEMINI_API_KEY: "test-placeholder", OPENCODE_ALLOW_ALL_MODELS: "1", CLAUDE_CONFIG_DIR: dir } },
      context: {}, onLog: async () => {}, onUsage,
    };
    const execute = await fixture.execute();
    await execute(context);
    expect(onUsage.mock.calls.at(-1)![0]).toMatchObject({ usage: fixture.tokens, costUsd: fixture.price, complete: true });
    if (fixture.name === "claude") {
      const mixed = [
        { type: "system", subtype: "init", model: "actual-model" },
        { type: "result", total_cost_usd: 0.003, usage: { input_tokens: 3, output_tokens: 3 }, modelUsage: {
          "model-a": { inputTokens: 1, outputTokens: 1, costUSD: 0.001 },
          "model-b": { inputTokens: 2, outputTokens: 2, costUSD: 0.002 },
        } },
      ];
      processResult.mockImplementation(async (_run, _target, _command, _args, options) => {
        const output = mixed.map(item => JSON.stringify(item)).join("\n");
        await options.onLog("stdout", output).catch(() => {});
        return { exitCode: 0, signal: null, timedOut: false, stdout: output, stderr: "", pid: 123, startedAt: new Date().toISOString() };
      });
      await execute(context);
      expect(onUsage.mock.calls.at(-1)![0]).toMatchObject({ model: "mixed", costUsd: 0.003, complete: true, usageByModel: [
        { model: "model-a", costUsd: 0.001 }, { model: "model-b", costUsd: 0.002 },
      ] });
      delete (mixed[1] as { modelUsage?: unknown }).modelUsage;
      await execute(context);
      expect(onUsage.mock.calls.at(-1)![0]).toMatchObject({ model: "actual-model", complete: true });
    }
    onUsage.mockRejectedValue(new Error("Receipt persistence failed"));
    await expect(execute(context)).rejects.toThrow("Receipt persistence failed");
  });
  it.each(cases)("$name retains observed accounting when the process times out", async (fixture) => {
    const dir = await mkdtemp(join(tmpdir(), "paperclip-accounting-adapter-")); directories.push(dir);
    const command = join(dir, "runtime"); await writeFile(command, "#!/bin/sh\nprintf 'openai  test\\n'\n", { mode: 0o755 });
    processResult.mockResolvedValue({ exitCode: null, signal: "SIGTERM", timedOut: true, stdout: JSON.stringify(fixture.event), stderr: "", pid: 123, startedAt: new Date().toISOString() });
    const execute = await fixture.execute();
    const result = await execute({
      runId: "test-run", agent: { id: "test-agent", companyId: "test-company", name: "Accounting", adapterType: `${fixture.name}_local`, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { engine: "cli", command, cwd: dir, model: ["opencode", "pi"].includes(fixture.name) ? "openai/test" : fixture.name === "cursor" ? "gpt-5" : "test", paperclipRuntimeSkills: [],
        env: { OPENAI_API_KEY: "test-placeholder", ANTHROPIC_API_KEY: "test-placeholder", GEMINI_API_KEY: "test-placeholder", MOONSHOT_API_KEY: "test-placeholder", OPENCODE_ALLOW_ALL_MODELS: "1", CLAUDE_CONFIG_DIR: dir } },
      context: {}, onLog: async () => {},
    });
    expect(result.timedOut).toBe(true);
    expect(result.usageComplete).toBe(["codex", "cursor", "gemini"].includes(fixture.name));
    expect(result.usageBasis).toBe("per_run");
    expect(result.provider).toBeTruthy();
    expect(result.billingType).toBeTruthy();
    if (fixture.tokens) expect(result.usage).toMatchObject(fixture.tokens);
    expect(result.costUsd).toBe(fixture.price);
  });
});
