import { describe, expect, it } from "vitest";
import { classifyTradingDecisionReason } from "./tradingDiagnostics";

describe("tradingDiagnostics", () => {
  it.each([
    ["[Session Filter] EURUSD blocked at NY close", "session_filter"],
    ["[Daily Bias Filter] BUY BLOCKED — daily bias is BEARISH", "daily_bias"],
    ["[Volatility Filter] ATR is too high", "volatility_filter"],
    ["MTF rules not met — 1H MACD has not confirmed", "mtf_not_confirmed"],
    ["[Pipeline recovery veto] Independent review did not affirm BUY", "pipeline_recovery_veto"],
    ["[MTF:EURUSD] Signal below threshold (60% < 70%)", "confidence_threshold"],
  ] as const)("classifies %s", (reasoning, expected) => {
    expect(classifyTradingDecisionReason(reasoning)).toBe(expected);
  });
});

