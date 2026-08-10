// OWNER: render agent. The camera language. Units are FEET: plate at origin,
// +z toward the mound (46 ft) and center field, +x toward first base. Presets
// are derived from the anchors:
//
//   pitching — steam-02: camera low behind home, so the righty batter at the
//     third-base box reads LARGE center-right in rear 3/4 (~44% of frame
//     height at ~13 ft), pitcher small near center over his shoulder, horizon
//     in the upper third. Camera eye 5 ft (a kid's head height) pitched down
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
  // mirrors it for frame-080's batting look.
  //
  // Numbers solved against verdict-001 fix 2 with a projection check
  // (batter feet/head, catcher, plate, pitcher as screen fractions):
  //   pitching — batter sx≈0.71, 44% of frame height, feet at sy≈0.91 (in
  //     frame), catcher separated at sx≈0.58 with the plate visible between
  //     them (0.58, 0.94), pitcher sx≈0.46 over the batter's shoulder,
  //     horizon sy≈0.44. Eye dropped 6.0→5.0 ft, fov 50→46, eye pulled in a
  //     foot — "lower and tighter", per the verdict.
  //   batting — re-solved for verdict-003 fix 1 (its second assignment): the
  //     catcher at (0.9, -3.6) sat ~8 ft off the old eye and could only ever
  //     be a clipped cap-dome eating the bottom-left corner. Fitting his
  //     whole crouch is impossible without shrinking the batter below the
  //     anchor, so per the verdict ("accept losing him entirely over keeping
  //     the blob") the eye is pulled right (-x), up and a touch back, with
  //     the pan and fov re-balanced, until every catcher extremity — cap
  //     bulge, raised mitt, leaning torso, wide knee — projects off-frame
  //     with real margin (worst case sx≈-0.12; a first, tighter solve at
  //     ≈-0.05 modelled margin still leaked a cap sliver on capture, so the
  //     projected extents under-read the built mesh by ~0.1 sx — keep that
  //     allowance if this is ever re-solved). Batter lands sx≈0.22 at ~43%
  //     frame height, feet and plate in frame (frame-080 has him
  //     left-of-center), pitcher sx≈0.54 over his shoulder, horizon sy≈0.43.
  pitching: { pos: [2.6, 5.0, -11.2], look: [-3.5, 2.0, 46], fov: 46, swayScale: 1 },
  batting: { pos: [-12.2, 6.4, -11.8], look: [3.6, 1.8, 46], fov: 44, swayScale: 1 },
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
