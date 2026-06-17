# HJ Capital Platform — TODO

## Core Infrastructure
- [x] Database schema: portfolio, trades, signals, risk_settings, chat_messages
- [x] tRPC routers: portfolio, trades, signals, advisor, settings
- [x] AI advisor backend with LLM integration
- [x] Trading signals generator backend

## UI & Design
- [x] Dark premium theme (CSS variables, fonts: Inter + JetBrains Mono)
- [x] HJLayout sidebar navigation with mode toggle
- [x] App.tsx routing setup

## Pages & Features
- [x] Dashboard home: balance, daily P&L, performance chart, quick stats
- [x] Portfolio overview panel: balance $250, open positions, win rate, cumulative returns
- [x] Trading signals feed: EURUSD, GBPUSD, GOLD, US500, BTC with AI confidence scores
- [x] AI Investment Advisor chat interface (LLM-powered)
- [x] Trade history log with filters (date, instrument, outcome)
- [x] Risk management settings panel (daily loss limit, profit lock, max risk, confidence threshold)
- [x] Paper trading vs Live trading mode toggle with clear visual indicator
- [x] Daily performance summary: trades, win rate, best/worst trade, balance chart
- [x] Performance analytics page with charts

## Security & Access
- [x] Single-user access (Hamada only — owner-only guard)
- [x] Auth protection on all routes

## Testing
- [x] Vitest tests for routers (12/12 passing)

## Round 2 — Live Integration & Visual Polish
- [x] Capital.com API credentials stored securely as env secrets
- [x] Capital.com live price feed on Signals page (EURUSD, GBPUSD, GOLD, US500, BTC)
- [x] Capital.com account balance sync on Dashboard (via capitalcom.accountInfo router)
- [x] Natural background image — serene Japanese forest (calm, misty, warm tones)
- [x] Apply background image to Login page and main layout (nature + warm overlay)

## Round 3 — Heritage Ledger Visual Identity
- [x] Upload new HJ Capital shield logo to webdev storage
- [x] Upload favicon (32px) to webdev storage
- [x] Apply Heritage Ledger CSS: Playfair Display + Montserrat + warm cream/sage green palette
- [x] Update index.html: Google Fonts (Playfair Display + Montserrat), favicon
- [x] Update HJLayout: new shield logo, Playfair Display for brand name and balance
- [x] Update Login.tsx: new shield logo, serif title, Heritage Ledger card style
- [x] Update App.tsx: loading state with logo, Heritage Ledger toast styling
- [x] Update Dashboard.tsx: serif headings and numbers
- [x] Update Signals.tsx: serif headings and numbers
- [x] Update Performance.tsx: serif headings and numbers including table
- [x] Update RiskSettings.tsx: serif heading and input
- [x] Update TradeHistory.tsx: serif heading and P&L numbers
- [x] Update Advisor.tsx: serif heading
- [x] Update NotFound.tsx: full Heritage Ledger rebrand

## Round 4 — HJ Auto Trade Mode
- [x] DB schema: auto_trade_sessions table (status, mode, config, stats)
- [x] DB schema: auto_trade_log table (decision, reasoning, action taken, result)
- [x] Fix Capital.com BASE_URL in server/capitalcom.ts to use api-capital.backend-capital.com
- [x] Backend: autoTrade router (start, stop, status, getLogs, getConfig, updateConfig)
- [x] AI Analysis Engine: analyzeMarket() — fetches live prices + news + generates AI trade decision
- [x] Auto Execution Engine: executeDecision() — places/closes trades on Capital.com based on AI decision
- [x] Risk guard: enforce dailyLossLimit, dailyProfitLock, maxRiskPerTrade before any execution
- [x] Notification: notify owner on each trade execution (entry, exit, P&L)
- [x] Frontend: AutoTrade page with Start/Stop button, live status, decision log, P&L tracker
- [x] Frontend: Add "HJ Auto Trade" to sidebar navigation
- [x] Frontend: Real-time log feed showing AI reasoning for each decision
- [x] Frontend: Safety controls panel (pause, emergency stop)

## Round 5 — Engine Fixes + Telegram + Win Rate

