import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Shield, Save, AlertTriangle, Info, Target, Zap, Scale, Lock, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const PRESETS = {
  conservative: {
    label: "Conservative — حماية رأس المال",
    description: "Threshold 65% — فقط الصفقات عالية الثقة جداً — مناسب للبداية",
    icon: Lock,
    color: "var(--color-profit)",
    dimColor: "var(--color-profit-dim)",
    borderColor: "oklch(0.720 0.130 155 / 0.30)",
    values: { minConfidenceThreshold: 65, maxRiskPerTrade: "0.50", maxOpenPositions: 2, stopLossPerTrade: "0.50", dailyLossLimitPct: "10.00", trailingDrawdownPct: "5.00" },
  },
  balanced: {
    label: "Balanced — مدير محفظة",
    description: "Threshold 55% — توازن مثالي — موصى به للاستراتيجية الجديدة",
    icon: Scale,
    color: "var(--color-gold)",
    dimColor: "oklch(0.65 0.18 55 / 0.08)",
    borderColor: "oklch(0.65 0.18 55 / 0.30)",
    values: { minConfidenceThreshold: 55, maxRiskPerTrade: "0.75", maxOpenPositions: 3, stopLossPerTrade: "0.75", dailyLossLimitPct: "20.00", trailingDrawdownPct: "5.00" },
  },
  aggressive: {
    label: "Aggressive — أقصى الفرص",
    description: "Threshold 45% — يفتح أكثر الصفقات — للسوق النشط فقط",
    icon: Zap,
    color: "var(--color-loss)",
    dimColor: "var(--color-loss-dim)",
    borderColor: "oklch(0.660 0.155 20 / 0.30)",
    values: { minConfidenceThreshold: 45, maxRiskPerTrade: "1.00", maxOpenPositions: 4, stopLossPerTrade: "1.00", dailyLossLimitPct: "30.00", trailingDrawdownPct: "7.00" },
  },
} as const;

type PresetKey = keyof typeof PRESETS;

