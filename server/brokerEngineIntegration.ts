/**
 * Broker Engine Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * This module provides the bridge between autoTradeEngine.ts and the multi-broker
 * adapter. It wraps the broker adapter functions to match the exact signatures
 * that autoTradeEngine.ts expects from capitalcom.ts.
 *
 * INTEGRATION INSTRUCTIONS:
 * In autoTradeEngine.ts, replace the capitalcom imports with these unified wrappers.
 *
 * BEFORE (line ~28-44):
 *   import {
 *     getAllMarketPrices, getMarketPrice, getCandles, getOpenPositions,
 *     getAccountBalance, placeOrder, closePosition, INSTRUMENT_EPICS,
 *     isMarketOpen, getOpenMarkets, checkMarketTradeable, getMinDealSize,
 *     getSessionTokens, updatePositionStopLoss, getTransactionHistory,
 *   } from "./capitalcom";
 *
 * AFTER:
 *   import {
 *     getAllMarketPrices, getMarketPrice, getCandles, getOpenPositions,
 *     getAccountBalance, placeOrder, closePosition, INSTRUMENT_EPICS,
 *     isMarketOpen, getOpenMarkets, checkMarketTradeable, getMinDealSize,
 *     getSessionTokens, updatePositionStopLoss, getTransactionHistory,
 *   } from "./brokerEngineIntegration";
 */

import * as capitalcom from "./capitalcom";
import * as binance from "./binance";
import { getActiveBroker, routeInstrument, loadBrokerConfig } from "./brokerAdapter";
import type { OpenPosition, PlaceOrderResult, MarketPrice } from "./capitalcom";

// Re-export constants that the engine uses directly
export { INSTRUMENT_EPICS } from "./capitalcom";
export { isMarketOpen, getOpenMarkets } from "./capitalcom";

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Must be called once at engine start to load broker config and init Binance creds.
 */
export async function initBrokerIntegration(): Promise<void> {
  await loadBrokerConfig();

  // Initialize Binance credentials from env (or DB — see brokerAdapter.loadBrokerConfig)
  const { ENV } = await import("./_core/env");
  if (ENV.binanceApiKey && ENV.binanceApiSecret) {
    binance.initBinanceCredentials({
      apiKey: ENV.binanceApiKey,
      apiSecret: ENV.binanceApiSecret,
      useTestnet: ENV.binanceTestnet,
    });
  }
}

// ─── Market Data ─────────────────────────────────────────────────────────────

/**
 * Get market price — routes to appropriate broker based on instrument
 */
export async function getMarketPrice(epic: string): Promise<MarketPrice> {
  // For now, always use Capital.com for market data (it covers all instruments)
  // Binance only has crypto, so Capital.com is the universal data source
  return capitalcom.getMarketPrice(epic);
}

export async function getAllMarketPrices(): Promise<MarketPrice[]> {
  return capitalcom.getAllMarketPrices();
}

