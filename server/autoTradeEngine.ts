/**
 * HJ Auto Trade Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * The core AI brain of HJ Auto Trade Mode.
 * Responsibilities:
 *   1. Gather live market data (prices + multi-timeframe candles) from Capital.com
 *   2. Run technical analysis (RSI, MACD, Bollinger Bands, candlestick patterns)
 *   3. Run sentiment analysis (news RSS feeds)
 *   4. Apply correlation filter (avoid correlated positions)
 *   5. Ask the LLM to analyze and decide: BUY / SELL / HOLD / CLOSE
 *   6. Enforce risk rules before any execution
 *   7. Execute trades on Capital.com (live) or simulate (paper)
 *   8. Log every decision and action to the database
 *   9. Notify the owner of significant events
 */

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  notifyTradeOpened,
  notifyTradeClosed,
  notifyEngineStarted,
  notifyEngineStopped,
  notifyRiskAlert,
  notifyTradeReconciled,
  sendWeeklySummary,
} from "./telegram";
import {
  getAllMarketPrices,
  getMarketPrice,
  getCandles,
  getOpenPositions,
  getAccountBalance,
  placeOrder,
  closePosition,
  INSTRUMENT_EPICS,
  isMarketOpen,
  getOpenMarkets,
  checkMarketTradeable,
  getMinDealSize,
  getSessionTokens,
  updatePositionStopLoss,
  getTransactionHistory,
} from "./capitalcom";
import type { OHLCVCandle } from "./capitalcom";
import {
  buildTechnicalSummary,
  formatTechnicalSummaryForPrompt,
  isCorrelatedWithOpenPositions,
  getEMATrend,
  calculateRSI,
  calculateMACD,
} from "./technicalAnalysis";
import type { Candle } from "./technicalAnalysis";
import {
  getInstrumentSentiment,
  formatSentimentForPrompt,
} from "./sentimentAnalysis";
import { getDb, getPriceAlerts, triggerPriceAlert, getPortfolio, updateEngineIntelligence, closeTrade, updatePortfolioBalance } from "./db";
import {
  evaluateClosedTrade,
  formatLessonsForPrompt,
  getDynamicConfidenceThreshold,
  detectMarketRegime,
  formatRegimeForPrompt,
  calculateATRStopLoss,
  calculateATRPositionSize,
  calculateTrailingStop,
  getClientSentiment,
  formatSentimentSignalForPrompt,
  checkEconomicCalendar,
  runEnsembleAnalysis,
  getEnsembleSizeMultiplier,
} from "./engineIntelligence";
import type { MarketRegime, EnsembleResult } from "./engineIntelligence";
import {
  autoTradeSession,
  autoTradeLog,
  trades,
  riskSettings,
  portfolio,
} from "../drizzle/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeDecision {
  instrument: string;
  action: "BUY" | "SELL" | "HOLD" | "CLOSE" | "SKIP";
  confidence: number; // 0–100
  reasoning: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  size?: number;
  closeDealId?: string; // for CLOSE action
  // Position metadata for accurate close notifications
  positionDirection?: "BUY" | "SELL";
  positionOpenLevel?: number;
  positionCurrentLevel?: number;
}

export interface EngineState {
  sessionId: number;
  mode: "paper" | "live";
  isRunning: boolean;
  cycleCount: number;
  lastCycleAt: Date | null;
}

// In-memory state (single-user platform)
let _engineState: EngineState | null = null;
let _cycleTimer: ReturnType<typeof setTimeout> | null = null;
// NOTE: _lastWeeklySummaryDate is now persisted in the DB (engineIntelligence.lastWeeklySummaryDate)
// so it survives Autoscale cold-starts / server restarts. In-memory var is kept as fast-path cache.
let _lastWeeklySummaryDate: string | null = null;

// ─── Instrument Universe ─────────────────────────────────────────────────────

/**
 * Strategy: Trend Following with Multi-Timeframe Confirmation
 * ─────────────────────────────────────────────────────────────
 * 10 fixed instruments selected for:
 *  - High liquidity (tight spreads)
 *  - Strong trending behavior
 *  - Low correlation to each other (risk distribution)
 *  - 24h availability (Forex) + session-based (Indices, Gold)
 *
 * NO OIL_CRUDE (has restricted trading hours causing 400 errors)
 */
/**
 * ███ ROUND 52 — TRADING STANDARDS V1 (Aggressive, Conviction-based) ███
 * Universe culled from 10 → 6 ELITE instruments.
 * REMOVED: NASDAQ (-$106 loss, was still trading despite being marked removed in docs),
 *          USDJPY (-$63 loss, erratic with current ATR),
 *          XAGUSD/Silver (highly correlated with Gold but lower liquidity + higher noise),
 *          AUDUSD (low conviction, near-breakeven churn).
 * Rationale: trade with conviction, not frequency. Fewer, higher-quality instruments.
 */
export const CORE_INSTRUMENTS = [
  // Forex (2 pairs — most liquid, strongest trends)
  "EURUSD",   // Most liquid forex pair
  "GBPUSD",   // High volatility, strong trends
  // Commodities (1 — safe haven + inflation hedge)
  "GOLD",     // Safe haven, strong trends
  // Indices (2 — US + Europe)
  "US500",    // S&P 500 — primary US market
  "GER40",    // DAX — European market leader
  // Crypto (1 — 24/7 market)
  "ETHUSD",   // Ethereum — strong trends, high liquidity
];

// ─── Engine Control ───────────────────────────────────────────────────────────

export async function startAutoTrade(mode: "paper" | "live", cycleIntervalMinutes = 15): Promise<EngineState> {
  if (_engineState?.isRunning) {
    throw new Error("Auto trade engine is already running");
  }

  // Get current balance
  let startBalance = 250;
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  try {
    if (mode === "live") {
      const bal = await getAccountBalance();
      startBalance = bal.balance;
    } else {
      const port = await dbConn.select().from(portfolio).limit(1);
      startBalance = port[0] ? parseFloat(port[0].balance) : 250;
    }
  } catch { /* use default */ }

  // ███ PEAK BALANCE SYNC ███
  // At engine start, update peakBalance in DB if the live balance is higher than the stored peak.
  // This prevents false trailing-drawdown triggers when the engine restarts after a profitable session.
  if (mode === "live" && startBalance > 100) {
    try {
      const riskRows = await dbConn.select().from(riskSettings).limit(1);
      const storedPeak = riskRows[0] ? parseFloat(riskRows[0].peakBalance) : 0;
      if (startBalance > storedPeak) {
        await dbConn.update(riskSettings).set({ peakBalance: startBalance.toFixed(2) });
        console.log(`[AutoTrade] 📈 Peak balance synced at start: $${startBalance.toFixed(2)} (was $${storedPeak.toFixed(2)})`);
      }
    } catch (peakErr) {
      console.warn("[AutoTrade] Peak balance sync failed:", peakErr);
    }
  }

  // Create session record
  const db = dbConn;
  const [session] = await db.insert(autoTradeSession).values({
    status: "active",
    mode,
    cycleIntervalMinutes,
    maxTradesPerSession: 20,
    startBalance: startBalance.toFixed(2),
  });

  const sessionId = (session as any).insertId as number;

  _engineState = {
    sessionId,
    mode,
    isRunning: true,
    cycleCount: 0,
    lastCycleAt: null,
  };

  // Notify owner
  await notifyOwner({
    title: "🤖 HJ Auto Trade Started",
    content: `Auto trade engine activated in ${mode.toUpperCase()} mode. Starting balance: $${startBalance.toFixed(2)}. Cycle interval: ${cycleIntervalMinutes} minutes.`,
  }).catch(() => {});

  // Telegram notification
  await notifyEngineStarted(mode, startBalance).catch(() => {});

  // Run first cycle immediately, then schedule
  runCycle().catch(console.error);
  scheduleCycle(cycleIntervalMinutes);

  return _engineState;
}

export async function stopAutoTrade(reason = "Manual stop"): Promise<void> {
  if (!_engineState) return;

  if (_cycleTimer) {
    clearTimeout(_cycleTimer);
    _cycleTimer = null;
  }

  // Update session record
  const db = await getDb();
  if (!db) return;
  await db
    .update(autoTradeSession)
    .set({ status: "stopped", stoppedAt: new Date(), stopReason: reason })
    .where(eq(autoTradeSession.id, _engineState.sessionId));

  // Get final stats
  const sessions = await db
    .select()
    .from(autoTradeSession)
    .where(eq(autoTradeSession.id, _engineState.sessionId))
    .limit(1);

  const session = sessions[0];

  await notifyOwner({
    title: "🛑 HJ Auto Trade Stopped",
    content: `Auto trade engine stopped. Reason: ${reason}. Session P&L: $${session?.sessionPnl ?? "0.00"}. Trades: ${session?.totalTrades ?? 0} (${session?.winningTrades ?? 0} wins).`,
  }).catch(() => {});

  // Telegram notification
  const totalTrades = session?.totalTrades ?? 0;
  const winningTrades = session?.winningTrades ?? 0;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalPnl = parseFloat(session?.sessionPnl ?? "0");
  await notifyEngineStopped({ totalTrades, winRate, totalPnl }).catch(() => {});

  _engineState = null;
}

export function getEngineState(): EngineState | null {
  return _engineState;
}

function scheduleCycle(intervalMinutes: number) {
  if (_cycleTimer) clearTimeout(_cycleTimer);
  _cycleTimer = setTimeout(() => {
    if (_engineState?.isRunning) {
      runCycle().catch(console.error);
      scheduleCycle(intervalMinutes);
    }
  }, intervalMinutes * 60 * 1000);
}

// ─── Main Cycle ───────────────────────────────────────────────────────────────

