import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  completionContracts, heartbeatRunEvents, heartbeatRuns, issues, issueComments,
  nativeRunFinalizations, nativeRunResults, statusDecisions,
  issueQuestionResponseDeliveries, issueThreadInteractions, type Db,
} from "@paperclipai/db";
import type { AskUserQuestionsInteraction } from "@paperclipai/shared";
import {
  parsePaperclipQuestionResponse, parsePaperclipQuestionSet, resolveQualifiedAcpxProfile,
  type PrpStructuredRunResult,
} from "../../vendor/paperclip-runner/index.js";
import { buildQuestionResponseDeliveryEnvelope } from "../question-response-delivery.js";
import { nativeSha256 } from "./canonical.js";

type Binding = { companyId: string; issueId: string; runId: string; agentId: string };
const record = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const same = (a: unknown, b: unknown) => nativeSha256(a) === nativeSha256(b);
const PREFIX = "cursor-plan-wait:";
const EVENT_TYPES = ["runtime_request.created", "runtime_request.resolved", "runtime_request.cancelled", "runtime_request.expired", "turn.started", "turn.completed", "turn.failed", "turn.cancelled", "tool.execution.started", "tool.execution.completed"];
const SUMMARY = "Plan accepted. This task is waiting for your next message. This run used Plan mode; no implementation or task completion is claimed.";

export interface NativeCursorPlanWaitSource extends Binding {
  schema: "paperclip.native_cursor_plan_wait.v1";
  contractId: string;
  contractSha256: string;
  interactionId: string;
  requestId: string;
  planRevision: string;
  turnId: string;
  normalizedSessionId: string;
  sourceInstanceId: string;
  requestEventId: string;
  resolvedEventId: string;
  terminalEventId: string;
  deliveryId: string;
  authoritySha256: string;
}
export interface CursorPlanWaitFacts {
  binding: Binding;
  run: Pick<typeof heartbeatRuns.$inferSelect, "id" | "companyId" | "agentId" | "nativeIssueId" | "runtimeMode" | "status" | "runnerProfileJson" | "runnerInstanceId" | "completionContractId" | "completionContractSha256">;
  contract: Pick<typeof completionContracts.$inferSelect, "id" | "canonicalSha256" | "contractJson">;
  events: Array<Pick<typeof heartbeatRunEvents.$inferSelect, "companyId" | "agentId" | "runId" | "seq" | "eventType" | "payload" | "sourceInstanceId" | "sourceEventId" | "sourceSeq" | "sourcePayloadSha256" | "protocolSchemaVersion">>;
  interactions: Array<{ interaction: typeof issueThreadInteractions.$inferSelect; delivery: typeof issueQuestionResponseDeliveries.$inferSelect }>;
}

