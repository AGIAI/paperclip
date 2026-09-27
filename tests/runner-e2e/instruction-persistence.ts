import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { pollUntil, type RunnerApi } from "./api.js";
import { captureFirstTaskAttachments } from "./first-task-attachments.js";
import { collectRunEvents } from "./run-observations.js";
import { createTaskThroughUi } from "./user-actions.js";
import type { LiveFixtureValues } from "./live-fixtures.js";
import type { MatrixExecution, RunnerTaskFixture } from "./types.js";

type Row = Record<string, any>;
export const instructionNonceLine = (nonce: string) => `Instruction persistence nonce: ${nonce}\n`;
export const instructionPersistenceTask: RunnerTaskFixture = {
  id: "private-copy-persists", label: "Private instruction edit survives a fresh task",
  groups: [], workMode: "standard", flow: "instruction_persistence",
  expectedRunCount: 2, attemptTimeoutMs: { local: 20 * 60_000, daytona: 20 * 60_000 },
  expectedTerminalState: { issue: "done", run: "succeeded" },
  buildTitle: nonce => `Persist private instructions ${nonce}`,
  buildVisibleMarker: () => "INSTRUCTIONS-VERIFIED",
  buildPrompt: nonce => [
    "Edit your own registered writable agent instruction entry with ordinary filesystem tools. The runtime guidance gives its exact private path.",
    `Preserve its existing bytes and append exactly one newline followed by this line and a final newline: Instruction persistence nonce: ${nonce}`,
    "Do not use update_agent_instructions, restore_agent_instructions, or an instructions API to save it. Do not edit repository AGENTS.md or the read-only loaded bundle.",
    "Reply only Instruction copy edited without printing filesystem paths, then complete this task after the file edit. Paperclip will collect it after the provider stops; do not claim it has already persisted. Do not create further tasks.",
  ].join("\n"),
  buildMatchers: () => [], // Independent public revision and attachment oracle below.
};

export function gradeInstructionPersistence(input: { before: Row; after: Row; firstRunId: string; expectedContent: string; proof: Row | undefined; expectedProof: string }) {
  return [
    { id: "new-cleanup-revision", passed: Boolean(input.before.revision?.id && input.after.revision?.id && input.after.revision.id !== input.before.revision.id && input.after.revision.source === "cleanup" && input.after.revision.sourceRunId === input.firstRunId) },
    { id: "exact-canonical-bytes", passed: input.after.content === input.expectedContent && input.after.revision?.contentHash === createHash("sha256").update(input.expectedContent).digest("hex") },
    { id: "fresh-task-downloaded-proof", passed: input.proof?.contentVerified === true && input.proof.body === input.expectedProof },
  ].map(check => ({ ...check, detail: check.passed ? `${check.id} verified independently` : `${check.id} missing or incorrect` }));
}

