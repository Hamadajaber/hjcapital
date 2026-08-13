export type DisplayTradingMode = "paper" | "live";

export function resolveDisplayTradingMode(
  portfolioMode: unknown,
  engineStatus?: { isRunning?: boolean; mode?: unknown } | null
): DisplayTradingMode {
  if (engineStatus?.isRunning && engineStatus.mode === "live") return "live";
  if (engineStatus?.isRunning && engineStatus.mode === "paper") return "paper";
  return portfolioMode === "live" ? "live" : "paper";
}
