import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Target, Award, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = {
  profit: "oklch(0.65 0.18 145)",
  loss: "oklch(0.60 0.22 25)",
  primary: "oklch(0.65 0.18 250)",
  muted: "oklch(0.22 0.008 240)",
};

function MetricCard({ label, value, sub, icon: Icon, color = "default" }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color?: "profit" | "loss" | "primary" | "default";
}) {
  const colors = {
    profit: { text: "text-profit", bg: "bg-[oklch(0.65_0.18_145/0.1)]" },
    loss: { text: "text-loss", bg: "bg-[oklch(0.60_0.22_25/0.1)]" },
    primary: { text: "text-primary", bg: "bg-primary/10" },
    default: { text: "text-foreground", bg: "bg-secondary/60" },
  };
  const { text, bg } = colors[color];
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={cn("p-2 rounded-lg", bg)}>
          <Icon size={14} className={text} />
        </div>
      </div>
      <p className={cn("text-2xl font-bold font-mono tabular-nums", text)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="text-sm font-bold font-mono" style={{ color: p.color }}>
            {p.name}: {p.value > 0 ? "+" : ""}${p.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Performance() {
  const tradesQuery = trpc.trades.list.useQuery({ status: "closed" });
  const portfolioQuery = trpc.portfolio.get.useQuery();
  const dailyStatsQuery = trpc.portfolio.dailyStats.useQuery();

  const trades = tradesQuery.data ?? [];
  const balance = parseFloat(portfolioQuery.data?.balance ?? "250");
  const initialBalance = parseFloat(portfolioQuery.data?.initialBalance ?? "250");
  const totalReturn = balance - initialBalance;
  const totalReturnPct = ((totalReturn / initialBalance) * 100).toFixed(2);

  // Stats
  const wins = trades.filter(t => parseFloat(t.pnl ?? "0") > 0);
  const losses = trades.filter(t => parseFloat(t.pnl ?? "0") < 0);
  const winRate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : "0";
  const avgWin = wins.length > 0 ? (wins.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / wins.length).toFixed(2) : "0";
  const avgLoss = losses.length > 0 ? (losses.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0) / losses.length).toFixed(2) : "0";
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => parseFloat(t.pnl ?? "0"))) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => parseFloat(t.pnl ?? "0"))) : 0;

  // Instrument breakdown
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

  // Win/Loss pie
  const pieData = [
    { name: "Wins", value: wins.length },
    { name: "Losses", value: losses.length },
  ].filter(d => d.value > 0);

  // Daily P&L (last 7 days mock + real)
  const dailyPnlData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayTrades = trades.filter(t => {
      const td = new Date(t.closedAt ?? t.openedAt);
      return td.toDateString() === d.toDateString();
    });
    const pnl = dayTrades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
    return {
      date: d.toLocaleDateString("en-US", { weekday: "short" }),
      pnl: parseFloat(pnl.toFixed(2)),
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Performance Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Comprehensive analysis of your trading performance</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Return"
          value={`${totalReturn >= 0 ? "+" : ""}$${totalReturn.toFixed(2)}`}
          sub={`${totalReturn >= 0 ? "+" : ""}${totalReturnPct}% from $250`}
          icon={totalReturn >= 0 ? TrendingUp : TrendingDown}
          color={totalReturn >= 0 ? "profit" : "loss"}
        />
        <MetricCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${wins.length}W / ${losses.length}L`}
          icon={Target}
          color={parseFloat(winRate) >= 50 ? "profit" : "loss"}
        />
        <MetricCard
          label="Best Trade"
          value={`+$${bestTrade.toFixed(2)}`}
          sub={`Avg win: +$${avgWin}`}
          icon={Award}
          color="profit"
        />
        <MetricCard
          label="Worst Trade"
          value={`$${worstTrade.toFixed(2)}`}
          sub={`Avg loss: $${avgLoss}`}
          icon={BarChart3}
          color="loss"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily P&L bar chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Daily P&L (Last 7 Days)</h3>
          {dailyPnlData.every(d => d.pnl === 0) ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No closed trades yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyPnlData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 240)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 240)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 240)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                  {dailyPnlData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Win/Loss pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Win / Loss Distribution</h3>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No trades yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={3}>
                  <Cell fill={COLORS.profit} />
                  <Cell fill={COLORS.loss} />
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: "oklch(0.55 0.01 240)", fontSize: "12px" }}>{value}</span>}
                />
                <Tooltip formatter={(value) => [`${value} trades`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Instrument breakdown */}
      {instrumentData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Performance by Instrument</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Instrument", "Trades", "Win Rate", "Total P&L"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instrumentData.map(row => (
                  <tr key={row.name} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-sm font-mono", parseInt(row.winRate) >= 50 ? "text-profit" : "text-loss")}>
                        {row.winRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-sm font-bold font-mono", row.pnl >= 0 ? "text-profit" : "text-loss")}>
                        {row.pnl >= 0 ? "+" : ""}${row.pnl.toFixed(2)}
                      </span>
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
