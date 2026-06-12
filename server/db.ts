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
    dailyLossLimit: "7.50",
    dailyProfitLock: "10.00",
    maxRiskPerTrade: "1.00",
    minConfidenceThreshold: 72,
    maxOpenPositions: 3,
  });
  const seeded = await db.select().from(riskSettings).limit(1);
  return seeded[0];
}

export async function updateRiskSettings(settings: Partial<{
  dailyLossLimit: string;
  dailyProfitLock: string;
  maxRiskPerTrade: string;
  minConfidenceThreshold: number;
  maxOpenPositions: number;
}>) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(riskSettings).limit(1);
  if (existing.length === 0) {
    await db.insert(riskSettings).values({
      dailyLossLimit: settings.dailyLossLimit ?? "7.50",
      dailyProfitLock: settings.dailyProfitLock ?? "10.00",
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
