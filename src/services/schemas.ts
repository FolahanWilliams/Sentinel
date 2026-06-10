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
        counter_thesis: { type: "string", description: "The absolute best argument for why this trade will lose money." },
        verdict: {
            type: "string",
            enum: ["block", "warn", "allow"],
            description: "Final decisive verdict. 'block' = fatal flaw, do not trade; 'warn' = tradeable with caution; 'allow' = thesis sound. Reserve 'block' for clear falsifiable flaws; use 'warn' for ambiguous risk."
        }
    },
    required: ["reasoning", "passes_sanity_check", "risk_score", "fatal_flaws", "counter_thesis", "verdict"]
};

// ── Macro Causal Schema (Geopolitics & Systematic Risk) ───────────────────

export const MACRO_CAUSAL_SCHEMA = {
    type: "object",
    properties: {
        causal_chain: {
            type: "array",
            items: { type: "string" },
            description: "Step-by-step mapping: [1. The Event, 2. First-Order Impact, 3. Second-Order Impact]"
        },
        exploitable_cognitive_bias: {
            type: "string",
            description: "The specific cognitive bias causing the market to misprice this macro event (e.g., Base Rate Neglect, Panic Selling, Availability Heuristic)."
        },
        bias_description: { type: "string", description: "1-2 sentences explaining how the bias is currently manifesting." },
        is_geopolitical_catalyst: { type: "boolean", description: "True if this event creates a valid, tradable signal." },
        confidence_score: { type: "integer", description: "0-100 confidence in the causal thesis." },
        thesis: { type: "string", description: "The overarching trade idea (e.g., 'Market is over-selling Defense on hopes of early peace, buy the dip due to Base Rate Neglect on historical conflict duration')." },
        suggested_entry_low: { type: "number", description: "Entry zone floor." },
        suggested_entry_high: { type: "number", description: "Entry zone ceiling." },
        stop_loss: { type: "number", description: "Risk control level (must be below entry)." },
        target_price: { type: "number", description: "Upside target." },
        timeframe_days: { type: "integer", description: "Expected playout timeframe (e.g., 30, 90)." },
        secondary_biases: { type: "array", items: { type: "string" } },
        moat_rating: { type: "integer", description: "1-10 quality of the core asset mentioned." },
        lynch_category: { type: "string", description: "E.g., cyclical, stalwart." },
        conviction_score: { type: "integer", description: "Overall 0-100 conviction." },
        why_high_conviction: { type: "string", description: "Explain the strong setup." }
    },
    required: ["causal_chain", "exploitable_cognitive_bias", "bias_description", "is_geopolitical_catalyst", "confidence_score", "thesis", "target_price", "stop_loss", "timeframe_days"]
};

// ── Pre-Mortem Agent Schema ───────────────────────────

export const PRE_MORTEM_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Think step-by-step. Assume this trade loses money. Walk through the most likely failure paths: macro risks, company-specific events, technical breakdowns, timing issues, and thesis invalidation triggers."
        },
        scenarios: {
            type: "array",
            description: "Exactly 3 specific failure scenarios, ordered by probability (highest first).",
            items: {
                type: "object",
                properties: {
                    description: {
                        type: "string",
                        description: "Specific, concrete failure scenario (e.g., 'Fed raises rates unexpectedly, triggering sector-wide sell-off that drags this stock below stop loss')."
                    },
                    probability: {
                        type: "integer",
                        description: "0-100 probability this scenario occurs within the trade's timeframe."
                    },
                    severity: {
                        type: "string",
                        enum: ["mild", "moderate", "severe"],
                        description: "mild = <5% loss, moderate = 5-15% loss, severe = >15% loss or thesis invalidation."
                    },
                    early_warning_sign: {
                        type: "string",
                        description: "Specific observable event that would confirm this failure is materializing (e.g., 'VIX spikes above 30' or 'Company files 8-K for executive departure')."
                    }
                },
                required: ["description", "probability", "severity", "early_warning_sign"]
            }
        },
        avg_failure_probability: {
            type: "integer",
            description: "Average probability across all 3 scenarios."
        },
        highest_risk_scenario: {
            type: "string",
            description: "The scenario description with the highest probability × severity."
        },
        resilience_rating: {
            type: "string",
            enum: ["fragile", "moderate", "resilient"],
            description: "fragile = avg probability > 50 OR 2+ severe scenarios. moderate = avg 30-50 with 1 severe. resilient = avg < 30 and no severe scenarios."
        }
    },
    required: ["reasoning", "scenarios", "avg_failure_probability", "highest_risk_scenario", "resilience_rating"]
};

// ── Short Signal Schemas (Item 10) ───────────────────────────────────────────

