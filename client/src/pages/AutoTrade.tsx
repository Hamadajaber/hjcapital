import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Brain, Zap, Shield, TrendingUp, Square, Activity } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DecisionBadge({ action }: { action: string }) {
  const cls = (() => {
    switch (action) {
      case "BUY":   return "signal-buy";
      case "SELL":  return "signal-sell";
      case "CLOSE": return "signal-hold";
      case "HOLD":  return "signal-hold";
      default:      return "hj-badge";
    }
  })();
  return <span className={cls}>{action}</span>;
}

function ActionTakenBadge({ action }: { action: string }) {
  const label = action.replace(/_/g, " ");
  const cls = (() => {
    switch (action) {
      case "opened":              return "text-profit font-semibold";
      case "closed":              return "text-gold font-semibold";
      case "blocked_risk":        return "text-loss font-semibold";
      case "blocked_confidence":  return "text-gold font-semibold";
      case "error":               return "text-loss font-semibold";
      default:                    return "text-[var(--color-text-tertiary)]";
    }
  })();
  return (
    <span className={`text-xs ${cls}`} style={{ fontFamily: "var(--font-sans)" }}>
      → {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AutoTrade() {
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [interval, setIntervalVal] = useState(15);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const statusQuery = trpc.autoTrade.status.useQuery(undefined, { refetchInterval: 5000 });
  const sessionsQuery = trpc.autoTrade.getSessions.useQuery();
  const activeSessionId = statusQuery.data?.sessionId;
  const logsQuery = trpc.autoTrade.getLogs.useQuery(
    { sessionId: activeSessionId ?? 0, limit: 80 },
    { enabled: !!activeSessionId, refetchInterval: 8000 }
  );

  const startMutation = trpc.autoTrade.start.useMutation({
    onSuccess: (data) => {
      toast.success(`HJ Auto Trade started in ${data.mode.toUpperCase()} mode`);
      statusQuery.refetch();
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to start: ${err.message}`),
  });

  const stopMutation = trpc.autoTrade.stop.useMutation({
    onSuccess: () => {
      toast.success("Auto Trade stopped");
      setConfirmStop(false);
      statusQuery.refetch();
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to stop: ${err.message}`),
  });

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logsQuery.data]);

  const status = statusQuery.data;
  const isRunning = status?.isRunning ?? false;
  const session = status?.session;
  const logs = [...(logsQuery.data ?? [])].reverse();

  function handleStart() {
    if (mode === "live" && !confirmLive) { setConfirmLive(true); return; }
    setConfirmLive(false);
    startMutation.mutate({ mode, cycleIntervalMinutes: interval });
  }

  const sessionPnl = parseFloat(session?.sessionPnl ?? "0");

  return (
    <div
      className="min-h-screen p-6 md:p-8"
      style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      {/* ── Page Header ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {/* Icon mark */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--color-accent-light), var(--color-bg-elevated))",
                border: "1px solid var(--color-accent-dim)",
              }}
            >
              <Brain size={22} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <h1
                className="text-2xl md:text-3xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
              >
                HJ Auto Trade Mode
              </h1>
              <p className="section-label mt-0.5">Powered by Hamada's AI — Autonomous Market Intelligence</p>
            </div>
          </div>

          {/* Live status pill */}
          {isRunning && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: "var(--color-profit-bg)",
                border: "1px solid oklch(0.440 0.080 145 / 0.30)",
              }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--color-profit)" }}
              />
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "var(--color-profit)", fontFamily: "var(--font-sans)" }}
              >
                {status?.mode?.toUpperCase()} — ACTIVE
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hj-divider mt-6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left Column ── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Engine Control Card */}
          <div className="hj-card p-5">
            <h2 className="section-label flex items-center gap-2 mb-5">
              <Zap size={13} style={{ color: "var(--color-accent)" }} />
              Engine Control
            </h2>

            {!isRunning ? (
              <div className="space-y-5">
                {/* Mode selector */}
                <div>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                    Trading Mode
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["paper", "live"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className="py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 border"
                        style={{
                          fontFamily: "var(--font-sans)",
                          letterSpacing: "0.04em",
                          background: mode === m
                            ? (m === "live" ? "var(--color-loss-bg)" : "var(--color-gold-bg)")
                            : "var(--color-bg-elevated)",
                          borderColor: mode === m
                            ? (m === "live" ? "oklch(0.500 0.140 20 / 0.35)" : "oklch(0.620 0.130 72 / 0.35)")
                            : "var(--color-border-subtle)",
                          color: mode === m
                            ? (m === "live" ? "var(--color-loss)" : "var(--color-gold)")
                            : "var(--color-text-secondary)",
                        }}
                      >
                        {m === "paper" ? "📄 Paper" : "⚡ Live"}
                      </button>
                    ))}
                  </div>
                  {mode === "live" && (
                    <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--color-gold)" }}>
                      ⚠️ Live mode uses real money on Capital.com
                    </p>
                  )}
                </div>

                {/* Cycle interval */}
                <div>
                  <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                    Analysis Cycle — every{" "}
                    <span style={{ fontFamily: "var(--font-serif)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {interval}
                    </span>{" "}
                    min
                  </p>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={interval}
                    onChange={(e) => setIntervalVal(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: "var(--color-accent)" }}
                  />
                  <div
                    className="flex justify-between text-xs mt-1"
                    style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}
                  >
                    <span>5 min</span>
                    <span>60 min</span>
                  </div>
                </div>

                {/* Live confirmation */}
                {confirmLive && (
                  <div
                    className="rounded-lg p-4"
                    style={{
                      background: "var(--color-gold-bg)",
                      border: "1px solid oklch(0.620 0.130 72 / 0.30)",
                    }}
                  >
                    <p
                      className="text-sm font-semibold mb-1"
                      style={{ color: "var(--color-gold)", fontFamily: "var(--font-sans)" }}
                    >
                      ⚠️ Confirm Live Trading
                    </p>
                    <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
                      This will place REAL trades on your Capital.com account. Are you sure?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmLive(false); startMutation.mutate({ mode: "live", cycleIntervalMinutes: interval }); }}
                        className="hj-btn hj-btn-primary flex-1 justify-center py-2 text-xs"
                      >
                        Yes, Start Live
                      </button>
                      <button
                        onClick={() => setConfirmLive(false)}
                        className="hj-btn hj-btn-ghost flex-1 justify-center py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Start button */}
                {!confirmLive && (
                  <button
                    onClick={handleStart}
                    disabled={startMutation.isPending}
                    className="hj-btn hj-btn-primary w-full justify-center py-3 text-sm disabled:opacity-50"
                  >
                    <Brain size={16} />
                    {startMutation.isPending ? "Starting..." : "Activate HJ Auto Trade"}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Running stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Cycles Run",   value: String(status?.cycleCount ?? 0) },
                    { label: "Total Trades", value: String(session?.totalTrades ?? 0) },
                    { label: "Winning",      value: String(session?.winningTrades ?? 0) },
                    {
                      label: "Session P&L",
                      value: `${sessionPnl >= 0 ? "+" : ""}$${sessionPnl.toFixed(2)}`,
                      pnl: sessionPnl,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg p-3"
                      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
                    >
                      <div className="section-label mb-1">{s.label}</div>
                      <div
                        className="text-lg font-semibold"
                        style={{
                          fontFamily: "var(--font-serif)",
                          color: s.pnl !== undefined
                            ? (s.pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)")
                            : "var(--color-text-primary)",
                        }}
                      >
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  Last cycle: {formatTime(status?.lastCycleAt ?? null)}
                </p>

                {/* Stop controls */}
                {!confirmStop ? (
                  <button
                    onClick={() => setConfirmStop(true)}
                    className="hj-btn hj-btn-ghost w-full justify-center py-2.5 text-sm"
                    style={{ borderColor: "oklch(0.500 0.140 20 / 0.30)", color: "var(--color-loss)" }}
                  >
                    <Square size={14} />
                    Stop Engine
                  </button>
                ) : (
                  <div
                    className="rounded-lg p-4"
                    style={{ background: "var(--color-loss-bg)", border: "1px solid oklch(0.500 0.140 20 / 0.30)" }}
                  >
                    <p className="text-xs mb-3" style={{ color: "var(--color-loss)", fontFamily: "var(--font-sans)" }}>
                      Stop the auto trade engine?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => stopMutation.mutate({ reason: "Manual stop by owner" })}
                        disabled={stopMutation.isPending}
                        className="hj-btn flex-1 justify-center py-2 text-xs font-bold disabled:opacity-50"
                        style={{ background: "var(--color-loss)", color: "white" }}
                      >
                        {stopMutation.isPending ? "Stopping..." : "Stop Now"}
                      </button>
                      <button
                        onClick={() => setConfirmStop(false)}
                        className="hj-btn hj-btn-ghost flex-1 justify-center py-2 text-xs"
                      >
                        Keep Running
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Risk Parameters Card */}
          <div className="hj-card p-5">
            <h2 className="section-label flex items-center gap-2 mb-4">
              <Shield size={13} style={{ color: "var(--color-accent)" }} />
              Risk Parameters
            </h2>
            <div className="space-y-3">
              {[
                { label: "Daily Loss Limit",  value: "$7.50",  color: "var(--color-loss)" },
                { label: "Daily Profit Lock", value: "$10.00", color: "var(--color-profit)" },
                { label: "Max Risk / Trade",  value: "1%",     color: "var(--color-gold)" },
                { label: "Min AI Confidence", value: "72%",    color: "var(--color-accent)" },
                { label: "Max Open Positions",value: "3",      color: "var(--color-text-secondary)" },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between py-2"
                  style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                >
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                    {r.label}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ fontFamily: "var(--font-serif)", color: r.color }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Session History Card */}
          <div className="hj-card p-5">
            <h2 className="section-label flex items-center gap-2 mb-4">
              <TrendingUp size={13} style={{ color: "var(--color-accent)" }} />
              Session History
            </h2>
            {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
              <div className="space-y-1">
                {sessionsQuery.data.slice(0, 5).map((s) => {
                  const pnl = parseFloat(s.sessionPnl);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-2.5"
                      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                    >
                      <div>
                        <div
                          className="text-xs font-semibold"
                          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}
                        >
                          {s.mode.toUpperCase()} — {s.totalTrades} trades
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                          {formatDateTime(s.startedAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-sm font-semibold"
                          style={{
                            fontFamily: "var(--font-serif)",
                            color: pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)",
                          }}
                        >
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        <span
                          className={s.status === "active" ? "signal-buy" : "signal-hold"}
                          style={{ fontSize: "0.55rem" }}
                        >
                          {s.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-center py-6" style={{ color: "var(--color-text-tertiary)" }}>
                No sessions yet
              </p>
            )}
          </div>
        </div>

        {/* ── Right: AI Decision Log ── */}
        <div className="lg:col-span-2">
          <div
            className="hj-card flex flex-col"
            style={{ minHeight: "600px" }}
          >
            {/* Log header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
            >
              <h2 className="section-label flex items-center gap-2">
                <Activity size={13} style={{ color: "var(--color-accent)" }} />
                AI Decision Log
                {isRunning && (
                  <span
                    className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold tracking-widest uppercase animate-pulse"
                    style={{
                      background: "var(--color-profit-bg)",
                      color: "var(--color-profit)",
                      border: "1px solid oklch(0.440 0.080 145 / 0.30)",
                    }}
                  >
                    LIVE
                  </span>
                )}
              </h2>
              <span className="section-label">{logs.length} entries</span>
            </div>

            {/* Log body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
                  >
                    <Brain size={28} style={{ color: "var(--color-text-tertiary)" }} />
                  </div>
                  <p
                    className="font-medium mb-1 text-sm"
                    style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}
                  >
                    No decisions yet
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                    {isRunning
                      ? "Waiting for the first analysis cycle..."
                      : "Start the engine to see AI decisions in real-time"}
                  </p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="hj-card p-4 transition-all duration-150"
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DecisionBadge action={log.decision} />
                        {log.instrument && log.instrument !== "ALL" && log.instrument !== "NONE" && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{
                              background: "var(--color-bg-elevated)",
                              border: "1px solid var(--color-border-subtle)",
                              color: "var(--color-text-primary)",
                              fontFamily: "var(--font-sans)",
                            }}
                          >
                            {log.instrument}
                          </span>
                        )}
                        {(log.confidence ?? 0) > 0 && (
                          <span className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                            {log.confidence}% confidence
                          </span>
                        )}
                        <ActionTakenBadge action={log.actionTaken} />
                      </div>
                      <span
                        className="text-xs whitespace-nowrap shrink-0"
                        style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}
                      >
                        {formatTime(log.createdAt)}
                      </span>
                    </div>

                    {/* Confidence bar */}
                    {(log.confidence ?? 0) > 0 && (
                      <div className="confidence-bar mb-2">
                        <div
                          className="confidence-fill"
                          style={{ width: `${log.confidence}%` }}
                        />
                      </div>
                    )}

                    {/* Reasoning */}
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}
                    >
                      {log.reasoning}
                    </p>

                    {/* Action detail */}
                    {log.actionDetail && log.actionDetail !== log.reasoning && (
                      <p
                        className="text-xs mt-1 italic"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {log.actionDetail}
                      </p>
                    )}

                    {/* P&L */}
                    {log.pnlRealized && parseFloat(log.pnlRealized) !== 0 && (
                      <div
                        className="mt-2 text-sm font-semibold"
                        style={{
                          fontFamily: "var(--font-serif)",
                          color: parseFloat(log.pnlRealized) >= 0 ? "var(--color-profit)" : "var(--color-loss)",
                        }}
                      >
                        P&L: {parseFloat(log.pnlRealized) >= 0 ? "+" : ""}${parseFloat(log.pnlRealized).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
