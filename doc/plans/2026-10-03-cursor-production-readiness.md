# Cursor production readiness — 2026-10-03

The release scope is Cursor CLI `2026.09.26-dd393fe` on macOS ARM64, macOS x64,
and Linux x64 (including Daytona). Qualification uses the explicitly selected
`gpt-5.6-luna[context=272k,reasoning=medium,fast=false]`. Native AskQuestion and
authoritative per-run USD accounting are excluded from certification. Semantic
Paperclip questions remain the supported question path. Unknown usage is unknown.

## Source-to-port map

| Source | Destination / decision |
| --- | --- |
| Mainline `dd868ed125cd709506dd9b29fca640a44d580501` | Branch `codex/cursor-production-readiness`; preserve its recovery, completion, and managed warm-directory ownership |
| Combined snapshot `22c78242a4e0c2369fecf0c2dc4e7600fbad6706` | Cursor installation, native isolation/instructions/modes, extensions, tool evidence and partial usage |
| Same snapshot, shared ACP transport | Permission identity, delivery acknowledgement, cancellation, canonical tool lifecycle and recovery-mode binding |
| Same snapshot, controller | Accepted-plan wait proof, status arbitration/commit/recovery, durable cancellation request ownership |
| Same snapshot, Product E2E | Cursor native interactions, active Stop, warm continuity, remote observers and owned cleanup |
| Mainline warm agent-files work | Retained instead of importing the older competing warm-copy implementation; extend its ACP applicability when qualified |
| New public installation work | CLI `runtime setup cursor`, bundled provisioner and default provider-pack assets |
| Pi/Copilot source and campaign | Excluded; existing pending providers retain mainline identities and admission gates |

Historical proofs retain their original profile/build identities. In particular,
the v10 Stop result at source `22c78242` and the earlier plan/warm/Daytona completion
results do not certify this assembled candidate. Strict accounting failures are
preserved; semantic behavior is assessed separately.

## Readiness checklist

- [x] Create the branch from the agreed mainline base.
- [x] Port Cursor and necessary shared implementation without replacing newer controller files wholesale.
- [x] Complete targeted tests and make the consolidated branch buildable with admission disabled.
- [ ] Ship and verify explicit public runtime setup; npm lifecycle must not download Cursor.
- [ ] Include Cursor in ordinary provider-pack and Daytona image builds.
- [ ] Verify company secret bindings, exact model diagnostics and Agent/Plan/Ask configuration.
- [ ] Preserve successful accepted planning runs as open tasks awaiting explicit user direction.
- [ ] Show unavailable accounting explicitly and keep partial counters diagnostic-only.
- [ ] Freeze candidate source/profile/patch/pack/image identities and build all three platforms.
- [ ] Reconcile the remaining campaign budget; run paid cells serially within the existing account cap.
- [ ] Qualify normal setup/completion locally and on Daytona.
- [ ] Qualify file editing, independently checked bytes/validation and accessible artifacts on both targets.
- [ ] Qualify semantic questions/restart with exactly-once answer consumption on both targets.
- [ ] Qualify native plan reject/revise/accept/cancel and correct task/run states on both targets.
- [ ] Qualify denied writes and Stop during pending approval, including owned process retirement, on both targets.
- [ ] Qualify three warm turns with stable session/workspace/agent-files ownership and no duplicate output on both targets.
- [ ] Qualify provider loss, input expiry and actionable errors without mutation replay or false success.
- [ ] Run seven semantic Runner cases; retain strict accounting results separately.
- [ ] Promote Cursor consistently only after the candidate passes; leave other pending providers gated.
- [ ] Run contracts/replay, token gates, recursive typecheck, full tests and build.
- [ ] Repeat a clean normal-install smoke with qualification overrides absent.
- [ ] Deliver exact identities, capability limits and completed acceptance matrix; prepare focused template-based PR.

Production merge/deployment is a separate final action. Rollback disables new
Cursor admission while preserving records, valid committed plan waits and recovery
inspection.

## Consolidation verification

The assembled workspace build and recursive typecheck pass. Focused Cursor
normalization/installation tests, controller settlement tests, CLI setup containment,
and 19 native ACP backend tests pass. The 65 protocol/package contract checks pass.
Full-suite failures remain retained for diagnosis; these narrow results are not a
production certification. All three pinned Cursor distribution closures were
materialized and verified afresh. macOS ARM64 ordinary provider-pack preparation
passed without candidate flags.

The resolved campaign lockfile remains local because repository policy gives
GitHub Actions ownership of lockfile commits. Its SHA-256 is
`70af8ab3d7051c85fc1a55c11e9afe8887d9711232e3c6e97666006562217e5f`;
retain these exact resolved bytes with candidate artifacts and pass their digest
to the immutable image build.

## Qualification preparation and demonstrated repairs

