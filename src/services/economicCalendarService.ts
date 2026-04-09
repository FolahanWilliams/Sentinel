export interface EconomicEvent {
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM ET
    name: string;           // "FOMC Rate Decision"
    country: 'US' | 'UK';
    impact: 'high' | 'medium' | 'low';
    category: string;       // "central_bank", "employment", "inflation", "gdp"
}

// 2026 Estimated Calendar for core events
export const ECONOMIC_CALENDAR_2026: EconomicEvent[] = [
    // US FOMC
    { date: '2026-01-28', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-03-18', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-05-06', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-06-17', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-07-29', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-09-16', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-11-04', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    { date: '2026-12-16', time: '14:00', name: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
    
    // US NFP (First Friday of the Month approximation for few months)
    { date: '2026-01-09', time: '08:30', name: 'Non Farm Payrolls', country: 'US', impact: 'high', category: 'employment' },
    { date: '2026-02-06', time: '08:30', name: 'Non Farm Payrolls', country: 'US', impact: 'high', category: 'employment' },
    { date: '2026-03-06', time: '08:30', name: 'Non Farm Payrolls', country: 'US', impact: 'high', category: 'employment' },
    { date: '2026-04-03', time: '08:30', name: 'Non Farm Payrolls', country: 'US', impact: 'high', category: 'employment' },
    { date: '2026-05-01', time: '08:30', name: 'Non Farm Payrolls', country: 'US', impact: 'high', category: 'employment' },

    // US CPI (Approx mid-month)
    { date: '2026-01-14', time: '08:30', name: 'Core CPI', country: 'US', impact: 'high', category: 'inflation' },
    { date: '2026-02-11', time: '08:30', name: 'Core CPI', country: 'US', impact: 'high', category: 'inflation' },
    { date: '2026-03-11', time: '08:30', name: 'Core CPI', country: 'US', impact: 'high', category: 'inflation' },
    { date: '2026-04-15', time: '08:30', name: 'Core CPI', country: 'US', impact: 'high', category: 'inflation' },

    // UK BOE Rate Decision
    { date: '2026-02-05', time: '07:00', name: 'BOE Interest Rate Decision', country: 'UK', impact: 'high', category: 'central_bank' },
    { date: '2026-03-26', time: '07:00', name: 'BOE Interest Rate Decision', country: 'UK', impact: 'high', category: 'central_bank' },
    { date: '2026-05-07', time: '07:00', name: 'BOE Interest Rate Decision', country: 'UK', impact: 'high', category: 'central_bank' },
    { date: '2026-06-18', time: '07:00', name: 'BOE Interest Rate Decision', country: 'UK', impact: 'high', category: 'central_bank' },
];

export class EconomicCalendarService {
    static getUpcomingEvents(days: number = 14): EconomicEvent[] {
        const _now = new Date(); // Ignore time for rough matching
        const now = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        
        return ECONOMIC_CALENDAR_2026.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= now && eventDate <= endDate;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    static getEventsForDate(date: string): EconomicEvent[] {
        return ECONOMIC_CALENDAR_2026.filter(event => event.date === date);
    }

    static isHighImpactDay(date: string): boolean {
        const events = this.getEventsForDate(date);
        return events.some(e => e.impact === 'high');
    }

    static getNextFOMC(): EconomicEvent | null {
        const _now = new Date();
        const nowStr = _now.toISOString().substring(0, 10);
        
        const fomcs = ECONOMIC_CALENDAR_2026.filter(e => e.name === 'FOMC Rate Decision' && e.date >= nowStr);
        return fomcs.length > 0 ? fomcs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null : null;
    }

    static getNextBOE(): EconomicEvent | null {
         const _now = new Date();
        const nowStr = _now.toISOString().substring(0, 10);
        
        const boe = ECONOMIC_CALENDAR_2026.filter(e => e.name === 'BOE Interest Rate Decision' && e.date >= nowStr);
        return boe.length > 0 ? boe.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null : null;
    }
}
