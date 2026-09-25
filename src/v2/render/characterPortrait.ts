// ---------------------------------------------------------------------------
// UI portraits from the SAME character factory as the field. The old 2D cards
// depicted different faces, hair and clothing from the delivered 3D children.
// Render a small isolated scene once per identity/kit, using the game's GPU
// context and colour pipeline. No second loader, no permanent portrait scene,
// and no per-frame work. A custom player's visual parameters are part of the
// key, so saving a new look cannot reuse an old photograph.
// ---------------------------------------------------------------------------
import { Color, PerspectiveCamera, Scene, HalfFloatType, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CHARACTER_SCALE } from './ProxyCharacter';
import type { Character } from '../../data/types';
import { createCharacter, proxyForced } from './CharacterFactory';
import { AnimationDirector } from './AnimationDirector';
import { buildProceduralClips } from './proceduralClips';
import { Lighting } from './Lighting';
import { OutlineRegistry } from './materials/outline';

let renderer: WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<string>>();
const WIDTH = 288;
const HEIGHT = 384;

export function configureCharacterPortraits(gl: WebGLRenderer): void {
  if (renderer !== gl) cache.clear();
  renderer = gl;
}

export function characterPortrait(character: Character, uniform?: number): Promise<string> {
  const gl = renderer;
  if (!gl) return Promise.reject(new Error('Portrait renderer is not ready'));
  const key = JSON.stringify([character.id, character.visual, uniform, proxyForced()]);
  const prior = cache.get(key);
  if (prior) return prior;
  const result = queue.then(async () => {
    const outlines = new OutlineRegistry();
    outlines.setViewportHeight(HEIGHT);
    outlines.setWidth(1.5);
    const { view } = await createCharacter(character, { uniform, outlines });
    const director = new AnimationDirector(view.mesh, { characterId: character.id, fallback: buildProceduralClips() });
    const scene = new Scene();
    scene.add(new Lighting({ shadowMapSize: 0 }).root, view.root);
    view.setFacing(Math.PI);
    director.play('idle', { fadeMs: 0 });
    director.update(0);
    // Frame the whole child, including the chair, with a little room above the
    // crown and below the shoes. Perspective matches the front-facing stage.
    const height = view.heightFt * CHARACTER_SCALE;
    const camera = new PerspectiveCamera(32, WIDTH / HEIGHT, .1, 100);
    const distance = height * .6 / Math.tan(16 * Math.PI / 180);
    camera.position.set(0, height * .52, -distance);
    camera.lookAt(0, height * .5, 0);
    const linear = new WebGLRenderTarget(WIDTH, HEIGHT, { type: HalfFloatType, samples: 4 });
    const target = new WebGLRenderTarget(WIDTH, HEIGHT);
    const output = new OutputPass();
    const previousTarget = gl.getRenderTarget();
    const previousColor = gl.getClearColor(new Color());
    const previousAlpha = gl.getClearAlpha();
    const previousAutoClear = gl.autoClear;
    try {
      gl.setRenderTarget(linear);
      gl.setClearColor(0, 0);
      gl.autoClear = true;
      gl.render(scene, camera);
      // Offscreen rendering is linear in three.js. Its OutputPass reads the
      // live renderer’s tone mapping/exposure; never duplicate that policy.
      output.render(gl, target, linear, 0, false);
      const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
      gl.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Portrait canvas is unavailable');
      const data = context.createImageData(WIDTH, HEIGHT);
      for (let y = 0; y < HEIGHT; y++) {
        data.data.set(pixels.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4), (HEIGHT - 1 - y) * WIDTH * 4);
      }
      context.putImageData(data, 0, 0);
      return canvas.toDataURL('image/png');
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.setClearColor(previousColor, previousAlpha);
      gl.autoClear = previousAutoClear;
      target.dispose();
      linear.dispose();
      output.dispose();
      director.dispose();
      view.dispose();
      outlines.dispose();
    }
  });
  queue = result.catch(() => {});
  cache.set(key, result);
  // Custom-player edits must not grow an unbounded gallery in memory.
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  void result.catch(() => cache.delete(key));
  return result;
}
