import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Filter, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp } from "lucide-react";

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
                fontSize: "0.875rem", fontWeight: 700, fontFamily: "var(--font-mono)",
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
          fontSize: "0.8125rem", fontFamily: "var(--font-mono)", fontWeight: 600,
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

export default function TradeHistory() {
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
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
          Trade History
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
          Complete log of all your trading activity
        </p>
      </div>

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
              style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: color ?? "var(--color-text-primary)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter size={13} style={{ color: "var(--color-text-tertiary)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", fontWeight: 500 }}>Filter:</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {INSTRUMENTS.map(inst => (
            <FilterPill key={inst} active={instrumentFilter === inst} onClick={() => setInstrumentFilter(inst)}>
              {inst}
            </FilterPill>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: "var(--color-border-subtle)" }} />
        <div className="flex gap-1.5">
          {STATUSES.map(s => (
            <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              <span className="capitalize">{s}</span>
            </FilterPill>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: "var(--color-border-subtle)" }} />
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>From:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="hj-input" style={{ width: "8rem", fontSize: "0.75rem", padding: "0.25rem 0.5rem", colorScheme: "dark" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>To:</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="hj-input" style={{ width: "8rem", fontSize: "0.75rem", padding: "0.25rem 0.5rem", colorScheme: "dark" }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
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
    </div>
  );
}