export async function runInstructionPersistenceFlow(input: {
  page: Page; api: RunnerApi; fixtures: LiveFixtureValues; execution: MatrixExecution; nonce: string;
  secrets: readonly string[]; deadlineAt: number;
  restart(): Promise<void>;
  observe(issue: Row, runs: Row[]): void;
  capture(id: string, label: string, file: string): Promise<void>;
  evidence(name: string, data: unknown): Promise<void>;
}) {
  const { page, api, fixtures, execution, nonce } = input;
  const filePath = `/api/agents/${fixtures.agent.id}/instructions-bundle/file?path=AGENTS.md`;
  const before = await api.get<Row>(filePath);
  if (typeof before.content !== "string" || !before.revision?.id) throw new Error("Managed instructions must expose a canonical baseline revision");
  const expectedContent = `${before.content}\n${instructionNonceLine(nonce)}`;
  let issue: Row = {};
  let runs: Row[] = [];
  async function create(title: string, prompt: string) {
    await createTaskThroughUi({ page, issuePrefix: fixtures.company.issuePrefix!, agentName: fixtures.agent.name, title, prompt, workMode: "standard", projectName: fixtures.project?.name });
    const found = await pollUntil({ label: `instruction task ${title}`, deadlineAt: input.deadlineAt,
      load: async () => (await api.get<Row[]>(`/api/companies/${fixtures.company.id}/issues?limit=100`)).find(row => row.title === title), accept: row => Boolean(row) });
    if (!found) throw new Error("Browser-created instruction task missing");
    issue = found;
    input.observe(issue, runs);
    await page.goto(`/${fixtures.company.issuePrefix}/issues/${issue.identifier ?? issue.id}`);
  }
  async function settle(count: number) {
    await pollUntil({ label: `instruction run ${count} completed`, deadlineAt: input.deadlineAt,
      load: async () => {
        issue = await api.get<Row>(`/api/issues/${issue.id}`);
        const listed = await api.get<Row[]>(`/api/companies/${fixtures.company.id}/heartbeat-runs?limit=100`);
        runs = await Promise.all(listed.map(row => api.get<Row>(`/api/heartbeat-runs/${row.id}`)));
        runs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        input.observe(issue, runs);
        return { issue, runs };
      },
      accept: state => state.issue.status === "done" && state.runs.length === count && state.runs.every(row => row.status === "succeeded"),
      reject: state => state.runs.some(row => ["failed", "cancelled", "timed_out"].includes(row.status)) ? "Instruction task provider run failed" : state.runs.length > count ? "Instruction task dispatched an extra run" : undefined,
    });
    expect(runs.every(row => row.runtimeMode === execution.profile.expectedRuntimeMode)).toBe(true);
    await page.reload();
    await expect(page.getByTestId("issue-detail-header").getByRole("button", { name: "Change status (current: Done)", exact: true })).toBeVisible();
  }
  await create(execution.task.buildTitle(nonce), execution.task.buildPrompt(nonce));
  await settle(1);
  const firstRunId = runs[0]!.id;
  const after = await pollUntil({ label: "stopped instruction cleanup revision", deadlineAt: Math.min(input.deadlineAt, Date.now() + 30_000),
    load: () => api.get<Row>(filePath), accept: row => row.content === expectedContent && row.revision?.sourceRunId === firstRunId });
  const events = await collectRunEvents<Row>((afterSeq, limit) => api.get(`/api/heartbeat-runs/${firstRunId}/events?afterSeq=${afterSeq}&limit=${limit}`));
  expect(events.some(row => row.eventType === "instruction_save" && row.payload?.state === "saved")).toBe(true);
  await input.evidence("instruction-first-save.json", { before, after, run: runs[0], events });
  await input.capture("instruction-edited", "Private instructions saved after provider stop", "instruction-edited.png");
  // A new server and a new issue cannot pass by retaining model conversation.
  await input.restart();
  expect((await api.get<Row>(filePath)).content).toBe(expectedContent);
  await create("Read persisted instructions", [
    "Read your own loaded agent instruction entry (or its current registered private copy) using ordinary filesystem tools.",
    "Find the line beginning 'Instruction persistence nonce: '. Copy that entire line plus one final newline into instruction-proof.txt. Do not infer the value from this task title or other task history. Do not change your instructions.",
    "Upload instruction-proof.txt as a text/plain task attachment named instruction-proof.txt using the normal artifact workflow. A local file alone is insufficient.",
    `Reply with exactly ${execution.task.buildVisibleMarker(nonce)} and complete the task.`,
  ].join("\n"));
  await settle(2);
  const attachments = await captureFirstTaskAttachments(api, [{ ...issue, id: String(issue.id) }], input.secrets);
  const proof = attachments.find(row => row.originalFilename === "instruction-proof.txt" || row.name === "instruction-proof.txt");
  const final = await api.get<Row>(filePath);
  expect(final.revision.id).toBe(after.revision.id);
  const checks = gradeInstructionPersistence({ before, after, firstRunId, expectedContent, proof, expectedProof: instructionNonceLine(nonce) });
  await input.evidence("api-state.json", { issue, runs, checks, canonicalInstructions: final, attachments });
  await input.evidence("instruction-persistence.json", { checks, before, after, final, issues: [runs[0]?.nativeIssueId, issue.id], runs, attachments });
  await expect(page.getByTestId("task-chat-agent-bubble").filter({ hasText: execution.task.buildVisibleMarker(nonce) }).last()).toBeVisible();
  await input.capture("final-state", "Fresh task downloaded the persisted instruction nonce", "final-state.png");
  expect(checks.filter(check => !check.passed), "Independent instruction persistence checks").toEqual([]);
  return { issue, runs, checks };
}
