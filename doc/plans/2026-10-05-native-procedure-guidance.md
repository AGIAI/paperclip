# Native hiring and dependency guidance

Status: **hold draft #15218. The change did not pass the no-regression gate.**
The corrected comparison has baseline 5 PASS / 1 FAIL and candidate 3 PASS /
3 FAIL: two new failures, no new passes, three unchanged passes and one unchanged
failure. Codex did not resume its parent after the replacement deliverable;
OpenCode did not finish the revised hiring story before the deadline. Both
OpenCode delegation variants finished the parent before the final child revision.

The measured reduction is 460 bytes, about 0.9% of the combined standing
projection. This result does not justify shipping the reduction. Single trials
do not establish that the changed instructions caused these failures. Retain
the experiment, original failures and evidence; do not reroll completed cells
or weaken the oracle. This follows the merged completion slice in #15151.

The [sanitized comparison receipt](2026-10-05-native-procedure-comparison.json)
contains original grades, exact sources, campaign links, measurement receipts
and retained evidence hashes. It excludes raw sessions and instance identifiers.

## Scope

The paid comparison uses master `a386a599983519eb1d399f8b770bfccdb2a74762` as
the common source context.
Move hiring/reuse and assigned-worker guidance to the existing `hire_agent` and
`create_task` descriptions. Keep dependency discovery in the fixed prompt and
replacement semantics in `set_dependencies`. Return conditional workspace-yield
guidance after recording a nonempty blocker set. Empty sets do not need waiting
guidance. Preserve idempotency and the original dependency state transitions.

Leave connection procedures and legacy skill/API instructions unchanged. Advance
the prompt and native-session catalog revisions so retained threads cannot use
the old declarations with the new instructions.

## Measurement boundary

Capture the actual standard-mode server tool authority with API tools enabled,
a local workspace, and no assigned external apps. Measure fixed instructions,
all advertised tool descriptions and input schemas, and the serialized task
input together. Scripted native start/resume/continuation checks cover Codex,
ACPX Claude and OpenCode; authenticated MCP tools/list checks the OpenCode
bridge separately. Export source identity, file hashes, bytes and tool counts.

These receipts have zero provider calls. Bytes are not model tokens or invoice
costs. This boundary cannot establish the upstream SDK's private instructions,
lazy loading, truncation or cognitive use of returned guidance. The previous
completion-only capture selected a partial catalog and is not a full-tool
baseline. Preserve its historical evidence unchanged.

## Matched live comparison

Use the existing explicit-only `everyday-workflows` suite with original
`hire-reuse` and `delegate-feedback` requests and independent artifact oracles.
Select only native Codex `gpt-5.6-sol`, ACPX Claude `claude-sonnet-5`, and OpenCode
`openrouter/deepseek/deepseek-v4-flash-0731`, in local environments.

Freeze common measurement, harness and test-runner repairs in both branches
before the candidate production changes. The historical branch keeps the
current production prompt and tool contracts. Record exact measured source
SHAs separately from the trusted master workflow definition and selected
runtime/artifact hashes. Never label a later source revision as the measured
revision without showing its delta.

The plan has six cells per variant, one attempt per cell, a 12-minute cell
deadline, at most 12 story run records per cell, and a 1,000-cent company and
lead-agent hard stop per cell. The original campaign applied the company cap
but mistakenly left the lead budget at 0; the corrected common setup verifies
both actual API payloads. All worker runs count toward the company budget;
individual worker caps are not asserted.
Count every actual run, including notifications and failed attempts. No broad
matrix, automatic retries or baseline rerolls are part of this comparison.

Inspect original grades and retained content for persistent teammate identity,
reuse on revision, worker ownership, independently tested delivered artifacts,
parent review, dependency release, and final ordering. Check per-pair changes;
equal totals are insufficient. Preserve every original failure and missing
evidence. Model-authored tests cannot replace the existing independent oracle.

