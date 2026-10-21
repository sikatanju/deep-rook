import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import { serviceWorker } from './src/sw/precache.ts';

export default defineConfig({
  output: 'static',
  integrations: [react(), serviceWorker()],
  vite: { plugins: [tailwindcss()] },
});
