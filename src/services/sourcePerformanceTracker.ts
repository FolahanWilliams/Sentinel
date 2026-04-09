import { supabase } from '@/config/supabase';

export interface SourceWinRate {
    sourceDomain: string;
    totalSignals: number;
    winningSignals: number;
    winRate: number;      // e.g. 0.65 for 65%
    weight: number;       // Multiplier e.g. 1.2
}

export class SourcePerformanceTracker {
    // Defines how much we boost or penalize. E.g. 1.2x boost for high win rate.
    private static readonly HIGH_WIN_RATE = 0.60;
    private static readonly LOW_WIN_RATE = 0.35;
    
    /**
     * Extracts the core domain from a URL to use as the source.
     */
    static getDomain(sourceUrl: string): string {
        try {
            const url = new URL(sourceUrl);
            return url.hostname.replace('www.', '');
        } catch {
            return 'unknown';
        }
    }

    /**
     * Called when an outcome is resolved as profitable/unprofitable.
     */
    static async recordSignalSource(ticker: string, sourceUrl: string, isWinner: boolean): Promise<void> {
        const domain = this.getDomain(sourceUrl);
        
        try {
            // First select the existing stats
            const { data: existing } = await supabase
                .from('source_performance')
                .select('*')
                .eq('domain', domain)
                .maybeSingle();

            if (existing) {
                const total = existing.total_signals + 1;
                const wins = existing.winning_signals + (isWinner ? 1 : 0);
                
                await supabase
                    .from('source_performance')
                    .update({
                        total_signals: total,
                        winning_signals: wins,
                        win_rate: wins / total,
                        last_updated: new Date().toISOString()
                    })
                    .eq('domain', domain);
            } else {
                await supabase
                    .from('source_performance')
                    .insert({
                        domain,
                        total_signals: 1,
                        winning_signals: isWinner ? 1 : 0,
                        win_rate: isWinner ? 1 : 0
                    });
            }
            console.log(`[SourcePerformanceTracker] Recorded outcome for ${domain} (${isWinner ? 'WIN' : 'LOSS'})`);
        } catch (err) {
            console.warn(`[SourcePerformanceTracker] Failed to record source ${domain}:`, err);
        }
    }

    /**
     * Returns a confidence multiplier based on historical win rate.
     */
    static async getSourceWeight(sourceUrl: string): Promise<number> {
        const domain = this.getDomain(sourceUrl);
        
        try {
            const { data } = await supabase
                .from('source_performance')
                .select('win_rate, total_signals')
                .eq('domain', domain)
                .maybeSingle();

            if (!data || data.total_signals < 5) {
                return 1.0; // Neutral if not enough data
            }

            if (data.win_rate >= this.HIGH_WIN_RATE) {
                return 1.15; // 15% boost for elite sources
            }
            if (data.win_rate <= this.LOW_WIN_RATE) {
                return 0.85; // 15% penalty for noisy sources
            }

            return 1.0;
        } catch (err) {
            return 1.0;
        }
    }
}
