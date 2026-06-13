import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Target, Award, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-default)", boxShadow: "0 8px 32px oklch(0 0 0 / 0.4)" }}>
      <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginBottom: "0.25rem" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="tabular-nums"
          style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-serif)", color: p.color }}>
          {p.name}: {p.value > 0 ? "+" : ""}${p.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
};

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

export default function Performance() {
  const tradesQuery     = trpc.trades.list.useQuery({ status: "closed" });
  const portfolioQuery  = trpc.portfolio.get.useQuery();

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

  const byInstrument: Record<string, { pnl: number; count: number; wins: number }> = {};
  for (const t of trades) {
    if (!byInstrument[t.instrument]) byInstrument[t.instrument] = { pnl: 0, count: 0, wins: 0 };
    byInstrument[t.instrument].pnl += parseFloat(t.pnl ?? "0");
    byInstrument[t.instrument].count++;
    if (parseFloat(t.pnl ?? "0") > 0) byInstrument[t.instrument].wins++;
  }
  const instrumentData = Object.entries(byInstrument).map(([name, data]) => ({
    name, pnl: parseFloat(data.pnl.toFixed(2)), count: data.count,
    winRate: data.count > 0 ? ((data.wins / data.count) * 100).toFixed(0) : "0",
  }));

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

  const emptyState = (msg: string) => (
    <div className="flex flex-col items-center justify-center h-40">
      <BarChart3 size={20} style={{ color: "var(--color-text-tertiary)", marginBottom: "0.5rem" }} />
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>{msg}</p>
    </div>
  );

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

        {/* Daily P&L bar chart */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", marginBottom: "1rem" }}>
            Daily P&L — Last 7 Days
          </p>
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
        </div>

        {/* Win/Loss pie */}
        <div className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", marginBottom: "1rem" }}>
            Win / Loss Distribution
          </p>
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
        </div>
      </div>

      {/* Instrument breakdown */}
      {instrumentData.length > 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
          <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", marginBottom: "1rem" }}>
            Performance by Instrument
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  {["Instrument", "Trades", "Win Rate", "Total P&L"].map(h => (
                    <th key={h} className="px-4 py-2 text-left"
                      style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instrumentData.map(row => (
                  <tr key={row.name} className="transition-colors"
                    style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3" style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{row.name}</td>
                    <td className="px-4 py-3" style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{row.count}</td>
                    <td className="px-4 py-3 tabular-nums"
                      style={{ fontSize: "0.875rem", fontFamily: "var(--font-serif)", fontWeight: 600,
                        color: parseInt(row.winRate) >= 50 ? "var(--color-profit)" : "var(--color-loss)" }}>
                      {row.winRate}%
                    </td>
                    <td className="px-4 py-3 tabular-nums"
                      style={{ fontSize: "0.875rem", fontFamily: "var(--font-serif)", fontWeight: 600,
                        color: row.pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}>
                      {row.pnl >= 0 ? "+" : ""}${row.pnl.toFixed(2)}
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
