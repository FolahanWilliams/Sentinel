/**
 * AgentReasoning — Shows raw agent output data in a structured, readable format.
 */

import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';

interface AgentReasoningProps {
    agentOutputs?: Record<string, any>;
}

const AGENT_META: Record<string, { label: string; color: string }> = {
    overreaction: { label: 'Overreaction Agent', color: '#3B82F6' },
    contagion: { label: 'Contagion Agent', color: '#8B5CF6' },
    earnings: { label: 'Earnings Agent', color: '#10B981' },
    event_detector: { label: 'Event Detector', color: '#F59E0B' },
    bias_classifier: { label: 'Bias Classifier', color: '#EC4899' },
    sanity_checker: { label: 'Sanity Checker', color: '#EF4444' },
    red_team: { label: 'Red Team', color: '#EF4444' },
    historical_matcher: { label: 'Historical Matcher', color: '#6366F1' },
    signal_synthesizer: { label: 'Signal Synthesizer', color: '#14B8A6' },
};

export function AgentReasoning({ agentOutputs }: AgentReasoningProps) {
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

    if (!agentOutputs || Object.keys(agentOutputs).length === 0) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sentinel-400" /> Agent Reasoning
                </h3>
                <p className="text-sm text-sentinel-500 text-center py-4">No agent data available.</p>
            </div>
        );
    }

    const agents = Object.entries(agentOutputs);

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Bot className="w-4 h-4 text-sentinel-400" /> Agent Reasoning ({agents.length} agents)
            </h3>

            <div className="space-y-2">
                {agents.map(([key, data]) => {
                    const meta = AGENT_META[key] || { label: key.replace(/_/g, ' '), color: '#6B7280' };
                    const isExpanded = expandedAgent === key;

                    // Extract key summary fields if available
                    const thesis = data?.thesis || data?.reasoning || data?.explanation;
                    const confidence = data?.confidence_score || data?.confidence || data?.pattern_confidence;

                    return (
                        <div key={key} className="rounded-lg border border-sentinel-800/50 overflow-hidden">
                            <button
                                onClick={() => setExpandedAgent(isExpanded ? null : key)}
                                className="w-full flex items-center justify-between p-3 hover:bg-sentinel-800/30 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: meta.color }}
                                    />
                                    <span className="text-sm font-medium text-sentinel-200 capitalize">
                                        {meta.label}
                                    </span>
                                    {confidence != null && (
                                        <span className="text-xs font-mono text-sentinel-500">
                                            {typeof confidence === 'number' ? `${confidence}%` : confidence}
                                        </span>
                                    )}
                                </div>
                                {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-sentinel-500" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-sentinel-500" />
                                )}
                            </button>

                            {isExpanded && (
                                <div className="px-3 pb-3 border-t border-sentinel-800/30">
                                    {thesis && (
                                        <p className="text-sm text-sentinel-300 mt-2 mb-3 leading-relaxed">
                                            {thesis}
                                        </p>
                                    )}
                                    <div className="bg-black/40 rounded-lg p-3 overflow-auto max-h-[300px]">
                                        <pre className="text-xs text-sentinel-400 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(data, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
