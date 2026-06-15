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
} from "./capitalcom";
import type { OHLCVCandle } from "./capitalcom";
import {
  buildTechnicalSummary,
  formatTechnicalSummaryForPrompt,
  isCorrelatedWithOpenPositions,
} from "./technicalAnalysis";
import type { Candle } from "./technicalAnalysis";
import {
  getInstrumentSentiment,
  formatSentimentForPrompt,
} from "./sentimentAnalysis";
import { getDb, getPriceAlerts, triggerPriceAlert } from "./db";
import {
  evaluateClosedTrade,
  formatLessonsForPrompt,
  getDynamicConfidenceThreshold,
  detectMarketRegime,
  formatRegimeForPrompt,
  calculateATRStopLoss,
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

    // 0b. Dynamic Confidence Threshold — auto-adjust based on 7-day win rate
    const dynamicThreshold = await getDynamicConfidenceThreshold();
    if (dynamicThreshold.shouldStop) {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Auto-stop: ${dynamicThreshold.reason}`,
      }, "blocked_risk", dynamicThreshold.reason);
      await stopAutoTrade(`Win rate protection: ${dynamicThreshold.reason}`);
      return;
    }

    // 1. Check risk limits first
    const riskCheck = await checkDailyRiskLimits(_engineState.sessionId, _engineState.mode);
    if (riskCheck.blocked) {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Risk limit reached: ${riskCheck.reason}`,
      }, "blocked_risk", riskCheck.reason);

      // Telegram risk alert
      await notifyRiskAlert(`🛑 تم إيقاف الـ Engine تلقائياً\n${riskCheck.reason}`).catch(() => {});

      await stopAutoTrade(`Risk limit: ${riskCheck.reason}`);
      return;
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

    for (const pos of openPositions) {
      const closeDecision = await analyzeForClose(pos, marketContext);
      if (closeDecision.action === "CLOSE") {
        await executeDecision(closeDecision, _engineState.sessionId, _engineState.mode);
      }
    }

    // 4. Analyze ALL instruments in parallel and execute ALL valid trades
    const risk = await getRiskSettings();
    const openCount = openPositions.length;

    if (openCount < risk.maxOpenPositions) {
      // Get list of currently open instrument epics for correlation filter
      const openInstruments = openPositions.map((p) => p.epic);

      // How many more positions can we open?
      const remainingSlots = risk.maxOpenPositions - openCount;

      // Get all currently open markets
      const allInstruments = getOpenMarkets(["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"]);

      // Filter out instruments already in open positions
      const candidateInstruments = allInstruments.filter((inst) => !openInstruments.includes(inst));

      if (candidateInstruments.length === 0) {
        await logDecision(_engineState.sessionId, {
          instrument: "ALL",
          action: "SKIP",
          confidence: 0,
          reasoning: "All open-market instruments already have open positions",
        }, "skipped", "All instruments already in open positions");
      } else {
        // Log that we're scanning all instruments
        await logDecision(_engineState.sessionId, {
          instrument: "ALL",
          action: "HOLD",
          confidence: 0,
          reasoning: `🔍 فحص ${candidateInstruments.length} أداة بالتوازي: ${candidateInstruments.join(", ")} — بحثاً عن أفضل الفرص...`,
        }, "skipped", `Scanning ${candidateInstruments.length} instruments in parallel`);

        console.log(`[AutoTrade] Scanning ${candidateInstruments.length} instruments in parallel: ${candidateInstruments.join(", ")}`);

        // Analyze ALL candidate instruments in parallel
        const scanResults = await Promise.allSettled(
          candidateInstruments.map((inst) =>
            analyzeInstrument(inst, marketContext, risk, openInstruments, dynamicThreshold.threshold)
          )
        );

        // Collect all valid BUY/SELL opportunities
        const opportunities: TradeDecision[] = [];
        for (let i = 0; i < scanResults.length; i++) {
          const result = scanResults[i];
          const inst = candidateInstruments[i];
          if (result.status === "fulfilled") {
            const d = result.value;
            if (d.action !== "HOLD" && d.action !== "SKIP" && d.instrument !== "NONE") {
              console.log(`[AutoTrade] Opportunity found: ${inst} ${d.action} @ ${d.confidence}%`);
              opportunities.push(d);
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
        reasoning: `Max open positions (${risk.maxOpenPositions}) reached`,
      }, "skipped", "Max positions reached");
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
  const allTopInstruments = ["EURUSD", "GOLD", "US500", "GBPUSD"];
  const topInstruments = getOpenMarkets(allTopInstruments);

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

  await Promise.allSettled(
    topInstruments.map(async (inst) => {
      const epic = INSTRUMENT_EPICS[inst] ?? inst;

      // Fetch 3 timeframes in parallel
      const [c5m, c1h, c4h] = await Promise.all([
        getCandles(epic, "MINUTE_5", 50).catch(() => [] as OHLCVCandle[]),
        getCandles(epic, "HOUR", 50).catch(() => [] as OHLCVCandle[]),
        getCandles(epic, "HOUR_4", 30).catch(() => [] as OHLCVCandle[]),
      ]);

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
    })
  );

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

  // Build the full enhanced prompt
  const prompt = `You are HJ Capital's elite AI portfolio manager. Your PRIMARY GOAL is to find and execute profitable trades — not to avoid them. Markets always have opportunities; your job is to identify the BEST one right now.

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
${getOpenMarkets(["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"]).join(", ") || "No markets open right now"}

CURRENTLY OPEN POSITIONS (correlation filter — avoid correlated pairs):
${openInstruments.length > 0 ? openInstruments.join(", ") : "None"}

TRADING RULES:
- ONLY trade instruments listed in CURRENTLY OPEN MARKETS above — never trade closed markets
- DO NOT open a position in an instrument marked as ⚠️ CORRELATED with an open position
- Confidence threshold: ${effectiveThreshold}% (if you see a valid setup, report your TRUE confidence — do not artificially lower it)
- Max risk per trade: ${risk.maxRiskPerTrade}% of account
- IMPORTANT: Even partial confluence (2 out of 3 timeframes agreeing) is sufficient to recommend a trade
- Prefer small, consistent profits over large risky gains — ANY profit is better than no trade
- Always include stop loss and take profit levels
- Consider both technical signals AND news sentiment
- If you see a setup with ${effectiveThreshold}% or higher confidence, you MUST recommend it — missing a trade is also a cost

Respond in this EXACT JSON format (no markdown, no explanation outside JSON):
{
  "instrument": "EURUSD",
  "action": "BUY",
  "confidence": 78,
  "reasoning": "Brief explanation of why (2-3 sentences max, mention key indicators)",
  "entryPrice": 1.08450,
  "stopLoss": 1.08200,
  "takeProfit": 1.08750,
  "size": 1
}

Only use HOLD if there is genuinely NO setup meeting the threshold across ALL available instruments:
{
  "instrument": "NONE",
  "action": "HOLD",
  "confidence": 0,
  "reasoning": "Specific reason why no instrument has a valid setup right now"
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
async function analyzeInstrument(
  instrument: string,
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

  const instTechnical = technical[instrument];
  if (!instTechnical) {
    return { instrument, action: "HOLD", confidence: 0, reasoning: "No technical data available" };
  }

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

  const priceData = prices.find((p: any) => p.epic === instrument || p.epic === (INSTRUMENT_EPICS[instrument] ?? instrument));
  const priceLine = priceData
    ? `${instrument}: bid=${priceData.bid}, ask=${priceData.ask}, change=${priceData.pctChange?.toFixed(2)}%`
    : `${instrument}: price unavailable`;

  // Build technical section for this instrument only
  const technicalSection = [
    instTechnical.technicalSummary5m,
    instTechnical.technicalSummary1h,
    instTechnical.technicalSummary4h,
  ].join("\n");

  // Regime for this instrument
  let regimeSection = "";
  if (instTechnical.candles1h.length >= 20) {
    const candles = instTechnical.candles1h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const regime = detectMarketRegime(candles);
    regimeSection = formatRegimeForPrompt(instrument, regime);
  }

  const lessonsSection = await formatLessonsForPrompt(instrument).catch(() => "");
  const sentimentLine = sentiment[instrument] ?? "";

  const prompt = `You are HJ Capital's elite AI trading analyst. Focus ONLY on ${instrument}.

LIVE PRICE:
${priceLine}

MULTI-TIMEFRAME TECHNICAL ANALYSIS:
${technicalSection}

NEWS SENTIMENT:
${sentimentLine || "No sentiment data"}

MARKET REGIME:
${regimeSection || "No regime data"}
${clientSentiment ? `\nCAPITAL.COM CLIENT SENTIMENT (Contrarian):${clientSentiment}` : ""}

PAST LESSONS:
${lessonsSection || "No lessons yet"}

LATEST NEWS:
${news.slice(0, 3).join("\n")}

TRADING RULES:
- ONLY analyze ${instrument} — do not suggest other instruments
- Only recommend a trade if confidence is ${effectiveThreshold}% or higher
- Max risk per trade: ${risk.maxRiskPerTrade}% of account
- Use multi-timeframe confluence: prefer trades where 5min + 1H + 4H all agree
- Always include stop loss and take profit levels

Respond in this EXACT JSON format:
{
  "instrument": "${instrument}",
  "action": "BUY",
  "confidence": 78,
  "reasoning": "Brief explanation (2-3 sentences, mention key indicators)",
  "entryPrice": 1.08450,
  "stopLoss": 1.08200,
  "takeProfit": 1.08750,
  "size": 1
}

If no good opportunity exists:
{
  "instrument": "NONE",
  "action": "HOLD",
  "confidence": 0,
  "reasoning": "No high-confidence setup found at this time"
}`;

  const ensemble = await runEnsembleAnalysis(prompt);
  const sizeMultiplier = getEnsembleSizeMultiplier(ensemble);

  if (sizeMultiplier === 0 || ensemble.finalAction === "HOLD") {
    return {
      instrument: "NONE",
      action: "HOLD",
      confidence: ensemble.finalConfidence,
      reasoning: `[SCAN:${instrument}] No opportunity: ${ensemble.combinedReasoning}`,
    };
  }

  // Get specific entry/SL/TP
  const detailResponse = await invokeLLM({
    messages: [
      { role: "system", content: "You are a professional forex and commodities trader. You respond only in valid JSON." },
      { role: "user", content: prompt + `\n\nEnsemble decided: ${ensemble.finalAction} @ ${ensemble.finalConfidence}% (${ensemble.agreement}). Provide specific entry, stop loss, and take profit.` },
    ],
    response_format: { type: "json_object" } as any,
  });

  const detailContent = detailResponse.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof detailContent === "string" ? detailContent : JSON.stringify(detailContent));

  let stopLoss = parsed.stopLoss;
  let takeProfit = parsed.takeProfit;

  if (instTechnical.candles1h.length >= 14 && parsed.entryPrice) {
    const candles = instTechnical.candles1h.map((c: OHLCVCandle) => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, timestamp: c.timestamp
    }));
    const atrSL = calculateATRStopLoss(candles, parsed.entryPrice, ensemble.finalAction as "BUY" | "SELL");
    if (!stopLoss || !takeProfit) {
      stopLoss = atrSL.stopLoss;
      takeProfit = atrSL.takeProfit;
    }
  }

  const adjustedSize = Math.max(0.1, (parsed.size ?? 1) * sizeMultiplier);

  return {
    instrument,
    action: ensemble.finalAction,
    confidence: ensemble.finalConfidence,
    reasoning: `[SCAN:${instrument}] [${ensemble.agreement.toUpperCase()} ENSEMBLE] ${ensemble.combinedReasoning}`,
    entryPrice: parsed.entryPrice,
    stopLoss,
    takeProfit,
    size: adjustedSize,
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

  // If we don't have a valid open level, close immediately to avoid data-integrity issues
  if (!position.openLevel || isNaN(position.openLevel)) {
    console.warn(`[AutoTrade] Position ${position.dealId} has invalid openLevel (${position.openLevel}) — closing to prevent data corruption`);
    return {
      instrument: position.epic,
      action: "CLOSE",
      confidence: 100,
      reasoning: "Position has invalid open level data — closing to prevent P&L calculation errors.",
      closeDealId: position.dealId,
      positionDirection: position.direction as "BUY" | "SELL",
      positionOpenLevel: safeOpenLevel,
      positionCurrentLevel: currentLevel,
    };
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
  decision: TradeDecision,
  sessionId: number,
  mode: "paper" | "live"
): Promise<void> {
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
        const result = await closePosition(decision.closeDealId);
        pnl = result.pnl ?? 0;
        confirmedCloseLevel = result.closeLevel;
      }

      // Update trade record
      const dbExec = await getDb();
      if (dbExec) {
        await dbExec.update(trades)
          .set({ status: "closed", closedAt: new Date(), pnl: pnl.toFixed(2) })
          .where(and(
            eq(trades.status, "open"),
            eq(trades.mode, mode)
          ));
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

      // Learning Memory: AI evaluates the closed trade and stores a lesson
      evaluateClosedTrade({
        tradeId: 0, // we don't have the exact tradeId here; use 0 as placeholder
        instrument: decision.instrument,
        direction: decision.positionDirection ?? "BUY",
        entryPrice: decision.positionOpenLevel ?? decision.entryPrice ?? 0,
        exitPrice: confirmedCloseLevel ?? decision.positionCurrentLevel ?? decision.entryPrice ?? 0,
        pnl,
        originalReasoning: decision.reasoning,
        marketConditionsAtEntry: `Mode: ${mode}, Confidence: ${decision.confidence}%`,
      }).catch((err) => console.warn("[AutoTrade] Trade evaluation error:", err));

    } else if (decision.action === "BUY" || decision.action === "SELL") {
      // Calculate size based on risk
      const balance = await getCurrentBalance(mode);
      const size = decision.size ?? 1;

      let tradeId: number | undefined;
      let actualEntry = decision.entryPrice ?? 0;

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
        // Enforce minimum deal size from Capital.com API
        const minSize = await getMinDealSize(epic).catch(() => 1);
        const adjustedSize = Math.max(size, minSize);
        if (adjustedSize !== size) {
          console.log(`[AutoTrade] Size adjusted from ${size} to ${adjustedSize} (min deal size for ${epic}: ${minSize})`);
        }
        const result = await placeOrder({
          epic,
          direction: decision.action,
          size: adjustedSize,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
        });
        actualEntry = result.level;
      } else {
        // Paper trade — get current price
        try {
          const epic = INSTRUMENT_EPICS[decision.instrument] ?? decision.instrument;
          const price = await getMarketPrice(epic);
          actualEntry = decision.action === "BUY" ? price.ask : price.bid;
        } catch { /* use estimated entry */ }
      }

      // Record trade in DB
      const dbExec2 = await getDb();
      if (!dbExec2) throw new Error("DB not available");
      const [tradeResult] = await dbExec2.insert(trades).values({
        instrument: decision.instrument,
        direction: decision.action,
        openPrice: actualEntry.toFixed(5),
        size: size.toFixed(4),
        status: "open",
        aiReasoning: decision.reasoning,
        aiConfidence: decision.confidence,
        mode,
        autoTradeSessionId: sessionId,
      });

      tradeId = (tradeResult as any).insertId;

      await logDecision(sessionId, decision, "opened",
        `Opened ${decision.action} ${decision.instrument} @ ${actualEntry.toFixed(5)}, size=${size}`, tradeId);

      await notifyOwner({
        title: `🤖 Auto Trade: ${decision.action} ${decision.instrument}`,
        content: `Entry: ${actualEntry.toFixed(5)} | Stop: ${decision.stopLoss?.toFixed(5) ?? "N/A"} | Target: ${decision.takeProfit?.toFixed(5) ?? "N/A"} | Confidence: ${decision.confidence}%\n\nReasoning: ${decision.reasoning}`,
      }).catch(() => {});

      // Telegram notification
      await notifyTradeOpened({
        instrument: decision.instrument,
        direction: decision.action as "BUY" | "SELL",
        size,
        entryPrice: actualEntry,
        stopLoss: decision.stopLoss ?? actualEntry * 0.999,
        takeProfit: decision.takeProfit ?? actualEntry * 1.002,
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

  // Calculate today's P&L from trades
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const db = await getDb();
  if (!db) return { blocked: false, reason: "" };
  const todayTrades = await db
    .select()
    .from(trades)
    .where(and(
      eq(trades.mode, mode),
      gte(trades.openedAt, today)
    ));

  const todayPnl = todayTrades.reduce((sum: number, t: typeof todayTrades[0]) => sum + parseFloat(t.pnl ?? "0"), 0);

  // Daily loss limit = X% of current capital
  const currentBalance = await getCurrentBalance(mode);
  const dailyLossLimitAbs = currentBalance * (risk.dailyLossLimitPct / 100);
  if (todayPnl <= -dailyLossLimitAbs) {
    return { blocked: true, reason: `Daily loss limit reached: $${Math.abs(todayPnl).toFixed(2)} / $${dailyLossLimitAbs.toFixed(2)} (${risk.dailyLossLimitPct}% of capital)` };
  }

  return { blocked: false, reason: "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRiskSettings() {
  const db = await getDb();
  if (!db) return { dailyLossLimitPct: 25, stopLossPerTrade: 1, maxRiskPerTrade: 1, minConfidenceThreshold: 72, maxOpenPositions: 3 };
  const rows = await db.select().from(riskSettings).limit(1);
  const r = rows[0];
  return {
    dailyLossLimitPct: r ? parseFloat(r.dailyLossLimitPct) : 25,
    stopLossPerTrade: r ? parseFloat(r.stopLossPerTrade) : 1,
    maxRiskPerTrade: r ? parseFloat(r.maxRiskPerTrade) : 1,
    minConfidenceThreshold: r ? r.minConfidenceThreshold : 72,
    maxOpenPositions: r ? r.maxOpenPositions : 3,
  };
}

async function getCurrentBalance(mode: "paper" | "live"): Promise<number> {
  if (mode === "live") {
    try {
      const bal = await getAccountBalance();
      return bal.balance;
    } catch { return 250; }
  }
  const db = await getDb();
  if (!db) return 250;
  const port = await db.select().from(portfolio).limit(1);
  return port[0] ? parseFloat(port[0].balance) : 250;
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
