import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into public/ because Papers displays only static files from there, and
// the page is loaded from a custom scheme root -- so asset URLs must be
// relative rather than absolute.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'public',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  test: { environment: 'jsdom' },
});
