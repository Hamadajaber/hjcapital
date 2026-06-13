import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Shield, Save, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

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
    dailyLossLimit: "7.50",
    dailyProfitLock: "10.00",
    maxRiskPerTrade: "1.00",
    minConfidenceThreshold: 72,
    maxOpenPositions: 3,
  });

  useEffect(() => {
    if (riskQuery.data) {
      setSettings({
        dailyLossLimit: riskQuery.data.dailyLossLimit,
        dailyProfitLock: riskQuery.data.dailyProfitLock,
        maxRiskPerTrade: riskQuery.data.maxRiskPerTrade,
        minConfidenceThreshold: riskQuery.data.minConfidenceThreshold,
        maxOpenPositions: riskQuery.data.maxOpenPositions,
      });
    }
  }, [riskQuery.data]);

  const handleSave = () => {
    updateMutation.mutate({
      dailyLossLimit: settings.dailyLossLimit,
      dailyProfitLock: settings.dailyProfitLock,
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
              ? "Your settings prioritize capital preservation. Ideal for growing a small account steadily."
              : riskLevel === "medium"
              ? "Moderate risk. Suitable for experienced traders with a clear strategy."
              : "High risk per trade. Consider reducing to protect your $250 capital."}
          </p>
        </div>
      </div>

      {/* Settings panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Daily limits */}
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
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Daily Limits</h3>
          </div>
          <SettingRow
            label="Daily Loss Limit"
            description="Stop all trading when daily losses reach this amount"
            value={settings.dailyLossLimit}
            onChange={(v) => setSettings(s => ({ ...s, dailyLossLimit: v }))}
            min={1} max={50} step={0.5} prefix="$"
          />
          <SettingRow
            label="Daily Profit Lock"
            description="Lock in profits and stop trading when this daily gain is reached"
            value={settings.dailyProfitLock}
            onChange={(v) => setSettings(s => ({ ...s, dailyProfitLock: v }))}
            min={1} max={100} step={0.5} prefix="$"
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
              <Shield size={13} style={{ color: "var(--color-accent)" }} />
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

      {/* Info box */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}
      >
        <Info size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "0.125rem" }} />
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <p>
            <strong style={{ color: "var(--color-text-primary)" }}>Capital Preservation Philosophy:</strong>{" "}
            With a $250 account, the goal is small, consistent profits. A 1% daily gain ($2.50) compounded over 250 trading days grows your account significantly without excessive risk.
          </p>
          <p style={{ marginTop: "0.375rem" }}>
            Recommended settings: Daily loss limit $7.50 (3%), Daily profit lock $10 (4%), Max risk per trade 1%, Min confidence 72%.
          </p>
        </div>
      </div>
    </div>
  );
}
