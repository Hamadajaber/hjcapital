/**
 * HJ Capital — Self-Governance Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * The autonomous brain that manages the platform without human intervention.
 * 
 * Responsibilities:
 *  1. AUTO-RECOVERY: Detect and recover from drawdown blocks automatically
 *  2. AUTO-HEAL: Close stuck trades in DB that no longer exist on Capital.com
 *  3. AUTO-INSTRUMENT: Enable/disable instruments based on performance
 *  4. AUTO-RISK-SCALING: Adjust position sizes based on account health
 *  5. AUTO-PARAMETER: Tune all trading parameters based on accumulated knowledge
 *  6. MONTHLY REPORT: Generate and send comprehensive monthly report via Telegram
 * 
 * This engine runs every cycle (15 min) and performs a full governance check.
 * The user only needs to check in once a month.
 */

import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { sendTelegramMessage } from "./telegram";
import {
  riskSettings,
  instrumentPerformance,
  strategyAdjustments,
  trades,
  portfolio,
} from "../drizzle/schema";
import { eq, desc, gte, and, lt } from "drizzle-orm";
import { getAccountBalance } from "./capitalcom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GovernanceResult {
  actionsPerformed: string[];
  engineUnblocked: boolean;
  stuckTradesHealed: number;
  parametersAdjusted: string[];
}

// ─── Main Governance Cycle ────────────────────────────────────────────────────

/**
 * runGovernanceCycle — called every 15 minutes from autoTradeEngine.
 * Performs all self-governance checks and auto-corrections.
 */
export async function runGovernanceCycle(mode: "paper" | "live"): Promise<GovernanceResult> {
  const result: GovernanceResult = {
    actionsPerformed: [],
    engineUnblocked: false,
    stuckTradesHealed: 0,
    parametersAdjusted: [],
  };

  try {
    const db = await getDb();
    if (!db) return result;

    // 1. AUTO-RECOVERY: Check and fix trailing drawdown block
    if (mode === "live") {
      const recovered = await autoRecoverFromDrawdown(db);
      if (recovered.action) {
        result.actionsPerformed.push(recovered.action);
        result.engineUnblocked = recovered.unblocked;
      }
    }

    // 2. AUTO-HEAL: Fix stuck trades in DB
    const healed = await autoHealStuckTrades(db, mode);
    result.stuckTradesHealed = healed;
    if (healed > 0) {
      result.actionsPerformed.push(`Auto-healed ${healed} stuck trade(s) in DB`);
    }

    // 3. AUTO-RISK-SCALING: Adjust risk based on account health (runs every 6 hours)
    const lastScalingKey = "_lastRiskScalingAt";
    const lastScaling = (global as any)[lastScalingKey] ?? 0;
    if (Date.now() - lastScaling > 6 * 60 * 60 * 1000) {
      const scalingActions = await autoScaleRisk(db, mode);
      result.parametersAdjusted.push(...scalingActions);
      result.actionsPerformed.push(...scalingActions);
      (global as any)[lastScalingKey] = Date.now();
    }

    // 4. AUTO-INSTRUMENT: Re-evaluate disabled instruments (runs daily)
    const lastInstrumentKey = "_lastInstrumentCheckAt";
    const lastInstrumentCheck = (global as any)[lastInstrumentKey] ?? 0;
    if (Date.now() - lastInstrumentCheck > 24 * 60 * 60 * 1000) {
      const instrumentActions = await autoManageInstruments(db);
      result.actionsPerformed.push(...instrumentActions);
      (global as any)[lastInstrumentKey] = Date.now();
    }

    // 5. MONTHLY REPORT: Generate on the 1st of each month at 08:00 UTC
    const now = new Date();
    const lastMonthlyKey = "_lastMonthlyReportMonth";
    const lastReportMonth = (global as any)[lastMonthlyKey] ?? -1;
    if (now.getUTCDate() === 1 && now.getUTCHours() >= 8 && lastReportMonth !== now.getUTCMonth()) {
      await generateMonthlyReport(db, mode);
      (global as any)[lastMonthlyKey] = now.getUTCMonth();
      result.actionsPerformed.push("Monthly report generated and sent via Telegram");
    }

  } catch (err) {
    console.error("[Governance] runGovernanceCycle error:", err);
  }

  return result;
}

