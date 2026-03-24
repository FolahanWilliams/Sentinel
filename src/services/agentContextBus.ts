/**
 * Sentinel — Agent Context Bus
 *
 * Provides cascading context between all agents in the pipeline.
 * Previously, only the Red Team received prior agent output. Now ALL agents
 * can read and contribute to a shared context object that flows through the
 * entire pipeline.
 *
 * Context flows:
 *   Primary Agent → Bias Detective → Red Team → Self-Critique → Noise Panel → Decision Twin → SWOT
 *
 * Each stage enriches the context, and downstream agents can reference
 * upstream findings for more targeted analysis.
 */

import type {
    OverreactionResult,
    SanityCheckResult,
    BiasDetectiveResult,
    NoiseConfidenceResult,
    DecisionTwinResult,
    BullishCatalystResult,
    SWOTResult,
} from '@/types/agents';
import type { TASnapshot } from '@/types/signals';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AgentContext {
    // Identity
    ticker: string;
    headline: string;
    signalType: string;

    // Primary agent output
    primaryAgent?: {
        name: string;
        thesis: string;
        reasoning: string;
        confidence: number;
        convictionScore?: number;
        moatRating?: number;
        lynchCategory?: string;
        identifiedBiases?: string[];
        financialImpact?: string;
        direction: 'long' | 'short';
    };

    // Technical context
    taSnapshot?: TASnapshot | null;
    taAlignment?: string;

    // Bias Detective output (feeds into Red Team + Self-Critique)
    biasDetective?: {
        findings: Array<{ bias_name: string; severity: number; evidence: string }>;
        totalPenalty: number;
        dominantBias: string;
        adjustedConfidence: number;
    };

    // Red Team output (feeds into Self-Critique + Decision Twin)
    redTeam?: {
        passesSanityCheck: boolean;
        riskScore: number;
        fatalFlaws: string[];
        counterThesis: string;
    };

    // Self-Critique output
    selfCritique?: {
        criticalFlaws: string[];
        minorFlaws: string[];
        adjustedConfidence: number;
    };

    // Noise Panel output (feeds into Decision Twin)
    noisePanel?: {
        scores: [number, number, number];
        stdDev: number;
        convergent: boolean;
        divergent: boolean;
    };

    // Decision Twin output (feeds into SWOT)
    decisionTwin?: {
        verdicts: { value: string; momentum: string; risk: string };
        unanimousTake: boolean;
        skipCount: number;
        summary: string;
    };

    // Market context
    regime?: string;
    fearGreedScore?: number;

    // Accumulated confidence adjustments (for audit trail)
    confidenceTrail: Array<{
        stage: string;
        before: number;
        after: number;
        adjustment: number;
        reason: string;
    }>;
}

// ── Bus Implementation ──────────────────────────────────────────────────────────

export class AgentContextBus {

    /**
     * Create a fresh context for a new signal pipeline run.
     */
    static create(ticker: string, headline: string, signalType: string): AgentContext {
        return {
            ticker,
            headline,
            signalType,
            confidenceTrail: [],
        };
    }

    /**
     * Record a confidence adjustment with audit trail.
     */
    static recordAdjustment(
        ctx: AgentContext,
        stage: string,
        before: number,
        after: number,
        reason: string,
    ): void {
        ctx.confidenceTrail.push({
            stage,
            before,
            after,
            adjustment: after - before,
            reason,
        });
    }

    /**
     * Set primary agent output on the context.
     */
    static setPrimaryAgent(
        ctx: AgentContext,
        result: OverreactionResult | BullishCatalystResult,
        agentName: string,
    ): void {
        ctx.primaryAgent = {
            name: agentName,
            thesis: result.thesis,
            reasoning: result.reasoning,
            confidence: result.confidence_score,
            convictionScore: result.conviction_score,
            moatRating: result.moat_rating,
            lynchCategory: result.lynch_category,
            identifiedBiases: 'identified_biases' in result ? result.identified_biases : undefined,
            financialImpact: 'financial_impact_assessment' in result
                ? (result as OverreactionResult).financial_impact_assessment
                : 'catalyst_impact_assessment' in result
                    ? (result as BullishCatalystResult).catalyst_impact_assessment
                    : undefined,
            direction: 'long',
        };
    }

    /**
     * Set bias detective results on the context.
     */
    static setBiasDetective(ctx: AgentContext, result: BiasDetectiveResult): void {
        ctx.biasDetective = {
            findings: result.findings.map(f => ({
                bias_name: f.bias_name,
                severity: f.severity,
                evidence: f.evidence,
            })),
            totalPenalty: result.total_penalty,
            dominantBias: result.dominant_bias,
            adjustedConfidence: result.adjusted_confidence,
        };
    }

