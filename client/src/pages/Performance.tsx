import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp, TrendingDown, Target, Award, BarChart3,
  Activity, AlertTriangle, Layers, FlaskConical, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine, AreaChart, Area,
} from "recharts";

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-default)", boxShadow: "0 8px 32px oklch(0 0 0 / 0.4)" }}>
      <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginBottom: "0.25rem" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="tabular-nums"
          style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: p.color }}>
          {p.name}: {typeof p.value === "number" && (p.name?.includes("$") || p.dataKey?.includes("pnl") || p.dataKey?.includes("equity"))
            ? `${p.value >= 0 ? "+" : ""}$${Math.abs(p.value).toFixed(2)}`
            : p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, valueColor }: {
  label: string; value: string; sub?: string; icon: React.ElementType; valueColor?: string;
}) {
  return (
    <div className="stat-card animate-fade-up">
      <div className="flex items-start justify-between mb-3">
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-subtle)" }}>
          <Icon size={14} style={{ color: valueColor ?? "var(--color-text-tertiary)" }} />
        </div>
      </div>
      <p className="tabular-nums"
        style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-serif)", letterSpacing: "-0.02em", color: valueColor ?? "var(--color-text-primary)" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>{sub}</p>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

const emptyState = (msg: string) => (
  <div className="flex flex-col items-center justify-center h-40">
    <BarChart3 size={20} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.5rem" }} />
    <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>{msg}</p>
  </div>
);

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5"
      style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
      <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", marginBottom: "1rem" }}>{title}</p>
      {children}
    </div>
  );
}

