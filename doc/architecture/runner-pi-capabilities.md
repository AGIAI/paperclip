# Pi rich ACP runtime

Status: implementation candidate, 2026-09-28. Deterministic protocol tests and an
uncredentialed admission probe pass. One paid local Runner turn reached semantic
tools but timed out; Product E2E setup exposed a separate candidate-admission gap.
Local and Linux x64 Daytona qualification remain pending; this document does not promote the candidate to a
qualified production runtime.

The runner pins `pi-acp@0.0.33` and
`@earendil-works/pi-coding-agent@0.84.2`. The candidate model is
`openrouter/deepseek/deepseek-v4-flash-0731`; only an explicitly bound OpenRouter
credential may reach this profile. `patches/pi-acp@0.0.33.patch` repairs the ACP
wrapper. `pi-runtime-extension.ts` supplies the runner-owned semantic bridge and
pre-execution native tool policy. This keeps the upstream session, model,
streaming, diff, retry, and compaction implementation while making its missing
boundaries explicit.

## Capabilities and differences from Codex app-server

| Surface | Pi implementation and boundary |
| --- | --- |
| Sessions | Native Pi JSONL create/load; resume is confined to the execution's private session home and original workspace. Cold `prompt` cannot implicitly load an arbitrary session. |
| Text and reasoning | Upstream streams text and thought chunks. The common runner's private reasoning policy still applies; provider support does not authorize retention or display. |
| Native tools | `read`, `grep`, `find`, `ls`, `write`, `edit`, and `bash` pass the immutable extension gate before execution. File roots and read-only mode are checked before and after a permission wait. The host sandbox remains authoritative for shell commands and races. |
| Permissions | Native tool approval uses ACP `session/request_permission`, with allow once, allow for the session, and deny. Only offered options are accepted. Session grants cover an identical operation and still revalidate paths. Questions never become approvals. |
| Questions | Pi `select`, `confirm`, `input`, and `editor` map to ACP form elicitation with typed schemas. Decline, cancellation, timeout, malformed replies, and duplicate/late replies cannot become accepted answers. |
| Semantic tools | Runner-bound HTTP MCP catalogs (numeric loopback HTTP or assigned HTTPS gateways) register under exact `mcp__<server>__<tool>` names. Calls retain the native tool call ID and cancellation signal. Authenticated PRP tool handling owns semantic authorization and durable interactions. Only the exact session-assigned gateway URL and credential are used, with redirects disabled. Ambient and unassigned MCP servers are not admitted. |
| Plans and artifacts | Pi has no native structured plan or artifact channel. Paperclip plan and artifact semantic tools remain available through the MCP bridge; native file edits retain bounded, workspace-confined ACP diff projection. Tool text/image results are preserved, and resource blocks are recorded without following URLs. |
| Steering | Capability-negotiated `pi/steer` issues native RPC `steer` during an active turn. `pi/follow_up` explicitly queues native RPC `follow_up`. Neither is inferred from a second ACP prompt. Each takes `{sessionId, message}` and returns `{accepted: true}`. |
| Usage | Prompt results sum actual assistant message usage receipts across continuations. Input, output, cache reads/writes, total tokens and Pi-reported pricing estimates have provenance. Context-window occupancy is not billed usage. No receipt means no usage assertion; absent cache or cost fields remain unknown. Pi calculates cost from its model catalog rates, so this is not an authoritative provider bill. |
| Retry and compaction | Upstream retry/compaction notices are retained. `agent_settled`, rather than a transient `agent_end`, settles a prompt. A final provider error remains a failed prompt and does not become successful completion. |
| Images | Upstream ACP image prompt blocks are passed to native Pi RPC. Model-specific image support still requires live qualification. |
| Cancellation and death | Cancellation expires live UI waits and calls native abort. Pi process exit rejects pending RPC requests and all active/queued turns. Partial RPC frames, oversized frames, and malformed JSON fail closed. |
| Fork, durable goal, native plan | Unavailable. Do not advertise Codex parity for these features. |

