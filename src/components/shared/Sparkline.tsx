/**
 * Sparkline — Tiny inline SVG line chart for KPI cards and tables.
 */

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    strokeWidth?: number;
    showDot?: boolean;
}

export function Sparkline({
    data,
    width = 80,
    height = 24,
    color = '#22C55E',
    strokeWidth = 1.5,
    showDot = true,
}: SparklineProps) {
    if (data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;

    const points = data.map((v, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = padding + (1 - (v - min) / range) * (height - padding * 2);
        return `${x},${y}`;
    });

    const last = data[data.length - 1];
    const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2);
    const lastY = padding + (1 - (last - min) / range) * (height - padding * 2);

    // Auto-detect color: green if trending up, red if down
    const autoColor = data[data.length - 1] >= data[0] ? '#22C55E' : '#EF4444';
    const lineColor = color === 'auto' ? autoColor : color;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
            <polyline
                fill="none"
                stroke={lineColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points.join(' ')}
            />
            {showDot && (
                <circle cx={lastX} cy={lastY} r={2} fill={lineColor} />
            )}
        </svg>
    );
}