    /**
     * Set red team results on the context.
     */
    static setRedTeam(ctx: AgentContext, result: SanityCheckResult): void {
        ctx.redTeam = {
            passesSanityCheck: result.passes_sanity_check,
            riskScore: result.risk_score,
            fatalFlaws: result.fatal_flaws,
            counterThesis: result.counter_thesis,
        };
    }

    /**
     * Set noise panel results on the context.
     */
    static setNoisePanel(ctx: AgentContext, result: NoiseConfidenceResult): void {
        ctx.noisePanel = {
            scores: result.scores,
            stdDev: result.std_dev,
            convergent: result.convergent,
            divergent: result.divergent,
        };
    }

    /**
     * Set decision twin results on the context.
     */
    static setDecisionTwin(ctx: AgentContext, result: DecisionTwinResult): void {
        ctx.decisionTwin = {
            verdicts: {
                value: result.value.verdict,
                momentum: result.momentum.verdict,
                risk: result.risk.verdict,
            },
            unanimousTake: result.unanimous_take,
            skipCount: result.skip_count,
            summary: result.summary,
        };
    }

    /**
     * Build a condensed context string for injection into downstream agent prompts.
     * Each agent gets a summary of what upstream agents have found.
     */
    static buildPromptContext(ctx: AgentContext, forStage: string): string {
        const sections: string[] = [];

        // Always include primary agent summary
        if (ctx.primaryAgent) {
            sections.push(`UPSTREAM: ${ctx.primaryAgent.name} — confidence ${ctx.primaryAgent.confidence}/100, thesis: "${ctx.primaryAgent.thesis.slice(0, 200)}"`);
        }

        // Bias Detective findings (available to Red Team and beyond)
        if (ctx.biasDetective && ['red_team', 'self_critique', 'noise_panel', 'decision_twin', 'swot'].includes(forStage)) {
            const biasLine = ctx.biasDetective.findings.length > 0
                ? `Bias Detective found ${ctx.biasDetective.findings.length} biases (dominant: ${ctx.biasDetective.dominantBias}, penalty: -${ctx.biasDetective.totalPenalty})`
                : 'Bias Detective: no significant biases detected';
            sections.push(biasLine);
        }

        // Red Team findings (available to Self-Critique and beyond)
        if (ctx.redTeam && ['self_critique', 'noise_panel', 'decision_twin', 'swot'].includes(forStage)) {
            const rtLine = ctx.redTeam.passesSanityCheck
                ? `Red Team: PASSED (risk ${ctx.redTeam.riskScore}/100). Counter: "${ctx.redTeam.counterThesis.slice(0, 150)}"`
                : `Red Team: FAILED — fatal flaws: ${ctx.redTeam.fatalFlaws.join(', ')}`;
            sections.push(rtLine);
        }

        // Self-Critique findings (available to Noise Panel and beyond)
        if (ctx.selfCritique && ['noise_panel', 'decision_twin', 'swot'].includes(forStage)) {
            if (ctx.selfCritique.criticalFlaws.length > 0) {
                sections.push(`Self-Critique flagged ${ctx.selfCritique.criticalFlaws.length} critical flaws: ${ctx.selfCritique.criticalFlaws.join('; ')}`);
            }
        }

        // Noise Panel (available to Decision Twin and SWOT)
        if (ctx.noisePanel && ['decision_twin', 'swot'].includes(forStage)) {
            sections.push(`Noise Panel: scores [${ctx.noisePanel.scores.join(', ')}], std_dev=${ctx.noisePanel.stdDev.toFixed(1)}, ${ctx.noisePanel.convergent ? 'CONVERGENT' : ctx.noisePanel.divergent ? 'DIVERGENT' : 'moderate'}`);
        }

        // Decision Twin (available to SWOT)
        if (ctx.decisionTwin && forStage === 'swot') {
            sections.push(`Decision Twin: ${ctx.decisionTwin.summary}`);
        }

        // Confidence trail summary
        if (ctx.confidenceTrail.length > 0) {
            const trail = ctx.confidenceTrail.map(t => `${t.stage}: ${t.before}→${t.after}`).join(' | ');
            sections.push(`Confidence trail: ${trail}`);
        }

        if (sections.length === 0) return '';

        return '\n\nCASCADING AGENT CONTEXT:\n' + sections.join('\n');
    }

    /**
     * Serialize context for storage in agent_outputs.
     */
    static serialize(ctx: AgentContext): {
        confidence_trail: AgentContext['confidenceTrail'];
        stages_completed: string[];
    } {
        const stages: string[] = [];
        if (ctx.primaryAgent) stages.push(ctx.primaryAgent.name);
        if (ctx.biasDetective) stages.push('bias_detective');
        if (ctx.redTeam) stages.push('red_team');
        if (ctx.selfCritique) stages.push('self_critique');
        if (ctx.noisePanel) stages.push('noise_panel');
        if (ctx.decisionTwin) stages.push('decision_twin');

        return {
            confidence_trail: ctx.confidenceTrail,
            stages_completed: stages,
        };
    }
}
