/**
 * Sentinel — Response Validator / Hallucination Guardrails
 *
 * Validates Gemini agent responses before they're acted upon.
 * Catches impossible numbers, missing required fields, logical inconsistencies,
 * and lazy/empty reasoning.
 */

interface ValidationResult {
    valid: boolean;
    warnings: string[];
}

export class ResponseValidator {
    /**
     * Validate an agent response for logical consistency and data integrity.
     */
    validate(response: unknown): ValidationResult {
        if (response === null || response === undefined) {
            return { valid: false, warnings: ['Response is null or undefined'] };
        }

        if (typeof response !== 'object') {
            return { valid: false, warnings: ['Response is not an object'] };
        }

        const warnings: string[] = [];
        const data = response as Record<string, unknown>;

        // Validate reasoning quality (chain-of-thought)
        this.validateReasoning(data, warnings);

        // Validate confidence scores are within bounds
        this.validateConfidence(data, warnings);

        // Validate price targets are logically consistent
        this.validatePriceTargets(data, warnings);

        // Validate statistics aren't impossible
        this.validateStatistics(data, warnings);

        // Flag suspiciously empty required fields
        this.flagEmptyFields(data, warnings);

        return {
            valid: warnings.filter(w => w.startsWith('FATAL:')).length === 0,
            warnings
        };
    }

    /**
     * Validate that the reasoning field is present and substantive.
     * A lazy or empty reasoning indicates the model didn't actually think.
     */
    private validateReasoning(data: Record<string, unknown>, warnings: string[]) {
        if ('reasoning' in data) {
            const reasoning = data.reasoning;
            if (!reasoning || typeof reasoning !== 'string') {
                warnings.push('FATAL: reasoning field is missing or not a string');
            } else if (reasoning.trim().length < 50) {
                warnings.push('FATAL: reasoning is too short (<50 chars) — model did not think step-by-step');
            } else if (reasoning.trim().length < 100) {
                warnings.push('reasoning is suspiciously brief (<100 chars) — may lack depth');
            }
        }
    }

    private validateConfidence(data: Record<string, unknown>, warnings: string[]) {
        const confidence = data.confidence_score;
        if (confidence !== undefined) {
            if (typeof confidence !== 'number') {
                warnings.push('FATAL: confidence_score is not a number');
            } else if (confidence < 0 || confidence > 100) {
                warnings.push(`FATAL: confidence_score ${confidence} is outside 0-100 range`);
            } else if (confidence === 100) {
                warnings.push('confidence_score is exactly 100 — suspiciously overconfident');
            }
        }

        const riskScore = data.risk_score;
        if (riskScore !== undefined && typeof riskScore === 'number') {
            if (riskScore < 0 || riskScore > 100) {
                warnings.push(`FATAL: risk_score ${riskScore} is outside 0-100 range`);
            }
        }
    }

    private validatePriceTargets(data: Record<string, unknown>, warnings: string[]) {
        const stopLoss = data.stop_loss as number | undefined;
        const targetPrice = data.target_price as number | undefined;
        const entryLow = data.suggested_entry_low as number | undefined;
        const entryHigh = data.suggested_entry_high as number | undefined;

        // Phase 4 fix (Audit m1): Support short trades where stop_loss > target_price
        const signalType = data.signal_type as string | undefined;
        const isShort = signalType === 'short' || data.side === 'short';

        if (stopLoss !== undefined && targetPrice !== undefined) {
            if (stopLoss <= 0) {
                warnings.push('FATAL: stop_loss is zero or negative');
            }
            if (targetPrice <= 0) {
                warnings.push('FATAL: target_price is zero or negative');
            }
            if (isShort) {
                // Short trade: stop_loss should be ABOVE target_price
                if (stopLoss <= targetPrice) {
                    warnings.push(`FATAL: short trade stop_loss ($${stopLoss}) <= target_price ($${targetPrice})`);
                }
            } else {
                // Long trade: stop_loss should be BELOW target_price
                if (stopLoss >= targetPrice) {
                    warnings.push(`FATAL: stop_loss ($${stopLoss}) >= target_price ($${targetPrice})`);
                }
            }

            // Stop-loss proximity warning: too-tight stops get blown out by noise
            if (entryLow !== undefined && entryLow > 0 && !isShort) {
                const stopPct = Math.abs((entryLow - stopLoss) / entryLow) * 100;
                if (stopPct < 1.0) {
                    warnings.push(`stop_loss is only ${stopPct.toFixed(1)}% below entry — dangerously tight`);
                }
            }
            if (entryHigh !== undefined && entryHigh > 0 && isShort) {
                const stopPct = Math.abs((stopLoss - entryHigh) / entryHigh) * 100;
                if (stopPct < 1.0) {
                    warnings.push(`stop_loss is only ${stopPct.toFixed(1)}% above entry — dangerously tight for short`);
                }
            }
        }

        if (entryLow !== undefined && entryHigh !== undefined) {
            if (entryLow > entryHigh) {
                warnings.push(`entry range inverted: low ($${entryLow}) > high ($${entryHigh})`);
            }
            if (stopLoss !== undefined && entryLow < stopLoss) {
                warnings.push(`entry_low ($${entryLow}) is below stop_loss ($${stopLoss})`);
            }
        }
    }

    private validateStatistics(data: Record<string, unknown>, warnings: string[]) {
        // Phase 4 fix (Audit m2): Check both field names to match DB schema
        const timeframe = (data.expected_timeframe_days ?? data.timeframe_days) as number | undefined;
        if (timeframe !== undefined && typeof timeframe === 'number') {
            // Only treat zero/negative timeframe as FATAL when the agent actually recommends a trade.
            // When is_overreaction=false / is_mispriced=false / is_contagion=false, the agent
            // rejected the setup so timeframe_days=0 is expected and harmless.
            const isAccepted = data.is_overreaction === true || data.is_mispriced === true || data.is_contagion === true;
            if (timeframe <= 0) {
                if (isAccepted) {
                    warnings.push('FATAL: timeframe_days is zero or negative');
                } else {
                    warnings.push('timeframe_days is zero or negative (non-fatal: signal was rejected by agent)');
                }
            }
            if (timeframe > 365) {
                warnings.push('timeframe_days exceeds 1 year — unusually long');
            }
            // Overreaction setups that take > 90 days are suspicious
            if (timeframe > 90) {
                const signalType = data.signal_type as string | undefined;
                const isOverreaction = data.is_overreaction;
                if (isOverreaction || signalType === 'long_overreaction') {
                    warnings.push(`timeframe_days (${timeframe}) exceeds 90 for overreaction setup — unusually long`);
                }
            }
        }
    }

    private flagEmptyFields(data: Record<string, unknown>, warnings: string[]) {
        if ('thesis' in data && (!data.thesis || (typeof data.thesis === 'string' && data.thesis.trim().length < 10))) {
            warnings.push('FATAL: thesis is empty or too short');
        }
        if ('exposure_analysis' in data && (!data.exposure_analysis || (typeof data.exposure_analysis === 'string' && data.exposure_analysis.trim().length < 10))) {
            warnings.push('FATAL: exposure_analysis is empty or too short');
        }
        if ('counter_thesis' in data && (!data.counter_thesis || (typeof data.counter_thesis === 'string' && data.counter_thesis.trim().length < 10))) {
            warnings.push('counter_thesis is empty or too short — Red Team may not be rigorous');
        }
    }
}

export const responseValidator = new ResponseValidator();
