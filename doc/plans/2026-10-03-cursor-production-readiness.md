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
