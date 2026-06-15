/**
 * Sentiment Analysis Engine for HJ Capital
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches financial news from RSS feeds and scores sentiment for each instrument.
 */

export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
}

export interface SentimentResult {
  score: number; // -1.0 (very bearish) to +1.0 (very bullish)
  label: "bullish" | "bearish" | "neutral";
  newsCount: number;
  headlines: string[];
  summary: string;
}

// ─── Instrument keyword mapping ───────────────────────────────────────────────

const INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  EURUSD: ["EUR", "euro", "ECB", "European Central Bank", "eurozone", "EU economy"],
  GBPUSD: ["GBP", "pound", "sterling", "Bank of England", "BOE", "UK economy", "Brexit"],
  GOLD: ["gold", "XAU", "safe haven", "precious metals", "inflation hedge", "Fed rate"],
  SILVER: ["silver", "XAG", "precious metals"],
  US500: ["S&P 500", "S&P500", "SPX", "US stocks", "Wall Street", "equity market"],
  US100: ["Nasdaq", "tech stocks", "FAANG", "US100"],
  US30: ["Dow Jones", "DJIA", "US30", "blue chip"],
  BTC: ["Bitcoin", "BTC", "crypto", "cryptocurrency", "digital asset"],
  USDJPY: ["JPY", "yen", "Bank of Japan", "BOJ", "Japanese economy"],
  USDCHF: ["CHF", "franc", "Swiss", "SNB"],
  USDCAD: ["CAD", "Canadian dollar", "oil price", "Bank of Canada"],
  AUDUSD: ["AUD", "Australian dollar", "RBA", "Reserve Bank of Australia"],
};

// ─── RSS Feed sources ─────────────────────────────────────────────────────────

const RSS_FEEDS = [
  "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
  "https://feeds.reuters.com/reuters/businessNews",
  "https://www.forexfactory.com/ff_calendar.php?week=this",
  "https://rss.app/feeds/v1.1/tVPGFKfvEJGJGJGJ.json", // fallback
];

// ─── Positive/Negative word lists ─────────────────────────────────────────────

const POSITIVE_WORDS = [
  "surge", "rally", "gain", "rise", "jump", "soar", "boost", "strong", "bullish",
  "recovery", "growth", "profit", "beat", "exceed", "optimism", "positive",
  "upgrade", "outperform", "record", "high", "increase", "improve", "support",
  "hawkish", "rate hike", "tightening", // for USD
];

const NEGATIVE_WORDS = [
  "drop", "fall", "decline", "crash", "plunge", "slump", "weak", "bearish",
  "recession", "loss", "miss", "disappoint", "pessimism", "negative",
  "downgrade", "underperform", "low", "decrease", "worsen", "concern",
  "dovish", "rate cut", "easing", // for USD
];

// ─── Fetch news from a single RSS feed ───────────────────────────────────────

async function fetchRSSFeed(url: string, timeoutMs = 5000): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "HJCapital/1.0 (financial news aggregator)" },
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const text = await res.text();
    const items: NewsItem[] = [];

    // Parse RSS XML using exec() loop (compatible with all TS targets)
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(text)) !== null) {
      const content = itemMatch[1];
      const title = content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? content.match(/<title>(.*?)<\/title>/)?.[1]
        ?? "";
      const description = content.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? content.match(/<description>(.*?)<\/description>/)?.[1]
        ?? "";
      const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const source = new URL(url).hostname;

      if (title) {
        items.push({
          title: title.replace(/<[^>]+>/g, "").trim(),
          summary: description.replace(/<[^>]+>/g, "").trim().slice(0, 200),
          source,
          publishedAt: pubDate,
        });
      }
    }

    return items.slice(0, 20); // max 20 items per feed
  } catch {
    return [];
  }
}

// ─── Score a single text snippet ─────────────────────────────────────────────

function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word.toLowerCase())) score += 1;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word.toLowerCase())) score -= 1;
  }

  return score;
}

// ─── Main: get sentiment for an instrument ────────────────────────────────────

export async function getInstrumentSentiment(instrument: string): Promise<SentimentResult> {
  const keywords = INSTRUMENT_KEYWORDS[instrument] ?? [instrument];

  // Fetch from multiple feeds in parallel
  const allItems: NewsItem[] = [];
  const feedPromises = RSS_FEEDS.slice(0, 2).map((url) => fetchRSSFeed(url));
  const results = await Promise.allSettled(feedPromises);

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  // Filter items relevant to this instrument
  const relevant = allItems.filter((item) => {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  });

  if (relevant.length === 0) {
    return {
      score: 0,
      label: "neutral",
      newsCount: 0,
      headlines: [],
      summary: "No relevant news found for this instrument.",
    };
  }

  // Score each relevant item
  let totalScore = 0;
  const headlines: string[] = [];

  for (const item of relevant.slice(0, 10)) {
    const s = scoreText(`${item.title} ${item.summary}`);
    totalScore += s;
    headlines.push(item.title);
  }

  const normalizedScore = Math.max(-1, Math.min(1, totalScore / (relevant.length * 3)));

  const label: SentimentResult["label"] =
    normalizedScore > 0.15 ? "bullish" : normalizedScore < -0.15 ? "bearish" : "neutral";

  const summary =
    label === "bullish"
      ? `News sentiment is positive for ${instrument}. ${relevant.length} relevant articles found.`
      : label === "bearish"
      ? `News sentiment is negative for ${instrument}. ${relevant.length} relevant articles found.`
      : `News sentiment is mixed/neutral for ${instrument}. ${relevant.length} relevant articles found.`;

  return {
    score: Math.round(normalizedScore * 100) / 100,
    label,
    newsCount: relevant.length,
    headlines: headlines.slice(0, 5),
    summary,
  };
}

// ─── Format for AI Prompt ─────────────────────────────────────────────────────

export function formatSentimentForPrompt(instrument: string, sentiment: SentimentResult): string {
  const headlineStr =
    sentiment.headlines.length > 0
      ? sentiment.headlines.slice(0, 3).map((h) => `  • ${h}`).join("\n")
      : "  • No recent headlines";

  return `${instrument} News Sentiment: ${sentiment.label.toUpperCase()} (score: ${sentiment.score})
${headlineStr}`;
}
