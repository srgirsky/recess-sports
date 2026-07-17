import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built site works from any static host path
  // (Cloudflare Pages, Netlify, GitHub Pages sub-paths, etc.)
  base: './',
  build: {
    // Phaser is a big bundle (~1MB) — this is expected, silence the warning.
    chunkSizeWarningLimit: 2000,
  },
});