/**
 * SHORT_OVERREACTION_SCHEMA — mirror of OVERREACTION_SCHEMA for euphoria shorts.
 * target_price is BELOW current price; stop_loss is ABOVE current price.
 */
export const SHORT_OVERREACTION_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the catalyst driving the rally, its actual fundamental merit, the magnitude of the move vs. the underlying change in intrinsic value, and whether cognitive biases are inflating the move. Then reach your conclusion." },
        is_overreaction: { type: "boolean", description: "True if the price rally is an irrational overreaction creating a short opportunity." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        identified_biases: {
            type: "array",
            items: { type: "string" },
            description: "Cognitive biases driving the irrational rally (e.g., 'narrative_fallacy', 'overconfidence', 'herding')."
        },
        bias_type: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "For a short overreaction this should be 'bearish' — the stock is expected to fall back."
        },
        secondary_biases: {
            type: "array",
            items: { type: "string", enum: ["bullish", "bearish", "neutral"] }
        },
        thesis: { type: "string", description: "Brief, objective explanation of why this rally is irrational and the stock is expected to fall." },
        financial_impact_assessment: { type: "string", description: "Assessment of the actual long-term cash flow impact of the catalyst — explaining why the rally is unjustified." },
        suggested_entry_low: { type: "number", description: "Low-end of the short entry zone." },
        suggested_entry_high: { type: "number", description: "High-end of the short entry zone." },
        stop_loss: { type: "number", description: "Stop loss ABOVE the current price (limits upside against the short position)." },
        target_price: { type: "number", description: "Target price for the short — must be BELOW the current price." },
        timeframe_days: { type: "integer", description: "Expected days for the setup to play out." },
        moat_rating: { type: "integer", description: "Economic moat score 1-10 for the company (low moat = better short candidate)." },
        lynch_category: { type: "string", description: "Peter Lynch category: 'fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', 'slow_grower'." },
        conviction_score: { type: "integer", description: "Short conviction 0-100. Only ≥70 = strong short setup." },
        why_high_conviction: { type: "string", description: "Explain the overvaluation case or the key weakness in the thesis." }
    },
    required: ["reasoning", "is_overreaction", "confidence_score", "identified_biases", "bias_type", "secondary_biases", "thesis", "financial_impact_assessment", "stop_loss", "target_price", "moat_rating", "lynch_category", "conviction_score"]
};

/**
 * BEARISH_CATALYST_SCHEMA — for negative catalysts that haven't been fully priced in.
 * Mirrors BULLISH_CATALYST_SCHEMA but for short setups.
 */
export const BEARISH_CATALYST_SCHEMA = {
    type: "object",
    properties: {
        reasoning: { type: "string", description: "Think step-by-step. Analyze the negative catalyst, its structural impact on revenue/earnings, whether the market has fully priced in the deterioration, and whether continued downside is likely. Then reach your conclusion." },
        is_underreaction: { type: "boolean", description: "True if the market hasn't fully priced in the negative catalyst (more downside ahead)." },
        confidence_score: { type: "integer", description: "0-100 confidence score." },
        catalyst_type: { type: "string", description: "Type of catalyst: 'guidance_cut', 'earnings_miss', 'product_failure', 'regulatory_action', 'executive_departure', 'accounting_restatement', 'competitive_loss', 'ratings_downgrade', 'credit_event', 'sector_headwind'." },
        identified_biases: {
            type: "array",
            items: { type: "string" },
            description: "Cognitive biases causing under-pricing of downside (e.g., 'status_quo_bias', 'anchoring', 'sunk_cost')."
        },
        bias_type: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "For bearish catalyst this should be 'bearish'."
        },
        secondary_biases: {
            type: "array",
            items: { type: "string", enum: ["bullish", "bearish", "neutral"] }
        },
        thesis: { type: "string", description: "Why this negative catalyst has more downside than the market expects." },
        catalyst_impact_assessment: { type: "string", description: "Assessment of the catalyst's structural impact on forward earnings, revenue, or competitive position." },
        suggested_entry_low: { type: "number", description: "Low-end of the short entry zone." },
        suggested_entry_high: { type: "number", description: "High-end of the short entry zone." },
        stop_loss: { type: "number", description: "Hard stop loss ABOVE the current price." },
        target_price: { type: "number", description: "Target price — must be BELOW the current price." },
        timeframe_days: { type: "integer", description: "Expected days for the setup to play out." },
        moat_rating: { type: "integer", description: "Economic moat score 1-10 (moat erosion is the best bearish signal)." },
        lynch_category: { type: "string", description: "Peter Lynch category." },
        conviction_score: { type: "integer", description: "Short conviction 0-100. Only ≥70 = strong setup." },
        why_high_conviction: { type: "string", description: "Explain the structural deterioration case or key weakness." }
    },
    required: ["reasoning", "is_underreaction", "confidence_score", "catalyst_type", "identified_biases", "bias_type", "secondary_biases", "thesis", "catalyst_impact_assessment", "stop_loss", "target_price", "moat_rating", "lynch_category", "conviction_score"]
};

