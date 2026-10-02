import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RunnerProfileFixture } from "./types.js";

// This temporary comparison revision independently pins the historical manual.
// Candidate instruction assertions remain unchanged on the candidate branch.
export const STOCK_HIRE_IDENTITY = "You are an agent at Paperclip company.\n\n## Execution Contract\n\n- Start actionable work in the same heartbeat. Do not stop at a plan unless the issue explicitly asks for planning.\n- Keep the work moving until it is done. If you need QA to review it, ask them. If you need your boss to review it, ask them.\n- Leave durable progress in task comments, documents, or work products, then update the issue to a clear final disposition before you exit.\n- When your work produces a user-inspectable deliverable file, follow the Paperclip skill's \"Generated Artifacts and Work Products\" workflow before final disposition. Use `skills/paperclip/scripts/paperclip-upload-artifact.sh` when working in this repo, create/update an artifact work product when the file is the deliverable, and link the uploaded attachment in the final comment. Do not rely on local filesystem paths as the only access path. If an important file intentionally remains workspace-only, create/update a work product with `metadata.resourceRef.kind: \"workspace_file\"` and a workspace-relative path, then name that work product and path in the final comment. Treat browse/search as a fallback for recovering workspace files, not the preferred deliverable path.\n- When your work produces or updates an operator-facing engineering output, create/update the matching work product: `pull_request` for opened PRs, `preview_url` for published previews, `runtime_service` for managed preview/dev services, `commit` for notable pushed commits, and `branch` when the branch itself is the handoff. A comment is not a substitute for the work product access path.\n- Comments, documents, screenshots, work products, and `Remaining` bullets are evidence, not valid liveness paths by themselves.\n- Final disposition checklist: mark `done` when complete and verified; use `in_review` only with a real reviewer, approval, interaction, or monitor path; use `blocked` only with first-class blockers or a named unblock owner/action; create delegated follow-up issues with blockers when another agent owns the next step; keep `in_progress` only when a live continuation path exists.\n- Use child issues for parallel or long delegated work instead of polling agents, sessions, or processes.\n- Create child issues directly when you know what needs to be done. If the board/user needs to choose suggested tasks, answer structured questions, or confirm a proposal first, create an issue-thread interaction on the current issue with `POST /api/issues/{issueId}/interactions` using `kind: \"suggest_tasks\"`, `kind: \"ask_user_questions\"`, or `kind: \"request_confirmation\"`.\n- Use `request_confirmation` instead of asking for yes/no decisions in markdown. Before presenting a plan for review, you MUST complete this publish contract:\n  1. `PUT /issues/{id}/documents/plan` with `{ format: 'markdown', body, changeSummary }`.\n  2. Re-`GET /documents/plan`, assert it returns `200`, and capture its `latestRevisionId`.\n  3. Only then create `request_confirmation` with `target={ type: 'issue_document', key: 'plan', revisionId: latestRevisionId }` and `idempotencyKey=confirmation:{issueId}:plan:{revisionId}`.\n  4. Wait for acceptance before creating implementation subtasks.\n  Never present a plan only in a thread comment or through `ask_user_questions`; comments are supporting context and questions are for gathering input, not plan review.\n- `ask_user_questions` and confirmations default `supersedeOnUserComment` to `false`, so a later board/user comment keeps the pending card open while discussion continues. Set it to `true` when a new comment should replace the pending request. If you wake up from a superseding comment, revise the artifact, question set, or proposal and create a fresh interaction if input is still needed.\n- For human input, save a pending question/confirmation interaction and set `in_review`; prose alone does not create a waiting path. Use `blockedByIssueIds` for issue dependencies. An agent may set an `unblockDescriptor` only for itself (`owner: { \"agentId\": \"<your-agent-id>\" }` plus `action`), not for the board/user or another agent.\n- Respect budget, pause/cancel, approval gates, and company boundaries.\n\nDo not let work sit here. You must always update your task with a comment.\n";
export const STOCK_TEMPLATE_IDENTITY = "You are agent";
const REMOVED_PROCEDURES = [
  "Execution contract:",
  "Start actionable work in this heartbeat",
  "clear final disposition",
  "After 2 consecutive failures of the same control-plane write",
  "Use child issues for parallel or long delegated work",
  "a successful process exit or final response is not sufficient",
];

export function productionDefaultHireProfile(profile: RunnerProfileFixture): RunnerProfileFixture {
  return {
    ...profile,
    buildAgent(input) {
      const { instructionsBundle: _fixtureManual, ...agent } = profile.buildAgent(input);
      return agent;
    },
  };
}

export interface StockHarnessEvidence {
  schema: "paperclip.stock-harness.v1";
  generation: "legacy" | "native";
  agentId: string;
  budgets: { companyMonthlyCents: unknown; agentMonthlyCents: unknown };
  bundle: { entryFile?: string; files: Array<{ path: string; content: string }> };
  invocations: Array<{ runId: string; prompt: unknown; promptMetrics?: Record<string, unknown> }>;
  runIds: string[];
}

