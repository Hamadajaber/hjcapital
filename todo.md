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

## Round 27 — Floating Point & Invalid Open Level Fix

- [x] Fix floating point entry price (1.4100000000000001) — getOpenPositions() now rounds all prices to 5dp
- [x] Fix "invalid open level data" auto-close — removed auto-close, openLevel now normalized in capitalcom.ts
- [x] Fix error.invalid.stoploss.maxvalue — added SL direction guard (BUY SL must be below price)
- [x] 77/77 tests still passing after fix

## Round 28 — Strategy Overhaul: Trend Following + MTF Confirmation

- [x] Define new strategy: Trend Following + Multi-Timeframe Confirmation (3 rules must ALL pass)
- [x] Fix 10 instruments: EURUSD, GBPUSD, USDJPY, AUDUSD, GOLD, XAGUSD, US500, NASDAQ, GER40, ETHUSD (no OIL_CRUDE)
- [x] Session filter: AI prompt includes session context (London/NY/Asian) for directional bias
- [x] Rule 1: EMA50 vs EMA200 on 4H (trend direction filter)
- [x] Rule 2: MACD histogram + RSI on 1H (entry confirmation)
- [x] Rule 3: Candlestick pattern or RSI momentum on 5m (trigger)
- [x] Risk: ATR-based SL/TP (1.5x ATR stop, 3x ATR target = 2:1 R:R minimum)
- [x] AI role: confirmation only — reviews 3-rule signal, provides confidence + entry/SL/TP, can veto
- [x] 77/77 tests still passing after overhaul, TypeScript 0 errors

## Round 28 — Test Results (Strategy Test)
- [x] 108/108 tests passing (30 new MTF strategy tests added)
- [x] Fixed SL/TP calculation: validates AI levels before using them, falls back to 1% ATR if invalid
- [x] Fixed TP negative value bug: final sanity check ensures TP > 0
- [x] Fixed 4H candles: increased from 30 to 250 for EMA200 calculation
- [x] Live engine cycle confirmed: EMA200 working (EURUSD down, USDJPY up, etc.)
- [x] No more error.positive.createpositionrequest.profitLevel errors

## Round 29 — Test & Enhancement Pass
- [x] Add Asian session filter: block trading 22:00-07:00 UTC (01:00-10:00 GMT+3) — low liquidity
- [x] Add session-aware logging: Decision Log shows Arabic message when Asian session is active
- [x] Improve Rule 2: MACD hist > -0.0005 (not strictly > 0), RSI bands widened (35-72 bull, 28-65 bear)
- [x] Add Rule 3 enhancement: Doji + Hammer + Shooting Star patterns included, RSI bands 48/52
- [x] Backtest panel updated: all 10 instruments + MTF Confirmation as default strategy
- [x] Asian session filter logs to Decision Log (no Telegram spam — silent skip)
- [x] Engine scans all open markets from CORE_INSTRUMENTS (7-10 depending on market hours — correct behavior)
- [x] 108/108 tests passing, TypeScript 0 errors

## Round 30 — Full Reset, Fix & Performance Enhancement
- [x] Inspected live logs — engine working, Asian session filter active, XAGUSD SELL signal found at 70%
- [x] TP calculation reviewed — existing guards are solid, improved AI prompt with explicit examples
- [x] SL direction guard already in place — verified working correctly
- [x] ATR-based SL/TP already implemented — reviewed and confirmed correct
- [x] AI prompt enhanced: shows live price + explicit numeric examples for SL/TP direction
- [x] EMA gap filter added: skip instruments where EMA50/200 gap < 0.15% (flat/ranging markets)
- [x] Rule 1 tightened: EMA gap must be > 0.15% — prevents false signals in ranging markets
- [x] 3/3 rules already required — confirmed in analyzeInstrument logic
- [x] Telegram already shows Rule 1/2/3 status in each signal (rulesPassedSummary)
- [x] 108/108 tests passing, TypeScript 0 errors
- [x] Risk Settings presets updated: Conservative 65%/0.5%, Balanced 55%/0.75%, Aggressive 45%/1%

## Round 31 — Apply 3 Suggested Improvements
- [x] Add Trade History comparison view: before vs after Round 28 strategy (Jun 18 cutoff)
- [x] Add auto-apply Balanced preset when win rate > 50% (smart risk auto-adjustment)
- [x] Add Weekly Friday Telegram summary: trades count, win rate, total P&L
- [x] Run 108+ tests and confirm all passing

## Round 32 — SL/TP Bug Investigation & Fix
- [x] Investigate SL/TP calculation flow: AI prompt → parseAISignal → executeSignal → Capital.com order
- [x] Identify why GOLD shows SL=45.01 (absolute offset) and AUDUSD shows SL=0.00700 (relative offset)
- [x] Fix SL/TP to always use absolute price levels for Capital.com API
- [x] Verify fix with TypeScript check and 108+ tests

