/**
 * FearGreedPanel — CNN Fear & Greed Index with 7 sub-indicators.
 *
 * Fetches real data from CNN's dataviz API via the proxy-fear-greed edge function.
 * Displays the overall score gauge, historical comparisons, and all 7 market indicators.
 */

import { RefreshCw, Gauge, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { useFearGreed } from '@/hooks/useFearGreed';
import { FEAR_GREED_INDICATOR_LABELS } from '@/types/fearGreed';
import type { FearGreedData, FearGreedIndicator } from '@/types/fearGreed';

function scoreColor(score: number): string {
  if (score < 25) return 'text-red-500';
  if (score < 45) return 'text-amber-500';
  if (score < 55) return 'text-yellow-400';
  if (score < 75) return 'text-lime-400';
  return 'text-emerald-500';
}

function scoreBarGradient(score: number): string {
  if (score < 25) return 'from-red-600 to-red-400';
  if (score < 45) return 'from-red-500 via-amber-500 to-amber-400';
  if (score < 55) return 'from-red-500 via-amber-500 to-yellow-400';
  if (score < 75) return 'from-red-500 via-amber-500 via-yellow-400 to-lime-400';
  return 'from-red-500 via-amber-500 via-yellow-400 to-emerald-400';
}

function IndicatorRow({ label, indicator }: { label: string; indicator: FearGreedIndicator }) {
  const score = Math.round(indicator.score);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-sentinel-800/30 last:border-b-0">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-sentinel-300 truncate block">{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-24 h-1.5 bg-sentinel-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-xs font-bold font-mono w-8 text-right ${scoreColor(score)}`}>
          {score}
        </span>
        <span className={`text-[9px] font-medium w-20 text-right ${scoreColor(score)}`}>
          {indicator.rating}
        </span>
      </div>
    </div>
  );
}

function HistoryComparison({ label, current, previous }: { label: string; current: number; previous: number }) {
  const diff = current - previous;
  const isUp = diff > 0;
  const isFlat = Math.abs(diff) < 0.5;

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-sentinel-400">{Math.round(previous)}</span>
        <ArrowRight className="w-2.5 h-2.5 text-sentinel-600" />
        <span className={`text-xs font-bold font-mono ${scoreColor(current)}`}>{Math.round(current)}</span>
        {!isFlat && (
          <span className={`text-[9px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{Math.round(diff)}
          </span>
        )}
      </div>
    </div>
  );
}

