/**
 * HJ Capital — Engine Intelligence Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements all 9 strategic intelligence systems:
 *
 * 1. Learning Memory System     — AI evaluates each closed trade, stores lessons
 * 2. Dynamic Confidence         — Threshold auto-adjusts based on 7-day win rate
 * 3. Market Regime Detection    — Classify market: Trending/Ranging/Volatile
 * 4. Adaptive ATR Stop Loss     — SL = entry ± (ATR × 2.5), trailing stop logic
 * 5. Client Sentiment           — Capital.com contrarian signal (>75% = reverse)
 * 6. Economic Calendar Filter   — Block trading near high-impact events
 * 7. Ensemble Decision Making   — 2 AI models vote with weighted consensus
 * 8. Daily Bias Filter          — EMA200 on Daily chart determines trend direction
 * 9. Session Filter             — Block low-liquidity sessions per instrument
 */

import { invokeLLM } from "./_core/llm";
import {
  insertTradeLesson,
  getRecentLessons,
  get7DayWinRate,
  getEngineIntelligence,
  updateEngineIntelligence,
} from "./db";
import { notifyRiskAlert } from "./telegram";
import type { Candle } from "./technicalAnalysis";
import { getClientSentiment as capitalGetClientSentiment } from "./capitalcom";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketRegime = "trending_up" | "trending_down" | "ranging" | "volatile";

export interface ClientSentiment {
  instrument: string;
  longPct: number;
  shortPct: number;
  signal: "bullish" | "bearish" | "neutral"; // contrarian interpretation
  strength: "strong" | "moderate" | "weak";
}

export interface EconomicEvent {
  time: string;
  currency: string;
  event: string;
  impact: "high" | "medium" | "low";
}

export interface EnsembleVote {
  model: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  weight: number;
}

export interface EnsembleResult {
  finalAction: "BUY" | "SELL" | "HOLD";
  finalConfidence: number;
  agreement: "unanimous" | "majority" | "split";
  votes: EnsembleVote[];
  combinedReasoning: string;
}

export interface ATRStopLoss {
  stopLoss: number;
  takeProfit: number;
  atr: number;
  riskRewardRatio: number;
}

// ─── 1. Learning Memory System ────────────────────────────────────────────────

/**
 * After a trade closes, call this to have AI evaluate the decision and extract a lesson.
 * The lesson is stored in DB and injected into future prompts.
 */
