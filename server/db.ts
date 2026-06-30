import { eq, desc, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  portfolio, Portfolio,
  trades, Trade, InsertTrade,
  signals, Signal, InsertSignal,
  riskSettings, RiskSettings,
  chatMessages, ChatMessage, InsertChatMessage,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getPortfolio(): Promise<Portfolio | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(portfolio).limit(1);
  if (result.length > 0) return result[0];
  // Seed default row
  await db.insert(portfolio).values({ balance: "250.00", initialBalance: "250.00", mode: "paper" });
  const seeded = await db.select().from(portfolio).limit(1);
  return seeded[0];
}

export async function updatePortfolioBalance(newBalance: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(portfolio).limit(1);
  if (existing.length === 0) {
    await db.insert(portfolio).values({ balance: newBalance, initialBalance: "250.00", mode: "paper" });
  } else {
    await db.update(portfolio).set({ balance: newBalance });
  }
}

export async function updatePortfolioMode(mode: "paper" | "live") {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(portfolio).limit(1);
  if (existing.length === 0) {
    await db.insert(portfolio).values({ balance: "250.00", initialBalance: "250.00", mode });
  } else {
    await db.update(portfolio).set({ mode });
  }
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function getTrades(filters?: {
  instrument?: string;
  status?: "open" | "closed" | "cancelled";
  from?: Date;
  to?: Date;
}): Promise<Trade[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.instrument) conditions.push(eq(trades.instrument, filters.instrument));
  if (filters?.status) conditions.push(eq(trades.status, filters.status));
  if (filters?.from) conditions.push(gte(trades.openedAt, filters.from));
  if (filters?.to) conditions.push(lte(trades.openedAt, filters.to));
  const query = conditions.length > 0
    ? db.select().from(trades).where(and(...conditions)).orderBy(desc(trades.openedAt)).limit(100)
    : db.select().from(trades).orderBy(desc(trades.openedAt)).limit(100);
  return query;
}

export async function insertTrade(trade: InsertTrade): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(trades).values(trade);
}

export async function closeTrade(id: number, closePrice: string, pnl: string, closeReason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(trades).set({
    closePrice,
    pnl,
    status: "closed",
    closedAt: new Date(),
    ...(closeReason ? { closeReason } : {}),
  }).where(eq(trades.id, id));
}

export async function getDailyStats() {
  const db = await getDb();
  if (!db) return { totalPnl: 0, tradeCount: 0, wins: 0, losses: 0, bestTrade: 0, worstTrade: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTrades = await db.select().from(trades)
    .where(and(eq(trades.status, "closed"), gte(trades.openedAt, today)));
  let totalPnl = 0, wins = 0, losses = 0, bestTrade = 0, worstTrade = 0;
  for (const t of todayTrades) {
    const p = parseFloat(t.pnl ?? "0");
    totalPnl += p;
    if (p > 0) { wins++; if (p > bestTrade) bestTrade = p; }
    else if (p < 0) { losses++; if (p < worstTrade) worstTrade = p; }
  }
  return { totalPnl, tradeCount: todayTrades.length, wins, losses, bestTrade, worstTrade };
}

export async function getOverallStats() {
  const db = await getDb();
  if (!db) return { totalPnl: 0, tradeCount: 0, wins: 0, losses: 0, winRate: 0, bestTrade: 0, worstTrade: 0 };
  const closedTrades = await db.select().from(trades).where(eq(trades.status, "closed"));
  let totalPnl = 0, wins = 0, losses = 0, bestTrade = 0, worstTrade = 0;
  for (const t of closedTrades) {
    const p = parseFloat(t.pnl ?? "0");
    totalPnl += p;
    if (p > 0) { wins++; if (p > bestTrade) bestTrade = p; }
    else if (p < 0) { losses++; if (p < worstTrade) worstTrade = p; }
  }
  const tradeCount = closedTrades.length;
  const winRate = tradeCount > 0 ? Math.round((wins / tradeCount) * 100) : 0;
  return { totalPnl, tradeCount, wins, losses, winRate, bestTrade, worstTrade };
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export async function getLatestSignals(): Promise<Signal[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signals).orderBy(desc(signals.createdAt)).limit(20);
}

export async function insertSignal(signal: InsertSignal): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(signals).values(signal);
}

