// Compare pass output. Per view:
//   1. pixelmatch latest iter vs previous iter → shots/diff-<view>-NNN.png and
//      a changed-pixel % on stdout (the "did my pass break someone's work"
//      regression signal).
//   2. sharp composite: spike-latest | reference anchor | v2-baseline →
//      shots/board-<view>-NNN.png — the single image the critic reads.
// Anchors come from reference-manifest.json (versioned; reference/ is not).
//
//   node tools/compare.mjs --views pitching,batting

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = join(root, 'shots');
const manifest = JSON.parse(readFileSync(join(root, 'reference-manifest.json'), 'utf8'));

const PANEL_H = 540;
const LABEL_H = 28;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function iters(view) {
  return readdirSync(shots)
    .map((f) => f.match(new RegExp(`^${view}-iter(\\d+)\\.png$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

function pad(n) {
  return String(n).padStart(3, '0');
}

async function labeled(path, label) {
  const img = await sharp(path).resize({ height: PANEL_H }).png().toBuffer();
  const { width } = await sharp(img).metadata();
  const banner = Buffer.from(
    `<svg width="${width}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="20" font-family="monospace" font-size="16" fill="#fff">${label}</text></svg>`
  );
  return sharp({ create: { width, height: PANEL_H + LABEL_H, channels: 3, background: '#111' } })
    .composite([{ input: banner, top: 0, left: 0 }, { input: img, top: LABEL_H, left: 0 }])
    .png()
    .toBuffer();
}

async function board(view, iter) {
  const entry = manifest.views[view];
  if (!entry) return console.warn(`⚠ ${view}: no manifest entry, skipping board`);
  const panels = [[join(shots, `${view}-iter${pad(iter)}.png`), `spike ${view} iter${pad(iter)}`]];
  const anchor = join(root, 'reference', entry.anchor);
  const baseline = join(root, 'reference', entry.v2);
  if (existsSync(anchor)) panels.push([anchor, `reference ${entry.anchor}`]);
  else console.warn(`⚠ missing anchor ${entry.anchor} — run fetch:reference`);
  if (existsSync(baseline)) panels.push([baseline, `v2 baseline`]);
  else console.warn(`⚠ missing v2 baseline ${entry.v2}`);
  const bufs = await Promise.all(panels.map(([p, l]) => labeled(p, l)));
  const metas = await Promise.all(bufs.map((b) => sharp(b).metadata()));
  const width = metas.reduce((a, m) => a + m.width, 0);
  const height = PANEL_H + LABEL_H;
  let x = 0;
  const composites = bufs.map((input, i) => {
    const c = { input, top: 0, left: x };
    x += metas[i].width;
    return c;
  });
  const out = join(shots, `board-${view}-${pad(iter)}.png`);
  await sharp({ create: { width, height, channels: 3, background: '#111' } }).composite(composites).png().toFile(out);
  console.log(`✓ ${out}`);
}

function diff(view, prev, curr) {
  const a = PNG.sync.read(readFileSync(join(shots, `${view}-iter${pad(prev)}.png`)));
  const b = PNG.sync.read(readFileSync(join(shots, `${view}-iter${pad(curr)}.png`)));
  if (a.width !== b.width || a.height !== b.height) return console.warn(`⚠ ${view}: size mismatch, skipping diff`);
  const out = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1 });
  writeFileSync(join(shots, `diff-${view}-${pad(curr)}.png`), PNG.sync.write(out));
  const pct = ((100 * changed) / (a.width * a.height)).toFixed(2);
  console.log(`Δ ${view}: ${pct}% of pixels changed vs iter${pad(prev)}`);
}

for (const view of (arg('views', 'pitching')).split(',')) {
  const list = iters(view);
  if (!list.length) {
    console.warn(`⚠ ${view}: no captures yet`);
    continue;
  }
  const curr = list.at(-1);
  if (list.length > 1) diff(view, list.at(-2), curr);
  await board(view, curr);
}
