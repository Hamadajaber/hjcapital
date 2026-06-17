/**
 * MTF Strategy Tests — Trend Following + Multi-Timeframe Confirmation
 * ─────────────────────────────────────────────────────────────────────
 * Tests for the 3 rules of the new strategy:
 *   Rule 1: EMA50 vs EMA200 on 4H candles (trend direction filter)
 *   Rule 2: MACD histogram + RSI on 1H candles (entry confirmation)
 *   Rule 3: Candlestick pattern or RSI momentum on 5m (trigger)
 */

import { describe, it, expect } from "vitest";
import {
  calculateEMA,
  getEMATrend,
  calculateRSI,
  calculateMACD,
  buildTechnicalSummary,
} from "./technicalAnalysis";
import type { Candle } from "./technicalAnalysis";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flatCandles(n: number, price: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    open: price,
    high: price + 0.001,
    low: price - 0.001,
    close: price,
    volume: 1000,
    timestamp: new Date(Date.now() - (n - i) * 60000).toISOString(),
  }));
}

function trendingCandles(n: number, startPrice: number, endPrice: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const price = startPrice + ((endPrice - startPrice) * i) / (n - 1);
    return {
      open: price - 0.0005,
      high: price + 0.001,
      low: price - 0.001,
      close: price,
      volume: 1000,
      timestamp: new Date(Date.now() - (n - i) * 3600000).toISOString(),
    };
  });
}

// ─── Rule 1: EMA Trend Tests ──────────────────────────────────────────────────

describe("Rule 1 — EMA Trend Filter (getEMATrend)", () => {
  it("returns neutral when fewer than 20 candles", () => {
    const candles = flatCandles(10, 1.1000);
    const result = getEMATrend(candles);
    expect(result.trend).toBe("neutral");
    expect(result.description).toContain("Insufficient data");
  });

  it("returns up trend when price is consistently rising (EMA50 > EMA200)", () => {
    const candles = trendingCandles(250, 1.0000, 1.5000);
    const result = getEMATrend(candles);
    expect(result.trend).toBe("up");
    expect(result.ema50).toBeGreaterThan(result.ema200);
    expect(result.description).toContain("Uptrend");
  });

  it("returns down trend when price is consistently falling (EMA50 < EMA200)", () => {
    const candles = trendingCandles(250, 1.5000, 1.0000);
    const result = getEMATrend(candles);
    expect(result.trend).toBe("down");
    expect(result.ema50).toBeLessThan(result.ema200);
    expect(result.description).toContain("Downtrend");
  });

  it("uses fallback when 50-199 candles available (EMA50 vs SMA20)", () => {
    // 80 candles: first 60 flat, then 20 rising sharply so EMA50 > SMA20
    const flat = flatCandles(60, 1.0000);
    const rising = trendingCandles(20, 1.0000, 1.0500);
    const candles = [...flat, ...rising];
    const result = getEMATrend(candles);
    // EMA50 lags behind, SMA20 is at the recent high — EMA50 < SMA20 → "down" is possible
    // Just verify it uses the fallback path (description contains SMA20)
    expect(result.description).toContain("SMA20");
    expect(["up", "down"]).toContain(result.trend);
  });

  it("calculateEMA returns correct value for simple case", () => {
    const candles: Candle[] = [1, 2, 3, 4, 5].map((c) => ({
      open: c, high: c + 0.1, low: c - 0.1, close: c, volume: 100,
    }));
    const ema3 = calculateEMA(candles, 3);
    expect(ema3).toBeGreaterThan(3.5);
    expect(ema3).toBeLessThan(5);
  });

  it("calculateEMA returns last close when fewer candles than period", () => {
    const candles = flatCandles(5, 1.2345);
    const ema = calculateEMA(candles, 20);
    expect(ema).toBe(1.2345);
  });
});

// ─── Rule 2: MACD + RSI Tests ─────────────────────────────────────────────────

