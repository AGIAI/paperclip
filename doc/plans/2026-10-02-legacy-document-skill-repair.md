# Legacy document skill repair qualification — 2026-10-02

**TL;DR: no repair performance result yet.** All four paired cases are pending. The original prompt-removal comparison observed two new classic Claude/OpenCode document-delivery failures; its retained verdicts remain unchanged. This focused comparison measures a small operational-skill repair while holding the tiny manual/shared prompts fixed, rather than remeasuring the combined instruction removal.

The approved repair adds early API-runtime document PUT/receipt/link guidance and a short generic issue-document reference. A valid saved-revision write receipt is sufficient; GET is used for existing-document updates or unclear/conflicting receipts. Explicit destinations, downloadable files, and native document-tool boundaries remain intact. The default manual stays eight words.

| Classic profile | Case | Pre-fix skill | Repaired skill |
| --- | --- | --- | --- |
| Claude | Original assigned skill | Pending | Pending |
| Claude | Explicit Paperclip document | Pending | Pending |
| OpenCode | Original assigned skill | Pending | Pending |
| OpenCode | Explicit Paperclip document | Pending | Pending |

The two variants select these four cells only, eight expected provider turns total. All model, effort, auth, tool, permission, budget, fixture and behavioral-grader sources match; only `skills/paperclip/SKILL.md` and the presence of `skills/paperclip/references/issue-documents.md` differ. The absent historical reference is explicitly fingerprinted as absent; its new content is not copied into the baseline.

The original request and pinned output procedure are preserved verbatim. The added explicit case independently reads the public task document and its saved revision/content and requires an agent comment linking the exact same-app document. Correct relative and same-app absolute URLs pass. Workspace-only output, missing revisions, wrong content, wrong document keys, other-origin URLs and user-only links fail calibration.

Local preparation: 909 E2E support tests and E2E typecheck pass; the narrow selector discovers exactly these four cells. Initial sandbox listener failures and two obsolete catalog-count assertions are retained separately; the unchanged behavioral oracles were not weakened. Exact-head prerequisites, immutable source freeze and protected GitHub dispatch are next. Actual costs and outcome deltas remain unknown until retained results are inspected. Existing Claude chat-memory and legacy ACP credential/receipt failures remain separate unresolved findings.
