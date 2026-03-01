/**
 * CalendarHeatmap — Lightweight SVG calendar heatmap for journal entries.
 * 52 columns × 7 rows (Mon–Sun), coloured by entry count per day.
 * Click a cell to filter entries to that date.
 */

import { useMemo } from 'react';

interface CalendarHeatmapProps {
    /** Map of YYYY-MM-DD → count of entries */
    entryCounts: Record<string, number>;
    /** Called when user clicks a day */
    onDayClick: (date: string | null) => void;
    /** Currently selected date (YYYY-MM-DD) or null */
    selectedDate: string | null;
}

const CELL_SIZE = 13;
const GAP = 3;
const DAYS_IN_WEEK = 7;
const WEEKS = 52;
const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getColor(count: number, selected: boolean): string {
    if (selected) return '#3B82F6'; // blue highlight
    if (count === 0) return 'rgba(255,255,255,0.04)';
    if (count === 1) return 'rgba(52, 211, 153, 0.3)'; // emerald dim
    if (count === 2) return 'rgba(52, 211, 153, 0.55)';
    return 'rgba(52, 211, 153, 0.85)'; // 3+ bright
}

function toDateStr(d: Date): string {
    return d.toISOString().split('T')[0] as string;
}

export function CalendarHeatmap({ entryCounts, onDayClick, selectedDate }: CalendarHeatmapProps) {
    const { cells, monthPositions } = useMemo(() => {
        const today = new Date();

        // Go back 52*7 = 364 days, align to Monday
        const start = new Date(today);
        start.setDate(start.getDate() - (WEEKS * DAYS_IN_WEEK - 1));
        // Shift to Monday
        const dayOfWeek = start.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        start.setDate(start.getDate() + mondayOffset);

        const cells: Array<{
            x: number;
            y: number;
            date: string;
            count: number;
        }> = [];

        const monthPos: Array<{ label: string; x: number }> = [];
        let lastMonth = -1;

        const cursor = new Date(start);
        for (let week = 0; week < WEEKS; week++) {
            for (let day = 0; day < DAYS_IN_WEEK; day++) {
                const dateStr: string = toDateStr(cursor);
                const month = cursor.getMonth();

                if (month !== lastMonth && day === 0) {
                    monthPos.push({ label: MONTH_LABELS[month]!, x: week * (CELL_SIZE + GAP) + 20 });
                    lastMonth = month;
                }

                cells.push({
                    x: week * (CELL_SIZE + GAP) + 20,
                    y: day * (CELL_SIZE + GAP) + 20,
                    date: dateStr,
                    count: entryCounts[dateStr] || 0,
                });

                cursor.setDate(cursor.getDate() + 1);
            }
        }

        return { cells, monthPositions: monthPos };
    }, [entryCounts]);

    const width = WEEKS * (CELL_SIZE + GAP) + 30;
    const height = DAYS_IN_WEEK * (CELL_SIZE + GAP) + 30;

    return (
        <div className="overflow-x-auto">
            <svg width={width} height={height} className="block">
                {/* Day labels */}
                {DAY_LABELS.map((label, i) => (
                    <text
                        key={`day-${i}`}
                        x={8}
                        y={i * (CELL_SIZE + GAP) + 20 + CELL_SIZE - 2}
                        fontSize={9}
                        fill="rgba(255,255,255,0.3)"
                        fontFamily="monospace"
                    >
                        {label}
                    </text>
                ))}

                {/* Month labels */}
                {monthPositions.map((m, i) => (
                    <text
                        key={`month-${i}`}
                        x={m.x}
                        y={12}
                        fontSize={9}
                        fill="rgba(255,255,255,0.35)"
                        fontFamily="monospace"
                    >
                        {m.label}
                    </text>
                ))}

                {/* Cells */}
                {cells.map(cell => {
                    const isSelected = selectedDate === cell.date;

                    return (
                        <rect
                            key={cell.date}
                            x={cell.x}
                            y={cell.y}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            rx={2}
                            fill={getColor(cell.count, isSelected)}
                            stroke={isSelected ? '#3B82F6' : 'transparent'}
                            strokeWidth={isSelected ? 1.5 : 0}
                            style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                            onClick={() => onDayClick(isSelected ? null : cell.date)}
                        >
                            <title>{cell.date}: {cell.count} entries</title>
                        </rect>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-1 ml-5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                <span>Less</span>
                {[0, 1, 2, 3].map(n => (
                    <span
                        key={n}
                        style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            backgroundColor: getColor(n, false),
                        }}
                    />
                ))}
                <span>More</span>
                {selectedDate && (
                    <button
                        onClick={() => onDayClick(null)}
                        className="ml-3 text-blue-400 hover:text-blue-300 underline"
                        style={{ fontSize: 10 }}
                    >
                        Clear filter
                    </button>
                )}
            </div>
        </div>
    );
}
