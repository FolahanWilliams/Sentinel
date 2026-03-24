/**
 * Sentinel — Calibration Curve
 *
 * Confidence vs Reality: plots stated AI confidence against actual win rate.
 * Perfect calibration = 45-degree line.
 */

import {
    ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
    CartesianGrid, Tooltip, ReferenceLine, ZAxis,
} from 'recharts';
import type { CalibrationDataPoint } from '@/hooks/useDecisionAccuracy';

interface Props {
    data: CalibrationDataPoint[];
}

export function CalibrationCurve({ data }: Props) {
    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-sentinel-500 text-sm">
                Need more completed outcomes to build calibration curve.
            </div>
        );
    }

    // Only show buckets with data
    const filtered = data.filter(d => d.count > 0);

    // Perfect calibration line data
    const perfectLine = [
        { expectedWinRate: 0, actualWinRate: 0 },
        { expectedWinRate: 100, actualWinRate: 100 },
    ];

    return (
        <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        type="number"
                        dataKey="expectedWinRate"
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        label={{ value: 'Stated Confidence', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 11 }}
                    />
                    <YAxis
                        type="number"
                        dataKey="actualWinRate"
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        label={{ value: 'Actual Win Rate', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                    />
                    <ZAxis dataKey="count" range={[40, 200]} />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => {
                            if (name === 'actualWinRate') return [`${value.toFixed(1)}%`, 'Actual Win Rate'];
                            if (name === 'expectedWinRate') return [`${value.toFixed(0)}%`, 'Confidence'];
                            return [value, name];
                        }}
                    />
                    {/* Perfect calibration line */}
                    <ReferenceLine
                        segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                        stroke="#f59e0b"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                    />
                    {/* User's calibration points */}
                    <Scatter
                        data={filtered}
                        fill="#8b5cf6"
                        stroke="#a78bfa"
                        strokeWidth={1}
                    />
                </ScatterChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-sentinel-500">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-amber-500 inline-block" /> Perfect calibration
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Your data
                </span>
            </div>
        </div>
    );
}