`initialize` advertises `_meta.paperclipPi.version = 1`, `steering`,
`queuedFollowUp`, the four question methods, `nativePermissions`, `promptUsage`,
`nativePlan: false`, and `pendingRequestRecovery: "live-process-only"`. The common
host must inspect this advertisement before sending provider extension requests.

## Lifetime and recovery

A provider UI request is a live Pi RPC promise. Paperclip's durable interaction
can survive a control-plane connection loss while the runner, wrapper, and Pi
process remain alive. A response is forwarded once to that exact pending request.
If Pi or the wrapper dies, the interaction must expire; neither a new process nor
a loaded JSONL session has the original promise. Do not replay an approval into a
replacement process. Normal conversation continuation can load the private JSONL
session after a separately admitted restart.

The wrapper attaches a per-turn generation to settlement work, fails queued
turns on provider death, and bounds RPC request waits. This does not constitute a
claim of generic provider-process handoff or exactly-once external side effects.

## Verified launch and packaging contract

The wrapper rejects ambient launch unless `PAPERCLIP_ACPX_ISOLATED_CONTEXT=1`.
It executes an absolute bound Node executable with an absolute bound Pi CLI path,
without a shell or PATH lookup. The common command lease must supply:

- `PAPERCLIP_PI_NODE_EXECUTABLE`, `PAPERCLIP_PI_ENTRYPOINT`, and
  `PAPERCLIP_PI_EXTENSION_PATH`: files in the immutable private provider snapshot.
- `PI_CODING_AGENT_DIR`: isolated persisted session/auth/settings home.
- `PAPERCLIP_PI_READ_ONLY`: exactly `0` or `1`.
- `PAPERCLIP_PI_READ_ROOTS` and `PAPERCLIP_PI_PROTECTED_ROOTS`: JSON arrays of
  absolute allowed skill/read roots and protected runtime/config roots. Assigned
  skills must use a separate immutable lease outside the protected runtime and
  executable roots; overlapping roots fail admission. Skill roots are always
  immutable, even when nested inside a writable workspace.
- `PAPERCLIP_PI_SYSTEM_INSTRUCTIONS`: admitted instructions, bounded to 32 KiB.

The wrapper synthesizes `PAPERCLIP_PI_RUNTIME_CONFIGURATION` for its child,
including only session-bound MCP servers. The owned extension captures and deletes
this configuration environment variable before model shell execution. Credentials
remain accessible only through the deliberately admitted runtime mechanisms.

Pi starts with `--no-extensions --no-skills --no-prompt-templates --no-themes
--no-approve --offline`, followed by the explicit immutable extension and admitted
skill paths. Project trust is denied; user-bash RPC and terminal login are disabled.
Only the controlled `/compact`, `/session`, and `/autocompact` slash commands are
accepted. Startup package update checks are disabled.

The wrapper must not infer complete extension registration from process startup.
It therefore probes
`get_commands` and requires the exact readiness sentinel
`paperclip-runtime-ready-v1` / `Paperclip runtime gate v1`. The extension registers
this command only after gates and every MCP catalog finish initialization. A
missing sentinel kills the subprocess before the first model prompt.

`pi-verified-runtime.ts` inventories and checks the complete graph, including
Node, wrapper helper, extension, package metadata, native libraries, WASM and
resources. The manifest schema is `paperclip.pi-runtime-files.v1`, with relative
`node`, `piEntrypoint`, `extension`, `wrapperEntrypoint` fields and a complete
`files` array of SHA-256-bound regular files or contained relative symlinks.
Hardlinked files, escaping links, changed files, and undeclared files fail
admission. Its verifier returns the three launch environment bindings and a
manifest digest. Admission verification alone is not a command lease: the shared
host must retain its immutable snapshot and process guardian through termination.

The published Pi package has a shrinkwrap and a nested dependency graph. Provider
pack creation must copy the complete installed graph and use the same pinned Pi
family dependencies, rather than reconstructing the graph from `cli.js` imports.
The emitted owned extension must be included in every macOS arm64/x64 and Linux
x64 pack; the candidate materializer emits it at `runtime/extensions/paperclip.js`. The wrapper's `dist/paperclip-runtime.js` is
part of its verified package and must never be omitted from a copy or hash.

