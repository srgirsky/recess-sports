// ---------------------------------------------------------------------------
// The WebGL renderer wrapper. Render-side only.
//
// Owns the canvas, the colour pipeline, resize, and the dynamic-resolution
// loop. Deliberately does NOT own the scene or the camera — Stage owns the
// graph, CameraDirector owns the camera — so the look spike, the game, and
// any future headless screenshot harness can share this file unchanged.
// ---------------------------------------------------------------------------

import { ACESFilmicToneMapping, Color, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Camera, Scene } from 'three';
import { DynamicResolution, detectTier, type TierSettings } from './perfTier';
import type { OutlineRegistry } from './materials/outline';

export interface RendererStats {
  fps: number;
  frameMs: number;
  /** 95th-percentile frame time over the last ~2s. The number that matters —
   *  a good average with bad p95 is a game that hitches. */
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  textureMB: number;
  scale: number;
  tier: string;
}

export class Renderer {
  readonly gl: WebGLRenderer;
  readonly tier: TierSettings;

  private readonly dyn = new DynamicResolution();
  private outlines: OutlineRegistry | null = null;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private cssW = 1;
  private cssH = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // The toon look is flat colour; a depth/stencil buffer we never read is
      // pure bandwidth on a tile-based mobile GPU.
      stencil: false,
    });

    this.tier = detectTier(this.gl.getContext());

    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    // The draft renders one clipped character view after the world. Keep the
    // counters cumulative across both passes so the perf readout still reports
    // the frame's real cost rather than only whichever pass rendered last.
    this.gl.info.autoReset = false;

    if (this.tier.shadowMapSize > 0) {
      this.gl.shadowMap.enabled = true;
      this.gl.shadowMap.type = PCFSoftShadowMap;
      // Shadows are static in structure (the same 19 casters every frame);
      // three still needs autoUpdate because the fitted shadow camera moves.
      this.gl.shadowMap.autoUpdate = true;
    } else {
      this.gl.shadowMap.enabled = false;
    }

    this.resize();
  }

  /** Outline width is resolution-dependent, so the registry must be told about
   *  every resize AND every dynamic-resolution change. Wiring it here is what
   *  makes that impossible to forget. */
  bindOutlines(reg: OutlineRegistry): void {
    this.outlines = reg;
    reg.setWidth(this.tier.outlinePx);
    reg.setViewportHeight(this.gl.domElement.height);
  }

  resize(): void {
    const canvas = this.gl.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.applyScale();
  }

  private applyScale(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxPixelRatio) * this.dyn.scale;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(this.cssW, this.cssH, false);
    this.outlines?.setViewportHeight(this.gl.domElement.height);
  }

  render(scene: Scene, camera: Camera, nowMs: number): void {
    this.gl.info.reset();
    this.gl.setScissorTest(false);
    this.gl.setViewport(0, 0, this.cssW, this.cssH);
    this.gl.render(scene, camera);

    if (this.lastFrame > 0) {
      const dt = nowMs - this.lastFrame;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
      if (this.dyn.sample(dt)) this.applyScale();
    }
    this.lastFrame = nowMs;
  }

  /**
   * Render a second camera into a DOM-sized window in the same canvas.
   *
   * This is still the one renderer and one scene: the draft card is a clear
   * patch in the DOM above it, not a second WebGL context with another asset
   * cache. Coordinates arrive in CSS pixels and are clipped to the canvas.
   */
  renderInset(scene: Scene, camera: Camera, rect: DOMRect): boolean {
    const canvas = this.gl.domElement;
    const bounds = canvas.getBoundingClientRect();
    const left = Math.max(0, rect.left - bounds.left);
    const top = Math.max(0, rect.top - bounds.top);
    const right = Math.min(bounds.width, rect.right - bounds.left);
    const bottom = Math.min(bounds.height, rect.bottom - bounds.top);
    const width = right - left;
    const height = bottom - top;
    if (width < 2 || height < 2) return false;

    const oldClear = this.gl.getClearColor(new Color()).clone();
    const oldAlpha = this.gl.getClearAlpha();
    const y = bounds.height - bottom;
    this.gl.setScissorTest(true);
    this.gl.setViewport(left, y, width, height);
    this.gl.setScissor(left, y, width, height);
    this.gl.setClearColor(0x71ad62, 1);
    this.gl.clear(true, true, false);
    this.gl.render(scene, camera);
    this.gl.setClearColor(oldClear, oldAlpha);
    this.gl.setScissorTest(false);
    this.gl.setViewport(0, 0, this.cssW, this.cssH);
    return true;
  }

  stats(): RendererStats {
    const info = this.gl.info;
    const times = this.frameTimes;
    const last = times.length ? times[times.length - 1] : 0;
    const sorted = times.slice().sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      frameMs: last,
      p95Ms: p95,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textureMB: 0, // filled by the budget script from a WebGL query
      scale: this.dyn.scale,
      tier: this.tier.tier,
    };
  }

  dispose(): void {
    this.gl.dispose();
  }
}
