import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface CoinPrice {
  id: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  lastUpdated: string;
}

interface CryptoGlobal {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptos: number;
  marketCapChangePercent24h: number;
}

export interface CryptoData {
  prices: CoinPrice[];
  global: CryptoGlobal | null;
  lastUpdated: string;
}

const CACHE_KEY = 'sentinel_crypto_v1';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getCached(): CryptoData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch { /* ignore */ }
  return null;
}

function setCache(data: CryptoData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useCrypto() {
  const [data, setData] = useState<CryptoData | null>(getCached());
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

      const { data: result, error: fnError } = await supabase.functions.invoke('proxy-crypto');

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch crypto data');
      }

      if (!result?.success || !result.prices) {
        throw new Error('Invalid crypto response');
      }

      const cryptoData: CryptoData = {
        prices: result.prices,
        global: result.global,
        lastUpdated: result.lastUpdated,
      };
      setData(cryptoData);
      setCache(cryptoData);
    } catch (err: any) {
      setError(err.message);
      console.warn('[useCrypto] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const refetch = useCallback(() => fetch_(true), [fetch_]);

  return { data, loading, error, refetch };
}
