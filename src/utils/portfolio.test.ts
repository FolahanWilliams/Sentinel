import { describe, it, expect } from 'vitest';
import {
    inferCurrency,
    majorUnitFactor,
    LSE_QUOTES_IN_PENCE,
    toUSD,
    nativeToUSD,
    calcUnrealizedPnl,
    calcUnrealizedPnlUSD,
    getPositionExposureUSD,
    realizedPnlUSD,
    type ForexRatesLike,
    type PositionLike,
} from '@/utils/portfolio';

// Base-USD forex feed shape: inverseRate = USD per 1 unit of `code`.
const forex: ForexRatesLike = {
    rates: [
        { code: 'GBP', inverseRate: 1.27 },
        { code: 'EUR', inverseRate: 1.08 },
        { code: 'CAD', inverseRate: 0.74 },
        { code: 'AUD', inverseRate: 0.66 },
    ],
};

describe('inferCurrency', () => {
    it('maps exchange suffixes to currencies', () => {
        expect(inferCurrency('VOD.L')).toBe('GBP');
        expect(inferCurrency('SHOP.TO')).toBe('CAD');
        expect(inferCurrency('ABC.V')).toBe('CAD');
        expect(inferCurrency('SAP.DE')).toBe('EUR');
        expect(inferCurrency('AIR.PA')).toBe('EUR');
        expect(inferCurrency('BHP.AX')).toBe('AUD');
        expect(inferCurrency('AAPL')).toBe('USD');
    });
});

describe('LSE pence invariant (bug class #1)', () => {
    // Guards the hard-won rule: .L amounts reaching these helpers are ALREADY in
    // pounds (the quote layer divided by 100). If someone flips the flag back on,
    // these fail before a 100x error ships.
    it('does not re-divide .L amounts', () => {
        expect(LSE_QUOTES_IN_PENCE).toBe(false);
        expect(majorUnitFactor('VOD.L')).toBe(1);
        expect(majorUnitFactor('AAPL')).toBe(1);
    });
});

describe('toUSD (bug class #2: cross-currency)', () => {
    it('is a no-op for USD / null / undefined currency', () => {
        expect(toUSD(100, 'USD', forex)).toBe(100);
        expect(toUSD(100, null, forex)).toBe(100);
        expect(toUSD(100, undefined, forex)).toBe(100);
    });
    it('converts non-USD via inverseRate (case-insensitive)', () => {
        expect(toUSD(100, 'GBP', forex)).toBeCloseTo(127, 6);
        expect(toUSD(100, 'gbp', forex)).toBeCloseTo(127, 6);
        expect(toUSD(100, 'EUR', forex)).toBeCloseTo(108, 6);
    });
    it('falls back to native (never NaN) when rate/forex missing', () => {
        expect(toUSD(100, 'JPY', forex)).toBe(100); // no rate for code
        expect(toUSD(100, 'GBP', null)).toBe(100);   // no forex at all
        expect(toUSD(100, 'GBP', { rates: [{ code: 'GBP', inverseRate: NaN }] })).toBe(100);
    });
});

describe('nativeToUSD', () => {
    const gbpPos: PositionLike = { ticker: 'VOD.L', side: 'long', entry_price: 2, shares: 100, position_size_usd: null, currency: 'GBP' };
    it('converts a GBP (.L) amount to USD with no 100x error', () => {
        expect(nativeToUSD(gbpPos, 100, forex)).toBeCloseTo(127, 6);
    });
    it('infers currency from the ticker when pos.currency is null', () => {
        expect(nativeToUSD({ ...gbpPos, currency: null }, 100, forex)).toBeCloseTo(127, 6);
    });
    it('is a no-op for a USD position', () => {
        const usd: PositionLike = { ticker: 'AAPL', side: 'long', entry_price: 10, shares: 5, position_size_usd: null, currency: 'USD' };
        expect(nativeToUSD(usd, 50, forex)).toBe(50);
    });
});

describe('calcUnrealizedPnl', () => {
    it('respects long/short side', () => {
        const long: PositionLike = { ticker: 'AAPL', side: 'long', entry_price: 10, shares: 5, position_size_usd: null };
        const short: PositionLike = { ticker: 'AAPL', side: 'short', entry_price: 10, shares: 5, position_size_usd: null };
        expect(calcUnrealizedPnl(long, 12)).toBe(10);
        expect(calcUnrealizedPnl(short, 12)).toBe(-10);
    });
});

describe('USD-normalized aggregates (the helpers totals must route through)', () => {
    const gbpPos: PositionLike = { ticker: 'VOD.L', side: 'long', entry_price: 2, shares: 100, position_size_usd: null, realized_pnl: 50, currency: 'GBP' };
    it('calcUnrealizedPnlUSD: (2.5-2)*100 = £50 → $63.5', () => {
        expect(calcUnrealizedPnlUSD(gbpPos, 2.5, forex)).toBeCloseTo(63.5, 6);
    });
    it('getPositionExposureUSD: entry*shares £200 → $254', () => {
        expect(getPositionExposureUSD(gbpPos, forex)).toBeCloseTo(254, 6);
    });
    it('realizedPnlUSD: £50 → $63.5, and null → 0', () => {
        expect(realizedPnlUSD(gbpPos, forex)).toBeCloseTo(63.5, 6);
        expect(realizedPnlUSD({ ...gbpPos, realized_pnl: null }, forex)).toBe(0);
    });
});
