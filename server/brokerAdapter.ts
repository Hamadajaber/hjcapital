/**
 * Broker Adapter — Unified Interface for Multi-Broker Support
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a common interface (IBrokerAdapter) that both Capital.com and Binance
 * implement, plus a routing layer that directs calls based on the BROKER config.
 *
 * Config flag: BROKER = 'capitalcom' | 'binance' | 'both'
 */

import * as capitalcom from "./capitalcom";
import * as binance from "./binance";
import { getDb } from "./db";
import { brokerConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BrokerType = "capitalcom" | "binance" | "both";

export interface UnifiedMarketPrice {
  instrument: string;
  bid: number;
  ask: number;
  mid: number;
  broker: BrokerType;
}

export interface UnifiedOpenPosition {
  dealId: string;
  instrument: string;
  direction: "BUY" | "SELL";
  size: number;
  openLevel: number;
  currentLevel: number;
  profitLoss: number;
  broker: "capitalcom" | "binance";
}

export interface UnifiedPlaceOrderResult {
  dealId: string;
  status: string;
  level: number;
  broker: "capitalcom" | "binance";
}

export interface UnifiedBalance {
  balance: number;
  available: number;
  currency: string;
  broker: "capitalcom" | "binance";
}

// ─── Broker Config ───────────────────────────────────────────────────────────

let _activeBroker: BrokerType = "capitalcom"; // default

export function getActiveBroker(): BrokerType {
  return _activeBroker;
}

export function setActiveBroker(broker: BrokerType): void {
  _activeBroker = broker;
  console.log(`[BrokerAdapter] Active broker set to: ${broker}`);
}

/**
 * Load broker config from database on engine start
 */
export async function loadBrokerConfig(): Promise<BrokerType> {
  try {
    const db = await getDb();
    if (!db) return _activeBroker;
    const rows = await db.select().from(brokerConfig).limit(1);
    if (rows.length > 0 && rows[0].activeBroker) {
      _activeBroker = rows[0].activeBroker as BrokerType;
    }
  } catch {
    // Default to capitalcom if table doesn't exist yet
  }
  return _activeBroker;
}

// ─── Routing: Determine which broker handles an instrument ───────────────────

/**
 * Given an instrument and the active broker config, determine which broker(s)
 * should handle it.
 *
 * Rules:
 * - 'capitalcom': always Capital.com
 * - 'binance': always Binance (only for supported crypto instruments)
 * - 'both': route crypto to Binance, everything else to Capital.com
 */
export function routeInstrument(instrument: string): "capitalcom" | "binance" {
  if (_activeBroker === "capitalcom") return "capitalcom";
  if (_activeBroker === "binance") return "binance";

  // 'both' mode: route based on instrument availability
  const binanceSymbol = binance.toBinanceSymbol(instrument);
  if (binanceSymbol) return "binance";
  return "capitalcom";
}

// ─── Unified API Methods ─────────────────────────────────────────────────────

/**
 * Get market price from the appropriate broker
 */
export async function getMarketPrice(instrument: string): Promise<UnifiedMarketPrice> {
  const broker = routeInstrument(instrument);

  if (broker === "binance") {
    const symbol = binance.toBinanceSymbol(instrument)!;
    const price = await binance.getMarketPrice(symbol);
    return { instrument, bid: price.bid, ask: price.ask, mid: price.mid, broker: "binance" };
  }

  const epic = capitalcom.INSTRUMENT_EPICS[instrument] ?? instrument;
  const price = await capitalcom.getMarketPrice(epic);
  return { instrument, bid: price.bid, ask: price.ask, mid: price.mid, broker: "capitalcom" };
}

/**
 * Get account balance from the appropriate broker(s)
 */
export async function getAccountBalance(): Promise<UnifiedBalance[]> {
  const balances: UnifiedBalance[] = [];

  if (_activeBroker === "capitalcom" || _activeBroker === "both") {
    try {
      const bal = await capitalcom.getAccountBalance();
      balances.push({
        balance: bal.balance,
        available: bal.available,
        currency: bal.currency,
        broker: "capitalcom",
      });
    } catch (err) {
      console.warn("[BrokerAdapter] Capital.com balance fetch failed:", err);
    }
  }

  if (_activeBroker === "binance" || _activeBroker === "both") {
    try {
      const bal = await binance.getAccountBalance();
      balances.push({
        balance: bal.balance,
        available: bal.available,
        currency: bal.currency,
        broker: "binance",
      });
    } catch (err) {
      console.warn("[BrokerAdapter] Binance balance fetch failed:", err);
    }
  }

  return balances;
}

/**
 * Get open positions from the appropriate broker(s)
 */
export async function getOpenPositions(): Promise<UnifiedOpenPosition[]> {
  const positions: UnifiedOpenPosition[] = [];

  if (_activeBroker === "capitalcom" || _activeBroker === "both") {
    try {
      const caps = await capitalcom.getOpenPositions();
      for (const p of caps) {
        positions.push({
          dealId: p.dealId,
          instrument: p.epic,
          direction: p.direction,
          size: p.size,
          openLevel: p.openLevel,
          currentLevel: p.currentLevel,
          profitLoss: p.profitLoss,
          broker: "capitalcom",
        });
      }
    } catch (err) {
      console.warn("[BrokerAdapter] Capital.com positions fetch failed:", err);
    }
  }

  if (_activeBroker === "binance" || _activeBroker === "both") {
    try {
      const bins = await binance.getOpenPositions();
      for (const p of bins) {
        const instrument = binance.fromBinanceSymbol(p.symbol);
        positions.push({
          dealId: `BN_${p.symbol}_${Date.now()}`, // Binance doesn't have dealId concept
          instrument,
          direction: p.positionAmt > 0 ? "BUY" : "SELL",
          size: Math.abs(p.positionAmt),
          openLevel: p.entryPrice,
          currentLevel: p.markPrice,
          profitLoss: p.unrealizedProfit,
          broker: "binance",
        });
      }
    } catch (err) {
      console.warn("[BrokerAdapter] Binance positions fetch failed:", err);
    }
  }

  return positions;
}

/**
 * Place an order on the appropriate broker
 */
export async function placeOrder(params: {
  instrument: string;
  direction: "BUY" | "SELL";
  size: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<UnifiedPlaceOrderResult> {
  const broker = routeInstrument(params.instrument);

  if (broker === "binance") {
    const symbol = binance.toBinanceSymbol(params.instrument)!;
    // Adjust quantity to comply with Binance filters
    const adjustedQty = await binance.adjustQuantity(symbol, params.size);
    // Adjust SL/TP prices to comply with tick size
    const adjustedSL = params.stopLoss ? await binance.adjustPrice(symbol, params.stopLoss) : undefined;
    const adjustedTP = params.takeProfit ? await binance.adjustPrice(symbol, params.takeProfit) : undefined;

    const result = await binance.placeOrder({
      symbol,
      direction: params.direction,
      quantity: adjustedQty,
      stopLoss: adjustedSL,
      takeProfit: adjustedTP,
    });

    return {
      dealId: String(result.orderId),
      status: result.status,
      level: result.avgPrice,
      broker: "binance",
    };
  }

  // Capital.com
  const epic = capitalcom.INSTRUMENT_EPICS[params.instrument] ?? params.instrument;
  const result = await capitalcom.placeOrder({
    epic,
    direction: params.direction,
    size: params.size,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
  });

  return {
    dealId: result.dealId,
    status: result.status,
    level: result.level,
    broker: "capitalcom",
  };
}

/**
 * Close a position on the appropriate broker
 */
export async function closePosition(
  dealId: string,
  broker: "capitalcom" | "binance",
  binanceMeta?: { symbol: string; positionAmt: number }
): Promise<{ status: string; pnl?: number; closeLevel?: number }> {
  if (broker === "binance" && binanceMeta) {
    return binance.closePosition(binanceMeta.symbol, binanceMeta.positionAmt);
  }

  return capitalcom.closePosition(dealId);
}

/**
 * Update stop loss on the appropriate broker
 */
export async function updateStopLoss(
  dealId: string,
  broker: "capitalcom" | "binance",
  newStopLevel: number,
  binanceMeta?: { symbol: string; direction: "BUY" | "SELL" }
): Promise<{ success: boolean }> {
  if (broker === "binance" && binanceMeta) {
    return binance.updatePositionStopLoss(binanceMeta.symbol, binanceMeta.direction, newStopLevel);
  }

  return capitalcom.updatePositionStopLoss(dealId, newStopLevel);
}

/**
 * Check if market is open for an instrument on its routed broker
 */
export function isMarketOpen(instrument: string): boolean {
  const broker = routeInstrument(instrument);
  if (broker === "binance") return binance.isMarketOpen(instrument);
  return capitalcom.isMarketOpen(instrument);
}
