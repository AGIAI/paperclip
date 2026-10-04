import { describe, expect, it } from "vitest";
import { createCostsFinanceFixtures } from "./costsFinance";

const request = (path: string, data?: unknown) => new Request(`https://storybook.example/api/companies/preview/${path}`, data === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const charge = { idempotencyKey: "preview-charge", biller: "Example", amountCents: "125", currency: "USD", direction: "debit", eventKind: "platform_fee", occurredAt: new Date().toISOString() };
describe("Costs story finance actions", () => {
  it("records charges locally, deduplicates retries, and updates visible totals", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    await fixture("finance-events", request("finance-events", charge));
    await fixture("finance-events", request("finance-events", charge));
    expect(await (await fixture("costs/finance-events", request("costs/finance-events")))!.json()).toHaveLength(1);
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json()).toMatchObject({ debitCents: 125, eventCount: 1 });
    expect((await fixture("accounting/health", request("accounting/health")))!.status).toBe(200);
    expect(await (await fixture("accounting/inspect", request("accounting/inspect")))!.json()).toMatchObject({ findings: [] });
    expect((await fixture("accounting/repair", request("accounting/repair", {})))!.status).toBe(422);
    const remount = createCostsFinanceFixtures("preview");
    expect(await (await remount("costs/finance-events", request("costs/finance-events")))!.json()).toEqual([]);
  });
  it("imports and reviews invoices and simulates provider reports without network fallback", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    const invoice = { biller: "Example", externalId: "review-invoice", currency: "USD", lines: [{ externalId: "fee", kind: "fee", amountCents: "50", occurredAt: charge.occurredAt }] };
    const saved = await (await fixture("accounting/invoices", request("accounting/invoices", invoice)))!.json();
    await fixture("accounting/invoices", request("accounting/invoices", invoice));
    expect(await (await fixture("accounting/invoices", request("accounting/invoices")))!.json()).toHaveLength(1);
    expect(await (await fixture(`accounting/invoices/${saved.id}`, request(`accounting/invoices/${saved.id}`)))!.json()).toMatchObject({ lines: [{ status: "unmatched", amountCents: "50.0000000" }] });
    const secrets = await (await fixture("secrets", request("secrets")))!.json();
    expect(secrets[0].scope).toBe("company");
    const provider = { provider: "openai", accountId: "preview-account", scopeIds: ["preview-project"], secretId: secrets[0].id, from: "2026-01-01", to: "2026-01-02" };
    await fixture("accounting/provider-costs/import", request("accounting/provider-costs/import", provider));
    const summary = await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json();
    expect(summary).toMatchObject({ debitCents: 50, debitCentsExact: "50.0000000", providerReportedCents: 250, providerReportedCentsExact: "250.0000000", eventCount: 2 });
  });
  it("excludes provider reports from charge groups while keeping them in the timeline and report totals", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    await fixture("accounting/provider-costs/import", request("accounting/provider-costs/import", { provider: "openai", accountId: "preview-account", scopeIds: ["preview-project"], secretId: "00000000-0000-4000-8000-000000000999", from: "2026-01-01", to: "2026-01-02" }));
    for (const endpoint of ["costs/finance-by-biller", "costs/finance-by-kind"]) expect(await (await fixture(endpoint, request(endpoint)))!.json()).toEqual([]);
    expect(await (await fixture("costs/finance-events", request("costs/finance-events")))!.json()).toHaveLength(1);
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json()).toMatchObject({ debitCents: 0, providerReportedCents: 250, eventCount: 1 });
    await fixture("finance-events", request("finance-events", { ...charge, biller: "openai", eventKind: "inference_charge" }));
    for (const endpoint of ["costs/finance-by-biller", "costs/finance-by-kind"]) {
      const rows = await (await fixture(endpoint, request(endpoint)))!.json();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ debitCents: 125, providerReportedCents: 0, eventCount: 1 });
    }
  });

  it("accepts equivalent invoice retries but rejects changed normalized content without altering charges", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    const invoice = { biller: "Example", externalId: "immutable-invoice", currency: "USD", lines: [
      { externalId: "fee-b", kind: "fee", amountCents: "50", occurredAt: charge.occurredAt },
      { externalId: "fee-a", kind: "fee", amountCents: "25", occurredAt: charge.occurredAt },
    ] };
    const saved = await (await fixture("accounting/invoices", request("accounting/invoices", invoice)))!.json();
    const equivalent = { ...invoice, lines: invoice.lines.slice().reverse().map(line => ({ ...line, amountCents: `${line.amountCents}.0000000` })) };
    expect(await (await fixture("accounting/invoices", request("accounting/invoices", equivalent)))!.json()).toEqual(saved);
    for (const changed of [
      { ...invoice, currency: "EUR" },
      { ...invoice, lines: [{ ...invoice.lines[0], amountCents: "51" }, invoice.lines[1]] },
      { ...invoice, lines: [{ ...invoice.lines[0], occurredAt: "2000-01-01T00:00:00Z" }, invoice.lines[1]] },
    ]) expect((await fixture("accounting/invoices", request("accounting/invoices", changed)))!.status).toBe(409);
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json()).toMatchObject({ debitCents: 75, eventCount: 2 });
    expect(await (await fixture("accounting/invoices", request("accounting/invoices")))!.json()).toHaveLength(1);
  });

  it("keeps timestamp bounds exact while date-only bounds include the full day", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    for (const [hour, id] of [["12", "at-boundary"], ["18", "after-boundary"]]) {
      await fixture("finance-events", request("finance-events", { ...charge, idempotencyKey: id, occurredAt: `2026-09-01T${hour}:00:00Z` }));
    }
    const exact = await (await fixture("costs/finance-events", request("costs/finance-events?to=2026-09-01T12:00:00Z")))!.json();
    expect(exact).toHaveLength(1);
    expect(exact[0].occurredAt).toBe("2026-09-01T12:00:00.000Z");
    const wholeDay = await (await fixture("costs/finance-events", request("costs/finance-events?to=2026-09-01")))!.json();
    expect(wholeDay).toHaveLength(2);
  });

  it("keeps recent events chronological and bounded after importing an older invoice", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    await fixture("finance-events", request("finance-events", { ...charge, occurredAt: "2026-02-01T00:00:00Z" }));
    const lines = Array.from({ length: 30 }, (_, i) => ({ externalId: `older-${i}`, kind: "fee", amountCents: "10", occurredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }));
    await fixture("accounting/invoices", request("accounting/invoices", { biller: "Example", externalId: "older-invoice", currency: "USD", lines }));
    const rows = await (await fixture("costs/finance-events", request("costs/finance-events?limit=18")))!.json();
    expect(rows).toHaveLength(18);
    expect(rows.map((row: { occurredAt: string }) => row.occurredAt)).toEqual([
      "2026-02-01T00:00:00.000Z", ...Array.from({ length: 17 }, (_, i) => new Date(Date.UTC(2026, 0, 30 - i)).toISOString()),
    ]);
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json()).toMatchObject({ eventCount: 31, debitCents: 425 });
    const bounded = await (await fixture("costs/finance-events", request("costs/finance-events?from=2026-01-25&to=2026-01-30&limit=3")))!.json();
    expect(bounded.map((row: { occurredAt: string }) => row.occurredAt)).toEqual(lines.slice(27, 30).reverse().map(line => line.occurredAt));
    for (const limit of ["0", "-1", "1.5", "501", "invalid", "1&limit=2"]) {
      expect((await fixture("costs/finance-events", request(`costs/finance-events?limit=${limit}`)))!.status).toBe(400);
    }
  });

  it("counts only USD events in the headline while retaining every currency in reports and the timeline", async () => {
    const fixture = createCostsFinanceFixtures("preview");
    await fixture("accounting/invoices", request("accounting/invoices", { biller: "Example", externalId: "eur-invoice", currency: "EUR",
      lines: [{ externalId: "fee", kind: "fee", amountCents: "100", occurredAt: charge.occurredAt }] }));
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json())
      .toMatchObject({ currency: "USD", debitCents: 0, eventCount: 0, currencies: [{ currency: "EUR", debitCents: 100, eventCount: 1 }] });
    await fixture("finance-events", request("finance-events", charge));
    expect(await (await fixture("costs/finance-summary", request("costs/finance-summary")))!.json())
      .toMatchObject({ currency: "USD", debitCents: 125, eventCount: 1, currencies: [
        { currency: "EUR", debitCents: 100, eventCount: 1 }, { currency: "USD", debitCents: 125, eventCount: 1 },
      ] });
    expect(await (await fixture("costs/finance-events", request("costs/finance-events")))!.json()).toHaveLength(2);
  });

});
