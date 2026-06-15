import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Filter, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp, Activity, ArrowLeftRight } from "lucide-react";

const INSTRUMENTS = ["All", "EURUSD", "GBPUSD", "GOLD", "US500", "BTC"];
const STATUSES = ["All", "open", "closed", "cancelled"] as const;

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
      }}
    >
      {children}
    </button>
  );
}

// Mobile card view for a single trade
function TradeMobileCard({ trade }: { trade: {
  id: number; instrument: string; direction: "BUY" | "SELL";
  openPrice: string; closePrice: string | null; size: string;
  pnl: string | null; status: "open" | "closed" | "cancelled";
  aiReasoning: string | null; aiConfidence: number | null;
  openedAt: Date; closedAt: Date | null; mode: "paper" | "live";
}}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = parseFloat(trade.pnl ?? "0");
  const isProfit = pnl > 0;
  return (
    <div
      className="rounded-xl p-3.5 cursor-pointer transition-colors"
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={trade.direction === "BUY" ? "signal-buy" : "signal-sell"}>{trade.direction}</span>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text-primary)" }}>{trade.instrument}</span>
          <span className={trade.mode === "paper" ? "mode-paper" : "mode-live"} style={{ fontSize: "0.5625rem" }}>{trade.mode.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          {trade.pnl !== null && (
            <span className="tabular-nums" style={{
              fontSize: "0.9375rem", fontWeight: 700, fontFamily: "var(--font-serif)",
              color: isProfit ? "var(--color-profit)" : pnl < 0 ? "var(--color-loss)" : "var(--color-text-secondary)",
            }}>
              {isProfit ? "+" : ""}${pnl.toFixed(2)}
            </span>
          )}
          {expanded ? <ChevronUp size={14} style={{ color: "var(--color-text-tertiary)" }} /> : <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
          Open: <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{parseFloat(trade.openPrice).toFixed(5)}</span>
        </span>
        {trade.closePrice && (
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
            Close: <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{parseFloat(trade.closePrice).toFixed(5)}</span>
          </span>
        )}
        {trade.aiConfidence && (
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
            AI: <span style={{ color: trade.aiConfidence >= 80 ? "var(--color-profit)" : trade.aiConfidence >= 65 ? "var(--color-accent)" : "var(--color-gold)", fontWeight: 600 }}>{trade.aiConfidence}%</span>
          </span>
        )}
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
          <span
            className="px-1.5 py-0.5 rounded-full text-xs"
            style={{
              background: trade.status === "open" ? "var(--color-accent-dim)" : "var(--color-bg-surface)",
              color: trade.status === "open" ? "var(--color-accent)" : "var(--color-text-tertiary)",
              border: `1px solid ${trade.status === "open" ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
            }}
          >{trade.status}</span>
        </span>
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
          {new Date(trade.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {expanded && trade.aiReasoning && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-accent)" }}>AI Reasoning: </span>
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{trade.aiReasoning}</span>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: {
  id: number; instrument: string; direction: "BUY" | "SELL";
  openPrice: string; closePrice: string | null; size: string;
  pnl: string | null; status: "open" | "closed" | "cancelled";
  aiReasoning: string | null; aiConfidence: number | null;
  openedAt: Date; closedAt: Date | null; mode: "paper" | "live";
}}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = parseFloat(trade.pnl ?? "0");
  const isProfit = pnl > 0;

  return (
    <>
      <tr
        className="transition-colors cursor-pointer"
        style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={trade.direction === "BUY" ? "signal-buy" : "signal-sell"}>
              {trade.direction}
            </span>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{trade.instrument}</span>
          </div>
        </td>
        <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
          {parseFloat(trade.openPrice).toFixed(5)}
        </td>
        <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
          {trade.closePrice ? parseFloat(trade.closePrice).toFixed(5) : "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: trade.status === "open" ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
              color: trade.status === "open" ? "var(--color-accent)" : "var(--color-text-tertiary)",
              border: `1px solid ${trade.status === "open" ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
            }}
          >
            {trade.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {trade.pnl !== null ? (
            <div className="flex items-center gap-1">
              {isProfit
                ? <TrendingUp size={12} style={{ color: "var(--color-profit)" }} />
                : <TrendingDown size={12} style={{ color: "var(--color-loss)" }} />
              }
              <span className="tabular-nums" style={{
                fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-serif)",
                color: isProfit ? "var(--color-profit)" : pnl < 0 ? "var(--color-loss)" : "var(--color-text-secondary)",
              }}>
                {isProfit ? "+" : ""}${pnl.toFixed(2)}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>—</span>
          )}
        </td>
        <td className="px-4 py-3 tabular-nums" style={{
          fontSize: "0.8125rem", fontFamily: "var(--font-serif)", fontWeight: 600,
          color: trade.aiConfidence && trade.aiConfidence >= 80 ? "var(--color-profit)"
            : trade.aiConfidence && trade.aiConfidence >= 65 ? "var(--color-accent)"
            : "var(--color-gold)",
        }}>
          {trade.aiConfidence ? `${trade.aiConfidence}%` : "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
            <Clock size={11} />
            {new Date(trade.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={trade.mode === "paper" ? "mode-paper" : "mode-live"} style={{ fontSize: "0.625rem" }}>
            {trade.mode.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3">
          {expanded
            ? <ChevronUp size={14} style={{ color: "var(--color-text-tertiary)" }} />
            : <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />
          }
        </td>
      </tr>
      {expanded && trade.aiReasoning && (
        <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
          <td colSpan={9} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent)", flexShrink: 0 }}>AI Reasoning:</span>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{trade.aiReasoning}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Capital.com Activity History Tab ───────────────────────────────────────
function ActivityHistoryTab() {
  const activityQuery = trpc.capitalcom.activityHistory.useQuery(
    { maxResults: 100 },
    { retry: false }
  );
  const activities = activityQuery.data ?? [];

  const actionLabel: Record<string, string> = {
    POSITION_OPENED: "Opened",
    POSITION_CLOSED: "Closed",
    WORKING_ORDER_CREATED: "Order Created",
    WORKING_ORDER_DELETED: "Order Deleted",
    WORKING_ORDER_AMENDED: "Order Amended",
    POSITION_AMENDED: "Amended",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity size={14} style={{ color: "var(--color-accent)" }} />
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Account Activity</span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: "auto" }}>Direct from Capital.com</span>
      </div>
      {activityQuery.isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-14 rounded-xl" style={{ background: "var(--color-bg-elevated)" }} />
        ))}</div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <Activity size={28} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.75rem" }} />
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-tertiary)" }}>No activity history</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
                  {["Action", "Instrument", "Size", "Level", "Status", "Date"].map(h => (
                    <th key={h} className="px-4 py-3 text-left" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((a, i) => (
                  <tr key={`${a.dealId}-${i}`} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                        background: a.action.includes("OPENED") || a.action.includes("CREATED") ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
                        color: a.action.includes("OPENED") || a.action.includes("CREATED") ? "var(--color-accent)" : "var(--color-text-tertiary)",
                        border: `1px solid ${a.action.includes("OPENED") || a.action.includes("CREATED") ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
                      }}>{actionLabel[a.action] ?? a.action}</span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{a.epic}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{a.size || "—"}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{a.level ? a.level.toFixed(5) : "—"}</td>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: "0.75rem", color: a.status === "ACCEPTED" ? "var(--color-profit)" : "var(--color-text-tertiary)" }}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                      {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Capital.com Transaction History Tab ─────────────────────────────────────
function TransactionHistoryTab() {
  const txQuery = trpc.capitalcom.transactionHistory.useQuery(
    { maxResults: 100 },
    { retry: false }
  );
  const transactions = txQuery.data ?? [];

  const parsePnl = (pnlStr: string) => {
    const match = pnlStr?.match(/[-\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  const totalPnl = transactions
    .filter(t => t.type === "TRADE" && !t.cashTransaction)
    .reduce((sum, t) => sum + parsePnl(t.profitAndLoss), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight size={14} style={{ color: "var(--color-accent)" }} />
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Transaction History</span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginLeft: "auto" }}>Direct from Capital.com</span>
      </div>
      {!txQuery.isLoading && transactions.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Total Realized P&L:</span>
          <span className="tabular-nums" style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--font-serif)", color: totalPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      )}
      {txQuery.isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-14 rounded-xl" style={{ background: "var(--color-bg-elevated)" }} />
        ))}</div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <ArrowLeftRight size={28} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.75rem" }} />
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-tertiary)" }}>No transactions found</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
                  {["Type", "Instrument", "Open", "Close", "P&L", "Date"].map(h => (
                    <th key={h} className="px-4 py-3 text-left" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => {
                  const pnl = parsePnl(t.profitAndLoss);
                  return (
                    <tr key={`${t.reference}-${i}`} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                          background: t.type === "TRADE" ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
                          color: t.type === "TRADE" ? "var(--color-accent)" : "var(--color-text-tertiary)",
                          border: `1px solid ${t.type === "TRADE" ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
                        }}>{t.type}</span>
                      </td>
                      <td className="px-4 py-3" style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)", maxWidth: "10rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.instrumentName || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {t.openLevel ? t.openLevel.toFixed(5) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {t.closeLevel ? t.closeLevel.toFixed(5) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {t.profitAndLoss ? (
                          <span className="tabular-nums" style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                            {pnl >= 0 ? "+" : ""}{t.profitAndLoss}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                        {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TradeHistory() {
  const [activeTab, setActiveTab] = useState<"platform" | "activity" | "transactions">("platform");
  const [instrumentFilter, setInstrumentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "open" | "closed" | "cancelled">("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const tradesQuery = trpc.trades.list.useQuery({
    instrument: instrumentFilter !== "All" ? instrumentFilter : undefined,
    status: statusFilter !== "All" ? statusFilter : undefined,
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
  });

  const trades = tradesQuery.data ?? [];
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
  const closedTrades = trades.filter(t => t.status === "closed");
  const wins = closedTrades.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : "0";

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em", fontFamily: "var(--font-serif)" }}>
          Trade History
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
          Complete log of all your trading activity
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", width: "fit-content" }}>
        {([
          { key: "platform", label: "Platform Trades", icon: TrendingUp },
          { key: "activity", label: "Capital.com Activity", icon: Activity },
          { key: "transactions", label: "Transactions", icon: ArrowLeftRight },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: activeTab === key ? "var(--color-accent)" : "transparent",
              color: activeTab === key ? "#fff" : "var(--color-text-tertiary)",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "activity" && <ActivityHistoryTab />}
      {activeTab === "transactions" && <TransactionHistoryTab />}

      {activeTab === "platform" && <>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Trades", value: `${trades.length}` },
          { label: "Win Rate", value: `${winRate}%`, color: parseInt(winRate) >= 50 ? "var(--color-profit)" : parseInt(winRate) > 0 ? "var(--color-loss)" : undefined },
          { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" },
          { label: "Open Positions", value: `${trades.filter(t => t.status === "open").length}`, color: "var(--color-accent)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4"
            style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {label}
            </p>
            <p className="tabular-nums"
              style={{ fontSize: "1.25rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: color ?? "var(--color-text-primary)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap md:gap-3">
        <div className="flex items-center gap-1.5">
          <Filter size={13} style={{ color: "var(--color-text-tertiary)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>Filter:</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:pb-0">
          {INSTRUMENTS.map(inst => (
            <FilterPill key={inst} active={instrumentFilter === inst} onClick={() => setInstrumentFilter(inst)}>
              {inst}
            </FilterPill>
          ))}
        </div>
        <div className="hidden md:block" style={{ width: 1, height: 16, background: "var(--color-border-subtle)" }} />
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {STATUSES.map(s => (
            <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              <span className="capitalize">{s}</span>
            </FilterPill>
          ))}
        </div>
        <div className="hidden md:block" style={{ width: 1, height: 16, background: "var(--color-border-subtle)" }} />
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>From:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="hj-input" style={{ width: "8.5rem", fontSize: "0.75rem", padding: "0.25rem 0.5rem", colorScheme: "light" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>To:</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="hj-input" style={{ width: "8.5rem", fontSize: "0.75rem", padding: "0.25rem 0.5rem", colorScheme: "light" }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl"
            style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
            <TrendingUp size={28} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.75rem" }} />
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>No trades found</p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Trades will appear here once you start trading</p>
          </div>
        ) : (
          trades.map(trade => <TradeMobileCard key={trade.id} trade={trade as any} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl overflow-hidden"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp size={28} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.75rem" }} />
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>No trades found</p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Trades will appear here once you start trading</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)" }}>
                  {["Instrument", "Open Price", "Close Price", "Status", "P&L", "AI Conf.", "Opened At", "Mode", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left"
                      style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(trade => <TradeRow key={trade.id} trade={trade as any} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
