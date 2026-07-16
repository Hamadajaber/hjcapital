/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║           HJ Capital — Knowledge Accumulation Engine                        ║
 * ║                                                                              ║
 * ║  "The platform learns from every trade and grows smarter over time."         ║
 * ║                                                                              ║
 * ║  5 Knowledge Layers:                                                         ║
 * ║  1. Trade Memory      — every closed trade → lesson extracted                ║
 * ║  2. Instrument Profile — deep per-instrument knowledge accumulation          ║
 * ║  3. Market Regime     — what worked in each market condition                 ║
 * ║  4. Risk Rules        — auto-updated risk parameters from experience         ║
 * ║  5. Strategic Memory  — platform-wide patterns and meta-knowledge            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { sendTelegramMessage } from "./telegram";
import {
  knowledgeBase,
  instrumentProfiles,
  marketRegimeMemory,
  instrumentPerformance,
  tradeLessons,
  riskSettings,
  type InsertKnowledgeEntry,
  type InsertInstrumentProfile,
} from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClosedTradeData {
  id: number;
  instrument: string;
  direction: "BUY" | "SELL";
  openPrice: number;
  closePrice: number;
  size: number;
  pnl: number;
  openedAt: Date;
  closedAt: Date;
  stopLoss?: number;
  takeProfit?: number;
  confidence?: number;
  reasoning?: string;
  closeReason?: string;
}

// ─── Layer 1: Trade Memory ────────────────────────────────────────────────────

/**
 * After every closed trade, extract structured knowledge and store it.
 * Primary learning trigger — fires after EVERY trade close.
 */
export async function extractTradeKnowledge(trade: ClosedTradeData): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const holdingMinutes = trade.closedAt && trade.openedAt
      ? Math.round((new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()) / 60000)
      : 0;

    const slHit = trade.closePrice && trade.stopLoss
      ? (trade.direction === "BUY"
        ? trade.closePrice <= trade.stopLoss
        : trade.closePrice >= trade.stopLoss)
      : false;

    const tpHit = trade.closePrice && trade.takeProfit
      ? (trade.direction === "BUY"
        ? trade.closePrice >= trade.takeProfit
        : trade.closePrice <= trade.takeProfit)
      : false;

    const prompt = `You are a trading knowledge extractor for HJ Capital. Analyze this closed trade and extract structured knowledge.

TRADE DATA:
- Instrument: ${trade.instrument}
- Direction: ${trade.direction}
- Entry: ${trade.openPrice} | Exit: ${trade.closePrice}
- Size: ${trade.size} | P&L: $${trade.pnl.toFixed(2)}
- Holding time: ${holdingMinutes} minutes
- Stop Loss: ${trade.stopLoss ?? "none"} | Take Profit: ${trade.takeProfit ?? "none"}
- SL hit: ${slHit} | TP hit: ${tpHit}
- Close reason: ${trade.closeReason ?? "unknown"}
- AI confidence at entry: ${trade.confidence ?? "unknown"}%
- Original reasoning: ${trade.reasoning ?? "none"}

Extract knowledge in this exact JSON format:
{
  "verdict": "win",
  "primary_lesson": "One clear sentence: what the platform learned from this trade",
  "pattern_identified": "What pattern or signal led to this trade",
  "what_worked": "What went right",
  "what_failed": "What went wrong",
  "instrument_insight": "Specific insight about ${trade.instrument} behavior",
  "risk_insight": "Any risk management lesson",
  "confidence_calibration": "Was the confidence score accurate?",
  "knowledge_tags": ["tag1", "tag2"],
  "knowledge_confidence": 60
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a trading knowledge extraction AI. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "trade_knowledge",
          strict: true,
          schema: {
            type: "object",
            properties: {
              verdict: { type: "string" },
              primary_lesson: { type: "string" },
              pattern_identified: { type: "string" },
              what_worked: { type: "string" },
              what_failed: { type: "string" },
              instrument_insight: { type: "string" },
              risk_insight: { type: "string" },
              confidence_calibration: { type: "string" },
              knowledge_tags: { type: "array", items: { type: "string" } },
              knowledge_confidence: { type: "number" }
            },
            required: ["verdict", "primary_lesson", "pattern_identified", "what_worked", "what_failed", "instrument_insight", "risk_insight", "confidence_calibration", "knowledge_tags", "knowledge_confidence"],
            additionalProperties: false
          }
        }
      }
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return;

    const knowledge = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Store primary lesson as trade_pattern knowledge
    await storeKnowledge({
      knowledgeType: "trade_pattern",
      subject: trade.instrument,
      title: `${trade.direction} ${trade.instrument}: ${String(knowledge.primary_lesson).substring(0, 80)}`,
      content: `**Verdict:** ${knowledge.verdict}\n\n**Primary Lesson:** ${knowledge.primary_lesson}\n\n**Pattern:** ${knowledge.pattern_identified}\n\n**What Worked:** ${knowledge.what_worked}\n\n**What Failed:** ${knowledge.what_failed}\n\n**Risk Insight:** ${knowledge.risk_insight}\n\n**Confidence Calibration:** ${knowledge.confidence_calibration}`,
      confidence: Number(knowledge.knowledge_confidence) || 50,
      source: "post_trade",
      tags: knowledge.knowledge_tags as string[],
      isActive: true,
    });

    // Store instrument-specific insight
    if (knowledge.instrument_insight) {
      await storeKnowledge({
        knowledgeType: "instrument_insight",
        subject: trade.instrument,
        title: `${trade.instrument} insight — ${new Date().toLocaleDateString()}`,
        content: String(knowledge.instrument_insight),
        confidence: Number(knowledge.knowledge_confidence) || 50,
        source: "post_trade",
        tags: [trade.instrument, "instrument_insight", String(knowledge.verdict)],
        isActive: true,
      });
    }

    // Update instrument profile
    await updateInstrumentProfile(trade);

    // Validate or contradict existing knowledge
    await validateExistingKnowledge(trade);

    console.log(`[KnowledgeEngine] ✅ Trade #${trade.id} knowledge extracted: "${String(knowledge.primary_lesson).substring(0, 60)}..."`);

  } catch (err) {
    console.error("[KnowledgeEngine] extractTradeKnowledge error:", err);
  }
}

