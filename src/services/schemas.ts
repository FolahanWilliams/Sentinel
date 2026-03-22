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

export const BULLISH_CATALYST_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the positive catalyst, its actual impact on revenue/earnings, whether the market has fully priced it in, and whether momentum is sustainable. Then reach your conclusion." },
        is_underreaction: { type: "boolean", description: "True if the market hasn't fully priced in the positive catalyst." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        catalyst_type: { type: "string", description: "Type of catalyst: 'earnings_beat', 'analyst_upgrade', 'product_launch', 'fda_approval', 'partnership', 'contract_win', 'breakout', 'guidance_raise', 'insider_buying', 'sector_tailwind'." },
        identified_biases: {
            type: "array",
            items: { type: "string" },
            description: "Cognitive biases causing under-pricing (e.g., 'anchoring' to old estimates, 'status_quo_bias', 'underreaction_to_positive_news')."
        },
        bias_type: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "Primary direction — for bullish catalyst this is 'bullish'."
        },
        secondary_biases: {
            type: "array",
            items: { type: "string", enum: ["bullish", "bearish", "neutral"] },
            description: "Any secondary directional biases."
        },
        thesis: { type: "string", description: "Why this positive catalyst has more upside than the market expects." },
        catalyst_impact_assessment: { type: "string", description: "Assessment of the catalyst's impact on forward earnings, revenue, or competitive position." },
        suggested_entry_low: { type: "number", description: "Suggested low-end of entry zone." },
        suggested_entry_high: { type: "number", description: "Suggested high-end of entry zone." },
        stop_loss: { type: "number", description: "Hard stop loss level BELOW the current price." },
        target_price: { type: "number", description: "Target price — must be ABOVE the current price." },
        timeframe_days: { type: "integer", description: "Expected days for the setup to play out." },
        moat_rating: { type: "integer", description: "Economic moat score 1-10." },
        lynch_category: { type: "string", description: "Peter Lynch category: 'fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', or 'slow_grower'." },
        conviction_score: { type: "integer", description: "Overall conviction 0-100. Only ≥70 = high-conviction setup." },
        why_high_conviction: { type: "string", description: "Explain what makes this a quality setup (or the key weakness)." }
    },
    required: ["reasoning", "is_underreaction", "confidence_score", "catalyst_type", "identified_biases", "bias_type", "secondary_biases", "thesis", "catalyst_impact_assessment", "stop_loss", "target_price", "moat_rating", "lynch_category", "conviction_score"]
};

/**
 * SWOT Analysis schema — enriches the thesis narrative with structured
 * Strengths / Weaknesses / Opportunities / Threats + an executive summary.
 * Non-blocking: does not modify confidence, only adds narrative richness.
 *
 * reasoning is first so the model commits to evidence before populating items.
 */
export const SWOT_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Think through all pipeline evidence — thesis, counter-thesis, Decision Twin concerns, fundamentals — before populating each SWOT quadrant."
        },
        strengths: {
            type: "array",
            description: "2-3 genuine strengths: what the thesis gets verifiably right.",
            items: {
                type: "object",
                properties: {
                    point: { type: "string", description: "Concise strength statement (1 sentence)." },
                    evidence: { type: "string", description: "Specific supporting evidence (metric, event, or data point)." }
                },
                required: ["point", "evidence"]
            }
        },
        weaknesses: {
            type: "array",
            description: "2-3 weaknesses: structural holes or blind spots in the current thesis.",
            items: {
                type: "object",
                properties: {
                    point: { type: "string", description: "Concise weakness statement (1 sentence)." },
                    evidence: { type: "string", description: "Why this is a weakness — cite the counter-thesis, a flaw, or missing data." }
                },
                required: ["point", "evidence"]
            }
        },
        opportunities: {
            type: "array",
            description: "1-2 opportunities: upside catalysts or alpha NOT yet reflected in the current price or thesis.",
            items: {
                type: "object",
                properties: {
                    point: { type: "string", description: "Concise opportunity statement (1 sentence)." },
                    evidence: { type: "string", description: "Why this upside is plausible but not yet priced in." }
                },
                required: ["point", "evidence"]
            }
        },
        threats: {
            type: "array",
            description: "2-3 threats: risks that could directly invalidate the thesis or stop the trade out.",
            items: {
                type: "object",
                properties: {
                    point: { type: "string", description: "Concise threat statement (1 sentence)." },
                    evidence: { type: "string", description: "Why this threat is real and specific to this ticker/thesis." }
                },
                required: ["point", "evidence"]
            }
        },
        executive_summary: {
            type: "string",
            description: "2-3 sentence trader-facing narrative synthesising the SWOT. Lead with the strongest argument for the trade, then acknowledge the key risk."
        }
    },
    required: ["reasoning", "strengths", "weaknesses", "opportunities", "threats", "executive_summary"]
};

