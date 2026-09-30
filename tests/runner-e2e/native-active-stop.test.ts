import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertActiveStopRetirement, observeActiveStopPending, readActiveStopSettlement, type ActiveStopProvider } from "./native-active-stop-evidence.js";
import { stopAtPendingPermission } from "./native-active-stop-flow.js";
import { runnerMatrix, runnerSuites, suiteDefinitionHash } from "./catalog.js";
import { selectRunnerExecutions, parseRunnerSelectors } from "./selectors.js";

const cancellationRequestId = "11111111-2222-4333-8444-555555555555";
type Row = Record<string, any>;
function fixture(provider: ActiveStopProvider = "copilot") {
  const scope = { provider, companyId: "company", issueId: "issue", runId: "run", target: "target.txt", ...(provider === "cursor" ? { commandSha256: `sha256:${"a".repeat(64)}` } : {}) };
  const row = (seq: number, eventType: string, payload: Row): Row => ({ companyId: "company", runId: "run", seq, eventType, protocolSchemaVersion: 1,
    payload: { prpEvent: { schema: "paperclip.prp.event.v1", schemaVersion: 1, sourceKind: "runner", eventType, runId: "run", turnId: "turn",
      normalizedSessionId: "normalized-session", sourceInstanceId: "source", sourceSeq: seq, sourceEventId: `source:run:${seq}`, emittedAt: "2026-01-01T00:00:00Z", payload } } });
  const notice = (seq: number, stage: string, fields: Row) => row(seq, "provider.notice.recorded", {
    schema: "paperclip.provider.notice.v1", scope: "turn", category: `${provider}_tool_evidence_v1`,
    provenance: { sessionId: "native-session", turnId: "turn", eventType: stage, method: stage === "tool" ? "session/update" : "session/request_permission" },
    details: Object.entries({ stage, toolCallId: "tool", ...fields }).map(([name, value]) => ({ name, value: String(value) })),
  });
  const operation = provider === "cursor" ? { operation: "execute", commandSha256: scope.commandSha256 } : { operation: "edit", target: scope.target };
  const events: Row[] = [
    notice(1, "tool", { status: "pending", ...operation }),
    row(2, "tool.execution.started", { schema: "paperclip.tool.execution.v1", executionId: "tool", transport: "builtin", status: "running", ...operation }),
    notice(3, "permission_requested", { requestId: "request", declineOffered: true, ...operation }),
    row(4, "runtime_request.created", { request: { schema: "paperclip.runtime_request.v2", requestKind: "permission_approval", type: "permission", status: "pending", requestId: "request", turnId: "turn", itemId: "tool",
      details: { toolCallId: "tool" }, origin: { adapter: "acpx-runtime-sidecar", provider, method: "session/request_permission" } } }),
  ];
  const run: Row = { id: "run", companyId: "company", nativeIssueId: "issue", runtimeMode: "native", status: "running", resultJson: {} };
  const issue = { id: "issue", companyId: "company", status: "in_progress" };
  const state = () => ({ events, run, issue });
  const pending = () => observeActiveStopPending({ ...state(), scope, cancellationRequestId });
  const settle = (requestId = cancellationRequestId) => {
    events.push(row(5, "runtime_request.cancelled", { provider: "acpx", requestId: "request", turnId: "turn", requestKind: "permission_approval", requestType: "permission", itemId: "tool", reason: "explicit_cancellation", replayAllowed: false }),
      row(6, "turn.cancelled", { provider: "acpx", providerTurnId: "turn", status: "cancelled", error: null }));
    run.status = "cancelled"; run.resultJson = { startupCancellation: { cancellationRequestId: requestId }, nativeCancellation: {
      schema: "paperclip.native-cancellation.v1", intentId: `native-cancellation:${requestId}`, companyId: "company", runId: "run", issueId: "issue", scope: "run",
      dispatched: true, dispatchState: "acknowledged", reasonCode: "cancellation_run_only", effects: ["release_run_resources"], intentAuditId: "audit-intent", acknowledgementAuditId: "audit-ack",
    } };
    return run;
  };
  return { scope, events, run, issue, row, notice, state, pending, settle };
}
const frame = (row: Row) => row.payload.prpEvent;
const payload = (row: Row) => frame(row).payload;
function settled() { const f = fixture(); const pending = f.pending(); f.settle(); return { f, pending, read: () => readActiveStopSettlement({ ...f.state(), pending, dispatchMonotonicNs: (BigInt(pending.observedMonotonicNs) + 1n).toString() }) }; }

