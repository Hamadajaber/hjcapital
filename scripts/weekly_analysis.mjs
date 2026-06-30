import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// All live trades
const [trades] = await conn.execute(`
  SELECT id, instrument, direction, status, openPrice, closePrice, pnl, size,
         aiConfidence, mode, openedAt, closedAt, stopLoss, takeProfit, closeReason,
         TIMESTAMPDIFF(MINUTE, openedAt, closedAt) as duration_min
  FROM trades
  WHERE mode = 'live'
  ORDER BY openedAt ASC
`);

// Sessions
const [sessions] = await conn.execute(`
  SELECT id, status, mode, startBalance, sessionPnl, totalTrades, winningTrades, startedAt, stoppedAt, stopReason
  FROM auto_trade_session
  WHERE mode = 'live'
  ORDER BY startedAt ASC
`);

// AI lessons
const [lessons] = await conn.execute(`
  SELECT instrument, direction, pnl, wasCorrect, aiVerdict, lessonText, marketConditions, createdAt, mode
  FROM trade_lessons
  WHERE mode = 'live'
  ORDER BY createdAt ASC
`);

// Portfolio
const [portfolio] = await conn.execute(`SELECT * FROM portfolio LIMIT 1`);

// Risk settings
const [risk] = await conn.execute(`SELECT * FROM risk_settings LIMIT 1`);

// Engine intelligence
const [intel] = await conn.execute(`SELECT * FROM engine_intelligence LIMIT 1`);

console.log('=== PORTFOLIO ===');
console.log(JSON.stringify(portfolio, null, 2));

console.log('\n=== RISK SETTINGS ===');
console.log(JSON.stringify(risk, null, 2));

console.log('\n=== ENGINE INTELLIGENCE ===');
console.log(JSON.stringify(intel, null, 2));

console.log('\n=== SESSIONS ===');
console.log(JSON.stringify(sessions, null, 2));

console.log('\n=== TRADES ===');
console.log(JSON.stringify(trades, null, 2));

console.log('\n=== AI LESSONS ===');
console.log(JSON.stringify(lessons, null, 2));

await conn.end();
