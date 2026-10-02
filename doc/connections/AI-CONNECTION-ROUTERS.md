# Experimental AI connection routers

AI routers are virtual, company-scoped connections owned by a capability-gated
plugin (`ai.connections.route`). The instance flag `enableAiConnectionRouters`
defaults to false. Pools also default to disabled. The host must implement this
contract; the plugin's minimum version alone does not establish compatibility.

The host authorizes members using the ordinary company, user, sharing, install,
health and harness checks. It sends authorized metadata and sanitized usage
observations to `onRouteAiConnection`. The plugin proposes an opaque member ID;
it cannot receive credentials or expand authorization. Pure round robin does
not probe usage. Usage-aware selection has a shared 15-second probe budget,
60-second freshness cache and ordinary grant/secret freshness invalidation.

One cursor spans all agents in a pool. An allocation transaction locks the
cursor, checks config and cursor revisions, rechecks authorization, and writes
the task pin and cursor advance together. Pins use company, pool, agent and the
existing task key (including `__heartbeat__`). Wakes without a task key retain
the original run ID as an affinity key in retry context. Conflicts retry at most
20 times; contention beyond that returns an actionable conflict.

Pins snapshot the concrete binding and member profile. Removing or editing a
member affects future allocations. Composer changes can change a supported
model or effort, with a note on fallback, but never the account or harness.
Session reset and compaction retain the pin. Revocation requires operator repair.
A pre-existing managed session can adopt its saved account when it is an
eligible member; otherwise the operator must explicitly reset the session.

Credential `ai_session_epoch` changes on reconnect or manual rotation. Only
verified runtime refresh write-back preserves it. Session fingerprints use the
epoch while authentication failure attribution still uses the token generation.
Native recovery retains concrete routing evidence and can finish after the
router flag or plugin is disabled or uninstalled; it revalidates underlying
account access and never makes a new allocation.

The private Cloud plugin owns round-robin and quota policy. Its configuration
page uses authenticated, company-scoped Core pool APIs. New allocations over
the chosen threshold wait; known exhaustion defers pinned turns. The deferred
run schedules `ai_connection_pool_wait` without spending the failure retry
budget, and the UI labels that retry as **Pool exhausted**.

Configuration and committed selection are recorded in activity records. Runs
record the selected member/profile and override notes in the local run log and
recovery context. These records stay in the instance database.

Tests: `cd server && pnpm exec vitest run src/__tests__/ai-connection-router.test.ts`
plus the existing AI connection, retry accounting, run-dispatch and UI suites.
