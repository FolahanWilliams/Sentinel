/**
 * Sentinel — Dynamic Confidence Calibration via Isotonic Regression
 *
 * Enhances the static-bucket ConfidenceCalibrator with a monotonically
 * increasing calibration curve fitted using the Pool Adjacent Violators
 * Algorithm (PAVA). This produces a smooth, data-driven mapping from
 * AI confidence scores to actual observed win rates.
 *
 * When data is sparse, falls back to linear interpolation between
 * fitted points. The curve is cached in app_settings for fast lookup.
 */

import { supabase } from '@/config/supabase';

// ─── Types ───────────────────────────────────────────────────────────

export interface CalibratedPoint {
  x: number; // AI confidence (0–100)
  y: number; // actual win rate  (0–100)
}

export interface DynamicCalibrationCurve {
  points: CalibratedPoint[];
  lastUpdated: string;
  totalOutcomes: number;
  overallWinRate: number;
  /** Number of raw data points used in the PAVA fit */
  fittedFrom: number;
}

interface RawOutcomeRow {
  outcome: string;
  signals: { confidence_score: number } | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const APP_SETTINGS_KEY = 'dynamic_calibration_curve';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Minimum outcomes needed before fitting is meaningful */
const MIN_OUTCOMES_FOR_FIT = 10;
/** Refit when this many new outcomes have been recorded since last fit */
const REFIT_THRESHOLD = 20;

// ─── DynamicCalibrator ───────────────────────────────────────────────

export class DynamicCalibrator {
  // In-memory cache (mirrors ConfidenceCalibrator pattern)
  private static cachedCurve: DynamicCalibrationCurve | null = null;
  private static cacheTimestamp = 0;
  private static pendingFetch: Promise<DynamicCalibrationCurve> | null = null;

  // ── Pool Adjacent Violators Algorithm (PAVA) ─────────────────────
  //
  // Given pairs sorted by x, produce a y sequence that is monotonically
  // non-decreasing while minimising weighted squared error.

  static pava(
    points: { x: number; y: number; w: number }[]
  ): CalibratedPoint[] {
    if (points.length === 0) return [];

    // Sort by x ascending (stable)
    const sorted = [...points].sort((a, b) => a.x - b.x);

    // Each block: weighted mean y, total weight, representative x
    const blocks: { sumWY: number; sumW: number; x: number }[] = sorted.map(
      (p) => ({ sumWY: p.y * p.w, sumW: p.w, x: p.x })
    );

    // Merge adjacent blocks that violate monotonicity
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < blocks.length - 1; i++) {
        if (blocks[i]!.sumW === 0 || blocks[i + 1]!.sumW === 0) continue;
        const meanI = blocks[i]!.sumWY / blocks[i]!.sumW;
        const meanNext = blocks[i + 1]!.sumWY / blocks[i + 1]!.sumW;
        if (meanI > meanNext) {
          // Merge block i+1 into i
          blocks[i]!.sumWY += blocks[i + 1]!.sumWY;
          blocks[i]!.sumW += blocks[i + 1]!.sumW;
          // Keep the midpoint x between merged blocks
          blocks[i]!.x = (blocks[i]!.x + blocks[i + 1]!.x) / 2;
          blocks.splice(i + 1, 1);
          changed = true;
          // Re-check from previous block
          if (i > 0) i--;
        }
      }
    }