## Round 33 — Position Sync Fix
- [x] Close orphaned DB positions (GOLD, US500, USDJPY) that Capital.com already closed
- [x] Add automatic position reconciliation to runCycle every cycle
- [x] Test and save checkpoint

## Round 34 — 3 Improvements
- [x] Fetch real close price from Capital.com during reconciliation to compute actual P&L
- [x] Add Reconciliation Dashboard tab in Trade History page
- [x] Add SL/TP Validation Guard before executing new trades
- [x] Run 108+ tests and confirm all passing

## Round 35 — Precise Market Hours Schedule
- [x] Research exact Capital.com trading hours for all 10 instruments
- [x] Implement precise per-instrument isMarketOpen() replacing approximate logic
- [x] Add XAGUSD Friday 17:00 UTC close + Sunday 22:00 UTC open (+ all other instruments)
- [x] Add Market Hours dedicated page with live open/closed status for all instruments
- [x] Run 108+ tests and confirm all passing

## Round 36 — Comprehensive Code Review & Fixes
- [x] Verified evaluateClosedTrade is called in analyzeForClose path (via executeDecision)
- [x] Fixed: Reconciliation close path now calls evaluateClosedTrade (AI learns from broker-closed positions)
- [x] Fixed: Manual close path (routers.ts trades.close) now calls evaluateClosedTrade
- [x] Fixed: analyzeMarket prompt now uses CORE_INSTRUMENTS instead of hardcoded list with OIL_CRUDE
- [x] Fixed: Added market hours guard before closePosition to prevent SILVER 400 error during daily break (21:00-22:00 UTC)
- [x] Verified gatherMarketContext fetches all 3 timeframes (5m, 1H, 4H) correctly
- [x] Verified AI prompt quality in analyzeInstrument — SL/TP rules, examples, and confirmation logic are correct
- [x] TypeScript: 0 errors
- [x] Tests: 108/108 passing

## Round 37 — Three Improvement Features
- [x] Feature 1: Technical SL/TP fallback close guard — closes position immediately if price breaches DB SL/TP without waiting for AI (safety net for broker-side order failures, paper mode, or slippage)
- [x] Feature 2: Live balance cache per cycle — fetches Capital.com balance once per runCycle() and passes it to all analyzeInstrument() calls via new `accountBalance` parameter for accurate ATR position sizing
- [x] Feature 3: AI Lessons Learned page (/lessons) — full-page view with instrument filter, correct/incorrect filter, summary stats (total/win rate/correct/P&L), expandable lesson cards with AI verdict and market context
- [x] Added /lessons route to App.tsx and Lightbulb nav item to HJLayout sidebar
- [x] TypeScript: 0 errors | Tests: 108/108 passing

## Round 38 — Three Next-Step Improvements
- [x] Add "View All Lessons →" button in AutoTrade page lessons panel linking to /lessons
- [x] Add 0.1% tolerance to Technical SL/TP Guard to avoid premature close from spread/noise
- [x] Add AI Lessons stats card to Dashboard (last lesson text + overall accuracy %)

## Round 39 — Three Next-Step Improvements
- [x] Fix Reconciliation error.invalid.from — fix the date format sent to Capital.com transaction history API
- [x] Add Lesson Trends Chart to /lessons page — weekly accuracy % over time line chart
- [x] Add Paper/Live mode filter to /lessons page

## Round 39 — Three Next-Step Improvements
- [x] Fix Reconciliation error.invalid.from: changed lookback from 48h to 23h (Capital.com max is 24h), fixed date format to YYYY-MM-DDTHH:MM:SS
- [x] Add mode column to trade_lessons table (paper/live) + DB migration pushed (0010_numerous_bulldozer.sql)
- [x] Pass mode to evaluateClosedTrade in all 3 call sites (main close, reconciliation, manual close)
- [x] Update getRecentLessons() in db.ts to support mode filter (uses and() for combined conditions)
- [x] Update getLessons tRPC procedure to accept mode parameter
- [x] Add Weekly Accuracy Trend Chart to /lessons page (Recharts LineChart, groups by ISO week, last 8 weeks)
- [x] Add Paper/Live mode filter to /lessons page (client-side mode pills + server-side mode filter)
- [x] TypeScript: 0 errors | Tests: 108/108 passing

## Round 40 — Three Next-Step Improvements
- [x] Add Instrument Performance Comparison table in /lessons page (Win Rate per instrument)
- [x] Add Close Reason Analytics Pie Chart in Performance page (ai_close/sl_hit/tp_hit/reconciled/manual)
- [x] Improve formatLessonsForPrompt: use 5 lessons, prioritize incorrect ones (wasCorrect=false)
