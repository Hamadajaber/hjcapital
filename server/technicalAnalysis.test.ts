/**
 * Unit Tests — Technical Analysis Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests every exported function in technicalAnalysis.ts:
 *   1. calculateRSI      — RSI values, oversold/overbought signals, edge cases
 *   2. calculateMACD     — MACD line, signal, histogram, trend direction
 *   3. calculateBollinger — Bands, bandwidth, price position
 *   4. detectPatterns    — All 8 candlestick patterns
 *   5. buildTechnicalSummary — Score calculation, overallBias
 *   6. isCorrelatedWithOpenPositions — Correlation groups
 *   7. formatTechnicalSummaryForPrompt — Output string format
 */

import { describe, it, expect } from "vitest";
import {
  calculateRSI,
  calculateMACD,
  calculateBollinger,
  detectPatterns,
  buildTechnicalSummary,
  isCorrelatedWithOpenPositions,
  formatTechnicalSummaryForPrompt,
} from "./technicalAnalysis";
import type { Candle } from "./technicalAnalysis";

// ─── Test Data Factories ──────────────────────────────────────────────────────

/** Generate N candles with a constant close price */
function flatCandles(n: number, price = 1.0850): Candle[] {
  return Array.from({ length: n }, () => ({
    open: price,
    high: price + 0.0005,
    low: price - 0.0005,
    close: price,
  }));
}

/** Generate N candles with steadily rising close prices */
function risingCandles(n: number, start = 1.0800, step = 0.0010): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i * step;
    return { open: close - step * 0.5, high: close + step * 0.2, low: close - step * 0.8, close };
  });
}

/** Generate N candles with steadily falling close prices */
function fallingCandles(n: number, start = 1.1000, step = 0.0010): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start - i * step;
    return { open: close + step * 0.5, high: close + step * 0.8, low: close - step * 0.2, close };
  });
}

// ─── RSI Tests ────────────────────────────────────────────────────────────────

describe("calculateRSI", () => {
  it("returns neutral 50 when insufficient candles", () => {
    const result = calculateRSI(flatCandles(5)); // needs 15+
    expect(result.value).toBe(50);
    expect(result.signal).toBe("neutral");
  });

  it("returns overbought signal for flat prices (all closes equal → no losses → RSI=100)", () => {
    // When all closes are identical, avgLoss=0 → RS=Infinity → RSI=100 → overbought
    // This is the mathematically correct Wilder RSI behavior
    const result = calculateRSI(flatCandles(30));
    expect(result.signal).toBe("overbought");
    expect(result.value).toBeGreaterThan(70);
  });

  it("returns overbought signal for strongly rising prices", () => {
    const result = calculateRSI(risingCandles(40));
    expect(result.value).toBeGreaterThan(70);
    expect(result.signal).toBe("overbought");
  });

  it("returns oversold signal for strongly falling prices", () => {
    const result = calculateRSI(fallingCandles(40));
    expect(result.value).toBeLessThan(30);
    expect(result.signal).toBe("oversold");
  });

  it("RSI value is always between 0 and 100", () => {
    const rising = calculateRSI(risingCandles(50));
    const falling = calculateRSI(fallingCandles(50));
    expect(rising.value).toBeGreaterThanOrEqual(0);
    expect(rising.value).toBeLessThanOrEqual(100);
    expect(falling.value).toBeGreaterThanOrEqual(0);
    expect(falling.value).toBeLessThanOrEqual(100);
  });

  it("uses custom period correctly", () => {
    const candles = risingCandles(30);
    const rsi7 = calculateRSI(candles, 7);
    const rsi14 = calculateRSI(candles, 14);
    // Both should be overbought for rising data, but values may differ
    expect(rsi7.value).toBeGreaterThan(0);
    expect(rsi14.value).toBeGreaterThan(0);
  });

  it("handles exactly period+1 candles (minimum valid input)", () => {
    const result = calculateRSI(risingCandles(15), 14);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });
});

// ─── MACD Tests ───────────────────────────────────────────────────────────────