// ─── 1. Auto-Recovery from Drawdown ──────────────────────────────────────────

/**
 * autoRecoverFromDrawdown — the most critical function.
 * 
 * Problem: When balance drops 10%+ from peak, engine blocks ALL trading.
 * This can last forever if peakBalance is never reset.
 * 
 * Solution: After 48 hours of being blocked, AI evaluates whether to:
 *   A) Reset peakBalance to current balance (accept the loss, restart fresh)
 *   B) Keep blocking (if the situation is still dangerous)
 * 
 * The AI considers: how long blocked, current balance, market conditions,
 * recent performance, and whether the drawdown was a one-time event.
 */
async function autoRecoverFromDrawdown(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<{ action: string; unblocked: boolean }> {
  try {
    const riskRows = await db.select().from(riskSettings).limit(1);
    const risk = riskRows[0];
    if (!risk) return { action: "", unblocked: false };

    const peakBalance = parseFloat(risk.peakBalance);
    const trailingPct = parseFloat(risk.trailingDrawdownPct);

    // Get live balance
    let currentBalance = 0;
    try {
      const bal = await getAccountBalance();
      currentBalance = bal.balance;
    } catch {
      return { action: "", unblocked: false };
    }

    if (currentBalance <= 0 || peakBalance <= 0) return { action: "", unblocked: false };

    const drawdownPct = ((peakBalance - currentBalance) / peakBalance) * 100;

    // Only act if actually blocked by drawdown
    if (drawdownPct < trailingPct) return { action: "", unblocked: false };

    // Check how long we've been blocked
    const blockedSince = (global as any)._drawdownBlockedSince;
    if (!blockedSince) {
      (global as any)._drawdownBlockedSince = Date.now();
      return { action: "", unblocked: false };
    }

    const hoursBlocked = (Date.now() - blockedSince) / (60 * 60 * 1000);

    // After 24 hours blocked: AUTO-RESET peakBalance to current balance
    // Rationale: The loss has already happened. Keeping the engine blocked
    // prevents any recovery. Reset allows the engine to trade again with
    // the new, lower balance as the new baseline.
    if (hoursBlocked >= 24) {
      // Get recent performance to inform the decision
      const recentTrades = await db
        .select()
        .from(trades)
        .where(and(eq(trades.mode, "live"), eq(trades.status, "closed")))
        .orderBy(desc(trades.closedAt))
        .limit(20);

      const recentPnl = recentTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
      const recentWins = recentTrades.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
      const recentWinRate = recentTrades.length > 0 ? (recentWins / recentTrades.length) * 100 : 0;

      // Ask AI: should we reset or keep blocking?
      const aiDecision = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are HJ Capital's autonomous risk manager. Make recovery decisions to keep the trading engine operational.",
          },
          {
            role: "user",
            content: `The trading engine has been BLOCKED for ${hoursBlocked.toFixed(1)} hours due to trailing drawdown protection.

CURRENT SITUATION:
- Current Balance: $${currentBalance.toFixed(2)}
- Peak Balance (recorded): $${peakBalance.toFixed(2)}
- Drawdown: ${drawdownPct.toFixed(2)}% (limit: ${trailingPct}%)
- Hours Blocked: ${hoursBlocked.toFixed(1)}

RECENT PERFORMANCE (last 20 trades):
- Win Rate: ${recentWinRate.toFixed(1)}%
- Total P&L: ${recentPnl >= 0 ? "+" : ""}$${recentPnl.toFixed(2)}

DECISION: Should we reset the peak balance to $${currentBalance.toFixed(2)} to allow trading to resume?

Respond in JSON:
{
  "resetPeak": true/false,
  "newTrailingPct": number (5-20, current: ${trailingPct}),
  "reasoning": "brief explanation"
}`,
          },
        ],
        response_format: { type: "json_object" } as never,
      });

      const content = aiDecision.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as {
        resetPeak?: boolean;
        newTrailingPct?: number;
        reasoning?: string;
      };

      if (parsed.resetPeak !== false) {
        // Reset peakBalance to current balance — engine can trade again
        const newPeak = currentBalance;
        const newTrailingPct = typeof parsed.newTrailingPct === "number"
          ? Math.min(Math.max(parsed.newTrailingPct, 5), 20)
          : trailingPct;

        await db.update(riskSettings).set({
          peakBalance: newPeak.toFixed(2),
          trailingDrawdownPct: newTrailingPct.toFixed(2),
        });

        // Log the adjustment
        await db.insert(strategyAdjustments).values({
          adjustmentType: "auto_recovery",
          oldValue: `peak=$${peakBalance.toFixed(2)}, trailing=${trailingPct}%`,
          newValue: `peak=$${newPeak.toFixed(2)}, trailing=${newTrailingPct}%`,
          reasoning: `Auto-recovery after ${hoursBlocked.toFixed(1)}h drawdown block. ${parsed.reasoning ?? ""}`,
          tradesAnalyzed: recentTrades.length,
          lessonsRead: 0,
          source: "auto_governance",
        });

        // Reset the blocked timer
        delete (global as any)._drawdownBlockedSince;

        // Notify via Telegram
        await sendTelegramMessage(
          `🔄 *استعادة تلقائية من الانهيار*\n\n` +
          `✅ تم إعادة ضبط ذروة الرصيد تلقائياً\n` +
          `📊 الرصيد الحالي: $${currentBalance.toFixed(2)}\n` +
          `📈 ذروة الرصيد الجديدة: $${newPeak.toFixed(2)}\n` +
          `🛡️ حد الانهيار الجديد: ${newTrailingPct}%\n` +
          `⏱️ مدة التوقف: ${hoursBlocked.toFixed(1)} ساعة\n\n` +
          `💡 السبب: ${parsed.reasoning ?? "استعادة تلقائية"}\n\n` +
          `🚀 المحرك سيستأنف التداول في الدورة التالية.`
        ).catch(() => {});

        console.log(`[Governance] ✅ Auto-recovery: peakBalance reset from $${peakBalance.toFixed(2)} to $${newPeak.toFixed(2)}`);

        return {
          action: `Auto-recovery: peakBalance reset $${peakBalance.toFixed(2)} → $${newPeak.toFixed(2)} after ${hoursBlocked.toFixed(1)}h block`,
          unblocked: true,
        };
      } else {
        // AI decided to keep blocking — extend the timer by 12 hours
        (global as any)._drawdownBlockedSince = Date.now() - (hoursBlocked - 12) * 60 * 60 * 1000;
        console.log(`[Governance] AI decided to keep drawdown block. Reason: ${parsed.reasoning}`);
        return { action: "", unblocked: false };
      }
    }

    return { action: "", unblocked: false };
  } catch (err) {
    console.error("[Governance] autoRecoverFromDrawdown error:", err);
    return { action: "", unblocked: false };
  }
}