// ─── Layer 2: Instrument Profile ──────────────────────────────────────────────

async function updateInstrumentProfile(trade: ClosedTradeData): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const existing = await db
      .select()
      .from(instrumentProfiles)
      .where(eq(instrumentProfiles.instrument, trade.instrument))
      .limit(1);

    if (existing.length === 0) {
      // Create initial profile
      await db.insert(instrumentProfiles).values({
        instrument: trade.instrument,
        lifetimePnl: trade.pnl.toFixed(2),
        lifetimeTrades: 1,
        bestDirection: trade.pnl > 0 ? trade.direction : "NEUTRAL",
        version: 1,
      });
    } else {
      const profile = existing[0];
      const newPnl = parseFloat(profile.lifetimePnl) + trade.pnl;
      const newTrades = profile.lifetimeTrades + 1;

      await db
        .update(instrumentProfiles)
        .set({
          lifetimePnl: newPnl.toFixed(2),
          lifetimeTrades: newTrades,
          version: profile.version + 1,
        })
        .where(eq(instrumentProfiles.instrument, trade.instrument));

      // Every 5 trades on an instrument, do a deep AI profile update
      if (newTrades % 5 === 0) {
        deepUpdateInstrumentProfile(trade.instrument).catch(console.error);
      }
    }
  } catch (err) {
    console.error("[KnowledgeEngine] updateInstrumentProfile error:", err);
  }
}

