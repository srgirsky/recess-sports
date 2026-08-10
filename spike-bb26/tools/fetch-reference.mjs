// Rebuild the reference corpus locally (reference/ is gitignored — copyrighted
// footage stays out of git; this script IS the versioned record of how to
// re-derive it). Produces:
//   reference/frames/frame-NNN.jpg  — 249 frames of YouTube A3DyDMkx17c at
//     1 frame / 10 s, matching the audited cadence in
//     docs/research/backyard-2026-reference.md 1:1 (frame N ≈ t=(N-1)*10s;
//     team creation ≈ 4–16, draft ≈ 17–68, gameplay ≈ 69–249)
//   reference/steam/steam-NN.jpg    — Steam store screenshots, app 3935020
// Requires yt-dlp and ffmpeg on PATH.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ref = join(root, 'reference');
const framesDir = join(ref, 'frames');
const steamDir = join(ref, 'steam');
const cacheDir = join(ref, '.cache');
const VIDEO = 'https://www.youtube.com/watch?v=A3DyDMkx17c';
const APPID = '3935020';

for (const d of [framesDir, steamDir, cacheDir, join(ref, 'v2-baseline')]) mkdirSync(d, { recursive: true });

// --- video frames ---------------------------------------------------------
const frameCount = () => readdirSync(framesDir).filter((f) => f.startsWith('frame-')).length;
if (frameCount() >= 240) {
  console.log(`✓ frames already present (${frameCount()})`);
} else {
  const mp4 = join(cacheDir, 'bb26.mp4');
  if (!existsSync(mp4)) {
    console.log('… downloading video (yt-dlp)');
    const dl = spawnSync('yt-dlp', ['-f', 'bv*[height<=1080]', '--no-playlist', '-o', mp4, VIDEO], { stdio: 'inherit' });
    if (dl.status !== 0) {
      console.error('✗ yt-dlp failed — fallback: yt-dlp -f sb0 (storyboard track) and slice the mosaics by hand');
      process.exit(1);
    }
  }
  console.log('… extracting frames (ffmpeg, 1 frame / 10 s)');
  execFileSync('ffmpeg', ['-y', '-i', mp4, '-vf', 'fps=1/10', '-q:v', '2', join(framesDir, 'frame-%03d.jpg')], {
    stdio: 'inherit',
  });
  console.log(`✓ ${frameCount()} frames`);
}

// --- steam screenshots ----------------------------------------------------
if (readdirSync(steamDir).length >= 4) {
  console.log('✓ steam screenshots already present');
} else {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${APPID}`);
  const data = (await res.json())[APPID]?.data;
  if (!data?.screenshots?.length) {
    console.error('✗ steam api returned no screenshots');
    process.exit(1);
  }
  let n = 0;
  for (const shot of data.screenshots) {
    n += 1;
    const out = join(steamDir, `steam-${String(n).padStart(2, '0')}.jpg`);
    const img = await fetch(shot.path_full);
    writeFileSync(out, Buffer.from(await img.arrayBuffer()));
    console.log(`✓ ${out}`);
  }
}

console.log('reference corpus ready — anchors are named in reference-manifest.json');
