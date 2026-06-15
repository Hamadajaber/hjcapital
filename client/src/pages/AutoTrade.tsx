import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Brain, Zap, Shield, TrendingUp, Square, Activity, Clock, Calendar, Bell, BellRing, Trash2, Plus, Lightbulb, BarChart3, Globe, Wifi, WifiOff } from "lucide-react";

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

// ─── Log Entries List (collapsible reasoning) ────────────────────────────────
type LogEntry = {
  id: number;
  decision: string;
  instrument?: string | null;
  confidence?: number | null;
  actionTaken: string;
  reasoning?: string | null;
  actionDetail?: string | null;
  pnlRealized?: string | null;
  createdAt: Date | string | null;
};

function LogEntriesList({ logs }: { logs: LogEntry[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Extract first meaningful sentence from reasoning (skip [SCAN:...] tags)
  const summarize = (text: string | null | undefined) => {
    if (!text) return "";
    // Remove [TAG] prefixes like [UNANIMOUS ENSEMBLE] [SCAN:EURUSD]
    const clean = text.replace(/\[.*?\]/g, "").trim();
    // Take first sentence or first 120 chars
    const dot = clean.search(/[.!?]/);
    if (dot > 0 && dot < 160) return clean.slice(0, dot + 1);
    return clean.slice(0, 120) + (clean.length > 120 ? "…" : "");
  };

  return (
    <>
      {logs.map((log) => {
        const isOpen = expanded.has(log.id);
        const hasDetail = !!log.reasoning && log.reasoning.length > 10;
        const summary = summarize(log.reasoning);
        const pnl = log.pnlRealized ? parseFloat(log.pnlRealized) : 0;

        return (
          <div
            key={log.id}
            className="hj-card transition-all duration-150"
            style={{ cursor: hasDetail ? "pointer" : "default" }}
            onClick={() => hasDetail && toggle(log.id)}
          >
            {/* Compact header row */}
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
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
                <ActionTakenBadge action={log.actionTaken} />
                {pnl !== 0 && (
                  <span className="text-xs font-semibold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(log.confidence ?? 0) > 0 && (
                  <span className="text-xs tabular-nums" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                    {log.confidence}%
                  </span>
                )}
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  {formatTime(log.createdAt)}
                </span>
                {hasDetail && (
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: "0.6rem" }}>{isOpen ? "▲" : "▼"}</span>
                )}
              </div>
            </div>

            {/* Summary line — always visible */}
            {summary && (
              <p className="px-4 pb-2 text-xs leading-relaxed" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                {summary}
              </p>
            )}

            {/* Expanded full reasoning */}
            {isOpen && hasDetail && (
              <div className="px-4 pb-3 border-t" style={{ borderColor: "var(--color-border-subtle)", paddingTop: "0.75rem" }}>
                {(log.confidence ?? 0) > 0 && (
                  <div className="confidence-bar mb-3">
                    <div className="confidence-fill" style={{ width: `${log.confidence}%` }} />
                  </div>
                )}
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                  {log.reasoning}
                </p>
                {log.actionDetail && log.actionDetail !== log.reasoning && (
                  <p className="text-xs mt-2 italic" style={{ color: "var(--color-text-tertiary)" }}>
                    {log.actionDetail}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
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

// ─── Price Alerts Card ───────────────────────────────────────────────────────
// ─── Intelligence Dashboard Card ─────────────────────────────────────────────
function IntelligenceDashboardCard() {
  const [activeTab, setActiveTab] = useState<"lessons" | "threshold" | "calendar" | "streaming">("lessons");

  const lessonsQuery = trpc.intelligence.getLessons.useQuery({ limit: 8 }, { refetchInterval: 60000 });
  const thresholdQuery = trpc.intelligence.getDynamicThreshold.useQuery(undefined, { refetchInterval: 30000 });
  const calendarQuery = trpc.intelligence.getCalendarEvents.useQuery(undefined, { refetchInterval: 300000 });
  const streamingQuery = trpc.intelligence.getStreamingStatus.useQuery(undefined, { refetchInterval: 10000 });

  const wsConnected = streamingQuery.data?.websocket.connected ?? false;

  const tabs = [
    { id: "lessons" as const, label: "AI Lessons" },
    { id: "threshold" as const, label: "Confidence" },
    { id: "calendar" as const, label: "Calendar" },
    { id: "streaming" as const, label: wsConnected ? "WS Live" : "Polling" },
  ];

  return (
    <div className="hj-card p-5">
      <h2 className="section-label flex items-center gap-2 mb-4">
        <Brain size={13} style={{ color: "var(--color-accent)" }} />
        AI Intelligence
      </h2>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: "8px" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-2 py-1 rounded text-xs transition-all"
            style={{
              fontFamily: "var(--font-sans)",
              background: activeTab === tab.id ? "var(--color-accent)" : "transparent",
              color: activeTab === tab.id ? "#000" : "var(--color-text-secondary)",
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lessons Tab */}
      {activeTab === "lessons" && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {lessonsQuery.isLoading ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Loading lessons...</p>
          ) : !lessonsQuery.data?.length ? (
            <div className="text-center py-6">
              <Lightbulb size={24} className="mx-auto mb-2" style={{ color: "var(--color-text-tertiary)" }} />
              <p className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                No lessons yet. The AI learns after each closed trade.
              </p>
            </div>
          ) : (
            lessonsQuery.data.map((lesson, i) => (
              <div key={i} className="p-3 rounded" style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}>
                    {lesson.instrument}
                  </span>
                  <span className="text-xs" style={{ fontFamily: "var(--font-sans)", color: parseFloat(lesson.pnl ?? "0") >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                    {parseFloat(lesson.pnl ?? "0") >= 0 ? "+" : ""}${parseFloat(lesson.pnl ?? "0").toFixed(2)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                  {lesson.lessonText}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confidence Threshold Tab */}
      {activeTab === "threshold" && (
        <div className="space-y-2">
          {thresholdQuery.isLoading ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Loading...</p>
          ) : (
            <>
              {[
                { label: "Dynamic Threshold", value: `${thresholdQuery.data?.threshold ?? "—"}%`, accent: true },
                { label: "7-Day Win Rate", value: `${thresholdQuery.data?.winRate?.toFixed(1) ?? "—"}%`, profit: true },
                { label: "Recent Trades (7d)", value: String(thresholdQuery.data?.totalTrades ?? "—") },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>{r.label}</span>
                  <span className="text-sm font-bold" style={{ fontFamily: "var(--font-serif)", color: r.accent ? "var(--color-accent)" : r.profit ? "var(--color-profit)" : "var(--color-text-primary)" }}>
                    {r.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2">
                <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>Engine Status</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                  fontFamily: "var(--font-sans)",
                  background: thresholdQuery.data?.shouldStop ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  color: thresholdQuery.data?.shouldStop ? "var(--color-loss)" : "var(--color-profit)",
                }}>
                  {thresholdQuery.data?.shouldStop ? "⚠ Auto-Stop Active" : "✓ Normal"}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Economic Calendar Tab */}
      {activeTab === "calendar" && (
        <div className="space-y-2">
          {calendarQuery.isLoading ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Checking calendar...</p>
          ) : (
            <>
              <div className="flex items-center gap-2 p-2 rounded mb-3" style={{
                background: calendarQuery.data?.shouldSkip ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                border: `1px solid ${calendarQuery.data?.shouldSkip ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              }}>
                <span className="text-sm">{calendarQuery.data?.shouldSkip ? "⚠️" : "✅"}</span>
                <p className="text-xs" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
                  {calendarQuery.data?.reason ?? "No high-impact events"}
                </p>
              </div>
              {(calendarQuery.data?.events ?? []).slice(0, 5).map((ev, i) => (
                <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>{ev.event}</span>
                    <span className="text-xs ml-2" style={{ color: "var(--color-text-tertiary)" }}>{ev.currency}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                    fontFamily: "var(--font-sans)",
                    background: ev.impact === "high" ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.15)",
                    color: ev.impact === "high" ? "var(--color-loss)" : "var(--color-gold)",
                  }}>
                    {ev.impact}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Streaming Status Tab */}
      {activeTab === "streaming" && (
        <div className="space-y-2">
          {streamingQuery.isLoading ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Loading...</p>
          ) : (
            <>
              <div className="flex items-center gap-2 p-2 rounded mb-3" style={{
                background: wsConnected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${wsConnected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              }}>
                {wsConnected
                  ? <Wifi size={14} style={{ color: "var(--color-profit)" }} />
                  : <WifiOff size={14} style={{ color: "var(--color-loss)" }} />}
                <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-sans)", color: wsConnected ? "var(--color-profit)" : "var(--color-loss)" }}>
                  {wsConnected ? "WebSocket Connected" : "Using REST Polling"}
                </span>
              </div>
              {[
                { label: "Reconnects", value: streamingQuery.data?.websocket.reconnectCount ?? 0 },
                { label: "Subscribed Epics", value: streamingQuery.data?.websocket.subscribedEpics?.length ?? 0 },
                { label: "Cached Prices", value: streamingQuery.data?.cachedPrices?.length ?? 0 },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>{r.label}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>{r.value}</span>
                </div>
              ))}
              {(streamingQuery.data?.cachedPrices ?? []).map((p) => (
                <div key={p.epic} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-accent)", fontFamily: "var(--font-sans)" }}>{p.epic}</span>
                  <div className="text-right">
                    <span className="text-xs" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>{p.mid.toFixed(5)}</span>
                    <span className="text-xs ml-2" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>{p.source}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PriceAlertsCard() {
  const [instrument, setInstrument] = useState("EURUSD");
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const utils = trpc.useUtils();
  const alertsQuery = trpc.priceAlerts.list.useQuery();
  const createMutation = trpc.priceAlerts.create.useMutation({
    onSuccess: () => {
      toast.success("Price alert created!");
      setTargetPrice("");
      setNote("");
      setShowForm(false);
      utils.priceAlerts.list.invalidate();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });
  const deleteMutation = trpc.priceAlerts.delete.useMutation({
    onSuccess: () => {
      toast.success("Alert removed");
      utils.priceAlerts.list.invalidate();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const alerts = alertsQuery.data ?? [];
  const active = alerts.filter(a => a.active);
  const triggered = alerts.filter(a => !a.active && a.triggered);

  return (
    <div className="space-y-3">
      {/* Active alerts list */}
      {active.length === 0 && !showForm && (
        <p className="text-xs text-center py-3" style={{ color: "var(--color-text-tertiary)" }}>
          No active alerts
        </p>
      )}
      {active.map(alert => (
        <div key={alert.id} className="flex items-center justify-between py-2"
          style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div className="flex items-center gap-2">
            <Bell size={11} style={{ color: "var(--color-accent)" }} />
            <div>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
                {alert.instrument}
              </span>
              <span className="text-xs ml-1" style={{ color: "var(--color-text-tertiary)" }}>
                {alert.condition} ${parseFloat(alert.targetPrice).toFixed(4)}
              </span>
              {alert.note && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>{alert.note}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => deleteMutation.mutate({ id: alert.id })}
            disabled={deleteMutation.isPending}
            className="p-1 rounded transition-colors hover:bg-[var(--color-bg-elevated)]"
            style={{ color: "var(--color-loss)" }}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Triggered alerts (last 3) */}
      {triggered.slice(0, 3).map(alert => (
        <div key={alert.id} className="flex items-center justify-between py-2 opacity-50"
          style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div className="flex items-center gap-2">
            <Bell size={11} style={{ color: "var(--color-text-tertiary)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
              {alert.instrument} {alert.condition} ${parseFloat(alert.targetPrice).toFixed(4)} — triggered
            </span>
          </div>
        </div>
      ))}

      {/* Add form */}
      {showForm ? (
        <div className="space-y-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Instrument</label>
              <select value={instrument} onChange={e => setInstrument(e.target.value)}
                className="w-full mt-1 rounded-lg px-2 py-1.5 text-xs"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                {["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Condition</label>
              <select value={condition} onChange={e => setCondition(e.target.value as "above" | "below")}
                className="w-full mt-1 rounded-lg px-2 py-1.5 text-xs"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Target Price</label>
            <input type="number" step="0.0001" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
              placeholder="e.g. 1.0850"
              className="w-full mt-1 rounded-lg px-2 py-1.5 text-xs"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Note (optional)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Support level"
              className="w-full mt-1 rounded-lg px-2 py-1.5 text-xs"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate({ instrument, targetPrice, condition, note: note || undefined })}
              disabled={!targetPrice || createMutation.isPending}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "var(--color-accent)", color: "oklch(0.1 0 0)", opacity: !targetPrice ? 0.5 : 1 }}>
              {createMutation.isPending ? "Saving..." : "Save Alert"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px dashed var(--color-border-default)" }}>
          <Plus size={12} /> Add Alert
        </button>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AutoTrade() {
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [interval, setIntervalVal] = useState(15);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const statusQuery = trpc.autoTrade.status.useQuery(undefined, { refetchInterval: 5000 });
  const sessionsQuery = trpc.autoTrade.getSessions.useQuery();
  const scheduleQuery = trpc.autoTrade.getSchedule.useQuery(undefined, { refetchInterval: 30000 });
  const enableScheduleMutation = trpc.autoTrade.enableSchedule.useMutation({
    onSuccess: () => { toast.success("Daily schedule enabled!"); scheduleQuery.refetch(); },
    onError: (e) => toast.error(`Failed to enable schedule: ${e.message}`),
  });
  const disableScheduleMutation = trpc.autoTrade.disableSchedule.useMutation({
    onSuccess: () => { toast.success("Daily schedule disabled."); scheduleQuery.refetch(); },
    onError: (e) => toast.error(`Failed to disable schedule: ${e.message}`),
  });
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

  // Auto-scroll only when user hasn't manually scrolled up
  // Use direct scrollTop assignment (not scrollIntoView) to avoid scrolling the outer page
  useEffect(() => {
    if (userScrolled) return;
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logsQuery.data, userScrolled]);

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
      className="min-h-screen p-4 md:p-6"
      style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      {/* ── Page Header ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {/* Icon mark */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--color-accent-light), var(--color-bg-elevated))",
                border: "1px solid var(--color-accent-dim)",
              }}
            >
              <Brain size={18} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <h1
                className="text-xl md:text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-serif)", color: "var(--color-text-primary)" }}
              >
                HJ Auto Trade Mode
              </h1>
              <p className="section-label mt-0.5 hidden sm:block">Powered by Hamada's AI — Autonomous Market Intelligence</p>
            </div>
          </div>

          {/* Live status pill */}
          {isRunning && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
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
        <div className="hj-divider mt-4" />
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
              <div className="space-y-4">
                {/* Engine is stopped — show restart option */}
                <div
                  className="rounded-lg p-4 text-center"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: "var(--color-loss-bg)", border: "1px solid oklch(0.500 0.140 20 / 0.25)" }}>
                    <Square size={16} style={{ color: "var(--color-loss)" }} />
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-serif)" }}>
                    Engine Stopped
                  </p>
                  <p className="text-xs mb-4" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                    The engine auto-starts on server boot in Live mode.
                    Restart manually if needed.
                  </p>
                  <button
                    onClick={() => startMutation.mutate({ mode: "live", cycleIntervalMinutes: 15 })}
                    disabled={startMutation.isPending}
                    className="hj-btn hj-btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-50"
                  >
                    <Brain size={15} />
                    {startMutation.isPending ? "Starting..." : "Restart Engine (Live)"}
                  </button>
                </div>
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

                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                    Last cycle: {formatTime(status?.lastCycleAt ?? null)}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "var(--color-profit-bg)", color: "var(--color-profit)", fontFamily: "var(--font-sans)" }}>
                    Auto-started • Live • 15 min
                  </span>
                </div>

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
                { label: "Min AI Confidence", value: "55%",    color: "var(--color-accent)" },
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
          {/* Intelligence Dashboard Card */}
          <IntelligenceDashboardCard />

          {/* Price Alerts Card */}
          <div className="hj-card p-5">
            <h2 className="section-label flex items-center gap-2 mb-4">
              <BellRing size={13} style={{ color: "var(--color-accent)" }} />
              Price Alerts
            </h2>
            <PriceAlertsCard />
          </div>

          {/* Scheduled Automation Card */}
          <div className="hj-card p-5">
            <h2 className="section-label flex items-center gap-2 mb-4">
              <Calendar size={13} style={{ color: "var(--color-accent)" }} />
              Scheduled Automation
            </h2>

            {/* Schedule info */}
            <div className="space-y-2 mb-4">
              {[
                { label: "Auto-Start", value: "10:00 AM Cairo (Mon–Fri)", icon: "🟢" },
                { label: "Auto-Stop",  value: "11:00 PM Cairo (Mon–Fri)", icon: "🔴" },
                { label: "Mode",       value: scheduleQuery.data?.defaultMode?.toUpperCase() ?? "PAPER", icon: "📊" },
                { label: "Cycle",      value: `Every ${scheduleQuery.data?.cycleIntervalMinutes ?? 15} min`, icon: "🔄" },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                >
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                    {r.icon} {r.label}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Enable / Disable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
                  {scheduleQuery.data?.enabled ? "Schedule Active" : "Schedule Inactive"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                  {scheduleQuery.data?.enabled
                    ? "Engine starts/stops automatically every weekday"
                    : "Enable to auto-start the engine daily"}
                </p>
              </div>
              <button
                onClick={() => {
                  if (scheduleQuery.data?.enabled) {
                    disableScheduleMutation.mutate();
                  } else {
                    enableScheduleMutation.mutate({ mode: "paper", cycleIntervalMinutes: 15 });
                  }
                }}
                disabled={enableScheduleMutation.isPending || disableScheduleMutation.isPending}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                  scheduleQuery.data?.enabled
                    ? "bg-[var(--color-profit)]"
                    : "bg-[var(--color-border-subtle)]"
                }`}
                style={{ minWidth: 44 }}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    scheduleQuery.data?.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {scheduleQuery.data?.enabled && (
              <p className="text-xs mt-3 text-center" style={{ color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
                <Clock size={10} className="inline mr-1" />
                Runs automatically — no action needed
              </p>
            )}
          </div>
        </div>

        {/* ── Right: AI Decision Log ── */}
        <div className="lg:col-span-2">
          <div
            className="hj-card flex flex-col"
            style={{ height: "clamp(400px, 60vh, 680px)", maxHeight: "680px" }}
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
              <div className="flex items-center gap-2">
                <span className="section-label">{logs.length} entries</span>
                {userScrolled && (
                  <button
                    onClick={() => {
                      setUserScrolled(false);
                      const el = logContainerRef.current;
                      if (el) el.scrollTop = el.scrollHeight;
                    }}
                    className="text-xs px-2 py-0.5 rounded-full transition-all"
                    style={{
                      fontFamily: "var(--font-sans)",
                      background: "var(--color-accent)",
                      color: "#000",
                      fontWeight: 600,
                    }}
                  >
                    ↓ Latest
                  </button>
                )}
              </div>
            </div>

            {/* Log body */}
            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3"
              onScroll={() => {
                const el = logContainerRef.current;
                if (!el) return;
                // If user scrolled up more than 60px from bottom, lock auto-scroll
                const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                setUserScrolled(distFromBottom > 60);
              }}
            >
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
                <LogEntriesList logs={logs} />
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
