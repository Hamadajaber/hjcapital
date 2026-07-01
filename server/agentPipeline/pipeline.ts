/**
 * Multi-agent decision pipeline — TradingAgents patterns in TypeScript.
 *
 * Flow (mirrors TradingAgents graph):
 *   Analyst context → Bull/Bear debate → Research Manager
 *   → Risk debate (Aggressive / Conservative / Neutral) → Portfolio Manager
 *
 * Does NOT execute trades — returns a decision for autoTradeEngine to enforce.
 */
import type { TradeDecision } from "../autoTradeEngine";
import { calculateATRStopLoss, calculateATRPositionSize } from "../engineIntelligence";
import type { Candle } from "../technicalAnalysis";
import { resolveAgentPipelineConfig } from "./config";
import { buildAnalystContext, instrumentContextBlock, type PipelineMarketInput } from "./contextBuilder";
import { invokeJsonAgent, invokeTextAgent } from "./llm";
import { ratingToConfidence, ratingToDirection } from "./rating";
import {
  PortfolioDecisionSchema,
  ResearchPlanSchema,
  renderPortfolioDecision,
  renderResearchPlan,
  type AnalystContext,
  type PortfolioDecision,
} from "./schemas";

export interface AgentPipelineResult {
  decision: TradeDecision;
  debateHistory: string;
  riskHistory: string;
  investmentPlan: string;
  finalDecisionMarkdown: string;
  agentCallCount: number;
}

async function runBullBearDebate(
  ctx: AnalystContext,
  maxRounds: number,
  quickModel: string
): Promise<{ history: string; agentCalls: number }> {
  let history = "";
  let agentCalls = 0;
  const instrumentBlock = instrumentContextBlock(ctx);

  for (let round = 0; round < maxRounds; round++) {
    const bullPrompt = `You are the Bull Analyst for ${ctx.instrument} (CFD). Build a concise, evidence-based bull case.
${instrumentBlock}

Market report:
${ctx.marketReport}

Sentiment:
${ctx.sentimentReport}

News:
${ctx.newsReport}

Fundamentals/macro:
${ctx.fundamentalsReport}
${ctx.clientSentiment ? `\nClient sentiment (contrarian):\n${ctx.clientSentiment}` : ""}
${ctx.lessons ? `\nPast lessons:\n${ctx.lessons}` : ""}

Debate history:
${history || "(first round)"}

Counter the bear case if present. 3-5 sentences, conversational.`;

    const bullText = await invokeTextAgent({
      model: quickModel,
      system: "You are a bull analyst at a trading desk. Be specific and cite the data.",
      user: bullPrompt,
    });
    agentCalls++;
    const bullLine = `Bull Analyst: ${bullText}`;
    history = history ? `${history}\n${bullLine}` : bullLine;

    const bearPrompt = `You are the Bear Analyst for ${ctx.instrument} (CFD). Build a concise bear case and counter the bull.
${instrumentBlock}

Same data as bull analyst — market, sentiment, news, macro above.

Debate history:
${history}

Last bull argument to refute. 3-5 sentences.`;

    const bearText = await invokeTextAgent({
      model: quickModel,
      system: "You are a bear analyst. Challenge optimism with concrete risks.",
      user: bearPrompt,
    });
    agentCalls++;
    history = `${history}\nBear Analyst: ${bearText}`;
  }

  return { history, agentCalls };
}

async function runResearchManager(
  ctx: AnalystContext,
  debateHistory: string,
  deepModel: string
): Promise<{ plan: string; agentCalls: number }> {
  const plan = await invokeJsonAgent(ResearchPlanSchema, {
    model: deepModel,
    agentName: "Research Manager",
    system:
      "You are the Research Manager. Synthesize the bull/bear debate into a structured investment plan. Respond only in JSON matching the schema fields: recommendation, rationale, strategic_actions.",
    user: `Synthesize this debate for ${ctx.instrument} and commit to a rating (Buy/Overweight/Hold/Underweight/Sell).

Rating scale:
- Buy/Sell = strong conviction
- Overweight/Underweight = moderate tilt
- Hold = only if genuinely balanced

${instrumentContextBlock(ctx)}

Debate:
${debateHistory}`,
  });

  return { plan: renderResearchPlan(plan), agentCalls: 1 };
}

async function runRiskDebate(
  ctx: AnalystContext,
  investmentPlan: string,
  maxRounds: number,
  quickModel: string
): Promise<{ history: string; agentCalls: number }> {
  let history = "";
  let agentCalls = 0;
  let latestSpeaker = "";

  const baseContext = `${instrumentContextBlock(ctx)}

Research Manager plan:
${investmentPlan}

Market: ${ctx.marketReport.slice(0, 1200)}`;

  for (let round = 0; round < maxRounds; round++) {
    const speakers = ["Aggressive", "Conservative", "Neutral"] as const;
    for (const role of speakers) {
      const rolePrompt =
        role === "Aggressive"
          ? "Emphasize upside and opportunity cost of waiting."
          : role === "Conservative"
            ? "Emphasize capital preservation, tail risks, and position sizing."
            : "Balance both sides pragmatically for a CFD intraday/swing desk.";

      const prompt = `You are the ${role} Risk Analyst for ${ctx.instrument}.
${rolePrompt}

${baseContext}

Risk debate history:
${history || "(opening round)"}

Respond in 2-4 sentences. Debate the other viewpoints.`;

      const text = await invokeTextAgent({
        model: quickModel,
        system: `You are the ${role} risk analyst on a trading desk.`,
        user: prompt,
      });
      agentCalls++;
      const line = `${role} Analyst: ${text}`;
      history = history ? `${history}\n${line}` : line;
      latestSpeaker = role;
    }
    void latestSpeaker;
  }

  return { history, agentCalls };
}

