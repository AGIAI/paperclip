# Native hiring source-read evidence carrier audit

Audit date: 2026-10-02. This is a read-only diagnosis and proposal, not a production carrier change or retrospective source-read regrade.

**TL;DR:** These records cannot establish whether reducing hiring prompts worsened source-reading behavior. Both paired profiles remain **uncomparable**: successful reads occur before hire, but source identity is lost. ACPX additionally recomputes full-result metadata from a clipped preview. That metadata defect does not establish provider-visible truncation. Fixing notification accounting does not recover missing read evidence.

Frozen candidate: `9f5404ad3aacbe76777952759414d34fd381e674`; baseline: `296a4df85e8bcc97a160fc78c291b17adb828196`. Every carrier, runtime-context, and scorer source cited below is byte-identical between these variants (`git diff --quiet` passed). No providers, unredacted private outputs, or grade changes were involved in this audit. See the [original comparison](2026-10-02-hiring-template-live-comparison.md) and the separate [executable accounting repair](https://github.com/paperclipai/paperclip/pull/15007).

## Retained public evidence

All listed successful completions precede the hired agent's durable `createdAt`. All source targets are null. Only existing sanitized public snapshots, selected metadata, lengths, hashes, and timing predicates were examined.

| Cell | Completed event sequence | Retained shape | Reported output bytes / preview UTF-8 bytes | Truncation flag | Declared digest equals preview SHA256 |
| --- | --- | --- | --- | --- | --- |
| Candidate Codex | 158 | process/execute, exit 0, 240-character name | 12529 / 4066 | true | false |
| Baseline Codex | 150 | process/execute, exit 0, 240-character name | 39766 / 4066 | true | false |
| Candidate ACPX Claude | 53, 58, 63 | builtin/read, readonly, completed | 1371/1371; 1918/1918; 794/794 | false | true |
| Baseline ACPX Claude | 54, 59, 64 | builtin/read, readonly, completed | 4110/4110 each | false | true |

All three baseline ACPX previews contain `…[truncated]`. The 4110-byte prefix and marker are a fixed point of a second clipping pass: it removes the old marker and appends the same marker, so string equality incorrectly reports no truncation. The hash describes the retained preview, not a proven complete provider result.

ACPX `Load skill` completions (candidate sequence 46, baseline 47) are builtin/execute, readonly false, 39 bytes, and share digest `sha256:bf906d9894a45eb013c78cc95ca0caa5ce06558347c3d08180e0b714865fa422`. An activation acknowledgment does not prove delivery or consumption of the SKILL.md body.

| Hiring snapshot | SHA256 |
| --- | --- |
| Candidate ACPX Claude | `4f83f523b955120c5baac18572dce752b278dbc9ff765b940c0e17c37ab28ae0` |
| Baseline ACPX Claude | `27b153798472e206970c46358febdda363cb75f892734757e76994117f0d2c9b` |
| Candidate Codex | `9609ddcb81c6bee3c5db97312138b4ea3e294da13ea540e41f363c826a514067` |
| Baseline Codex | `88b23e4d2cc8831a5d88b8479cc69c0d1c2e17a6a5243707b4bd19716a244aca` |

## Where evidence is lost

### Codex source identity

The native Rust [commandExecution normalizer](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/provider_events.rs#L876) bounds the command/name to 240 characters and sets target to null. Its [bounded output](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/provider_events.rs#L639) preserves the normalizer input's aggregate count/hash while clipping the redacted display. Neither gives per-source, path, or range attribution. A clipped compound command and aggregate exit 0 cannot reconstruct individual reads.

The [TypeScript implementation](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/provider-events.ts#L493) reads the first `commandActions` entry, but the native Rust path used in these attempts does not. These records do not establish that structured read actions were supplied.

### ACPX source identity

The sidecar [bounds runtime events before normalization](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/cli/acpx-runtime-sidecar.ts#L891), intentionally retaining only rawInput presence at lines 914–915. [Location filtering](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/cli/acpx-sidecar-locations.ts#L33) admits display paths contained in the working directory. The native [location normalizer](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/provider_events.rs#L1382) requires that workspace-relative attestation.

Assigned skills are [staged outside the working directory in isolated agent home](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/drivers/acpx/runtime-host.ts#L487). Do not loosen the workspace display guard to expose those host paths. With raw input and original locations absent, a null target cannot distinguish an omitted provider location from a filtered path. Lifecycle delta normalization cannot restore discarded inputs.

### ACPX full-result metadata

The sidecar's [safeOutput](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/cli/acpx-runtime-sidecar.ts#L1098) hashes/counts the full secret-redacted result and retains at most its last 64 KiB. Its sanitized event emits those metadata fields. Rust [decode_runtime_event](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/acpx_event_payload.rs#L546) then applies generic `sanitize_value`; [redact_text](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/durable/state.rs#L1826) imposes another roughly 4096-byte prefix cap.

The subsequent [ACPX tool normalizer](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/provider_events.rs#L1278) ignores the transmitted full-result metadata and recomputes it from the clipped output. The historical hashes therefore describe previews. The existing [bounded rich-display preservation](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/runner/crates/runner-core/src/durable/state.rs#L1668) avoids this double-cap corruption while keeping redaction; it is a useful pattern, not an existing read receipt.

### Later persistence and assigned manifests

The [coordinator store](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/server/src/services/native-runtime/native-run-coordinator-store.ts#L197), [control-plane port](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/server/src/services/native-runtime/paperclip-control-plane-port.ts#L182), and [public events route](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/server/src/routes/agents.ts#L7477) validate, persist, and redact canonical events. They cannot reconstruct already discarded identity or complete output. This is the local run-log path.

The [runtime asset manifest](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/server/src/services/native-runtime/runtime-context.ts#L93) records relative path, content hash, size, and bundle/manifest identity. The [skill materializer](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/drivers/runtime-context-materializer.ts#L205) safely publishes immutable staged trees. Those prove assignment and availability, not consumption. The [native skill command selector](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/src/drivers/acpx/native-skill-prompt.ts#L9) and activation acknowledgment likewise do not prove body delivery.

The frozen [source-read oracle](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/tests/runner-e2e/hiring-template-scoring.ts#L52) correctly rejects compound/operator-bearing commands and requires a successful nonempty read with attributable source identity before hire. Output prose, an aggregate hash, available source hashes, and activation alone cannot satisfy it.

## Smallest proposed carrier correction

First preserve truthful ACPX result metadata through a closed, byte-bounded tool-result carrier before generic diagnostic clipping. Keep the full secret-redacted result digest/count separate from the bounded redacted preview and declare the digest basis. Never recompute full-result fields from the preview. Keep existing redaction and display limits. This alone does not recover source identity.

Then consider an optional closed managed-source-read receipt at the earliest boundary with actual read input and a successful result: ACPX before rawInput discard; native Codex before command clipping. Resolve only against the assigned immutable skill registry. Bind the execution ID and canonical envelope to skill key/version, bundle/manifest digest, manifest-relative path/content hash, successful nonempty result count/digest with explicit basis, and range/completeness (`full`, `partial`, or `unknown`). Reject failed, cancelled, error, empty, help, and unknown operations.

Do not expose host paths, raw inputs, output bodies, provider sessions, or hidden reasoning. Preserve workspace-only targets, authorization, skill installation, and runtime isolation. The [closed toolExecution schema](https://github.com/paperclipai/paperclip/blob/9f5404ad3aacbe76777952759414d34fd381e674/packages/paperclip-runner/protocol/schemas/provider-event.schema.json#L45) needs explicit versioned admission; arbitrary provider passthrough is inappropriate. Manifest identity must never substitute for a completed read.

Codex structured actions can qualify only when an actual event proves supported read arguments and result attribution. An arbitrary compound shell command cannot be certified from its title or aggregate exit 0. Unsupported shapes remain uncomparable. Claude skill activation should remain a separate fact; an explicit body-delivery receipt can prove delivered bytes, not cognitive consumption.

Provider-free calibration should cover results above 4 KiB and 64 KiB; full-result/preview metadata after secret redaction; lifecycle deltas; assigned version/hash mismatches; outside, unassigned, and symlink paths; failed/empty/help reads; mixed compound commands; and activation-only acknowledgments. Historical and candidate source hashes must each match their own immutable manifests. A future versioned strict scorer may consume valid receipts while preserving original command checks. **No retrospective source-read regrade is justified: all four retained attempts remain uncomparable.**
