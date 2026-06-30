# HJ Capital Trading Standards V1 (Aggressive Profile)

**Objective:** Transform the engine from high-frequency/low-quality (150 trades, 31% win rate) to low-frequency/high-conviction, tailored for a $2,000 live account seeking aggressive growth while strictly protecting capital.

## 1. Instrument Universe (Strict Culling)
*Rationale: Remove persistent losers and highly correlated pairs to reduce noise.*
- **Remove `NASDAQ`:** Contradicts context, caused -$106 loss.
- **Remove `USDJPY`:** Caused -$63 loss, erratic behavior with current ATR.
- **Remove `XAGUSD` (Silver):** Highly correlated with Gold but more volatile and lower liquidity.
- **Core Universe Reduced to 6 Elite Instruments:**
  `EURUSD`, `GBPUSD`, `GOLD`, `US500`, `GER40`, `ETHUSD`

## 2. Conviction & Entry Quality (The Filter)
*Rationale: Force the AI to only take trades it is highly confident in.*
- **Minimum Confidence Threshold:** Raised from `55%` to **`65%`** (Hard floor).
- **Ensemble Agreement:** If AI models disagree (split vote), confidence is penalized. Trades below 65% are outright rejected, not just downsized.

## 3. Position Sizing (Fixed Fractional ATR)
*Rationale: Standardize risk so no single trade can blow the account.*
- **Risk Per Trade:** Fixed at **`1.0%`** of current balance (~$20 risk on $2,000).
- **Max Position Size Cap:** Reduced from `2.0` to **`1.0`** unit max to prevent catastrophic leverage on high-value indices.

## 4. Drawdown & Daily Limits (Capital Preservation)
*Rationale: Stop the bleeding early on bad days.*
- **Daily Loss Limit:** Set to **`1.5%`** of capital (~$30 on $2,000). If hit, engine stops opening new trades for the day.
- **Trailing Drawdown Protection:** Maintained at **`5.0%`** from all-time peak balance.
- **Cooldown Period:** Increased from 60 mins to **`120 mins`** after a losing trade on the same instrument.

## 5. Trade Management (Aggressive Profit Taking)
*Rationale: "Any absolute profit is better than a percentage." Lock in gains faster.*
- **Trailing Stop Trigger 1:** Move to Breakeven at **`40%`** of target (was 50%).
- **Trailing Stop Trigger 2:** Move to +20% profit at **`60%`** of target (was 75%).
- **Risk:Reward Ratio:** Maintained at minimum `1:2`.
