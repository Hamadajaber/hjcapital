/**
 * HJ Capital — Capital.com WebSocket Streaming
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces polling-based price fetching with real-time WebSocket price feeds.
 * Capital.com Streaming API uses LIGHTSTREAMER protocol over WebSocket.
 *
 * Architecture:
 * - Connects once per session, subscribes to OHLC + quote streams
 * - Emits price updates via EventEmitter
 * - Auto-reconnects on disconnect
 * - Falls back to REST polling if WebSocket is unavailable
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { getSessionTokens } from "./capitalcom";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LivePrice {
  epic: string;
  bid: number;
  ask: number;
  mid: number;
  timestamp: number;
  source: "websocket" | "polling";
}

export interface WSConnectionState {
  connected: boolean;
  subscribedEpics: string[];
  lastMessageAt: number | null;
  reconnectCount: number;
}

// ─── Price Cache (shared with polling fallback) ───────────────────────────────

const _priceCache: Map<string, LivePrice> = new Map();
const _priceEmitter = new EventEmitter();
let _wsState: WSConnectionState = {
  connected: false,
  subscribedEpics: [],
  lastMessageAt: null,
  reconnectCount: 0,
};

// WebSocket connection reference
let _ws: any = null; // Using 'any' to avoid ws package type requirement
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _isConnecting = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the latest cached price for an instrument.
 * Returns null if no price is available yet.
 */
export function getCachedPrice(epic: string): LivePrice | null {
  return _priceCache.get(epic) ?? null;
}

/**
 * Get all cached prices.
 */
export function getAllCachedPrices(): LivePrice[] {
  return Array.from(_priceCache.values());
}

/**
 * Subscribe to live price updates for specific epics.
 * Callback is called whenever a new price arrives.
 */
export function onPriceUpdate(epic: string, callback: (price: LivePrice) => void): () => void {
  const handler = (price: LivePrice) => {
    if (price.epic === epic) callback(price);
  };
  _priceEmitter.on("price", handler);
  return () => _priceEmitter.off("price", handler);
}

/**
 * Get current WebSocket connection state.
 */
export function getWSState(): WSConnectionState {
  return { ..._wsState };
}

/**
 * Start WebSocket streaming for the given epics.
 * Automatically falls back to polling if WebSocket fails.
 */
export async function startPriceStreaming(epics: string[]): Promise<void> {
  if (_isConnecting) return;
  _isConnecting = true;

  try {
    await connectWebSocket(epics);
  } catch (err) {
    console.warn("[WS] WebSocket connection failed, falling back to polling:", err);
    _isConnecting = false;
    startPollingFallback(epics);
  }
}

/**
 * Stop WebSocket streaming.
 */
export function stopPriceStreaming(): void {
  if (_ws) {
    try { _ws.close(); } catch { /* ignore */ }
    _ws = null;
  }
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _wsState.connected = false;
  _wsState.subscribedEpics = [];
  _isConnecting = false;
  console.log("[WS] Price streaming stopped");
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

async function connectWebSocket(epics: string[]): Promise<void> {
  // Capital.com uses Lightstreamer over WebSocket
  // The streaming endpoint requires CST + X-SECURITY-TOKEN headers
  const tokens = await getSessionTokens();

  const streamingUrl = "wss://api-streaming-capital.backend-capital.com/connect";

  _ws = new WebSocket(streamingUrl, {
    headers: {
      "CST": tokens.cst,
      "X-SECURITY-TOKEN": tokens.securityToken,
    },
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket connection timeout (10s)"));
    }, 10000);

    _ws.on("open", () => {
      clearTimeout(timeout);
      _wsState.connected = true;
      _wsState.subscribedEpics = epics;
      _wsState.reconnectCount++;
      _isConnecting = false;
      console.log(`[WS] Connected to Capital.com streaming. Subscribing to ${epics.length} epics...`);

      // Subscribe to price quotes for each epic
      for (const epic of epics) {
        const subscribeMsg = JSON.stringify({
          destination: "marketData.subscribe",
          correlationId: `sub-${epic}`,
          cst: tokens.cst,
          securityToken: tokens.securityToken,
          payload: {
            epics: [epic],
          },
        });
        _ws.send(subscribeMsg);
      }

      resolve();
    });

    _ws.on("message", (data: Buffer | string) => {
      _wsState.lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(data.toString());
        handleStreamMessage(msg);
      } catch { /* ignore malformed messages */ }
    });

    _ws.on("error", (err: Error) => {
      clearTimeout(timeout);
      console.warn("[WS] WebSocket error:", err.message);
      _wsState.connected = false;
      _isConnecting = false;
      reject(err);
    });

    _ws.on("close", (code: number, reason: Buffer) => {
      _wsState.connected = false;
      _isConnecting = false;
      console.log(`[WS] Connection closed (${code}): ${reason.toString()}`);

      // Auto-reconnect after 5 seconds
      if (_wsState.subscribedEpics.length > 0) {
        _reconnectTimer = setTimeout(() => {
          console.log("[WS] Attempting reconnect...");
          startPriceStreaming(_wsState.subscribedEpics).catch(console.warn);
        }, 5000);
      }
    });
  });
}

function handleStreamMessage(msg: any): void {
  // Capital.com streaming message format
  // Handles: OFM.QUOTE, OFM.OHLC, HEARTBEAT
  if (!msg || !msg.destination) return;

  if (msg.destination === "quote" || msg.destination === "marketData.quote") {
    const payload = msg.payload ?? msg;
    const epic = payload.epic ?? payload.instrumentName;
    if (!epic) return;

    const bid = parseFloat(payload.bid ?? payload.offerPrice ?? 0);
    const ask = parseFloat(payload.ask ?? payload.bidPrice ?? 0);

    if (isNaN(bid) || isNaN(ask) || bid === 0) return;

    const price: LivePrice = {
      epic,
      bid,
      ask,
      mid: (bid + ask) / 2,
      timestamp: Date.now(),
      source: "websocket",
    };

    _priceCache.set(epic, price);
    _priceEmitter.emit("price", price);
  }
}

// ─── Polling Fallback ─────────────────────────────────────────────────────────

let _pollingInterval: ReturnType<typeof setInterval> | null = null;

function startPollingFallback(epics: string[]): void {
  if (_pollingInterval) return;

  console.log(`[WS] Starting polling fallback for ${epics.length} epics (every 30s)`);

  const poll = async () => {
    try {
      const { getAllMarketPrices } = await import("./capitalcom");
      const prices = await getAllMarketPrices();

      for (const p of prices) {
        if (!epics.includes(p.epic)) continue;
        const price: LivePrice = {
          epic: p.epic,
          bid: p.bid,
          ask: p.ask,
          mid: (p.bid + p.ask) / 2,
          timestamp: Date.now(),
          source: "polling",
        };
        _priceCache.set(p.epic, price);
        _priceEmitter.emit("price", price);
      }
    } catch (err) {
      console.warn("[WS] Polling fallback error:", err);
    }
  };

  // Poll immediately, then every 30 seconds
  poll().catch(console.warn);
  _pollingInterval = setInterval(poll, 30 * 1000);
}

export function stopPollingFallback(): void {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
}
