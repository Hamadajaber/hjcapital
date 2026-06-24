/**
 * Sync Check Script — compares Capital.com live data vs our DB
 * Run with: npx tsx scripts/sync_check.ts
 */
import { config } from "dotenv";
config();

import { getAccountBalance, getOpenPositions, getSessionTokens } from "../server/capitalcom";
import { getDb } from "../server/db";
import { trades, portfolio } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  console.log("=".repeat(60));
  console.log("HJ CAPITAL — SYNC CHECK");
  console.log("=".repeat(60));

  // 1. Create Capital.com session
  console.log("\n[1] Connecting to Capital.com...");
  await getSessionTokens(); // triggers session creation
  console.log("    ✅ Session created");

  // 2. Get Capital.com live balance
  const liveBalance = await getAccountBalance();
  console.log("\n[2] CAPITAL.COM LIVE BALANCE:");
  console.log(`    Balance:    $${liveBalance.balance}`);
  console.log(`    Available:  $${liveBalance.available}`);
  console.log(`    PnL:        $${liveBalance.pnl}`);
  console.log(`    Deposit:    $${liveBalance.deposit}`);

  // 3. Get Capital.com open positions
  const livePositions = await getOpenPositions();
  console.log(`\n[3] CAPITAL.COM OPEN POSITIONS: ${livePositions.length}`);
  livePositions.forEach((p, i) => {
    console.log(`    [${i+1}] ${p.epic} ${p.direction} | size=${p.size} | openLevel=${p.openLevel} | currentLevel=${p.currentLevel} | pnl=${p.pnl} | dealId=${p.dealId}`);
  });

  // 4. Get our DB data
  const db = await getDb();
  if (!db) { console.error("DB connection failed"); process.exit(1); }

  const dbPortfolio = await db.select().from(portfolio).limit(1);
  const dbBalance = dbPortfolio[0] ? parseFloat(dbPortfolio[0].balance) : 0;
  console.log(`\n[4] OUR DB BALANCE: $${dbBalance}`);
  console.log(`    Diff from Capital.com: $${(parseFloat(liveBalance.balance) - dbBalance).toFixed(2)}`);

  const dbOpenTrades = await db.select().from(trades).where(eq(trades.status, "open")).orderBy(desc(trades.openedAt));
  console.log(`\n[5] OUR DB OPEN TRADES: ${dbOpenTrades.length}`);
  dbOpenTrades.forEach((t, i) => {
    console.log(`    [${i+1}] ${t.instrument} ${t.direction} | size=${t.size} | entry=${t.entryPrice} | sl=${t.stopLoss} | tp=${t.takeProfit} | dealId=${t.dealId}`);
  });

  // 5. Cross-reference
  console.log("\n[6] CROSS-REFERENCE ANALYSIS:");
  const liveDealIds = new Set(livePositions.map(p => p.dealId));
  const dbDealIds = new Set(dbOpenTrades.map(t => t.dealId));

  const ghostOnBroker = livePositions.filter(p => !dbDealIds.has(p.dealId));
  const ghostInDb = dbOpenTrades.filter(t => !liveDealIds.has(t.dealId ?? ""));

  if (ghostOnBroker.length > 0) {
    console.log(`    ⚠️  GHOST POSITIONS ON CAPITAL.COM (not in our DB):`);
    ghostOnBroker.forEach(p => console.log(`       - ${p.epic} ${p.direction} dealId=${p.dealId}`));
  } else {
    console.log("    ✅ No ghost positions on Capital.com");
  }

  if (ghostInDb.length > 0) {
    console.log(`    ⚠️  ORPHAN TRADES IN DB (not on Capital.com):`);
    ghostInDb.forEach(t => console.log(`       - ${t.instrument} ${t.direction} dealId=${t.dealId}`));
  } else {
    console.log("    ✅ No orphan trades in DB");
  }

  // 6. P&L comparison
  const liveTotalPnl = livePositions.reduce((s, p) => s + parseFloat(String(p.pnl ?? 0)), 0);
  console.log(`\n[7] P&L COMPARISON:`);
  console.log(`    Capital.com open P&L: $${liveTotalPnl.toFixed(2)}`);
  console.log(`    Capital.com balance:  $${liveBalance.balance} (includes open P&L)`);
  console.log(`    Our DB balance:       $${dbBalance}`);
  console.log(`    Balance gap:          $${(parseFloat(liveBalance.balance) - dbBalance).toFixed(2)}`);

  // 7. Check last 5 closed trades in DB
  const recentClosed = await db.select().from(trades)
    .where(eq(trades.status, "closed"))
    .orderBy(desc(trades.closedAt))
    .limit(5);

  console.log(`\n[8] LAST 5 CLOSED TRADES IN DB:`);
  recentClosed.forEach((t, i) => {
    const closedAt = t.closedAt ? new Date(t.closedAt).toISOString() : "unknown";
    console.log(`    [${i+1}] ${t.instrument} ${t.direction} | pnl=$${t.pnl} | closePrice=${t.closePrice} | closedAt=${closedAt}`);
  });

  console.log("\n" + "=".repeat(60));
  console.log("SYNC CHECK COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
