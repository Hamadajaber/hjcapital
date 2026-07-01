import type { AnalystContext } from "./schemas";

export interface PipelineMarketInput {
  instrument: string;
  technicalSummary5m?: string;
  technicalSummary1h?: string;
  technicalSummary4h?: string;
  regimeDescription?: string;
  mtfSignalSummary: string;
  proposedDirection: "BUY" | "SELL";
  sentimentText?: string;
  newsHeadlines?: string[];
  clientSentiment?: string;
  lessons?: string;
  livePrice?: number;
  session?: string;
}

function inferAssetType(instrument: string): AnalystContext["assetType"] {
  const upper = instrument.toUpperCase();
  if (["GOLD", "XAGUSD", "SILVER", "OIL_CRUDE"].some((x) => upper.includes(x))) {
    return "commodity";
  }
  if (["US500", "GER40", "US100", "NASDAQ", "US30"].some((x) => upper.includes(x))) {
    return "index";
  }
  if (["BTC", "ETH", "CRYPTO"].some((x) => upper.includes(x))) {
    return "crypto";
  }
  return "forex";
}

/**
 * Builds analyst reports from HJ Capital's existing data feeds.
 * Replaces TradingAgents' yfinance/Alpha Vantage tool nodes for CFD instruments.
 */
export function buildAnalystContext(input: PipelineMarketInput): AnalystContext {
  const marketReport = [
    `Instrument: ${input.instrument}`,
    input.session ? `Session: ${input.session}` : "",
    input.livePrice ? `Live price: ${input.livePrice}` : "",
    "",
    "MULTI-TIMEFRAME TECHNICAL ANALYSIS:",
    input.technicalSummary4h ?? "No 4H data",
    input.technicalSummary1h ?? "No 1H data",
    input.technicalSummary5m ?? "No 5M data",
    "",
    input.regimeDescription ? `Market regime: ${input.regimeDescription}` : "",
    "",
    "MTF SIGNAL (rules-based):",
    input.mtfSignalSummary,
    `Proposed direction from rules: ${input.proposedDirection}`,
  ]
    .filter(Boolean)
    .join("\n");

  const sentimentReport =
    input.sentimentText?.trim() ||
    "No structured sentiment data — infer from news headlines only.";

  const newsReport =
    input.newsHeadlines && input.newsHeadlines.length > 0
      ? input.newsHeadlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join("\n")
      : "No recent headlines available.";

  const fundamentalsReport =
    inferAssetType(input.instrument) === "forex"
      ? "Forex/CFD pair — no company fundamentals. Use macro drivers, central bank policy, and yield differentials."
      : inferAssetType(input.instrument) === "commodity"
        ? "Commodity CFD — focus on USD strength, inflation data, and supply/demand headlines."
        : inferAssetType(input.instrument) === "index"
          ? "Index CFD — focus on earnings season, Fed policy, sector rotation, and macro data."
          : "Crypto CFD — focus on risk appetite, BTC correlation, and regulatory headlines.";

  return {
    instrument: input.instrument,
    assetType: inferAssetType(input.instrument),
    marketReport,
    sentimentReport,
    newsReport,
    fundamentalsReport,
    technicalSignal: input.mtfSignalSummary,
    clientSentiment: input.clientSentiment,
    lessons: input.lessons,
    livePrice: input.livePrice,
    proposedDirection: input.proposedDirection,
  };
}

export function instrumentContextBlock(ctx: AnalystContext): string {
  return [
    `**Instrument**: ${ctx.instrument}`,
    `**Asset type**: ${ctx.assetType}`,
    ctx.livePrice != null ? `**Live price**: ${ctx.livePrice}` : "",
    ctx.proposedDirection ? `**Rules-based signal**: ${ctx.proposedDirection}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