// ─── Risk Settings ────────────────────────────────────────────────────────────

export async function getRiskSettings(): Promise<RiskSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(riskSettings).limit(1);
  if (result.length > 0) return result[0];
  // Seed defaults
  await db.insert(riskSettings).values({
    // ███ ROUND 52 — TRADING STANDARDS V1 ███
    dailyLossLimitPct: "1.50",          // ~$30 on $2,000 — stop bleeding early
    stopLossPerTrade: "1.00",
    maxRiskPerTrade: "1.00",           // Fixed fractional: 1% risk (~$20) per trade
    minConfidenceThreshold: 65,        // Conviction filter: only high-confidence trades
    maxOpenPositions: 3,
  });
  const seeded = await db.select().from(riskSettings).limit(1);
  return seeded[0];
}

export async function updateRiskSettings(settings: Partial<{
  dailyLossLimitPct: string;
  stopLossPerTrade: string;
  maxRiskPerTrade: string;
  minConfidenceThreshold: number;
  maxOpenPositions: number;
  trailingDrawdownPct: string;
}>) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(riskSettings).limit(1);
  if (existing.length === 0) {
    await db.insert(riskSettings).values({
      dailyLossLimitPct: settings.dailyLossLimitPct ?? "1.50",
      stopLossPerTrade: settings.stopLossPerTrade ?? "1.00",
      maxRiskPerTrade: settings.maxRiskPerTrade ?? "1.00",
      minConfidenceThreshold: settings.minConfidenceThreshold ?? 65,
      maxOpenPositions: settings.maxOpenPositions ?? 3,
    });
  } else {
    await db.update(riskSettings).set(settings);
  }
}

// ─── Chat Messages ────────────────────────────────────────────────────────────

export async function getChatHistory(): Promise<ChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(50);
}

export async function insertChatMessage(msg: InsertChatMessage): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatMessages).values(msg);
}

// ─── Schedule Config ──────────────────────────────────────────────────────────

import { scheduleConfig, ScheduleConfig } from "../drizzle/schema";

export async function getScheduleConfig(): Promise<ScheduleConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduleConfig).limit(1);
  if (rows.length > 0) return rows[0];
  // Seed default row
  await db.insert(scheduleConfig).values({
    enabled: false,
    defaultMode: "paper",
    cycleIntervalMinutes: 15,
    startCron: "0 7 * * 1-5",
    stopCron: "0 20 * * 1-5",
  });
  const seeded = await db.select().from(scheduleConfig).limit(1);
  return seeded[0] ?? null;
}

export async function updateScheduleConfig(patch: Partial<{
  enabled: boolean;
  defaultMode: "paper" | "live";
  cycleIntervalMinutes: number;
  startTaskUid: string | null;
  stopTaskUid: string | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(scheduleConfig).limit(1);
  if (existing.length === 0) {
    await db.insert(scheduleConfig).values({
      enabled: patch.enabled ?? false,
      defaultMode: patch.defaultMode ?? "paper",
      cycleIntervalMinutes: patch.cycleIntervalMinutes ?? 15,
      startTaskUid: patch.startTaskUid ?? null,
      stopTaskUid: patch.stopTaskUid ?? null,
    });
  } else {
    await db.update(scheduleConfig).set(patch);
  }
}

// ─── Price Alerts ─────────────────────────────────────────────────────────────

import { priceAlerts, PriceAlert, InsertPriceAlert } from "../drizzle/schema";

export async function getPriceAlerts(activeOnly = false): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(priceAlerts).where(eq(priceAlerts.active, true)).orderBy(desc(priceAlerts.createdAt));
  }
  return db.select().from(priceAlerts).orderBy(desc(priceAlerts.createdAt));
}

