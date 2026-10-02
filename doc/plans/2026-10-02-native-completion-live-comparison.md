# Native completion guidance qualification — 2026-10-02

**Partial report, updated 19:34 UTC.** No completed native qualification result
is available yet. The selected scope is three native profiles, each with one
completion and one concrete blocker case: six cells per variant. Missing cells
are pending, not passing. [Draft PR #14961](https://github.com/paperclipai/paperclip/pull/14961)
remains stacked on [draft PR #14948](https://github.com/paperclipai/paperclip/pull/14948).

## Results available now

The earlier [manual/shared-prompt comparison](2026-10-02-stock-harness-live-comparison.md)
has all 48 results, including failures. Both variants pass 15 of 24 cases, with
different outcomes. Classic Claude/OpenCode document delivery fails with the
reduced instructions. That draft remains unqualified for merge. Those legacy
results do not measure this native completion-tool change.

| Native profile | Completion baseline | Completion candidate | Blocker baseline | Blocker candidate |
| --- | --- | --- | --- | --- |
| Codex | Pending | Running at `55ce97b675e1ed68cc171fe44b729147209a7e24` | Pending | Pending |
| ACPX Claude | Pending | Pending | Pending | Pending |
| OpenCode | Pending | Pending | Pending | Pending |

## Attempts and provenance

- The protected [candidate completion pilot](https://github.com/paperclipai/paperclip/actions/runs/37053897522)
  runs from the trusted default-branch workflow against immutable candidate
  `55ce97b675e1ed68cc171fe44b729147209a7e24`. It selects only native Codex's skill
  completion case. Full exact-head prerequisites precede provider admission.
- The first [historical setup](https://github.com/paperclipai/paperclip/actions/runs/37054642871)
  selected six cells at `9060f7ee4` on `codex/native-completion-previous-guidance`.
  It was cancelled before provider cells started after review identified a gap
  in the blocker grader. This partial setup remains recorded. Both variants
  will receive the same stronger visible-explanation checks before that case
  runs. The completion fixture is unchanged.
- The comparison restores only five native production sources containing tool
  descriptions and their session fingerprint. The tiny hire manual, reduced
  shared prompts, and merged Codex base fix #14920 remain constant. Twelve
  behavioral/fixture sources were byte-identical before the shared grader fix;
  all six profile/model/auth/effort fixture configurations match. Recheck those
  hashes after the fix before dispatch.
- Historical structural assertions expect the prior descriptions in actual
  authenticated/wire/provider catalogs. The historical v13 branch tests its
  prior compatibility cases; the candidate separately requires v13-to-v14
  rotation. Structural differences are not behavioral failures.

## Verification and review

At the pilot source, full repository typecheck and build pass locally. All 909
E2E support tests pass; typecheck and 27-cell discovery pass. Exact-head
credential-free prerequisites pass all 585 executed checks (584 TypeScript and
one Rust), with retained source/binary hashes and
zero provider calls. The receipt is retained under
`tests/runner-e2e/results/stock-harness-preflight-2026-10-02T19-29-43.267Z/`.

Greptile found that the blocker oracle could accept a visible marker while only
checking owner/action in backend state. The strengthened oracle now also checks
the visible owner, exact requested action, and a blocking explanation; its 12
positive/plausible-negative calibrations pass. All 913 current support tests and
E2E typecheck pass after that fix. The first added calibration caught
the marker itself matching the word "blocked"; word boundaries corrected that
grader defect. The initial failed calibration remains retained. Candidate
production instructions and independent completion graders were not changed.

Fresh CI/review for the corrected fixture and paid outcomes remain pending.
Cost is unknown until retained results arrive; no speed, spending, coding-quality,
or broad reliability improvement is claimed. Native finish/block documentation
must remain separate from legacy Paperclip skill/API completion guidance.
