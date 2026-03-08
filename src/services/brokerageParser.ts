/**
 * Sentinel — Brokerage Document Parser
 *
 * Multi-brokerage parser supporting:
 * - Hargreaves Lansdown (HL) CSV exports
 * - Wells Fargo Advisors PDF statements
 * - Generic CSV portfolio exports (Fidelity, Schwab, etc.)
 *
 * All parsers output a unified ParsedHolding[] that the import UI can display.
 */


/* ─── Shared types ─── */

export interface ParsedHolding {
    ticker: string;
    name: string;
    quantity: number;
    price: number;       // Current/last price per share (in target currency)
    value: number;       // Current market value
    cost: number;        // Total cost basis
    pnl: number;
    pnlPct: number;
    selected: boolean;
    isDuplicate: boolean;
    isConverted: boolean; // True if currency-converted (e.g. HL *R stocks)
}

export interface AccountSummary {
    stockValue: number;
    totalCash: number;
    totalValue: number;
}

export interface ParseResult {
    holdings: ParsedHolding[];
    errors: string[];
    accountSummary: AccountSummary | null;
    exchangeRate: number | null;
    isGBPSource: boolean;
    brokerage: BrokerageType;
}

export type BrokerageType = 'hargreaves-lansdown' | 'wells-fargo' | 'generic-csv' | 'unknown';

/* ─── CSV utilities ─── */

/** Parse a single CSV line handling quoted fields */
export function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current.trim());
    return result;
}

/** Parse a number from common brokerage formats (handles commas, currency symbols, parens for negatives) */
export function parseNumber(val: string): number {
    if (!val) return 0;
    // Handle parentheses as negatives: (123.45) → -123.45
    const isNeg = val.includes('(') && val.includes(')');
    const cleaned = val.replace(/[£$€,\s()]/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === 'n/a' || cleaned === '--') return 0;
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    return isNeg ? -num : num;
}

/** Safe column accessor */
function getCol(cols: string[], idx: number | undefined): string {
    if (idx === undefined || idx < 0 || idx >= cols.length) return '';
    return cols[idx] ?? '';
}

/* ─── Brokerage detection ─── */

/** Detect which brokerage format the text content belongs to */
export function detectBrokerage(text: string, fileName: string): BrokerageType {
    const lower = text.toLowerCase();

    // Wells Fargo Advisors detection
    if (
        lower.includes('wells fargo') ||
        lower.includes('wellsfargoadvisors') ||
        lower.includes('wfcs custodian') ||
        lower.includes('portfolio detail')
    ) {
        return 'wells-fargo';
    }

    // Hargreaves Lansdown detection
    if (
        lower.includes('hargreaves lansdown') ||
        lower.includes('units held') ||
        lower.includes('price (pence)') ||
        (lower.includes('stock value:') && lower.includes('total cash:')) ||
        lower.includes('usd to 100 p')
    ) {
        return 'hargreaves-lansdown';
    }

    // Generic CSV fallback if it's a CSV file with recognizable columns
    if (fileName.toLowerCase().endsWith('.csv')) {
        return 'generic-csv';
    }

    return 'unknown';
}

/* ─── Hargreaves Lansdown CSV parser ─── */

function findHeaderRow(lines: string[]): number {
    const headerKeywords = ['code', 'ticker', 'tidm', 'stock', 'units held', 'price', 'value', 'cost'];
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const lower = (lines[i] ?? '').toLowerCase();
        const matches = headerKeywords.filter(kw => lower.includes(kw));
        if (matches.length >= 3) return i;
    }
    return -1;
}

function parseHLAccountSummary(lines: string[], headerIdx: number): AccountSummary {
    const summary: AccountSummary = { stockValue: 0, totalCash: 0, totalValue: 0 };
    for (let i = 0; i < headerIdx; i++) {
        const cols = parseCSVLine(lines[i] ?? '');
        const label = (cols[0] ?? '').toLowerCase().replace(/[:]/g, '').trim();
        const val = parseNumber(cols[2] ?? '') || parseNumber(cols[1] ?? '');
        if (label === 'stock value') summary.stockValue = val;
        else if (label === 'total cash') summary.totalCash = val;
        else if (label === 'amount available to invest' && summary.totalCash === 0) summary.totalCash = val;
        else if (label === 'total value') summary.totalValue = val;
    }
    if (summary.totalValue === 0 && summary.stockValue > 0) {
        summary.totalValue = summary.stockValue + summary.totalCash;
    }
    return summary;
}

function parseHLExchangeRate(lines: string[]): number | null {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = (lines[i] ?? '').toLowerCase();
        const match = line.match(/([\d.]+)\s*usd\s+to\s+100\s*p/);
        if (match) {
            const rate = parseFloat(match[1]!);
            if (rate > 0 && rate < 10) return rate;
        }
    }
    return null;
}