/** Only committed native request/answer/normal-terminal facts can create this passive wait. */
export function nativeCursorPlanWaitFromFacts(facts: CursorPlanWaitFacts): { source: NativeCursorPlanWaitSource; result: PrpStructuredRunResult } | null {
  try {
    const { run, contract } = facts;
    const b: Binding = { companyId: facts.binding.companyId, issueId: facts.binding.issueId, runId: facts.binding.runId, agentId: facts.binding.agentId };
    const admission = record(record(run.runnerProfileJson).nativeExecutionInput);
    const provider = record(admission.provider), profile = record(provider.profile);
    const expected = resolveQualifiedAcpxProfile("cursor", typeof provider.model === "string" ? provider.model : "");
    if (run.id !== b.runId || run.companyId !== b.companyId || run.agentId !== b.agentId || run.nativeIssueId !== b.issueId || run.runtimeMode !== "native" || !["running", "succeeded"].includes(run.status) ||
      !Object.entries(b).every(([key, value]) => record(admission.binding)[key] === value) || provider.kind !== "acpx" || provider.agent !== "cursor" || provider.cursorMode !== "plan" || typeof provider.model !== "string" || !provider.model.trim() ||
      !["agent", "driverKind", "protocolVersion", "acpxVersion", "commandDigest", "agentProfileVersion", "agentServerPackage", "agentServerVersion", "agentRuntimePackage", "agentRuntimeVersion"].every(key => profile[key] === record(expected)[key]) ||
      record(admission.completionContract).id !== contract.id || record(admission.completionContract).sha256 !== contract.canonicalSha256 || nativeSha256(contract.contractJson) !== contract.canonicalSha256 || run.completionContractId !== contract.id || run.completionContractSha256 !== contract.canonicalSha256 || !same(contract.contractJson, record(admission.completionContract).contract)) return null;
    const sessionId = record(admission.session).normalizedSessionId;
    if (typeof sessionId !== "string" || !sessionId || facts.events.length === 0 || facts.events.length > 1000) return null;
    const events: Array<Record<string, any>> = [];
    const ids = new Set<string>(), seqs = new Set<string>();
    let lastRowSeq = -1;
    const lastSourceSeq = new Map<string, number>();
    for (const row of facts.events) {
      const event = record(record(row.payload).prpEvent);
      if (!event.schema) continue; // Non-PRP aggregate rows are not native evidence.
      if (row.companyId !== b.companyId || row.runId !== b.runId || row.agentId !== b.agentId || row.seq <= lastRowSeq ||
        event.schema !== "paperclip.prp.event.v1" || event.schemaVersion !== 1 || event.sourceInstanceId !== run.runnerInstanceId || event.sourceKind !== "runner" || event.runId !== b.runId || event.normalizedSessionId !== sessionId ||
        row.eventType !== event.eventType || row.sourceEventId !== event.sourceEventId || row.sourceInstanceId !== event.sourceInstanceId || row.sourceSeq !== event.sourceSeq || row.protocolSchemaVersion !== event.schemaVersion ||
        typeof event.sourceInstanceId !== "string" || !event.sourceInstanceId || typeof event.sourceEventId !== "string" || !event.sourceEventId || !Number.isSafeInteger(event.sourceSeq) || event.sourceSeq < 1 || row.sourcePayloadSha256 !== nativeSha256(event) ||
        (lastSourceSeq.get(event.sourceInstanceId) ?? 0) >= event.sourceSeq || ids.has(event.sourceEventId) || seqs.has(`${event.sourceInstanceId}:${event.sourceSeq}`)) return null;
      lastSourceSeq.set(event.sourceInstanceId, event.sourceSeq);
      lastRowSeq = row.seq; ids.add(event.sourceEventId); seqs.add(`${event.sourceInstanceId}:${event.sourceSeq}`); events.push(event);
    }
    const terminal = events.at(-1);
    if (!terminal || terminal.eventType !== "turn.completed" || record(terminal.payload).status !== "completed" || record(terminal.payload).error != null || typeof terminal.turnId !== "string") return null;
    const turn = events.filter(e => e.turnId === terminal.turnId);
    if (turn.some(e => e.sourceInstanceId !== terminal.sourceInstanceId) || turn.filter(e => ["turn.completed", "turn.failed", "turn.cancelled"].includes(e.eventType)).length !== 1) return null;
    const requests = turn.filter(e => e.eventType === "runtime_request.created");
    const created = requests.at(-1), request = record(record(created?.payload).request), origin = record(request.origin);
    if (!created || request.schema !== "paperclip.runtime_request.v2" || request.type !== "input" || request.requestKind !== "runtime" || request.status !== "pending" || request.turnId !== terminal.turnId ||
      origin.provider !== "cursor" || origin.method !== "cursor/create_plan" || !["acpx-runtime", "acpx-runtime-sidecar"].includes(origin.adapter) || typeof request.requestId !== "string") return null;
    if (new Set(requests.map(e => record(record(e.payload).request).requestId)).size !== requests.length) return null;
    // No unresolved earlier input or later work is disguised as an accepted plan boundary.
    for (const start of requests) {
      const id = record(record(start.payload).request).requestId;
      const ends = turn.filter(e => ["runtime_request.resolved", "runtime_request.cancelled", "runtime_request.expired"].includes(e.eventType) && record(e.payload).requestId === id);
      if (ends.length !== 1 || ends[0]!.sourceSeq <= start.sourceSeq || ends[0]!.eventType !== "runtime_request.resolved") return null;
    }
    if (turn.some(e => e.sourceSeq > created.sourceSeq && e.eventType === "tool.execution.started")) return null;
    const resolved = turn.find(e => e.eventType === "runtime_request.resolved" && record(e.payload).requestId === request.requestId)!;
    const resolution = record(resolved.payload);
    if (resolved.sourceSeq >= terminal.sourceSeq || resolution.action !== "submit" || resolution.turnId !== terminal.turnId) return null;
    const questionSet = parsePaperclipQuestionSet(request.input);
    const plan = questionSet.questions.filter(q => /^plan-[a-f0-9]{64}$/.test(q.id));
    if (plan.length !== 1 || plan[0]!.answerMode !== "single_select" || !plan[0]!.required || !same(plan[0]!.options?.map(o => o.id), ["accept", "reject", "cancel"])) return null;
    const response = parsePaperclipQuestionResponse(questionSet, resolution.response);
    if (!same(response.answers[plan[0]!.id]?.selectedOptionIds, ["accept"])) return null;
    const matches = facts.interactions.filter(({ interaction: i }) => record(i.payload).runtimeRequestId === request.requestId);
    if (matches.length !== 1) return null;
    const { interaction: i, delivery: d } = matches[0]!;
    if (i.companyId !== b.companyId || i.issueId !== b.issueId || i.sourceRunId !== b.runId || i.createdByAgentId !== b.agentId || i.kind !== "ask_user_questions" || i.status !== "answered" || i.continuationPolicy !== "none" || !i.resolvedByUserId || !i.resolvedAt || i.resolvedByAgentId ||
      i.idempotencyKey !== `paperclip-runner-question:${b.runId}:${request.requestId}` || !same(record(i.payload).questionSet, questionSet) ||
      d.companyId !== b.companyId || d.issueId !== b.issueId || d.interactionId !== i.id || d.sourceRunId !== b.runId || d.targetRunId !== b.runId || d.status !== "delivered" || d.deliveryMode !== "steered" || !d.acknowledgedAt || (d.targetTurnId !== null && d.targetTurnId !== terminal.turnId)) return null;
    const envelope = buildQuestionResponseDeliveryEnvelope(i as unknown as AskUserQuestionsInteraction);
    if (d.payloadSha256 !== nativeSha256(envelope) || !same(parsePaperclipQuestionResponse(questionSet, envelope.response), response)) return null;
    const source: NativeCursorPlanWaitSource = {
      ...b, schema: "paperclip.native_cursor_plan_wait.v1", contractId: contract.id, contractSha256: contract.canonicalSha256, interactionId: i.id, requestId: request.requestId, planRevision: plan[0]!.id,
      turnId: terminal.turnId, normalizedSessionId: sessionId, sourceInstanceId: terminal.sourceInstanceId,
      requestEventId: created.sourceEventId, resolvedEventId: resolved.sourceEventId, terminalEventId: terminal.sourceEventId, deliveryId: d.id,
      authoritySha256: nativeSha256({ admission, contract, created, resolved, terminal, interaction: i, delivery: d, resolvedAt: i.resolvedAt?.toISOString(), acknowledgedAt: d.acknowledgedAt.toISOString() }),
    };
    const ref = `interaction:${i.id}`;
    const result: PrpStructuredRunResult = {
      schema: "paperclip.run_result.v1", reportedWorkDisposition: "yielded", summary: SUMMARY,
      completionClaim: { contractRevision: String(contract.contractJson.revision), objectiveSatisfied: false,
        criteria: (contract.contractJson.criteria as Array<{id: string}>).map(c => ({ criterionId: c.id, status: "unknown", evidenceRefs: [ref] })),
        remainingWork: [{ description: "Continue or finalize the accepted plan only after explicit direction; remain in the selected mode.", blocksCompletion: true }] },
      evidence: [{ ref }, { ref: `run-event:${resolved.sourceEventId}` }], verification: [], attentionRequests: [],
      artifacts: [{ kind: "issue_thread_interaction", ref }],
      continuation: { kind: "response_wake", summary: SUMMARY, idempotencyKey: `${PREFIX}${created.sourceEventId}` },
    };
    return { source, result };
  } catch { return null; }
}

