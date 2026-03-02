import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Parser from 'npm:rss-parser'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Feed {
    name: string;
    url: string;
    category: string;
}

interface RawArticle {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    feedCategory: string;
    snippet?: string;
}

const TIER_1_FEEDS: Feed[] = [
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

const TIER_2_FEEDS: Feed[] = [
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

const gnews = (query: string) => `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

const TIER_3_FEEDS: Feed[] = [
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

const ALL_FEEDS = [...TIER_1_FEEDS, ...TIER_2_FEEDS, ...TIER_3_FEEDS];

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source', 'ncid', 'sr_share'].forEach(p => u.searchParams.delete(p));
        u.pathname = u.pathname.replace(/\/+$/, '') || '/';
        return u.toString();
    } catch {
        return url;
    }
}

function titleSimilarity(a: string, b: string): number {
    const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const wordsA = new Set(clean(a));
    const wordsB = new Set(clean(b));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

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
  - trendingTopics: array of 5 strings — most common themes
  - signalCount: { bullish: number, bearish: number, neutral: number }
  
  IMPORTANT RULES:
  - Be concise. Summaries should be 1-2 sentences max.
  - Sentiment is about MARKET IMPACT. A company getting hacked is bearish for that stock even if the article tone is neutral.
  - Only flag "high" impact for genuinely market-moving events (earnings, policy, breaches, rate decisions, M&A).
  - For ArXiv/academic: category = ai_ml, impact = low unless it's a major breakthrough.
  - Don't hallucinate tickers. If unsure, omit.
  - If an article is too vague or not a news story, set impact = "low" and signals = [].
  
  Return valid JSON in this exact structure matching the articles passed in:
  {
    "articles": [ { "index": 0, "summary": "...", "category": "...", "sentiment": "...", "sentimentScore": 0, "impact": "...", "signals": [], "entities": [] } ],
    "briefing": { "topStories": [], "marketMood": "mixed", "trendingTopics": [], "signalCount": { "bullish": 0, "bearish": 0, "neutral": 0 } }
  }`;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }) }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const startTime = Date.now();

        // 1. Fetch Feeds in Parallel
        const parser = new Parser({
            timeout: 5000,
            headers: { 'User-Agent': 'KeystoneAnalytics/1.0 (RSS Reader)', 'Accept': 'application/rss+xml, application/xml, text/xml' }
        });

        const failedFeeds: string[] = [];
        const rawResults = await Promise.allSettled(ALL_FEEDS.map(async (feed) => {
            try {
                const res = await parser.parseURL(feed.url);
                return (res.items || []).slice(0, 15).map(item => ({
                    title: item.title?.trim() || '',
                    link: normalizeUrl(item.link || ''),
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    source: feed.name,
                    feedCategory: feed.category,
                    snippet: (item.contentSnippet || item.content || '').slice(0, 200),
                }));
            } catch (e) {
                failedFeeds.push(feed.name);
                return [];
            }
        }));

        let allRawArticles: RawArticle[] = rawResults
            .filter((r): r is PromiseFulfilledResult<RawArticle[]> => r.status === 'fulfilled')
            .flatMap(r => r.value);

        // 2. Normalize & Deduplicate
        const uniqueLinks = new Set<string>();
        const dedupedArticles: RawArticle[] = [];
        const FORTY_EIGHT_HOURS_AGO = Date.now() - (48 * 60 * 60 * 1000);

        // Sort by date newest first
        allRawArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        for (const article of allRawArticles) {
            if (new Date(article.pubDate).getTime() < FORTY_EIGHT_HOURS_AGO) continue;
            if (uniqueLinks.has(article.link)) continue;

            // Jaccard similarity check against already accepted articles
            const isSimilar = dedupedArticles.some(accepted => titleSimilarity(article.title, accepted.title) > 0.85);
            if (!isSimilar) {
                uniqueLinks.add(article.link);
                dedupedArticles.push(article);
            }
        }

        // 3. Check Supabase Cache for existing
        const links = dedupedArticles.map(a => a.link);
        const { data: cachedRows } = await supabase
            .from('sentinel_articles')
            .select('*')
            .in('link', links);

        const cachedLinks = new Set(cachedRows?.map(r => r.link) || []);

        // Split into new and cached
        const newArticles = dedupedArticles.filter(a => !cachedLinks.has(a.link)).slice(0, 40); // Cap at 40 new to avoid Gemini token bloat

        console.log(`[Sentinel] Fetched ${allRawArticles.length} raw -> ${dedupedArticles.length} deduped -> ${newArticles.length} brand new`);

        let processedNewArticles: any[] = [];
        let briefingToSave: any = null;

        // 4. Batch Gemini Processing (only if there are new articles)
        if (newArticles.length > 0) {
            const prompt = buildPrompt(newArticles);

            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.1,
                        }
                    })
                }
            );

            if (!geminiRes.ok) throw new Error(`Gemini Error: ${await geminiRes.text()}`);
            const data = await geminiRes.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    briefingToSave = parsed.briefing;

                    // Map back to our schema
                    processedNewArticles = newArticles.map((raw, i) => {
                        const aiData = parsed.articles?.find((a: any) => a.index === i) || {};
                        return {
                            link: raw.link,
                            title: raw.title,
                            source: raw.source,
                            pub_date: raw.pubDate,
                            summary: aiData.summary || raw.snippet || raw.title,
                            category: aiData.category || raw.feedCategory || 'other',
                            sentiment: aiData.sentiment || 'neutral',
                            sentiment_score: aiData.sentimentScore || 0,
                            impact: aiData.impact || 'low',
                            signals: aiData.signals || [],
                            entities: aiData.entities || []
                        };
                    });
                } catch (e) {
                    console.error("Gemini JSON parse failed", e, text);
                    // Fallback to raw data
                    processedNewArticles = newArticles.map(raw => ({
                        link: raw.link,
                        title: raw.title,
                        source: raw.source,
                        pub_date: raw.pubDate,
                        summary: raw.snippet || raw.title,
                        category: raw.feedCategory || 'other',
                        sentiment: 'neutral',
                        sentiment_score: 0,
                        impact: 'low',
                        signals: [],
                        entities: []
                    }));
                }
            }

            // 5. Store in Supabase
            if (processedNewArticles.length > 0) {
                await supabase.from('sentinel_articles').insert(processedNewArticles);
            }
            if (briefingToSave) {
                await supabase.from('sentinel_briefings').upsert({
                    briefing_date: new Date().toISOString().split('T')[0],
                    top_stories: briefingToSave.topStories || [],
                    market_mood: briefingToSave.marketMood || 'mixed',
                    trending_topics: briefingToSave.trendingTopics || [],
                    signal_count: briefingToSave.signalCount || { bullish: 0, bearish: 0, neutral: 0 }
                }, { onConflict: 'briefing_date' });
            }
        }

        // 6. Return Data (combine cached + new, max 50)
        const { data: finalArticles } = await supabase
            .from('sentinel_articles')
            .select('*')
            .order('pub_date', { ascending: false })
            .limit(50);

        const { data: finalBriefing } = await supabase
            .from('sentinel_briefings')
            .select('*')
            .order('generated_at', { ascending: false })
            .limit(1)
            .single();

        const durationMs = Date.now() - startTime;

        const responsePayload = {
            articles: finalArticles || [],
            briefing: finalBriefing || { top_stories: [], market_mood: 'mixed', trending_topics: [], signal_count: { bullish: 0, bearish: 0, neutral: 0 } },
            meta: {
                feedsFetched: ALL_FEEDS.length,
                feedsFailed: failedFeeds,
                articlesRaw: allRawArticles.length,
                articlesDeduplicated: dedupedArticles.length,
                articlesNew: newArticles.length,
                articlesCached: cachedRows?.length || 0,
                processingTimeMs: durationMs
            }
        };

        return new Response(JSON.stringify(responsePayload), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=300' }
        });

    } catch (error: any) {
        console.error(`[Sentinel] Fatal Error:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});
