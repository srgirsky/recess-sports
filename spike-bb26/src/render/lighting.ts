// OWNER: render agent. The one lighting rig: warm afternoon sun with soft
// shadows, cool sky fill, grass-bounce hemisphere, and distance fog that cites
// the sky's horizon color so far scenery melts into the dome instead of
// silhouetting against it. Field/characters owners: set castShadow /
// receiveShadow on your meshes and this rig does the rest — the sun's ortho
// shadow box already covers home, the diamond, the fences and the near yards
// (±260 ft around second base).

import * as THREE from 'three';
import { LIGHT } from './colors';

export function addLighting(scene: THREE.Scene): void {
  // Ambient: blue from the sky above, green bounce off the lawn below.
  scene.add(new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, 1.1));

  // Key: late-afternoon sun, high from the southwest (behind/left of the plate
  // camera) so kids at the plate are lit on their camera-facing side and
  // shadows fall gently toward first base / the outfield.
  const sun = new THREE.DirectionalLight(LIGHT.sun, 2.6);
  sun.position.set(-95, 140, -65);
  sun.target.position.set(0, 0, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const box = 260;
  sun.shadow.camera.left = -box;
  sun.shadow.camera.right = box;
  sun.shadow.camera.top = box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // Fill: cool and shadowless from the opposite quarter, lifts the shade side
  // so nothing goes muddy — BB2026 has no true darks anywhere.
  const fill = new THREE.DirectionalLight(LIGHT.fill, 0.5);
  fill.position.set(90, 60, 120);
  scene.add(fill);

  // Haze. Start beyond the fences (~200 ft) so the playfield stays saturated
  // and only the houses/trees pick up the melt.
  scene.fog = new THREE.Fog(LIGHT.fog, 380, 1350);
}
