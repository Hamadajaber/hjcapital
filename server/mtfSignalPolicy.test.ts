import { describe, expect, it } from "vitest";
import { hasValidFiveMinuteTrigger } from "./mtfSignalPolicy";

describe("hasValidFiveMinuteTrigger", () => {
  it("accepts a controlled bullish continuation rather than waiting only for a pullback", () => {
    expect(hasValidFiveMinuteTrigger("BUY", 60, false)).toBe(true);
  });

  it("accepts a controlled bearish continuation rather than waiting only for a bounce", () => {
    expect(hasValidFiveMinuteTrigger("SELL", 40, false)).toBe(true);
  });

  it("rejects directionless mid-range momentum without a pattern", () => {
    expect(hasValidFiveMinuteTrigger("BUY", 50, false)).toBe(false);
    expect(hasValidFiveMinuteTrigger("SELL", 50, false)).toBe(false);
  });

  it("accepts a directional candle pattern at any valid RSI", () => {
    expect(hasValidFiveMinuteTrigger("BUY", 72, true)).toBe(true);
    expect(hasValidFiveMinuteTrigger("SELL", 26, true)).toBe(true);
  });
});