function SettingRow({
  label, description, value, onChange, type = "number", min, max, step, prefix, suffix, readOnly
}: {
  label: string; description: string; value: string | number;
  onChange?: (v: string) => void; type?: "number" | "text";
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
  readOnly?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-6 py-4"
      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
    >
      <div className="flex-1">
        <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{label}</p>
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {prefix && <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          min={min} max={max} step={step}
          readOnly={readOnly}
          className="hj-input tabular-nums text-right"
          style={{
            width: "6rem",
            fontFamily: "var(--font-serif)",
            fontSize: "0.875rem",
            opacity: readOnly ? 0.6 : 1,
            cursor: readOnly ? "not-allowed" : "text",
          }}
        />
        {suffix && <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function RiskSettings() {
  const riskQuery = trpc.risk.get.useQuery();
  const thresholdQuery = trpc.intelligence.getDynamicThreshold.useQuery(undefined, { retry: false });
  const updateMutation = trpc.risk.update.useMutation({
    onSuccess: () => { riskQuery.refetch(); toast.success("Risk settings saved successfully"); },
    onError: () => toast.error("Failed to save settings"),
  });

  const [settings, setSettings] = useState({
    dailyLossLimitPct: "25.00",
    stopLossPerTrade: "1.00",
    maxRiskPerTrade: "1.00",
    minConfidenceThreshold: 55,
    maxOpenPositions: 3,
    trailingDrawdownPct: "5.00",
  });

  // Read-only display of peak balance from DB
  const peakBalance = riskQuery.data?.peakBalance ? parseFloat(riskQuery.data.peakBalance) : 1000;

  const [activePreset, setActivePreset] = useState<PresetKey | null>("balanced");

  const applyPreset = (key: PresetKey) => {
    const preset = PRESETS[key];
    setSettings(s => ({
      ...s,
      minConfidenceThreshold: preset.values.minConfidenceThreshold,
      maxRiskPerTrade: preset.values.maxRiskPerTrade,
      maxOpenPositions: preset.values.maxOpenPositions,
      stopLossPerTrade: preset.values.stopLossPerTrade,
      dailyLossLimitPct: preset.values.dailyLossLimitPct,
      trailingDrawdownPct: preset.values.trailingDrawdownPct,
    }));
    setActivePreset(key);
    toast.info(`Applied ${preset.label.split(" — ")[0]} preset`);
  };

  useEffect(() => {
    if (riskQuery.data) {
      setSettings({
        dailyLossLimitPct: riskQuery.data.dailyLossLimitPct,
        stopLossPerTrade: riskQuery.data.stopLossPerTrade,
        maxRiskPerTrade: riskQuery.data.maxRiskPerTrade,
        minConfidenceThreshold: riskQuery.data.minConfidenceThreshold,
        maxOpenPositions: riskQuery.data.maxOpenPositions,
        trailingDrawdownPct: riskQuery.data.trailingDrawdownPct ?? "5.00",
      });
    }
  }, [riskQuery.data]);

  const handleSave = () => {
    updateMutation.mutate({
      dailyLossLimitPct: settings.dailyLossLimitPct,
      stopLossPerTrade: settings.stopLossPerTrade,
      maxRiskPerTrade: settings.maxRiskPerTrade,
      minConfidenceThreshold: settings.minConfidenceThreshold,
      maxOpenPositions: settings.maxOpenPositions,
      trailingDrawdownPct: settings.trailingDrawdownPct,
    });
  };

  // Smart preset recommendation: when 7-day win rate > 50%, suggest Balanced preset
  const winRate7d = thresholdQuery.data?.winRate ?? 0;
  const totalTrades7d = thresholdQuery.data?.totalTrades ?? 0;
  const showBalancedSuggestion = totalTrades7d >= 5 && winRate7d > 50 && activePreset !== "balanced";

  const riskLevel = parseFloat(settings.maxRiskPerTrade) > 2 ? "high"
    : parseFloat(settings.maxRiskPerTrade) > 1 ? "medium" : "low";

  const riskBg    = riskLevel === "low" ? "var(--color-profit-dim)" : riskLevel === "medium" ? "oklch(0.65 0.18 55 / 0.08)" : "var(--color-loss-dim)";
  const riskBorder = riskLevel === "low" ? "oklch(0.720 0.130 155 / 0.30)" : riskLevel === "medium" ? "oklch(0.65 0.18 55 / 0.30)" : "oklch(0.660 0.155 20 / 0.30)";
  const riskColor  = riskLevel === "low" ? "var(--color-profit)" : riskLevel === "medium" ? "var(--color-gold)" : "var(--color-loss)";

  // Trailing drawdown status
  const trailingPct = parseFloat(settings.trailingDrawdownPct) || 5;
  const trailingEnabled = trailingPct > 0;
  const drawdownFloor = peakBalance * (1 - trailingPct / 100);

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em", fontFamily: "var(--font-serif)" }}>
            Risk Management
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", marginTop: "0.125rem" }}>
            Configure your capital protection parameters
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="hj-btn hj-btn-primary"
        >
          <Save size={13} />
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Smart Balanced Preset Suggestion */}
      {showBalancedSuggestion && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: "oklch(0.65 0.18 55 / 0.08)", border: "1px solid oklch(0.65 0.18 55 / 0.30)" }}
        >
          <Sparkles size={16} style={{ color: "var(--color-gold)", flexShrink: 0, marginTop: "0.125rem" }} />
          <div className="flex-1">
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-gold)" }}>
              Smart Suggestion — Apply Balanced Preset?
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
              Your 7-day win rate is <strong style={{ color: "var(--color-profit)" }}>{winRate7d.toFixed(1)}%</strong> (above 50% — performing well).
              The Balanced preset (55% confidence / 0.75% risk) is recommended to capitalize on this momentum.
            </p>
          </div>
          <button
            onClick={() => applyPreset("balanced")}
            className="hj-btn hj-btn-primary shrink-0"
            style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem" }}
          >
            Apply Balanced
          </button>
        </div>
      )}

      {/* Risk level indicator */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: riskBg, border: `1px solid ${riskBorder}` }}
      >
        {riskLevel === "high"
          ? <AlertTriangle size={16} style={{ color: "var(--color-loss)", flexShrink: 0, marginTop: "0.125rem" }} />
          : <Shield size={16} style={{ color: riskColor, flexShrink: 0, marginTop: "0.125rem" }} />
        }
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: riskColor }}>
            Risk Level: {riskLevel === "low" ? "Conservative (Recommended)" : riskLevel === "medium" ? "Moderate" : "Aggressive (Caution)"}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
            {riskLevel === "low"
              ? "Your settings prioritize capital preservation. Each trade is protected individually — no daily profit cap."
              : riskLevel === "medium"
              ? "Moderate risk. Suitable for experienced traders with a clear strategy."
              : "High risk per trade. Consider reducing to protect your capital."}
          </p>
        </div>
      </div>

      {/* Aggressiveness Preset Selector */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)" }}>
            <Zap size={13} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Trading Mode</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.0625rem" }}>Quick preset — adjusts confidence threshold, risk, and position limits</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(PRESETS) as [PresetKey, typeof PRESETS[PresetKey]][]).map(([key, preset]) => {
            const Icon = preset.icon;
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                style={{
                  background: isActive ? preset.dimColor : "transparent",
                  border: `1px solid ${isActive ? preset.borderColor : "var(--color-border-subtle)"}`,
                  cursor: "pointer",
                  transform: isActive ? "scale(1.01)" : "scale(1)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: isActive ? preset.color : "var(--color-text-tertiary)" }} />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: isActive ? preset.color : "var(--color-text-primary)" }}>
                    {preset.label.split(" — ")[0]}
                  </span>
                </div>
                <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
                  {preset.description}
                </p>
                <div style={{ fontSize: "0.6875rem", color: isActive ? preset.color : "var(--color-text-tertiary)", fontWeight: 500 }}>
                  Confidence: {preset.values.minConfidenceThreshold}% · Risk: {preset.values.maxRiskPerTrade}%
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Capital protection */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="p-1.5 rounded-lg"
              style={{ background: "var(--color-loss-dim)", border: "1px solid oklch(0.660 0.155 20 / 0.20)" }}
            >
              <AlertTriangle size={13} style={{ color: "var(--color-loss)" }} />
            </div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Capital Protection</h3>
          </div>
          <SettingRow
            label="Daily Loss Limit"
            description="Stop all trading if total daily losses exceed this % of capital"
            value={settings.dailyLossLimitPct}
            onChange={(v) => setSettings(s => ({ ...s, dailyLossLimitPct: v }))}
            min={5} max={50} step={1} suffix="%"
          />
          <SettingRow
            label="Stop Loss Per Trade"
            description="Each trade automatically closes if it loses this % of capital"
            value={settings.stopLossPerTrade}
            onChange={(v) => setSettings(s => ({ ...s, stopLossPerTrade: v }))}
            min={0.1} max={5} step={0.1} suffix="%"
          />
        </div>

        {/* Trade controls */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="p-1.5 rounded-lg"
              style={{ background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)" }}
            >
              <Target size={13} style={{ color: "var(--color-accent)" }} />
            </div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Trade Controls</h3>
          </div>
          <SettingRow
            label="Max Risk Per Trade"
            description="Maximum percentage of balance to risk on a single trade"
            value={settings.maxRiskPerTrade}
            onChange={(v) => setSettings(s => ({ ...s, maxRiskPerTrade: v }))}
            min={0.1} max={5} step={0.1} suffix="%"
          />
          <SettingRow
            label="Min AI Confidence"
            description="Only execute trades when AI confidence is above this threshold"
            value={settings.minConfidenceThreshold}
            onChange={(v) => setSettings(s => ({ ...s, minConfidenceThreshold: parseInt(v) || 55 }))}
            min={30} max={95} step={1} suffix="%"
          />
          <SettingRow
            label="Max Open Positions"
            description="Maximum number of simultaneous open trades"
            value={settings.maxOpenPositions}
            onChange={(v) => setSettings(s => ({ ...s, maxOpenPositions: parseInt(v) || 3 }))}
            min={1} max={10} step={1}
          />
        </div>
      </div>

      {/* Trailing Drawdown Protection — Scientific Risk Management */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: trailingEnabled ? "oklch(0.25 0.06 260 / 0.15)" : "var(--color-bg-surface)",
          border: `1px solid ${trailingEnabled ? "oklch(0.55 0.18 260 / 0.35)" : "var(--color-border-subtle)"}`,
        }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="p-1.5 rounded-lg"
            style={{
              background: trailingEnabled ? "oklch(0.55 0.18 260 / 0.15)" : "var(--color-bg-elevated)",
              border: `1px solid ${trailingEnabled ? "oklch(0.55 0.18 260 / 0.35)" : "var(--color-border-subtle)"}`,
            }}
          >
            <TrendingDown size={13} style={{ color: trailingEnabled ? "oklch(0.65 0.18 260)" : "var(--color-text-tertiary)" }} />
          </div>
          <div className="flex-1">
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Trailing Drawdown Protection
              {trailingEnabled && (
                <span
                  className="ml-2 px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "oklch(0.55 0.18 260 / 0.15)", color: "oklch(0.65 0.18 260)", fontWeight: 500 }}
                >
                  ACTIVE
                </span>
              )}
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)", marginTop: "0.0625rem" }}>
              Scientific risk management — protects accumulated profits without capping upside
            </p>
          </div>
        </div>

        {/* Peak balance display */}
        <div
          className="flex items-center justify-between p-3 rounded-xl mb-4"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={13} style={{ color: "var(--color-profit)" }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>Peak Balance (auto-tracked)</span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-profit)", fontFamily: "var(--font-serif)" }}>
              ${peakBalance.toFixed(2)}
            </span>
            {trailingEnabled && (
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
                Floor: ${drawdownFloor.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <SettingRow
          label="Trailing Drawdown %"
          description="Engine stops if balance drops more than this % below peak balance (0 = disabled)"
          value={settings.trailingDrawdownPct}
          onChange={(v) => setSettings(s => ({ ...s, trailingDrawdownPct: v }))}
          min={0} max={20} step={0.5} suffix="%"
        />

        {trailingEnabled && (
          <div
            className="mt-3 p-3 rounded-xl flex items-start gap-2"
            style={{ background: "oklch(0.55 0.18 260 / 0.08)", border: "1px solid oklch(0.55 0.18 260 / 0.20)" }}
          >
            <Info size={12} style={{ color: "oklch(0.65 0.18 260)", flexShrink: 0, marginTop: "0.125rem" }} />
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Engine will pause if balance falls below <strong style={{ color: "oklch(0.65 0.18 260)" }}>${drawdownFloor.toFixed(2)}</strong> (${peakBalance.toFixed(2)} peak − {trailingPct}%).
              Peak balance updates automatically as profits grow — protecting more capital over time.
              Set to 0 to disable.
            </p>
          </div>
        )}
      </div>

      {/* Philosophy info box */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
      >
        <Info size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "0.125rem" }} />
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <p>
            <strong style={{ color: "var(--color-text-primary)" }}>Scientific Risk Management — Unlimited Upside, Protected Downside:</strong>{" "}
            No daily profit cap. The engine keeps trading as long as profits are growing.
            Trailing Drawdown Protection ({settings.trailingDrawdownPct}%) automatically locks in gains by stopping trading
            only when balance drops {settings.trailingDrawdownPct}% from its all-time peak — not from the starting balance.
          </p>
          <p style={{ marginTop: "0.375rem" }}>
            Current settings: Daily loss cap {settings.dailyLossLimitPct}% · Stop loss per trade {settings.stopLossPerTrade}% · Max risk {settings.maxRiskPerTrade}% · Min confidence {settings.minConfidenceThreshold}% · Trailing drawdown {settings.trailingDrawdownPct}%.
          </p>
        </div>
      </div>
    </div>
  );
}
