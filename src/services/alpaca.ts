/**
 * Sentinel — Alpaca Automated Execution Service
 * 
 * Handles routing of high-conviction paper trades to Alpaca Markets.
 * Uses the Paper Trading API credentials specified in .env.local.
 */

const ALPACA_API_ENDPOINT = 'https://paper-api.alpaca.markets/v2';

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

export class AlpacaService {
    private static getHeaders() {
        // Fallback checks — usually provided via Vite env or Deno env if run on backend
        const apiKey = import.meta.env.VITE_ALPACA_API_KEY;
        const secretKey = import.meta.env.VITE_ALPACA_SECRET_KEY;

        if (!apiKey || !secretKey) {
            console.error('[AlpacaService] Missing Alpaca API credentials. Trading is disabled.');
        }

        return {
            'APCA-API-KEY-ID': apiKey || '',
            'APCA-API-SECRET-KEY': secretKey || '',
            'Content-Type': 'application/json',
        };
    }

    /**
     * Get account details (Buying power, portfolio value, status)
     */
    static async getAccount() {
        try {
            const response = await fetch(`${ALPACA_API_ENDPOINT}/account`, {
                method: 'GET',
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Alpaca API Error (${response.status}): ${errorData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('[AlpacaService] Failed to fetch account:', error);
            return null;
        }
    }

    /**
     * Submit an advanced Bracket Order for automated execution
     */
    static async submitBracketOrder(
        ticker: string,
        shares: number,
        side: 'buy' | 'sell',
        limitPrice: number,
        targetPrice: number | null,
        stopLoss: number | null
    ) {
        try {
            if (shares <= 0 || !ticker) {
                console.warn(`[AlpacaService] Invalid order params for ${ticker}. Skipping execution.`);
                return null;
            }

            const payload: AlpacaOrder = {
                symbol: ticker,
                qty: shares,
                side,
                type: 'limit',
                time_in_force: 'gtc',
                limit_price: Number(limitPrice.toFixed(2)),
                extended_hours: false,
            };

            // Upgrade to Bracket order if risk constraints exist
            if (targetPrice || stopLoss) {
                payload.order_class = 'bracket';
                if (targetPrice) {
                    payload.take_profit = {
                        limit_price: Number(targetPrice.toFixed(2)),
                    };
                }
                if (stopLoss) {
                    payload.stop_loss = {
                        stop_price: Number(stopLoss.toFixed(2)),
                    };
                }
            }

            const response = await fetch(`${ALPACA_API_ENDPOINT}/orders`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Order Rejection (${response.status}): ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            console.log(`[AlpacaService] Successfully rooted ${payload.order_class} order for ${shares}x ${ticker}`);
            return data;
        } catch (error: any) {
            console.error(`[AlpacaService] Trade execution failed for ${ticker}:`, error);
            return null;
        }
    }
}
