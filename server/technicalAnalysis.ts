/**
 * Technical Analysis Engine for HJ Capital
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   1. RSI (Relative Strength Index)
 *   2. MACD (Moving Average Convergence Divergence)
 *   3. Bollinger Bands
 *   4. Candlestick Pattern Recognition
 *   5. Correlation Filter (prevent correlated positions)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp?: string;
}

export interface RSIResult {
  value: number;
  signal: "oversold" | "overbought" | "neutral";
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: "bullish" | "bearish" | "neutral";
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  position: "above_upper" | "below_lower" | "inside" | "at_upper" | "at_lower";
}

export interface CandlePattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  strength: "strong" | "moderate" | "weak";
  description: string;
}

export interface TechnicalSummary {
  rsi: RSIResult;
  macd: MACDResult;
  bollinger: BollingerResult;
  patterns: CandlePattern[];
  overallBias: "bullish" | "bearish" | "neutral";
  score: number; // -100 to +100
}

// ─── RSI ──────────────────────────────────────────────────────────────────────

export function calculateRSI(candles: Candle[], period = 14): RSIResult {
  if (candles.length < period + 1) {
    return { value: 50, signal: "neutral" };
  }

  const closes = candles.map((c) => c.close);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  // Initial averages
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Smooth using Wilder's method
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return {
    value: Math.round(rsi * 100) / 100,
    signal: rsi < 30 ? "oversold" : rsi > 70 ? "overbought" : "neutral",
  };
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  if (candles.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0, trend: "neutral" };
  }

  const closes = candles.map((c) => c.close);
  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);

  const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
  const signalLine = ema(macdLine.slice(-signalPeriod * 3), signalPeriod);

  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const histogram = lastMACD - lastSignal;

  return {
    macd: Math.round(lastMACD * 100000) / 100000,
    signal: Math.round(lastSignal * 100000) / 100000,
    histogram: Math.round(histogram * 100000) / 100000,
    trend:
      histogram > 0 && lastMACD > 0
        ? "bullish"
        : histogram < 0 && lastMACD < 0
        ? "bearish"
        : "neutral",
  };
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────────

export function calculateBollinger(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2
): BollingerResult {
  if (candles.length < period) {
    const last = candles[candles.length - 1]?.close ?? 0;
    return {
      upper: last * 1.02,
      middle: last,
      lower: last * 0.98,
      bandwidth: 4,
      position: "inside",
    };
  }

  const closes = candles.slice(-period).map((c) => c.close);
  const middle = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const bandwidth = ((upper - lower) / middle) * 100;
  const lastClose = closes[closes.length - 1];

  let position: BollingerResult["position"] = "inside";
  if (lastClose > upper * 1.001) position = "above_upper";
  else if (lastClose < lower * 0.999) position = "below_lower";
  else if (lastClose > upper * 0.998) position = "at_upper";
  else if (lastClose < lower * 1.002) position = "at_lower";

  return {
    upper: Math.round(upper * 100000) / 100000,
    middle: Math.round(middle * 100000) / 100000,
    lower: Math.round(lower * 100000) / 100000,
    bandwidth: Math.round(bandwidth * 100) / 100,
    position,
  };
}

// ─── Candlestick Pattern Recognition ─────────────────────────────────────────

export function detectPatterns(candles: Candle[]): CandlePattern[] {
  if (candles.length < 3) return [];
  const patterns: CandlePattern[] = [];

  const c0 = candles[candles.length - 1]; // current
  const c1 = candles[candles.length - 2]; // previous
  const c2 = candles[candles.length - 3]; // two bars ago

  const body0 = Math.abs(c0.close - c0.open);
  const body1 = Math.abs(c1.close - c1.open);
  const range0 = c0.high - c0.low;
  const range1 = c1.high - c1.low;
  const isBull0 = c0.close > c0.open;
  const isBull1 = c1.close > c1.open;

  // Doji — body is very small relative to range
  if (body0 < range0 * 0.1 && range0 > 0) {
    patterns.push({
      name: "Doji",
      type: "neutral",
      strength: "moderate",
      description: "Indecision candle — potential reversal signal",
    });
  }

  // Hammer — small body at top, long lower wick (bullish reversal)
  const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;
  const upperWick0 = c0.high - Math.max(c0.open, c0.close);
  if (lowerWick0 > body0 * 2 && upperWick0 < body0 * 0.5 && !isBull1) {
    patterns.push({
      name: "Hammer",
      type: "bullish",
      strength: "strong",
      description: "Bullish reversal — buyers pushed price up from lows",
    });
  }

  // Shooting Star — small body at bottom, long upper wick (bearish reversal)
  if (upperWick0 > body0 * 2 && lowerWick0 < body0 * 0.5 && isBull1) {
    patterns.push({
      name: "Shooting Star",
      type: "bearish",
      strength: "strong",
      description: "Bearish reversal — sellers rejected higher prices",
    });
  }

  // Bullish Engulfing — current bullish candle engulfs previous bearish
  if (isBull0 && !isBull1 && c0.open < c1.close && c0.close > c1.open) {
    patterns.push({
      name: "Bullish Engulfing",
      type: "bullish",
      strength: "strong",
      description: "Strong bullish reversal — buyers overwhelmed sellers",
    });
  }

  // Bearish Engulfing — current bearish candle engulfs previous bullish
  if (!isBull0 && isBull1 && c0.open > c1.close && c0.close < c1.open) {
    patterns.push({
      name: "Bearish Engulfing",
      type: "bearish",
      strength: "strong",
      description: "Strong bearish reversal — sellers overwhelmed buyers",
    });
  }

  // Morning Star — three-candle bullish reversal
  const isBull2 = c2.close > c2.open;
  const body2 = Math.abs(c2.close - c2.open);
  if (!isBull2 && body1 < body2 * 0.3 && isBull0 && c0.close > (c2.open + c2.close) / 2) {
    patterns.push({
      name: "Morning Star",
      type: "bullish",
      strength: "strong",
      description: "Three-candle bullish reversal pattern",
    });
  }

  // Evening Star — three-candle bearish reversal
  if (isBull2 && body1 < body2 * 0.3 && !isBull0 && c0.close < (c2.open + c2.close) / 2) {
    patterns.push({
      name: "Evening Star",
      type: "bearish",
      strength: "strong",
      description: "Three-candle bearish reversal pattern",
    });
  }

  // Inside Bar — current range inside previous range (consolidation)
  if (c0.high < c1.high && c0.low > c1.low) {
    patterns.push({
      name: "Inside Bar",
      type: "neutral",
      strength: "weak",
      description: "Consolidation — potential breakout incoming",
    });
  }

  // Marubozu — full body candle, very small wicks (strong momentum)
  if (body0 > range0 * 0.9) {
    patterns.push({
      name: isBull0 ? "Bullish Marubozu" : "Bearish Marubozu",
      type: isBull0 ? "bullish" : "bearish",
      strength: "strong",
      description: `Strong ${isBull0 ? "bullish" : "bearish"} momentum — no rejection`,
    });
  }

  return patterns;
}

// ─── Full Technical Summary ───────────────────────────────────────────────────

export function buildTechnicalSummary(candles: Candle[]): TechnicalSummary {
  const rsi = calculateRSI(candles);
  const macd = calculateMACD(candles);
  const bollinger = calculateBollinger(candles);
  const patterns = detectPatterns(candles);

  // Score: -100 (strongly bearish) to +100 (strongly bullish)
  let score = 0;

  // RSI contribution
  if (rsi.signal === "oversold") score += 25;
  else if (rsi.signal === "overbought") score -= 25;

  // MACD contribution
  if (macd.trend === "bullish") score += 25;
  else if (macd.trend === "bearish") score -= 25;

  // Bollinger contribution
  if (bollinger.position === "below_lower") score += 20;
  else if (bollinger.position === "above_upper") score -= 20;
  else if (bollinger.position === "at_lower") score += 10;
  else if (bollinger.position === "at_upper") score -= 10;

  // Pattern contribution
  for (const p of patterns) {
    const weight = p.strength === "strong" ? 15 : p.strength === "moderate" ? 8 : 4;
    if (p.type === "bullish") score += weight;
    else if (p.type === "bearish") score -= weight;
  }

  score = Math.max(-100, Math.min(100, score));

  const overallBias: TechnicalSummary["overallBias"] =
    score > 20 ? "bullish" : score < -20 ? "bearish" : "neutral";

  return { rsi, macd, bollinger, patterns, overallBias, score };
}

// ─── EMA (Exponential Moving Average) ───────────────────────────────────────

/**
 * Calculate EMA for a given period. Used for trend direction filter.
 * EMA 50 vs EMA 200 = primary trend direction.
 */
