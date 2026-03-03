/**
 * Sentinel — Gemini Client
 *
 * All calls go through the proxy-gemini Edge Function.
 * Default model: gemini-3-flash
 */

import { supabase } from '@/config/supabase';
import { GEMINI_MODEL } from '@/config/constants';
import { MASTER_SYSTEM_PROMPT } from './prompts';
import type { AgentResult } from '@/types/agents';

export interface GeminiRequest {
    prompt: string;
    systemInstruction?: string;
    requireGroundedSearch?: boolean;
    responseSchema?: any; // The JSON schema definitions
    model?: string; // Override the default model (e.g., for Flash-Lite)
}

export class GeminiService {
    /**
     * Generates content via the secure Supabase Edge Function
     */
    static async generate<T = any>(req: GeminiRequest): Promise<AgentResult<T>> {
        const startTime = Date.now();
        const modelToUse = req.model ?? GEMINI_MODEL;
        try {
            // 1. Prepare payload
            const payload = {
                model: modelToUse,
                prompt: req.prompt,
                // Always prepend our master objective to any specific agent prompt
                systemInstruction: req.systemInstruction
                    ? `${MASTER_SYSTEM_PROMPT}\n\n${req.systemInstruction}`
                    : MASTER_SYSTEM_PROMPT,
                requireGroundedSearch: req.requireGroundedSearch ?? false,
                responseSchema: req.responseSchema
            };

            // 2. Call Edge Function
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: payload,
            });

            if (error) {
                throw new Error(`Edge Function Error: ${error.message}`);
            }

            if (!data?.success) {
                throw new Error(data?.error || 'Unknown Gemini API error');
            }

            // 3. Parse strongly-typed JSON if a schema was provided
            let parsedData: T | null = null;
            if (req.responseSchema && data.text) {
                try {
                    parsedData = JSON.parse(data.text) as T;
                } catch (parseErr) {
                    console.error('[GeminiService] Failed to parse JSON response:', data.text);
                    throw new Error('Gemini returned invalid JSON');
                }
            } else {
                // Just return raw text cast to T
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
}
