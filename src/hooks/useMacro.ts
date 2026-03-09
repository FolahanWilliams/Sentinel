import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface MacroQuote {
  key: string;
  ticker: string;
  name: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
}

export interface MacroData {
  quotes: MacroQuote[];
  grouped: Record<string, MacroQuote[]>;
  count: number;
  lastUpdated: string;
}

const CACHE_KEY = 'sentinel_macro_v1';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getCached(): MacroData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: MacroData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useMacro(categories?: string[]) {
  const [data, setData] = useState<MacroData | null>(getCached());
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

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-macro', {
        body: categories ? { categories } : {},
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch macro data');
      }

      if (!result?.success || !result.quotes) {
        throw new Error('Invalid macro response');
      }

      const macroData: MacroData = {
        quotes: result.quotes,
        grouped: result.grouped,
        count: result.count,
        lastUpdated: result.lastUpdated,
      };
      setData(macroData);
      setCache(macroData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useMacro] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [categories]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const refetch = useCallback(() => fetch_(true), [fetch_]);

  return { data, loading, error, refetch };
}
