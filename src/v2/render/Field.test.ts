import { describe, expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { buildTurfGeometry } from './Field';
import { CAMERA_FAR_FT, RIGS } from './cameraCues';

describe('the ground continues beyond the framed neighborhood', () => {
  it('covers visible ground rays from every rig without adding triangles', () => {
    const geometry = buildTurfGeometry();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(geometry.index!.count / 3).toBe(128);
    const footprint = new Box3(
      new Vector3(bounds.min.x, -1, bounds.min.z),
      new Vector3(bounds.max.x, 1, bounds.max.z),
    );
    for (const rig of Object.values(RIGS)) {
      for (const aspect of [390 / 844, 844 / 390, 1280 / 720]) {
        const camera = new PerspectiveCamera(rig.fov, aspect, .1, CAMERA_FAR_FT);
        camera.position.set(...rig.eye);
        camera.lookAt(new Vector3(...rig.target));
        camera.updateMatrixWorld();
        for (const x of [-1, -.5, 0, .5, 1]) for (const y of [-1, -.5, 0, .5, 1]) {
          const ray = new Raycaster();
          ray.setFromCamera(new Vector2(x, y), camera);
          const t = -ray.ray.origin.y / ray.ray.direction.y;
          if (t <= 0 || t >= CAMERA_FAR_FT) continue;
          expect(footprint.containsPoint(ray.ray.at(t, new Vector3())),
            `ground visible outside turf at aspect ${aspect}, corner ${x},${y}`).toBe(true);
        }
      }
    }
    geometry.dispose();
  });
});
