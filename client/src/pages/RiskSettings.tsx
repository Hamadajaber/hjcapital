import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Shield, Save, AlertTriangle, Info, Target, Zap, Scale, Lock } from "lucide-react";
import { toast } from "sonner";

const PRESETS = {
  conservative: {
    label: "Conservative — حماية رأس المال",
    description: "Threshold 70% — فقط الصفقات عالية الثقة جداً",
    icon: Lock,
    color: "var(--color-profit)",
    dimColor: "var(--color-profit-dim)",
    borderColor: "oklch(0.720 0.130 155 / 0.30)",
    values: { minConfidenceThreshold: 70, maxRiskPerTrade: "0.50", maxOpenPositions: 2, stopLossPerTrade: "0.50", dailyLossLimitPct: "15.00" },
  },
  balanced: {
    label: "Balanced — توازن مثالي",
    description: "Threshold 55% — توازن بين الفرص والحماية",
    icon: Scale,
    color: "var(--color-gold)",
    dimColor: "oklch(0.65 0.18 55 / 0.08)",
    borderColor: "oklch(0.65 0.18 55 / 0.30)",
    values: { minConfidenceThreshold: 55, maxRiskPerTrade: "1.00", maxOpenPositions: 3, stopLossPerTrade: "1.00", dailyLossLimitPct: "25.00" },
  },
  aggressive: {
    label: "Aggressive — أقصى الفرص",
    description: "Threshold 45% — يفتح أكثر الصفقات بثقة أعلى",
    icon: Zap,
    color: "var(--color-loss)",
    dimColor: "var(--color-loss-dim)",
    borderColor: "oklch(0.660 0.155 20 / 0.30)",
    values: { minConfidenceThreshold: 45, maxRiskPerTrade: "2.00", maxOpenPositions: 5, stopLossPerTrade: "1.50", dailyLossLimitPct: "35.00" },
  },
} as const;

type PresetKey = keyof typeof PRESETS;

function SettingRow({
  label, description, value, onChange, type = "number", min, max, step, prefix, suffix
}: {
  label: string; description: string; value: string | number;
  onChange: (v: string) => void; type?: "number" | "text";
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
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
          onChange={(e) => onChange(e.target.value)}
          min={min} max={max} step={step}
          className="hj-input tabular-nums text-right"
          style={{ width: "6rem", fontFamily: "var(--font-serif)", fontSize: "0.875rem" }}
        />
        {suffix && <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function RiskSettings() {
  const riskQuery = trpc.risk.get.useQuery();
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
  });

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
    });
  };

  const riskLevel = parseFloat(settings.maxRiskPerTrade) > 2 ? "high"
    : parseFloat(settings.maxRiskPerTrade) > 1 ? "medium" : "low";

  const riskBg    = riskLevel === "low" ? "var(--color-profit-dim)" : riskLevel === "medium" ? "oklch(0.65 0.18 55 / 0.08)" : "var(--color-loss-dim)";
  const riskBorder = riskLevel === "low" ? "oklch(0.720 0.130 155 / 0.30)" : riskLevel === "medium" ? "oklch(0.65 0.18 55 / 0.30)" : "oklch(0.660 0.155 20 / 0.30)";
  const riskColor  = riskLevel === "low" ? "var(--color-profit)" : riskLevel === "medium" ? "var(--color-gold)" : "var(--color-loss)";

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
            onChange={(v) => setSettings(s => ({ ...s, minConfidenceThreshold: parseInt(v) || 72 }))}
            min={50} max={95} step={1} suffix="%"
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

      {/* Philosophy info box */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
      >
        <Info size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "0.125rem" }} />
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <p>
            <strong style={{ color: "var(--color-text-primary)" }}>Investment Philosophy — Protect the Trade, Not the Day:</strong>{" "}
            Instead of capping daily profits, each trade has its own stop loss. If the market is strong, the engine keeps trading and capturing gains. The day only stops if total losses hit {settings.dailyLossLimitPct}% of capital.
          </p>
          <p style={{ marginTop: "0.375rem" }}>
            Current settings: Daily loss cap {settings.dailyLossLimitPct}% · Stop loss per trade {settings.stopLossPerTrade}% · Max risk {settings.maxRiskPerTrade}% · Min confidence {settings.minConfidenceThreshold}%.
          </p>
        </div>
      </div>
    </div>
  );
}
