/**
 * Sentinel — Authentication Utilities
 *
 * Client-side password gate — hashes password with SHA-256
 * and stores session in localStorage with 7-day expiry.
 */

const SESSION_KEY = 'sentinel_session';
const SESSION_EXPIRY_DAYS = 7;

interface Session {
    authenticated: boolean;
    expiresAt: number;
}

/**
 * Hash a password string using SHA-256 (Web Crypto API).
 */
export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate the entered password against the stored hash.
 */
export async function validatePassword(
    password: string,
    expectedHash: string
): Promise<boolean> {
    if (!expectedHash) return true; // No password configured = open access
    const hash = await hashPassword(password);
    return hash === expectedHash.toLowerCase();
}

/**
 * Create a new authenticated session in localStorage.
 */
export function createSession(): void {
    const session: Session = {
        authenticated: true,
        expiresAt: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Check if the current session is valid (exists and not expired).
 */
export function validateSession(): boolean {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const session: Session = JSON.parse(raw);
        if (!session.authenticated) return false;
        if (Date.now() > session.expiresAt) {
            destroySession();
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Destroy the current session (log out).
 */
export function destroySession(): void {
    localStorage.removeItem(SESSION_KEY);
}
