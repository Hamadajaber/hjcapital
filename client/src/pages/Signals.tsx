import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Clock, Target, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INSTRUMENTS = ["EURUSD", "GBPUSD", "GOLD", "US500", "BTC"];

function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "HOLD" }) {
  const config = {
    BUY: { icon: TrendingUp, label: "BUY", cls: "signal-buy" },
    SELL: { icon: TrendingDown, label: "SELL", cls: "signal-sell" },
    HOLD: { icon: Minus, label: "HOLD", cls: "signal-hold" },
  };
  const { icon: Icon, label, cls } = config[signal];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold", cls)}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-profit" : value >= 65 ? "bg-primary" : "bg-yellow-500";
  return (
    <div className="confidence-bar w-full">
      <div
        className={cn("confidence-fill", color)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function InstrumentCard({ instrument, signal }: {
  instrument: string;
  signal?: {
    id: number;
    signal: "BUY" | "SELL" | "HOLD";
    confidence: number;
    reasoning: string;
    currentPrice: string | null;
    targetPrice: string | null;
    stopLoss: string | null;
    indicators: unknown;
    createdAt: Date;
  };
}) {
  const indicators = signal?.indicators as { rsi?: number; trend?: string; volatility?: string } | null;

  return (
    <div className={cn(
      "bg-card border rounded-xl p-5 transition-all duration-200 hover:border-primary/30",
      signal?.signal === "BUY" ? "border-[oklch(0.65_0.18_145/0.3)]" :
      signal?.signal === "SELL" ? "border-[oklch(0.60_0.22_25/0.3)]" :
      "border-border"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center">
            <span className="text-xs font-bold text-foreground">
              {instrument.slice(0, 2)}
            </span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">{instrument}</p>
            {signal?.currentPrice && (
              <p className="text-xs font-mono text-muted-foreground">
                ${parseFloat(signal.currentPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              </p>
            )}
          </div>
        </div>
        {signal ? <SignalBadge signal={signal.signal} /> : (
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary/40">No signal</span>
        )}
      </div>

      {signal && (
        <>
          {/* Confidence */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={cn(
                "text-xs font-bold font-mono",
                signal.confidence >= 80 ? "text-profit" : signal.confidence >= 65 ? "text-primary" : "text-yellow-500"
              )}>
                {signal.confidence}%
              </span>
            </div>
            <ConfidenceBar value={signal.confidence} />
          </div>

          {/* Price targets */}
          {(signal.targetPrice || signal.stopLoss) && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {signal.targetPrice && (
                <div className="bg-[oklch(0.65_0.18_145/0.08)] rounded-lg p-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Target</p>
                  <p className="text-xs font-mono font-bold text-profit">
                    ${parseFloat(signal.targetPrice).toFixed(4)}
                  </p>
                </div>
              )}
              {signal.stopLoss && (
                <div className="bg-[oklch(0.60_0.22_25/0.08)] rounded-lg p-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Stop Loss</p>
                  <p className="text-xs font-mono font-bold text-loss">
                    ${parseFloat(signal.stopLoss).toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Indicators */}
          {indicators && (
            <div className="flex items-center gap-2 mb-3">
              {indicators.rsi !== undefined && (
                <span className="text-xs px-2 py-0.5 rounded bg-secondary/60 text-muted-foreground">
                  RSI {indicators.rsi}
                </span>
              )}
              {indicators.trend && (
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded capitalize",
                  indicators.trend === "bullish" ? "bg-[oklch(0.65_0.18_145/0.12)] text-profit" :
                  indicators.trend === "bearish" ? "bg-[oklch(0.60_0.22_25/0.12)] text-loss" :
                  "bg-secondary/60 text-muted-foreground"
                )}>
                  {indicators.trend}
                </span>
              )}
              {indicators.volatility && (
                <span className="text-xs px-2 py-0.5 rounded bg-secondary/60 text-muted-foreground capitalize">
                  {indicators.volatility} vol
                </span>
              )}
            </div>
          )}

          {/* Reasoning */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{signal.reasoning}</p>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 mt-3">
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
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
  const generateAllMutation = trpc.signals.generateAll.useMutation({
    onSuccess: () => {
      signalsQuery.refetch();
      toast.success("All signals refreshed successfully");
    },
    onError: () => toast.error("Failed to generate signals"),
  });

  const generateOneMutation = trpc.signals.generate.useMutation({
    onSuccess: () => {
      signalsQuery.refetch();
      toast.success("Signal generated");
    },
    onError: () => toast.error("Failed to generate signal"),
  });

  // Get latest signal per instrument
  const latestByInstrument: Record<string, typeof signalsQuery.data extends (infer T)[] | undefined ? T : never> = {};
  for (const signal of (signalsQuery.data ?? [])) {
    if (!latestByInstrument[signal.instrument]) {
      latestByInstrument[signal.instrument] = signal as any;
    }
  }

  const buyCount = Object.values(latestByInstrument).filter((s: any) => s.signal === "BUY").length;
  const sellCount = Object.values(latestByInstrument).filter((s: any) => s.signal === "SELL").length;
  const holdCount = Object.values(latestByInstrument).filter((s: any) => s.signal === "HOLD").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Trading Signals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Real-time AI analysis for your watched instruments
          </p>
        </div>
        <button
          onClick={() => generateAllMutation.mutate()}
          disabled={generateAllMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={generateAllMutation.isPending ? "animate-spin" : ""} />
          {generateAllMutation.isPending ? "Analyzing..." : "Refresh All"}
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-profit" />
          <span className="text-sm text-muted-foreground">BUY:</span>
          <span className="text-sm font-bold text-profit">{buyCount}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <TrendingDown size={14} className="text-loss" />
          <span className="text-sm text-muted-foreground">SELL:</span>
          <span className="text-sm font-bold text-loss">{sellCount}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <Minus size={14} className="text-yellow-500" />
          <span className="text-sm text-muted-foreground">HOLD:</span>
          <span className="text-sm font-bold text-yellow-500">{holdCount}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle size={12} />
          Signals are AI-generated. Always apply your own judgment.
        </div>
      </div>

      {/* Signal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {INSTRUMENTS.map((instrument) => (
          <InstrumentCard
            key={instrument}
            instrument={instrument}
            signal={latestByInstrument[instrument] as any}
          />
        ))}
      </div>
    </div>
  );
}
