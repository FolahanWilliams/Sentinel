/**
 * Sentinel — Agent Pipeline Service
 * 
 * Orchestrates the execution of the 5 specialized AI Agents.
 * Each agent uses the GeminiService with specific schemas, prompts,
 * temperature, and model selection tuned for its task.
 */

import { GeminiService } from './gemini';
import {
    OVERREACTION_AGENT_PROMPT,
    CONTAGION_AGENT_PROMPT,
    EARNINGS_AGENT_PROMPT,
    SANITY_CHECK_AGENT_PROMPT
} from './prompts';
import {
    OVERREACTION_SCHEMA,
    CONTAGION_SCHEMA,
    EARNINGS_SCHEMA,
    SANITY_CHECK_SCHEMA,
    SATELLITE_DISCOVERY_SCHEMA
} from './schemas';
import { GEMINI_MODEL, GEMINI_MODEL_LITE } from '@/config/constants';
import type { AgentResult } from '@/types/agents';

/**
 * Extended market context for richer agent analysis.
 */
export interface MarketContext {
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    avgVolume?: number;
    currentVolume?: number;
    sectorPerformance?: string; // e.g., "XLK -1.2% today"
}

export class AgentService {

    /**
     * 1. Overreaction Agent
     * Analyzes an event to determine if a price drop is an irrational overreaction.
     * Uses temperature 0.4 for creative hypothesis generation.
     */
    static async evaluateOverreaction(
        ticker: string,
        eventHeadline: string,
        eventDesc: string,
        currentPrice: number,
        priceDropPct: number,
        performanceContext?: string,
        marketContext?: MarketContext
    ): Promise<AgentResult<any>> {
        const perfBlock = performanceContext
            ? `\n\n${performanceContext}\n\nUse the performance data above to calibrate your confidence. If this bias type or sector historically underperforms, lower your confidence. If it outperforms, you may raise it slightly.`
            : '';

        const marketBlock = marketContext
            ? `\n\nMARKET CONTEXT:
    52-Week High: $${marketContext.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'} | 52-Week Low: $${marketContext.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'}
    Average Volume: ${marketContext.avgVolume?.toLocaleString() ?? 'N/A'} | Current Volume: ${marketContext.currentVolume?.toLocaleString() ?? 'N/A'}
    Sector Performance: ${marketContext.sectorPerformance ?? 'N/A'}`
            : '';

        const prompt = `
    TICKER: ${ticker}
    CURRENT PRICE: $${currentPrice.toFixed(2)} (Down ${priceDropPct.toFixed(2)}%)
    EVENT HEADLINE: ${eventHeadline}
    EVENT DESCRIPTION: ${eventDesc}
    ${marketBlock}${perfBlock}
    Evaluate if this drop is an irrational overreaction presenting a mean-reversion buying opportunity.
    Think step-by-step in your reasoning before reaching your verdict.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: OVERREACTION_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: OVERREACTION_SCHEMA,
            temperature: 0.4,
            model: GEMINI_MODEL,
        });
    }

    /**
     * 2. Sector Contagion Agent
     * Evaluates if a satellite ticker is dropping unfairly due to an epicenter ticker's news.
     * Uses temperature 0.4 for creative analysis of exposure.
     */
    static async evaluateContagion(
        epicenterTicker: string,
        satelliteTicker: string,
        epicenterNews: string,
        satelliteDropPct: number,
        performanceContext?: string,
        marketContext?: MarketContext
    ): Promise<AgentResult<any>> {
        const perfBlock = performanceContext
            ? `\n\n${performanceContext}\n\nUse the performance data above to calibrate your confidence. If sector contagion signals historically underperform, be more skeptical. If they outperform, you may be slightly more confident.`
            : '';

        const marketBlock = marketContext
            ? `\n\nMARKET CONTEXT:
    52-Week High: $${marketContext.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'} | 52-Week Low: $${marketContext.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'}
    Average Volume: ${marketContext.avgVolume?.toLocaleString() ?? 'N/A'} | Current Volume: ${marketContext.currentVolume?.toLocaleString() ?? 'N/A'}
    Sector Performance: ${marketContext.sectorPerformance ?? 'N/A'}`
            : '';

        const prompt = `
    EPICENTER TICKER: ${epicenterTicker}
    EPICENTER NEWS: ${epicenterNews}

    SATELLITE TICKER: ${satelliteTicker}
    SATELLITE DROP: ${satelliteDropPct.toFixed(2)}%
    ${marketBlock}${perfBlock}
    Evaluate if ${satelliteTicker} is dropping purely in sympathy and lacks real exposure to the Epicenter's core issue.
    Think step-by-step in your reasoning before reaching your verdict.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: CONTAGION_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: CONTAGION_SCHEMA,
            temperature: 0.4,
            model: GEMINI_MODEL,
        });
    }

    /**
     * 3. Earnings Overreaction Agent
     * Parses earnings misses against forward guidance.
     * Uses temperature 0.3 for moderate creativity in guidance analysis.
     */
    static async evaluateEarnings(
        ticker: string,
        epsEstimate: number,
        epsActual: number,
        revenueEstimate: number,
        revenueActual: number,
        guidanceDetails: string,
        priceDropPct: number,
        performanceContext?: string,
        marketContext?: MarketContext
    ): Promise<AgentResult<any>> {
        const perfBlock = performanceContext
            ? `\n\n${performanceContext}\n\nUse the performance data above to calibrate your confidence. If earnings overreaction signals historically underperform in this sector, lower your confidence. If they outperform, you may raise it slightly.`
            : '';

        const marketBlock = marketContext
            ? `\n\nMARKET CONTEXT:
    52-Week High: $${marketContext.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'} | 52-Week Low: $${marketContext.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'}
    Average Volume: ${marketContext.avgVolume?.toLocaleString() ?? 'N/A'} | Current Volume: ${marketContext.currentVolume?.toLocaleString() ?? 'N/A'}
    Sector Performance: ${marketContext.sectorPerformance ?? 'N/A'}`
            : '';

        const prompt = `
    TICKER: ${ticker}
    PRICE DROP: ${priceDropPct.toFixed(2)}%
    
    EPS EXPECTED: ${epsEstimate} | EPS ACTUAL: ${epsActual}
    REV EXPECTED: ${revenueEstimate} | REV ACTUAL: ${revenueActual}
    FORWARD GUIDANCE CONTEXT: ${guidanceDetails}
    ${marketBlock}${perfBlock}
    Evaluate if this post-earnings drop is a mispricing because forward guidance outweighs the backward-looking miss.
    Think step-by-step in your reasoning before reaching your verdict.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: EARNINGS_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: EARNINGS_SCHEMA,
            temperature: 0.3,
            model: GEMINI_MODEL,
        });
    }

    /**
     * 4. Sanity Check / Red Team Agent
     * Attacks a proposed trade thesis.
     * Uses temperature 0.5 — devil's advocate needs to explore unlikely scenarios.
     */
    static async runSanityCheck(
        ticker: string,
        originalThesis: string,
        targetPrice: number,
        stopLoss: number,
        agentType: string,
        performanceContext?: string
    ): Promise<AgentResult<any>> {
        const perfBlock = performanceContext
            ? `\n\n${performanceContext}\n\nAs the Red Team, use this performance history to identify systemic weaknesses. If the originating agent type or sector has a poor track record, be EXTRA skeptical and demand stronger evidence.`
            : '';

        const prompt = `
    PROPOSED TRADE FOR TICKER: ${ticker}
    ORIGINATING AGENT: ${agentType}
    
    THESIS: "${originalThesis}"
    TARGET: $${targetPrice} | STOP LOSS: $${stopLoss}
    ${perfBlock}
    You are the RED TEAM. Tear this thesis apart. Find the fatal flaw.
    Research macro conditions, pending lawsuits, or sector rot.
    Think step-by-step in your reasoning — explore multiple counterarguments.
    If it's a terrible trade, fail it. Return JSON.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: SANITY_CHECK_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: SANITY_CHECK_SCHEMA,
            temperature: 0.5,
            model: GEMINI_MODEL,
        });
    }

    /**
     * 5. Satellite Discovery Agent
     * Given an epicenter event, identifies sector peers / supply chain tickers
     * that may be dropping in sympathy and are contagion candidates.
     * Uses temperature 0.4 for creative sector relationship analysis.
     */
    static async discoverSatellites(
        epicenterTicker: string,
        eventHeadline: string,
        sector: string,
        watchlistTickers: string[]
    ): Promise<AgentResult<{ satellites: Array<{ ticker: string; reason: string; expected_exposure: string }> }>> {
        const prompt = `
    EPICENTER TICKER: ${epicenterTicker}
    EPICENTER SECTOR: ${sector}
    EVENT: ${eventHeadline}

    WATCHLIST TICKERS (candidates): ${watchlistTickers.join(', ')}

    From the watchlist above, identify tickers that are likely to drop in sympathy with ${epicenterTicker}'s event but may NOT have real exposure to the issue.
    For each satellite candidate, explain:
    1. Why the market might sell it (the fear)
    2. Whether the exposure is real or imagined

    Think step-by-step in your reasoning before listing satellites.
    Only include tickers from the provided watchlist. Return JSON.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: CONTAGION_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: SATELLITE_DISCOVERY_SCHEMA,
            temperature: 0.4,
            model: GEMINI_MODEL,
        });
    }

    /**
     * 6. Pre-Filter Agent (Helper)
     * Scores a raw list of news articles and returns only the IDs of those
     * with market-moving potential. Inclusive to avoid dropping actionable articles.
     * Uses Flash-Lite (cheap, fast) and temperature 0.1 (deterministic classification).
     */
    static async filterActionableNews(articles: Array<{ id: string; title: string; description: string }>): Promise<AgentResult<{ actionable_ids: string[] }>> {
        const payload = articles.map(a => `[ID: ${a.id}] ${a.title}\n${a.description}`).join('\n\n');
        const prompt = `
    Review the following news articles:
    
    ${payload}
    
    Identify which articles are potentially actionable for stock traders. Include articles about:
    - Earnings reports (beats, misses, guidance changes)
    - Analyst upgrades, downgrades, or price target changes
    - FDA decisions, drug approvals, clinical trial results
    - Executive changes (CEO, CFO, board members)
    - Mergers, acquisitions, divestitures, or activist investors
    - Product launches, partnerships, or major contracts
    - Government regulations, tariffs, sanctions, or antitrust actions
    - Supply chain disruptions or major operational news
    - Significant price movements or unusual trading volume
    - Lawsuits, SEC investigations, or compliance issues
    - Macroeconomic news that impacts specific sectors or companies
    
    Be INCLUSIVE. If an article mentions a specific publicly traded company 
    with a concrete event or catalyst, include it. Only exclude truly generic
    market commentary, opinion pieces with no actionable content, or daily recaps.
    Return a JSON object with the IDs of actionable articles.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: "You are a pre-filter for a trading scanner. Be inclusive — when in doubt, INCLUDE the article. Return ONLY a JSON object with a single key 'actionable_ids' containing an array of string IDs.",
            requireGroundedSearch: false,
            responseSchema: {
                type: "object",
                properties: {
                    actionable_ids: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                required: ["actionable_ids"]
            },
            temperature: 0.1,
            model: GEMINI_MODEL_LITE,
        });
    }

    /**
     * 7. Extraction Agent (Helper)
     * Converts unstructured RSS text into structured Market Events.
     * Uses Flash-Lite (cheap, fast) and temperature 0.1 (factual extraction).
     */
    static async extractEventsFromText(text: string): Promise<AgentResult<any>> {
        const prompt = `
    Extract notable market events from the following text. Look for:
    - Earnings beats or misses, revenue surprises, guidance changes
    - Analyst upgrades, downgrades, price target changes
    - FDA decisions, drug approvals or rejections, clinical trial results
    - Executive departures, CEO/CFO changes, board shakeups
    - Mergers, acquisitions, divestitures, activist investor involvement
    - Product launches, major partnerships, government contracts
    - Tariffs, sanctions, regulatory actions, antitrust rulings
    - Supply chain disruptions or major operational problems
    - Significant stock price movements (>3% moves)
    - Lawsuits, SEC investigations, compliance issues
    - Sector-wide catalysts (interest rate decisions, policy changes)
    
    For each event, assign a severity from 1-10:
    - 1-4: Minor news, unlikely to move stock significantly
    - 5-6: Moderate news, could cause 2-5% price movement
    - 7-8: Major news, likely to cause 5-10% price movement
    - 9-10: Extreme event (earnings disaster, FDA rejection, fraud)
    
    Be inclusive — extract ANY event that could reasonably affect a stock price.
    
    TEXT TO ANALYZE:
    ${text}
    `;

        return GeminiService.generate({
            prompt,
            requireGroundedSearch: false,
            responseSchema: {
                type: "object",
                properties: {
                    events: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                ticker: { type: "string" },
                                event_type: { type: "string", description: "e.g., earnings_miss, guidance_cut, fda_decision, analyst_upgrade, product_launch, m_and_a, tariff, price_movement" },
                                headline: { type: "string" },
                                severity: { type: "integer", description: "1-10 impact scale" }
                            },
                            required: ["ticker", "event_type", "headline", "severity"]
                        }
                    }
                },
                required: ["events"]
            },
            temperature: 0.1,
            model: GEMINI_MODEL_LITE,
        });
    }
}
