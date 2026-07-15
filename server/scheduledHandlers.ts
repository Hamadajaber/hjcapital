/**
 * Scheduled Heartbeat Handlers — HJ Auto Trade
 * ─────────────────────────────────────────────────────────────────────────────
 * These handlers are triggered by Manus Heartbeat cron jobs.
 * They auto-start and auto-stop the HJ Auto Trade Engine on a daily schedule.
 *
 * Cron schedule (UTC) — aligned with Capital.com 24/5 market hours:
 *   Start: "0 21 * * 0"  → 21:00 UTC Sunday = Forex market weekly open
 *   Stop:  "0 21 * * 5"  → 21:00 UTC Friday = Forex market weekly close
 *
 * The MarketWatcher in index.ts handles intra-week auto-start/stop (e.g. after server restart).
 * These cron jobs are the weekly bookends: start on Sunday, stop on Friday.
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  startAutoTrade,
  stopAutoTrade,
  getEngineState,
} from "./autoTradeEngine";
import { sendTelegramMessage, sendDailySummary } from "./telegram";
import { getDailyStats, getPortfolio, getWeeklyPerformanceSummary } from "./db";
import { runWeeklyMetaAnalysis } from "./learningEngine";

// ─── Auto-Trade Start Handler ─────────────────────────────────────────────────

export async function autoTradeStartHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    // Check if engine is already running
    const state = getEngineState();
    if (state?.isRunning) {
      console.log("[Scheduled] Auto-trade engine already running, skipping start.");
      return res.json({ ok: true, skipped: "already-running", mode: state.mode });
    }

    // Start in LIVE mode (this is the production engine for passive income)
    const mode = (req.body?.mode as "paper" | "live") ?? "live";
    const cycleIntervalMinutes = (req.body?.cycleIntervalMinutes as number) ?? 15;

    console.log(`[Scheduled] Starting auto-trade engine — mode: ${mode}, interval: ${cycleIntervalMinutes}min`);

    const newState = await startAutoTrade(mode, cycleIntervalMinutes);

    // Send Telegram notification
    const now = new Date().toLocaleString("en-US", {
      timeZone: "Africa/Cairo",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    await sendTelegramMessage(
      `🟢 *HJ Auto Trade — Scheduled Start*\n\n` +
      `⏰ Time: ${now} (Cairo)\n` +
      `📊 Mode: ${mode.toUpperCase()}\n` +
      `🔄 Cycle: every ${cycleIntervalMinutes} min\n` +
      `🤖 Session ID: ${newState.sessionId}\n\n` +
      `_Engine started automatically by daily schedule._`
    );

    return res.json({
      ok: true,
      sessionId: newState.sessionId,
      mode: newState.mode,
      startedAt: new Date().toISOString(),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Scheduled] auto-trade-start failed:", error);
    return res.status(500).json({
      error,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Auto-Trade Stop Handler ──────────────────────────────────────────────────

export async function autoTradeStopHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    // Check if engine is running
    const state = getEngineState();
    if (!state?.isRunning) {
      console.log("[Scheduled] Auto-trade engine already stopped, skipping stop.");
      return res.json({ ok: true, skipped: "already-stopped" });
    }

    const reason = (req.body?.reason as string) ?? "Scheduled daily stop (end of trading session)";
    console.log(`[Scheduled] Stopping auto-trade engine — reason: ${reason}`);

    await stopAutoTrade(reason);

    // Send Telegram notification
    const now = new Date().toLocaleString("en-US", {
      timeZone: "Africa/Cairo",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Send daily summary + stop notification
    try {
      const stats = await getDailyStats();
      const port = await getPortfolio();
      const balance = port ? parseFloat(port.balance) : 0;
      const winRate = stats.tradeCount > 0 ? (stats.wins / stats.tradeCount) * 100 : 0;
      const dateStr = new Date().toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", weekday: "long", year: "numeric", month: "long", day: "numeric" });
      await sendDailySummary({
        date: dateStr,
        totalTrades: stats.tradeCount,
        wins: stats.wins,
        losses: stats.losses,
        totalPnl: stats.totalPnl,
        winRate,
        bestTrade: stats.bestTrade,
        worstTrade: stats.worstTrade,
        balance,
      });
    } catch (summaryErr) {
      console.error("[Scheduled] Failed to send daily summary:", summaryErr);
      await sendTelegramMessage(
        `🔴 *HJ Auto Trade — Scheduled Stop*\n\n` +
        `⏰ Time: ${now} (Cairo)\n` +
        `📋 Reason: ${reason}\n\n` +
        `_Engine stopped automatically by daily schedule. See you tomorrow!_`
      );
    }

    return res.json({
      ok: true,
      stoppedAt: new Date().toISOString(),
      reason,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Scheduled] auto-trade-stop failed:", error);
    return res.status(500).json({
      error,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Weekly Meta-Analysis Handler ───────────────────────────────────────────
// Triggered every Friday at 20:00 UTC via Heartbeat cron.
// AI reads all lessons + instrument scores and auto-adjusts strategy thresholds.

export async function weeklyMetaAnalysisHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    console.log("[Scheduled] Running weekly meta-analysis...");
    await runWeeklyMetaAnalysis();
    console.log("[Scheduled] Weekly meta-analysis complete.");

    return res.json({ ok: true, completedAt: new Date().toISOString() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Scheduled] weekly-meta-analysis failed:", error);
    return res.status(500).json({
      error,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Weekly Report Handler ────────────────────────────────────────────────────
// Triggered every Friday at 20:00 UTC (23:00 Cairo time) via Heartbeat cron.
// Sends a comprehensive weekly performance summary to Telegram.

export async function weeklyReportHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    console.log("[Scheduled] Generating weekly performance report...");

    const summary = await getWeeklyPerformanceSummary();
    const port = await getPortfolio();
    const balance = port ? parseFloat(port.balance) : summary.endBalance;

    const now = new Date();
    const weekEnd = now.toLocaleDateString("ar-EG", {
      timeZone: "Africa/Cairo",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("ar-EG", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const pnlEmoji = summary.totalPnl >= 0 ? "✅" : "❌";
    const pnlSign = summary.totalPnl >= 0 ? "+" : "";
    const winRateEmoji = summary.winRate >= 50 ? "🟢" : summary.winRate >= 35 ? "🟡" : "🔴";

    let text = `📊 <b>التقرير الأسبوعي — HJ Capital</b>
📅 ${weekStart} → ${weekEnd}
━━━━━━━━━━━━━━━━━━
📈 إجمالي الصفقات: <b>${summary.totalTrades}</b>
✅ صفقات رابحة: <b>${summary.wins}</b>
❌ صفقات خاسرة: <b>${summary.losses}</b>
${winRateEmoji} نسبة النجاح: <b>${summary.winRate.toFixed(1)}%</b>
━━━━━━━━━━━━━━━━━━
${pnlEmoji} إجمالي الربح/الخسارة: <b>${pnlSign}$${summary.totalPnl.toFixed(2)}</b>`;

    if (summary.bestTrade) {
      text += `\n🏆 أفضل صفقة: <b>${summary.bestTrade.instrument} +$${summary.bestTrade.pnl.toFixed(2)}</b>`;
    }
    if (summary.worstTrade) {
      text += `\n📉 أسوأ صفقة: <b>${summary.worstTrade.instrument} $${summary.worstTrade.pnl.toFixed(2)}</b>`;
    }
    if (summary.topInstrument) {
      const topSign = summary.topInstrument.totalPnl >= 0 ? "+" : "";
      text += `\n📌 أفضل أداة: <b>${summary.topInstrument.instrument} ${topSign}$${summary.topInstrument.totalPnl.toFixed(2)}</b>`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━
💰 الرصيد الحالي: <b>$${balance.toFixed(2)}</b>
🤖 الاستراتيجية: Trend Following + MTF Confirmation
━━━━━━━━━━━━━━━━━━
<i>تقرير تلقائي أسبوعي — HJ Capital Auto Trade</i>`;

    await sendTelegramMessage(text);
    console.log("[Scheduled] Weekly report sent successfully.");

    return res.json({ ok: true, sentAt: new Date().toISOString(), summary });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Scheduled] weekly-report failed:", error);
    return res.status(500).json({
      error,
      context: { url: req.url, taskUid: (req as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
