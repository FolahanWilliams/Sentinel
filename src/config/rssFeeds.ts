/**
 * Sentinel — RSS Feed Definitions
 *
 * Curated list of reliable RSS feeds that work from both residential
 * and datacenter IPs (via the proxy-rss Edge Function).
 * Dead/blocked feeds (Reuters, Barron's, Zacks, old SEC) have been
 * replaced with working alternatives.
 */

export interface RSSFeedConfig {
    name: string;
    url: string;
    category: string;
    priority: 'high' | 'medium' | 'low';
}

export const RSS_FEEDS: RSSFeedConfig[] = [
    // === Market-Moving News ===
    { name: 'CNBC Business', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147', category: 'market_moving', priority: 'high' },
    { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'market_moving', priority: 'high' },
    { name: 'CNBC Top News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', category: 'market_moving', priority: 'high' },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'market_moving', priority: 'high' },
    { name: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', category: 'market_moving', priority: 'high' },
    { name: 'Financial Times', url: 'https://www.ft.com/rss/home', category: 'market_moving', priority: 'high' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'market_moving', priority: 'medium' },
    { name: 'Politico Economy', url: 'https://rss.politico.com/economy.xml', category: 'market_moving', priority: 'medium' },

    // === Tech & AI ===
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech_ai', priority: 'high' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech_ai', priority: 'medium' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech_ai', priority: 'medium' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'tech_ai', priority: 'medium' },
    { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'tech_ai', priority: 'high' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'tech_ai', priority: 'medium' },
    { name: 'SiliconANGLE', url: 'https://siliconangle.com/feed/', category: 'tech_ai', priority: 'high' },

    // === Biotech & Pharma ===
    { name: 'STAT News', url: 'https://www.statnews.com/feed/', category: 'biotech', priority: 'high' },
    { name: 'FierceBiotech', url: 'https://www.fiercebiotech.com/rss/xml', category: 'biotech', priority: 'high' },
    { name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/', category: 'biotech', priority: 'high' },
    { name: 'Endpoints News', url: 'https://endpts.com/feed/', category: 'biotech', priority: 'high' },
    { name: 'FiercePharma', url: 'https://www.fiercepharma.com/rss/xml', category: 'biotech', priority: 'high' },

    // === Semiconductor & Hardware ===
    { name: 'SemiAnalysis', url: 'https://www.semianalysis.com/feed', category: 'semiconductors', priority: 'high' },
    // AnandTech shut down in 2024 — replaced with Tom's Hardware
    { name: 'Tom\'s Hardware', url: 'https://www.tomshardware.com/feeds/all', category: 'semiconductors', priority: 'medium' },
    { name: 'EE Times', url: 'https://www.eetimes.com/feed/', category: 'semiconductors', priority: 'medium' },

    // === Cybersecurity ===
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'cybersecurity', priority: 'high' },
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'cybersecurity', priority: 'high' },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'cybersecurity', priority: 'medium' },
    { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', category: 'cybersecurity', priority: 'medium' },

    // === Fintech ===
    { name: 'Finextra', url: 'https://www.finextra.com/rss/headlines.aspx', category: 'fintech', priority: 'high' },
    { name: 'Pymnts', url: 'https://www.pymnts.com/feed/', category: 'fintech', priority: 'medium' },
    { name: 'American Banker', url: 'https://www.americanbanker.com/feed', category: 'fintech', priority: 'medium' },

    // === Macro & Economics ===
    { name: 'Fed Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'macro', priority: 'high' },
    { name: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default', category: 'macro', priority: 'medium' },
    { name: 'Wolf Street', url: 'https://wolfstreet.com/feed/', category: 'macro', priority: 'medium' },

    // === Analyst/Editorial ===
    { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', category: 'analyst', priority: 'medium' },
    { name: 'Motley Fool', url: 'https://www.fool.com/feeds/index.aspx', category: 'analyst', priority: 'low' },
    // Barron's blocked (403) — replaced with Investor's Business Daily
    { name: 'Investor\'s Business Daily', url: 'https://www.investors.com/feed/', category: 'analyst', priority: 'medium' },

    // === Social Sentiment ===
    { name: 'Reddit r/wallstreetbets', url: 'https://www.reddit.com/r/wallstreetbets/.rss', category: 'social', priority: 'low' },
    { name: 'Reddit r/stocks', url: 'https://www.reddit.com/r/stocks/.rss', category: 'social', priority: 'low' },
    { name: 'Reddit r/investing', url: 'https://www.reddit.com/r/investing/.rss', category: 'social', priority: 'low' },

    // === SEC & Regulatory ===
    // SEC press.xml returns 403 — replaced with SEC EDGAR RSS feed for recent filings
    { name: 'SEC EDGAR Filings', url: 'https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=2025-01-01&forms=8-K&from=0&size=20', category: 'regulatory', priority: 'high' },
    { name: 'Politico Financial Services', url: 'https://rss.politico.com/financial-services.xml', category: 'regulatory', priority: 'medium' },

    // === Earnings & Data ===
    { name: 'Earnings Whispers', url: 'https://www.earningswhispers.com/rss', category: 'earnings', priority: 'high' },
    // Zacks feed is 404 — replaced with Nasdaq earnings news
    { name: 'Nasdaq Earnings', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Earnings', category: 'earnings', priority: 'medium' },
];

export const RSS_CATEGORIES = [
    'market_moving',
    'tech_ai',
    'biotech',
    'semiconductors',
    'cybersecurity',
    'fintech',
    'macro',
    'analyst',
    'social',
    'regulatory',
    'earnings',
] as const;

export type RSSCategory = (typeof RSS_CATEGORIES)[number];
