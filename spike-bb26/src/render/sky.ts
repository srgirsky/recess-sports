// OWNER: render agent. Procedural sky: a canvas-painted equirect gradient with
// chunky flat-bottomed cartoon cumulus, mapped onto a back-side dome. Cloud
// placement draws from the seeded rng (render inits first, so its draws are
// deterministic and stable per seed). The dome ignores fog and tone mapping so
// the authored BB2026 blue stays punchy; fog color cites SKY.horizon so the
// scenery owners' far props melt into this exact horizon.

import * as THREE from 'three';
import type { Rng } from '../core/rng';
import { SKY } from './colors';

const W = 2048;
const H = 1024; // canvas top = zenith, y = H/2 = horizon (sphere equator)

function paintCloud(
  g: CanvasRenderingContext2D,
  rng: Rng,
  cx: number,
  cy: number,
  w: number,
): void {
  const h = w * rng.range(0.28, 0.4);
  const puffs: Array<{ x: number; y: number; r: number }> = [];
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const x = cx + (t - 0.5) * w;
    // Tallest puffs in the middle, flat shared baseline at cy.
    const r = h * (0.55 + 0.45 * Math.sin(Math.PI * t)) * rng.range(0.75, 1.1);
    puffs.push({ x, y: cy - r * 0.55, r });
  }
  // Shade pass (small down offset) then lit pass, both clipped to the shared
  // flat bottom. Circles only — no connecting rect; the puffs overlap enough
  // to read as one cloud, and a rect makes them read as slabs.
  for (const [color, dy] of [
    [SKY.cloudShade, 6],
    [SKY.cloudLit, 0],
  ] as const) {
    g.save();
    g.beginPath();
    g.rect(cx - w, cy - h * 3, w * 2, h * 3 + dy); // flat bottom clip
    g.clip();
    g.fillStyle = color;
    g.beginPath();
    for (const p of puffs) {
      g.moveTo(p.x + p.r, p.y + dy);
      g.arc(p.x, p.y + dy, p.r, 0, Math.PI * 2);
    }
    g.fill();
    g.restore();
  }
}

export function makeSkyTexture(rng: Rng): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;

  // Vertical gradient, zenith → horizon, mirrored below so the underside (never
  // seen once ground lands) is not a hard seam.
  const grad = g.createLinearGradient(0, 0, 0, H * 0.52);
  grad.addColorStop(0, SKY.zenith);
  grad.addColorStop(0.55, SKY.mid);
  grad.addColorStop(1, SKY.horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H * 0.52);
  g.fillStyle = SKY.horizon;
  g.fillRect(0, H * 0.5, W, H * 0.5);

  // Pale haze band hugging the horizon.
  const haze = g.createLinearGradient(0, H * 0.38, 0, H * 0.5);
  haze.addColorStop(0, `${SKY.hazeBand}00`);
  haze.addColorStop(1, `${SKY.hazeBand}cc`);
  g.fillStyle = haze;
  g.fillRect(0, H * 0.38, W, H * 0.12);

  // Big hero cumulus in the upper-mid sky. Keep clear of the u seam (x=0/W).
  const heroes = rng.int(5, 7);
  for (let i = 0; i < heroes; i += 1) {
    const cx = W * rng.range(0.06, 0.94);
    const cy = H * rng.range(0.14, 0.34);
    paintCloud(g, rng, cx, cy, W * rng.range(0.07, 0.13));
  }
  // Smaller, flatter drifters near the horizon.
  const drifters = rng.int(6, 9);
  for (let i = 0; i < drifters; i += 1) {
    const cx = W * rng.range(0.05, 0.95);
    const cy = H * rng.range(0.37, 0.46);
    paintCloud(g, rng, cx, cy, W * rng.range(0.035, 0.06));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSkyDome(rng: Rng): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1450, 48, 24);
  const mat = new THREE.MeshBasicMaterial({
    map: makeSkyTexture(rng),
    side: THREE.BackSide,
    fog: false, // the sky IS the fog's destination color; never fog the sky
    toneMapped: false, // authored colors, not ACES-graded — keeps the blue punchy
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = '__sky';
  dome.renderOrder = -100;
  return dome;
}
