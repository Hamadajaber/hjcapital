/**
 * Self-Learning Engine — HJ Capital Platform
 *
 * After every closed trade, the AI analyzes the outcome, extracts a lesson,
 * and updates per-instrument performance scores. A weekly meta-analysis then
 * reads all accumulated lessons and auto-adjusts global strategy thresholds.
 *
 * Flow:
 *   Trade closes → analyzeClosedTrade() → updates instrument_performance + trade_lessons
 *   Weekly cron → runWeeklyMetaAnalysis() → reads all lessons → adjusts risk_settings
 */

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  instrumentPerformance,
  strategyAdjustments,
  tradeLessons,
  riskSettings,
  type InstrumentPerformance,
} from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getRecentLessons } from "./db";
import { sendTelegramMessage } from "./telegram";

// Helper that throws if DB is unavailable
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("[LearningEngine] Database not available");
  return db;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClosedTradeContext {
  tradeId: number;
  instrument: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  size: number;
  openedAt: Date;
  closedAt: Date;
  closeReason?: string;
  aiReasoning?: string;
  aiConfidence?: number;
  marketConditions?: string;
}

export interface InstrumentScore {
  instrument: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
  score: number;
  aiAnalysis: string | null;
  recommendedConfidence: number | null;
  isEnabled: boolean;
  lastTradeAt: Date | null;
  updatedAt: Date;
}

function rowToScore(r: InstrumentPerformance): InstrumentScore {
  return {
    instrument: r.instrument,
    wins: r.wins,
    losses: r.losses,
    totalTrades: r.totalTrades,
    totalPnl: parseFloat(r.totalPnl),
    avgPnl: parseFloat(r.avgPnl),
    winRate: parseFloat(r.winRate),
    score: r.score,
    aiAnalysis: r.aiAnalysis ?? null,
    recommendedConfidence: r.recommendedConfidence ?? null,
    isEnabled: r.isEnabled,
    lastTradeAt: r.lastTradeAt ?? null,
    updatedAt: r.updatedAt,
  };
}

// ─── Instrument Performance DB Helpers ───────────────────────────────────────

export async function getInstrumentPerformance(instrument: string): Promise<InstrumentScore | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(instrumentPerformance)
    .where(eq(instrumentPerformance.instrument, instrument))
    .limit(1);
  if (!rows.length) return null;
  return rowToScore(rows[0] as InstrumentPerformance);
}

export async function getAllInstrumentPerformance(): Promise<InstrumentScore[]> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(instrumentPerformance)
    .orderBy(desc(instrumentPerformance.score));
  return (rows as InstrumentPerformance[]).map(rowToScore);
}

/**
 * Compute a 0-100 score for an instrument based on its performance stats.
 * Formula: 40% win rate + 30% avg pnl (normalized) + 30% consistency bonus
 */
function computeScore(
  wins: number,
  total: number,
  _losses: number,
  _totalPnl: number,
  avgPnl: number,
  winRate: number
): number {
  if (total === 0) return 50;
  const winRateScore = (winRate / 100) * 40;
  const avgPnlNormalized = Math.min(Math.max(avgPnl / 5, -1), 1);
  const avgPnlScore = ((avgPnlNormalized + 1) / 2) * 30;
  const consistencyScore = Math.min(total / 20, 1) * 30;
  const raw = winRateScore + avgPnlScore + consistencyScore;
  return Math.round(Math.min(Math.max(raw, 0), 100));
}

async function upsertInstrumentPerformance(
  instrument: string,
  isWin: boolean,
  pnl: number,
  aiAnalysisText?: string,
  recommendedConf?: number
): Promise<void> {
  const existing = await getInstrumentPerformance(instrument);
  const db = await requireDb();

  if (!existing) {
    const winRate = isWin ? 100 : 0;
    const score = computeScore(isWin ? 1 : 0, 1, isWin ? 0 : 1, pnl, pnl, winRate);
    await db.insert(instrumentPerformance).values({
      instrument,
      wins: isWin ? 1 : 0,
      losses: isWin ? 0 : 1,
      totalTrades: 1,
      totalPnl: pnl.toFixed(2),
      avgPnl: pnl.toFixed(2),
      winRate: winRate.toFixed(2),
      score,
      aiAnalysis: aiAnalysisText,
      recommendedConfidence: recommendedConf ?? null,
      isEnabled: true,
      lastTradeAt: new Date(),
    });
  } else {
    const newWins = existing.wins + (isWin ? 1 : 0);
    const newLosses = existing.losses + (isWin ? 0 : 1);
    const newTotal = existing.totalTrades + 1;
    const newTotalPnl = existing.totalPnl + pnl;
    const newAvgPnl = newTotalPnl / newTotal;
    const newWinRate = (newWins / newTotal) * 100;
    const newScore = computeScore(newWins, newTotal, newLosses, newTotalPnl, newAvgPnl, newWinRate);

    await db
      .update(instrumentPerformance)
      .set({
        wins: newWins,
        losses: newLosses,
        totalTrades: newTotal,
        totalPnl: newTotalPnl.toFixed(2),
        avgPnl: newAvgPnl.toFixed(2),
        winRate: newWinRate.toFixed(2),
        score: newScore,
        aiAnalysis: aiAnalysisText ?? existing.aiAnalysis ?? undefined,
        recommendedConfidence: recommendedConf ?? existing.recommendedConfidence ?? null,
        lastTradeAt: new Date(),
      })
      .where(eq(instrumentPerformance.instrument, instrument));
  }
}

