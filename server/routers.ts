import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  getPortfolio, updatePortfolioMode,
  getTrades, insertTrade, closeTrade, getDailyStats,
  getLatestSignals, insertSignal,
  getRiskSettings, updateRiskSettings,
  getChatHistory, insertChatMessage,
} from "./db";
import { ENV } from "./_core/env";
import {
  getAccountBalance,
  getAllMarketPrices,
  getOpenPositions,
  testConnection,
  INSTRUMENT_EPICS,
  getMarketPrice,
} from "./capitalcom";
import {
  startAutoTrade,
  stopAutoTrade,
  getEngineState,
  getActiveSession,
  getSessionLogs,
  getRecentSessions,
} from "./autoTradeEngine";

// ─── Owner-only guard ─────────────────────────────────────────────────────────
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.openId !== ENV.ownerOpenId) {
    throw new Error("Access denied — this platform is private.");
  }
  return next({ ctx });
});

// ─── Instruments ──────────────────────────────────────────────────────────────
const INSTRUMENTS = ["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"] as const;

// ─── AI Signal Generator ──────────────────────────────────────────────────────
async function generateSignalForInstrument(instrument: string) {
  const prompt = `You are an expert quantitative trading analyst. Generate a trading signal for ${instrument}.

Analyze current market conditions, technical indicators (EMA, RSI, Bollinger Bands), and market sentiment.

Respond ONLY with valid JSON in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 50-95>,
  "reasoning": "<2-3 sentences of clear, actionable reasoning>",
  "currentPrice": <realistic current price as number>,
  "targetPrice": <realistic target price as number>,
  "stopLoss": <realistic stop loss as number>,
  "indicators": {
    "rsi": <number 0-100>,
    "trend": "bullish" | "bearish" | "neutral",
    "volatility": "low" | "medium" | "high"
  }
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a precise trading signal generator. Always respond with valid JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
    });
    const rawContent = response.choices[0]?.message?.content ?? "{}";
    const content = typeof rawContent === "string" ? rawContent : "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback signal
    return {
      signal: "HOLD",
      confidence: 55,
      reasoning: `Market conditions for ${instrument} are currently mixed. Waiting for clearer directional signals before entering a position.`,
      currentPrice: null,
      targetPrice: null,
      stopLoss: null,
      indicators: { rsi: 50, trend: "neutral", volatility: "medium" },
    };
  }
}

// ─── AI Advisor ───────────────────────────────────────────────────────────────
async function getAdvisorResponse(userMessage: string, portfolio: { balance: string; mode: string }, history: { role: string; content: string }[]) {
  const systemPrompt = `You are HJ Capital AI — a personal investment advisor exclusively for Hamada Jaber. You are sophisticated, precise, and focused on capital preservation above all else.

Current account status:
- Balance: $${portfolio.balance}
- Mode: ${portfolio.mode === "paper" ? "Paper Trading (Safe Simulation)" : "LIVE Trading"}
- Watched instruments: EURUSD, GBPUSD, GOLD, US500, BTC
- Investment philosophy: Preserve capital first, small consistent profits over big risky gains

Your role:
- Provide personalized, actionable investment advice
- Explain market conditions clearly and concisely
- Always consider risk management (never risk more than 1-2% per trade)
- Be direct and confident, but always honest about uncertainty
- Speak to Hamada personally and professionally`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(-10).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await invokeLLM({ messages });
        const raw = response.choices[0]?.message?.content ?? "I apologize, I couldn't process your request. Please try again.";
        return typeof raw === "string" ? raw : "I apologize, I couldn't process your request. Please try again.";
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Portfolio ──────────────────────────────────────────────────────────────
  portfolio: router({
    get: ownerProcedure.query(async () => {
      return await getPortfolio();
    }),

    setMode: ownerProcedure
      .input(z.object({ mode: z.enum(["paper", "live"]) }))
      .mutation(async ({ input }) => {
        await updatePortfolioMode(input.mode);
        return { success: true };
      }),

    dailyStats: ownerProcedure.query(async () => {
      return await getDailyStats();
    }),
  }),

  // ─── Trades ─────────────────────────────────────────────────────────────────
  trades: router({
    list: ownerProcedure
      .input(z.object({
        instrument: z.string().optional(),
        status: z.enum(["open", "closed", "cancelled"]).optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getTrades(input);
      }),

    add: ownerProcedure
      .input(z.object({
        instrument: z.string(),
        direction: z.enum(["BUY", "SELL"]),
        openPrice: z.string(),
        size: z.string(),
        aiReasoning: z.string().optional(),
        aiConfidence: z.number().optional(),
        mode: z.enum(["paper", "live"]),
      }))
      .mutation(async ({ input }) => {
        await insertTrade(input);
        return { success: true };
      }),

    close: ownerProcedure
      .input(z.object({ id: z.number(), closePrice: z.string(), pnl: z.string() }))
      .mutation(async ({ input }) => {
        await closeTrade(input.id, input.closePrice, input.pnl);
        // Update balance
        const p = await getPortfolio();
        if (p) {
          const newBalance = (parseFloat(p.balance) + parseFloat(input.pnl)).toFixed(2);
          const { updatePortfolioBalance } = await import("./db");
          await updatePortfolioBalance(newBalance);
        }
        return { success: true };
      }),
  }),

  // ─── Signals ────────────────────────────────────────────────────────────────
  signals: router({
    list: ownerProcedure.query(async () => {
      return await getLatestSignals();
    }),

    generate: ownerProcedure
      .input(z.object({ instrument: z.string() }))
      .mutation(async ({ input }) => {
        const data = await generateSignalForInstrument(input.instrument);
        await insertSignal({
          instrument: input.instrument,
          signal: data.signal,
          confidence: data.confidence,
          reasoning: data.reasoning,
          currentPrice: data.currentPrice?.toString() ?? null,
          targetPrice: data.targetPrice?.toString() ?? null,
          stopLoss: data.stopLoss?.toString() ?? null,
          indicators: data.indicators,
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4h expiry
        });
        return data;
      }),

    generateAll: ownerProcedure.mutation(async () => {
      const results = await Promise.all(
        INSTRUMENTS.map(async (inst) => {
          const data = await generateSignalForInstrument(inst);
          await insertSignal({
            instrument: inst,
            signal: data.signal,
            confidence: data.confidence,
            reasoning: data.reasoning,
            currentPrice: data.currentPrice?.toString() ?? null,
            targetPrice: data.targetPrice?.toString() ?? null,
            stopLoss: data.stopLoss?.toString() ?? null,
            indicators: data.indicators,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });
          return { instrument: inst, ...data };
        })
      );
      return results;
    }),
  }),

  // ─── Risk Settings ───────────────────────────────────────────────────────────
  risk: router({
    get: ownerProcedure.query(async () => {
      return await getRiskSettings();
    }),

    update: ownerProcedure
      .input(z.object({
        dailyLossLimit: z.string().optional(),
        dailyProfitLock: z.string().optional(),
        maxRiskPerTrade: z.string().optional(),
        minConfidenceThreshold: z.number().optional(),
        maxOpenPositions: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateRiskSettings(input);
        return { success: true };
      }),
  }),

  // ─── Capital.com Live Data ──────────────────────────────────────────────────
  capitalcom: router({
    // Test connection to Capital.com
    testConnection: ownerProcedure.query(async () => {
      return await testConnection();
    }),

    // Fetch live account balance from Capital.com
    liveBalance: ownerProcedure.query(async () => {
      try {
        return await getAccountBalance();
      } catch (err) {
        return { balance: null, available: null, profitLoss: null, currency: "USD", error: String(err) };
      }
    }),

    // Fetch live prices for all watched instruments
    livePrices: ownerProcedure.query(async () => {
      try {
        return await getAllMarketPrices();
      } catch (err) {
        return [];
      }
    }),

    // Fetch live price for a single instrument
    livePrice: ownerProcedure
      .input(z.object({ instrument: z.string() }))
      .query(async ({ input }) => {
        try {
          const epic = INSTRUMENT_EPICS[input.instrument] ?? input.instrument;
          const price = await getMarketPrice(epic);
          return { ...price, epic: input.instrument };
        } catch (err) {
          return null;
        }
      }),

    // Fetch open positions from Capital.com
    openPositions: ownerProcedure.query(async () => {
      try {
        return await getOpenPositions();
      } catch (err) {
        return [];
      }
    }),
  }),

  // ─── AI Advisor ──────────────────────────────────────────────────────────────
  advisor: router({
    history: ownerProcedure.query(async () => {
      const msgs = await getChatHistory();
      return msgs.reverse();
    }),

    chat: ownerProcedure
      .input(z.object({ message: z.string().min(1).max(2000) }))
      .mutation(async ({ input }) => {
        // Save user message
        await insertChatMessage({ role: "user", content: input.message });

        // Get history for context
        const history = await getChatHistory();
        const p = await getPortfolio();

        // Get AI response
        const reply = await getAdvisorResponse(
          input.message,
          { balance: p?.balance ?? "250.00", mode: p?.mode ?? "paper" },
          history.reverse().map(m => ({ role: m.role, content: m.content }))
        );

        // Save assistant reply
        await insertChatMessage({ role: "assistant", content: reply });

        return { reply };
      }),
  }),

  // ─── HJ Auto Trade Mode ──────────────────────────────────────────────────────
  autoTrade: router({
    // Get current engine status
    status: ownerProcedure.query(async () => {
      const state = getEngineState();
      const activeSession = await getActiveSession();
      return {
        isRunning: state?.isRunning ?? false,
        sessionId: state?.sessionId ?? null,
        mode: state?.mode ?? null,
        cycleCount: state?.cycleCount ?? 0,
        lastCycleAt: state?.lastCycleAt ?? null,
        session: activeSession,
      };
    }),

    // Start auto trade engine
    start: ownerProcedure
      .input(z.object({
        mode: z.enum(["paper", "live"]),
        cycleIntervalMinutes: z.number().min(5).max(60).default(15),
      }))
      .mutation(async ({ input }) => {
        const state = await startAutoTrade(input.mode, input.cycleIntervalMinutes);
        return { success: true, sessionId: state.sessionId, mode: state.mode };
      }),

    // Stop auto trade engine
    stop: ownerProcedure
      .input(z.object({ reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        await stopAutoTrade(input.reason ?? "Manual stop by owner");
        return { success: true };
      }),

    // Get logs for a session
    getLogs: ownerProcedure
      .input(z.object({
        sessionId: z.number(),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        return getSessionLogs(input.sessionId, input.limit);
      }),

    // Get recent sessions
    getSessions: ownerProcedure.query(async () => {
      return getRecentSessions(10);
    }),
  }),
});

export type AppRouter = typeof appRouter;

