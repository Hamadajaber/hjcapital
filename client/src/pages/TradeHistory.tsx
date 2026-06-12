import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Filter, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const INSTRUMENTS = ["All", "EURUSD", "GBPUSD", "GOLD", "US500", "BTC"];
const STATUSES = ["All", "open", "closed", "cancelled"] as const;

function TradeRow({ trade }: { trade: {
  id: number;
  instrument: string;
  direction: "BUY" | "SELL";
  openPrice: string;
  closePrice: string | null;
  size: string;
  pnl: string | null;
  status: "open" | "closed" | "cancelled";
  aiReasoning: string | null;
  aiConfidence: number | null;
  openedAt: Date;
  closedAt: Date | null;
  mode: "paper" | "live";
}}) {
  const [expanded, setExpanded] = useState(false);
  const pnl = parseFloat(trade.pnl ?? "0");
  const isProfit = pnl > 0;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-bold px-1.5 py-0.5 rounded",
              trade.direction === "BUY" ? "signal-buy" : "signal-sell"
            )}>
              {trade.direction}
            </span>
            <span className="text-sm font-medium text-foreground">{trade.instrument}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
          {parseFloat(trade.openPrice).toFixed(5)}
        </td>
        <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
          {trade.closePrice ? parseFloat(trade.closePrice).toFixed(5) : "—"}
        </td>
        <td className="px-4 py-3">
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            trade.status === "open" ? "bg-primary/10 text-primary" :
            trade.status === "closed" ? "bg-secondary/60 text-muted-foreground" :
            "bg-secondary/40 text-muted-foreground"
          )}>
            {trade.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {trade.pnl !== null ? (
            <div className="flex items-center gap-1">
              {isProfit ? <TrendingUp size={12} className="text-profit" /> : <TrendingDown size={12} className="text-loss" />}
              <span className={cn(
                "text-sm font-bold font-mono",
                isProfit ? "text-profit" : pnl < 0 ? "text-loss" : "text-muted-foreground"
              )}>
                {isProfit ? "+" : ""}${pnl.toFixed(2)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {trade.aiConfidence && (
            <span className={cn(
              "text-xs font-mono",
              trade.aiConfidence >= 80 ? "text-profit" : trade.aiConfidence >= 65 ? "text-primary" : "text-yellow-500"
            )}>
              {trade.aiConfidence}%
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock size={11} />
            {new Date(trade.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded font-medium",
            trade.mode === "paper" ? "mode-paper" : "mode-live"
          )}>
            {trade.mode.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3">
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </td>
      </tr>
      {expanded && trade.aiReasoning && (
        <tr className="border-b border-border bg-secondary/10">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="text-xs font-semibold text-primary shrink-0">AI Reasoning:</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{trade.aiReasoning}</p>
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade History</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Complete log of all your trading activity</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Trades", value: `${trades.length}` },
          { label: "Win Rate", value: `${winRate}%`, color: parseInt(winRate) >= 50 ? "text-profit" : "text-loss" },
          { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-profit" : "text-loss" },
          { label: "Open Positions", value: `${trades.filter(t => t.status === "open").length}`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn("text-xl font-bold font-mono tabular-nums", color ?? "text-foreground")}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Filter:</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst}
              onClick={() => setInstrumentFilter(inst)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                instrumentFilter === inst
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {inst}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize",
                statusFilter === s
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 [color-scheme:dark]"
          />
          <span className="text-xs text-muted-foreground">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs bg-secondary/40 border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 [color-scheme:dark]"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No trades found</p>
            <p className="text-xs text-muted-foreground">Trades will appear here once you start trading</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  {["Instrument", "Open Price", "Close Price", "Status", "P&L", "AI Conf.", "Opened At", "Mode", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade as any} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
