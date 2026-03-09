import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface TreasuryRate {
  securityType: string;
  securityDescription: string;
  averageInterestRate: number;
  recordDate: string;
}

export interface TreasuryData {
  rates: TreasuryRate[];
  recordDate: string;
  lastUpdated: string;
}

const CACHE_KEY = 'sentinel_treasury_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (treasury data updates monthly)

function getCached(): TreasuryData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: TreasuryData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useTreasury() {
  const [data, setData] = useState<TreasuryData | null>(getCached());
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

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-treasury', {
        body: { endpoint: 'rates' },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch treasury data');
      }

      if (!result?.success || !result.data) {
        throw new Error('Invalid treasury response');
      }

      const treasuryData: TreasuryData = {
        rates: result.data,
        recordDate: result.recordDate,
        lastUpdated: result.lastUpdated,
      };
      setData(treasuryData);
      setCache(treasuryData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useTreasury] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const refetch = useCallback(() => fetch_(true), [fetch_]);

  return { data, loading, error, refetch };
}
