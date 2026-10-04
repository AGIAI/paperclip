// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { AccountingHealthPanel } from "./AccountingHealthPanel";
const api = vi.hoisted(() => ({ health: vi.fn(), inspect: vi.fn(), repair: vi.fn(), retry: vi.fn(), invoices: vi.fn(), importInvoice: vi.fn(), reconcile: vi.fn(), adjust: vi.fn() }));
vi.mock("../api/accounting", () => ({ accountingApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("operator accounting tools", () => {
  let container: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;
  beforeEach(() => {
    vi.resetAllMocks(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    api.health.mockResolvedValue({ companyId: "one", pendingRunCount: 1, unpricedEventCount: 2, pendingCancellationCount: 3, heldReservationCents: "12.5", oldestPendingAt: "2026-09-28T10:00:00Z", items: [] });
    api.invoices.mockResolvedValue([]);
  });
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
  async function render(companyId = "one") {
    await act(async () => { root.render(<QueryClientProvider client={client}><AccountingHealthPanel companyId={companyId} /></QueryClientProvider>); });
    await flush();
  }
  async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
  function button(text: string) { const found = Array.from(container.querySelectorAll("button")).find(el => el.textContent === text); if (!found) throw new Error(`Missing button: ${text}`); return found; }
  async function click(text: string) { await act(async () => button(text).click()); await flush(); }
  async function input(label: string, value: string) {
    const element = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  it("shows uncertain charges, held capacity, stop backlog and the oldest receipt", async () => {
    await render();
    expect(container.textContent).toContain("1 pending runs"); expect(container.textContent).toContain("2 unpriced charges");
    expect(container.textContent).toContain("3 pending budget stops"); expect(container.textContent).toContain("$0.13 reserved");
    expect(container.textContent).toContain("Oldest pending:"); expect(api.invoices).not.toHaveBeenCalled();
  });
  it("shows request failures instead of a healthy zero", async () => {
    api.health.mockRejectedValue(new Error("Accounting service unavailable")); await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Accounting service unavailable");
    expect(container.textContent).not.toContain("0 pending runs");
  });
  it("requires a reason and the reviewed fingerprint, and surfaces stale repairs", async () => {
    api.inspect.mockResolvedValue({ companyId: "one", fingerprint: "a".repeat(64), checkedAt: "2026-09-28", findings: [{ kind: "company_projection", entityId: "one", repairable: true, actual: { cents: "99" }, expected: { cents: "12.5" } }] });
    api.repair.mockRejectedValue(new Error("Accounting changed since inspection; inspect again before repairing"));
    await render(); await click("Open accounting tools"); await click("Inspect stored totals");
    expect(button("Repair reviewed totals").disabled).toBe(true);
    await input("Accounting repair reason", "Rebuild known drift"); await click("Repair reviewed totals");
    expect(api.repair).toHaveBeenCalledWith("one", "a".repeat(64), "Rebuild known drift");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("changed since inspection");
    await render("two");
    expect(container.textContent).not.toContain("Repair reviewed totals");
    expect(api.health).toHaveBeenLastCalledWith("two");
  });
  it("keeps repair and correction reasons separate and clears corrections when changing invoices", async () => {
    api.inspect.mockResolvedValue({ companyId: "one", fingerprint: "a".repeat(64), findings: [{ kind: "company_projection", entityId: "one", repairable: true, actual: { cents: "99" }, expected: { cents: "12.5" } }] });
    api.invoices.mockResolvedValue([{ id: "first", biller: "openai", externalId: "invoice-one" }, { id: "second", biller: "openai", externalId: "invoice-two" }]);
    api.reconcile.mockImplementation(async (_company, id) => ({ invoice: { externalId: id, currency: "USD" }, lines: [{ id, externalId: "charge", status: "difference", matchedEventId: "event", recordedCents: "1", amountCents: "2", differenceCents: "1" }] }));
    await render(); await click("Open accounting tools"); await click("Inspect stored totals");
    await input("Accounting repair reason", "Repair company drift");
    await click("openai · invoice-one");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Invoice correction reason"]')!.value).toBe("");
    expect(button("Apply reviewed correction").disabled).toBe(true);
    await input("Invoice correction reason", "Invoice one adjustment");
    expect(button("Apply reviewed correction").disabled).toBe(false);
    await click("openai · invoice-two");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Invoice correction reason"]')!.value).toBe("");
    expect(button("Apply reviewed correction").disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[aria-label="Accounting repair reason"]')!.value).toBe("Repair company drift");
    expect(api.adjust).not.toHaveBeenCalled();
  });

  it("confirms an uncertain correction with the original payload after reconciliation changes", async () => {
    api.invoices.mockResolvedValue([{ id: "first", biller: "openai", externalId: "invoice-one" }, { id: "second", biller: "openai", externalId: "invoice-two" }]);
    api.reconcile.mockResolvedValue({ invoice: { externalId: "invoice-one", currency: "USD" }, lines: [{ id: "line", externalId: "charge", status: "difference", matchedEventId: "event", recordedCents: "1", amountCents: "2", differenceCents: "1" }] });
    api.adjust.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValue({});
    await render(); await click("Open accounting tools"); await click("openai · invoice-one");
    await input("Invoice correction reason", "Provider receipt"); await click("Apply reviewed correction");
    const original = structuredClone(api.adjust.mock.calls[0]);
    expect(original).toEqual(["one", "event", { idempotencyKey: "invoice-line:line", invoiceLineId: "line", expectedCents: "1", correctedCents: "2", reason: "Provider receipt", pricing: { source: "provider_invoice", evidence: "invoice-one" } }]);
    expect(container.querySelector<HTMLInputElement>('[aria-label="Invoice correction reason"]')!.disabled).toBe(true);
    expect(button("openai · invoice-two").disabled).toBe(true);
    expect(button("Apply reviewed correction").disabled).toBe(true);
    // A focus refresh may already show the saved adjustment. Confirmation must
    // still be available and must not derive its payload from these new totals.
    api.reconcile.mockResolvedValue({ invoice: { externalId: "invoice-one", currency: "USD" }, lines: [] });
    await act(async () => { await client.invalidateQueries(); }); await flush();
    await click("Hide accounting tools"); await click("Open accounting tools");
    await click("Confirm original correction");
    expect(api.adjust.mock.calls[1]).toEqual(original);
    expect(container.textContent).toContain("Correction recorded");
    expect(container.textContent).not.toContain("Confirm original correction");
    expect(button("openai · invoice-two").disabled).toBe(false);
  });

  it("refreshes rejected corrections so the operator can review current evidence", async () => {
    api.invoices.mockResolvedValue([{ id: "first", biller: "openai", externalId: "invoice-one" }]);
    api.reconcile.mockResolvedValue({ invoice: { externalId: "invoice-one", currency: "USD" }, lines: [{ id: "line", externalId: "charge", status: "difference", matchedEventId: "event", recordedCents: "1", amountCents: "2", differenceCents: "1" }] });
    api.adjust.mockRejectedValue(new ApiError("Evidence changed", 409, {}));
    await render(); await click("Open accounting tools"); await click("openai · invoice-one");
    await input("Invoice correction reason", "Provider receipt");
    const reads = api.reconcile.mock.calls.length;
    await click("Apply reviewed correction");
    expect(api.reconcile.mock.calls.length).toBeGreaterThan(reads);
    expect(container.querySelector<HTMLInputElement>('[aria-label="Invoice correction reason"]')!.disabled).toBe(false);
    expect(container.textContent).not.toContain("Confirm original correction");
  });

  it("retries only ready receipts and keeps incomplete evidence visible", async () => {
    api.health.mockResolvedValue({ companyId: "one", pendingRunCount: 2, unpricedEventCount: 0, pendingCancellationCount: 0, heldReservationCents: "0", items: [
      { runId: "ready", agentId: "a", state: "retryable", attempts: 2, since: "2026-09-28", lastError: "Database unavailable" },
      { runId: "partial", agentId: "a", state: "waiting_for_receipt", attempts: 0, since: "2026-09-28", lastError: null },
    ] }); api.retry.mockResolvedValue({ accounted: true });
    await render(); await click("Open accounting tools");
    expect(Array.from(container.querySelectorAll("button")).filter(b => b.textContent === "Retry accounting")).toHaveLength(1);
    expect(container.textContent).toContain("Waiting for provider evidence");
    await click("Retry accounting"); expect(api.retry).toHaveBeenCalledWith("one", "ready");
  });
});
