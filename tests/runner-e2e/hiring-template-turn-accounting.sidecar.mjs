import { createHash } from "node:crypto";

/** Retained-evidence analysis only. Never replaces the frozen fixture or its grades.
 * Five required work turns remain exact; separately admitted notification turns
 * still count toward actual runs, usage and costs. This does not grade source
 * reads, template equality, completion prose or broad behavioral equivalence.
 */
export const TURN_ACCOUNTING_SIDECAR_VERSION = "paperclip.hiring-template-turn-accounting.sidecar.v1";
const ORIGINAL_SCHEMA = "paperclip.hiring-templates.v1";
const COUNT_CHECK = "five-successful-turns";
const OTHER_OUTCOME_CHECKS = ["one-coder-hire", "execution-account", "two-worker-tasks",
  "initial-json-artifact", "reused-json-artifact", "original-preserved"];
const COVERAGE_CHECKS = ["source-fingerprints", "production-ceo-bundle", "assigned-hiring-skill",
  "production-source-reads", "supplied-coder-instructions", "hired-instructions-durable", "hired-skills-durable"];
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const rows = value => Array.isArray(value) ? value.map(object) : [];
const present = value => typeof value === "string" && value.trim().length > 0;
const unique = values => values.every(present) && new Set(values).size === values.length;
const sameSet = (a, b) => a.length === b.length && unique(a) && unique(b) && a.every(v => b.includes(v));
const date = value => typeof value === "string" ? Date.parse(value) : NaN;
const zero = value => value == null || value === 0;
const noList = value => value == null || Array.isArray(value) && value.length === 0;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const context = run => object(run.contextSnapshot);
const accepted = run => rows(run.identityHistory).filter(i => i.status === "accepted");
const dispatchIdentity = (run, cause, user) => accepted(run).some(i => i.cause === cause
  && i.responsibleUserId === user && !i.messageId && Number.isFinite(date(i.acceptedAt)));
// Compare only public accounting fields; never return the retained run objects.
const accountingProjection = run => JSON.stringify({ id: run.id, companyId: run.companyId,
  agentId: run.agentId, status: run.status, runtimeMode: run.runtimeMode,
  responsibleUserId: run.responsibleUserId, invocationSource: run.invocationSource,
  triggerDetail: run.triggerDetail, startedAt: run.startedAt, finishedAt: run.finishedAt,
  retryOfRunId: run.retryOfRunId, processLossRetryCount: run.processLossRetryCount,
  scheduledRetryAttempt: run.scheduledRetryAttempt, continuationAttempt: run.continuationAttempt,
  context: Object.fromEntries(["source", "issueId", "wakeReason", "wakeSource", "wakeTriggerDetail", "wakeCommentId",
    "wakeCommentIds", "conversationSessionGeneration", "chatCompletionDeliveryIds", "chatCompletionUpdates"]
    .map(key => [key, context(run)[key]])),
  account: Object.fromEntries(["connectionId", "responsibleUserId", "provider", "method", "mode"]
    .map(key => [key, object(context(run).aiConnection)[key]])),
  identities: rows(run.identityHistory).map(i => Object.fromEntries(["runId", "companyId", "responsibleUserId",
    "status", "cause", "messageId", "acceptedAt"].map(key => [key, i[key]]))) });

