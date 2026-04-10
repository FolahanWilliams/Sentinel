import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { AgentService } from './agents';
import { AutoLearningService } from './autoLearningService';
import { MarketRegimeFilter } from './marketRegime';
import { MASTER_SCENARIOS } from './historicalScenarios';

export class HistoricalSimulationService {
    
    /**
     * Run a simulation for a specific historical scenario.
     * This orchestrates:
     * 1. Reconstructing historical news, prices, and REGIME.
     * 2. Running a "Time Travel" agent pipeline.
     * 3. Comparing agent output to realized outcomes.
     * 4. Feeding result into AutoLearning.
     */
    static async runScenario(scenarioId: string): Promise<any> {
        const scenario = MASTER_SCENARIOS.find(s => s.id === scenarioId);
        if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

        console.log(`[HistoricalSim] 🕒 Starting simulation: ${scenario.description} (${scenario.date})`);

        // 1. Fetch Historical Context (News + Prices + Regime)
        const [news, priceResult, regime] = await Promise.all([
            MarketDataService.getHistoricalNewsAtDate(scenario.ticker, scenario.date),
            supabase.functions.invoke('proxy-market-data', {
                body: { endpoint: 'historical', ticker: scenario.ticker, full: true }
            }),
            MarketRegimeFilter.detectHistorical(scenario.date)
        ]);
        
        const prices = (priceResult?.data?.data || []) as any[];
        prices.sort((a, b) => a.date.localeCompare(b.date));

        const entryMatch = prices.find(p => p.date >= scenario.date);
        const entryPrice = entryMatch?.close;

        // Data Proximity Guard
        if (entryMatch) {
            const entryDiff = (new Date(entryMatch.date).getTime() - new Date(scenario.date).getTime()) / (1000 * 60 * 60 * 24);
            if (entryDiff > 7) {
                console.error(`[HistoricalSim] Data gap detected for ${scenarioId} at ${scenario.date}`);
                return null;
            }
        }

        // Exit price is 5-10 days later
        const exitMatch = prices.find(p => {
            const daysDiff = (new Date(p.date).getTime() - new Date(scenario.date).getTime()) / (1000 * 60 * 60 * 24);
            return daysDiff >= 5 && daysDiff <= 10;
        });
        const exitPrice = exitMatch?.close;

        if (!entryPrice || !exitPrice) {
            console.error(`[HistoricalSim] Missing price data for scenario ${scenarioId}. Check data range.`);
            return null;
        }

        const actualReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
        const actualOutcome = (scenario.expectedDirection === 'long' && actualReturn > 0) || 
                               (scenario.expectedDirection === 'short' && actualReturn < 0) ? 'win' : 'loss';

        console.log(`[HistoricalSim] Regime detected for ${scenario.date}: ${regime.regime.toUpperCase()} (VIX ${regime.vixLevel})`);

        // 2. Run Agent Pipeline (Enhanced Time Travel Mode)
        const eventHeadline = news[0]?.title || scenario.description;
        const eventDesc = news.map(n => n.summary).join('\n\n');

        const analysis = await AgentService.evaluateOverreaction({
            ticker: scenario.ticker,
            eventHeadline: `[HISTORICAL SIM: ${scenario.date}] ${eventHeadline}`,
            eventDesc: `${eventDesc}\n\nIMPORTANT: TODAY IS ${scenario.date}. ALL DATA SOURCES ARE SNAPSHOTTED TO THIS TIME. DO NOT USE FUTURE KNOWLEDGE. PREDICT THE 5-10 DAY MOVEMENT FROM THE CAPTIONED EVENT.`,
            currentPrice: entryPrice,
            priceDropPct: 0, 
            regime: regime.regime, 
            performanceContext: MarketRegimeFilter.formatForPrompt(regime)
        });

        if (!analysis.data) return null;

        // 3. Save as Simulated Signal (Data Integrity)
        const { data: signal, error: signalErr } = await (supabase as any).from('signals').insert({
            ticker: scenario.ticker,
            signal_type: scenario.expectedDirection === 'long' ? 'long_overreaction' : 'short_overreaction',
            confidence_score: analysis.data.confidence_score,
            thesis: `[SIMULATION] ${analysis.data.thesis}`,
            is_paper: true,
            is_simulated: true,
            status: 'completed',
            bias_type: analysis.data.bias_type || 'recency_bias',
            risk_level: 'medium',
            agent_outputs: {
                overreaction: analysis.data,
                sim_meta: {
                    scenario_id: scenarioId,
                    scenario_date: scenario.date,
                    actual_return: actualReturn,
                    historical_regime: regime.regime
                }
            }
        }).select().single();

        if (signalErr || !signal) {
            console.error(`[HistoricalSim] Failed to save simulated signal:`, signalErr);
            return null;
        }

        // 4. Save Simulated Outcome
        const { error: outcomeErr } = await (supabase as any).from('signal_outcomes').insert({
            signal_id: signal.id,
            ticker: scenario.ticker,
            entry_price: entryPrice,
            price_at_5d: exitPrice,
            outcome: actualOutcome,
            return_at_5d: actualReturn,
            is_simulated: true,
            completed_at: new Date().toISOString()
        });

        if (outcomeErr) {
            console.error(`[HistoricalSim] Failed to save outcome for ${scenarioId}:`, outcomeErr);
        }

        return {
            scenarioId,
            agentConfidence: analysis.data.confidence_score,
            actualReturn,
            outcome: actualOutcome,
            regime: regime.regime
        };
    }

    /**
     * Run all Master Scenarios in bulk to "train" the system.
     */
    static async runBulkSimulation(): Promise<void> {
        console.log(`[HistoricalSim] 🚀 Starting bulk training Dojo on ${MASTER_SCENARIOS.length} scenarios...`);
        
        const results = [];
        for (const scenario of MASTER_SCENARIOS) {
            try {
                const res = await this.runScenario(scenario.id);
                if (res) results.push(res);
                console.log(`[HistoricalSim] ✅ Completed ${scenario.id}. Outcome: ${res?.outcome || 'Failed'}`);
            } catch (err) {
                console.error(`[HistoricalSim] ❌ Failed scenario ${scenario.id}:`, err);
            }
        }

        console.log(`[HistoricalSim] Bulk training complete. Results: ${results.length}/${MASTER_SCENARIOS.length}`);
        
        // Trigger global weight recalibration based on new historical data
        console.log('[HistoricalSim] 🧠 Recalibrating AI penalty weights...');
        await AutoLearningService.analyzeAndUpdateWeights({ force: true });
    }
}
