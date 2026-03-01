/**
 * Sentinel — Password Gate Component
 *
 * Full-screen dark-themed login screen that protects the entire app.
 * Hashes entered password client-side and compares to VITE_APP_PASSWORD_HASH.
 */

import { useState, type FormEvent } from 'react';
import { Shield } from 'lucide-react';
import { validatePassword, createSession } from '@/utils/auth';
import { env } from '@/config/env';

interface PasswordGateProps {
    onAuthenticated: () => void;
}

export function PasswordGate({ onAuthenticated }: PasswordGateProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!password.trim()) return;

        setLoading(true);
        setError(false);

        try {
            const isValid = await validatePassword(password, env.appPasswordHash);
            if (isValid) {
                createSession();
                onAuthenticated();
            } else {
                setError(true);
                setPassword('');
                // Reset shake animation
                setTimeout(() => setError(false), 500);
            }
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <div className="w-full max-w-sm mx-4 animate-fade-in">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                        style={{
                            backgroundColor: 'var(--color-bg-elevated)',
                            border: '1px solid var(--color-border-default)',
                            boxShadow: 'var(--shadow-glow-blue)',
                        }}>
                        <Shield size={32} style={{ color: 'var(--color-info)' }} />
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        Sentinel
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                        Trading Intelligence Terminal
                    </p>
                </div>

                {/* Password Form */}
                <form onSubmit={handleSubmit}>
                    <div className={`card ${error ? 'animate-shake' : ''}`}
                        style={{
                            borderColor: error ? 'var(--color-bearish)' : undefined,
                        }}>
                        <label className="block text-xs font-medium mb-2 uppercase tracking-wider"
                            style={{ color: 'var(--color-text-secondary)' }}
                            htmlFor="password-input">
                            Password
                        </label>
                        <input
                            id="password-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter access code"
                            autoFocus
                            disabled={loading}
                            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                border: `1px solid ${error ? 'var(--color-bearish)' : 'var(--color-border-default)'}`,
                                color: 'var(--color-text-primary)',
                                fontFamily: 'var(--font-mono)',
                            }}
                        />
                        {error && (
                            <p className="text-xs mt-2" style={{ color: 'var(--color-bearish)' }}>
                                Incorrect password
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={loading || !password.trim()}
                            className="w-full mt-4 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer"
                            style={{
                                backgroundColor: loading ? 'var(--color-bg-hover)' : 'var(--color-info)',
                                color: loading ? 'var(--color-text-secondary)' : 'var(--color-text-inverse)',
                                opacity: !password.trim() ? 0.5 : 1,
                            }}
                        >
                            {loading ? 'Verifying...' : 'Enter Sentinel'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