Candidate `9ba53fced5de6dabd1e931b7438d9dd118e45f0f` passed local
completion, semantic question continuation, and file-edit/validation Product E2E
cells with the explicit Luna model, serial execution, no retries, and successful
cleanup. Their original campaign identities remain unchanged. Measured per-run
dollar usage is unavailable, not zero. The existing Cursor account-cycle cap is
counted once against the reconciled campaign envelope.

Fresh ordinary provider packs were built for macOS ARM64 and x64; the Linux x64
Daytona image also built successfully. These are preparation artifacts, not a
completed release certification.

Public-package inspection found that setup derived the standalone runner layout
when embedded in the server's vendored layout. The provisioner now selects its
contained public asset root explicitly and rejects an unbundled source invocation.
Three containment checks pass. `node scripts/verify-cursor-npm-install.mjs`
packages the actual public CLI/server dependency graph and verifies installation,
enabled npm hooks, explicit setup, and the installed Cursor execution closure in
an isolated consumer. It retains evidence under its printed temporary directory
and makes no model calls. npm hooks may fetch normal platform dependencies;
Cursor provisioning must remain absent until the public setup command runs.

The new explicit-only `native-provider-loss` Product E2E suite covers the missing
transport-loss gate locally and on Daytona. It loses only the observed per-turn
run owner while a native mutation is awaiting permission, then requires a visible
failed run, an unanswerable stale approval, an open task, no automatic replay,
no changed target, and retirement of the owned process tree. The remote fault uses
a Linux pidfd bound to the retained start ticks and boot ID.

The initial full test run retained resource/startup failures. Targeted reruns
passed 43 boundary/file-handoff checks, 196 real-runner checks, and 1,742 of 1,744
remaining server checks. The two remaining assertions compare macOS `/var` aliases
against canonical `/private/var` paths; no unrelated test repair is ported.

## Candidate and qualification checkpoint

The runtime candidate is `ccae835581923876ad5ac0ef12bf763e54958db9`,
rebased onto mainline `569c7203aa24b95440682983ce7940ba1d4247bd`.
Commit `d3dd596c77a9032da639201f1b05dc6891479e68` changes only verification
fixtures: public-install probing and the provider-loss oracle/admission. It does
not change the candidate runtime. Product results retain their runtime source and
catalog fingerprints; the verification commit is an additional harness identity.

Cursor profile v11 binds command digest
`sha256:2feb50c7b0a317dff454c00115a5bbe4d5c757189691586577be9c80234d477e`.
The native patch remains `paperclip-cursor-usage-v4`.
The ordinary macOS ARM64 pack digest is
`sha256:7443adb3ab1d2fbd7081532923bcc6eaf8d9f511aff22fac6836c647ac6a3c8e`.
Both macOS targets were built with official standalone Node 24.21.0; the x64
daemon also executes under Rosetta. Linux image preparation retains its own
manifest identity; the remotely pulled digest must be recorded before a live cell.

| Required behavior | Local candidate result | Daytona candidate result |
| --- | --- | --- |
| Ordinary installation and completion | Public setup/closure verified; final full verifier and normal product smoke pending | Pending |
| File editing, validation, accessible artifacts | Earlier `9ba53f` preflight passed; assembled-candidate repeat pending | Pending |
| Semantic question with controller restart | Passed `structured-question-restart-resume-01` on `ccae835` | Pending |
| Semantic plan acceptance | Passed `plan-approve-complete-01` on `ccae835` | Pending |
| Native reject, revise, accept | Passed `native-plan-reject-revise-accept-01` on `ccae835` | Pending |
| Native plan cancellation | First attempt failed during fixture migration/startup before Cursor ran; affected repeat pending | Pending |
| Denied write and pending-permission Stop | Pending | Pending |
| Three warm turns | Pending | Pending |
| Owned provider loss with pending permission | Passed `pending-permission-provider-loss-03` with clean retirement, stale-answer refusal, blocked open task, failed run, and no mutation | Pending |

All attempts are serial and have zero automatic retries. The original campaign
envelope has $52.919619376 remaining after its prior committed upper bound.
The existing $25 Cursor account-cycle cap is counted once; per-run USD is null.
Remote runtime estimates and reservations remain separate from missing model spend.

The seven authored Runner cases remain byte-identical to eval revision
`08ae9d4a231e52fc54af0821564cded3d3ec7f37`. A fingerprinted diagnostic
overlay binds the v11 profile and adds a closed projection of durable delivery
receipts for failure diagnosis. The strict accounting grader remains unchanged.
Successful semantic checks do not make an accounting-failure score green.

The canonical-temporary-path full local test rerun accumulated startup, filesystem,
and timing failures under host contention. It was interrupted before completion;
the partial log is retained. Earlier recursive typecheck, build, contracts/replay,
token gates, and focused runtime checks passed. Full CI and the complete acceptance
matrix are required before promotion. Cursor production admission remains disabled.
