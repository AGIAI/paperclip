import { describe, expect, it } from "vitest";
import { evaluateMatchers, type MatcherObservation } from "./matchers.js";
import { nativeBlockedReportTask } from "./native-completion-case.js";
import type { MatrixExecution } from "./types.js";

function observation(): MatcherObservation {
  return { message: "BLOCKED_probe. Deployment is blocked. Release Owner must Grant deployment access.",
    issueStatus: "blocked", runStatus: "succeeded", runtimeMode: "native",
    json: { run: { resultJson: { nativeResult: { reportedWorkDisposition: "blocked",
      blocker: { owner: { name: "Release Owner" }, unblockAction: "Grant deployment access", scope: "task_wide" } } } } } };
}

describe("native completion blocker oracle", () => {
  const matchers = nativeBlockedReportTask.buildMatchers("probe", {} as MatrixExecution);
  it("accepts the persisted blocker, owner and exact requested unblock action", async () => {
    expect((await evaluateMatchers(matchers, observation())).every(row => row.passed)).toBe(true);
    expect(nativeBlockedReportTask.buildPrompt("probe")).not.toMatch(/paperclip_(?:finish|block)|reportedWorkDisposition|json/i);
    expect(nativeBlockedReportTask.buildPrompt("probe")).toContain('"Grant deployment access" (without quotation marks or trailing punctuation)');
  });
  it("accepts a future access condition while the task remains blocked", async () => {
    const current = observation();
    current.message = "Deployment remains blocked until access is granted. Release Owner must Grant deployment access. BLOCKED_probe";
    expect((await evaluateMatchers(matchers, current)).every(row => row.passed)).toBe(true);
  });
  it.each(["visible-claim-only", "wrong-owner", "wrong-action", "wrong-scope", "done-report", "legacy-runtime", "run-failed",
    "visible-marker-only", "visible-owner-missing", "visible-action-missing", "visible-reason-missing",
    "visible-not-blocked", "visible-resolved", "visible-access-granted", "action-punctuation"])(
    "rejects %s without trusting the visible completion claim", async variant => {
      const current = observation();
      const result = (current.json as { run: { resultJson: { nativeResult?: { reportedWorkDisposition: string;
        blocker: { owner: { name: string }; unblockAction: string; scope: string } } } } }).run.resultJson;
      if (variant === "visible-claim-only") { current.issueStatus = "in_progress"; delete result.nativeResult; }
      if (variant === "wrong-owner") result.nativeResult!.blocker.owner.name = "Someone else";
      if (variant === "wrong-action") result.nativeResult!.blocker.unblockAction = "Pretend deployment succeeded";
      if (variant === "wrong-scope") result.nativeResult!.blocker.scope = "current_track";
      if (variant === "done-report") result.nativeResult!.reportedWorkDisposition = "done";
      if (variant === "legacy-runtime") current.runtimeMode = "legacy";
      if (variant === "run-failed") current.runStatus = "failed";
      if (variant === "visible-marker-only") current.message = "BLOCKED_probe";
      if (variant === "visible-owner-missing") current.message = current.message!.replace("Release Owner", "Someone");
      if (variant === "visible-action-missing") current.message = current.message!.replace("Grant deployment access", "Take action");
      if (variant === "visible-reason-missing") current.message = "BLOCKED_probe. Release Owner: Grant deployment access.";
      if (variant === "visible-not-blocked") current.message = "Deployment is not blocked. Release Owner completed Grant deployment access. BLOCKED_probe";
      if (variant === "visible-resolved") current.message = "Deployment is no longer blocked. Release Owner must Grant deployment access. BLOCKED_probe";
      if (variant === "visible-access-granted") current.message = "Blocked. Access already granted. Release Owner must Grant deployment access. BLOCKED_probe";
      if (variant === "action-punctuation") result.nativeResult!.blocker.unblockAction += ".";
      expect((await evaluateMatchers(matchers, current)).some(row => !row.passed)).toBe(true);
    });
});
