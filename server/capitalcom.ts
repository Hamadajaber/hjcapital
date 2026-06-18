/**
 * Capital.com API Service
 * Handles authentication and live market data fetching from Capital.com
 */
import { ENV } from "./_core/env";

const BASE_URL = "https://api-capital.backend-capital.com";

interface CapitalSession {
  cst: string;
  securityToken: string;
  expiresAt: number;
}

let _session: CapitalSession | null = null;

/**
 * Create or refresh a Capital.com session
 */
async function getSession(): Promise<CapitalSession> {
  // Return cached session if still valid (5 min buffer)
  if (_session && _session.expiresAt > Date.now() + 5 * 60 * 1000) {
    return _session;
  }

  const response = await fetch(`${BASE_URL}/api/v1/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CAP-API-KEY": ENV.capitalApiKey,
    },
    body: JSON.stringify({
      identifier: ENV.capitalEmail,
      password: ENV.capitalPassword,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Capital.com auth failed: ${response.status} — ${text}`);
  }

  const cst = response.headers.get("CST") ?? "";
  const securityToken = response.headers.get("X-SECURITY-TOKEN") ?? "";

  _session = {
    cst,
    securityToken,
    // Sessions last 10 minutes by default
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return _session;
}

/**
 * Make an authenticated request to Capital.com API
 */