// ─── 2. Auto-Heal Stuck Trades ────────────────────────────────────────────────

/**
 * autoHealStuckTrades — closes DB trades that have been "open" for too long.
 * 
 * A trade stuck in DB as "open" for >48 hours is almost certainly closed
 * on Capital.com but wasn't reconciled (server was down, API error, etc.).
 * 
 * We close them in DB with P&L = 0 (unknown) to unblock the position counter.
 */
async function autoHealStuckTrades(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  mode: "paper" | "live"
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    const stuckTrades = await db
      .select()
      .from(trades)
      .where(and(
        eq(trades.status, "open"),
        eq(trades.mode, mode),
        lt(trades.openedAt, cutoff)
      ));

    if (stuckTrades.length === 0) return 0;

    let healed = 0;
    for (const trade of stuckTrades) {
      try {
        await db.update(trades).set({
          status: "closed",
          closedAt: new Date(),
          pnl: "0.00",
          closeReason: "auto_healed_stuck_trade",
        }).where(eq(trades.id, trade.id));

        healed++;
        console.log(`[Governance] Auto-healed stuck trade #${trade.id} (${trade.instrument}, open since ${trade.openedAt})`);
      } catch (tradeErr) {
        console.warn(`[Governance] Failed to heal trade #${trade.id}:`, tradeErr);
      }
    }

    if (healed > 0) {
      await sendTelegramMessage(
        `🔧 *إصلاح تلقائي للصفقات العالقة*\n\n` +
        `تم إغلاق ${healed} صفقة عالقة في قاعدة البيانات\n` +
        `(كانت مفتوحة أكثر من 48 ساعة دون تحديث)`
      ).catch(() => {});
    }

    return healed;
  } catch (err) {
    console.error("[Governance] autoHealStuckTrades error:", err);
    return 0;
  }
}

