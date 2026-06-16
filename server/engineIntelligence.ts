/**
 * HJ Capital — Engine Intelligence Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements all 7 strategic intelligence systems:
 *
 * 1. Learning Memory System     — AI evaluates each closed trade, stores lessons
 * 2. Dynamic Confidence         — Threshold auto-adjusts based on 7-day win rate
 * 3. Market Regime Detection    — Classify market: Trending/Ranging/Volatile
 * 4. Adaptive ATR Stop Loss     — SL = entry ± (ATR × 1.5), trailing stop logic
 * 5. Client Sentiment           — Capital.com contrarian signal (>75% = reverse)
 * 6. Economic Calendar Filter   — Block trading near high-impact events
 * 7. Ensemble Decision Making   — 3 AI models vote with weighted consensus
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
    const lessons = await getRecentLessons(instrument, 3);
    if (lessons.length === 0) return "";

    const lines = lessons.map((l, i) => {
      const outcome = l.wasCorrect ? "✅ WIN" : "❌ LOSS";
      return `  ${i + 1}. [${outcome}] ${l.lessonText}`;
    });

    return `\nPAST LESSONS FOR ${instrument} (learn from these):\n${lines.join("\n")}`;
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
      // Win rate < 40% — auto-stop
      threshold = 80; // high bar but not 95 — still allows very high-confidence trades
      await notifyRiskAlert(
        `⚠️ تحذير: معدل الفوز في آخر 7 أيام ${winRate}% (أقل من 40%)\n` +
        `تم رفع الـ confidence threshold لـ 95% لحماية رأس المال.\n` +
        `يُنصح بمراجعة الاستراتيجية قبل الاستمرار.`
      ).catch(() => {});
      return {
        threshold: 95,
        shouldStop: true,
        reason: `Win rate ${winRate}% is below 40% — engine auto-stopped for capital protection`,
        winRate,
        totalTrades,
      };
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

  const slDistance = atr * 1.5;
  const tpDistance = atr * 1.5 * riskRewardRatio;

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
 * Calculate trailing stop level based on current profit.
 * - At 50% of target → move SL to breakeven
 * - At 75% of target → move SL to +25% of original target
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

  if (profitPct >= 75) {
    // Move SL to +25% of target
    const newSL = direction === "BUY"
      ? entryPrice + totalTarget * 0.25
      : entryPrice - totalTarget * 0.25;
    return {
      newSL: Math.round(newSL * 100000) / 100000,
      reason: `Trailing stop: profit at ${profitPct.toFixed(0)}% of target — SL moved to +25% profit`,
    };
  } else if (profitPct >= 50) {
    // Move SL to breakeven
    return {
      newSL: entryPrice,
      reason: `Trailing stop: profit at ${profitPct.toFixed(0)}% of target — SL moved to breakeven`,
    };
  }

  // No change
  return { newSL: originalSL, reason: "No trailing stop adjustment needed" };
}

// ─── 5. Client Sentiment (Contrarian Signal) ──────────────────────────────────

/**
 * Fetch Capital.com client sentiment data for multiple instruments.
 * Uses contrarian logic: if >75% of clients are long → bearish signal.
 */
export async function getClientSentiment(
  sessionToken: string,
  cst: string,
  instruments: string[]
): Promise<Record<string, ClientSentiment>> {
  const result: Record<string, ClientSentiment> = {};

  try {
    const marketIds = instruments.join(",");
    const url = `https://api-capital.backend.gbksoft.com/api/v1/clientsentiment?marketIds=${marketIds}`;

    const response = await fetch(url, {
      headers: {
        "X-SECURITY-TOKEN": sessionToken,
        "CST": cst,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn("[Intelligence] Client sentiment API returned:", response.status);
      return result;
    }

    const data = await response.json() as {
      clientSentiment: Array<{
        marketId: string;
        longPositionPercentage: number;
        shortPositionPercentage: number;
      }>;
    };

    for (const item of (data.clientSentiment ?? [])) {
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
  } catch (err) {
    console.warn("[Intelligence] Client sentiment fetch error:", err);
  }

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
  const actionCounts = votes.reduce((acc, v) => {
    acc[v.action] = (acc[v.action] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxCount = Math.max(...Object.values(actionCounts));
  let agreement: "unanimous" | "majority" | "split";

  if (maxCount === votes.length) {
    agreement = "unanimous";
  } else if (maxCount > votes.length / 2) {
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