// ─── Heatmap Cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ instrument, totalPnl, winRate, tradeCount, avgPnl }: {
  instrument: string; totalPnl: number; winRate: number; tradeCount: number; avgPnl: number;
}) {
  const intensity = Math.min(Math.abs(totalPnl) / 50, 1); // normalize to 0-1
  const bg = totalPnl >= 0
    ? `oklch(${0.45 + intensity * 0.2} 0.15 145)`
    : `oklch(${0.45 + intensity * 0.2} 0.15 25)`;

  return (
    <div className="rounded-xl p-4 transition-all duration-200 cursor-default hover:scale-105"
      style={{ background: bg, border: "1px solid oklch(1 0 0 / 0.1)" }}>
      <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: "oklch(0.95 0 0)", marginBottom: "0.25rem" }}>{instrument}</p>
      <p className="tabular-nums" style={{ fontSize: "1.25rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: "oklch(0.98 0 0)" }}>
        {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
      </p>
      <div className="mt-2 flex gap-3">
        <span style={{ fontSize: "0.6875rem", color: "oklch(0.85 0 0)" }}>{tradeCount} trades</span>
        <span style={{ fontSize: "0.6875rem", color: "oklch(0.85 0 0)" }}>{winRate.toFixed(0)}% WR</span>
      </div>
    </div>
  );
}

// ─── Backtesting Panel ────────────────────────────────────────────────────────

function BacktestPanel() {
  const [instrument, setInstrument] = useState("EURUSD");
  const [strategy, setStrategy] = useState<"rsi_macd" | "bollinger" | "trend_following">("rsi_macd");
  const [days, setDays] = useState(30);

  const backtestMutation = trpc.backtest.run.useMutation();

  const result = backtestMutation.data;

  const strategyLabels: Record<string, string> = {
    rsi_macd: "RSI + MACD",
    bollinger: "Bollinger Bands",
    trend_following: "Trend Following",
  };

  const recColor = result?.recommendation === "RECOMMENDED"
    ? "var(--color-profit)"
    : result?.recommendation === "NOT_RECOMMENDED"
      ? "var(--color-loss)"
      : "var(--color-text-secondary)";

  return (
    <div className="space-y-4">
      {/* Config row */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Instrument</label>
          <select value={instrument} onChange={e => setInstrument(e.target.value)}
            className="block mt-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
            {["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"].map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Strategy</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value as any)}
            className="block mt-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
            {Object.entries(strategyLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Period (days)</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="block mt-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <button
          onClick={() => backtestMutation.mutate({ instrument, strategy, days, initialBalance: 250 })}
          disabled={backtestMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "var(--color-accent)", color: "oklch(0.1 0 0)", opacity: backtestMutation.isPending ? 0.6 : 1 }}>
          {backtestMutation.isPending
            ? <><RefreshCw size={14} className="animate-spin" /> Running...</>
            : <><FlaskConical size={14} /> Run Backtest</>}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-xl p-5 space-y-4 animate-fade-up"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
                {result.instrument} — {strategyLabels[result.strategy] ?? result.strategy}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                {result.days}-day simulation · Initial: ${result.initialBalance}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${recColor}22`, color: recColor, border: `1px solid ${recColor}44` }}>
              {result.recommendation?.replace("_", " ")}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Final Balance", value: `$${result.finalBalance?.toFixed(2)}`, color: result.totalReturn >= 0 ? "var(--color-profit)" : "var(--color-loss)" },
              { label: "Total Return", value: `${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn?.toFixed(1)}%`, color: result.totalReturn >= 0 ? "var(--color-profit)" : "var(--color-loss)" },
              { label: "Win Rate", value: `${result.winRate?.toFixed(1)}%`, color: result.winRate >= 50 ? "var(--color-profit)" : "var(--color-loss)" },
              { label: "Max Drawdown", value: `${result.maxDrawdown?.toFixed(1)}%`, color: "var(--color-loss)" },
              { label: "Total Trades", value: String(result.totalTrades), color: "var(--color-text-primary)" },
              { label: "Sharpe Ratio", value: result.sharpeRatio?.toFixed(2), color: result.sharpeRatio >= 1 ? "var(--color-profit)" : "var(--color-text-secondary)" },
              { label: "Best Trade", value: `+$${result.bestTrade?.toFixed(2)}`, color: "var(--color-profit)" },
              { label: "Worst Trade", value: `-$${Math.abs(result.worstTrade ?? 0).toFixed(2)}`, color: "var(--color-loss)" },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-3"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
                <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</p>
                <p className="tabular-nums mt-1" style={{ fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg p-3"
            style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{result.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["Overview", "Equity Curve", "Heatmap", "Drawdown", "Backtest"] as const;
type Tab = (typeof TABS)[number];

export default function Performance() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [equityDays, setEquityDays] = useState(30);

  const tradesQuery     = trpc.trades.list.useQuery({ status: "closed" });
  const portfolioQuery  = trpc.portfolio.get.useQuery();
  const equityQuery     = trpc.performance.equityHistory.useQuery({ days: equityDays });
  const drawdownQuery   = trpc.performance.maxDrawdown.useQuery();
  const heatmapQuery    = trpc.performance.instrumentPerformance.useQuery();

  const trades         = tradesQuery.data ?? [];
  const balance        = parseFloat(portfolioQuery.data?.balance ?? "250");
  const initialBalance = parseFloat(portfolioQuery.data?.initialBalance ?? "250");
  const totalReturn    = balance - initialBalance;
  const totalReturnPct = ((totalReturn / initialBalance) * 100).toFixed(2);

  const wins      = trades.filter(t => parseFloat(t.pnl ?? "0") > 0);
  const losses    = trades.filter(t => parseFloat(t.pnl ?? "0") < 0);
  const winRate   = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : "0";
  const avgWin    = wins.length > 0 ? (wins.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / wins.length).toFixed(2) : "0";
  const avgLoss   = losses.length > 0 ? (losses.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / losses.length).toFixed(2) : "0";
  const bestTrade  = trades.length > 0 ? Math.max(...trades.map(t => parseFloat(t.pnl ?? "0"))) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => parseFloat(t.pnl ?? "0"))) : 0;

  const pieData = [
    { name: "Wins", value: wins.length },
    { name: "Losses", value: losses.length },
  ].filter(d => d.value > 0);

  const dailyPnlData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayTrades = trades.filter(t => {
      const td = new Date(t.closedAt ?? t.openedAt);
      return td.toDateString() === d.toDateString();
    });
    const pnl = dayTrades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
    return { date: d.toLocaleDateString("en-US", { weekday: "short" }), pnl: parseFloat(pnl.toFixed(2)) };
  });

  const equityData = equityQuery.data ?? [];
  const drawdown = drawdownQuery.data;
  const heatmap = heatmapQuery.data ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em", fontFamily: "var(--font-serif)" }}>
          Performance Analytics
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
          Comprehensive analysis of your trading performance
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: activeTab === tab ? "var(--color-bg-surface)" : "transparent",
              color: activeTab === tab ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              boxShadow: activeTab === tab ? "0 1px 4px oklch(0 0 0 / 0.3)" : "none",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "Overview" && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Return"
              value={`${totalReturn >= 0 ? "+" : ""}$${totalReturn.toFixed(2)}`}
              sub={`${totalReturn >= 0 ? "+" : ""}${totalReturnPct}% from $250`}
              icon={totalReturn >= 0 ? TrendingUp : TrendingDown}
              valueColor={totalReturn >= 0 ? "var(--color-profit)" : "var(--color-loss)"}
            />
            <MetricCard
              label="Win Rate"
              value={`${winRate}%`}
              sub={`${wins.length}W / ${losses.length}L`}
              icon={Target}
              valueColor={parseFloat(winRate) >= 50 ? "var(--color-profit)" : parseFloat(winRate) > 0 ? "var(--color-loss)" : undefined}
            />
            <MetricCard
              label="Best Trade"
              value={`+$${bestTrade.toFixed(2)}`}
              sub={`Avg win: +$${avgWin}`}
              icon={Award}
              valueColor="var(--color-profit)"
            />
            <MetricCard
              label="Worst Trade"
              value={`$${worstTrade.toFixed(2)}`}
              sub={`Avg loss: $${avgLoss}`}
              icon={BarChart3}
              valueColor="var(--color-loss)"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SectionCard title="Daily P&L — Last 7 Days">
              {dailyPnlData.every(d => d.pnl === 0) ? emptyState("No closed trades yet") : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dailyPnlData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                      {dailyPnlData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Win / Loss Distribution">
              {pieData.length === 0 ? emptyState("No trades yet") : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={3}>
                      <Cell fill="var(--color-profit)" />
                      <Cell fill="var(--color-loss)" />
                    </Pie>
                    <Legend iconType="circle" iconSize={8}
                      formatter={(value) => <span style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>{value}</span>} />
                    <Tooltip formatter={(value) => [`${value} trades`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {/* ── EQUITY CURVE TAB ─────────────────────────────────────────────────── */}
      {activeTab === "Equity Curve" && (
        <SectionCard title="Equity Curve">
          <div className="flex gap-2 mb-4">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setEquityDays(d)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: equityDays === d ? "var(--color-accent)" : "var(--color-bg-elevated)",
                  color: equityDays === d ? "oklch(0.1 0 0)" : "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-subtle)",
                }}>
                {d}d
              </button>
            ))}
          </div>
          {equityData.length === 0 ? emptyState("No closed trades in this period") : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equityData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="var(--color-border-default)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="equity" name="Cumulative P&L" stroke="var(--color-profit)" strokeWidth={2} fill="url(#equityGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      )}

      {/* ── HEATMAP TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "Heatmap" && (
        <SectionCard title="Portfolio Heatmap — Performance by Instrument">
          {heatmap.length === 0 ? emptyState("No closed trades yet") : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {heatmap.map(item => (
                <HeatmapCell key={item.instrument} {...item} />
              ))}
            </div>
          )}
          {heatmap.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    {["Instrument", "Trades", "Win Rate", "Avg P&L", "Total P&L"].map(h => (
                      <th key={h} className="px-4 py-2 text-left"
                        style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.sort((a, b) => b.totalPnl - a.totalPnl).map(row => (
                    <tr key={row.instrument} className="transition-colors"
                      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-3" style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{row.instrument}</td>
                      <td className="px-4 py-3" style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{row.tradeCount}</td>
                      <td className="px-4 py-3 tabular-nums"
                        style={{ fontSize: "0.875rem", fontFamily: "var(--font-serif)", fontWeight: 600,
                          color: row.winRate >= 50 ? "var(--color-profit)" : "var(--color-loss)" }}>
                        {row.winRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 tabular-nums"
                        style={{ fontSize: "0.875rem", fontFamily: "var(--font-serif)", fontWeight: 600,
                          color: row.avgPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                        {row.avgPnl >= 0 ? "+" : ""}${row.avgPnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 tabular-nums"
                        style={{ fontSize: "0.875rem", fontFamily: "var(--font-serif)", fontWeight: 600,
                          color: row.totalPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                        {row.totalPnl >= 0 ? "+" : ""}${row.totalPnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── DRAWDOWN TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "Drawdown" && (
        <div className="space-y-5">
          {/* Drawdown metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Max Drawdown ($)"
              value={`-$${drawdown?.maxDrawdown.toFixed(2) ?? "0.00"}`}
              sub="Largest peak-to-trough decline"
              icon={AlertTriangle}
              valueColor="var(--color-loss)"
            />
            <MetricCard
              label="Max Drawdown (%)"
              value={`${drawdown?.maxDrawdownPct.toFixed(1) ?? "0.0"}%`}
              sub="As % of peak equity"
              icon={TrendingDown}
              valueColor={
                (drawdown?.maxDrawdownPct ?? 0) > 20
                  ? "var(--color-loss)"
                  : (drawdown?.maxDrawdownPct ?? 0) > 10
                    ? "oklch(0.75 0.15 60)"
                    : "var(--color-profit)"
              }
            />
            <MetricCard
              label="Peak Equity"
              value={`+$${drawdown?.peakEquity.toFixed(2) ?? "0.00"}`}
              sub="Highest cumulative P&L"
              icon={Activity}
              valueColor="var(--color-profit)"
            />
          </div>

          {/* Drawdown chart */}
          <SectionCard title="Drawdown Chart — 90 Days">
            {equityData.length === 0 ? emptyState("No closed trades yet") : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={equityData.map((d, i, arr) => {
                    const peak = Math.max(...arr.slice(0, i + 1).map(x => x.equity));
                    const dd = peak > 0 ? ((peak - d.equity) / peak) * 100 : 0;
                    return { ...d, drawdown: -Math.round(dd * 10) / 10 };
                  })}
                  margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-loss)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-loss)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="var(--color-border-default)" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="drawdown" name="Drawdown %" stroke="var(--color-loss)" strokeWidth={2} fill="url(#ddGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── BACKTEST TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "Backtest" && (
        <SectionCard title="AI-Powered Strategy Backtesting">
          <BacktestPanel />
        </SectionCard>
      )}
    </div>
  );
}
