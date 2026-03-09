/**
 * TickerLink — Reusable clickable ticker badge that navigates to /analysis/{ticker}.
 * Tracks recently visited tickers for the command palette.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecentTickers } from '@/hooks/useRecentTickers';

interface TickerLinkProps {
    ticker: string;
    className?: string;
}

export function TickerLink({ ticker, className = '' }: TickerLinkProps) {
    const navigate = useNavigate();
    const { addRecent } = useRecentTickers();

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        addRecent(ticker);
        navigate(`/analysis/${ticker}`);
    }, [ticker, navigate, addRecent]);

    return (
        <button
            onClick={handleClick}
            className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/20 hover:border-blue-500/30 transition-colors cursor-pointer ${className}`}
            title={`View analysis for ${ticker}`}
        >
            {ticker}
        </button>
    );
}
