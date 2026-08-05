// ---------------------------------------------------------------------------
// Home-run fireworks. Render-side chrome — stepped, never tweened, sim-blind.
//
// BB2026's night mode answers a homer with fireworks, and it is the right
// kind of reward for this audience: no reading, no numbers, just the sky
// agreeing with you. One pooled `Points` holds every ember; a burst is a
// shell position plus a spherical velocity fan under gravity, faded by
// remaining life. Bursts are requested by the VIEW (GameView reacts to the
// homer event) and stepped from its tick — the sim never knows the sky lit
// up, and a day game never builds this at all.
//
// Cost: ONE draw call, ~600 vertices, additive-blended so overlapping embers
// brighten instead of sort.
// ---------------------------------------------------------------------------

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from 'three';

const MAX_EMBERS = 600;
const EMBERS_PER_BURST = 120;
const GRAVITY_FTS2 = -14; // gentler than real: embers hang like the reference's
const LIFE_SEC = 2.1;

interface Ember {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  r: number;
  g: number;
  b: number;
}

export class Fireworks {
  readonly points: Points;
  private readonly embers: Ember[] = [];
  private readonly geom: BufferGeometry;
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_EMBERS; i++) {
      this.embers.push({ alive: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, r: 1, g: 1, b: 1 });
    }
    this.geom = new BufferGeometry();
    this.geom.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_EMBERS * 3), 3));
    this.geom.setAttribute('color', new Float32BufferAttribute(new Float32Array(MAX_EMBERS * 3), 3));
    // The pool spans the park; culling a single burst by a stale bound would
    // blink the whole sky, so the object is never culled.
    this.geom.boundingSphere = null;
    const mat = new PointsMaterial({
      size: 2.6,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new Points(this.geom, mat);
    this.points.name = 'fireworks';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Pop one shell at (x, z), `heightFt` up, in the team's colour. */
  spawn(x: number, z: number, heightFt: number, colorHex: number): void {
    const c = new Color(colorHex).convertSRGBToLinear();
    const white = new Color(0xfff6d8).convertSRGBToLinear();
    for (let i = 0; i < EMBERS_PER_BURST; i++) {
      const e = this.embers[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_EMBERS;
      // Spherical fan, hash-free: golden-angle spiral gives an even shell
      // without randomness, and two shells never look identical because the
      // pool cursor phases them.
      const t = i / EMBERS_PER_BURST;
      const inc = Math.acos(1 - 2 * t);
      const az = i * 2.399963;
      const speed = 20 + 8 * Math.sin(i * 1.7);
      e.alive = true;
      e.x = x;
      e.y = heightFt;
      e.z = z;
      e.vx = Math.sin(inc) * Math.cos(az) * speed;
      e.vy = Math.cos(inc) * speed * 0.8 + 6;
      e.vz = Math.sin(inc) * Math.sin(az) * speed;
      e.life = LIFE_SEC;
      // Every fifth ember sparkles white so the burst reads at 300ft.
      const col = i % 5 === 0 ? white : c;
      e.r = col.r;
      e.g = col.g;
      e.b = col.b;
    }
    this.points.visible = true;
  }

  /** Step embers; hides itself when the sky is empty. Call from the view tick. */
  update(dt: number): void {
    if (!this.points.visible) return;
    const pos = this.geom.getAttribute('position') as Float32BufferAttribute;
    const col = this.geom.getAttribute('color') as Float32BufferAttribute;
    let any = false;
    for (let i = 0; i < MAX_EMBERS; i++) {
      const e = this.embers[i];
      if (!e.alive) {
        pos.setXYZ(i, 0, -1000, 0);
        continue;
      }
      any = true;
      e.life -= dt;
      if (e.life <= 0) {
        e.alive = false;
        pos.setXYZ(i, 0, -1000, 0);
        continue;
      }
      e.vy += GRAVITY_FTS2 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      const fade = Math.min(1, e.life / (LIFE_SEC * 0.6));
      pos.setXYZ(i, e.x, e.y, e.z);
      col.setXYZ(i, e.r * fade, e.g * fade, e.b * fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.points.visible = any;
  }

  dispose(): void {
    this.geom.dispose();
    (this.points.material as PointsMaterial).dispose();
  }
}
