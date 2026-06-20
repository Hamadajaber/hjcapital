/**
 * Telegram notification helper for HJ Capital trade alerts
 */

const TELEGRAM_API = "https://api.telegram.org";

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return { token, chatId };
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) {
    console.warn("[Telegram] Bot token or chat ID not configured");
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  } catch (err) {
    console.error("[Telegram] Failed to send message:", err);
    return false;
  }
}

export async function notifyTradeOpened(params: {
  instrument: string;
  direction: "BUY" | "SELL";
  size: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reasoning: string;
  mode: "paper" | "live";
}): Promise<void> {
  const modeLabel = params.mode === "live" ? "🔴 LIVE" : "📄 PAPER";
  const dirEmoji = params.direction === "BUY" ? "📈" : "📉";
  const text = `${dirEmoji} <b>صفقة جديدة — ${params.instrument}</b>
━━━━━━━━━━━━━━━━━━
${modeLabel} | الاتجاه: <b>${params.direction}</b>
💰 سعر الدخول: <b>${params.entryPrice}</b>
🎯 الهدف: <b>${params.takeProfit}</b>
🛡 وقف الخسارة: <b>${params.stopLoss}</b>
📊 الحجم: <b>${params.size} وحدة</b>
🧠 ثقة الـ AI: <b>${params.confidence}%</b>
━━━━━━━━━━━━━━━━━━
💬 <i>${params.reasoning}</i>`;

  await sendTelegramMessage(text);
}

export async function notifyTradeClosed(params: {
  instrument: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  closePrice: number;
  pnl: number;
  reason: string;
  mode: "paper" | "live";
}): Promise<void> {
  const modeLabel = params.mode === "live" ? "🔴 LIVE" : "📄 PAPER";
  const pnlEmoji = params.pnl >= 0 ? "✅" : "❌";
  const pnlSign = params.pnl >= 0 ? "+" : "";
  const text = `${pnlEmoji} <b>صفقة مغلقة — ${params.instrument}</b>
━━━━━━━━━━━━━━━━━━
${modeLabel} | الاتجاه: <b>${params.direction}</b>
📥 سعر الدخول: <b>${params.entryPrice}</b>
📤 سعر الإغلاق: <b>${params.closePrice}</b>
💵 الربح/الخسارة: <b>${pnlSign}$${params.pnl.toFixed(2)}</b>
━━━━━━━━━━━━━━━━━━
📝 السبب: <i>${params.reason}</i>`;

  await sendTelegramMessage(text);
}

export async function notifyEngineStarted(mode: "paper" | "live", balance: number): Promise<void> {
  const modeLabel = mode === "live" ? "🔴 LIVE (فلوس حقيقية)" : "📄 PAPER (محاكاة)";
  const text = `🚀 <b>HJ Auto Trade Engine بدأ</b>
━━━━━━━━━━━━━━━━━━
الوضع: <b>${modeLabel}</b>
💰 رصيد الحساب: <b>$${balance.toFixed(2)}</b>
⏰ دورة التحليل: كل 15 دقيقة
━━━━━━━━━━━━━━━━━━
🤖 الـ AI يراقب السوق الآن...`;

  await sendTelegramMessage(text);
}

export async function notifyEngineStopped(stats: {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
}): Promise<void> {
  const pnlEmoji = stats.totalPnl >= 0 ? "✅" : "❌";
  const pnlSign = stats.totalPnl >= 0 ? "+" : "";
  const text = `⏹ <b>HJ Auto Trade Engine توقف</b>
━━━━━━━━━━━━━━━━━━
📊 إجمالي الصفقات: <b>${stats.totalTrades}</b>
🎯 نسبة النجاح: <b>${stats.winRate.toFixed(1)}%</b>
${pnlEmoji} إجمالي الربح/الخسارة: <b>${pnlSign}$${stats.totalPnl.toFixed(2)}</b>`;

  await sendTelegramMessage(text);
}

export async function notifyTradeReconciled(params: {
  tradeId: number;
  instrument: string;
  direction: "BUY" | "SELL";
  entryPrice: string | number;
  closePrice: string | number;
  pnl: number;
  pnlSource: string;
  mode: "paper" | "live";
}): Promise<void> {
  const modeLabel = params.mode === "live" ? "🔴 LIVE" : "📄 PAPER";
  const pnlEmoji = params.pnl > 0 ? "✅" : params.pnl < 0 ? "❌" : "⚪";
  const pnlSign = params.pnl > 0 ? "+" : "";
  const text = `🔄 <b>صفقة مُعادَلة تلقائياً — ${params.instrument}</b>
━━━━━━━━━━━━━━━━━━
${modeLabel} | الاتجاه: <b>${params.direction}</b>
📥 سعر الدخول: <b>${params.entryPrice}</b>
📤 سعر الإغلاق: <b>${params.closePrice}</b>
${pnlEmoji} الربح/الخسارة: <b>${pnlSign}$${params.pnl.toFixed(2)}</b>
━━━━━━━━━━━━━━━━━━
📝 أُغلقت بواسطة Capital.com (SL/TP/Manual)
🔍 المصدر: <i>${params.pnlSource}</i>
🆔 رقم الصفقة: #${params.tradeId}`;

  await sendTelegramMessage(text);
}

export async function notifyRiskAlert(message: string): Promise<void> {
  const text = `⚠️ <b>تنبيه إدارة المخاطر</b>
━━━━━━━━━━━━━━━━━━
${message}`;
  await sendTelegramMessage(text);
}

// ─── Telegram Bot Command Handler ─────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

