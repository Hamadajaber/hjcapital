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
import Login from "./pages/Login";
import HJLayout from "./components/HJLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

function ProtectedRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Loading HJ Capital...</p>
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
                background: "oklch(0.990 0.005 75)",
                border: "1px solid oklch(0.880 0.018 70)",
                color: "oklch(0.220 0.018 60)",
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
