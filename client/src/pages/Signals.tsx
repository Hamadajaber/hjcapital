import { trpc } from "@/lib/trpc";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Clock, AlertCircle, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INSTRUMENTS = ["EURUSD", "GBPUSD", "USDJPY", "EURGBP", "GOLD", "XAGUSD", "OIL_CRUDE", "US500", "GER40", "NASDAQ"];

function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "HOLD" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs font-bold",
      signal === "BUY" ? "signal-buy" : signal === "SELL" ? "signal-sell" : "signal-hold"
    )}>
      {signal === "BUY" ? <TrendingUp size={11} /> : signal === "SELL" ? <TrendingDown size={11} /> : <Minus size={11} />}
      {signal}
    </span>
  );
}

function InstrumentCard({ instrument, signal, onRefresh, loading }: {
  instrument: string;
  signal?: {
    id: number; signal: "BUY" | "SELL" | "HOLD"; confidence: number;
    reasoning: string; currentPrice: string | null; targetPrice: string | null;
    stopLoss: string | null; indicators: unknown; createdAt: Date;
  };
  onRefresh: () => void; loading: boolean;
}) {
  const indicators = signal?.indicators as { rsi?: number; trend?: string; volatility?: string } | null;
  const borderColor = signal?.signal === "BUY"
    ? "oklch(0.720 0.130 155 / 0.30)"
    : signal?.signal === "SELL"
    ? "oklch(0.660 0.155 20 / 0.30)"
    : "var(--color-border-subtle)";

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200 animate-fade-up"
      style={{
        background: "var(--color-bg-surface)",
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}>
              {instrument.slice(0, 2)}
            </span>
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>{instrument}</p>
            {signal?.currentPrice && (
              <p style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-tertiary)" }}>
                ${parseFloat(signal.currentPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {signal ? <SignalBadge signal={signal.signal} /> : (
            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", padding: "0.125rem 0.5rem",
              background: "var(--color-bg-elevated)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-subtle)" }}>
              No signal
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-text-tertiary)", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
            title="Refresh signal"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {signal && (
        <>
          {/* Confidence */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                AI Confidence
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: "0.75rem", fontWeight: 600, fontFamily: "var(--font-serif)",
                  color: signal.confidence >= 80 ? "var(--color-profit)" : signal.confidence >= 65 ? "var(--color-accent)" : "var(--color-gold)",
                }}
              >
                {signal.confidence}%
              </span>
            </div>
            <div className="confidence-bar">
              <div
                className="confidence-fill"
                style={{
                  width: `${signal.confidence}%`,
                  background: signal.confidence >= 80
                    ? "linear-gradient(90deg, var(--color-accent), var(--color-profit))"
                    : signal.confidence >= 65
                    ? "linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))"
                    : "linear-gradient(90deg, var(--color-gold), var(--color-accent))",
                }}
              />
            </div>
          </div>

          {/* Price targets */}
          {(signal.targetPrice || signal.stopLoss) && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {signal.targetPrice && (
                <div className="rounded-lg p-2.5" style={{ background: "var(--color-profit-dim)", border: "1px solid oklch(0.720 0.130 155 / 0.20)" }}>
                  <p style={{ fontSize: "0.625rem", color: "var(--color-text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Target</p>
                  <p style={{ fontSize: "0.75rem", fontFamily: "var(--font-serif)", fontWeight: 600, color: "var(--color-profit)" }}>
                    ${parseFloat(signal.targetPrice).toFixed(4)}
                  </p>
                </div>
              )}
              {signal.stopLoss && (
                <div className="rounded-lg p-2.5" style={{ background: "var(--color-loss-dim)", border: "1px solid oklch(0.660 0.155 20 / 0.20)" }}>
                  <p style={{ fontSize: "0.625rem", color: "var(--color-text-tertiary)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Stop Loss</p>
                  <p style={{ fontSize: "0.75rem", fontFamily: "var(--font-serif)", fontWeight: 600, color: "var(--color-loss)" }}>
                    ${parseFloat(signal.stopLoss).toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Indicators */}
          {indicators && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {indicators.rsi !== undefined && (
                <span className="hj-badge" style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)" }}>
                  RSI {indicators.rsi}
                </span>
              )}
              {indicators.trend && (
                <span className="hj-badge" style={{
                  background: indicators.trend === "bullish" ? "var(--color-profit-dim)" : indicators.trend === "bearish" ? "var(--color-loss-dim)" : "var(--color-bg-elevated)",
                  color: indicators.trend === "bullish" ? "var(--color-profit)" : indicators.trend === "bearish" ? "var(--color-loss)" : "var(--color-text-secondary)",
                  border: "1px solid transparent",
                  textTransform: "capitalize",
                }}>
                  {indicators.trend}
                </span>
              )}
              {indicators.volatility && (
                <span className="hj-badge" style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", textTransform: "capitalize" }}>
                  {indicators.volatility} vol
                </span>
              )}
            </div>
          )}

          {/* Reasoning */}
          <div className="rounded-xl p-3" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{signal.reasoning}</p>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 mt-3">
            <Clock size={11} style={{ color: "var(--color-text-tertiary)" }} />
            <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
              {new Date(signal.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Signals() {
  const signalsQuery = trpc.signals.list.useQuery();
  const livePricesQuery = trpc.capitalcom.livePrices.useQuery(undefined, {
    refetchInterval: 15000, // refresh every 15 seconds
    retry: false,
  });
  const generateAllMutation = trpc.signals.generateAll.useMutation({
    onSuccess: () => { signalsQuery.refetch(); toast.success("All signals refreshed"); },
    onError: () => toast.error("Failed to generate signals"),
  });
  const generateOneMutation = trpc.signals.generate.useMutation({
    onSuccess: () => { signalsQuery.refetch(); toast.success("Signal generated"); },
    onError: () => toast.error("Failed to generate signal"),
  });

  const latestByInstrument: Record<string, any> = {};
  for (const signal of (signalsQuery.data ?? [])) {
    if (!latestByInstrument[signal.instrument]) latestByInstrument[signal.instrument] = signal;
  }

  const buyCount  = Object.values(latestByInstrument).filter((s: any) => s.signal === "BUY").length;
  const sellCount = Object.values(latestByInstrument).filter((s: any) => s.signal === "SELL").length;
  const holdCount = Object.values(latestByInstrument).filter((s: any) => s.signal === "HOLD").length;

  const livePrices = livePricesQuery.data ?? [];
  const livePriceMap: Record<string, typeof livePrices[0]> = {};
  for (const p of livePrices) { livePriceMap[p.epic] = p; }

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em", fontFamily: "var(--font-serif)" }}>
            AI Trading Signals
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
            Real-time AI analysis for your watched instruments
          </p>
        </div>
        <button
          onClick={() => generateAllMutation.mutate()}
          disabled={generateAllMutation.isPending}
          className="hj-btn hj-btn-primary"
        >
          <RefreshCw size={13} className={generateAllMutation.isPending ? "animate-spin" : ""} />
          {generateAllMutation.isPending ? "Analyzing..." : "Refresh All"}
        </button>
      </div>

      {/* Live Price Ticker */}
      {livePrices.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-5 py-3"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-1.5">
            <Wifi size={11} style={{ color: "var(--color-profit)" }} />
            <span style={{ fontSize: "0.625rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Live Prices</span>
          </div>
          {livePrices.map((p) => (
            <div key={p.epic} className="flex items-center gap-2">
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>{p.epic}</span>
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-serif)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {p.mid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              </span>
              <span style={{
                fontSize: "0.6875rem", fontFamily: "var(--font-mono)",
                color: p.pctChange >= 0 ? "var(--color-profit)" : "var(--color-loss)"
              }}>
                {p.pctChange >= 0 ? "+" : ""}{p.pctChange.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div
        className="flex flex-wrap items-center gap-4 rounded-2xl px-5 py-3.5"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
      >
        {[
          { label: "BUY", count: buyCount, color: "var(--color-profit)", icon: TrendingUp },
          { label: "SELL", count: sellCount, color: "var(--color-loss)", icon: TrendingDown },
          { label: "HOLD", count: holdCount, color: "var(--color-gold)", icon: Minus },
        ].map(({ label, count, color, icon: Icon }, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div style={{ width: 1, height: 16, background: "var(--color-border-subtle)" }} />}
            <Icon size={13} style={{ color }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>{label}:</span>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font-serif)", color }}>{count}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <AlertCircle size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
            AI-generated. Always apply your own judgment.
          </span>
        </div>
      </div>

      {/* Signal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {INSTRUMENTS.map((instrument) => (
          <InstrumentCard
            key={instrument}
            instrument={instrument}
            signal={latestByInstrument[instrument]}
            onRefresh={() => generateOneMutation.mutate({ instrument })}
            loading={generateOneMutation.isPending && generateOneMutation.variables?.instrument === instrument}
          />
        ))}
      </div>
    </div>
  );
}
