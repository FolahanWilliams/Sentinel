import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Feed Definitions (Spec §2) ─────────────────────────────

interface Feed {
    name: string;
    url: string;
    category: string;
    tier: number;
}

const gnews = (query: string) =>
    `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

const ALL_FEEDS: Feed[] = [
    // Tier 1 — Core
    { name: 'CNBC Tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', category: 'markets', tier: 1 },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/rss/topstories', category: 'markets', tier: 1 },
    { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', category: 'markets', tier: 1 },
    { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'macro', tier: 1 },
    { name: 'SEC Releases', url: 'https://www.sec.gov/news/pressreleases.rss', category: 'regulation', tier: 1 },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', tier: 1 },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech', tier: 1 },
    { name: 'TechMeme', url: 'https://www.techmeme.com/feed.xml', category: 'tech', tier: 1 },
    { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'ai', tier: 1 },
    { name: 'ArXiv AI', url: 'https://export.arxiv.org/rss/cs.AI', category: 'ai', tier: 1 },
    { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', category: 'startups', tier: 1 },
    { name: 'TechCrunch Venture', url: 'https://techcrunch.com/category/venture/feed/', category: 'startups', tier: 1 },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', tier: 1 },
    { name: 'Krebs Security', url: 'https://krebsonsecurity.com/feed/', category: 'security', tier: 1 },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'security', tier: 1 },
    // Tier 2 — High Value
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', tier: 2 },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'tech', tier: 2 },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'tech', tier: 2 },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'tech', tier: 2 },
    { name: 'Fast Company', url: 'https://feeds.feedburner.com/fastcompany/headlines', category: 'tech', tier: 2 },
    { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', category: 'startups', tier: 2 },
    { name: 'a16z Blog', url: 'https://a16z.com/feed/', category: 'vc', tier: 2 },
    { name: 'Y Combinator', url: 'https://www.ycombinator.com/blog/rss/', category: 'vc', tier: 2 },
    { name: 'Stratechery', url: 'https://stratechery.com/feed/', category: 'tech', tier: 2 },
    { name: 'SemiAnalysis', url: 'https://www.semianalysis.com/feed', category: 'hardware', tier: 2 },
    { name: 'InfoQ', url: 'https://feed.infoq.com/', category: 'dev', tier: 2 },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto', tier: 2 },
    { name: 'Politico Tech', url: 'https://rss.politico.com/technology.xml', category: 'policy', tier: 2 },
    { name: 'CB Insights', url: 'https://www.cbinsights.com/research/feed/', category: 'startups', tier: 2 },
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'security', tier: 2 },
    // Tier 3 — Google News
    { name: 'AI News', url: gnews('(OpenAI+OR+Anthropic+OR+Google+AI+OR+"large+language+model")+when:2d'), category: 'ai', tier: 3 },
    { name: 'Bloomberg Markets', url: gnews('site:bloomberg.com+markets+when:1d'), category: 'markets', tier: 3 },
    { name: 'Reuters Markets', url: gnews('site:reuters.com+markets+stocks+when:1d'), category: 'markets', tier: 3 },
    { name: 'Semiconductor', url: gnews('semiconductor+OR+chip+OR+TSMC+OR+NVIDIA+when:3d'), category: 'hardware', tier: 3 },
    { name: 'Tech Layoffs', url: gnews('tech+layoffs+when:7d'), category: 'labor', tier: 3 },
    { name: 'Unicorns', url: gnews('("unicorn+startup"+OR+"unicorn+valuation")+when:7d'), category: 'startups', tier: 3 },
    { name: 'Crypto Market', url: gnews('(bitcoin+OR+ethereum+OR+crypto+OR+"digital+asset")+when:1d'), category: 'crypto', tier: 3 },
    { name: 'Fed & Rates', url: gnews('("interest+rate"+OR+"rate+decision"+OR+"monetary+policy")+when:2d'), category: 'macro', tier: 3 },
    { name: 'IPO News', url: gnews('(IPO+OR+"initial+public+offering"+OR+SPAC)+when:3d'), category: 'markets', tier: 3 },
    { name: 'Cyber Incidents', url: gnews('cyber+attack+OR+data+breach+OR+ransomware+when:3d'), category: 'security', tier: 3 },
    { name: 'AI Regulation', url: gnews('AI+regulation+OR+"artificial+intelligence"+law+when:7d'), category: 'policy', tier: 3 },
    { name: 'M&A Deals', url: gnews('("merger"+OR+"acquisition"+OR+"takeover+bid")+tech+when:3d'), category: 'markets', tier: 3 },
];

// ─── Utility Functions ──────────────────────────────────────

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
            'utm_term', 'ref', 'source', 'ncid', 'sr_share'].forEach(p =>
                u.searchParams.delete(p)
            );
        u.pathname = u.pathname.replace(/\/+$/, '') || '/';
        return u.toString();
    } catch {
        return url;
    }
}

function titleSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
    const wordsB = new Set(b.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

interface RawArticle {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    feedCategory: string;
    snippet: string;
    tier: number;
}

function parseRSSXml(xml: string, feed: Feed): RawArticle[] {
    const items: RawArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < 15) {
        const itemXml = match[1];

        const titleMatch = /<title(?:[^>]*)><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title(?:[^>]*)>([\s\S]*?)<\/title>/.exec(itemXml || '');
        const title = titleMatch ? (titleMatch[1] || titleMatch[2])?.trim() || '' : '';

        const linkMatch = /<link(?:[^>]*)>([\s\S]*?)<\/link>/.exec(itemXml || '');
        const link = linkMatch && linkMatch[1] ? normalizeUrl(linkMatch[1].trim()) : '';

        const descMatch = /<description(?:[^>]*)><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description(?:[^>]*)>([\s\S]*?)<\/description>/.exec(itemXml || '');
        const rawDesc = descMatch ? (descMatch[1] || descMatch[2])?.trim() || '' : '';
        const snippet = rawDesc.replace(/<[^>]*>?/gm, '').slice(0, 200);

        const dateMatch = /<pubDate(?:[^>]*)>([\s\S]*?)<\/pubDate>|<dc:date(?:[^>]*)>([\s\S]*?)<\/dc:date>/.exec(itemXml || '');
        const pubDate = dateMatch ? new Date(((dateMatch[1] || dateMatch[2]) ?? '').trim()).toISOString() : new Date().toISOString();

        if (title && link) {
            items.push({ title, link, pubDate, source: feed.name, feedCategory: feed.category, snippet, tier: feed.tier });
            count++;
        }
    }

    return items;
}

async function fetchFeed(feed: Feed): Promise<RawArticle[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(feed.url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'KeystoneAnalytics/1.0 (RSS Reader)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSSXml(xml, feed);
    } catch {
        clearTimeout(timeout);
        return [];
    }
}

function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
    // Phase 1: URL dedup
    const urlMap = new Map<string, RawArticle>();
    for (const a of articles) {
        const existing = urlMap.get(a.link);
        if (!existing || a.tier < existing.tier) {
            urlMap.set(a.link, a);
        }
    }
    let deduped = Array.from(urlMap.values());

    // Phase 2: Title similarity dedup (>85% Jaccard => keep higher-tier)
    const toRemove = new Set<number>();
    for (let i = 0; i < deduped.length; i++) {
        if (toRemove.has(i)) continue;
        for (let j = i + 1; j < deduped.length; j++) {
            if (toRemove.has(j)) continue;
            if (titleSimilarity(deduped[i].title, deduped[j].title) > 0.85) {
                // Remove the lower-tier (higher number) one
                toRemove.add(deduped[i].tier <= deduped[j].tier ? j : i);
            }
        }
    }

    deduped = deduped.filter((_, i) => !toRemove.has(i));

    // Filter to last 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    deduped = deduped.filter(a => a.pubDate >= cutoff);

    // Sort by pubDate descending
    deduped.sort((a, b) => b.pubDate.localeCompare(a.pubDate));

    return deduped;
}

// ─── Gemini Prompt (Spec §6) ────────────────────────────────

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
  - ticker: stock/crypto ticker if identifiable (e.g. "NVDA", "BTC"). null if none.
  - direction: "up", "down", or "volatile" — expected market impact
  - confidence: 0.0 to 1.0
  - note: 1-line explanation
  If no trading signal, use empty array [].
- entities: array of mentioned tickers, company names, or key people.

Also return a "briefing" object:
- topStories: array of 5 strings — the most important headlines rephrased as sharp one-liners
- marketMood: "risk-on", "risk-off", or "mixed" — overall mood across all articles
- trendingTopics: array of 5 strings — most common themes
- signalCount: { bullish: number, bearish: number, neutral: number }

IMPORTANT RULES:
- Be concise. Summaries should be 1-2 sentences max.
- Sentiment is about MARKET IMPACT, not whether the news is "good" or "bad" generally.
- Only flag "high" impact for genuinely market-moving events.
- For ArXiv papers: category = ai_ml, impact = low unless it's from a major lab announcing a capability breakthrough.
- Don't hallucinate tickers. If you're not sure of the ticker, omit it.
- If an article is too vague to analyze meaningfully, set impact = "low" and signals = [].

Return valid JSON in this exact structure:
{
  "articles": [ { "index": 0, "summary": "...", "category": "...", "sentiment": "...", "sentimentScore": 0, "impact": "...", "signals": [], "entities": [] }, ... ],
  "briefing": { "topStories": [], "marketMood": "mixed", "trendingTopics": [], "signalCount": { "bullish": 0, "bearish": 0, "neutral": 0 } }
}`;
}

