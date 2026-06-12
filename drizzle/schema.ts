import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Portfolio / Account state
export const portfolio = mysqlTable("portfolio", {
  id: int("id").autoincrement().primaryKey(),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull().default("250.00"),
  initialBalance: decimal("initialBalance", { precision: 12, scale: 2 }).notNull().default("250.00"),
  mode: mysqlEnum("mode", ["paper", "live"]).notNull().default("paper"),
  capitalApiKey: varchar("capitalApiKey", { length: 256 }),
  capitalEmail: varchar("capitalEmail", { length: 320 }),
  capitalPassword: varchar("capitalPassword", { length: 256 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Portfolio = typeof portfolio.$inferSelect;

// Trades
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  instrument: varchar("instrument", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["BUY", "SELL"]).notNull(),
  openPrice: decimal("openPrice", { precision: 12, scale: 5 }).notNull(),
  closePrice: decimal("closePrice", { precision: 12, scale: 5 }),
  size: decimal("size", { precision: 10, scale: 4 }).notNull(),
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", ["open", "closed", "cancelled"]).notNull().default("open"),
  aiReasoning: text("aiReasoning"),
  aiConfidence: int("aiConfidence"),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  mode: mysqlEnum("mode", ["paper", "live"]).notNull().default("paper"),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

// Trading signals
export const signals = mysqlTable("signals", {
  id: int("id").autoincrement().primaryKey(),
  instrument: varchar("instrument", { length: 32 }).notNull(),
  signal: mysqlEnum("signal", ["BUY", "SELL", "HOLD"]).notNull(),
  confidence: int("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  currentPrice: decimal("currentPrice", { precision: 12, scale: 5 }),
  targetPrice: decimal("targetPrice", { precision: 12, scale: 5 }),
  stopLoss: decimal("stopLoss", { precision: 12, scale: 5 }),
  indicators: json("indicators"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

// Risk settings
export const riskSettings = mysqlTable("risk_settings", {
  id: int("id").autoincrement().primaryKey(),
  dailyLossLimit: decimal("dailyLossLimit", { precision: 8, scale: 2 }).notNull().default("7.50"),
  dailyProfitLock: decimal("dailyProfitLock", { precision: 8, scale: 2 }).notNull().default("10.00"),
  maxRiskPerTrade: decimal("maxRiskPerTrade", { precision: 5, scale: 2 }).notNull().default("1.00"),
  minConfidenceThreshold: int("minConfidenceThreshold").notNull().default(72),
  maxOpenPositions: int("maxOpenPositions").notNull().default(3),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RiskSettings = typeof riskSettings.$inferSelect;

// AI Advisor chat messages
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
