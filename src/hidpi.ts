// ---------------------------------------------------------------------------
// Sharp pixels on a dense screen, without changing the game's coordinate space.
//
// The game is authored in a fixed 960x640 space and Phaser's Scale.FIT
// stretches that canvas with CSS. On a 2x phone or tablet the browser is then
// upscaling a 960-wide picture to ~2000 device pixels, which is why v1 looked
// soft however good the art was. Phaser 3 dropped its `resolution` config, and
// the usual workaround (a bigger game plus a zoomed camera) would touch every
// scene and every hand-placed coordinate.
//
// So this works one layer down. The canvas BACKING STORE is made `ratio` times
// larger, and the three GL calls that address it in pixels — viewport, scissor
// and the drawing-buffer size the renderer reads back — are translated. Phaser
// goes on believing it draws 960x640; the rasteriser fills ratio² as many
// pixels. Vector-ish content (the SVG kid textures are rasterised well above
// their on-field size, Graphics, the field) gets genuinely sharper. Text is a
// canvas texture with its own resolution — `textResolution()` is what a Text
// style passes so glyphs are rasterised to match.
//
// Only the DEFAULT framebuffer is scaled. Anything drawn into a render target
// (a mask, an FX pass) keeps its own size, so the translation is keyed on what
// is currently bound.
//
// Off switch: `?hidpi=0`. Canvas-renderer fallback: untouched (ratio 1).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';

/** Never supersample past 2x: 3x triples fill cost for no visible gain at arm's length. */
const MAX_RATIO = 2;

let ratio = 1;

/** Pure: the backing-store multiplier for a device pixel ratio and URL query. */
export function chooseRatio(devicePixelRatio: number, search: string): number {
  if (/[?&]hidpi=0(?:&|$)/.test(search)) return 1;
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return 1;
  return Math.min(MAX_RATIO, Math.ceil(devicePixelRatio));
}

/** What a Text style's `resolution` should be so glyphs match the canvas. 1 until installed. */
export function textResolution(): number {
  return ratio;
}

/**
 * Enlarge the WebGL backing store. Call once, after the renderer exists
 * (the game's `ready` event). A no-op on the Canvas renderer and at ratio 1.
 */
export function installHiDpi(game: Phaser.Game, wanted: number): void {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer && renderer.gl;
  if (!gl || wanted <= 1) return;

  const logicalW = renderer.width;
  const logicalH = renderer.height;
  const maxSide = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  if (logicalW * wanted > maxSide || logicalH * wanted > maxSide) return;

  const R = wanted;
  let bound: WebGLFramebuffer | null = null;
  const onScreen = (): boolean => bound === null;

  // The last rect asked for, in the caller's own units. Phaser CACHES its
  // scissor and skips the GL call when the numbers have not changed — so after
  // a same-sized render target it never re-sends the screen's rect, and the
  // target's unscaled one would stay in force: a quarter of the picture on a
  // black canvas. Re-issue both whenever the destination changes kind.
  let lastViewport: [number, number, number, number] | undefined;
  let lastScissor: [number, number, number, number] | undefined;

  const viewport = gl.viewport.bind(gl);
  const scissor = gl.scissor.bind(gl);
  const applyViewport = (): void => {
    if (!lastViewport) return;
    const [x, y, w, h] = lastViewport;
    if (onScreen()) viewport(x * R, y * R, w * R, h * R);
    else viewport(x, y, w, h);
  };
  const applyScissor = (): void => {
    if (!lastScissor) return;
    const [x, y, w, h] = lastScissor;
    if (onScreen()) scissor(x * R, y * R, w * R, h * R);
    else scissor(x, y, w, h);
  };
  gl.viewport = (x: number, y: number, w: number, h: number): void => {
    lastViewport = [x, y, w, h];
    applyViewport();
  };
  gl.scissor = (x: number, y: number, w: number, h: number): void => {
    lastScissor = [x, y, w, h];
    applyScissor();
  };
  const bindFramebuffer = gl.bindFramebuffer.bind(gl);
  gl.bindFramebuffer = (target: number, fb: WebGLFramebuffer | null): void => {
    bindFramebuffer(target, fb);
    // READ_FRAMEBUFFER alone does not change where draws land.
    if (target !== gl.FRAMEBUFFER && target !== 0x8ca9 /* DRAW_FRAMEBUFFER */) return;
    const wasOnScreen = onScreen();
    bound = fb;
    if (wasOnScreen !== onScreen()) {
      applyViewport();
      applyScissor();
    }
  };

  // The renderer flips scissor rects with `gl.drawingBufferHeight`; it must
  // keep seeing the logical size or every flipped rect lands R times too low.
  Object.defineProperty(gl, 'drawingBufferWidth', { get: () => logicalW, configurable: true });
  Object.defineProperty(gl, 'drawingBufferHeight', { get: () => logicalH, configurable: true });

  const canvas = game.canvas;
  const enlarge = (): void => {
    if (canvas.width !== logicalW * R) canvas.width = logicalW * R;
    if (canvas.height !== logicalH * R) canvas.height = logicalH * R;
  };
  // A renderer resize writes the logical size back onto the canvas.
  const resize = renderer.resize.bind(renderer);
  renderer.resize = (w?: number, h?: number) => {
    const out = resize(w, h);
    enlarge();
    renderer.resetViewport();
    return out;
  };

  // Seed both rects from what GL holds NOW. The renderer set them at boot,
  // before this ran, and its scissor cache means it will never send the
  // full-screen rect again — so it has to be re-sent here, scaled.
  const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const sc = gl.getParameter(gl.SCISSOR_BOX) as Int32Array;
  lastViewport = [vp[0], vp[1], vp[2], vp[3]];
  lastScissor = [sc[0], sc[1], sc[2], sc[3]];

  enlarge();
  ratio = R;
  applyViewport();
  applyScissor();
  sharpenText(R);
}

/**
 * Every `scene.add.text` that did not ask for a resolution gets the canvas's.
 * A Text is its own little canvas texture; left at 1 it is the one thing on a
 * sharp screen that still looks stretched. Its logical width and height do not
 * depend on resolution, so measure-then-place layout is unaffected.
 */
function sharpenText(R: number): void {
  const proto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
    text: (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
  };
  const make = proto.text;
  proto.text = function (x, y, text, style) {
    const t = make.call(this, x, y, text, style);
    if (!style || style.resolution === undefined) t.setResolution(R);
    return t;
  };
}
