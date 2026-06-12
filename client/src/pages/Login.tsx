import { getLoginUrl } from "@/const";
import { TrendingUp, Shield, Zap, Sparkles } from "lucide-react";

export default function Login() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute"
          style={{
            top: "15%", left: "20%", width: "28rem", height: "28rem",
            background: "radial-gradient(circle, oklch(0.55 0.14 252 / 0.07) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute"
          style={{
            bottom: "20%", right: "15%", width: "20rem", height: "20rem",
            background: "radial-gradient(circle, oklch(0.55 0.14 252 / 0.05) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo mark */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/111908166/jFhH8npJoz2jTjiimeA2CG/hj-logo-hd-S6Q6fHscfpH44tUAJbNk6c.webp"
              alt="HJ Capital"
              style={{ width: 80, height: 80, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
            HJ Capital
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)" }}>
            Private Investment Platform
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "0 24px 64px oklch(0 0 0 / 0.35)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Welcome back, Hamada
            </h2>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            Sign in to access your personal trading dashboard.
          </p>

          <a
            href={getLoginUrl()}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-semibold transition-all duration-150"
            style={{
              background: "var(--color-accent)",
              color: "oklch(0.115 0.018 252)",
              fontSize: "0.875rem",
              textDecoration: "none",
              boxShadow: "0 4px 16px oklch(0.55 0.14 252 / 0.30)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-accent-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--color-accent)")}
          >
            <Shield size={15} />
            Sign In Securely
          </a>

          <div
            className="mt-6 pt-6 space-y-3"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
              Platform Features
            </p>
            {[
              { icon: TrendingUp, text: "AI-powered trading signals for 5 instruments" },
              { icon: Zap, text: "Real-time portfolio tracking & P&L monitoring" },
              { icon: Shield, text: "Advanced risk management & capital protection" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)" }}
                >
                  <Icon size={11} style={{ color: "var(--color-accent)" }} />
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.6875rem", color: "var(--color-text-tertiary)", marginTop: "1.25rem" }}>
          This platform is exclusively for Hamada Jaber
        </p>
      </div>
    </div>
  );
}