// ─── 3. Auto-Scale Risk ───────────────────────────────────────────────────────

/**
 * autoScaleRisk — adjusts risk parameters based on account health.
 * 
 * Conservative mode (balance < 70% of starting): reduce risk
 * Normal mode (balance 70-130% of starting): standard risk
 * Aggressive mode (balance > 130% of starting): can increase slightly
 */
async function autoScaleRisk(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  mode: "paper" | "live"
): Promise<string[]> {
  const actions: string[] = [];

  try {
    // Get current balance
    let currentBalance = 0;
    if (mode === "live") {
      try {
        const bal = await getAccountBalance();
        currentBalance = bal.balance;
      } catch {
        return actions;
      }
    } else {
      const port = await db.select().from(portfolio).limit(1);
      currentBalance = port[0] ? parseFloat(port[0].balance) : 0;
    }

    if (currentBalance <= 0) return actions;

    // Get current risk settings
    const riskRows = await db.select().from(riskSettings).limit(1);
    const risk = riskRows[0];
    if (!risk) return actions;

    const currentConfidence = risk.minConfidenceThreshold;
    const currentDailyLoss = parseFloat(risk.dailyLossLimitPct);
    const currentMaxPositions = risk.maxOpenPositions;
    const peakBalance = parseFloat(risk.peakBalance);

    // Determine account health
    const healthRatio = peakBalance > 0 ? currentBalance / peakBalance : 1;

    let newConfidence = currentConfidence;
    let newDailyLoss = currentDailyLoss;
    let newMaxPositions = currentMaxPositions;
    let mode_label = "";

    if (healthRatio < 0.75) {
      // RECOVERY MODE: Very conservative — high confidence, low risk
      newConfidence = Math.min(80, Math.max(currentConfidence, 75));
      newDailyLoss = Math.min(currentDailyLoss, 1.0);
      newMaxPositions = Math.min(currentMaxPositions, 2);
      mode_label = "Recovery Mode (balance < 75% of peak)";
    } else if (healthRatio < 0.90) {
      // CAUTIOUS MODE: Slightly conservative
      newConfidence = Math.min(75, Math.max(currentConfidence, 68));
      newDailyLoss = Math.min(currentDailyLoss, 1.5);
      newMaxPositions = Math.min(currentMaxPositions, 3);
      mode_label = "Cautious Mode (balance 75-90% of peak)";
    } else if (healthRatio >= 1.15) {
      // GROWTH MODE: Account is growing — can be slightly more active
      newConfidence = Math.max(currentConfidence - 2, 60);
      newDailyLoss = Math.min(currentDailyLoss + 0.2, 2.5);
      newMaxPositions = Math.min(currentMaxPositions + 1, 5);
      mode_label = "Growth Mode (balance > 115% of peak)";
    } else {
      // NORMAL MODE: Standard parameters
      return actions;
    }

    // Apply changes only if they differ significantly
    const updates: Record<string, string | number> = {};
    const changes: string[] = [];

    if (newConfidence !== currentConfidence) {
      updates.minConfidenceThreshold = newConfidence;
      changes.push(`Confidence: ${currentConfidence}% → ${newConfidence}%`);
    }
    if (Math.abs(newDailyLoss - currentDailyLoss) > 0.05) {
      updates.dailyLossLimitPct = newDailyLoss.toFixed(2);
      changes.push(`Daily Loss Limit: ${currentDailyLoss}% → ${newDailyLoss}%`);
    }
    if (newMaxPositions !== currentMaxPositions) {
      updates.maxOpenPositions = newMaxPositions;
      changes.push(`Max Positions: ${currentMaxPositions} → ${newMaxPositions}`);
    }

    if (changes.length > 0) {
      await db.update(riskSettings).set(updates as any);

      await db.insert(strategyAdjustments).values({
        adjustmentType: "auto_risk_scaling",
        oldValue: `confidence=${currentConfidence}%, dailyLoss=${currentDailyLoss}%, maxPos=${currentMaxPositions}`,
        newValue: `confidence=${newConfidence}%, dailyLoss=${newDailyLoss}%, maxPos=${newMaxPositions}`,
        reasoning: `${mode_label}. Balance=$${currentBalance.toFixed(2)}, Peak=$${peakBalance.toFixed(2)}, Health=${(healthRatio * 100).toFixed(1)}%`,
        tradesAnalyzed: 0,
        lessonsRead: 0,
        source: "auto_governance",
      });

      for (const change of changes) {
        actions.push(`[${mode_label}] ${change}`);
      }

      await sendTelegramMessage(
        `⚙️ *تعديل تلقائي للمخاطر*\n\n` +
        `🎯 الوضع: ${mode_label}\n` +
        `💰 الرصيد: $${currentBalance.toFixed(2)} (${(healthRatio * 100).toFixed(1)}% من الذروة)\n\n` +
        `🔧 التعديلات:\n${changes.map(c => `• ${c}`).join("\n")}`
      ).catch(() => {});

      console.log(`[Governance] Risk scaling (${mode_label}): ${changes.join(", ")}`);
    }
  } catch (err) {
    console.error("[Governance] autoScaleRisk error:", err);
  }

  return actions;
}

