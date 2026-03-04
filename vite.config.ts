import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        open: true,
    },
    build: {
        target: 'esnext',
        // Phase 6 fix (Audit M9): Only enable sourcemaps in dev, not production
        sourcemap: process.env.NODE_ENV !== 'production',
    },
});
