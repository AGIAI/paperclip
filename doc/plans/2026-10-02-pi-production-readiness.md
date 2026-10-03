# Pi production readiness — 2026-10-02

The release target is Pi 1.0.0 through the native Runner. Readiness is a finite
set of release gates. Pi remains a candidate until every required gate passes.
Do not expand this work to additional models, widgets, images, Cursor or Copilot
qualification. The existing draft stack must be reviewed in dependency order.

## Frozen target

- Pi: `@earendil-works/pi-coding-agent@1.0.0`.
- Wrapper: `pi-acp@0.0.33`; ACPX: `0.13.1`; Node: `24.21.0`.
- Pi profile: 14. Model: `openrouter/deepseek/deepseek-v4-flash-0731`.
- Profile 14 binds the corrected outbound ACPX client patch. Profile 13 remains
  historical evidence. Cursor 11 and Copilot 15 also bind that shared patch;
  both remain pending and receive no new paid qualification in this work.
- Reasoning: native-confirmed `low`. No silent model or thinking fallback.
- Exact source, suite definition, installed package integrity, runner digest,
  environment and cost evidence must accompany each attempt.

## Release gates

| Gate | Acceptance evidence | Current result |
| --- | --- | --- |
| Runtime identity and admission | Exact runtime/profile/model; verified effective thinking; startup below the 60-second admission limit; unsupported configuration fails before a prompt | Deterministic checks and ARM installed startup pass. Recheck final source on all supported hosts. |
| Live lifecycle | Pending native question survives controller restart in the original process; one creation and resolution; stale answer after provider death rejected; Stop retires owned processes; three warm turns keep process identity | Installed profile-14 same-turn steering passes at `dc2b053f3`. Restart and three-turn warm continuity pass at historical `f5f57e380`; pending-permission Stop and stale response rejection pass at `03dd6ef93`. Final-source lifecycle and provider-death evidence remain required. |
| Product workflows | All 26 explicit Pi Product E2E cells (13 local, 13 Daytona); screenshots, public state, independent artifacts, terminal and cleanup evidence | Historical partial passes exist. Full final-source campaign remains required. |
| Runner protocol | Pi roster passes through the native packaged runner and authenticated mock control plane; lifecycle/denial/control cases remain distinct from Product tests | Six of seven cases pass through installed `df424c902`, including context-before-action. Governed-wait fails durable suspension during cleanup; paid retries are held pending a concrete correction. |
| Installed distribution | Public CLI/server tars on ARM Mac, Intel Mac and Linux; normal Pi setup; exact Linux companion and immutable Daytona image imported without binary override | ARM and Linux public installation pass at `df424c902`; Intel passes at `666cb3ecc`. Exact-source Linux companion and immutable Daytona proof remain required. Image job 37092761291 is queued on EC2; retain that handle. |
| Governance and spend | Company isolation, human-only permission, duplicate/stale answers, Stop and budget hard stop; pricing estimates never become claimed bills | 58 focused governance/cost/session invariants pass at `f5f57e380`. Live pending-permission Stop passes at `03dd6ef93`. The qualification key cap is not proof of Paperclip budget enforcement. |
| Integration and rollout | Review each prerequisite; final-head typecheck, tests, build and CI pass; no unresolved review; exact artifacts; rollback recorded | All 55 CI checks pass at `df424c902`. Two #14924 UI findings have tested downstream corrections. Prerequisite PRs #14921–#14924 remain open; qualification and final-head review remain required. No merge or release. |

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

- At `dc2b053f3`, the fresh installed profile-14 steering journey receives a
  canonical pass in 52 seconds, including cleanup. It proves the exact browser
  comment, one acknowledgement, denial of the original native write, the hidden
  instruction in the persisted final comment, succeeded/Done, process retirement
  and continuous no-effect evidence through cleanup. The original failed grades
  stay unchanged. No automatic retry or fallback key occurs.
- Final controls definitions advance to version 6. Steering now requires both
  linked control-plane records, the matching accepted result, and succeeded/
  completed/done terminal values. Stop keeps its separate cancellation contract.
  Missing, foreign, duplicate, premature and contradictory records fail. All
  129 controls/flow/catalog tests and Product E2E typecheck pass. The successful
  installed receipt also passes this stricter replay, with no provider call.
  The version-5 canonical pass remains version-5 evidence; the full final-source
  matrix remains a release gate.

