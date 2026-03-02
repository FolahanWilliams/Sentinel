import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Interface shared with the client
interface Quote {
    ticker: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    previousClose: number;
    open: number;
    high: number;
    low: number;
    marketCap?: number;
    peRatio?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    lastUpdated: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Verify Auth
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // 2. Parse Request
        const { endpoint, ticker } = await req.json()
        if (!endpoint) throw new Error('Missing endpoint')
        if (!ticker) throw new Error('Missing ticker')

        // 3. Load Secrets
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY secret is not set')

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const PROVIDER = 'ai-scraper'
        console.log(`[proxy-market-data] ${endpoint} for ${ticker} via ${PROVIDER}`)

        const startTime = Date.now()
        let responseData: any = null

        // 4. Route Provider
        if (endpoint === 'quote') {
            const tickerUpper = ticker.toUpperCase()
            let html = '';
            let url = `https://finance.yahoo.com/quote/${tickerUpper}/`;
            let source = 'Yahoo Finance';

            console.log(`[proxy-market-data] Fetching HTML from ${url}`);
            let res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': 'consent=true; auth=true'
                }
            });

            html = await res.text();

            // Detect if Yahoo returned a GDPR Consent Wall or Rate Limit (or 404/429)
            if (!res.ok || html.includes('consent.yahoo.com') || html.includes('guce.yahoo.com')) {
                console.warn(`[proxy-market-data] Yahoo Finance blocked request (GDPR/429). Triggering fallback...`);

                if (['BTC', 'ETH', 'SOL'].includes(tickerUpper)) {
                    url = `https://www.cnbc.com/quotes/${tickerUpper}=`;
                    source = 'CNBC (Fallback)';
                } else if (tickerUpper === 'VIX' || tickerUpper === '^VIX') {
                    url = `https://www.cnbc.com/quotes/.VIX`;
                    source = 'CNBC (Fallback)';
                } else {
                    url = `https://finviz.com/quote.ashx?t=${tickerUpper}`;
                    source = 'Finviz (Fallback)';
                }

                console.log(`[proxy-market-data] Fetching HTML from ${url}`);
                res = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html',
                    }
                });

                if (!res.ok) {
                    throw new Error(`All scraping sources failed for ${tickerUpper}. Primary and Fallback blocked.`);
                }

                html = await res.text();
            }

            // Call Gemini REST API to parse the HTML
            console.log(`[proxy-market-data] Parsing ${source} HTML with Gemini`);
            const prompt = `Extract from this ${source} HTML for ${tickerUpper}: current price, daily change amount, daily change percentage (as a number, dropping the % sign), open, high, low, volume, and previous close. Output as JSON only matching this exact schema: { "price": number, "change": number, "changePercent": number, "volume": number, "previousClose": number, "open": number, "high": number, "low": number }. If a value is missing, use 0. Return a clean JSON object.\n\nHTML Data:\n${html.slice(0, 45000)}`;

            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                }
            };

            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );

            if (!geminiRes.ok) throw new Error(`Gemini API Error: ${await geminiRes.text()}`);
            const data = await geminiRes.json();

            let text = ''
            if (data.candidates && data.candidates.length > 0) {
                text = data.candidates[0].content.parts[0].text;

                // Strip markdown backticks if Gemini wraps the JSON
                if (text.startsWith('```json')) {
                    text = text.replace(/^```json/, '').replace(/```$/, '').trim();
                } else if (text.startsWith('```')) {
                    text = text.replace(/^```/, '').replace(/```$/, '').trim();
                }
            }

            let parsed: any = {};
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                console.error("[proxy-market-data] Failed to parse Gemini JSON:", text, e);
            }

            responseData = {
                success: true,
                data: {
                    ticker: tickerUpper,
                    price: Number(parsed.price) || 0,
                    change: Number(parsed.change) || 0,
                    changePercent: Number(parsed.changePercent) || 0,
                    volume: Number(parsed.volume) || 0,
                    previousClose: Number(parsed.previousClose) || 0,
                    open: Number(parsed.open) || 0,
                    high: Number(parsed.high) || 0,
                    low: Number(parsed.low) || 0,
                    lastUpdated: new Date().toISOString()
                } as Quote
            }
        } else {
            throw new Error(`Unsupported endpoint: ${endpoint} for provider ${PROVIDER}`)
        }

        const durationMs = Date.now() - startTime

        // 5. Log API Usage
        // Bypassing RLS using Service Role Key
        await supabaseAdmin.from('api_usage').insert({
            provider: PROVIDER,
            endpoint,
            ticker,
            latency_ms: durationMs,
            success: true,
            estimated_cost_usd: 0.0001
        })

        // 6. Return Data
        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error(`[proxy-market-data] Error:`, error.message)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
