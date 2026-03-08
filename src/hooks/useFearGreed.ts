import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { FearGreedData } from '@/types/fearGreed';

const CACHE_KEY = 'sentinel_fear_greed_v1';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(): FearGreedData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: FearGreedData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useFearGreed() {
  const [data, setData] = useState<FearGreedData | null>(getCached());
  const [loading, setLoading] = useState(!getCached());
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const cached = getCached();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-fear-greed');

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch Fear & Greed data');
      }

      if (!result || typeof result.score !== 'number') {
        throw new Error('Invalid Fear & Greed response');
      }

      const fgData: FearGreedData = result;
      setData(fgData);
      setCache(fgData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useFearGreed] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}