export function parseHLCSV(text: string, existingTickers: Set<string>): ParseResult {
    const errors: string[] = [];
    const holdings: ParsedHolding[] = [];

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
        errors.push('CSV file appears empty or has no data rows.');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false, brokerage: 'hargreaves-lansdown' };
    }

    const headerIdx = findHeaderRow(lines);
    if (headerIdx === -1) {
        errors.push('Could not find the data header row. Expected columns like "Code", "Stock", "Units held", "Price", "Value", "Cost".');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false, brokerage: 'hargreaves-lansdown' };
    }

    const accountSummary = parseHLAccountSummary(lines, headerIdx);
    const exchangeRate = parseHLExchangeRate(lines);
    const headers = parseCSVLine(lines[headerIdx] ?? '').map(h => h.toLowerCase().trim());

    const isGBPSource = headers.some(h => h.includes('£') || h.includes('pence'));

    const colMap: Record<string, number | undefined> = {};
    const aliases: Record<string, string[]> = {
        ticker: ['code', 'ticker', 'tidm', 'epic', 'symbol'],
        name: ['stock', 'stock name', 'name', 'holding', 'security'],
        quantity: ['units held', 'quantity', 'units', 'shares', 'holding quantity'],
        price: ['price (pence)', 'price (p)', 'price', 'current price', 'last price'],
        value: ['value (£)', 'value (gbp)', 'value', 'market value', 'current value'],
        cost: ['cost (£)', 'cost (gbp)', 'cost', 'total cost', 'book cost'],
        gainLoss: ['gain/loss (£)', 'gain/loss', 'p&l'],
        gainLossPct: ['gain/loss (%)', 'gain/loss %', 'p&l %'],
    };

    for (const [field, names] of Object.entries(aliases)) {
        const idx = headers.findIndex(h => names.some(n => h.includes(n)));
        if (idx !== -1) colMap[field] = idx;
    }

    if (colMap.ticker === undefined) {
        errors.push(`Could not find a Code/Ticker column in header row ${headerIdx + 1}. Found columns: ${headers.filter(h => h).join(', ')}`);
        return { holdings, errors, accountSummary, exchangeRate, isGBPSource, brokerage: 'hargreaves-lansdown' };
    }
    if (colMap.quantity === undefined && colMap.value === undefined) {
        errors.push('Could not find "Units held" or "Value" columns in CSV header.');
        return { holdings, errors, accountSummary, exchangeRate, isGBPSource, brokerage: 'hargreaves-lansdown' };
    }

    const priceInPence = headers.some(h => h.includes('pence') || h.includes('(p)'));
    const gbpToUsd = (isGBPSource && exchangeRate) ? exchangeRate : 1;

    const tickerIdx = colMap.ticker;
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i] ?? '');
        if (cols.length < 2) continue;

        const rawTicker = getCol(cols, tickerIdx);
        if (!rawTicker) continue;
        const lowerTicker = rawTicker.toLowerCase().trim();
        if (lowerTicker === 'totals' || lowerTicker === 'total' || lowerTicker === 'cash') continue;
        if (lowerTicker.startsWith('shares are') || lowerTicker.startsWith('*') || lowerTicker.startsWith('-')) continue;

        const nameVal = getCol(cols, colMap.name);
        if (nameVal.toLowerCase().trim() === 'totals' || nameVal.toLowerCase().trim() === 'total') continue;

        const baseTicker = rawTicker.toUpperCase().trim();
        if (!/^[A-Z0-9.]{1,10}$/.test(baseTicker)) continue;

        const isConverted = nameVal.includes('*R');
        const ticker = (isGBPSource && !isConverted) ? `${baseTicker}.L` : baseTicker;
        const name = nameVal.replace(/\s*\*\d+\s*/g, '').replace(/\s*\*R\s*/g, '').trim() || ticker;
        const quantity = parseNumber(getCol(cols, colMap.quantity));
        let price = parseNumber(getCol(cols, colMap.price));
        let value = parseNumber(getCol(cols, colMap.value));
        let cost = parseNumber(getCol(cols, colMap.cost));

        if (priceInPence && price > 0) price = price / 100;
        if (isConverted && gbpToUsd > 1) {
            value = value * gbpToUsd;
            cost = cost * gbpToUsd;
            price = price * gbpToUsd;
        }

        const gainLoss = parseNumber(getCol(cols, colMap.gainLoss));
        const gainLossPct = parseNumber(getCol(cols, colMap.gainLossPct));

        if (quantity <= 0 && value <= 0 && cost <= 0) continue;

        const effectiveCost = cost || value;
        const effectiveQty = quantity || (price > 0 ? (value || cost) / price : 0);
        const entryPrice = effectiveQty > 0 ? effectiveCost / effectiveQty : price;
        const pnl = gainLoss || (value - cost);
        const pnlPct = gainLossPct || (cost > 0 ? ((value - cost) / cost) * 100 : 0);
        const isDuplicate = existingTickers.has(ticker) || existingTickers.has(baseTicker) || existingTickers.has(`${baseTicker}.L`);

        holdings.push({
            ticker, name, quantity: effectiveQty, price: entryPrice,
            value: value || cost, cost: effectiveCost, pnl, pnlPct,
            selected: !isDuplicate, isDuplicate, isConverted,
        });
    }

    if (holdings.length === 0 && errors.length === 0) {
        errors.push('No valid holdings found in CSV. Expected HL account-summary format.');
    }

    const dupeCount = holdings.filter(h => h.isDuplicate).length;
    if (dupeCount > 0) {
        errors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    return {
        holdings, errors,
        accountSummary: accountSummary.totalValue > 0 ? accountSummary : null,
        exchangeRate, isGBPSource, brokerage: 'hargreaves-lansdown',
    };
}

/* ─── Wells Fargo PDF parser ─── */

/**
 * Cost basis record extracted from WF Activity Detail section.
 * Tracks purchase transactions (REINVEST DIV, BUY, etc.) per ticker.
 */
interface WFCostBasisEntry {
    ticker: string;
    totalCost: number;    // Total dollars spent purchasing
    totalShares: number;  // Total shares acquired
}

/**
 * Parse the Activity Detail section of a WF PDF to extract cost basis.
 *
 * Activity detail format:
 *   DATE | ACCOUNT TYPE | TRANSACTION | QUANTITY | DESCRIPTION | PRICE | AMOUNT | CASH AND SWEEP BALANCES
 *
 * Example rows:
 *   02/12  Cash  REINVEST DIV  0.00200  APPLE INC  REINVEST AT 275.337  -0.54  -100.00
 *   02/12  Cash  DIVIDEND                APPLE INC  021226  2.05900     0.54
 *
 * We look for REINVEST DIV / BUY transactions to compute actual cost basis.
 */
