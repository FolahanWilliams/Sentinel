# Sentinel — Keystone Analytics Intelligence Feed

## Prompt Document for Cursor / Windsurf

> **What this is:** A complete specification for building Sentinel, Keystone Analytics' real-time news intelligence engine. It fetches 40+ RSS feeds, deduplicates articles, and sends them to Gemini 2.0 Flash in a single batched API call for summarization, classification, sentiment analysis, and trading signal extraction.
>
> **Estimated cost:** ~£0.15–0.25/day at 15-minute refresh intervals (~£5–7/month)
>
> **Stack:** React + TypeScript + Vite + Tailwind CSS + Supabase (Edge Functions + Postgres)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React)                  │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Briefing │ │ Category │ │Sentiment │ │Trading │ │
│  │  Panel   │ │  Filter  │ │  Badges  │ │Signals │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       └─────────────┴────────────┴───────────┘      │
│                         │                            │
│              Polls /api/sentinel every 60s            │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────┐
│              SUPABASE EDGE FUNCTION                  │
│              POST /api/sentinel                      │
│                                                      │
│  1. Fetch all RSS feeds (parallel, 5s timeout each)  │
│  2. Parse XML → normalized articles                  │
│  3. Deduplicate by URL + title similarity            │
│  4. Check Supabase: skip already-processed articles  │
│  5. Batch NEW articles → single Gemini API call      │
│  6. Store processed results in Supabase              │
│  7. Return latest 50 processed articles as JSON      │
└─────────────────────────────────────────────────────┘
```

---

## 2. RSS Feed List

All feeds are fetched server-side (Edge Function). No CORS issues.

### Tier 1 — Core Feeds (15 feeds, direct RSS)

```typescript
export const TIER_1_FEEDS: Feed[] = [
  // Markets & Finance
  { name: 'CNBC Tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', category: 'markets' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/rss/topstories', category: 'markets' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', category: 'markets' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'macro' },
  { name: 'SEC Releases', url: 'https://www.sec.gov/news/pressreleases.rss', category: 'regulation' },

  // Tech & AI
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
  { name: 'TechMeme', url: 'https://www.techmeme.com/feed.xml', category: 'tech' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'ai' },
  { name: 'ArXiv AI', url: 'https://export.arxiv.org/rss/cs.AI', category: 'ai' },

  // Startups & VC
  { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', category: 'startups' },
  { name: 'TechCrunch Venture', url: 'https://techcrunch.com/category/venture/feed/', category: 'startups' },

  // Crypto
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto' },

  // Security
  { name: 'Krebs Security', url: 'https://krebsonsecurity.com/feed/', category: 'security' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'security' },
];
```

### Tier 2 — High Value (15 feeds, direct RSS)

```typescript
export const TIER_2_FEEDS: Feed[] = [
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'tech' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'tech' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'tech' },
  { name: 'Fast Company', url: 'https://feeds.feedburner.com/fastcompany/headlines', category: 'tech' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', category: 'startups' },
  { name: 'a16z Blog', url: 'https://a16z.com/feed/', category: 'vc' },
  { name: 'Y Combinator', url: 'https://www.ycombinator.com/blog/rss/', category: 'vc' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', category: 'tech' },
  { name: 'SemiAnalysis', url: 'https://www.semianalysis.com/feed', category: 'hardware' },
  { name: 'InfoQ', url: 'https://feed.infoq.com/', category: 'dev' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto' },
  { name: 'Politico Tech', url: 'https://rss.politico.com/technology.xml', category: 'policy' },
  { name: 'CB Insights', url: 'https://www.cbinsights.com/research/feed/', category: 'startups' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'security' },
];
```

### Tier 3 — Google News Queries (12 feeds)

```typescript
const gnews = (query: string) =>
  `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

export const TIER_3_FEEDS: Feed[] = [
  { name: 'AI News', url: gnews('(OpenAI+OR+Anthropic+OR+Google+AI+OR+"large+language+model")+when:2d'), category: 'ai' },
  { name: 'Bloomberg Markets', url: gnews('site:bloomberg.com+markets+when:1d'), category: 'markets' },
  { name: 'Reuters Markets', url: gnews('site:reuters.com+markets+stocks+when:1d'), category: 'markets' },
  { name: 'Semiconductor', url: gnews('semiconductor+OR+chip+OR+TSMC+OR+NVIDIA+when:3d'), category: 'hardware' },
  { name: 'Tech Layoffs', url: gnews('tech+layoffs+when:7d'), category: 'labor' },
  { name: 'Unicorns', url: gnews('("unicorn+startup"+OR+"unicorn+valuation")+when:7d'), category: 'startups' },
  { name: 'Crypto Market', url: gnews('(bitcoin+OR+ethereum+OR+crypto+OR+"digital+asset")+when:1d'), category: 'crypto' },
  { name: 'Fed & Rates', url: gnews('("interest+rate"+OR+"rate+decision"+OR+"monetary+policy")+when:2d'), category: 'macro' },
  { name: 'IPO News', url: gnews('(IPO+OR+"initial+public+offering"+OR+SPAC)+when:3d'), category: 'markets' },
  { name: 'Cyber Incidents', url: gnews('cyber+attack+OR+data+breach+OR+ransomware+when:3d'), category: 'security' },
  { name: 'AI Regulation', url: gnews('AI+regulation+OR+"artificial+intelligence"+law+when:7d'), category: 'policy' },
  { name: 'M&A Deals', url: gnews('("merger"+OR+"acquisition"+OR+"takeover+bid")+tech+when:3d'), category: 'markets' },
];
```

### Combined: `ALL_FEEDS`

```typescript
export const ALL_FEEDS: Feed[] = [
  ...TIER_1_FEEDS,
  ...TIER_2_FEEDS,
  ...TIER_3_FEEDS,
];
// Total: 42 feeds
```

---

## 3. Types

```typescript
// Feed definition
interface Feed {
  name: string;
  url: string;
  category: FeedCategory;
}

type FeedCategory =
  | 'markets' | 'macro' | 'regulation' | 'tech' | 'ai'
  | 'startups' | 'vc' | 'crypto' | 'security' | 'hardware'
  | 'dev' | 'policy' | 'labor';

// Raw parsed article from RSS
interface RawArticle {
  title: string;
  link: string;
  pubDate: string;           // ISO string
  source: string;            // feed name
  feedCategory: FeedCategory;
  snippet?: string;          // description/summary from RSS, truncated to 200 chars
}

// After Gemini processing
interface ProcessedArticle {
  id: string;                // uuid
  title: string;
  link: string;
  pubDate: string;
  source: string;

  // Gemini-generated fields
  summary: string;           // 1-2 sentence briefing
  category: ArticleCategory; // AI-assigned (may differ from feed category)
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number;    // -1.0 to +1.0
  impact: 'high' | 'medium' | 'low';
  signals: TradingSignal[];  // extracted market signals (can be empty array)
  entities: string[];        // mentioned tickers, companies, people
  
  processedAt: string;       // ISO timestamp
}

type ArticleCategory =
  | 'ai_ml'
  | 'crypto_web3'
  | 'macro_economy'
  | 'tech_earnings'
  | 'startups_vc'
  | 'cybersecurity'
  | 'regulation_policy'
  | 'semiconductors'
  | 'markets_trading'
  | 'geopolitics'
  | 'other';

interface TradingSignal {
  type: 'earnings' | 'funding' | 'ipo' | 'merger' | 'policy_change'
      | 'product_launch' | 'hack_breach' | 'layoffs' | 'rate_decision'
      | 'partnership' | 'legal_action' | 'supply_chain';
  ticker?: string;           // e.g. "NVDA", "BTC"
  direction?: 'up' | 'down' | 'volatile'; // expected market impact
  confidence: number;        // 0.0 - 1.0
  note: string;              // 1-line explanation
}

// Sentinel API response
interface SentinelResponse {
  articles: ProcessedArticle[];
  briefing: DailyBriefing;
  meta: {
    feedsFetched: number;
    feedsFailed: string[];    // names of feeds that timed out
    articlesRaw: number;
    articlesDeduplicated: number;
    articlesNew: number;      // sent to Gemini
    articlesCached: number;   // from Supabase
    geminiTokensUsed: number;
    processingTimeMs: number;
    costEstimateUsd: number;
  };
}

interface DailyBriefing {
  topStories: string[];       // top 5 one-liners
  marketMood: 'risk-on' | 'risk-off' | 'mixed';
  trendingTopics: string[];   // top 5 themes across all articles
  signalCount: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  generatedAt: string;
}
```

---

## 4. Supabase Database Schema

```sql
-- Run as a Supabase migration

-- Processed articles cache
CREATE TABLE sentinel_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  pub_date TIMESTAMPTZ NOT NULL,
  
  -- Gemini output
  summary TEXT,
  category TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  sentiment_score REAL NOT NULL DEFAULT 0,
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  signals JSONB DEFAULT '[]'::jsonb,
  entities TEXT[] DEFAULT '{}',
  
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_sentinel_pub_date ON sentinel_articles(pub_date DESC);
CREATE INDEX idx_sentinel_category ON sentinel_articles(category);
CREATE INDEX idx_sentinel_sentiment ON sentinel_articles(sentiment);
CREATE INDEX idx_sentinel_impact ON sentinel_articles(impact);
CREATE INDEX idx_sentinel_link ON sentinel_articles(link);

-- Daily briefings cache
CREATE TABLE sentinel_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  top_stories TEXT[] NOT NULL,
  market_mood TEXT NOT NULL,
  trending_topics TEXT[] NOT NULL,
  signal_count JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(briefing_date)
);

-- Auto-cleanup: delete articles older than 7 days
-- (Run via Supabase cron or pg_cron)
-- DELETE FROM sentinel_articles WHERE pub_date < NOW() - INTERVAL '7 days';

-- Enable RLS
ALTER TABLE sentinel_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_briefings ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed for reading news)
CREATE POLICY "Public read sentinel_articles"
  ON sentinel_articles FOR SELECT
  USING (true);

CREATE POLICY "Public read sentinel_briefings"
  ON sentinel_briefings FOR SELECT
  USING (true);
```

---

## 5. Edge Function: `/api/sentinel`

This is the core backend. One function does everything.

### Implementation Requirements

```
File: supabase/functions/sentinel/index.ts
Runtime: Deno (Supabase Edge Functions)
Dependencies: rss-parser (npm:rss-parser), @supabase/supabase-js
Env vars: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

### Pseudocode / Logic Flow

```typescript
// ============================================================
// STEP 1: Fetch all RSS feeds in parallel
// ============================================================
// - Use Promise.allSettled() so one dead feed doesn't kill everything
// - 5-second timeout per feed
// - Parse XML into RawArticle[]
// - Log which feeds failed for meta response

// ============================================================
// STEP 2: Normalize & Deduplicate
// ============================================================
// - Normalize all URLs (strip tracking params, trailing slashes)
// - Deduplicate by normalized URL
// - Secondary dedup: if two titles are >85% similar (Jaccard on words),
//   keep the one from the higher-tier feed
// - Sort by pubDate descending
// - Keep only articles from last 48 hours

// ============================================================
// STEP 3: Check Supabase for already-processed articles
// ============================================================
// - Query: SELECT link FROM sentinel_articles WHERE link = ANY($links)
// - Split into: newArticles[] and cachedArticles[]
// - If newArticles is empty, skip Gemini call entirely (return cached)

// ============================================================
// STEP 4: Batch Gemini API call
// ============================================================
// - Send ALL new articles in ONE request (not one per article)
// - Use Gemini 2.0 Flash (model: "gemini-2.0-flash")
// - Structured JSON output mode
// - See Section 6 for the exact prompt
// - Parse response, validate against expected schema

// ============================================================
// STEP 5: Store in Supabase
// ============================================================
// - INSERT new processed articles (ON CONFLICT DO NOTHING on link)
// - UPSERT daily briefing

// ============================================================
// STEP 6: Return response
// ============================================================
// - Combine new + cached articles
// - Sort by pubDate desc
// - Return top 50 + briefing + meta stats
```

### Key Implementation Details

**RSS Parsing:**
```typescript
// Use npm:rss-parser in Deno
import Parser from 'npm:rss-parser';

const parser = new Parser({
  timeout: 5000,
  headers: {
    'User-Agent': 'KeystoneAnalytics/1.0 (RSS Reader)',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

// Fetch with timeout wrapper
async function fetchFeed(feed: Feed): Promise<RawArticle[]> {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items || []).slice(0, 15).map(item => ({
      title: item.title?.trim() || '',
      link: normalizeUrl(item.link || ''),
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      source: feed.name,
      feedCategory: feed.category,
      snippet: (item.contentSnippet || item.content || '').slice(0, 200),
    }));
  } catch {
    return []; // feed failed, log it, move on
  }
}
```

**URL Normalization:**
```typescript
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
     'utm_term', 'ref', 'source', 'ncid', 'sr_share'].forEach(p =>
      u.searchParams.delete(p)
    );
    // Remove trailing slash
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return url;
  }
}
```

**Title Similarity (Jaccard):**
```typescript
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
  const wordsB = new Set(b.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
```

**Google News Feed Special Handling:**
```typescript
// Google News RSS wraps the real URL in a redirect. Extract it:
function extractGoogleNewsUrl(link: string): string {
  try {
    const url = new URL(link);
    // Google News links look like:
    // https://news.google.com/rss/articles/CBMi...
    // The actual URL is in the <link> or we keep the Google redirect
    return link; // In practice, keep as-is — Google redirects work fine
  } catch {
    return link;
  }
}
```

**Gemini API Call:**
```typescript
async function callGemini(articles: RawArticle[]): Promise<GeminiResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: buildPrompt(articles),  // See Section 6
          }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,  // Low temp = more consistent structured output
        },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}
