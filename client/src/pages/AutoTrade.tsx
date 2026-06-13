import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Icons ────────────────────────────────────────────────────────────────────
function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function actionColor(action: string) {
  switch (action) {
    case "BUY": return "text-emerald-400";
    case "SELL": return "text-red-400";
    case "CLOSE": return "text-amber-400";
    case "HOLD": return "text-slate-400";
    default: return "text-slate-500";
  }
}

function actionBg(action: string) {
  switch (action) {
    case "BUY": return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "SELL": return "bg-red-500/10 border-red-500/30 text-red-400";
    case "CLOSE": return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    case "HOLD": return "bg-slate-500/10 border-slate-500/30 text-slate-400";
    case "SKIP": return "bg-slate-700/30 border-slate-600/30 text-slate-500";
    default: return "bg-slate-700/30 border-slate-600/30 text-slate-500";
  }
}

function takenColor(action: string) {
  switch (action) {
    case "opened": return "text-emerald-400";
    case "closed": return "text-amber-400";
    case "blocked_risk": return "text-red-400";
    case "blocked_confidence": return "text-orange-400";
    case "error": return "text-red-500";
    default: return "text-slate-500";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AutoTrade() {
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [interval, setIntervalVal] = useState(15);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const statusQuery = trpc.autoTrade.status.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const sessionsQuery = trpc.autoTrade.getSessions.useQuery();

  const activeSessionId = statusQuery.data?.sessionId;
  const logsQuery = trpc.autoTrade.getLogs.useQuery(
    { sessionId: activeSessionId ?? 0, limit: 80 },
    { enabled: !!activeSessionId, refetchInterval: 8000 }
  );

  // Mutations
  const startMutation = trpc.autoTrade.start.useMutation({
    onSuccess: (data) => {
      toast.success(`🤖 HJ Auto Trade started in ${data.mode.toUpperCase()} mode`);
      statusQuery.refetch();
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to start: ${err.message}`),
  });

  const stopMutation = trpc.autoTrade.stop.useMutation({
    onSuccess: () => {
      toast.success("🛑 Auto Trade stopped");
      setConfirmStop(false);
      statusQuery.refetch();
      sessionsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to stop: ${err.message}`),
  });

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logsQuery.data]);

  const status = statusQuery.data;
  const isRunning = status?.isRunning ?? false;
  const session = status?.session;
  const logs = [...(logsQuery.data ?? [])].reverse(); // show newest last

  function handleStart() {
    if (mode === "live" && !confirmLive) {
      setConfirmLive(true);
      return;
    }
    setConfirmLive(false);
    startMutation.mutate({ mode, cycleIntervalMinutes: interval });
  }

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <BrainIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              HJ Auto Trade Mode
            </h1>
            <p className="text-sm text-slate-400">Powered by Hamada's AI — Autonomous Market Intelligence</p>
          </div>
          {/* Live indicator */}
          {isRunning && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                {status?.mode?.toUpperCase()} — ACTIVE
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Control Panel ── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Engine Control Card */}
          <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ZapIcon /> Engine Control
            </h2>

            {!isRunning ? (
              <div className="space-y-4">
                {/* Mode selector */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Trading Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["paper", "live"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
                          mode === m
                            ? m === "live"
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                              : "bg-amber-500/20 border-amber-500/50 text-amber-300"
                            : "bg-white/3 border-white/8 text-slate-400 hover:border-white/20"
                        }`}
                      >
                        {m === "paper" ? "📄 Paper" : "⚡ Live"}
                      </button>
                    ))}
                  </div>
                  {mode === "live" && (
                    <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                      ⚠️ Live mode uses real money on Capital.com
                    </p>
                  )}
                </div>

                {/* Cycle interval */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">
                    Analysis Cycle — every {interval} min
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={interval}
                    onChange={(e) => setIntervalVal(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>5 min</span>
                    <span>60 min</span>
                  </div>
                </div>

                {/* Live confirmation */}
                {confirmLive && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
                    <p className="font-medium mb-2">⚠️ Confirm Live Trading</p>
                    <p className="text-xs text-amber-400/80 mb-3">
                      This will place REAL trades on your Capital.com account with $250. Are you sure?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmLive(false); startMutation.mutate({ mode: "live", cycleIntervalMinutes: interval }); }}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold"
                      >
                        Yes, Start Live
                      </button>
                      <button
                        onClick={() => setConfirmLive(false)}
                        className="flex-1 py-1.5 rounded-lg bg-white/8 text-slate-300 text-xs"
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
                    className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 shadow-lg shadow-amber-500/20"
                  >
                    {startMutation.isPending ? "Starting..." : "🚀 Activate HJ Auto Trade"}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Running stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Cycles Run", value: status?.cycleCount ?? 0 },
                    { label: "Total Trades", value: session?.totalTrades ?? 0 },
                    { label: "Winning", value: session?.winningTrades ?? 0 },
                    { label: "Session P&L", value: `$${parseFloat(session?.sessionPnl ?? "0").toFixed(2)}` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-white/4 p-3">
                      <div className="text-xs text-slate-400 mb-1">{s.label}</div>
                      <div
                        className="text-lg font-bold"
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-slate-400">
                  Last cycle: {formatTime(status?.lastCycleAt ?? null)}
                </div>

                {/* Stop controls */}
                {!confirmStop ? (
                  <button
                    onClick={() => setConfirmStop(true)}
                    className="w-full py-3 rounded-xl font-semibold text-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
                  >
                    <StopIcon /> Stop Engine
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                    <p className="text-xs text-red-300 mb-3">Stop the auto trade engine?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => stopMutation.mutate({ reason: "Manual stop by owner" })}
                        disabled={stopMutation.isPending}
                        className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {stopMutation.isPending ? "Stopping..." : "Stop Now"}
                      </button>
                      <button
                        onClick={() => setConfirmStop(false)}
                        className="flex-1 py-1.5 rounded-lg bg-white/8 text-slate-300 text-xs"
                      >
                        Keep Running
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strategy Info */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ShieldIcon /> Risk Parameters
            </h2>
            <div className="space-y-2 text-sm">
              {[
                { label: "Daily Loss Limit", value: "$7.50", color: "text-red-400" },
                { label: "Daily Profit Lock", value: "$10.00", color: "text-emerald-400" },
                { label: "Max Risk / Trade", value: "1%", color: "text-amber-400" },
                { label: "Min AI Confidence", value: "72%", color: "text-blue-400" },
                { label: "Max Open Positions", value: "3", color: "text-purple-400" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-slate-400">{r.label}</span>
                  <span className={`font-semibold ${r.color}`} style={{ fontFamily: "'Playfair Display', serif" }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendUpIcon /> Session History
            </h2>
            {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {sessionsQuery.data.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <div className="text-xs text-slate-300 font-medium">
                        {s.mode.toUpperCase()} — {s.totalTrades} trades
                      </div>
                      <div className="text-xs text-slate-500">{formatDateTime(s.startedAt)}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-bold ${parseFloat(s.sessionPnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {parseFloat(s.sessionPnl) >= 0 ? "+" : ""}${parseFloat(s.sessionPnl).toFixed(2)}
                      </div>
                      <div className={`text-xs px-1.5 py-0.5 rounded-full ${
                        s.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                        s.status === "stopped" ? "bg-red-500/20 text-red-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {s.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">No sessions yet</p>
            )}
          </div>
        </div>

        {/* ── Right: Live Decision Log ── */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/8 bg-white/3 h-full flex flex-col" style={{ minHeight: "600px" }}>
            <div className="p-5 border-b border-white/8 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BrainIcon /> AI Decision Log
                {isRunning && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                    LIVE
                  </span>
                )}
              </h2>
              <span className="text-xs text-slate-500">{logs.length} entries</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-white/4 flex items-center justify-center mb-4 text-3xl">
                    🤖
                  </div>
                  <p className="text-slate-400 font-medium mb-1">No decisions yet</p>
                  <p className="text-slate-500 text-sm">
                    {isRunning
                      ? "Waiting for the first analysis cycle..."
                      : "Start the engine to see AI decisions in real-time"}
                  </p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-white/6 bg-white/2 p-4 hover:bg-white/4 transition-colors duration-150"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Decision badge */}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${actionBg(log.decision)}`}>
                          {log.decision}
                        </span>
                        {/* Instrument */}
                        {log.instrument && log.instrument !== "ALL" && log.instrument !== "NONE" && (
                          <span className="text-xs font-semibold text-slate-300 bg-white/8 px-2 py-0.5 rounded-lg">
                            {log.instrument}
                          </span>
                        )}
                        {/* Confidence */}
                        {(log.confidence ?? 0) > 0 && (
                          <span className="text-xs text-slate-400">
                            {log.confidence}% confidence
                          </span>
                        )}
                        {/* Action taken */}
                        <span className={`text-xs font-medium ${takenColor(log.actionTaken)}`}>
                          → {log.actionTaken.replace("_", " ")}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                        {formatTime(log.createdAt)}
                      </span>
                    </div>

                    {/* Reasoning */}
                    <p className="text-xs text-slate-400 leading-relaxed">{log.reasoning}</p>

                    {/* Action detail */}
                    {log.actionDetail && log.actionDetail !== log.reasoning && (
                      <p className="text-xs text-slate-500 mt-1 italic">{log.actionDetail}</p>
                    )}

                    {/* P&L if realized */}
                    {log.pnlRealized && parseFloat(log.pnlRealized) !== 0 && (
                      <div className={`mt-2 text-sm font-bold ${parseFloat(log.pnlRealized) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        style={{ fontFamily: "'Playfair Display', serif" }}>
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
