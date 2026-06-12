/**
 * Full-screen, dependency-free config-error screen. Rendered by main.tsx when
 * the build is missing its Supabase credentials, instead of white-screening.
 */
export function ConfigError() {
    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0b0c10', color: '#e2e8f0', padding: 24,
            fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
        }}>
            <div style={{ maxWidth: 460, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Sentinel isn’t configured</div>
                <p style={{ color: '#94a3b8', lineHeight: 1.65, fontSize: 14, margin: 0 }}>
                    The build is missing its Supabase credentials, so the app can’t start.
                    Set{' '}
                    <code style={{ color: '#22d3ee', fontFamily: 'monospace' }}>VITE_SUPABASE_URL</code>{' '}and{' '}
                    <code style={{ color: '#22d3ee', fontFamily: 'monospace' }}>VITE_SUPABASE_ANON_KEY</code>{' '}
                    in your hosting provider’s environment variables (Production scope), then redeploy.
                </p>
            </div>
        </div>
    );
}
