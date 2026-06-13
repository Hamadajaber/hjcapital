import { Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "var(--color-bg-base)" }}
    >
      <div className="text-center max-w-sm animate-fade-up">

        {/* 404 number — Heritage Ledger prestige */}
        <p
          style={{
            fontSize: "7rem",
            fontFamily: "var(--font-serif)",
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            color: "var(--color-border-default)",
            marginBottom: "0.5rem",
            userSelect: "none",
          }}
        >
          404
        </p>

        <h1
          style={{
            fontSize: "1.25rem",
            fontFamily: "var(--font-serif)",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.01em",
            marginBottom: "0.75rem",
          }}
        >
          Page Not Found
        </h1>

        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-tertiary)",
            lineHeight: 1.7,
            marginBottom: "2rem",
            fontFamily: "var(--font-sans)",
          }}
        >
          The page you are looking for doesn't exist or has been moved.
        </p>

        <button
          onClick={() => setLocation("/")}
          className="hj-btn hj-btn-primary inline-flex"
        >
          <Home size={14} />
          Return to Dashboard
        </button>

      </div>
    </div>
  );
}
