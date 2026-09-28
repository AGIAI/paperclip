# Rich ACP integration and qualification report

Updated: 2026-09-28. Base: `c65fc9e3c81c41aafe421aa90a00514b84343285`.
Mainline integration: `14795136f56c11ed83dc754791945bb5a0b8f7fd`.
Status: implementation and deterministic verification in progress; all three new
profiles remain **pending qualification**. No paid inference or Daytona resources
have been used. This report does not certify a provider from its ACP listing.

The [harness priorities report](https://pages.paperclip.ing/2026-09-25-harness-priorities/)
recommends Cursor and Copilot, followed by Pi, using the existing qualified ACPX
path. Codex app-server is the richness benchmark. The legacy Cursor and Pi
adapters are outside this change.

## Branches and evidence ownership

| Branch | Deliverable |
| --- | --- |
| `codex/runner-rich-acp` | Shared ACPX extension boundary, durable permissions, canonical display events, provider pack infrastructure, configuration and UI |
| `codex/runner-cursor-acp` | Cursor native distribution, questions/plans, child activity, policy admission, wire fixtures |
| `codex/runner-copilot-acp` | Copilot native distribution, event inventory/projections, permission and settlement probes |
| `codex/runner-pi-acp` | Patched wrapper, owned extension, MCP/tools, permissions/input, portable dependency closure |

Each provider branch depends on the foundation. They remain separate worktrees
and review units. Source reports on the provider branches are
`doc/architecture/runner-cursor-capabilities.md`,
`doc/architecture/runner-copilot-capabilities.md`, and
`doc/architecture/runner-pi-capabilities.md`. Those reports retain versioned
source references, per-field dispositions, fixture paths, and narrower claims.
The Copilot inventory enumerates all 150 pinned native event types.

## Capability matrix

“Candidate” means implemented or observed in deterministic tests. It does not
mean the required paid local and Daytona product cases have passed. “Not exposed”
means the pinned interface was inspected; “unverified” is a separate finding.
Codex's row is the existing app-server integration, not the Codex ACP bridge.

| Capability | Codex app-server benchmark | Cursor ACP candidate | Copilot ACP candidate | Pi ACP candidate |
| --- | --- | --- | --- | --- |
| Exact model | Selected and reported model | Explicit ID required; authenticated discovery unverified | Explicit ID required; offline ACP status omits model metadata; admission fails if exact model cannot be proved | Exact `openrouter/deepseek/deepseek-v4-flash-0731`; paid model response unverified |
| Text and tools | Typed thread/turn/item events | Standard ACP updates; child activity kept separate | Standard ACP plus opt-in native session events | Wrapper text/tool updates and owned tool gates |
| Active steering | Dedicated `turn/steer` | Concurrent prompt replaces/cancels, so it is not steering | Concurrent prompt replaces/cancels, so it is not steering | Owned `pi/steer` requires handshake, exact active turn and acknowledgment |
| Queued follow-up | Product continuation controls | Controller can schedule a later prompt; native queue not established | Native pending-message activity exists; no qualified ACP queue responder | Owned `pi/follow_up`, separately named and ordered |
| Cancellation | Typed interrupt and process lifecycle | ACP cancel; paid command cleanup pending | ACP cancel; paid background settlement pending | Native abort; wrapper waits for `agent_settled` and treats provider errors as failure |
| Session continuity | Read/load/history/fork and durable identity | Session load/list observed; authenticated replay pending; fork absent in tested methods | Session load plus native history events; live recovery pending | Private Pi JSONL mapping/load; unresolved UI promises cannot survive provider death |
| Questions | Typed input requests and response correlation | `cursor/ask_question`, option identity and multiple selection preserved | Native ask-user capability exists, but pinned ACP does not wire its responder; do not display a false answerable form | `select`, `confirm`, `input`, `editor` through typed form elicitation |
| Permissions | Durable typed approvals | Standard ACP permission options; only supported decisions shown | Standard ACP; offline deny-before-marker proof; session decision scope inspected | Native pre-tool gate; allow once, exact-operation session grant, deny; paths rechecked after wait |
| Plans | Typed plan and collaboration mode | `cursor/create_plan` includes full plan and revision-bound accept/reject/cancel; todo activity separate | Native plan events displayed; native plan-decision callback not exposed in ACP | No native structured plan event; authenticated Paperclip planning tools available |
| Authenticated tools | Runner bridge and governed operations | ACP HTTP MCP binding; paid semantic cases pending | ACP HTTP MCP binding; paid semantic cases pending | Owned extension registers exact bound MCP tools; no ambient servers |
| Delegation | Typed agent roles and lifecycle | Opt-in subagent lifecycle, nested ownership and bounded child activity; never parent transcript flattening | Native delegation/session events projected with role/model/agent provenance | No built-in ACP delegation protocol; arbitrary extensions are excluded |
| Files/diffs | Typed file changes and artifact references | Standard tool changes plus validated image references | File/workspace events retained; provider session files are not silently treated as task files | Native read/write/edit diffs; semantic artifact tools |
| Images/artifacts | Typed references and registered work products | Existing contained files only, provenance, `registered:false` | Contained task references only; external/session-store paths become descriptive notices | Image/resource tool blocks preserved by wrapper; dedicated artifact channel absent |
| Usage | Per-request receipt and model context | Native usage completeness unverified | ACP/native usage retained without inventing a billing charge | Assistant-message and compaction token receipts; dollar cost is a catalog pricing estimate, never authoritative billing |
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
Display redaction remains visible. The rich event channel has exact canonical
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
| P0 | All paid product cases on local and Daytona | Bound provider/Daytona credentials and independently inspectable spend are absent. Prove setup, semantic tools, edit+validation, inputs, cancellation, warm continuation and restart. |
| P0 | Copilot native ask-user and plan-decision callbacks | Pinned ACP does not install native responders. Prove no blocking request is exposed, or add a qualified responder/wrapper; never swallow the request. |
| P0 | Copilot denial and detached background settlement | Offline deny/attached-shell tests pass only their narrow fixtures. Exercise affected native tools and detached commands against real service; failing release stays unqualified. |
| P0 | Exact Cursor/Copilot model reporting | Authentication/entitlement required; no guessed default and no fallback. Fail admission when effective model is unverified. |
| P0 | Cursor project and remote hooks; native shell boundaries | Configuration flags do not cover every native source. Demonstrate policy cannot be bypassed before production qualification. |
| P1 | Native Pi queue selection in the product UI | The runner API exposes negotiated `follow_up` separately from active steering. The current composer has no native queue selector; add one without confusing it with controller-scheduled later turns. |
| P1 | Native Cursor/Copilot active steering and queues | ACP prompt replacement is not steering; native SDK capabilities may be richer. Require a dedicated bound method plus acknowledgment before advertising. |
| P1 | Child tool media/diff/raw payloads | Bounded delegation summaries preserve lifecycle and identity. Large nested payloads need a child-owned canonical item model; current omission is a visible notice and provider report entry. |
| P1 | Copilot session-store files and export/artifact URIs | Provider paths are not task-workspace paths. Add a separately authorized export flow with validated bytes and provenance; do not resolve arbitrary URLs or auto-register. |
| P1 | Complete usage/billing provenance | Missing cache fields remain unknown. Pi price estimates are displayed separately. Budget qualification requires actual spend coverage, not an estimate presented as a bill. |
| P1 | Fork/history/model/mode controls not exposed by Paperclip | Research documents the native and ACP methods separately. Add governance-aware controls and durable lineage before enabling them. |
| P1 | Exact pending-request restoration after process death | Session transcript restoration does not restore callbacks. Expire unresolved requests unless a provider proves exact restoration. |
| P2 | Remaining Copilot native diagnostic/config/account events | The provider inventory records every event and field, its projection or reason for omission. Preserve bounded useful context; avoid credentials, raw environment or unbounded blobs. |
| P2 | Pi native extension surfaces and unsupported slash commands | Arbitrary extensions/templates/themes may execute ambient code. Only reviewed runner-owned capabilities are admitted; native plan/fork/goals are not fabricated. |

## Qualification ledger

Combined ceiling: **$100**, including retries and infrastructure. Cursor allocation:
$25; Copilot: $25; Pi: $25; coordinated diagnosis reserve: $25. Used: **$0**.
No model requests or Daytona leases have been started. Registry/binary downloads,
loopback fake-model tests and uncredentialed initialization are deterministic
engineering evidence, not paid qualification.

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