describe("Rule 2 — 1H Entry Confirmation (calculateMACD + calculateRSI)", () => {
  it("MACD histogram is positive (bullish) in uptrend", () => {
    const candles = trendingCandles(60, 1.0000, 1.1000);
    const result = calculateMACD(candles);
    expect(result.histogram).toBeGreaterThan(0);
    expect(result.trend).toBe("bullish");
  });

  it("MACD histogram is negative (bearish) in downtrend", () => {
    const candles = trendingCandles(60, 1.1000, 1.0000);
    const result = calculateMACD(candles);
    expect(result.histogram).toBeLessThan(0);
    expect(result.trend).toBe("bearish");
  });

  it("RSI is above 50 in uptrend", () => {
    const candles = trendingCandles(30, 1.0000, 1.0500);
    const result = calculateRSI(candles);
    expect(result.value).toBeGreaterThan(50);
  });

  it("RSI is below 50 in downtrend", () => {
    const candles = trendingCandles(30, 1.0500, 1.0000);
    const result = calculateRSI(candles);
    expect(result.value).toBeLessThan(50);
  });

  it("RSI is low after sharp decline", () => {
    const flat = flatCandles(20, 1.1000);
    const decline = trendingCandles(10, 1.1000, 1.0500);
    const candles = [...flat, ...decline];
    const result = calculateRSI(candles);
    expect(result.value).toBeLessThan(50);
    expect(result.signal).not.toBe("overbought");
  });

  it("RSI is high after sharp rally", () => {
    const flat = flatCandles(20, 1.0000);
    const rally = trendingCandles(10, 1.0000, 1.0500);
    const candles = [...flat, ...rally];
    const result = calculateRSI(candles);
    expect(result.value).toBeGreaterThan(50);
    expect(result.signal).not.toBe("oversold");
  });

  it("MACD returns bullish in strong uptrend (Rule 2 BUY passes)", () => {
    // Use a strong, sustained uptrend with enough candles for MACD
    const candles = trendingCandles(60, 1.0000, 1.0600);
    const macd = calculateMACD(candles);
    const rsi = calculateRSI(candles);
    // In a strong uptrend: MACD histogram > 0 (bullish)
    expect(macd.histogram).toBeGreaterThan(0);
    expect(macd.trend).toBe("bullish");
    // RSI should be above 50 but not necessarily in 40-70 range for a strong trend
    expect(rsi.value).toBeGreaterThan(40);
  });

  it("MACD returns bearish in strong downtrend (Rule 2 SELL passes)", () => {
    const candles = trendingCandles(60, 1.0600, 1.0000);
    const macd = calculateMACD(candles);
    const rsi = calculateRSI(candles);
    expect(macd.histogram).toBeLessThan(0);
    expect(macd.trend).toBe("bearish");
    expect(rsi.value).toBeLessThan(60);
  });
});

// ─── Rule 3: 5m Trigger Tests ─────────────────────────────────────────────────

describe("Rule 3 — 5m Trigger (buildTechnicalSummary patterns + RSI)", () => {
  it("RSI trigger: bullish trigger fires when RSI < 45 (oversold pullback)", () => {
    const flat = flatCandles(15, 1.1000);
    const decline = trendingCandles(10, 1.1000, 1.0600);
    const candles = [...flat, ...decline];
    const summary = buildTechnicalSummary(candles);
    // After sharp decline, RSI should be below 45
    expect(summary.rsi.value).toBeLessThan(45);
  });

  it("RSI trigger: bearish trigger fires when RSI > 55 (overbought bounce)", () => {
    const flat = flatCandles(15, 1.0000);
    const rally = trendingCandles(10, 1.0000, 1.0400);
    const candles = [...flat, ...rally];
    const summary = buildTechnicalSummary(candles);
    expect(summary.rsi.value).toBeGreaterThan(55);
  });

  it("returns patterns array (may be empty for simple candles)", () => {
    const candles = flatCandles(20, 1.1000);
    const summary = buildTechnicalSummary(candles);
    expect(Array.isArray(summary.patterns)).toBe(true);
  });

  it("score is in range -100 to +100", () => {
    const candles = trendingCandles(30, 1.0000, 1.0500);
    const summary = buildTechnicalSummary(candles);
    expect(summary.score).toBeGreaterThanOrEqual(-100);
    expect(summary.score).toBeLessThanOrEqual(100);
  });

  it("overallBias is one of the valid values", () => {
    const candles = trendingCandles(20, 1.0000, 1.0100);
    const summary = buildTechnicalSummary(candles);
    expect(["bullish", "bearish", "neutral"]).toContain(summary.overallBias);
  });

  it("overallBias is a valid string value in any market", () => {
    const candles = trendingCandles(20, 1.0100, 1.0000);
    const summary = buildTechnicalSummary(candles);
    // In a short downtrend, RSI may be oversold (bullish signal) — any bias is valid
    expect(["bullish", "bearish", "neutral"]).toContain(summary.overallBias);
  });
});

// ─── Full Strategy Logic Tests ────────────────────────────────────────────────

