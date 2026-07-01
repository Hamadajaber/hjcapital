/**
 * Maps TradingAgents 5-tier ratings to HJ Capital trade actions.
 */
import type { PortfolioRating, TraderAction } from "./schemas";

const BULLISH: PortfolioRating[] = ["Buy", "Overweight"];
const BEARISH: PortfolioRating[] = ["Sell", "Underweight"];

export function ratingToDirection(
  rating: PortfolioRating,
  proposedDirection?: "BUY" | "SELL"
): "BUY" | "SELL" | "HOLD" {
  if (BULLISH.includes(rating)) return "BUY";
  if (BEARISH.includes(rating)) return "SELL";
  if (rating === "Hold" && proposedDirection) return proposedDirection;
  return "HOLD";
}

export function traderActionToDirection(action: TraderAction): "BUY" | "SELL" | "HOLD" {
  if (action === "Buy") return "BUY";
  if (action === "Sell") return "SELL";
  return "HOLD";
}

/** Confidence derived from rating strength (TradingAgents has no numeric score). */
export function ratingToConfidence(
  rating: PortfolioRating,
  proposedDirection?: "BUY" | "SELL"
): number {
  const map: Record<PortfolioRating, number> = {
    Buy: 82,
    Overweight: 72,
    Hold: proposedDirection ? 68 : 0,
    Underweight: 72,
    Sell: 82,
  };
  return map[rating];
}

export function parseRatingFromMarkdown(text: string): PortfolioRating | null {
  const match = text.match(/\*\*Rating\*\*:\s*(Buy|Overweight|Hold|Underweight|Sell)/i);
  if (!match) return null;
  const raw = match[1];
  const normalized =
    raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (normalized === "Underweight" || normalized === "Overweight") return normalized;
  if (["Buy", "Hold", "Sell"].includes(normalized)) return normalized as PortfolioRating;
  return null;
}