async function runCycle() {
  if (!_engineState?.isRunning) return;

  _engineState.cycleCount++;
  _engineState.lastCycleAt = new Date();

  console.log(`[AutoTrade] Cycle #${_engineState.cycleCount} starting...`);

  try {
    // 0. Check Economic Calendar — skip if high-impact event in next 4 hours
    const calendarCheck = await checkEconomicCalendar();
    if (calendarCheck.shouldSkip) {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Economic Calendar: ${calendarCheck.reason}`,
      }, "skipped", calendarCheck.reason);
      await notifyRiskAlert(`📅 تم تخطي الدورة بسبب أحداث اقتصادية كبيرة\n${calendarCheck.reason}`).catch(() => {});
      console.log(`[AutoTrade] Cycle skipped: ${calendarCheck.reason}`);
      return;
    }

    // 0a. Market availability check — skip only if NO instruments are open right now.
    // Capital.com is open 24/5 (Sun 21:00 UTC – Fri 21:00 UTC).
    // Forex pairs trade nearly 24h, Crypto trades 24/7, Gold/Indices have short daily breaks.
    // We no longer block the entire Asian session — instead we let getOpenMarkets() filter
    // instruments per cycle, so the engine always trades whatever IS open.
    const openMarketsNow = getOpenMarkets(CORE_INSTRUMENTS);
    if (openMarketsNow.length === 0) {
      const nowUtcHour = new Date().getUTCHours();
      const noMarketMsg = `⏸️ لا توجد أسواق مفتوحة حالياً (${nowUtcHour}:00 UTC). التداول متوقف مؤقتاً.`;
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: noMarketMsg,
      }, "skipped", "No markets open");
      console.log(`[AutoTrade] Cycle skipped: No markets open (${nowUtcHour}:00 UTC)`);
      return;
    }

    // 0b. Dynamic Confidence Threshold — auto-adjust based on 7-day win rate
    // NOTE: shouldStop is always false now — engine never auto-stops due to win rate.
    // Instead, threshold is raised to 65% when win rate < 40% (high-confidence mode).
    const dynamicThreshold = await getDynamicConfidenceThreshold();
    // (shouldStop check removed — engine always continues, just with higher threshold)

    // 1. Check risk limits first
    const riskCheck = await checkDailyRiskLimits(_engineState.sessionId, _engineState.mode);
    if (riskCheck.blocked) {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Risk limit reached: ${riskCheck.reason}`,
      }, "blocked_risk", riskCheck.reason);

      // ███ ENGINE STAYS ALIVE ███
      // We do NOT stop the engine on risk limit. Instead we:
      // 1. Skip this cycle (no new trades opened)
      // 2. Keep the engine running so it can resume when the limit resets
      // 3. Send a Telegram alert (only once per hour to avoid spam)
      // The engine will auto-resume next cycle when the risk condition clears.
      const now = Date.now();
      const lastAlert = (_engineState as any)._lastRiskAlertAt ?? 0;
      if (now - lastAlert > 60 * 60 * 1000) { // 1 hour cooldown on alerts
        await notifyRiskAlert(`⏸️ تم تخطي الدورة — حد المخاطر نشط\n${riskCheck.reason}\n\n✅ المحرك لا يزال يعمل — سيستأنف التداول تلقائياً عند انتهاء القيود.`).catch(() => {});
        ((_engineState as any)._lastRiskAlertAt) = now;
      }
      console.log(`[AutoTrade] Cycle skipped (risk limit): ${riskCheck.reason}`);
      return; // skip this cycle, engine stays running
    }

    // 2. Gather market data (prices + multi-timeframe candles + technical analysis + sentiment)
    const marketContext = await gatherMarketContext();

    // 2b. Check price alerts against current prices
    try {
      const prices = (marketContext.prices as any[]) ?? [];
      const activeAlerts = await getPriceAlerts(true);
      for (const alert of activeAlerts) {
        const priceData = prices.find((p: any) =>
          p.epic === alert.instrument ||
          p.epic === (INSTRUMENT_EPICS[alert.instrument] ?? alert.instrument)
        );
        if (!priceData) continue;
        const mid = (priceData.bid + priceData.ask) / 2;
        const target = parseFloat(alert.targetPrice);
        const triggered =
          (alert.condition === "above" && mid >= target) ||
          (alert.condition === "below" && mid <= target);
        if (triggered) {
          await triggerPriceAlert(alert.id).catch(() => {});
          const { notifyPriceAlert } = await import("./telegram");
          await notifyPriceAlert({
            instrument: alert.instrument,
            condition: alert.condition,
            targetPrice: target,
            currentPrice: mid,
            note: alert.note ?? undefined,
          }).catch(() => {});
          console.log(`[AutoTrade] Price alert triggered: ${alert.instrument} ${alert.condition} $${target} (current: $${mid.toFixed(5)})`);
        }
      }
    } catch (alertErr) {
      console.error("[AutoTrade] Price alert check error:", alertErr);
    }

    // 3. Check open positions — decide if any should be closed
    const openPositions = _engineState.mode === "live"
      ? await getOpenPositions().catch(() => [])
      : [];

    // 3a. Position Reconciliation — close any DB "open" trades that no longer exist on Capital.com
    // This prevents the engine from thinking it has more open positions than it actually does.
    // Happens when: SL/TP hit on broker side, manual close, or broker-side expiry.
    if (_engineState.mode === "live") {
      try {
        const dbConn = await getDb();
        if (dbConn) {
          const { trades: tradesTable } = await import("../drizzle/schema");
          const { eq, and } = await import("drizzle-orm");
          const dbOpenTrades = await dbConn
            .select()
            .from(tradesTable)
            .where(and(eq(tradesTable.status, "open"), eq(tradesTable.mode, "live")));

          // Build set of epics currently open on Capital.com
          const brokerEpics = new Set(openPositions.map((p) => p.epic));

          // ███ DEALID BACKFILL ███
          // For existing open trades that were opened before dealId tracking was added,
          // match them to Capital.com positions by epic and backfill the dealId.
          for (const pos of openPositions) {
            const friendlyName = Object.entries(INSTRUMENT_EPICS).find(([, v]) => v === pos.epic)?.[0] ?? pos.epic;
            const matchingDbTrade = dbOpenTrades.find(
              (t) => !t.dealId && (t.instrument === friendlyName || (INSTRUMENT_EPICS[t.instrument] ?? t.instrument) === pos.epic)
            );
            if (matchingDbTrade && pos.dealId) {
              const { trades: tradesTable2 } = await import("../drizzle/schema");
              const { eq: eq2 } = await import("drizzle-orm");
              await dbConn.update(tradesTable2)
                .set({ dealId: pos.dealId })
                .where(eq2(tradesTable2.id, matchingDbTrade.id));
              console.log(`[AutoTrade] DealId backfill: trade #${matchingDbTrade.id} (${matchingDbTrade.instrument}) → dealId=${pos.dealId}`);
            }
          }

          // Fetch recent transaction history to get real close prices/P&L
          // Capital.com API constraint: max date range is 1 day (24h).
          // We use 23h to stay safely within the limit.
          // Date format must be: YYYY-MM-DDTHH:MM:SS (ISO 8601, no milliseconds, no Z suffix)
          let recentTransactions: Awaited<ReturnType<typeof getTransactionHistory>> = [];
          try {
            const from23h = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString().slice(0, 19);
            recentTransactions = await getTransactionHistory(from23h, undefined, 100);
          } catch (txErr) {
            console.warn("[AutoTrade] Reconciliation: could not fetch transaction history:", txErr);
          }

          // For each DB-open trade, check if it still exists on the broker
          for (const dbTrade of dbOpenTrades) {
            const tradeEpic = INSTRUMENT_EPICS[dbTrade.instrument] ?? dbTrade.instrument;
            if (!brokerEpics.has(tradeEpic)) {
              // Try to find the real close price and P&L from transaction history.
              // Strategy: match by instrument name (multiple fallbacks) and pick the most recent TRADE.
              const instrumentEpic = (INSTRUMENT_EPICS[dbTrade.instrument] ?? dbTrade.instrument).toUpperCase();
              const instrumentFriendly = dbTrade.instrument.toUpperCase();

              const matchingTx = recentTransactions
                .filter((tx) => {
                  if (tx.cashTransaction) return false;
                  if (tx.type !== "TRADE" && tx.type !== "POSITION") return false;
                  if (!tx.instrumentName) return false;
                  const txName = tx.instrumentName.toUpperCase().replace(/[\s/-]/g, "");
                  const epicClean = instrumentEpic.replace(/[\s/-]/g, "");
                  const friendlyClean = instrumentFriendly.replace(/[\s/-]/g, "");
                  // Match if tx name contains or is contained by either the epic or friendly name
                  return (
                    txName.includes(epicClean) || epicClean.includes(txName) ||
                    txName.includes(friendlyClean) || friendlyClean.includes(txName)
                  );
                })
                // Sort by date descending — pick the most recent matching transaction
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

              let closePrice = dbTrade.openPrice ?? "0";
              let pnl = "0.00";
              let pnlSource = "unknown (no matching transaction found)";

              if (matchingTx) {
                // Parse P&L from Capital.com format: "USD 1.23", "-USD 0.50", or "1.23"
                const pnlStr = (matchingTx.profitAndLoss ?? "").trim();
                // Handles: "USD 1.23", "-USD 0.50", "USD -1.23", "1.23", "-1.23"
                const pnlMatch = pnlStr.match(/^(-?)[A-Z]* *(-?[\d.]+)$/) ||
                                 pnlStr.match(/^([+-]?[\d.]+)$/);
                if (pnlMatch) {
                  const rawNum = parseFloat(pnlMatch[pnlMatch.length - 1]);
                  const prefixNeg = pnlMatch[1] === "-";
                  pnl = (prefixNeg && rawNum > 0 ? -rawNum : rawNum).toFixed(2);
                }
                if (matchingTx.closeLevel && matchingTx.closeLevel > 0) {
                  closePrice = matchingTx.closeLevel.toFixed(5);
                }
                pnlSource = `Capital.com transaction ${matchingTx.reference} (raw: "${matchingTx.profitAndLoss}", parsed: $${pnl})`;
              }

              await closeTrade(dbTrade.id, closePrice, pnl, "reconciled");
              console.log(`[AutoTrade] Reconciliation: closed orphaned DB trade #${dbTrade.id} (${dbTrade.instrument}) — closePrice=${closePrice}, P&L=${pnl} (${pnlSource})`);

              // Learning Memory: evaluate reconciled trade so AI learns from broker-closed positions
              evaluateClosedTrade({
                tradeId: dbTrade.id,
                instrument: dbTrade.instrument,
                direction: dbTrade.direction as "BUY" | "SELL",
                entryPrice: parseFloat(dbTrade.openPrice ?? "0"),
                exitPrice: parseFloat(closePrice),
                pnl: parseFloat(pnl),
                originalReasoning: dbTrade.aiReasoning ?? "No reasoning recorded",
                marketConditionsAtEntry: `Reconciled close (broker closed position). Mode: ${dbTrade.mode ?? "live"}, Confidence: ${dbTrade.aiConfidence ?? 0}%`,
                mode: (dbTrade.mode as "paper" | "live") ?? "live",
              }).catch(() => {});

              // Send Telegram notification for reconciled trade (Capital.com closed it via SL/TP/Manual)
              await notifyTradeReconciled({
                tradeId: dbTrade.id,
                instrument: dbTrade.instrument,
                direction: dbTrade.direction as "BUY" | "SELL",
                entryPrice: dbTrade.openPrice ?? "0",
                closePrice,
                pnl: parseFloat(pnl),
                pnlSource,
                mode: (dbTrade.mode as "paper" | "live") ?? "live",
              }).catch(() => {});

              // Also notify owner via Manus notification
              await notifyOwner({
                title: `🔄 Position Reconciliation: ${dbTrade.instrument}`,
                content: `Trade #${dbTrade.id} (${dbTrade.instrument} ${dbTrade.direction} @ ${dbTrade.openPrice}) was closed on Capital.com.\nClose Price: ${closePrice}\nP&L: $${pnl}\nSource: ${pnlSource}`,
              }).catch(() => {});
            }
          }
        }
      } catch (reconcileErr) {
        console.warn("[AutoTrade] Position reconciliation error:", reconcileErr);
      }
    }

    for (const pos of openPositions) {
      // ███ TRAILING STOP LOGIC ███
      // Before asking AI to close, check if we should move SL to protect profits
      // This runs every cycle (every 15 min) to lock in gains as price moves in our favor
      try {
        const dbTs = await getDb();
        if (dbTs && pos.openLevel && pos.currentLevel) {
          // ███ ROUND 52 — TRAILING STOP DB MATCH FIX ███
          // Match the DB trade by the broker dealId first (exact), instead of
          // instrument==pos.epic (which used raw epic, not the friendly name, and
          // could grab the wrong row when multiple trades share an instrument).
          const { trades: tradesTable } = await import("../drizzle/schema");
          const { eq, and, desc } = await import("drizzle-orm");
          let openTrade: typeof tradesTable.$inferSelect | undefined;
          if (pos.dealId) {
            [openTrade] = await dbTs
              .select()
              .from(tradesTable)
              .where(and(
                eq(tradesTable.status, "open"),
                eq(tradesTable.dealId, pos.dealId)
              ))
              .limit(1);
          }
          if (!openTrade) {
            // Fallback: legacy trades without dealId — match by friendly instrument name
            const posFriendly = Object.entries(INSTRUMENT_EPICS).find(([, v]) => v === pos.epic)?.[0] ?? pos.epic;
            [openTrade] = await dbTs
              .select()
              .from(tradesTable)
              .where(and(
                eq(tradesTable.status, "open"),
                eq(tradesTable.instrument, posFriendly)
              ))
              .orderBy(desc(tradesTable.openedAt))
              .limit(1);
          }

          if (openTrade && openTrade.stopLoss && openTrade.takeProfit) {
            const originalSL = parseFloat(openTrade.stopLoss);
            const takeProfit = parseFloat(openTrade.takeProfit);
            const direction = pos.direction as "BUY" | "SELL";

            const { newSL, reason } = calculateTrailingStop(
              direction,
              pos.openLevel,
              pos.currentLevel,
              originalSL,
              takeProfit
            );

            // Only update if SL has improved (moved in favor of the trade)
            const slImproved = direction === "BUY"
              ? newSL > originalSL
              : newSL < originalSL;

            if (slImproved) {
              console.log(`[AutoTrade] TRAILING STOP: ${pos.epic} ${direction} — SL moved from ${originalSL} to ${newSL} (${reason})`);

              // ███ SEND REAL TRAILING STOP TO CAPITAL.COM BROKER ███
              // This is critical — without this, the broker still uses the old SL
              let brokerUpdateSuccess = false;
              if (_engineState.mode === "live" && pos.dealId) {
                const updateResult = await updatePositionStopLoss(pos.dealId, newSL);
                brokerUpdateSuccess = updateResult.success;
                if (!updateResult.success) {
                  console.warn(`[AutoTrade] TRAILING STOP: Failed to update SL on Capital.com for ${pos.epic} (dealId: ${pos.dealId}) — DB updated but broker not notified`);
                }
              } else {
                brokerUpdateSuccess = true; // Paper mode: DB only is fine
              }

              // Update in DB (always, even if broker update failed — for tracking)
              await dbTs.update(tradesTable)
                .set({ stopLoss: newSL.toFixed(5) })
                .where(eq(tradesTable.id, openTrade.id));

              // Notify owner
              await notifyOwner({
                title: `🛡️ Trailing Stop Updated: ${pos.epic}`,
                content: `${reason}. New SL: ${newSL.toFixed(5)} (was ${originalSL.toFixed(5)}). Broker updated: ${brokerUpdateSuccess ? '✅' : '⚠️ DB only'}. Current P&L: $${pos.profitLoss?.toFixed(2)}`,
              }).catch(() => {});
            }
          }
        }
      } catch (trailErr) {
        console.warn(`[AutoTrade] Trailing stop error for ${pos.epic}:`, trailErr);
      }

      // ███ TECHNICAL SL/TP FALLBACK CLOSE GUARD ███
      // If the current price has breached the DB-stored SL or TP levels,
      // close immediately WITHOUT waiting for AI — this is a safety net for cases
      // where Capital.com's broker-side SL/TP did not trigger (e.g. gap, slippage, paper mode)
      let technicalCloseTriggered = false;
      try {
        const dbFallback = await getDb();
        if (dbFallback) {
          const { trades: tradesTable } = await import("../drizzle/schema");
          const { eq, and, desc } = await import("drizzle-orm");
          const [openTrade] = await dbFallback
            .select()
            .from(tradesTable)
            .where(and(eq(tradesTable.status, "open"), eq(tradesTable.instrument, pos.epic)))
            .orderBy(desc(tradesTable.openedAt))
            .limit(1);

          if (openTrade && openTrade.stopLoss && openTrade.takeProfit && pos.currentLevel) {
            const sl = parseFloat(openTrade.stopLoss);
            const tp = parseFloat(openTrade.takeProfit);
            const price = pos.currentLevel;
            const dir = pos.direction as "BUY" | "SELL";

            // Apply 0.1% tolerance to avoid premature close from spread/noise.
            // The price must move PAST the SL/TP by at least 0.1% before triggering.
            // Example: SL=1.0800 BUY → only triggers if price ≤ 1.0789 (not 1.0800)
            const TOLERANCE = 0.001; // 0.1%
            const slBreached = dir === "BUY" ? price <= sl * (1 - TOLERANCE) : price >= sl * (1 + TOLERANCE);
            const tpBreached = dir === "BUY" ? price >= tp * (1 + TOLERANCE) : price <= tp * (1 - TOLERANCE);

            if (slBreached || tpBreached) {
              const triggerType = slBreached ? "SL" : "TP";
              const triggerLevel = slBreached ? sl : tp;
              console.warn(`[AutoTrade] TECHNICAL ${triggerType} GUARD: ${pos.epic} ${dir} — price ${price} breached ${triggerType}=${triggerLevel} — closing immediately`);

              const fallbackDecision: TradeDecision = {
                instrument: pos.epic,
                action: "CLOSE",
                confidence: 100,
                reasoning: `Technical ${triggerType} guard: price ${price} breached ${triggerType} level ${triggerLevel} — broker-side order may not have triggered`,
                closeDealId: pos.dealId,
                positionDirection: dir,
                positionOpenLevel: pos.openLevel,
                positionCurrentLevel: price,
              };
              await executeDecision(fallbackDecision, _engineState.sessionId, _engineState.mode);
              technicalCloseTriggered = true;

              await notifyOwner({
                title: `🛡️ Technical ${triggerType} Guard Triggered: ${pos.epic}`,
                content: `${dir} position closed by technical guard.\nPrice: ${price} | ${triggerType}: ${triggerLevel}\nBroker-side order may not have fired.`,
              }).catch(() => {});
            }
          }
        }
      } catch (slTpErr) {
        console.warn(`[AutoTrade] Technical SL/TP guard error for ${pos.epic}:`, slTpErr);
      }

      // Only ask AI to close if the technical guard did not already close it
      if (!technicalCloseTriggered) {
        const closeDecision = await analyzeForClose(pos, marketContext);
        if (closeDecision.action === "CLOSE") {
          await executeDecision(closeDecision, _engineState.sessionId, _engineState.mode);
        }
      }
    }

    // 4. Analyze ALL instruments in parallel and execute ALL valid trades
    const risk = await getRiskSettings();
    const openCount = openPositions.length;

    // ███ LIVE BALANCE CACHE ███
    // Fetch the live Capital.com balance ONCE per cycle and share it across all
    // analyzeInstrument() calls for accurate ATR position sizing.
    // Previously each call fetched balance independently (extra API calls + stale values).
    const cycleAccountBalance = await getCurrentBalance(_engineState.mode).catch(() => 250);
    console.log(`[AutoTrade] Cycle balance: $${cycleAccountBalance.toFixed(2)} (${_engineState.mode} mode)`);
    // ███ BALANCE SYNC ███ — persist live Capital.com balance to DB every cycle
    // This ensures our dashboard always shows the real broker balance, not the stale $250 default.
    if (_engineState.mode === "live" && cycleAccountBalance > 0) {
      await updatePortfolioBalance(cycleAccountBalance.toFixed(2)).catch((e) =>
        console.warn("[AutoTrade] Balance sync failed:", e)
      );
    }

    // Portfolio manager bypass: if 0 open positions, always allow at least 1 trade
    // regardless of maxOpenPositions setting (prevents engine from being stuck at 0)
    const effectiveMaxPositions = openCount === 0 ? Math.max(1, risk.maxOpenPositions) : risk.maxOpenPositions;

    if (openCount < effectiveMaxPositions) {
      // Get list of currently open instrument names for correlation filter.
      // Capital.com returns broker epics (e.g. "AUDUSD", "DE40", "US100") but our
      // correlation groups and CORE_INSTRUMENTS use friendly names (e.g. "GER40", "NASDAQ").
      // We must reverse-map broker epics → friendly names so the correlation filter works correctly.
      const epicToFriendly = Object.fromEntries(
        Object.entries(INSTRUMENT_EPICS).map(([friendly, epic]) => [epic, friendly])
      );
      const openInstruments = openPositions.map((p) => epicToFriendly[p.epic] ?? p.epic);

      // How many more positions can we open?
      const remainingSlots = risk.maxOpenPositions - openCount;

      // Build this cycle's instrument list: fixed 10 instruments only
      const allInstruments = getOpenMarkets(CORE_INSTRUMENTS);

      // Filter out instruments already in open positions
      // ███ COOLDOWN FILTER ███
      // After a losing trade on an instrument, block it for 120 minutes.
      // ███ ROUND 52 — TRADING STANDARDS V1: raised 60→120 min ███
      // This prevents the engine from re-entering the same losing trade repeatedly
      // (e.g. GOLD BUY -$10.56 ×3 in one hour on 14 June).
      const COOLDOWN_MINUTES = 120;
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000);
      let cooledDownInstruments: string[] = [];
      try {
        const dbConn = await getDb();
        if (dbConn) {
          const { trades: tradesTable } = await import("../drizzle/schema");
          const { gte: gteOp, and: andOp, eq: eqOp } = await import("drizzle-orm");
          const recentLosers = await dbConn
            .select({ instrument: tradesTable.instrument })
            .from(tradesTable)
            .where(
              andOp(
                eqOp(tradesTable.mode, _engineState!.mode),
                gteOp(tradesTable.closedAt, cooldownCutoff)
              )
            );
          // Instruments with a losing trade (pnl < 0) in the last 60 minutes
          const recentLosersAll = await dbConn
            .select({ instrument: tradesTable.instrument, pnl: tradesTable.pnl })
            .from(tradesTable)
            .where(
              andOp(
                eqOp(tradesTable.mode, _engineState!.mode),
                gteOp(tradesTable.closedAt, cooldownCutoff)
              )
            );
          cooledDownInstruments = [...new Set(
            recentLosersAll
              .filter((t) => t.pnl !== null && parseFloat(String(t.pnl)) < 0)
              .map((t) => t.instrument)
          )];
          if (cooledDownInstruments.length > 0) {
            console.log(`[AutoTrade] COOLDOWN: Blocking ${cooledDownInstruments.join(", ")} for ${COOLDOWN_MINUTES}min after recent loss`);
          }
        }
      } catch (cdErr) {
        console.warn("[AutoTrade] Cooldown check error:", cdErr);
      }

      const candidateInstruments = allInstruments.filter(
        (inst) => !openInstruments.includes(inst) && !cooledDownInstruments.includes(inst)
      );

      if (candidateInstruments.length === 0) {
        await logDecision(_engineState.sessionId, {
          instrument: "ALL",
          action: "SKIP",
          confidence: 0,
          reasoning: "All open-market instruments already have open positions",
        }, "skipped", "All instruments already in open positions");
      } else {
        await logDecision(_engineState.sessionId, {
          instrument: "ALL",
          action: "HOLD",
          confidence: 0,
          reasoning: `🔍 فحص ${candidateInstruments.length} أداة: ${candidateInstruments.join(", ")} — بحثاً عن أفضل الفرص...`,
        }, "skipped", `Scanning ${candidateInstruments.length} instruments`);

        console.log(`[AutoTrade] Scanning ${candidateInstruments.length} instruments: ${candidateInstruments.join(", ")}`);

        // Analyze ALL candidate instruments in parallel
        const scanResults = await Promise.allSettled(
          candidateInstruments.map((inst) =>
            analyzeInstrument(inst, marketContext, risk, openInstruments, dynamicThreshold.threshold, cycleAccountBalance)
          )
        );

        // Collect all valid BUY/SELL opportunities (confidence > 0 required)
        const opportunities: TradeDecision[] = [];
        for (let i = 0; i < scanResults.length; i++) {
          const result = scanResults[i];
          const inst = candidateInstruments[i];
          if (result.status === "fulfilled") {
            const d = result.value;
            if (d.action !== "HOLD" && d.action !== "SKIP" && d.instrument !== "NONE" && d.confidence > 0) {
              console.log(`[AutoTrade] Opportunity found: ${inst} ${d.action} @ ${d.confidence}%`);
              opportunities.push(d);
            } else if (d.confidence === 0 && d.action !== "HOLD" && d.action !== "SKIP") {
              // AI returned BUY/SELL but with 0% confidence — treat as HOLD
              console.log(`[AutoTrade] Rejected ${inst} ${d.action} @ 0% confidence — AI uncertain, treating as HOLD`);
            } else {
              console.log(`[AutoTrade] No opportunity on ${inst}: ${d.reasoning?.slice(0, 80)}`);
            }
          } else {
            console.error(`[AutoTrade] Analysis failed for ${inst}:`, result.reason);
          }
        }

        if (opportunities.length === 0) {
          console.log(`[AutoTrade] No opportunities found across all instruments — waiting for next cycle`);
          await logDecision(_engineState.sessionId, {
            instrument: "ALL",
            action: "HOLD",
            confidence: 0,
            reasoning: `لا توجد فرص عبر ${candidateInstruments.join(", ")} — السوق غير مناسب للتداول الآن`,
          }, "skipped", "No opportunities found after full parallel scan");
        } else {
          // Sort by confidence descending — best opportunities first
          opportunities.sort((a, b) => b.confidence - a.confidence);

          console.log(`[AutoTrade] Found ${opportunities.length} opportunities, executing up to ${remainingSlots} trades`);

          // Log found-opportunities summary to Decision Log (visible in UI)
          await logDecision(_engineState.sessionId, {
            instrument: "ALL",
            action: "HOLD",
            confidence: 0,
            reasoning: `✅ وجدنا ${opportunities.length} فرصة: ${opportunities.map((o) => `${o.instrument} ${o.action} (${o.confidence}%)`).join(" | ")} — ننفذ أفضل ${Math.min(opportunities.length, remainingSlots)} منها`,
          }, "skipped", `Found ${opportunities.length} opportunities`);

          // Apply correlation filter across the new opportunities themselves
          // (avoid opening EURUSD + GBPUSD in the same cycle)
          const executedInstruments: string[] = [...openInstruments];
          const tradesToExecute: TradeDecision[] = [];

          for (const opp of opportunities) {
            if (tradesToExecute.length >= remainingSlots) break;

            // Check correlation against already-queued instruments this cycle
            const corrCheck = isCorrelatedWithOpenPositions(opp.instrument, executedInstruments);
            if (corrCheck.correlated) {
              console.log(`[AutoTrade] Skipping ${opp.instrument} — correlated with ${corrCheck.conflictsWith}`);
              await logDecision(_engineState.sessionId, {
                ...opp,
                action: "SKIP",
                reasoning: `تم تخطي ${opp.instrument} — مرتبط بـ ${corrCheck.conflictsWith} المفتوح بالفعل`,
              }, "skipped", `Correlated with ${corrCheck.conflictsWith}`);
              continue;
            }

            // Check market is open
            if (!isMarketOpen(opp.instrument)) {
              await logDecision(_engineState.sessionId, {
                ...opp,
                action: "SKIP",
                reasoning: `السوق مغلق: ${opp.instrument} غير متاح للتداول الآن. ${opp.reasoning}`,
              }, "skipped", `Market closed: ${opp.instrument}`);
              continue;
            }

            tradesToExecute.push(opp);
            executedInstruments.push(opp.instrument);
          }

          // Execute all valid trades simultaneously
          if (tradesToExecute.length > 0) {
            console.log(`[AutoTrade] Executing ${tradesToExecute.length} trade(s) simultaneously: ${tradesToExecute.map((t) => t.instrument).join(", ")}`);
            await Promise.allSettled(
              tradesToExecute.map((opp) =>
                executeDecision(opp, _engineState!.sessionId, _engineState!.mode)
              )
            );
            console.log(`[AutoTrade] Executed ${tradesToExecute.length} trade(s) this cycle`);
          }
        }
      }
    } else {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Max open positions (${risk.maxOpenPositions}) reached — ${openCount} currently open`,
      }, "skipped", "Max positions reached");
    }

    // Cycle heartbeat summary
    console.log(`[AutoTrade] Cycle #${_engineState.cycleCount} complete — ${openPositions.length} open positions, threshold=${risk.minConfidenceThreshold}%`);

    // Friday Weekly Summary — send once per Friday between 20:00-21:00 UTC
    try {
      const now = new Date();
      const utcDay = now.getUTCDay(); // 5 = Friday
      const utcHour = now.getUTCHours();
      const todayDateStr = now.toISOString().slice(0, 10);
      // Check both in-memory cache and DB to survive server restarts
      let weeklySummaryAlreadySent = _lastWeeklySummaryDate === todayDateStr;
      if (!weeklySummaryAlreadySent) {
        const intelCheck = await getDb().then(async db => {
          if (!db) return null;
          const { engineIntelligence: eiTable } = await import("../drizzle/schema");
          const rows = await db.select().from(eiTable).limit(1);
          return rows[0] ?? null;
        }).catch(() => null);
        if (intelCheck?.lastWeeklySummaryDate === todayDateStr) {
          weeklySummaryAlreadySent = true;
          _lastWeeklySummaryDate = todayDateStr; // update in-memory cache
        }
      }
      if (utcDay === 5 && utcHour === 20 && !weeklySummaryAlreadySent) {
        _lastWeeklySummaryDate = todayDateStr;
        // Persist to DB so future cold-starts know we already sent it today
        await updateEngineIntelligence({ lastWeeklySummaryDate: todayDateStr }).catch(() => {});
        // Compute weekly stats from closed trades this week (Mon-Fri)
        const db = await getDb();
        if (db) {
          const weekStart = new Date(now);
          weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1); // Monday
          weekStart.setUTCHours(0, 0, 0, 0);
          const { trades: tradesTable } = await import("../drizzle/schema");
          const { eq: eqOp } = await import("drizzle-orm");
          const weekTrades = await db.select().from(tradesTable)
            .where(eqOp(tradesTable.status, "closed"));
          const thisWeek = weekTrades.filter(t => t.closedAt && t.closedAt >= weekStart);
          let totalPnl = 0, wins = 0, losses = 0, bestTrade = 0, worstTrade = 0;
          for (const t of thisWeek) {
            const p = parseFloat(t.pnl ?? "0");
            totalPnl += p;
            if (p > 0) { wins++; if (p > bestTrade) bestTrade = p; }
            else if (p < 0) { losses++; if (p < worstTrade) worstTrade = p; }
          }
          const totalTrades = thisWeek.length;
          const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
          const port = await getPortfolio();
          const balance = port ? parseFloat(port.balance) : 0;
          const weekStartStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const weekEndStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          await sendWeeklySummary({
            weekStart: weekStartStr,
            weekEnd: weekEndStr,
            totalTrades,
            wins,
            losses,
            totalPnl: Math.round(totalPnl * 100) / 100,
            winRate: Math.round(winRate * 10) / 10,
            bestTrade: Math.round(bestTrade * 100) / 100,
            worstTrade: Math.round(worstTrade * 100) / 100,
            balance,
          }).catch(err => console.error("[AutoTrade] Weekly summary send failed:", err));
          console.log(`[AutoTrade] Weekly Friday summary sent: ${totalTrades} trades, ${winRate.toFixed(1)}% win rate, $${totalPnl.toFixed(2)} P&L`);
        }
      }
    } catch (weeklyErr) {
      console.error("[AutoTrade] Weekly summary error:", weeklyErr);
    }

  } catch (err) {
    console.error("[AutoTrade] Cycle error:", err);
    await logDecision(_engineState.sessionId, {
      instrument: "UNKNOWN",
      action: "SKIP",
      confidence: 0,
      reasoning: `Cycle error: ${String(err)}`,
    }, "error", String(err));
  }
}

