import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { MASTER_SCENARIOS } from '../services/historicalScenarios';
import { HistoricalSimulationService } from '../services/historicalSimulation';
import { Terminal, Play, Zap, History, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip } from 'recharts';

const TrainingDojo: React.FC = () => {
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState<string[]>([]);
    const [results, setResults] = useState<any[]>([]);
    const [currentScenario, setCurrentScenario] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            const { data } = await (supabase as any)
                .from('signal_outcomes')
                .select(`
                    id, 
                    return_at_5d, 
                    outcome, 
                    signals!inner(confidence_score, agent_outputs)
                `)
                .eq('is_simulated', true)
                .order('completed_at', { ascending: false })
                .limit(100);
            
            if (data) {
                const formatted = data.map((d: any) => ({
                    scenarioId: d.signals?.agent_outputs?.sim_meta?.scenario_id || 'Historical',
                    agentConfidence: d.signals?.confidence_score ?? 0,
                    actualReturn: d.return_at_5d ?? 0,
                    outcome: d.outcome,
                    regime: d.signals?.agent_outputs?.sim_meta?.historical_regime || 'neutral'
                }));
                setResults(formatted);
            }
        };
        fetchHistory();
    }, []);

    const log = (msg: string) => {
        setProgress(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const runBulk = async () => {
        setIsRunning(true);
        setResults([]);
        log('Starting Bulk Training Dojo: processing 15+ master scenarios...');
        
        for (const scenario of MASTER_SCENARIOS) {
            setCurrentScenario(scenario.id);
            log(`Simulating: ${scenario.description} (${scenario.date})`);
            try {
                const res = await HistoricalSimulationService.runScenario(scenario.id);
                if (res) {
                    setResults(prev => [...prev, res]);
                    log(`✅ Result: Agent Confidence ${res.agentConfidence} | Actual: ${res.outcome.toUpperCase()}`);
                }
            } catch (err) {
                log(`❌ Error in ${scenario.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        
        log('Bulk simulations complete. Recalibrating global weights...');
        setIsRunning(false);
        setCurrentScenario(null);
    };

    const runSingle = async (id: string) => {
        setIsRunning(true);
        setCurrentScenario(id);
        log(`Triggering single scenario: ${id}`);
        try {
            const res = await HistoricalSimulationService.runScenario(id);
            if (res) {
                setResults(prev => [...prev, res]);
                log(`✅ Result: ${res.outcome.toUpperCase()}`);
            }
        } catch (err) {
            log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        setIsRunning(false);
        setCurrentScenario(null);
    };

    const winRate = results.length > 0 
        ? Math.round((results.filter(r => r.outcome === 'win').length / results.length) * 100) 
        : 0;

    return (
        <div className="p-6 space-y-6 bg-[#0B0F1A] min-h-screen text-white">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                        Training Dojo
                    </h1>
                    <p className="text-slate-400 mt-1">Simulate historical cycles to calibrate Agent accuracy.</p>
                </div>
                <button 
                    disabled={isRunning}
                    onClick={runBulk}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 transition rounded-lg font-semibold"
                >
                    {isRunning ? <Zap className="animate-spin size-5" /> : <Play className="size-5" />}
                    {isRunning ? 'Training In Progress...' : 'Start Bulk Training'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Terminal Log */}
                <div className="lg:col-span-2 bg-[#151B2B] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[400px]">
                    <div className="bg-[#1C2438] px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                        <Terminal className="size-4 text-emerald-400" />
                        <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Simulation Console</span>
                    </div>
                    <div className="flex-1 p-4 font-mono text-sm space-y-2 overflow-y-auto bg-[#0F1420]">
                        {progress.length === 0 && (
                            <div className="text-slate-600 italic">Console idle. Awaiting mission parameters...</div>
                        )}
                        {progress.map((p, i) => (
                            <div key={i} className={p.includes('❌') ? 'text-red-400' : p.includes('✅') ? 'text-emerald-400' : 'text-slate-300'}>
                                {p}
                            </div>
                        ))}
                        {currentScenario && (
                            <div className="text-blue-400 animate-pulse">Running {currentScenario}...</div>
                        )}
                    </div>
                </div>

                {/* 2. Accuracy Stats */}
                <div className="bg-[#151B2B] border border-slate-800 rounded-xl p-6 flex flex-col justify-center items-center text-center">
                    <History className="size-12 text-slate-600 mb-4" />
                    <div className="text-5xl font-bold text-white mb-2">{winRate}%</div>
                    <div className="text-slate-400 uppercase text-xs tracking-widest font-semibold mb-6">Historical Accuracy</div>
                    
                    <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="bg-[#0F1420] p-4 rounded-lg border border-slate-800">
                            <div className="text-emerald-400 font-bold text-xl">{results.length}</div>
                            <div className="text-slate-500 text-[10px] uppercase">Sims Run</div>
                        </div>
                        <div className="bg-[#0F1420] p-4 rounded-lg border border-slate-800">
                            <div className="text-blue-400 font-bold text-xl">{results.filter(r => r.outcome === 'win').length}</div>
                            <div className="text-slate-500 text-[10px] uppercase">Matches</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. Scenario Library */}
                <div className="bg-[#151B2B] border border-slate-800 rounded-xl">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold">
                            <Target className="size-5 text-emerald-400" />
                            Scenario Library
                        </div>
                        <span className="text-xs text-slate-500">{MASTER_SCENARIOS.length} Total</span>
                    </div>
                    <div className="p-2 h-[500px] overflow-y-auto">
                        {MASTER_SCENARIOS.map((s) => (
                            <div 
                                key={s.id}
                                className={`flex items-center justify-between p-3 rounded-lg hover:bg-[#1C2438] transition border border-transparent ${currentScenario === s.id ? 'bg-[#1C2438] border-blue-500/30' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`size-10 rounded bg-[#0F1420] flex items-center justify-center font-bold text-xs ${s.expectedDirection === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {s.ticker}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold">{s.description.split(' — ')[0]}</div>
                                        <div className="text-[10px] text-slate-500 font-mono italic">{s.date}</div>
                                    </div>
                                </div>
                                <button 
                                    disabled={isRunning}
                                    onClick={() => runSingle(s.id)}
                                    className="p-2 hover:bg-[#0F1420] rounded border border-slate-800 transition text-slate-400 hover:text-emerald-400 disabled:opacity-30"
                                >
                                    <Play className="size-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Confidence Calibration Map */}
                <div className="bg-[#151B2B] border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold">
                            <TrendingUp className="size-5 text-blue-400" />
                            Confidence vs. Reality
                        </div>
                        <div className="text-xs text-slate-500">Live Calibration Map</div>
                    </div>
                    
                    <div className="h-[400px]">
                        {results.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" />
                                    <XAxis 
                                        type="number" 
                                        dataKey="agentConfidence" 
                                        name="Confidence" 
                                        unit="%" 
                                        stroke="#718096"
                                        domain={[0, 100]}
                                    />
                                    <YAxis 
                                        type="number" 
                                        dataKey="actualReturn" 
                                        name="Return" 
                                        unit="%" 
                                        stroke="#718096"
                                    />
                                    <ZAxis type="number" range={[100, 100]} />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={(props: any) => {
                                        const { active, payload } = props;
                                        if (active && payload && payload.length > 0 && payload[0].payload) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-[#1C2438] border border-slate-700 p-3 rounded-lg shadow-xl text-xs">
                                                    <div className="font-bold text-white mb-1">{data.scenarioId}</div>
                                                    <div className="text-slate-400 italic mb-2 capitalize">{data.regime} Regime</div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-400">Agent Confidence:</span>
                                                        <span className="text-blue-400 font-bold">{data.agentConfidence}%</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-slate-400">5d Return:</span>
                                                        <span className={data.actualReturn > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                                                            {data.actualReturn.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} />
                                    <Scatter 
                                        name="Results" 
                                        data={results} 
                                        fill="#3B82F6"
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 grayscale">
                                <AlertTriangle className="size-8 text-slate-500 mb-4" />
                                <div className="text-slate-500 text-sm italic">Run simulation to generate calibration data.</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrainingDojo;