async function capitalRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const session = await getSession();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "CST": session.cst,
      "X-SECURITY-TOKEN": session.securityToken,
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 401) {
    // Session expired — clear and retry once
    _session = null;
    const newSession = await getSession();
    const retry = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "CST": newSession.cst,
        "X-SECURITY-TOKEN": newSession.securityToken,
        ...(options.headers ?? {}),
      },
    });
    if (!retry.ok) {
      throw new Error(`Capital.com API error: ${retry.status}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Capital.com API error: ${response.status} — ${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Export session tokens for use in other modules (e.g., client sentiment)
 */
export async function getSessionTokens(): Promise<{ cst: string; securityToken: string }> {
  const session = await getSession();
  return { cst: session.cst, securityToken: session.securityToken };
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface CapitalAccount {
  accountId: string;
  accountName: string;
  balance: {
    balance: number;
    deposit: number;
    profitLoss: number;
    available: number;
  };
  currency: string;
  status: string;
  preferred: boolean;
  accountType: string;
}

export async function getAccounts(): Promise<CapitalAccount[]> {
  const data = await capitalRequest<{ accounts: CapitalAccount[] }>("/api/v1/accounts");
  return data.accounts ?? [];
}

export async function getAccountBalance(): Promise<{
  balance: number;
  available: number;
  profitLoss: number;
  currency: string;
}> {
  const accounts = await getAccounts();
  const preferred = accounts.find((a) => a.preferred) ?? accounts[0];
  if (!preferred) throw new Error("No Capital.com account found");
  return {
    balance: preferred.balance.balance,
    available: preferred.balance.available,
    profitLoss: preferred.balance.profitLoss,
    currency: preferred.currency,
  };
}

// ─── Market Prices ────────────────────────────────────────────────────────────

export interface MarketPrice {
  epic: string;
  bid: number;
  ask: number;
  mid: number;
  netChange: number;
  pctChange: number;
  updateTime: string;
}

// Mapping from our instrument names to Capital.com epics
export const INSTRUMENT_EPICS: Record<string, string> = {
  // ─── Core instruments (always scanned every cycle) ───────────────────────
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  EURGBP: "EURGBP",
  GOLD: "GOLD",
  XAGUSD: "SILVER",
  OIL_CRUDE: "OIL_CRUDE",
  US500: "US500",
  GER40: "DE40",   // Capital.com uses DE40 for DAX 40 (Germany 40 index)
  NASDAQ: "US100",

  // ─── Rotating universe: Major Forex ──────────────────────────────────────
  AUDUSD: "AUDUSD",
  USDCAD: "USDCAD",
  USDCHF: "USDCHF",
  NZDUSD: "NZDUSD",
  EURJPY: "EURJPY",
  GBPJPY: "GBPJPY",
  AUDJPY: "AUDJPY",
  EURAUD: "EURAUD",
  EURCAD: "EURCAD",
  EURCHF: "EURCHF",
  GBPAUD: "GBPAUD",
  GBPCAD: "GBPCAD",
  GBPCHF: "GBPCHF",
  CADJPY: "CADJPY",
  CHFJPY: "CHFJPY",
  AUDCAD: "AUDCAD",
  AUDCHF: "AUDCHF",
  NZDJPY: "NZDJPY",
  NZDCAD: "NZDCAD",
  NZDCHF: "NZDCHF",

  // ─── Rotating universe: Global Indices ───────────────────────────────────
  US30: "US30",
  UK100: "UK100",
  FRA40: "FRA40",
  AUS200: "AUS200",
  JPN225: "JPN225",
  HK50: "HK50",
  SPAIN35: "SPAIN35",
  SWISS20: "SWISS20",
  NETH25: "NETH25",
  SING30: "SING30",

  // ─── Rotating universe: Additional Commodities ───────────────────────────
  NGAS: "NGAS",
  COPPER: "COPPER",
  PLATINUM: "PLATINUM",
  PALLADIUM: "PALLADIUM",
  WHEAT: "WHEAT",
  CORN: "CORN",
  SUGAR: "SUGAR",
  COFFEE: "COFFEE",
  COCOA: "COCOA",
  COTTON: "COTTON",

  // ─── Rotating universe: US Tech Stocks ───────────────────────────────────
  AAPL: "AAPL",
  MSFT: "MSFT",
  NVDA: "NVDA",
  AMZN: "AMZN",
  GOOGL: "GOOGL",
  META: "META",
  TSLA: "TSLA",
  NFLX: "NFLX",
  AMD: "AMD",
  INTC: "INTC",

  // ─── Rotating universe: Crypto ────────────────────────────────────────────
  ETHUSD: "ETHUSD",
  XRPUSD: "XRPUSD",
  LTCUSD: "LTCUSD",
  ADAUSD: "ADAUSD",
  SOLUSD: "SOLUSD",

  // Additional global indices (emerging markets)
  POLAND20: "POLAND20",
  TURKEY30: "TURKEY30",
  INDIA50: "INDIA50",
  BRAZIL60: "BRAZIL60",
  CHINA50: "CHINA50",

  // Legacy (kept for backward compat)
  BTC: "BITCOIN",
};

export async function getMarketPrice(epic: string): Promise<MarketPrice> {
  const data = await capitalRequest<{
    snapshot: {
      bid: number;
      offer: number;
      netChange: number;
      percentageChange: number;
      updateTime: string;
    };
  }>(`/api/v1/markets/${epic}`);

  const snap = data.snapshot;
  const bid = snap.bid ?? 0;
  const ask = snap.offer ?? 0;

  return {
    epic,
    bid,
    ask,
    mid: (bid + ask) / 2,
    netChange: snap.netChange ?? 0,
    pctChange: snap.percentageChange ?? 0,
    updateTime: snap.updateTime ?? new Date().toISOString(),
  };
}

/**
 * Check if a market is currently tradeable by fetching live market details from Capital.com.
 * Returns true if the market is open and dealing is enabled.
 * Falls back to the hardcoded schedule check if the API call fails.
 */
export async function checkMarketTradeable(epic: string): Promise<boolean> {
  try {
    const data = await capitalRequest<{
      snapshot: {
        bid: number;
        offer: number;
        marketStatus: string; // e.g. "TRADEABLE", "CLOSED", "OFFLINE"
      };
      dealingRules?: {
        minDealSize?: { value: number };
      };
    }>(`/api/v1/markets/${epic}`);
    const status = data.snapshot?.marketStatus ?? "";
    return status === "TRADEABLE";
  } catch {
    // Fallback to hardcoded schedule
    const friendlyName = Object.entries(INSTRUMENT_EPICS).find(([, e]) => e === epic)?.[0] ?? epic;
    return isMarketOpen(friendlyName);
  }
}

/**
 * Fetch the minimum deal size for an instrument from Capital.com.
 * Returns the minimum size, or a safe default if the API call fails.
 */
export async function getMinDealSize(epic: string): Promise<number> {
  // Known minimums as fallback (Capital.com standard)
  const KNOWN_MINIMUMS: Record<string, number> = {
    EURUSD: 1000,
    GBPUSD: 1000,
    GOLD: 1,
    US500: 1,
    BITCOIN: 0.01,
  };

  try {
    const data = await capitalRequest<{
      dealingRules?: {
        minDealSize?: { value: number };
      };
    }>(`/api/v1/markets/${epic}`);
    const min = data.dealingRules?.minDealSize?.value;
    if (min && min > 0) return min;
  } catch { /* use fallback */ }

  // Fallback: look up by epic or friendly name
  const friendlyName = Object.entries(INSTRUMENT_EPICS).find(([, e]) => e === epic)?.[0] ?? epic;
  return KNOWN_MINIMUMS[friendlyName] ?? KNOWN_MINIMUMS[epic] ?? 1;
}

export async function getAllMarketPrices(): Promise<MarketPrice[]> {
  const results = await Promise.allSettled(
    Object.entries(INSTRUMENT_EPICS).map(async ([name, epic]) => {
      const price = await getMarketPrice(epic);
      return { ...price, epic: name }; // use friendly name
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<MarketPrice> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ─── Historical Prices (for charts) ──────────────────────────────────────────

export interface PriceCandle {
  snapshotTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function getPriceHistory(
  epic: string,
  resolution: "MINUTE" | "HOUR" | "DAY" = "HOUR",
  max = 24
): Promise<PriceCandle[]> {
  const data = await capitalRequest<{
    prices: Array<{
      snapshotTime: string;
      openPrice: { bid: number; ask: number };
      highPrice: { bid: number; ask: number };
      lowPrice: { bid: number; ask: number };
      closePrice: { bid: number; ask: number };
    }>;
  }>(`/api/v1/prices/${epic}?resolution=${resolution}&max=${max}`);

  return (data.prices ?? []).map((p) => ({
    snapshotTime: p.snapshotTime,
    open: (p.openPrice.bid + p.openPrice.ask) / 2,
    high: (p.highPrice.bid + p.highPrice.ask) / 2,
    low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
    close: (p.closePrice.bid + p.closePrice.ask) / 2,
  }));
}

// ─── Open Positions ───────────────────────────────────────────────────────────

export interface OpenPosition {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  openLevel: number;
  currentLevel: number;
  profitLoss: number;
  currency: string;
  createdDate: string;
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const data = await capitalRequest<{
    positions: Array<{
      position: {
        dealId: string;
        direction: "BUY" | "SELL";
        size: number;
        openLevel: number;
        currency: string;
        createdDateUTC: string;
      };
      market: {
        epic: string;
        bid: number;
        offer: number;
      };
    }>;
  }>("/api/v1/positions");

  return (data.positions ?? []).map((p) => {
    // Round all prices to 5 decimal places to prevent floating point artifacts like 1.4100000000000001
    const rawCurrentLevel = (p.market.bid + p.market.offer) / 2;
    const currentLevel = parseFloat(rawCurrentLevel.toFixed(5));

    // Safely handle missing/null openLevel from broker (Capital.com sometimes returns null)
    const rawOpenLevel = p.position.openLevel;
    const openLevel = (rawOpenLevel && !isNaN(rawOpenLevel) && rawOpenLevel > 0)
      ? parseFloat(rawOpenLevel.toFixed(5))
      : currentLevel; // fallback to current price — better than 0 or NaN

    const pnl =
      p.position.direction === "BUY"
        ? (currentLevel - openLevel) * p.position.size
        : (openLevel - currentLevel) * p.position.size;

    return {
      dealId: p.position.dealId,
      epic: p.market.epic,
      direction: p.position.direction,
      size: p.position.size,
      openLevel,
      currentLevel,
      profitLoss: parseFloat(pnl.toFixed(2)),
      currency: p.position.currency,
      createdDate: p.position.createdDateUTC,
    };
  });
}

// ─── Connection Test ──────────────────────────────────────────────────────────

export async function testConnection(): Promise<{
  ok: boolean;
  accountName?: string;
  balance?: number;
  error?: string;
}> {
  try {
    const accounts = await getAccounts();
    const preferred = accounts.find((a) => a.preferred) ?? accounts[0];
    return {
      ok: true,
      accountName: preferred?.accountName,
      balance: preferred?.balance.balance,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Place Order ──────────────────────────────────────────────────────────────

export interface PlaceOrderResult {
  dealId: string;
  dealReference: string;
  status: string;
  level: number;
}

export async function placeOrder(params: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<PlaceOrderResult> {
  const body: Record<string, unknown> = {
    epic: params.epic,
    direction: params.direction,
    size: params.size,
    orderType: "MARKET",
    guaranteedStop: false,
    forceOpen: true,
  };

  if (params.stopLoss) body.stopLevel = params.stopLoss;
  if (params.takeProfit) body.profitLevel = params.takeProfit;

  const data = await capitalRequest<{
    dealReference: string;
  }>("/api/v1/positions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  // Confirm the deal
  const confirm = await capitalRequest<{
    dealId: string;
    dealReference: string;
    status: string;
    level: number;
  }>(`/api/v1/confirms/${data.dealReference}`);

  return {
    dealId: confirm.dealId,
    dealReference: confirm.dealReference,
    status: confirm.status,
    level: confirm.level,
  };
}

// ─── Update Position Stop Loss (Trailing Stop) ──────────────────────────────

/**
 * Update the stop loss level of an open position on Capital.com.
 * Used by the trailing stop logic to protect profits.
 * Capital.com API: PUT /api/v1/positions/{dealId}
 */
export async function updatePositionStopLoss(
  dealId: string,
  newStopLevel: number
): Promise<{ success: boolean; status?: string }> {
  try {
    const data = await capitalRequest<{ dealReference: string }>(
      `/api/v1/positions/${dealId}`,
      {
        method: "PUT",
        body: JSON.stringify({ stopLevel: newStopLevel }),
      }
    );

    // Confirm the update
    const confirm = await capitalRequest<{ status: string }>(
      `/api/v1/confirms/${data.dealReference}`
    );

    return { success: true, status: confirm.status };
  } catch (err) {
    console.warn(`[Capital.com] Failed to update stop loss for ${dealId}:`, err);
    return { success: false };
  }
}

// ─── Close Position ───────────────────────────────────────────────────────────

export async function closePosition(dealId: string): Promise<{ status: string; pnl?: number; closeLevel?: number }> {
  const data = await capitalRequest<{
    dealReference: string;
  }>(`/api/v1/positions/${dealId}`, {
    method: "DELETE",
  });

  try {
    const confirm = await capitalRequest<{
      status: string;
      profit: number;
      level?: number; // broker-confirmed close/fill level
    }>(`/api/v1/confirms/${data.dealReference}`);

    return { status: confirm.status, pnl: confirm.profit, closeLevel: confirm.level };
  } catch {
    return { status: "CLOSED" };
  }
}

// ─── Candles for Technical Analysis ─────────────────────────────────────────

export type CandleResolution =
  | "MINUTE"
  | "MINUTE_5"
  | "MINUTE_15"
  | "MINUTE_30"
  | "HOUR"
  | "HOUR_4"
  | "DAY"
  | "WEEK";

export interface OHLCVCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch OHLCV candles for a given epic and resolution.
 * Used for multi-timeframe technical analysis.
 * @param epic - Capital.com instrument epic (e.g. "EURUSD", "GOLD")
 * @param resolution - Candle resolution (e.g. "MINUTE_5", "HOUR", "HOUR_4")
 * @param max - Number of candles to fetch (max 1000)
 */
export async function getCandles(
  epic: string,
  resolution: CandleResolution = "HOUR",
  max = 50
): Promise<OHLCVCandle[]> {
  try {
    const data = await capitalRequest<{
      prices: Array<{
        snapshotTime: string;
        openPrice: { bid: number; ask: number };
        highPrice: { bid: number; ask: number };
        lowPrice: { bid: number; ask: number };
        closePrice: { bid: number; ask: number };
        lastTradedVolume?: number;
      }>;
    }>(`/api/v1/prices/${epic}?resolution=${resolution}&max=${max}`);

    return (data.prices ?? []).map((p) => ({
      timestamp: p.snapshotTime,
      open: (p.openPrice.bid + p.openPrice.ask) / 2,
      high: (p.highPrice.bid + p.highPrice.ask) / 2,
      low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
      close: (p.closePrice.bid + p.closePrice.ask) / 2,
      volume: p.lastTradedVolume ?? 0,
    }));
  } catch (err) {
    console.warn(`[getCandles] Failed to fetch ${resolution} candles for ${epic}:`, err);
    return [];
  }
}

// ─── Activity History ───────────────────────────────────────────────────────

export interface ActivityRecord {
  date: string;
  epic: string;
  dealId: string;
  dealReference: string;
  action: string; // "POSITION_OPENED" | "POSITION_CLOSED" | "WORKING_ORDER_CREATED" etc.
  status: string;
  size: number;
  level: number;
  profit?: number;
  currency: string;
  channel: string;
}

export async function getActivityHistory(from?: string, to?: string, maxResults = 50): Promise<ActivityRecord[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("pageSize", String(maxResults));
  const data = await capitalRequest<{
    activities: Array<{
      date: string;
      epic: string;
      dealId: string;
      dealReference: string;
      action: string;
      status: string;
      details?: {
        size?: number;
        level?: number;
        currency?: string;
        channel?: string;
      };
    }>;
  }>(`/api/v1/history/activity?${params.toString()}`);
  return (data.activities ?? []).map((a) => ({
    date: a.date,
    epic: a.epic,
    dealId: a.dealId,
    dealReference: a.dealReference,
    action: a.action,
    status: a.status,
    size: a.details?.size ?? 0,
    level: a.details?.level ?? 0,
    currency: a.details?.currency ?? "USD",
    channel: a.details?.channel ?? "API",
  }));
}

// ─── Transaction History ──────────────────────────────────────────────────────

export interface TransactionRecord {
  date: string;
  type: string; // "TRADE" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" etc.
  reference: string;
  openLevel?: number;
  closeLevel?: number;
  size?: number;
  currency: string;
  profitAndLoss: string; // e.g. "USD 1.23"
  cashTransaction: boolean;
  instrumentName: string;
}

export async function getTransactionHistory(from?: string, to?: string, maxResults = 50): Promise<TransactionRecord[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("pageSize", String(maxResults));
  const data = await capitalRequest<{
    transactions: Array<{
      date: string;
      type: string;
      reference: string;
      openLevel?: string;
      closeLevel?: string;
      size?: string;
      currency: string;
      profitAndLoss: string;
      cashTransaction: boolean;
      instrumentName: string;
    }>;
  }>(`/api/v1/history/transactions?${params.toString()}`);
  return (data.transactions ?? []).map((t) => ({
    date: t.date,
    type: t.type,
    reference: t.reference,
    openLevel: t.openLevel ? parseFloat(t.openLevel) : undefined,
    closeLevel: t.closeLevel ? parseFloat(t.closeLevel) : undefined,
    size: t.size ? parseFloat(t.size) : undefined,
    currency: t.currency,
    profitAndLoss: t.profitAndLoss,
    cashTransaction: t.cashTransaction,
    instrumentName: t.instrumentName,
  }));
}

// ─── Working Orders ───────────────────────────────────────────────────────────

export interface WorkingOrder {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  level: number; // trigger level
  orderType: string; // "LIMIT" | "STOP"
  stopLevel?: number;
  profitLevel?: number;
  currency: string;
  createdDate: string;
  marketStatus: string;
}

export async function getWorkingOrders(): Promise<WorkingOrder[]> {
  const data = await capitalRequest<{
    workingOrders: Array<{
      workingOrderData: {
        dealId: string;
        direction: "BUY" | "SELL";
        size: number;
        level: number;
        orderType: string;
        stopLevel?: number;
        profitLevel?: number;
        currency: string;
        createdDateUTC: string;
      };
      marketData: {
        epic: string;
        marketStatus: string;
      };
    }>;
  }>("/api/v1/workingorders");
  return (data.workingOrders ?? []).map((w) => ({
    dealId: w.workingOrderData.dealId,
    epic: w.marketData.epic,
    direction: w.workingOrderData.direction,
    size: w.workingOrderData.size,
    level: w.workingOrderData.level,
    orderType: w.workingOrderData.orderType,
    stopLevel: w.workingOrderData.stopLevel,
    profitLevel: w.workingOrderData.profitLevel,
    currency: w.workingOrderData.currency,
    createdDate: w.workingOrderData.createdDateUTC,
    marketStatus: w.marketData.marketStatus,
  }));
}

// ─── Client Sentiment ─────────────────────────────────────────────────────────

export interface ClientSentiment {
  marketId: string;
  longPositionPercentage: number;
  shortPositionPercentage: number;
}

export async function getClientSentiment(marketIds: string[]): Promise<ClientSentiment[]> {
  const ids = marketIds.join(",");
  const data = await capitalRequest<{
    clientSentiments: Array<{
      marketId: string;
      longPositionPercentage: number;
      shortPositionPercentage: number;
    }>;
  }>(`/api/v1/clientsentiment?marketIds=${ids}`);
  return data.clientSentiments ?? [];
}

// ─── Account Preferences ─────────────────────────────────────────────────────

export interface AccountPreferences {
  leverages: Record<string, number>;
  hedgingMode: boolean;
  trailingStopsEnabled: boolean;
}

export async function getAccountPreferences(): Promise<AccountPreferences> {
  const data = await capitalRequest<{
    leverages: Record<string, number>;
    hedgingMode: boolean;
    trailingStopsEnabled: boolean;
  }>("/api/v1/accounts/preferences");
  return {
    leverages: data.leverages ?? {},
    hedgingMode: data.hedgingMode ?? false,
    trailingStopsEnabled: data.trailingStopsEnabled ?? false,
  };
}

// ─── Market Search ────────────────────────────────────────────────────────────

export interface MarketSearchResult {
  epic: string;
  instrumentName: string;
  instrumentType: string;
  expiry: string;
  high: number;
  low: number;
  percentageChange: number;
  netChange: number;
  bid: number;
  offer: number;
  updateTime: string;
  marketStatus: string;
  scalingFactor: number;
}

export async function searchMarkets(searchTerm: string): Promise<MarketSearchResult[]> {
  const data = await capitalRequest<{
    markets: Array<{
      epic: string;
      instrumentName: string;
      instrumentType: string;
      expiry: string;
      high: number;
      low: number;
      percentageChange: number;
      netChange: number;
      bid: number;
      offer: number;
      updateTime: string;
      marketStatus: string;
      scalingFactor: number;
    }>;
  }>(`/api/v1/markets?searchTerm=${encodeURIComponent(searchTerm)}`);
  return data.markets ?? [];
}

// ─── Watchlists ───────────────────────────────────────────────────────────────

export interface Watchlist {
  id: string;
  name: string;
  editable: boolean;
  deleteable: boolean;
  defaultSystemWatchlist: boolean;
}

export interface WatchlistDetail {
  id: string;
  name: string;
  markets: MarketSearchResult[];
}

export async function getWatchlists(): Promise<Watchlist[]> {
  const data = await capitalRequest<{ watchlists: Watchlist[] }>("/api/v1/watchlists");
  return data.watchlists ?? [];
}

export async function getWatchlistDetail(watchlistId: string): Promise<WatchlistDetail> {
  const data = await capitalRequest<{
    id: string;
    name: string;
    markets: MarketSearchResult[];
  }>(`/api/v1/watchlists/${watchlistId}`);
  return data;
}

// ─── Market Hours Check ─────────────────────────────────────────────────────────

/**
 * Check if a given instrument is currently tradeable based on its known schedule.
 * All times are in UTC. Returns true if the market is open right now.
 *
 * Schedules (UTC):
 *   EURUSD / GBPUSD  — Forex: Mon 00:00 – Fri 22:00 (24h weekdays)
 *   GOLD             — Mon 22:00 – Fri 17:00 (with 1h daily break 20:59-22:00)
 *   US500            — Mon 21:05 – Fri 21:00 (with 5-min break 21:00-21:05)
 *   BITCOIN          — 24/7 (always open)
 */
export function isMarketOpen(instrument: string): boolean {
  /**
   * Precise trading hours sourced directly from Capital.com (Jun 2026).
   * All times are UTC. day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
   */
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const t = hour * 60 + minute; // minutes since midnight UTC

  const epic = (INSTRUMENT_EPICS[instrument] ?? instrument).toUpperCase();

  // ── Saturday: ALL markets closed ──────────────────────────────────────────
  if (day === 6) return false;

  // ── Crypto: 24/7 ──────────────────────────────────────────────────────────
  if (
    epic === "ETHUSD" || epic === "BITCOIN" || epic === "XRPUSD" ||
    epic === "LTCUSD" || epic === "ADAUSD" || epic === "SOLUSD"
  ) {
    return true;
  }

  // ── Forex: EURUSD, GBPUSD, USDJPY, EURGBP, AUDUSD ────────────────────────
  // Mon-Thu: 00:00-20:59, 21:05-24:00 | Fri: 00:00-20:59 | Sun: 21:00-24:00
  // Daily break: 21:00-21:05 UTC
  if (
    epic === "EURUSD" || epic === "GBPUSD" || epic === "USDJPY" ||
    epic === "EURGBP" || epic === "AUDUSD"
  ) {
    if (day === 0) return t >= 21 * 60;                      // Sun: open from 21:00
    if (day === 5) return t < 21 * 60;                       // Fri: close at 21:00
    // Mon-Thu: daily break 21:00-21:05
    if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
    return true;
  }

  // ── Gold (GOLD/XAUUSD) & Silver (XAGUSD) ──────────────────────────────────
  // Mon-Thu: 00:00-20:59, 22:00-24:00 | Fri: 00:00-17:00 | Sun: 22:00-24:00
  // Daily break: 21:00-22:00 UTC
  if (epic === "GOLD" || epic === "SILVER" || epic === "XAGUSD") {
    if (day === 0) return t >= 22 * 60;                      // Sun: open from 22:00
    if (day === 5) return t < 17 * 60;                       // Fri: close at 17:00
    // Mon-Thu: daily break 21:00-22:00
    if (t >= 21 * 60 && t < 22 * 60) return false;
    return true;
  }

  // ── US Crude Oil (OIL_CRUDE) ───────────────────────────────────────────────
  // Mon-Fri: 00:00-22:00 | Sun: 23:00-24:00 | Daily break: 22:00-23:00 UTC
  if (epic === "OIL_CRUDE" || epic === "OIL") {
    if (day === 0) return t >= 23 * 60;                      // Sun: open from 23:00
    if (day === 5) return t < 22 * 60;                       // Fri: close at 22:00
    // Mon-Thu: daily break 22:00-23:00
    if (t >= 22 * 60 && t < 23 * 60) return false;
    return true;
  }

  // ── US500 (S&P 500) & GER40 (DAX) ─────────────────────────────────────────
  // Mon-Thu: 00:00-20:59, 22:00-24:00 | Fri: 00:00-21:00 | Sun: 22:00-24:00
  // Daily break: 21:00-22:00 UTC
  if (epic === "US500" || epic === "GER40" || epic === "DE40" || epic === "DE30") {
    if (day === 0) return t >= 22 * 60;                      // Sun: open from 22:00
    if (day === 5) return t < 21 * 60;                       // Fri: close at 21:00
    // Mon-Thu: daily break 21:00-22:00
    if (t >= 21 * 60 && t < 22 * 60) return false;
    return true;
  }

  // ── NASDAQ (US Tech 100) ───────────────────────────────────────────────────
  // Mon-Thu: 00:00-21:00, 21:05-24:00 | Fri: 00:00-20:00 | Sun: 22:00-24:00
  // Daily break: 21:00-21:05 UTC
  if (epic === "NDAQ100" || epic === "US100" || epic === "NASDAQ") {
    if (day === 0) return t >= 22 * 60;                      // Sun: open from 22:00
    if (day === 5) return t < 20 * 60;                       // Fri: close at 20:00
    // Mon-Thu: daily break 21:00-21:05
    if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
    return true;
  }

  // ── US stocks: NYSE/NASDAQ regular hours 13:30-20:00 UTC Mon-Fri ──────────
  const US_STOCKS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "NFLX", "AMD", "INTC"];
  if (US_STOCKS.includes(epic)) {
    if (day === 0 || day === 6) return false;
    return t >= 13 * 60 + 30 && t < 20 * 60;
  }

  // ── Other global indices: Mon-Fri (Capital.com manages exact hours) ────────
  const OTHER_INDICES = ["US30", "UK100", "FRA40", "AUS200", "JPN225", "HK50", "SPAIN35", "SWISS20"];
  if (OTHER_INDICES.includes(epic)) {
    return day >= 1 && day <= 5;
  }

  // ── Agricultural & other commodities: Mon-Fri ─────────────────────────────
  const AGRI = ["WHEAT", "CORN", "SUGAR", "COFFEE", "COCOA", "COTTON", "COPPER", "PLATINUM", "PALLADIUM", "NGAS"];
  if (AGRI.includes(epic)) {
    return day >= 1 && day <= 5;
  }

  // Default: open on weekdays
  return day >= 1 && day <= 5;
}

/**
 * Filter a list of instruments to only those currently tradeable.
 */
export function getOpenMarkets(instruments: string[]): string[] {
  return instruments.filter((inst) => isMarketOpen(inst));
}
