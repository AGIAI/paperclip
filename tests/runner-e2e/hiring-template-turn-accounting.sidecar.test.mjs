import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHiringTemplateTurnAccountingReceipt, evaluateHiringTemplateTurnAccounting,
  TURN_ACCOUNTING_SIDECAR_VERSION } from "./hiring-template-turn-accounting.sidecar.mjs";

const timestamp = seconds => new Date(Date.UTC(2026, 9, 2, 0, 0, seconds)).toISOString();
const outcomeIds = ["one-coder-hire", "execution-account", "two-worker-tasks", "five-successful-turns",
  "initial-json-artifact", "reused-json-artifact", "original-preserved"];
const coverageIds = ["source-fingerprints", "production-ceo-bundle", "assigned-hiring-skill", "production-source-reads",
  "supplied-coder-instructions", "hired-instructions-durable", "hired-skills-durable"];

function fixture(notificationCount = 2) {
  const company = "company", user = "board", lead = "lead", coder = "coder", chat = "chat";
  const binding = { provider: "anthropic", method: "api_key", mode: "responsible_user" };
  function run(id, agentId, issueId, reason, start, finish, source) {
    const invocationSource = reason === "issue_commented" ? "on_demand"
      : reason === "issue_assigned" ? "assignment" : "automation";
    const triggerDetail = reason === "issue_commented" ? "manual" : "system";
    return { id, companyId: company, agentId, responsibleUserId: user, invocationSource, triggerDetail,
      status: "succeeded", runtimeMode: "native", startedAt: timestamp(start), finishedAt: timestamp(finish),
      retryOfRunId: null, processLossRetryCount: 0, scheduledRetryAttempt: 0, continuationAttempt: 0,
      identityHistory: [{ runId: id, companyId: company, responsibleUserId: user, status: "accepted",
        cause: reason, messageId: null, acceptedAt: timestamp(start) }],
      contextSnapshot: { source, issueId, wakeReason: reason, wakeSource: invocationSource,
        wakeTriggerDetail: triggerDetail, conversationSessionGeneration: 0, wakeCommentIds: [],
        aiConnection: { ...binding, connectionId: "account", responsibleUserId: user } } };
  }
  const requested = [run("lead-first", lead, chat, "issue_commented", 1, 10, "issue.comment"),
    run("lead-reuse", lead, chat, "issue_commented", 21, 30, "issue.comment"),
    run("lead-status", lead, chat, "issue_commented", 51, 55, "issue.comment")];
  const comments = requested.map((r, i) => {
    const id = `request-${i + 1}`;
    r.contextSnapshot.wakeCommentId = id;
    r.contextSnapshot.wakeCommentIds = [id];
    r.identityHistory.push({ runId: r.id, companyId: company, responsibleUserId: user, status: "accepted",
      cause: "instruction", messageId: id, acceptedAt: r.startedAt });
    return { id, companyId: company, issueId: chat, authorUserId: user, authorAgentId: null,
      body: `Fixture request ${i + 1}`, createdAt: timestamp([0, 20, 50][i]) };
  });
  const workers = [run("worker-first", coder, "first-task", "issue_assigned", 4, 12, "paperclip_runner.create_task"),
    run("worker-reuse", coder, "second-task", "issue_assigned", 25, 40, "paperclip_runner.create_task")];
  const tasks = workers.map((r, i) => ({ id: r.contextSnapshot.issueId, companyId: company, projectId: "project",
    parentId: null, status: "done", identifier: `RUN-${i + 2}`, responsibleUserId: user,
    assigneeAgentId: coder, createdByAgentId: lead, createdByUserId: null, originRunId: requested[i].id,
    createdAt: timestamp([2, 22][i]), completedAt: timestamp([11, 39][i]) }));
  const notifications = [];
  for (let i = 0; i < notificationCount; i++) {
    const r = run(`notify-${i + 1}`, lead, chat, "chat_task_completed", notificationCount === 1 ? 41 : [13, 41][i],
      notificationCount === 1 ? 45 : [18, 45][i]);
    const covered = notificationCount === 1 ? tasks : [tasks[i]];
    r.contextSnapshot.chatCompletionDeliveryIds = covered.map(t => `delivery-${t.id}`);
    r.contextSnapshot.chatCompletionUpdates = covered.map(t => ({ id: t.id, identifier: t.identifier,
      status: "done", completedAt: t.completedAt, url: `/issues/${t.identifier}`, hasSavedDocuments: true }));
    comments.push({ id: `reply-${i + 1}`, companyId: company, issueId: chat, authorAgentId: lead,
      authorUserId: null, createdByRunId: r.id, body: "The saved fixture is complete.",
      conversationSessionGeneration: null, createdAt: r.finishedAt });
    notifications.push(r);
  }
  const runs = [...requested, ...workers, ...notifications];
  const countPasses = notificationCount === 0;
  const hiringTemplate = { schema: "paperclip.hiring-templates.v1", definitionDigest: "d".repeat(64),
    evidence: { leadId: lead, chatIssueId: chat, hireName: "Fixture Coder", projectId: "project", connectionId: "account", binding,
      agents: [{ id: lead, companyId: company }, { id: coder, companyId: company, name: "Fixture Coder" }],
      first: { issueId: tasks[0].id }, second: { issueId: tasks[1].id }, runs, tasks },
    result: { outcomePassed: countPasses, comparisonStatus: "uncomparable", checks: [
      ...outcomeIds.map(id => ({ id, dimension: "outcome", passed: id !== "five-successful-turns" || countPasses })),
      ...coverageIds.map(id => ({ id, dimension: "coverage", passed: id !== "production-source-reads" }))] } };
  const apiState = { issue: { id: chat, companyId: company, conversationUserId: user,
    conversationAgentId: lead, conversationSessionGeneration: 0 }, comments, runs: structuredClone(runs) };
  return { hiringTemplate, apiState };
}
const e = f => f.hiringTemplate.evidence;
const notification = f => e(f).runs.find(r => r.id === "notify-1");
const worker = f => e(f).runs.find(r => r.id === "worker-first");
const request = f => e(f).runs.find(r => r.id === "lead-first");
const sync = f => { f.apiState.runs = structuredClone(e(f).runs); return f; };
const fails = (f, predicate) => {
  const result = evaluateHiringTemplateTurnAccounting(f);
  assert.equal(result.accountingPassed, false);
  assert.equal(result.correctedWorkflowOutcomePassed, false);
  assert.equal(result.predicates.find(p => p.id === predicate)?.passed, false);
};

