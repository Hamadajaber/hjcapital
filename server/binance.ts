/**
 * Binance API Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles HMAC-SHA256 authentication and trading operations on Binance Futures.
 * Mirrors the structure of capitalcom.ts for consistency.
 */
import crypto from "crypto";

// ─── Configuration ────────────────────────────────────────────────────────────

const FUTURES_BASE_URL = "https://fapi.binance.com";
const TESTNET_BASE_URL = "https://testnet.binancefuture.com";

interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  useTestnet?: boolean;
}

let _credentials: BinanceCredentials | null = null;

/**
 * Initialize Binance credentials (called once at engine start or settings change)
 */
export function initBinanceCredentials(creds: BinanceCredentials): void {
  _credentials = creds;
}

/**
 * Get the active base URL based on testnet flag
 */
function getBaseUrl(): string {
  return _credentials?.useTestnet ? TESTNET_BASE_URL : FUTURES_BASE_URL;
}

// ─── HMAC-SHA256 Signature ───────────────────────────────────────────────────

function createSignature(queryString: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
}

function buildSignedParams(params: Record<string, string | number | boolean>): string {
  if (!_credentials) throw new Error("Binance credentials not initialized");
  const timestamp = Date.now();
  const allParams = { ...params, timestamp };
  const queryString = Object.entries(allParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const signature = createSignature(queryString, _credentials.apiSecret);
  return `${queryString}&signature=${signature}`;
}

// ─── Authenticated Request ───────────────────────────────────────────────────

async function binanceRequest<T>(
  path: string,
  options: RequestInit & { signed?: boolean; params?: Record<string, string | number | boolean> } = {}
): Promise<T> {
  if (!_credentials) throw new Error("Binance credentials not initialized");

  const { signed = false, params = {}, ...fetchOptions } = options;
  let url: string;

  if (signed) {
    const signedQuery = buildSignedParams(params);
    url = `${getBaseUrl()}${path}?${signedQuery}`;
  } else {
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    url = queryString ? `${getBaseUrl()}${path}?${queryString}` : `${getBaseUrl()}${path}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      "X-MBX-APIKEY": _credentials.apiKey,
      ...(fetchOptions.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    // Handle rate limiting
    if (response.status === 429 || response.status === 418) {
      throw new Error(`Binance rate limited: ${response.status} — ${text.slice(0, 200)}`);
    }
    throw new Error(`Binance API error: ${response.status} — ${text.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface BinanceBalance {
  balance: number;
  available: number;
  unrealizedPnl: number;
  currency: string;
}

export async function getAccountBalance(): Promise<BinanceBalance> {
  const data = await binanceRequest<Array<{
    asset: string;
    balance: string;
    availableBalance: string;
    crossUnPnl: string;
  }>>("/fapi/v2/balance", { method: "GET", signed: true, params: {} });

  // Find USDT balance (primary trading currency)
  const usdt = data.find((a) => a.asset === "USDT") ?? data[0];
  if (!usdt) throw new Error("No Binance USDT balance found");

  return {
    balance: parseFloat(usdt.balance),
    available: parseFloat(usdt.availableBalance),
    unrealizedPnl: parseFloat(usdt.crossUnPnl),
    currency: "USDT",
  };
}

// ─── Market Prices ────────────────────────────────────────────────────────────

export interface BinanceMarketPrice {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
  priceChangePercent: number;
}

export async function getMarketPrice(symbol: string): Promise<BinanceMarketPrice> {
  const data = await binanceRequest<{
    symbol: string;
    bidPrice: string;
    askPrice: string;
    lastPrice: string;
    priceChangePercent: string;
  }>("/fapi/v1/ticker/24hr", { params: { symbol } });

  const bid = parseFloat(data.bidPrice);
  const ask = parseFloat(data.askPrice);

  return {
    symbol: data.symbol,
    bid,
    ask,
    mid: parseFloat(((bid + ask) / 2).toFixed(8)),
    lastPrice: parseFloat(data.lastPrice),
    priceChangePercent: parseFloat(data.priceChangePercent),
  };
}

export async function getAllMarketPrices(): Promise<BinanceMarketPrice[]> {
  const data = await binanceRequest<Array<{
    symbol: string;
    bidPrice: string;
    askPrice: string;
    lastPrice: string;
    priceChangePercent: string;
  }>>("/fapi/v1/ticker/24hr");

  return data.map((d) => {
    const bid = parseFloat(d.bidPrice);
    const ask = parseFloat(d.askPrice);
    return {
      symbol: d.symbol,
      bid,
      ask,
      mid: parseFloat(((bid + ask) / 2).toFixed(8)),
      lastPrice: parseFloat(d.lastPrice),
      priceChangePercent: parseFloat(d.priceChangePercent),
    };
  });
}

// ─── Open Positions ──────────────────────────────────────────────────────────

export interface BinanceOpenPosition {
  symbol: string;
  positionSide: "LONG" | "SHORT" | "BOTH";
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  leverage: number;
}

export async function getOpenPositions(): Promise<BinanceOpenPosition[]> {
  const data = await binanceRequest<Array<{
    symbol: string;
    positionSide: "LONG" | "SHORT" | "BOTH";
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    leverage: string;
  }>>("/fapi/v2/positionRisk", { method: "GET", signed: true, params: {} });

  // Filter to only positions with non-zero amount
  return data
    .filter((p) => parseFloat(p.positionAmt) !== 0)
    .map((p) => ({
      symbol: p.symbol,
      positionSide: p.positionSide,
      positionAmt: parseFloat(p.positionAmt),
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      unrealizedProfit: parseFloat(p.unRealizedProfit),
      leverage: parseInt(p.leverage),
    }));
}

// ─── Connection Test ─────────────────────────────────────────────────────────

export async function testConnection(): Promise<{
  ok: boolean;
  accountType?: string;
  balance?: number;
  error?: string;
}> {
  try {
    const balance = await getAccountBalance();
    return { ok: true, accountType: "USDS-M Futures", balance: balance.balance };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Place Order ─────────────────────────────────────────────────────────────

export interface BinancePlaceOrderResult {
  orderId: number;
  clientOrderId: string;
  status: string;
  avgPrice: number;
  executedQty: number;
  symbol: string;
}

export async function placeOrder(params: {
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<BinancePlaceOrderResult> {
  // Place market order
  const orderParams: Record<string, string | number | boolean> = {
    symbol: params.symbol,
    side: params.direction,
    type: "MARKET",
    quantity: params.quantity,
  };

  const result = await binanceRequest<{
    orderId: number;
    clientOrderId: string;
    status: string;
    avgPrice: string;
    executedQty: string;
    symbol: string;
  }>("/fapi/v1/order", { method: "POST", signed: true, params: orderParams });

  // Place SL order if specified
  if (params.stopLoss && params.stopLoss > 0) {
    const slSide = params.direction === "BUY" ? "SELL" : "BUY";
    await binanceRequest("/fapi/v1/order", {
      method: "POST",
      signed: true,
      params: {
        symbol: params.symbol,
        side: slSide,
        type: "STOP_MARKET",
        stopPrice: params.stopLoss,
        closePosition: true,
        workingType: "MARK_PRICE",
      },
    }).catch((err) => {
      console.warn(`[Binance] Failed to place SL order for ${params.symbol}:`, err);
    });
  }

  // Place TP order if specified
  if (params.takeProfit && params.takeProfit > 0) {
    const tpSide = params.direction === "BUY" ? "SELL" : "BUY";
    await binanceRequest("/fapi/v1/order", {
      method: "POST",
      signed: true,
      params: {
        symbol: params.symbol,
        side: tpSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: params.takeProfit,
        closePosition: true,
        workingType: "MARK_PRICE",
      },
    }).catch((err) => {
      console.warn(`[Binance] Failed to place TP order for ${params.symbol}:`, err);
    });
  }

  return {
    orderId: result.orderId,
    clientOrderId: result.clientOrderId,
    status: result.status,
    avgPrice: parseFloat(result.avgPrice),
    executedQty: parseFloat(result.executedQty),
    symbol: result.symbol,
  };
}

// ─── Update Stop Loss (Trailing Stop) ────────────────────────────────────────

export async function updatePositionStopLoss(
  symbol: string,
  direction: "BUY" | "SELL",
  newStopPrice: number
): Promise<{ success: boolean; orderId?: number }> {
  try {
    // Cancel existing SL orders for this symbol
    await binanceRequest("/fapi/v1/allOpenOrders", {
      method: "DELETE",
      signed: true,
      params: { symbol },
    }).catch(() => {}); // Ignore if no orders to cancel

    // Place new SL order
    const slSide = direction === "BUY" ? "SELL" : "BUY";
    const result = await binanceRequest<{ orderId: number }>("/fapi/v1/order", {
      method: "POST",
      signed: true,
      params: {
        symbol,
        side: slSide,
        type: "STOP_MARKET",
        stopPrice: newStopPrice,
        closePosition: true,
        workingType: "MARK_PRICE",
      },
    });

    return { success: true, orderId: result.orderId };
  } catch (err) {
    console.warn(`[Binance] Failed to update stop loss for ${symbol}:`, err);
    return { success: false };
  }
}

// ─── Close Position ──────────────────────────────────────────────────────────

export async function closePosition(
  symbol: string,
  positionAmt: number
): Promise<{ status: string; pnl?: number; closeLevel?: number }> {
  // Determine close direction: if positionAmt > 0 (LONG), sell to close; if < 0 (SHORT), buy to close
  const closeSide = positionAmt > 0 ? "SELL" : "BUY";
  const closeQty = Math.abs(positionAmt);

  const result = await binanceRequest<{
    orderId: number;
    status: string;
    avgPrice: string;
    executedQty: string;
  }>("/fapi/v1/order", {
    method: "POST",
    signed: true,
    params: {
      symbol,
      side: closeSide,
      type: "MARKET",
      quantity: closeQty,
      reduceOnly: true,
    },
  });

  // Cancel any remaining SL/TP orders for this symbol
  await binanceRequest("/fapi/v1/allOpenOrders", {
    method: "DELETE",
    signed: true,
    params: { symbol },
  }).catch(() => {});

  return {
    status: result.status,
    closeLevel: parseFloat(result.avgPrice),
  };
}

// ─── Candles for Technical Analysis ──────────────────────────────────────────

export type BinanceCandleInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "6h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

export interface BinanceOHLCVCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export async function getCandles(
  symbol: string,
  interval: BinanceCandleInterval,
  limit = 100
): Promise<BinanceOHLCVCandle[]> {
  const data = await binanceRequest<Array<[
    number, string, string, string, string, string,
    number, string, number, string, string, string
  ]>>("/fapi/v1/klines", {
    params: { symbol, interval, limit },
  });

  return data.map((candle) => ({
    openTime: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
    closeTime: candle[6],
  }));
}

// ─── Exchange Info (Instrument Constraints) ──────────────────────────────────

export interface BinanceInstrumentInfo {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
}

let _exchangeInfoCache: Map<string, BinanceInstrumentInfo> | null = null;
let _exchangeInfoExpiry = 0;

export async function getExchangeInfo(): Promise<Map<string, BinanceInstrumentInfo>> {
  // Cache for 1 hour
  if (_exchangeInfoCache && Date.now() < _exchangeInfoExpiry) {
    return _exchangeInfoCache;
  }

  const data = await binanceRequest<{
    symbols: Array<{
      symbol: string;
      pricePrecision: number;
      quantityPrecision: number;
      filters: Array<{
        filterType: string;
        minQty?: string;
        maxQty?: string;
        stepSize?: string;
        tickSize?: string;
        notional?: string;
      }>;
    }>;
  }>("/fapi/v1/exchangeInfo");

  const map = new Map<string, BinanceInstrumentInfo>();

  for (const sym of data.symbols) {
    const lotFilter = sym.filters.find((f) => f.filterType === "LOT_SIZE");
    const priceFilter = sym.filters.find((f) => f.filterType === "PRICE_FILTER");
    const notionalFilter = sym.filters.find((f) => f.filterType === "MIN_NOTIONAL");

    map.set(sym.symbol, {
      symbol: sym.symbol,
      pricePrecision: sym.pricePrecision,
      quantityPrecision: sym.quantityPrecision,
      minQty: parseFloat(lotFilter?.minQty ?? "0.001"),
      maxQty: parseFloat(lotFilter?.maxQty ?? "1000"),
      stepSize: parseFloat(lotFilter?.stepSize ?? "0.001"),
      tickSize: parseFloat(priceFilter?.tickSize ?? "0.01"),
      minNotional: parseFloat(notionalFilter?.notional ?? "5"),
    });
  }

  _exchangeInfoCache = map;
  _exchangeInfoExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
  return map;
}

/**
 * Get minimum deal size for a symbol (respecting LOT_SIZE filter)
 */
export async function getMinDealSize(symbol: string): Promise<number> {
  const info = await getExchangeInfo();
  const sym = info.get(symbol);
  return sym?.minQty ?? 0.001;
}

/**
 * Adjust quantity to comply with Binance LOT_SIZE stepSize filter
 */
export async function adjustQuantity(symbol: string, rawQty: number): Promise<number> {
  const info = await getExchangeInfo();
  const sym = info.get(symbol);
  if (!sym) return rawQty;

  // Round down to nearest stepSize
  const steps = Math.floor(rawQty / sym.stepSize);
  const adjusted = steps * sym.stepSize;

  // Enforce min/max
  return Math.max(sym.minQty, Math.min(adjusted, sym.maxQty));
}

/**
 * Adjust price to comply with Binance PRICE_FILTER tickSize
 */
export async function adjustPrice(symbol: string, rawPrice: number): Promise<number> {
  const info = await getExchangeInfo();
  const sym = info.get(symbol);
  if (!sym) return rawPrice;

  const ticks = Math.round(rawPrice / sym.tickSize);
  return parseFloat((ticks * sym.tickSize).toFixed(sym.pricePrecision));
}

// ─── Instrument Mapping ──────────────────────────────────────────────────────
// Maps internal HJCapital instrument names → Binance Futures symbols
// Only crypto pairs are available on Binance Futures

export const BINANCE_INSTRUMENT_MAP: Record<string, string> = {
  // Crypto (available on Binance Futures)
  ETHUSD: "ETHUSDT",
  XRPUSD: "XRPUSDT",
  LTCUSD: "LTCUSDT",
  ADAUSD: "ADAUSDT",
  SOLUSD: "SOLUSDT",
  BTC: "BTCUSDT",
  // Additional crypto pairs for Binance-specific trading
  BTCUSD: "BTCUSDT",
  DOGEUSD: "DOGEUSDT",
  AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT",
  MATICUSD: "MATICUSDT",
  DOTUSD: "DOTUSDT",
  UNIUSD: "UNIUSDT",
  BNBUSD: "BNBUSDT",
};

// Reverse map: Binance symbol → HJCapital internal name
export const BINANCE_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BINANCE_INSTRUMENT_MAP).map(([k, v]) => [v, k])
);

/**
 * Convert internal instrument name to Binance symbol
 */
export function toBinanceSymbol(instrument: string): string | null {
  return BINANCE_INSTRUMENT_MAP[instrument] ?? null;
}

/**
 * Convert Binance symbol to internal instrument name
 */
export function fromBinanceSymbol(symbol: string): string {
  return BINANCE_REVERSE_MAP[symbol] ?? symbol;
}

/**
 * Get all instruments that are tradeable on Binance
 */
export function getBinanceTradeableInstruments(instruments: string[]): string[] {
  return instruments.filter((inst) => BINANCE_INSTRUMENT_MAP[inst] !== undefined);
}

// ─── Market Hours (Crypto = 24/7) ───────────────────────────────────────────

/**
 * Binance crypto markets are open 24/7/365.
 * This function always returns true for supported instruments.
 */
export function isMarketOpen(instrument: string): boolean {
  return toBinanceSymbol(instrument) !== null;
}

/**
 * All Binance instruments are always open
 */
export function getOpenMarkets(instruments: string[]): string[] {
  return instruments.filter((inst) => toBinanceSymbol(instrument) !== null);
}

export function isAnyMarketOpen(instruments: string[]): boolean {
  return instruments.some((inst) => toBinanceSymbol(inst) !== null);
}

// ─── Activity / Trade History ────────────────────────────────────────────────

export interface BinanceTradeRecord {
  symbol: string;
  id: number;
  orderId: number;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  realizedPnl: number;
  time: number;
  commission: number;
}

export async function getTradeHistory(
  symbol?: string,
  limit = 50
): Promise<BinanceTradeRecord[]> {
  const params: Record<string, string | number | boolean> = { limit };
  if (symbol) params.symbol = symbol;

  const data = await binanceRequest<Array<{
    symbol: string;
    id: number;
    orderId: number;
    side: "BUY" | "SELL";
    price: string;
    qty: string;
    realizedPnl: string;
    time: number;
    commission: string;
  }>>("/fapi/v1/userTrades", { method: "GET", signed: true, params });

  return data.map((t) => ({
    symbol: t.symbol,
    id: t.id,
    orderId: t.orderId,
    side: t.side,
    price: parseFloat(t.price),
    qty: parseFloat(t.qty),
    realizedPnl: parseFloat(t.realizedPnl),
    time: t.time,
    commission: parseFloat(t.commission),
  }));
}