/**
 * Handle an incoming Telegram bot update (webhook).
 * Supports: /start, /stop, /status, /balance
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  handlers: {
    onStart: () => Promise<string>;
    onStop: () => Promise<string>;
    onStatus: () => Promise<string>;
    onBalance: () => Promise<string>;
  }
): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const text = message.text.trim().toLowerCase();
  const chatId = String(message.chat.id);

  // Only respond to the configured chat ID for security
  const { chatId: configuredChatId } = getTelegramConfig();
  if (chatId !== configuredChatId) {
    console.warn(`[Telegram] Ignoring message from unauthorized chat: ${chatId}`);
    return;
  }

  let response = "";

  if (text === "/start" || text.startsWith("/start ")) {
    response = await handlers.onStart();
  } else if (text === "/stop" || text.startsWith("/stop ")) {
    response = await handlers.onStop();
  } else if (text === "/status" || text.startsWith("/status ")) {
    response = await handlers.onStatus();
  } else if (text === "/balance" || text.startsWith("/balance ")) {
    response = await handlers.onBalance();
  } else if (text === "/help") {
    response = `🤖 <b>HJ Capital Bot — الأوامر المتاحة</b>
━━━━━━━━━━━━━━━━━━
/start — تشغيل محرك التداول الآلي
/stop — إيقاف محرك التداول الآلي
/status — حالة المحرك والجلسة الحالية
/balance — رصيد الحساب الحالي
/help — عرض هذه القائمة`;
  } else {
    response = `❓ أمر غير معروف: <code>${message.text}</code>\nاكتب /help لعرض الأوامر المتاحة.`;
  }

  if (response) {
    await sendTelegramMessage(response);
  }
}

/**
 * Register the Telegram webhook URL with the bot API.
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  const { token } = getTelegramConfig();
  if (!token) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (data.ok) {
      console.log("[Telegram] Webhook registered:", webhookUrl);
    } else {
      console.error("[Telegram] Webhook registration failed:", data.description);
    }
    return data.ok;
  } catch (err) {
    console.error("[Telegram] Failed to set webhook:", err);
    return false;
  }
}

// ─── Price Alert Notification ─────────────────────────────────────────────────

export async function notifyPriceAlert(params: {
  instrument: string;
  targetPrice: number;
  currentPrice: number;
  condition: "above" | "below";
  note?: string | null;
}): Promise<void> {
  const conditionLabel = params.condition === "above" ? "تجاوز فوق" : "انخفض تحت";
  const text = `🔔 <b>تنبيه سعر — ${params.instrument}</b>
━━━━━━━━━━━━━━━━━━
📊 السعر الحالي: <b>${params.currentPrice}</b>
🎯 السعر المستهدف: <b>${params.targetPrice}</b>
📌 الشرط: <b>${conditionLabel} ${params.targetPrice}</b>
${params.note ? `💬 ملاحظة: <i>${params.note}</i>` : ""}`;

  await sendTelegramMessage(text);
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

export async function sendDailySummary(params: {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  balance: number;
}): Promise<void> {
  const pnlEmoji = params.totalPnl >= 0 ? "✅" : "❌";
  const pnlSign = params.totalPnl >= 0 ? "+" : "";
  const text = `📅 <b>ملخص يوم التداول — ${params.date}</b>
━━━━━━━━━━━━━━━━━━
📊 إجمالي الصفقات: <b>${params.totalTrades}</b>
✅ صفقات رابحة: <b>${params.wins}</b>
❌ صفقات خاسرة: <b>${params.losses}</b>
🎯 نسبة النجاح: <b>${params.winRate.toFixed(1)}%</b>
━━━━━━━━━━━━━━━━━━
${pnlEmoji} إجمالي الربح/الخسارة: <b>${pnlSign}$${params.totalPnl.toFixed(2)}</b>
🏆 أفضل صفقة: <b>+$${params.bestTrade.toFixed(2)}</b>
📉 أسوأ صفقة: <b>-$${Math.abs(params.worstTrade).toFixed(2)}</b>
━━━━━━━━━━━━━━━━━━
💰 الرصيد الحالي: <b>$${params.balance.toFixed(2)}</b>`;

  await sendTelegramMessage(text);
}

export async function sendWeeklySummary(params: {
  weekStart: string;
  weekEnd: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  balance: number;
}): Promise<void> {
  const pnlEmoji = params.totalPnl >= 0 ? "✅" : "❌";
  const pnlSign = params.totalPnl >= 0 ? "+" : "";
  const text = `📊 <b>ملخص الأسبوع — HJ Capital</b>
📅 ${params.weekStart} → ${params.weekEnd}
━━━━━━━━━━━━━━━━━━
📈 إجمالي الصفقات: <b>${params.totalTrades}</b>
✅ صفقات رابحة: <b>${params.wins}</b>
❌ صفقات خاسرة: <b>${params.losses}</b>
🎯 نسبة النجاح الأسبوعية: <b>${params.winRate.toFixed(1)}%</b>
━━━━━━━━━━━━━━━━━━
${pnlEmoji} إجمالي الربح/الخسارة: <b>${pnlSign}$${params.totalPnl.toFixed(2)}</b>
🏆 أفضل صفقة: <b>+$${params.bestTrade.toFixed(2)}</b>
📉 أسوأ صفقة: <b>-$${Math.abs(params.worstTrade).toFixed(2)}</b>
━━━━━━━━━━━━━━━━━━
💰 الرصيد الحالي: <b>$${params.balance.toFixed(2)}</b>
🤖 الاستراتيجية: Trend Following + MTF Confirmation`;

  await sendTelegramMessage(text);
}
