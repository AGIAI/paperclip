import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { onlyCopilotAttachedOperations, readCopilotSemanticCompletion } from "./copilot-semantic-evidence.js";
import { readCopilotToolEvidence } from "./copilot-evidence.js";
import { runnerSuites, suiteDefinitionHash } from "./catalog.js";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v !== null && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
const result = { schema: "paperclip.run_result.v1", summary: "EXACT-MARKER", reportedWorkDisposition: "done", completionClaim: { contractRevision: "1", objectiveSatisfied: true, criteria: [{ criterionId: "objective", status: "satisfied", evidenceRefs: [] }], remainingWork: [] }, evidence: [], artifacts: [], verification: [], attentionRequests: [] };
const receipt = { schema: "paperclip.semantic_tool_receipt.v1", operationId: "paperclip_finish", callIdentitySha256: hash("3"), inputSha256: hash(canonical(result)), resultSha256: hash("opaque original returned encoding"), outcome: "returned" };
function row(seq: number, eventType: string, payload: any, overrides: any = {}) {
  const e = { schema: "paperclip.prp.event.v1", eventType, runId: "run", turnId: "turn", normalizedSessionId: "normalized", sourceInstanceId: "source", sourceKind: "runner", sourceSeq: seq, emittedAt: "2026-09-30T12:00:00Z", payload, ...overrides };
  return { companyId: "company", runId: "run", seq, eventType, sourceInstanceId: e.sourceInstanceId, sourceSeq: e.sourceSeq, payload: { prpEvent: e } };
}
function notice(seq: number, toolCallId: string, status: string, fields: any = {}) {
  return row(seq, "provider.notice.recorded", { schema: "paperclip.provider.notice.v1", category: "copilot_tool_evidence_v1", scope: "turn", provenance: { method: "session/update", eventType: "tool", sessionId: "native", turnId: "turn" }, details: Object.entries({ stage: "tool", toolCallId, status, ...fields }).map(([name, value]) => ({ name, value: String(value) })) });
}
function fixture() {
  const rows = [notice(1, "command", "pending", { operation: "execute" }), notice(2, "finish-native", "pending"), row(3, "run.result.proposed", structuredClone(result), { itemId: "3" }),
    row(4, "provider.notice.recorded", { schema: "paperclip.provider.notice.v1", category: "paperclip_semantic_tool_receipt_v1", scope: "turn", provenance: { method: "paperclip/semantic_tool_result", eventType: "semantic_result", sessionId: "native", turnId: "turn" }, details: Object.entries({ stage: "semantic_result", ...receipt }).map(([name, value]) => ({ name, value })) }),
    notice(5, "finish-native", "completed", { semanticOperationId: receipt.operationId, semanticCallIdentitySha256: receipt.callIdentitySha256, semanticInputSha256: receipt.inputSha256, semanticResultSha256: receipt.resultSha256, semanticOutcome: receipt.outcome }),
    row(6, "turn.completed", {}), row(7, "run.result.accepted", { result: structuredClone(result) }, { sourceKind: "control_plane", sourceInstanceId: "source:control", sourceSeq: 1 })];
  const expected = { companyId: "company", runId: "run", turnId: "turn", nativeSessionId: "native", command: readCopilotToolEvidence(rows, "run")[0]!, summary: "EXACT-MARKER" };
  return { rows, expected };
}
const frame = (r: any) => r.payload.prpEvent;
function setField(r: any, key: string, value: string) { frame(r).payload.details.find((d: any) => d.name === key).value = value; }
describe("Copilot semantic completion public-event oracle", () => {
  it("versions the actual Copilot suite oracle without changing denial settlement", () => {
    const suite = runnerSuites.find(s => s.id === "copilot-protection")!;
    expect(suite.definitionMetadata).toMatchObject({ version: 7, semanticCompletionEvidence: "paperclip.e2e.copilot-semantic-completion.v1", denialSettlementEvidence: "paperclip.e2e.copilot-denial-settlement.v3" });
    expect(suiteDefinitionHash(suite)).not.toBe(suiteDefinitionHash({ ...suite, definitionMetadata: { ...suite.definitionMetadata, version: 6 } }));
  });
  it("joins exact native lifecycle, authoritative callback, proposed content and accepted control-plane result", () => {
    const { rows, expected } = fixture(); const proof = readCopilotSemanticCompletion(rows, expected);
    expect(proof.nativeToolCallId).toBe("finish-native"); expect(proof.acceptedSeq).toBe(7); expect(proof.summarySha256).toBe(hash("EXACT-MARKER"));
    expect(JSON.stringify(proof)).not.toContain("EXACT-MARKER");
  });
  it.each([0, 1, 2, 3, 4, 5, 6])("rejects missing required row %s", index => { const f = fixture(); f.rows.splice(index, 1); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it.each([1, 2, 3, 4, 5, 6])("rejects duplicate required row %s", index => { const f = fixture(); f.rows.push(structuredClone(f.rows[index]!)); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it.each(["companyId", "runId"])("rejects foreign durable %s", key => { const f = fixture(); (f.rows[3] as any)[key] = "foreign"; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it.each(["turnId", "normalizedSessionId", "sourceInstanceId", "sourceKind", "eventType", "schema"])("rejects foreign or malformed envelope %s", key => {
    for (const index of [1, 2, 3, 4, 5, 6]) { const f = fixture(); (frame(f.rows[index]!))[key] = "foreign"; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); }
  });
  it.each([null, undefined])("rejects missing envelope turn %s even with native provenance intact", turn => { const f = fixture(); frame(f.rows[4]!).turnId = turn; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it.each(["sessionId", "turnId", "method", "eventType"])("rejects authoritative provenance %s mismatch", key => { const f = fixture(); frame(f.rows[3]!).payload.provenance[key] = "foreign"; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it.each(["callIdentitySha256", "inputSha256", "resultSha256", "operationId", "outcome"])("rejects native %s disagreement", key => { const f = fixture(); setField(f.rows[4], `semantic${key[0]!.toUpperCase()}${key.slice(1)}`, key.endsWith("Sha256") ? "a".repeat(64) : "wrong"); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it("does not infer acceptance from returned receipt or a tool named paperclip_finish", () => {
    const f = fixture(); frame(f.rows[6]!).payload.result = { accepted: false, summary: "EXACT-MARKER" }; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow();
    const g = fixture(); frame(g.rows[4]!).payload.title = "paperclip_finish"; frame(g.rows[4]!).payload.details = frame(g.rows[4]!).payload.details.filter((d: any) => !d.name.startsWith("semantic")); expect(() => readCopilotSemanticCompletion(g.rows, g.expected)).toThrow();
  });
  it.each(["failed", "cancelled", "interrupted"])("rejects %s terminal", status => { const f = fixture(); f.rows[5]!.eventType = `turn.${status}`; frame(f.rows[5]!).eventType = `turn.${status}`; expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); });
  it("rejects changed accepted body, forged call ID, wrong summary and rejected result", () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => { frame(f.rows[6]!).payload.result.completionClaim.remainingWork.push("unfinished"); }, (f: ReturnType<typeof fixture>) => { frame(f.rows[2]!).itemId = "4"; }, (f: ReturnType<typeof fixture>) => { f.expected.summary = "other"; }, (f: ReturnType<typeof fixture>) => { f.rows.push(row(8, "run.result.rejected", {})); }]) { const f = fixture(); mutate(f); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); }
  });
  it("rejects duplicate/unknown/oversized receipt details and partial native fields", () => {
    for (const mutate of [(r: any) => frame(r).payload.details.push({ name: "secret", value: "untrusted" }), (r: any) => frame(r).payload.details.push(frame(r).payload.details[0]), (r: any) => setField(r, "operationId", "x".repeat(300))]) { const f = fixture(); mutate(f.rows[3]); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); }
    const f = fixture(); frame(f.rows[4]!).payload.details.pop(); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow();
  });
  it("rejects mutation metadata, extra lifecycle, reordered receipt and source sequence drift", () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => frame(f.rows[1]!).payload.details.push({ name: "operation", value: "edit" }), (f: ReturnType<typeof fixture>) => f.rows.push(notice(8, "finish-native", "pending")), (f: ReturnType<typeof fixture>) => { f.rows[3]!.seq = 8; }, (f: ReturnType<typeof fixture>) => { frame(f.rows[3]!).sourceSeq = 20; f.rows[3]!.sourceSeq = 20; }, (f: ReturnType<typeof fixture>) => { frame(f.rows[1]!).sourceSeq = 20; f.rows[1]!.sourceSeq = 20; }]) { const f = fixture(); mutate(f); expect(() => readCopilotSemanticCompletion(f.rows, f.expected)).toThrow(); }
  });
  it("allows only exact command and correlated finish; unknown reads/edits/delegation remain failures", () => {
    const f = fixture(), proof = readCopilotSemanticCompletion(f.rows, f.expected), notices = readCopilotToolEvidence(f.rows, "run");
    expect(onlyCopilotAttachedOperations(notices, f.expected.command, proof)).toBe(true);
    for (const operation of [undefined, "read", "edit", "execute"] as const) expect(onlyCopilotAttachedOperations([...notices, { ...f.expected.command, toolCallId: "extra", operation }], f.expected.command, proof)).toBe(false);
    expect(onlyCopilotAttachedOperations(notices, f.expected.command, { ...proof, nativeToolCallId: "command" })).toBe(false);
    expect(onlyCopilotAttachedOperations([{ ...notices[1]!, sessionId: "foreign" }], f.expected.command, proof)).toBe(false);
  });
  it("keeps actual flow correlation before no-extra-operation gate and keeps visible marker independent", async () => {
    const source = await readFile(new URL("./copilot-protection-flow.ts", import.meta.url), "utf8");
    expect(source.indexOf("readCopilotSemanticCompletion(runEvents")).toBeLessThan(source.indexOf('check("no-extra-native-operation", onlyCopilotAttachedOperations('));
    expect(source).toContain("undefined), call!, semantic)");
    expect(source).toContain('check("exact-completion-marker", comments.filter');
    expect(source).not.toContain('if (remote) check("no-extra-native-operation"');
  });
});