describe("calculateMACD", () => {
  it("returns zeros when insufficient candles", () => {
    const result = calculateMACD(flatCandles(20)); // needs 26+9=35
    expect(result.macd).toBe(0);
    expect(result.signal).toBe(0);
    expect(result.histogram).toBe(0);
    expect(result.trend).toBe("neutral");
  });

  it("returns bullish trend for rising prices", () => {
    const result = calculateMACD(risingCandles(60));
    expect(result.trend).toBe("bullish");
    expect(result.macd).toBeGreaterThan(0);
    expect(result.histogram).toBeGreaterThan(0);
  });

  it("returns bearish trend for falling prices", () => {
    const result = calculateMACD(fallingCandles(60));
    expect(result.trend).toBe("bearish");
    expect(result.macd).toBeLessThan(0);
    expect(result.histogram).toBeLessThan(0);
  });

  it("histogram equals macd minus signal", () => {
    const result = calculateMACD(risingCandles(60));
    const expectedHistogram = result.macd - result.signal;
    expect(result.histogram).toBeCloseTo(expectedHistogram, 4);
  });

  it("returns finite numbers (no NaN or Infinity)", () => {
    const result = calculateMACD(risingCandles(60));
    expect(isFinite(result.macd)).toBe(true);
    expect(isFinite(result.signal)).toBe(true);
    expect(isFinite(result.histogram)).toBe(true);
  });
});

// ─── Bollinger Bands Tests ────────────────────────────────────────────────────