```

---

## 6. Gemini Prompt (The Key Part)

This is the exact prompt sent to Gemini. It processes ALL articles in one batch.

```typescript
function buildPrompt(articles: RawArticle[]): string {
  const articleList = articles.map((a, i) =>
    `[${i}] "${a.title}" — ${a.source} (${a.feedCategory}) ${a.snippet ? `| ${a.snippet}` : ''}`
  ).join('\n');

  return `You are Sentinel, a financial intelligence analyst for a trading platform called Keystone Analytics. Your job is to process a batch of news articles and extract structured intelligence.

ARTICLES TO PROCESS:
${articleList}

For EACH article, return a JSON object with these fields:
- index: the article number [0], [1], etc.
- summary: 1-2 sentence briefing of why this matters to traders/investors. Be specific and actionable, not generic.
- category: one of: ai_ml, crypto_web3, macro_economy, tech_earnings, startups_vc, cybersecurity, regulation_policy, semiconductors, markets_trading, geopolitics, other
- sentiment: "bullish", "bearish", or "neutral" — from a MARKET perspective, not general positivity
- sentimentScore: float from -1.0 (extremely bearish) to +1.0 (extremely bullish). 0 = neutral.
- impact: "high" (market-moving, breaking), "medium" (noteworthy, sector-relevant), "low" (background, informational)
- signals: array of trading signals. Each signal has:
  - type: one of: earnings, funding, ipo, merger, policy_change, product_launch, hack_breach, layoffs, rate_decision, partnership, legal_action, supply_chain
  - ticker: stock/crypto ticker if identifiable (e.g. "NVDA", "BTC", "AAPL"). null if none.
  - direction: "up", "down", or "volatile" — expected market impact
  - confidence: 0.0 to 1.0
  - note: 1-line explanation
  If no trading signal, use empty array [].
- entities: array of mentioned tickers, company names, or key people. e.g. ["NVDA", "Jensen Huang", "TSMC"]

Also return a "briefing" object:
- topStories: array of 5 strings — the most important headlines rephrased as sharp one-liners
- marketMood: "risk-on", "risk-off", or "mixed" — overall mood across all articles
- trendingTopics: array of 5 strings — most common themes (e.g. "AI regulation", "Fed rate hold", "NVIDIA earnings")
- signalCount: { bullish: number, bearish: number, neutral: number }

IMPORTANT RULES:
- Be concise. Summaries should be 1-2 sentences max.
- Sentiment is about MARKET IMPACT, not whether the news is "good" or "bad" generally. A company getting hacked is bearish for that stock even if the article tone is neutral.
- Only flag "high" impact for genuinely market-moving events (earnings beats/misses, major policy changes, security breaches at large companies, rate decisions, major M&A).
- For ArXiv papers: category = ai_ml, impact = low unless it's from a major lab (OpenAI, Google, Anthropic, Meta) announcing a capability breakthrough.
- Don't hallucinate tickers. If you're not sure of the ticker, omit it.
- If an article is too vague to analyze meaningfully, set impact = "low" and signals = [].

Return valid JSON in this exact structure:
{
  "articles": [ { index, summary, category, sentiment, sentimentScore, impact, signals, entities }, ... ],
  "briefing": { topStories, marketMood, trendingTopics, signalCount }
}`;
}
```

---

## 7. Frontend Components

### 7.1 SentinelPanel (Main Container)

```
Location: src/components/sentinel/SentinelPanel.tsx
```

The main Sentinel panel that lives in Keystone's dashboard. Contains:

- **Briefing Bar** — top of panel, shows daily briefing (market mood badge, top 5 stories, trending topics)
- **Filter Bar** — category pills, sentiment filter, impact filter, search
- **Article Feed** — scrollable list of ProcessedArticle cards
- **Signal Sidebar** — condensed view of all extracted trading signals

**Behavior:**
- Polls `/api/sentinel` every 60 seconds
- Caches response in React state
- Shows loading skeleton on first load
- Shows stale data + "Refreshing..." indicator on subsequent loads
- Filter/search is client-side (no additional API calls)

### 7.2 BriefingBar

```
Location: src/components/sentinel/BriefingBar.tsx
```

Sticky bar at top of Sentinel panel.

- Left: **Market Mood** badge — colored pill (green = risk-on, red = risk-off, yellow = mixed)
- Center: **Top Stories** — auto-rotating carousel of 5 headlines, or static list
- Right: **Signal Counter** — "🟢 12 bullish · 🔴 5 bearish · ⚪ 8 neutral"
- Expandable: click to show trending topics

### 7.3 ArticleCard

```
Location: src/components/sentinel/ArticleCard.tsx
```

Each article in the feed renders as a card:

```
┌─────────────────────────────────────────────────┐
│ 🟢 BULLISH  │ AI/ML  │ ★ HIGH IMPACT           │
│                                                  │
│ NVIDIA beats Q4 estimates, raises AI guidance    │
│ TechCrunch · 2 hours ago                         │
│                                                  │
│ Revenue up 22% YoY driven by data center demand. │
│ Management raised full-year AI revenue guidance   │
│ by $2B, signaling sustained enterprise adoption.  │
│                                                  │
│ 📊 Signals:                                      │
│   NVDA ↑ earnings beat (confidence: 0.95)        │
│   AMD ↑ sector tailwind (confidence: 0.6)        │
│                                                  │
│ Entities: NVDA, Jensen Huang, AMD, TSMC          │
│                                          [Open →]│
└─────────────────────────────────────────────────┘
```

**Design specs:**
- Sentiment badge: green pill (bullish), red pill (bearish), gray pill (neutral)
- Category badge: colored by category (use consistent color map)
- Impact: ★ HIGH (red/bold), ★ MEDIUM (orange), ★ LOW (gray, de-emphasized)
- Signals section only shown if signals array is non-empty
- "Open →" links to article URL in new tab
- Cards with "high" impact get a subtle left-border accent (e.g., 3px gold border)

### 7.4 FilterBar

```
Location: src/components/sentinel/FilterBar.tsx
```

- **Category pills:** horizontal scrollable row of toggleable pills for each ArticleCategory. Multiple can be active. All active = no filter.
- **Sentiment toggle:** three buttons — 🟢 Bullish | 🔴 Bearish | ⚪ All
- **Impact filter:** "High only" toggle
- **Search:** text input that filters by title, summary, entities
- **Sort:** "Newest first" (default) | "Highest impact first"

### 7.5 SignalsSidebar

```
Location: src/components/sentinel/SignalsSidebar.tsx
```

Collapsible right sidebar (or bottom drawer on mobile) that aggregates ALL trading signals across all visible articles.

```
┌──────────────────────────┐
│ 📊 TRADING SIGNALS       │
│                          │
│ NVDA ↑↑  (3 signals)    │
│  • Earnings beat +22%    │
│  • Raised AI guidance    │
│  • Sector momentum       │
│                          │
│ BTC ↑   (2 signals)     │
│  • ETF inflow $340M      │
│  • Institutional buying   │
│                          │
│ AAPL ↓  (1 signal)      │
│  • EU antitrust ruling    │
│                          │
│ MACRO ↕ (1 signal)      │
│  • Fed holds rates        │
│                          │
└──────────────────────────┘
```

- Groups signals by ticker/entity
- Shows aggregated direction (multiple ↑ signals = ↑↑)
- Sorted by number of signals (most-mentioned first)
- Clicking a ticker scrolls to related articles in the feed

---

## 8. API Response Caching & Refresh Strategy

### Edge Function Caching

```typescript
// In the Edge Function response headers:
return new Response(JSON.stringify(result), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    // Browser: fresh for 60s, CDN: fresh for 5 min
  },
});
```

### Client-Side Polling

```typescript
// In React, use a simple polling hook:
function useSentinel(intervalMs = 60_000) {
  const [data, setData] = useState<SentinelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    
    const fetchSentinel = async () => {
      try {
        const res = await fetch('/api/sentinel');
        const json = await res.json();
        if (active) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        console.error('Sentinel fetch failed:', err);
      }
    };

    fetchSentinel(); // initial
    const timer = setInterval(fetchSentinel, intervalMs);
    
    return () => { active = false; clearInterval(timer); };
  }, [intervalMs]);

  return { data, loading };
}
```

### Gemini Call Optimization (Cost Control)

The biggest cost saver: **only call Gemini for genuinely NEW articles.**

```
Refresh cycle breakdown:
  42 feeds → ~400 raw items (most feeds return 10-20 items)
  After dedup → ~200 unique articles
  After checking Supabase cache → ~20-50 NEW articles per cycle
  
  Only those 20-50 new articles go to Gemini.
  
  At 15-min intervals, 96 cycles/day:
  - Many cycles will have 0-10 new articles (same news persists)
  - Average ~20 new articles per cycle
  - ~20 articles × ~250 tokens each = ~5K input tokens per call
  - ~20 articles × ~150 tokens output each = ~3K output tokens per call
  - Daily: ~480K input + ~290K output tokens
  - Cost: ~$0.05 input + ~$0.12 output = ~$0.17/day ≈ £0.14/day
