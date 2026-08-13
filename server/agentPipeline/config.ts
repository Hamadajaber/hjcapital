import { getEngineIntelligence } from "../db";

export type AgentPipelineMode = "off" | "light" | "full";

export interface AgentPipelineConfig {
  enabled: boolean;
  mode: AgentPipelineMode;
  maxDebateRounds: number;
  maxRiskRounds: number;
  quickModel: string;
  deepModel: string;
}

let cached: { config: AgentPipelineConfig; at: number } | null = null;
const CACHE_MS = 15_000;

function parseMode(raw: string | undefined | null): AgentPipelineMode {
  if (raw === "light" || raw === "full") return raw;
  return "off";
}

export function invalidateAgentPipelineConfigCache(): void {
  cached = null;
}

/**
 * Resolves pipeline config: DB setting (UI toggle) wins; env var is dev override only.
 */
export async function resolveAgentPipelineConfig(): Promise<AgentPipelineConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.config;
  }

  let dbMode: AgentPipelineMode = "off";

  try {
    const intel = await getEngineIntelligence();
    if (intel && "agentPipelineMode" in intel && intel.agentPipelineMode) {
      dbMode = parseMode(intel.agentPipelineMode);
    }
  } catch {
    // Column may not exist yet — defaults to off
  }

  // Engine intelligence is the sole operational authority. Previously an
  // environment variable could silently override the dashboard/DB setting,
  // making a production "full" pipeline appear when the UI said otherwise.
  const mode = dbMode;

  const config: AgentPipelineConfig = {
    enabled: mode !== "off",
    mode,
    maxDebateRounds: Number(process.env.HJ_AGENT_DEBATE_ROUNDS ?? "1"),
    maxRiskRounds: Number(process.env.HJ_AGENT_RISK_ROUNDS ?? "1"),
    quickModel: process.env.HJ_AGENT_QUICK_MODEL ?? "gpt-4o",
    deepModel: process.env.HJ_AGENT_DEEP_MODEL ?? "claude-sonnet-4-5",
  };

  cached = { config, at: Date.now() };
  return config;
}

/** @deprecated Use resolveAgentPipelineConfig — sync fallback for tests */
export function getAgentPipelineConfig(): AgentPipelineConfig {
  const mode = parseMode(process.env.HJ_AGENT_PIPELINE_MODE);
  return {
    enabled: mode !== "off",
    mode,
    maxDebateRounds: 1,
    maxRiskRounds: 1,
    quickModel: "gpt-4o",
    deepModel: "claude-sonnet-4-5",
  };
}
