import { useState } from 'react';
import { Play, History, Brain, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { HistoricalSimulationService, MASTER_SCENARIOS } from '@/services/historicalSimulation';
import { AutoLearningService } from '@/services/autoLearningService';
import type { SimulationScenario } from '@/services/historicalScenarios';

export function SimulatorTab() {
    const [results, setResults] = useState<any[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [learningStatus, setLearningStatus] = useState<string | null>(null);

    const runScenario = async (id: string) => {
        setIsRunning(true);
        try {
            const res = await HistoricalSimulationService.runScenario(id);
            if (res) {
                setResults(prev => [res, ...prev]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsRunning(false);
        }
    };

    const runAll = async () => {
        setIsRunning(true);
        setLearningStatus('Training agents on Golden Dataset...');
        try {
            for (const s of MASTER_SCENARIOS) {
                const res = await HistoricalSimulationService.runScenario(s.id);
                if (res) setResults(prev => [res, ...prev]);
            }
            setLearningStatus('Bulk hydration complete! Updating weights...');
            await AutoLearningService.analyzeAndUpdateWeights({ force: true });
            setLearningStatus('Auto-Learning successfully hydrated with historical context.');
        } catch (err) {
            console.error(err);
            setLearningStatus('Error during bulk training.');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center p-6 bg-slate-900/50 rounded-2xl border border-slate-800 backdrop-blur-md">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <History className="text-indigo-400" />
                        Historical Simulation Engine
                    </h2>
                    <p className="text-slate-400 mt-1 italic text-sm">
                        "Time travel" agents to past major events to optimize penalty weights.
                    </p>
                </div>
                <button 
                    onClick={runAll}
                    disabled={isRunning}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                    <Brain className={isRunning ? "animate-pulse" : ""} size={18} />
                    {isRunning ? "Simulating..." : "Run Golden Dataset"}
                </button>
            </div>

            {learningStatus && (
                <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 animate-pulse">
                    <CheckCircle size={20} />
                    {learningStatus}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {MASTER_SCENARIOS.map((scenario: SimulationScenario) => (
                    <div key={scenario.id} className="p-5 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-indigo-500/50 transition-colors group">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-xs font-mono text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded-md mb-2 inline-block">
                                    {scenario.date}
                                </span>
                                <h3 className="text-lg font-bold text-white">{scenario.ticker}</h3>
                            </div>
                            <button 
                                onClick={() => runScenario(scenario.id)}
                                disabled={isRunning}
                                className="p-2 bg-slate-700 hover:bg-indigo-600 rounded-lg text-white transition-colors disabled:opacity-50"
                            >
                                <Play size={16} fill="currentColor" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed mb-4">
                            {scenario.description}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold uppercase ${scenario.expectedDirection === 'long' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                Expected: {scenario.expectedDirection}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {results.length > 0 && (
                <div className="mt-8 space-y-4">
                    <h3 className="text-xl font-bold text-white">Simulation Results</h3>
                    <div className="space-y-3">
                        {results.map((r, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-900/80 rounded-xl border border-slate-800 animate-in slide-in-from-left-4 duration-500">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${r.outcome === 'win' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {r.outcome === 'win' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                    </div>
                                    <div>
                                        <div className="text-white font-semibold flex items-center gap-2">
                                            {r.scenarioId.replace(/-/g, ' ').toUpperCase()}
                                            <span className={`text-xs ${r.outcome === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                ({r.outcome.toUpperCase()})
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Actual 5d Return: {r.actualReturn.toFixed(2)}% | Agent Confidence: {r.agentConfidence}%
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-slate-300">Similarity Match</div>
                                    <div className="text-white font-mono font-bold">94%</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