export async function createPriceAlert(alert: Omit<InsertPriceAlert, "id" | "triggered" | "triggeredAt" | "active" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(priceAlerts).values({
    ...alert,
    triggered: false,
    active: true,
  });
  return (result as any).insertId as number;
}

export async function deletePriceAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
}

export async function triggerPriceAlert(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set({
    triggered: true,
    triggeredAt: new Date(),
    active: false,
  }).where(eq(priceAlerts.id, id));
}

// ─── Drawdown / Equity History ────────────────────────────────────────────────

export async function getEquityHistory(days = 30): Promise<Array<{ date: string; equity: number; pnl: number }>> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const closedTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.status, "closed"), gte(trades.closedAt!, since)))
    .orderBy(trades.closedAt);

  // Group by date and compute cumulative equity
  const byDate: Record<string, number> = {};
  for (const t of closedTrades) {
    if (!t.closedAt) continue;
    const dateStr = t.closedAt.toISOString().slice(0, 10);
    byDate[dateStr] = (byDate[dateStr] ?? 0) + parseFloat(t.pnl ?? "0");
  }

  // Build cumulative series
  const result: Array<{ date: string; equity: number; pnl: number }> = [];
  let cumulative = 0;
  for (const [date, pnl] of Object.entries(byDate).sort()) {
    cumulative += pnl;
    result.push({ date, equity: Math.round(cumulative * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
  }

  return result;
}

export async function getMaxDrawdown(): Promise<{ maxDrawdown: number; maxDrawdownPct: number; peakEquity: number }> {
  const history = await getEquityHistory(90);
  if (history.length === 0) return { maxDrawdown: 0, maxDrawdownPct: 0, peakEquity: 0 };

  let peak = 0;
  let maxDrawdown = 0;
  let peakEquity = 0;

  for (const { equity } of history) {
    if (equity > peak) {
      peak = equity;
      peakEquity = peak;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const maxDrawdownPct = peakEquity > 0 ? (maxDrawdown / peakEquity) * 100 : 0;

  return {
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    peakEquity: Math.round(peakEquity * 100) / 100,
  };
}

// ─── Daily Drawdown Series ──────────────────────────────────────────────────

export async function getDailyDrawdown(days = 30): Promise<Array<{ date: string; drawdownPct: number; drawdownAbs: number; dailyPnl: number }>> {
  const history = await getEquityHistory(days);
  if (history.length === 0) return [];

  let peak = 0;
  return history.map(({ date, equity, pnl }) => {
    if (equity > peak) peak = equity;
    const drawdownAbs = peak > 0 ? peak - equity : 0;
    const drawdownPct = peak > 0 ? (drawdownAbs / peak) * 100 : 0;
    return {
      date,
      drawdownPct: -Math.round(drawdownPct * 10) / 10, // negative for chart
      drawdownAbs: -Math.round(drawdownAbs * 100) / 100,
      dailyPnl: Math.round(pnl * 100) / 100,
    };
  });
}

// ─── Weekly Performance Summary ──────────────────────────────────────────────

export async function getWeeklyPerformanceSummary(): Promise<{
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  bestTrade: { instrument: string; pnl: number } | null;
  worstTrade: { instrument: string; pnl: number } | null;
  topInstrument: { instrument: string; totalPnl: number } | null;
  startBalance: number;
  endBalance: number;
}> {
  const db = await getDb();
  if (!db) return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, bestTrade: null, worstTrade: null, topInstrument: null, startBalance: 0, endBalance: 0 };

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const weekTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.status, "closed"), gte(trades.closedAt!, since)))
    .orderBy(desc(trades.closedAt));

  const wins = weekTrades.filter(t => parseFloat(t.pnl ?? "0") > 0);
  const losses = weekTrades.filter(t => parseFloat(t.pnl ?? "0") < 0);
  const totalPnl = weekTrades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);

  const sorted = [...weekTrades].sort((a, b) => parseFloat(b.pnl ?? "0") - parseFloat(a.pnl ?? "0"));
  const bestTrade = sorted[0] ? { instrument: sorted[0].instrument, pnl: parseFloat(sorted[0].pnl ?? "0") } : null;
  const worstTrade = sorted[sorted.length - 1] ? { instrument: sorted[sorted.length - 1].instrument, pnl: parseFloat(sorted[sorted.length - 1].pnl ?? "0") } : null;

  // Top instrument by total P&L
  const byInst: Record<string, number> = {};
  for (const t of weekTrades) byInst[t.instrument] = (byInst[t.instrument] ?? 0) + parseFloat(t.pnl ?? "0");
  const topEntry = Object.entries(byInst).sort((a, b) => b[1] - a[1])[0];
  const topInstrument = topEntry ? { instrument: topEntry[0], totalPnl: Math.round(topEntry[1] * 100) / 100 } : null;

  // Balance from portfolio
  const portRows = await db.select().from(portfolio).limit(1);
  const endBalance = portRows[0] ? parseFloat(portRows[0].balance) : 0;
  const startBalance = endBalance - totalPnl;

  return {
    totalTrades: weekTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: weekTrades.length > 0 ? Math.round((wins.length / weekTrades.length) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    bestTrade,
    worstTrade,
    topInstrument,
    startBalance: Math.round(startBalance * 100) / 100,
    endBalance: Math.round(endBalance * 100) / 100,
  };
}