describe("definitely active native permission Stop", () => {
  it.each(["cursor", "copilot"] as const)("binds %s's unanswered callback to cancelled provider settlement and caller-owned Stop", provider => {
    const f = fixture(provider), pending = f.pending(); f.settle();
    expect(readActiveStopSettlement({ ...f.state(), pending, dispatchMonotonicNs: (BigInt(pending.observedMonotonicNs) + 1n).toString() })).toMatchObject({
      schema: "paperclip.e2e.native-active-stop-settlement.v1", branch: "pending_permission_cancelled", normalCompletionAccepted: false, taskStillInProgress: true, replayAllowed: false,
      pending: { normalizedSessionId: "normalized-session", nativeSessionId: "native-session", cancellationRequestId },
    });
  });
  it("admits only a fully attested remote bootstrap read completed before the pending operation", () => {
    const f = fixture(), actionFile = `.paperclip-eval-action-${"a".repeat(36)}.txt`;
    const readTargetSha256 = `sha256:${createHash("sha256").update(actionFile).digest("hex")}`;
    for (const row of f.events) { row.seq += 4; frame(row).sourceSeq += 4; frame(row).sourceEventId = `source:run:${row.seq}`; }
    f.events.unshift(f.notice(1, "tool", { toolCallId: "bootstrap", operation: "read", status: "pending", readTargetSha256 }),
      f.row(2, "tool.execution.started", { schema: "paperclip.tool.execution.v1", executionId: "bootstrap", transport: "builtin", status: "running", operation: "read", target: actionFile }),
      f.notice(3, "tool", { toolCallId: "bootstrap", operation: "read", status: "completed", readTargetSha256 }),
      f.row(4, "tool.execution.completed", { schema: "paperclip.tool.execution.v1", executionId: "bootstrap", transport: "builtin", status: "completed", operation: "read", target: actionFile }));
    const bootstrap = { actionFile, events: f.events };
    expect(() => observeActiveStopPending({ ...f.state(), scope: f.scope, cancellationRequestId, bootstrap })).not.toThrow();
    payload(f.events[2]!).details.find((d: Row) => d.name === "readTargetSha256").value = `sha256:${"0".repeat(64)}`;
    expect(() => observeActiveStopPending({ ...f.state(), scope: f.scope, cancellationRequestId, bootstrap })).toThrow(/bootstrap/);
  });
  it("does not compare remote wall clock or transaction timestamps to the operator clock", () => {
    const f = fixture(); for (const row of f.events) { frame(row).emittedAt = "2099-01-01T00:00:00Z"; row.createdAt = "1900-01-01T00:00:00Z"; }
    const pending = f.pending(); f.settle();
    expect(() => readActiveStopSettlement({ ...f.state(), pending, dispatchMonotonicNs: (BigInt(pending.observedMonotonicNs) + 1n).toString() })).not.toThrow();
  });
  it.each([
    ["prior Stop claim", (f: ReturnType<typeof fixture>) => { f.run.resultJson.startupCancellation = { cancellationRequestId }; }],
    ["answered callback", (f: ReturnType<typeof fixture>) => { f.events.push(f.notice(5, "permission_delivered", { requestId: "request", outcome: "cancel" })); }],
    ["already settled provider", (f: ReturnType<typeof fixture>) => { f.events.push(f.row(5, "turn.completed", { status: "completed" })); }],
    ["already closed request", (f: ReturnType<typeof fixture>) => { f.events.push(f.row(5, "runtime_request.resolved", {})); }],
    ["failed operation", (f: ReturnType<typeof fixture>) => { f.events.push(f.row(5, "tool.execution.completed", { schema: "paperclip.tool.execution.v1", transport: "builtin", executionId: "tool", status: "failed" })); }],
  ] as const)("refuses %s before dispatch", (_label, mutate) => { const f = fixture(); mutate(f); expect(f.pending).toThrow(); });
  it.each([
    ["completed terminal", ({ f }: ReturnType<typeof settled>) => { f.events[5]!.eventType = frame(f.events[5]!).eventType = "turn.completed"; payload(f.events[5]!).status = "completed"; }],
    ["interrupted terminal", ({ f }: ReturnType<typeof settled>) => { f.events[5]!.eventType = frame(f.events[5]!).eventType = "turn.interrupted"; payload(f.events[5]!).status = "interrupted"; }],
    ["failed terminal", ({ f }: ReturnType<typeof settled>) => { payload(f.events[5]!).error = { code: "failure" }; }],
    ["duplicate terminal", ({ f }: ReturnType<typeof settled>) => { f.events.push(f.row(7, "turn.cancelled", payload(f.events[5]!))); }],
    ["late same-tool replay", ({ f }: ReturnType<typeof settled>) => { f.events.push(f.notice(7, "tool", { status: "in_progress" })); }],
    ["wrong closed item", ({ f }: ReturnType<typeof settled>) => { payload(f.events[4]!).itemId = "other"; }],
    ["reordered source stream", ({ f }: ReturnType<typeof settled>) => { frame(f.events[5]!).sourceSeq = 1; frame(f.events[5]!).sourceEventId = "source:run:1"; }],
    ["missing terminal", ({ f }: ReturnType<typeof settled>) => { f.events.pop(); }],
    ["wrapper type mismatch", ({ f }: ReturnType<typeof settled>) => { f.events[5]!.eventType = "turn.completed"; }],
    ["foreign normalized session", ({ f }: ReturnType<typeof settled>) => { frame(f.events[5]!).normalizedSessionId = "native-session"; }],
    ["foreign source", ({ f }: ReturnType<typeof settled>) => { frame(f.events[5]!).sourceInstanceId = "foreign"; }],
    ["foreign turn", ({ f }: ReturnType<typeof settled>) => { frame(f.events[5]!).turnId = "other-turn"; }],
    ["foreign company", ({ f }: ReturnType<typeof settled>) => { f.events[5]!.companyId = "other"; }],
    ["foreign request", ({ f }: ReturnType<typeof settled>) => { payload(f.events[4]!).requestId = "other"; }],
    ["expired rather than cancelled", ({ f }: ReturnType<typeof settled>) => { f.events[4]!.eventType = frame(f.events[4]!).eventType = "runtime_request.expired"; }],
    ["provider death", ({ f }: ReturnType<typeof settled>) => { payload(f.events[4]!).reason = "provider_process_lost"; }],
    ["replay permitted", ({ f }: ReturnType<typeof settled>) => { payload(f.events[4]!).replayAllowed = true; }],
    ["tampered pending row", ({ f }: ReturnType<typeof settled>) => { payload(f.events[3]!).request.itemId = "changed"; }],
    ["missing pending receipt", (s: ReturnType<typeof settled>) => { s.pending.requestRowSha256 = ""; }],
    ["foreign intent", ({ f }: ReturnType<typeof settled>) => { f.run.resultJson.nativeCancellation.intentId = "native-cancellation:other"; }],
    ["foreign ack scope", ({ f }: ReturnType<typeof settled>) => { f.run.resultJson.nativeCancellation.companyId = "other"; }],
    ["undispatched cancellation", ({ f }: ReturnType<typeof settled>) => { f.run.resultJson.nativeCancellation.dispatched = false; }],
    ["same audit twice", ({ f }: ReturnType<typeof settled>) => { f.run.resultJson.nativeCancellation.acknowledgementAuditId = "audit-intent"; }],
    ["finished task", ({ f }: ReturnType<typeof settled>) => { f.issue.status = "done"; }],
    ["extra semantic operation", ({ f }: ReturnType<typeof settled>) => { f.events.push(f.row(7, "tool.execution.started", { executionId: "other" })); }],
    ["extra native operation", ({ f }: ReturnType<typeof settled>) => { f.events.push(f.notice(7, "tool", { toolCallId: "other", status: "pending" })); }],
    ["native session switched", ({ f }: ReturnType<typeof settled>) => { payload(f.events[0]!).provenance.sessionId = "other"; }],
    ["target operation completed", ({ f }: ReturnType<typeof settled>) => { f.events.push(f.row(7, "tool.execution.completed", { schema: "paperclip.tool.execution.v1", transport: "builtin", executionId: "tool", status: "completed" })); }],
  ] as const)("rejects %s", (_label, mutate) => { const s = settled(); mutate(s); expect(s.read).toThrow(); });
  it("rejects a Stop dispatch not causally after the pending observation", () => {
    const { f, pending } = settled();
    expect(() => readActiveStopSettlement({ ...f.state(), pending, dispatchMonotonicNs: pending.observedMonotonicNs })).toThrow(/pre-dispatch/);
  });
});