async function deepUpdateInstrumentProfile(instrument: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const lessons = await db
      .select()
      .from(tradeLessons)
      .where(eq(tradeLessons.instrument, instrument))
      .orderBy(desc(tradeLessons.createdAt))
      .limit(20);

    const perfRows = await db
      .select()
      .from(instrumentPerformance)
      .where(eq(instrumentPerformance.instrument, instrument))
      .limit(1);

    if (lessons.length < 3) return;

    const perfStats = perfRows[0];

    const prompt = `Analyze all available data for ${instrument} and create a comprehensive instrument profile.

PERFORMANCE STATS:
${perfStats ? `Wins: ${perfStats.wins}, Losses: ${perfStats.losses}, Win Rate: ${perfStats.winRate}%, Total P&L: $${perfStats.totalPnl}, Score: ${perfStats.score}/100` : "No stats yet"}

RECENT LESSONS (last 20):
${lessons.map((l, i) => `${i + 1}. [${l.direction}] P&L: $${l.pnl} — ${l.lessonText}`).join("\n")}

Create a profile in JSON:
{
  "behaviorPatterns": "Key patterns observed for this instrument",
  "riskFactors": "Main risk factors to watch",
  "recommendedStrategy": "Best strategy approach based on experience",
  "bestDirection": "BUY",
  "sizeMultiplier": 1.0,
  "profileSummary": "2-3 sentence summary of what we know about this instrument"
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a trading instrument analyst. Respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "instrument_profile",
          strict: true,
          schema: {
            type: "object",
            properties: {
              behaviorPatterns: { type: "string" },
              riskFactors: { type: "string" },
              recommendedStrategy: { type: "string" },
              bestDirection: { type: "string" },
              sizeMultiplier: { type: "number" },
              profileSummary: { type: "string" }
            },
            required: ["behaviorPatterns", "riskFactors", "recommendedStrategy", "bestDirection", "sizeMultiplier", "profileSummary"],
            additionalProperties: false
          }
        }
      }
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return;

    const profile = typeof raw === "string" ? JSON.parse(raw) : raw;

    await db
      .update(instrumentProfiles)
      .set({
        behaviorPatterns: String(profile.behaviorPatterns),
        riskFactors: String(profile.riskFactors),
        recommendedStrategy: String(profile.recommendedStrategy),
        bestDirection: String(profile.bestDirection),
        sizeMultiplier: String(Number(profile.sizeMultiplier).toFixed(2)),
        profileSummary: String(profile.profileSummary),
        lastAnalyzedAt: new Date(),
      })
      .where(eq(instrumentProfiles.instrument, instrument));

    console.log(`[KnowledgeEngine] 📊 Deep profile updated for ${instrument}`);
  } catch (err) {
    console.error("[KnowledgeEngine] deepUpdateInstrumentProfile error:", err);
  }
}

// ─── Layer 3: Market Regime Memory ───────────────────────────────────────────

export async function recordMarketRegime(
  instrument: string,
  regime: string,
  weeklyStats: { winRate: number; totalPnl: number; totalTrades: number },
  successfulStrategies: string,
  failedStrategies: string,
  keyLessons: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const today = new Date().toISOString().split("T")[0];

    await db.insert(marketRegimeMemory).values({
      regime,
      instrument,
      startDate: today,
      successfulStrategies,
      failedStrategies,
      keyLessons,
      winRate: weeklyStats.winRate.toFixed(2),
      totalPnl: weeklyStats.totalPnl.toFixed(2),
      totalTrades: weeklyStats.totalTrades,
    });

    console.log(`[KnowledgeEngine] 🌍 Market regime recorded: ${regime} for ${instrument}`);
  } catch (err) {
    console.error("[KnowledgeEngine] recordMarketRegime error:", err);
  }
}

// ─── Layer 4: Knowledge Validation ───────────────────────────────────────────

async function validateExistingKnowledge(trade: ClosedTradeData): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const existing = await db
      .select({ id: knowledgeBase.id, confidence: knowledgeBase.confidence })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.subject, trade.instrument),
          eq(knowledgeBase.isActive, true),
          eq(knowledgeBase.knowledgeType, "trade_pattern")
        )
      )
      .orderBy(desc(knowledgeBase.createdAt))
      .limit(3);

    const isWin = trade.pnl > 0;

    for (const entry of existing) {
      if (isWin) {
        await db
          .update(knowledgeBase)
          .set({
            validations: sql`validations + 1`,
            confidence: sql`LEAST(95, confidence + 2)`,
          })
          .where(eq(knowledgeBase.id, entry.id));
      } else {
        await db
          .update(knowledgeBase)
          .set({
            contradictions: sql`contradictions + 1`,
            confidence: sql`GREATEST(10, confidence - 1)`,
          })
          .where(eq(knowledgeBase.id, entry.id));
      }
    }
  } catch (err) {
    console.warn("[KnowledgeEngine] validateExistingKnowledge warning:", err);
  }
}

// ─── Layer 5: Strategic Meta-Knowledge ───────────────────────────────────────

/**
 * Weekly deep analysis: reads ALL accumulated knowledge and generates
 * strategic meta-knowledge — the highest-level learning trigger.
 */
export async function runStrategicMetaAnalysis(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  console.log("[KnowledgeEngine] 🧠 Starting Strategic Meta-Analysis...");

  try {
    // Gather all knowledge layers
    const allKnowledge = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.isActive, true))
      .orderBy(desc(knowledgeBase.confidence), desc(knowledgeBase.validations))
      .limit(50);

    const profiles = await db
      .select()
      .from(instrumentProfiles)
      .orderBy(desc(instrumentProfiles.lifetimeTrades));

    const recentLessons = await db
      .select()
      .from(tradeLessons)
      .orderBy(desc(tradeLessons.createdAt))
      .limit(30);

    const performance = await db
      .select()
      .from(instrumentPerformance)
      .orderBy(desc(instrumentPerformance.score));

    const prompt = `You are the strategic intelligence of HJ Capital trading platform.
Analyze ALL accumulated knowledge and generate strategic meta-knowledge.

KNOWLEDGE BASE (${allKnowledge.length} entries):
${allKnowledge.slice(0, 20).map(k => `[${k.knowledgeType}/${k.subject}] "${k.title}" (confidence: ${k.confidence}, validated: ${k.validations}x, contradicted: ${k.contradictions}x)`).join("\n")}

INSTRUMENT PROFILES:
${profiles.map(p => `${p.instrument}: ${p.lifetimeTrades} trades, P&L: $${p.lifetimePnl}, Best direction: ${p.bestDirection}, Size multiplier: ${p.sizeMultiplier}`).join("\n")}

INSTRUMENT PERFORMANCE:
${performance.map(p => `${p.instrument}: Win rate ${p.winRate}%, P&L $${p.totalPnl}, Score ${p.score}/100, Enabled: ${p.isEnabled}`).join("\n")}

RECENT LESSONS (last 30):
${recentLessons.slice(0, 15).map(l => `${l.instrument}: P&L $${l.pnl} — ${l.lessonText}`).join("\n")}

Generate strategic meta-knowledge in JSON:
{
  "platform_maturity_level": "beginner",
  "strongest_patterns": ["pattern1", "pattern2"],
  "critical_weaknesses": ["weakness1"],
  "recommended_focus_instruments": ["EURUSD"],
  "instruments_to_avoid": ["GER40"],
  "optimal_trading_hours_utc": [9, 14],
  "key_strategic_rules": ["Rule 1: Always...", "Rule 2: Never..."],
  "confidence_threshold_recommendation": 72,
  "position_size_philosophy": "Conservative",
  "meta_lesson": "The single most important lesson from all experience",
  "platform_evolution_stage": "Description of learning journey stage",
  "next_learning_priorities": ["priority1", "priority2"]
}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a strategic trading AI analyst. Respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strategic_meta_knowledge",
          strict: true,
          schema: {
            type: "object",
            properties: {
              platform_maturity_level: { type: "string" },
              strongest_patterns: { type: "array", items: { type: "string" } },
              critical_weaknesses: { type: "array", items: { type: "string" } },
              recommended_focus_instruments: { type: "array", items: { type: "string" } },
              instruments_to_avoid: { type: "array", items: { type: "string" } },
              optimal_trading_hours_utc: { type: "array", items: { type: "number" } },
              key_strategic_rules: { type: "array", items: { type: "string" } },
              confidence_threshold_recommendation: { type: "number" },
              position_size_philosophy: { type: "string" },
              meta_lesson: { type: "string" },
              platform_evolution_stage: { type: "string" },
              next_learning_priorities: { type: "array", items: { type: "string" } }
            },
            required: [
              "platform_maturity_level", "strongest_patterns", "critical_weaknesses",
              "recommended_focus_instruments", "instruments_to_avoid", "optimal_trading_hours_utc",
              "key_strategic_rules", "confidence_threshold_recommendation", "position_size_philosophy",
              "meta_lesson", "platform_evolution_stage", "next_learning_priorities"
            ],
            additionalProperties: false
          }
        }
      }
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return;

    const meta = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Store as strategic knowledge
    await storeKnowledge({
      knowledgeType: "strategy_rule",
      subject: "GLOBAL",
      title: `Strategic Meta-Analysis — ${new Date().toLocaleDateString()} — ${meta.platform_maturity_level}`,
      content: `**Platform Stage:** ${meta.platform_evolution_stage}\n\n**Meta Lesson:** ${meta.meta_lesson}\n\n**Key Strategic Rules:**\n${(meta.key_strategic_rules as string[]).map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n**Strongest Patterns:** ${(meta.strongest_patterns as string[]).join(", ")}\n\n**Critical Weaknesses:** ${(meta.critical_weaknesses as string[]).join(", ")}\n\n**Focus Instruments:** ${(meta.recommended_focus_instruments as string[]).join(", ")}\n\n**Avoid:** ${(meta.instruments_to_avoid as string[]).join(", ")}\n\n**Next Priorities:** ${(meta.next_learning_priorities as string[]).join(", ")}`,
      confidence: 80,
      source: "meta_analysis",
      tags: ["meta", "strategic", "weekly", String(meta.platform_maturity_level)],
      isActive: true,
    });

    // Auto-apply: update confidence threshold if recommendation differs significantly
    const riskRows = await db.select().from(riskSettings).limit(1);
    const currentThreshold = riskRows[0]?.minConfidenceThreshold ?? 65;
    const recommended = Number(meta.confidence_threshold_recommendation);

    if (Math.abs(recommended - currentThreshold) >= 3) {
      await db.update(riskSettings).set({ minConfidenceThreshold: recommended });

      await storeKnowledge({
        knowledgeType: "risk_rule",
        subject: "GLOBAL",
        title: `Auto-adjusted confidence threshold: ${currentThreshold}% → ${recommended}%`,
        content: `Strategic meta-analysis recommended changing confidence threshold from ${currentThreshold}% to ${recommended}% based on ${allKnowledge.length} knowledge entries and ${recentLessons.length} recent lessons.`,
        confidence: 85,
        source: "meta_analysis",
        tags: ["auto_adjustment", "confidence_threshold", "risk_management"],
        isActive: true,
      });

      console.log(`[KnowledgeEngine] ⚡ Auto-adjusted confidence threshold: ${currentThreshold}% → ${recommended}%`);
    }

    // Record market regime memory
    const winRate = performance.length > 0
      ? performance.reduce((s, p) => s + parseFloat(p.winRate), 0) / performance.length
      : 0;
    const totalPnl = performance.reduce((s, p) => s + parseFloat(p.totalPnl), 0);
    const totalTrades = performance.reduce((s, p) => s + p.totalTrades, 0);

    await recordMarketRegime(
      "GLOBAL",
      winRate > 50 ? "trending_up" : winRate > 35 ? "ranging" : "trending_down",
      { winRate, totalPnl, totalTrades },
      (meta.strongest_patterns as string[]).join("; "),
      (meta.critical_weaknesses as string[]).join("; "),
      String(meta.meta_lesson)
    );

    // Send Telegram summary
    const summary = `🧠 *Strategic Meta-Analysis Complete*

📊 Platform Stage: *${meta.platform_maturity_level}*
🎯 ${meta.platform_evolution_stage}

💡 Meta Lesson: _${meta.meta_lesson}_

✅ Focus: ${(meta.recommended_focus_instruments as string[]).join(", ")}
⛔ Avoid: ${(meta.instruments_to_avoid as string[]).join(", ")}
🕐 Best Hours (UTC): ${(meta.optimal_trading_hours_utc as number[]).join(", ")}

📚 Knowledge Base: ${allKnowledge.length} entries | ${recentLessons.length} lessons analyzed`;

    await sendTelegramMessage(summary).catch(() => {});

    console.log(`[KnowledgeEngine] ✅ Strategic meta-analysis complete. Platform level: ${meta.platform_maturity_level}`);

  } catch (err) {
    console.error("[KnowledgeEngine] runStrategicMetaAnalysis error:", err);
  }
}

