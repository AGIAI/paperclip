import type { RunnerTaskFixture } from "./types.js";

/** A native-only blocker with facts, not tool names or a completion payload recipe. */
export const nativeBlockedReportTask: RunnerTaskFixture = {
  id: "native-blocked-report",
  label: "Native concrete blocker report",
  groups: ["native-completion"],
  workMode: "standard",
  flow: "single_turn",
  expectedRunCount: 1,
  attemptTimeoutMs: { local: 5 * 60_000, daytona: 5 * 60_000 },
  expectedTerminalState: { issue: "blocked", run: "succeeded" },
  buildTitle: nonce => `Native blocker report ${nonce}`,
  buildVisibleMarker: nonce => `BLOCKED_${nonce.replace(/[^a-z0-9]/gi, "")}`,
  buildPrompt: nonce => [
    "Deployment cannot proceed because required release access has not been granted.",
    "Release Owner is the external owner of that grant. Do not attempt deployment, create subtasks, or claim the access exists.",
    "Record the whole task as blocked, identify the owner as Release Owner, and state the unblock action exactly: Grant deployment access.",
    `Include BLOCKED_${nonce.replace(/[^a-z0-9]/gi, "")} in your final explanation.`,
  ].join("\n"),
  buildMatchers: nonce => [
    { kind: "issue_status", expected: "blocked" },
    { kind: "run_status", expected: "succeeded" },
    { kind: "runtime_mode", expected: "native" },
    { kind: "message_contains", expected: `BLOCKED_${nonce.replace(/[^a-z0-9]/gi, "")}` },
    { kind: "message_contains", expected: "Release Owner" },
    { kind: "message_contains", expected: "Grant deployment access" },
    { kind: "message_regex", pattern: "\\b(?:blocked|cannot proceed|can't proceed|missing|required access|not (?:yet )?granted|awaiting|waiting|unavailable)\\b", flags: "i" },
    { kind: "json_path", path: "run.resultJson.nativeResult.reportedWorkDisposition", expected: "blocked" },
    { kind: "json_path", path: "run.resultJson.nativeResult.blocker.owner.name", expected: "Release Owner" },
    { kind: "json_path", path: "run.resultJson.nativeResult.blocker.unblockAction", expected: "Grant deployment access" },
    { kind: "json_path", path: "run.resultJson.nativeResult.blocker.scope", expected: "task_wide" },
  ],
};
