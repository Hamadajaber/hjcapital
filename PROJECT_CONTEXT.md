# HJ Capital Platform — Project Context

> **For AI assistants:** This file provides full context about the HJ Capital Platform so any chat session can continue work on this codebase without needing to re-read all files.

---

## Overview

**HJ Capital** (`hjcapital.vip`) is an AI-powered automated trading platform built for Hamada Ghaith. It uses a 2-model AI ensemble (Claude Sonnet 70% + GPT-4o 30%) to analyze 60+ financial instruments and execute trades automatically on Capital.com CFD API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Tailwind 4 + shadcn/ui |
| Backend | Express 4 + tRPC 11 |
| ORM | Drizzle ORM + MySQL/TiDB |
| AI | Claude Sonnet (70%) + GPT-4o (30%) via `invokeLLM()` |
| Trading API | Capital.com CFD API |
| Notifications | Telegram Bot |

---

## Key Files

| File | Purpose |
|---|---|
| `server/autoTradeEngine.ts` | Core trading engine — runCycle, analyzeInstrument, executeDecision, trailing stop, ATR sizing |
| `server/engineIntelligence.ts` | AI ensemble logic (Claude+GPT-4o), confidence thresholds, ATR, client sentiment |
| `server/capitalcom.ts` | Capital.com API integration — session, placeOrder, getMarketPrice, INSTRUMENT_EPICS |
| `server/technicalAnalysis.ts` | RSI, MACD, Bollinger Bands, ATR, market regime, CORRELATION_GROUPS (65+ instruments) |
| `server/db.ts` | DB helpers — getRiskSettings, insertTrade, closeTrade, get7DayWinRate |
| `drizzle/schema.ts` | DB schema — trades table has stopLoss, takeProfit; uses openedAt (NOT createdAt) |
| `client/src/pages/RiskSettings.tsx` | Risk settings UI — minConfidenceThreshold min=30%, presets |
| `todo.md` | Task tracking — all rounds history |

---

## Trading Engine Architecture

### Instrument Universe
- **Core instruments** (always scanned): EURUSD, GBPUSD, USDJPY, EURGBP, GOLD, XAGUSD, OIL_CRUDE, US500, GER40, NASDAQ
- **Rotating universe** (60+ instruments): 10 rotate per cycle from Major Forex, Global Indices, Commodities, US Tech Stocks, Crypto
- Each cycle scans 10 core + 10 rotating = 20 instruments

### AI Ensemble
- Claude Sonnet = 70% weight, GPT-4o = 30% weight
- Unanimous BUY/SELL → 1.0x position size
- Majority (one BUY, one HOLD) → 0.7x size
- Split (one BUY, one SELL) with ≥40% confidence → 0.5x size
- Split with <40% confidence → 0.4x size

### Risk Management
- ATR-based position sizing (risk 1% of balance per trade)
- R:R 1:2 enforcement (TP = 2× SL distance)
- Trailing Stop Loss (moves SL to break-even after 50% of target profit)
- Zero-price guard (rejects trades with entry=0)
- Price deviation guard (rejects if AI estimate >20% from live price)
- Daily loss limit (currently 99% in DB — should be reduced to 40-50%)
- Correlation filter (avoids correlated positions)

### Capital.com Instrument Epics
```
GER40 → DE40
NASDAQ → US100
(all others match instrument name)
```

### Important Price Context
Capital.com CFD prices differ from spot prices:
- GOLD ≈ 3300-3400 (not 2000)
- US100 ≈ 21000-22000 (not 5000)
- DE40 ≈ 23000-24000

---

## Engine Cycle Flow

1. Check daily loss limit (only counts CLOSED trades from today)
2. Update trailing stops on open positions
3. Check if any open positions should be closed (AI analysis)
4. Scan all candidate instruments in parallel
5. Filter opportunities: BUY/SELL with confidence > 0 only
6. Sort by confidence descending
7. Apply correlation filter across batch
8. Execute top N trades (up to maxOpenPositions limit)

---

## Key Configuration (DB defaults)

| Setting | Value | Notes |
|---|---|---|
| minConfidenceThreshold | 45% | Minimum AI confidence to trade |
| maxRiskPerTrade | 2% | Max risk per trade |
| maxOpenPositions | 5 | Max concurrent positions |
| dailyLossLimitPct | 99% | TEMPORARY — reduce to 40-50% |
| cycleIntervalMinutes | 15 | Engine runs every 15 minutes |

---

## Completed Development Rounds

| Round | Summary |
|---|---|
| 13 | Multi-trade per cycle (parallel scanning) |
| 14 | Decision log scroll fix, removed paper trading balance |
| 15 | Capital.com API integrations (sentiment, working orders, etc.) |
| 16 | BTC removed, Decision Log compact view |
| 17 | Auto-start engine on server boot |
| 18 | 2-model ensemble (Claude 70% + GPT-4o 30%), 60+ instrument rotating universe |
| 19 | Portfolio-manager engine redesign — lower confidence thresholds, decisive AI prompts |
| 20 | Zero-price guard, price deviation guard, confidence anchoring fix |
| 21 | R:R 1:2, Trailing Stop Loss, ATR-based position sizing |
| 22 | Fixed createdAt DB error, increased dailyLossLimitPct to 99% |
| 23 | Fixed daily loss limit (today only), live-price SL/TP recalculation |
| 24 | Fixed self-signed cert (switched to capitalcom.ts sentiment), 0% confidence filter |

---

## User Info

- **Name:** Hamada Ghaith
- **Role:** admin
- **OpenID:** HMtmFUrU3RmqVSuUkG4piS
- **Domain:** hjcapital.vip
- **Dev URL:** https://3000-i21bo94iq7551v9wbtb4j-2b6b5828.sg1.manus.computer

---

## Tests

77/77 tests passing across 4 test files:
- `server/capitalcom.test.ts` — 6 tests
- `server/technicalAnalysis.test.ts` — 59 tests
- `server/auth.logout.test.ts` — 1 test
- `server/hj-capital.test.ts` — 11 tests

Run with: `pnpm test`

---

## Pending Items

- [ ] Reduce `dailyLossLimitPct` from 99% back to 40-50% after confirming engine works
- [ ] Monitor engine for successful trade execution across multiple cycles
