/**
 * Sentinel — Agent JSON Response Schemas
 *
 * Defines the strict JSON structures we demand from Gemini's Structured Outputs.
 * These map directly to our TypeScript definitions in src/types/agents.ts
 */

export const OVERREACTION_SCHEMA = {
    type: "object",
    properties: {
        is_overreaction: { type: "boolean", description: "True if the price drop is an irrational overreaction." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        identified_biases: {
            type: "array",
            items: { type: "string" },
            description: "List of cognitive biases identified (e.g., 'recency_bias', 'herding')."
        },
        thesis: { type: "string", description: "Brief, objective explanation of why this is a mean-reversion setup." },
        financial_impact_assessment: { type: "string", description: "Assessment of the actual long-term cash flow impact." },
        suggested_entry_low: { type: "number", description: "Suggested low-end of entry zone." },
        suggested_entry_high: { type: "number", description: "Suggested high-end of entry zone." },
        stop_loss: { type: "number", description: "Hard stop loss level based on technical invalidation." },
        target_price: { type: "number", description: "Target price for the reversion." },
        timeframe_days: { type: "integer", description: "Expected days for the setup to play out." }
    },
    required: ["is_overreaction", "confidence_score", "identified_biases", "thesis", "financial_impact_assessment", "stop_loss", "target_price"]
};

export const CONTAGION_SCHEMA = {
    type: "object",
    properties: {
        is_contagion: { type: "boolean", description: "True if the ticker dropped purely in sympathy without actual exposure." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        epicenter_ticker: { type: "string", description: "The ticker that originally caused the sector drop." },
        thesis: { type: "string", description: "Why the satellite ticker is immune to the epicenter's problem." },
        exposure_analysis: { type: "string", description: "Analysis of the actual fundamental overlap between the two companies." },
        suggested_entry_low: { type: "number" },
        suggested_entry_high: { type: "number" },
        stop_loss: { type: "number" },
        target_price: { type: "number" },
        timeframe_days: { type: "integer" }
    },
    required: ["is_contagion", "confidence_score", "epicenter_ticker", "thesis", "exposure_analysis", "stop_loss", "target_price"]
};

export const EARNINGS_SCHEMA = {
    type: "object",
    properties: {
        is_mispriced: { type: "boolean" },
        confidence_score: { type: "integer" },
        thesis: { type: "string" },
        forward_guidance_analysis: { type: "string", description: "Analysis of management's future guidance vs the headline miss." },
        one_time_items: { type: "string", description: "Identification of non-recurring charges that skewed EPS." },
        suggested_entry_low: { type: "number" },
        suggested_entry_high: { type: "number" },
        stop_loss: { type: "number" },
        target_price: { type: "number" }
    },
    required: ["is_mispriced", "confidence_score", "thesis", "forward_guidance_analysis", "stop_loss", "target_price"]
};

export const SANITY_CHECK_SCHEMA = {
    type: "object",
    properties: {
        passes_sanity_check: { type: "boolean", description: "True if the trade survives the red team attack." },
        risk_score: { type: "integer", description: "0-100 risk score (higher is safer)." },
        fatal_flaws: {
            type: "array",
            items: { type: "string" },
            description: "Any immediate dealbreakers (e.g., 'Pending FDA rejection tomorrow')."
        },
        macro_obstacles: { type: "string", description: "How the broader market environment hurts this trade." },
        counter_thesis: { type: "string", description: "The absolute best argument for why this trade will lose money." }
    },
    required: ["passes_sanity_check", "risk_score", "fatal_flaws", "counter_thesis"]
};