```

---

## 9. Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Only in Edge Function, never in frontend

# Gemini
GEMINI_API_KEY=AIza...  # Only in Edge Function

# Optional
SENTINEL_REFRESH_INTERVAL=60000  # Client poll interval in ms
SENTINEL_MAX_ARTICLES=50         # Max articles returned per response
```

---

## 10. File Structure

```
src/
├── components/
│   └── sentinel/
│       ├── SentinelPanel.tsx       # Main container
│       ├── BriefingBar.tsx         # Top briefing bar
│       ├── ArticleCard.tsx         # Individual article card
│       ├── FilterBar.tsx           # Category/sentiment/impact filters
│       ├── SignalsSidebar.tsx       # Aggregated trading signals
│       └── SentinelSkeleton.tsx    # Loading state
├── hooks/
│   └── useSentinel.ts              # Polling hook
├── config/
│   └── sentinel-feeds.ts           # Feed definitions (TIER_1, TIER_2, TIER_3)
├── types/
│   └── sentinel.ts                 # All Sentinel types
└── utils/
    └── sentinel-helpers.ts         # Category colors, formatters, etc.

supabase/
├── functions/
│   └── sentinel/
│       └── index.ts                # Edge Function (fetcher + Gemini + storage)
└── migrations/
    └── 001_sentinel_tables.sql     # Database schema
```

