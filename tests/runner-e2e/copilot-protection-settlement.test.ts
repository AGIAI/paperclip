import { describe, expect, it, vi } from "vitest";
import { readCopilotToolEvidence } from "./copilot-evidence.js";
import { copilotDenialSampleCursor, readCopilotDenialSettlement } from "./copilot-protection-evidence.js";
import { settleCopilotDeniedRun } from "./copilot-protection-flow.js";

// Sanitized durable order from the failed Daytona attempt: completed was emitted
// at .887, persisted at .900; server Stop was requested at .892 and acked at .909.
const date = (ms: number) => new Date(Date.UTC(2026, 8, 30, 15, 13, 7, ms)).toISOString();
function fixture(eventType = "turn.completed") {
  const frame = (seq: number, type: string, payload: unknown, persisted = 305, emitted = 129): any => ({
    seq: seq + 40, companyId: "company", runId: "run", eventType: type, createdAt: date(persisted),
    payload: { prpEvent: { schema: "paperclip.prp.event.v1", sourceKind: "runner", runId: "run", turnId: "turn",
      normalizedSessionId: "normalized-session", sourceInstanceId: "runner-instance", sourceSeq: seq,
      sourceEventId: `runner-instance:run:${seq}`, eventType: type, emittedAt: date(emitted), payload } },
  });
  const notice = (seq: number, stage: string, details: Record<string, string>) => frame(seq, "provider.notice.recorded", {
    schema: "paperclip.provider.notice.v1", category: "copilot_tool_evidence_v1", scope: "turn",
    provenance: { sessionId: "native-session", turnId: "turn", eventType: stage, method: stage === "tool" ? "session/update" : "session/request_permission" },
    details: Object.entries({ stage, toolCallId: "denied-edit", operation: "edit", ...details }).map(([name, value]) => ({ name, value })),
  });
  const events = [notice(111, "permission_requested", { requestId: "request", target: "copilot-denied-nonce.txt", declineOffered: "true" }),
    notice(113, "permission_delivered", { requestId: "request", outcome: "reject_once" }), notice(114, "tool", { status: "failed" }),
    frame(115, "tool.execution.completed", { schema: "paperclip.tool.execution.v1", executionId: "denied-edit", operation: "edit", status: "failed" }, 317),
    frame(121, eventType, { status: eventType.slice(5), error: null }, 900, 887),
    frame(112, "runtime_request.resolved", { requestId: "request", turnId: "turn", requestKind: "permission_approval", action: "decline" })];
  const run: any = { id: "run", companyId: "company", nativeIssueId: "issue", status: "cancelled", finishedAt: date(910),
    resultJson: { startupCancellation: { requestedAt: date(892) }, nativeCancellation: {
      schema: "paperclip.native-cancellation.v1", companyId: "company", runId: "run", issueId: "issue", scope: "run", dispatched: true,
      dispatchState: "acknowledged", reasonCode: "cancellation_run_only", effects: ["release_run_resources"], intentId: "intent",
      intentAuditId: "intent-audit", acknowledgementAuditId: "ack-audit", recordedAt: date(901), acknowledgedAt: date(909),
    } } };
  return { events, request: readCopilotToolEvidence(events, "run")[0]!, run, issue: { id: "issue", companyId: "company", status: "in_progress" } };
}
const terminal = (f: ReturnType<typeof fixture>) => f.events[4]!.payload.prpEvent;
describe("Copilot denial provider settlement and separate audited run Stop", () => {
  it("accepts the retained normal-terminal race without claiming provider cancellation", () => {
    const f = fixture();
    expect(readCopilotDenialSettlement(f)).toMatchObject({ branch: "provider_completed_before_stop_settlement", providerCancellationTerminalObserved: false,
      providerTerminal: { sourceSeq: 121, failedToolSourceSeq: 115, persistedAtMs: Date.parse(date(900)) }, runStop: { status: "cancelled" } });
    // Native/provider clock skew is irrelevant to server persistence vs ack.
    terminal(f).emittedAt = date(999);
    expect(readCopilotDenialSettlement(f).branch).toBe("provider_completed_before_stop_settlement");
  });
  it.each(["turn.cancelled", "turn.interrupted"])("retains the distinct observed %s branch", type => {
    expect(readCopilotDenialSettlement(fixture(type))).toMatchObject({ branch: "provider_cancelled_or_interrupted", providerCancellationTerminalObserved: true });
  });
  it("cannot use a legacy summary or cancelled run as provider evidence", () => {
    const f = fixture(); f.events.splice(4, 1); f.events.push({ eventType: "turn.completed", payload: {} });
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["equal", "later", "invalid"])("rejects %s normal terminal persistence against the server acknowledgement", kind => {
    const f = fixture(); f.events[4]!.createdAt = kind === "invalid" ? "not-a-date" : date(kind === "equal" ? 909 : 910);
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["runId", "turnId", "normalizedSessionId", "sourceInstanceId", "eventType", "sourceEventId"])("rejects terminal %s mismatch", field => {
    const f = fixture(); terminal(f)[field] = "foreign";
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["missing", "duplicate", "failed", "before-tool", "wrong-status", "error"])("rejects %s terminal", kind => {
    const f = fixture();
    if (kind === "missing") f.events.splice(4, 1);
    if (kind === "duplicate") f.events.push(structuredClone(f.events[4]));
    if (kind === "failed") { f.events[4]!.eventType = terminal(f).eventType = "turn.failed"; terminal(f).payload.status = "failed"; }
    if (kind === "before-tool") { terminal(f).sourceSeq = 114; terminal(f).sourceEventId = "runner-instance:run:114"; }
    if (kind === "wrong-status") terminal(f).payload.status = "cancelled";
    if (kind === "error") terminal(f).payload.error = { code: "failed" };
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["scope", "runId", "companyId", "issueId", "intentId", "intentAuditId", "acknowledgementAuditId", "acknowledgedAt", "recordedAt", "schema", "dispatchState", "dispatched", "reasonCode", "effects"])("rejects malformed or unbound Stop %s", field => {
    const f = fixture(); f.run.resultJson.nativeCancellation[field] = null;
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["missing-stop", "pending", "wrong-scope", "same-audit", "wrong-run-status", "issue-done", "ack-before-intent"])("rejects %s controller state", kind => {
    const f = fixture(), c = f.run.resultJson.nativeCancellation;
    if (kind === "missing-stop") delete f.run.resultJson.nativeCancellation;
    if (kind === "pending") c.dispatchState = "pending";
    if (kind === "wrong-scope") c.scope = "turn";
    if (kind === "same-audit") c.acknowledgementAuditId = c.intentAuditId;
    if (kind === "wrong-run-status") f.run.status = "succeeded";
    if (kind === "issue-done") f.issue.status = "done";
    if (kind === "ack-before-intent") c.recordedAt = date(911);
    expect(() => readCopilotDenialSettlement(f)).toThrow(/settlement/);
  });
  it.each(["native-session", "normalized-session", "failed-tool", "delivery", "duplicate-tool", "tool-order"])("rejects %s corruption", kind => {
    const f = fixture();
    if (kind === "native-session") f.events[2]!.payload.prpEvent.payload.provenance.sessionId = "foreign";
    if (kind === "normalized-session") f.events[2]!.payload.prpEvent.normalizedSessionId = "foreign";
    if (kind === "failed-tool") f.events[3]!.payload.prpEvent.payload.status = "completed";
    if (kind === "delivery") f.events[1]!.payload.prpEvent.payload.details.find((d: any) => d.name === "outcome").value = "allow_once";
    if (kind === "duplicate-tool") f.events.push(structuredClone(f.events[3]));
    if (kind === "tool-order") f.events[3]!.payload.prpEvent.sourceSeq = 122;
    expect(() => readCopilotDenialSettlement(f)).toThrow();
  });
  it.each(["missing", "duplicate", "foreign-turn", "accept", "expired", "after-delivery"])("rejects %s durable resolution", kind => {
    const f = fixture(), r = f.events[5]!, p = r.payload.prpEvent;
    if (kind === "missing") f.events.pop();
    if (kind === "duplicate") f.events.push(structuredClone(r));
    if (kind === "foreign-turn") p.payload.turnId = "foreign";
    if (kind === "accept") p.payload.action = "accept";
    if (kind === "expired") r.eventType = p.eventType = "runtime_request.expired";
    if (kind === "after-delivery") { p.sourceSeq = 114; p.sourceEventId = "runner-instance:run:114"; }
    expect(() => readCopilotDenialSettlement(f)).toThrow();
  });
  it("captures the exact durable stream at the sampling boundary without clock conversion", () => {
    const f = fixture();
    expect(copilotDenialSampleCursor([f.events[0]], f.request)).toEqual({ runId: "run", turnId: "turn", normalizedSessionId: "normalized-session", sourceInstanceId: "runner-instance", sourceSeq: 111 });
    expect(copilotDenialSampleCursor(f.events, f.request).sourceSeq).toBe(121);
    f.events[1]!.payload.prpEvent.normalizedSessionId = "foreign";
    expect(() => copilotDenialSampleCursor(f.events, f.request)).toThrow(/cursor/);
  });
  it("waits for failed-edit persistence before Stop and terminal persistence before sampling", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture("turn.cancelled"), order: string[] = []; let loads = 0;
      const post = vi.fn(async (url: string) => { order.push(url); });
      const load = async () => {
        loads++;
        // Native failed notice arrives first. Run cancellation and retirement
        // also become visible before the durable canonical provider terminal.
        const events = f.events.filter((_, i) => !(loads === 1 && i === 3) && !(loads < 4 && i === 4));
        order.push(`load-${loads}`);
        return { ...f, events, run: loads < 3 ? { ...f.run, status: "running" } : f.run, retired: loads >= 3 };
      };
      const afterDeniedEdit = vi.fn(async () => { order.push("sample-after-decision"); });
      const afterSettlement = vi.fn(async () => { order.push("sample-terminal"); });
      const result = settleCopilotDeniedRun({ api: { post } as any, request: f.request, deadlineAt: Date.now() + 2000,
        load, afterDeniedEdit, afterSettlement });
      await vi.advanceTimersByTimeAsync(0);
      expect(post).not.toHaveBeenCalled(); expect(afterDeniedEdit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(post).toHaveBeenCalledTimes(1); expect(afterSettlement).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect((await result).branch).toBe("provider_cancelled_or_interrupted");
      expect(order).toEqual(["load-1", "load-2", "sample-after-decision", "/api/heartbeat-runs/run/cancel", "load-3", "load-4", "sample-terminal", "load-5"]);
    } finally { vi.useRealTimers(); }
  });
  it.each(["missing-edit", "foreign-edit", "missing-terminal", "foreign-terminal", "live-process"])("fails closed on %s without premature side effects or terminal samples", async kind => {
    vi.useFakeTimers();
    try {
      const f = fixture(), post = vi.fn(async () => {}), sample = vi.fn(async () => {});
      if (kind === "missing-edit") f.events.splice(3, 1);
      if (kind === "foreign-edit") f.events[3]!.payload.prpEvent.normalizedSessionId = "foreign";
      if (kind === "missing-terminal") f.events.splice(4, 1);
      if (kind === "foreign-terminal") terminal(f).sourceInstanceId = "foreign";
      const result = settleCopilotDeniedRun({ api: { post } as any, request: f.request, deadlineAt: Date.now() + 500,
        load: async () => ({ ...f, retired: kind !== "live-process" }), afterDeniedEdit: async () => {}, afterSettlement: sample });
      const rejected = expect(result).rejects.toThrow(/Timed out waiting/);
      await vi.advanceTimersByTimeAsync(600); await rejected;
      expect(post).toHaveBeenCalledTimes(kind.endsWith("edit") ? 0 : 1);
      expect(sample).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("retains completed-before-Stop settlement and propagates retirement sampling failure", async () => {
    const f = fixture(), post = vi.fn(async () => {});
    const input = { api: { post } as any, request: f.request, deadlineAt: Date.now() + 1000,
      load: async () => ({ ...f, retired: true }), afterDeniedEdit: async () => {}, afterSettlement: async () => {} };
    expect((await settleCopilotDeniedRun(input)).branch).toBe("provider_completed_before_stop_settlement");
    await expect(settleCopilotDeniedRun({ ...input, afterSettlement: async () => { throw new Error("remote descendants live"); } })).rejects.toThrow("remote descendants live");
  });
});