/**
 * Decision Twin — single persona evaluation schema.
 * Shared across all 3 personas; the persona identity comes from the system prompt.
 * Reasoning is first so the model commits to evidence before declaring its verdict.
 */
export const DECISION_TWIN_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Step-by-step evaluation of the thesis through your specific investment lens. Cite specific numbers where possible."
        },
        verdict: {
            type: "string",
            enum: ["take", "caution", "skip"],
            description: "'take' = you would enter this trade, 'caution' = you'd watch but not act now, 'skip' = you would not enter under any conditions."
        },
        rationale: {
            type: "string",
            description: "1-2 sentences summarising why you voted take/caution/skip."
        },
        key_concern: {
            type: "string",
            description: "The single most important risk or dealbreaker from YOUR perspective. Be specific."
        },
        confidence_score: {
            type: "integer",
            description: "Your independent confidence (0-100) that this is a winning trade from your investment philosophy."
        }
    },
    required: ["reasoning", "verdict", "rationale", "key_concern", "confidence_score"]
};

/**
 * Bias Detective — full 15-bias taxonomy scan of a primary agent's thesis.
 * Reasoning is first so the model commits to evidence before scoring severity.
 */
export const BIAS_DETECTIVE_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Step-by-step analysis: read the thesis and reasoning, then search for evidence of each of the 15 cognitive biases in the taxonomy. Cite specific phrases that expose each bias found."
        },
        findings: {
            type: "array",
            description: "One entry per bias detected. Omit biases with zero evidence.",
            items: {
                type: "object",
                properties: {
                    bias_name: {
                        type: "string",
                        enum: [
                            "overreaction", "anchoring", "herding", "loss_aversion",
                            "availability", "recency", "confirmation", "disposition_effect",
                            "framing", "representativeness", "narrative_fallacy",
                            "status_quo_bias", "overconfidence", "regret_aversion",
                            "endowment_effect"
                        ]
                    },
                    severity: {
                        type: "integer",
                        description: "1=mild (linguistic hint), 2=moderate (affects conclusion), 3=severe (invalidates the thesis)."
                    },
                    evidence: {
                        type: "string",
                        description: "Direct quote or paraphrase from the thesis/reasoning that demonstrates this bias."
                    },
                    penalty: {
                        type: "integer",
                        description: "Confidence penalty for this finding: severity 1 → 0, severity 2 → 4, severity 3 → 8."
                    }
                },
                required: ["bias_name", "severity", "evidence", "penalty"]
            }
        },
        total_penalty: {
            type: "integer",
            description: "Sum of all finding penalties, capped at 25."
        },
        dominant_bias: {
            type: "string",
            description: "The bias_name with the highest severity, or 'none' if no biases found."
        },
        bias_free: {
            type: "boolean",
            description: "True only when findings is empty or all severities are 1 (mild)."
        },
        adjusted_confidence: {
            type: "integer",
            description: "original_confidence − total_penalty. You will receive the original score in the prompt."
        }
    },
    required: ["reasoning", "findings", "total_penalty", "dominant_bias", "bias_free", "adjusted_confidence"]
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
