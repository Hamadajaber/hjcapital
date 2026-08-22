export type SignalDirection = "BUY" | "SELL";

/**
 * A 5-minute trigger can be either a pullback/reversal or controlled momentum
 * in the higher-timeframe direction. Requiring only pullbacks caused a strong
 * trend to produce no entry for extended periods.
 */
export function hasValidFiveMinuteTrigger(
  direction: SignalDirection,
  rsi: number,
  hasDirectionalPattern: boolean
): boolean {
  if (!Number.isFinite(rsi)) return hasDirectionalPattern;
  if (hasDirectionalPattern) return true;

  if (direction === "BUY") {
    const bullishPullback = rsi < 48;
    const bullishContinuation = rsi >= 52 && rsi <= 68;
    return bullishPullback || bullishContinuation;
  }

  const bearishBounce = rsi > 52;
  const bearishContinuation = rsi >= 32 && rsi <= 48;
  return bearishBounce || bearishContinuation;
}
