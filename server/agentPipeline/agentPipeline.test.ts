import { describe, expect, it } from "vitest";
import { ratingToConfidence, ratingToDirection, parseRatingFromMarkdown } from "./rating";
import { renderPortfolioDecision, PortfolioDecisionSchema } from "./schemas";
import { buildAnalystContext } from "./contextBuilder";
import { getAgentPipelineConfig } from "./config";

describe("agentPipeline/rating", () => {
  it("maps bullish ratings to BUY", () => {
    expect(ratingToDirection("Buy")).toBe("BUY");
    expect(ratingToDirection("Overweight")).toBe("BUY");
  });

  it("maps bearish ratings to SELL", () => {
    expect(ratingToDirection("Sell")).toBe("SELL");
    expect(ratingToDirection("Underweight")).toBe("SELL");
  });

  it("Hold with proposed direction keeps trade alive in light mode", () => {
    expect(ratingToDirection("Hold", "BUY")).toBe("BUY");
    expect(ratingToConfidence("Hold", "BUY")).toBe(68);
  });

  it("parses rating from portfolio manager markdown", () => {
    const md = renderPortfolioDecision({
      rating: "Buy",
      executive_summary: "Enter long.",
      investment_thesis: "Trend aligned.",
    });
    expect(parseRatingFromMarkdown(md)).toBe("Buy");
  });
});

describe("agentPipeline/schemas", () => {
  it("validates portfolio decision shape", () => {
    const parsed = PortfolioDecisionSchema.parse({
      rating: "Buy",
      executive_summary: "Go long on trend.",
      investment_thesis: "4H EMA stack bullish.",
      price_target: 1.09,
      time_horizon: "intraday",
    });
    expect(parsed.rating).toBe("Buy");
  });
});

describe("agentPipeline/contextBuilder", () => {
  it("builds analyst context from HJ market input", () => {
    const ctx = buildAnalystContext({
      instrument: "EURUSD",
      mtfSignalSummary: "Trend up, MACD bullish",
      proposedDirection: "BUY",
      technicalSummary1h: "RSI 55",
      newsHeadlines: ["ECB holds rates"],
      livePrice: 1.0845,
    });
    expect(ctx.assetType).toBe("forex");
    expect(ctx.marketReport).toContain("EURUSD");
    expect(ctx.newsReport).toContain("ECB");
  });
});

describe("agentPipeline/config", () => {
  it("defaults to off when env not set", () => {
    const prev = process.env.HJ_AGENT_PIPELINE_MODE;
    delete process.env.HJ_AGENT_PIPELINE_MODE;
    expect(getAgentPipelineConfig().enabled).toBe(false);
    if (prev) process.env.HJ_AGENT_PIPELINE_MODE = prev;
  });
});
