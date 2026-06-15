import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(isOwner = true): TrpcContext {
  return {
    user: isOwner
      ? {
          id: 1,
          openId: process.env.OWNER_OPEN_ID ?? "test-owner",
          name: "Hamada",
          email: "drhamadajaber@gmail.com",
          loginMethod: "manus",
          role: "admin" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("HJ Capital — Portfolio Router", () => {
  it("returns portfolio data with balance and mode", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const portfolio = await caller.portfolio.get();
    expect(portfolio).toBeDefined();
    expect(portfolio.balance).toBeDefined();
    expect(["paper", "live"]).toContain(portfolio.mode);
    expect(parseFloat(portfolio.balance)).toBeGreaterThan(0);
  });

  it("returns daily stats", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.portfolio.dailyStats();
    expect(stats).toBeDefined();
    expect(typeof stats.tradeCount).toBe("number");
    expect(typeof stats.wins).toBe("number");
    expect(typeof stats.losses).toBe("number");
    expect(typeof stats.totalPnl).toBe("number");
  });

  it("can toggle trading mode", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    // Get current mode
    const before = await caller.portfolio.get();
    const originalMode = before.mode;
    // Toggle to opposite
    const newMode = originalMode === "paper" ? "live" : "paper";
    await caller.portfolio.setMode({ mode: newMode });
    const after = await caller.portfolio.get();
    expect(after.mode).toBe(newMode);
    // Restore
    await caller.portfolio.setMode({ mode: originalMode });
  });
});

describe("HJ Capital — Risk Router", () => {
  it("returns risk settings", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const risk = await caller.risk.get();
    expect(risk).toBeDefined();
    expect(risk.dailyLossLimitPct).toBeDefined();
    expect(risk.maxRiskPerTrade).toBeDefined();
    expect(typeof risk.minConfidenceThreshold).toBe("number");
    expect(typeof risk.maxOpenPositions).toBe("number");
  });

  it("can update risk settings", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.risk.update({
      dailyLossLimitPct: "8.00",
      maxRiskPerTrade: "1.50",
      minConfidenceThreshold: 75,
      maxOpenPositions: 4,
    });
    expect(result.success).toBe(true);
    // Restore defaults
    await caller.risk.update({
      dailyLossLimitPct: "7.50",
      maxRiskPerTrade: "1.00",
      minConfidenceThreshold: 72,
      maxOpenPositions: 3,
    });
  });
});

describe("HJ Capital — Trades Router", () => {
  it("returns trade list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const trades = await caller.trades.list({});
    expect(Array.isArray(trades)).toBe(true);
  });

  it("filters trades by instrument", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const trades = await caller.trades.list({ instrument: "EURUSD" });
    expect(Array.isArray(trades)).toBe(true);
    for (const t of trades) {
      expect(t.instrument).toBe("EURUSD");
    }
  });
});

describe("HJ Capital — Signals Router", () => {
  it("returns signals list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const signals = await caller.signals.list();
    expect(Array.isArray(signals)).toBe(true);
  });
});

describe("HJ Capital — Advisor Router", () => {
  it("returns chat history", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const history = await caller.advisor.history();
    expect(Array.isArray(history)).toBe(true);
  });
});

describe("HJ Capital — Auth Router", () => {
  it("returns current user when authenticated", async () => {
    const ctx = createMockContext(true);
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.name).toBe("Hamada");
  });

  it("returns null when not authenticated", async () => {
    const ctx = createMockContext(false);
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});
