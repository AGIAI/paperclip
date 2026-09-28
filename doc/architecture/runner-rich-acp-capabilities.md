# Rich ACP integration and qualification report

Updated: 2026-09-28. Base: `c65fc9e3c81c41aafe421aa90a00514b84343285`.
Mainline integration: `992f7202628543749236b5a59af4dbbe7c155cce`.
Status: implementation is available as four draft PRs; deterministic review and
CI verification are in progress. All three new
profiles remain **pending qualification**. Authenticated paid qualification is in
progress. Cursor and Copilot each passed the first authenticated semantic protocol case
and local Product E2E completion. Cursor also passed local file editing and validation.
The first Pi request reached real semantic tools but did not settle;
no Daytona resources have been started. This report does not certify a provider
from its ACP listing or a partial run.

The [harness priorities report](https://pages.paperclip.ing/2026-09-25-harness-priorities/)
recommends Cursor and Copilot, followed by Pi, using the existing qualified ACPX
path. Codex app-server is the richness benchmark. The legacy Cursor and Pi
adapters are outside this change.

## Branches and evidence ownership

| Branch | Deliverable |
| --- | --- |
| [`codex/runner-rich-acp` / #14430](https://github.com/paperclipai/paperclip/pull/14430) | Shared ACPX extension boundary, durable permissions, canonical display events, provider pack infrastructure, configuration and UI |
| [`codex/runner-cursor-acp` / #14435](https://github.com/paperclipai/paperclip/pull/14435) | Cursor native distribution, questions/plans, child activity, policy admission, wire fixtures |
| [`codex/runner-copilot-acp` / #14434](https://github.com/paperclipai/paperclip/pull/14434) | Copilot native distribution, event inventory/projections, permission and settlement probes |
| [`codex/runner-pi-acp` / #14436](https://github.com/paperclipai/paperclip/pull/14436) | Patched wrapper, owned extension, MCP/tools, permissions/input, portable dependency closure |

Each provider branch depends on the foundation. They remain separate worktrees
and review units. Source reports on the provider branches are
`doc/architecture/runner-cursor-capabilities.md`,
`doc/architecture/runner-copilot-capabilities.md`, and
`doc/architecture/runner-pi-capabilities.md`. Those reports retain versioned
source references, per-field dispositions, fixture paths, and narrower claims.
The Copilot inventory enumerates all 150 pinned native event types.

[Retained browser evidence](../../ui/storybook/fixtures/evidence/rich-acp-browser-proof.darwin-arm64.json)
records the production renderer's full native plan, accept/reject/cancel,
single/multiple selection, typed input and activity-details checks. Its Cursor
transport is a canonical fixture, not a paid provider session. The browser
renders a 99,724-character plan and verifies its final paragraph before approval.
The JSON records screenshot hashes; screenshots remain outside the source tree.

## Capability matrix

“Candidate” means implemented or observed in deterministic tests. It does not
mean the required paid local and Daytona product cases have passed. “Not exposed”
means the pinned interface was inspected; “unverified” is a separate finding.
Codex's row is the existing app-server integration, not the Codex ACP bridge.

| Capability | Codex app-server benchmark | Cursor ACP candidate | Copilot ACP candidate | Pi ACP candidate |
| --- | --- | --- | --- | --- |
| Exact model | Selected and reported model | Explicit ID required; exact echo, paid semantic protocol, local completion and file validation passed | Explicit ID required; exact `gpt-5.6-luna` echo, paid semantic protocol and local completion passed | Exact `openrouter/deepseek/deepseek-v4-flash-0731`; real paid response and four semantic tools observed; terminal settlement still unverified |
| Text and tools | Typed thread/turn/item events | Standard ACP updates; child activity kept separate | Standard ACP plus opt-in native session events | Wrapper text/tool updates and owned tool gates |
| Active steering | Dedicated `turn/steer` | Concurrent prompt replaces/cancels, so it is not steering | Concurrent prompt replaces/cancels, so it is not steering | Owned `pi/steer` requires handshake, exact active turn and acknowledgment |
| Queued follow-up | Product continuation controls | Controller can schedule a later prompt; native queue not established | Native pending-message activity exists; no qualified ACP queue responder | Owned `pi/follow_up`, separately named and ordered |
| Cancellation | Typed interrupt and process lifecycle | ACP cancel; paid command cleanup pending | ACP cancel; paid background settlement pending | Native abort; wrapper waits for `agent_settled` and treats provider errors as failure |
| Session continuity | Read/load/history/fork and durable identity | Session load/list observed; authenticated replay pending; fork absent in tested methods | Session load plus native history events; live recovery pending | Private Pi JSONL mapping/load; unresolved UI promises cannot survive provider death |
| Questions | Typed input requests and response correlation | `cursor/ask_question`, option identity and multiple selection preserved | Native ask-user capability exists, but pinned ACP does not wire its responder; do not display a false answerable form | `select`, `confirm`, `input`, `editor` through typed form elicitation |
| Permissions | Durable typed approvals | Standard ACP permission options; only supported decisions shown | Standard ACP; offline deny-before-marker proof; session decision scope inspected | Native pre-tool gate; allow once, exact-operation session grant, deny; paths rechecked after wait |
| Plans | Typed plan and collaboration mode | `cursor/create_plan` includes full plan and revision-bound accept/reject/cancel; todo activity separate | Native plan events displayed; native plan-decision callback not exposed in ACP | No native structured plan event; authenticated Paperclip planning tools available |
| Authenticated tools | Runner bridge and governed operations | ACP HTTP MCP binding; paid context/history reads passed | ACP HTTP MCP binding; paid context read passed | Owned extension registers exact bound MCP tools; four authenticated semantic reads succeeded in a paid partial run; no ambient servers |
| Delegation | Typed agent roles and lifecycle | Opt-in subagent lifecycle, nested ownership and bounded child activity; never parent transcript flattening | Native delegation/session events projected with role/model/agent provenance | No built-in ACP delegation protocol; arbitrary extensions are excluded |
| Files/diffs | Typed file changes and artifact references | Standard tool changes plus validated image references | File/workspace events retained; provider session files are not silently treated as task files | Native read/write/edit diffs; semantic artifact tools |
| Images/artifacts | Typed references and registered work products | Existing contained files only, provenance, `registered:false` | Contained task references only; external/session-store paths become descriptive notices | Image/resource tool blocks preserved by wrapper; dedicated artifact channel absent |
| Usage | Per-request receipt and model context | Pinned ACP omitted receipts on denied and successful turns; account UI confirms included usage separately | ACP/native tokens retained; account UI confirms included credits separately, without a per-run USD receipt | Assistant-message and compaction token receipts; dollar cost is a catalog pricing estimate, never authoritative billing |
| Config/model changes | Typed configurable controls | Known modes/model interfaces researched; runtime policy cannot be changed by a display event | Model/reasoning/mode options exist; runtime policy remains authoritative | Exact qualified model; arbitrary slash commands/config/extensions disabled |
| Reconnect/restart | Durable controller replay and qualified provider restoration | Live-process pending input only until exact restoration is proved | Same; history alone is not approval restoration | Same; wrapper explicitly advertises live-process-only pending-input recovery |

## Shared event and interaction contract

The active connection, wire session, normalized turn and original request identity
bind every extension callback. The allowlist is per provider. An omitted wire
session can only acquire the verified active connection's session; an explicit
mismatch is rejected. Retired streams and inactive turns cannot emit new activity.

Requests enter durable runtime state before the UI presents them. The response
must match an outstanding request and an offered action or valid typed answer.
The direct driver and sidecar await a receipt for the exact JSON-RPC pipe write before the runtime settles its durable record.
Standard ACP does not acknowledge application of a permission reply; a lost
transport acknowledgment is not proof of exactly-once external effects. A
replacement provider process cannot inherit an old approval promise. A bounded durable ledger expires pending requests after provider loss or unsafe restart, including requests whose creation events were already acknowledged. No tool
mutation or approval is automatically replayed into a replacement.

Full plan documents have a bounded 100,000-character description and a 196 KiB
question-set envelope. Oversized plans fail rather than approve an unseen suffix.
Display redaction remains visible. Decision descriptions render image references as
inert text and Mermaid diagrams as source, so reviewing a plan does not fetch
provider-selected media. The rich event channel has exact canonical
schemas and a bounded envelope. It cannot create terminal outcomes, dispatch a
semantic tool, register an artifact, synchronize a durable plan, or supply source
authority. Notices retain useful bounded fields and provenance in expandable UI
details. Provider references remain unregistered until a control-plane operation
registers them.

Permission labels are derived from offered option kinds. An unknown or duplicate
option is rejected. A provider's “always” decision is not relabeled “this session”
unless the pinned implementation proves that scope. Restrictive execution policy
is separate from automatic approval and company governance. Fresh permission
configuration defaults to full auto; it never overrides read-only task policy.

## Distribution and isolation

Cursor pins `2026.09.26-dd393fe`; Copilot pins `1.0.88`; Pi pins wrapper `0.0.33`,
runtime `0.84.2`, portable Node and its full npm lock. Native distribution hashes
cover macOS ARM64, macOS x64 and Linux x64. Source-owned closure pins remain
separate from profile declaration digests. Native admission reads held files,
verifies every admitted byte, creates a private immutable snapshot and retains
the existing process guardian. A manifest cannot supply its own trusted pin.

Candidate credentials are only read from explicitly bound run environments:
Cursor `CURSOR_API_KEY`/`CURSOR_AUTH_TOKEN`, Copilot `COPILOT_GITHUB_TOKEN`, Pi
`OPENROUTER_API_KEY`. Ambient GitHub login variables, provider configuration,
extensions and MCP discovery do not establish authority. Homes/config/cache are
private. Updates are disabled. Pi launches only its owned extension and assigned
skills, with a startup sentinel before a prompt can run.

Build candidate packs explicitly with `--candidate-providers=<name>` on that
provider's branch. Local and remote pack verification includes the complete
candidate asset tree. The corresponding Daytona build argument is documented in
`docker/daytona-runner/README.md`. Candidate packaging never promotes a profile.

ACP is not an OS sandbox. Cursor still reads project MCP/hooks beyond its
`--disable-project-configs` flag; the adapter rejects known ambient execution
configuration. Mutations during a run and remote team hooks still require
qualification. Pi's tool policy supplements the execution boundary; arbitrary
shell commands and filesystem races require the host boundary. These are
qualification gates, not claims that a JavaScript path check confines a shell.

## Explicit gaps and follow-ups

| Priority | Exposed but unused, partial, or unverified | Reason and next proof |
| --- | --- | --- |
| P0 | Remaining paid product cases on local and Daytona | Credentials are explicitly bound. Cursor local completion/file validation and Copilot local completion passed; question, plan, restart, remaining file and all remote cases remain open. The 30-cell Product E2E and private 21-cell Runner Eval extended suites are explicit-only. Daytona billing access is still being established. |
| P0 | Copilot native ask-user and plan-decision callbacks | Pinned ACP does not install native responders. Prove no blocking request is exposed, or add a qualified responder/wrapper; never swallow the request. |
| P0 | Copilot denial and detached background settlement | Offline deny/attached-shell tests pass only their narrow fixtures. Exercise affected native tools and detached commands against real service; failing release stays unqualified. |
| P0 | Typed Cursor entitlement failure | Exact models and successful inference are observed on the selected paid accounts. Cursor's first-account entitlement denial became ordinary text and normal completion. Preserve this failure and qualify typed failure handling; never infer a successful task from terminal status alone. |
| P0 | Cursor project and remote hooks; native shell boundaries | Configuration flags do not cover every native source. Demonstrate policy cannot be bypassed before production qualification. |
| P1 | Native Pi queue selection in the product UI | The runner API exposes negotiated `follow_up` separately from active steering. The current composer has no native queue selector; add one without confusing it with controller-scheduled later turns. |
| P1 | Native Cursor/Copilot active steering and queues | ACP prompt replacement is not steering; native SDK capabilities may be richer. Require a dedicated bound method plus acknowledgment before advertising. |
| P1 | Child tool media/diff/raw payloads | Bounded delegation summaries preserve lifecycle and identity. Large nested payloads need a child-owned canonical item model; current omission is a visible notice and provider report entry. |
| P1 | Standard ACP parent tool `content` diffs/images, secondary locations and raw input bodies | The existing common normalizer projects bounded output text, input-presence, and the first safe relative location. Raw argument bodies can contain secrets; richer content needs bounded typed blocks and a separately validated workspace binding for each file. Provider-specific image/file notices do not close this standard-tool gap. |
| P1 | Copilot session-store files and export/artifact URIs | Provider paths are not task-workspace paths. Add a separately authorized export flow with validated bytes and provenance; do not resolve arbitrary URLs or auto-register. |
| P1 | Complete usage/billing provenance | Missing cache fields remain unknown. Pi price estimates are displayed separately. Budget qualification requires actual spend coverage, not an estimate presented as a bill. |
| P1 | Fork/history/model/mode controls not exposed by Paperclip | Research documents the native and ACP methods separately. Add governance-aware controls and durable lineage before enabling them. |
| P1 | Exact pending-request restoration after process death | Session transcript restoration does not restore callbacks. Expire unresolved requests unless a provider proves exact restoration. |
| P2 | Remaining Copilot native diagnostic/config/account events | The provider inventory records every event and field, its projection or reason for omission. Preserve bounded useful context; avoid credentials, raw environment or unbounded blobs. |
| P2 | Pi native extension surfaces and unsupported slash commands | Arbitrary extensions/templates/themes may execute ambient code. Only reviewed runner-owned capabilities are admitted; native plan/fork/goals are not fabricated. |
| P2 | Conditional native-plan follow-up fields | Cursor's optional rejection-reason field also appears for accept/cancel. The current question renderer has no conditional fields; add conditional presentation without changing the revision-bound decision receipt. |
| P2 | Cursor command exit code projection | The paid file case preserved native `exitCode: 0` inside output text, while the canonical command field remained null. Normalize a typed, correlated exit code without parsing arbitrary prose; current independent file assertions do not prove this field. |

## Qualification ledger

Combined ceiling: **$100**, including retries and infrastructure. Cursor allocation:
$25; Copilot: $25; Pi: $25; coordinated diagnosis reserve: $25.
Initial reservations are $2 per provider. Measured OpenRouter key-usage delta for
the first model-backed Pi attempt: **$0.005748807**. Cursor's first account was
not entitled; its dashboard was unchanged at the displayed precision, with no
per-request receipt. Copilot's first session-start failure left its dashboard at
0/1,500 included AI credits and $0 incremental charges. After its protocol and
Product completion tests, GitHub displayed 1/1,500 included credits with additional
usage still disabled. The selected Cursor account displayed 181.8K included tokens
across its three qualification requests and zero on-demand tokens. These measurements are
partial, not a final all-provider total. No Daytona leases have been started.
Registry downloads, fake-model fixtures and metadata-only authenticated discovery
are separate from model inference.

The first Pi canonical `get-task-context` attempt used source `788105248a3ba594b30b5bcec3fa266d8a51d8d4`
and provider-pack digest `sha256:4de47c31a8131424495366741bd491ff5fa10723ab9a3918c07a3e42982dbe3c`.
It observed successful `get_task_context`, `get_task_history`, `list_documents`
and `read_document` calls, then hit its 120-second turn deadline without a
terminal receipt. This is a retained failed attempt, not semantic qualification.
Earlier launch/interpreter failures are retained separately. The initial Cursor
failure exposed a native wrapper gap: a typed entitlement error becomes an
ordinary message and normal completion. The runner does not infer authorization
from that message or fabricate a zero-cost usage receipt.

The selected paid Cursor account passed canonical `get-task-context` at source
`01959b8a602683f13706807983f02c3cba9d36a0`, pack
`sha256:f0b622e9151c1c0886e6220c48ea71993b65887baa88b1600b27462074748ddb`,
using exact `gpt-5.6-luna[context=272k,reasoning=medium,fast=false]`.
Its context/history reads and all four semantic checks passed in 29.291 seconds.
The account usage row attributes 56K tokens to this run, included in its existing
Pro+ subscription; incremental cash is zero. ACP supplied no token or USD receipt.
A conservative list-price bound of $0.07 is an estimate, not an invoice.

Copilot's first real completed attempt used source `92fcaf0c`, the same immutable
runnerd SHA-256 `986060810ba7377c6ddd64a5d89e322d0a434e1a9c80400e6d4acf5934bfc421`,
and exact `gpt-5.6-luna`. One context read and all four canonical semantic checks
passed. The original post-run package/provenance failure is retained; offline
scoring recovered the same artifact with zero additional provider calls. Its
24,258 input, 11,781 cached-input and 441 output tokens yield a $0.00326022 catalog
estimate. GitHub still displayed 0/1,500 included credits and additional billing
disabled with a $0 budget after the run. UI delay/rounding leaves the exact credit
delta unverified; this is not a provider USD receipt. Neither protocol case proves
Product E2E, restrictive permissions, restart recovery, or Daytona qualification.

Separate paid Product E2E evidence now records:

| Provider / local case | Exact source revision | Observed result |
| --- | --- | --- |
| Cursor / completion | `edf538e61e712dddb6b4d59045c3dcfd445686c7` | 6/6 assertions; committed finalization, one completion marker, cleanup passed |
| Cursor / file edit and validation | `fe132224c2b30a8d9ce7b46cea38b8760af233fc` | 7/7 assertions; independent final file bytes, visible downloadable workspace artifact, cleanup passed |
| Copilot / completion | `bcc9c638a25b91b84065f12633f083bd4f7a689f` | 6/6 assertions and cleanup passed; original accounting projection failed independently |

The Cursor file case proves the workspace artifact surface, not complete native
file/diff projection. The Copilot result incorrectly projected missing native cost
as USD zero and attributed its biller to OpenAI. The original result is retained;
the shared fix identifies GitHub, Cursor and OpenRouter correctly and keeps absent
candidate USD receipts unpriced. Fresh paid evidence is required to verify that fix.
Protocol evals now fail their cost gate when spend is unknown, preserving completed
behavior and semantic evidence in a separate accounting-failure result. The
maintained campaign stops subsequent cells on unknown accounting and never turns
an unavailable receipt into a zero-dollar measurement.

Initial Product attempts exposed local PostgreSQL postinstall hydration and a
server candidate-admission gap before any model prompt. Both failed attempts are
retained. The package's own hydration repairs local installation; exact host
qualification now applies consistently at agent creation, runtime selection,
native input and process construction. Agent configuration cannot grant itself
qualification authority. The obsolete unconditional Pi executor rejection is
replaced by the same closed host authorization. Candidate active turns are bounded
to 120 seconds and automatic infrastructure retries remain disabled.

The maintained Product E2E `extended-harnesses` suite covers local and Daytona
completion, question/answer, semantic plan approval, pending-input restart and
file edit/validation. It has no automatic retries and does not enable candidates
outside exact operator-authorized provider/model pairs. The private Runner Eval
campaign is complementary: seven semantic protocol cases per provider. Neither
suite's membership is a qualification claim.

Before each paid batch, record source SHA, executable and closure/profile digests,
exact model, OS/architecture or Daytona image, selected cases, prior spend,
maximum batch spend and authoritative billing coverage. Stop before the shared
ceiling. Missing spend coverage blocks a run rather than treating unknown cost as
zero. Retain screenshots and wire evidence without credentials. Never convert a
provider to supported solely because a test suite or packaging check passed.

Verification commands and final results are recorded with the prerequisite and
provider PRs. The full handoff requires runner checks, token gates, recursive
typecheck, `pnpm test:run`, and `pnpm build`. Until that evidence is recorded, this
report is an implementation report rather than a PR-ready certification.

At foundation `5aeebb20c`, recursive typecheck, build, token gates, full Rust runner
checks, conformance/replay parity and API-authority checks passed. Approval
verification includes 18 real database integration tests, 15 projector cases,
87 transcript/UI cases, 82 route/websocket cases and eight provider receipt cases.
The local full root test attempt initially failed because embedded Postgres's
install-time library links were missing. Its official package postinstall restored
them; all 38 affected suites (743 tests) then passed. An unchanged workspace
streaming stress test exceeds macOS path limits (`ENAMETOOLONG`); Linux CI retains
the original case. The full runner TypeScript repeat passed 2,164 tests in 156 files, with ten
skipped tests. The full UI and CLI suites passed 6,772 and 502 tests. Remaining
source workspace checks passed 2,882 tests; two macOS path-alias fixture failures
were corrected with an explicit injection assertion (all 89 sandbox tests pass),
and a database timeout passed in an isolated repeat. Failed attempts and the
latest CI state remain recorded in the PR. The decision-media review fix passes
87 focused tests, UI typecheck, token gates and the UI build.

Initial macOS ARM64 candidate packs were independently built and launched through
the generic installation registry: Cursor source `1055c13f8`, Copilot `5d8829add`,
Pi `f58cfa1cb`. Review fixes that change execution bytes require fresh packs and
launch proofs; the latest source SHA, manifest/profile/closure digests and
sanitized wire evidence are retained in each provider PR. Earlier proofs retain
their original source identity. These probes send no model prompt.