for (const [count, label] of [[0, "five exact work turns"], [1, "six runs with one batched completion"], [2, "seven runs with distinct completions"]]) {
  test(`accepts ${label} without upgrading source coverage`, () => {
    const result = evaluateHiringTemplateTurnAccounting(fixture(count));
    assert.equal(result.accountingPassed, true);
    assert.equal(result.correctedWorkflowOutcomePassed, true);
    assert.equal(result.counts.requestedLeadTurns, 3);
    assert.equal(result.counts.coderTurns, 2);
    assert.equal(result.counts.completionTurns, count);
    assert.equal(result.counts.actualRunCount, 5 + count);
    assert.equal(result.counts.costAccountingRunCount, 5 + count);
    assert.equal(result.original.outcomePassed, count === 0);
    assert.equal(result.original.comparisonStatus, "uncomparable");
    assert.deepEqual(result.original.failedCoverageChecks, ["production-source-reads"]);
    assert.equal(result.sourceCoverageRegraded, false);
    assert.equal(result.broadEquivalenceEstablished, false);
  });
}

const negatives = [
  ["an eighth run", f => { e(f).runs.push({ ...structuredClone(notification(f)), id: "extra" }); }, "exact-five-required-work-turns"],
  ["a duplicate run ID", f => { e(f).runs.push(structuredClone(notification(f))); }, "complete-public-run-ledger"],
  ["an arbitrary chat wake", f => { notification(f).contextSnapshot.wakeReason = "heartbeat_timer"; }, "exact-five-required-work-turns"],
  ["a completion label on a coder run", f => { notification(f).agentId = "coder"; }, "exact-five-required-work-turns"],
  ["an extra requested lead turn", f => { e(f).runs.push({ ...structuredClone(request(f)), id: "lead-extra" }); }, "exact-five-required-work-turns"],
  ["an extra coder execution", f => { e(f).runs.push({ ...structuredClone(worker(f)), id: "worker-extra" }); }, "exact-five-required-work-turns"],
  ["a missing requested lead turn", f => { e(f).runs = e(f).runs.filter(r => r.id !== "lead-status"); }, "exact-five-required-work-turns"],
  ["a missing coder execution", f => { e(f).runs = e(f).runs.filter(r => r.id !== "worker-first"); }, "exact-five-required-work-turns"],
  ["a missing production lead identity", f => { e(f).agents[0].id = "other"; }, "known-fixture-context"],
  ["a failed notification", f => { notification(f).status = "failed"; }, "successful-native-without-retries"],
  ["a legacy notification runtime", f => { notification(f).runtimeMode = "legacy"; }, "successful-native-without-retries"],
  ["a retried notification", f => { notification(f).retryOfRunId = "prior"; }, "successful-native-without-retries"],
  ["hidden process retries", f => { notification(f).processLossRetryCount = 1; }, "successful-native-without-retries"],
  ["a scheduled retry", f => { notification(f).scheduledRetryAttempt = 1; }, "successful-native-without-retries"],
  ["a continuation run", f => { notification(f).continuationAttempt = 1; }, "successful-native-without-retries"],
  ["a run in another company", f => { notification(f).companyId = "other"; }, "resolved-company-account-and-identity"],
  ["a wrong managed account", f => { notification(f).contextSnapshot.aiConnection.connectionId = "other"; }, "resolved-company-account-and-identity"],
  ["a wrong provider", f => { worker(f).contextSnapshot.aiConnection.provider = "other"; }, "resolved-company-account-and-identity"],
  ["a wrong auth method", f => { worker(f).contextSnapshot.aiConnection.method = "host"; }, "resolved-company-account-and-identity"],
  ["a wrong responsible-user binding", f => { notification(f).contextSnapshot.aiConnection.responsibleUserId = "other"; }, "resolved-company-account-and-identity"],
  ["a wrong run responsible user", f => { request(f).responsibleUserId = "other"; }, "resolved-company-account-and-identity"],
  ["an accepted foreign identity", f => { notification(f).identityHistory[0].responsibleUserId = "other"; }, "resolved-company-account-and-identity"],
  ["an identity receipt for another run", f => { notification(f).identityHistory[0].runId = "other"; }, "resolved-company-account-and-identity"],
  ["a missing instruction receipt", f => { request(f).identityHistory.pop(); }, "three-distinct-requested-chat-turns"],
  ["a rejected instruction receipt", f => { request(f).identityHistory[1].status = "rejected"; }, "three-distinct-requested-chat-turns"],
  ["a wrong instruction comment", f => { request(f).identityHistory[1].messageId = "other"; }, "three-distinct-requested-chat-turns"],
  ["a forged request author", f => { f.apiState.comments[0].authorUserId = "other"; }, "three-distinct-requested-chat-turns"],
  ["an additional user request", f => { f.apiState.comments.push({ ...f.apiState.comments[0], id: "request-extra" }); }, "three-distinct-requested-chat-turns"],
  ["two runs for one request comment", f => { e(f).runs.find(r => r.id === "lead-reuse").contextSnapshot.wakeCommentId = "request-1"; }, "three-distinct-requested-chat-turns"],
  ["a different requested chat generation", f => { request(f).contextSnapshot.conversationSessionGeneration = 1; }, "three-distinct-requested-chat-turns"],
  ["a worker assigned to another agent", f => { e(f).tasks[0].assigneeAgentId = "other"; }, "one-coder-execution-per-known-task"],
  ["a task outside the selected project", f => { e(f).tasks[0].projectId = "other"; }, "one-coder-execution-per-known-task"],
  ["a notification-created task", f => { e(f).tasks[0].originRunId = notification(f).id; }, "no-notification-created-extra-tasks"],
  ["a task created by the status-only turn", f => { e(f).tasks[0].originRunId = "lead-status"; }, "task-origins-are-first-two-requested-turns"],
  ["an extra task without an execution", f => { e(f).tasks.push({ ...e(f).tasks[0], id: "extra-task" }); }, "no-notification-created-extra-tasks"],
  ["a wake without delivery IDs", f => { delete notification(f).contextSnapshot.chatCompletionDeliveryIds; }, "bounded-server-completion-receipts"],
  ["a wake without task updates", f => { delete notification(f).contextSnapshot.chatCompletionUpdates; }, "bounded-server-completion-receipts"],
  ["mismatched receipt cardinality", f => { notification(f).contextSnapshot.chatCompletionDeliveryIds.push("extra-delivery"); }, "bounded-server-completion-receipts"],
  ["a duplicate delivery across runs", f => { e(f).runs.find(r => r.id === "notify-2").contextSnapshot.chatCompletionDeliveryIds = notification(f).contextSnapshot.chatCompletionDeliveryIds; }, "bounded-server-completion-receipts"],
  ["a duplicate task notification with a fresh delivery ID", f => { e(f).runs.find(r => r.id === "notify-2").contextSnapshot.chatCompletionUpdates = structuredClone(notification(f).contextSnapshot.chatCompletionUpdates); }, "bounded-server-completion-receipts"],
  ["an unknown notified task", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].id = "unknown"; }, "bounded-server-completion-receipts"],
  ["a pre-completion wake", f => { notification(f).startedAt = timestamp(10); }, "bounded-server-completion-receipts"],
  ["a false completedAt receipt", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].completedAt = timestamp(10); }, "bounded-server-completion-receipts"],
  ["a false task identifier", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].identifier = "OTHER-1"; }, "bounded-server-completion-receipts"],
  ["a wrong task link", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].url = "/issues/OTHER-1"; }, "bounded-server-completion-receipts"],
  ["a false task status", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].status = "in_progress"; }, "bounded-server-completion-receipts"],
  ["a task without a saved result", f => { notification(f).contextSnapshot.chatCompletionUpdates[0].hasSavedDocuments = false; }, "bounded-server-completion-receipts"],
  ["a stale completion generation", f => { notification(f).contextSnapshot.conversationSessionGeneration = 1; }, "bounded-server-completion-receipts"],
  ["a manually invoked completion label", f => { notification(f).invocationSource = "on_demand"; }, "bounded-server-completion-receipts"],
  ["a mixed request/completion wake", f => { notification(f).contextSnapshot.wakeCommentId = "request-1"; }, "bounded-server-completion-receipts"],
  ["a missing completion dispatch identity", f => { notification(f).identityHistory = []; }, "bounded-server-completion-receipts"],
  ["a missing completion reply", f => { f.apiState.comments = f.apiState.comments.filter(c => c.id !== "reply-1"); }, "completion-runs-have-attributed-chat-replies"],
  ["a reply attributed to a different run", f => { f.apiState.comments.find(c => c.id === "reply-1").createdByRunId = "lead-first"; }, "completion-runs-have-attributed-chat-replies"],
  ["a reply by another agent", f => { f.apiState.comments.find(c => c.id === "reply-1").authorAgentId = "coder"; }, "completion-runs-have-attributed-chat-replies"],
  ["a reply in another chat", f => { f.apiState.comments.find(c => c.id === "reply-1").issueId = "other"; }, "completion-runs-have-attributed-chat-replies"],
  ["a reply before task completion", f => { f.apiState.comments.find(c => c.id === "reply-1").createdAt = timestamp(10); }, "completion-runs-have-attributed-chat-replies"],
];
for (const [label, mutate, predicate] of negatives) test(`rejects ${label}`, () => {
  const f = fixture(); mutate(f); fails(sync(f), predicate);
});
test("rejects extra runs present only in the final public ledger", () => {
  const f = fixture(); f.apiState.runs.push({ ...structuredClone(notification(f)), id: "extra" });
  fails(f, "complete-public-run-ledger");
  assert.equal(evaluateHiringTemplateTurnAccounting(f).counts.costAccountingRunCount, 8);
});
test("rejects an account discrepancy between retained ledgers", () => {
  const f = fixture(); f.apiState.runs[0].contextSnapshot.aiConnection.method = "host";
  fails(f, "complete-public-run-ledger");
});
test("does not override a retained artifact outcome failure", () => {
  const f = fixture(); f.hiringTemplate.result.checks.find(c => c.id === "initial-json-artifact").passed = false;
  const result = evaluateHiringTemplateTurnAccounting(f);
  assert.equal(result.accountingPassed, true);
  assert.equal(result.correctedWorkflowOutcomePassed, false);
});
test("retains the historical coder-body coverage failure", () => {
  const f = fixture(); f.hiringTemplate.result.checks.find(c => c.id === "supplied-coder-instructions").passed = false;
  const result = evaluateHiringTemplateTurnAccounting(f);
  assert.equal(result.correctedWorkflowOutcomePassed, true);
  assert.deepEqual(result.original.failedCoverageChecks, ["production-source-reads", "supplied-coder-instructions"]);
  assert.equal(result.original.comparisonStatus, "uncomparable");
});
test("rejects malformed and incomplete original check contracts", () => {
  const f = fixture(); f.hiringTemplate.result.checks.pop(); fails(f, "original-check-contract-retained");
  assert.equal(evaluateHiringTemplateTurnAccounting({}).accountingPassed, false);
});
test("rejects undisclosed original check dimensions", () => {
  const f = fixture(); f.hiringTemplate.result.checks.push({ id: "unknown", dimension: "other", passed: false });
  fails(f, "original-check-contract-retained");
});
test("does not modify retained evidence or expose opaque run content", () => {
  const f = fixture(); notification(f).nativeSessionId = "PRIVATE_SESSION";
  notification(f).hiddenReasoning = "PRIVATE_REASONING"; notification(f).credential = "PRIVATE_CREDENTIAL";
  const before = JSON.stringify(f), result = evaluateHiringTemplateTurnAccounting(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.schema, TURN_ACCOUNTING_SIDECAR_VERSION);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|"company"|"board"|"account"|"notify-1"|"lead-first"/);
});
function receiptInput() {
  const f = fixture();
  return { hiringTemplateBytes: JSON.stringify(f.hiringTemplate), apiStateBytes: JSON.stringify(f.apiState),
    originalResultBytes: JSON.stringify({ schema: "paperclip.runner-e2e.result/v2", suiteId: "hiring-templates",
      caseId: "hire-coder-template-reuse", environmentId: "local", profileId: "runner-acpx-claude",
      source: { sha: "a".repeat(40) }, suiteDefinitionHash: "b".repeat(64), status: "failed", runIds: e(f).runs.map(r => r.id) }),
    sidecarSourceBytes: readFileSync(new URL("./hiring-template-turn-accounting.sidecar.mjs", import.meta.url)) };
}
test("attaches exact-byte hashes while preserving the original machine failure and source", () => {
  const input = receiptInput(), result = createHiringTemplateTurnAccountingReceipt(input);
  assert.equal(result.provenanceValid, true);
  assert.equal(result.correctedWorkflowOutcomePassed, true);
  assert.equal(result.originalMachineStatus, "failed");
  assert.equal(result.original.outcomePassed, false);
  assert.equal(result.provenance.sourceRevision, "a".repeat(40));
  for (const [field, bytes] of [["originalResultSha256", input.originalResultBytes], ["hiringSnapshotSha256", input.hiringTemplateBytes],
    ["apiStateSha256", input.apiStateBytes], ["sidecarSha256", input.sidecarSourceBytes]])
    assert.equal(result.provenance[field], createHash("sha256").update(bytes).digest("hex"));
});
test("rejects result provenance from another cell or incomplete run ledger", () => {
  for (const field of ["suiteId", "caseId", "profileId", "environmentId", "runIds"])
    { const input = receiptInput(), original = JSON.parse(input.originalResultBytes);
      original[field] = field === "runIds" ? original.runIds.slice(1) : "other";
      const result = createHiringTemplateTurnAccountingReceipt({ ...input, originalResultBytes: JSON.stringify(original) });
      assert.equal(result.provenanceValid, false); assert.equal(result.correctedWorkflowOutcomePassed, false); }
});
test("rejects an original machine pass inconsistent with retained outcome and coverage", () => {
  const input = receiptInput(), original = JSON.parse(input.originalResultBytes); original.status = "passed";
  const result = createHiringTemplateTurnAccountingReceipt({ ...input, originalResultBytes: JSON.stringify(original) });
  assert.equal(result.provenanceValid, false); assert.equal(result.correctedWorkflowOutcomePassed, false);
});
