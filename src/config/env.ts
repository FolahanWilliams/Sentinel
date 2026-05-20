/**
 * Sentinel — Environment Configuration
 *
 * Centralizes access to all environment variables with runtime validation.
 * Only VITE_ prefixed vars reach the browser — API keys live server-side
 * in Supabase Edge Function secrets (see Patch 1 security model).
 */

interface EnvConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    appPasswordHash: string;
    isDevelopment: boolean;
    isProduction: boolean;
}

// Read an env var with a fallback to process.env so that Node-based runners
// (tsx scripts, deno tests, etc.) can resolve the same values Vite inlines
// at build time. In a Vite build, `import.meta.env.VITE_*` is statically
// replaced and this fallback is dead code.
function readEnv(key: string): string | undefined {
    try {
        const fromVite = (import.meta as any)?.env?.[key];
        if (fromVite) return fromVite;
    } catch { /* import.meta.env not available — fall through */ }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return undefined;
}

function readBoolEnv(key: string, fallback: boolean): boolean {
    try {
        const val = (import.meta as any)?.env?.[key];
        if (typeof val === 'boolean') return val;
    } catch { /* fall through */ }
    return fallback;
}

function validateEnv(): EnvConfig {
    const supabaseUrl = readEnv('VITE_SUPABASE_URL');
    const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');
    const appPasswordHash = readEnv('VITE_APP_PASSWORD_HASH');
    const isProduction = readBoolEnv('PROD', process.env?.NODE_ENV === 'production');
    const isDevelopment = readBoolEnv('DEV', !isProduction);

    // Phase 3 fix (Audit M8): Fail-closed in production when critical env vars are missing
    if (!supabaseUrl || !supabaseAnonKey) {
        if (isProduction) {
            throw new Error('[Sentinel] Missing required env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
        }
        console.warn(
            '[Sentinel] Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
        );
    }

    return {
        supabaseUrl: supabaseUrl || '',
        supabaseAnonKey: supabaseAnonKey || '',
        appPasswordHash: appPasswordHash || '',
        isDevelopment,
        isProduction,
    };
}

export const env = validateEnv();
