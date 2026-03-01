/**
 * ConfidenceMeter — Visual confidence/probability gauge (0–100).
 */

interface ConfidenceMeterProps {
    value: number; // 0-100
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    showValue?: boolean;
}

function getColor(v: number): string {
    if (v >= 80) return '#22C55E';
    if (v >= 60) return '#10B981';
    if (v >= 40) return '#F59E0B';
    if (v >= 20) return '#F97316';
    return '#EF4444';
}

export function ConfidenceMeter({ value, label, size = 'md', showValue = true }: ConfidenceMeterProps) {
    const clamped = Math.min(100, Math.max(0, value));
    const color = getColor(clamped);
    const barHeight = size === 'sm' ? 4 : size === 'md' ? 6 : 8;
    const fontSize = size === 'sm' ? '0.65rem' : size === 'md' ? '0.75rem' : '0.85rem';

    return (
        <div className="flex flex-col gap-1" style={{ minWidth: 60 }}>
            {(label || showValue) && (
                <div className="flex items-center justify-between" style={{ fontSize }}>
                    {label && <span className="text-sentinel-400">{label}</span>}
                    {showValue && (
                        <span className="font-mono font-bold" style={{ color }}>
                            {clamped}%
                        </span>
                    )}
                </div>
            )}
            <div
                style={{
                    height: barHeight,
                    borderRadius: barHeight / 2,
                    backgroundColor: 'var(--color-bg-elevated, #1a1a2e)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${clamped}%`,
                        height: '100%',
                        borderRadius: barHeight / 2,
                        backgroundColor: color,
                        transition: 'width 0.4s ease, background-color 0.4s ease',
                    }}
                />
            </div>
        </div>
    );
}