- [x] Auto Trade Engine: add market hours filter — skip instruments closed on weekends/outside trading hours
- [x] Auto Trade Engine: check Capital.com market status before placing order
- [x] Telegram Bot: add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID secrets
- [x] Telegram Bot: create server/telegram.ts helper with sendTelegramMessage()
- [x] Telegram Bot: notify on trade open (entry price, direction, size, instrument)
- [x] Telegram Bot: notify on trade close (exit price, P&L, reason)
- [x] Telegram Bot: notify on engine start/stop
- [x] Dashboard: add all-time Win Rate % card (getOverallStats — wins / total closed trades * 100)
- [x] Dashboard: Win Rate card shows all-time W/L count in sub-label

## Round 6 — Engine Accuracy Fixes

- [x] Fix Telegram trade-close alert: use actual trade direction, real entry price, and real close price (positionDirection, positionOpenLevel, positionCurrentLevel from position object)
- [x] Add live Capital.com market-status check inside executeDecision() / placeOrder() as a secondary guard (checkMarketTradeable() calls /api/v1/markets/:epic, falls back to hardcoded schedule)

## Round 7 — Scheduled Auto-Start/Stop

- [x] Add /api/scheduled/auto-trade-start handler (starts engine in paper mode, sends Telegram notification)
- [x] Add /api/scheduled/auto-trade-stop handler (stops engine, sends Telegram notification)
- [x] Register both handlers in server/_core/index.ts before Vite fallthrough
- [x] Add schedule_config table to DB (stores task UIDs for start/stop jobs, enabled flag, mode, interval)
- [x] Add schedule tRPC procedures: getSchedule, enableSchedule, disableSchedule
- [x] Add schedule status UI to AutoTrade page (shows schedule info + enable/disable toggle)
- [x] Deploy to production, then enable schedule via the toggle in AutoTrade page

## Round 8 — Dual Balance Display

- [x] Add portfolio.liveBalance tRPC procedure (fetches real balance from Capital.com, returns ok/error)
- [x] Dashboard: show Paper Trading balance and Capital.com Live balance in separate cards
- [x] Sidebar: show both Paper and Live balance cards stacked

## Round 9 — Platform Enhancements (11 Features)

### AI Engine
- [x] Multi-timeframe Analysis: fetch 5min + 1h + 4h candles and include all 3 in AI prompt
- [x] Pattern Recognition: detect candlestick patterns (Doji, Hammer, Engulfing, etc.) and include in AI prompt
- [x] Correlation Filter: prevent opening correlated pairs simultaneously (EURUSD + GBPUSD)
- [x] Sentiment Analysis: fetch and parse multiple financial news RSS feeds, include sentiment score in AI prompt
- [x] Backtesting Engine: server procedure to run strategy on historical Capital.com candle data

### Dashboard
- [x] Advanced Charts: add RSI, MACD, Bollinger Bands indicators to Performance page charts
- [x] Portfolio Heatmap: visual heatmap of all instruments' performance by P&L %
- [x] Drawdown Tracker: calculate and display max drawdown from equity peak
- [x] Daily Summary: auto Telegram message at end of each trading day with session stats (PDF deferred)

### Notifications
- [x] Telegram Bot Commands: /start, /stop, /status, /balance commands via webhook
- [x] Price Alerts: DB table + UI to set price alerts, checked each engine cycle
- [x] Daily Summary: auto Telegram message at end of each trading day with session stats

## Round 10 — Code Quality & Testing

- [x] Read autoTradeEngine.ts data flow: gatherMarketContext → analyzeMarket → executeDecision → logDecision
- [x] Add Unit Tests for technicalAnalysis.ts — 55 tests covering all 7 exported functions (RSI, MACD, Bollinger, Patterns, Correlation, Summary, Formatter)
- [x] Total test suite: 71 tests, 71 passing (4 test files)

## Round 11 — Strategic Development Guide Implementation

### Phase 1A — Learning Memory System
- [x] Add `trade_lessons` DB table (trade_id, instrument, direction, entry, exit, pnl, ai_verdict, lesson_text, created_at)
- [x] Add `evaluateTrade()` function: after trade closes, call AI to evaluate the decision and extract a lesson
- [x] Add `getRecentLessons()` DB helper: fetch last 5 lessons per instrument
- [x] Inject recent lessons into analyzeMarket() prompt context