export async function evaluateClosedTrade(params: {
  tradeId: number;
  instrument: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  originalReasoning: string;
  marketConditionsAtEntry: string;
  mode?: "paper" | "live";
}): Promise<void> {
  try {
    const wasCorrect = params.pnl > 0;
    const pnlStr = params.pnl >= 0 ? `+$${params.pnl.toFixed(2)}` : `-$${Math.abs(params.pnl).toFixed(2)}`;

    const prompt = `You are HJ Capital's trading coach. A trade just closed. Evaluate the decision and extract ONE key lesson.

TRADE DETAILS:
- Instrument: ${params.instrument}
- Direction: ${params.direction}
- Entry: ${params.entryPrice.toFixed(5)}
- Exit: ${params.exitPrice.toFixed(5)}
- P&L: ${pnlStr} (${wasCorrect ? "WIN ✅" : "LOSS ❌"})
- Original AI Reasoning: "${params.originalReasoning}"
- Market Conditions at Entry: ${params.marketConditionsAtEntry}

Respond in JSON:
{
  "wasCorrect": ${wasCorrect},
  "verdict": "Brief 1-sentence verdict on whether the decision was right",
  "lesson": "ONE specific, actionable lesson for future trades on ${params.instrument}. Max 2 sentences.",
  "keyFactor": "The single most important factor that determined the outcome"
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a trading coach. Respond only in valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as any,
    });

    const content = response.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

    await insertTradeLesson({
      tradeId: params.tradeId,
      instrument: params.instrument,
      direction: params.direction,
      entryPrice: params.entryPrice.toFixed(5),
      exitPrice: params.exitPrice.toFixed(5),
      pnl: params.pnl.toFixed(2),
      wasCorrect: parsed.wasCorrect ?? wasCorrect,
      aiVerdict: parsed.verdict ?? "No verdict",
      lessonText: parsed.lesson ?? "No lesson extracted",
      marketConditions: params.marketConditionsAtEntry,
      mode: params.mode ?? "paper",
    });

    console.log(`[Intelligence] Trade lesson saved for ${params.instrument}: ${parsed.lesson}`);
  } catch (err) {
    console.error("[Intelligence] Failed to evaluate trade:", err);
  }
}

/**
 * Format recent lessons for injection into AI prompt.
 */
export async function formatLessonsForPrompt(instrument: string): Promise<string> {
  try {
    // Fetch more lessons so we can prioritize incorrect ones
    const allLessons = await getRecentLessons(instrument, 10);
    if (allLessons.length === 0) return "";

    // Prioritize incorrect lessons (wasCorrect=false) — they carry more learning value
    const incorrect = allLessons.filter((l) => !l.wasCorrect);
    const correct = allLessons.filter((l) => l.wasCorrect);

    // Take up to 3 incorrect + up to 2 correct = max 5 lessons
    const prioritized = [
      ...incorrect.slice(0, 3),
      ...correct.slice(0, 2),
    ].slice(0, 5);

    const lines = prioritized.map((l, i) => {
      const outcome = l.wasCorrect ? "✅ WIN" : "❌ LOSS (IMPORTANT — avoid repeating this mistake)";
      return `  ${i + 1}. [${outcome}] ${l.lessonText}`;
    });

    const incorrectCount = prioritized.filter((l) => !l.wasCorrect).length;
    const header = incorrectCount > 0
      ? `\nPAST LESSONS FOR ${instrument} — ${incorrectCount} mistake(s) highlighted (learn from these):`
      : `\nPAST LESSONS FOR ${instrument} (learn from these):`;

    return `${header}\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ─── 2. Dynamic Confidence Threshold ─────────────────────────────────────────

/**
 * Calculate the dynamic confidence threshold based on 7-day win rate.
 * Also auto-stops the engine if win rate drops below 40%.
 *
 * Returns: { threshold, shouldStop, reason }
 */
// NOTE: _lastWinRateWarnDate is now persisted in the DB (engineIntelligence.lastWinRateWarnDate)
// so it survives server restarts (Autoscale cold starts). The in-memory var is kept as a fast-path cache.
let _lastWinRateWarnDate: string | null = null;

export async function getDynamicConfidenceThreshold(): Promise<{
  threshold: number;
  shouldStop: boolean;
  reason: string;
  winRate: number;
  totalTrades: number;
}> {
  try {
    const { winRate, totalTrades } = await get7DayWinRate();

    // Not enough data — use a low default to allow early trades and build history
    if (totalTrades < 5) {
      return { threshold: 40, shouldStop: false, reason: "Insufficient data (< 5 trades) — using 40% to allow early trades and build history", winRate, totalTrades };
    }

    let threshold: number;
    let reason: string;

    if (winRate >= 70) {
      threshold = 35;
      reason = `Win rate ${winRate}% (excellent) — threshold lowered to 35% to maximize opportunities`;
    } else if (winRate >= 60) {
      threshold = 40;
      reason = `Win rate ${winRate}% (good) — threshold at 40%`;
    } else if (winRate >= 50) {
      threshold = 45;
      reason = `Win rate ${winRate}% (normal) — standard threshold 45%`;
    } else if (winRate >= 40) {
      threshold = 50;
      reason = `Win rate ${winRate}% (below average) — threshold raised to 50% (conservative mode)`;
    } else {
      // Win rate < 40% — raise threshold to 65% (NOT 95%) and send warning, but NEVER auto-stop
      // Auto-stopping means 0 trades = 0 chance to recover. Instead, require higher confidence.
      // The engine will continue but only take very high-confidence setups.
      threshold = 65;
      reason = `Win rate ${winRate}% (below 40%) — threshold raised to 65% (high-confidence mode). Engine continues.`;
      // Only send warning ONCE per day (not every 15-minute cycle).
      // We check BOTH the in-memory cache AND the DB-persisted date so the guard
      // survives Autoscale cold-starts / server restarts.
      const todayDate = new Date().toISOString().slice(0, 10);
      // Fast-path: in-memory cache hit
      if (_lastWinRateWarnDate === todayDate) {
        // Already warned today (in this process) — skip
      } else {
        // Check DB to see if we already warned today in a previous process
        const intel = await getEngineIntelligence();
        const dbWarnDate = intel?.lastWinRateWarnDate ?? null;
        if (dbWarnDate !== todayDate) {
          // First warning today — send it and persist
          _lastWinRateWarnDate = todayDate;
          await updateEngineIntelligence({ lastWinRateWarnDate: todayDate });
          await notifyRiskAlert(
            `⚠️ تحذير: معدل الفوز في آخر 7 أيام ${winRate.toFixed(1)}% (أقل من 40%)\n` +
            `تم رفع الـ confidence threshold لـ 65% (وضع حذر عالي الثقة).\n` +
            `المحرك يستمر بالعمل — فقط الصفقات عالية الثقة سيتم تنفيذها.`
          ).catch(() => {});
        } else {
          // DB says we already warned today — update in-memory cache to avoid future DB lookups
          _lastWinRateWarnDate = todayDate;
        }
      }
    }

    // Persist to DB
    await updateEngineIntelligence({
      dynamicConfidenceThreshold: threshold,
      winRate7d: winRate.toFixed(2),
      trades7d: totalTrades,
    });

    return { threshold, shouldStop: false, reason, winRate, totalTrades };
  } catch (err) {
    console.error("[Intelligence] Dynamic threshold error:", err);
    return { threshold: 45, shouldStop: false, reason: "Error — using default 45%", winRate: 0, totalTrades: 0 };
  }
}

// ─── 3. Market Regime Detection ───────────────────────────────────────────────

/**
 * Detect the current market regime for an instrument.
 * Uses ATR, RSI, and Bollinger Band width.
 */
export function detectMarketRegime(candles: Candle[]): {
  regime: MarketRegime;
  description: string;
  tradingStrategy: string;
} {
  if (candles.length < 20) {
    return {
      regime: "ranging",
      description: "Insufficient data",
      tradingStrategy: "Use small targets, trade range boundaries",
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = candles.length;

  // Calculate ATR (14-period)
  const atrPeriod = 14;
  let atrSum = 0;
  for (let i = n - atrPeriod; i < n; i++) {
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose)
    );
    atrSum += tr;
  }
  const atr = atrSum / atrPeriod;
  const atrPct = (atr / closes[n - 1]) * 100;

  // Calculate RSI (14-period)
  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  // Bollinger Band width (20-period)
  const bbPeriod = 20;
  const bbCloses = closes.slice(n - bbPeriod);
  const bbMean = bbCloses.reduce((a, b) => a + b, 0) / bbPeriod;
  const bbStdDev = Math.sqrt(bbCloses.reduce((sum, c) => sum + Math.pow(c - bbMean, 2), 0) / bbPeriod);
  const bbWidth = (bbStdDev * 4) / bbMean * 100; // % width

  // Trend direction: compare 5-period SMA vs 20-period SMA
  const sma5 = closes.slice(n - 5).reduce((a, b) => a + b, 0) / 5;
  const sma20 = closes.slice(n - 20).reduce((a, b) => a + b, 0) / 20;

  // Regime classification
  let regime: MarketRegime;
  let description: string;
  let tradingStrategy: string;

  if (atrPct > 0.8 && bbWidth > 3) {
    // High volatility
    regime = "volatile";
    description = `High volatility (ATR: ${atrPct.toFixed(2)}%, BB width: ${bbWidth.toFixed(1)}%) — unpredictable market`;
    tradingStrategy = "HOLD — avoid trading in volatile conditions, wait for clarity";
  } else if (atrPct > 0.3 && sma5 > sma20 * 1.001 && rsi > 50) {
    // Trending up
    regime = "trending_up";
    description = `Uptrend (RSI: ${rsi.toFixed(0)}, SMA5 > SMA20, ATR: ${atrPct.toFixed(2)}%)`;
    tradingStrategy = "BUY only — use larger targets (2:1 R:R), trail stop loss";
  } else if (atrPct > 0.3 && sma5 < sma20 * 0.999 && rsi < 50) {
    // Trending down
    regime = "trending_down";
    description = `Downtrend (RSI: ${rsi.toFixed(0)}, SMA5 < SMA20, ATR: ${atrPct.toFixed(2)}%)`;
    tradingStrategy = "SELL only — use larger targets (2:1 R:R), trail stop loss";
  } else {
    // Ranging
    regime = "ranging";
    description = `Ranging market (RSI: ${rsi.toFixed(0)}, BB width: ${bbWidth.toFixed(1)}%, low ATR: ${atrPct.toFixed(2)}%)`;
    tradingStrategy = "Trade range boundaries — small targets (1:1 R:R), tight stops";
  }

  return { regime, description, tradingStrategy };
}

/**
 * Format regime data for AI prompt injection.
 */
export function formatRegimeForPrompt(instrument: string, regimeData: ReturnType<typeof detectMarketRegime>): string {
  return `\nMARKET REGIME [${instrument}]: ${regimeData.regime.toUpperCase().replace("_", " ")}
  Analysis: ${regimeData.description}
  Recommended Strategy: ${regimeData.tradingStrategy}`;
}

// ─── 4. Adaptive ATR Stop Loss ────────────────────────────────────────────────

/**
 * Calculate ATR-based stop loss and take profit levels.
 * SL = entry ± (ATR × 1.5), TP = entry ± (ATR × 3.0) for 2:1 R:R
 */
export function calculateATRStopLoss(
  candles: Candle[],
  entryPrice: number,
  direction: "BUY" | "SELL",
  riskRewardRatio = 2.0
): ATRStopLoss {
  const n = candles.length;
  if (n < 14) {
    // Fallback: 0.5% SL
    const slPct = 0.005;
    const sl = direction === "BUY" ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
    const tp = direction === "BUY" ? entryPrice * (1 + slPct * riskRewardRatio) : entryPrice * (1 - slPct * riskRewardRatio);
    return { stopLoss: sl, takeProfit: tp, atr: entryPrice * slPct, riskRewardRatio };
  }

  // Calculate ATR (14-period)
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  let atrSum = 0;
  for (let i = n - 14; i < n; i++) {
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose)
    );
    atrSum += tr;
  }
  const atr = atrSum / 14;

  // ███ ROUND 54 — ATR multiplier raised 1.5→2.5 to avoid noise-triggered SL hits
  // Analysis showed 72.4% loss rate caused by SL too close to entry (random noise)
  const slDistance = atr * 2.5;
  const tpDistance = atr * 2.5 * riskRewardRatio;

  const stopLoss = direction === "BUY"
    ? entryPrice - slDistance
    : entryPrice + slDistance;

  const takeProfit = direction === "BUY"
    ? entryPrice + tpDistance
    : entryPrice - tpDistance;

  return {
    stopLoss: Math.round(stopLoss * 100000) / 100000,
    takeProfit: Math.round(takeProfit * 100000) / 100000,
    atr: Math.round(atr * 100000) / 100000,
    riskRewardRatio,
  };
}