- At `603ad3726`, the installed steering journey posts Steer (HTTP 200) and
  Deny (HTTP 202) to the original request. The provider consumes the hidden
  instruction, produces its exact final marker, and reaches succeeded/Done.
  Its canonical grade remains failed: the oracle rejects the legitimate
  `run.result.accepted` and `run.terminal` control-plane records as non-runner
  events. All seven journalled provider processes retire with no target effect.
  The corrected oracle validates those two records against the same run, turn,
  session and linked control producer, after the one native terminal. It still
  rejects foreign, duplicate, reordered and premature records. All 121 controls,
  flow and catalog tests pass, as does Product E2E typecheck. Replaying the exact
  retained public evidence passes the corrected oracle; replay does not regrade
  the original attempt or prove a fresh cleanup receipt. Controls definitions
  advance to version 5. A fresh installed journey remains the qualification gate.
- At `603ad3726`, public profile-14 setup passes on ARM and Intel Mac. The
  first ARM closed-admission probe rejects with `provider_lifetime_owned`;
  a separate credential-free diagnostic with retained state passes in 35.0
  seconds. Preserve both observations; ownership contention remains unclassified.
  Intel closed admission passes in 54.1 seconds. Neither host submits a prompt.
- Full workspace build passes at `3728bb45f`; only the tested UI request-order
  correction changes executable code afterward. Workspace typecheck and UI
  build pass at `603ad3726`. All 282 UI/projection/performance tests and token
  gates pass. Core native tests pass 333 cases. The broader local native
  integration run fails one Codex interrupt recovery case with `provider startup
  ownership remains unadmitted`; isolated diagnosis reproduces it. Do not count
  that broader run as passing.
- At `603ad3726`, 52 CI checks pass and Greptile is 5/5 with both findings
  resolved. Linux Canary is the one failed check: `session_handshake_timeout`.
  The local exact-source Linux build compiles but exceeds its fixed 30-minute
  deadline during image import. It produces no verified usable image. Its
  task-owned builder is stopped, its cache and failed receipt remain, and no
  provider credentials or calls occur. Linux and Daytona remain held.
- At `342287678`, installed steering proves delivery and one acknowledgement,
  but the UI marks the still-pending permission cancelled and hides Deny. The
  correction uses whole-run lifecycle state, carries pending cards to the live
  tail, and leaves closed cards at their original position. Older carried cards
  precede newer requests. The real widget regression clicks Deny for the
  original run, request and provider turn. The paid failure stays failed.
- At `36e712104`, installed steering returns HTTP 200 and the native command
  journal records accepted delivery. The public API retains the correct
  correlation-bound acknowledgement at source sequence 65 and also a
  rehydrated transport echo at 66. The exact-one acknowledgement gate rejects
  that duplicate before permission denial. A regression using the actual
  rehydration function reproduces both items; suppressing the transport echo
  retains the one authoritative item. The interrupted attempt remains failed.
- The shared ACPX patch also requires portable hunk metadata and new byte-bound
  identities. Pi advances to 14, Cursor to pending 11, and Copilot to pending
  15. Historical fixtures remain immutable, and old installed identities fail
  closed. The corrected patch passes all 16 packaging checks; identity and
  steering regressions pass 244 tests. No other provider qualification expands.
- The credential-free Intel public installation at `36e712104` passes closed
  admission in 44 seconds. Its Greptile review is 5/5, but CI is held by the
  stale patch-bound profiles, portable patch metadata and Linux admission.
  The paid attempt and task-owned Linux build were stopped when that identity
  mismatch was found. Their evidence is retained; the owned server and database
  processes are retired. Qualification must use newly installed profile 14.
- At `4237bc369`, the native turn-binding correction advances the steering
  journey past `steering_stale_turn`, but the provider boundary still rejects
  delivery. The real patched ACPX client lacks `requestExtension`: its types
  and runtime callers declare it, while its implementation omits it. A real
  package regression fails with that exact TypeError before the correction,
  then passes steering and follow-up during an unanswered prompt afterward.
  This is a separate runtime correction and needs a fresh installed journey.
- The corrected Intel public package at `4237bc369` passes credential-free
  closed startup in 37.8 seconds. Its CI typecheck, build, native tests and
  browser shards pass. CI retains two failures: a resumed durability test
  inherits the deliberately killed attempt's 500 ms timeout; the Linux public
  Pi probe reaches `session_handshake_timeout`. The former gets an explicit
  resumed-turn bound. The latter remains an admission blocker; accepting a
  timeout as successful installation would weaken the release gate.