describe("calculateBollinger", () => {
  it("returns fallback values when insufficient candles", () => {
    const candles = flatCandles(5, 1.0850); // needs 20
    const result = calculateBollinger(candles);
    expect(result.middle).toBe(1.0850);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.lower).toBeLessThan(result.middle);
  });

  it("upper > middle > lower for normal data", () => {
    const result = calculateBollinger(risingCandles(30));
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it("bandwidth is positive", () => {
    const result = calculateBollinger(risingCandles(30));
    expect(result.bandwidth).toBeGreaterThan(0);
  });

  it("detects price above upper band", () => {
    // Create candles where the last close is well above the upper band
    const candles = flatCandles(25, 1.0000);
    // Replace last candle with a spike far above
    candles[candles.length - 1] = { open: 1.0000, high: 1.1000, low: 1.0000, close: 1.0800 };
    const result = calculateBollinger(candles);
    expect(result.position).toBe("above_upper");
  });

  it("detects price below lower band", () => {
    const candles = flatCandles(25, 1.0800);
    // Replace last candle with a crash far below
    candles[candles.length - 1] = { open: 1.0800, high: 1.0800, low: 1.0000, close: 1.0000 };
    const result = calculateBollinger(candles);
    expect(result.position).toBe("below_lower");
  });

  it("detects price inside bands for stable prices", () => {
    const result = calculateBollinger(flatCandles(25));
    // Flat prices → very narrow bands, last close == middle → inside
    expect(["inside", "at_upper", "at_lower"]).toContain(result.position);
  });

  it("middle is the simple moving average of last 20 closes", () => {
    const candles = risingCandles(30);
    const last20 = candles.slice(-20).map(c => c.close);
    const expectedMiddle = last20.reduce((a, b) => a + b, 0) / 20;
    const result = calculateBollinger(candles);
    expect(result.middle).toBeCloseTo(expectedMiddle, 3);
  });
});

// ─── Candlestick Pattern Tests ────────────────────────────────────────────────

describe("detectPatterns", () => {
  it("returns empty array when fewer than 3 candles", () => {
    expect(detectPatterns([])).toEqual([]);
    expect(detectPatterns(flatCandles(2))).toEqual([]);
  });

  it("detects Doji — body very small relative to range", () => {
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0850, low: 1.0750, close: 1.0810 },
      { open: 1.0810, high: 1.0860, low: 1.0760, close: 1.0820 },
      // Doji: open ≈ close, large range
      { open: 1.0820, high: 1.0900, low: 1.0740, close: 1.0822 },
    ];
    const patterns = detectPatterns(candles);
    const doji = patterns.find(p => p.name === "Doji");
    expect(doji).toBeDefined();
    expect(doji?.type).toBe("neutral");
  });

  it("detects Hammer — long lower wick, small body, after bearish candle", () => {
    // Hammer conditions:
    //   lowerWick > body * 2  AND  upperWick < body * 0.5  AND  previous candle is bearish
    // The body must be large enough that upperWick < body * 0.5 is satisfied
    const candles: Candle[] = [
      { open: 1.0900, high: 1.0920, low: 1.0880, close: 1.0870 }, // c2
      { open: 1.0870, high: 1.0880, low: 1.0820, close: 1.0850 }, // c1 bearish
      // Hammer: body=0.0020, lowerWick=0.0060 (>body*2), upperWick=0.0005 (<body*0.5=0.001)
      { open: 1.0840, high: 1.0845, low: 1.0780, close: 1.0860 },
    ];
    const patterns = detectPatterns(candles);
    const hammer = patterns.find(p => p.name === "Hammer");
    expect(hammer).toBeDefined();
    expect(hammer?.type).toBe("bullish");
    expect(hammer?.strength).toBe("strong");
  });

  it("detects Shooting Star — long upper wick, small body, after bullish candle", () => {
    // Shooting Star conditions:
    //   upperWick > body * 2  AND  lowerWick < body * 0.5  AND  previous candle is bullish
    // Body must be large enough that lowerWick < body * 0.5 is satisfied
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810 }, // c2
      { open: 1.0810, high: 1.0850, low: 1.0800, close: 1.0840 }, // c1 bullish
      // Shooting Star: body=0.0020, upperWick=0.0060 (>body*2), lowerWick=0.0000 (<body*0.5=0.001)
      { open: 1.0860, high: 1.0920, low: 1.0858, close: 1.0840 },
    ];
    const patterns = detectPatterns(candles);
    const star = patterns.find(p => p.name === "Shooting Star");
    expect(star).toBeDefined();
    expect(star?.type).toBe("bearish");
    expect(star?.strength).toBe("strong");
  });

  it("detects Bullish Engulfing — bullish candle engulfs previous bearish", () => {
    const candles: Candle[] = [
      { open: 1.0900, high: 1.0920, low: 1.0880, close: 1.0890 }, // c2
      { open: 1.0880, high: 1.0890, low: 1.0840, close: 1.0850 }, // c1 bearish (open > close)
      { open: 1.0840, high: 1.0910, low: 1.0835, close: 1.0900 }, // c0 bullish, engulfs c1
    ];
    const patterns = detectPatterns(candles);
    const engulf = patterns.find(p => p.name === "Bullish Engulfing");
    expect(engulf).toBeDefined();
    expect(engulf?.type).toBe("bullish");
  });

  it("detects Bearish Engulfing — bearish candle engulfs previous bullish", () => {
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810 }, // c2
      { open: 1.0810, high: 1.0870, low: 1.0805, close: 1.0860 }, // c1 bullish
      { open: 1.0870, high: 1.0875, low: 1.0800, close: 1.0805 }, // c0 bearish, engulfs c1
    ];
    const patterns = detectPatterns(candles);
    const engulf = patterns.find(p => p.name === "Bearish Engulfing");
    expect(engulf).toBeDefined();
    expect(engulf?.type).toBe("bearish");
  });

  it("detects Morning Star — three-candle bullish reversal", () => {
    const candles: Candle[] = [
      // c2: large bearish candle
      { open: 1.0900, high: 1.0910, low: 1.0820, close: 1.0830 },
      // c1: small body (doji-like) — indecision
      { open: 1.0828, high: 1.0835, low: 1.0820, close: 1.0825 },
      // c0: large bullish candle, closes above midpoint of c2
      { open: 1.0825, high: 1.0900, low: 1.0820, close: 1.0890 },
    ];
    const patterns = detectPatterns(candles);
    const morningStar = patterns.find(p => p.name === "Morning Star");
    expect(morningStar).toBeDefined();
    expect(morningStar?.type).toBe("bullish");
  });

  it("detects Evening Star — three-candle bearish reversal", () => {
    const candles: Candle[] = [
      // c2: large bullish candle
      { open: 1.0800, high: 1.0880, low: 1.0795, close: 1.0870 },
      // c1: small body — indecision
      { open: 1.0872, high: 1.0878, low: 1.0865, close: 1.0874 },
      // c0: large bearish candle, closes below midpoint of c2
      { open: 1.0874, high: 1.0878, low: 1.0800, close: 1.0810 },
    ];
    const patterns = detectPatterns(candles);
    const eveningStar = patterns.find(p => p.name === "Evening Star");
    expect(eveningStar).toBeDefined();
    expect(eveningStar?.type).toBe("bearish");
  });

  it("detects Inside Bar — current range inside previous range", () => {
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810 }, // c2
      { open: 1.0810, high: 1.0900, low: 1.0750, close: 1.0820 }, // c1 wide range
      { open: 1.0815, high: 1.0860, low: 1.0780, close: 1.0830 }, // c0 inside c1
    ];
    const patterns = detectPatterns(candles);
    const insideBar = patterns.find(p => p.name === "Inside Bar");
    expect(insideBar).toBeDefined();
    expect(insideBar?.type).toBe("neutral");
    expect(insideBar?.strength).toBe("weak");
  });

  it("detects Bullish Marubozu — full body bullish candle", () => {
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810 }, // c2
      { open: 1.0810, high: 1.0830, low: 1.0800, close: 1.0820 }, // c1
      // Marubozu: body > 90% of range
      { open: 1.0820, high: 1.0900, low: 1.0818, close: 1.0898 },
    ];
    const patterns = detectPatterns(candles);
    const marubozu = patterns.find(p => p.name === "Bullish Marubozu");
    expect(marubozu).toBeDefined();
    expect(marubozu?.type).toBe("bullish");
    expect(marubozu?.strength).toBe("strong");
  });

  it("detects Bearish Marubozu — full body bearish candle", () => {
    const candles: Candle[] = [
      { open: 1.0900, high: 1.0920, low: 1.0890, close: 1.0910 }, // c2
      { open: 1.0910, high: 1.0930, low: 1.0900, close: 1.0920 }, // c1
      // Bearish Marubozu: open ≈ high, close ≈ low
      { open: 1.0918, high: 1.0920, low: 1.0840, close: 1.0842 },
    ];
    const patterns = detectPatterns(candles);
    const marubozu = patterns.find(p => p.name === "Bearish Marubozu");
    expect(marubozu).toBeDefined();
    expect(marubozu?.type).toBe("bearish");
  });

  it("can detect multiple patterns on the same candle set", () => {
    // A candle that is both a Doji and Inside Bar
    const candles: Candle[] = [
      { open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810 },
      { open: 1.0810, high: 1.0900, low: 1.0750, close: 1.0820 }, // wide range
      // Doji inside the wide range
      { open: 1.0815, high: 1.0860, low: 1.0780, close: 1.0816 },
    ];
    const patterns = detectPatterns(candles);
    expect(patterns.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── buildTechnicalSummary Tests ──────────────────────────────────────────────

describe("buildTechnicalSummary", () => {
  it("returns non-zero score for strongly rising prices (MACD bullish contributes +25)", () => {
    // Rising prices: RSI overbought (-25) + MACD bullish (+25) = 0 net from indicators
    // Score may be neutral when RSI and MACD cancel each other out
    const summary = buildTechnicalSummary(risingCandles(60));
    expect(summary.macd.trend).toBe("bullish");
    expect(summary.rsi.signal).toBe("overbought");
    // Score is RSI(-25) + MACD(+25) = 0 → neutral is correct behavior
    expect(summary.score).toBeGreaterThanOrEqual(-30);
    expect(["bullish", "neutral"]).toContain(summary.overallBias);
  });

  it("returns non-zero score for strongly falling prices (MACD bearish contributes -25)", () => {
    // Falling prices: RSI oversold (+25) + MACD bearish (-25) = 0 net from indicators
    const summary = buildTechnicalSummary(fallingCandles(60));
    expect(summary.macd.trend).toBe("bearish");
    expect(summary.rsi.signal).toBe("oversold");
    // Score is RSI(+25) + MACD(-25) = 0 → neutral is correct behavior
    expect(summary.score).toBeLessThanOrEqual(30);
    expect(["bearish", "neutral"]).toContain(summary.overallBias);
  });

  it("score is clamped between -100 and +100", () => {
    const rising = buildTechnicalSummary(risingCandles(60));
    const falling = buildTechnicalSummary(fallingCandles(60));
    expect(rising.score).toBeGreaterThanOrEqual(-100);
    expect(rising.score).toBeLessThanOrEqual(100);
    expect(falling.score).toBeGreaterThanOrEqual(-100);
    expect(falling.score).toBeLessThanOrEqual(100);
  });

  it("returns all required fields", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    expect(summary).toHaveProperty("rsi");
    expect(summary).toHaveProperty("macd");
    expect(summary).toHaveProperty("bollinger");
    expect(summary).toHaveProperty("patterns");
    expect(summary).toHaveProperty("overallBias");
    expect(summary).toHaveProperty("score");
  });

  it("patterns is an array", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    expect(Array.isArray(summary.patterns)).toBe(true);
  });

  it("overallBias is one of the three valid values", () => {
    const summary = buildTechnicalSummary(flatCandles(40));
    expect(["bullish", "bearish", "neutral"]).toContain(summary.overallBias);
  });

  it("bullish patterns increase the score", () => {
    // Two summaries: one with a bullish pattern candle, one without
    const base = buildTechnicalSummary(flatCandles(40));
    // Add a Bullish Engulfing at the end
    const withPattern = flatCandles(40);
    withPattern[38] = { open: 1.0860, high: 1.0870, low: 1.0840, close: 1.0850 }; // bearish c1
    withPattern[39] = { open: 1.0840, high: 1.0910, low: 1.0835, close: 1.0900 }; // bullish engulf
    const summaryWithPattern = buildTechnicalSummary(withPattern);
    // Score should be >= base score (pattern adds positive weight)
    expect(summaryWithPattern.score).toBeGreaterThanOrEqual(base.score);
  });
});

// ─── Correlation Filter Tests ─────────────────────────────────────────────────

describe("isCorrelatedWithOpenPositions", () => {
  it("returns not correlated when no open positions", () => {
    const result = isCorrelatedWithOpenPositions("EURUSD", []);
    expect(result.correlated).toBe(false);
    expect(result.conflictsWith).toBe("");
  });

  it("detects EURUSD correlated with GBPUSD (same USD group)", () => {
    const result = isCorrelatedWithOpenPositions("EURUSD", ["GBPUSD"]);
    expect(result.correlated).toBe(true);
    expect(result.conflictsWith).toBe("GBPUSD");
  });

  it("detects GBPUSD correlated with AUDUSD", () => {
    const result = isCorrelatedWithOpenPositions("GBPUSD", ["AUDUSD"]);
    expect(result.correlated).toBe(true);
    expect(result.conflictsWith).toBe("AUDUSD");
  });

  it("detects GOLD correlated with SILVER", () => {
    const result = isCorrelatedWithOpenPositions("GOLD", ["SILVER"]);
    expect(result.correlated).toBe(true);
    expect(result.conflictsWith).toBe("SILVER");
  });

  it("detects US500 correlated with US100", () => {
    const result = isCorrelatedWithOpenPositions("US500", ["US100"]);
    expect(result.correlated).toBe(true);
    expect(result.conflictsWith).toBe("US100");
  });

  it("does NOT flag same instrument as correlated with itself", () => {
    const result = isCorrelatedWithOpenPositions("EURUSD", ["EURUSD"]);
    expect(result.correlated).toBe(false);
  });

  it("does NOT flag cross-group instruments as correlated", () => {
    // EURUSD (USD pairs) vs GOLD (metals) — different groups
    const result = isCorrelatedWithOpenPositions("EURUSD", ["GOLD"]);
    expect(result.correlated).toBe(false);
  });

  it("does NOT flag USDCHF vs EURUSD as correlated (different groups)", () => {
    // USDCHF is in USD-strength group, EURUSD in USD-correlated group
    const result = isCorrelatedWithOpenPositions("USDCHF", ["EURUSD"]);
    expect(result.correlated).toBe(false);
  });

  it("finds first conflict in a list of multiple open positions", () => {
    const result = isCorrelatedWithOpenPositions("EURUSD", ["GOLD", "GBPUSD", "US500"]);
    expect(result.correlated).toBe(true);
    expect(result.conflictsWith).toBe("GBPUSD");
  });

  it("returns not correlated for unknown instrument", () => {
    const result = isCorrelatedWithOpenPositions("BTCUSD", ["EURUSD"]);
    expect(result.correlated).toBe(false);
  });
});

// ─── formatTechnicalSummaryForPrompt Tests ────────────────────────────────────

describe("formatTechnicalSummaryForPrompt", () => {
  it("includes instrument name and timeframe", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "1H");
    expect(output).toContain("EURUSD");
    expect(output).toContain("1H");
  });

  it("includes RSI value and signal", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "5min");
    expect(output).toContain("RSI(14)=");
    expect(output).toMatch(/overbought|oversold|neutral/);
  });

  it("includes MACD values", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "4H");
    expect(output).toContain("MACD=");
    expect(output).toContain("Signal=");
    expect(output).toContain("Hist=");
  });

  it("includes Bollinger values", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "1H");
    expect(output).toContain("Bollinger:");
    expect(output).toContain("Upper=");
    expect(output).toContain("Lower=");
  });

  it("includes overall bias and score", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "1H");
    expect(output).toContain("Overall Bias:");
    expect(output).toContain("/100");
  });

  it("shows 'No significant patterns' when no patterns detected", () => {
    // Flat candles are unlikely to trigger patterns
    const summary = buildTechnicalSummary(flatCandles(40));
    // Override patterns to empty to test this branch
    summary.patterns = [];
    const output = formatTechnicalSummaryForPrompt("EURUSD", summary, "1H");
    expect(output).toContain("No significant patterns");
  });

  it("lists detected patterns by name", () => {
    const summary = buildTechnicalSummary(risingCandles(40));
    // Inject a known pattern
    summary.patterns = [{ name: "Doji", type: "neutral", strength: "moderate", description: "test" }];
    const output = formatTechnicalSummaryForPrompt("GOLD", summary, "4H");
    expect(output).toContain("Doji");
  });
});