describe("active Stop flow wiring", () => {
  it("awaits retention and rechecks pending before issuing the single caller UUID request", async () => {
    const f = fixture(); const order: string[] = []; let retainedId = "";
    const stop = vi.fn(async (runId: string, id: string) => { expect(runId).toBe("run"); expect(id).toBe(retainedId); order.push("stop"); return f.settle(id); });
    const result = await stopAtPendingPermission({ scope: f.scope, deadlineAt: Date.now() + 1000,
      load: async () => { order.push("load"); return f.state(); },
      retain: async receipt => { order.push("retain-start"); await Promise.resolve(); retainedId = receipt.cancellationRequestId; order.push("retain-done"); }, stop });
    expect(order).toEqual(["load", "retain-start", "retain-done", "load", "stop", "load"]);
    expect(stop).toHaveBeenCalledTimes(1); expect(result.settlement.branch).toBe("pending_permission_cancelled");
  });
  it.each(["retention failed", "competing Stop", "answered after capture"])("never sends Stop when %s", async mode => {
    const f = fixture(), stop = vi.fn();
    await expect(stopAtPendingPermission({ scope: f.scope, deadlineAt: Date.now() + 1000, load: async () => f.state(), stop,
      retain: async () => { if (mode === "retention failed") throw Error("disk failure"); if (mode === "competing Stop") f.run.resultJson.startupCancellation = { cancellationRequestId: "foreign" }; else f.events.push(f.row(5, "runtime_request.resolved", {})); },
    })).rejects.toThrow(); expect(stop).not.toHaveBeenCalled();
  });
  it("fails promptly on a definitive provider failure before calling a throwing evidence reader", async () => {
    const f = fixture(); const started = Date.now();
    await expect(stopAtPendingPermission({ scope: f.scope, deadlineAt: started + 10000, load: async () => f.state(), retain: async () => {}, stop: async (_run, id) => {
      f.settle(id); f.run.status = "failed"; f.events.length = 0; return f.run;
    } })).rejects.toThrow(/Stopped waiting.*unexpected run terminal/);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("explicit active Stop discovery", () => {
  it("adds exactly four versioned cells without enabling them in --all", () => {
    const suite = runnerSuites.find(s => s.id === "native-active-stop")!;
    const cells = runnerMatrix.filter(e => e.suite === suite);
    expect(cells).toHaveLength(4); expect(suite.manualOnly).toBe(true);
    expect(cells.map(e => `${e.profile.qualificationCandidate}/${e.environment.id}`).sort()).toEqual(["copilot/daytona", "copilot/local", "cursor/daytona", "cursor/local"]);
    expect(cells.every(e => e.task.expectedRunCount === 1 && e.task.flow === "native_active_stop" && e.task.expectedTerminalState?.run === "cancelled")).toBe(true);
    expect(suite.definitionMetadata).toMatchObject({ version: 1, normalCompletionAccepted: false, providerDeath: "not-covered" });
    expect(suiteDefinitionHash(suite)).not.toBe(suiteDefinitionHash({ ...suite, definitionMetadata: { ...suite.definitionMetadata, normalCompletionAccepted: true } }));
    expect(selectRunnerExecutions(parseRunnerSelectors(["--all"])).some(e => e.suite.id === suite.id)).toBe(false);
  });
});


describe("active Stop cleanup remains mandatory", () => {
  const proof = () => ({ completed: true, identityChanged: false, processes: { captured: true, live: [] as number[] },
    watcher: { complete: true, targetMutationCount: 0 }, samples: ["before-request", "pending", "after-stop", "after-cleanup"].map(phase => ({ phase, absent: true })) });
  it("requires all causal samples plus the continuous watcher and retired owned identities", () => expect(() => assertActiveStopRetirement(proof())).not.toThrow());
  it.each([
    ["live child", (p: ReturnType<typeof proof>) => { p.processes.live.push(42); }],
    ["unobserved process", (p: ReturnType<typeof proof>) => { p.processes.captured = false; }],
    ["replaced root", (p: ReturnType<typeof proof>) => { p.identityChanged = true; }],
    ["incomplete watch", (p: ReturnType<typeof proof>) => { p.watcher.complete = false; }],
    ["transient write", (p: ReturnType<typeof proof>) => { p.watcher.targetMutationCount = 1; }],
    ["written target", (p: ReturnType<typeof proof>) => { p.samples[2]!.absent = false; }],
    ["missing final sample", (p: ReturnType<typeof proof>) => { p.samples.pop(); }],
    ["missing settlement", (p: ReturnType<typeof proof>) => { p.completed = false; }],
  ] as const)("rejects %s even after an apparent cancelled run", (_label, mutate) => { const p = proof(); mutate(p); expect(() => assertActiveStopRetirement(p)).toThrow(); });
});
