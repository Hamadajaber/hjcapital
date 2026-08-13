import { invokeLLM } from "../_core/llm";
import type { z } from "zod";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readAlias(source: JsonRecord, aliases: string[]): unknown {
  const match = Object.keys(source).find((key) =>
    aliases.some((alias) => alias.toLowerCase() === key.toLowerCase())
  );
  return match ? source[match] : undefined;
}

function normalizePortfolioRating(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;

  const canonical = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (canonical.includes("overweight")) return "Overweight";
  if (canonical.includes("underweight")) return "Underweight";
  if (canonical.includes("strong buy") || canonical.includes("buy") || canonical.includes("bullish") || canonical.includes("long")) return "Buy";
  if (canonical.includes("strong sell") || canonical.includes("sell") || canonical.includes("bearish") || canonical.includes("short")) return "Sell";
  if (canonical.includes("hold") || canonical.includes("neutral") || canonical.includes("mixed")) return "Hold";
  return "Hold";
}

/**
 * Makes common LLM JSON variations conform to the pipeline schemas before Zod validates.
 * The function intentionally preserves unknown fields; Zod handles schema-specific stripping.
 */
export function normalizeAgentOutput(input: unknown): unknown {
  const root = asRecord(input);
  if (!root) return input;

  const normalized: JsonRecord = { ...root };
  const nestedSources = ["analysis", "decision", "plan", "research_plan", "researchPlan"]
    .map((key) => asRecord(root[key]))
    .filter((value): value is JsonRecord => value !== null);
  const sources = [root, ...nestedSources];
  const pick = (aliases: string[]) => {
    for (const source of sources) {
      const value = readAlias(source, aliases);
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  };

  const recommendation = normalizePortfolioRating(pick(["recommendation", "recommendation_rating", "recommendationRating"]));
  if (recommendation) normalized.recommendation = recommendation;

  const rating = normalizePortfolioRating(pick(["rating", "portfolio_rating", "portfolioRating"]));
  if (rating) normalized.rating = rating;

  const action = pick(["action", "trade_action", "tradeAction"]);
  if (typeof action === "string") {
    const actionText = action.trim().toLowerCase();
    normalized.action = actionText.includes("buy") || actionText.includes("long")
      ? "Buy"
      : actionText.includes("sell") || actionText.includes("short")
        ? "Sell"
        : "Hold";
  }

  const strategicActions = pick(["strategic_actions", "strategicActions", "strategic_action", "actions"]);
  if (strategicActions !== undefined) {
    normalized.strategic_actions = Array.isArray(strategicActions)
      ? strategicActions.map(String)
      : typeof strategicActions === "object"
        ? JSON.stringify(strategicActions)
        : String(strategicActions);
  }

  const rationale = pick(["rationale", "reasoning", "summary", "analysis"]);
  if (rationale !== undefined) normalized.rationale = typeof rationale === "string" ? rationale : JSON.stringify(rationale);

  const executiveSummary = pick(["executive_summary", "executiveSummary", "summary"]);
  if (executiveSummary !== undefined) normalized.executive_summary = String(executiveSummary);

  const thesis = pick(["investment_thesis", "investmentThesis", "thesis", "rationale"]);
  if (thesis !== undefined) normalized.investment_thesis = String(thesis);

  return normalized;
}

/**
 * Retry invokeJsonAgent up to maxRetries times with an escalating repair prompt.
 * On each failure the raw LLM output is fed back so the model can self-correct.
 * Also normalizes common LLM deviations before Zod validation.
 */
export async function invokeJsonAgent<T extends z.ZodType>(
  schema: T,
  params: {
    model: string;
    system: string;
    user: string;
    agentName: string;
  },
  maxRetries = 3
): Promise<z.infer<T>> {
  let lastError: string = "";
  let lastRaw: string = "{}";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // On retry, append a repair instruction with the previous bad output
    const userContent =
      attempt === 0
        ? params.user
        : `${params.user}\n\n---\nYour previous response was invalid or did not match the required schema.\nError: ${lastError}\nPrevious output: ${lastRaw.slice(0, 300)}\nPlease respond ONLY with valid JSON matching the exact schema fields. Do not add any explanation or markdown.`;

    const response = await invokeLLM({
      model: params.model,
      messages: [
        {
          role: "system",
          content:
            params.system +
            "\n\nCRITICAL: Respond ONLY with a valid JSON object. No markdown, no code blocks, no explanation. The JSON must contain exactly the required fields.",
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" } as never,
    });

    const content = response.choices?.[0]?.message?.content ?? "{}";
    lastRaw = typeof content === "string" ? content : JSON.stringify(content);

    // Strip markdown code fences if model wraps output
    const cleaned = lastRaw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      lastError = `Invalid JSON: ${cleaned.slice(0, 200)}`;
      continue;
    }

    // Normalize common LLM deviations before validation
    parsed = normalizeAgentOutput(parsed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;

      // Fix recommendation: map common variants to valid enum values
      if (typeof obj.recommendation === "string") {
        const rec = obj.recommendation.trim();
        const recMap: Record<string, string> = {
          STRONG_BUY: "Buy",
          STRONG_SELL: "Sell",
          BUY: "Buy",
          SELL: "Sell",
          HOLD: "Hold",
          OVERWEIGHT: "Overweight",
          UNDERWEIGHT: "Underweight",
          "Strong Buy": "Buy",
          "Strong Sell": "Sell",
          "strong buy": "Buy",
          "strong sell": "Sell",
          buy: "Buy",
          sell: "Sell",
          hold: "Hold",
          overweight: "Overweight",
          underweight: "Underweight",
        };
        // ███ ROUND 63 FIX: More aggressive normalization — fuzzy match if exact map fails
        const mapped = recMap[rec];
        if (mapped) {
          obj.recommendation = mapped;
        } else {
          // Fuzzy: check if rec contains a known keyword
          const recLower = rec.toLowerCase();
          if (recLower.includes("strong buy") || recLower.includes("strongly buy")) obj.recommendation = "Buy";
          else if (recLower.includes("strong sell") || recLower.includes("strongly sell")) obj.recommendation = "Sell";
          else if (recLower.includes("overweight")) obj.recommendation = "Overweight";
          else if (recLower.includes("underweight")) obj.recommendation = "Underweight";
          else if (recLower.includes("buy")) obj.recommendation = "Buy";
          else if (recLower.includes("sell")) obj.recommendation = "Sell";
          else if (recLower.includes("hold") || recLower.includes("neutral")) obj.recommendation = "Hold";
          else {
            // Last resort: log the bad value and default to Hold
            console.warn(`[${params.agentName}] Unrecognized recommendation value: "${rec}" — defaulting to Hold`);
            obj.recommendation = "Hold";
          }
        }
      }

      // Fix strategic_actions: ensure it's a string or array
      if (obj.strategic_actions === undefined || obj.strategic_actions === null) {
        obj.strategic_actions =
          obj.strategic_action ?? obj.actions ?? obj.action ?? "No specific actions.";
      }
      if (
        typeof obj.strategic_actions === "object" &&
        !Array.isArray(obj.strategic_actions)
      ) {
        obj.strategic_actions = JSON.stringify(obj.strategic_actions);
      }

      // Fix rationale: ensure it's a string
      if (obj.rationale === undefined || obj.rationale === null) {
        obj.rationale =
          obj.reasoning ?? obj.summary ?? obj.analysis ?? "No rationale provided.";
      }
      if (typeof obj.rationale !== "string") {
        obj.rationale = String(obj.rationale);
      }

      // Fix executive_summary: ensure it's a string
      if (obj.executive_summary === undefined || obj.executive_summary === null) {
        obj.executive_summary =
          (obj.summary as string) ?? (obj.rationale as string) ?? "No summary provided.";
      }

      // Fix investment_thesis: ensure it's a string
      if (obj.investment_thesis === undefined || obj.investment_thesis === null) {
        obj.investment_thesis =
          (obj.thesis as string) ?? (obj.rationale as string) ?? "No thesis provided.";
      }

      // Fix action field for TraderProposal
      if (typeof obj.action === "string") {
        const actionMap: Record<string, string> = {
          BUY: "Buy",
          SELL: "Sell",
          HOLD: "Hold",
          buy: "Buy",
          sell: "Sell",
          hold: "Hold",
        };
        obj.action = actionMap[obj.action] ?? obj.action;
      }

      // Fix rating field for PortfolioDecision
      if (typeof obj.rating === "string") {
        const ratingMap: Record<string, string> = {
          BUY: "Buy",
          SELL: "Sell",
          HOLD: "Hold",
          OVERWEIGHT: "Overweight",
          UNDERWEIGHT: "Underweight",
          buy: "Buy",
          sell: "Sell",
          hold: "Hold",
          overweight: "Overweight",
          underweight: "Underweight",
        };
        obj.rating = ratingMap[obj.rating] ?? obj.rating;
      }
    }

    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }

    lastError = result.error.message;
  }

  throw new Error(
    `[${params.agentName}] Schema validation failed after ${maxRetries} attempts: ${lastError}`
  );
}

export async function invokeTextAgent(params: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const response = await invokeLLM({
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  const content = response.choices?.[0]?.message?.content ?? "";
  return typeof content === "string" ? content : JSON.stringify(content);
}