// ── Behavioral Layer Schemas (Category-Defining Agents) ────────────────────

/**
 * OTHER_MIND_SCHEMA — structured output for the Other-Mind Simulation agent.
 * This agent thinks AS THE COUNTERPARTY and scores the clarity of the error
 * Sentinel is exploiting. Hard-gates the signal if edge_clarity is too low.
 */
export const OTHER_MIND_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Step-by-step: who is on the other side of this trade, why they believe they are right, and what specifically they are getting wrong."
        },
        counterparty_cohort: {
            type: "string",
            enum: [
                "retail_yolo", "retail_informed", "quant_factor",
                "long_only_pension", "hedge_fund_tactical", "hedge_fund_macro",
                "market_maker_dealer", "corporate_insider", "passive_index_flow", "unknown"
            ],
            description: "The SPECIFIC cohort Sentinel is trading against. 'unknown' is an escape hatch — using it will drop edge_clarity to near zero."
        },
        counterparty_latency: {
            type: "string",
            enum: ["minutes", "hours", "days", "weeks", "months"],
            description: "How quickly this cohort typically reacts to new information."
        },
        counterparty_dominant_bias: {
            type: "string",
            description: "The specific cognitive bias driving the counterparty's error (e.g. 'loss aversion', 'base rate neglect', 'recency bias', 'herding')."
        },
        counterparty_trigger: {
            type: "string",
            description: "The mechanical trigger that caused the counterparty to take the wrong side: 'stop-loss cascade', 'margin call', 'quarter-end rebalance', 'passive fund outflow', 'algo signal', 'panic selling'."
        },
        counterparty_best_case: {
            type: "string",
            description: "STEELMAN the counterparty: their strongest argument. If you cannot articulate a best case, edge_clarity should be lower (their side may be stronger than you think)."
        },
        counterparty_weakness: {
            type: "string",
            description: "The specific FALSIFIABLE flaw in the counterparty's reasoning. Must be concrete — a specific fact, data point, or logical gap — not vague."
        },
        correction_catalyst: {
            type: "string",
            description: "The specific event or time-decay mechanism that FORCES the counterparty to correct: upcoming earnings, FDA decision, options expiry, rebalance deadline, technical level break."
        },
        correction_window_days: {
            type: "integer",
            description: "How many days until the correction catalyst fires or the counterparty must capitulate."
        },
        edge_clarity: {
            type: "integer",
            description: "0-100 score of how clearly you can NAME the counterparty error. 0 = you cannot name cohort + mechanism + catalyst concretely. 100 = all three are concrete and falsifiable. Be honest — vague answers must score low."
        },
        emit_recommendation: {
            type: "string",
            enum: ["emit", "defer", "suppress"],
            description: "'emit' if edge_clarity ≥ 75; 'defer' if 50-74; 'suppress' if < 50. Suppress means Sentinel cannot name the error — no signal."
        }
    },
    required: ["reasoning", "counterparty_cohort", "counterparty_latency", "counterparty_dominant_bias", "counterparty_trigger", "counterparty_weakness", "correction_catalyst", "correction_window_days", "edge_clarity", "emit_recommendation"]
};

/**
 * NARRATIVE_LIFECYCLE_SCHEMA — output for the Narrative Lifecycle agent.
 * Classifies where the dominant narrative for a ticker sits on the
 * birth → amplification → saturation → exhaustion → reversal curve.
 */