function parseWFActivityDetail(lines: string[]): Map<string, WFCostBasisEntry> {
    const costMap = new Map<string, WFCostBasisEntry>();

    let inActivitySection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Detect Activity detail section
        if (/^activity\s+detail/i.test(line)) {
            inActivitySection = true;
            continue;
        }

        if (!inActivitySection) continue;

        // Stop at next major section or page break
        if (/^(portfolio detail|account summary|page \d|--- PAGE BREAK ---)/i.test(line)) {
            // Could be a new page continuing activity — only stop at non-activity sections
            if (/^(portfolio detail|account summary)/i.test(line)) {
                inActivitySection = false;
                continue;
            }
            continue;
        }

        // Look for purchase-type transactions
        const isReinvest = /reinvest\s+div/i.test(line);
        const isBuy = /\bbuy\b/i.test(line) && !/\bsell\b/i.test(line);

        if (!isReinvest && !isBuy) continue;

        // Extract quantity and price from this line and nearby lines
        // Pattern: "REINVEST DIV  0.00200  APPLE INC  REINVEST AT 275.337"
        const numbers = extractNumbersFromWFLine(line);

        // For REINVEST DIV: look for "REINVEST AT <price>" pattern
        const reinvestMatch = line.match(/reinvest\s+at\s+([\d,.]+)/i);
        const reinvestPrice = reinvestMatch ? parseFloat(reinvestMatch[1]!.replace(/,/g, '')) : 0;

        // Find the ticker — look at nearby lines for a standalone ticker
        let ticker = '';

        // Check current line for stock name, then look for ticker below
        // WF pattern: transaction line has the stock name, ticker might be on next line
        // Or the ticker is embedded: "APPLE INC" -> need to find "AAPL" nearby
        for (let j = i - 2; j <= i + 3 && j < lines.length; j++) {
            if (j < 0) continue;
            const candidate = lines[j]!.trim();
            if (isLikelyTicker(candidate)) {
                ticker = candidate;
                break;
            }
        }

        if (!ticker) continue;

        // Determine quantity and cost for this transaction
        let qty = 0;
        let cost = 0;

        if (numbers.length >= 1) {
            // For reinvest: first small number is usually quantity
            for (const num of numbers) {
                if (num > 0 && num < 1000 && qty === 0) {
                    // Could be quantity (small) or amount
                    if (reinvestPrice > 0 && num < reinvestPrice) {
                        qty = num;
                    } else if (num < 10) {
                        qty = num; // Likely fractional share quantity
                    }
                }
            }

            if (qty > 0 && reinvestPrice > 0) {
                cost = qty * reinvestPrice;
            } else {
                // Look for AMOUNT column (negative = cash outflow = purchase)
                for (const num of numbers) {
                    if (num < 0 && Math.abs(num) > 0.01) {
                        cost = Math.abs(num);
                        break;
                    }
                }
            }
        }

        if (qty > 0 || cost > 0) {
            const existing = costMap.get(ticker) ?? { ticker, totalCost: 0, totalShares: 0 };
            existing.totalCost += cost;
            existing.totalShares += qty;
            costMap.set(ticker, existing);
        }
    }

    return costMap;
}

/**
 * Parse Wells Fargo Advisors PDF statement text.
 *
 * WF PDF structure (from text extraction):
 * - "Portfolio detail" section header
 * - "Cash and Sweep Balances" with negative cash values
 * - "Stocks, options & ETFs" / "Stocks and ETFs" section
 * - Table: DESCRIPTION | QUANTITY | CURRENT PRICE | CURRENT MARKET VALUE | ANNUAL INCOME | ANNUAL YIELD (%)
 * - Holdings like:
 *     APPLE INC        2.06100     264.1800     544.47     2     0.39
 *     AAPL
 *   (Ticker appears on the next line under the name)
 * - "Total Stocks and ETFs" summary line
 * - "Activity detail" section with purchase/dividend/reinvest transactions
 */