// ─── Market Context (Multi-Timeframe + Technical + Sentiment) ─────────────────

interface MultiTimeframeData {
  candles5m: OHLCVCandle[];
  candles1h: OHLCVCandle[];
  candles4h: OHLCVCandle[];
  technicalSummary5m: string;
  technicalSummary1h: string;
  technicalSummary4h: string;
}

async function gatherMarketContext(): Promise<Record<string, unknown>> {
  const [prices, newsHeadlines] = await Promise.allSettled([
    getAllMarketPrices(),
    fetchNewsHeadlines(),
  ]);

  // Fetch multi-timeframe candles + technical analysis for open markets
  const topInstruments = getOpenMarkets(CORE_INSTRUMENTS);

  const technicalData: Record<string, MultiTimeframeData> = {};
  const sentimentData: Record<string, string> = {};

  // Fetch Capital.com Client Sentiment (contrarian signal)
  let clientSentimentSection = "";
  try {
    const tokens = await getSessionTokens().catch(() => null);
    if (tokens) {
      const sentimentMap = await getClientSentiment(
        tokens.securityToken,
        tokens.cst,
        topInstruments.map((inst) => INSTRUMENT_EPICS[inst] ?? inst)
      );
      clientSentimentSection = formatSentimentSignalForPrompt(sentimentMap);
    }
  } catch (err) {
    console.warn("[AutoTrade] Client sentiment error:", err);
  }

  // Fetch instruments sequentially with a small delay to avoid Capital.com 429 rate limits
  // (10 instruments × 3 timeframes = 30 API calls — sequential with 300ms gap prevents throttling)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < topInstruments.length; i++) {
    const inst = topInstruments[i];
    const epic = INSTRUMENT_EPICS[inst] ?? inst;

    // Small delay between instruments (skip for first)
    if (i > 0) await sleep(300);

    // Fetch 3 timeframes sequentially per instrument to stay within rate limits
    const c5m = await getCandles(epic, "MINUTE_5", 50).catch(() => [] as OHLCVCandle[]);
    await sleep(150);
    const c1h = await getCandles(epic, "HOUR", 50).catch(() => [] as OHLCVCandle[]);
    await sleep(150);
    const c4h = await getCandles(epic, "HOUR_4", 250).catch(() => [] as OHLCVCandle[]);

    // Convert to Candle format for technical analysis
    const toCandles = (arr: OHLCVCandle[]): Candle[] =>
      arr.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp }));

    const summary5m = c5m.length >= 14
      ? formatTechnicalSummaryForPrompt(inst, buildTechnicalSummary(toCandles(c5m)), "5min")
      : `${inst} [5min]: insufficient data`;
    const summary1h = c1h.length >= 14
      ? formatTechnicalSummaryForPrompt(inst, buildTechnicalSummary(toCandles(c1h)), "1H")
      : `${inst} [1H]: insufficient data`;
    const summary4h = c4h.length >= 14
      ? formatTechnicalSummaryForPrompt(inst, buildTechnicalSummary(toCandles(c4h)), "4H")
      : `${inst} [4H]: insufficient data`;

    technicalData[inst] = {
      candles5m: c5m,
      candles1h: c1h,
      candles4h: c4h,
      technicalSummary5m: summary5m,
      technicalSummary1h: summary1h,
      technicalSummary4h: summary4h,
    };

    // Sentiment analysis
    const sentiment = await getInstrumentSentiment(inst).catch(() => null);
    if (sentiment) {
      sentimentData[inst] = formatSentimentForPrompt(inst, sentiment);
    }
  }

  return {
    prices: prices.status === "fulfilled" ? prices.value : [],
    news: newsHeadlines.status === "fulfilled" ? newsHeadlines.value : [],
    technical: technicalData,
    sentiment: sentimentData,
    clientSentiment: clientSentimentSection,
    timestamp: new Date().toISOString(),
  };
}