/**
 * Calculate position size based on ATR and account balance.
 * Risk 1% of balance per trade, size = (balance × riskPct) / (ATR × 2.5)
 * This equalizes risk across all instruments regardless of their volatility.
 */
export function calculateATRPositionSize(
  candles: Candle[],
  accountBalance: number,
  riskPct = 0.01 // 1% of balance per trade
): { size: number; atr: number; riskAmount: number } {
  const n = candles.length;
  const riskAmount = accountBalance * riskPct;

  if (n < 14 || accountBalance <= 0) {
    return { size: 1, atr: 0, riskAmount };
  }

  // Calculate ATR (14-period)
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  let atrSum = 0;
  for (let i = n - 14; i < n; i++) {
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose)
    );
    atrSum += tr;
  }
  const atr = atrSum / 14;

  // ███ ROUND 62 — ATR MISMATCH FIX ███
  // Previously used ATR × 1.5 here but ATR × 2.5 in calculateATRStopLoss.
  // This caused the engine to risk 1.67× more than intended per trade.
  // Now unified: BOTH functions use ATR × 2.5 so position size = exactly 1% of balance.
  const slDistance = atr * 2.5;

  if (slDistance <= 0) {
    return { size: 1, atr: 0, riskAmount };
  }

  // Size = risk amount / SL distance
  // ███ ROUND 52 — TRADING STANDARDS V1 ███
  // Clamp between 0.01 (min) and 1 (max). Reduced from 2→1 to prevent
  // catastrophic leverage on high-value indices (US500/GER40) on a $2,000 account.
  const rawSize = riskAmount / slDistance;
  const size = Math.max(0.01, Math.min(1, parseFloat(rawSize.toFixed(2))));

  return {
    size,
    atr: Math.round(atr * 100000) / 100000,
    riskAmount: Math.round(riskAmount * 100) / 100,
  };
}