## Verification and maintenance

The four colocated Vitest suites exercise questions, permissions, timeouts,
framing, usage, file policies, MCP behavior, and graph verification. The Node test
`test/pi-acp-package-contract.test.mjs` launches the actual patched npm wrapper
against a deterministic RPC fixture. It proves initialization, streaming,
terminal usage, question versus permission routing, explicit steering, provider
exit, required sentinel, and typed failure settlement. It requires the exact
installed pinned package; an absent or unpatched dependency is a failure.
`PAPERCLIP_TEST_PI_ACP_PACKAGE` can select a separately installed pinned fixture.
These fixtures invoke no model or paid API.

At source `f58cfa1cbf4503b93a0be4480f51b492d8203b7c`, all 30 tests in those
four Vitest files passed, including the optional actual-distribution installation
test. The patched-wrapper, real-Pi, and distribution-builder Node suites passed
all 17 tests using the fresh provider-pack packages. TypeScript and the full
candidate pack build passed. Retry cases cover successful, failed, and missing
outcomes; the failed and missing cases were observed failing against the prior
wrapper before the repair. These focused checks do not establish a full
repository check or current-head CI pass.

`test/pi-native-package-contract.test.mjs` runs the real Pi 0.84.2 CLI without
credentials. It loads the compiled owned extension, initializes a loopback MCP
catalog, and returns the exact readiness command. An invalid catalog exits Pi
before RPC admission. This checks the extension ABI and explicit loading path. It does not prove authenticated inference, native tool
execution, MCP model invocation, credential renewal, or remote sandbox behavior.
Those remain required local and Daytona qualification evidence under the shared
live-spend cap. No live inference spend was incurred by these deterministic tests.

The helper in `patches/pi-acp@0.0.33.patch` is generated from
`src/drivers/acpx/pi-acp-runtime.ts` with Node `stripTypeScriptTypes`, trimming
trailing whitespace. The package contract checks that these bytes match. When
updating the upstream version, rebase the wrapper patch and rerun the actual
package tests; do not preserve an old qualified command hash after changing bytes.

Primary references reviewed:

