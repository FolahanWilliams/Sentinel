/**
 * Sentinel — Response Validator / Hallucination Guardrails
 *
 * Validates Gemini agent responses before they're acted upon.
 * Catches impossible numbers, missing required fields, and logical inconsistencies.
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

        if (stopLoss !== undefined && targetPrice !== undefined) {
            if (stopLoss <= 0) {
                warnings.push('FATAL: stop_loss is zero or negative');
            }
            if (targetPrice <= 0) {
                warnings.push('FATAL: target_price is zero or negative');
            }
            if (stopLoss >= targetPrice) {
                warnings.push(`FATAL: stop_loss ($${stopLoss}) >= target_price ($${targetPrice})`);
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
        const timeframe = data.timeframe_days as number | undefined;
        if (timeframe !== undefined && typeof timeframe === 'number') {
            if (timeframe <= 0) {
                warnings.push('FATAL: timeframe_days is zero or negative');
            }
            if (timeframe > 365) {
                warnings.push('timeframe_days exceeds 1 year — unusually long');
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
    }
}

export const responseValidator = new ResponseValidator();
