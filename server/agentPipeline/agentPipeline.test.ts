import { describe, expect, it } from "vitest";
import { ratingToConfidence, ratingToDirection, parseRatingFromMarkdown } from "./rating";
import { renderPortfolioDecision, PortfolioDecisionSchema, ResearchPlanSchema } from "./schemas";
import { buildAnalystContext } from "./contextBuilder";
import { getAgentPipelineConfig } from "./config";
import { normalizeAgentOutput } from "./llm";
import { assessPipelineRecovery } from "./recovery";
import { getOrphanedActiveSessionIds } from "../engineSessionRecovery";

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

  it("normalizes title-cased aliases and bullish recommendation labels", () => {
    const parsed = ResearchPlanSchema.parse(normalizeAgentOutput({
      Recommendation: "Bullish",
      Rationale: "The daily and hourly trends are aligned.",
      strategicActions: ["Enter on confirmation", "Place an ATR stop"],
    }));
    expect(parsed.recommendation).toBe("Buy");
    expect(parsed.rationale).toContain("daily and hourly");
    expect(parsed.strategic_actions).toContain("Enter on confirmation");
  });

  it("normalizes a nested research plan and bearish language", () => {
    const parsed = ResearchPlanSchema.parse(normalizeAgentOutput({
      analysis: {
        recommendation: "Mildly Bearish",
        rationale: "Momentum has weakened below the daily trend.",
        actions: "Wait for a short entry confirmation.",
      },
    }));
    expect(parsed.recommendation).toBe("Sell");
    expect(parsed.strategic_actions).toContain("short entry");
  });

  it("normalizes portfolio ratings expressed as directional labels", () => {
    const parsed = PortfolioDecisionSchema.parse(normalizeAgentOutput({
      portfolioRating: "Bullish",
      executiveSummary: "Trend alignment supports a long setup.",
      investmentThesis: "Price and momentum remain constructive.",
    }));
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

describe("agentPipeline/recovery", () => {
  it("permits recovery only when the independent review affirms direction at 55% or higher", () => {
    const assessment = assessPipelineRecovery({
      proposedDirection: "BUY",
      reviewerAction: "BUY",
      reviewerConfidence: 55,
    });
    expect(assessment.allowed).toBe(true);
    expect(assessment.executionConfidence).toBe(65);
  });

  it("vetoes recovery when the independent review disagrees with the technical setup", () => {
    const assessment = assessPipelineRecovery({
      proposedDirection: "SELL",
      reviewerAction: "HOLD",
      reviewerConfidence: 90,
    });
    expect(assessment.allowed).toBe(false);
    expect(assessment.reason).toContain("did not affirm");
  });

  it("vetoes recovery when confirming confidence is below the agreed live floor", () => {
    const assessment = assessPipelineRecovery({
      proposedDirection: "BUY",
      reviewerAction: "BUY",
      reviewerConfidence: 54,
    });
    expect(assessment.allowed).toBe(false);
    expect(assessment.reason).toContain("55%");
  });
});

describe("engineSessionRecovery", () => {
  it("identifies only active sessions as orphans before a new engine start", () => {
    expect(getOrphanedActiveSessionIds([
      { id: 101, status: "active" },
      { id: 102, status: "stopped" },
      { id: 103, status: "completed" },
      { id: 104, status: "active" },
    ])).toEqual([101, 104]);
  });
});
