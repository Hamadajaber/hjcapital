import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Target, Activity,
  RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function generateBalanceHistory(currentBalance: number) {
  const data = [];
  let balance = 250;
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    balance += (Math.random() - 0.45) * 1.8;
    balance = Math.max(238, balance);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      balance: parseFloat(balance.toFixed(2)),
    });
  }
  if (data.length > 0) data[data.length - 1].balance = currentBalance;
  return data;
}

function StatCard({
  label, value, sub, icon: Icon, accentIcon = false, valueColor,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accentIcon?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="stat-card animate-fade-up">
      <div className="flex items-start justify-between mb-3">
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: accentIcon ? "var(--color-accent-dim)" : "var(--color-bg-overlay)",
            border: `1px solid ${accentIcon ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
          }}
        >
          <Icon size={14} style={{ color: accentIcon ? "var(--color-accent)" : "var(--color-text-tertiary)" }} />
        </div>
      </div>
      <p
        className="tabular-nums"
        style={{
          fontSize: "1.5rem", fontWeight: 700,
          fontFamily: "var(--font-mono)", letterSpacing: "-0.02em",
          color: valueColor ?? "var(--color-text-primary)",
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.25rem" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: "var(--color-bg-overlay)",
        border: "1px solid var(--color-border-default)",
        boxShadow: "0 8px 32px oklch(0.220 0.018 60 / 0.12)",
      }}
    >
      <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginBottom: "0.25rem" }}>{label}</p>
      <p
        className="tabular-nums"
        style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}
      >
        ${parseFloat(payload[0].value).toFixed(2)}
      </p>
    </div>
  );
};

export default function Dashboard() {
  const portfolioQuery  = trpc.portfolio.get.useQuery();
  const dailyStatsQuery = trpc.portfolio.dailyStats.useQuery();
  const tradesQuery     = trpc.trades.list.useQuery({ status: "open" });
  const signalsQuery    = trpc.signals.list.useQuery();

  const generateAllMutation = trpc.signals.generateAll.useMutation({
    onSuccess: () => { signalsQuery.refetch(); toast.success("AI signals refreshed"); },
    onError:   () => toast.error("Failed to generate signals"),
  });

  const balance       = parseFloat(portfolioQuery.data?.balance ?? "250");
  const initialBal    = parseFloat(portfolioQuery.data?.initialBalance ?? "250");
  const totalReturn   = balance - initialBal;
  const totalReturnPct = ((totalReturn / initialBal) * 100).toFixed(2);
  const mode          = portfolioQuery.data?.mode ?? "paper";
  const stats         = dailyStatsQuery.data;
  const winRate       = stats && stats.tradeCount > 0
    ? ((stats.wins / stats.tradeCount) * 100).toFixed(0) : "0";
  const openPositions = tradesQuery.data?.length ?? 0;
  const latestSignals = signalsQuery.data?.slice(0, 5) ?? [];
  const balanceHistory = generateBalanceHistory(balance);
  const dailyPnl      = stats?.totalPnl ?? 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
            Welcome back, Hamada — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-bold", mode === "paper" ? "mode-paper" : "mode-live")}>
            <div className={cn("w-1.5 h-1.5 rounded-full", mode === "live" && "animate-pulse")}
              style={{ background: mode === "paper" ? "var(--color-gold)" : "var(--color-loss)" }} />
            {mode === "paper" ? "PAPER MODE" : "LIVE MODE"}
          </div>
          <button
            onClick={() => generateAllMutation.mutate()}
            disabled={generateAllMutation.isPending}
            className="hj-btn hj-btn-ghost"
          >
            <RefreshCw size={13} className={generateAllMutation.isPending ? "animate-spin" : ""} />
            Refresh Signals
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Account Balance"
          value={`$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          sub={`${totalReturn >= 0 ? "" : "-"}$${Math.abs(totalReturn).toFixed(2)} total`}
          icon={DollarSign} accentIcon
        />
        <StatCard
          label="Today's P&L"
          value={`${dailyPnl >= 0 ? "" : "-"}$${Math.abs(dailyPnl).toFixed(2)}`}
          sub={`${stats?.tradeCount ?? 0} trades today`}
          icon={TrendingUp}
          valueColor={dailyPnl > 0 ? "var(--color-profit)" : dailyPnl < 0 ? "var(--color-loss)" : undefined}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L today`}
          icon={Target}
          valueColor={parseInt(winRate) >= 50 ? "var(--color-profit)" : parseInt(winRate) > 0 ? "var(--color-loss)" : undefined}
        />
        <StatCard
          label="Open Positions"
          value={`${openPositions}`}
          sub={`Total return: ${totalReturn >= 0 ? "" : "-"}${Math.abs(parseFloat(totalReturnPct)).toFixed(2)}%`}
          icon={Activity}
        />
      </div>

      {/* Chart + Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Balance chart */}
        <div
          className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>Balance Progression</p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>Last 30 days</p>
            </div>
            <span
              className="hj-badge flex items-center gap-1"
              style={{
                background: totalReturn >= 0 ? "var(--color-profit-dim)" : "var(--color-loss-dim)",
                color: totalReturn >= 0 ? "var(--color-profit)" : "var(--color-loss)",
                border: `1px solid ${totalReturn >= 0 ? "oklch(0.720 0.130 155 / 0.25)" : "oklch(0.660 0.155 20 / 0.25)"}`,
              }}
            >
              {totalReturn >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(parseFloat(totalReturnPct)).toFixed(2)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={balanceHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="balance"
                stroke="var(--color-accent)" strokeWidth={2}
                fill="url(#balGrad)" dot={false}
                activeDot={{ r: 4, fill: "var(--color-accent)", stroke: "var(--color-bg-surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Latest signals */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>Latest Signals</p>
            <Link href="/signals" style={{ fontSize: "0.75rem", color: "var(--color-accent)" }}>View all</Link>
          </div>
          {latestSignals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                <BarChart3 size={20} style={{ color: "var(--color-text-tertiary)" }} />
              </div>
              <p style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>No signals yet</p>
              <button onClick={() => generateAllMutation.mutate()} disabled={generateAllMutation.isPending}
                style={{ fontSize: "0.75rem", color: "var(--color-accent)", cursor: "pointer", background: "none", border: "none" }}>
                Generate signals
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {latestSignals.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn(s.signal === "BUY" ? "signal-buy" : s.signal === "SELL" ? "signal-sell" : "signal-hold")}>
                      {s.signal}
                    </span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{s.instrument}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="confidence-bar w-12">
                      <div className="confidence-fill" style={{ width: `${s.confidence}%` }} />
                    </div>
                    <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-tertiary)", minWidth: "2.25rem", textAlign: "right" }}>
                      {s.confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's summary */}
      <div className="rounded-2xl p-5"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
        <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", marginBottom: "1rem" }}>
          Today's Summary
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Trades Executed", value: `${stats?.tradeCount ?? 0}` },
            { label: "Best Trade",  value: `$${(stats?.bestTrade ?? 0).toFixed(2)}`,  color: "var(--color-profit)" },
            { label: "Worst Trade", value: `-$${Math.abs(stats?.worstTrade ?? 0).toFixed(2)}`, color: "var(--color-loss)" },
            { label: "Net P&L",     value: `${dailyPnl >= 0 ? "" : "-"}$${Math.abs(dailyPnl).toFixed(2)}`,
              color: dailyPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 text-center"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
              <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                {label}
              </p>
              <p className="tabular-nums"
                style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: color ?? "var(--color-text-primary)" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
