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
