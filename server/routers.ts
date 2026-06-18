import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  getPortfolio, updatePortfolioMode,
  getTrades, insertTrade, closeTrade, getDailyStats, getOverallStats,
  getLatestSignals, insertSignal,
  getRiskSettings, updateRiskSettings,
  getChatHistory, insertChatMessage,
  getScheduleConfig, updateScheduleConfig,
  getPriceAlerts, createPriceAlert, deletePriceAlert,
  getEquityHistory, getMaxDrawdown, getInstrumentPerformance,
  getStrategyComparison,
} from "./db";
import { setTelegramWebhook } from "./telegram";
import {
  createHeartbeatJob,
  updateHeartbeatJob,
  deleteHeartbeatJob,
} from "./_core/heartbeat";
import { parse as parseCookie } from "cookie";
import { ENV } from "./_core/env";
import {
  getAccountBalance,
  getAllMarketPrices,
  getOpenPositions,
  testConnection,
  INSTRUMENT_EPICS,
  getMarketPrice,
  getActivityHistory,
  getTransactionHistory,
  getWorkingOrders,
  getClientSentiment,
  getAccountPreferences,
  searchMarkets,
  getWatchlists,
  getWatchlistDetail,
} from "./capitalcom";
import {
  startAutoTrade,
  stopAutoTrade,
  getEngineState,
  getActiveSession,
  getSessionLogs,
  getRecentSessions,
} from "./autoTradeEngine";
import {
  getDynamicConfidenceThreshold,
  checkEconomicCalendar,
} from "./engineIntelligence";
import { getWSState, getAllCachedPrices } from "./capitalcomWS";
import { getRecentLessons, getEngineIntelligence } from "./db";

// ─── Owner-only guard ─────────────────────────────────────────────────────────
// Uses role-based check (admin) as primary guard.
// Falls back to openId match so the owner can always access even if role hasn't
// been promoted yet (e.g. first login before DB is seeded).
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  const userOpenId = ctx.user.openId;
  const ownerOpenId = ENV.ownerOpenId;
  const isAdmin = ctx.user.role === "admin";
  const isOwnerById = ownerOpenId && userOpenId === ownerOpenId;
  if (!isAdmin && !isOwnerById) {
    console.warn(`[Auth] Access denied: user=${userOpenId} owner=${ownerOpenId} role=${ctx.user.role}`);
    throw new Error("Access denied — this platform is private.");
  }
  return next({ ctx });
});

// ─── Instruments ──────────────────────────────────────────────────────────────
const INSTRUMENTS = ["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"] as const;

