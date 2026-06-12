import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  BarChart3, Target, AlertTriangle, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { toast } from "sonner";

// Generate mock balance history for chart
function generateBalanceHistory(currentBalance: number) {
  const data = [];
  let balance = 250;
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    balance += (Math.random() - 0.45) * 3;
    balance = Math.max(230, balance);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      balance: parseFloat(balance.toFixed(2)),
    });
  }
  // Set last point to current balance
  if (data.length > 0) data[data.length - 1].balance = currentBalance;
  return data;
}

function StatCard({
  label, value, sub, icon: Icon, trend, color = "default"
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  color?: "default" | "profit" | "loss" | "primary";
}) {
  const colorMap = {
    default: "text-foreground",
    profit: "text-profit",
    loss: "text-loss",
    primary: "text-primary",
  };
  const iconBg = {
    default: "bg-secondary/60 text-muted-foreground",
    profit: "bg-[oklch(0.65_0.18_145/0.12)] text-profit",
    loss: "bg-[oklch(0.60_0.22_25/0.12)] text-loss",
    primary: "bg-primary/10 text-primary",
  };

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={cn("p-2 rounded-lg", iconBg[color])}>
          <Icon size={14} />
        </div>
      </div>
      <p className={cn("text-2xl font-bold font-mono tabular-nums", colorMap[color])}>{value}</p>
      {sub && (
        <p className={cn(
          "text-xs mt-1",
          trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : "text-muted-foreground"
        )}>
          {sub}
        </p>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-bold font-mono text-foreground">
          ${payload[0].value.toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const portfolioQuery = trpc.portfolio.get.useQuery();
  const dailyStatsQuery = trpc.portfolio.dailyStats.useQuery();
  const tradesQuery = trpc.trades.list.useQuery({ status: "open" });
  const signalsQuery = trpc.signals.list.useQuery();

  const generateAllMutation = trpc.signals.generateAll.useMutation({
    onSuccess: () => {
      signalsQuery.refetch();
      toast.success("AI signals refreshed for all instruments");
    },
    onError: () => toast.error("Failed to generate signals"),
  });

  const balance = parseFloat(portfolioQuery.data?.balance ?? "250");
  const initialBalance = parseFloat(portfolioQuery.data?.initialBalance ?? "250");
  const totalReturn = balance - initialBalance;
  const totalReturnPct = ((totalReturn / initialBalance) * 100).toFixed(2);
  const mode = portfolioQuery.data?.mode ?? "paper";

  const stats = dailyStatsQuery.data;
  const winRate = stats && stats.tradeCount > 0
    ? ((stats.wins / stats.tradeCount) * 100).toFixed(0)
    : "0";

  const balanceHistory = generateBalanceHistory(balance);
  const openPositions = tradesQuery.data?.length ?? 0;

  // Latest signals (top 5)
  const latestSignals = signalsQuery.data?.slice(0, 5) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Welcome back, Hamada — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold",
            mode === "paper" ? "mode-paper" : "mode-live"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              mode === "paper" ? "bg-yellow-400" : "bg-red-500 animate-pulse"
            )} />
            {mode === "paper" ? "PAPER MODE" : "LIVE MODE"}
          </div>
          <button
            onClick={() => generateAllMutation.mutate()}
            disabled={generateAllMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} className={generateAllMutation.isPending ? "animate-spin" : ""} />
            Refresh Signals
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Account Balance"
          value={`$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          sub={`${totalReturn >= 0 ? "+" : ""}$${totalReturn.toFixed(2)} total`}
          icon={DollarSign}
          trend={totalReturn >= 0 ? "up" : "down"}
          color="primary"
        />
        <StatCard
          label="Today's P&L"
          value={`${(stats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(stats?.totalPnl ?? 0).toFixed(2)}`}
          sub={`${stats?.tradeCount ?? 0} trades today`}
          icon={stats?.totalPnl && stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
          trend={(stats?.totalPnl ?? 0) >= 0 ? "up" : "down"}
          color={(stats?.totalPnl ?? 0) >= 0 ? "profit" : "loss"}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L today`}
          icon={Target}
          trend={parseInt(winRate) >= 50 ? "up" : "down"}
          color={parseInt(winRate) >= 50 ? "profit" : "loss"}
        />
        <StatCard
          label="Open Positions"
          value={`${openPositions}`}
          sub={`Total return: ${totalReturn >= 0 ? "+" : ""}${totalReturnPct}%`}
          icon={Activity}
          color="default"
        />
      </div>

      {/* Balance chart + Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Balance chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Balance Progression</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
            </div>
            <div className={cn(
              "text-sm font-bold font-mono",
              totalReturn >= 0 ? "text-profit" : "text-loss"
            )}>
              {totalReturn >= 0 ? "+" : ""}{totalReturnPct}%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={balanceHistory} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 240)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="oklch(0.65 0.18 250)"
                strokeWidth={2}
                fill="url(#balanceGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "oklch(0.65 0.18 250)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Latest signals */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Latest Signals</h3>
            <a href="/signals" className="text-xs text-primary hover:underline">View all</a>
          </div>
          {latestSignals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart3 size={24} className="text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No signals yet</p>
              <button
                onClick={() => generateAllMutation.mutate()}
                disabled={generateAllMutation.isPending}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Generate signals
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {latestSignals.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-1.5 py-0.5 rounded",
                      s.signal === "BUY" ? "signal-buy" : s.signal === "SELL" ? "signal-sell" : "signal-hold"
                    )}>
                      {s.signal}
                    </span>
                    <span className="text-xs font-medium text-foreground">{s.instrument}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-muted-foreground">{s.confidence}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily summary */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Today's Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Trades Executed", value: `${stats?.tradeCount ?? 0}` },
            { label: "Best Trade", value: `+$${(stats?.bestTrade ?? 0).toFixed(2)}`, color: "text-profit" },
            { label: "Worst Trade", value: `$${(stats?.worstTrade ?? 0).toFixed(2)}`, color: "text-loss" },
            { label: "Net P&L", value: `${(stats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(stats?.totalPnl ?? 0).toFixed(2)}`, color: (stats?.totalPnl ?? 0) >= 0 ? "text-profit" : "text-loss" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-3 rounded-lg bg-secondary/40">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={cn("text-lg font-bold font-mono tabular-nums", color ?? "text-foreground")}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
