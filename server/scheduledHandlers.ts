/**
 * Scheduled Heartbeat Handlers — HJ Auto Trade
 * ─────────────────────────────────────────────────────────────────────────────
 * These handlers are triggered by Manus Heartbeat cron jobs.
 * They auto-start and auto-stop the HJ Auto Trade Engine on a daily schedule.
 *
 * Cron schedule (UTC):
 *   Start: "0 7 * * 1-5"  → 07:00 UTC Mon–Fri = 10:00 AM GMT+3
 *   Stop:  "0 20 * * 1-5" → 20:00 UTC Mon–Fri = 11:00 PM GMT+3
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  startAutoTrade,
  stopAutoTrade,
  getEngineState,
} from "./autoTradeEngine";
import { sendTelegramMessage } from "./telegram";

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

    // Start in paper mode by default (safe default for scheduled runs)
    const mode = (req.body?.mode as "paper" | "live") ?? "paper";
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
    await sendTelegramMessage(
      `🔴 *HJ Auto Trade — Scheduled Stop*\n\n` +
      `⏰ Time: ${now} (Cairo)\n` +
      `📋 Reason: ${reason}\n\n` +
      `_Engine stopped automatically by daily schedule. See you tomorrow!_`
    );

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
