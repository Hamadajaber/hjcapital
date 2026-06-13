import { getLoginUrl } from "@/const";
import { TrendingUp, Shield, Zap, Sparkles } from "lucide-react";

export default function Login() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `linear-gradient(to bottom, oklch(0.975 0.008 85 / 0.80) 0%, oklch(0.975 0.008 85 / 0.72) 50%, oklch(0.975 0.008 85 / 0.80) 100%), url('https://d2xsxph8kpxj0f.cloudfront.net/111908166/jFhH8npJoz2jTjiimeA2CG/hj-nature-bg-hf268toW5gM8ECw9d4e9DW.webp')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Soft ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute"
          style={{
            top: "10%", left: "50%", transform: "translateX(-50%)",
            width: "40rem", height: "20rem",
            background: "radial-gradient(ellipse, oklch(0.440 0.080 145 / 0.07) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">

        {/* Logo mark — Heritage Ledger shield */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <img
              src="/manus-storage/hj-logo-shield_56c87b67.png"
              alt="HJ Capital"
              style={{ width: 88, height: 88, objectFit: "contain" }}
            />
          </div>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "0.375rem",
            fontFamily: "var(--font-serif)",
          }}>
            HJ Capital
          </h1>
          <p style={{
            fontSize: "0.6875rem",
            color: "var(--color-text-tertiary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
          }}>
            Private Investment Platform
          </p>
        </div>

        {/* Card */}
        <div
          className="p-8"
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "0.5rem",
            boxShadow: "0 16px 48px oklch(0.180 0.020 145 / 0.12)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
            <h2 style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-serif)",
              letterSpacing: "-0.01em",
            }}>
              Welcome back, Hamada
            </h2>
          </div>
          <p style={{
            fontSize: "0.8125rem",
            color: "var(--color-text-secondary)",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
            fontFamily: "var(--font-sans)",
          }}>
            Sign in to access your personal trading dashboard.
          </p>

          <a
            href={getLoginUrl()}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 font-semibold transition-all duration-150"
            style={{
              background: "var(--color-accent)",
              color: "oklch(0.990 0.005 85)",
              fontSize: "0.8125rem",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
              borderRadius: "0.25rem",
              boxShadow: "0 4px 16px var(--color-accent-glow)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "var(--color-accent-hover)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "var(--color-accent)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Shield size={14} />
            Sign In Securely
          </a>

          <div
            className="mt-6 pt-6 space-y-3"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <p style={{
              fontSize: "0.625rem",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
            }}>
              Platform Features
            </p>
            {[
              { icon: TrendingUp, text: "AI-powered trading signals for 5 instruments" },
              { icon: Zap, text: "Real-time portfolio tracking & P&L monitoring" },
              { icon: Shield, text: "Advanced risk management & capital protection" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 flex items-center justify-center shrink-0"
                  style={{
                    background: "var(--color-accent-dim)",
                    border: "1px solid var(--color-accent)",
                    borderRadius: "0.25rem",
                  }}
                >
                  <Icon size={11} style={{ color: "var(--color-accent)" }} />
                </div>
                <span style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-sans)",
                }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{
          textAlign: "center",
          fontSize: "0.625rem",
          color: "var(--color-text-tertiary)",
          marginTop: "1.25rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: "var(--font-sans)",
        }}>
          Exclusively for Hamada Jaber
        </p>
      </div>
    </div>
  );
}
