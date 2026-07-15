/**
 * Structured decision schemas — ported from TradingAgents (Pydantic → Zod).
 * Keeps the same section headers so prompts and logs stay compatible.
 */
import { z } from "zod";

export const PortfolioRatingSchema = z.enum([
  "Buy",
  "Overweight",
  "Hold",
  "Underweight",
  "Sell",
]);
export type PortfolioRating = z.infer<typeof PortfolioRatingSchema>;

export const TraderActionSchema = z.enum(["Buy", "Hold", "Sell"]);
export type TraderAction = z.infer<typeof TraderActionSchema>;

export const SentimentBandSchema = z.enum([
  "Bullish",
  "Mildly Bullish",
  "Neutral",
  "Mixed",
  "Mildly Bearish",
  "Bearish",
]);
export type SentimentBand = z.infer<typeof SentimentBandSchema>;

// Some models return strategic_actions as an array of strings — normalize to a joined string.
const _ResearchPlanRaw = z.object({
  recommendation: PortfolioRatingSchema,
  rationale: z.string(),
  strategic_actions: z.union([z.string(), z.array(z.string())]),
});

export const ResearchPlanSchema = _ResearchPlanRaw.transform((d) => ({
  ...d,
  strategic_actions: Array.isArray(d.strategic_actions)
    ? d.strategic_actions.join("; ")
    : d.strategic_actions,
}));
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const TraderProposalSchema = z.object({
  action: TraderActionSchema,
  reasoning: z.string(),
  entry_price: z.number().nullable().optional(),
  stop_loss: z.number().nullable().optional(),
  position_sizing: z.string().nullable().optional(),
});
export type TraderProposal = z.infer<typeof TraderProposalSchema>;

export const PortfolioDecisionSchema = z.object({
  rating: PortfolioRatingSchema,
  executive_summary: z.string(),
  investment_thesis: z.string(),
  price_target: z.number().nullable().optional(),
  time_horizon: z.string().nullable().optional(),
});
export type PortfolioDecision = z.infer<typeof PortfolioDecisionSchema>;

export const AnalystContextSchema = z.object({
  instrument: z.string(),
  assetType: z.enum(["forex", "index", "commodity", "crypto"]).default("forex"),
  marketReport: z.string(),
  sentimentReport: z.string(),
  newsReport: z.string(),
  fundamentalsReport: z.string().optional(),
  technicalSignal: z.string(),
  clientSentiment: z.string().optional(),
  lessons: z.string().optional(),
  livePrice: z.number().optional(),
  proposedDirection: z.enum(["BUY", "SELL"]).optional(),
});
export type AnalystContext = z.infer<typeof AnalystContextSchema>;

export function renderResearchPlan(plan: ResearchPlan): string {
  return [
    `**Recommendation**: ${plan.recommendation}`,
    "",
    `**Rationale**: ${plan.rationale}`,
    "",
    `**Strategic Actions**: ${plan.strategic_actions}`,
  ].join("\n");
}

export function renderPortfolioDecision(decision: PortfolioDecision): string {
  const parts = [
    `**Rating**: ${decision.rating}`,
    "",
    `**Executive Summary**: ${decision.executive_summary}`,
    "",
    `**Investment Thesis**: ${decision.investment_thesis}`,
  ];
  if (decision.price_target != null) {
    parts.push("", `**Price Target**: ${decision.price_target}`);
  }
  if (decision.time_horizon) {
    parts.push("", `**Time Horizon**: ${decision.time_horizon}`);
  }
  return parts.join("\n");
}
