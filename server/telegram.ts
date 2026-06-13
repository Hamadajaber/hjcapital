/**
 * Telegram notification helper for HJ Capital trade alerts
 */

const TELEGRAM_API = "https://api.telegram.org";

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return { token, chatId };
}

async function sendTelegramMessage(text: string): Promise<boolean> {
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

export async function notifyRiskAlert(message: string): Promise<void> {
  const text = `⚠️ <b>تنبيه إدارة المخاطر</b>
━━━━━━━━━━━━━━━━━━
${message}`;
  await sendTelegramMessage(text);
}
