import { getLoginUrl } from "@/const";
import { TrendingUp, Shield, Zap } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-chart-2/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="text-primary font-bold text-2xl">HJ</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">HJ Capital</h1>
          <p className="text-muted-foreground text-sm mt-1">Private Investment Platform</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-foreground mb-1">Welcome back, Hamada</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Sign in to access your personal trading dashboard.
          </p>

          <a
            href={getLoginUrl()}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors duration-150"
          >
            <Shield size={16} />
            Sign In Securely
          </a>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-4">Platform Features</p>
            <div className="space-y-3">
              {[
                { icon: TrendingUp, text: "AI-powered trading signals for 5 instruments" },
                { icon: Zap, text: "Real-time portfolio tracking & P&L monitoring" },
                { icon: Shield, text: "Advanced risk management & capital protection" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Icon size={14} className="text-primary shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          This platform is exclusively for Hamada Jaber
        </p>
      </div>
    </div>
  );
}