// ─── AI Signal Generator ──────────────────────────────────────────────────────
async function generateSignalForInstrument(instrument: string) {
  const utcHour = new Date().getUTCHours();
  const session = utcHour >= 7 && utcHour < 16 ? "London Session" :
    utcHour >= 13 && utcHour < 22 ? "New York Session" :
    "Asian Session";

  const prompt = `You are HJ Capital's senior portfolio manager. Generate a trading signal for ${instrument}.
Current session: ${session}

Analyze current market conditions, technical indicators (EMA, RSI, Bollinger Bands), and market sentiment.
Be decisive — always return BUY or SELL unless the market is genuinely choppy with no direction.
Confidence scale: 35-50% = valid trade, 50-70% = good trade, 70%+ = strong trade.

Respond ONLY with valid JSON in this exact format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 35-95>,
  "reasoning": "<2-3 sentences of clear, actionable reasoning mentioning key indicators>",
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
        { role: "system", content: "You are a decisive portfolio manager. Always respond with valid JSON only, no markdown. Prefer BUY/SELL over HOLD." },
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
      confidence: 45,
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
  const systemPrompt = `You are HJ Capital AI — a personal investment advisor exclusively for Hamada Jaber. You are a decisive portfolio manager who actively seeks opportunities while managing risk.

Current account status:
- Balance: $${portfolio.balance}
- Mode: ${portfolio.mode === "paper" ? "Paper Trading (Safe Simulation)" : "LIVE Trading"}
- Scanned instruments: 10 core (EURUSD, GBPUSD, GOLD, US500, GER40, USDJPY, EURGBP, XAGUSD, OIL_CRUDE, NASDAQ) + 10 rotating from 60+ universe
- Investment philosophy: Active portfolio management — find and execute profitable trades, manage risk with stop losses

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

    overallStats: ownerProcedure.query(async () => {
      return await getOverallStats();
    }),

    // Fetch real balance from Capital.com (live account)
    liveBalance: ownerProcedure.query(async () => {
      try {
        const { getAccountBalance } = await import("./capitalcom");
        const live = await getAccountBalance();
        return {
          ok: true,
          balance: live.balance,
          available: live.available,
          profitLoss: live.profitLoss,
          currency: live.currency,
        };
      } catch (err) {
        return {
          ok: false,
          balance: null,
          available: null,
          profitLoss: null,
          currency: "USD",
          error: String(err),
        };
      }
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
        dailyLossLimitPct: z.string().optional(),
        stopLossPerTrade: z.string().optional(),
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

    // Fetch account activity history (opened/closed positions)
    activityHistory: ownerProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        maxResults: z.number().min(1).max(500).default(100),
      }))
      .query(async ({ input }) => {
        try {
          return await getActivityHistory(input.from, input.to, input.maxResults);
        } catch (err) {
          return [];
        }
      }),

    // Fetch transaction history (P&L, deposits, withdrawals)
    transactionHistory: ownerProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        maxResults: z.number().min(1).max(500).default(100),
      }))
      .query(async ({ input }) => {
        try {
          return await getTransactionHistory(input.from, input.to, input.maxResults);
        } catch (err) {
          return [];
        }
      }),

    // Fetch working orders (pending limit/stop orders)
    workingOrders: ownerProcedure.query(async () => {
      try {
        return await getWorkingOrders();
      } catch (err) {
        return [];
      }
    }),

    // Fetch client sentiment for instruments
    clientSentiment: ownerProcedure
      .input(z.object({ instruments: z.array(z.string()).default(["EURUSD", "GBPUSD", "GOLD", "US500", "BITCOIN"]) }))
      .query(async ({ input }) => {
        try {
          return await getClientSentiment(input.instruments);
        } catch (err) {
          return [];
        }
      }),

    // Fetch account preferences (leverage, hedging mode)
    accountPreferences: ownerProcedure.query(async () => {
      try {
        return await getAccountPreferences();
      } catch (err) {
        return { leverages: {}, hedgingMode: false, trailingStopsEnabled: false };
      }
    }),

    // Search for markets by name/symbol
    searchMarkets: ownerProcedure
      .input(z.object({ searchTerm: z.string().min(1).max(50) }))
      .query(async ({ input }) => {
        try {
          return await searchMarkets(input.searchTerm);
        } catch (err) {
          return [];
        }
      }),

    // Fetch all watchlists
    watchlists: ownerProcedure.query(async () => {
      try {
        return await getWatchlists();
      } catch (err) {
        return [];
      }
    }),

    // Fetch watchlist detail with markets
    watchlistDetail: ownerProcedure
      .input(z.object({ watchlistId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getWatchlistDetail(input.watchlistId);
        } catch (err) {
          return null;
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

    // ── Schedule: get current config ──────────────────────────────────────
    getSchedule: ownerProcedure.query(async () => {
      return getScheduleConfig();
    }),

    // ── Schedule: enable daily auto-start/stop ────────────────────────────
    enableSchedule: ownerProcedure
      .input(z.object({
        mode: z.enum(["paper", "live"]).default("paper"),
        cycleIntervalMinutes: z.number().min(5).max(60).default(15),
      }))
      .mutation(async ({ input, ctx }) => {
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";

        // Create start job (07:00 UTC Mon–Fri = 10:00 Cairo)
        const startJob = await createHeartbeatJob({
          name: "hj-auto-trade-start",
          cron: "0 7 * * 1-5",
          path: "/api/scheduled/auto-trade-start",
          payload: { mode: input.mode, cycleIntervalMinutes: input.cycleIntervalMinutes },
          description: `Daily auto-start HJ Auto Trade (${input.mode} mode, ${input.cycleIntervalMinutes}min cycle)`,
        }, sessionToken);

        // Create stop job (20:00 UTC Mon–Fri = 23:00 Cairo)
        const stopJob = await createHeartbeatJob({
          name: "hj-auto-trade-stop",
          cron: "0 20 * * 1-5",
          path: "/api/scheduled/auto-trade-stop",
          payload: { reason: "Scheduled daily stop (end of trading session)" },
          description: "Daily auto-stop HJ Auto Trade",
        }, sessionToken);

        await updateScheduleConfig({
          enabled: true,
          defaultMode: input.mode,
          cycleIntervalMinutes: input.cycleIntervalMinutes,
          startTaskUid: startJob.taskUid,
          stopTaskUid: stopJob.taskUid,
        });

        return {
          success: true,
          startTaskUid: startJob.taskUid,
          stopTaskUid: stopJob.taskUid,
          nextStart: startJob.nextExecutionAt,
          nextStop: stopJob.nextExecutionAt,
        };
      }),

    // ── Schedule: disable (pause) daily auto-start/stop ───────────────────
    disableSchedule: ownerProcedure.mutation(async ({ ctx }) => {
      const config = await getScheduleConfig();
      if (!config) return { success: true };

      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";

      if (config.startTaskUid) {
        try { await deleteHeartbeatJob(config.startTaskUid, sessionToken); } catch {}
      }
      if (config.stopTaskUid) {
        try { await deleteHeartbeatJob(config.stopTaskUid, sessionToken); } catch {}
      }

      await updateScheduleConfig({
        enabled: false,
        startTaskUid: null,
        stopTaskUid: null,
      });

      return { success: true };
    }),
  }),

  // ─── Price Alerts ────────────────────────────────────────────────────────────
  priceAlerts: router({
    list: ownerProcedure.query(async () => {
      return await getPriceAlerts();
    }),

    create: ownerProcedure
      .input(z.object({
        instrument: z.string(),
        targetPrice: z.string(),
        condition: z.enum(["above", "below"]),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createPriceAlert(input);
        return { success: true, id };
      }),

    delete: ownerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePriceAlert(input.id);
        return { success: true };
      }),
  }),

  // ─── Performance Analytics ───────────────────────────────────────────────────
  performance: router({
    equityHistory: ownerProcedure
      .input(z.object({ days: z.number().min(7).max(365).default(30) }))
      .query(async ({ input }) => {
        return await getEquityHistory(input.days);
      }),

    maxDrawdown: ownerProcedure.query(async () => {
      return await getMaxDrawdown();
    }),

    instrumentPerformance: ownerProcedure.query(async () => {
      return await getInstrumentPerformance();
    }),
  }),

  // ─── Backtesting ─────────────────────────────────────────────────────────────
  backtest: router({
    run: ownerProcedure
      .input(z.object({
        instrument: z.string(),
        strategy: z.enum(["rsi_macd", "bollinger", "trend_following", "mtf_confirmation"]).default("mtf_confirmation"),
        days: z.number().min(7).max(90).default(30),
        initialBalance: z.number().default(250),
      }))
      .mutation(async ({ input }) => {
        // Run AI-powered backtesting simulation
        const prompt = `You are a quantitative trading analyst. Simulate a backtest for the following strategy on ${input.instrument}.

Strategy: ${input.strategy}
Period: Last ${input.days} days
Initial Balance: $${input.initialBalance}

Simulate realistic trading results based on typical ${input.strategy} strategy performance on ${input.instrument}.

Respond ONLY with valid JSON:
{
  "instrument": "${input.instrument}",
  "strategy": "${input.strategy}",
  "days": ${input.days},
  "initialBalance": ${input.initialBalance},
  "finalBalance": <number>,
  "totalReturn": <percentage as number>,
  "totalTrades": <integer>,
  "winningTrades": <integer>,
  "losingTrades": <integer>,
  "winRate": <percentage as number>,
  "maxDrawdown": <percentage as number>,
  "sharpeRatio": <number>,
  "bestTrade": <dollar amount>,
  "worstTrade": <dollar amount>,
  "avgTradeDuration": "<e.g. 2.5 hours>",
  "summary": "<2-3 sentence analysis of the strategy performance>",
  "recommendation": "RECOMMENDED" | "NEUTRAL" | "NOT_RECOMMENDED"
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a backtesting engine. Respond only in valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" } as any,
        });

        const content = response.choices?.[0]?.message?.content ?? "{}";
        const result = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        return result;
      }),
  }),

  // ─── Telegram Webhook Setup ──────────────────────────────────────────────────
  // ─── Intelligence Dashboard ──────────────────────────────────────────────────
  intelligence: router({
    getLessons: ownerProcedure
      .input(z.object({ instrument: z.string().optional(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return await getRecentLessons(input.instrument, input.limit);
      }),
    getDynamicThreshold: ownerProcedure
      .query(async () => {
        return await getDynamicConfidenceThreshold();
      }),
    getIntelligenceHistory: ownerProcedure
      .input(z.object({ limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const intel = await getEngineIntelligence();
        return intel ? [intel] : [];
      }),
    getCalendarEvents: ownerProcedure
      .query(async () => {
        return await checkEconomicCalendar();
      }),
    getStreamingStatus: ownerProcedure
      .query(async () => {
        const wsState = getWSState();
        const cachedPrices = getAllCachedPrices();
        return {
          websocket: wsState,
          cachedPrices: cachedPrices.map((p) => ({
            epic: p.epic,
            bid: p.bid,
            ask: p.ask,
            mid: p.mid,
            source: p.source,
            ageMs: Date.now() - p.timestamp,
          })),
        };
      }),
  }),

  telegram: router({
    registerWebhook: ownerProcedure
      .input(z.object({ webhookUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        const ok = await setTelegramWebhook(input.webhookUrl);
        return { success: ok };
      }),
  }),

  // ─── Strategy Comparison ─────────────────────────────────────────────────────
  strategyComparison: router({
    get: ownerProcedure.query(async () => {
      return await getStrategyComparison();
    }),
  }),
});

export type AppRouter = typeof appRouter;

