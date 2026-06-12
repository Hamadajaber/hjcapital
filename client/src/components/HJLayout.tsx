import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  History,
  Shield,
  BarChart3,
  LogOut,
  Menu,
  X,
  Zap,
  FlaskConical,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV_ITEMS = [
  { path: "/",            label: "Dashboard",    icon: LayoutDashboard },
  { path: "/signals",     label: "AI Signals",   icon: TrendingUp },
  { path: "/advisor",     label: "AI Advisor",   icon: MessageSquare },
  { path: "/history",     label: "Trade History",icon: History },
  { path: "/performance", label: "Performance",  icon: BarChart3 },
  { path: "/risk",        label: "Risk Settings",icon: Shield },
];

export default function HJLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => logout() });

  const portfolioQuery = trpc.portfolio.get.useQuery();
  const mode    = portfolioQuery.data?.mode    ?? "paper";
  const balance = portfolioQuery.data?.balance ?? "250.00";

  const setModeMutation = trpc.portfolio.setMode.useMutation({
    onSuccess: () => {
      portfolioQuery.refetch();
      toast.success(mode === "paper" ? "Switched to LIVE trading" : "Switched to Paper mode");
    },
  });

  const toggleMode = () => {
    const next = mode === "paper" ? "live" : "paper";
    if (next === "live") {
      if (!confirm("⚠️ Switch to LIVE trading? Real money will be used.")) return;
    }
    setModeMutation.mutate({ mode: next });
  };

  const balanceNum = parseFloat(balance);
  const formattedBalance = balanceNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg-base)" }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "oklch(0 0 0 / 0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col",
          "transition-transform duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{
          background: "var(--color-bg-surface)",
          borderRight: "1px solid var(--color-border-subtle)",
        }}
      >
        {/* Accent line at top */}
        <div className="accent-glow-line" />

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="hj-logo-mark animate-glow">
              <span style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: "0.8125rem", fontFamily: "var(--font-display)" }}>HJ</span>
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
                HJ Capital
              </p>
              <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Private Platform
              </p>
            </div>
          </div>
          <button
            className="lg:hidden transition-colors p-1 rounded-md"
            style={{ color: "var(--color-text-tertiary)" }}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Balance card */}
        <div className="px-4 pb-4">
          <div
            className="rounded-xl p-4"
            style={{
              background: "linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-overlay))",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.375rem" }}>
              Account Balance
            </p>
            <p
              className="tabular-nums"
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              ${formattedBalance}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
                style={{ background: mode === "paper" ? "var(--color-gold)" : "var(--color-loss)" }}
              />
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)" }}>
                {mode === "paper" ? "Simulation balance" : "Live balance"}
              </span>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="px-4 pb-4">
          <button
            onClick={toggleMode}
            disabled={setModeMutation.isPending}
            className={cn("w-full flex items-center justify-between px-3.5 py-2.5 transition-all duration-200", mode === "paper" ? "mode-paper" : "mode-live")}
            style={{ cursor: "pointer" }}
          >
            <div className="flex items-center gap-2">
              {mode === "paper"
                ? <FlaskConical size={13} style={{ color: "var(--color-gold)" }} />
                : <Zap size={13} style={{ color: "var(--color-loss)" }} />
              }
              <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em" }}>
                {mode === "paper" ? "PAPER TRADING" : "LIVE TRADING"}
              </span>
            </div>
            <div
              className={cn("w-2 h-2 rounded-full", mode === "live" && "animate-pulse")}
              style={{ background: mode === "paper" ? "var(--color-gold)" : "var(--color-loss)" }}
            />
          </button>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textAlign: "center", marginTop: "0.375rem" }}>
            {mode === "paper" ? "Safe simulation — no real funds" : "⚠️ Real funds active"}
          </p>
        </div>

        {/* Divider */}
        <div className="hj-divider mx-4 mb-3" />

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
          <p style={{ fontSize: "0.625rem", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.25rem 0.875rem 0.5rem" }}>
            Navigation
          </p>
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location === path;
            return (
              <Link
                key={path}
                href={path}
                className={cn("nav-item", isActive && "nav-active")}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={15} style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-tertiary)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                {isActive && <ChevronRight size={12} style={{ color: "var(--color-accent)", opacity: 0.6 }} />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div
          className="px-4 py-4"
          style={{ borderTop: "1px solid var(--color-border-subtle)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, var(--color-accent-dim), var(--color-bg-elevated))",
                  border: "1px solid var(--color-accent)",
                  boxShadow: "0 0 8px var(--color-accent-dim)",
                }}
              >
                <span style={{ color: "var(--color-accent)", fontSize: "0.8125rem", fontWeight: 700 }}>H</span>
              </div>
              <div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)" }}>Hamada</p>
                <p style={{ fontSize: "0.6875rem", color: "var(--color-gold)" }}>Owner · Admin</p>
              </div>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              title="Logout"
              className="p-2 rounded-lg transition-all duration-150"
              style={{ color: "var(--color-text-tertiary)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-primary)", e.currentTarget.style.background = "var(--color-bg-elevated)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-tertiary)", e.currentTarget.style.background = "transparent")}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3"
          style={{
            background: "var(--color-bg-surface)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="hj-logo-mark" style={{ width: "1.75rem", height: "1.75rem" }}>
              <span style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: "0.75rem" }}>HJ</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>HJ Capital</span>
          </div>
          <div className={cn("hj-badge", mode === "paper" ? "mode-paper" : "mode-live")} style={{ fontSize: "0.625rem" }}>
            {mode === "paper" ? "PAPER" : "LIVE"}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