- [Harness priorities report](https://pages.paperclip.ing/2026-09-25-harness-priorities/report.md)
- [pi-acp source](https://github.com/svkozak/pi-acp)
- [Pi RPC protocol](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [Pi extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [ACP protocol and SDK](https://github.com/agentclientprotocol/typescript-sdk)

## Candidate distribution build

Run `node packages/paperclip-runner/scripts/materialize-pi-distribution.mjs
/absolute/new-output` on the target build host. Supported targets are macOS arm64,
macOS x64 and Linux x64; no cross-platform qualification is inferred. The builder
uses exact official Node 24.19.0, pinned archive SHA-256 and executable SHA-256
for each target. `--node=/absolute/portable-node` reuses a matching binary; without
it the builder downloads the pinned official archive. It rejects non-system
dynamic-library dependencies and executes the copied interpreter after relocation.
The initial Homebrew Node discovery failed this portability check and is not an
admitted pack interpreter.

The isolated `scripts/pi-distribution/package-lock.json` pins all 143 dependency
packages and registry integrity, without changing the workspace pnpm graph. It
preserves Pi's upstream nested shrinkwrap, and adds npm registry SHA-512 integrity
for the six exact 0.84.2 Pi family packages whose published shrinkwrap omitted it.
Installation uses `npm ci --ignore-scripts`, public registry access, private npm
configuration and an environment without npm or provider credentials. The builder
checks every locked installed version and upstream shrinkwrap entry, applies the
owned ACP patch, verifies the helper matches its TypeScript source, and compiles
the owned extension to `runtime/extensions/paperclip.js`.

The result contains `runtime/` and a sibling `pi-distribution.json`. Keeping the
manifest outside its inventoried root avoids a self-referential file digest. The
returned environment bindings point into `runtime/`; callers must retain a verified
immutable lease on that entire root. Additional native libraries, package files,
WASM, data, and templates are all included in the inventory. Only npm-generated
`.bin` symlinks and its hidden installation lock are omitted; launch always uses
verified explicit files. The regular-file `native-closure.json` is independently
bound to a trusted per-target source constant. Its `pi-entry.cjs` bootstrap derives
snapshot-relative Node, Pi, extension and module-guard bindings; the Pi subprocess
loads the same verified module guard.

The common provider-pack integration uses an explicit `--candidate-providers=pi`
flag. It invokes exported `materializePiDistribution` into
`provider-assets/pi/<platform-arch>`, records the returned manifest digest and metadata path
in the outer pack payload, and includes the entire distribution in the outer
pack's integrity proof. The flag prepares an inspectable candidate; it must not
change its qualification status or enable admission without required live proof.
The default provider pack remains independent of this isolated graph.

On 2026-09-28 the builder completed a real public-registry installation on macOS
arm64 with official Node 24.19.0. The resulting complete distribution passed all twelve patched
wrapper and real Pi admission tests; those tests never submit a model prompt to a
provider. Five builder tests cover the full dependency lock, missing/changed
packages, missing shrinkwrap entries, resource mutation, escaping links and unsafe
output paths. Linux x64/Daytona and macOS x64 execution remain pending.

Official Node archive and executable pins are recorded in `pi-node-pins.ts`;
archive hashes were checked against the [official Node release checksums](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt).
The x64 closure pins combine the identical locked package/resource graph with each
verified official x64 interpreter. They are candidate artifact identity, not proof
that those targets have executed successfully.

### Installation authority and token semantics

`verifyPiInstallation(profile)` admits only profile version 2 and the source-owned
Pi identity. It resolves `provider-assets/pi/<platform>-<arch>` inside the verified
Runner package, checks the complete runtime against source-pinned closure hashes,
and opens a guarded immutable native snapshot. The snapshot bootstrap binds Node,
Pi, and the extension relative to itself, overriding inherited launch paths.
Unconfigured installations return an explicit bound-credential error and expose
no terminal login option. The materializer returns the runtime `version`,
`profileDigest`, and complete `closureDigest` for the provider-pack manifest.

For the exact OpenRouter qualification model, Pi AI 0.84.2's
`dist/providers/data/openrouter.json` selects `openai-completions`. Its
`dist/api/openai-completions.js` assigns `usage.output` from `completion_tokens`,
which already includes reasoning tokens; `usage.reasoning` is a subset. PRP must
therefore use zero additional thought tokens for this pinned profile, rather than
counting that subset twice. Missing cache categories remain unknown at the wrapper
receipt boundary. `usage.cost` is a Pi catalog pricing estimate, never an invoice.

The closed snapshot has been exercised against actual pinned Pi through ACP
initialization and the missing-credential admission path without a model call.
The first authenticated local Runner snapshot verified the exact configured
model ID. It did not settle or produce a terminal usage receipt; complete local
and Linux/Daytona receipt qualification remains outstanding.

Profile version 2 declaration digest: `sha256:0f687e38cb3c607a01fab80f03e19bbbf5cb53a8afb1fc40d71f9ab54551cff1`. It hashes the versioned
profile domain, patched wrapper source and platform closure pins. Every native
closure remains independently checked at launch. Version 1 warm sessions cannot
be reused with this integration.

Pi 0.84.2 emits `compaction_start`/`compaction_end`; the wrapper maps those
events, includes terminal `result.usage` receipts once, and retains bounded
summarization retry progress. Manual compaction requires an idle session and has
a 120-second RPC deadline; deadline expiry terminates Pi so a timed-out operation
cannot continue invisibly. Successful compaction reports
`assistant_message_and_compaction_receipts` provenance. Pi's summarization retry
helper discards failed-attempt usage, so any retry or missing compaction receipt
invalidates complete-turn token/cost totals instead of inventing complete coverage.

The retained [macOS ARM64 provider-pack admission proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.darwin-arm64.json)
records source `a6167ce3a7804c31f4f9990a9ba6761c1d91f27c`, after final-spawn
credential-marker preservation and direct candidate-admission gating. It includes
the Node engine, Pi v2 fixture, assigned HTTPS gateway, and failed-turn receipt
repairs. Its manifest digest is
`sha256:0ed45bf84d172aa7087baec3d662275206e8121b0ba142aaa9039dcfbf4402a2`.
This refresh also includes candidate initialization, canonical CLI paths, usage
provenance and reasoning projection repairs; the prior
[58511d79d proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.darwin-arm64.58511d79d.json)
remains a historical observation.
The clean tracked-lock resolution matched Docker's reviewed
`650e23d20e967bcfbfced888e131199b9a06e66a1ba4f64cfb68383b59def4a8` digest
before a frozen install and pack build. The probe used the deployed generic
installation registry and immutable snapshot. Every advertised capability was
read and asserted from its actual initialize response. Session creation rejected
the missing bound credential; no model prompt was submitted. The record contains
no credentials or provider session IDs and records zero paid calls. This refreshed
probe is an admission check, not an authenticated interaction test. The 128
targeted backend/environment/control-plane checks, 31 installed-distribution
checks and 17 patched-package checks remain recorded with the historical
`58511d79d` proof. The preceding full Runner suite (2,202 passed, 11 skipped) and
13 native-provider Rust tests remain pinned to source `2e65b64d5`; they are not
relabeled as checks of the latest source. Current focused validation and the
separate authenticated attempts are recorded below.

The [pre-launch-boundary proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.2e65b64d5.darwin-arm64.json)
retains source `2e65b64d5a2148583109b8157d6e72f54f5ad29b` and manifest
`sha256:7300b9c449c02b61d2f93ef765f371c277e39a58d04739c6c24dcf7939500701`,
including the full runner suite and native-provider Rust results. It predates the
final runner environment allowlist and direct candidate-admission fixes.

The [pre-policy proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.d039e1b7b.darwin-arm64.json)
retains source `d039e1b7b072862b4c326ba7194dc42617fa5984` and manifest
`sha256:5a47fc67b886c1e05d0f630ed89c1b9f5324610b649d1db020a3e036e36fc85d`,
including its cleanup-timeout retry history. It predates the Node engine metadata
and corresponding manifest/closure identities.

The [previous integrated proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.f58cfa1cb.darwin-arm64.json)
retains source `f58cfa1cbf4503b93a0be4480f51b492d8203b7c` and manifest
`sha256:3de76fb7d3902d29285e3da51e36d2ba4654c29bab0c867a6209fadea77c2181`.
It covers the retry-status repair before the HTTPS and shared runtime fixes.
The [earlier integrated proof](../../packages/paperclip-runner/test-fixtures/pi-acp/offline-provider-pack-proof.1e0d11c48.darwin-arm64.json)
retains source `1e0d11c482f8ef50b6afc1430cb736579114b266` and manifest
`sha256:f859e30e51326ff875d616e2bb3fd4c0246ce1f58a5988968b91bae176a68281`
with its narrower capability assertions. These files are historical evidence,
not proof of the current executable bytes. Later runtime or foundation changes
require a new pack build and source-pinned admission record.

## Remaining event and qualification work

The candidate preserves the core request/response paths. It does not preserve
every field in Pi's native event stream. These are explicit follow-ups:

- Retry and compaction progress currently becomes assistant text. The wrapper
  does not retain all structured `attempt`, `maxAttempts`, `delayMs`,
  `errorMessage`, `success`, `finalError`, `reason`, and `willRetry` fields. A
  follow-up should emit bounded provider notices with source-event provenance
  and test its metadata. The `auto_retry_end` display distinguishes explicit
  success, failure, and unknown outcomes. A patched-process regression covers
  each result and confirms that terminal assistant failure still fails the prompt.
- Native `queue_update` contains steering and follow-up queues. Extension calls
  acknowledge RPC acceptance, but the wrapper does not project that event into
  durable queued/delivered state. Do not treat `{accepted: true}` as proof that
  a later model turn consumed a message. Queue contents are also user content,
  so any added projection needs explicit retention rules.
- Extension `setStatus`, `setWidget`, `setTitle`, and `set_editor_text` messages
  have no Paperclip UI projection. The admitted extension does not use them.
  `notify` retains a bounded message and severity, while interactive `select`,
  `confirm`, `input`, and `editor` have the explicit response bridge. Native
  session-name and thinking-level change events also lack a separate event
  projection. The wrapper advertises ACP thinking-level configuration, but the
  current Runner host does not expose `set_mode` or `set_config_option`; no
  reasoning-level override was applied during qualification.
- File diffs are bounded text snapshots, not complete binary changes or durable
  artifact publication. Semantic artifact tools remain the supported publication
  path. Image prompting, model-triggered tools, approvals, typed questions,
  explicit steering, warm recovery, and live usage need authenticated local and
  Linux x64 Daytona proof for the exact declared model. The reported model ID
  must be checked, rather than inferred from the configuration.

## Authenticated local qualification progress

The [sanitized attempt ledger](../../packages/paperclip-runner/test-fixtures/pi-acp/paid-qualification-progress.darwin-arm64.json)
retains all seven attempts, including six failures before a model prompt. One Runner protocol turn reached the exact
model and successfully called `get_task_context`, `get_task_history`,
`list_documents`, and `read_document`. The canonical case permits those extra
orientation reads, but also requires a completed turn; it timed out after 120s
without terminal usage. No successful protocol or Product journey is claimed.

Exclusive OpenRouter key billing increased by **$0.005748807**, confirmed again
after diagnosis; all other attempts had two post-attempt observations with zero
delta. This is measured provider spend, separate from Pi's stale catalog pricing
estimate. A missing terminal receipt remains unknown, not free execution. Each
attempt had no automatic retries, a $2 reservation and a $0.50 billing watchdog;
the Product supervisor also imposed a 300s outer deadline.

The paid trace exposed a shared projection defect: canonical `item.delta` events
with `kind: reasoning` were relabeled as assistant messages by the TypeScript
facade. Shared commit `a978d1bc5` preserves summary/detail reasoning channels,
including mixed coalesced batches, so the existing private-reasoning redactor
applies. Three regressions failed before the fix; 20 focused checks, 8 additional
Codex event checks and source typecheck passed afterward. Hidden reasoning is
excluded from this report and the published ledger. The provider timeout remains
a separate unresolved result.

Product hello first failed before startup because the local PostgreSQL package's
symlink hydration had not run. Its bundled setup script repaired the installation
and a fresh database initialization passed. The deliberate repeat reached the
real browser/server, then candidate agent creation returned 422 because the
provider-profile validator still rejected candidates before the host's explicit
qualification admission boundary. Shared commit `26dde3cfe` corrected that gate. The next attempt created the agent
and task, then found a dormant Pi-only rejection in the verified runnerd backend
factory (`transportDriverIdentity`); it again submitted no model prompt and
incurred zero measured billing delta. That shared identity correction is pending.

The canonical live-eval completion contract had a separate defect: fresh sessions
omitted native `paperclip_finish`/`paperclip_block` schemas, their callback rejected
otherwise valid native reports, and ACP model instructions lacked the literal
contract revision. Shared commits `dc58afb28` and `aa4b88b16` expose and validate
those advisory reports and send the exact contract on fresh/resumed sessions.
They cannot mutate mock tasks, grant semantic permissions or settle the provider
turn early. Two declaration/acceptance regressions and one instruction-delivery
regression failed before repair; 45 live-session tests and three focused follow-up
checks passed, with source typecheck. This is a confirmed protocol defect, but
its causal contribution to the earlier model timeout is not proven.

Production admission remains qualification-pending until the live matrix and
spend receipt checks pass.