---

## 11. Category Color Map

Use these consistently across all components:

```typescript
export const CATEGORY_COLORS: Record<ArticleCategory, string> = {
  ai_ml:              '#8B5CF6',  // purple
  crypto_web3:        '#F59E0B',  // amber
  macro_economy:      '#3B82F6',  // blue
  tech_earnings:      '#10B981',  // emerald
  startups_vc:        '#EC4899',  // pink
  cybersecurity:      '#EF4444',  // red
  regulation_policy:  '#6366F1',  // indigo
  semiconductors:     '#14B8A6',  // teal
  markets_trading:    '#22C55E',  // green
  geopolitics:        '#F97316',  // orange
  other:              '#6B7280',  // gray
};

export const SENTIMENT_COLORS = {
  bullish:  '#22C55E',  // green
  bearish:  '#EF4444',  // red
  neutral:  '#6B7280',  // gray
};

export const IMPACT_STYLES = {
  high:   'font-bold text-amber-400 border-l-4 border-amber-400',
  medium: 'text-orange-300',
  low:    'text-zinc-500',
};
```

---

## 12. Error Handling & Edge Cases

1. **All feeds fail:** Return cached articles from Supabase (last 24h). Show "Using cached data" indicator.
2. **Gemini API fails:** Store raw articles without AI processing. Set summary = title, category = feedCategory, sentiment = neutral, signals = []. Retry on next cycle.
3. **Gemini returns invalid JSON:** Retry once with same prompt. If still fails, fall back to unprocessed.
4. **Rate limiting on Google News:** Space Google News fetches 1 second apart. If 429 response, skip that feed for this cycle.
5. **Duplicate handling race condition:** Use `ON CONFLICT (link) DO NOTHING` in Supabase insert. Two parallel refreshes won't create duplicates.
6. **Very long article lists:** If >80 new articles in one cycle (unusual), split into 2 Gemini calls of 40 each. Gemini 2.0 Flash handles up to ~1M tokens but smaller batches are more reliable for structured output.

