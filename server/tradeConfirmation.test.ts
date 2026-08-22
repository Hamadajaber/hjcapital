import { describe, expect, it } from "vitest";
import { normalizeTradeConfirmation } from "./tradeConfirmation";

describe("normalizeTradeConfirmation", () => {
  it("normalizes nested aliases returned by a model into an executable BUY confirmation", () => {
    const result = normalizeTradeConfirmation({
      decision: {
        recommendation: "bullish",
        score: "73",
        rationale: "Trend and momentum agree across timeframes.",
        entry_price: "1.085",
        stop_loss: "1.08",
        take_profit: "1.095",
      },
    });
    expect(result).toMatchObject({ action: "BUY", confidence: 73, entryPrice: 1.085, stopLoss: 1.08, takeProfit: 1.095 });
  });

  it("uses a safe rationale instead of propagating undefined into a HOLD veto", () => {
    const result = normalizeTradeConfirmation({ action: "HOLD", confidence: 0 });
    expect(result.reasoning).toBe("AI confirmation omitted a usable rationale.");
  });
});