export const NARRATIVE_LIFECYCLE_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Step-by-step: what is the dominant story driving this ticker, how old is it, how many sources are repeating it, and where is it on the lifecycle curve."
        },
        dominant_narrative: {
            type: "string",
            description: "One-sentence summary of the dominant story currently driving this ticker (e.g. 'AI hyperscaler capex keeps accelerating', 'GLP-1 obesity TAM is larger than consensus')."
        },
        lifecycle_phase: {
            type: "string",
            enum: ["birth", "early_amplification", "late_amplification", "saturation", "exhaustion", "reversal"],
            description: "Current phase. birth = just emerged, few sources. early_amplification = widening coverage. late_amplification = most sources covering. saturation = everyone knows, marginal new info near zero. exhaustion = repetition without new info. reversal = narrative is starting to flip."
        },
        narrative_age_days: {
            type: "integer",
            description: "Approximate days since the narrative first appeared in market coverage. Use mention count + recency as proxy if unknown."
        },
        mentions_last_14d: {
            type: "integer",
            description: "Count of distinct mentions of this ticker in market events over the last 14 days (provided in the prompt)."
        },
        marginal_new_info_rate: {
            type: "integer",
            description: "0-100. How much of the most recent coverage contains GENUINELY NEW information vs. pure repetition of the existing narrative. Pure repetition → 0; breaking new details → 100."
        },
        saturation_score: {
            type: "integer",
            description: "0-100 composite measure of how priced-in the narrative already is. Combines age, mention count, and marginal_new_info_rate."
        },
        direction_pressure: {
            type: "string",
            enum: ["long_supportive", "short_supportive", "neutral"],
            description: "Which direction the current narrative phase supports. A birth-phase bullish narrative is long_supportive; an exhausted bullish narrative is short_supportive."
        },
        confidence_adjustment: {
            type: "integer",
            description: "Signed adjustment to apply to the primary signal confidence. Positive for birth/early_amplification of long signals; negative for saturation/exhaustion/reversal of long signals; inverted for shorts. Bounded -15 to +10."
        }
    },
    required: ["reasoning", "dominant_narrative", "lifecycle_phase", "narrative_age_days", "marginal_new_info_rate", "saturation_score", "direction_pressure", "confidence_adjustment"]
};

/**
 * COHORT_SEQUENCE_SCHEMA — output for the Cohort Reaction Sequencer agent.
 * Predicts the temporal order in which each participant cohort will react to
 * an event, identifies the primary mispricer, and locates the current market
 * position within the sequence.
 */
export const COHORT_SEQUENCE_SCHEMA = {
    type: "object",
    properties: {
        reasoning: {
            type: "string",
            description: "Step-by-step: model the temporal sequence of cohort reactions. Who moves first, who moves wrong, who is forced to correct later."
        },
        reaction_sequence: {
            type: "array",
            description: "Ordered list of cohort reactions in temporal order. 2-5 entries. Each is a single cohort's expected response to the event.",
            items: {
                type: "object",
                properties: {
                    cohort: {
                        type: "string",
                        enum: [
                            "retail_yolo", "retail_informed", "quant_factor",
                            "long_only_pension", "hedge_fund_tactical", "hedge_fund_macro",
                            "market_maker_dealer", "corporate_insider", "passive_index_flow", "unknown"
                        ]
                    },
                    reaction: {
                        type: "string",
                        enum: ["buy_aggressive", "buy_passive", "sell_aggressive", "sell_passive", "hedge", "ignore"]
                    },
                    latency: { type: "string", enum: ["minutes", "hours", "days", "weeks"] },
                    intensity: { type: "string", enum: ["low", "medium", "high", "extreme"] },
                    is_mispricing: {
                        type: "boolean",
                        description: "True if this cohort's reaction is an ERROR that Sentinel could exploit."
                    }
                },
                required: ["cohort", "reaction", "latency", "intensity", "is_mispricing"]
            }
        },
        primary_mispricer: {
            type: "string",
            enum: [
                "retail_yolo", "retail_informed", "quant_factor",
                "long_only_pension", "hedge_fund_tactical", "hedge_fund_macro",
                "market_maker_dealer", "corporate_insider", "passive_index_flow", "unknown"
            ],
            description: "Which cohort in the sequence is driving the mispricing. Must match a cohort in reaction_sequence where is_mispricing=true."
        },
        sequence_stage: {
            type: "string",
            enum: ["pre_reaction", "first_wave", "overshoot", "rebalancing", "post_correction"],
            description: "Where the market CURRENTLY sits in the sequence. pre_reaction = event just happened, nobody has moved yet. first_wave = fastest cohort reacting. overshoot = price has moved past fair value. rebalancing = slower cohorts correcting. post_correction = the opportunity is gone."
        },
        correction_catalyst: {
            type: "string",
            description: "The specific event or time-decay that resolves the mispricing (earnings report, rebalance date, technical breakout, etc.)."
        },
        confidence_in_sequence: {
            type: "integer",
            description: "0-100 confidence in this SPECIFIC sequence prediction. If you are uncertain about who moves first, score low."
        },
        confidence_adjustment: {
            type: "integer",
            description: "Signed adjustment based on sequence_stage. Boost in pre_reaction/first_wave (we're early), neutral in rebalancing, penalty in post_correction (edge is gone). Bounded -10 to +5."
        }
    },
    required: ["reasoning", "reaction_sequence", "primary_mispricer", "sequence_stage", "correction_catalyst", "confidence_in_sequence", "confidence_adjustment"]
};
