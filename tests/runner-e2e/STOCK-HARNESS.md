# Stock harness with Paperclip

This suite covers the instruction reductions tracked in the
[working checklist](../../doc/plans/2026-10-02-stock-harness-paperclip-checklist.md).
Existing context-integrity and chat evals supplied a custom QA instruction
bundle. Their passing results therefore did not qualify a hire with the tiny
production default. The new suite omits that fixture bundle and lets the public
agent-creation route materialize the shipped default.

## Coverage contract

| Change | Required deterministic evidence | Product E2E evidence |
| --- | --- | --- |
| SH-1: native Codex preserves vendor base instructions | Serialized start/resume requests from the TypeScript driver, recovery paths, runnerd transport, Runner Lab/live sessions, and Rust provider use additive developer instructions. | Real new native Codex hires execute the three journeys below. Task success alone cannot prove vendor base preservation. |
| SH-2: identity-only default hire manual | Existing public agent-creation and onboarding-asset tests cover default, custom, and CEO exceptions. | The public bundle is exactly one `AGENTS.md` containing the eight-word shipped identity, checked before provider execution and again during cleanup. |
| SH-3: reduced shared legacy task/chat defaults and resume delta | Shared prompt tests and ACPX, Codex, OpenCode, Pi, Hermes, and Cursor Cloud adapter regressions retain runtime context and exclude removed generic procedures. | Actual legacy `adapter.invoke` prompts retain fresh identity/connection guidance, omit the removed procedures, and have complete receipts for every observed run. |

`pnpm test:e2e:runner:stock-harness` runs these credential-free prerequisites,
including the Rust test. It writes JSON reports, the source SHA, a working-source
fingerprint, selected checks, test counts, and `providerCalls: 0` under
`results/stock-harness-preflight-<UTC>/`. Missing reports or required skipped
assertions fail. Unrelated native tests filtered by the name selector remain
explicitly skipped; they are not counted as executed coverage. Run this gate
before qualifying live cells; the live launcher does not run Cargo implicitly.

## Live matrix

There are 24 explicit local cells: these eight existing profiles each run three
existing journeys with independently calibrated graders.

- Legacy: `legacy-codex`, `legacy-claude`, `legacy-opencode`,
  `legacy-acp-codex`, `legacy-acp-claude`.
- Native: `runner-codex`, `runner-acpx-claude`, `runner-opencode`.

| Journey | Expected provider turns | Observable outcome | Cell deadline |
| --- | --- | --- | --- |
| `assigned-skill-explicit-invocation` | 1 | Public skill creation/pinning, an explicit skill request, and saved output containing the marker available only in the skill body. | 12 minutes |
| `ordered-comment-continuation` | 2 | Initial report followed by three ordered public comments, including repeated wording and a changed scope; final saved report preserves the ledger and requested scope. | 12 minutes |
| `continuity-restart` | 3 | Task-backed chat retains the requested context across a server restart and subsequent replies. | 15 minutes |

A full matrix expects 48 provider turns. Models, credentials, effort,
permissions, assigned skills, environment, and managed secret references are
inherited from the existing profile; only its QA manual is omitted. Both company
and agent receive a 1,000-cent monthly hard stop before provider execution,
verified through public records. These limits do not predict final spend:
attempts, retries, partial runs, unknown billing, and cleanup remain in the
existing campaign accounting and qualification rules.

`stock-harness` is excluded from `--all`; select it explicitly. It has no Daytona
cells. Pending or unrepresented harnesses are not live-qualified by this matrix.
Pi/Hermes/Cursor Cloud rendering coverage is deterministic here. The separate
Codex-through-ACP base-instruction patch is still an open checklist item: its
legacy cells qualify the common prompt reduction, not vendor base preservation.

## Run and inspect

```sh
# No credentials or paid providers:
pnpm test:e2e:runner:stock-harness --list
pnpm test:e2e:runner:stock-harness
pnpm test:e2e:runner:typecheck
pnpm test:e2e:runner:unit
pnpm test:e2e:runner -- --list --suite stock-harness

# With authorization and the selected profile's required provider credential:
pnpm test:e2e:runner -- --id stock-harness.runner-codex.local.assigned-skill-explicit-invocation
```

Use an exact cell first, then expand profile/journey selections when its evidence
is understood. The ordinary launcher, isolated instance, fixture cleanup,
screenshots, attempt history, usage/cost reporting, and dashboard publisher are
unchanged. `snapshots/stock-harness-hire.json` captures the public bundle and
budgets before paid execution. `snapshots/stock-harness.json` captures the final
bundle, budgets, run IDs, actual legacy prompts, and matcher verdicts. Evidence
API failures retain an error snapshot and cannot pass. All snapshots use the
existing secret sanitizer; screenshots remain the original captured pixels.

The oracle's identity is independent of the implementation constant, so changing
the shipped manual cannot silently change the expected result. The suite
definition digest incorporates the fixture, journeys, grader, and execution
integration sources. Positive and plausible-negative support tests exercise
missing/malformed receipts, manual regrowth, removed startup/resume procedures,
absent connection guidance, and budget drift. Existing calibrated lifecycle
graders still own task/chat success.

The skill oracle proves the requested pinned skill's output marker reached the
saved result without appearing in the task request or follow-up comments. Skill
tool/read event detection is retained as supporting evidence; it is not a
required cross-provider tool-trace assertion.

## Qualification status

Setup was validated locally on 2026-10-02 with the deterministic prerequisites,
Product E2E support tests, typecheck, and discovery: 478 executed prerequisite
tests passed (477 TypeScript plus one Rust), along with 860 support tests and
discovery of all 24 cells. The 313 unrelated native tests filtered by the gate
are not counted as passing coverage. Local evidence is retained under
`results/stock-harness-preflight-2026-10-02T16-15-39.064Z/preflight.json`.
Earlier interrupted, discovery-failure, and setup/test-timeout attempts remain
retained; the final unchanged-assertion retry passed. No live cells or paid
providers were run. This establishes executable coverage, not a live reliability
result or improved coding quality. A quality claim needs comparable tasks,
models, effort, tools, and independently graded before/after results.

The suite exercises fresh isolated hires and their continuations. Existing saved
manuals and old Codex sessions are not automatically migrated. The latter still
need a provider-session reset to restore a previously replaced vendor base.
Private Runner protocol definitions remain separate: they use mock control-plane
operations and cannot substitute for this public hiring and assembled-prompt
coverage.