export function parseWellsFargoPDF(text: string, existingTickers: Set<string>): ParseResult {
    const errors: string[] = [];
    const holdings: ParsedHolding[] = [];
    let accountSummary: AccountSummary | null = null;

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Extract cost basis from Activity Detail section
    const costBasis = parseWFActivityDetail(lines);

    // Extract account summary — look for total values
    let totalStocksValue = 0;
    let cashValue = 0;

    // Parse cash balance
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^cash$/i.test(line) || /^cash\s/i.test(line)) {
            // Cash line — next numbers or same line
            const nums = extractNumbers(line);
            if (nums.length > 0) {
                cashValue = nums[0]!;
            } else if (i + 1 < lines.length) {
                const nextNums = extractNumbers(lines[i + 1]!);
                if (nextNums.length > 0) cashValue = nextNums[0]!;
            }
        }
        // Total Cash and Sweep Balances line
        if (/total cash and sweep/i.test(line)) {
            const nums = extractNumbers(line);
            if (nums.length > 0) cashValue = nums[0]!;
        }
        // Total Stocks and ETFs value
        if (/total stocks/i.test(line) && /etf/i.test(line)) {
            const nums = extractNumbers(line);
            if (nums.length > 0) totalStocksValue = nums[0]!;
        }
    }

    if (totalStocksValue > 0 || cashValue !== 0) {
        accountSummary = {
            stockValue: totalStocksValue,
            totalCash: cashValue,
            totalValue: totalStocksValue + Math.abs(cashValue),
        };
    }

    // Find the stocks section and parse holdings
    let inStocksSection = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i]!;

        // Detect start of stocks section
        if (/stocks\s+(and|&)\s+etfs/i.test(line) && !(/total/i.test(line))) {
            inStocksSection = true;
            i++;
            // Skip header lines (DESCRIPTION, QUANTITY, etc.)
            while (i < lines.length) {
                const headerLine = lines[i]!.toLowerCase();
                if (headerLine.includes('description') || headerLine.includes('quantity') ||
                    headerLine.includes('current') || headerLine.includes('price') ||
                    headerLine.includes('estimated') || headerLine.includes('annual') ||
                    headerLine.includes('market value') || headerLine.includes('yield')) {
                    i++;
                } else {
                    break;
                }
            }
            continue;
        }

        // Detect end of stocks section
        if (inStocksSection && (/total stocks/i.test(line) || /activity detail/i.test(line))) {
            inStocksSection = false;
            i++;
            continue;
        }

        if (!inStocksSection) {
            i++;
            continue;
        }

        // Try to parse a holding from current position
        const holding = tryParseWFHolding(lines, i, existingTickers);
        if (holding) {
            holdings.push(holding.holding);
            i = holding.nextIndex;
        } else {
            i++;
        }
    }

    if (holdings.length === 0 && errors.length === 0) {
        // Fallback: try a more aggressive line-by-line parse for any recognizable tickers with numbers
        const fallbackHoldings = parseWFByTickerPattern(lines, existingTickers);
        if (fallbackHoldings.length > 0) {
            holdings.push(...fallbackHoldings);
        } else {
            errors.push('No holdings found in Wells Fargo PDF. Make sure the PDF contains a "Portfolio detail" or "Stocks and ETFs" section.');
        }
    }

    // Apply cost basis from Activity Detail to holdings
    let costBasisApplied = 0;
    for (const h of holdings) {
        const cb = costBasis.get(h.ticker);
        if (cb && cb.totalCost > 0) {
            // Activity detail has actual purchase cost — use it instead of market value
            h.cost = cb.totalCost;
            h.price = cb.totalShares > 0 ? cb.totalCost / cb.totalShares : h.price;
            h.pnl = h.value - h.cost;
            h.pnlPct = h.cost > 0 ? ((h.value - h.cost) / h.cost) * 100 : 0;
            costBasisApplied++;
        }
    }

    if (costBasisApplied > 0) {
        errors.push(`Cost basis extracted from Activity Detail for ${costBasisApplied} holding${costBasisApplied > 1 ? 's' : ''}.`);
    }

    const dupeCount = holdings.filter(h => h.isDuplicate).length;
    if (dupeCount > 0) {
        errors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    return {
        holdings, errors, accountSummary,
        exchangeRate: null, isGBPSource: false, brokerage: 'wells-fargo',
    };
}

/** Extract all numbers from a line */
function extractNumbers(line: string): number[] {
    const matches = line.match(/-?[\d,]+\.?\d*/g);
    if (!matches) return [];
    return matches.map(m => parseFloat(m.replace(/,/g, ''))).filter(n => !isNaN(n));
}

/** Check if a string looks like a US stock ticker */
function isLikelyTicker(s: string): boolean {
    return /^[A-Z]{1,5}$/.test(s.trim());
}

interface WFHoldingResult {
    holding: ParsedHolding;
    nextIndex: number;
}

/**
 * Try to parse a Wells Fargo holding starting at line index.
 *
 * WF PDF text extraction typically produces patterns like:
 *   Line i:   "APPLE INC"  (or "APPLE INC 2.06100 264.1800 544.47 2 0.39")
 *   Line i+1: "AAPL"       (ticker)
 *
 * OR sometimes:
 *   Line i:   "APPLE INC"
 *   Line i+1: "2.06100  264.1800  544.47"
 *   Line i+2: "AAPL"
 *
 * We handle various PDF text extraction layouts.
 */