export function isNativeCursorPlanWaitResult(value: unknown): boolean {
  const result = record(value);
  return result.reportedWorkDisposition === "yielded" && typeof record(result.continuation).idempotencyKey === "string" && record(result.continuation).idempotencyKey.startsWith(PREFIX);
}

/** The committer calls this again under its issue lock; rows are share-locked then. */
export async function readNativeCursorPlanWait(db: Db, binding: Binding, locked = false) {
  const q = db.select({ run: heartbeatRuns, contract: completionContracts }).from(heartbeatRuns)
    .innerJoin(completionContracts, and(eq(completionContracts.id, heartbeatRuns.completionContractId), eq(completionContracts.companyId, binding.companyId), eq(completionContracts.issueId, binding.issueId)))
    .innerJoin(issues, and(eq(issues.id, binding.issueId), eq(issues.companyId, binding.companyId), eq(issues.assigneeAgentId, binding.agentId)))
    .where(and(eq(heartbeatRuns.id, binding.runId), eq(heartbeatRuns.companyId, binding.companyId), eq(heartbeatRuns.agentId, binding.agentId), eq(heartbeatRuns.nativeIssueId, binding.issueId))).limit(1);
  const [row] = await (locked ? q.for("share", { noWait: true }) : q);
  if (!row || record(record(row.run.runnerProfileJson).nativeExecutionInput).provider?.agent !== "cursor" || record(record(row.run.runnerProfileJson).nativeExecutionInput).provider?.cursorMode !== "plan") return null;
  const eqs = db.select().from(heartbeatRunEvents).where(and(eq(heartbeatRunEvents.companyId, binding.companyId), eq(heartbeatRunEvents.runId, binding.runId), inArray(heartbeatRunEvents.eventType, EVENT_TYPES))).orderBy(asc(heartbeatRunEvents.seq)).limit(1001);
  const events = await (locked ? eqs.for("share", { noWait: true }) : eqs);
  const iq = db.select({ interaction: issueThreadInteractions, delivery: issueQuestionResponseDeliveries }).from(issueThreadInteractions)
    .innerJoin(issueQuestionResponseDeliveries, eq(issueQuestionResponseDeliveries.interactionId, issueThreadInteractions.id))
    .where(and(eq(issueThreadInteractions.companyId, binding.companyId), eq(issueThreadInteractions.issueId, binding.issueId), eq(issueThreadInteractions.sourceRunId, binding.runId))).limit(101);
  const interactions = await (locked ? iq.for("share", { noWait: true }) : iq);
  if (interactions.length > 100) return null;
  return nativeCursorPlanWaitFromFacts({ binding, ...row, events, interactions });
}

