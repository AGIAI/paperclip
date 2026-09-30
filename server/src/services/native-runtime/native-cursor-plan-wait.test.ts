import { describe, expect, it } from "vitest";
import { resolveQualifiedAcpxProfile, validatePrpStructuredRunResult } from "../../vendor/paperclip-runner/index.js";
import { buildQuestionResponseDeliveryEnvelope } from "../question-response-delivery.js";
import { nativeSha256 } from "./canonical.js";
import { nativeCursorPlanWaitFromFacts, type CursorPlanWaitFacts } from "./native-cursor-plan-wait.js";

function fixture(): CursorPlanWaitFacts {
  const b = { companyId: "company", issueId: "issue", agentId: "agent", runId: "run" };
  const contract = { revision: "revision", criteria: [{ id: "criterion" }] };
  const planId = `plan-${"a".repeat(64)}`;
  const input = { schema: "paperclip.question_set.v1", title: "Plan", description: "Exact revised plan text", questions: [{ id: planId, prompt: "Proceed?", required: true, answerMode: "single_select", options: [{ id: "accept", label: "Accept" }, { id: "reject", label: "Reject" }, { id: "cancel", label: "Cancel" }] }] };
  const i = { id: "interaction", ...b, sourceRunId: b.runId, createdByAgentId: b.agentId, resolvedByUserId: "board", resolvedByAgentId: null, resolvedAt: new Date(0),
    kind: "ask_user_questions", status: "answered", continuationPolicy: "none", idempotencyKey: "paperclip-runner-question:run:request",
    payload: { runtimeRequestId: "request", questionSet: input }, result: { version: 1, answers: [{ questionId: planId, optionIds: ["accept"] }] } };
  const envelope = buildQuestionResponseDeliveryEnvelope(i as never);
  const d = { id: "delivery", ...b, interactionId: i.id, sourceRunId: b.runId, targetRunId: b.runId, targetTurnId: null, status: "delivered", deliveryMode: "steered", acknowledgedAt: new Date(1), payloadSha256: nativeSha256(envelope) };
  const event = (sourceSeq: number, eventType: string, payload: Record<string, unknown>) => {
    const e = { schema: "paperclip.prp.event.v1", runId: b.runId, normalizedSessionId: "session", turnId: "turn", sourceInstanceId: "instance", sourceEventId: `instance:${sourceSeq}`, sourceSeq, sourceKind: "runner", schemaVersion: 1, eventType, payload };
    return { ...b, seq: sourceSeq, eventType, payload: { prpEvent: e }, sourceInstanceId: e.sourceInstanceId, sourceEventId: e.sourceEventId, sourceSeq, sourcePayloadSha256: nativeSha256(e), protocolSchemaVersion: 1 };
  };
  return {
    binding: b,
    run: { id: b.runId, companyId: b.companyId, agentId: b.agentId, nativeIssueId: b.issueId, runtimeMode: "native", runnerInstanceId: "instance", status: "running", completionContractId: "contract", completionContractSha256: nativeSha256(contract), runnerProfileJson: { nativeExecutionInput: { binding: b, provider: { kind: "acpx", agent: "cursor", cursorMode: "plan", model: "gpt-5.6-luna[context=272k,reasoning=medium,fast=false]", profile: resolveQualifiedAcpxProfile("cursor", "gpt-5.6-luna[context=272k,reasoning=medium,fast=false]") }, session: { normalizedSessionId: "session" }, completionContract: { id: "contract", sha256: nativeSha256(contract), contract } } } },
    contract: { id: "contract", canonicalSha256: nativeSha256(contract), contractJson: contract },
    events: [
      event(1, "runtime_request.created", { request: { schema: "paperclip.runtime_request.v2", status: "pending", type: "input", requestKind: "runtime", requestId: "request", turnId: "turn", origin: { provider: "cursor", method: "cursor/create_plan", adapter: "acpx-runtime-sidecar" }, input } }),
      event(2, "runtime_request.resolved", { requestId: "request", turnId: "turn", action: "submit", response: envelope.response }),
      event(3, "turn.completed", { status: "completed", error: null }),
    ],
    interactions: [{ interaction: i, delivery: d }],
  } as unknown as CursorPlanWaitFacts;
}
function editEvent(f: CursorPlanWaitFacts, index: number, edit: (e: any) => void) {
  const row = f.events[index]!;
  const e = (row.payload as any).prpEvent;
  edit(e); row.sourcePayloadSha256 = nativeSha256(e);
}