function tryParseWFHolding(
    lines: string[],
    startIdx: number,
    existingTickers: Set<string>
): WFHoldingResult | null {
    const line = lines[startIdx]!;

    // Skip lines that are clearly not holdings
    if (/^(total|date|cash|page|\d{2}\/\d{2})/i.test(line)) return null;
    if (/^(beginning|dividend|reinvest|estimated|current|annual)/i.test(line)) return null;

    // We need to find: name, ticker, quantity, price, market value
    // Approach: collect this line and a few subsequent lines, extract data

    // Check if the current line starts with a company name (contains letters, possibly with numbers at end)
    const hasLetters = /[A-Z]{2,}/.test(line);
    if (!hasLetters) return null;

    // Look ahead for ticker and numbers
    let name = '';
    let ticker = '';
    let numbers: number[] = [];
    let endIdx = startIdx + 1;

    // Extract numbers from current line
    const lineNumbers = extractNumbersFromWFLine(line);
    const lineText = line.replace(/-?[\d,]+\.?\d*/g, '').trim();

    if (lineNumbers.length >= 3 && lineText.length > 1) {
        // Name and numbers on same line: "APPLE INC 2.06100 264.1800 544.47 2 0.39"
        name = lineText;
        numbers = lineNumbers;

        // Next line should be ticker
        if (startIdx + 1 < lines.length && isLikelyTicker(lines[startIdx + 1]!)) {
            ticker = lines[startIdx + 1]!.trim();
            endIdx = startIdx + 2;
        }
        // Possibly ticker + class on next line, e.g. "CLASS A" then "META"
        if (!ticker && startIdx + 2 < lines.length) {
            if (/^class\s/i.test(lines[startIdx + 1]!)) {
                name += ' ' + lines[startIdx + 1]!.trim();
                if (isLikelyTicker(lines[startIdx + 2]!)) {
                    ticker = lines[startIdx + 2]!.trim();
                    endIdx = startIdx + 3;
                }
            }
        }
    } else {
        // Name only on this line, look for numbers and ticker on subsequent lines
        name = lineText || line;

        for (let j = startIdx + 1; j < Math.min(startIdx + 5, lines.length); j++) {
            const nextLine = lines[j]!;

            // Check for "CLASS A" type suffixes
            if (/^class\s/i.test(nextLine)) {
                name += ' ' + nextLine.trim();
                continue;
            }

            if (isLikelyTicker(nextLine) && !ticker) {
                ticker = nextLine.trim();
                endIdx = j + 1;
                continue;
            }

            const nextNumbers = extractNumbersFromWFLine(nextLine);
            if (nextNumbers.length >= 2 && numbers.length === 0) {
                numbers = nextNumbers;
                endIdx = Math.max(endIdx, j + 1);
                continue;
            }

            // Stop if we hit another holding name or section
            if (/^[A-Z]{2,}\s+[A-Z]/.test(nextLine) && !isLikelyTicker(nextLine)) break;
            if (/^total/i.test(nextLine) || /^activity/i.test(nextLine)) break;
        }
    }

    // Need at minimum a ticker and quantity+price
    if (!ticker || numbers.length < 2) return null;

    // WF columns: QUANTITY, CURRENT PRICE, CURRENT MARKET VALUE, ANNUAL INCOME, ANNUAL YIELD
    const quantity = numbers[0]!;
    const price = numbers[1]!;
    const value = numbers.length >= 3 ? numbers[2]! : quantity * price;

    if (quantity <= 0 && value <= 0) return null;

    const cost = value; // WF statements show market value, not cost basis on this page
    const isDuplicate = existingTickers.has(ticker) || existingTickers.has(`${ticker}.L`);

    return {
        holding: {
            ticker,
            name: name.trim(),
            quantity,
            price,
            value,
            cost,
            pnl: 0,  // WF portfolio detail page doesn't show P&L per holding
            pnlPct: 0,
            selected: !isDuplicate,
            isDuplicate,
            isConverted: false,
        },
        nextIndex: endIdx,
    };
}

/** Extract numbers from a WF PDF line, being careful about ticker-like short numbers */
function extractNumbersFromWFLine(line: string): number[] {
    // Remove text words, keep numbers
    const parts = line.split(/\s+/);
    const nums: number[] = [];
    for (const part of parts) {
        const cleaned = part.replace(/[,$%()]/g, '');
        if (/^-?\d+\.?\d*$/.test(cleaned)) {
            nums.push(parseFloat(cleaned));
        }
    }
    return nums;
}

/**
 * Fallback parser: scan for known ticker patterns followed by numbers.
 * Handles cases where the PDF text extraction doesn't produce clean sections.
 */
function parseWFByTickerPattern(lines: string[], existingTickers: Set<string>): ParsedHolding[] {
    const holdings: ParsedHolding[] = [];
    const seenTickers = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Look for a line that is just a ticker (1-5 uppercase letters)
        if (!isLikelyTicker(line)) continue;
        const ticker = line.trim();
        if (seenTickers.has(ticker)) continue;

        // Look backwards for a name and numbers
        let name = '';
        let numbers: number[] = [];

        // Check previous lines for the company name + numbers
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const prevLine = lines[j]!;
            if (/^(total|date|cash|page)/i.test(prevLine)) break;

            const prevNums = extractNumbersFromWFLine(prevLine);
            if (prevNums.length >= 2 && numbers.length === 0) {
                numbers = prevNums;
            }

            const prevText = prevLine.replace(/-?[\d,]+\.?\d*/g, '').trim();
            if (prevText.length > 1 && /[A-Z]{2,}/.test(prevText)) {
                name = prevText + (name ? ' ' + name : '');
            }
        }

        if (numbers.length >= 2) {
            seenTickers.add(ticker);
            const quantity = numbers[0]!;
            const price = numbers[1]!;
            const value = numbers.length >= 3 ? numbers[2]! : quantity * price;
            const isDuplicate = existingTickers.has(ticker);

            holdings.push({
                ticker, name: name || ticker, quantity, price, value,
                cost: value, pnl: 0, pnlPct: 0,
                selected: !isDuplicate, isDuplicate, isConverted: false,
            });
        }
    }

    return holdings;
}

/* ─── Generic CSV parser ─── */

/**
 * Parse a generic brokerage CSV export.
 *
 * Supports common formats from: Fidelity, Schwab, TD Ameritrade, Interactive Brokers,
 * Vanguard, E*Trade, and similar.
 *
 * Expected columns (flexible matching):
 * - Symbol/Ticker: stock symbol
 * - Description/Name: stock name
 * - Quantity/Shares: number of shares
 * - Price/Last Price/Current Price: current or entry price
 * - Market Value/Current Value: total value
 * - Cost Basis/Average Cost: cost basis
 */
