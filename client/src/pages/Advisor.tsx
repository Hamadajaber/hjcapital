import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";

const QUICK_PROMPTS = [
  "What's the best trade opportunity right now?",
  "How should I manage risk with $250?",
  "Analyze EURUSD for me",
  "Should I switch to live trading?",
  "What's your outlook on GOLD this week?",
];

export default function Advisor() {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<{ role: "user" | "assistant"; content: string; id: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const historyQuery = trpc.advisor.history.useQuery();
  const chatMutation = trpc.advisor.chat.useMutation({
    onSuccess: (data) => {
      setLocalMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, id: `a-${Date.now()}` }
      ]);
    },
    onError: () => {
      setLocalMessages(prev => [
        ...prev,
        { role: "assistant", content: "I apologize, I encountered an error. Please try again.", id: `e-${Date.now()}` }
      ]);
    },
  });

  // Combine history + local messages
  const historyMessages = (historyQuery.data ?? []).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    id: `h-${m.id}`,
  }));

  const allMessages = localMessages.length > 0 ? localMessages : historyMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages, chatMutation.isPending]);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">HJ Capital AI Advisor</h1>
            <p className="text-xs text-muted-foreground">Your personal investment intelligence</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
            <span className="text-xs text-muted-foreground">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {allMessages.length === 0 && !chatMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Bot size={28} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Welcome, Hamada</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              I'm your personal AI investment advisor. Ask me about market conditions, trading strategies, risk management, or specific instruments.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 transition-all duration-150"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar */}
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
              msg.role === "user"
                ? "bg-primary/20 border border-primary/30"
                : "bg-secondary/60 border border-border"
            )}>
              {msg.role === "user"
                ? <User size={13} className="text-primary" />
                : <Bot size={13} className="text-muted-foreground" />
              }
            </div>

            {/* Bubble */}
            <div className={cn(
              "max-w-[80%] rounded-xl px-4 py-3 text-sm",
              msg.role === "user"
                ? "bg-primary/15 border border-primary/20 text-foreground"
                : "bg-card border border-border text-foreground"
            )}>
              {msg.role === "assistant"
                ? <Streamdown className="prose prose-invert prose-sm max-w-none text-foreground [&_p]:text-foreground [&_li]:text-foreground [&_strong]:text-foreground">{msg.content}</Streamdown>
                : <p>{msg.content}</p>
              }
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-secondary/60 border border-border flex items-center justify-center shrink-0">
              <Bot size={13} className="text-muted-foreground" />
            </div>
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Analyzing market conditions...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick prompts (when there are messages) */}
      {allMessages.length > 0 && (
        <div className="px-6 py-2 flex gap-2 overflow-x-auto border-t border-border/50">
          {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={chatMutation.isPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 hover:border-primary/30 transition-all duration-150 whitespace-nowrap shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-border bg-card/30">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your AI advisor anything..."
            rows={1}
            disabled={chatMutation.isPending}
            className="flex-1 resize-none bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-60"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || chatMutation.isPending}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={15} className="text-primary-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
