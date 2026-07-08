# Binance Integration Guide — HJ Capital Platform

## Overview

This document provides the complete implementation plan and integration instructions for adding Binance as a second broker alongside Capital.com on the HJ Capital platform (hjcapital.vip). The integration achieves full parity in order execution, position monitoring, and UI visibility.

---

## Architecture Summary

The integration follows a **Broker Adapter Pattern** that introduces an abstraction layer between the trading engine and broker-specific APIs. This allows the engine to route trades to either broker without changing its core logic.

| Component | File | Purpose |
|-----------|------|---------|
| Binance API Client | `server/binance.ts` | HMAC-SHA256 auth, REST orders, prices, balance |
| Broker Adapter | `server/brokerAdapter.ts` | Unified interface + routing logic |
| Engine Integration | `server/brokerEngineIntegration.ts` | Drop-in replacement for capitalcom imports |
| Encryption | `server/encryption.ts` | AES-256-GCM credential encryption |
| Broker Router | `server/brokerRouter.ts` | tRPC endpoints for broker management |
| Schema Changes | `drizzle/schema.ts` | broker_config, broker_credentials tables + trades.broker column |
| Environment | `server/_core/env.ts` | BINANCE_API_KEY, BINANCE_API_SECRET, ACTIVE_BROKER |

---

## New Files Created

1. **`server/binance.ts`** — Complete Binance Futures API client (mirrors capitalcom.ts structure)
2. **`server/brokerAdapter.ts`** — Unified broker interface with routing logic
3. **`server/brokerEngineIntegration.ts`** — Bridge module for autoTradeEngine.ts
4. **`server/encryption.ts`** — AES-256-GCM encrypt/decrypt utilities
5. **`server/brokerRouter.ts`** — tRPC router for broker management UI

---

## Integration Steps (for the Developer chat to execute)

### Step 1: Database Migration

Add the new tables and column to the database:

```bash
pnpm db:push
```

This will create:
- `broker_config` table (activeBroker enum)
- `broker_credentials` table (encrypted API keys)
- `broker` column on `trades` table

### Step 2: Register Broker Router

In `server/routers.ts`, add the broker router:

```typescript
import { brokerRouter } from "./brokerRouter";

// Inside appRouter:
export const appRouter = router({
  // ... existing routers ...
  broker: brokerRouter,
});
```

### Step 3: Update autoTradeEngine.ts Imports

Replace the capitalcom import block (lines 28-44) in `server/autoTradeEngine.ts`:

**BEFORE:**
```typescript
import {
  getAllMarketPrices, getMarketPrice, getCandles, getOpenPositions,
  getAccountBalance, placeOrder, closePosition, INSTRUMENT_EPICS,
  isMarketOpen, getOpenMarkets, checkMarketTradeable, getMinDealSize,
  getSessionTokens, updatePositionStopLoss, getTransactionHistory,
} from "./capitalcom";
```

**AFTER:**
```typescript
import {
  getAllMarketPrices, getMarketPrice, getCandles, getOpenPositions,
  getAccountBalance, placeOrder, closePosition, INSTRUMENT_EPICS,
  isMarketOpen, getOpenMarkets, checkMarketTradeable, getMinDealSize,
  getSessionTokens, updatePositionStopLoss, getTransactionHistory,
} from "./brokerEngineIntegration";
```

### Step 4: Add Broker Field to Trade Insertion

In `executeDecision()` (around line 2133), add the `broker` field when inserting trades:

```typescript
const [tradeResult] = await dbExec2.insert(trades).values({
  // ... existing fields ...
  dealId: brokerDealId ?? null,
  broker: routeInstrument(decision.instrument), // ADD THIS LINE
});
```

Import `routeInstrument` at the top:
```typescript
import { routeInstrument } from "./brokerAdapter";
```

### Step 5: Initialize Broker on Engine Start

In `startAutoTrade()` function, add initialization call:

```typescript
import { initBrokerIntegration } from "./brokerEngineIntegration";

export async function startAutoTrade(mode: "paper" | "live", cycleIntervalMinutes = 15): Promise<EngineState> {
  // ADD at the beginning of the function:
  await initBrokerIntegration();
  // ... rest of existing code ...
}
```

### Step 6: Environment Variables

Add to the deployment environment (via webdev_request_secrets or .env):

```
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
BINANCE_TESTNET=false
ACTIVE_BROKER=capitalcom
```

### Step 7: UI Components (Settings Page)

Add a Broker Settings section to the Settings/RiskSettings page. The tRPC endpoints are:

