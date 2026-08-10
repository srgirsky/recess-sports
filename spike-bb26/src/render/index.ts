// OWNER: render agent. Renderer, cameras, lighting rig, post. This scaffold
// stub gives every other subsystem a working scene + camera preset per view so
// capture works before the render pass lands. Registers ctx 'render'.

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { SpikeParams } from '../main';

export type RenderApi = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render(): void;
};

// Placeholder presets — the render agent owns the real camera language.
// Units are feet, matching v2, so harvested numbers port without conversion.
const PRESETS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  pitching: { pos: [2.5, 5.5, -14], look: [0, 4, 46], fov: 50 }, // behind-batter rear 3/4 toward the mound
  batting: { pos: [-24, 18, 40], look: [0, 3, 0], fov: 45 }, // high oblique for the contact cut
  menu: { pos: [0, 5, -10], look: [0, 5, 0], fov: 55 },
  draft: { pos: [0, 4, -12], look: [0, 3.5, 0], fov: 50 },
};

export function init(ctx: Ctx): void {
  const { view } = ctx.get<SpikeParams>('params');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); // deterministic capture: CSS px = device px
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7ec8f0');

  const preset = PRESETS[view] ?? PRESETS.pitching;
  const camera = new THREE.PerspectiveCamera(preset.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(...preset.pos);
  camera.lookAt(...preset.look);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7a56, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(-60, 90, -40);
  scene.add(sun);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const api: RenderApi = { renderer, scene, camera, render: () => renderer.render(scene, camera) };
  ctx.set('render', api);
}