// ─── 4. Auto-Manage Instruments ───────────────────────────────────────────────

/**
 * autoManageInstruments — re-evaluates instrument performance daily.
 * 
 * Instruments with score < 20 after 10+ trades are disabled.
 * Instruments that were disabled and now have score > 50 are re-enabled.
 */
async function autoManageInstruments(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<string[]> {
  const actions: string[] = [];

  try {
    const allPerf = await db.select().from(instrumentPerformance).orderBy(desc(instrumentPerformance.score));

    for (const perf of allPerf) {
      const score = perf.score ?? 50;
      const totalTrades = (perf.wins ?? 0) + (perf.losses ?? 0);
      const winRate = totalTrades > 0 ? ((perf.wins ?? 0) / totalTrades) * 100 : 50;

      // Disable consistently bad instruments
      if (perf.isEnabled && totalTrades >= 10 && score < 20 && winRate < 25) {
        await db.update(instrumentPerformance)
          .set({ isEnabled: false })
          .where(eq(instrumentPerformance.instrument, perf.instrument));

        await db.insert(strategyAdjustments).values({
          adjustmentType: "auto_disable_instrument",
          oldValue: "enabled",
          newValue: "disabled",
          reasoning: `Auto-disabled: score=${score}, winRate=${winRate.toFixed(1)}%, trades=${totalTrades}`,
          tradesAnalyzed: totalTrades,
          lessonsRead: 0,
          source: "auto_governance",
        });

        actions.push(`Auto-disabled ${perf.instrument} (score=${score}, winRate=${winRate.toFixed(1)}%)`);
        console.log(`[Governance] Auto-disabled ${perf.instrument}: score=${score}, winRate=${winRate.toFixed(1)}%`);
      }

      // Re-enable recovering instruments
      if (!perf.isEnabled && totalTrades >= 5 && score > 55 && winRate > 50) {
        await db.update(instrumentPerformance)
          .set({ isEnabled: true })
          .where(eq(instrumentPerformance.instrument, perf.instrument));

        await db.insert(strategyAdjustments).values({
          adjustmentType: "auto_enable_instrument",
          oldValue: "disabled",
          newValue: "enabled",
          reasoning: `Auto-re-enabled: score=${score}, winRate=${winRate.toFixed(1)}%, trades=${totalTrades}`,
          tradesAnalyzed: totalTrades,
          lessonsRead: 0,
          source: "auto_governance",
        });

        actions.push(`Auto-re-enabled ${perf.instrument} (score=${score}, winRate=${winRate.toFixed(1)}%)`);
        console.log(`[Governance] Auto-re-enabled ${perf.instrument}: score=${score}, winRate=${winRate.toFixed(1)}%`);
      }
    }

    if (actions.length > 0) {
      await sendTelegramMessage(
        `📊 *تعديل تلقائي للأدوات*\n\n` +
        actions.map(a => `• ${a}`).join("\n")
      ).catch(() => {});
    }
  } catch (err) {
    console.error("[Governance] autoManageInstruments error:", err);
  }

  return actions;
}

// ─── 5. Monthly Report ────────────────────────────────────────────────────────

/**
 * generateMonthlyReport — comprehensive monthly performance report.
 * Sent via Telegram on the 1st of each month.
 */
export async function generateMonthlyReport(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  mode: "paper" | "live"
): Promise<void> {
  try {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Get last month's trades
    const monthTrades = await db
      .select()
      .from(trades)
      .where(and(
        eq(trades.mode, mode),
        eq(trades.status, "closed"),
        gte(trades.closedAt!, monthAgo)
      ))
      .orderBy(desc(trades.closedAt));

    const totalTrades = monthTrades.length;
    const wins = monthTrades.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
    const losses = monthTrades.filter(t => parseFloat(t.pnl ?? "0") < 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const totalPnl = monthTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
    const avgWin = wins > 0
      ? monthTrades.filter(t => parseFloat(t.pnl ?? "0") > 0).reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0) / wins
      : 0;
    const avgLoss = losses > 0
      ? monthTrades.filter(t => parseFloat(t.pnl ?? "0") < 0).reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0) / losses
      : 0;

    // Get current balance
    let currentBalance = 0;
    try {
      const bal = await getAccountBalance();
      currentBalance = bal.balance;
    } catch {
      const port = await db.select().from(portfolio).limit(1);
      currentBalance = port[0] ? parseFloat(port[0].balance) : 0;
    }

    // Get instrument performance
    const instrPerf = await db.select().from(instrumentPerformance).orderBy(desc(instrumentPerformance.score));
    const instrSummary = instrPerf.slice(0, 5).map(p =>
      `${p.instrument}: ${p.wins}W/${p.losses}L (score: ${p.score})`
    ).join("\n");

    // Get strategy adjustments this month
    const monthAdjustments = await db
      .select()
      .from(strategyAdjustments)
      .where(gte(strategyAdjustments.createdAt!, monthAgo))
      .orderBy(desc(strategyAdjustments.createdAt));

    // Ask AI to generate insights
    const aiReport = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are HJ Capital's monthly performance analyst. Generate a concise, insightful monthly report in Arabic.",
        },
        {
          role: "user",
          content: `Generate a monthly trading report for HJ Capital.

MONTHLY STATISTICS:
- Total Trades: ${totalTrades}
- Win Rate: ${winRate.toFixed(1)}%
- Total P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}
- Average Win: +$${avgWin.toFixed(2)}
- Average Loss: -$${Math.abs(avgLoss).toFixed(2)}
- Current Balance: $${currentBalance.toFixed(2)}

TOP INSTRUMENTS:
${instrSummary || "No data"}

AUTO-ADJUSTMENTS THIS MONTH: ${monthAdjustments.length}

Write a 3-4 sentence summary in Arabic covering:
1. Overall performance assessment
2. Key lessons learned
3. What the AI adjusted automatically
4. Outlook for next month`,
        },
      ],
    });

    const aiInsights = aiReport.choices?.[0]?.message?.content ?? "تقرير شهري مكتمل.";
    const insightsText = typeof aiInsights === "string" ? aiInsights : JSON.stringify(aiInsights);

    const now = new Date();
    const monthName = now.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });

    const report =
      `📊 *التقرير الشهري — ${monthName}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *الرصيد الحالي:* $${currentBalance.toFixed(2)}\n` +
      `📈 *إجمالي الربح/الخسارة:* ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}\n\n` +
      `📊 *إحصائيات الشهر:*\n` +
      `• عدد الصفقات: ${totalTrades}\n` +
      `• نسبة الفوز: ${winRate.toFixed(1)}%\n` +
      `• متوسط الربح: +$${avgWin.toFixed(2)}\n` +
      `• متوسط الخسارة: -$${Math.abs(avgLoss).toFixed(2)}\n\n` +
      `🤖 *التعديلات التلقائية:* ${monthAdjustments.length} تعديل\n\n` +
      `💡 *تحليل الذكاء الاصطناعي:*\n${insightsText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_تم إنشاء هذا التقرير تلقائياً بواسطة HJ Capital AI_`;

    await sendTelegramMessage(report).catch(() => {});
    console.log(`[Governance] Monthly report sent for ${monthName}`);

  } catch (err) {
    console.error("[Governance] generateMonthlyReport error:", err);
  }
}

