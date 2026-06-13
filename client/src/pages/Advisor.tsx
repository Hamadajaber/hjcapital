import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

const QUICK_PROMPTS = [
  "What's the best opportunity right now?",
  "How should I manage risk with $250?",
  "Analyze EURUSD for me",
  "Should I switch to live trading?",
  "What's your outlook on GOLD this week?",
];

export default function Advisor() {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<{ role: "user" | "assistant"; content: string; id: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const historyQuery = trpc.advisor.history.useQuery();
  const chatMutation = trpc.advisor.chat.useMutation({
    onSuccess: (data) => {
      setLocalMessages(prev => [...prev, { role: "assistant", content: data.reply, id: `a-${Date.now()}` }]);
    },
    onError: () => {
      setLocalMessages(prev => [...prev, { role: "assistant", content: "I apologize, I encountered an error. Please try again.", id: `e-${Date.now()}` }]);
    },
  });

  const historyMessages = (historyQuery.data ?? []).map(m => ({
    role: m.role as "user" | "assistant", content: m.content, id: `h-${m.id}`,
  }));
  const allMessages = localMessages.length > 0 ? localMessages : historyMessages;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [allMessages, chatMutation.isPending]);

  const sendMessage = (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    const userMsg = { role: "user" as const, content: text.trim(), id: `u-${Date.now()}` };
    setLocalMessages(prev => {
      const base = prev.length === 0 ? historyMessages : prev;
      return [...base, userMsg];
    });
    chatMutation.mutate({ message: text.trim() });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* Header */}
      <div
        className="px-6 py-4"
        style={{
          borderBottom: "1px solid var(--color-border-subtle)",
          background: "var(--color-bg-surface)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center animate-glow"
            style={{
              background: "linear-gradient(135deg, var(--color-accent-dim), var(--color-bg-elevated))",
              border: "1px solid var(--color-accent)",
            }}
          >
            <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-serif)", letterSpacing: "-0.01em" }}>
              HJ Capital AI Advisor
            </h1>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
              Your personal investment intelligence
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--color-profit)" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {allMessages.length === 0 && !chatMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 animate-glow"
              style={{
                background: "linear-gradient(135deg, var(--color-accent-dim), var(--color-bg-elevated))",
                border: "1px solid var(--color-accent)",
              }}
            >
              <Bot size={28} style={{ color: "var(--color-accent)" }} />
            </div>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
              Welcome, Hamada
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", maxWidth: "28rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              I'm your personal AI investment advisor. Ask me about market conditions, trading strategies, risk management, or specific instruments.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="hj-btn hj-btn-ghost"
                  style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem" }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {allMessages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{
                background: msg.role === "user" ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
                border: `1px solid ${msg.role === "user" ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
              }}
            >
              {msg.role === "user"
                ? <User size={12} style={{ color: "var(--color-accent)" }} />
                : <Bot size={12} style={{ color: "var(--color-text-tertiary)" }} />
              }
            </div>

            {/* Bubble */}
            <div
              className="max-w-[80%] px-4 py-3"
              style={{
                borderRadius: msg.role === "user"
                  ? "var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)"
                  : "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
                background: msg.role === "user" ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
                border: `1px solid ${msg.role === "user" ? "var(--color-accent-dim)" : "var(--color-border-subtle)"}`,
                fontSize: "0.875rem",
                color: "var(--color-text-primary)",
              }}
            >
              {msg.role === "assistant"
                ? <Streamdown className="prose prose-invert prose-sm max-w-none">{msg.content}</Streamdown>
                : <p>{msg.content}</p>
              }
            </div>
          </div>
        ))}

        {/* Loading */}
        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}>
              <Bot size={12} style={{ color: "var(--color-text-tertiary)" }} />
            </div>
            <div
              className="px-4 py-3 rounded-2xl"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>Analyzing market conditions...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts (when messages exist) */}
      {allMessages.length > 0 && (
        <div
          className="px-6 py-2 flex gap-2 overflow-x-auto"
          style={{ borderTop: "1px solid var(--color-border-subtle)" }}
        >
          {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={chatMutation.isPending}
              className="hj-btn hj-btn-ghost whitespace-nowrap shrink-0"
              style={{ fontSize: "0.6875rem", padding: "0.25rem 0.625rem" }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="px-6 py-4"
        style={{
          borderTop: "1px solid var(--color-border-subtle)",
          background: "var(--color-bg-surface)",
        }}
      >
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your AI advisor anything..."
            rows={1}
            disabled={chatMutation.isPending}
            className="hj-input resize-none"
            style={{ maxHeight: "120px", paddingTop: "0.625rem", paddingBottom: "0.625rem" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || chatMutation.isPending}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150"
            style={{
              background: input.trim() && !chatMutation.isPending ? "var(--color-accent)" : "var(--color-bg-elevated)",
              border: `1px solid ${input.trim() && !chatMutation.isPending ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
              cursor: input.trim() && !chatMutation.isPending ? "pointer" : "not-allowed",
              opacity: !input.trim() || chatMutation.isPending ? 0.5 : 1,
            }}
          >
            <Send size={14} style={{ color: input.trim() && !chatMutation.isPending ? "oklch(0.115 0.018 252)" : "var(--color-text-tertiary)" }} />
          </button>
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textAlign: "center", marginTop: "0.5rem" }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
