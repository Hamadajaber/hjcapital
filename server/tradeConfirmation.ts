export type ConfirmationAction = "BUY" | "SELL" | "HOLD";

export interface TradeConfirmation {
  action: ConfirmationAction;
  confidence: number;
  reasoning: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readValue(source: Record<string, unknown>, names: string[]): unknown {
  const key = Object.keys(source).find((candidate) =>
    names.some((name) => name.toLowerCase() === candidate.toLowerCase())
  );
  return key ? source[key] : undefined;
}

function normalizeAction(value: unknown): ConfirmationAction {
  if (typeof value !== "string") return "HOLD";
  const action = value.trim().toUpperCase();
  if (action.includes("BUY") || action.includes("LONG") || action.includes("BULL")) return "BUY";
  if (action.includes("SELL") || action.includes("SHORT") || action.includes("BEAR")) return "SELL";
  return "HOLD";
}

function numberOrUndefined(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

/** Converts common LLM JSON wrappers and aliases into the engine's strict confirmation shape. */
export function normalizeTradeConfirmation(input: unknown): TradeConfirmation {
  const root = asRecord(input) ?? {};
  const nested = ["decision", "analysis", "trade", "recommendation"]
    .map((key) => asRecord(root[key]))
    .find((value): value is Record<string, unknown> => value !== null);
  const sources = nested ? [root, nested] : [root];
  const pick = (names: string[]) => {
    for (const source of sources) {
      const value = readValue(source, names);
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  };

  const action = normalizeAction(pick(["action", "recommendation", "trade_action", "signal"]));
  const confidenceRaw = pick(["confidence", "score", "probability"]);
  const confidenceNumber = typeof confidenceRaw === "number" ? confidenceRaw : Number(confidenceRaw);
  const confidence = Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(100, confidenceNumber)) : 0;
  const reasoningRaw = pick(["reasoning", "rationale", "analysis", "summary", "explanation"]);

  return {
    action,
    confidence,
    reasoning: typeof reasoningRaw === "string" && reasoningRaw.trim()
      ? reasoningRaw.trim()
      : "AI confirmation omitted a usable rationale.",
    entryPrice: numberOrUndefined(pick(["entryPrice", "entry_price", "entry"])),
    stopLoss: numberOrUndefined(pick(["stopLoss", "stop_loss", "sl"])),
    takeProfit: numberOrUndefined(pick(["takeProfit", "take_profit", "tp", "target"])),
  };
}