// ─── Post-Trade Learning ──────────────────────────────────────────────────────

/**
 * Called after every trade closes. AI evaluates the trade and updates instrument score.
 * This is the core of the self-learning loop.
 */
export async function analyzeClosedTrade(ctx: ClosedTradeContext): Promise<void> {
  const isWin = ctx.pnl > 0;
  const holdMinutes = Math.round(
    (ctx.closedAt.getTime() - ctx.openedAt.getTime()) / 60000
  );

  console.log(
    `[Learning] Analyzing closed trade: ${ctx.instrument} ${ctx.direction} P&L=${ctx.pnl.toFixed(2)} (${isWin ? "WIN" : "LOSS"})`
  );

  try {
    // Get recent lessons for context
    const recentLessons = await getRecentLessons(ctx.instrument, 3);
    const lessonsText = recentLessons.length > 0
      ? recentLessons.map((l) => `- ${l.lessonText}`).join("\n")
      : "No previous lessons for this instrument.";

    const prompt = `You are a professional trading coach analyzing a completed trade for the HJ Capital AI trading platform.

Trade Details:
- Instrument: ${ctx.instrument}
- Direction: ${ctx.direction}
- Entry Price: ${ctx.entryPrice}
- Exit Price: ${ctx.exitPrice}
- P&L: ${ctx.pnl >= 0 ? "+" : ""}${ctx.pnl.toFixed(2)} USD
- Result: ${isWin ? "WIN ✓" : "LOSS ✗"}
- Hold Time: ${holdMinutes} minutes
- Close Reason: ${ctx.closeReason ?? "unknown"}
- AI Confidence at Entry: ${ctx.aiConfidence ?? "unknown"}%
- AI Reasoning at Entry: ${ctx.aiReasoning ?? "not available"}

Previous Lessons for ${ctx.instrument}:
${lessonsText}

Analyze this trade and respond in JSON with these exact fields:
{
  "verdict": "string — one sentence verdict on whether the AI made the right call",
  "lesson": "string — the single most important lesson from this trade (actionable, specific)",
  "instrumentAnalysis": "string — brief assessment of ${ctx.instrument} tradability (2-3 sentences)",
  "recommendedConfidence": number — suggested minimum confidence threshold for ${ctx.instrument} (50-90),
  "instrumentScore": number — score 0-100 for how good this instrument is for our strategy right now
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a trading coach. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as never,
    });

    const content = response.choices?.[0]?.message?.content ?? "{}";
    const raw = typeof content === "string" ? content : JSON.stringify(content);

    interface ParsedEval {
      verdict?: string;
      lesson?: string;
      instrumentAnalysis?: string;
      recommendedConfidence?: number;
      instrumentScore?: number;
    }

    let parsed: ParsedEval = {};
    try {
      parsed = JSON.parse(raw) as ParsedEval;
    } catch {
      console.warn("[Learning] Failed to parse AI response, using defaults");
    }

    const verdict = parsed.verdict ?? (isWin ? "Trade was profitable." : "Trade resulted in a loss.");
    const lesson = parsed.lesson ?? (isWin ? "Strategy worked well." : "Review entry conditions.");
    const instrumentAnalysis = typeof parsed.instrumentAnalysis === "string" ? parsed.instrumentAnalysis : undefined;
    const recommendedConfidence = typeof parsed.recommendedConfidence === "number"
      ? Math.min(Math.max(parsed.recommendedConfidence, 50), 90)
      : undefined;

    // Save lesson to trade_lessons table
    const db = await requireDb();
    await db.insert(tradeLessons).values({
      tradeId: ctx.tradeId,
      instrument: ctx.instrument,
      direction: ctx.direction,
      entryPrice: ctx.entryPrice.toFixed(5),
      exitPrice: ctx.exitPrice.toFixed(5),
      pnl: ctx.pnl.toFixed(2),
      wasCorrect: isWin,
      aiVerdict: verdict,
      lessonText: lesson,
      marketConditions: ctx.marketConditions ?? undefined,
      mode: "live",
    });

    // Update instrument performance score
    await upsertInstrumentPerformance(
      ctx.instrument,
      isWin,
      ctx.pnl,
      instrumentAnalysis,
      recommendedConfidence
    );

    console.log(`[Learning] Lesson saved for ${ctx.instrument}: "${lesson.slice(0, 80)}..."`);
  } catch (err) {
    console.error("[Learning] analyzeClosedTrade error:", err);
    // Still update raw stats even if AI fails
    await upsertInstrumentPerformance(ctx.instrument, isWin, ctx.pnl);
  }
}

// ─── Weekly Meta-Analysis ─────────────────────────────────────────────────────

/**
 * Weekly AI meta-analysis: reads all lessons + instrument scores and auto-adjusts
 * global strategy thresholds. Called by the weekly cron job.
 */
export async function runWeeklyMetaAnalysis(): Promise<void> {
  console.log("[Learning] Starting weekly meta-analysis...");

  try {
    const allPerformance = await getAllInstrumentPerformance();

    // Gather recent lessons (last 50)
    const db = await requireDb();
    const recentLessons = await db
      .select()
      .from(tradeLessons)
      .orderBy(desc(tradeLessons.createdAt))
      .limit(50);

    // Get current risk settings
    const currentSettings = await db.select().from(riskSettings).limit(1);
    const current = currentSettings[0];
    if (!current) {
      console.warn("[Learning] No risk settings found, skipping meta-analysis");
      return;
    }

    const currentConfidence = current.minConfidenceThreshold;
    const currentDailyLoss = parseFloat(current.dailyLossLimitPct);

    const performanceSummary = allPerformance.map((p) =>
      `${p.instrument}: ${p.wins}W/${p.losses}L (${p.winRate.toFixed(1)}% win rate, avg P&L $${p.avgPnl.toFixed(2)}, score=${p.score})`
    ).join("\n");

    const lessonsSummary = (recentLessons as typeof tradeLessons.$inferSelect[]).slice(0, 20).map((l) =>
      `[${l.instrument} ${l.direction} ${l.wasCorrect ? "WIN" : "LOSS"}] ${l.lessonText}`
    ).join("\n");

    const totalTrades = recentLessons.length;
    const wins = (recentLessons as typeof tradeLessons.$inferSelect[]).filter((l) => l.wasCorrect).length;
    const overallWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const totalPnl = (recentLessons as typeof tradeLessons.$inferSelect[]).reduce(
      (sum: number, l) => sum + parseFloat(l.pnl ?? "0"),
      0
    );

    const prompt = `You are the Chief Strategy Officer for HJ Capital, an AI-powered automated trading platform.

CURRENT PERFORMANCE SUMMARY (Last 50 trades):
- Total Trades: ${totalTrades}
- Overall Win Rate: ${overallWinRate.toFixed(1)}%
- Total P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}

INSTRUMENT PERFORMANCE:
${performanceSummary || "No instrument data yet."}

RECENT LESSONS:
${lessonsSummary || "No lessons yet."}

CURRENT STRATEGY SETTINGS:
- Minimum Confidence Threshold: ${currentConfidence}%
- Daily Loss Limit: ${currentDailyLoss}%

Based on this data, recommend strategy adjustments. Respond in JSON:
{
  "confidenceThreshold": number (50-90),
  "dailyLossLimitPct": number (0.5-3.0),
  "instrumentsToDisable": string[],
  "instrumentsToEnable": string[],
  "keyInsights": "string — 2-3 sentence summary of what the AI learned this week",
  "strategyAdjustmentReasoning": "string — explanation of why these changes are recommended"
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a quantitative trading strategist. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as never,
    });

    const content = response.choices?.[0]?.message?.content ?? "{}";
    const raw = typeof content === "string" ? content : JSON.stringify(content);

    interface ParsedMeta {
      confidenceThreshold?: number;
      dailyLossLimitPct?: number;
      instrumentsToDisable?: string[];
      instrumentsToEnable?: string[];
      keyInsights?: string;
      strategyAdjustmentReasoning?: string;
    }

    let parsed: ParsedMeta = {};
    try {
      parsed = JSON.parse(raw) as ParsedMeta;
    } catch {
      console.warn("[Learning] Failed to parse meta-analysis response");
      return;
    }

    const adjustments: string[] = [];
    const reasoning = parsed.strategyAdjustmentReasoning ?? "Auto-adjusted based on performance data";

    // Apply confidence threshold adjustment
    const newConfidence = typeof parsed.confidenceThreshold === "number"
      ? Math.min(Math.max(Math.round(parsed.confidenceThreshold), 50), 90)
      : null;

    if (newConfidence !== null && newConfidence !== currentConfidence) {
      await db.update(riskSettings).set({ minConfidenceThreshold: newConfidence });
      await db.insert(strategyAdjustments).values({
        adjustmentType: "confidence_threshold",
        oldValue: currentConfidence.toString(),
        newValue: newConfidence.toString(),
        reasoning,
        tradesAnalyzed: totalTrades,
        lessonsRead: recentLessons.length,
        source: "weekly_meta",
      });
      adjustments.push(`Confidence threshold: ${currentConfidence}% → ${newConfidence}%`);
    }

    // Apply daily loss limit adjustment
    const newDailyLoss = typeof parsed.dailyLossLimitPct === "number"
      ? Math.min(Math.max(parsed.dailyLossLimitPct, 0.5), 3.0)
      : null;

    if (newDailyLoss !== null && Math.abs(newDailyLoss - currentDailyLoss) > 0.05) {
      await db.update(riskSettings).set({ dailyLossLimitPct: newDailyLoss.toFixed(2) });
      await db.insert(strategyAdjustments).values({
        adjustmentType: "daily_loss_limit",
        oldValue: currentDailyLoss.toFixed(2),
        newValue: newDailyLoss.toFixed(2),
        reasoning,
        tradesAnalyzed: totalTrades,
        lessonsRead: recentLessons.length,
        source: "weekly_meta",
      });
      adjustments.push(`Daily loss limit: ${currentDailyLoss}% → ${newDailyLoss}%`);
    }

    // Disable underperforming instruments
    if (Array.isArray(parsed.instrumentsToDisable)) {
      for (const instrument of parsed.instrumentsToDisable) {
        const perf = allPerformance.find((p) => p.instrument === instrument);
        if (perf && perf.isEnabled && perf.totalTrades >= 5 && perf.winRate < 30) {
          await db
            .update(instrumentPerformance)
            .set({ isEnabled: false })
            .where(eq(instrumentPerformance.instrument, instrument));
          await db.insert(strategyAdjustments).values({
            adjustmentType: "disable_instrument",
            oldValue: "enabled",
            newValue: "disabled",
            reasoning: `${instrument} disabled: ${perf.winRate.toFixed(1)}% win rate over ${perf.totalTrades} trades`,
            tradesAnalyzed: perf.totalTrades,
            lessonsRead: recentLessons.length,
            source: "weekly_meta",
          });
          adjustments.push(`Disabled ${instrument} (${perf.winRate.toFixed(1)}% win rate)`);
        }
      }
    }

    // Re-enable instruments
    if (Array.isArray(parsed.instrumentsToEnable)) {
      for (const instrument of parsed.instrumentsToEnable) {
        const perf = allPerformance.find((p) => p.instrument === instrument);
        if (perf && !perf.isEnabled) {
          await db
            .update(instrumentPerformance)
            .set({ isEnabled: true })
            .where(eq(instrumentPerformance.instrument, instrument));
          adjustments.push(`Re-enabled ${instrument}`);
        }
      }
    }

    // Send Telegram summary
    const insights = parsed.keyInsights ?? "Weekly meta-analysis completed.";
    const adjustmentText = adjustments.length > 0
      ? `\n\n🔧 *تعديلات تلقائية:*\n${adjustments.map((a) => `• ${a}`).join("\n")}`
      : "\n\n✅ لا توجد تعديلات مطلوبة هذا الأسبوع.";

    await sendTelegramMessage(
      `🧠 *التحليل الأسبوعي للذكاء الاصطناعي*\n\n` +
      `📊 *الأداء:* ${totalTrades} صفقة | نسبة الفوز: ${overallWinRate.toFixed(1)}% | إجمالي الربح: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}\n\n` +
      `💡 *الدروس المستفادة:*\n${insights}` +
      adjustmentText
    );

    console.log(`[Learning] Weekly meta-analysis complete. Adjustments: ${adjustments.length > 0 ? adjustments.join(", ") : "none"}`);
  } catch (err) {
    console.error("[Learning] runWeeklyMetaAnalysis error:", err);
  }
}

// ─── Strategy Adjustments Log ─────────────────────────────────────────────────

export async function getStrategyAdjustments(limit = 20) {
  const db = await requireDb();
  return db
    .select()
    .from(strategyAdjustments)
    .orderBy(desc(strategyAdjustments.createdAt))
    .limit(limit);
}
