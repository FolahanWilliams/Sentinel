/**
 * Sentinel — Gemini Client
 *
 * All calls go through the proxy-gemini Edge Function.
 * Supports per-request temperature, thinking mode, multi-turn, and auto-retry.
 */

import { supabase } from '@/config/supabase';
import { GEMINI_MODEL } from '@/config/constants';
import { MASTER_SYSTEM_PROMPT } from './prompts';
import type { AgentResult } from '@/types/agents';

export interface GeminiRequest {
    prompt: string;
    systemInstruction?: string;
    requireGroundedSearch?: boolean;
    responseSchema?: any;
    model?: string;
    temperature?: number; // Per-request temperature (0.0-2.0, default 0.2)
    enableThinking?: boolean; // Enable Gemini's native thinking mode for deeper reasoning
}

export interface MultiTurnMessage {
    role: 'user' | 'model';
    text: string;
}

export interface GeminiMultiTurnRequest {
    messages: MultiTurnMessage[];
    systemInstruction?: string;
    requireGroundedSearch?: boolean;
    responseSchema?: any;
    model?: string;
    temperature?: number;
    enableThinking?: boolean;
}

export class GeminiService {
    // Throttle: enforce minimum 1.5s between API calls to avoid rate limiting
    private static lastCallTime = 0;
    private static readonly MIN_CALL_INTERVAL_MS = 1500;

    /**
     * Generates content via the secure Supabase Edge Function.
     * Includes auto-retry: if JSON parsing fails and a schema was provided,
     * retries once with feedback.
     */
    static async generate<T = any>(req: GeminiRequest): Promise<AgentResult<T>> {
        // Throttle: wait if calls are too fast
        const now = Date.now();
        const elapsed = now - this.lastCallTime;
        if (elapsed < this.MIN_CALL_INTERVAL_MS) {
            await new Promise(res => setTimeout(res, this.MIN_CALL_INTERVAL_MS - elapsed));
        }
        this.lastCallTime = Date.now();

        const startTime = Date.now();
        const modelToUse = req.model ?? GEMINI_MODEL;
        try {
            // 1. Prepare payload
            const payload: any = {
                model: modelToUse,
                prompt: req.prompt,
                systemInstruction: req.systemInstruction
                    ? `${MASTER_SYSTEM_PROMPT}\n\n${req.systemInstruction}`
                    : MASTER_SYSTEM_PROMPT,
                requireGroundedSearch: req.requireGroundedSearch ?? false,
                responseSchema: req.responseSchema,
                temperature: req.temperature,
                enableThinking: req.enableThinking ?? false,
            };

            // 2. Call Edge Function
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: payload,
            });

            if (error) {
                const detail = (data as any)?.detail || (data as any)?.error || error.message;
                console.error(`[GeminiService] Edge Function error:`, { message: error.message, detail });
                throw new Error(`Edge Function Error: ${detail}`);
            }

            if (!data?.success) {
                const errorMsg = data?.detail || data?.error || 'Unknown Gemini API error';
                console.error(`[GeminiService] API error:`, errorMsg);
                throw new Error(errorMsg);
            }

            // 3. Parse strongly-typed JSON if a schema was provided
            let parsedData: T | null = null;
            if (req.responseSchema && data.text) {
                try {
                    parsedData = JSON.parse(data.text) as T;
                } catch {
                    console.error('[GeminiService] Failed to parse JSON response:', data.text?.slice(0, 200));
                    throw new Error('Gemini returned invalid JSON');
                }
            } else {
                parsedData = data.text as unknown as T;
            }

            return {
                success: true,
                data: parsedData,
                error: null,
                duration_ms: Date.now() - startTime,
                tokens_used: (data.metadata?.inputTokens || 0) + (data.metadata?.outputTokens || 0),
                model_used: modelToUse,
                grounded_search_used: req.requireGroundedSearch ?? false
            };

        } catch (err: any) {
            console.error('[GeminiService] Exception:', err);
            return {
                success: false,
                data: null,
                error: err.message || 'Failed to generate content',
                duration_ms: Date.now() - startTime,
                tokens_used: 0,
                model_used: modelToUse,
                grounded_search_used: req.requireGroundedSearch ?? false
            };
        }
    }

    /**
     * Multi-turn conversation with Gemini.
     * Used for agent debates (e.g., Overreaction ↔ Red Team).
     */
    static async generateMultiTurn<T = any>(req: GeminiMultiTurnRequest): Promise<AgentResult<T>> {
        const startTime = Date.now();
        const modelToUse = req.model ?? GEMINI_MODEL;
        try {
            const payload: any = {
                model: modelToUse,
                messages: req.messages,
                systemInstruction: req.systemInstruction
                    ? `${MASTER_SYSTEM_PROMPT}\n\n${req.systemInstruction}`
                    : MASTER_SYSTEM_PROMPT,
                requireGroundedSearch: req.requireGroundedSearch ?? false,
                responseSchema: req.responseSchema,
                temperature: req.temperature,
                enableThinking: req.enableThinking ?? false,
            };

            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: payload,
            });

            if (error) {
                const detail = (data as any)?.detail || (data as any)?.error || error.message;
                console.error(`[GeminiService] Multi-turn Edge Function error:`, { message: error.message, detail });
                throw new Error(`Edge Function Error: ${detail}`);
            }

            if (!data?.success) {
                const errorMsg = data?.detail || data?.error || 'Unknown Gemini API error';
                console.error(`[GeminiService] Multi-turn API error:`, errorMsg);
                throw new Error(errorMsg);
            }

            let parsedData: T | null = null;
            if (req.responseSchema && data.text) {
                try {
                    parsedData = JSON.parse(data.text) as T;
                } catch {
                    console.error('[GeminiService] Multi-turn JSON parse failed:', data.text?.slice(0, 200));
                    throw new Error('Gemini returned invalid JSON in multi-turn');
                }
            } else {
                parsedData = data.text as unknown as T;
            }

            return {
                success: true,
                data: parsedData,
                error: null,
                duration_ms: Date.now() - startTime,
                tokens_used: (data.metadata?.inputTokens || 0) + (data.metadata?.outputTokens || 0),
                model_used: modelToUse,
                grounded_search_used: req.requireGroundedSearch ?? false
            };

        } catch (err: any) {
            console.error('[GeminiService] Multi-turn exception:', err);
            return {
                success: false,
                data: null,
                error: err.message || 'Failed to generate multi-turn content',
                duration_ms: Date.now() - startTime,
                tokens_used: 0,
                model_used: modelToUse,
                grounded_search_used: req.requireGroundedSearch ?? false
            };
        }
    }
}