export function calculateEMA(candles: Candle[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1]?.close ?? 0;
  const closes = candles.map((c) => c.close);
  const k = 2 / (period + 1);
  let emaVal = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    emaVal = closes[i] * k + emaVal * (1 - k);
  }
  return Math.round(emaVal * 100000) / 100000;
}

/**
 * Get trend direction based on EMA 50 vs EMA 200.
 * Returns: 'up' if EMA50 > EMA200, 'down' if EMA50 < EMA200, 'neutral' if insufficient data.
 */
export function getEMATrend(candles: Candle[]): {
  trend: "up" | "down" | "neutral";
  ema50: number;
  ema200: number;
  description: string;
} {
  if (candles.length < 200) {
    // Not enough candles for EMA200 — use EMA50 vs SMA20 as fallback
    if (candles.length >= 50) {
      const ema50 = calculateEMA(candles, 50);
      const sma20 = candles.slice(-20).reduce((a, c) => a + c.close, 0) / 20;
      const trend = ema50 > sma20 ? "up" : "down";
      return { trend, ema50, ema200: sma20, description: `EMA50(${ema50.toFixed(5)}) ${trend === "up" ? ">" : "<"} SMA20(${sma20.toFixed(5)}) — ${trend === "up" ? "Uptrend" : "Downtrend"}` };
    }
    return { trend: "neutral", ema50: 0, ema200: 0, description: "Insufficient data for trend detection" };
  }
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const trend = ema50 > ema200 ? "up" : "down";
  const gap = Math.abs((ema50 - ema200) / ema200 * 100);
  return {
    trend,
    ema50,
    ema200,
    description: `EMA50(${ema50.toFixed(5)}) ${trend === "up" ? ">" : "<"} EMA200(${ema200.toFixed(5)}) — ${trend === "up" ? "Uptrend" : "Downtrend"} (gap: ${gap.toFixed(3)}%)`,
  };
}