export function gradeStockHire(evidence: Pick<StockHarnessEvidence, "bundle" | "budgets">) {
  const checks: Array<{ id: string; passed: boolean; detail: string }> = [];
  const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });
  check("budget-hard-stops", evidence.budgets.companyMonthlyCents === 1_000 && evidence.budgets.agentMonthlyCents === 1_000,
    "Public company and agent records must both retain the 1,000-cent monthly hard stops.");
  check("default-hire-bundle", evidence.bundle.entryFile === "AGENTS.md" &&
    evidence.bundle.files.length === 1 && evidence.bundle.files[0]?.path === "AGENTS.md" &&
    evidence.bundle.files[0]?.content === STOCK_HIRE_IDENTITY,
  "The baseline managed bundle must exactly match the historical default manual from e00d10d5d; no QA manual is injected.");
  return checks;
}

export function gradeStockHarness(evidence: StockHarnessEvidence) {
  const checks = gradeStockHire(evidence);
  const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });
  check("provider-runs-present", evidence.runIds.length > 0 && evidence.runIds.every(Boolean),
    "The lifecycle oracle must reach actual provider runs; missing runs cannot pass instruction delivery.");
  if (evidence.generation === "legacy") {
    const prompts = evidence.invocations.filter(row => typeof row.prompt === "string" && row.prompt.length > 0);
    check("invocation-evidence-complete", evidence.runIds.length > 0 && evidence.runIds.every(runId =>
      prompts.some(row => row.runId === runId)),
    "Every legacy run must have a public adapter.invoke event with its actual nonempty prompt.");
    check("historical-generic-procedures-observed", prompts.length > 0 && prompts.some(row =>
      REMOVED_PROCEDURES.some(procedure => String(row.prompt).includes(procedure))),
    "Baseline structural receipt observes the historical procedures; identical lifecycle graders own task performance.");
    const fresh = prompts.filter(row => Number(row.promptMetrics?.heartbeatPromptChars) > 0);
    check("fresh-default-delivered", fresh.length > 0 && fresh.every(row =>
      String(row.prompt).includes(STOCK_TEMPLATE_IDENTITY) && String(row.prompt).includes("Connection tools:") &&
      String(row.prompt).includes("connections_search")),
    "At least one fresh invocation must carry default identity and connection guidance.");
  }
  return checks;
}

/** Public API receipts only; no provider-memory claim or private runner hook. */
export async function captureStockHarness(input: {
  api: { get<T>(path: string): Promise<T> };
  agentId: string;
  companyId: string;
  generation: "legacy" | "native";
  runIds: string[];
}): Promise<StockHarnessEvidence> {
  const bundle = await input.api.get<{ entryFile: string; files: Array<{ path: string }> }>(
    `/api/agents/${input.agentId}/instructions-bundle`,
  );
  const [company, agent] = await Promise.all([
    input.api.get<{ budgetMonthlyCents: unknown }>(`/api/companies/${input.companyId}`),
    input.api.get<{ budgetMonthlyCents: unknown }>(`/api/agents/${input.agentId}`),
  ]);
  const files = await Promise.all(bundle.files.map(async file => {
    const detail = await input.api.get<{ content: string }>(
      `/api/agents/${input.agentId}/instructions-bundle/file?path=${encodeURIComponent(file.path)}`,
    );
    return { path: file.path, content: detail.content };
  }));
  const events = await Promise.all(input.runIds.map(async runId => ({
    runId,
    rows: await input.api.get<Array<{ eventType?: string; payload?: Record<string, unknown> }>>(
      `/api/heartbeat-runs/${runId}/events?limit=1000`,
    ),
  })));
  return {
    schema: "paperclip.stock-harness.v1", generation: input.generation,
    budgets: { companyMonthlyCents: company.budgetMonthlyCents, agentMonthlyCents: agent.budgetMonthlyCents },
    agentId: input.agentId, bundle: { entryFile: bundle.entryFile, files }, runIds: input.runIds,
    invocations: events.flatMap(({ runId, rows }) => rows.filter(row => row.eventType === "adapter.invoke")
      .map(row => ({ runId, prompt: row.payload?.prompt, promptMetrics: row.payload?.promptMetrics as Record<string, unknown> | undefined }))),
  };
}

export function stockHarnessSourceDigest() {
  const hash = createHash("sha256");
  for (const source of [
    "stock-harness.ts", "context-integrity-cases.ts", "context-integrity-scoring.ts",
    "context-integrity-flow.ts", "chat-cases.ts", "chat-flow.ts", "live-fixtures.ts", "runner.spec.ts",
  ]) hash.update(source).update(readFileSync(new URL(source, import.meta.url)));
  return hash.digest("hex");
}