/**
 * Calculate trailing stop level based on current profit.
 * ███ ROUND 52 — TRADING STANDARDS V1 (Aggressive Profit Taking) ███
 * - At 40% of target → move SL to breakeven (was 50%)
 * - At 60% of target → move SL to +20% of target (was 75% → +25%)
 * Rationale: "any absolute profit is better than a percentage" — lock gains earlier.
 */
export function calculateTrailingStop(
  direction: "BUY" | "SELL",
  entryPrice: number,
  currentPrice: number,
  originalSL: number,
  takeProfit: number
): { newSL: number; reason: string } {
  const totalTarget = Math.abs(takeProfit - entryPrice);
  const currentProfit = direction === "BUY"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  const profitPct = totalTarget > 0 ? (currentProfit / totalTarget) * 100 : 0;

  if (profitPct >= 60) {
    // Move SL to +20% of target
    const newSL = direction === "BUY"
      ? entryPrice + totalTarget * 0.20
      : entryPrice - totalTarget * 0.20;
    return {
      newSL: Math.round(newSL * 100000) / 100000,
      reason: `Trailing stop: profit at ${profitPct.toFixed(0)}% of target — SL moved to +20% profit`,
    };
  } else if (profitPct >= 40) {
    // Move SL to breakeven
    return {
      newSL: entryPrice,
      reason: `Trailing stop: profit at ${profitPct.toFixed(0)}% of target — SL moved to breakeven`,
    };
  }

  // No change
  return { newSL: originalSL, reason: "No trailing stop adjustment needed" };
}

// ─── 8. Daily Bias Filter ────────────────────────────────────────────────────

/**
 * Determines the daily trend bias using EMA200 on daily candles.
 * This is the PRIMARY filter — no trade should go against the daily trend.
 *
 * Returns:
 *   "bullish"  → price above EMA200 → only BUY signals allowed
 *   "bearish"  → price below EMA200 → only SELL signals allowed
 *   "neutral"  → price within 0.3% of EMA200 → both directions allowed
 *   "unknown"  → insufficient data → both directions allowed
 */
export function getDailyBias(
  dailyCandles: Candle[]
): { bias: "bullish" | "bearish" | "neutral" | "unknown"; ema200: number; currentPrice: number; description: string } {
  if (dailyCandles.length < 20) {
    return { bias: "unknown", ema200: 0, currentPrice: 0, description: "Insufficient daily data for bias calculation" };
  }

  const closes = dailyCandles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // Calculate EMA200 (or EMA of available data if < 200 candles)
  const period = Math.min(200, closes.length);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  const pctFromEma = ((currentPrice - ema) / ema) * 100;
  const NEUTRAL_ZONE = 0.3; // within 0.3% = neutral

  let bias: "bullish" | "bearish" | "neutral";
  let description: string;

  if (Math.abs(pctFromEma) <= NEUTRAL_ZONE) {
    bias = "neutral";
    description = `Price ${currentPrice.toFixed(5)} is within ${NEUTRAL_ZONE}% of EMA${period} (${ema.toFixed(5)}) — neutral zone, both directions valid`;
  } else if (pctFromEma > 0) {
    bias = "bullish";
    description = `Price ${currentPrice.toFixed(5)} is ${pctFromEma.toFixed(2)}% ABOVE EMA${period} (${ema.toFixed(5)}) — BULLISH bias, prefer BUY only`;
  } else {
    bias = "bearish";
    description = `Price ${currentPrice.toFixed(5)} is ${Math.abs(pctFromEma).toFixed(2)}% BELOW EMA${period} (${ema.toFixed(5)}) — BEARISH bias, prefer SELL only`;
  }

  return { bias, ema200: Math.round(ema * 100000) / 100000, currentPrice, description };
}

