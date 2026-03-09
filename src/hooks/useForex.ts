import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface ForexRate {
  code: string;
  name: string;
  rate: number;
  inverseRate: number;
  date: string;
}

export interface ForexData {
  base: string;
  rates: ForexRate[];
  dxyApprox: number;
  source: string;
  lastUpdated: string;
}

const CACHE_KEY = 'sentinel_forex_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(): ForexData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: ForexData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useForex() {
  const [data, setData] = useState<ForexData | null>(getCached());
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

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-forex');

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch forex data');
      }

      if (!result?.success || !result.rates) {
        throw new Error('Invalid forex response');
      }

      const forexData: ForexData = {
        base: result.base,
        rates: result.rates,
        dxyApprox: result.dxyApprox,
        source: result.source,
        lastUpdated: result.lastUpdated,
      };
      setData(forexData);
      setCache(forexData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useForex] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const refetch = useCallback(() => fetch_(true), [fetch_]);

  return { data, loading, error, refetch };
}
