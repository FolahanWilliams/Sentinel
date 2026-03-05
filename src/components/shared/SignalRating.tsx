/**
 * SignalRating — Thumbs up/down feedback for individual signals.
 * Stores ratings in the signal_ratings table for the ReflectionAgent to learn from.
 */

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/config/supabase';

interface SignalRatingProps {
    signalId: string;
    existingRating?: 'up' | 'down' | null;
}

export function SignalRating({ signalId, existingRating = null }: SignalRatingProps) {
    const [rating, setRating] = useState<'up' | 'down' | null>(existingRating);
    const [saving, setSaving] = useState(false);

    async function handleRate(value: 'up' | 'down') {
        if (saving) return;
        const newRating = rating === value ? null : value;
        setSaving(true);

        try {
            if (newRating === null) {
                // Remove rating
                await supabase
                    .from('signal_ratings' as any)
                    .delete()
                    .eq('signal_id', signalId);
            } else {
                // Upsert rating
                await supabase
                    .from('signal_ratings' as any)
                    .upsert({
                        signal_id: signalId,
                        rating: newRating,
                        rated_at: new Date().toISOString(),
                    } as any, { onConflict: 'signal_id' });
            }
            setRating(newRating);
        } catch (err) {
            console.error('[SignalRating] Failed to save rating:', err);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-sentinel-500 mr-1">Rate:</span>
            <button
                onClick={() => handleRate('up')}
                disabled={saving}
                className={`p-1 rounded transition-colors cursor-pointer border-none ${
                    rating === 'up'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-sentinel-800/50 text-sentinel-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                }`}
                title="Good signal"
            >
                <ThumbsUp className="h-3 w-3" />
            </button>
            <button
                onClick={() => handleRate('down')}
                disabled={saving}
                className={`p-1 rounded transition-colors cursor-pointer border-none ${
                    rating === 'down'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-sentinel-800/50 text-sentinel-500 hover:text-red-400 hover:bg-red-500/10'
                }`}
                title="Bad signal"
            >
                <ThumbsDown className="h-3 w-3" />
            </button>
        </div>
    );
}
