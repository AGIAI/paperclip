# Matched hiring template qualification

TL;DR: **No new overall machine failures were observed in the two paired cases: Codex Fail → Fail and Claude Fail → Fail. There are 0 new passes, 2 unchanged failures, 0 pending pairs, and 2 uncomparable pairs.** All four cells hired/reused one coder, saved two correct independently checked JSON documents, and preserved the first. The same strict five-turn assertion fails all four because each has **7 successful runs**, including 2 automatic task-completion chat wakes. Instruction-read coverage remains **uncomparable**, so this trial cannot establish non-regression. Original grades are preserved; no models have been rerun.

## Frozen comparison

| Variant | Exact measured source | Protected GitHub run | Credential-free admission |
| --- | --- | --- | --- |
| candidate | `9f5404ad3aacbe76777952759414d34fd381e674` | [workflow](https://github.com/paperclipai/paperclip/actions/runs/37075466208) | 705 assertions; zero providers; retained receipt verified |
| baseline | `296a4df85e8bcc97a160fc78c291b17adb828196` | [workflow](https://github.com/paperclipai/paperclip/actions/runs/37075469463) | 705 assertions; zero providers; retained receipt verified |

The candidate incorporates corrected hiring source `57dcee147ed0b2d2e3cc657cd9e50fb16bf9ec25` and common reduced/shared/operational-skill/native context `f46492a45354eff21b83946407f5a7642cbaa2d6`. The baseline restores the 21 production/derived files listed in [the common source contract](../../tests/runner-e2e/hiring-comparison-context.json) from `d7bdfc422cadcc407f2945e211833a8382b80117`. The baseline adds one provenance receipt. **8,242 other tracked files are byte-identical**, including fixture/oracle/admission glue, native completion guidance, tiny generic manual, shared prompts and operational skill.

The hiring fixture digest is `4d7f18420889325af89aa48eaaf021e8178aa6d26d504b92041635a15741f004`. Matched-placeholder configuration hashes prove identical models, effort, credential-binding structure, permissions, environment and initial prompt. Campaign nonces, company/agent/task IDs and rendered names vary normally. Neither frozen ref changes after dispatch.

## Complete original results

| Profile / model | Historical outcome | Reduced-template outcome | Source/read coverage | Paired conclusion |
| --- | --- | --- | --- | --- |
| Native Codex / gpt-5.6-sol | Fail: strict turn count | Fail: strict turn count | Both uncomparable; exact coder body passes both | Unchanged machine failure; six core delivery checks pass both |
| Native ACPX Claude / claude-sonnet-5 | Fail: strict turn count | Fail: strict turn count | Both uncomparable; candidate exact coder body passes, baseline fails | Unchanged machine failure; six core delivery checks pass both |

Each cell uses the actual production default CEO bundle with no custom manual and explicitly requests the production hiring skill and coder reference. It creates exactly one reusable coder, preserves that coder's managed account and skill selection, produces two independently scored saved JSON documents in separate tasks, and preserves the first document/revision. All six of these independent outcome checks pass in all four cells.

| Profile | Historical duration | Reduced duration | Actual runs per variant | Cleanup |
| --- | --- | --- | --- | --- |
| Codex | 311.133 s | 360.588 s | 7 (including 2 completion wakes) | Both passed |
| ACPX Claude | 292.031 s | 281.627 s | 7 (including 2 completion wakes) | Both passed |

The selected scope was 4 cells / 20 expected work turns, 15 minutes per cell, zero automatic retries, with $10 company and lead monthly hard stops. Actual scope was **28 successful model runs**, including **8 automatic completion wakes**. Those controller wakes are counted in usage; they are not attempt retries or additional selected cells. Candidate Codex is 49.455 s slower and candidate Claude 10.404 s faster in these single trials. Native usage reports zero cost, so **actual model charges remain unknown**; runtime is unmetered. No general speed or cost conclusion follows.

## Original failures and retained-read diagnosis

All four original result files report `Hiring-template workflow outcome failed: five-successful-turns`; their machine failures remain unchanged. Exactly five requested work turns are accompanied by two automatic lead runs with `wakeReason: chat_task_completed`. All seven succeed in each cell. A separately versioned, provider-free assessment will strictly validate notification attribution rather than silently passing or ignoring the extras. It will not loosen source-read coverage.

All four cells have zero recognized pre-hire skill/read receipts, making coverage uncomparable. Source fingerprints, actual production CEO bundle selection, assigned hiring skill, saved instructions and saved skills pass. Candidate coder content matches its source exactly in both profiles; historical Codex also matches. Historical Claude removes only six backticks wrapping three existing Markdown links in the saved coder body (3,990 expected versus 3,984 saved bytes). The role/policy text is otherwise identical. Its exact-body coverage failure is retained; this punctuation change does not establish a task-quality improvement.

Retained Claude events in both variants show stock **Load skill** followed by three completed **Read File** calls before hire. The canonical records have null path targets, so the existing path-based oracle cannot recognize them. The current event helper already unwraps the payload; no envelope parsing bug was found. Candidate line-numbered output can be normalized to the full current guide/checklist/coder source bytes. Historical preview output matches old source prefixes but is clipped around 4 KB with a truncation marker; that does not establish that the model received only the preview. The Load skill acknowledgment does not prove full skill-body consumption. **Coverage stays uncomparable.** Codex read-path diagnosis and strict lifecycle accounting are separate pending analytical work; there are no pending model results.

The [JSON report](2026-10-02-hiring-template-live-comparison.json) records every original check, exact source/proof hashes, remote 705-assertion admission, zero-retry invocation policy, and sanitized chronological run ledgers. It excludes raw provider session IDs, credentials and hidden reasoning. The frozen measured revisions are unchanged.

## Admission boundaries

Ordinary PR configuration tests continue to require the candidate’s one-file CEO default. The comparison alone symmetrically filters the four candidate-specific assertions below because the historical variant deliberately loads four files. Independent gates validate each variant’s actual selected files, exact production hashes and canonical derived team catalog. All other custom-bundle, generic-manual, skill/auth/permissions and native/legacy boundaries remain admitted.

- `materializes only the CEO entry file for claude_local via agents`
- `materializes only the CEO entry file for claude_local via agent-hires`
- `materializes only the CEO entry file for paperclip_runner via agents`
- `materializes only the CEO entry file for paperclip_runner via agent-hires`

The same executed historical/candidate oracle calibrations require source-derived CEO/coder content, reject fake/help/version read receipts and independently grade durable document contents and task ownership/status. Missing or redacted operational read coverage is reported as **uncomparable** even if outcomes pass. The original failures from other stock-harness comparisons are preserved; this hiring-only comparison does not regrade them or measure the earlier native fixed-prompt removal.

## Evidence

The [JSON report](2026-10-02-hiring-template-live-comparison.json) includes exact source/hash proofs, gate receipts, selected cells and limits. The [hiring PR](https://github.com/paperclipai/paperclip/pull/14985) merged at `862a5758ba0e88a33232c1f1fa645e85c38a3113`. Its green unit/CI checks do not substitute for comparable model evidence. All four original model results are retained; further analytical updates preserve their failures and separate outcome from instruction coverage.