- The local Linux image build at `4237bc369` fails before a provider starts
  because the committed lock does not match the source patch configuration.
  The official image workflow already regenerates its private build lock;
  local builds must do the same and record that resolved lock's digest.
  No repository lockfile or workflow changes are required.

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
- At `2a6107c04`, normal public Pi setup and closed admission pass on ARM and
  Intel Mac (7.5 and 29.5 seconds). Intel uses a fresh compiled x64 daemon,
  packaged before installation through the normal public CLI/server graph.
- The fresh steering attempt at `2a6107c04` reaches the real public Steer API
  but receives `409 steering_stale_turn`. Rust checks the durable command ID
  against the live provider turn even though the facade supplies a separate
  `providerTurnId`. The correction uses that explicit provider binding, rejects
  malformed bindings without fallback and keeps the existing live-turn fence.
  All 333 core tests and 68 control calibrations pass. The browser fixture now
  ends immediately on a rejected steering POST before sending any denial.
- Linux CI now completes normal Pi setup with bounded larger scratch space.
  Its offline launch probe still returns an unclassified startup rejection;
  the verifier gives that launch's private runtime snapshots the same bounded
  scratch capacity. This is not counted as a passing Linux receipt yet.

## Resumed goal — 2026-10-02 21:50 CDT

- Current-head `6cfc79b50` CI completes with two failures: Linux Canary
  admission and a 15-second issue-document route test timeout. Runner, build,
  typecheck and the browser shards pass. The prerequisite stack remains open.
- The Linux admission failure is reproduced through normal public packages.
  Pi setup verifies profile 14, then admission times out in 37.3 seconds.
  A credential-free direct native RPC response arrives in 2.4 seconds.
  The actual Docker scratch mount reports `noexec`; executing the verified
  snapshot fails with `EACCES`. The offline runtime probe now uses executable
  scratch. Lifecycle and download probes explicitly retain `noexec`.
  The same installed Linux packages then pass the unchanged public admission
  assertions in 17.2 seconds, with clean Runner exit and zero prompts.
  This receipt uses historical shipping source `dc2b053f3` and native inputs
  from `3728bb45f`. It diagnoses and validates the sandbox correction; it does
  not qualify the new native source or the final Daytona image.
- A provider-free regression proves that receipt-limit deadline settlement
  attempted to restart the provider when polling terminal evidence. The run
  now closes permanently at that deadline. Existing startup admission fences
  remain intact. All 333 native core tests and all 90 enabled native provider
  integration tests pass after the correction; two pre-existing tests remain
  ignored. The accepted-deadline fixture now expects the closed lifecycle and
  checks that polling from both controllers adds no provider resume. The core
  regression also retains unacknowledged terminal evidence across reconnect.
  The earlier broader failure and its stale lifecycle assertion remain in
  private evidence; they are not regraded.
- Runner progress evidence contains four successful reads and continued model
  output before the 120-second cutoff, including unrelated fixture notes.
  Bounded direct-eval instructions now ask for the minimum context needed,
  the requested action, then turn completion. Case assertions and timeout
  stay unchanged. All 35 Runner session-contract tests and TypeScript
  typecheck pass. The retained paid failure remains unchanged. Fresh exact
  source packaging and profile-14 eval definitions must precede a paid retry.
- No paid call, key reset, fallback credential, workflow change, lockfile
  commit, merge or release occurs in this resumed diagnosis.

## Qualification update — 2026-10-02 22:50 CDT

- All 55 CI checks pass at `df424c902`. Linux Canary proves normal public
  CLI/server installation, profile-14 setup and credential-free closed admission
  in 8.036 seconds, with clean Runner exit. ARM public admission passes in
  7.988 seconds at the same source. Intel public admission passes in 34.059
  seconds at `666cb3ecc`; the next commit changes only Rust test formatting.
  These receipts do not prove the immutable Daytona image or the full matrix.
- Installed Runner qualification uses exact source `df424c902`, private eval
  definitions `a9e0e7e0`, frozen Pi profile 14, the exact model and low thinking.
  Context-before-action, get-task-context, create-task-document, finish-task,
  request-human-confirmation and workflow-context-document-progress all pass.
  Each has one attempt and zero infrastructure retries. Original failures
  remain unchanged.