async function runPortfolioManager(
  ctx: AnalystContext,
  investmentPlan: string,
  riskHistory: string,
  deepModel: string
): Promise<{ markdown: string; decision: PortfolioDecision; agentCalls: number }> {
  const decision = await invokeJsonAgent(PortfolioDecisionSchema, {
    model: deepModel,
    agentName: "Portfolio Manager",
    system:
      "You are the Portfolio Manager. Deliver the final trading decision. JSON fields: rating, executive_summary, investment_thesis, price_target (optional), time_horizon (optional).",
    user: `Final decision for ${ctx.instrument} CFD.

${instrumentContextBlock(ctx)}

Investment plan:
${investmentPlan}

Risk analysts debate:
${riskHistory}

Rating scale: Buy / Overweight / Hold / Underweight / Sell.
For CFD trading, be decisive when evidence supports ${ctx.proposedDirection ?? "a direction"}.`,
  });

  return { markdown: renderPortfolioDecision(decision), decision, agentCalls: 1 };
}

export async function runAgentPipeline(
  input: PipelineMarketInput & {
    candles1h?: Candle[];
    accountBalance?: number;
    confidenceThreshold?: number;
  }
): Promise<AgentPipelineResult> {
  const config = await resolveAgentPipelineConfig();
  const ctx = buildAnalystContext(input);
  let agentCallCount = 0;

  const { history: debateHistory, agentCalls: debateCalls } = await runBullBearDebate(
    ctx,
    config.maxDebateRounds,
    config.quickModel
  );
  agentCallCount += debateCalls;

  const { plan: investmentPlan, agentCalls: rmCalls } = await runResearchManager(
    ctx,
    debateHistory,
    config.deepModel
  );
  agentCallCount += rmCalls;

  let riskHistory = "";
  if (config.mode === "full") {
    const risk = await runRiskDebate(ctx, investmentPlan, config.maxRiskRounds, config.quickModel);
    riskHistory = risk.history;
    agentCallCount += risk.agentCalls;
  } else {
    riskHistory = "(light mode — risk debate skipped; Research Manager plan used directly)";
  }

  const { markdown: finalDecisionMarkdown, decision: pmDecision, agentCalls: pmCalls } =
    await runPortfolioManager(ctx, investmentPlan, riskHistory, config.deepModel);
  agentCallCount += pmCalls;

  const direction = ratingToDirection(pmDecision.rating, input.proposedDirection);
  let confidence = ratingToConfidence(pmDecision.rating, input.proposedDirection);

  if (direction === "HOLD") {
    return {
      decision: {
        instrument: input.instrument,
        action: "HOLD",
        confidence: 0,
        reasoning: `[AGENT PIPELINE] PM rating Hold — ${pmDecision.executive_summary}`,
      },
      debateHistory,
      riskHistory,
      investmentPlan,
      finalDecisionMarkdown,
      agentCallCount,
    };
  }

  const threshold = input.confidenceThreshold ?? 65;
  if (confidence < threshold) {
    return {
      decision: {
        instrument: input.instrument,
        action: "HOLD",
        confidence,
        reasoning: `[AGENT PIPELINE] Confidence ${confidence}% below threshold ${threshold}%`,
      },
      debateHistory,
      riskHistory,
      investmentPlan,
      finalDecisionMarkdown,
      agentCallCount,
    };
  }

  const entryPrice = input.livePrice ?? 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let size = 1;

  if (input.candles1h && input.candles1h.length >= 14 && entryPrice > 0) {
    const atr = calculateATRStopLoss(input.candles1h, entryPrice, direction);
    stopLoss = atr.stopLoss;
    takeProfit = atr.takeProfit;
    if (input.accountBalance) {
      const sized = calculateATRPositionSize(input.candles1h, input.accountBalance);
      size = sized.size;
    }
  }

  if (pmDecision.price_target != null && direction === "BUY" && pmDecision.price_target > entryPrice) {
    takeProfit = pmDecision.price_target;
  }
  if (pmDecision.price_target != null && direction === "SELL" && pmDecision.price_target < entryPrice) {
    takeProfit = pmDecision.price_target;
  }

  return {
    decision: {
      instrument: input.instrument,
      action: direction,
      confidence,
      reasoning: `[AGENT PIPELINE] ${pmDecision.rating} — ${pmDecision.executive_summary}`,
      entryPrice,
      stopLoss,
      takeProfit,
      size,
    },
    debateHistory,
    riskHistory,
    investmentPlan,
    finalDecisionMarkdown,
    agentCallCount,
  };
}

export { resolveAgentPipelineConfig, getAgentPipelineConfig, invalidateAgentPipelineConfigCache } from "./config";
export { buildAnalystContext } from "./contextBuilder";