export async function getCandles(
  epic: string,
  resolution: capitalcom.CandleResolution,
  limit?: number
): Promise<capitalcom.OHLCVCandle[]> {
  // Check if this is a Binance-routed instrument and we need Binance candles
  const broker = getActiveBroker();
  if (broker === "binance" || broker === "both") {
    // Try to get from Binance for crypto instruments
    const instrument = Object.entries(capitalcom.INSTRUMENT_EPICS)
      .find(([_, v]) => v === epic)?.[0] ?? epic;
    const binanceSymbol = binance.toBinanceSymbol(instrument);
    if (binanceSymbol) {
      const intervalMap: Record<string, binance.BinanceCandleInterval> = {
        MINUTE: "1m", MINUTE_5: "5m", MINUTE_15: "15m", MINUTE_30: "30m",
        HOUR: "1h", HOUR_4: "4h", DAY: "1d", WEEK: "1w",
      };
      const interval = intervalMap[resolution] ?? "1h";
      const candles = await binance.getCandles(binanceSymbol, interval, limit ?? 100);
      return candles.map((c) => ({
        date: new Date(c.openTime).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
  }
  return capitalcom.getCandles(epic, resolution, limit);
}

// ─── Account ─────────────────────────────────────────────────────────────────

export async function getAccountBalance(): Promise<{
  balance: number;
  available: number;
  profitLoss: number;
  currency: string;
}> {
  const broker = getActiveBroker();

  if (broker === "binance") {
    const bal = await binance.getAccountBalance();
    return {
      balance: bal.balance,
      available: bal.available,
      profitLoss: bal.unrealizedPnl,
      currency: bal.currency,
    };
  }

  // For 'capitalcom' or 'both', use Capital.com as primary balance
  return capitalcom.getAccountBalance();
}

// ─── Positions ───────────────────────────────────────────────────────────────

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const broker = getActiveBroker();
  const positions: OpenPosition[] = [];

  if (broker === "capitalcom" || broker === "both") {
    const caps = await capitalcom.getOpenPositions().catch(() => []);
    positions.push(...caps);
  }

  if (broker === "binance" || broker === "both") {
    const bins = await binance.getOpenPositions().catch(() => []);
    for (const p of bins) {
      const instrument = binance.fromBinanceSymbol(p.symbol);
      positions.push({
        dealId: `BN_${p.symbol}_${p.positionAmt}`,
        epic: p.symbol,
        direction: p.positionAmt > 0 ? "BUY" : "SELL",
        size: Math.abs(p.positionAmt),
        openLevel: p.entryPrice,
        currentLevel: p.markPrice,
        profitLoss: p.unrealizedProfit,
        currency: "USDT",
        createdDate: new Date().toISOString(),
      });
    }
  }

  return positions;
}

// ─── Order Execution ─────────────────────────────────────────────────────────

export async function placeOrder(params: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<PlaceOrderResult> {
  // Determine which broker handles this instrument
  const instrument = Object.entries(capitalcom.INSTRUMENT_EPICS)
    .find(([_, v]) => v === params.epic)?.[0] ?? params.epic;
  const broker = routeInstrument(instrument);

  if (broker === "binance") {
    const symbol = binance.toBinanceSymbol(instrument) ?? params.epic + "USDT";
    const adjustedQty = await binance.adjustQuantity(symbol, params.size);
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
      dealReference: result.clientOrderId,
      status: result.status,
      level: result.avgPrice,
    };
  }

  // Capital.com (default)
  return capitalcom.placeOrder(params);
}

export async function closePosition(dealId: string): Promise<{ status: string; pnl?: number; closeLevel?: number }> {
  // Check if this is a Binance position (dealId starts with "BN_")
  if (dealId.startsWith("BN_")) {
    const parts = dealId.split("_");
    const symbol = parts[1];
    const positionAmt = parseFloat(parts[2]);
    return binance.closePosition(symbol, positionAmt);
  }

  return capitalcom.closePosition(dealId);
}

export async function updatePositionStopLoss(
  dealId: string,
  newStopLevel: number
): Promise<{ success: boolean; status?: string }> {
  // Check if this is a Binance position
  if (dealId.startsWith("BN_")) {
    const parts = dealId.split("_");
    const symbol = parts[1];
    const positionAmt = parseFloat(parts[2]);
    const direction = positionAmt > 0 ? "BUY" : "SELL";
    const result = await binance.updatePositionStopLoss(symbol, direction as "BUY" | "SELL", newStopLevel);
    return { success: result.success };
  }

  return capitalcom.updatePositionStopLoss(dealId, newStopLevel);
}

// ─── Passthrough functions (always Capital.com) ──────────────────────────────

export async function checkMarketTradeable(epic: string): Promise<boolean> {
  // For Binance crypto, always tradeable
  const instrument = Object.entries(capitalcom.INSTRUMENT_EPICS)
    .find(([_, v]) => v === epic)?.[0] ?? epic;
  if (binance.toBinanceSymbol(instrument) && getActiveBroker() !== "capitalcom") {
    return true;
  }
  return capitalcom.checkMarketTradeable(epic);
}

export async function getMinDealSize(epic: string): Promise<number> {
  const instrument = Object.entries(capitalcom.INSTRUMENT_EPICS)
    .find(([_, v]) => v === epic)?.[0] ?? epic;
  const broker = routeInstrument(instrument);

  if (broker === "binance") {
    const symbol = binance.toBinanceSymbol(instrument);
    if (symbol) return binance.getMinDealSize(symbol);
  }

  return capitalcom.getMinDealSize(epic);
}

export { getSessionTokens } from "./capitalcom";
export { getTransactionHistory } from "./capitalcom";