### Phase 1B — Dynamic Confidence Threshold
- [x] Add `getDynamicConfidenceThreshold()` function: calculate based on 7-day win rate
- [x] If win rate > 70% → threshold = 60% (more aggressive)
- [x] If win rate 50-70% → threshold = 70% (normal)
- [x] If win rate < 50% → threshold = 85% (conservative)
- [x] If win rate < 40% → auto-stop engine + Telegram alert
- [x] Use dynamic threshold in executeDecision() instead of fixed value

### Phase 1C — Market Regime Detection
- [x] Add `detectMarketRegime()` function: classify as Trending Up / Trending Down / Ranging / Volatile
- [x] Use ATR + RSI + Bollinger bandwidth for classification
- [x] Adjust strategy per regime: Trending = large targets, Ranging = small targets, Volatile = HOLD
- [x] Include regime in AI prompt context

### Phase 1D — Adaptive ATR Stop Loss
- [x] Add `calculateATRStopLoss()` function: SL = entry ± (ATR × 1.5)
- [x] Add trailing stop logic: move SL to breakeven at 50% profit, to +25% at 75% profit
- [x] Replace fixed SL in executeDecision() with ATR-based SL
- [x] Add trailing stop monitoring in runCycle()

### Phase 2A — Client Sentiment Integration
- [x] Add `getClientSentiment()` to capitalcom.ts: GET /api/v1/clientsentiment
- [x] Add contrarian signal logic: if >75% long → bearish signal; if >75% short → bullish signal
- [x] Include sentiment data in analyzeMarket() prompt

### Phase 2B — Economic Calendar Filter
- [x] Add `checkEconomicCalendar()` function: fetch Forex Factory RSS for high-impact events
- [x] Parse events for next 4 hours: NFP, FOMC, CPI, GDP, interest rate decisions
- [x] If high-impact event detected → skip cycle + send Telegram warning

### Phase 2C — Ensemble Decision Making (3 AI Models)
- [x] Add `ensembleAnalysis()` function: call Claude + GPT-4o + Gemini Flash in parallel
- [x] Implement weighted voting: Claude 40%, GPT 35%, Gemini 25%
- [x] 3/3 agreement → full size trade; 2/3 → half size; 1/3 → HOLD
- [x] Log each model's vote in auto_trade_log

### Phase 3 — WebSocket Streaming
- [x] Add `capitalcomWebSocket.ts`: connect to Capital.com WebSocket API
- [x] Subscribe to real-time OHLC candles for all active instruments
- [x] Replace polling in runCycle() with event-driven price updates
- [x] Handle reconnection logic

### UI Updates
- [x] AutoTrade page: show current Market Regime badge
- [x] AutoTrade page: show Client Sentiment gauge (% long vs short)
- [x] AutoTrade page: show Dynamic Confidence Threshold value
- [x] AutoTrade page: show Ensemble Votes (Claude/GPT/Gemini) in decision log
- [x] AutoTrade page: show Recent Lessons panel

## Round 13 — Multi-Trade Per Cycle Fix

- [x] Fix runCycle(): scan ALL instruments in parallel using analyzeInstrument() for each one
- [x] Collect ALL BUY/SELL signals across all instruments in one cycle
- [x] Apply correlation filter across the collected signals (not just open positions)
- [x] Execute ALL valid signals up to maxOpenPositions limit simultaneously
- [x] Remove the `foundOpportunity` break that stops after first trade
- [x] Log "Scanning X instruments..." and "Found Y opportunities" in Decision Log

## Round 14 — Capital.com Full API Integration + Scroll Fix + Min Confidence

- [x] Fix scroll lock in Decision Log (use scrollTop on container, not scrollIntoView)
- [x] Remove Paper Trading balance from Dashboard and Sidebar
- [x] Fix Min AI Confidence fallback from 72 to 55 in RiskSettings.tsx
- [x] Update DB: minConfidenceThreshold = 55
- [x] Add BTC to gatherMarketContext instrument list
- [x] Add getActivityHistory() to capitalcom.ts
- [x] Add getTransactionHistory() to capitalcom.ts
- [x] Add getWorkingOrders() to capitalcom.ts
- [x] Add getClientSentiment() to capitalcom.ts (new tRPC endpoint)
- [x] Add getAccountPreferences() to capitalcom.ts
- [x] Add searchMarkets() to capitalcom.ts
- [x] Add getWatchlists() / getWatchlistDetail() to capitalcom.ts
- [x] Expose all new endpoints via tRPC procedures in routers.ts
- [x] Add Client Sentiment panel to Dashboard
- [x] Add Working Orders panel to Dashboard
- [x] Add Capital.com Activity History tab to Trade History page
- [x] Add Capital.com Transaction History tab to Trade History page