export function parseGenericCSV(text: string, existingTickers: Set<string>): ParseResult {
    const errors: string[] = [];
    const holdings: ParsedHolding[] = [];

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
        errors.push('CSV file appears empty.');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false, brokerage: 'generic-csv' };
    }

    // Find header row — scan first 20 lines for one with recognizable column names
    const genericKeywords = [
        'symbol', 'ticker', 'description', 'name', 'quantity', 'shares',
        'price', 'value', 'cost', 'market', 'last', 'security', 'account',
    ];

    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const lower = (lines[i] ?? '').toLowerCase();
        const matches = genericKeywords.filter(kw => lower.includes(kw));
        if (matches.length >= 2) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) {
        errors.push('Could not find a header row with recognizable columns (Symbol, Quantity, Price, Value, etc.).');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false, brokerage: 'generic-csv' };
    }

    const headers = parseCSVLine(lines[headerIdx]!).map(h => h.toLowerCase().trim());

    // Map columns with broad aliases
    const colMap: Record<string, number | undefined> = {};
    const aliases: Record<string, string[]> = {
        ticker: ['symbol', 'ticker', 'code', 'tidm', 'epic', 'cusip'],
        name: ['description', 'name', 'security', 'stock', 'holding', 'security name', 'security description', 'stock name'],
        quantity: ['quantity', 'shares', 'units', 'units held', 'qty', 'holding quantity', 'shares/contracts'],
        price: ['price', 'last price', 'current price', 'last', 'close', 'closing price', 'price (pence)', 'price (p)'],
        value: ['market value', 'current value', 'value', 'current market value', 'total value', 'mkt value'],
        cost: ['cost basis', 'cost', 'average cost', 'avg cost', 'total cost', 'book cost', 'cost basis total'],
        gainLoss: ['gain/loss', 'gain loss', 'unrealized gain', 'unrealized gain/loss', 'p&l', 'profit/loss'],
        gainLossPct: ['gain/loss %', 'gain/loss percent', '% gain/loss', 'p&l %'],
    };

    for (const [field, names] of Object.entries(aliases)) {
        const idx = headers.findIndex(h => names.some(n => h.includes(n)));
        if (idx !== -1) colMap[field] = idx;
    }

    if (colMap.ticker === undefined) {
        // Try to infer ticker column: look for a column where values look like stock tickers
        for (let c = 0; c < headers.length; c++) {
            const sampleValues = [];
            for (let r = headerIdx + 1; r < Math.min(headerIdx + 6, lines.length); r++) {
                const cols = parseCSVLine(lines[r]!);
                if (cols[c]) sampleValues.push(cols[c]!.trim());
            }
            if (sampleValues.length > 0 && sampleValues.every(v => /^[A-Z]{1,5}$/.test(v))) {
                colMap.ticker = c;
                break;
            }
        }
    }

    if (colMap.ticker === undefined) {
        errors.push('Could not find a Symbol/Ticker column.');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false, brokerage: 'generic-csv' };
    }

    // Detect if values are in GBP
    const isGBPSource = headers.some(h => h.includes('£') || h.includes('gbp') || h.includes('pence'));

    // Parse account summary from pre-header rows
    let totalValue = 0;
    for (let i = 0; i < headerIdx; i++) {
        const lower = (lines[i] ?? '').toLowerCase();
        if (lower.includes('total') && lower.includes('value')) {
            const nums = extractNumbers(lines[i]!);
            if (nums.length > 0) totalValue = Math.max(...nums.filter(n => n > 0));
        }
    }

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]!);
        if (cols.length < 2) continue;

        const rawTicker = getCol(cols, colMap.ticker);
        if (!rawTicker) continue;

        const ticker = rawTicker.toUpperCase().trim()
            .replace(/[*]+$/, '')  // Remove trailing asterisks
            .replace(/\s+/g, ''); // Remove spaces

        // Skip non-ticker values
        if (!/^[A-Z0-9./]{1,12}$/.test(ticker)) continue;
        const lowerTicker = ticker.toLowerCase();
        if (['total', 'totals', 'cash', 'pending', 'account', 'n/a', '--'].includes(lowerTicker)) continue;

        const name = getCol(cols, colMap.name).replace(/\*+/g, '').trim() || ticker;
        const quantity = parseNumber(getCol(cols, colMap.quantity));
        const price = parseNumber(getCol(cols, colMap.price));
        const value = parseNumber(getCol(cols, colMap.value));
        const cost = parseNumber(getCol(cols, colMap.cost));
        const gainLoss = parseNumber(getCol(cols, colMap.gainLoss));
        const gainLossPct = parseNumber(getCol(cols, colMap.gainLossPct));

        if (quantity <= 0 && value <= 0 && cost <= 0) continue;

        const effectiveCost = cost || value;
        const effectiveQty = quantity || (price > 0 ? (value || cost) / price : 0);
        const entryPrice = effectiveQty > 0 ? effectiveCost / effectiveQty : price;
        const pnl = gainLoss || (value && cost ? value - cost : 0);
        const pnlPct = gainLossPct || (cost > 0 ? ((value - cost) / cost) * 100 : 0);
        const isDuplicate = existingTickers.has(ticker) || existingTickers.has(`${ticker}.L`);

        holdings.push({
            ticker, name, quantity: effectiveQty, price: entryPrice,
            value: value || cost, cost: effectiveCost, pnl, pnlPct,
            selected: !isDuplicate, isDuplicate, isConverted: false,
        });
    }

    if (holdings.length === 0 && errors.length === 0) {
        errors.push('No valid holdings found. The CSV may use an unsupported format. Expected columns: Symbol, Quantity/Shares, Price, Value.');
    }

    const dupeCount = holdings.filter(h => h.isDuplicate).length;
    if (dupeCount > 0) {
        errors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    const accountSummary: AccountSummary | null = totalValue > 0
        ? { stockValue: totalValue, totalCash: 0, totalValue }
        : (holdings.length > 0
            ? { stockValue: holdings.reduce((s, h) => s + h.value, 0), totalCash: 0, totalValue: holdings.reduce((s, h) => s + h.value, 0) }
            : null);

    return {
        holdings, errors, accountSummary,
        exchangeRate: null, isGBPSource, brokerage: 'generic-csv',
    };
}