export function evaluateHiringTemplateTurnAccounting({ hiringTemplate, apiState }) {
  const snapshot = object(hiringTemplate), api = object(apiState), e = object(snapshot.evidence);
  const chat = object(api.issue), user = chat.conversationUserId, company = chat.companyId;
  const runs = rows(e.runs), publicRuns = rows(api.runs), comments = rows(api.comments);
  const agents = rows(e.agents), tasks = rows(e.tasks), lead = e.leadId;
  const coder = agents.find(a => a.id !== lead && a.name === e.hireName);
  const taskIds = [object(e.first).issueId, object(e.second).issueId];
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const requests = comments.filter(c => c.authorUserId).sort((a, b) => date(a.createdAt) - date(b.createdAt));
  const requested = [], workers = [], notifications = [], unknown = [];
  for (const run of runs) {
    const c = context(run);
    if (run.agentId === lead && c.issueId === e.chatIssueId && c.wakeReason === "issue_commented") requested.push(run);
    else if (run.agentId === coder?.id && taskIds.includes(c.issueId) && c.wakeReason === "issue_assigned") workers.push(run);
    else if (run.agentId === lead && c.issueId === e.chatIssueId && c.wakeReason === "chat_task_completed") notifications.push(run);
    else unknown.push(run);
  }
  const predicates = [];
  const check = (id, passed) => predicates.push({ id, passed: Boolean(passed) });
  const binding = object(e.binding);
  check("known-fixture-context", present(company) && present(user) && present(lead) && present(coder?.id)
    && chat.id === e.chatIssueId && chat.conversationAgentId === lead
    && Number.isInteger(chat.conversationSessionGeneration) && chat.conversationSessionGeneration >= 0
    && agents.length === 2 && agents.some(a => a.id === lead)
    && unique(agents.map(a => a.id)) && agents.every(a => a.companyId === company)
    && present(e.connectionId) && present(binding.provider) && present(binding.method) && binding.mode === "responsible_user"
    && unique(taskIds) && unique(tasks.map(t => t.id)) && sameSet(taskIds, tasks.map(t => t.id)));
  check("complete-public-run-ledger", sameSet(runs.map(r => r.id), publicRuns.map(r => r.id))
    && runs.every(r => accountingProjection(r) === accountingProjection(publicRuns.find(p => p.id === r.id) ?? {})));
  check("exact-five-required-work-turns", requested.length === 3 && workers.length === 2 && unknown.length === 0
    && notifications.length <= 2 && runs.length === 5 + notifications.length && runs.length <= 7);
  check("successful-native-without-retries", runs.length > 0 && runs.every(r => r.status === "succeeded"
    && r.runtimeMode === "native" && Number.isFinite(date(r.startedAt)) && Number.isFinite(date(r.finishedAt))
    && date(r.finishedAt) >= date(r.startedAt) && !r.retryOfRunId && zero(r.processLossRetryCount)
    && zero(r.scheduledRetryAttempt) && zero(r.continuationAttempt)));
  check("resolved-company-account-and-identity", runs.length > 0 && runs.every(r => {
    const account = object(context(r).aiConnection), identities = accepted(r);
    return r.companyId === company && r.responsibleUserId === user && account.responsibleUserId === user
      && account.connectionId === e.connectionId && ["provider", "method", "mode"].every(k => account[k] === binding[k])
      && identities.length > 0 && identities.every(i => i.responsibleUserId === user
        && i.runId === r.id && i.companyId === company);
  }));
  check("three-distinct-requested-chat-turns", requests.length === 3 && unique(requests.map(c => c.id))
    && sameSet(requested.map(r => context(r).wakeCommentId), requests.map(c => c.id))
    && requests.every(c => c.companyId === company && c.issueId === chat.id && c.authorUserId === user
      && !c.authorAgentId && present(c.body) && Number.isFinite(date(c.createdAt)))
    && requested.every(r => {
      const c = context(r), comment = requests.find(p => p.id === c.wakeCommentId);
      return r.invocationSource === "on_demand" && r.triggerDetail === "manual" && c.source === "issue.comment"
        && c.wakeSource === "on_demand" && c.wakeTriggerDetail === "manual"
        && c.conversationSessionGeneration === chat.conversationSessionGeneration
        && noList(c.chatCompletionDeliveryIds) && noList(c.chatCompletionUpdates)
        && sameSet(Array.isArray(c.wakeCommentIds) ? c.wakeCommentIds : [], [c.wakeCommentId])
        && comment && date(r.startedAt) >= date(comment.createdAt)
        && dispatchIdentity(r, "issue_commented", user)
        && accepted(r).some(i => i.cause === "instruction" && i.messageId === c.wakeCommentId
          && i.responsibleUserId === user && Number.isFinite(date(i.acceptedAt)));
    }));
  check("one-coder-execution-per-known-task", tasks.length === 2 && taskIds.every(id => {
    const task = taskById.get(id), matching = workers.filter(r => context(r).issueId === id), run = matching[0];
    const c = context(run ?? {});
    return task && matching.length === 1 && task.companyId === company && task.assigneeAgentId === coder?.id
      && task.projectId === e.projectId && !task.parentId && task.status === "done" && task.responsibleUserId === user
      && Number.isFinite(date(task.completedAt)) && date(task.completedAt) >= date(run.startedAt)
      && run.invocationSource === "assignment" && run.triggerDetail === "system"
      && c.source === "paperclip_runner.create_task" && c.wakeSource === "assignment" && c.wakeTriggerDetail === "system"
      && noList(c.chatCompletionDeliveryIds) && noList(c.chatCompletionUpdates)
      && dispatchIdentity(run, "issue_assigned", user);
  }));
  check("task-origins-are-first-two-requested-turns", taskIds.every((id, index) => {
    const task = taskById.get(id), comment = requests[index];
    const run = requested.find(r => context(r).wakeCommentId === comment?.id);
    return task && run && task.createdByAgentId === lead && !task.createdByUserId && task.originRunId === run.id
      && date(task.createdAt) >= date(run.startedAt);
  }));
  const deliveryIds = new Set(), notifiedTasks = new Set();
  check("bounded-server-completion-receipts", notifications.every(r => {
    const c = context(r), ids = Array.isArray(c.chatCompletionDeliveryIds) ? c.chatCompletionDeliveryIds : [];
    const updates = rows(c.chatCompletionUpdates);
    let valid = r.invocationSource === "automation" && r.triggerDetail === "system"
      && c.wakeSource === "automation" && c.wakeTriggerDetail === "system" && !c.source
      && c.conversationSessionGeneration === chat.conversationSessionGeneration
      && !c.wakeCommentId && noList(c.wakeCommentIds)
      && ids.length > 0 && ids.length <= 2 && ids.length === updates.length && unique(ids)
      && ids.every(id => !deliveryIds.has(id)) && dispatchIdentity(r, "chat_task_completed", user);
    for (const update of updates) {
      const task = taskById.get(update.id);
      valid = Boolean(valid && task && !notifiedTasks.has(update.id) && update.status === "done"
        && task.status === "done" && update.identifier === task.identifier && update.completedAt === task.completedAt
        && present(task.identifier) && update.url === `/issues/${task.identifier}` && update.hasSavedDocuments === true
        && date(r.startedAt) >= date(task.completedAt));
      notifiedTasks.add(update.id);
    }
    ids.forEach(id => deliveryIds.add(id));
    return valid;
  }));
  check("completion-runs-have-attributed-chat-replies", notifications.every(r => {
    const updates = rows(context(r).chatCompletionUpdates);
    const completedAt = Math.max(...updates.map(u => date(u.completedAt)));
    return updates.length > 0 && comments.some(c => c.companyId === company && c.issueId === chat.id
      && c.authorAgentId === lead && !c.authorUserId && c.createdByRunId === r.id && present(c.body)
      && (c.conversationSessionGeneration == null || c.conversationSessionGeneration === chat.conversationSessionGeneration)
      && date(c.createdAt) >= completedAt && date(c.createdAt) >= date(r.startedAt));
  }));
  check("no-notification-created-extra-tasks", tasks.length === 2 && tasks.every(t =>
    !notifications.some(r => r.id === t.originRunId)));
  const original = object(snapshot.result), originalChecks = rows(original.checks);
  const outcomes = originalChecks.filter(c => c.dimension === "outcome");
  const coverage = originalChecks.filter(c => c.dimension === "coverage");
  check("original-check-contract-retained", snapshot.schema === ORIGINAL_SCHEMA
    && /^[a-f0-9]{64}$/.test(snapshot.definitionDigest ?? "")
    && sameSet(outcomes.map(c => c.id), [COUNT_CHECK, ...OTHER_OUTCOME_CHECKS])
    && sameSet(coverage.map(c => c.id), COVERAGE_CHECKS)
    && originalChecks.length === 1 + OTHER_OUTCOME_CHECKS.length + COVERAGE_CHECKS.length
    && originalChecks.every(c => typeof c.passed === "boolean")
    && typeof original.outcomePassed === "boolean" && original.outcomePassed === outcomes.every(c => c.passed)
    && original.comparisonStatus === (coverage.every(c => c.passed) ? "comparable" : "uncomparable"));
  const accountingPassed = predicates.every(p => p.passed);
  const otherOutcomeChecksPassed = OTHER_OUTCOME_CHECKS.every(id => outcomes.some(c => c.id === id && c.passed === true));
  return {
    schema: TURN_ACCOUNTING_SIDECAR_VERSION,
    counts: { requiredWorkTurns: 5, maximumCompletionTurns: 2, maximumTotalTurns: 7,
      requestedLeadTurns: requested.length, coderTurns: workers.length, completionTurns: notifications.length,
      unclassifiedTurns: unknown.length, snapshotRunCount: runs.length, actualRunCount: publicRuns.length,
      costAccountingRunCount: publicRuns.length },
    predicates, accountingPassed, correctedWorkflowOutcomePassed: accountingPassed && otherOutcomeChecksPassed,
    original: { schema: snapshot.schema === ORIGINAL_SCHEMA ? ORIGINAL_SCHEMA : null,
      definitionDigest: /^[a-f0-9]{64}$/.test(snapshot.definitionDigest ?? "") ? snapshot.definitionDigest : null,
      outcomePassed: typeof original.outcomePassed === "boolean" ? original.outcomePassed : null,
      countCheckPassed: outcomes.find(c => c.id === COUNT_CHECK)?.passed === true,
      otherOutcomeChecksPassed,
      comparisonStatus: ["comparable", "uncomparable"].includes(original.comparisonStatus) ? original.comparisonStatus : null,
      failedCoverageChecks: COVERAGE_CHECKS.filter(id => coverage.some(c => c.id === id && c.passed === false)) },
    sourceCoverageRegraded: false, broadEquivalenceEstablished: false,
  };
}

