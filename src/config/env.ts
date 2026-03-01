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

function validateEnv(): EnvConfig {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const appPasswordHash = import.meta.env.VITE_APP_PASSWORD_HASH;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn(
            '[Sentinel] Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
        );
    }

    return {
        supabaseUrl: supabaseUrl || '',
        supabaseAnonKey: supabaseAnonKey || '',
        appPasswordHash: appPasswordHash || '',
        isDevelopment: import.meta.env.DEV,
        isProduction: import.meta.env.PROD,
    };
}

export const env = validateEnv();