- Workflow-governed-wait creates its requested approval and wake and completes
  the provider turn without finishing the mock task. Its canonical grade is
  `infrastructure_failure`: cleanup never proves durable Runner suspension.
  Retained stderr proves provider drain and semantic tool settlement, with zero
  pending provider events; suspension alone fails. The owned Runner is killed.
  The eval program deletes its temporary workspace, limiting further diagnosis.
  No paid retry is authorized by an unchanged failure; investigate and correct
  the close boundary first.
- The two #14924 notice findings are reproduced and corrected downstream.
  Error severity retains the Error label even with informational status.
  Distinct notices share one compact category so work and a later error remain
  visible. All 44 focused UI tests, token gates, isolated UI typecheck and UI
  build pass. Root UI dependency links point to a different frozen checkout;
  validation uses this task's own dependency-complete private source.
- The existing image-only run 37092761291 remains queued for EC2 job
  111116414966. It uses no provider credentials or prompts. Do not dispatch a
  duplicate on an observation timeout. Its authorization binds `df424c902`;
  source changes require new exact-source qualification evidence.
- The dedicated key's latest API observation is $0.092409367 lifetime usage,
  $4.907590633 remaining, and zero BYOK usage. The $5 lifetime cap and $100
  campaign limit remain. Billing observations are provisional, not invoices.
  Paid work is held until a concrete governed-wait correction and fresh
  exact-source packaging. The full 26 Product cells remain required.

## Idle suspension correction — 2026-10-03 00:05 CDT

- The original governed-wait failure remains unchanged. A credential-free,
  digest-bound native fixture reproduces a close-budget defect: `turn.stop`
  reports an idle Pi provider already settled, leaving an eight-second RPC close
  for a suspension phase that reserves only 2.5 seconds. The original regression
  fails after 8.55 seconds. The corrected regression passes in 0.62 seconds.
- Close preparation now stops idle Pi through its exact native process owner.
  Native code rejects an active turn or pending callback on the idle path, proves
  release of the original inherited lifetime fence, and retains the attested
  identity. Drain and suspension still require their durable receipts. Native
  suspension and the TypeScript checkpoint gate both reject unconfirmed exits.
  A held-quorum regression verifies the non-reusable boundary and unchanged
  state after polling. Remote Pi uses the same native guard before checkpoint.
- The complete native suite passes with no failures and two pre-existing ignored
  tests. All 236 transport and eval-session tests pass; Runner typecheck passes.
  Earlier test failures remain in private evidence, including a corrected
  negative-test expectation: safe polling returns no events and preserves the
  unconfirmed state rather than requiring an exception.
- Typed native suspension failures now retain allowlisted command/lifecycle/
  identity diagnostics in eval artifacts and stay non-retryable. Diagnostic
  collection reuses the barrier observation without extending the close bound.
- All 55 CI checks and Greptile 5/5 pass at `00c7a4510`, with no new finding.
  The subsequent native correction requires fresh-head review and CI. The
  superseded image run 37092761291 is terminal/cancelled; its queue state and
  cancellation reason remain. No duplicate or replacement image is dispatched.
- The paid campaign remains held for fresh exact-source packaging. Its launcher
  now rejects a mismatched or dirty harness and unpinned definitions before any
  provider call. Only the recorded private resolved build lock may differ.
  The next paid call is one explicit governed-wait retry after this correction;
  the original failure is not regraded. All seven final-source Runner cases,
  all 26 Product cells, platform receipts and the immutable image remain gates.

## Remaining work in order

1. Retain the governed-wait failure and the reproduced idle-suspension correction.
   Rebuild exact-source public
   packages before one explicit paid retry. Recheck final-source lifecycle and
   classify the observed Mac ownership contention. Produce the normal Linux
   companion receipt,
   then import an immutable exact-source Daytona image without an override.
   Do not accept a timeout as an installation pass or widen the admission limit.
2. Complete all seven Runner cases and the full 26-cell Product matrix on the
   frozen candidate. Context-before-action now passes after the bounded-context
   correction; its original timeout remains unchanged. Reuse only evidence whose
   executable inputs and source identity match the final candidate.
3. Close the prerequisite review stack and final CI gates. Keep the original
   Codex interruption failures and the passing corrected integration evidence.
   Publish only the qualified artifacts, then use the
   bounded operator rollout below. No merge or release is authorized here.

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