```typescript
// Get broker config
trpc.broker.getConfig.useQuery()

// Set active broker
trpc.broker.setActiveBroker.useMutation()

// Save Binance credentials
trpc.broker.saveBinanceCredentials.useMutation()

// Test connections
trpc.broker.testBinanceConnection.useMutation()
trpc.broker.testCapitalcomConnection.useMutation()

// Per-broker performance
trpc.broker.getPerBrokerStats.useQuery()
```

### Step 8: Dashboard Broker Badge

In the Dashboard/TradeHistory components, use the `trade.broker` field to display a badge:

```tsx
{trade.broker === "binance" ? (
  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Binance</Badge>
) : (
  <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Capital.com</Badge>
)}
```

---

## Config Flag Values

The `BROKER` config uses exactly these values:

| Value | Behavior |
|-------|----------|
| `capitalcom` | All trades routed to Capital.com (current default) |
| `binance` | All trades routed to Binance (crypto only) |
| `both` | Smart routing: crypto → Binance, forex/indices/commodities → Capital.com |

---

## Instrument Mapping (Internal → Binance)

Only crypto instruments are available on Binance Futures:

| HJCapital Internal | Binance Symbol | Notes |
|-------------------|----------------|-------|
| ETHUSD | ETHUSDT | Ethereum |
| XRPUSD | XRPUSDT | Ripple |
| LTCUSD | LTCUSDT | Litecoin |
| ADAUSD | ADAUSDT | Cardano |
| SOLUSD | SOLUSDT | Solana |
| BTC / BTCUSD | BTCUSDT | Bitcoin |
| DOGEUSD | DOGEUSDT | Dogecoin |
| AVAXUSD | AVAXUSDT | Avalanche |
| LINKUSD | LINKUSDT | Chainlink |
| BNBUSD | BNBUSDT | BNB |

Forex, indices, and commodities remain exclusively on Capital.com.

---

## Security: Credential Encryption

Broker credentials are encrypted using **AES-256-GCM** before storage:

- **Key derivation**: PBKDF2 (100,000 iterations, SHA-512) from `JWT_SECRET`
- **Storage format**: `iv:authTag:ciphertext` (all hex-encoded)
- **Implementation**: `server/encryption.ts`

This ensures that even if the database is compromised, API keys cannot be read without the server's JWT_SECRET.

---

## Binance API Specifics

| Feature | Implementation |
|---------|---------------|
| Authentication | HMAC-SHA256 signature on query params |
| Order placement | `POST /fapi/v1/order` with `type=MARKET` |
| Stop Loss | Separate `STOP_MARKET` order with `closePosition=true` |
| Take Profit | Separate `TAKE_PROFIT_MARKET` order with `closePosition=true` |
| Position close | Opposite-side `MARKET` order with `reduceOnly=true` |
| Trailing stop | Cancel existing SL + place new `STOP_MARKET` |
| Lot size | Adjusted via `exchangeInfo` filters (stepSize) |
| Tick size | Adjusted via `exchangeInfo` filters (tickSize) |
| Market hours | 24/7 for all crypto pairs |

---

## Testing Checklist

- [ ] `encryption.ts` — encrypt/decrypt roundtrip test
- [ ] `binance.ts` — HMAC signature generation test
- [ ] `brokerAdapter.ts` — routing logic test (instrument → broker)
- [ ] `brokerEngineIntegration.ts` — placeOrder routes correctly
- [ ] `brokerRouter.ts` — getConfig/setActiveBroker mutations
- [ ] Integration test: place paper trade via Binance adapter
- [ ] UI test: broker selector saves to DB
- [ ] UI test: dashboard shows broker badges

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Binance API rate limiting | Exponential backoff + weight tracking via headers |
| Signature clock drift | `recvWindow=5000ms` + server time sync check |
| Lot size rejection | Pre-validate via `exchangeInfo` before order submission |
| Partial fills on market orders | Use `executedQty` from response, not requested qty |
| Testnet vs Production confusion | Explicit `useTestnet` flag per credential set |

---

## DIRECTOR_CONTEXT.md Update

Add to the "Current Capabilities" section:

```
### Multi-Broker Support (Round XX)
- Binance Futures integration alongside Capital.com
- Broker adapter pattern with smart routing
- Config: BROKER = 'capitalcom' | 'binance' | 'both'
- Encrypted credential storage (AES-256-GCM)
- Per-broker performance tracking and dashboard badges
- Instrument mapping: crypto → Binance, everything else → Capital.com
```
