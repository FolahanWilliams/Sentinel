import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface EconomicDataPoint {
  seriesId: string;
  name: string;
  unit: string;
  latest: {
    value: number;
    year: string;
    period: string;
    periodName: string;
  };
  previous: {
    value: number;
    year: string;
    period: string;
    periodName: string;
  } | null;
  change: number | null;
}

export interface EconomicData {
  indicators: EconomicDataPoint[];
  source: string;
  lastUpdated: string;
}

const CACHE_KEY = 'sentinel_economic_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (BLS data is monthly)

function getCached(): EconomicData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: EconomicData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useEconomic() {
  const [data, setData] = useState<EconomicData | null>(getCached());
  const [loading, setLoading] = useState(!getCached());
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      if (!force) {
        const cached = getCached();
        if (cached) {
          setData(cached);
          setLoading(false);
          return;
        }
      }

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-economic');

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch economic data');
      }

      if (!result?.success || !result.data) {
        throw new Error('Invalid economic data response');
      }

      const economicData: EconomicData = {
        indicators: result.data,
        source: result.source,
        lastUpdated: result.lastUpdated,
      };
      setData(economicData);
      setCache(economicData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useEconomic] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const refetch = useCallback(() => fetch_(true), [fetch_]);

  return { data, loading, error, refetch };
}