These two stories do not qualify arbitrary live resume, every existing-blocker
combination, general coding quality, or cost/speed trends. Explicitly report
missing evidence. Do not loosen the original oracle to create a pass.

## Complete-catalog measurement

The corrected source `ffe847fabaebbf24bc93924a4b6c8922d46a1fb6` is compared with
baseline `aecfa3b6a5cab110a9b926e93705311bbcf4db47`. Both include the same
measurement fixture and common eval repairs. Exactly 12 source/generated/unit
paths differ; 256 common fixture files have identical bytes.

| Normalized extracted component | Baseline bytes | Corrected candidate bytes | Change |
|---|---:|---:|---:|
| Fixed instructions, start/resume | 1,809 | 1,256 | −553 |
| All 39 tool declarations including schemas | 44,944 | 45,037 | +93 |
| Task input, start/resume | 1,993 | 1,993 | 0 |
| Combined standing projection, start/resume | 48,781 | 48,321 | −460 |
| OpenCode MCP tools/list declarations | 44,249 | 44,342 | +93 |

Scripted Codex, ACPX Claude and OpenCode deliveries give the same comparative
change. The serialization of the extracted components is measured separately
from its path-normalized comparison. The fixture's real temporary paths add
168 bytes to the combined start/resume projection in each variant. Neither
projection is the entire transport request. Returned dependency guidance adds
input when used, so this is not an overall token, latency or cost saving claim.
The measurement produces zero provider calls and does not prove upstream
loading or truncation behavior.

## Original comparison — failures retained

Original sources were candidate `eb01d073c35134bf0d373947b55a79f9e443f8ee` and
baseline `64cd2194a1d058356679b653c181f16404aefc80`, using trusted master workflow
`a386a599983519eb1d399f8b770bfccdb2a74762`. Source identity remains distinct from
workflow identity and the later measurement-only correction.

