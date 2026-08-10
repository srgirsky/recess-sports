import { defineConfig } from 'vite';

// The spike is fully self-contained: its own dev server (5299 — root dev uses
// 5173, evidence capture 5199), its own dist/. It never joins the root build.
export default defineConfig({
  base: './',
  server: { port: 5299, strictPort: true },
});
