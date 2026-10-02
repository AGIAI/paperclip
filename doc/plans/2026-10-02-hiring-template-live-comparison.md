# Matched hiring template qualification

TL;DR: The first paired result is **Claude Fail → Fail**, with **0 new overall machine failures, 0 new passes, 1 unchanged failure, and 1 pending Codex pair**. Both Claude variants hired/reused the coder, saved two correct independently checked JSON documents and preserved the first. The original strict five-turn assertion fails in both: each has **7 successful runs**, including 2 automatic task-completion chat wakes. Both instruction-read coverage results are **uncomparable**; this partial evidence cannot establish non-regression. Candidate coder-template content is exact; baseline content is not. PR #14985 is merged; no models have been rerun.

## Frozen comparison

| Variant | Exact measured source | Protected GitHub run | Credential-free admission |
| --- | --- | --- | --- |
| candidate | `9f5404ad3aacbe76777952759414d34fd381e674` | [workflow](https://github.com/paperclipai/paperclip/actions/runs/37075466208) | 705 assertions; zero providers; retained receipt verified |
| baseline | `296a4df85e8bcc97a160fc78c291b17adb828196` | [workflow](https://github.com/paperclipai/paperclip/actions/runs/37075469463) | 705 assertions; zero providers; retained receipt verified |

The candidate incorporates corrected hiring source `57dcee147ed0b2d2e3cc657cd9e50fb16bf9ec25` and common reduced/shared/operational-skill/native context `f46492a45354eff21b83946407f5a7642cbaa2d6`. The baseline restores the 21 production/derived files listed in [the common source contract](../../tests/runner-e2e/hiring-comparison-context.json) from `d7bdfc422cadcc407f2945e211833a8382b80117`. The baseline adds one provenance receipt. **8,242 other tracked files are byte-identical**, including fixture/oracle/admission glue, native completion guidance, tiny generic manual, shared prompts and operational skill.

The hiring fixture digest is `4d7f18420889325af89aa48eaaf021e8178aa6d26d504b92041635a15741f004`. Matched-placeholder configuration hashes prove identical models, effort, credential-binding structure, permissions, environment and initial prompt. Campaign nonces, company/agent/task IDs and rendered names vary normally. Neither frozen ref changes after dispatch.

## Results available so far

| Profile / model | Historical outcome | Reduced-template outcome | Source/read coverage | Paired conclusion |
| --- | --- | --- | --- | --- |
| Native Codex / gpt-5.6-sol | Pending | Pending | Pending | Unknown |
| Native ACPX Claude / claude-sonnet-5 | Fail: strict turn count | Fail: strict turn count | Both uncomparable; candidate exact coder body passes, baseline fails | Unchanged machine failure; core delivery succeeds both |

Each cell uses the actual production default CEO bundle with no custom manual and explicitly requests the production hiring skill and coder reference. It should create exactly one reusable coder, preserve that coder’s managed template and skill selection, produce two independently scored saved JSON documents in separate tasks, preserve the first, and report ownership/status. Expected scope is 5 turns per cell, **4 cells / 20 turns total**, 15 minutes per cell, **zero automatic retries**, with $10 company and lead monthly hard stops. Completed Claude scope is 14 actual successful runs across both variants, including four automatic completion-wake runs beyond the expected ten; these are controller wakes, not automatic attempt retries. Candidate duration is 281.627 s, baseline 292.031 s. Native usage reports zero cost, so actual model charges remain unknown; runtime is unmetered. Codex timing/cost/run count and final campaign publication remain pending.

## Original Claude failures and limits

Both original result files report `Hiring-template workflow outcome failed: five-successful-turns`; their verdicts are retained. The other six independently scored outcome checks pass in each variant: exactly one coder, correct execution account, both tasks completed by that coder, correct first and second JSON artifacts, and original document/revision preservation. The two extra lead runs in each ledger have `wakeReason: chat_task_completed`; all seven runs succeeded. This reveals a strict-count oracle limitation to diagnose separately rather than silently passing the original results.

Both variants have zero recognized pre-hire skill/read receipts, making coverage uncomparable. Served source fingerprints, actual default CEO bundle selection, assigned skill, durable saved instructions and skills all pass. The candidate’s requested coder example matches exactly; the baseline’s does not. Further retained-event inspection will distinguish redacted/unrecognized read evidence from omitted reads and explain the baseline body difference. No production cause or performance-equivalence claim is inferred from missing receipts.

The [JSON report](2026-10-02-hiring-template-live-comparison.json) records each original check, exact source/proof hashes, remote 705-assertion admission, zero-retry invocation policy, and the sanitized chronological run ledgers. It excludes raw provider session IDs, credentials and hidden reasoning. Source revisions are unchanged. Codex remains pending.

## Admission boundaries

Ordinary PR configuration tests continue to require the candidate’s one-file CEO default. The comparison alone symmetrically filters the four candidate-specific assertions below because the historical variant deliberately loads four files. Independent gates validate each variant’s actual selected files, exact production hashes and canonical derived team catalog. All other custom-bundle, generic-manual, skill/auth/permissions and native/legacy boundaries remain admitted.

- `materializes only the CEO entry file for claude_local via agents`
- `materializes only the CEO entry file for claude_local via agent-hires`
- `materializes only the CEO entry file for paperclip_runner via agents`
- `materializes only the CEO entry file for paperclip_runner via agent-hires`

The same executed historical/candidate oracle calibrations require source-derived CEO/coder content, reject fake/help/version read receipts and independently grade durable document contents and task ownership/status. Missing or redacted operational read coverage is reported as **uncomparable** even if outcomes pass. The original failures from other stock-harness comparisons are preserved; this hiring-only comparison does not regrade them or measure the earlier native fixed-prompt removal.

## Evidence

The [JSON report](2026-10-02-hiring-template-live-comparison.json) includes exact source/hash proofs, gate receipts, selected cells and limits. The [hiring PR](https://github.com/paperclipai/paperclip/pull/14985) merged at `862a5758ba0e88a33232c1f1fa645e85c38a3113`. Its green unit/CI checks do not substitute for the pending model outcomes. Further updates will retain failed/partial results and separate outcome from instruction coverage.
