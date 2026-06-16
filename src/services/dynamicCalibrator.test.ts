import { describe, it, expect } from 'vitest';
import { DynamicCalibrator } from '@/services/dynamicCalibrator';

const ys = (out: { x: number; y: number }[]) => out.map((p) => p.y);
const isNonDecreasing = (vals: number[]) => vals.every((v, i) => i === 0 || v >= vals[i - 1]!);

describe('DynamicCalibrator.pava (isotonic regression / PAVA)', () => {
    it('returns [] for empty input', () => {
        expect(DynamicCalibrator.pava([])).toEqual([]);
    });

    it('leaves an already non-decreasing sequence untouched', () => {
        const out = DynamicCalibrator.pava([
            { x: 0.2, y: 0.1, w: 1 },
            { x: 0.5, y: 0.4, w: 1 },
            { x: 0.8, y: 0.9, w: 1 },
        ]);
        expect(ys(out)).toEqual([0.1, 0.4, 0.9]);
        expect(isNonDecreasing(ys(out))).toBe(true);
    });

    it('pools adjacent violators into their mean', () => {
        // 0.9 → 0.1 violates; pools to 0.5, which ties the trailing 0.5.
        const out = DynamicCalibrator.pava([
            { x: 1, y: 0.9, w: 1 },
            { x: 2, y: 0.1, w: 1 },
            { x: 3, y: 0.5, w: 1 },
        ]);
        expect(ys(out)).toEqual([0.5, 0.5]);
        expect(isNonDecreasing(ys(out))).toBe(true);
    });

    it('honours sample weights when pooling', () => {
        // y=1 (w3) then y=0 (w1): pooled mean = (1*3 + 0*1) / 4 = 0.75
        const out = DynamicCalibrator.pava([
            { x: 1, y: 1, w: 3 },
            { x: 2, y: 0, w: 1 },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]!.y).toBeCloseTo(0.75, 6);
    });

    it('always yields a monotonic curve from a strictly decreasing input', () => {
        const pts = Array.from({ length: 12 }, (_, i) => ({ x: i / 11, y: 1 - i / 11, w: 1 }));
        expect(isNonDecreasing(ys(DynamicCalibrator.pava(pts)))).toBe(true);
    });
});
