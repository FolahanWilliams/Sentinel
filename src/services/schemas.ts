/**
 * Sentinel — Agent JSON Response Schemas
 *
 * Defines the strict JSON structures we demand from Gemini's Structured Outputs.
 * These map directly to our TypeScript definitions in src/types/agents.ts
 *
 * IMPORTANT: `reasoning` is the FIRST property in every schema.
 * Gemini generates structured output fields in order — forcing reasoning first
 * means the model thinks step-by-step before committing to verdicts.
 */

export const OVERREACTION_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the news event, its actual financial impact, the magnitude of the price drop, historical precedents for similar events, and whether cognitive biases are at play. Then reach your conclusion." },
        is_overreaction: { type: "boolean", description: "True if the price drop is an irrational overreaction." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        identified_biases: {
            type: "array",
            items: { type: "string" },
            description: "List of cognitive biases identified (e.g., 'recency_bias', 'herding')."
        },
        bias_type: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "The primary direction of the expected correction. For an overreaction dip, this is 'bullish'."
        },
        secondary_biases: {
            type: "array",
            items: { type: "string", enum: ["bullish", "bearish", "neutral"] },
            description: "Any secondary directional biases."
        },
        thesis: { type: "string", description: "Brief, objective explanation of why this is a mean-reversion setup." },
        financial_impact_assessment: { type: "string", description: "Assessment of the actual long-term cash flow impact." },
        suggested_entry_low: { type: "number", description: "Suggested low-end of entry zone." },
        suggested_entry_high: { type: "number", description: "Suggested high-end of entry zone." },
        stop_loss: { type: "number", description: "Hard stop loss level BELOW the current price (this is a LONG trade — stop must be lower than entry and target)." },
        target_price: { type: "number", description: "Target price for the reversion — must be ABOVE the current price (we are buying a dip expecting a bounce)." },
        timeframe_days: { type: "integer", description: "Expected days for the setup to play out." },
        moat_rating: { type: "integer", description: "Economic moat score 1-10. 1=commodity business, 10=monopoly-like moat. Assess brand power, cost advantages, network effects, switching costs, patents/IP." },
        lynch_category: { type: "string", description: "Peter Lynch category: 'fast_grower' (20%+ EPS growth), 'stalwart' (10-20% growth, large cap), 'turnaround' (recovering from distress), 'asset_play' (hidden asset value), 'cyclical' (tied to economic cycles), 'slow_grower' (<10% growth, dividend focus)." },
        conviction_score: { type: "integer", description: "Overall conviction 0-100 combining moat quality, growth/value profile, catalyst strength, and margin of safety. Only ≥70 represents a truly high-conviction Buffett/Lynch setup." },
        why_high_conviction: { type: "string", description: "If conviction_score ≥ 70, explain what makes this a Buffett/Lynch quality setup. If < 70, explain the key weakness." }
    },
    required: ["reasoning", "is_overreaction", "confidence_score", "identified_biases", "bias_type", "secondary_biases", "thesis", "financial_impact_assessment", "stop_loss", "target_price", "moat_rating", "lynch_category", "conviction_score"]
};

export const CONTAGION_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze what caused the epicenter to drop, whether the satellite has real fundamental exposure to the same issue, and whether the sympathy sell-off is justified or irrational." },
        is_contagion: { type: "boolean", description: "True if the ticker dropped purely in sympathy without actual exposure." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        epicenter_ticker: { type: "string", description: "The ticker that originally caused the sector drop." },
        bias_type: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "The primary direction of the expected correction. For a contagion dip, this is 'bullish'."
        },
        secondary_biases: {
            type: "array",
            items: { type: "string", enum: ["bullish", "bearish", "neutral"] },
            description: "Any secondary directional biases."
        },
        thesis: { type: "string", description: "Why the satellite ticker is immune to the epicenter's problem." },
        exposure_analysis: { type: "string", description: "Analysis of the actual fundamental overlap between the two companies." },
        suggested_entry_low: { type: "number" },
        suggested_entry_high: { type: "number" },
        stop_loss: { type: "number" },
        target_price: { type: "number" },
        timeframe_days: { type: "integer" },
        moat_rating: { type: "integer", description: "Economic moat score 1-10 for the satellite ticker. 1=commodity, 10=monopoly-like moat." },
        lynch_category: { type: "string", description: "Peter Lynch category for the satellite: 'fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', or 'slow_grower'." },
        conviction_score: { type: "integer", description: "Overall conviction 0-100 combining moat quality, growth profile, and catalyst strength for the satellite ticker." },
        why_high_conviction: { type: "string", description: "If conviction_score ≥ 70, explain the Buffett/Lynch quality case. If < 70, explain the key weakness." }
    },
    required: ["reasoning", "is_contagion", "confidence_score", "epicenter_ticker", "bias_type", "secondary_biases", "thesis", "exposure_analysis", "stop_loss", "target_price", "moat_rating", "lynch_category", "conviction_score"]
};

export const EARNINGS_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the earnings numbers (EPS, revenue), compare actual vs estimates, evaluate forward guidance quality, identify any one-time items, and determine if the market reaction is proportional to the fundamental reality." },
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
    required: ["reasoning", "is_mispriced", "confidence_score", "thesis", "forward_guidance_analysis", "stop_loss", "target_price"]
};

export const SATELLITE_DISCOVERY_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the epicenter's problem, map out sector relationships and supply chains, and determine which watchlist tickers could be unfairly sold in sympathy." },
        satellites: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    ticker: { type: "string", description: "Watchlist ticker that may be dropping in sympathy." },
                    reason: { type: "string", description: "Why the market is selling this ticker in sympathy." },
                    expected_exposure: { type: "string", description: "'none', 'low', 'moderate', or 'high' — actual fundamental exposure to the epicenter's problem." }
                },
                required: ["ticker", "reason", "expected_exposure"]
            },
            description: "Tickers from the watchlist that are likely contagion candidates."
        }
    },
    required: ["reasoning", "satellites"]
};

export const SANITY_CHECK_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Identify the strongest argument against this trade, check for macro headwinds, pending legal/regulatory risks, debt maturities, and any fatal flaws the other agents missed. Then reach your verdict." },
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
    required: ["reasoning", "passes_sanity_check", "risk_score", "fatal_flaws", "counter_thesis"]
};
