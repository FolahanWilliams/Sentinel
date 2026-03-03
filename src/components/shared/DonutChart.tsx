/**
 * DonutChart — Animated SVG donut chart for sector/exposure breakdowns.
 *
 * Renders concentric ring segments with hover tooltips and a center label.
 * Pure SVG with no dependencies beyond React.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

interface DonutSegment {
    label: string;
    value: number;
    color: string;
}

interface DonutChartProps {
    segments: DonutSegment[];
    size?: number;
    thickness?: number;
    centerLabel?: string;
    centerValue?: string;
}

export function DonutChart({
    segments,
    size = 160,
    thickness = 20,
    centerLabel,
    centerValue,
}: DonutChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return null;

    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const cx = size / 2;
    const cy = size / 2;

    let cumulativePercent = 0;

    return (
        <div className="relative flex items-center justify-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background ring */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth={thickness}
                />

                {segments.map((segment, i) => {
                    const pct = segment.value / total;
                    const offset = cumulativePercent * circumference;
                    const segmentLength = pct * circumference;
                    const gap = segments.length > 1 ? 3 : 0;
                    cumulativePercent += pct;

                    const isHovered = hoveredIndex === i;

                    return (
                        <motion.circle
                            key={segment.label}
                            cx={cx}
                            cy={cy}
                            r={radius}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth={isHovered ? thickness + 4 : thickness}
                            strokeDasharray={`${Math.max(segmentLength - gap, 0)} ${circumference - Math.max(segmentLength - gap, 0)}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="round"
                            initial={{ strokeDasharray: `0 ${circumference}` }}
                            animate={{
                                strokeDasharray: `${Math.max(segmentLength - gap, 0)} ${circumference - Math.max(segmentLength - gap, 0)}`,
                                strokeWidth: isHovered ? thickness + 4 : thickness,
                            }}
                            transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                            style={{
                                transform: 'rotate(-90deg)',
                                transformOrigin: `${cx}px ${cy}px`,
                                filter: isHovered ? `drop-shadow(0 0 8px ${segment.color}80)` : 'none',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        />
                    );
                })}
            </svg>

            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {hoveredIndex !== null && segments[hoveredIndex] ? (
                    <>
                        <span className="text-xs text-sentinel-400 font-medium">{segments[hoveredIndex].label}</span>
                        <span className="text-lg font-bold text-sentinel-100 font-mono">
                            {((segments[hoveredIndex].value / total) * 100).toFixed(1)}%
                        </span>
                    </>
                ) : (
                    <>
                        {centerLabel && <span className="text-xs text-sentinel-400">{centerLabel}</span>}
                        {centerValue && <span className="text-lg font-bold text-sentinel-100 font-mono">{centerValue}</span>}
                    </>
                )}
            </div>
        </div>
    );
}