// ─── Main Handler ────────────────────────────────────────────

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        // ═══ STEP 1: Fetch all feeds in parallel ═══
        console.log('[sentinel] Fetching feeds...');
        const feedResults = await Promise.allSettled(ALL_FEEDS.map(fetchFeed));

        let allArticles: RawArticle[] = [];
        const feedsFailed: string[] = [];

        feedResults.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
                allArticles = allArticles.concat(result.value);
            } else {
                feedsFailed.push(ALL_FEEDS[i].name);
            }
        });

        const articlesRaw = allArticles.length;
        console.log(`[sentinel] Fetched ${articlesRaw} raw articles from ${ALL_FEEDS.length - feedsFailed.length}/${ALL_FEEDS.length} feeds`);

        // ═══ STEP 2: Deduplicate ═══
        const deduped = deduplicateArticles(allArticles);
        const articlesDeduplicated = articlesRaw - deduped.length;

        // ═══ STEP 3: Check Supabase for already-processed ═══
        const links = deduped.map(a => a.link);
        const { data: existing } = await supabase
            .from('sentinel_articles')
            .select('link')
            .in('link', links.slice(0, 500)); // Supabase IN limit

        const existingLinks = new Set((existing || []).map((e: any) => e.link));
        const newArticles = deduped.filter(a => !existingLinks.has(a.link));
        const cachedCount = deduped.length - newArticles.length;

        console.log(`[sentinel] ${newArticles.length} new articles, ${cachedCount} cached`);

        let geminiTokensUsed = 0;
        let processedResults: any[] = [];
        let briefing: any = { topStories: [], marketMood: 'mixed', trendingTopics: [], signalCount: { bullish: 0, bearish: 0, neutral: 0 } };

        // ═══ STEP 4: Batch Gemini call (only for new articles) ═══
        if (newArticles.length > 0) {
            // Split into batches of 40 if >80 articles (Spec §12.6)
            const batchSize = newArticles.length > 80 ? 40 : newArticles.length;
            const batches = [];
            for (let i = 0; i < newArticles.length; i += batchSize) {
                batches.push(newArticles.slice(i, i + batchSize));
            }

            for (const batch of batches) {
                const prompt = buildPrompt(batch);

                try {
                    const geminiRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: prompt }] }],
                                generationConfig: {
                                    responseMimeType: 'application/json',
                                    temperature: 0.1,
                                },
                            }),
                        }
                    );

                    if (!geminiRes.ok) {
                        console.error(`[sentinel] Gemini API error: ${geminiRes.status}`);
                        // Spec §12.2: Fallback — store raw articles without AI processing
                        for (const a of batch) {
                            processedResults.push({
                                title: a.title,
                                link: a.link,
                                source: a.source,
                                pub_date: a.pubDate,
                                summary: a.title,
                                category: mapFeedCategory(a.feedCategory),
                                sentiment: 'neutral',
                                sentiment_score: 0,
                                impact: 'low',
                                signals: [],
                                entities: [],
                            });
                        }
                        continue;
                    }

                    const data = await geminiRes.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    geminiTokensUsed += (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);

                    let parsed: any;
                    try {
                        parsed = JSON.parse(text);
                    } catch {
                        // Spec §12.3: Retry once on invalid JSON
                        console.warn('[sentinel] Invalid JSON from Gemini, retrying...');
                        const retryRes = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: prompt }] }],
                                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
                                }),
                            }
                        );
                        const retryData = await retryRes.json();
                        const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
                        geminiTokensUsed += (retryData.usageMetadata?.promptTokenCount || 0) + (retryData.usageMetadata?.candidatesTokenCount || 0);

                        try {
                            parsed = JSON.parse(retryText);
                        } catch {
                            // Still failed — fall back to raw
                            console.error('[sentinel] Retry also failed. Using unprocessed articles.');
                            for (const a of batch) {
                                processedResults.push({
                                    title: a.title, link: a.link, source: a.source, pub_date: a.pubDate,
                                    summary: a.title, category: mapFeedCategory(a.feedCategory),
                                    sentiment: 'neutral', sentiment_score: 0, impact: 'low', signals: [], entities: [],
                                });
                            }
                            continue;
                        }
                    }

                    // Map Gemini output back to articles
                    if (parsed?.articles && Array.isArray(parsed.articles)) {
                        for (const art of parsed.articles) {
                            const original = batch[art.index];
                            if (!original) continue;
                            processedResults.push({
                                title: original.title,
                                link: original.link,
                                source: original.source,
                                pub_date: original.pubDate,
                                summary: art.summary || original.title,
                                category: art.category || 'other',
                                sentiment: art.sentiment || 'neutral',
                                sentiment_score: art.sentimentScore || 0,
                                impact: art.impact || 'low',
                                signals: art.signals || [],
                                entities: art.entities || [],
                            });
                        }
                    }

                    if (parsed?.briefing) {
                        briefing = {
                            topStories: parsed.briefing.topStories || [],
                            marketMood: parsed.briefing.marketMood || 'mixed',
                            trendingTopics: parsed.briefing.trendingTopics || [],
                            signalCount: parsed.briefing.signalCount || { bullish: 0, bearish: 0, neutral: 0 },
                        };
                    }
                } catch (err) {
                    console.error('[sentinel] Gemini call failed:', err);
                    // Fallback for this batch
                    for (const a of batch) {
                        processedResults.push({
                            title: a.title, link: a.link, source: a.source, pub_date: a.pubDate,
                            summary: a.title, category: mapFeedCategory(a.feedCategory),
                            sentiment: 'neutral', sentiment_score: 0, impact: 'low', signals: [], entities: [],
                        });
                    }
                }
            }

            // ═══ STEP 5: Store in Supabase ═══
            if (processedResults.length > 0) {
                const { error: insertError } = await supabase
                    .from('sentinel_articles')
                    .upsert(
                        processedResults.map(r => ({
                            ...r,
                            processed_at: new Date().toISOString(),
                        })),
                        { onConflict: 'link' }
                    );
                if (insertError) console.error('[sentinel] Insert error:', insertError.message);
            }

            // Upsert daily briefing
            const { error: briefingError } = await supabase
                .from('sentinel_briefings')
                .upsert({
                    briefing_date: new Date().toISOString().slice(0, 10),
                    top_stories: briefing.topStories,
                    market_mood: briefing.marketMood,
                    trending_topics: briefing.trendingTopics,
                    signal_count: briefing.signalCount,
                    generated_at: new Date().toISOString(),
                }, { onConflict: 'briefing_date' });
            if (briefingError) console.error('[sentinel] Briefing upsert error:', briefingError.message);
        }

        // ═══ STEP 6: Return combined response ═══
        // Fetch latest 50 articles (new + cached)
        const { data: latestArticles } = await supabase
            .from('sentinel_articles')
            .select('*')
            .order('pub_date', { ascending: false })
            .limit(50);

        // Fetch today's briefing
        const { data: latestBriefing } = await supabase
            .from('sentinel_briefings')
            .select('*')
            .eq('briefing_date', new Date().toISOString().slice(0, 10))
            .single();

        const processingTimeMs = Date.now() - startTime;
        const costEstimateUsd = (geminiTokensUsed / 1_000_000) * 0.15; // rough avg

        const response = {
            articles: (latestArticles || []).map((a: any) => ({
                id: a.id,
                title: a.title,
                link: a.link,
                pubDate: a.pub_date,
                source: a.source,
                summary: a.summary,
                category: a.category,
                sentiment: a.sentiment,
                sentimentScore: a.sentiment_score,
                impact: a.impact,
                signals: a.signals || [],
                entities: a.entities || [],
                processedAt: a.processed_at,
            })),
            briefing: latestBriefing
                ? {
                    topStories: latestBriefing.top_stories,
                    marketMood: latestBriefing.market_mood,
                    trendingTopics: latestBriefing.trending_topics,
                    signalCount: latestBriefing.signal_count,
                    generatedAt: latestBriefing.generated_at,
                }
                : briefing,
            meta: {
                feedsFetched: ALL_FEEDS.length - feedsFailed.length,
                feedsFailed,
                articlesRaw,
                articlesDeduplicated,
                articlesNew: newArticles.length,
                articlesCached: cachedCount,
                geminiTokensUsed,
                processingTimeMs,
                costEstimateUsd,
            },
        };

        return new Response(JSON.stringify(response), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300',
            },
        });
    } catch (err: any) {
        console.error('[sentinel] Fatal error:', err);

        // Spec §12.1: All feeds fail — return cached articles
        try {
            const { data: cachedArticles } = await supabase
                .from('sentinel_articles')
                .select('*')
                .gte('pub_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .order('pub_date', { ascending: false })
                .limit(50);

            const { data: cachedBriefing } = await supabase
                .from('sentinel_briefings')
                .select('*')
                .order('briefing_date', { ascending: false })
                .limit(1)
                .single();

            return new Response(JSON.stringify({
                articles: (cachedArticles || []).map((a: any) => ({
                    id: a.id, title: a.title, link: a.link, pubDate: a.pub_date,
                    source: a.source, summary: a.summary || a.title, category: a.category,
                    sentiment: a.sentiment, sentimentScore: a.sentiment_score,
                    impact: a.impact, signals: a.signals || [], entities: a.entities || [],
                    processedAt: a.processed_at,
                })),
                briefing: cachedBriefing ? {
                    topStories: cachedBriefing.top_stories, marketMood: cachedBriefing.market_mood,
                    trendingTopics: cachedBriefing.trending_topics, signalCount: cachedBriefing.signal_count,
                    generatedAt: cachedBriefing.generated_at,
                } : { topStories: [], marketMood: 'mixed', trendingTopics: [], signalCount: { bullish: 0, bearish: 0, neutral: 0 }, generatedAt: new Date().toISOString() },
                meta: {
                    feedsFetched: 0, feedsFailed: ALL_FEEDS.map(f => f.name),
                    articlesRaw: 0, articlesDeduplicated: 0, articlesNew: 0,
                    articlesCached: cachedArticles?.length || 0,
                    geminiTokensUsed: 0, processingTimeMs: Date.now() - startTime,
                    costEstimateUsd: 0, usedCache: true,
                },
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        } catch {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }
});

// Helper: map RSS feed category → ArticleCategory
function mapFeedCategory(feedCat: string): string {
    const map: Record<string, string> = {
        markets: 'markets_trading', macro: 'macro_economy', regulation: 'regulation_policy',
        tech: 'tech_earnings', ai: 'ai_ml', startups: 'startups_vc', vc: 'startups_vc',
        crypto: 'crypto_web3', security: 'cybersecurity', hardware: 'semiconductors',
        dev: 'tech_earnings', policy: 'regulation_policy', labor: 'geopolitics',
    };
    return map[feedCat] || 'other';
}
