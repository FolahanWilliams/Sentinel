import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests run in a plain node env (pure functions — money math, calibration
// math). The `@` alias mirrors vite.config.ts so test imports resolve the same.
export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, './src') },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