// ─── Knowledge Storage Helper ─────────────────────────────────────────────────

async function storeKnowledge(entry: InsertKnowledgeEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(knowledgeBase).values(entry);
  } catch (err) {
    console.error("[KnowledgeEngine] storeKnowledge error:", err);
  }
}

// ─── Knowledge Query API ──────────────────────────────────────────────────────

/**
 * Get the most relevant knowledge for a given instrument before making a trade decision.
 * Feeds accumulated knowledge back into the AI decision-making process.
 */
export async function getRelevantKnowledge(instrument: string, limit = 5): Promise<string> {
  const db = await getDb();
  if (!db) return "";

  try {
    const rows = await db
      .select()
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.isActive, true),
          sql`(subject = ${instrument} OR subject = 'GLOBAL')`
        )
      )
      .orderBy(desc(knowledgeBase.confidence), desc(knowledgeBase.validations))
      .limit(limit);

    if (rows.length === 0) return "";

    return `\n\n=== ACCUMULATED KNOWLEDGE FOR ${instrument} ===\n` +
      rows.map((k, i) =>
        `${i + 1}. [${k.knowledgeType}] "${k.title}" (confidence: ${k.confidence}%, validated: ${k.validations}x)\n   ${k.content.substring(0, 200)}...`
      ).join("\n\n") +
      "\n=== END KNOWLEDGE ===\n";
  } catch {
    return "";
  }
}

