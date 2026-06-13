import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Signals from "./pages/Signals";
import Advisor from "./pages/Advisor";
import TradeHistory from "./pages/TradeHistory";
import RiskSettings from "./pages/RiskSettings";
import Performance from "./pages/Performance";
import AutoTrade from "./pages/AutoTrade";
import Login from "./pages/Login";
import HJLayout from "./components/HJLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

function ProtectedRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg-base)" }}>
        <div className="flex flex-col items-center gap-5">
          <img
            src="/manus-storage/hj-logo-shield_56c87b67.png"
            alt="HJ Capital"
            style={{ width: 56, height: 56, objectFit: "contain", opacity: 0.85 }}
          />
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Loading HJ Capital...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <HJLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/signals" component={Signals} />
        <Route path="/advisor" component={Advisor} />
        <Route path="/history" component={TradeHistory} />
        <Route path="/risk" component={RiskSettings} />
        <Route path="/performance" component={Performance} />
        <Route path="/auto-trade" component={AutoTrade} />
        <Route component={NotFound} />
      </Switch>
    </HJLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster
            theme="light"
            toastOptions={{
              style: {
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.8125rem",
                boxShadow: "0 8px 32px oklch(0.180 0.020 145 / 0.10)",
              },
            }}
          />
          <ProtectedRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
