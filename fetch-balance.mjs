// Standalone script to fetch Capital.com account balance
// Uses same BASE_URL as server/capitalcom.ts

const BASE_URL = "https://api-capital.backend-capital.com";

const apiKey = process.env.CAPITAL_COM_API_KEY;
const email = process.env.CAPITAL_COM_EMAIL;
const password = process.env.CAPITAL_COM_PASSWORD;

if (!apiKey || !email || !password) {
  console.error("Missing Capital.com credentials");
  process.exit(1);
}

// Step 1: Create session
const sessionRes = await fetch(`${BASE_URL}/api/v1/session`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CAP-API-KEY": apiKey,
  },
  body: JSON.stringify({ identifier: email, password }),
});

if (!sessionRes.ok) {
  const text = await sessionRes.text();
  console.error("Auth failed:", sessionRes.status, text);
  process.exit(1);
}

const cst = sessionRes.headers.get("CST");
const token = sessionRes.headers.get("X-SECURITY-TOKEN");
const sessionBody = await sessionRes.json();

console.log("Session OK. Account type:", sessionBody.accountType);
console.log("Currency:", sessionBody.currencyIsoCode);
console.log("Client ID:", sessionBody.clientId);

// Step 2: Get accounts
const accRes = await fetch(`${BASE_URL}/api/v1/accounts`, {
  headers: {
    "Content-Type": "application/json",
    "CST": cst,
    "X-SECURITY-TOKEN": token,
  },
});

const accData = await accRes.json();

if (accData.accounts) {
  console.log("\n=== Account Balances ===");
  for (const acc of accData.accounts) {
    console.log(`\nAccount: ${acc.accountName} (${acc.accountType})`);
    console.log(`  Balance:   ${acc.balance?.balance} ${acc.preferred ? "(preferred)" : ""}`);
    console.log(`  Available: ${acc.balance?.available}`);
    console.log(`  P&L:       ${acc.balance?.pnl}`);
    console.log(`  Deposit:   ${acc.balance?.deposit}`);
    console.log(`  Status:    ${acc.status}`);
  }
} else {
  console.log("Accounts response:", JSON.stringify(accData, null, 2));
}
