import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Shield, Save, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function SettingRow({
  label, description, value, onChange, type = "number", min, max, step, prefix, suffix
}: {
  label: string;
  description: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "number" | "text";
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          className="w-24 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-foreground text-right focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export default function RiskSettings() {
  const riskQuery = trpc.risk.get.useQuery();
  const updateMutation = trpc.risk.update.useMutation({
    onSuccess: () => {
      riskQuery.refetch();
      toast.success("Risk settings saved successfully");
    },
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

  // Risk level assessment
  const riskLevel = parseFloat(settings.maxRiskPerTrade) > 2 ? "high" :
    parseFloat(settings.maxRiskPerTrade) > 1 ? "medium" : "low";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your capital protection parameters</p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Save size={14} />
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Risk level indicator */}
      <div className={cn(
        "flex items-start gap-3 p-4 rounded-xl border",
        riskLevel === "low" ? "bg-[oklch(0.65_0.18_145/0.08)] border-[oklch(0.65_0.18_145/0.3)]" :
        riskLevel === "medium" ? "bg-[oklch(0.65_0.18_55/0.08)] border-[oklch(0.65_0.18_55/0.3)]" :
        "bg-[oklch(0.60_0.22_25/0.08)] border-[oklch(0.60_0.22_25/0.3)]"
      )}>
        {riskLevel === "high" ? (
          <AlertTriangle size={16} className="text-loss shrink-0 mt-0.5" />
        ) : (
          <Shield size={16} className={cn("shrink-0 mt-0.5", riskLevel === "low" ? "text-profit" : "text-yellow-500")} />
        )}
        <div>
          <p className={cn(
            "text-sm font-semibold",
            riskLevel === "low" ? "text-profit" : riskLevel === "medium" ? "text-yellow-500" : "text-loss"
          )}>
            Risk Level: {riskLevel === "low" ? "Conservative (Recommended)" : riskLevel === "medium" ? "Moderate" : "Aggressive (Caution)"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {riskLevel === "low"
              ? "Your settings prioritize capital preservation. Ideal for growing a small account steadily."
              : riskLevel === "medium"
              ? "Moderate risk. Suitable for experienced traders with a clear strategy."
              : "High risk per trade. Consider reducing to protect your $250 capital."}
          </p>
        </div>
      </div>

      {/* Settings panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily limits */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-loss/10">
              <AlertTriangle size={14} className="text-loss" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Daily Limits</h3>
          </div>
          <SettingRow
            label="Daily Loss Limit"
            description="Stop all trading when daily losses reach this amount"
            value={settings.dailyLossLimit}
            onChange={(v) => setSettings(s => ({ ...s, dailyLossLimit: v }))}
            min={1}
            max={50}
            step={0.5}
            prefix="$"
          />
          <SettingRow
            label="Daily Profit Lock"
            description="Lock in profits and stop trading when this daily gain is reached"
            value={settings.dailyProfitLock}
            onChange={(v) => setSettings(s => ({ ...s, dailyProfitLock: v }))}
            min={1}
            max={100}
            step={0.5}
            prefix="$"
          />
        </div>

        {/* Trade limits */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield size={14} className="text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Trade Controls</h3>
          </div>
          <SettingRow
            label="Max Risk Per Trade"
            description="Maximum percentage of balance to risk on a single trade"
            value={settings.maxRiskPerTrade}
            onChange={(v) => setSettings(s => ({ ...s, maxRiskPerTrade: v }))}
            min={0.1}
            max={5}
            step={0.1}
            suffix="%"
          />
          <SettingRow
            label="Min AI Confidence"
            description="Only execute trades when AI confidence is above this threshold"
            value={settings.minConfidenceThreshold}
            onChange={(v) => setSettings(s => ({ ...s, minConfidenceThreshold: parseInt(v) || 72 }))}
            min={50}
            max={95}
            step={1}
            suffix="%"
          />
          <SettingRow
            label="Max Open Positions"
            description="Maximum number of simultaneous open trades"
            value={settings.maxOpenPositions}
            onChange={(v) => setSettings(s => ({ ...s, maxOpenPositions: parseInt(v) || 3 }))}
            min={1}
            max={10}
            step={1}
          />
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/30 border border-border">
        <Info size={14} className="text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Capital Preservation Philosophy:</strong> With a $250 account, the goal is small, consistent profits. A 1% daily gain ($2.50) compounded over 250 trading days grows your account significantly without excessive risk.</p>
          <p>Recommended settings: Daily loss limit $7.50 (3%), Daily profit lock $10 (4%), Max risk per trade 1%, Min confidence 72%.</p>
        </div>
      </div>
    </div>
  );
}
