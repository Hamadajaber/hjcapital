import mysql from 'mysql2/promise';
import fs from 'fs';

const url = process.env.DATABASE_URL;

async function run() {
  const conn = await mysql.createConnection(url);

  const [trades] = await conn.execute(
    'SELECT * FROM trades ORDER BY openedAt ASC'
  );
  const [lessons] = await conn.execute(
    'SELECT * FROM trade_lessons ORDER BY id DESC LIMIT 100'
  );
  const [portfolio] = await conn.execute('SELECT * FROM portfolio LIMIT 1');
  const [risk] = await conn.execute('SELECT * FROM risk_settings LIMIT 1');
  const [sessions] = await conn.execute(
    'SELECT * FROM auto_trade_session ORDER BY id DESC LIMIT 20'
  );

  const data = { trades, lessons, portfolio, risk, sessions };
  fs.writeFileSync('/tmp/full_trade_data.json', JSON.stringify(data, null, 2));
  
  console.log('=== SUMMARY ===');
  console.log('Total trades:', trades.length);
  
  const closed = trades.filter(t => t.status === 'closed' && t.pnl !== null);
  const wins = closed.filter(t => parseFloat(t.pnl) > 0);
  const losses = closed.filter(t => parseFloat(t.pnl) <= 0);
  const totalPnl = closed.reduce((s, t) => s + parseFloat(t.pnl || 0), 0);
  
  console.log('Closed trades:', closed.length);
  console.log('Wins:', wins.length, '| Losses:', losses.length);
  console.log('Win rate:', closed.length ? ((wins.length / closed.length) * 100).toFixed(1) + '%' : 'N/A');
  console.log('Total P&L: $' + totalPnl.toFixed(2));
  
  // By instrument
  const byInstrument = {};
  for (const t of closed) {
    const inst = t.instrument;
    if (!byInstrument[inst]) byInstrument[inst] = { pnl: 0, count: 0, wins: 0 };
    byInstrument[inst].pnl += parseFloat(t.pnl || 0);
    byInstrument[inst].count++;
    if (parseFloat(t.pnl) > 0) byInstrument[inst].wins++;
  }
  
  console.log('\n=== P&L BY INSTRUMENT ===');
  Object.entries(byInstrument)
    .sort((a, b) => a[1].pnl - b[1].pnl)
    .forEach(([inst, d]) => {
      console.log(`${inst}: $${d.pnl.toFixed(2)} | ${d.count} trades | WR: ${((d.wins/d.count)*100).toFixed(0)}%`);
    });

  // By direction
  const byDir = { BUY: { pnl: 0, count: 0, wins: 0 }, SELL: { pnl: 0, count: 0, wins: 0 } };
  for (const t of closed) {
    const dir = t.direction?.toUpperCase() || 'BUY';
    if (!byDir[dir]) byDir[dir] = { pnl: 0, count: 0, wins: 0 };
    byDir[dir].pnl += parseFloat(t.pnl || 0);
    byDir[dir].count++;
    if (parseFloat(t.pnl) > 0) byDir[dir].wins++;
  }
  console.log('\n=== P&L BY DIRECTION ===');
  for (const [dir, d] of Object.entries(byDir)) {
    if (d.count > 0) console.log(`${dir}: $${d.pnl.toFixed(2)} | ${d.count} trades | WR: ${((d.wins/d.count)*100).toFixed(0)}%`);
  }

  // By confidence bucket
  const confBuckets = { '45-55': { pnl: 0, count: 0, wins: 0 }, '55-65': { pnl: 0, count: 0, wins: 0 }, '65-75': { pnl: 0, count: 0, wins: 0 }, '75+': { pnl: 0, count: 0, wins: 0 } };
  for (const t of closed) {
    const conf = parseFloat(t.aiConfidence || 0) * 100;
    let bucket;
    if (conf < 55) bucket = '45-55';
    else if (conf < 65) bucket = '55-65';
    else if (conf < 75) bucket = '65-75';
    else bucket = '75+';
    confBuckets[bucket].pnl += parseFloat(t.pnl || 0);
    confBuckets[bucket].count++;
    if (parseFloat(t.pnl) > 0) confBuckets[bucket].wins++;
  }
  console.log('\n=== P&L BY AI CONFIDENCE ===');
  for (const [bucket, d] of Object.entries(confBuckets)) {
    if (d.count > 0) console.log(`${bucket}%: $${d.pnl.toFixed(2)} | ${d.count} trades | WR: ${((d.wins/d.count)*100).toFixed(0)}%`);
  }

  // Close reason analysis
  const byReason = {};
  for (const t of closed) {
    const r = t.closeReason || 'unknown';
    if (!byReason[r]) byReason[r] = { pnl: 0, count: 0 };
    byReason[r].pnl += parseFloat(t.pnl || 0);
    byReason[r].count++;
  }
  console.log('\n=== P&L BY CLOSE REASON ===');
  for (const [r, d] of Object.entries(byReason)) {
    console.log(`${r}: $${d.pnl.toFixed(2)} | ${d.count} trades`);
  }

  // Worst 10 trades
  console.log('\n=== WORST 10 TRADES ===');
  closed.sort((a, b) => parseFloat(a.pnl) - parseFloat(b.pnl)).slice(0, 10).forEach(t => {
    console.log(`${t.instrument} ${t.direction} | P&L: $${parseFloat(t.pnl).toFixed(2)} | Conf: ${(parseFloat(t.aiConfidence||0)*100).toFixed(0)}% | Reason: ${t.closeReason} | ${t.openedAt}`);
  });

  // Best 5 trades
  console.log('\n=== BEST 5 TRADES ===');
  closed.sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl)).slice(0, 5).forEach(t => {
    console.log(`${t.instrument} ${t.direction} | P&L: $${parseFloat(t.pnl).toFixed(2)} | Conf: ${(parseFloat(t.aiConfidence||0)*100).toFixed(0)}% | Reason: ${t.closeReason}`);
  });

  // Recent lessons
  console.log('\n=== RECENT AI LESSONS ===');
  lessons.slice(0, 10).forEach(l => {
    console.log(`[${l.instrument}] ${l.lesson || l.content || JSON.stringify(l)}`);
  });

  console.log('\nData saved to /tmp/full_trade_data.json');
  await conn.end();
}

run().catch(console.error);
