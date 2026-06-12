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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/signals", label: "AI Signals", icon: TrendingUp },
  { path: "/advisor", label: "AI Advisor", icon: MessageSquare },
  { path: "/history", label: "Trade History", icon: History },
  { path: "/performance", label: "Performance", icon: BarChart3 },
  { path: "/risk", label: "Risk Settings", icon: Shield },
];

export default function HJLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => logout(),
  });

  const portfolioQuery = trpc.portfolio.get.useQuery();
  const mode = portfolioQuery.data?.mode ?? "paper";
  const balance = portfolioQuery.data?.balance ?? "250.00";

  const setModeMutation = trpc.portfolio.setMode.useMutation({
    onSuccess: () => {
      portfolioQuery.refetch();
      toast.success(mode === "paper" ? "Switched to LIVE trading mode" : "Switched to Paper trading mode");
    },
  });

  const toggleMode = () => {
    const newMode = mode === "paper" ? "live" : "paper";
    if (newMode === "live") {
      if (!confirm("⚠️ You are about to switch to LIVE trading mode. Real money will be used. Are you sure?")) return;
    }
    setModeMutation.mutate({ mode: newMode });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col",
          "bg-card border-r border-border transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">HJ</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">HJ Capital</p>
              <p className="text-xs text-muted-foreground">Private Platform</p>
            </div>
          </div>
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Balance display */}
        <div className="px-4 py-4 border-b border-border">
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Account Balance</p>
            <p className="text-xl font-bold font-mono tabular-nums text-foreground">
              ${parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="px-4 py-3 border-b border-border">
          <button
            onClick={toggleMode}
            disabled={setModeMutation.isPending}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
              mode === "paper" ? "mode-paper" : "mode-live"
            )}
          >
            <div className="flex items-center gap-2">
              {mode === "paper" ? <FlaskConical size={14} /> : <Zap size={14} />}
              <span>{mode === "paper" ? "PAPER TRADING" : "LIVE TRADING"}</span>
            </div>
            <div className={cn(
              "w-2 h-2 rounded-full",
              mode === "paper" ? "bg-yellow-400" : "bg-red-500 animate-pulse"
            )} />
          </button>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            {mode === "paper" ? "Safe simulation mode" : "⚠️ Real money active"}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location === path;
            return (
              <Link
                key={path}
                href={path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "nav-active"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={16} className={isActive ? "text-primary" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-primary text-xs font-bold">H</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Hamada</p>
                <p className="text-xs text-muted-foreground">Owner</p>
              </div>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-bold text-xs">HJ</span>
            </div>
            <span className="font-semibold text-sm">HJ Capital</span>
          </div>
          <div className={cn(
            "px-2 py-0.5 rounded text-xs font-bold",
            mode === "paper" ? "mode-paper" : "mode-live"
          )}>
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
