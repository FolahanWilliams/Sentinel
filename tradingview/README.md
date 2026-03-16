# Sentinel TradingView Indicators

Pine Script v6 indicators that port the Sentinel AI trading platform's technical analysis engine to TradingView charts.

## Files

| File | Type | Description |
|------|------|-------------|
| `sentinel-strategy.pine` | **Strategy** (overlay) | Full buy/sell strategy with backtesting, ATR-based stops, trailing stops, confluence scoring, and multi-timeframe confirmation |
| `sentinel-indicator.pine` | **Indicator** (pane) | TA Composite Score oscillator + confluence meter — use alongside the strategy for a dashboard view |

## How to Install

1. Open [TradingView](https://www.tradingview.com/) and navigate to any chart
2. Click **Pine Editor** (bottom panel)
3. Delete the default code and paste the contents of either `.pine` file
4. Click **Add to chart**

## Core Logic Ported from Sentinel

### TA Composite Score (-100 to +100)
Weighted sum of 7 components — exact match of `src/services/technicalAnalysis.ts`:

| Component | Bullish | Bearish | Weight |
|-----------|---------|---------|--------|
| RSI(14) | <30: +25, <40: +15 | >70: -25, >60: -10 | ±25 |
| MACD Histogram | >0: +20 | <0: -20 | ±20 |
| Trend (SMA 50/200) | Price > both: +25 | Price < both: -25 | ±25 |
| Volume (direction-aware) | Surge + buying: +20 | Surge + selling: -15 | ±20 |
| Bollinger Position | <10%: +15 | >90%: -15 | ±15 |
| Z-Score(20) | <-2.5: +20 | >+2.5: -20 | ±20 |
| Gap Exhaustion | Down gap: +10 | Up gap: -10 | ±10 |

### Confluence Scoring (0-100)
Combines base confidence (60%) + TA confirmations (40%), matching `computeConfluence()`:
- **Strong** (75+): High probability setup
- **Moderate** (55-74): Standard signal
- **Weak** (35-54): Low confidence
- **None** (<35): No signal

### Signal Filters
- **Confidence Gate**: Minimum 65% confluence to trigger (configurable)
- **Exhaustion Block**: Won't buy when RSI >80 + bearish MACD
- **Capitulation Block**: Won't short when RSI <20 + bullish MACD
- **Weekly MTF**: Optional weekly timeframe alignment check

### Risk Management
- **ATR-based stops** scale with confluence strength:
  - Strong confluence: 1.0x ATR (tight stop, high conviction)
  - Moderate: 1.25x ATR
  - Weak: 1.75x ATR
  - Very weak: 2.0x ATR
- **2:1 minimum R:R** for all entries
- **Trailing stop**: Moves to breakeven after +1x ATR gain

### Sentiment Divergence (Proxy)
Without external sentiment data, uses Z-Score + RSI momentum as proxy:
- **Panic Exhaustion**: Z-Score < -2.0 + RSI turning up → bullish boost
- **Euphoria Climax**: Z-Score > +2.0 + RSI turning down → bearish penalty

## What's NOT Included (requires external data)
The full Sentinel platform uses AI agents and external data that can't run in Pine Script:
- News/RSS sentiment analysis (Gemini AI)
- Options flow detection
- Earnings calendar blocking
- Peer strength comparison
- Retail vs institutional sentiment gap
- Confidence calibration from historical outcomes
- AI-driven conviction scoring (Buffett/Lynch framework)

These are replaced by the TA-only confluence scoring, which still captures the core mean-reversion logic.

## Recommended Settings by Timeframe

| Timeframe | RSI | SMA Fast/Slow | Conf Gate | Notes |
|-----------|-----|---------------|-----------|-------|
| Daily | 14 | 50/200 | 65 | Default — best for swing trades |
| 4H | 14 | 50/200 | 60 | Lower gate for intraday |
| 1H | 10 | 20/50 | 55 | Faster indicators for scalping |
| Weekly | 14 | 10/40 | 70 | Higher gate for position trades |
