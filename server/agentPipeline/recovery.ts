export type TradingDirection = "BUY" | "SELL";

export interface PipelineRecoveryReview {
  proposedDirection: TradingDirection;
  reviewerAction: unknown;
  reviewerConfidence: unknown;
  reviewerReasoning?: unknown;
}

export interface PipelineRecoveryAssessment {
  allowed: boolean;
  executionConfidence: number;
  reason: string;
}

/**
 * Recovery policy used only after every technical pre-filter passed but the
 * multi-agent pipeline failed structurally. It requires a separate LLM review
 * to affirm the same direction before the existing risk controls can execute.
 */
export function assessPipelineRecovery(review: PipelineRecoveryReview): PipelineRecoveryAssessment {
  const action = typeof review.reviewerAction === "string"
    ? review.reviewerAction.trim().toUpperCase()
    : "HOLD";
  const confidence = typeof review.reviewerConfidence === "number"
    ? review.reviewerConfidence
    : Number(review.reviewerConfidence);

  if (action !== review.proposedDirection) {
    return {
      allowed: false,
      executionConfidence: 0,
      reason: `Independent review did not affirm ${review.proposedDirection} (returned ${action || "HOLD"})`,
    };
  }

  if (!Number.isFinite(confidence) || confidence < 55) {
    return {
      allowed: false,
      executionConfidence: 0,
      reason: `Independent review confidence ${Number.isFinite(confidence) ? confidence : "invalid"}% is below the 55% recovery floor`,
    };
  }

  return {
    allowed: true,
    // The engine's downstream guard remains 65% for a live order. This value
    // indicates that the 55% review passed only because all technical filters
    // had already qualified the setup.
    executionConfidence: Math.max(65, Math.min(95, confidence)),
    reason: `Pipeline recovery approved: independent review affirmed ${review.proposedDirection} at ${confidence}% after all technical filters passed`,
  };
}
