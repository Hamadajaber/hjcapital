export type TradingDecisionReasonCode =
  | "session_filter"
  | "daily_bias"
  | "volatility_filter"
  | "ema_gap"
  | "mtf_not_confirmed"
  | "ai_veto"
  | "pipeline_recovery_veto"
  | "confidence_threshold"
  | "correlation_filter"
  | "risk_limit"
  | "other";

export function classifyTradingDecisionReason(reasoning: string): TradingDecisionReasonCode {
  const normalized = reasoning.toLowerCase();
  if (normalized.includes("session filter")) return "session_filter";
  if (normalized.includes("daily bias filter") || normalized.includes("daily bias blocked")) return "daily_bias";
  if (normalized.includes("volatility filter")) return "volatility_filter";
  if (normalized.includes("ema gap")) return "ema_gap";
  if (normalized.includes("mtf rules not met")) return "mtf_not_confirmed";
  if (normalized.includes("pipeline recovery veto")) return "pipeline_recovery_veto";
  if (normalized.includes("ai vetoed")) return "ai_veto";
  if (normalized.includes("signal below threshold") || normalized.includes("confidence")) return "confidence_threshold";
  if (normalized.includes("correlated")) return "correlation_filter";
  if (normalized.includes("risk limit") || normalized.includes("drawdown")) return "risk_limit";
  return "other";
}
