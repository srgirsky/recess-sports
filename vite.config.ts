import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // A worktree under .claude/worktrees is another session's checkout of this
    // repo. Its tests are that checkout's to run: collecting them here doubles
    // the heaviest sim suites, and the contention makes the deadline-bound
    // play/game tests flake — 8 failures that vanish when the file runs alone.
    // (brief.lint.test.js skips nested checkouts for the same reason.)
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
  },
  // Relative paths so the built site works from any static host path
  // (Cloudflare Pages, Netlify, GitHub Pages sub-paths, etc.)
  //
  // GOTCHA: with a relative base, asset URLs inside `v2/index.html` resolve
  // against `/v2/`, not the site root. Anything under `public/` that the v2
  // page references must be written as `../<path>` (the Fredoka @font-face is
  // the live example) or placed under `public/v2/` and referenced as `./`.
  base: './',
  build: {
    rollupOptions: {
      input: {
        // ★ THE CUTOVER. v2 is the front door; v1 is preserved at /classic/.
        //
        // Nothing was deleted: v1 still builds, still ships, and still holds
        // Recess Week, the sticker album, pass-and-play and the WebRTC online
        // mode, none of which v2 has yet. Moving it is not retiring it.
        main: resolve(__dirname, 'index.html'),
        // The permanent alias. Every measurement script, `npm run
        // audit:v2-layout` and `.claude/skills/verify` drive /v2/ by URL, and
        // an alias costs one HTML file against breaking all of them.
        v2: resolve(__dirname, 'v2/index.html'),
        // v1 — the shipped Phaser game, unchanged, one directory down.
        classic: resolve(__dirname, 'classic/index.html'),
      },
    },
    // Phaser is a big bundle (~1MB) — this is expected, silence the warning.
    chunkSizeWarningLimit: 2000,
  },
});