// ─── Instrument Performance Heatmap ──────────────────────────────────────────

export async function getInstrumentPerformance(): Promise<Array<{
  instrument: string;
  totalPnl: number;
  tradeCount: number;
  winRate: number;
  avgPnl: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const closedTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.status, "closed"))
    .orderBy(desc(trades.closedAt));

  // Group by instrument
  const byInstrument: Record<string, { pnls: number[]; wins: number }> = {};
  for (const t of closedTrades) {
    const inst = t.instrument;
    if (!byInstrument[inst]) byInstrument[inst] = { pnls: [], wins: 0 };
    const pnl = parseFloat(t.pnl ?? "0");
    byInstrument[inst].pnls.push(pnl);
    if (pnl > 0) byInstrument[inst].wins++;
  }

  return Object.entries(byInstrument).map(([instrument, data]) => {
    const totalPnl = data.pnls.reduce((a, b) => a + b, 0);
    const tradeCount = data.pnls.length;
    const winRate = tradeCount > 0 ? (data.wins / tradeCount) * 100 : 0;
    const avgPnl = tradeCount > 0 ? totalPnl / tradeCount : 0;
    return {
      instrument,
      totalPnl: Math.round(totalPnl * 100) / 100,
      tradeCount,
      winRate: Math.round(winRate * 10) / 10,
      avgPnl: Math.round(avgPnl * 100) / 100,
    };
  });
}

// ─── Trade Lessons (Learning Memory System) ───────────────────────────────────

import {
  tradeLessons, InsertTradeLesson, TradeLesson,
  engineIntelligence, EngineIntelligence,
} from "../drizzle/schema";

export async function insertTradeLesson(lesson: Omit<InsertTradeLesson, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tradeLessons).values(lesson);
}

/**
 * Get the most recent lessons for a specific instrument (or all instruments).
 * Used to inject into AI prompt context.
 */
export async function getRecentLessons(instrument?: string, limit = 5, mode?: "paper" | "live"): Promise<TradeLesson[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (instrument) conditions.push(eq(tradeLessons.instrument, instrument));
  if (mode) conditions.push(eq(tradeLessons.mode, mode));

  const effectiveLimit = instrument ? limit : limit * 2;

  if (conditions.length > 0) {
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    return db
      .select()
      .from(tradeLessons)
      .where(whereClause)
      .orderBy(desc(tradeLessons.createdAt))
      .limit(effectiveLimit);
  }
  return db
    .select()
    .from(tradeLessons)
    .orderBy(desc(tradeLessons.createdAt))
    .limit(effectiveLimit);
}

/**
 * Get 7-day win rate from closed trades.
 */