## Round 16 — Auto-Start Engine on Boot
- [x] Auto-start engine in Live mode on server boot (index.ts)
- [x] Remove mode selector and interval slider from UI (always Live, always 15min)
- [x] Replace START ENGINE button with status-only view when engine is running
- [x] Make STOP ENGINE the only user action — shown prominently with confirmation
- [x] Show "Engine auto-started" indicator in the UI

## Round 17 — Expand to 10 Instruments
- [x] Add 6 new instruments to INSTRUMENT_EPICS in capitalcom.ts: USDJPY, XAGUSD, GER40, OIL_CRUDE, EURGBP, NASDAQ
- [x] Update all 3 instrument arrays in autoTradeEngine.ts (runCycle, gatherMarketContext, prompt)
- [x] Update correlation map to include new pairs (EURGBP↔EURUSD, NASDAQ↔US500, XAGUSD↔GOLD)
- [x] Update isMarketOpen() to add market hours for new instruments
- [x] Update Signals page instrument filter list
- [x] Update TradeHistory page instrument filter list

## Round 18 — 2-Model Ensemble + Rotating Instrument Scan
- [x] Switch ensemble to Claude Sonnet (70%) + GPT-4o (30%) — remove Gemini Flash
- [x] Update getEnsembleSizeMultiplier for 2-model agreement logic
- [x] Build ROTATING_UNIVERSE: curated list of 60+ Capital.com instruments across Forex/Commodities/Indices/Stocks
- [x] Implement rotation batch system: 10 core instruments always + 10 rotating per cycle
- [x] Persist rotation cursor in memory (resets on server restart)
- [x] Update Decision Log scan message to show rotation batch info
- [x] Fix GER40 epic: DE30 → GER40 (correct Capital.com epic for DAX 40)
- [x] Expand CORRELATION_GROUPS to cover all 65+ instruments in rotating universe
- [x] 71/71 tests passing, TypeScript 0 errors

## Round 19 — Portfolio Manager Engine Fix (Zero-Trade Diagnosis)

### Root Causes Identified:
# 1. Ensemble returns BUY @ 0% — the prompt asks for confidence but models return 0 because they have no real data
# 2. analyzeInstrument: if sizeMultiplier=0 OR action=HOLD → returns HOLD (0% confidence blocks everything)
# 3. getEnsembleSizeMultiplier: split agreement with Claude <60% → returns 0 (HOLD) — too aggressive
# 4. minConfidenceThreshold default is 72% — extremely high bar for AI that returns 0-40% normally
# 5. GER40 epic still 404 on Capital.com (wrong epic used in candle fetch)
# 6. Engine ran cycles but log was truncated — actual 3h gap was sandbox hibernation

