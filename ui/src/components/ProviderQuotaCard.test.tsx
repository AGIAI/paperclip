import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillerSpendCard } from "./BillerSpendCard";
import { ProviderQuotaCard } from "./ProviderQuotaCard";

describe("provider cost shares", () => {
  it("counts subscription tokens once and compares provider spend to the company budget", () => {
    const html = renderToStaticMarkup(<ProviderQuotaCard provider="anthropic" budgetMonthlyCents={1000} totalCompanySpendCents={500}
      weekSpendCents={0} windowRows={[]} showDeficitNotch={false} rows={[{
        provider: "anthropic", biller: "anthropic", model: "test", billingType: "subscription_overage",
        costCents: 500, inputTokens: 10, cachedInputTokens: 1000, outputTokens: 20,
        apiRunCount: 0, subscriptionRunCount: 1, subscriptionInputTokens: 10, subscriptionCachedInputTokens: 1000, subscriptionOutputTokens: 20,
      }]} />);
    expect(html).toContain("100% of token usage via subscription");
    expect(html).toContain("50% of company budget");
    expect(html).not.toContain("of allocation");
  });
  it("hides historical spend-to-monthly-budget comparisons for providers and billers", () => {
    const common = { budgetMonthlyCents: 1000, totalCompanySpendCents: 20000, weekSpendCents: 0, showBudgetUtilization: false };
    const provider = renderToStaticMarkup(<ProviderQuotaCard {...common} provider="openai" rows={[]} windowRows={[]} showDeficitNotch={false} />);
    const biller = renderToStaticMarkup(<BillerSpendCard {...common} providerRows={[]} row={{ biller: "openai", costCents: 20000, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, apiRunCount: 0, subscriptionRunCount: 0, providerCount: 1, modelCount: 1, subscriptionInputTokens: 0, subscriptionCachedInputTokens: 0, subscriptionOutputTokens: 0 }} />);
    for (const html of [provider, biller]) {
      expect(html).not.toContain("Period spend");
      expect(html).not.toContain("of allocation");
      expect(html).not.toContain("of company budget");
    }
  });

  it("compares biller spend with the actual company cap", () => {
    const html = renderToStaticMarkup(<BillerSpendCard budgetMonthlyCents={1000} totalCompanySpendCents={800} weekSpendCents={0} providerRows={[]} row={{ biller: "openai", costCents: 200, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, apiRunCount: 0, subscriptionRunCount: 0, providerCount: 1, modelCount: 1, subscriptionInputTokens: 0, subscriptionCachedInputTokens: 0, subscriptionOutputTokens: 0 }} />);
    expect(html).toContain("20% of company budget");
    expect(html).not.toContain("80% of allocation");
  });

});
