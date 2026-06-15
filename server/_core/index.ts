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
import { autoTradeStartHandler, autoTradeStopHandler } from "../scheduledHandlers";
import { handleTelegramUpdate, TelegramUpdate } from "../telegram";
import { startAutoTrade, stopAutoTrade, getEngineState, getActiveSession } from "../autoTradeEngine";
import { getAccountBalance } from "../capitalcom";

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
}

startServer().catch(console.error);
