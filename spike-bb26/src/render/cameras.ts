// OWNER: render agent. The camera language. Units are FEET: plate at origin,
// +z toward the mound (46 ft) and center field, +x toward first base. Presets
// are derived from the anchors:
//
//   pitching — steam-02: camera low behind home on the third-base side, so the
//     righty batter at the third-base box reads LARGE frame-right in rear 3/4
//     (~40% of frame height at ~13 ft), pitcher small near center, horizon in
//     the upper third. Camera eye ~6 ft (just above a kid's head) pitched down
//     a touch — that is what keeps the batter low-and-large while the yard
//     stays visible behind the fence.
//   batting — frame-080: same plate, mirrored offset (first-base side) so the
//     batter sits left-of-center; slightly tighter fov.
//   high — frame-112's live-ball cut: steep oblique from behind/left of home,
//     whole diamond plus the near yard edge readable at once.
//   menu / draft — interior-ish eye-level framings reserved for later owners
//     (treehouse room scale, bench + floating card). Placeholders to refine.
//
// `camera:cut {preset}` is a HARD cut (BB2026 cuts, never dollies, between
// plate and live-ball cameras). A gentle deterministic breathing sway driven by
// tick-time keeps every frame alive; amplitude is small enough not to break
// framing comparisons between iterations at the same step count.

import * as THREE from 'three';

export type CameraPreset = {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  swayScale: number; // 0 disables (the high tactical cam should feel locked-off)
};

export const PRESETS: Record<string, CameraPreset> = {
  // NOTE on screen sides: the camera faces +z, so world +x lands on the LEFT
  // half of the frame. A +x camera offset therefore puts the batter (third-base
  // box, x≈-2.6) frame-RIGHT — the steam-02 pitching look — and a -x offset
  // mirrors it for frame-080's batting look. Verified against iter002/iter001.
  pitching: { pos: [4.9, 6.0, -12.2], look: [1.6, 1.3, 46], fov: 50, swayScale: 1 },
  batting: { pos: [-5.5, 5.9, -13.5], look: [-1.4, 1.5, 46], fov: 48, swayScale: 1 },
  high: { pos: [-42, 88, -34], look: [6, 0, 52], fov: 55, swayScale: 0 },
  menu: { pos: [0, 5.5, -13], look: [0, 4.6, 8], fov: 55, swayScale: 0.5 },
  draft: { pos: [-4, 4.8, -14], look: [1.5, 3.2, 4], fov: 50, swayScale: 0.5 },
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  activePreset: string;
  private base: CameraPreset;
  private readonly look = new THREE.Vector3();

  constructor(initial: string, aspect: number) {
    this.activePreset = PRESETS[initial] ? initial : 'pitching';
    this.base = PRESETS[this.activePreset];
    this.camera = new THREE.PerspectiveCamera(this.base.fov, aspect, 0.1, 3000);
    this.apply(0);
  }

  cutTo(preset: string): void {
    const next = PRESETS[preset];
    if (!next) return; // unknown preset names are ignored, never a crash
    this.activePreset = preset;
    this.base = next;
    this.camera.fov = next.fov;
    this.camera.updateProjectionMatrix();
    this.apply(0);
  }

  /** Deterministic breathing sway — tMs comes from the tick event only. */
  update(tMs: number): void {
    this.apply(tMs);
  }

  private apply(tMs: number): void {
    const s = this.base.swayScale;
    const t = tMs * 0.001;
    const dx = s * 0.09 * Math.sin(t * 0.42);
    const dy = s * 0.06 * Math.sin(t * 0.61 + 1.7);
    const dz = s * 0.05 * Math.sin(t * 0.33 + 3.1);
    const [px, py, pz] = this.base.pos;
    const [lx, ly, lz] = this.base.look;
    this.camera.position.set(px + dx, py + dy, pz + dz);
    // Look target drifts slightly less than the eye — reads as handheld weight.
    this.look.set(lx + dx * 0.4, ly + dy * 0.4, lz);
    this.camera.lookAt(this.look);
  }
}
