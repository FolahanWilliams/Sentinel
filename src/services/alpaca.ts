/**
 * Sentinel — Alpaca Automated Execution Service (client)
 *
 * Thin wrapper that routes all Alpaca calls through the `proxy-alpaca`
 * Edge Function. The API key + secret live as Supabase secrets server-side;
 * the client never sees credentials.
 */

import { supabase } from '@/config/supabase';

export interface AlpacaOrder {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
    time_in_force: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
    limit_price?: number;
    stop_price?: number;
    take_profit?: {
        limit_price: number;
    };
    stop_loss?: {
        stop_price: number;
        limit_price?: number;
    };
    order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
    extended_hours?: boolean;
}

interface ProxyResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

async function invokeProxy<T>(payload: Record<string, unknown>): Promise<ProxyResponse<T>> {
    const { data, error } = await supabase.functions.invoke<ProxyResponse<T>>('proxy-alpaca', {
        body: payload,
    });
    if (error) {
        return { success: false, error: error.message || 'proxy-alpaca invocation failed' };
    }
    return data || { success: false, error: 'Empty response from proxy-alpaca' };
}

export class AlpacaService {
    /**
     * Get account details (buying power, portfolio value, status).
     */
    static async getAccount() {
        const res = await invokeProxy<any>({ action: 'account' });
        if (!res.success) {
            console.error('[AlpacaService] getAccount failed:', res.error);
            return null;
        }
        return res.data;
    }

    /**
     * Submit a bracket order (paper-trading) via the server-side proxy.
     * Returns the order object on success, null on failure.
     */
    static async submitBracketOrder(
        ticker: string,
        shares: number,
        side: 'buy' | 'sell',
        limitPrice: number,
        targetPrice: number | null,
        stopLoss: number | null,
    ) {
        if (shares <= 0 || !ticker) {
            console.warn(`[AlpacaService] Invalid order params for ${ticker}. Skipping execution.`);
            return null;
        }

        const res = await invokeProxy<any>({
            action: 'submit_order',
            payload: {
                ticker,
                shares,
                side,
                limit_price: limitPrice,
                target_price: targetPrice,
                stop_loss: stopLoss,
            },
        });

        if (!res.success) {
            console.error(`[AlpacaService] Trade execution failed for ${ticker}:`, res.error);
            return null;
        }

        console.log(`[AlpacaService] Successfully routed bracket order for ${shares}x ${ticker}`);
        return res.data;
    }
}
