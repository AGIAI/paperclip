import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateDenial, permissionResponse } from "./qualify-cursor-denial.mjs";

const message = { id: 0, params: { sessionId: "active", options: [
  { kind: "allow_once", optionId: "native-allow" }, { kind: "reject_once", optionId: "native-deny-17" },
] } };
test("denial preserves numeric zero request IDs and actual offered option identity", () => {
  assert.deepEqual(permissionResponse(message, "active").response, {
    jsonrpc: "2.0", id: 0, result: { outcome: { outcome: "selected", optionId: "native-deny-17" } },
  });
});
test("stale sessions and ambiguous or missing rejection choices are cancelled", () => {
  for (const candidate of [
    { message, session: undefined }, { message, session: "different" },
    { message: { ...message, params: { ...message.params, options: [] } }, session: "active" },
    { message: { ...message, params: { ...message.params, options: [...message.params.options, { kind: "reject_once", optionId: "another" }] } }, session: "active" },
    { message: { ...message, params: { ...message.params, options: [...message.params.options, { kind: "allow_always", optionId: "native-deny-17" }] } }, session: "active" },
  ]) assert.deepEqual(permissionResponse(candidate.message, candidate.session).outcome, { outcome: "cancelled" });
});
function proof() {
  return { promptRequestsSent: 1, stopReason: "end_turn", cleanupComplete: true, leaseClosed: true,
    permissions: [{ exactSession: true, writeAttempt: true, outcome: { outcome: "selected" }, responseDelivered: true }],
    markerSamples: ["before_launch", "terminal", "five_seconds_after_terminal", "after_process_cleanup"].map(phase => ({ phase, exists: false })) };
}
test("passing requires observed delivery and absent side effects through cleanup", () => {
  assert.equal(evaluateDenial(proof()).passed, true);
  const noRequest = proof(); noRequest.permissions = [];
  assert.ok(evaluateDenial(noRequest).failures.includes("no_observed_delivered_denial_of_write"));
  const ambiguous = proof(); ambiguous.permissions[0].responseDelivered = false;
  assert.equal(evaluateDenial(ambiguous).passed, false);
  const sideEffect = proof(); sideEffect.markerSamples.push({ phase: "during_turn", exists: true });
  assert.ok(evaluateDenial(sideEffect).failures.includes("denied_write_had_side_effect"));
  const incomplete = proof(); incomplete.markerSamples.pop(); incomplete.cleanupComplete = false;
  assert.equal(evaluateDenial(incomplete).passed, false);
});