- [Original candidate campaign](https://github.com/paperclipai/paperclip/actions/runs/37325777217)
- [Original baseline campaign](https://github.com/paperclipai/paperclip/actions/runs/37325870695)

| Profile | Hire/reuse baseline → candidate | Delegate/feedback baseline → candidate |
|---|---|---|
| Codex | PASS → PASS | PASS → FAIL |
| ACPX Claude | PASS → FAIL | PASS → FAIL |
| OpenCode | FAIL → FAIL | FAIL → PASS |

There are three new overall failures, one new pass, one unchanged pass and one
unchanged failure. The candidate did not qualify. Final ledgers match the
result run-ID sets: 25 started baseline runs and 15 candidate runs, zero retry
links. All twelve cell cleanup receipts passed. Missing/zero billing amounts
and unmetered host runtime prevent any claim about actual cost savings.

The candidate Claude hire created Morgan and a child task, then ended with a
waiting message without recording dependencies or using a terminal tool. The
lead failed with `native_finalization_missing`. The corrected v7 prompt keeps
explicit `set_dependencies` and `paperclip_block` discovery. This is a concrete
missing behavior; a single trial does not establish causation.

The candidate Codex delegate failed in Riley's worker turn with the provider
error `Selected model is at capacity` / `serverOverloaded`. Its parent had
received the dependency guidance. Candidate Claude delegation failed opening
an ACPX session (`session_ensure_failed`); its underlying cause is unknown.
Both original grades and classifiers remain unchanged.

Both OpenCode hire cells failed common setup requesting an OpenAI credential
although OpenRouter was selected, before any agent run. Shared setup now uses
the profile's actual credential. A separate nonce/cell-ID bug left original
lead budgets at 0; six nonce-based setup tests now verify company and lead caps
using only the selected provider credential. These common control changes are
why the corrected campaign uses a newly matched baseline.

The baseline OpenCode delegation delivered an artifact passing the independent
oracle but completed the parent before the child's final revision. Candidate
passed both the artifact and ordering checks. Correct output alone did not
qualify that baseline outcome.

## Corrected comparison

- [Candidate ffe847f](https://github.com/paperclipai/paperclip/actions/runs/37331580879)
- [Baseline aecfa3b](https://github.com/paperclipai/paperclip/actions/runs/37331642168)
- [Candidate recovery for two interrupted cells, same ffe847f source](https://github.com/paperclipai/paperclip/actions/runs/37334061104)

These use the same corrected fixtures, original requests and artifact graders,
with one attempt per campaign cell. The original campaign is preserved and is
not relabeled as this revision. The common suite hash is
`acd17b4acbd7051070531f7d7587131139900f54245b992eb7a62faacda8e334`.

| Profile | Hire/reuse baseline → candidate | Delegate/feedback baseline → candidate |
|---|---|---|
| Codex | PASS → PASS | PASS → FAIL (recovery) |
| ACPX Claude | PASS → PASS | PASS → PASS (recovery) |
| OpenCode | PASS → FAIL | FAIL → FAIL |

There are **two new failures, zero new passes, three unchanged passes, one
unchanged failure and zero pending pairs**. Workflow completion is not the
behavioral grade. These are the original result grades; no regrading was done.

### Missing and recovered behavior

**Codex delegation regressed in the observed pair.** The first parent turn
recorded its dependency and blocked correctly. After feedback, the parent
reviewed a stale ZIP and requested a replacement. An API comment operation was
rejected with `API comments cannot change runner execution state`. The child
finished the replacement at 15:45:48.284 UTC. The parent then recorded the
dependency at 15:45:51.801–15:45:59.295 UTC; its receipt scheduled no wake. The
parent blocked and finalized at 15:46:19.909 UTC. The child was Done, but the
parent remained Blocked with no active continuation. All four native runs had
successful run status; that does not make the task outcome successful. This
sequence does not by itself establish a prompt, race or platform root cause.

**OpenCode hiring regressed in the observed pair.** It hired the expected
teammate and produced an initial artifact that passed the independent checks.
It reused the same teammate for the separator revision, then requested further
CLI argument-handling changes. After nine started runs, the story reached the
12-minute deadline with parent and revision work still in progress. Cleanup
cancelled the remaining work. The final revised-ZIP and settled-outcome checks
were not completed; they are not assumed to pass. The baseline passed after
four runs. This single trial does not establish a speed or cost trend.

**OpenCode delegation failed in both variants.** The artifacts passed the
independent output checks, but the parents finished before the final child
revision. Candidate parent/child completion times were 15:33:43.628 /
15:35:03.222 UTC; baseline times were 15:35:21.429 / 15:36:03.043 UTC. Both
parents lacked review of that final revision. Equal FAIL totals conceal neither
this missing behavior nor the passing artifact checks.

**Claude hiring now passes all 45 original checks.** Retained semantic receipts
show dependency recording, returned guidance and an accepted current-track
block with the child agent as owner. The parent later resumed and finished.
This repairs the original missing dependency/finalization observation in this
trial. It does not prove cognitive use of the guidance or every hiring tool
path; API hiring remained available.

### Interruptions and accounting

Candidate Codex and Claude delegation jobs received runner shutdown signals at
15:27:38 UTC and were cancelled at 15:27:50 UTC. Jobs `111838521694` and
`111838521502` retained no result, final ledger or cleanup receipt. Their
behavioral grades and total actual runs/charges are unknown. Eight distinct
run-record IDs were visible in partial logs; this is not a complete started-run
ledger. Preserve the workflow failures and missing evidence.

Only those two missing candidate cells received one bounded recovery each, on
the identical measured source. No completed baseline or other candidate cell
was repeated. The original workflow revision was `a386a599`; recovery used
`a65ca0950834a85bb93bcc4b4042ecacdebfef53` after master advanced. Workflow file
bytes were identical, SHA-256
`eb570267e66043c1196338bb386b07ab8e8e8306ba04b6223f13b73b04fdc8f4`.
The measured source stayed `ffe847f`, distinct from both workflow revisions.

All twelve completed/recovered cells have matching result/final-ledger run
sets and passing cleanup receipts. They contain 27 baseline and 33 candidate
started runs. The original campaign contains 40 more: **100 retained started
runs, plus incompletely known activity from the two interrupted jobs**. Zero
retry links within the completed ledgers do not erase the two infrastructure
recoveries. The audits retain 100 original and 108 corrected JSON evidence
hashes. Actual charges remain unknown because usage and interruption records
are incomplete and host runtime is unmetered. No free-call or savings claim is
made.

ACPX provider execution IDs are not proven mapped to host call IDs. No strict
no-extra-work claim or feedback-consumption inference is made from matching
names, ordering or counts. These evidence limits remain even for a passing
original story grade.

## Integration and repository checks

After the paid sources were frozen, the PR merged master
`a65ca0950834a85bb93bcc4b4042ecacdebfef53` as
`ee096aa23fc88a001e7666215bcd338b5863f377`. Three generated contract conflicts
were resolved by normal generation from the combined sources. The paired
provider-free baseline is `ce31f5efd0d416205c3994c55dd02b645f8b8423`.
Their twelve intended differing paths are identical to the paid source delta;
all 256 common fixture files remain byte-identical. **No live campaign measured
the integrated head.** Later documentation-only commits do not change that.

The integrated full-catalog projection is 49,200 → 48,740 normalized bytes at
start/resume and 47,422 → 46,962 during continuation. The 460-byte reduction is
unchanged. Master's project-discovery schema adds 419 bytes to both tool sets.
The actual extracted start/resume projection is 49,368 → 48,908 bytes. All 39
declarations remain present; this still does not measure private vendor prompts,
model tokens, lazy loading or upstream truncation limits.

Before integration, 74 focused tool/session/measurement checks, 1,252 eval-support
Vitest checks, 128 Node checks and the eval TypeScript check passed. Repository
typecheck and build passed before the prompt-only v7 correction. The corrected
source CI then passed typecheck, build, tests and all eight browser shards. An
interrupted canary job was retried once; that is separate from paid eval recovery.

At integrated `ee096aa23`, local measurement/session checks passed 48 tests;
23 authority tests could not start because PostgreSQL initialization failed,
and 21 project-tool tests were skipped by the unsupported database helper.
The integrated baseline passed six measurement tests. The older full local
suite was stopped after source revisions changed during its run. Its failures
remain retained; it is not reported as green.

[Integrated CI server shard 5](https://github.com/paperclipai/paperclip/actions/runs/37335450901/job/111849219339)
failed `workspace-git-snapshot-streaming.test.ts`: the four Git filename lanes
over 32 MiB exceeded the 180-second timeout (707 tests passed, two skipped,
one failed in that shard). The aggregate verify job therefore failed. The cause
has not been established; this is not reclassified as an infrastructure pass.
The [review summary](https://github.com/paperclipai/paperclip/pull/15218#issuecomment-5996723170)
gave integrated `ee096aa23` 5/5 but noted project-discovery authorization work
for actors with sparse visibility. Both inline measurement findings are
resolved; the summary's separate concern is not erased by that count.

Passing code review cannot override the failed behavior comparison. Keep this
PR draft. Consider the measurement fixture separately from the reduction;
diagnose the task continuation and final-review failures before proposing a
new candidate. Do not repeat paid trials simply to obtain passing grades.

## Gates

- [x] Freeze common fixtures and both source revisions.
- [x] Export comparable full-catalog delivery projections.
- [x] Pass 74 focused checks, 1,252 eval-support Vitest checks and 128 Node checks.
- [ ] Complete repository typecheck, tests and build.
- [x] Run and inspect the bounded matched campaign, including original failures.
- [ ] Meet the no-regression gate: **failed, two newly failing corrected pairs**.
- [ ] Verify current-head CI, review and conflicts before readiness.
- [x] Preserve original and corrected grades, hashes and incomplete accounting.

No merge is authorized.
