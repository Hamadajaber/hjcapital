# AGENTS.md

See `PROJECT_CONTEXT.md` for the product/architecture overview and `package.json` scripts for standard commands. This file only captures durable, non-obvious operational notes.

## Cursor Cloud specific instructions

### Services
This is a single-product app. One Node process (`pnpm dev` → `tsx watch server/_core/index.ts`) runs the Express + tRPC API **and** serves the React client via Vite middleware. It listens on `PORT` (default **3000**); if 3000 is busy it silently scans up to 3019, so check the `Server running on http://localhost:<port>/` log line. There is no separate frontend server.

Standard commands (see `package.json`): `pnpm dev` (run), `pnpm check` (typecheck), `pnpm test` (vitest), `pnpm build` (prod build).

### Local database (MySQL 8 — NOT MariaDB)
- The dev DB is a local **MySQL 8** server; data lives in `/var/lib/mysql` and persists in the VM snapshot. It is **not** auto-started on boot (systemd is disabled here). Start it if `mysqladmin ping` fails:
  ```
  sudo mkdir -p /var/run/mysqld && sudo chown mysql:mysql /var/run/mysqld
  sudo mysqld --user=mysql --daemonize
  ```
- Connection is configured via `DATABASE_URL` in `.env` (`mysql://hj:hjpass@127.0.0.1:3306/hjcapital`).
- **Schema/migration gotcha (important):** the committed SQL migrations in `drizzle/` have drifted from `drizzle/schema.ts` (e.g. `risk_settings` has `dailyLossLimit`/`dailyProfitLock` in the SQL but `dailyLossLimitPct`/`stopLossPerTrade` in `schema.ts`, which is what the runtime code queries). Running the `pnpm db:push` script (`drizzle-kit generate && drizzle-kit migrate`) therefore produces a DB the app cannot query. To (re)create a working dev schema, sync `schema.ts` directly to the DB instead:
  ```
  set -a && . ./.env && set +a && pnpm exec drizzle-kit push --force
  ```
  `drizzle-kit push` cannot introspect MariaDB (throws on `checkConstraint`), which is why the dev DB uses MySQL 8.

### Environment / `.env`
- `.env` (git-ignored, repo root) is loaded by `dotenv` (server) and Vite (`VITE_*` vars). It persists in the VM snapshot.
- No env var is required for the server to *boot*, but features degrade silently without them. `DATABASE_URL` is needed for all persistence and for `drizzle-kit`.
- `VITE_OAUTH_PORTAL_URL` must be a **valid URL** — `client/src/const.ts:getLoginUrl()` calls `new URL(...)`, so an empty value crashes the Login page render.

### Auth (local dev bypass)
Login normally uses the external Manus OAuth server (unavailable here). Local dev bypasses it:
1. A `users` row must exist with `openId = OWNER_OPEN_ID` and `role = 'admin'`.
2. The browser sends an `app_session_id` cookie containing an HS256 JWT `{ openId, appId (= VITE_APP_ID), name }` signed with `JWT_SECRET` (see `server/_core/sdk.ts`). `authenticateRequest` verifies the JWT and looks the user up by `openId` (skipping the external OAuth call when the user already exists).

To (re)generate a dev session cookie value:
```
set -a && . ./.env && set +a
node --input-type=module -e 'import { SignJWT } from "jose"; const s=new TextEncoder().encode(process.env.JWT_SECRET); console.log(await new SignJWT({openId:process.env.OWNER_OPEN_ID,appId:process.env.VITE_APP_ID,name:"Hamada"}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setExpirationTime(Math.floor(Date.now()/1000)+31536000).sign(s));'
```
Set it in the browser via `document.cookie = "app_session_id=<token>; path=/"` (cookies are shared across ports on `localhost`, so a helper page on another port works too).

### Auto-trade engine
On boot a market-hours watcher auto-starts the trading engine in **LIVE mode** (`server/_core/index.ts`). Without `CAPITAL_COM_*` credentials it fails Capital.com auth gracefully and places no trades. Do **not** add real Capital.com credentials unless you intend to place real live trades.

### Tests
`pnpm test` (vitest) does not auto-load `.env`. DB-dependent tests in `server/hj-capital.test.ts` require `DATABASE_URL` exported in the shell **and** a schema synced via `drizzle-kit push`. Run with env loaded: `set -a && . ./.env && set +a && pnpm test`.
