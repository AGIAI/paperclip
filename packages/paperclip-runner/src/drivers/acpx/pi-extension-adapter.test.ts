import { expect, it } from "vitest";
import { createPiProfileExtensionAdapter, PI_NOTICE_METHOD } from "./pi-extension-adapter.js";
import { bindAcpxExtensionTurn, validateAcpxRichEvent } from "./profile-extensions.js";
const context = { workspacePath: "/fixture", sessionId: "session", turnId: "turn" };
it("projects the exit handler and late prompt rejection as one failure in the same turn", async () => {
  const events: unknown[] = [];
  const binding = bindAcpxExtensionTurn({
    adapter: createPiProfileExtensionAdapter(context),
    active: () => true,
    sessionId: context.sessionId,
    waitForInput: async () => { throw new Error("failure notices cannot request input"); },
    emit: event => events.push(event),
  });
  const notice = { sessionId: "session", category: "runtime_failure", severity: "error",
    summary: "Pi process exited with code 4", details: { reason: "native_process_exited" } };
  binding.onExtensionNotification(PI_NOTICE_METHOD, notice);
  binding.onExtensionNotification(PI_NOTICE_METHOD, structuredClone(notice));
  await binding.drain();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ eventType: "provider.notice.recorded",
    payload: { category: "pi.runtime_failure", severity: "error", summary: notice.summary } });
});

it("keeps distinct failure details, intervening activity, and later turns observable", async () => {
  const adapter = createPiProfileExtensionAdapter(context);
  const notice = { sessionId: "session", category: "runtime_failure", severity: "error",
    summary: "Provider request failed", details: { reason: "provider_http_401" } };
  expect(await adapter.notification(PI_NOTICE_METHOD, notice)).toHaveLength(1);
  expect(await adapter.notification(PI_NOTICE_METHOD, { ...notice, details: { reason: "provider_http_429" } })).toHaveLength(1);
  expect(await adapter.notification(PI_NOTICE_METHOD, { ...notice, severity: "warning" })).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    expect(await adapter.notification(PI_NOTICE_METHOD, { ...notice, category: "auto_retry_start" })).toHaveLength(1);
  }
  expect(await adapter.notification(PI_NOTICE_METHOD, notice)).toHaveLength(1);
  expect(await createPiProfileExtensionAdapter({ ...context, turnId: "next-turn" })
    .notification(PI_NOTICE_METHOD, notice)).toHaveLength(1);
});
it("preserves bounded native notice severity, category and meaningful metadata without assistant output", async () => {
  const adapter = createPiProfileExtensionAdapter(context);
  for (const severity of ["info", "warning", "error"]) {
    const events = await adapter.notification(PI_NOTICE_METHOD, { sessionId: "session", category: "auto_retry_start", severity,
      summary: "Retry scheduled", details: { attempt: 2, maxAttempts: 3, delayMs: 200, errorMessage: "Authorization: Bearer fixture-private-token", secret: "DROP_ME" } });
    expect(events).toHaveLength(1); validateAcpxRichEvent(events[0]!);
    expect(events[0]).toMatchObject({ eventType: "provider.notice.recorded", payload: { severity, category: "pi.auto_retry_start", scope: "session" } });
    expect(events[0]!.payload.details).toContainEqual({ name: "attempt", value: "2" });
    expect(JSON.stringify(events)).not.toMatch(/DROP_ME|fixture-private-token/);
  }
});
it("rejects malformed/cross-session notices and cannot answer requests or emit final replies", async () => {
  const adapter = createPiProfileExtensionAdapter(context);
  for (const changed of [{ sessionId: "other" }, { category: "invented" }, { severity: "fatal" }, { summary: "x".repeat(4001) }]) {
    await expect(adapter.notification(PI_NOTICE_METHOD, { sessionId: "session", category: "compaction_end", severity: "info", summary: "Done", ...changed })).rejects.toThrow("contract");
  }
  await expect(adapter.request("exec", {})).rejects.toThrow("no qualified");
});
