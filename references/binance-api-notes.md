# Binance API Integration Notes

## Base URLs
- Futures (USDS-M): `https://fapi.binance.com`
- Testnet: `https://demo-fapi.binance.com`
- Spot: `https://api.binance.com`

## Authentication (HMAC-SHA256)
- API Key passed in header: `X-MBX-APIKEY`
- Signature: HMAC-SHA256 of `totalParams` (query string + request body) using `secretKey`
- `signature` must be the LAST parameter
- Required params: `timestamp` (ms), optional `recvWindow` (default 5000ms)

## Key Endpoints (USDS-M Futures)

### Account
- `GET /fapi/v2/balance` — account balance (SIGNED)
- `GET /fapi/v2/account` — full account info + positions (SIGNED)
- `GET /fapi/v2/positionRisk` — position information (SIGNED)

### Orders
- `POST /fapi/v1/order` — place order (SIGNED)
  - params: symbol, side (BUY/SELL), type (MARKET/LIMIT), quantity, price, stopPrice, timeInForce
  - For market: symbol, side, type=MARKET, quantity
- `DELETE /fapi/v1/order` — cancel order (SIGNED)
  - params: symbol, orderId or origClientOrderId
- `DELETE /fapi/v1/allOpenOrders` — cancel all open orders

### Close Position
- Use opposite side order with `reduceOnly=true`
- Or use `closePosition=true` with a STOP_MARKET order

### Market Data
- `GET /fapi/v1/exchangeInfo` — exchange info (lot sizes, tick sizes, filters)
- `GET /fapi/v1/ticker/price` — latest price
- `GET /fapi/v1/ticker/bookTicker` — best bid/ask
- `GET /fapi/v1/klines` — candlestick data

### Exchange Info Filters
- LOT_SIZE: minQty, maxQty, stepSize
- PRICE_FILTER: minPrice, maxPrice, tickSize
- MIN_NOTIONAL: notional (min order value)

## Instrument Mapping (Internal → Binance)
- EURUSD → Not available on Binance (forex not supported)
- GOLD → Not directly; use PAXGUSDT (gold-backed token)
- ETHUSD → ETHUSDT
- US500 → Not available (no index CFDs)
- GER40 → Not available

## Important Differences from Capital.com
1. Binance is crypto-focused — no forex, no indices, no commodities CFDs
2. Binance uses API Key + Secret (HMAC), not session-based auth
3. No session expiry — API key is permanent until revoked
4. Position close = opposite market order with reduceOnly=true
5. Lot sizes are strict — must comply with stepSize filter
6. 24/7 trading for crypto (no market hours concept for most pairs)

## Rate Limits
- IP-based weight limits (check X-MBX-USED-WEIGHT header)
- Order rate limits per account (X-MBX-ORDER-COUNT header)
- 429 = rate limited, 418 = IP banned
