import { config } from 'dotenv';

const apiKey = process.env.CAPITAL_COM_API_KEY;
const email = process.env.CAPITAL_COM_EMAIL;
const password = process.env.CAPITAL_COM_PASSWORD;

if (!apiKey || !email || !password) {
  console.error('Missing Capital.com credentials in environment');
  process.exit(1);
}

// Step 1: Create session
const sessionRes = await fetch('https://api-capital.backend-capital.com/api/v1/session', {
  method: 'POST',
  headers: {
    'X-CAP-API-KEY': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ identifier: email, password: password })
});

const sessionData = await sessionRes.json();
console.log('Session status:', sessionRes.status);

if (!sessionRes.ok) {
  console.log('Session error:', JSON.stringify(sessionData, null, 2));
  process.exit(1);
}

const cst = sessionRes.headers.get('CST');
const token = sessionRes.headers.get('X-SECURITY-TOKEN');

console.log('Session created successfully');
console.log('Account info from session:', JSON.stringify(sessionData, null, 2));

// Step 2: Get accounts
const accRes = await fetch('https://api-capital.backend-capital.com/api/v1/accounts', {
  headers: {
    'X-CAP-API-KEY': apiKey,
    'CST': cst,
    'X-SECURITY-TOKEN': token
  }
});

const accData = await accRes.json();
console.log('\nAccounts:', JSON.stringify(accData, null, 2));