/**
 * Get the instrument profile for trade sizing and strategy selection.
 */
export async function getInstrumentProfile(instrument: string): Promise<typeof instrumentProfiles.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const rows = await db
      .select()
      .from(instrumentProfiles)
      .where(eq(instrumentProfiles.instrument, instrument))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get knowledge statistics for the dashboard.
 */
export async function getKnowledgeStats() {
  const db = await getDb();
  if (!db) return { totalEntries: 0, byType: {} as Record<string, number>, avgConfidence: 0, mostValidated: "", recentEntries: [] as typeof knowledgeBase.$inferSelect[] };

  try {
    const allEntries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.isActive, true))
      .orderBy(desc(knowledgeBase.createdAt))
      .limit(100);

    const byType: Record<string, number> = {};
    let totalConf = 0;
    let mostValidated = "";
    let maxValidations = 0;

    for (const entry of allEntries) {
      byType[entry.knowledgeType] = (byType[entry.knowledgeType] ?? 0) + 1;
      totalConf += entry.confidence;
      if (entry.validations > maxValidations) {
        maxValidations = entry.validations;
        mostValidated = entry.title;
      }
    }

    return {
      totalEntries: allEntries.length,
      byType,
      avgConfidence: allEntries.length > 0 ? Math.round(totalConf / allEntries.length) : 0,
      mostValidated,
      recentEntries: allEntries.slice(0, 10),
    };
  } catch {
    return { totalEntries: 0, byType: {} as Record<string, number>, avgConfidence: 0, mostValidated: "", recentEntries: [] as typeof knowledgeBase.$inferSelect[] };
  }
}

/**
 * Get all instrument profiles for the dashboard.
 */
export async function getAllInstrumentProfiles() {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(instrumentProfiles)
      .orderBy(desc(instrumentProfiles.lifetimeTrades));
  } catch {
    return [];
  }
}

/**
 * Get market regime history.
 */
export async function getMarketRegimeHistory(limit = 20) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(marketRegimeMemory)
      .orderBy(desc(marketRegimeMemory.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}
