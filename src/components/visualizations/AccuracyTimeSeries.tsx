/**
 * Sentinel — Accuracy Over Time Chart
 *
 * Rolling 30-day win rate time series using Recharts.
 */

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import type { AccuracyDataPoint } from '@/hooks/useDecisionAccuracy';

interface Props {
    data: AccuracyDataPoint[];
}

export function AccuracyTimeSeries({ data }: Props) {
    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-sentinel-500 text-sm">
                No outcome data yet. Complete signal outcomes to see your accuracy trend.
            </div>
        );
    }

    const formatted = data.map(d => ({
        ...d,
        date: new Date(d.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    }));

    return (
        <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                        <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                        dataKey="date"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        tickFormatter={v => `${v}%`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            fontSize: 12,
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
                    />
                    <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '50%', fill: '#f59e0b', fontSize: 10 }} />
                    <Area
                        type="monotone"
                        dataKey="winRate"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#accuracyGradient)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