// ─── Correlation Filter ───────────────────────────────────────────────────────

// Instruments that are highly correlated — avoid opening both simultaneously
const CORRELATION_GROUPS: string[][] = [
  // Forex: EUR/GBP/AUD/NZD vs USD (all move together when USD moves)
  ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "NZDUSD", "EURAUD", "GBPAUD", "EURJPY", "GBPJPY"],
  // Forex: USD strength pairs (inverse correlation with above)
  ["USDCHF", "USDJPY", "USDCAD"],
  // Forex: AUD/NZD crosses
  ["AUDJPY", "NZDJPY", "AUDCAD", "AUDCHF", "NZDCAD", "NZDCHF"],
  // Forex: EUR/GBP crosses
  ["EURCAD", "EURCHF", "GBPCAD", "GBPCHF", "CADJPY", "CHFJPY"],
  // Precious metals (Gold + Silver + Platinum + Palladium)
  // XAGUSD is our instrument name; SILVER is the Capital.com epic — include both for correlation
  ["GOLD", "XAGUSD", "SILVER", "PLATINUM", "PALLADIUM", "COPPER"],
  // US indices (S&P 500, NASDAQ, Dow Jones)
  ["US500", "NASDAQ", "US100", "US30"],
  // European indices
  ["GER40", "FRA40", "UK100", "SPAIN35", "SWISS20", "NETH25"],
  // Asia-Pacific indices
  ["JPN225", "AUS200", "HK50", "SING30"],
  // Oil and energy
  ["OIL_CRUDE", "NGAS"],
  // Agricultural commodities
  ["WHEAT", "CORN", "SUGAR", "COFFEE", "COCOA", "COTTON"],
  // US Tech stocks (highly correlated with NASDAQ)
  ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "NFLX", "AMD", "INTC"],
  // Crypto
  ["ETHUSD", "XRPUSD", "LTCUSD", "ADAUSD", "SOLUSD"],
];

export function isCorrelatedWithOpenPositions(
  instrument: string,
  openInstruments: string[]
): { correlated: boolean; conflictsWith: string } {
  for (const group of CORRELATION_GROUPS) {
    if (!group.includes(instrument)) continue;
    for (const open of openInstruments) {
      if (group.includes(open) && open !== instrument) {
        return { correlated: true, conflictsWith: open };
      }
    }
  }
  return { correlated: false, conflictsWith: "" };
}

// ─── Format for AI Prompt ─────────────────────────────────────────────────────

export function formatTechnicalSummaryForPrompt(
  instrument: string,
  summary: TechnicalSummary,
  timeframe: string
): string {
  const patternStr =
    summary.patterns.length > 0
      ? summary.patterns.map((p) => `${p.name} (${p.type})`).join(", ")
      : "No significant patterns";

  return `${instrument} [${timeframe}]:
  RSI(14)=${summary.rsi.value} (${summary.rsi.signal})
  MACD=${summary.macd.macd.toFixed(5)} | Signal=${summary.macd.signal.toFixed(5)} | Hist=${summary.macd.histogram.toFixed(5)} → ${summary.macd.trend}
  Bollinger: Upper=${summary.bollinger.upper} | Mid=${summary.bollinger.middle} | Lower=${summary.bollinger.lower} | Price ${summary.bollinger.position}
  Patterns: ${patternStr}
  Overall Bias: ${summary.overallBias.toUpperCase()} (score: ${summary.score}/100)`;
}
