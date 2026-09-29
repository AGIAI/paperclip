import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { pollUntil, type RunnerApi } from "./api.js";
import { collectRunEvents } from "./run-observations.js";
import { createTaskThroughUi } from "./user-actions.js";
import { observeRunProcesses, watchDeniedTarget } from "./copilot-local-fixtures.js";
import { cursorNativeCaseDesigns, cursorNativePlanArtifactGate, hasCursorDenialBoundary, hasCursorPlanDecision, hasDeliveredCursorNativeRequest, hasExactCursorNativeResponse, type CursorNativeMethod } from "./cursor-native-cases.js";
import type { LiveFixtureValues } from "./live-fixtures.js";
import type { MatrixExecution } from "./types.js";

type Row = Record<string, any>;
type Check = { id: string; passed: boolean; detail: string };

/** Independent bounded snapshot; symlinks are rejected without following them. */
export async function cursorNativeWorkspaceSnapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}; let bytes = 0;
  async function scan(relative = "") {
    for (const entry of (await readdir(join(root, relative))).sort()) {
      const name = relative ? `${relative}/${entry}` : entry; const path = join(root, name); const stat = await lstat(path);
      if (Object.keys(files).length >= 2048) throw new Error("Cursor workspace proof exceeds file bound");
      if (stat.isSymbolicLink()) throw new Error("Cursor workspace proof cannot authorize a symlink");
      if (stat.isDirectory()) { files[`${name}/`] = "directory"; await scan(name); }
      else if (stat.isFile()) {
        bytes += stat.size;
        if (stat.size > 4 * 1024 * 1024 || bytes > 32 * 1024 * 1024) throw new Error("Cursor workspace proof exceeds byte bound");
        files[name] = createHash("sha256").update(await readFile(path)).digest("hex");
      } else throw new Error("Cursor workspace proof found a special file");
    }
  }
  await scan(); return files;
}