/* ─── PDF text extraction ─── */

/**
 * Extract text from a PDF file using pdf.js.
 * Returns the full text content with newlines between text items.
 */
export async function extractPDFText(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker source — use bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        let lastY: number | null = null;
        for (const item of textContent.items) {
            if (!('str' in item)) continue;
            const textItem = item as { str: string; transform: number[] };
            const y = textItem.transform[5];
            // New line if Y position changed significantly
            if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
                textParts.push('\n');
            }
            textParts.push(textItem.str);
            if (y !== undefined) lastY = y;
        }
        textParts.push('\n--- PAGE BREAK ---\n');
    }

    return textParts.join(' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n');
}

/* ─── Main parse dispatcher ─── */

/**
 * Parse a brokerage document (CSV or PDF).
 * Auto-detects brokerage and file type, dispatches to the appropriate parser.
 */
export async function parseBrokerageDocument(
    file: File,
    existingTickers: Set<string>
): Promise<ParseResult> {
    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith('.pdf');

    if (isPDF) {
        try {
            const text = await extractPDFText(file);
            const brokerage = detectBrokerage(text, file.name);

            if (brokerage === 'wells-fargo') {
                return parseWellsFargoPDF(text, existingTickers);
            }

            // For other PDF brokerages, try generic parsing from extracted text
            // Convert text lines into a pseudo-CSV and try generic parser
            return parseGenericPDFText(text, existingTickers, brokerage);
        } catch (err) {
            return {
                holdings: [],
                errors: [`Failed to read PDF: ${err instanceof Error ? err.message : 'Unknown error'}. Try exporting as CSV from your brokerage instead.`],
                accountSummary: null,
                exchangeRate: null,
                isGBPSource: false,
                brokerage: 'unknown',
            };
        }
    }

    // CSV file
    const text = await file.text();
    const brokerage = detectBrokerage(text, file.name);

    if (brokerage === 'hargreaves-lansdown') {
        return parseHLCSV(text, existingTickers);
    }

    return parseGenericCSV(text, existingTickers);
}

/* ─── Multi-file merge ─── */

/** Metadata about a parsed file for the UI */
export interface ParsedFileInfo {
    fileName: string;
    brokerage: BrokerageType;
    holdingsCount: number;
    status: 'pending' | 'parsing' | 'done' | 'error';
    error?: string;
}

/**
 * Parse multiple brokerage documents and merge holdings.
 *
 * Deduplication strategy:
 * - If the same ticker appears in multiple files, keep the one with the most
 *   recent/largest quantity (assumes newer statements are more current).
 * - Merge cost basis: if one file has cost basis data and another doesn't,
 *   prefer the one with real cost basis.
 * - Account summaries are summed across files from different accounts,
 *   or use the latest for same-account files.
 *
 * @param files Array of files to parse
 * @param existingTickers Tickers already in the portfolio
 * @param onProgress Callback for per-file progress updates
 */
