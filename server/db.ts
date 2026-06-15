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

export async function closeTrade(id: number, closePrice: string, pnl: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(trades).set({
    closePrice,
    pnl,
    status: "closed",
    closedAt: new Date(),
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
    dailyLossLimitPct: "25.00",
    stopLossPerTrade: "1.00",
    maxRiskPerTrade: "1.00",
    minConfidenceThreshold: 72,
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
}>) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(riskSettings).limit(1);
  if (existing.length === 0) {
    await db.insert(riskSettings).values({
      dailyLossLimitPct: settings.dailyLossLimitPct ?? "25.00",
      stopLossPerTrade: settings.stopLossPerTrade ?? "1.00",
      maxRiskPerTrade: settings.maxRiskPerTrade ?? "1.00",
      minConfidenceThreshold: settings.minConfidenceThreshold ?? 72,
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
export async function getRecentLessons(instrument?: string, limit = 5): Promise<TradeLesson[]> {
  const db = await getDb();
  if (!db) return [];
  if (instrument) {
    return db
      .select()
      .from(tradeLessons)
      .where(eq(tradeLessons.instrument, instrument))
      .orderBy(desc(tradeLessons.createdAt))
      .limit(limit);
  }
  return db
    .select()
    .from(tradeLessons)
    .orderBy(desc(tradeLessons.createdAt))
    .limit(limit * 2); // broader context when no instrument filter
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
