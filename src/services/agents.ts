/**
 * Sentinel — Agent Pipeline Service
 * 
 * Orchestrates the execution of the 5 specialized AI Agents.
 * Each agent uses the GeminiService with specific schemas and prompts.
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
    SANITY_CHECK_SCHEMA
} from './schemas';
import type { AgentResult } from '@/types/agents';

export class AgentService {

    /**
     * 1. Overreaction Agent
     * Analyzes an event to determine if a price drop is an irrational overreaction.
     */
    static async evaluateOverreaction(ticker: string, eventHeadline: string, eventDesc: string, currentPrice: number, priceDropPct: number): Promise<AgentResult<any>> {
        const prompt = `
    TICKER: ${ticker}
    CURRENT PRICE: $${currentPrice.toFixed(2)} (Down ${priceDropPct.toFixed(2)}%)
    EVENT HEADLINE: ${eventHeadline}
    EVENT DESCRIPTION: ${eventDesc}
    
    Evaluate if this drop is an irrational overreaction presenting a mean-reversion buying opportunity.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: OVERREACTION_AGENT_PROMPT,
            requireGroundedSearch: true, // Needs real-time web context on the news
            responseSchema: OVERREACTION_SCHEMA
        });
    }

    /**
     * 2. Sector Contagion Agent
     * Evaluates if a satellite ticker is dropping unfairly due to an epicenter ticker's news.
     */
    static async evaluateContagion(epicenterTicker: string, satelliteTicker: string, epicenterNews: string, satelliteDropPct: number): Promise<AgentResult<any>> {
        const prompt = `
    EPICENTER TICKER: ${epicenterTicker}
    EPICENTER NEWS: ${epicenterNews}
    
    SATELLITE TICKER: ${satelliteTicker}
    SATELLITE DROP: ${satelliteDropPct.toFixed(2)}%
    
    Evaluate if ${satelliteTicker} is dropping purely in sympathy and lacks real exposure to the Epicenter's core issue.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: CONTAGION_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: CONTAGION_SCHEMA
        });
    }

    /**
     * 3. Earnings Overreaction Agent
     * Parses earnings misses against forward guidance.
     */
    static async evaluateEarnings(ticker: string, epsEstimate: number, epsActual: number, revenueEstimate: number, revenueActual: number, guidanceDetails: string, priceDropPct: number): Promise<AgentResult<any>> {
        const prompt = `
    TICKER: ${ticker}
    PRICE DROP: ${priceDropPct.toFixed(2)}%
    
    EPS EXPECTED: ${epsEstimate} | EPS ACTUAL: ${epsActual}
    REV EXPECTED: ${revenueEstimate} | REV ACTUAL: ${revenueActual}
    FORWARD GUIDANCE CONTEXT: ${guidanceDetails}
    
    Evaluate if this post-earnings drop is a mispricing because forward guidance outweighs the backward-looking miss.
    Return JSON perfectly matching the expected schema.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: EARNINGS_AGENT_PROMPT,
            requireGroundedSearch: true,
            responseSchema: EARNINGS_SCHEMA
        });
    }

    /**
     * 4. Sanity Check / Red Team Agent
     * Attacks a proposed trade thesis.
     */
    static async runSanityCheck(ticker: string, originalThesis: string, targetPrice: number, stopLoss: number, agentType: string): Promise<AgentResult<any>> {
        const prompt = `
    PROPOSED TRADE FOR TICKER: ${ticker}
    ORIGINATING AGENT: ${agentType}
    
    THESIS: "${originalThesis}"
    TARGET: $${targetPrice} | STOP LOSS: $${stopLoss}
    
    You are the RED TEAM. Tear this thesis apart. Find the fatal flaw.
    Research macro conditions, pending lawsuits, or sector rot.
    If it's a terrible trade, fail it. Return JSON.
    `;

        return GeminiService.generate({
            prompt,
            systemInstruction: SANITY_CHECK_AGENT_PROMPT,
            requireGroundedSearch: true, // Needs up-to-the-minute macro/legal context
            responseSchema: SANITY_CHECK_SCHEMA
        });
    }

    /**
     * 5. Extraction Agent (Helper)
     * Converts unstructured RSS text into structured Market Events.
     */
    static async extractEventsFromText(text: string): Promise<AgentResult<any>> {
        const prompt = `
    Extract notable market events (earnings misses, FDA decisions, extreme analyst downgrades, CEO departures) from the following text.
    Only return events that historically cause high volatility. Ignore fluff.
    
    TEXT TO ANALYZE:
    ${text}
    `;

        return GeminiService.generate({
            prompt,
            // No specific system prompt needed, master is enough
            requireGroundedSearch: false, // Just text parsing, no web search needed
            responseSchema: {
                type: "object",
                properties: {
                    events: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                ticker: { type: "string" },
                                event_type: { type: "string", description: "e.g., earnings_miss, guidance_cut, fda_decision" },
                                headline: { type: "string" },
                                severity: { type: "integer", description: "1-10 impact scale" }
                            },
                            required: ["ticker", "event_type", "headline", "severity"]
                        }
                    }
                },
                required: ["events"]
            }
        });
    }
}