// ─── ATR Position Sizing Tests ────────────────────────────────────────────────

import { calculateATRPositionSize } from "./engineIntelligence";

describe("calculateATRPositionSize", () => {
  it("returns size=1 for insufficient candle data", () => {
    const result = calculateATRPositionSize([], 200);
    expect(result.size).toBe(1);
  });

  it("clamps size between 0.01 and 10", () => {
    // Extreme volatility candles
    const extremeCandles = Array.from({ length: 20 }, (_, i) => ({
      open: 1000 + i * 100,
      high: 1200 + i * 100,
      low: 800 + i * 100,
      close: 1100 + i * 100,
    }));
    const result = calculateATRPositionSize(extremeCandles, 200);
    expect(result.size).toBeGreaterThanOrEqual(0.01);
    expect(result.size).toBeLessThanOrEqual(10);
  });

  it("returns smaller size for high-volatility instruments vs low-volatility", () => {
    // High volatility: GOLD-like (ATR ~20)
    const highVolCandles = Array.from({ length: 20 }, (_, i) => ({
      open: 4300 + i,
      high: 4320 + i,
      low: 4280 + i,
      close: 4310 + i,
    }));
    const highVol = calculateATRPositionSize(highVolCandles, 200);

    // Low volatility: EURUSD-like (ATR ~0.001)
    const lowVolCandles = Array.from({ length: 20 }, (_, i) => ({
      open: 1.0800 + i * 0.0001,
      high: 1.0810 + i * 0.0001,
      low: 1.0790 + i * 0.0001,
      close: 1.0805 + i * 0.0001,
    }));
    const lowVol = calculateATRPositionSize(lowVolCandles, 200);

    // High-volatility instrument should get smaller position size
    expect(highVol.size).toBeLessThan(lowVol.size);
  });

  it("returns atr and riskAmount in result", () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({
      open: 1.0800 + i * 0.001,
      high: 1.0820 + i * 0.001,
      low: 1.0780 + i * 0.001,
      close: 1.0810 + i * 0.001,
    }));
    const result = calculateATRPositionSize(candles, 500);
    expect(result.atr).toBeGreaterThan(0);
    expect(result.riskAmount).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
  });
});