    return blocks
      .filter((b) => b.sumW > 0)
      .map((b) => ({
        x: Math.round(b.x * 100) / 100,
        y: Math.round((b.sumWY / b.sumW) * 100) / 100,
      }));
  }

  // ── Curve fitting ────────────────────────────────────────────────

  /**
   * Fetch signal_outcomes, run PAVA, and persist the fitted curve.
   */
  static async fitCurve(): Promise<DynamicCalibrationCurve> {
    const { data: outcomes, error } = await supabase
      .from('signal_outcomes')
      .select('outcome, signals!inner(confidence_score)')
      .neq('outcome', 'pending');

    if (error || !outcomes || outcomes.length < MIN_OUTCOMES_FOR_FIT) {
      return this.emptyCurve();
    }

    // Group by integer confidence to form weighted observations
    const bucketMap = new Map<number, { wins: number; total: number }>();
    let totalWins = 0;

    for (const row of outcomes as unknown as RawOutcomeRow[]) {
      const confidence = row.signals?.confidence_score ?? 0;
      const bucket = Math.min(100, Math.max(0, Math.round(confidence)));
      const isWin = row.outcome === 'win';

      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, { wins: 0, total: 0 });
      }
      const entry = bucketMap.get(bucket)!;
      entry.total++;
      if (isWin) {
        entry.wins++;
        totalWins++;
      }
    }

    // Build weighted input for PAVA
    const pavaInput: { x: number; y: number; w: number }[] = [];
    for (const [x, { wins, total }] of bucketMap) {
      pavaInput.push({
        x,
        y: (wins / total) * 100, // win rate as percentage
        w: total,
      });
    }

    const fittedPoints = this.pava(pavaInput);

    const curve: DynamicCalibrationCurve = {
      points: fittedPoints,
      lastUpdated: new Date().toISOString(),
      totalOutcomes: outcomes.length,
      overallWinRate:
        outcomes.length > 0
          ? Math.round((totalWins / outcomes.length) * 100 * 10) / 10
          : 0,
      fittedFrom: pavaInput.length,
    };

    // Persist to app_settings
    await supabase
      .from('app_settings')
      .upsert(
        {
          key: APP_SETTINGS_KEY,
          value: curve as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,user_id' }
      );

    // Refresh in-memory cache
    this.cachedCurve = curve;
    this.cacheTimestamp = Date.now();

    return curve;
  }

  // ── Cached lookup ────────────────────────────────────────────────

  /**
   * Get the cached dynamic calibration curve from app_settings.
   * Returns an empty curve if none exists yet.
   */
  static async getCachedCurve(): Promise<DynamicCalibrationCurve> {
    if (
      this.cachedCurve &&
      Date.now() - this.cacheTimestamp < CACHE_TTL_MS
    ) {
      return this.cachedCurve;
    }

    // Deduplicate concurrent fetches
    if (this.pendingFetch) return this.pendingFetch;

    this.pendingFetch = (async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', APP_SETTINGS_KEY)
          .maybeSingle();

        if (error || !data?.value) {
          this.cachedCurve = this.emptyCurve();
        } else {
          this.cachedCurve =
            data.value as unknown as DynamicCalibrationCurve;
        }
        this.cacheTimestamp = Date.now();
        return this.cachedCurve;
      } catch {
        return this.emptyCurve();
      } finally {
        // Always clear pendingFetch so future calls retry instead of inheriting a stale/failed promise
        this.pendingFetch = null;
      }
    })().catch(() => {
      // Ensure a rejected promise doesn't block future calls
      this.pendingFetch = null;
      return this.emptyCurve();
    });

    return this.pendingFetch;
  }

  // ── Public API: map raw confidence → calibrated probability ──────

  /**
   * Maps an AI confidence score (0–100) to a calibrated win-rate
   * probability using the fitted isotonic regression curve.
   *
   * Strategy:
   *  1. If a fitted curve exists with enough data, use linear
   *     interpolation between the two nearest calibrated points.
   *  2. If data is insufficient, apply a conservative 20% haircut
   *     (same fallback as ConfidenceCalibrator).
   */
  static getCalibratedProbability(
    rawConfidence: number,
    curve: DynamicCalibrationCurve
  ): number {
    const pts = curve.points;

    if (pts.length === 0 || curve.totalOutcomes < MIN_OUTCOMES_FOR_FIT) {
      // Insufficient data — conservative estimate
      return Math.max(0, Math.min(100, rawConfidence * 0.8));
    }

    // Clamp input
    const x = Math.max(0, Math.min(100, rawConfidence));

    // Exact or boundary match
    if (x <= pts[0]!.x) return pts[0]!.y;
    if (x >= pts[pts.length - 1]!.x) return pts[pts.length - 1]!.y;

    // Linear interpolation between surrounding points
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      if (x >= p0.x && x <= p1.x) {
        const range = p1.x - p0.x;
        if (range === 0) return p0.y;
        const t = (x - p0.x) / range;
        return Math.round((p0.y + t * (p1.y - p0.y)) * 100) / 100;
      }
    }

    // Fallback (should not reach here)
    return curve.overallWinRate;
  }

  /**
   * Convenience wrapper: fetches the cached curve and returns the
   * calibrated probability in a single call.
   */
  static async getCalibratedProbabilityAsync(
    rawConfidence: number
  ): Promise<number> {
    const curve = await this.getCachedCurve();
    return this.getCalibratedProbability(rawConfidence, curve);
  }

  // ── Refit trigger ────────────────────────────────────────────────

  /**
   * Checks whether the calibration curve should be refitted.
   * Returns true when enough new outcomes have been recorded since
   * the last fit, or when no curve exists at all.
   */
  static async shouldRefit(): Promise<boolean> {
    const curve = await this.getCachedCurve();

    // No curve fitted yet — definitely refit
    if (curve.points.length === 0 || curve.totalOutcomes === 0) {
      // But only if there's enough data to be meaningful
      const { count, error } = await supabase
        .from('signal_outcomes')
        .select('*', { count: 'exact', head: true })
        .neq('outcome', 'pending');

      if (error) return false;
      return (count ?? 0) >= MIN_OUTCOMES_FOR_FIT;
    }

    // Check if new outcomes have accumulated since last fit
    const { count, error } = await supabase
      .from('signal_outcomes')
      .select('*', { count: 'exact', head: true })
      .neq('outcome', 'pending');

    if (error) return false;

    const currentTotal = count ?? 0;
    const delta = currentTotal - curve.totalOutcomes;

    return delta >= REFIT_THRESHOLD;
  }

  /**
   * Convenience: check if refit is needed and perform it if so.
   * Returns the (possibly updated) curve.
   */
  static async refitIfNeeded(): Promise<DynamicCalibrationCurve> {
    const needsRefit = await this.shouldRefit();
    if (needsRefit) {
      return this.fitCurve();
    }
    return this.getCachedCurve();
  }

  /** Clear the in-memory cache (useful for testing or forced refresh). */
  static clearCache(): void {
    this.cachedCurve = null;
    this.cacheTimestamp = 0;
    this.pendingFetch = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private static emptyCurve(): DynamicCalibrationCurve {
    return {
      points: [],
      lastUpdated: new Date().toISOString(),
      totalOutcomes: 0,
      overallWinRate: 50,
      fittedFrom: 0,
    };
  }
}