---

## 13. Testing Checklist

Before considering Sentinel complete:

- [ ] Edge Function fetches all 42 feeds without crashing
- [ ] Failed feeds are logged in meta.feedsFailed, don't break the pipeline
- [ ] Deduplication removes obvious duplicates (same URL, similar titles)
- [ ] Gemini returns valid JSON matching the ProcessedArticle schema
- [ ] Articles are stored in Supabase and not re-processed on next cycle
- [ ] Frontend renders briefing bar, article cards, and signal sidebar
- [ ] Category and sentiment filters work client-side
- [ ] "High impact only" toggle works
- [ ] Search filters by title, summary, and entities
- [ ] Signal sidebar groups by ticker and shows aggregated direction
- [ ] Clicking article "Open" button opens in new tab
- [ ] Loading skeleton shows on first load
- [ ] Polling works every 60 seconds without memory leaks
- [ ] Mobile layout is usable (stacked cards, bottom sheet for signals)
- [ ] Total Gemini cost stays under £0.30/day

---

## Summary

**What gets built:**
- 42 curated RSS feeds (from WorldMonitor's open source list)
- 1 Supabase Edge Function that fetches, deduplicates, and calls Gemini
- 1 Supabase Postgres table for cached processed articles
- 5 React components for the Sentinel panel
- 1 polling hook for real-time updates

**Estimated daily cost:** ~£0.14/day (Gemini 2.0 Flash), well under your £1-2 budget.

**Feed sources from:** [koala73/worldmonitor](https://github.com/koala73/worldmonitor) (MIT license, open source).
