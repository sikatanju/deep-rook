import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, '.claude/**', '.piece-probe/**'],
    // UI tests run 1-1.5s idle; a busy CPU stretches them past the 5s default.
    testTimeout: 20_000,
  },
});
