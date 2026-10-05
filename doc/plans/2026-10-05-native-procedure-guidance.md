# Native hiring and dependency guidance

Status: implementation and provider-free verification in progress. Live outcome
qualification is pending. This follows the merged completion slice in #15151.

## Scope

Use master `a386a599983519eb1d399f8b770bfccdb2a74762` as the common context.
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
lead-agent hard stop per cell. All worker runs count toward the company budget.
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

## Gates

- [ ] Freeze common fixtures and both source revisions.
- [ ] Export comparable complete-payload measurements.
- [ ] Pass focused tool/session/measurement tests and eval support checks.
- [ ] Complete repository typecheck, tests and build.
- [ ] Run and inspect the bounded matched campaign.
- [ ] Verify current-head CI, review and conflicts before readiness.

No merge is authorized.
