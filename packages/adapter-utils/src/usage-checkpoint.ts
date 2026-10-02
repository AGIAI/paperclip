import type { AdapterUsageCheckpoint } from "./types.js";

/** Project accounting protocol fields before retaining a stream snapshot.
 * Content-bearing strings are never retained in the accounting buffer. */
const fields = new Set([
  "type", "subtype", "role", "id", "session_id", "sessionID", "thread_id", "model", "modelID", "providerID",
  "usage", "usageMetadata", "modelUsage", "message", "part", "info", "stats", "tokens", "cost", "total",
  "input", "output", "cache", "read", "write", "input_tokens", "output_tokens", "cached_input_tokens",
  "cache_read_input_tokens", "cache_creation_input_tokens", "inputTokens", "outputTokens", "cacheReadInputTokens",
  "cacheCreationInputTokens", "cachedInputTokens", "promptTokenCount", "candidatesTokenCount", "cachedContentTokenCount",
  "reasoning", "cacheRead", "cacheWrite", "prompt", "candidates", "totalTokenCount", "total_tokens", "toolUsePromptTokenCount", "messages",
  "thoughtsTokenCount", "inputTokens", "totalTokens", "cached", "thoughts", "total_cost_usd", "cost_usd", "costUSD",
]);
const stringFields = new Set(["type", "subtype", "role", "id", "session_id", "sessionID", "thread_id", "model", "modelID", "providerID"]);
function project(value: unknown, depth = 0, field = ""): unknown {
  if (depth > 8) return undefined;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "string") return stringFields.has(field) ? value.slice(0, 250) : undefined;
  if (Array.isArray(value)) return value.slice(0, 500).map(item => project(item, depth + 1));
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value).filter(([key]) => fields.has(key))
    .map(([key, entry]) => [key, key === "modelUsage" && entry && typeof entry === "object"
      ? Object.fromEntries(Object.entries(entry).map(([model, usage]) => [model.slice(0, 250), project(usage, depth + 1)]))
      : project(entry, depth + 1, key)]));
}

/** A fresh instance belongs to one CLI attempt. Retries must not concatenate
 * cumulative usage from different attempts. Callback durability is awaited
 * before ordinary log publication. */
export function createUsageCheckpointLog(
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>,
  onUsage: ((receipt: AdapterUsageCheckpoint) => Promise<void>) | undefined,
  parse: (stdout: string) => AdapterUsageCheckpoint | null,
) {
  if (!onUsage) return onLog;
  const attemptId = randomUUID();
  let remainder = "", accounting = "", previous = "";
  return async (stream: "stdout" | "stderr", chunk: string) => {
    if (stream === "stdout") {
      remainder += chunk;
      const lines = remainder.split("\n"); remainder = lines.pop() ?? "";
      if (remainder.length > 8 * 1024 * 1024) throw new Error("Accounting protocol line exceeds 8 MiB");
      for (const line of lines) {
        let raw: unknown;
        try { raw = JSON.parse(line); } catch { continue; }
        const compact = JSON.stringify(project(raw));
        if (!compact || !/usage|tokens|cost|"result"|"turn.completed"|"agent_end"/.test(compact)) continue;
        accounting += compact + "\n";
        if (accounting.length > 8 * 1024 * 1024) throw new Error("Accounting checkpoint history exceeds 8 MiB");
        const receipt = parse(accounting);
        if (!receipt) continue;
        const serialized = JSON.stringify(receipt);
        if (serialized !== previous) { await onUsage({ ...receipt, attemptId }); previous = serialized; }
      }
    }
    await onLog(stream, chunk);
  };
}
import { randomUUID } from "node:crypto";