export async function get7DayWinRate(): Promise<{ winRate: number; totalTrades: number; wins: number }> {
  const db = await getDb();
  if (!db) return { winRate: 0, totalTrades: 0, wins: 0 };

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const recentTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.status, "closed"), gte(trades.closedAt!, since)));

  const totalTrades = recentTrades.length;
  const wins = recentTrades.filter((t) => parseFloat(t.pnl ?? "0") > 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return { winRate: Math.round(winRate * 10) / 10, totalTrades, wins };
}

// ─── Engine Intelligence ──────────────────────────────────────────────────────

export async function getEngineIntelligence(): Promise<EngineIntelligence | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(engineIntelligence).limit(1);
  if (rows.length > 0) return rows[0];
  // Seed default row
  await db.insert(engineIntelligence).values({
    dynamicConfidenceThreshold: 72,
    winRate7d: "0.00",
    trades7d: 0,
    marketRegimes: {},
  });
  const seeded = await db.select().from(engineIntelligence).limit(1);
  return seeded[0] ?? null;
}

export async function updateEngineIntelligence(patch: Partial<{
  dynamicConfidenceThreshold: number;
  marketRegimes: Record<string, string>;
  winRate7d: string;
  trades7d: number;
  lastWinRateWarnDate: string | null;
  lastWeeklySummaryDate: string | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(engineIntelligence).limit(1);
  if (existing.length === 0) {
    await db.insert(engineIntelligence).values({
      dynamicConfidenceThreshold: patch.dynamicConfidenceThreshold ?? 72,
      winRate7d: patch.winRate7d ?? "0.00",
      trades7d: patch.trades7d ?? 0,
      marketRegimes: patch.marketRegimes ?? {},
    });
  } else {
    await db.update(engineIntelligence).set(patch);
  }
}

// ─── Strategy Comparison (Before / After Round 28) ───────────────────────────
// Round 28 was deployed on 2026-06-17 at ~21:57 UTC.
// We use 2026-06-18 00:00 UTC as a clean cutoff date.
const ROUND28_CUTOFF = new Date("2026-06-18T00:00:00.000Z");

export interface StrategyPeriodStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
}

export interface StrategyComparisonResult {
  before: StrategyPeriodStats;
  after: StrategyPeriodStats;
  cutoffDate: string;
}

export async function getStrategyComparison(): Promise<StrategyComparisonResult> {
  const db = await getDb();
  const empty: StrategyPeriodStats = { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgPnl: 0, bestTrade: 0, worstTrade: 0 };
  if (!db) return { before: empty, after: empty, cutoffDate: ROUND28_CUTOFF.toISOString() };

  const allClosed = await db
    .select()
    .from(trades)
    .where(eq(trades.status, "closed"));

  function calcStats(subset: typeof allClosed): StrategyPeriodStats {
    if (subset.length === 0) return { ...empty };
    let totalPnl = 0, wins = 0, losses = 0, bestTrade = 0, worstTrade = 0;
    for (const t of subset) {
      const p = parseFloat(t.pnl ?? "0");
      totalPnl += p;
      if (p > 0) { wins++; if (p > bestTrade) bestTrade = p; }
      else if (p < 0) { losses++; if (p < worstTrade) worstTrade = p; }
    }
    const totalTrades = subset.length;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100 * 10) / 10 : 0;
    const avgPnl = totalTrades > 0 ? Math.round((totalPnl / totalTrades) * 100) / 100 : 0;
    return { totalTrades, wins, losses, winRate, totalPnl: Math.round(totalPnl * 100) / 100, avgPnl, bestTrade: Math.round(bestTrade * 100) / 100, worstTrade: Math.round(worstTrade * 100) / 100 };
  }

  const beforeTrades = allClosed.filter(t => t.openedAt < ROUND28_CUTOFF);
  const afterTrades = allClosed.filter(t => t.openedAt >= ROUND28_CUTOFF);

  return {
    before: calcStats(beforeTrades),
    after: calcStats(afterTrades),
    cutoffDate: ROUND28_CUTOFF.toISOString(),
  };
}