// ─── Manual Trigger ───────────────────────────────────────────────────────────

/**
 * triggerManualRecovery — can be called from the UI to force an immediate recovery check.
 */
export async function triggerManualRecovery(): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    const riskRows = await db.select().from(riskSettings).limit(1);
    const risk = riskRows[0];
    if (!risk) return { success: false, message: "Risk settings not found" };

    let currentBalance = 0;
    try {
      const bal = await getAccountBalance();
      currentBalance = bal.balance;
    } catch {
      return { success: false, message: "Could not fetch live balance from Capital.com" };
    }

    const peakBalance = parseFloat(risk.peakBalance);

    if (currentBalance <= 0) return { success: false, message: "Invalid balance" };

    // Reset peakBalance to current balance
    await db.update(riskSettings).set({
      peakBalance: currentBalance.toFixed(2),
    });

    await db.insert(strategyAdjustments).values({
      adjustmentType: "manual_recovery",
      oldValue: `peak=$${peakBalance.toFixed(2)}`,
      newValue: `peak=$${currentBalance.toFixed(2)}`,
      reasoning: "Manual recovery triggered by user via UI",
      tradesAnalyzed: 0,
      lessonsRead: 0,
      source: "manual",
    });

    // Reset blocked timer
    delete (global as any)._drawdownBlockedSince;

    await sendTelegramMessage(
      `🔄 *استعادة يدوية*\n\n` +
      `تم إعادة ضبط ذروة الرصيد يدوياً\n` +
      `القيمة القديمة: $${peakBalance.toFixed(2)}\n` +
      `القيمة الجديدة: $${currentBalance.toFixed(2)}\n\n` +
      `المحرك سيستأنف التداول في الدورة التالية.`
    ).catch(() => {});

    return {
      success: true,
      message: `Peak balance reset from $${peakBalance.toFixed(2)} to $${currentBalance.toFixed(2)}. Engine will resume trading in the next cycle.`,
    };
  } catch (err) {
    return { success: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