export async function runCursorNativeFlow(input: {
  page: Page; api: RunnerApi; fixtures: LiveFixtureValues; execution: MatrixExecution; nonce: string;
  workspacePath: string; deadlineAt: number;
  observe(issue: Row, runs: Row[]): void;
  capture(id: string, label: string, file: string): Promise<void>;
  evidence(name: string, data: unknown): Promise<void>;
  registerCleanupAssertion?(assertion: () => Promise<Check[]>): void;
}) {
  const { page, api, fixtures, execution, nonce } = input;
  const design = cursorNativeCaseDesigns.find(value => value.id === execution.task.id);
  if (!design || execution.environment.id !== "local" || execution.profile.qualificationCandidate !== "cursor") throw new Error("Cursor native fixtures require the explicit isolated local Cursor candidate");
  if (design.id === "native-write-deny-reconnect" && !input.registerCleanupAssertion) throw new Error("Cursor denial requires authoritative post-cleanup verification");
  const checks: Check[] = []; let issue: Row = {}; let runs: Row[] = [];
  const check = (id: string, passed: boolean, detail: string) => { checks.push({ id, passed, detail }); expect(passed, detail).toBe(true); };
  const events = (runId: string) => collectRunEvents<Row>((afterSeq, limit) => api.get(`/api/heartbeat-runs/${runId}/events?afterSeq=${afterSeq}&limit=${limit}`));
  const absent = async (path: string) => { try { await lstat(path); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; } };
  const agent = await api.get<Row>(`/api/agents/${fixtures.agent.id}`);
  const configured = await api.patch<Row>(`/api/agents/${fixtures.agent.id}`, { adapterConfig: { ...agent.adapterConfig, acpxSessionMode: design.cursorMode, acpxPermissionMode: design.permissionMode } });
  check("explicit-mode-policy", configured.adapterConfig.acpxSessionMode === design.cursorMode && configured.adapterConfig.acpxPermissionMode === design.permissionMode, "Public agent configuration selected mode and permission policy separately before provider startup");
  await input.evidence("cursor-native-contract.json", { caseId: design.id, mode: design.cursorMode, permissionMode: design.permissionMode, method: design.method, expectedRunCount: 1, nativeCallbackRequired: true, artifactGate: cursorNativePlanArtifactGate });
  const project = await api.post<Row>(`/api/companies/${fixtures.company.id}/projects`, {
    name: `Cursor native workspace ${nonce}`, executionWorkspacePolicy: { enabled: true, defaultMode: "shared_workspace", sharedWorkspaceConcurrency: "serialize", allowIssueOverride: false, environmentId: fixtures.environment.id, workspaceStrategy: { type: "project_primary" } },
    workspace: { name: "Primary", sourceType: "local_path", cwd: input.workspacePath, isPrimary: true },
  });
  const baseline = await cursorNativeWorkspaceSnapshot(input.workspacePath);
  const sampleWorkspace = async (phase: string) => {
    const current = await cursorNativeWorkspaceSnapshot(input.workspacePath);
    await input.evidence(`cursor-workspace-${phase}.json`, { baseline, current });
    check(`workspace-unchanged-${phase}`, JSON.stringify(current) === JSON.stringify(baseline), "Independent workspace bytes remain unchanged by a pending/rejected/cancelled native plan or question");
  };
  const deniedPath = join(input.workspacePath, `cursor-denied-${nonce}.txt`);
  const samples: Array<{ phase: string; path: string; absent: boolean; observedAt: number }> = [];
  const sampleDenied = async (phase: string) => { const sample = { phase, path: deniedPath, absent: await absent(deniedPath), observedAt: Date.now() }; samples.push(sample); await input.evidence("cursor-denial-samples.json", samples); check(`denied-absent-${phase}`, sample.absent, "Independent denied target remains absent"); };
  const processObserver = observeRunProcesses(); let processAuthority: string | null = null; let processObservationError = false;
  const observeProcesses = () => {
    const run = runs[0];
    const authority = run?.processPid ? { pid: run.processPid, groupId: run.processGroupId, startedAt: run.processStartedAt, runId: run.id } : undefined;
    if (authority) {
      const key = JSON.stringify(authority);
      if (processAuthority !== null && processAuthority !== key) processObservationError = true;
      processAuthority ??= key;
    }
    return processObserver.sample(authority);
  };
  let processes = observeProcesses();
  let deniedRequest: Row | null = null;
  let processTimer: ReturnType<typeof setInterval> | undefined;
  const watch = design.id === "native-write-deny-reconnect" ? watchDeniedTarget(input.workspacePath, `cursor-denied-${nonce}.txt`) : null;
  if (watch) {
    processTimer = setInterval(() => { try { processes = observeProcesses(); } catch { processObservationError = true; } }, 250);
    input.registerCleanupAssertion!(async () => {
      const cleanupChecks: Check[] = [];
      const finalCheck = (id: string, passed: boolean, detail: string) => { cleanupChecks.push({ id, passed, detail }); };
      try {
        if (issue.id) await load();
        processes = observeProcesses();
        if (processes.captured && processes.live.length > 0 && !processObservationError) {
          processes = await pollUntil({ label: "observed Cursor provider retirement", deadlineAt: Date.now() + 5_000,
            load: async () => observeProcesses(), accept: observation => observation.live.length === 0 });
        }
        const settled = runs.length === 1 && ["succeeded", "failed", "cancelled", "timed_out"].includes(runs[0]!.status);
        finalCheck("authoritative-provider-cleanup", settled && !processObservationError && processes.captured && processes.live.length === 0, "Exact API-bound per-turn process/start/group and observed descendants have retired");
        const finalSample = { phase: "after-cleanup", path: deniedPath, absent: await absent(deniedPath), observedAt: Date.now() };
        samples.push(finalSample);
        finalCheck("denied-absent-after-cleanup", finalSample.absent, "Independent target remains absent after observed provider retirement");
        const journal = watch.finish();
        finalCheck("continuous-denial-observation", journal.complete && journal.targetMutationCount === 0, "Continuous target watcher observed no create/delete mutation and retained directory identity");
        finalCheck("complete-native-denial-boundary", Boolean(deniedRequest) && hasCursorDenialBoundary({ request: deniedRequest, expectedRequestId: deniedRequest?.requestId ?? "", expectedToolCallId: deniedRequest?.details.toolCallId ?? "", path: deniedPath, samples }), "Supported native denial preserved the target through all six independent boundaries");
        await input.evidence("cursor-native-denial-final.json", { request: deniedRequest, samples, processes, processObservationError, watcher: journal, checks: cleanupChecks });
        if (cleanupChecks.some(row => !row.passed)) throw new Error("Cursor native denial cleanup proof is incomplete or observed an effect");
        return cleanupChecks;
      } finally {
        clearInterval(processTimer);
        await input.evidence("cursor-native-denial-cleanup-attempt.json", { request: deniedRequest, samples, processes, processObservationError, watcher: watch.finish(), checks: cleanupChecks });
      }
    });
  }
  const load = async () => {
    issue = await api.get<Row>(`/api/issues/${issue.id}`);
    const listed = await api.get<Row[]>(`/api/companies/${fixtures.company.id}/heartbeat-runs?limit=100`);
    runs = await Promise.all(listed.map(run => api.get<Row>(`/api/heartbeat-runs/${run.id}`)));
    runs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); input.observe(issue, runs);
    if (watch) processes = observeProcesses();
    const interactions = await api.get<Row[]>(`/api/issues/${issue.id}/interactions`);
    const runEvents = runs.length === 1 ? await events(runs[0]!.id) : [];
    return { issue, runs, interactions, runEvents };
  };
  const reject = (state: Awaited<ReturnType<typeof load>>) => state.runs.length > 1 ? "Unexpected extra Cursor provider run" : state.runs.some(run => ["failed", "cancelled", "timed_out"].includes(run.status)) ? "Cursor provider run failed" : undefined;
  const createdRequest = (rows: Row[], method: CursorNativeMethod, requestId?: string) => rows.map(row => row.payload?.prpEvent).find(event => event?.eventType === "runtime_request.created" && event.payload?.request?.origin?.adapter === "acpx-runtime" && event.payload.request.origin.provider === "cursor" && event.payload.request.origin.method === method && (!requestId || event.payload.request.requestId === requestId));
  async function pending(seen: Set<string>) {
    const state = await pollUntil({ label: "exact native Cursor callback", deadlineAt: input.deadlineAt, load,
      reject: state => reject(state) ?? (state.runs.some(run => run.status === "succeeded") ? "Native Cursor callback was not observed before completion; qualification remains pending" : undefined),
      accept: state => state.interactions.some(card => card.status === "pending" && !seen.has(card.id) && card.payload?.runtimeRequestId && createdRequest(state.runEvents, design!.method, card.payload.runtimeRequestId)) });
    const cards = state.interactions.filter(card => card.status === "pending"); check("single-native-request", cards.length === 1 && state.runs.length === 1, "Exactly one native request belongs to one original provider run");
    const card = cards[0]!; const event = createdRequest(state.runEvents, design!.method, card.payload.runtimeRequestId)!;
    check("native-card-binding", card.sourceRunId === state.runs[0]!.id && card.continuationPolicy === "none" && JSON.stringify(card.payload.questionSet) === JSON.stringify(event.payload.request.input), "Durable card retains complete native input and exact source run");
    await input.evidence(`cursor-native-${seen.size}-pending.json`, { card, event });
    await page.reload(); const reloaded = (await load()).interactions.find(row => row.id === card.id);
    check("browser-reconnect-identity", reloaded?.status === "pending" && reloaded?.payload.runtimeRequestId === card.payload.runtimeRequestId, "Browser reconnect preserves exact outstanding native request");
    await input.capture(`cursor-native-${seen.size}`, "Native Cursor request pending", `cursor-native-${seen.size}.png`);
    return { card, event };
  }
  async function delivery(card: Row, event: Row, response: Row) {
    const identity = { runId: runs[0]!.id, turnId: event.turnId, requestId: card.payload.runtimeRequestId, method: design!.method, action: "submit" as const, response };
    const state = await pollUntil({ label: "native response stream delivery", deadlineAt: input.deadlineAt, load, reject,
      accept: state => state.interactions.some(row => row.id === card.id && row.status === "answered") && hasExactCursorNativeResponse({ ...identity, events: state.runEvents }) });
    check("exact-native-delivery", hasExactCursorNativeResponse({ ...identity, events: state.runEvents }), "Exact displayed answer reached the native response writer and produced one ordered delivery receipt");
    await input.evidence(`cursor-native-${card.id}-delivered.json`, { interaction: state.interactions.find(row => row.id === card.id), events: state.runEvents, response });
  }
  let expectedMarker = execution.task.buildVisibleMarker(nonce);
  try {
    if (design.id === "native-write-deny-reconnect") await sampleDenied("before-request");
    await createTaskThroughUi({ page, issuePrefix: fixtures.company.issuePrefix!, agentName: fixtures.agent.name, title: execution.task.buildTitle(nonce), prompt: execution.task.buildPrompt(nonce), workMode: "standard", projectName: project.name });
    issue = await pollUntil({ label: "browser-created Cursor task", deadlineAt: input.deadlineAt, load: async () => (await api.get<Row[]>(`/api/companies/${fixtures.company.id}/issues?limit=100`)).find(row => row.title === execution.task.buildTitle(nonce)), accept: Boolean }) ?? {};
    if (!issue.id) throw new Error("Browser-created Cursor task is absent");
    await page.goto(`/${fixtures.company.issuePrefix}/issues/${issue.identifier ?? issue.id}`);
    const seen = new Set<string>();
    if (design.id === "native-question-reconnect") {
      const { card, event } = await pending(seen); const questions = card.payload.questionSet.questions;
      check("native-question-shape", questions.length === 2 && questions[0].answerMode === "single_select" && questions[1].answerMode === "multi_select", "Native single/multiple choice shape is preserved");
      const color = randomBytes(1)[0]! % 2 === 0 ? "Cobalt" : "Amber";
      const trees = randomBytes(1)[0]! % 2 === 0 ? ["Cedar", "Maple"] : ["Maple"];
      await page.getByRole("radio", { name: color, exact: true }).last().click();
      await page.getByRole("button", { name: "Next", exact: true }).last().click();
      for (const tree of trees) await page.getByRole("checkbox", { name: tree, exact: true }).last().click();
      const answers = Object.fromEntries(questions.map((question: Row, index: number) => [question.id, { selectedOptionIds: (index === 0 ? [color] : trees).map(label => question.options.find((option: Row) => option.label === label)?.id) }]));
      await page.getByRole("button", { name: card.payload.questionSet.submitLabel ?? "Submit answers", exact: true }).last().click();
      await delivery(card, event, { schema: "paperclip.question_response.v1", answers });
      expectedMarker = `CURSOR-NATIVE-${nonce}-${color.toLowerCase()}-${trees.map(tree => tree.toLowerCase()).sort().join("+")}`;
      await sampleWorkspace("question-delivered");
    } else if (design.method === "cursor/create_plan") {
      const decisions = design.id === "native-plan-cancel" ? ["cancel"] as const : ["reject", "accept"] as const;
      const feedbackMarker = `revision-${randomBytes(12).toString("hex")}`;
      const feedback = `Include verification marker ${feedbackMarker} in the revised plan.`; let previousRevision: string | null = null;
      for (const decision of decisions) {
        const { card, event } = await pending(seen); const set = card.payload.questionSet; const plan = set.questions.find((question: Row) => /^plan-[a-f0-9]{64}$/.test(question.id));
        check("full-plan-revision", typeof set.description === "string" && set.description.length > 0 && Boolean(plan) && plan.id !== previousRevision, "Complete native plan and a distinct content-bound revision are retained");
        if (decision === "accept") check("revision-feedback", set.description.includes(feedbackMarker), "Revised native plan contains exact undisclosed rejection feedback");
        for (const marker of [`CURSOR-PLAN-BEGIN-${nonce}`, `CURSOR-PLAN-END-${nonce}`]) {
          check("complete-plan-boundary", set.description.includes(marker), "Retained native plan includes its full document boundaries");
          await expect(page.getByRole("region", { name: "Question context" }).last()).toContainText(marker);
        }
        await sampleWorkspace(`plan-${decision}-pending`);
        await page.getByRole("radio", { name: decision === "accept" ? "Accept plan" : decision === "reject" ? "Reject plan" : "Cancel plan request", exact: true }).last().click();
        await page.getByRole("button", { name: "Next", exact: true }).last().click();
        if (decision === "reject") await page.getByTestId("question-text-answer-composer").last().locator('[contenteditable="true"],textarea').first().fill(feedback);
        const response = { schema: "paperclip.question_response.v1", answers: { [plan.id]: { selectedOptionIds: [decision] }, reason: decision === "reject" ? { text: feedback } : {} } };
        check("revision-bound-decision", hasCursorPlanDecision(set, response, decision), "Decision addresses precisely the displayed native plan revision");
        await page.getByRole("button", { name: set.submitLabel ?? "Submit answers", exact: true }).last().click();
        await delivery(card, event, response); seen.add(card.id); previousRevision = plan.id;
        if (decision !== "accept") await sampleWorkspace(`plan-${decision}-delivered`);
      }
      await input.evidence("cursor-native-artifact-gap.json", cursorNativePlanArtifactGate);
    } else {
      const state = await pollUntil({ label: "native Cursor permission", deadlineAt: input.deadlineAt, load, reject,
        accept: state => Boolean(createdRequest(state.runEvents, "session/request_permission")) });
      const event = createdRequest(state.runEvents, "session/request_permission")!; const request = event.payload.request; deniedRequest = request;
      check("native-permission-identity", state.runs.length === 1 && typeof request.details?.toolCallId === "string" && request.choices.some((choice: Row) => choice.key === "decline"), "Presented native permission carries its tool identity and supported denial choice");
      await sampleDenied("pending"); await page.reload();
      const reloaded = await load(); check("permission-reconnect", Boolean(createdRequest(reloaded.runEvents, "session/request_permission", request.requestId)) && !reloaded.runEvents.some(row => row.payload?.prpEvent?.eventType === "runtime_request.resolved"), "Reconnect preserves the unresolved native permission");
      await sampleDenied("browser-reconnected"); await input.capture("cursor-permission", "Native write permission awaiting denial", "cursor-permission.png");
      const label = request.choices.find((choice: Row) => choice.key === "decline").label;
      await page.getByRole("button", { name: label, exact: true }).last().click();
      const identity = { runId: runs[0]!.id, turnId: event.turnId, requestId: request.requestId, method: "session/request_permission" as const, action: "decline" as const };
      await pollUntil({ label: "native denial delivery", deadlineAt: input.deadlineAt, load, reject, accept: state => hasDeliveredCursorNativeRequest({ ...identity, events: state.runEvents }) });
      await sampleDenied("after-decision");

    }
    const final = await pollUntil({ label: "Cursor native completion", deadlineAt: input.deadlineAt, load, reject,
      accept: state => state.issue.status === "done" && state.runs.length === 1 && state.runs[0]!.status === "succeeded" && !state.interactions.some(card => card.status === "pending") });
    check("one-native-run", final.runs[0]!.runtimeMode === "native", "Decision and completion remained in the original native provider run");
    if (design.id === "native-write-deny-reconnect") await sampleDenied("after-terminal");
    else if (design.id === "native-plan-cancel" || design.id === "native-question-reconnect") await sampleWorkspace("native-terminal");
    await page.reload(); await expect(page.getByText(expectedMarker, { exact: true }).last()).toBeVisible();
    await expect(page.getByTestId("issue-detail-header").getByRole("button", { name: "Change status (current: Done)", exact: true })).toBeVisible();
    const comments = await api.get<Row[]>(`/api/issues/${issue.id}/comments`);
    await input.evidence("api-state.json", { ...final, run: runs[0], comments, checks, runEventsByRun: [{ runId: runs[0]!.id, events: final.runEvents }] });
    await input.capture("final-state", "Cursor native callback fixture verified", "final-state.png");
    return { issue, runs, checks };
  } finally { await input.evidence("cursor-native-checks.json", { issue, runs, checks }); }
}