/**
 * Check if a proposed trade direction aligns with the daily bias.
 * Returns true if the trade is allowed, false if it should be blocked.
 */
export function isTradeAlignedWithDailyBias(
  direction: "BUY" | "SELL",
  bias: "bullish" | "bearish" | "neutral" | "unknown"
): { allowed: boolean; reason: string } {
  if (bias === "neutral" || bias === "unknown") {
    return { allowed: true, reason: `Daily bias is ${bias} — both directions allowed` };
  }
  if (bias === "bullish" && direction === "BUY") {
    return { allowed: true, reason: "BUY aligned with bullish daily trend ✅" };
  }
  if (bias === "bearish" && direction === "SELL") {
    return { allowed: true, reason: "SELL aligned with bearish daily trend ✅" };
  }
  return {
    allowed: false,
    reason: `${direction} BLOCKED — daily bias is ${bias.toUpperCase()}, trade goes against the trend ❌`,
  };
}

/**
 * Format daily bias for AI prompt injection.
 */
export function formatDailyBiasForPrompt(instrument: string, biasData: ReturnType<typeof getDailyBias>): string {
  const emoji = biasData.bias === "bullish" ? "📈" : biasData.bias === "bearish" ? "📉" : "➡️";
  return `DAILY BIAS [${instrument}]: ${emoji} ${biasData.bias.toUpperCase()} — ${biasData.description}`;
}

// ─── 9. Session Filter ────────────────────────────────────────────────────────

/**
 * Determines the current trading session based on UTC hour.
 * Returns session name and quality rating.
 */
export function getCurrentTradingSession(): {
  session: "london" | "newyork" | "overlap" | "asian" | "dead";
  quality: "excellent" | "good" | "poor" | "avoid";
  utcHour: number;
  description: string;
} {
  const utcHour = new Date().getUTCHours();

  if (utcHour >= 7 && utcHour < 9) {
    return { session: "london", quality: "good", utcHour, description: "London open (07:00-09:00 UTC) — building momentum" };
  } else if (utcHour >= 9 && utcHour < 13) {
    return { session: "london", quality: "excellent", utcHour, description: "London prime (09:00-13:00 UTC) — highest liquidity" };
  } else if (utcHour >= 13 && utcHour < 16) {
    return { session: "overlap", quality: "excellent", utcHour, description: "London/NY overlap (13:00-16:00 UTC) — peak volatility and liquidity" };
  } else if (utcHour >= 16 && utcHour < 20) {
    return { session: "newyork", quality: "good", utcHour, description: "New York prime (16:00-20:00 UTC) — strong USD moves" };
  } else if (utcHour >= 20 && utcHour < 22) {
    return { session: "newyork", quality: "poor", utcHour, description: "NY close (20:00-22:00 UTC) — fading volume, avoid new entries" };
  } else if (utcHour >= 22 || utcHour < 2) {
    return { session: "dead", quality: "avoid", utcHour, description: "Dead zone (22:00-02:00 UTC) — no liquidity, wide spreads" };
  } else if (utcHour >= 2 && utcHour < 5) {
    return { session: "asian", quality: "poor", utcHour, description: "Asian session (02:00-05:00 UTC) — low volatility for forex" };
  } else {
    return { session: "asian", quality: "poor", utcHour, description: "Pre-London (05:00-07:00 UTC) — building up" };
  }
}

/**
 * Check if a specific instrument should be traded in the current session.
 * Returns true if trading is allowed, false if it should be skipped.
 *
 * Rules:
 *   - Forex pairs (EURUSD, GBPUSD, AUDUSD, USDCAD, EURGBP, USDJPY):
 *       Block during Asian session (00:00-07:00 UTC) — low liquidity, wide spreads
 *   - GOLD/XAGUSD: Block during dead zone (22:00-02:00 UTC)
 *   - Indices (GER40, US500, NASDAQ): Only trade during their primary session
 *   - ETHUSD/BTCUSD: 24/7 but prefer London/NY sessions
 */