export function FearGreedPanel() {
  const { data, loading, error, refetch } = useFearGreed();

  if (error && !data) {
    return (
      <div className="glass-panel-heavy p-5">
        <div className="text-center text-sentinel-400 text-sm">
          <p>Failed to load Fear & Greed Index</p>
          <button onClick={refetch} className="mt-2 text-blue-400 hover:text-blue-300 text-xs cursor-pointer bg-transparent border-none">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return <FearGreedSkeleton />;
  }

  const score = Math.round(data.score);
  const updatedAgo = Math.round((Date.now() - new Date(data.lastUpdated).getTime()) / 60000);

  const indicatorKeys = Object.keys(data.indicators) as (keyof FearGreedData['indicators'])[];

  return (
    <div className="glass-panel-heavy overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sentinel-800/40">
        <div className="flex items-center gap-2">
          <Gauge className="w-4.5 h-4.5 text-blue-400" />
          <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">
            CNN Fear & Greed Index
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-sentinel-500 font-mono">
            {updatedAgo < 1 ? 'just now' : `${updatedAgo}m ago`}
          </span>
          <button
            onClick={() => {
              sessionStorage.removeItem('sentinel_fear_greed_v1');
              refetch();
            }}
            className="p-1.5 rounded-md text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none bg-transparent"
            title="Refresh Fear & Greed data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* LEFT: Overall score gauge + history */}
        <div className="lg:col-span-5 p-5 lg:border-r border-sentinel-800/30">
          {/* Score display */}
          <div className="text-center mb-4">
            <div className={`text-5xl font-bold font-mono ${scoreColor(score)}`}>
              {score}
            </div>
            <div className={`text-sm font-bold uppercase tracking-wider mt-1 ${scoreColor(score)}`}>
              {data.rating}
            </div>
          </div>

          {/* Gauge bar */}
          <div className="mb-5">
            <div className="h-3 w-full bg-sentinel-800 rounded-full overflow-hidden relative">
              <div
                className={`absolute top-0 left-0 h-full bg-gradient-to-r ${scoreBarGradient(score)}`}
                style={{ width: `${score}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-sentinel-900 shadow-lg"
                style={{ left: `calc(${score}% - 8px)` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-sentinel-500 mt-1 font-mono">
              <span>EXTREME FEAR</span>
              <span>NEUTRAL</span>
              <span>EXTREME GREED</span>
            </div>
          </div>

          {/* Historical comparisons */}
          <div className="bg-sentinel-950/50 rounded-xl p-3.5 border border-sentinel-800/40">
            <h4 className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2">
              Historical Comparison
            </h4>
            <HistoryComparison label="Prev Close" current={score} previous={data.previousClose} />
            <HistoryComparison label="1 Week Ago" current={score} previous={data.previousWeek} />
            <HistoryComparison label="1 Month Ago" current={score} previous={data.previousMonth} />
            <HistoryComparison label="1 Year Ago" current={score} previous={data.previousYear} />
          </div>
        </div>

        {/* RIGHT: 7 sub-indicators */}
        <div className="lg:col-span-7 p-5">
          <h4 className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Market Indicators
          </h4>

          <div className="space-y-0">
            {indicatorKeys.map((key) => (
              <IndicatorRow
                key={key}
                label={FEAR_GREED_INDICATOR_LABELS[key]}
                indicator={data.indicators[key]}
              />
            ))}
          </div>

          {/* Summary insight */}
          <div className="mt-4 bg-sentinel-950/40 rounded-lg px-4 py-2.5 border border-sentinel-800/30">
            <div className="flex items-center gap-2">
              {score >= 55 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : score <= 45 ? (
                <TrendingDown className="w-4 h-4 text-red-400" />
              ) : (
                <Gauge className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-xs text-sentinel-300">
                <SentimentSummary data={data} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SentimentSummary({ data }: { data: FearGreedData }) {
  const indicators = data.indicators;
  const scores = Object.values(indicators).map(i => i.score);
  const fearCount = scores.filter(s => s < 45).length;
  const greedCount = scores.filter(s => s >= 55).length;
  const strongest = Object.entries(indicators).reduce((a, b) =>
    Math.abs(b[1].score - 50) > Math.abs(a[1].score - 50) ? b : a
  );
  const strongestLabel = FEAR_GREED_INDICATOR_LABELS[strongest[0] as keyof typeof FEAR_GREED_INDICATOR_LABELS];

  return (
    <>
      <span className="font-medium text-sentinel-200">
        {fearCount > greedCount ? `${fearCount}/7 indicators show fear` :
         greedCount > fearCount ? `${greedCount}/7 indicators show greed` :
         'Indicators are mixed'}
      </span>
      <span className="text-sentinel-500 mx-1">·</span>
      <span>Strongest signal: <span className={`font-bold ${scoreColor(strongest[1].score)}`}>{strongestLabel}</span></span>
    </>
  );
}

function FearGreedSkeleton() {
  return (
    <div className="glass-panel-heavy animate-pulse">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sentinel-800/40">
        <div className="flex items-center gap-2">
          <div className="h-4.5 w-4.5 bg-sentinel-800 rounded" />
          <div className="h-4 bg-sentinel-800 rounded w-48" />
        </div>
        <div className="h-3 bg-sentinel-800 rounded w-12" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-5 p-5 lg:border-r border-sentinel-800/30 space-y-3">
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-20 bg-sentinel-800 rounded" />
            <div className="h-4 w-24 bg-sentinel-800 rounded" />
          </div>
          <div className="h-3 bg-sentinel-800 rounded-full w-full" />
          <div className="h-28 bg-sentinel-800 rounded-xl w-full mt-4" />
        </div>
        <div className="lg:col-span-7 p-5 space-y-3">
          <div className="h-3 bg-sentinel-800 rounded w-28" />
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="h-8 bg-sentinel-800 rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