describe("accepted Cursor plan passive-wait authority", () => {
  it("records the accepted revision and explicitly unfinished Plan-mode continuation", () => {
    const value = nativeCursorPlanWaitFromFacts(fixture());
    expect(value?.source).toMatchObject({ requestId: "request", planRevision: `plan-${"a".repeat(64)}`, terminalEventId: "instance:3" });
    expect(value?.result).toMatchObject({ reportedWorkDisposition: "yielded", completionClaim: { objectiveSatisfied: false, remainingWork: [{ blocksCompletion: true }] }, continuation: { kind: "response_wake" } });
    expect(value?.result.summary).toContain("next message");
    const validated = validatePrpStructuredRunResult(value!.result);
    expect(validated.ok).toBe(true);
    if (validated.ok) expect(validated.result).toEqual(value!.result);
  });
  it("projects only declared scope keys from a wider typed caller binding", () => {
    const f = fixture(); Object.assign(f.binding, { wakeupRequestId: "unrelated-caller-metadata" });
    const proof = nativeCursorPlanWaitFromFacts(f);
    expect(proof).not.toBeNull();
    expect(proof!.source).not.toHaveProperty("wakeupRequestId");
  });
  it.each([
    ["foreign runner", (f: CursorPlanWaitFacts) => { f.run.runnerInstanceId = "other"; }],
    ["changed admission binding", (f: CursorPlanWaitFacts) => { (f.run.runnerProfileJson as any).nativeExecutionInput.binding = { ...f.binding, runId: "other" }; }],
    ["wrong company", (f: CursorPlanWaitFacts) => { f.run.companyId = "other"; }],
    ["wrong task", (f: CursorPlanWaitFacts) => { f.run.nativeIssueId = "other"; }],
    ["failed run", (f: CursorPlanWaitFacts) => { f.run.status = "failed"; }],
    ["cancelled run", (f: CursorPlanWaitFacts) => { f.run.status = "cancelled"; }],
    ["Agent mode", (f: CursorPlanWaitFacts) => { (f.run.runnerProfileJson as any).nativeExecutionInput.provider.cursorMode = "agent"; }],
    ["stale profile", (f: CursorPlanWaitFacts) => { (f.run.runnerProfileJson as any).nativeExecutionInput.provider.profile = { ...resolveQualifiedAcpxProfile("cursor", "gpt-5.6-luna[context=272k,reasoning=medium,fast=false]"), commandDigest: "old" }; }],
    ["changed contract", (f: CursorPlanWaitFacts) => { f.contract.contractJson.revision = "new"; }],
    ["unknown origin", (f: CursorPlanWaitFacts) => editEvent(f, 0, e => { e.payload.request.origin.provider = "acpx"; })],
    ["wrong method", (f: CursorPlanWaitFacts) => editEvent(f, 0, e => { e.payload.request.origin.method = "cursor/ask_question"; })],
    ["untrusted adapter", (f: CursorPlanWaitFacts) => editEvent(f, 0, e => { e.payload.request.origin.adapter = "other"; })],
    ["cross turn", (f: CursorPlanWaitFacts) => editEvent(f, 1, e => { e.turnId = "other"; })],
    ["cross session", (f: CursorPlanWaitFacts) => editEvent(f, 1, e => { e.normalizedSessionId = "other"; })],
    ["native error", (f: CursorPlanWaitFacts) => editEvent(f, 2, e => { e.payload.error = { message: "failure" }; })],
    ["changed plan", (f: CursorPlanWaitFacts) => editEvent(f, 0, e => { e.payload.request.input.description = "other"; })],
    ["rejection", (f: CursorPlanWaitFacts) => editEvent(f, 1, e => { e.payload.response.answers[`plan-${"a".repeat(64)}`].selectedOptionIds = ["reject"]; })],
    ["cancellation", (f: CursorPlanWaitFacts) => editEvent(f, 1, e => { e.payload.response.answers[`plan-${"a".repeat(64)}`].selectedOptionIds = ["cancel"]; })],
    ["missing delivery", (f: CursorPlanWaitFacts) => { f.interactions = []; }],
    ["unacknowledged delivery", (f: CursorPlanWaitFacts) => { f.interactions[0]!.delivery.acknowledgedAt = null; }],
    ["fallback wake", (f: CursorPlanWaitFacts) => { f.interactions[0]!.delivery.deliveryMode = "wake_fallback"; }],
    ["wrong target", (f: CursorPlanWaitFacts) => { f.interactions[0]!.delivery.targetRunId = "other"; }],
    ["changed answer digest", (f: CursorPlanWaitFacts) => { f.interactions[0]!.delivery.payloadSha256 = "other"; }],
    ["missing resolution time", (f: CursorPlanWaitFacts) => { f.interactions[0]!.interaction.resolvedAt = null; }],
    ["agent resolved", (f: CursorPlanWaitFacts) => { f.interactions[0]!.interaction.resolvedByAgentId = "agent"; }],
    ["duplicate receipt", (f: CursorPlanWaitFacts) => { f.events.splice(1, 0, structuredClone(f.events[0]!)); }],
    ["duplicate delivery", (f: CursorPlanWaitFacts) => { f.interactions.push(structuredClone(f.interactions[0]!)); }],
    ["uncommitted event", (f: CursorPlanWaitFacts) => { f.events[1]!.sourcePayloadSha256 = null; }],
    ["changed row identity", (f: CursorPlanWaitFacts) => { f.events[1]!.sourceEventId = "other"; }],
    ["terminal before answer", (f: CursorPlanWaitFacts) => { f.events.reverse(); }],
  ] as const)("rejects %s", (_name, mutate) => {
    const f = fixture(); mutate(f); expect(nativeCursorPlanWaitFromFacts(f)).toBeNull();
  });
  it("does not reuse an older acceptance after a new request, later work, or conflicting terminal", () => {
    for (const kind of ["runtime_request.created", "tool.execution.started", "turn.failed", "turn.cancelled", "turn.completed"]) {
      const f = fixture(); const row = structuredClone(f.events[0]!);
      row.seq = 2.5; row.sourceSeq = 3; row.sourceEventId = "instance:later"; row.eventType = kind;
      const e = (row.payload as any).prpEvent; Object.assign(e, { sourceSeq: 3, sourceEventId: row.sourceEventId, eventType: kind });
      if (kind === "runtime_request.created") e.payload.request.requestId = "new-plan";
      row.sourcePayloadSha256 = nativeSha256(e);
      editEvent(f, 2, e => { e.sourceSeq = 4; }); f.events[2]!.sourceSeq = 4;
      f.events.splice(2, 0, row);
      expect(nativeCursorPlanWaitFromFacts(f)).toBeNull();
    }
  });
});
