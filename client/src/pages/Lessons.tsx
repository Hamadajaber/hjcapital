import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Brain, TrendingUp, TrendingDown, Lightbulb,
  CheckCircle2, XCircle, Filter, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const INSTRUMENTS = ["All", "EURUSD", "GBPUSD", "USDJPY", "EURGBP", "GOLD", "XAGUSD", "US500", "GER40", "NASDAQ"];

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-lg transition-all duration-150"
      style={{
        background: active ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
        color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
        fontWeight: active ? 600 : 400,
        fontFamily: "var(--font-sans)",
      }}
    >
      {children}
    </button>
  );
}

function LessonCard({ lesson }: { lesson: {
  id: number;
  instrument: string;
  direction: "BUY" | "SELL";
  entryPrice: string | null;
  exitPrice: string | null;
  pnl: string | null;
  wasCorrect: boolean;
  aiVerdict: string;
  lessonText: string;
  marketConditions: string | null;
  mode: "paper" | "live";
  createdAt: Date;
}}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = parseFloat(lesson.pnl ?? "0");
  const isProfit = pnl > 0;

  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: `1px solid ${lesson.wasCorrect ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)"}`,
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{
              background: lesson.direction === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: lesson.direction === "BUY" ? "var(--color-profit)" : "var(--color-loss)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {lesson.direction}
          </span>
          <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
            {lesson.instrument}
          </span>
          {lesson.wasCorrect ? (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-profit)", fontFamily: "var(--font-sans)" }}>
              <CheckCircle2 size={12} /> Correct
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-loss)", fontFamily: "var(--font-sans)" }}>
              <XCircle size={12} /> Incorrect
            </span>
          )}
          {/* Mode badge */}
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: lesson.mode === "live" ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.15)",
              color: lesson.mode === "live" ? "var(--color-loss)" : "var(--color-text-tertiary)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {lesson.mode}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lesson.pnl !== null && (
            <span
              className="tabular-nums font-bold"
              style={{
                fontSize: "0.9375rem",
                fontFamily: "var(--font-serif)",
                color: isProfit ? "var(--color-profit)" : pnl < 0 ? "var(--color-loss)" : "var(--color-text-secondary)",
              }}
            >
              {isProfit ? "+" : ""}${pnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Lesson text */}
      <div className="flex items-start gap-2 mt-2">
        <Lightbulb size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-gold, #f59e0b)" }} />
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-sans)" }}>
          {lesson.lessonText}
        </p>
      </div>

      {/* Footer meta */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {lesson.entryPrice && (
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
            Entry: <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{parseFloat(lesson.entryPrice).toFixed(5)}</span>
          </span>
        )}
        {lesson.exitPrice && (
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
            Exit: <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{parseFloat(lesson.exitPrice).toFixed(5)}</span>
          </span>
        )}
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
          {new Date(lesson.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Expanded: AI Verdict + Market Conditions */}
      {expanded && (
        <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
          {lesson.aiVerdict && (
            <div>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}>AI Verdict: </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-sans)" }}>{lesson.aiVerdict}</span>
            </div>
          )}
          {lesson.marketConditions && (
            <div>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>Market Context: </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", lineHeight: 1.6, fontFamily: "var(--font-sans)" }}>{lesson.marketConditions}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weekly Accuracy Trend Chart ─────────────────────────────────────────────

function buildWeeklyTrend(lessons: Array<{ wasCorrect: boolean; createdAt: Date }>) {
  if (lessons.length === 0) return [];

  // Group by ISO week (Mon–Sun)
  const weekMap = new Map<string, { correct: number; total: number }>();
  for (const l of lessons) {
    const d = new Date(l.createdAt);
    // Get Monday of that week
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const key = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const existing = weekMap.get(key) ?? { correct: 0, total: 0 };
    existing.total++;
    if (l.wasCorrect) existing.correct++;
    weekMap.set(key, existing);
  }

  return Array.from(weekMap.entries())
    .map(([week, { correct, total }]) => ({
      week,
      accuracy: Math.round((correct / total) * 100),
      total,
    }))
    .slice(-8); // last 8 weeks
}

export default function Lessons() {
  const [selectedInstrument, setSelectedInstrument] = useState("All");
  const [filterCorrect, setFilterCorrect] = useState<"all" | "correct" | "incorrect">("all");
  const [filterMode, setFilterMode] = useState<"all" | "paper" | "live">("all");

  const lessonsQuery = trpc.intelligence.getLessons.useQuery(
    {
      instrument: selectedInstrument === "All" ? undefined : selectedInstrument,
      limit: 100,
      mode: filterMode === "all" ? undefined : filterMode,
    },
    { refetchInterval: 60000 }
  );

  const lessons = lessonsQuery.data ?? [];

  // Filter by correct/incorrect (client-side)
  const filteredLessons = useMemo(() => {
    if (filterCorrect === "correct") return lessons.filter((l) => l.wasCorrect);
    if (filterCorrect === "incorrect") return lessons.filter((l) => !l.wasCorrect);
    return lessons;
  }, [lessons, filterCorrect]);

  // Summary stats
  const stats = useMemo(() => {
    const total = lessons.length;
    const correct = lessons.filter((l) => l.wasCorrect).length;
    const incorrect = total - correct;
    const winRate = total > 0 ? (correct / total) * 100 : 0;
    const totalPnl = lessons.reduce((sum, l) => sum + parseFloat(l.pnl ?? "0"), 0);
    return { total, correct, incorrect, winRate, totalPnl };
  }, [lessons]);

  // Weekly trend data
  const weeklyTrend = useMemo(() => buildWeeklyTrend(lessons), [lessons]);

  // Instrument performance comparison (always computed from ALL lessons, ignoring instrument filter)
  const allLessonsQuery = trpc.intelligence.getLessons.useQuery(
    { limit: 200, mode: filterMode === "all" ? undefined : filterMode },
    { refetchInterval: 60000 }
  );
  const allLessons = allLessonsQuery.data ?? [];

  const instrumentStats = useMemo(() => {
    const map = new Map<string, { correct: number; total: number; pnl: number }>();
    for (const l of allLessons) {
      const existing = map.get(l.instrument) ?? { correct: 0, total: 0, pnl: 0 };
      existing.total++;
      if (l.wasCorrect) existing.correct++;
      existing.pnl += parseFloat(l.pnl ?? "0");
      map.set(l.instrument, existing);
    }
    return Array.from(map.entries())
      .map(([instrument, { correct, total, pnl }]) => ({
        instrument,
        total,
        correct,
        winRate: Math.round((correct / total) * 100),
        pnl: parseFloat(pnl.toFixed(2)),
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [allLessons]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)" }}
          >
            <Brain size={18} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              AI Lessons Learned
            </h1>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
              What the engine learned from every closed trade
            </p>
          </div>
        </div>
        <button
          onClick={() => lessonsQuery.refetch()}
          className="p-2 rounded-lg transition-colors"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: "var(--color-text-tertiary)" }} className={lessonsQuery.isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Lessons", value: stats.total, icon: <Lightbulb size={14} /> },
          { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, icon: <TrendingUp size={14} />, color: stats.winRate >= 50 ? "var(--color-profit)" : "var(--color-loss)" },
          { label: "Correct", value: stats.correct, icon: <CheckCircle2 size={14} />, color: "var(--color-profit)" },
          { label: "Total P&L", value: `${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl.toFixed(2)}`, icon: <TrendingDown size={14} />, color: stats.totalPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-3"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
          >
            <div className="flex items-center gap-1.5 mb-1" style={{ color: s.color ?? "var(--color-text-tertiary)" }}>
              {s.icon}
              <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-sans)", color: "var(--color-text-tertiary)" }}>{s.label}</span>
            </div>
            <p
              className="tabular-nums"
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                fontFamily: "var(--font-serif)",
                color: s.color ?? "var(--color-text-primary)",
              }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Weekly Accuracy Trend Chart */}
      {weeklyTrend.length >= 2 && (
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              Weekly Accuracy Trend
            </p>
            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
              Last {weeklyTrend.length} weeks
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                }}
                formatter={(value: number, _: string, props: any) => [
                  `${value}% (${props.payload.total} trades)`,
                  "Accuracy",
                ]}
              />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ fill: "var(--color-accent)", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters Row */}
      <div className="space-y-3">
        {/* Mode Filter */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Filter size={12} style={{ color: "var(--color-text-tertiary)" }} />
            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>Trading Mode</span>
          </div>
          <div className="flex gap-2">
            {(["all", "paper", "live"] as const).map((m) => (
              <FilterPill key={m} active={filterMode === m} onClick={() => setFilterMode(m)}>
                {m === "all" ? "All Modes" : m === "paper" ? "📄 Paper" : "🔴 Live"}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* Instrument Filter */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Filter size={12} style={{ color: "var(--color-text-tertiary)" }} />
            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>Instrument</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTS.map((inst) => (
              <FilterPill
                key={inst}
                active={selectedInstrument === inst}
                onClick={() => setSelectedInstrument(inst)}
              >
                {inst}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* Correct / Incorrect Filter */}
        <div className="flex gap-2">
          {(["all", "correct", "incorrect"] as const).map((f) => (
            <FilterPill
              key={f}
              active={filterCorrect === f}
              onClick={() => setFilterCorrect(f)}
            >
              {f === "all" ? "All" : f === "correct" ? "✓ Correct" : "✗ Incorrect"}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Instrument Performance Comparison Table */}
      {instrumentStats.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              Instrument Performance Comparison
            </h3>
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginTop: 2 }}>
              Win rate &amp; P&amp;L per instrument across all lessons
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "0.75rem", fontFamily: "var(--font-sans)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  {["Instrument", "Trades", "Win Rate", "P&L", "Bar"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left" style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instrumentStats.map((row, i) => {
                  const isPositive = row.pnl >= 0;
                  const barColor = row.winRate >= 60 ? "var(--color-accent)" : row.winRate >= 40 ? "#f59e0b" : "#ef4444";
                  return (
                    <tr
                      key={row.instrument}
                      style={{
                        borderBottom: i < instrumentStats.length - 1 ? "1px solid var(--color-border-subtle)" : undefined,
                        background: selectedInstrument === row.instrument ? "var(--color-accent-dim)" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedInstrument(selectedInstrument === row.instrument ? "All" : row.instrument)}
                    >
                      <td className="px-4 py-2.5" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{row.instrument}</td>
                      <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{row.total}</td>
                      <td className="px-4 py-2.5">
                        <span style={{ color: row.winRate >= 50 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                          {row.winRate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: isPositive ? "#22c55e" : "#ef4444", fontWeight: 500 }}>
                        {isPositive ? "+" : ""}{row.pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5" style={{ minWidth: 80 }}>
                        <div className="rounded-full overflow-hidden" style={{ height: 6, background: "var(--color-bg-surface)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${row.winRate}%`, background: barColor }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lessons List */}
      {lessonsQuery.isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-4 animate-pulse"
              style={{ background: "var(--color-bg-elevated)", height: 96 }}
            />
          ))}
        </div>
      ) : filteredLessons.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
        >
          <Brain size={32} className="mx-auto mb-3" style={{ color: "var(--color-text-tertiary)", opacity: 0.4 }} />
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
            No lessons yet
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", marginTop: 4 }}>
            The AI learns after each closed trade. Lessons will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson as any} />
          ))}
        </div>
      )}
    </div>
  );
}