### Fixes:
- [x] Fix prompt: remove confidence-gate from analyzeInstrument prompt — AI should always return its TRUE confidence
- [x] Fix getEnsembleSizeMultiplier: split with ANY confidence ≥40% → 0.7x (not 0); only pure HOLD → 0
- [x] Lower default minConfidenceThreshold from 72% to 45% (portfolio manager takes calculated risks)
- [x] Fix getDynamicConfidenceThreshold: <5 trades → use 40% (not 55%) to allow early trades
- [x] Add direct-execution path: if ensemble says BUY/SELL with ≥40% confidence, execute immediately
- [x] Fix GER40 epic: corrected to DE40 (Capital.com's Germany 40 identifier)
- [x] Add maxOpenPositions guard bypass: analyzeInstrument no longer blocks on missing technical data
- [x] Improve prompt: give AI explicit market context about current session (London/NY/Asian)
- [x] Add cycle heartbeat log: every cycle logs "Cycle N complete: X trades, Y skipped (reason)"

## Round 20 — Critical Trading Bugs Fix (Zero Price + Wrong Epics + Confidence)
- [x] Add zero-price guard in executeDecision: reject any trade where actualEntry = 0 or NaN
- [x] Fix GOLD epic: GOLD on Capital.com = 4345 (CFD pricing, correct) — no change needed
- [x] Fix NASDAQ epic: US100 on Capital.com = 30210 (CFD pricing, correct) — no change needed
- [x] Fix getRiskSettings fallback: changed hardcoded 72 to 45 in both fallback locations
- [x] Fix confidence always showing 55%: removed effectiveThreshold from prompt rule #8 (AI was anchoring to it)
- [x] Add price sanity check: warn if AI entry estimate deviates >20% from live price (uses live price)
- [x] Verified GOLD/NASDAQ epics via live API call — both correct (CFD pricing)

## Round 21 — 3 Profit-Enhancement Strategies
- [x] Fix 1 — Risk:Reward 1:2: enforce TP = 2× SL in AI prompt for both analyzeMarket and analyzeInstrument
- [x] Fix 1 — Risk:Reward 1:2: add post-processing guard in executeDecision — auto-recalculate TP if R:R < 1.5
- [x] Fix 2 — Trailing Stop Loss: add stopLoss + takeProfit columns to trades table (schema + SQL migration)
- [x] Fix 2 — Trailing Stop Loss: implement trailing stop logic in position monitoring loop (break-even at 1R, then trail)
- [x] Fix 3 — ATR Position Sizing: calculateATRPositionSize() in engineIntelligence.ts
- [x] Fix 3 — ATR Position Sizing: risk 1% of balance per trade, size = (balance × 0.01) / (ATR × 1.5)
- [x] Save stopLoss + takeProfit in DB when recording new trade
- [x] 77/77 tests passing (added 4 new ATR position sizing tests), TypeScript 0 errors

## Round 22 — DB Error Fix + Daily Loss Limit
- [x] Fix critical DB error: 'Unknown column createdAt' — removed redundant createdAt from trades table (use openedAt)
- [x] Fix daily loss limit: only count CLOSED trades from today (not all historical losses)
- [x] Increase dailyLossLimitPct to 99% in DB (temporary — allows engine to run today)

## Round 23 — Live-Price SL/TP Anchor + Daily Loss Fix
- [x] Fix daily loss limit: only count trades closed TODAY (not all-time losses)
- [x] Fix live-price SL/TP anchor: recalculate SL/TP from live price before placing order
- [x] Fix invalid.takeprofit.maxvalue error from Capital.com (TP was too far from live price)

## Round 24 — Final Review + Self-Signed Cert Fix
- [x] Fix self-signed cert error on gbksoft.com client sentiment endpoint
  - Switched getClientSentiment() in engineIntelligence.ts to use capitalcom.ts's authenticated path
  - No more self-signed cert errors — uses same session/auth as all other Capital.com calls
- [x] Fix 0% confidence filter: reject BUY/SELL opportunities with confidence=0 before execution
- [x] Create PROJECT_CONTEXT.md with full technical context for future sessions
- [x] Copy project to shared workspace (/mnt/desktop/HjCapital/Code/)
- [x] 77/77 tests passing, TypeScript 0 errors

## Round 25 — Critical Security & Data Integrity Fixes

- [x] Fix DB close bug: add tradeId filter in closeTrade() — currently updates ALL open trades with same PnL
- [x] Fix Trailing Stop: send actual SL update to Capital.com API (currently only updates DB, not broker)
- [x] Fix Daily Loss Limit: include unrealized PnL from open positions in daily loss calculation
- [x] Reduce dailyLossLimitPct from 99% to 45% in DB
- [x] Fix Ensemble majority logic: with 2 models, "majority" is impossible — update agreement logic (unanimous=both agree, split=disagree, majority reserved for 3+ models)
- [x] 77/77 tests still passing after fixes

## Round 26 — Confidence Threshold Auto-Escalation Fix

- [x] Fix: confidence threshold auto-escalates to 95% when win rate < 40% — blocks ALL trades
- [x] Cap the max auto-escalation at 65% (not 95%) to allow trades to continue
- [x] Engine never auto-stops due to win rate — only raises threshold to 65% (high-confidence mode)
- [x] 77/77 tests still passing after fix