export function isInstrumentTradableInSession(
  instrument: string,
  sessionInfo: ReturnType<typeof getCurrentTradingSession>
): { tradable: boolean; reason: string } {
  const { session, quality, utcHour } = sessionInfo;

  const FOREX_PAIRS = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "EURGBP", "USDJPY"];
  const METALS = ["GOLD", "XAUUSD", "XAGUSD"];
  const EU_INDICES = ["GER40"];
  const US_INDICES = ["US500", "NASDAQ", "US100"];
  const CRYPTO = ["ETHUSD", "BTCUSD"];

  // Dead zone — block everything except crypto
  if (quality === "avoid" && !CRYPTO.includes(instrument)) {
    return { tradable: false, reason: `Dead zone (${utcHour}:00 UTC) — no liquidity for ${instrument}` };
  }

  // Forex: block Asian session
  if (FOREX_PAIRS.includes(instrument) && (utcHour < 7 || utcHour >= 20)) {
    if (utcHour < 7) {
      return { tradable: false, reason: `${instrument} blocked: Asian/pre-London session (${utcHour}:00 UTC) — low liquidity and wide spreads for forex` };
    }
    if (utcHour >= 20) {
      return { tradable: false, reason: `${instrument} blocked: NY close/overnight (${utcHour}:00 UTC) — fading liquidity` };
    }
  }

  // EU Indices: only during London session
  if (EU_INDICES.includes(instrument)) {
    if (utcHour < 7 || utcHour >= 20) {
      return { tradable: false, reason: `${instrument} blocked: outside European trading hours (${utcHour}:00 UTC)` };
    }
  }

  // US Indices: only during NY session
  if (US_INDICES.includes(instrument)) {
    if (utcHour < 13 || utcHour >= 20) {
      return { tradable: false, reason: `${instrument} blocked: outside US trading hours (${utcHour}:00 UTC) — needs 13:00-20:00 UTC` };
    }
  }

  // Metals: block dead zone
  if (METALS.includes(instrument) && (utcHour >= 22 || utcHour < 2)) {
    return { tradable: false, reason: `${instrument} blocked: metals dead zone (${utcHour}:00 UTC)` };
  }

  return { tradable: true, reason: `${instrument} tradable in current session (${session}, ${utcHour}:00 UTC)` };
}

// ─── 5. Client Sentiment (Contrarian Signal) ──────────────────────────────────

/**
 * Fetch Capital.com client sentiment data for multiple instruments.
 * Uses the authenticated Capital.com API (no self-signed cert issues).
 * Applies contrarian logic: if >75% of clients are long → bearish signal.
 */