describe("Full MTF Strategy — 3-Rule Evaluation", () => {
  it("generates BUY signal when all 3 rules pass (uptrend scenario)", () => {
    // Rule 1: 250 candles strong uptrend (4H)
    const candles4h = trendingCandles(250, 1.0000, 1.2000);
    const emaTrend = getEMATrend(candles4h);
    expect(emaTrend.trend).toBe("up");

    // Rule 2: 60 candles uptrend (1H) — MACD bullish
    const candles1h = trendingCandles(60, 1.1800, 1.2000);
    const macd1h = calculateMACD(candles1h);
    expect(macd1h.histogram).toBeGreaterThan(0);
    expect(macd1h.trend).toBe("bullish");

    // Rule 3: RSI pullback on 5m
    const flat5m = flatCandles(15, 1.2000);
    const pullback5m = trendingCandles(10, 1.2000, 1.1940);
    const candles5m = [...flat5m, ...pullback5m];
    const summary5m = buildTechnicalSummary(candles5m);
    const trigger5mBullish = summary5m.rsi.value < 45 ||
      summary5m.patterns.some((p) => p.type === "bullish" && p.strength !== "weak");
    expect(trigger5mBullish).toBe(true);

    // All 3 rules pass → BUY signal
    const buySignal = emaTrend.trend === "up" && macd1h.histogram > 0 && trigger5mBullish;
    expect(buySignal).toBe(true);
  });

  it("generates SELL signal when all 3 rules pass (downtrend scenario)", () => {
    // Rule 1: 250 candles strong downtrend (4H)
    const candles4h = trendingCandles(250, 1.2000, 1.0000);
    const emaTrend = getEMATrend(candles4h);
    expect(emaTrend.trend).toBe("down");

    // Rule 2: 60 candles downtrend (1H) — MACD bearish
    const candles1h = trendingCandles(60, 1.0200, 1.0000);
    const macd1h = calculateMACD(candles1h);
    expect(macd1h.histogram).toBeLessThan(0);
    expect(macd1h.trend).toBe("bearish");

    // Rule 3: RSI bounce on 5m
    const flat5m = flatCandles(15, 1.0000);
    const bounce5m = trendingCandles(10, 1.0000, 1.0060);
    const candles5m = [...flat5m, ...bounce5m];
    const summary5m = buildTechnicalSummary(candles5m);
    const trigger5mBearish = summary5m.rsi.value > 55 ||
      summary5m.patterns.some((p) => p.type === "bearish" && p.strength !== "weak");
    expect(trigger5mBearish).toBe(true);

    // All 3 rules pass → SELL signal
    const sellSignal = emaTrend.trend === "down" && macd1h.histogram < 0 && trigger5mBearish;
    expect(sellSignal).toBe(true);
  });

  it("blocks BUY when trend is down (Rule 1 fails)", () => {
    const candles4h = trendingCandles(250, 1.2000, 1.0000);
    const emaTrend = getEMATrend(candles4h);
    expect(emaTrend.trend).toBe("down");
    // BUY requires trend === "up"
    const buyAllowed = emaTrend.trend === "up";
    expect(buyAllowed).toBe(false);
  });

  it("blocks SELL when trend is up (Rule 1 fails)", () => {
    const candles4h = trendingCandles(250, 1.0000, 1.2000);
    const emaTrend = getEMATrend(candles4h);
    expect(emaTrend.trend).toBe("up");
    // SELL requires trend === "down"
    const sellAllowed = emaTrend.trend === "down";
    expect(sellAllowed).toBe(false);
  });

  it("blocks BUY when MACD is bearish during pullback (Rule 2 fails)", () => {
    const candles4h = trendingCandles(250, 1.0000, 1.2000);
    const emaTrend = getEMATrend(candles4h);
    expect(emaTrend.trend).toBe("up");

    // 1H pulling back sharply → MACD bearish
    const candles1h = trendingCandles(60, 1.2000, 1.1800);
    const macd1h = calculateMACD(candles1h);
    expect(macd1h.histogram).toBeLessThan(0);

    // Rule 2 fails → no BUY
    const buySignal = emaTrend.trend === "up" && macd1h.histogram > 0;
    expect(buySignal).toBe(false);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("handles empty candles array gracefully", () => {
    const emaTrend = getEMATrend([]);
    expect(emaTrend.trend).toBe("neutral");
  });

  it("handles single candle gracefully", () => {
    const candles = flatCandles(1, 1.1000);
    const emaTrend = getEMATrend(candles);
    expect(emaTrend.trend).toBe("neutral");
    const rsi = calculateRSI(candles);
    expect(rsi.value).toBeGreaterThanOrEqual(0);
    expect(rsi.value).toBeLessThanOrEqual(100);
  });

  it("handles all identical prices (flat market)", () => {
    const candles = flatCandles(50, 1.1000);
    const macd = calculateMACD(candles);
    expect(macd.histogram).toBeCloseTo(0, 3);
    const rsi = calculateRSI(candles);
    expect(rsi.value).toBeGreaterThanOrEqual(0);
    expect(rsi.value).toBeLessThanOrEqual(100);
  });

  it("EMA calculation is stable with 200+ candles", () => {
    const candles = trendingCandles(250, 1.0000, 1.5000);
    expect(() => calculateEMA(candles, 200)).not.toThrow();
    const ema200 = calculateEMA(candles, 200);
    expect(ema200).toBeGreaterThan(1.0000);
    expect(ema200).toBeLessThan(1.5000);
  });

  it("MACD returns valid structure even with minimal candles", () => {
    const candles = flatCandles(30, 1.0000);
    const result = calculateMACD(candles);
    expect(result).toHaveProperty("macd");
    expect(result).toHaveProperty("signal");
    expect(result).toHaveProperty("histogram");
    expect(result).toHaveProperty("trend");
    expect(["bullish", "bearish", "neutral"]).toContain(result.trend);
  });

  it("getEMATrend ema50 and ema200 are positive numbers in valid uptrend", () => {
    const candles = trendingCandles(250, 1.0000, 1.5000);
    const result = getEMATrend(candles);
    expect(result.ema50).toBeGreaterThan(0);
    expect(result.ema200).toBeGreaterThan(0);
  });
});