export async function parseMultipleBrokerageDocuments(
    files: File[],
    existingTickers: Set<string>,
    onProgress?: (fileInfos: ParsedFileInfo[]) => void,
): Promise<ParseResult> {
    const fileInfos: ParsedFileInfo[] = files.map(f => ({
        fileName: f.name,
        brokerage: 'unknown' as BrokerageType,
        holdingsCount: 0,
        status: 'pending' as const,
    }));

    const allResults: ParseResult[] = [];
    const allErrors: string[] = [];

    // Parse each file sequentially (PDF parsing is memory-intensive)
    for (let i = 0; i < files.length; i++) {
        fileInfos[i]!.status = 'parsing';
        onProgress?.(fileInfos);

        try {
            const result = await parseBrokerageDocument(files[i]!, existingTickers);
            allResults.push(result);
            fileInfos[i]!.brokerage = result.brokerage;
            fileInfos[i]!.holdingsCount = result.holdings.length;
            fileInfos[i]!.status = 'done';

            if (result.errors.length > 0) {
                allErrors.push(`[${files[i]!.name}] ${result.errors.join('; ')}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            fileInfos[i]!.status = 'error';
            fileInfos[i]!.error = msg;
            allErrors.push(`[${files[i]!.name}] Failed to parse: ${msg}`);
        }

        onProgress?.(fileInfos);
    }

    if (allResults.length === 0) {
        return {
            holdings: [],
            errors: allErrors.length > 0 ? allErrors : ['No files could be parsed.'],
            accountSummary: null,
            exchangeRate: null,
            isGBPSource: false,
            brokerage: 'unknown',
        };
    }

    // Merge holdings across files — deduplicate by ticker
    const holdingMap = new Map<string, ParsedHolding>();

    for (const result of allResults) {
        for (const h of result.holdings) {
            const key = h.ticker.toUpperCase();
            const existing = holdingMap.get(key);

            if (!existing) {
                holdingMap.set(key, { ...h });
            } else {
                // Prefer the entry with actual cost basis (cost !== value means real cost data)
                const existingHasRealCost = Math.abs(existing.cost - existing.value) > 0.01;
                const newHasRealCost = Math.abs(h.cost - h.value) > 0.01;

                if (newHasRealCost && !existingHasRealCost) {
                    // New file has real cost basis — use its cost but keep latest quantity/value
                    holdingMap.set(key, {
                        ...h,
                        quantity: Math.max(h.quantity, existing.quantity),
                        value: Math.max(h.value, existing.value),
                    });
                } else if (h.quantity > existing.quantity || h.value > existing.value) {
                    // New file has more shares or higher value — likely more current
                    // But preserve cost basis if existing had it
                    holdingMap.set(key, {
                        ...h,
                        cost: existingHasRealCost ? existing.cost : h.cost,
                        price: existingHasRealCost ? existing.price : h.price,
                    });
                }
                // Otherwise keep existing (first occurrence with better data)
            }
        }
    }

    // Recalculate P&L for merged holdings
    const mergedHoldings = Array.from(holdingMap.values()).map(h => {
        const pnl = h.value - h.cost;
        const pnlPct = h.cost > 0 ? (pnl / h.cost) * 100 : 0;
        return { ...h, pnl, pnlPct };
    });

    // Merge account summaries — sum across all parsed files
    let mergedSummary: AccountSummary | null = null;
    for (const result of allResults) {
        if (result.accountSummary) {
            if (!mergedSummary) {
                mergedSummary = { ...result.accountSummary };
            } else {
                // Use the highest total value (most current statement)
                if (result.accountSummary.totalValue > mergedSummary.totalValue) {
                    mergedSummary = { ...result.accountSummary };
                }
            }
        }
    }

    // Use the most common brokerage type, or the first non-unknown
    const brokerageCounts = new Map<BrokerageType, number>();
    for (const r of allResults) {
        brokerageCounts.set(r.brokerage, (brokerageCounts.get(r.brokerage) ?? 0) + 1);
    }
    let primaryBrokerage: BrokerageType = 'unknown';
    let maxCount = 0;
    for (const [b, c] of brokerageCounts) {
        if (b !== 'unknown' && c > maxCount) {
            primaryBrokerage = b;
            maxCount = c;
        }
    }

    // Collect exchange rate and GBP flag from first HL result
    const hlResult = allResults.find(r => r.brokerage === 'hargreaves-lansdown');
    const exchangeRate = hlResult?.exchangeRate ?? null;
    const isGBPSource = hlResult?.isGBPSource ?? false;

    // Add merge summary info
    if (files.length > 1) {
        const totalParsed = allResults.reduce((s, r) => s + r.holdings.length, 0);
        const deduped = totalParsed - mergedHoldings.length;
        if (deduped > 0) {
            allErrors.unshift(`Merged ${totalParsed} holdings from ${files.length} files — ${deduped} duplicate${deduped > 1 ? 's' : ''} consolidated.`);
        } else {
            allErrors.unshift(`Merged ${totalParsed} holdings from ${files.length} files.`);
        }
    }

    // Re-check duplicates against existing portfolio
    const dupeErrors = allErrors.filter(e => e.includes('already exist'));
    const nonDupeErrors = allErrors.filter(e => !e.includes('already exist'));
    const dupeCount = mergedHoldings.filter(h => h.isDuplicate).length;
    // Remove old per-file dupe messages, add one consolidated one
    const finalErrors = nonDupeErrors;
    if (dupeCount > 0 && dupeErrors.length === 0) {
        finalErrors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    return {
        holdings: mergedHoldings,
        errors: finalErrors,
        accountSummary: mergedSummary,
        exchangeRate,
        isGBPSource,
        brokerage: primaryBrokerage,
    };
}

/**
 * Generic PDF text parser — attempts to extract holdings from any PDF text.
 * Used as a fallback when the brokerage isn't specifically supported.
 */
function parseGenericPDFText(text: string, existingTickers: Set<string>, detectedBrokerage: BrokerageType): ParseResult {
    const errors: string[] = [];
    const holdings: ParsedHolding[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Try to find holdings by looking for ticker patterns followed by numbers
    const seenTickers = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Look for lines with a ticker-like word followed by numbers
        if (!isLikelyTicker(line)) continue;
        const ticker = line.trim();
        if (seenTickers.has(ticker)) continue;

        // Search nearby lines (before/after) for numbers
        let name = '';
        let numbers: number[] = [];

        // Look backwards for name and numbers
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const prevLine = lines[j]!;
            const prevNums = extractNumbersFromWFLine(prevLine);
            if (prevNums.length >= 2 && numbers.length === 0) numbers = prevNums;

            const prevText = prevLine.replace(/-?[\d,]+\.?\d*/g, '').trim();
            if (prevText.length > 1 && /[A-Z]{2,}/.test(prevText)) {
                name = prevText + (name ? ' ' + name : '');
            }
        }

        // Look forward if we didn't find numbers
        if (numbers.length < 2) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                const nextNums = extractNumbersFromWFLine(lines[j]!);
                if (nextNums.length >= 2) { numbers = nextNums; break; }
            }
        }

        if (numbers.length >= 2) {
            seenTickers.add(ticker);
            const quantity = numbers[0]!;
            const price = numbers[1]!;
            const value = numbers.length >= 3 ? numbers[2]! : quantity * price;
            const isDuplicate = existingTickers.has(ticker);

            holdings.push({
                ticker, name: name || ticker, quantity, price, value,
                cost: value, pnl: 0, pnlPct: 0,
                selected: !isDuplicate, isDuplicate, isConverted: false,
            });
        }
    }

    if (holdings.length === 0) {
        errors.push('Could not extract holdings from this PDF. The format may not be supported yet. Try exporting as CSV from your brokerage.');
    }

    const dupeCount = holdings.filter(h => h.isDuplicate).length;
    if (dupeCount > 0) {
        errors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    const accountSummary: AccountSummary | null = holdings.length > 0
        ? { stockValue: holdings.reduce((s, h) => s + h.value, 0), totalCash: 0, totalValue: holdings.reduce((s, h) => s + h.value, 0) }
        : null;

    return {
        holdings, errors, accountSummary,
        exchangeRate: null, isGBPSource: false,
        brokerage: detectedBrokerage === 'unknown' ? 'generic-csv' : detectedBrokerage,
    };
}
