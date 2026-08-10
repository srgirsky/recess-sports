// OWNER: field agent. The privacy fence: an arc of straight plank panels
// between posts. Radius and height wobble a little per post so the run reads
// hand-built, cap rails keep it from being a bare wall, and pennant bunting
// sags across every panel the plate cameras can see. The arc runs well past
// the foul lines (±70°) so the frame edges stay enclosed at ground level.

import * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { MaterialsApi } from '../materials/index';

export const FENCE_R = 193;
const PANELS = 30;
const ARC = (140 * Math.PI) / 180; // ±70° off the plate→mound axis

/** A sagging bunting ribbon: plane with its middle pulled down. */
function buntingSwag(m: MaterialsApi, w: number): THREE.Mesh {
  const h = 1.55;
  const geo = new THREE.PlaneGeometry(w, h, 18, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getX(i) / w) * 2; // -1..1
    pos.setY(i, pos.getY(i) - 1.15 * (1 - t * t));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, m.bunting({ worldSize: [w, h] }));
}

export function buildFence(m: MaterialsApi, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.name = 'field-fence';

  // Post ring with per-post wobble.
  const posts: { x: number; z: number; h: number }[] = [];
  for (let i = 0; i <= PANELS; i++) {
    const a = -ARC / 2 + (i / PANELS) * ARC;
    const r = FENCE_R + rng.range(-3.5, 3.5);
    posts.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, h: 6.5 + rng.range(-0.25, 0.35) });
  }

  const weathers = [0, 0.25, 0.5];
  for (let i = 0; i < PANELS; i++) {
    const p0 = posts[i];
    const p1 = posts[i + 1];
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const h = (p0.h + p1.h) / 2;
    const mx = (p0.x + p1.x) / 2;
    const mz = (p0.z + p1.z) / 2;
    const rotY = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    const midA = Math.atan2(mx, mz); // angle off +z, for camera-facing checks

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(len, h, 0.28),
      m.wood(undefined, { weather: rng.pick(weathers), worldSize: [len, h] }),
    );
    panel.position.set(mx, h / 2, mz);
    panel.rotation.y = rotY;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.22, 0.55),
      m.wood('woodTrim', { weather: 0.25, worldSize: [len, 0.55] }),
    );
    cap.position.set(mx, h + 0.08, mz);
    cap.rotation.y = rotY;
    cap.castShadow = true;
    group.add(cap);

    // Bunting on the panels the plate cameras actually see.
    if (Math.abs(midA) < (58 * Math.PI) / 180) {
      const swag = buntingSwag(m, len * 0.86);
      const inward = 0.42;
      swag.position.set(mx - Math.sin(midA) * inward, h - 0.95, mz - Math.cos(midA) * inward);
      swag.rotation.y = rotY;
      group.add(swag);
    }
  }

  for (const p of posts) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, p.h + 0.7, 0.6),
      m.wood(undefined, { weather: 0.5, worldSize: [0.6, 7] }),
    );
    post.position.set(p.x, (p.h + 0.7) / 2, p.z);
    post.castShadow = true;
    group.add(post);
  }

  return group;
}
