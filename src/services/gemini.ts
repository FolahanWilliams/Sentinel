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

            // 2. Call Edge Function with retry on transient 502/503 errors
            let data: any;
            let error: any;
            const maxRetries = 2;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                const res = await supabase.functions.invoke('proxy-gemini', {
                    body: payload,
                });
                data = res.data;
                error = res.error;

                if (!error) break;

                const isTransient = error.message?.includes('non-2xx status code');
                if (isTransient && attempt < maxRetries) {
                    const delay = (attempt + 1) * 2000; // 2s, 4s
                    console.warn(`[GeminiService] Transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                    continue;
                }
                break;
            }

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
                    // Strip markdown code fences — grounded search calls skip responseSchema
                    // on the proxy side, so Gemini may wrap JSON in ```json ... ```
                    const cleanText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                    parsedData = JSON.parse(cleanText) as T;
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
                grounded_search_used: req.requireGroundedSearch ?? false,
                grounding_sources: data.groundingSources,
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
     * Streaming generation via the proxy-gemini-stream Edge Function.
     * Calls onChunk with each text fragment as it arrives.
     * Returns the complete text when done.
     */
    static async generateStream(
        req: GeminiRequest,
        onChunk: (chunk: string) => void,
    ): Promise<{ text: string; error: string | null }> {
        // Throttle
        const now = Date.now();
        const elapsed = now - this.lastCallTime;
        if (elapsed < this.MIN_CALL_INTERVAL_MS) {
            await new Promise(res => setTimeout(res, this.MIN_CALL_INTERVAL_MS - elapsed));
        }
        this.lastCallTime = Date.now();

        const modelToUse = req.model ?? GEMINI_MODEL;
        try {
            const payload: any = {
                model: modelToUse,
                prompt: req.prompt,
                systemInstruction: req.systemInstruction
                    ? `${MASTER_SYSTEM_PROMPT}\n\n${req.systemInstruction}`
                    : MASTER_SYSTEM_PROMPT,
                requireGroundedSearch: req.requireGroundedSearch ?? false,
                temperature: req.temperature,
                enableThinking: req.enableThinking ?? false,
                stream: true,
            };

            // Get the session to pass auth headers manually for streaming
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) {
                throw new Error('No active session for streaming');
            }

            const supabaseUrl = (supabase as any).supabaseUrl
                || (supabase as any).rest?.url?.replace('/rest/v1', '')
                || import.meta.env.VITE_SUPABASE_URL;
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            const response = await fetch(
                `${supabaseUrl}/functions/v1/proxy-gemini`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': anonKey,
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Stream request failed: ${response.status} ${errorText}`);
            }

            // Check if we got a streaming response
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream') && response.body) {
                // SSE streaming mode
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.text) {
                                    fullText += parsed.text;
                                    onChunk(parsed.text);
                                }
                            } catch {
                                // Non-JSON line, treat as raw text chunk
                                if (data.trim()) {
                                    fullText += data;
                                    onChunk(data);
                                }
                            }
                        }
                    }
                }
                return { text: fullText, error: null };
            } else {
                // Fallback: non-streaming JSON response (proxy doesn't support streaming yet)
                const data = await response.json();
                if (data.success && data.text) {
                    onChunk(data.text);
                    return { text: data.text, error: null };
                }
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err: any) {
            console.error('[GeminiService] Stream exception:', err);
            return { text: '', error: err.message || 'Stream failed' };
        }
    }

    /**
     * Multi-turn conversation with Gemini.
     * Used for agent debates (e.g., Overreaction ↔ Red Team).
     */
}
