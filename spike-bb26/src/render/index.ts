// OWNER: render agent. Renderer, camera language, lighting rig, procedural sky.
// Registers ctx 'render' with the contract shape { renderer, scene, camera,
// render() } plus render-owned extras:
//   cutTo(preset)  — hard camera cut; also driven by 'camera:cut' {preset}
//   activePreset() — current preset name
//   presets        — the preset table (see cameras.ts for the anchor derivation)
// Events honored: 'camera:cut' {preset}, 'ui:navigate' {view} (cuts to that
// view's home preset when one exists), 'tick' {tMs} (camera breathing sway).
// Look: ACES tone mapping at slight over-exposure for the punchy saturated
// BB2026 daylight; PCFSoft shadow map; pixelRatio pinned to 1 (capture
// contract). The sky dome ignores fog/tone mapping — see sky.ts.

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { SpikeParams } from '../main';
import type { Rng } from '../core/rng';
import { CameraRig, PRESETS } from './cameras';
import { addLighting } from './lighting';
import { makeSkyDome } from './sky';
import { makePlaceholderStage } from './stage';
import { SKY } from './colors';

export type RenderApi = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render(): void;
  cutTo(preset: string): void;
  activePreset(): string;
  presets: typeof PRESETS;
};

export function init(ctx: Ctx): void {
  const { view } = ctx.get<SpikeParams>('params');
  const rng = ctx.get<Rng>('rng');

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); // deterministic capture: CSS px = device px
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.horizon); // fallback behind the dome
  scene.add(makeSkyDome(rng));
  addLighting(scene);

  const rig = new CameraRig(view, window.innerWidth / window.innerHeight);
  const camera = rig.camera;

  ctx.on('tick', (payload) => {
    const { tMs } = payload as { tMs: number };
    rig.update(tMs);
  });
  ctx.on('camera:cut', (payload) => {
    const { preset } = (payload ?? {}) as { preset?: string };
    if (preset) rig.cutTo(preset);
  });
  ctx.on('ui:navigate', (payload) => {
    const { view: v } = (payload ?? {}) as { view?: string };
    if (v && PRESETS[v]) rig.cutTo(v);
  });

  // Placeholder stage: only fills in for subsystems that are still stubs
  // (empty ctx APIs) at scene:ready — see stage.ts. Retires itself the moment
  // the field/characters passes register real APIs.
  ctx.on('scene:ready', () => {
    const empty = (id: string): boolean => {
      if (!ctx.has(id)) return true;
      const api = ctx.get<object>(id);
      return !api || Object.keys(api).length === 0;
    };
    const stage = makePlaceholderStage({ field: empty('field'), characters: empty('characters') });
    if (stage) scene.add(stage);
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const api: RenderApi = {
    renderer,
    scene,
    camera,
    render: () => renderer.render(scene, camera),
    cutTo: (preset) => rig.cutTo(preset),
    activePreset: () => rig.activePreset,
    presets: PRESETS,
  };
  ctx.set('render', api);
}
