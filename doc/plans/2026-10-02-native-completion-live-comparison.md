# Native completion guidance qualification — 2026-10-02

**TL;DR: zero newly failing cases, zero newly passing cases, three unchanged completion passes and three unchanged blocker failures in six paired cases.** All 12 results are available; none are pending. Claude/OpenCode blocker failures come from a shared marker-only browser grader defect. Codex has the same additional exact-action punctuation mismatch in both variants. This measures added/shared native finish/block descriptions, not removal of native fixed prompts. The grading defects and single trials limit non-regression claims.

Draft [PR #14961](https://github.com/paperclipai/paperclip/pull/14961) remains stacked on draft [PR #14948](https://github.com/paperclipai/paperclip/pull/14948). Original machine verdicts and failure classifications are preserved in the [safe evidence projection](2026-10-02-native-completion-live-comparison.json).

| Native profile | Completion baseline → candidate | Original blocker baseline → candidate | Separate retained-evidence assessment |
| --- | --- | --- | --- |
| Codex | Pass → Pass | Fail → Fail | Visible reply passes corrected UI check in both; exact stored action adds a period in both and remains a strict failure. |
| ACPX Claude | Pass → Pass | Fail → Fail | All 14 original API matchers pass in both; corrected retained-DOM check passes in both. Original failures are UI grader defects. |
| OpenCode | Pass → Pass | Fail → Fail | All 14 original API matchers pass in both; corrected retained-DOM check passes in both. Original failures are UI grader defects. |

## Sources and public reports

- [Candidate Codex completion pilot](https://github.com/paperclipai/paperclip/actions/runs/37053897522), source `55ce97b675e1ed68cc171fe44b729147209a7e24`: one selected cell passes all seven task/skill checks, saves one public document, passes 585 exact-head prerequisites and cleanup. [Published pilot report](https://d1p6rlowie26tp.cloudfront.net/runner-e2e/campaigns/gha-37053897522-1/index.html).
- [Remaining candidate campaign](https://github.com/paperclipai/paperclip/actions/runs/37055582470), frozen source `ae34843731ac338bd806a4106cb447134bff402c`: two completion passes and three blocker failures. Every cell passes 589 exact-head prerequisites before provider access. [Published candidate report](https://d1p6rlowie26tp.cloudfront.net/runner-e2e/campaigns/gha-37055582470-1/index.html).
- [Matched historical campaign](https://github.com/paperclipai/paperclip/actions/runs/37055273989), source `8792aed8ac8e9d004406afcb4b9a4ffddccd72c8`: three completion passes and three blocker failures. Every cell passes 588 exact-head prerequisites, including prior v13 compatibility rather than candidate v13-to-v14 rotation. [Published baseline report](https://d1p6rlowie26tp.cloudfront.net/runner-e2e/campaigns/gha-37055273989-1/index.html).
- All publishers completed successfully, including failed-campaign publication. Each public dashboard describes its selected scope; none alone represents the full catalog. The combined comparison has all six intended cells per variant.
- The comparison restores only five native production sources containing tool descriptions and the session fingerprint. The tiny manual/shared prompts and merged Codex base fix #14920 remain constant. Twelve behavioral/fixture sources and all six model/effort/auth/permission/environment configurations match. Production and the completion fixture are unchanged between the two candidate revisions.
- The earlier [cancelled historical setup](https://github.com/paperclipai/paperclip/actions/runs/37054642871) at `9060f7ee4` stopped before any provider cell after review found an inadequate visible-text oracle. The strengthened API/visible oracle was then applied symmetrically before the measured campaigns. All original attempts remain retained.

## Grader correction and retained regrading

The blocker request requires a final explanation naming the owner and action. The generic browser assertion instead required the agent reply to contain only the marker, so every correct explanation failed that assertion. The separate API oracle already confirmed blocked issue state, succeeded native run, task-wide scope, owner, requested action, and visible explanation. It passes all 14 checks for Claude/OpenCode; Codex fails only the exact stored action check in each variant.

The corrected browser helper requires exactly one visible marker-containing reply with the owner, action and blocking reason. Ten credential-free browser calibrations and 919 E2E support tests pass. Calibrations reject marker-only, missing fields, contradictory/resolved claims and duplicate replies, while accepting a future access condition. An initial future-condition calibration exposed an overly broad denial rule; the corrected rule distinguishes "already granted" from "blocked until access is granted". Initial failures are retained. E2E typecheck passes.

A separate zero-provider analytical replay reconstructs only the final agent reply DOM from each original Playwright trace, preserving trace/result/DOM hashes. All six retained replies pass the corrected text assertion. All six original failure screenshots were inspected separately and show a visible blocked explanation with owner/action. This assessment does not replace original live results or claim that the new UI path ran in a fresh full-stack execution.

Both Codex replies store `Grant deployment access.` rather than the strict expected `Grant deployment access`. The original fixture ends that requested phrase with a period, making punctuation ambiguous. Both exact-action failures remain failed. Future fixture wording quotes the phrase and explicitly excludes trailing punctuation; the expected action and plausible-negative punctuation calibration stay strict. No extra native provider run was launched to improve the report.

## Timing, cost and limitations

| Profile | Journey | Baseline provider seconds | Candidate provider seconds |
| --- | --- | ---: | ---: |
| runner-codex | Completion | 30.332 | 25.483 |
| runner-codex | Blocker | 16.644 | 16.475 |
| runner-acpx-claude | Completion | 30.896 | 25.013 |
| runner-acpx-claude | Blocker | 29.743 | 26.599 |
| runner-opencode | Completion | 66.281 | 44.963 |
| runner-opencode | Blocker | 23.477 | 44.633 |

Each variant records six runs with token usage and reported cost on all six. Reported totals are $0.0048606430 baseline and $0.0043827850 candidate, principally OpenCode; Codex/Claude reported zeros have unknown actual billing. Local runtime is unmetered. All 12 retained cells cleaned up successfully. Browser-defect waits inflate cell durations, and one trial per cell cannot establish a timing or spending improvement.

The earlier [legacy prompt-removal comparison](2026-10-02-stock-harness-live-comparison.md) has two observed new document-delivery failures and two OpenCode ordered-case improvements; equal aggregate totals do not show equivalence. Its approved skill repair is measured separately in a narrow follow-up. Native finish/block documentation remains separate from legacy skill/API completion guidance. Both PRs remain draft, with user-controlled merging.
