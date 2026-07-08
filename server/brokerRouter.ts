/**
 * Broker Router — tRPC procedures for multi-broker management
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides endpoints for:
 * - Getting/setting active broker config
 * - Managing Binance credentials (encrypted)
 * - Testing broker connections
 * - Per-broker performance stats
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { brokerConfig, brokerCredentials, trades } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { getActiveBroker, setActiveBroker } from "./brokerAdapter";
import * as binance from "./binance";
import * as capitalcom from "./capitalcom";

export const brokerRouter = router({
  // ─── Get current broker config ───────────────────────────────────────────
  getConfig: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { activeBroker: getActiveBroker(), binanceConnected: false, capitalcomConnected: true };

    const configs = await db.select().from(brokerConfig).limit(1);
    const creds = await db.select().from(brokerCredentials);

    const binanceCred = creds.find((c) => c.broker === "binance");
    const capitalCred = creds.find((c) => c.broker === "capitalcom");

    return {
      activeBroker: configs[0]?.activeBroker ?? getActiveBroker(),
      binanceConnected: binanceCred?.lastTestResult === "success",
      binanceUseTestnet: binanceCred?.useTestnet ?? false,
      binanceHasCredentials: !!(binanceCred?.encryptedApiKey),
      capitalcomConnected: capitalCred?.lastTestResult === "success" || true, // Capital.com uses env vars
      capitalcomHasCredentials: true, // Always from env
    };
  }),

  // ─── Set active broker ───────────────────────────────────────────────────
  setActiveBroker: protectedProcedure
    .input(z.object({
      broker: z.enum(["capitalcom", "binance", "both"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Upsert broker config
      const existing = await db.select().from(brokerConfig).limit(1);
      if (existing.length > 0) {
        await db.update(brokerConfig)
          .set({ activeBroker: input.broker })
          .where(eq(brokerConfig.id, existing[0].id));
      } else {
        await db.insert(brokerConfig).values({ activeBroker: input.broker });
      }

      setActiveBroker(input.broker);
      return { success: true, activeBroker: input.broker };
    }),

  // ─── Save Binance credentials (encrypted) ────────────────────────────────
  saveBinanceCredentials: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1),
      apiSecret: z.string().min(1),
      useTestnet: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const encryptedApiKey = encrypt(input.apiKey);
      const encryptedApiSecret = encrypt(input.apiSecret);

      // Upsert Binance credentials
      const existing = await db.select().from(brokerCredentials)
        .where(eq(brokerCredentials.broker, "binance")).limit(1);

      if (existing.length > 0) {
        await db.update(brokerCredentials)
          .set({
            encryptedApiKey,
            encryptedApiSecret,
            useTestnet: input.useTestnet,
          })
          .where(eq(brokerCredentials.id, existing[0].id));
      } else {
        await db.insert(brokerCredentials).values({
          broker: "binance",
          encryptedApiKey,
          encryptedApiSecret,
          useTestnet: input.useTestnet,
        });
      }

      // Initialize Binance with new credentials
      binance.initBinanceCredentials({
        apiKey: input.apiKey,
        apiSecret: input.apiSecret,
        useTestnet: input.useTestnet,
      });

      return { success: true };
    }),

  // ─── Test Binance connection ─────────────────────────────────────────────
  testBinanceConnection: protectedProcedure.mutation(async () => {
    const db = await getDb();

    // Try to load credentials from DB if not already initialized
    if (db) {
      const creds = await db.select().from(brokerCredentials)
        .where(eq(brokerCredentials.broker, "binance")).limit(1);

      if (creds.length > 0 && creds[0].encryptedApiKey) {
        const apiKey = decrypt(creds[0].encryptedApiKey);
        const apiSecret = decrypt(creds[0].encryptedApiSecret ?? "");
        binance.initBinanceCredentials({
          apiKey,
          apiSecret,
          useTestnet: creds[0].useTestnet,
        });
      }
    }

    const result = await binance.testConnection();

    // Update test result in DB
    if (db) {
      const existing = await db.select().from(brokerCredentials)
        .where(eq(brokerCredentials.broker, "binance")).limit(1);
      if (existing.length > 0) {
        await db.update(brokerCredentials)
          .set({
            lastTestedAt: new Date(),
            lastTestResult: result.ok ? "success" : "failed",
          })
          .where(eq(brokerCredentials.id, existing[0].id));
      }
    }

    return result;
  }),

  // ─── Test Capital.com connection ─────────────────────────────────────────
  testCapitalcomConnection: protectedProcedure.mutation(async () => {
    const result = await capitalcom.testConnection();
    return result;
  }),

  // ─── Per-broker performance stats ────────────────────────────────────────
  getPerBrokerStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { capitalcom: null, binance: null };

    // Capital.com stats
    const capitalcomStats = await db.select({
      totalTrades: sql<number>`COUNT(*)`,
      winningTrades: sql<number>`SUM(CASE WHEN CAST(pnl AS DECIMAL) > 0 THEN 1 ELSE 0 END)`,
      totalPnl: sql<number>`COALESCE(SUM(CAST(pnl AS DECIMAL)), 0)`,
    })
      .from(trades)
      .where(and(
        eq(trades.status, "closed"),
        eq(trades.broker, "capitalcom"),
      ));

    // Binance stats
    const binanceStats = await db.select({
      totalTrades: sql<number>`COUNT(*)`,
      winningTrades: sql<number>`SUM(CASE WHEN CAST(pnl AS DECIMAL) > 0 THEN 1 ELSE 0 END)`,
      totalPnl: sql<number>`COALESCE(SUM(CAST(pnl AS DECIMAL)), 0)`,
    })
      .from(trades)
      .where(and(
        eq(trades.status, "closed"),
        eq(trades.broker, "binance"),
      ));

    const capStats = capitalcomStats[0];
    const binStats = binanceStats[0];

    return {
      capitalcom: capStats ? {
        totalTrades: capStats.totalTrades ?? 0,
        winRate: capStats.totalTrades > 0
          ? ((capStats.winningTrades ?? 0) / capStats.totalTrades * 100).toFixed(1)
          : "0.0",
        totalPnl: (capStats.totalPnl ?? 0).toFixed(2),
      } : null,
      binance: binStats ? {
        totalTrades: binStats.totalTrades ?? 0,
        winRate: binStats.totalTrades > 0
          ? ((binStats.winningTrades ?? 0) / binStats.totalTrades * 100).toFixed(1)
          : "0.0",
        totalPnl: (binStats.totalPnl ?? 0).toFixed(2),
      } : null,
    };
  }),

  // ─── Get Binance account balance ─────────────────────────────────────────
  getBinanceBalance: protectedProcedure.query(async () => {
    try {
      const balance = await binance.getAccountBalance();
      return { ok: true, ...balance };
    } catch (err) {
      return { ok: false, balance: 0, available: 0, unrealizedPnl: 0, currency: "USDT" };
    }
  }),

  // ─── Get Binance open positions ──────────────────────────────────────────
  getBinancePositions: protectedProcedure.query(async () => {
    try {
      const positions = await binance.getOpenPositions();
      return { ok: true, positions };
    } catch (err) {
      return { ok: false, positions: [] };
    }
  }),
});
