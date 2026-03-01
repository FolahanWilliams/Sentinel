/** Hallucination guardrails for Gemini responses (Patch 6). Full implementation in Stage 3. */
// TODO: Stage 3 — validateStatistics, validateSourceUrls, flagUngroundedClaims, validateConfidence
export class ResponseValidator {
    validate(_response: unknown): { valid: boolean; warnings: string[] } {
        return { valid: true, warnings: [] };
    }
}
export const responseValidator = new ResponseValidator();
