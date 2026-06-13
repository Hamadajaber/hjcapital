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
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  GOLD: "GOLD",
  US500: "US500",
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
    const currentLevel = (p.market.bid + p.market.offer) / 2;
    const pnl =
      p.position.direction === "BUY"
        ? (currentLevel - p.position.openLevel) * p.position.size
        : (p.position.openLevel - currentLevel) * p.position.size;

    return {
      dealId: p.position.dealId,
      epic: p.market.epic,
      direction: p.position.direction,
      size: p.position.size,
      openLevel: p.position.openLevel,
      currentLevel,
      profitLoss: pnl,
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

// ─── Close Position ───────────────────────────────────────────────────────────

export async function closePosition(dealId: string): Promise<{ status: string; pnl?: number }> {
  const data = await capitalRequest<{
    dealReference: string;
  }>(`/api/v1/positions/${dealId}`, {
    method: "DELETE",
  });

  try {
    const confirm = await capitalRequest<{
      status: string;
      profit: number;
    }>(`/api/v1/confirms/${data.dealReference}`);

    return { status: confirm.status, pnl: confirm.profit };
  } catch {
    return { status: "CLOSED" };
  }
}

// ─── Market Hours Check ───────────────────────────────────────────────────────

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
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const timeMinutes = hour * 60 + minute; // minutes since midnight UTC

  const epic = (INSTRUMENT_EPICS[instrument] ?? instrument).toUpperCase();

  // Weekend check — most markets closed Sat/Sun
  if (day === 6) return false; // Saturday — all markets closed

  if (epic === "BITCOIN") return true; // Crypto is 24/7

  if (epic === "EURUSD" || epic === "GBPUSD") {
    // Forex: Mon 00:00 – Fri 22:00
    if (day === 0) return false; // Sunday closed
    if (day === 5 && timeMinutes >= 22 * 60) return false; // Fri after 22:00 UTC
    return true;
  }

  if (epic === "GOLD") {
    // Mon 22:00 – Fri 17:00, with daily break 20:59–22:00
    if (day === 0 && timeMinutes < 22 * 60) return false; // Sun before 22:00
    if (day === 5 && timeMinutes >= 17 * 60) return false; // Fri after 17:00
    // Daily maintenance break: 20:59 – 22:00 UTC
    if (timeMinutes >= 20 * 60 + 59 && timeMinutes < 22 * 60) return false;
    return true;
  }

  if (epic === "US500") {
    // Mon 21:05 – Fri 21:00, with 5-min break 21:00–21:05
    if (day === 0) return false; // Sunday closed
    if (day === 5 && timeMinutes >= 21 * 60) return false; // Fri after 21:00
    // Daily maintenance break: 21:00 – 21:05 UTC
    if (timeMinutes >= 21 * 60 && timeMinutes < 21 * 60 + 5) return false;
    if (day === 1 && timeMinutes < 21 * 60 + 5) return false; // Mon before 21:05
    return true;
  }

  // Default: assume open on weekdays
  return day >= 1 && day <= 5;
}

/**
 * Filter a list of instruments to only those currently tradeable.
 */
export function getOpenMarkets(instruments: string[]): string[] {
  return instruments.filter((inst) => isMarketOpen(inst));
}
