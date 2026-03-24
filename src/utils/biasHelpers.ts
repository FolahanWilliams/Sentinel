import { BIAS_TYPES, type BiasType } from '@/config/constants';

const BIAS_LABELS: Record<BiasType, string> = {
    overreaction: 'Overreaction', anchoring: 'Anchoring', herding: 'Herding',
    loss_aversion: 'Loss Aversion', availability: 'Availability', recency: 'Recency',
    confirmation: 'Confirmation', disposition_effect: 'Disposition Effect',
    framing: 'Framing', representativeness: 'Representativeness',
    narrative_fallacy: 'Narrative Fallacy', status_quo_bias: 'Status Quo Bias',
    overconfidence: 'Overconfidence', regret_aversion: 'Regret Aversion',
    endowment_effect: 'Endowment Effect',
};
const BIAS_EMOJIS: Record<BiasType, string> = {
    overreaction: '😱', anchoring: '⚓', herding: '🐑', loss_aversion: '😰',
    availability: '📰', recency: '🕐', confirmation: '🔍', disposition_effect: '💎',
    framing: '🖼️', representativeness: '🎭',
    narrative_fallacy: '📖', status_quo_bias: '🔄', overconfidence: '💪',
    regret_aversion: '😟', endowment_effect: '🏠',
};
export function getBiasLabel(bias: BiasType): string { return BIAS_LABELS[bias] ?? bias; }
export function getBiasEmoji(bias: BiasType): string { return BIAS_EMOJIS[bias] ?? '🧠'; }
export function isValidBias(value: string): value is BiasType {
    return (BIAS_TYPES as readonly string[]).includes(value);
}
