import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { autoTradeStartHandler, autoTradeStopHandler, weeklyReportHandler, weeklyMetaAnalysisHandler } from "../scheduledHandlers";
import { handleTelegramUpdate, TelegramUpdate, setTelegramWebhook } from "../telegram";
import { startAutoTrade, stopAutoTrade, getEngineState, getActiveSession, CORE_INSTRUMENTS } from "../autoTradeEngine";
import { getAccountBalance, isAnyMarketOpen, getNextMarketEvent } from "../capitalcom";
import { ensureAgentPipelineColumn } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Scheduled Heartbeat handlers — must be registered BEFORE Vite/static fallthrough
  app.post("/api/scheduled/auto-trade-start", autoTradeStartHandler);
  app.post("/api/scheduled/auto-trade-stop", autoTradeStopHandler);
  app.post("/api/scheduled/weekly-report", weeklyReportHandler);
  app.post("/api/scheduled/weekly-meta-analysis", weeklyMetaAnalysisHandler);

  // Telegram Bot Webhook — handles /start /stop /status /balance commands
  app.post("/api/telegram/webhook", async (req, res) => {
    res.sendStatus(200); // Acknowledge immediately
    try {
      const update = req.body as TelegramUpdate;
      await handleTelegramUpdate(update, {
        onStart: async () => {
          const state = getEngineState();
          if (state?.isRunning) {
            return `⚠️ المحرك يعمل بالفعل في وضع <b>${state.mode.toUpperCase()}</b>.`;
          }
          try {
            await startAutoTrade("live", 15);
            return `🚀 <b>تم تشغيل محرك التداول الآلي</b>\nالوضع: 🔴 LIVE\nدورة التحليل: كل 15 دقيقة`;
          } catch (err) {
            return `❌ فشل تشغيل المحرك: ${String(err)}`;
          }
        },
        onStop: async () => {
          const state = getEngineState();
          if (!state?.isRunning) {
            return `⚠️ المحرك متوقف بالفعل.`;
          }
          await stopAutoTrade("Telegram /stop command");
          return `⏹ <b>تم إيقاف محرك التداول الآلي</b>\nتم الإيقاف بأمر Telegram.`;
        },
        onStatus: async () => {
          const state = getEngineState();
          const session = await getActiveSession().catch(() => null);
          if (!state?.isRunning || !session) {
            return `📊 <b>حالة المحرك</b>\n━━━━━━━━━━━━━━━━━━\nالحالة: <b>متوقف</b>`;
          }
          return `📊 <b>حالة المحرك</b>\n━━━━━━━━━━━━━━━━━━\nالحالة: <b>يعمل ✅</b>\nالوضع: <b>${state.mode.toUpperCase()}</b>\nعدد الدورات: <b>${state.cycleCount}</b>\nإجمالي الصفقات: <b>${session.totalTrades}</b>\nنسبة النجاح: <b>${session.totalTrades > 0 ? ((session.winningTrades / session.totalTrades) * 100).toFixed(1) : 0}%</b>\nربح/خسارة الجلسة: <b>${parseFloat(session.sessionPnl) >= 0 ? "+" : ""}$${parseFloat(session.sessionPnl).toFixed(2)}</b>`;
        },
        onBalance: async () => {
          try {
            const bal = await getAccountBalance();
            return `💰 <b>رصيد Capital.com</b>\n━━━━━━━━━━━━━━━━━━\nالرصيد: <b>$${bal.balance.toFixed(2)}</b>\nمتاح للتداول: <b>$${bal.available.toFixed(2)}</b>\nربح/خسارة مفتوحة: <b>${bal.profitLoss >= 0 ? "+" : ""}$${bal.profitLoss.toFixed(2)}</b>`;
          } catch (err) {
            return `❌ فشل جلب الرصيد: ${String(err)}`;
          }
        },
        onPositions: async () => {
          try {
            const { getOpenPositions } = await import("../capitalcom");
            const positions = await getOpenPositions();
            if (!positions || positions.length === 0) {
              return `📊 <b>الصفقات المفتوحة</b>\n━━━━━━━━━━━━━━━━━━\nلا توجد صفقات مفتوحة حالياً.`;
            }
            const lines = positions.map((p, i) => {
              const pnl = p.profitLoss ?? 0;
              const pnlStr = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
              const dir = p.direction === "BUY" ? "🟢 BUY" : "🔴 SELL";
              return `${i + 1}. <b>${p.epic}</b> ${dir}\n   دخول: ${p.openLevel} | حالي: ${p.currentLevel}\n   P&L: <b>${pnlStr}</b>`;
            });
            const totalPnl = positions.reduce((s, p) => s + (p.profitLoss ?? 0), 0);
            return `📊 <b>الصفقات المفتوحة (${positions.length})</b>\n━━━━━━━━━━━━━━━━━━\n${lines.join("\n\n")}\n━━━━━━━━━━━━━━━━━━\nإجمالي P&L: <b>${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}</b>`;
          } catch (err) {
            return `❌ فشل جلب الصفقات: ${String(err)}`;
          }
        },
      });
    } catch (err) {
      console.error("[Telegram Webhook] Error:", err);
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // ── Market-Hours Watcher ──────────────────────────────────────────────────
  // Checks every 5 minutes whether any Capital.com market is open.
  // Engine auto-starts when markets open, auto-stops when all markets close.
  // This replaces the fixed Cairo 10AM-11PM schedule with a dynamic one.
  const WATCHER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  async function marketHoursWatcher() {
    try {
      const anyOpen = isAnyMarketOpen(CORE_INSTRUMENTS);
      const state = getEngineState();
      const nextEvent = getNextMarketEvent(CORE_INSTRUMENTS);

      if (anyOpen && !state?.isRunning) {
        // Markets are open but engine is stopped → start it
        console.log("[MarketWatcher] Markets are open — auto-starting engine in LIVE mode...");
        await startAutoTrade("live", 15);
        console.log("[MarketWatcher] Engine auto-started. Next close in ~" + nextEvent.minutesFromNow + " min.");
      } else if (!anyOpen && state?.isRunning) {
        // All markets closed → stop the engine
        console.log("[MarketWatcher] All markets closed — auto-stopping engine...");
        await stopAutoTrade("All markets closed (market-hours watcher)");
        console.log("[MarketWatcher] Engine stopped. Next open in ~" + nextEvent.minutesFromNow + " min.");
      } else if (anyOpen && state?.isRunning) {
        // All good — log occasionally
        if (Math.random() < 0.1) { // ~10% chance = roughly every 50 min
          console.log("[MarketWatcher] Markets open, engine running. Next close in ~" + nextEvent.minutesFromNow + " min.");
        }
      } else {
        // Markets closed, engine stopped — normal weekend/overnight state
        if (Math.random() < 0.1) {
          console.log("[MarketWatcher] Markets closed, engine idle. Next open in ~" + nextEvent.minutesFromNow + " min.");
        }
      }
    } catch (err) {
      console.error("[MarketWatcher] Error:", err);
    }
  }

  // Initial check after 5s (let DB connections settle)
  setTimeout(async () => {
    await ensureAgentPipelineColumn().catch(() => {});
    await marketHoursWatcher();
    // Then check every 5 minutes
    setInterval(marketHoursWatcher, WATCHER_INTERVAL_MS);
  }, 5000);

  // Auto-register Telegram webhook on startup (production only)
  // Uses the deployed domain so Telegram can reach our /api/telegram/webhook endpoint
  if (process.env.NODE_ENV === "production") {
    setTimeout(async () => {
      try {
        // Try hjcapital.vip first, fall back to manus.space subdomain
        const domain = process.env.APP_DOMAIN || "hjcapital.vip";
        const webhookUrl = `https://${domain}/api/telegram/webhook`;
        const ok = await setTelegramWebhook(webhookUrl);
        if (ok) {
          console.log(`[Telegram] Webhook auto-registered: ${webhookUrl}`);
        } else {
          console.warn("[Telegram] Webhook registration failed — bot commands will not work until webhook is set.");
        }
      } catch (err) {
        console.warn("[Telegram] Webhook auto-registration error:", err);
      }
    }, 8000); // Wait 8s for server to be fully ready
  }
}

startServer().catch(console.error);
