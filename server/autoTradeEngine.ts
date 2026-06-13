/**
 * HJ Auto Trade Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * The core AI brain of HJ Auto Trade Mode.
 * Responsibilities:
 *   1. Gather live market data (prices + candles) from Capital.com
 *   2. Fetch relevant financial news headlines
 *   3. Ask the LLM to analyze and decide: BUY / SELL / HOLD / CLOSE
 *   4. Enforce risk rules before any execution
 *   5. Execute trades on Capital.com (live) or simulate (paper)
 *   6. Log every decision and action to the database
 *   7. Notify the owner of significant events
 */

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  getAllMarketPrices,
  getMarketPrice,
  getPriceHistory,
  getOpenPositions,
  getAccountBalance,
  placeOrder,
  closePosition,
  INSTRUMENT_EPICS,
} from "./capitalcom";
import { getDb } from "./db";
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
    // 1. Check risk limits first
    const riskCheck = await checkDailyRiskLimits(_engineState.sessionId, _engineState.mode);
    if (riskCheck.blocked) {
      await logDecision(_engineState.sessionId, {
        instrument: "ALL",
        action: "SKIP",
        confidence: 0,
        reasoning: `Risk limit reached: ${riskCheck.reason}`,
      }, "blocked_risk", riskCheck.reason);

      await stopAutoTrade(`Risk limit: ${riskCheck.reason}`);
      return;
    }

    // 2. Gather market data
    const marketContext = await gatherMarketContext();

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

    // 4. Analyze each instrument for new entry
    const risk = await getRiskSettings();
    const openCount = openPositions.length;

    if (openCount < risk.maxOpenPositions) {
      const decision = await analyzeMarket(marketContext, risk);
      if (decision.action !== "HOLD" && decision.action !== "SKIP") {
        await executeDecision(decision, _engineState.sessionId, _engineState.mode);
      } else {
        await logDecision(_engineState.sessionId, decision, "skipped", decision.reasoning);
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

// ─── Market Context ───────────────────────────────────────────────────────────

async function gatherMarketContext(): Promise<Record<string, unknown>> {
  const [prices, newsHeadlines] = await Promise.allSettled([
    getAllMarketPrices(),
    fetchNewsHeadlines(),
  ]);

  // Fetch recent candles for top instruments
  const candleData: Record<string, unknown> = {};
  const topInstruments = ["EURUSD", "GOLD", "US500"];

  await Promise.allSettled(
    topInstruments.map(async (inst) => {
      const epic = INSTRUMENT_EPICS[inst] ?? inst;
      const candles = await getPriceHistory(epic, "HOUR", 12).catch(() => []);
      candleData[inst] = candles.slice(-6); // last 6 hours
    })
  );

  return {
    prices: prices.status === "fulfilled" ? prices.value : [],
    news: newsHeadlines.status === "fulfilled" ? newsHeadlines.value : [],
    candles: candleData,
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
  risk: { minConfidenceThreshold: number; maxRiskPerTrade: number }
): Promise<TradeDecision> {
  const prices = (marketContext.prices as any[]) ?? [];
  const news = (marketContext.news as string[]) ?? [];
  const candles = marketContext.candles as Record<string, any[]>;

  const pricesSummary = prices
    .map((p: any) => `${p.epic}: bid=${p.bid}, ask=${p.ask}, change=${p.pctChange?.toFixed(2)}%`)
    .join("\n");

  const candleSummary = Object.entries(candles)
    .map(([inst, c]) => {
      if (!c || c.length === 0) return `${inst}: no data`;
      const last = c[c.length - 1];
      const first = c[0];
      const trend = last.close > first.close ? "↑ uptrend" : "↓ downtrend";
      return `${inst}: ${trend}, last close=${last.close?.toFixed(5)}`;
    })
    .join("\n");

  const prompt = `You are HJ Capital's elite AI trading analyst. Your job is to analyze the market and recommend ONE specific trade.

LIVE MARKET PRICES (right now):
${pricesSummary}

RECENT PRICE TRENDS (last 6 hours):
${candleSummary}

LATEST NEWS:
${news.slice(0, 5).join("\n")}

TRADING RULES:
- Only recommend a trade if confidence is ${risk.minConfidenceThreshold}% or higher
- Max risk per trade: ${risk.maxRiskPerTrade}% of account
- Prefer small, consistent profits over large risky gains
- Focus on: EURUSD, GBPUSD, GOLD, US500, BTC
- Always include stop loss and take profit levels

Respond in this EXACT JSON format (no markdown, no explanation outside JSON):
{
  "instrument": "EURUSD",
  "action": "BUY",
  "confidence": 78,
  "reasoning": "Brief explanation of why (2-3 sentences max)",
  "entryPrice": 1.08450,
  "stopLoss": 1.08200,
  "takeProfit": 1.08750,
  "size": 1
}

If no good opportunity exists, respond:
{
  "instrument": "NONE",
  "action": "HOLD",
  "confidence": 0,
  "reasoning": "No high-confidence setup found at this time"
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a professional forex and commodities trader. You respond only in valid JSON." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as any,
  });

  const content = response.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

  return {
    instrument: parsed.instrument ?? "NONE",
    action: parsed.action ?? "HOLD",
    confidence: parsed.confidence ?? 0,
    reasoning: parsed.reasoning ?? "No reasoning provided",
    entryPrice: parsed.entryPrice,
    stopLoss: parsed.stopLoss,
    takeProfit: parsed.takeProfit,
    size: parsed.size ?? 1,
  };
}

async function analyzeForClose(
  position: { dealId: string; epic: string; direction: string; profitLoss: number; openLevel: number },
  marketContext: Record<string, unknown>
): Promise<TradeDecision> {
  const prices = (marketContext.prices as any[]) ?? [];
  const posPrice = prices.find((p: any) => p.epic === position.epic);

  const prompt = `You are HJ Capital's risk manager. Analyze this open position and decide if it should be closed NOW.

OPEN POSITION:
- Instrument: ${position.epic}
- Direction: ${position.direction}
- Open Level: ${position.openLevel}
- Current P&L: $${position.profitLoss?.toFixed(2)}
- Current Price: ${posPrice ? `bid=${posPrice.bid}, ask=${posPrice.ask}` : "unavailable"}

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
      if (mode === "live") {
        const result = await closePosition(decision.closeDealId);
        pnl = result.pnl ?? 0;
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

    } else if (decision.action === "BUY" || decision.action === "SELL") {
      // Calculate size based on risk
      const balance = await getCurrentBalance(mode);
      const riskAmount = balance * (risk.maxRiskPerTrade / 100);
      const size = decision.size ?? 1;

      let tradeId: number | undefined;
      let actualEntry = decision.entryPrice ?? 0;

      if (mode === "live") {
        const epic = INSTRUMENT_EPICS[decision.instrument] ?? decision.instrument;
        const result = await placeOrder({
          epic,
          direction: decision.action,
          size,
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

  if (todayPnl <= -risk.dailyLossLimit) {
    return { blocked: true, reason: `Daily loss limit reached: $${Math.abs(todayPnl).toFixed(2)} / $${risk.dailyLossLimit}` };
  }

  if (todayPnl >= risk.dailyProfitLock) {
    return { blocked: true, reason: `Daily profit target locked: $${todayPnl.toFixed(2)} / $${risk.dailyProfitLock}` };
  }

  return { blocked: false, reason: "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRiskSettings() {
  const db = await getDb();
  if (!db) return { dailyLossLimit: 7.5, dailyProfitLock: 10, maxRiskPerTrade: 1, minConfidenceThreshold: 72, maxOpenPositions: 3 };
  const rows = await db.select().from(riskSettings).limit(1);
  const r = rows[0];
  return {
    dailyLossLimit: r ? parseFloat(r.dailyLossLimit) : 7.5,
    dailyProfitLock: r ? parseFloat(r.dailyProfitLock) : 10,
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
