import { describe, expect, it } from "vitest";
import { assertCancellationRequest, cancellationIntentId, cancellationRequestId } from "./native-cancellation-request.js";
const id = "11111111-1111-4111-8111-111111111111";
describe("caller-bound native cancellation", () => {
  it.each([null, "", " x", {}, [], 1, `${id} `, "not-a-uuid"])("rejects malformed request %j", value => {
    expect(() => cancellationRequestId(value)).toThrow("Invalid cancellationRequestId");
  });
  it("preserves the absent option and normalizes a valid UUID", () => {
    expect(cancellationRequestId(undefined)).toBeUndefined();
    expect(cancellationRequestId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
  it.each([{ startupCancellation: {} }, { startupCancellation: { requestedAt: "earlier" } },
    { startupCancellation: { cancellationRequestId: "other" } }, { nativeCancellation: { intentId: "other" } }])("rejects prior or racing intent %j", result => {
    expect(() => assertCancellationRequest(result, id, true)).toThrow("earlier Stop");
  });
  it("requires a reservation at the native locked dispatch gate", () => {
    expect(() => assertCancellationRequest({}, id)).toThrow("earlier Stop");
    expect(() => assertCancellationRequest({}, id, true)).not.toThrow();
    const startupCancellation = { cancellationRequestId: id };
    expect(() => assertCancellationRequest({ startupCancellation }, id)).not.toThrow();
    expect(() => assertCancellationRequest({ startupCancellation, nativeCancellation: { intentId: cancellationIntentId(id) } }, id)).not.toThrow();
  });
});