async function fetchNewsHeadlines(): Promise<string[]> {
  // Use a public financial news RSS or fallback to static context
  try {
    const res = await fetch(
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD=X,GC=F,^GSPC&region=US&lang=en-US",
      { signal: AbortSignal.timeout(5000) }
    );
    const text = await res.text();
    // Extract titles from RSS
    const regex = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g;
    const titles: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null && titles.length < 8) {
      titles.push(match[1]);
    }
    return titles.length > 0 ? titles : getDefaultNewsContext();
  } catch {
    return getDefaultNewsContext();
  }
}

function getDefaultNewsContext(): string[] {
  return [
    "Markets open — monitoring USD strength and risk sentiment",
    "Gold prices stable amid geopolitical uncertainty",
    "EUR/USD consolidating near key support levels",
  ];
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

async function analyzeMarket(
  marketContext: Record<string, unknown>,
  risk: { minConfidenceThreshold: number; maxRiskPerTrade: number },
  openInstruments: string[],
  dynamicThreshold?: number
): Promise<TradeDecision> {
  const effectiveThreshold = dynamicThreshold ?? risk.minConfidenceThreshold;
  const prices = (marketContext.prices as any[]) ?? [];
  const news = (marketContext.news as string[]) ?? [];
  const technical = marketContext.technical as Record<string, MultiTimeframeData>;
  const sentiment = marketContext.sentiment as Record<string, string>;
  const clientSentiment = (marketContext.clientSentiment as string) ?? "";

  const pricesSummary = prices
    .map((p: any) => `${p.epic}: bid=${p.bid}, ask=${p.ask}, change=${p.pctChange?.toFixed(2)}%`)
    .join("\n");

  // Build multi-timeframe technical analysis section
  const technicalSection = Object.entries(technical)
    .map(([inst, data]) => {
      // Check correlation filter
      const corrCheck = isCorrelatedWithOpenPositions(inst, openInstruments);
      const corrWarning = corrCheck.correlated
        ? `  ⚠️ CORRELATED with open position: ${corrCheck.conflictsWith} — avoid opening`
        : "";
      return [
        data.technicalSummary5m,
        data.technicalSummary1h,
        data.technicalSummary4h,
        corrWarning,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  // Build sentiment section (news-based)
  const sentimentSection = Object.values(sentiment).join("\n");

  // Build regime section for each instrument
  const regimeSection = Object.entries(technical)
    .map(([inst, data]) => {
      if (data.candles1h.length >= 20) {
        const candles = data.candles1h.map((c: OHLCVCandle) => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp }));
        const regime = detectMarketRegime(candles);
        return formatRegimeForPrompt(inst, regime);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  // Fetch lessons for context (top instruments)
  const lessonsSection = await Promise.all(
    Object.keys(technical).slice(0, 2).map((inst) => formatLessonsForPrompt(inst))
  ).then((arr) => arr.filter(Boolean).join("\n"));

  // Determine trading session for context
  const utcHourMain = new Date().getUTCHours();
  const sessionMain = utcHourMain >= 7 && utcHourMain < 16 ? "London Session (high liquidity)" :
    utcHourMain >= 13 && utcHourMain < 22 ? "New York Session (high liquidity)" :
    utcHourMain >= 22 || utcHourMain < 7 ? "Asian Session (lower liquidity)" : "Session overlap";

  // Build the full enhanced prompt
  const prompt = `You are HJ Capital's senior portfolio manager. Your PRIMARY GOAL is to find and execute profitable trades — not to avoid them. Markets always have opportunities; your job is to identify the BEST one right now.

CURRENT SESSION: ${sessionMain}

LIVE MARKET PRICES (right now):
${pricesSummary}

MULTI-TIMEFRAME TECHNICAL ANALYSIS:
${technicalSection || "No technical data available"}

NEWS SENTIMENT:
${sentimentSection || "No sentiment data available"}

MARKET REGIME ANALYSIS:
${regimeSection || "No regime data available"}
${clientSentiment ? `\nCAPITAL.COM CLIENT SENTIMENT (Contrarian):${clientSentiment}` : ""}

PAST LESSONS (learn from these):
${lessonsSection || "No lessons yet — this is early in the learning cycle"}

LATEST NEWS HEADLINES:
${news.slice(0, 5).join("\n")}

CURRENTLY OPEN MARKETS (only trade these):
${getOpenMarkets(CORE_INSTRUMENTS).join(", ") || "No markets open right now"}

CURRENTLY OPEN POSITIONS (correlation filter — avoid correlated pairs):
${openInstruments.length > 0 ? openInstruments.join(", ") : "None"}

PORTFOLIO MANAGER RULES:
1. ALWAYS pick the BEST instrument from the open markets list and return BUY or SELL with your TRUE confidence
2. Confidence scale: 35-50% = valid trade (small size), 50-70% = good trade, 70%+ = strong trade
3. Even 1 timeframe alignment is enough to act — don't wait for perfect confluence
4. Use the current session to bias direction: ${sessionMain} — trend following in London/NY, range in Asian
5. DO NOT open a position in an instrument marked as ⚠️ CORRELATED with an open position
6. ONLY trade instruments listed in CURRENTLY OPEN MARKETS above
7. MANDATORY RISK:REWARD RULE — takeProfit MUST be at least 2× the distance of stopLoss from entry:
   - BUY example: entry=1.1000, stopLoss=1.0950 (50 pips risk) → takeProfit MUST be ≥1.1100 (100 pips reward)
   - SELL example: entry=1.1000, stopLoss=1.1050 (50 pips risk) → takeProfit MUST be ≤1.0900 (100 pips reward)
   - This is NON-NEGOTIABLE — never set takeProfit closer than 2× the stop loss distance
8. Missing a trade is also a cost — if you see ANY clear setup, TAKE IT. Report your TRUE confidence (not a minimum threshold number)

Respond in this EXACT JSON format (no markdown, no explanation outside JSON):
{
  "instrument": "EURUSD",
  "action": "BUY",
  "confidence": 52,
  "reasoning": "1H RSI oversold (32), price near key support, London session bullish bias. 4H trend up.",
  "entryPrice": 1.08450,
  "stopLoss": 1.08200,
  "takeProfit": 1.08750,
  "size": 1
}

Only use HOLD if ALL open markets are clearly choppy/ranging with no directional bias:
{
  "instrument": "NONE",
  "action": "HOLD",
  "confidence": 0,
  "reasoning": "All markets in tight consolidation — no clear direction on any timeframe"
}`;

  // Run Ensemble Analysis (3 AI models vote)
  const ensemble = await runEnsembleAnalysis(prompt);
  const sizeMultiplier = getEnsembleSizeMultiplier(ensemble);

  // If ensemble says split → HOLD
  if (sizeMultiplier === 0 || ensemble.finalAction === "HOLD") {
    return {
      instrument: "NONE",
      action: "HOLD",
      confidence: ensemble.finalConfidence,
      reasoning: `Ensemble split — no consensus: ${ensemble.combinedReasoning}`,
    };
  }

  // Use the winning vote's entry/SL/TP details
  const winningVote = ensemble.votes.find((v) => v.action === ensemble.finalAction);
  const parsedDetails = winningVote ? JSON.parse(
    // Re-parse the winning model's response to get price levels
    // Fallback: use ensemble action with no specific levels
    "{}"
  ) : {};

  // We need to re-parse the winning model's full response — use the first vote's reasoning
  // The ensemble already has the action and confidence; we need to get price levels from the prompt
  // Run a quick single-model call to get the structured entry/SL/TP
  const detailResponse = await invokeLLM({
    messages: [
      { role: "system", content: "You are a professional forex and commodities trader. You respond only in valid JSON." },
      { role: "user", content: prompt + `\n\nThe ensemble of AI models has decided: ${ensemble.finalAction} with ${ensemble.finalConfidence}% confidence (${ensemble.agreement} agreement). Now provide the specific entry, stop loss, and take profit levels.` },
    ],
    response_format: { type: "json_object" } as any,
  });

  const detailContent = detailResponse.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof detailContent === "string" ? detailContent : JSON.stringify(detailContent));

  // Use ATR-based stop loss if candle data is available
  const instrument = parsed.instrument ?? ensemble.votes[0]?.action !== "HOLD" ? (Object.keys(technical)[0] ?? "NONE") : "NONE";
  const instTechnical = technical[instrument];
  let stopLoss = parsed.stopLoss;
  let takeProfit = parsed.takeProfit;

  if (instTechnical && instTechnical.candles1h.length >= 14 && parsed.entryPrice) {
    const candles = instTechnical.candles1h.map((c: OHLCVCandle) => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp }));
    const atrSL = calculateATRStopLoss(candles, parsed.entryPrice, ensemble.finalAction as "BUY" | "SELL");
    // Use ATR-based SL/TP if AI didn't provide valid levels
    if (!stopLoss || !takeProfit) {
      stopLoss = atrSL.stopLoss;
      takeProfit = atrSL.takeProfit;
    }
  }

  const baseSize = parsed.size ?? 1;
  const adjustedSize = Math.max(0.1, baseSize * sizeMultiplier);

  return {
    instrument: parsed.instrument ?? "NONE",
    action: ensemble.finalAction,
    confidence: ensemble.finalConfidence,
    reasoning: `[${ensemble.agreement.toUpperCase()} ENSEMBLE] ${ensemble.combinedReasoning}`,
    entryPrice: parsed.entryPrice,
    stopLoss,
    takeProfit,
    size: adjustedSize,
  };
}

/**
 * Analyze a SINGLE specific instrument for a trade opportunity.
 * Used by the opportunity scanner when the main analysis returns HOLD.
 */
/**
 * NEW STRATEGY: Trend Following with Multi-Timeframe Confirmation
 * ─────────────────────────────────────────────────────────────
 * Rules (ALL 3 must pass to generate a signal):
 *
 * RULE 1 — Daily Trend Filter (EMA 50 vs EMA 200 on 4H candles)
 *   - EMA50 > EMA200 on 4H → only BUY signals allowed
 *   - EMA50 < EMA200 on 4H → only SELL signals allowed
 *   - Neutral (insufficient data) → allow both directions
 *
 * RULE 2 — 1H Entry Confirmation (MACD crossover + RSI not extreme)
 *   - BUY: MACD histogram > 0 (bullish cross) AND RSI 40–70 (not overbought)
 *   - SELL: MACD histogram < 0 (bearish cross) AND RSI 30–60 (not oversold)
 *
 * RULE 3 — 5min Trigger (candlestick pattern or momentum confirmation)
 *   - BUY: bullish pattern (Hammer, Bullish Engulfing, Morning Star, Marubozu) OR RSI < 45
 *   - SELL: bearish pattern (Shooting Star, Bearish Engulfing, Evening Star) OR RSI > 55
 *
 * AI ROLE: Confirmation only (not primary signal generator)
 *   - AI reviews the 3 rules and provides final confidence score
 *   - AI can veto a signal if macro context is clearly unfavorable
 *   - AI suggests precise entry/SL/TP based on current price
 */
async function analyzeInstrument(
  instrument: string,
  marketContext: Record<string, unknown>,
  risk: { minConfidenceThreshold: number; maxRiskPerTrade: number },
  openInstruments: string[],
  dynamicThreshold?: number,
  accountBalance?: number
): Promise<TradeDecision> {
  const effectiveThreshold = dynamicThreshold ?? risk.minConfidenceThreshold;
  const prices = (marketContext.prices as any[]) ?? [];
  const technical = marketContext.technical as Record<string, MultiTimeframeData>;
  const clientSentiment = (marketContext.clientSentiment as string) ?? "";

  const instTechnical = technical[instrument];

  // Check correlation filter — skip if correlated with open position
  const corrCheck = isCorrelatedWithOpenPositions(instrument, openInstruments);
  if (corrCheck.correlated) {
    return {
      instrument,
      action: "HOLD",
      confidence: 0,
      reasoning: `Correlated with open position: ${corrCheck.conflictsWith}`,
    };
  }

  // ─── RULE 1: Daily Trend Filter (EMA50 vs EMA200 on 4H candles) ────────────────────
  let trendDirection: "up" | "down" | "neutral" = "neutral";
  let trendDescription = "No 4H data";

  if (instTechnical && instTechnical.candles4h.length >= 20) {
    const candles4h = instTechnical.candles4h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const emaTrend = getEMATrend(candles4h);
    trendDirection = emaTrend.trend;
    trendDescription = emaTrend.description;

    // EMA Gap Filter: require minimum 0.15% separation between EMA50 and EMA200
    // Flat markets (EMA gap < 0.15%) produce false signals — skip them
    if (emaTrend.ema50 > 0 && emaTrend.ema200 > 0) {
      const emaGapPct = Math.abs(emaTrend.ema50 - emaTrend.ema200) / emaTrend.ema200 * 100;
      if (emaGapPct < 0.15) {
        return {
          instrument,
          action: "HOLD",
          confidence: 0,
          reasoning: `EMA gap too small (${emaGapPct.toFixed(3)}% < 0.15%) — market is ranging/flat, no clear trend`,
        };
      }
    }
  }

  // ─── RULE 2: 1H Entry Confirmation (MACD + RSI) ────────────────────────────────
  let macd1hBullish = false;
  let macd1hBearish = false;
  let rsi1h = 50;
  let macdDescription = "No 1H data";

  if (instTechnical && instTechnical.candles1h.length >= 35) {
    const candles1h = instTechnical.candles1h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const macd1h = calculateMACD(candles1h);
    const rsi1hResult = calculateRSI(candles1h);
    rsi1h = rsi1hResult.value;

    // Rule 2 relaxed: MACD histogram > -0.0005 (not strictly > 0) to catch early momentum shifts
    // RSI ranges widened slightly to catch more valid setups
    macd1hBullish = macd1h.histogram > -0.0005 && macd1h.trend !== "bearish" && rsi1h >= 35 && rsi1h <= 72;
    macd1hBearish = macd1h.histogram < 0.0005 && macd1h.trend !== "bullish" && rsi1h >= 28 && rsi1h <= 65;
    macdDescription = `MACD hist=${macd1h.histogram.toFixed(5)} (${macd1h.trend}), RSI=${rsi1h.toFixed(1)}`;
  }

  // ─── RULE 3: 5min Trigger (candlestick pattern or momentum) ──────────────────────
  let trigger5mBullish = false;
  let trigger5mBearish = false;
  let triggerDescription = "No 5m data";

  if (instTechnical && instTechnical.candles5m.length >= 10) {
    const candles5m = instTechnical.candles5m.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const { buildTechnicalSummary: bts } = await import("./technicalAnalysis");
    const summary5m = bts(candles5m);
    const rsi5m = summary5m.rsi.value;
    const bullishPatterns = summary5m.patterns.filter((p) => p.type === "bullish" && p.strength !== "weak");
    const bearishPatterns = summary5m.patterns.filter((p) => p.type === "bearish" && p.strength !== "weak");

    // Rule 3 enhanced: include Doji + Hammer as valid triggers, wider RSI bands
    const allBullishPatterns = summary5m.patterns.filter((p) =>
      p.type === "bullish" || p.name.toLowerCase().includes("hammer") || p.name.toLowerCase().includes("doji")
    );
    const allBearishPatterns = summary5m.patterns.filter((p) =>
      p.type === "bearish" || p.name.toLowerCase().includes("shooting") || p.name.toLowerCase().includes("doji")
    );
    trigger5mBullish = allBullishPatterns.length > 0 || rsi5m < 48;
    trigger5mBearish = allBearishPatterns.length > 0 || rsi5m > 52;
    const patternNames = summary5m.patterns.map((p) => p.name).join(", ") || "none";
    triggerDescription = `RSI5m=${rsi5m.toFixed(1)}, patterns=[${patternNames}]`;
  }

  // ─── Evaluate all 3 rules ──────────────────────────────────────────────────────────────
  const buySignal = (trendDirection === "up" || trendDirection === "neutral") && macd1hBullish && trigger5mBullish;
  const sellSignal = (trendDirection === "down" || trendDirection === "neutral") && macd1hBearish && trigger5mBearish;

  // No signal — skip AI call entirely (saves credits + time)
  if (!buySignal && !sellSignal) {
    const rulesStatus = [
      `Trend: ${trendDirection} (${trendDescription})`,
      `1H MACD: bull=${macd1hBullish} bear=${macd1hBearish} (${macdDescription})`,
      `5m Trigger: bull=${trigger5mBullish} bear=${trigger5mBearish} (${triggerDescription})`,
    ].join(" | ");
    return {
      instrument,
      action: "HOLD",
      confidence: 0,
      reasoning: `MTF rules not met — ${rulesStatus}`,
    };
  }

  const proposedDirection = buySignal ? "BUY" : "SELL";
  const rulesPassedSummary = [
    `✅ Trend: ${trendDirection} (${trendDescription})`,
    `✅ 1H: ${macdDescription}`,
    `✅ 5m: ${triggerDescription}`,
  ].join(" | ");

  console.log(`[AutoTrade] MTF signal: ${instrument} ${proposedDirection} — ${rulesPassedSummary}`);

  // Get current price for SL/TP calculation
  const priceData = prices.find((p: any) => p.epic === instrument || p.epic === (INSTRUMENT_EPICS[instrument] ?? instrument));
  const livePrice = priceData ? (proposedDirection === "BUY" ? priceData.ask : priceData.bid) : 0;
  const priceLine = priceData
    ? `${instrument}: bid=${priceData.bid}, ask=${priceData.ask}, change=${priceData.pctChange?.toFixed(2)}%`
    : `${instrument}: price unavailable`;

  // Determine trading session for context
  const utcHour = new Date().getUTCHours();
  const session = utcHour >= 7 && utcHour < 16 ? "London Session" :
    utcHour >= 13 && utcHour < 22 ? "New York Session" :
    "Asian Session (lower liquidity)";

  const lessonsSection = await formatLessonsForPrompt(instrument).catch(() => "");

  // ─── AI CONFIRMATION ONLY ──────────────────────────────────────────────────────────────
  // The 3 MTF rules already confirmed a ${proposedDirection} signal.
  // AI now reviews the signal and provides: confidence score, entry/SL/TP, and can veto if macro is unfavorable.
  const confirmationPrompt = `You are HJ Capital's risk manager. Our technical system has generated a ${proposedDirection} signal for ${instrument}.

SIGNAL EVIDENCE:
${rulesPassedSummary}

LIVE PRICE: ${priceLine}
SESSION: ${session}
${clientSentiment ? `\nCLIENT SENTIMENT (Contrarian): ${clientSentiment}` : ""}
${lessonsSection ? `\nPAST LESSONS:\n${lessonsSection}` : ""}

YOUR JOB:
1. Confirm or veto the ${proposedDirection} signal based on macro context
2. If confirming: provide confidence (65-95%), precise entry, stop loss, and take profit. ONLY confirm if you have genuine conviction — trades below 65% confidence WILL be rejected, so do not inflate.
3. If vetoing: return HOLD with reason (e.g. "major news event in 30 min", "price at key resistance")

CRITICAL RULES FOR SL/TP (violations cause order rejection):
- Current live price is: ${livePrice}
- For ${proposedDirection === "BUY" ? "BUY" : "SELL"} orders:
  ${proposedDirection === "BUY" ? `  stopLoss MUST be LESS THAN ${livePrice} (e.g. ${(livePrice * 0.99).toFixed(5)})\n  takeProfit MUST be GREATER THAN ${livePrice} (e.g. ${(livePrice * 1.02).toFixed(5)})` : `  stopLoss MUST be GREATER THAN ${livePrice} (e.g. ${(livePrice * 1.01).toFixed(5)})\n  takeProfit MUST be LESS THAN ${livePrice} (e.g. ${(livePrice * 0.98).toFixed(5)})`}
- Stop loss distance = 1% to 2% from live price
- Take profit = 2x to 3x the stop loss distance (minimum 2:1 R:R)
- NEVER return stopLoss=0 or takeProfit=0 — always calculate real values
- Confidence < 65% = REJECTED (no trade). 65-75% = normal conviction trade, 75-85% = strong, 85%+ = very strong

Respond in JSON:
{
  "action": "${proposedDirection}" or "HOLD",
  "confidence": 65,
  "reasoning": "All 3 MTF rules confirmed. 4H uptrend strong. Entry at current ask, SL below recent swing low.",
  "entryPrice": ${livePrice || 0},
  "stopLoss": 0,
  "takeProfit": 0
}`;

  let aiResponse: { action: string; confidence: number; reasoning: string; entryPrice?: number; stopLoss?: number; takeProfit?: number };
  try {
    const response = await invokeLLM({
      model: "claude-sonnet-4-5",
      messages: [
        { role: "system", content: "You are a professional forex risk manager. Respond only in valid JSON." },
        { role: "user", content: confirmationPrompt },
      ],
      response_format: { type: "json_object" } as any,
    });
    const content = response.choices?.[0]?.message?.content ?? "{}";
    aiResponse = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {
    // AI failed — use ATR-based SL/TP with default confidence
    aiResponse = { action: proposedDirection, confidence: 60, reasoning: "AI confirmation unavailable — using ATR defaults" };
  }

  // AI vetoed the signal
  if (aiResponse.action === "HOLD") {
    return {
      instrument,
      action: "HOLD",
      confidence: 0,
      reasoning: `[MTF:${instrument}] AI vetoed ${proposedDirection} signal: ${aiResponse.reasoning}`,
    };
  }

  // Check confidence threshold
  const finalConfidence = aiResponse.confidence ?? 60;
  if (finalConfidence < effectiveThreshold) {
    return {
      instrument,
      action: "HOLD",
      confidence: finalConfidence,
      reasoning: `[MTF:${instrument}] Signal below threshold (${finalConfidence}% < ${effectiveThreshold}%): ${aiResponse.reasoning}`,
    };
  }

  // Calculate ATR-based SL/TP (override AI if needed)
  let stopLoss = aiResponse.stopLoss ?? 0;
  let takeProfit = aiResponse.takeProfit ?? 0;
  const entryPrice = aiResponse.entryPrice ?? livePrice;

  if (instTechnical && instTechnical.candles1h.length >= 14) {
    const candles1h = instTechnical.candles1h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const atrSL = calculateATRStopLoss(candles1h, entryPrice, proposedDirection);
    // Use ATR values if AI didn't provide valid ones
    if (!stopLoss || !takeProfit) {
      stopLoss = atrSL.stopLoss;
      takeProfit = atrSL.takeProfit;
    }
    // Safety check: ensure SL direction is correct
    if (proposedDirection === "BUY" && stopLoss >= entryPrice) stopLoss = atrSL.stopLoss;
    if (proposedDirection === "SELL" && stopLoss <= entryPrice) stopLoss = atrSL.stopLoss;
    if (proposedDirection === "BUY" && takeProfit <= entryPrice) takeProfit = atrSL.takeProfit;
    if (proposedDirection === "SELL" && takeProfit >= entryPrice) takeProfit = atrSL.takeProfit;
  }

  // ATR-based position sizing (1% risk per trade)
  let tradeSize = 1;
  if (instTechnical && instTechnical.candles1h.length >= 14) {
    const candles1h = instTechnical.candles1h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    // Use the per-cycle cached balance (passed from runCycle) for accurate ATR sizing.
    // Falls back to live fetch if called outside runCycle (e.g. direct API call).
    const effectiveBalance = accountBalance ?? await getCurrentBalance("live").catch(() => 200);
    const { size: calculatedSize, atr, riskAmount } = calculateATRPositionSize(candles1h, effectiveBalance);
    tradeSize = calculatedSize;
    console.log(`[AutoTrade] ATR SIZE: ${instrument} — ATR=${atr}, risk=$${riskAmount}, size=${calculatedSize}`);
  }

  return {
    instrument,
    action: proposedDirection,
    confidence: finalConfidence,
    reasoning: `[MTF:${instrument}] ${rulesPassedSummary} | AI: ${aiResponse.reasoning}`,
    entryPrice,
    stopLoss,
    takeProfit,
    size: tradeSize,
  };
}

async function analyzeForClose(
  position: { dealId: string; epic: string; direction: string; profitLoss: number; openLevel: number; currentLevel: number },
  marketContext: Record<string, unknown>
): Promise<TradeDecision> {
  const prices = (marketContext.prices as any[]) ?? [];
  const posPrice = prices.find((p: any) => p.epic === position.epic);

  // Safely resolve open level — Capital.com sometimes returns null/undefined
  const safeOpenLevel = (position.openLevel && !isNaN(position.openLevel))
    ? position.openLevel
    : position.currentLevel; // fallback to current price if open level missing

  // Compute current price for close notification
  const currentLevel = posPrice
    ? (posPrice.bid + posPrice.ask) / 2
    : (position.currentLevel && !isNaN(position.currentLevel) ? position.currentLevel : safeOpenLevel);

  // NOTE: Invalid openLevel auto-close removed (Round 27).
  // getOpenPositions() in capitalcom.ts now normalizes openLevel to currentLevel as fallback,
  // so by the time we reach here, openLevel is always a valid number.
  // Auto-closing positions due to missing data caused unnecessary losses.
  if (!position.openLevel || isNaN(position.openLevel)) {
    // Log a warning but DO NOT close — just use safeOpenLevel for analysis
    console.warn(`[AutoTrade] Position ${position.dealId} has invalid openLevel (${position.openLevel}) — using currentLevel as fallback for analysis`);
  }

  // Get technical analysis for the position's instrument
  const technical = marketContext.technical as Record<string, MultiTimeframeData>;
  const instTechnical = technical[position.epic];
  const technicalContext = instTechnical
    ? `\n${instTechnical.technicalSummary1h}\n${instTechnical.technicalSummary4h}`
    : "";

  const prompt = `You are HJ Capital's risk manager. Analyze this open position and decide if it should be closed NOW.

OPEN POSITION:
- Instrument: ${position.epic}
- Direction: ${position.direction}
- Open Level: ${safeOpenLevel}
- Current P&L: $${position.profitLoss?.toFixed(2)}
- Current Price: ${posPrice ? `bid=${posPrice.bid}, ask=${posPrice.ask}` : "unavailable"}

TECHNICAL ANALYSIS:${technicalContext || " No data available"}

DECISION: Should we close this position now to lock in profit or cut losses?

Respond in JSON:
{
  "action": "CLOSE" or "HOLD",
  "confidence": 85,
  "reasoning": "Brief reason",
  "closeDealId": "${position.dealId}"
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a risk manager. Respond only in valid JSON." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as any,
  });

  const content = response.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

  return {
    instrument: position.epic,
    action: parsed.action ?? "HOLD",
    confidence: parsed.confidence ?? 0,
    reasoning: parsed.reasoning ?? "",
    closeDealId: position.dealId,
    positionDirection: position.direction as "BUY" | "SELL",
    positionOpenLevel: safeOpenLevel,
    positionCurrentLevel: currentLevel,
  };
}

// ─── Trade Execution ──────────────────────────────────────────────────────────

async function executeDecision(
  decisionInput: TradeDecision,
  sessionId: number,
  mode: "paper" | "live"
): Promise<void> {
  let decision: TradeDecision = decisionInput;
  const risk = await getRiskSettings();

  // Confidence check
  if (decision.confidence < risk.minConfidenceThreshold) {
    await logDecision(sessionId, decision, "blocked_confidence",
      `Confidence ${decision.confidence}% below threshold ${risk.minConfidenceThreshold}%`);
    return;
  }

  // Risk check
  const riskCheck = await checkDailyRiskLimits(sessionId, mode);
  if (riskCheck.blocked) {
    await logDecision(sessionId, decision, "blocked_risk", riskCheck.reason);
    return;
  }

  try {
    if (decision.action === "CLOSE" && decision.closeDealId) {
      // Close existing position
      let pnl = 0;
      let confirmedCloseLevel: number | undefined;
      if (mode === "live") {
        // ███ MARKET HOURS GUARD FOR CLOSE ███
        // Capital.com rejects close orders during daily market breaks (e.g. SILVER 21:00-22:00 UTC)
        // Check if market is currently tradeable before attempting to close
        const closeEpic = INSTRUMENT_EPICS[decision.instrument] ?? decision.instrument;
        const marketOpen = await checkMarketTradeable(closeEpic).catch(() => isMarketOpen(decision.instrument));
        if (!marketOpen) {
          console.warn(`[AutoTrade] CLOSE SKIPPED: ${decision.instrument} market is closed/in break — will retry next cycle`);
          await logDecision(sessionId, {
            ...decision,
            action: "SKIP",
            reasoning: `Close skipped: ${decision.instrument} market is closed/in daily break — will retry next cycle`,
          }, "skipped", `Market closed during close attempt: ${decision.instrument}`);
          return;
        }
        // ─────────────────────────────────────────────────────────────────────────
        const result = await closePosition(decision.closeDealId);
        pnl = result.pnl ?? 0;
        confirmedCloseLevel = result.closeLevel;
      }

      // Update trade record — MUST filter by instrument to avoid updating ALL open trades
      const dbExec = await getDb();
      if (dbExec) {
        // ███ ROUND 52 — CLOSE-BY-DEALID DATA INTEGRITY FIX ███
        // Previously matched only by instrument + newest openedAt, which could update the
        // WRONG DB row when two trades exist on the same instrument. Now match by the exact
        // dealId that was closed on the broker, falling back to instrument only if needed.
        let openTradeToClose: typeof trades.$inferSelect | undefined;
        if (decision.closeDealId) {
          [openTradeToClose] = await dbExec
            .select()
            .from(trades)
            .where(and(
              eq(trades.status, "open"),
              eq(trades.mode, mode),
              eq(trades.dealId, decision.closeDealId)
            ))
            .limit(1);
        }
        // Fallback: legacy trades opened before dealId tracking (no dealId stored)
        if (!openTradeToClose) {
          [openTradeToClose] = await dbExec
            .select()
            .from(trades)
            .where(and(
              eq(trades.status, "open"),
              eq(trades.mode, mode),
              eq(trades.instrument, decision.instrument)
            ))
            .orderBy(desc(trades.openedAt))
            .limit(1);
        }

        if (openTradeToClose) {
          await dbExec.update(trades)
            .set({ status: "closed", closedAt: new Date(), pnl: pnl.toFixed(2) })
            .where(eq(trades.id, openTradeToClose.id));

          // Learning Memory: pass actual tradeId
          evaluateClosedTrade({
            tradeId: openTradeToClose.id,
            instrument: decision.instrument,
            direction: decision.positionDirection ?? "BUY",
            entryPrice: decision.positionOpenLevel ?? decision.entryPrice ?? 0,
            exitPrice: confirmedCloseLevel ?? decision.positionCurrentLevel ?? decision.entryPrice ?? 0,
            pnl,
            originalReasoning: decision.reasoning,
            marketConditionsAtEntry: `Mode: ${mode}, Confidence: ${decision.confidence}%`,
            mode,
          }).catch(() => {});
        }
      }

      await logDecision(sessionId, decision, "closed", `Closed position. P&L: $${pnl.toFixed(2)}`, undefined, pnl);
      await updateSessionStats(sessionId, pnl);

      await notifyOwner({
        title: `📊 Auto Trade: Position Closed`,
        content: `${decision.instrument} position closed. P&L: $${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}. Reason: ${decision.reasoning}`,
      }).catch(() => {});

      // Telegram notification — use broker-confirmed close level if available, else current market level
      await notifyTradeClosed({
        instrument: decision.instrument,
        direction: decision.positionDirection ?? "BUY",
        entryPrice: decision.positionOpenLevel ?? decision.entryPrice ?? 0,
        closePrice: confirmedCloseLevel ?? decision.positionCurrentLevel ?? decision.entryPrice ?? 0,
        pnl,
        reason: decision.reasoning,
        mode,
      }).catch(() => {});

      // Learning Memory is now called inside the DB update block above (with correct tradeId)

    } else if (decision.action === "BUY" || decision.action === "SELL") {
      // Calculate size based on risk
      const balance = await getCurrentBalance(mode);
      // ███ HARD SIZE CAP ███
      // Never risk more than 1% of balance in a single trade.
      // This prevents catastrophic losses like USDJPY -$57 (size=10 on $1,000 balance).
      // ATR sizing already targets 1% but the old max was 10 — now capped at 2 absolute.
      const rawDecisionSize = decision.size ?? 1;
      const size = Math.max(0.01, Math.min(2, rawDecisionSize));
      if (rawDecisionSize > 2) {
        console.warn(`[AutoTrade] HARD SIZE CAP: ${decision.instrument} size reduced from ${rawDecisionSize} to ${size} (max 2 units)`);
      }

      // ███ RISK:REWARD ENFORCEMENT GUARD ███
      // Ensure takeProfit is always at least 1.5× the stop loss distance (target 2×)
      if (decision.entryPrice && decision.stopLoss && decision.takeProfit) {
        const entry = decision.entryPrice;
        const sl = decision.stopLoss;
        const tp = decision.takeProfit;
        const slDistance = Math.abs(entry - sl);
        const tpDistance = Math.abs(entry - tp);
        const currentRR = slDistance > 0 ? tpDistance / slDistance : 0;

        if (currentRR < 1.5 && slDistance > 0) {
          // Recalculate TP to enforce 2:1 R:R
          const newTP = decision.action === "BUY"
            ? entry + (slDistance * 2)
            : entry - (slDistance * 2);
          console.log(`[AutoTrade] R:R GUARD: ${decision.instrument} R:R was ${currentRR.toFixed(2)} — recalculating TP from ${tp} to ${newTP.toFixed(5)} (2× SL distance)`);
          decision = { ...decision, takeProfit: parseFloat(newTP.toFixed(5)) } as TradeDecision;
        }
      }

      let tradeId: number | undefined;
      let actualEntry = decision.entryPrice ?? 0;
      let brokerDealId: string | undefined; // Capital.com deal ID from placeOrder confirmation
      // These will be set in live mode after the SL/TP calculation block
      let finalSL: number | undefined;
      let finalTP: number | undefined;

      if (mode === "live") {
        const epic = INSTRUMENT_EPICS[decision.instrument] ?? decision.instrument;
        // Secondary live market-status check via Capital.com API before placing order
        const tradeable = await checkMarketTradeable(epic).catch(() => isMarketOpen(decision.instrument));
        if (!tradeable) {
          await logDecision(sessionId, {
            ...decision,
            action: "SKIP",
            reasoning: `Live market check: ${decision.instrument} is not tradeable right now. ${decision.reasoning}`,
          }, "skipped", `Live market check: ${decision.instrument} not tradeable`);
          return;
        }

        // ███ ZERO-PRICE GUARD: Fetch live price BEFORE placing order ███
        // Prevents catastrophic losses from orders placed with entry=0
        let livePrice: number;
        try {
          const priceData = await getMarketPrice(epic);
          livePrice = decision.action === "BUY" ? priceData.ask : priceData.bid;
        } catch (priceErr) {
          await logDecision(sessionId, {
            ...decision,
            action: "SKIP",
            reasoning: `Price fetch failed for ${decision.instrument} before order — aborting to prevent zero-price trade. Error: ${String(priceErr)}`,
          }, "skipped", `Price fetch failed: ${String(priceErr)}`);
          console.warn(`[AutoTrade] ZERO-PRICE GUARD: Blocked ${decision.instrument} — could not fetch live price`);
          return;
        }

        // Sanity check: live price must be > 0
        if (!livePrice || livePrice <= 0 || isNaN(livePrice)) {
          await logDecision(sessionId, {
            ...decision,
            action: "SKIP",
            reasoning: `Zero/invalid price for ${decision.instrument} (got: ${livePrice}) — aborting trade to prevent loss`,
          }, "skipped", `Zero price guard: ${decision.instrument} price=${livePrice}`);
          console.warn(`[AutoTrade] ZERO-PRICE GUARD: Blocked ${decision.instrument} — price=${livePrice}`);
          return;
        }

        // Sanity check: AI entry estimate vs live price (max 20% deviation)
        // If AI estimated a price that's wildly off from current market, the analysis was based on stale data
        if (decision.entryPrice && decision.entryPrice > 0) {
          const deviation = Math.abs(livePrice - decision.entryPrice) / livePrice;
          if (deviation > 0.20) {
            await logDecision(sessionId, {
              ...decision,
              action: "SKIP",
              reasoning: `Price deviation too large: ${decision.instrument} AI estimated ${decision.entryPrice}, live=${livePrice.toFixed(5)} (${(deviation * 100).toFixed(1)}% diff > 20% max) — analysis based on stale data, skipping`,
            }, "skipped", `Price deviation ${(deviation * 100).toFixed(1)}% > 20% max`);
            console.warn(`[AutoTrade] PRICE DEVIATION GUARD: Blocked ${decision.instrument} — AI=${decision.entryPrice}, live=${livePrice} (${(deviation * 100).toFixed(1)}% diff)`);
            return;
          }
        }

        // Recalculate SL/TP based on LIVE price to prevent invalid levels
        // AI estimates may differ from actual market price — always anchor to live price
        // ─── SL/TP Calculation ───────────────────────────────────────────────────
        // Always anchor SL/TP to the LIVE price to prevent stale AI estimates.
        // If AI provided valid levels, scale them proportionally from live price.
        // If AI gave zero/invalid levels, fall back to ATR-based 1% risk.
        const DEFAULT_SL_PCT = 0.01; // 1% from live price
        const DEFAULT_TP_MULT = 2;   // 2:1 R:R

        // finalSL and finalTP are declared at outer scope above
        const aiEntry = decision.entryPrice && decision.entryPrice > 0 ? decision.entryPrice : livePrice;
        const aiSL = decision.stopLoss && decision.stopLoss > 0 ? decision.stopLoss : 0;
        const aiTP = decision.takeProfit && decision.takeProfit > 0 ? decision.takeProfit : 0;

        // Validate AI SL: must be on correct side of entry price
        const aiSLValid = aiSL > 0 &&
          (decision.action === "BUY" ? aiSL < aiEntry : aiSL > aiEntry);
        // Validate AI TP: must be on correct side of entry price
        const aiTPValid = aiTP > 0 &&
          (decision.action === "BUY" ? aiTP > aiEntry : aiTP < aiEntry);

        if (aiSLValid && aiTPValid && livePrice > 0) {
          // Scale AI levels proportionally from live price
          const slDistancePct = Math.abs(aiEntry - aiSL) / aiEntry;
          const tpDistancePct = Math.abs(aiEntry - aiTP) / aiEntry;
          finalSL = decision.action === "BUY"
            ? parseFloat((livePrice * (1 - slDistancePct)).toFixed(5))
            : parseFloat((livePrice * (1 + slDistancePct)).toFixed(5));
          finalTP = decision.action === "BUY"
            ? parseFloat((livePrice * (1 + tpDistancePct)).toFixed(5))
            : parseFloat((livePrice * (1 - tpDistancePct)).toFixed(5));
        } else {
          // Fallback: ATR-based 1% risk
          const slDist = livePrice * DEFAULT_SL_PCT;
          finalSL = decision.action === "BUY"
            ? parseFloat((livePrice - slDist).toFixed(5))
            : parseFloat((livePrice + slDist).toFixed(5));
          finalTP = decision.action === "BUY"
            ? parseFloat((livePrice + slDist * DEFAULT_TP_MULT).toFixed(5))
            : parseFloat((livePrice - slDist * DEFAULT_TP_MULT).toFixed(5));
          console.warn(`[AutoTrade] SL/TP FALLBACK: ${decision.instrument} AI gave invalid levels (SL=${aiSL}, TP=${aiTP}) — using 1% ATR fallback`);
        }

        // Enforce minimum 1:2 R:R on final levels
        const liveSLDist = Math.abs(livePrice - finalSL);
        const liveTPDist = Math.abs(livePrice - finalTP);
        if (liveSLDist > 0 && liveTPDist / liveSLDist < 1.5) {
          finalTP = decision.action === "BUY"
            ? parseFloat((livePrice + liveSLDist * 2).toFixed(5))
            : parseFloat((livePrice - liveSLDist * 2).toFixed(5));
        }

        // Final sanity check: TP must be positive
        if (finalTP <= 0) {
          const slDist = livePrice * DEFAULT_SL_PCT;
          finalTP = decision.action === "BUY"
            ? parseFloat((livePrice + slDist * DEFAULT_TP_MULT).toFixed(5))
            : parseFloat((livePrice - slDist * DEFAULT_TP_MULT).toFixed(5));
          console.warn(`[AutoTrade] TP SANITY FIX: ${decision.instrument} TP was ${finalTP <= 0 ? 'negative/zero' : 'ok'} — reset to ${finalTP}`);
        }

        console.log(`[AutoTrade] SL/TP final: ${decision.instrument} ${decision.action} entry=${livePrice} SL=${finalSL} TP=${finalTP} (R:R=${liveSLDist > 0 ? (liveTPDist/liveSLDist).toFixed(2) : 'N/A'})`);
        // ─────────────────────────────────────────────────────────────────────────

        // ███ SL DIRECTION GUARD ███
        // Capital.com rejects orders where SL is on the wrong side of the current price.
        // BUY: SL must be BELOW current price (stopLevel < livePrice)
        // SELL: SL must be ABOVE current price (stopLevel > livePrice)
        // Error: error.invalid.stoploss.maxvalue means SL is above price for a BUY order.
        if (finalSL && livePrice > 0) {
          const slIsInvalid = decision.action === "BUY"
            ? finalSL >= livePrice   // BUY SL must be below price
            : finalSL <= livePrice;  // SELL SL must be above price

          if (slIsInvalid) {
            // Recalculate SL as 1% below/above live price
            const fallbackSLDist = livePrice * 0.01;
            finalSL = decision.action === "BUY"
              ? parseFloat((livePrice - fallbackSLDist).toFixed(5))
              : parseFloat((livePrice + fallbackSLDist).toFixed(5));
            // Recalculate TP to maintain 2:1 R:R
            finalTP = decision.action === "BUY"
              ? parseFloat((livePrice + fallbackSLDist * 2).toFixed(5))
              : parseFloat((livePrice - fallbackSLDist * 2).toFixed(5));
            console.warn(`[AutoTrade] SL DIRECTION GUARD: ${decision.instrument} ${decision.action} — SL ${finalSL} was on wrong side of price ${livePrice}. Recalculated to SL=${finalSL} TP=${finalTP}`);
          }
        }

        // ███ SL/TP VALIDATION GUARD ███
        // Final sanity check before sending to broker:
        // 1. SL and TP must be positive non-zero absolute prices
        // 2. SL must be on the correct side of the live price
        // 3. TP must be on the correct side of the live price
        // 4. SL distance must be at least 0.01% of price (not a rounding artifact)
        const slValid = finalSL && finalSL > 0 && !isNaN(finalSL);
        const tpValid = finalTP && finalTP > 0 && !isNaN(finalTP);
        const slOnCorrectSide = slValid && (
          decision.action === "BUY" ? finalSL! < livePrice : finalSL! > livePrice
        );
        const tpOnCorrectSide = tpValid && (
          decision.action === "BUY" ? finalTP! > livePrice : finalTP! < livePrice
        );
        const slMinDist = slValid && livePrice > 0 ? Math.abs(livePrice - finalSL!) / livePrice : 0;
        const tpMinDist = tpValid && livePrice > 0 ? Math.abs(livePrice - finalTP!) / livePrice : 0;
        const slHasMinDist = slMinDist >= 0.0001; // at least 0.01% of price
        const tpHasMinDist = tpMinDist >= 0.0001;

        if (!slValid || !tpValid || !slOnCorrectSide || !tpOnCorrectSide || !slHasMinDist || !tpHasMinDist) {
          const reason = [
            !slValid ? `SL invalid (${finalSL})` : null,
            !tpValid ? `TP invalid (${finalTP})` : null,
            slValid && !slOnCorrectSide ? `SL on wrong side (SL=${finalSL} price=${livePrice} ${decision.action})` : null,
            tpValid && !tpOnCorrectSide ? `TP on wrong side (TP=${finalTP} price=${livePrice} ${decision.action})` : null,
            slValid && slOnCorrectSide && !slHasMinDist ? `SL too close (${(slMinDist * 100).toFixed(4)}% < 0.01%)` : null,
            tpValid && tpOnCorrectSide && !tpHasMinDist ? `TP too close (${(tpMinDist * 100).toFixed(4)}% < 0.01%)` : null,
          ].filter(Boolean).join("; ");
          console.error(`[AutoTrade] SL/TP VALIDATION GUARD BLOCKED: ${decision.instrument} ${decision.action} — ${reason}`);
          await notifyOwner({
            title: `🚫 Trade Blocked: ${decision.instrument} ${decision.action}`,
            content: `SL/TP validation failed — trade not sent to broker.\nReason: ${reason}\nEntry: ${livePrice} | SL: ${finalSL} | TP: ${finalTP}`,
          }).catch(() => {});
          throw new Error(`SL/TP validation guard blocked trade: ${reason}`);
        }
        // ─────────────────────────────────────────────────────────────────────────

        // Enforce minimum deal size from Capital.com API
        const minSize = await getMinDealSize(epic).catch(() => 1);
        const adjustedSize = Math.max(size, minSize);
        if (adjustedSize !== size) {
          console.log(`[AutoTrade] Size adjusted from ${size} to ${adjustedSize} (min deal size for ${epic}: ${minSize})`);
        }
        const result = await placeOrder({
          epic,
          direction: decision.action as "BUY" | "SELL",
          size: adjustedSize,
          stopLoss: finalSL,
          takeProfit: finalTP,
        });
        actualEntry = result.level;
        brokerDealId = result.dealId;

        // Final zero-price check on broker-confirmed entry
        if (!actualEntry || actualEntry <= 0 || isNaN(actualEntry)) {
          console.warn(`[AutoTrade] ZERO-PRICE GUARD: Broker returned level=${actualEntry} for ${decision.instrument} — using live price ${livePrice}`);
          actualEntry = livePrice; // Use the pre-fetched live price as fallback
        }
      } else {
        // Paper trade — get current price
        try {
          const epic = INSTRUMENT_EPICS[decision.instrument] ?? decision.instrument;
          const price = await getMarketPrice(epic);
          actualEntry = decision.action === "BUY" ? price.ask : price.bid;
        } catch { /* use estimated entry */ }

        // Paper trade zero-price guard
        if (!actualEntry || actualEntry <= 0 || isNaN(actualEntry)) {
          await logDecision(sessionId, {
            ...decision,
            action: "SKIP",
            reasoning: `Zero/invalid price for ${decision.instrument} in paper mode (got: ${actualEntry}) — skipping to prevent false P&L`,
          }, "skipped", `Zero price guard (paper): ${decision.instrument} price=${actualEntry}`);
          console.warn(`[AutoTrade] ZERO-PRICE GUARD (paper): Blocked ${decision.instrument} — price=${actualEntry}`);
          return;
        }
      }

      // Record trade in DB
      const dbExec2 = await getDb();
      if (!dbExec2) throw new Error("DB not available");
      // IMPORTANT: Save finalSL/finalTP (the actual levels sent to Capital.com),
      // NOT decision.stopLoss/takeProfit (which are the raw AI estimates, possibly invalid).
      // finalSL/finalTP are only defined in live mode; for paper mode use decision values.
      const dbSL = (mode === "live" && typeof finalSL !== "undefined" && finalSL > 0)
        ? finalSL
        : (decision.stopLoss && decision.stopLoss > 0 ? decision.stopLoss : null);
      const dbTP = (mode === "live" && typeof finalTP !== "undefined" && finalTP > 0)
        ? finalTP
        : (decision.takeProfit && decision.takeProfit > 0 ? decision.takeProfit : null);
      const [tradeResult] = await dbExec2.insert(trades).values({
        instrument: decision.instrument,
        direction: decision.action as "BUY" | "SELL",
        openPrice: actualEntry.toFixed(5),
        size: size.toFixed(4),
        status: "open",
        aiReasoning: decision.reasoning,
        aiConfidence: decision.confidence,
        mode,
        autoTradeSessionId: sessionId,
        // Store the ACTUAL SL/TP sent to the broker (not the raw AI estimate)
        stopLoss: dbSL ? dbSL.toFixed(5) : null,
        takeProfit: dbTP ? dbTP.toFixed(5) : null,
        // Store Capital.com deal ID for cross-referencing with broker
        dealId: brokerDealId ?? null,
      });

      tradeId = (tradeResult as any).insertId;

      await logDecision(sessionId, decision, "opened",
        `Opened ${decision.action} ${decision.instrument} @ ${actualEntry.toFixed(5)}, size=${size}`, tradeId);

      // Use finalSL/finalTP (actual broker levels) for owner notification
      const notifySL = (finalSL && finalSL > 0) ? finalSL : decision.stopLoss;
      const notifyTP = (finalTP && finalTP > 0) ? finalTP : decision.takeProfit;
      await notifyOwner({
        title: `🤖 Auto Trade: ${decision.action} ${decision.instrument}`,
        content: `Entry: ${actualEntry.toFixed(5)} | Stop: ${notifySL?.toFixed(5) ?? "N/A"} | Target: ${notifyTP?.toFixed(5) ?? "N/A"} | Confidence: ${decision.confidence}%\n\nReasoning: ${decision.reasoning}`,
      }).catch(() => {});

      // Telegram notification — use finalSL/finalTP (actual broker levels) if available
      const telegramSL = (finalSL && finalSL > 0) ? finalSL : (decision.stopLoss ?? actualEntry * 0.999);
      const telegramTP = (finalTP && finalTP > 0) ? finalTP : (decision.takeProfit ?? actualEntry * 1.002);
      await notifyTradeOpened({
        instrument: decision.instrument,
        direction: decision.action as "BUY" | "SELL",
        size,
        entryPrice: actualEntry,
        stopLoss: telegramSL,
        takeProfit: telegramTP,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        mode,
      }).catch(() => {});
    }

  } catch (err) {
    await logDecision(sessionId, decision, "error", String(err));
    console.error("[AutoTrade] Execution error:", err);
  }
}

// ─── Risk Guards ──────────────────────────────────────────────────────────────

async function checkDailyRiskLimits(sessionId: number, mode: "paper" | "live"): Promise<{ blocked: boolean; reason: string }> {
  const risk = await getRiskSettings();

  // Calculate today's P&L from CLOSED trades only, using closedAt timestamp
  // This prevents historical losses from blocking the engine on new days
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const db = await getDb();
  if (!db) return { blocked: false, reason: "" };
  const todayTrades = await db
    .select()
    .from(trades)
    .where(and(
      eq(trades.mode, mode),
      eq(trades.status, "closed"),
      gte(trades.closedAt!, todayStart)
    ));

  const realizedPnl = todayTrades.reduce((sum: number, t: typeof todayTrades[0]) => sum + parseFloat(t.pnl ?? "0"), 0);

  // ███ INCLUDE UNREALIZED P&L FROM OPEN POSITIONS ███
  // Without this, a large losing open position is invisible to the daily loss limit
  let unrealizedPnl = 0;
  try {
    if (mode === "live") {
      const openPositions = await getOpenPositions();
      unrealizedPnl = openPositions.reduce((sum, pos) => sum + (pos.profitLoss ?? 0), 0);
    }
  } catch {
    // If we can't fetch open positions, fall back to realized PnL only
    unrealizedPnl = 0;
  }

  const todayPnl = realizedPnl + unrealizedPnl;

  // Daily loss limit = X% of current capital
  const currentBalance = await getCurrentBalance(mode);
  const dailyLossLimitAbs = currentBalance * (risk.dailyLossLimitPct / 100);
  if (todayPnl <= -dailyLossLimitAbs) {
    return {
      blocked: true,
      reason: `Daily loss limit reached: $${Math.abs(todayPnl).toFixed(2)} / $${dailyLossLimitAbs.toFixed(2)} (${risk.dailyLossLimitPct}% of capital). Realized: $${realizedPnl.toFixed(2)}, Unrealized: $${unrealizedPnl.toFixed(2)}`
    };
  }

  // ── Trailing Drawdown Protection (Scientific Risk Management) ────────────────────────
  // Stops engine if balance drops more than X% from its all-time peak during the session.
  // This protects accumulated profits without capping upside (no profit lock).
  if (risk.trailingDrawdownPct > 0) {
    const db = await getDb();
    if (db) {
      // ███ SANITY CHECK ███
      // If currentBalance is less than 20% of peakBalance, the reading is almost certainly
      // wrong (API failure, stale DB value, network timeout). Skip the trailing drawdown check
      // entirely to avoid false positives that shut down the engine.
      const sanityRatio = risk.peakBalance > 0 ? currentBalance / risk.peakBalance : 1;
      if (sanityRatio < 0.20) {
        console.warn(`[AutoTrade] ⚠️ Trailing drawdown SKIPPED — balance $${currentBalance.toFixed(2)} is only ${(sanityRatio * 100).toFixed(1)}% of peak $${risk.peakBalance.toFixed(2)} — likely a bad read, not a real drawdown.`);
      } else {
        // Update peak balance if current balance exceeds previous peak
        if (currentBalance > risk.peakBalance) {
          await db.update(riskSettings).set({ peakBalance: currentBalance.toFixed(2) });
          risk.peakBalance = currentBalance;
          console.log(`[AutoTrade] 📈 New peak balance: $${currentBalance.toFixed(2)}`);
        }
        // Check if drawdown from peak exceeds allowed threshold
        const drawdownFromPeak = ((risk.peakBalance - currentBalance) / risk.peakBalance) * 100;
        if (drawdownFromPeak >= risk.trailingDrawdownPct) {
          return {
            blocked: true,
            reason: `Trailing drawdown protection: balance $${currentBalance.toFixed(2)} is ${drawdownFromPeak.toFixed(2)}% below peak $${risk.peakBalance.toFixed(2)} (max: ${risk.trailingDrawdownPct}%). Trading paused to protect profits.`
          };
        }
      }
    }
  }

  return { blocked: false, reason: "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRiskSettings() {
  const db = await getDb();
  // Default threshold raised to 65% (Round 52 — Trading Standards V1).
  // Weekly report showed Win Rate 31.3% at 55% over 150 trades (-$307).
  // At 65% (conviction filter), we expect far fewer but higher-quality trades.
  if (!db) return { dailyLossLimitPct: 1.5, stopLossPerTrade: 1, maxRiskPerTrade: 1, minConfidenceThreshold: 65, maxOpenPositions: 3, trailingDrawdownPct: 5, peakBalance: 1000 };
  const rows = await db.select().from(riskSettings).limit(1);
  const r = rows[0];
  return {
    dailyLossLimitPct: r ? parseFloat(r.dailyLossLimitPct) : 1.5,
    stopLossPerTrade: r ? parseFloat(r.stopLossPerTrade) : 1,
    maxRiskPerTrade: r ? parseFloat(r.maxRiskPerTrade) : 1,
    minConfidenceThreshold: r ? r.minConfidenceThreshold : 65,
    maxOpenPositions: r ? r.maxOpenPositions : 3,
    trailingDrawdownPct: r ? parseFloat(r.trailingDrawdownPct) : 5,
    peakBalance: r ? parseFloat(r.peakBalance) : 1000,
  };
}

async function getCurrentBalance(mode: "paper" | "live"): Promise<number> {
  // Always get the DB balance as a reliable fallback
  const db = await getDb();
  const port = db ? await db.select().from(portfolio).limit(1) : [];
  const dbBalance = port[0] ? parseFloat(port[0].balance) : 0;

  if (mode === "live") {
    // Try Capital.com API with retry (up to 3 attempts, 2s apart)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const bal = await getAccountBalance();
        if (bal.balance > 0) return bal.balance;
      } catch (err) {
        console.warn(`[AutoTrade] getAccountBalance attempt ${attempt}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    // All retries failed — use DB balance if it looks valid, otherwise refuse to block
    if (dbBalance > 100) {
      console.warn(`[AutoTrade] Capital.com balance unavailable — using DB balance $${dbBalance.toFixed(2)} as fallback`);
      return dbBalance;
    }
    // DB balance also looks wrong — return a safe high value to avoid false risk blocks
    console.warn(`[AutoTrade] Both Capital.com and DB balance unavailable — skipping risk check`);
    return 999999; // Will not trigger any risk limit
  }
  return dbBalance > 0 ? dbBalance : 250;
}

async function updateSessionStats(sessionId: number, pnl: number) {
  const db = await getDb();
  if (!db) return;
  const sessions = await db.select().from(autoTradeSession).where(eq(autoTradeSession.id, sessionId)).limit(1);
  const session = sessions[0];
  if (!session) return;

  const newPnl = parseFloat(session.sessionPnl) + pnl;
  const newTotal = session.totalTrades + 1;
  const newWins = session.winningTrades + (pnl > 0 ? 1 : 0);

  await db!.update(autoTradeSession).set({
    sessionPnl: newPnl.toFixed(2),
    totalTrades: newTotal,
    winningTrades: newWins,
  }).where(eq(autoTradeSession.id, sessionId));
}

async function logDecision(
  sessionId: number,
  decision: TradeDecision,
  actionTaken: "opened" | "closed" | "skipped" | "blocked_risk" | "blocked_confidence" | "error",
  actionDetail?: string,
  tradeId?: number,
  pnl?: number
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(autoTradeLog).values({
    sessionId,
    instrument: decision.instrument,
    decision: decision.action,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    marketPrice: decision.entryPrice?.toFixed(5),
    actionTaken,
    actionDetail: actionDetail ?? decision.reasoning,
    tradeId,
    pnlRealized: pnl !== undefined ? pnl.toFixed(2) : undefined,
  }).catch(console.error);
}

// ─── Public Query Helpers ─────────────────────────────────────────────────────

export async function getActiveSession() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(autoTradeSession)
    .where(eq(autoTradeSession.status, "active"))
    .orderBy(desc(autoTradeSession.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionLogs(sessionId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(autoTradeLog)
    .where(eq(autoTradeLog.sessionId, sessionId))
    .orderBy(desc(autoTradeLog.createdAt))
    .limit(limit);
}

export async function getRecentSessions(limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(autoTradeSession)
    .orderBy(desc(autoTradeSession.startedAt))
    .limit(limit);
}