/** Hash exact retained bytes and attach their original source/version. No IO or providers.
 * The caller reads the actual published module bytes as sidecarSourceBytes and
 * retains the complete original billing/usage records outside this projection.
 */
export function createHiringTemplateTurnAccountingReceipt({ hiringTemplateBytes, apiStateBytes,
  originalResultBytes, sidecarSourceBytes }) {
  const hiringTemplate = JSON.parse(String(hiringTemplateBytes)), apiState = JSON.parse(String(apiStateBytes));
  const originalResult = object(JSON.parse(String(originalResultBytes)));
  const analysis = evaluateHiringTemplateTurnAccounting({ hiringTemplate, apiState });
  const publicIds = rows(object(apiState).runs).map(r => r.id);
  const source = object(originalResult.source);
  const provenanceValid = originalResult.schema === "paperclip.runner-e2e.result/v2"
    && originalResult.suiteId === "hiring-templates" && originalResult.caseId === "hire-coder-template-reuse"
    && originalResult.environmentId === "local" && ["runner-codex", "runner-acpx-claude"].includes(originalResult.profileId)
    && /^[a-f0-9]{40}$/.test(source.sha ?? "") && /^[a-f0-9]{64}$/.test(originalResult.suiteDefinitionHash ?? "")
    && ["passed", "failed"].includes(originalResult.status)
    && (originalResult.status !== "passed" || analysis.original.outcomePassed === true
      && analysis.original.comparisonStatus === "comparable")
    && sameSet(Array.isArray(originalResult.runIds) ? originalResult.runIds : [], publicIds)
    && typeof sidecarSourceBytes?.length === "number" && sidecarSourceBytes.length > 0;
  return { ...analysis, provenanceValid,
    correctedWorkflowOutcomePassed: analysis.correctedWorkflowOutcomePassed && provenanceValid,
    originalMachineStatus: ["passed", "failed"].includes(originalResult.status) ? originalResult.status : null,
    provenance: { originalResultSchema: "paperclip.runner-e2e.result/v2",
      sourceRevision: /^[a-f0-9]{40}$/.test(source.sha ?? "") ? source.sha : null,
      suiteDefinitionHash: /^[a-f0-9]{64}$/.test(originalResult.suiteDefinitionHash ?? "") ? originalResult.suiteDefinitionHash : null,
      originalResultSha256: sha256(originalResultBytes), hiringSnapshotSha256: sha256(hiringTemplateBytes),
      apiStateSha256: sha256(apiStateBytes), sidecarSha256: sha256(sidecarSourceBytes) } };
}
