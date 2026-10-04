import { describe, expect, it, vi } from "vitest";
import { formatCents, visibleRunCostUsd, visibleRunTokenTotal } from "./utils";
import { computeRange } from "../hooks/useDateRange";

describe("cost presentation", () => {
  it("keeps historical inclusive input totals and counts receipt-backed cache hits once", () => {
    expect(visibleRunTokenTotal({ provider: "openai", inputTokens: 100, cachedInputTokens: 80, outputTokens: 10 })).toBe(110);
    expect(visibleRunTokenTotal({ provider: "openai", inputTokens: 20, cachedInputTokens: 80, outputTokens: 10, accountingReceiptId: "saved-receipt" })).toBe(110);
    expect(visibleRunTokenTotal({ input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 })).toBe(110);
    expect(visibleRunTokenTotal({ input_tokens: 20, cache_read_input_tokens: 80, output_tokens: 10, accountingReceiptId: "saved-receipt" })).toBe(110);
    expect(visibleRunTokenTotal(null)).toBe(0);
  });

  it("shows the adjusted charge and respects an explicit zero", () => {
    expect(visibleRunCostUsd({ costUsd: 3.1, cacheAdjustedCostUsd: 1.5 })).toBe(1.5);
    expect(visibleRunCostUsd({ cacheAdjustedCostUsd: 0 }, { costUsd: 5 })).toBe(0);
    expect(visibleRunCostUsd({ cacheAdjustedCostUsd: 0.004 })).toBe(0.004);
    expect(visibleRunCostUsd({ costUsd: -1 }, { costUsd: 2 })).toBe(2);
    expect(visibleRunCostUsd({ billingType: "subscription_included", costUsd: 50 })).toBe(0);
  });

  it("includes separate legacy Claude cache reads without changing legacy Codex totals", () => {
    const tokens = { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10 };
    expect(visibleRunTokenTotal({ ...tokens, provider: "anthropic" })).toBe(190);
    expect(visibleRunTokenTotal({ ...tokens, provider: "openai" })).toBe(110);
    expect(visibleRunTokenTotal({ ...tokens, provider: "anthropic", accountingReceiptId: "saved-receipt" })).toBe(190);
    expect(visibleRunTokenTotal({ provider: "anthropic", input_tokens: 100, cache_read_input_tokens: 80, output_tokens: 10 })).toBe(190);
  });

  it("formats finance amounts in their recorded currency", () => {
    expect(formatCents(123, "USD")).toBe("$1.23");
    expect(formatCents(123, "EUR")).toBe("€1.23");
  });

  it("starts month-to-date at the UTC boundary even before local midnight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-01T00:30:00.000Z"));
      expect(computeRange("mtd")).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-01T00:30:00.000Z" });
    } finally { vi.useRealTimers(); }
  });
});