export async function getClientSentiment(
  _sessionToken: string,
  _cst: string,
  instruments: string[]
): Promise<Record<string, ClientSentiment>> {
  const result: Record<string, ClientSentiment> = {};

  // Retry up to 2 times with a 2s delay to handle transient Capital.com 429/503 errors
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 2000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      // Use the authenticated Capital.com API path (avoids self-signed cert on gbksoft domain)
      const rawItems = await capitalGetClientSentiment(instruments);

      for (const item of rawItems) {
        const longPct = item.longPositionPercentage;
        const shortPct = item.shortPositionPercentage;

        // Contrarian logic
        let signal: "bullish" | "bearish" | "neutral";
        let strength: "strong" | "moderate" | "weak";

        if (longPct >= 80) {
          signal = "bearish"; // Too many longs → expect reversal down
          strength = "strong";
        } else if (longPct >= 70) {
          signal = "bearish";
          strength = "moderate";
        } else if (shortPct >= 80) {
          signal = "bullish"; // Too many shorts → expect reversal up
          strength = "strong";
        } else if (shortPct >= 70) {
          signal = "bullish";
          strength = "moderate";
        } else {
          signal = "neutral";
          strength = "weak";
        }

        result[item.marketId] = { instrument: item.marketId, longPct, shortPct, signal, strength };
      }

      // Success — return immediately
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[Intelligence] Client sentiment fetch error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY_MS}ms...`);
      }
    }
  }

  // All retries exhausted — log once and return empty (engine continues without sentiment data)
  console.warn(`[Intelligence] Client sentiment unavailable after ${MAX_RETRIES + 1} attempts — continuing without it. Last error:`, lastErr);
  return result;
}

/**
 * Format client sentiment for AI prompt injection.
 */
export function formatSentimentSignalForPrompt(sentimentMap: Record<string, ClientSentiment>): string {
  const lines = Object.values(sentimentMap).map((s) => {
    const arrow = s.signal === "bullish" ? "↑" : s.signal === "bearish" ? "↓" : "→";
    return `  ${s.instrument}: ${s.longPct}% long / ${s.shortPct}% short → Contrarian signal: ${arrow} ${s.signal.toUpperCase()} (${s.strength})`;
  });

  if (lines.length === 0) return "";
  return `\nCLIENT SENTIMENT (Contrarian Analysis):\n${lines.join("\n")}\nNote: When >75% of retail traders are on one side, expect a reversal in the OPPOSITE direction.`;
}

// ─── 6. Economic Calendar Filter ─────────────────────────────────────────────

/**
 * Check if there are any high-impact economic events in the next 4 hours.
 * Uses Forex Factory RSS feed.
 * Returns: { hasHighImpact, events, shouldSkip }
 */
export async function checkEconomicCalendar(): Promise<{
  hasHighImpact: boolean;
  events: EconomicEvent[];
  shouldSkip: boolean;
  reason: string;
}> {
  try {
    // Forex Factory RSS — today's calendar
    const res = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      { signal: AbortSignal.timeout(6000) }
    );

    if (!res.ok) {
      return { hasHighImpact: false, events: [], shouldSkip: false, reason: "Calendar unavailable" };
    }

    const data = await res.json() as Array<{
      title: string;
      country: string;
      date: string;
      time: string;
      impact: string;
      forecast: string;
      previous: string;
    }>;

    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    // High-impact keywords
    const highImpactKeywords = [
      "Non-Farm", "NFP", "FOMC", "Fed Rate", "Interest Rate",
      "CPI", "GDP", "Unemployment", "ECB", "BOE", "BOJ",
      "Inflation", "Retail Sales", "PMI Flash",
    ];

    const highImpactCurrencies = ["USD", "EUR", "GBP", "JPY", "CHF"];

    const upcomingHighImpact: EconomicEvent[] = [];

    for (const event of data) {
      if (event.impact !== "High") continue;
      if (!highImpactCurrencies.includes(event.country)) continue;

      // Parse event time
      try {
        const eventDate = new Date(`${event.date} ${event.time}`);
        if (eventDate >= now && eventDate <= fourHoursLater) {
          const isKeyword = highImpactKeywords.some((kw) =>
            event.title.toLowerCase().includes(kw.toLowerCase())
          );
          if (isKeyword || event.impact === "High") {
            upcomingHighImpact.push({
              time: eventDate.toISOString(),
              currency: event.country,
              event: event.title,
              impact: "high",
            });
          }
        }
      } catch { /* skip malformed dates */ }
    }

    if (upcomingHighImpact.length > 0) {
      const eventList = upcomingHighImpact
        .map((e) => `${e.currency}: ${e.event} at ${new Date(e.time).toLocaleTimeString()}`)
        .join(", ");

      return {
        hasHighImpact: true,
        events: upcomingHighImpact,
        shouldSkip: true,
        reason: `High-impact events in next 4 hours: ${eventList}`,
      };
    }

    return { hasHighImpact: false, events: [], shouldSkip: false, reason: "No high-impact events" };
  } catch (err) {
    console.warn("[Intelligence] Economic calendar error:", err);
    return { hasHighImpact: false, events: [], shouldSkip: false, reason: "Calendar check failed — proceeding" };
  }
}

// ─── 7. Ensemble Decision Making (3 AI Models) ───────────────────────────────

/**
 * Run the same market analysis prompt through 3 different AI models.
 * Returns weighted consensus decision.
 *
 * Weights: Claude 40%, GPT-4o 35%, Gemini Flash 25%
 */
export async function runEnsembleAnalysis(prompt: string): Promise<EnsembleResult> {
  // 2-model ensemble: Claude leads (70%) + GPT-4o confirms (30%)
  // Gemini Flash removed — Claude provides deeper financial reasoning
  const models = [
    { id: "claude-sonnet-4-5", name: "Claude Sonnet", weight: 0.70 },
    { id: "gpt-4o", name: "GPT-4o", weight: 0.30 },
  ];

  const systemPrompt = "You are a professional forex and commodities trader. You respond only in valid JSON.";

  // Run all 3 models in parallel
  const results = await Promise.allSettled(
    models.map(async (model) => {
      const response = await invokeLLM({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" } as any,
      });

      const content = response.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

      return {
        model: model.name,
        action: (parsed.action ?? "HOLD") as "BUY" | "SELL" | "HOLD",
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? "No reasoning",
        weight: model.weight,
      } as EnsembleVote;
    })
  );

  // Collect successful votes
  const votes: EnsembleVote[] = results
    .filter((r): r is PromiseFulfilledResult<EnsembleVote> => r.status === "fulfilled")
    .map((r) => r.value);

  if (votes.length === 0) {
    return {
      finalAction: "HOLD",
      finalConfidence: 0,
      agreement: "split",
      votes: [],
      combinedReasoning: "All models failed — defaulting to HOLD",
    };
  }

  // Calculate weighted scores for each action
  const scores: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  let totalWeight = 0;

  for (const vote of votes) {
    const actionScore = (vote.confidence / 100) * vote.weight;
    scores[vote.action] = (scores[vote.action] ?? 0) + actionScore;
    totalWeight += vote.weight;
  }

  // Normalize
  if (totalWeight > 0) {
    for (const key of Object.keys(scores)) {
      scores[key] /= totalWeight;
    }
  }

  // Find winning action
  const finalAction = (Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0]) as "BUY" | "SELL" | "HOLD";

  // Use the HIGHEST individual vote confidence for the winning action (not weighted average)
  // This prevents the weighted math from artificially deflating confidence scores
  // e.g. if Claude says BUY@80%, GPT says BUY@75%, Gemini says HOLD@0% → confidence = 80% (not 46%)
  const winningVotes = votes.filter((v) => v.action === finalAction);
  const bestVoteConfidence = winningVotes.length > 0
    ? Math.max(...winningVotes.map((v) => v.confidence))
    : Math.round(scores[finalAction] * 100);
  // Blend: 70% best vote + 30% weighted average for balance
  const weightedConfidence = Math.round(scores[finalAction] * 100);
  const finalConfidence = Math.round(bestVoteConfidence * 0.7 + weightedConfidence * 0.3);

  // Determine agreement level
  // NOTE: With exactly 2 models, "majority" is mathematically impossible:
  //   - Both agree on same action → "unanimous" (2/2)
  //   - They disagree → "split" (1/2 each, no majority)
  // We use weight-based agreement instead:
  //   - Unanimous: both models chose the same action
  //   - Split: models disagree (Claude 70% vs GPT-4o 30%)
  //   - "majority" is kept in the type for forward compatibility (e.g. if 3rd model is re-added)
  const actionCounts = votes.reduce((acc, v) => {
    acc[v.action] = (acc[v.action] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxCount = Math.max(...Object.values(actionCounts));
  let agreement: "unanimous" | "majority" | "split";

  if (votes.length <= 1) {
    // Only one model responded — treat as unanimous (no comparison possible)
    agreement = "unanimous";
  } else if (maxCount === votes.length) {
    // All models agree
    agreement = "unanimous";
  } else if (votes.length === 2) {
    // 2-model ensemble: if they disagree, it's always a split (no majority possible)
    // The weighted score already handles this — Claude (70%) dominates
    agreement = "split";
  } else if (maxCount > votes.length / 2) {
    // 3+ models: true majority
    agreement = "majority";
  } else {
    agreement = "split";
  }

  // Build combined reasoning
  const reasoningLines = votes.map((v) =>
    `  [${v.model} — ${v.action} @ ${v.confidence}%]: ${v.reasoning}`
  );
  const combinedReasoning = `Ensemble (${agreement}):\n${reasoningLines.join("\n")}`;

  console.log(`[Intelligence] Ensemble: ${finalAction} @ ${finalConfidence}% (${agreement}) — ${votes.length}/2 models responded`);

  return { finalAction, finalConfidence, agreement, votes, combinedReasoning };
}

/**
 * Determine trade size multiplier based on ensemble agreement.
 * 2-model ensemble (Claude 70% + GPT-4o 30%):
 * - Unanimous (both agree) → full size (1.0×)
 * - Split (disagree) → allow trade at 50% size if Claude (the lead model) is confident
 *   Claude carries 70% weight, so if Claude says BUY with high confidence, we trust it
 */
export function getEnsembleSizeMultiplier(result: EnsembleResult): number {
  // Pure HOLD → skip (no trade)
  if (result.finalAction === "HOLD") return 0;

  // BUY or SELL with unanimous agreement → full size
  if (result.agreement === "unanimous") return 1.0;

  // BUY or SELL with majority (one model agrees) → 0.7x size
  if (result.agreement === "majority") return 0.7;

  // BUY or SELL split but finalConfidence ≥40% → 0.5x size (portfolio manager takes calculated risks)
  if (result.finalConfidence >= 40) return 0.5;

  // BUY or SELL split with very low confidence → 0.4x (still trade, just smaller)
  return 0.4;
}

// ─── 10. Volatility Filter ────────────────────────────────────────────────────

/**
 * ███ ROUND 62: Volatility Filter
 *
 * Rejects trades when the market is abnormally volatile (ATR > 2× its 14-period average).
 * Abnormal volatility = erratic price action = unpredictable SL hits.
 *
 * Returns:
 *   tradable: true  → volatility is normal, proceed
 *   tradable: false → volatility is too high, skip this cycle
 */
export function checkVolatilityFilter(
  candles: Candle[],
  instrument: string
): { tradable: boolean; atr: number; avgAtr: number; ratio: number; reason: string } {
  if (candles.length < 28) {
    return { tradable: true, atr: 0, avgAtr: 0, ratio: 1, reason: "Insufficient data for volatility check — proceeding" };
  }

  // Calculate ATR for each of the last 28 candles (14-period ATR × 2 lookback)
  const atrs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrs.push(tr);
  }

  // Current ATR = average of last 14 true ranges
  const currentAtrs = atrs.slice(-14);
  const currentAtr = currentAtrs.reduce((s, v) => s + v, 0) / currentAtrs.length;

  // Average ATR = average of the 14 true ranges BEFORE the current period (baseline)
  const baselineAtrs = atrs.slice(-28, -14);
  const avgAtr = baselineAtrs.length > 0
    ? baselineAtrs.reduce((s, v) => s + v, 0) / baselineAtrs.length
    : currentAtr;

  const ratio = avgAtr > 0 ? currentAtr / avgAtr : 1;
  const VOLATILITY_THRESHOLD = 2.0; // Block if current ATR > 2× baseline

  if (ratio > VOLATILITY_THRESHOLD) {
    return {
      tradable: false,
      atr: Math.round(currentAtr * 100000) / 100000,
      avgAtr: Math.round(avgAtr * 100000) / 100000,
      ratio: Math.round(ratio * 100) / 100,
      reason: `[Volatility Filter] ${instrument} ATR is ${ratio.toFixed(2)}× normal — abnormal volatility, skipping cycle`,
    };
  }

  return {
    tradable: true,
    atr: Math.round(currentAtr * 100000) / 100000,
    avgAtr: Math.round(avgAtr * 100000) / 100000,
    ratio: Math.round(ratio * 100) / 100,
    reason: `${instrument} volatility normal (ATR ratio: ${ratio.toFixed(2)}×)`,
  };
}
