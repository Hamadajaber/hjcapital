import { getDb } from './server/db.ts';
import { trades } from './drizzle/schema.ts';
import { desc } from 'drizzle-orm';

const db = await getDb();
const rows = await db.select({
  instrument: trades.instrument,
  direction: trades.direction,
  openPrice: trades.openPrice,
  aiConfidence: trades.aiConfidence,
  openedAt: trades.openedAt,
  pnl: trades.pnl,
  status: trades.status,
}).from(trades).orderBy(desc(trades.openedAt)).limit(15);

console.log('Recent trades:');
for (const r of rows) {
  console.log(`${r.instrument} ${r.direction} | entry=${r.openPrice} | confidence=${r.aiConfidence}% | pnl=${r.pnl} | ${r.status} | ${r.openedAt}`);
}