/** An exact applied wait suppresses recovery, not a later independently admitted user wake. */
export async function hasCommittedNativeCursorPlanWait(db: Db, binding: Binding): Promise<boolean> {
  const [receipt] = await db.select({ decision: statusDecisions, result: nativeRunResults })
    .from(nativeRunFinalizations)
    .innerJoin(statusDecisions, and(
      eq(statusDecisions.id, nativeRunFinalizations.decisionId),
      eq(statusDecisions.assessmentId, nativeRunFinalizations.assessmentId),
      eq(statusDecisions.companyId, binding.companyId), eq(statusDecisions.issueId, binding.issueId),
      eq(statusDecisions.runId, binding.runId), eq(statusDecisions.applicationState, "applied"),
      eq(statusDecisions.toStatus, "in_progress"), eq(statusDecisions.reasonCode, "native_plan_accepted_waiting_for_continuation"),
    ))
    .innerJoin(nativeRunResults, and(
      eq(nativeRunResults.id, nativeRunFinalizations.resultId), eq(nativeRunResults.companyId, binding.companyId),
      eq(nativeRunResults.issueId, binding.issueId), eq(nativeRunResults.runId, binding.runId), eq(nativeRunResults.schemaStatus, "accepted"),
    ))
    .innerJoin(issues, and(
      eq(issues.id, binding.issueId), eq(issues.companyId, binding.companyId), eq(issues.assigneeAgentId, binding.agentId),
      eq(issues.status, "in_progress"), eq(issues.lastStatusDecisionId, statusDecisions.id), isNull(issues.hiddenAt),
      sql`coalesce(${issues.executionState}->>'status', '') <> 'pending'`,
    ))
    .where(and(eq(nativeRunFinalizations.companyId, binding.companyId), eq(nativeRunFinalizations.issueId, binding.issueId),
      eq(nativeRunFinalizations.runId, binding.runId), eq(nativeRunFinalizations.phase, "committed"))).limit(1);
  if (!receipt) return false;
  const proof = await readNativeCursorPlanWait(db, binding);
  const envelope = record(receipt.result.resultJson), terminal = record(envelope.terminal);
  const acceptedIdentity = record(record(receipt.decision.decisionJson).cursorPlanWaitResult);
  if (!proof || receipt.result.completionContractId !== proof.source.contractId || receipt.result.turnId !== proof.source.turnId || acceptedIdentity.resultId !== receipt.result.id || acceptedIdentity.resultSha256 !== receipt.result.canonicalSha256 || !same(record(receipt.decision.decisionJson).cursorPlanWait, proof.source) || !same(envelope.result, proof.result) ||
    terminal.schema !== "paperclip.prp.terminal.v1" || terminal.runTerminalState !== "succeeded" || terminal.turnTerminalState !== "completed" || terminal.reportedWorkDisposition !== "yielded") return false;
  const [run] = await db.select().from(heartbeatRuns).where(and(eq(heartbeatRuns.id, binding.runId), eq(heartbeatRuns.companyId, binding.companyId))).limit(1);
  if (!run || run.status !== "succeeded") return false;
  // Settings for future runs cannot authorize work on this accepted plan.
  // The original admission is checked above; only task-specific continuation
  // or a superseding decision/run can release this committed passive wait.
  const [interaction] = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.id, proof.source.interactionId)).limit(1);
  if (!interaction?.resolvedAt) return false;
  const [newRequest, newerRun] = await Promise.all([
    db.select({ id: issueComments.id }).from(issueComments).where(and(
      eq(issueComments.companyId, binding.companyId), eq(issueComments.issueId, binding.issueId),
      eq(issueComments.authorType, "user"), gt(issueComments.createdAt, interaction.resolvedAt),
    )).limit(1),
    db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.companyId, binding.companyId), eq(heartbeatRuns.nativeIssueId, binding.issueId), ne(heartbeatRuns.id, binding.runId), gt(heartbeatRuns.createdAt, run.createdAt),
    )).limit(1),
  ]);
  return newRequest.length === 0 && newerRun.length === 0;
}
