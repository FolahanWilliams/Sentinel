import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isSupabaseConfigured } from './config/supabase';
import { ConfigError } from './components/shared/ConfigError';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (isSupabaseConfigured) {
    root.render(
        <StrictMode>
            <App />
        </StrictMode>
    );
} else {
    // Fail closed with a clear, actionable screen instead of a blank page.
    root.render(<ConfigError />);
}
