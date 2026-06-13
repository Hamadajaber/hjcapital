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
