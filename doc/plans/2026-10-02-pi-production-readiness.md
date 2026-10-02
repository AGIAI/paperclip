# Pi production readiness — 2026-10-02

The release target is Pi 1.0.0 through the native Runner. Readiness is a finite
set of release gates. Pi remains a candidate until every required gate passes.
Do not expand this work to additional models, widgets, images, Cursor or Copilot
qualification. The existing draft stack must be reviewed in dependency order.

## Frozen target

- Pi: `@earendil-works/pi-coding-agent@1.0.0`.
- Wrapper: `pi-acp@0.0.33`; ACPX: `0.13.1`; Node: `24.21.0`.
- Pi profile: 13. Model: `openrouter/deepseek/deepseek-v4-flash-0731`.
- Reasoning: native-confirmed `low`. No silent model or thinking fallback.
- Exact source, suite definition, installed package integrity, runner digest,
  environment and cost evidence must accompany each attempt.

## Release gates

| Gate | Acceptance evidence | Current result |
| --- | --- | --- |
| Runtime identity and admission | Exact runtime/profile/model; verified effective thinking; startup below the 60-second admission limit; unsupported configuration fails before a prompt | Deterministic checks and ARM installed startup pass. Recheck final source on all supported hosts. |
| Live lifecycle | Pending native question survives controller restart in the original process; one creation and resolution; stale answer after provider death rejected; Stop retires owned processes; three warm turns keep process identity | Installed local restart and three-turn warm continuity pass at `f5f57e380`. Pending-permission Stop and stale response rejection pass at `03dd6ef93`. Provider-death evidence remains required. |
| Product workflows | All 26 explicit Pi Product E2E cells (13 local, 13 Daytona); screenshots, public state, independent artifacts, terminal and cleanup evidence | Historical partial passes exist. Full final-source campaign remains required. |
| Runner protocol | Pi roster passes through the native packaged runner and authenticated mock control plane; lifecycle/denial/control cases remain distinct from Product tests | Installed get-task-context passes at `f5f57e380`; context-before-action times out. Five cells remain unexecuted. |
| Installed distribution | Public CLI/server tars on ARM Mac, Intel Mac and Linux; normal Pi setup; exact Linux companion and immutable Daytona image imported without binary override | Fresh ARM public installation and normal packaged no-key probe pass. The Linux fleet job is queued. Final-source Intel/Linux/Daytona receipts remain required. |
| Governance and spend | Company isolation, human-only permission, duplicate/stale answers, Stop and budget hard stop; pricing estimates never become claimed bills | 58 focused governance/cost/session invariants pass at `f5f57e380`. Live pending-permission Stop passes at `03dd6ef93`. The qualification key cap is not proof of Paperclip budget enforcement. |
| Integration and rollout | Review each prerequisite; final-head typecheck, tests, build and CI pass; no unresolved review; exact artifacts; rollback recorded | Draft #14956 is stacked on #14924. Prerequisite PRs #14921–#14924 remain open. No merge or release. |

## Bounded execution

Run one explicit failed lifecycle cell after a specific source correction, with
zero automatic retries. Keep each failed attempt, its machine grade and its
cause. Do not regrade a failed attempt as a pass or rerun an unchanged failure.
After restart and warm continuity pass, run the remaining exact cells against
the fixed candidate. Use the canonical Product E2E and Runner report pipelines.

Pi paid qualification uses the existing dedicated OpenRouter key with a $5
lifetime credit limit. Do not reset the limit or fall back to an account key.
Check remaining credit and that BYOK usage stays zero before and after each
attempt. API key deltas are provisional billing observations. Pi model-catalog
prices are estimates. Unpriced usage must stay unpriced in the ledger and UI.

## Evidence so far

- `2b50801b2`: installed restart failed before native answer delivery. The
  durable request turn ID differs from the provider turn ID. The browser's
  issue-identifier route also differed from the matcher's UUID route.
- `780471702`: the exact retained browser answer was delivered and the original
  run reached Done with the correct independent file. The attempt still failed
  because recovery emitted a second `runtime_request.created`. The oracle
  correctly requires one creation. The next change restores the ledger without
  repeating its creation event.
- `f5f57e380`: the fresh installed restart journey passes all six matchers,
  including one native creation/resolution, the original process and turn, exact
  browser answer, independent file and cleanup. The revised three-turn warm
  journey also passes all nine matchers with the same native process/session.
  Earlier failed attempts remain unchanged.
- The full workspace typecheck, 332 native core tests and 58 focused governance,
  cost and session tests pass. The PR's Linux timestamp precision finding is
  fixed with positive and negative calibration and the real process fixture.
- Credential-free ARM startup through the installed CLI, server and database
  passed. Normal Pi setup verifies the profile-13 closure. Full transport and
  recovery regressions at `780471702` passed 216 tests.
- At `f5f57e380`, the explicit Runner `get-task-context` case passes. The next
  case, `context-before-action`, times out after 120 seconds: four context tools
  succeed, but the requested progress mutation and terminal do not arrive.
  Its canonical timeout grade remains unchanged; no automatic retry occurred.
- The local pending-permission Stop attempt at `f5f57e380` fails. Retained
  Product events contain the native write and pending permission. The oracle
  incorrectly rejects legitimate earlier null paths while arguments stream,
  so it never sends Stop. The correction admits those partial rows only until
  the same execution proves the exact path. Missing/conflicting/lost paths and
  foreign executions still fail. All 66 control calibrations pass; the failed
  paid attempt stays failed and requires a fresh journey after the correction.
- The public-install verifier now packs the public CLI as well as the server,
  runs normal explicit Pi setup in its isolated consumer, then proves closed
  startup offline. Its standalone ARM probe passes in 7.9 seconds with no
  credentials, prompts, binary override or borrowed workspace package.
- Draft #14956 at `2b3d7ff0a` has a fresh Greptile 5/5, the Linux finding is
  resolved, and its CI checks pass. Subsequent changes require a fresh review.
- At `03dd6ef93`, fresh pending-permission Stop passes: the original callback is
  cancelled, a stale decline is rejected, the owned processes retire and the
  continuous watcher records no file effect. The subsequent steering attempt
  retains its failed grade. Its browser successfully posts one queued comment,
  but the oracle compares plain input with the editor's Markdown-escaped body
  and never clicks Steer. The correction binds to the exact browser POST body;
  67 calibrations include escaped content and rejection of an altered queue.
- The `03dd6ef93` full build passes. The broad unit run reports 14,984 passes
  and one HTTP socket failure; all 12 tests in that unchanged suite pass in
  isolation. Fresh review is 5/5. CI's public installer reaches Pi setup but
  exhausts its 256 MiB scratch mount. Pi assembly now gets at most 2048 MiB,
  retaining the same unprivileged, read-only sandbox and 3 GiB memory limit.
  All seven sandbox checks pass. CI's separate legacy signoff browser failure
  received one diagnostic shard rerun; it is not counted as passing yet.
- Earlier evidence in `doc/architecture/runner-pi-capabilities.md` is historical
  and must not be counted as qualification of a new source revision.

## Rollout and rollback

Release only the exact qualified package set. Begin with a small operator-owned
Pi company on the frozen model and explicit low thinking. Verify startup,
question resolution, Stop, terminal state and usage visibility before expanding.
Keep the prior published CLI/server set and current company configuration.

On a failed gate, hold admission. On a rollout regression, stop new Pi dispatch,
retire active work through the existing control-plane Stop path, and restore the
prior published packages. Reopen incompatible sessions; do not replay uncertain
provider actions or present expired callbacks as live questions. Preserve run
history and all failed release evidence.
