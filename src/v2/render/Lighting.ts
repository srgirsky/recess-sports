// ---------------------------------------------------------------------------
// Lighting. Render-side only.
//
// ★ THE KEY LIGHT COMES FROM THE UPPER LEFT, and that is not a preference.
//
// Every piece of v1's art is built on one warm upper-left key with cool
// navy-mixed shadow: CharacterArt's radial gradient stops are biased to
// (0.36, 0.30), `art/fieldTexture.ts` derives its tones by mixing toward
// #2c3e66 (shadow) and #fffae8 (highlight), the drawn sun sits top-left and
// the mound is lit as a dome. v2 reuses `fieldTexture.ts` verbatim for the
// infield dirt and chalk, so if the 3D key light disagrees with it the ground
// texture's painted shading fights the real shadows and the whole field reads
// as a collage. Azimuth 135° / elevation 52° is that same light in 3D.
//
// ★ THE SHADOW TRICK: the shadow camera's frustum is refitted every frame to
// the bounding box of the ACTION (ball + chaser + runners + batter, padded),
// not to the 480ft field. A 1024 map over a 60ft box has ~40x the texel
// density of the same map over the whole park — which is what makes soft,
// correct contact shadows affordable on the mid tier at all.
// ---------------------------------------------------------------------------

import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Vector3,
  type Object3D,
} from 'three';

/** Key light direction, matching v1's art convention. */
export const KEY_AZIMUTH_DEG = 135;
export const KEY_ELEVATION_DEG = 52;

const SKY_TINT = 0xbfe4ff;
const GROUND_BOUNCE = 0x6f9a4a;
const KEY_TINT = 0xfff3d8;

export interface LightingOptions {
  shadowMapSize: number;
  /** How far past the action bbox the shadow frustum reaches, ft. */
  shadowPadFt?: number;
  /**
   * Evening: cool flood-white key, dim navy sky bounce, warm sodium fill.
   * The key KEEPS its upper-left azimuth — the art convention above is
   * load-bearing day or night; at night that direction is simply where the
   * main flood bank hangs.
   */
  night?: boolean;
}

export class Lighting {
  readonly root = new Group();
  readonly key: DirectionalLight;
  readonly fill: DirectionalLight;
  readonly hemi: HemisphereLight;

  private readonly pad: number;
  private readonly box = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private readonly dir = new Vector3();

  constructor(opts: LightingOptions) {
    this.pad = opts.shadowPadFt ?? 12;
    this.root.name = 'lights';

    const night = opts.night === true;
    this.hemi = new HemisphereLight(
      new Color(night ? 0x2c3e66 : SKY_TINT),
      new Color(night ? 0x1f2e1f : GROUND_BOUNCE),
      night ? 0.32 : 0.55
    );
    this.root.add(this.hemi);

    // Azimuth measured from +Z toward +X; elevation from the ground plane.
    const az = KEY_AZIMUTH_DEG * (Math.PI / 180);
    const el = KEY_ELEVATION_DEG * (Math.PI / 180);
    this.dir
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      .normalize();

    this.key = new DirectionalLight(new Color(night ? 0xdcebff : KEY_TINT), night ? 0.95 : 1.5);
    this.key.position.copy(this.dir).multiplyScalar(140);
    this.key.castShadow = opts.shadowMapSize > 0;
    if (this.key.castShadow) {
      this.key.shadow.mapSize.setScalar(opts.shadowMapSize);
      // A tight near/far pair is as important as the tight frustum: depth
      // precision is what stops PCF soft shadows from acne-ing on the turf.
      this.key.shadow.camera.near = 1;
      this.key.shadow.camera.far = 400;
      this.key.shadow.bias = -0.0006;
      this.key.shadow.normalBias = 0.35;
    }
    this.root.add(this.key);
    this.root.add(this.key.target);

    // The opposite-side fill keeps the shadow side from going to flat navy.
    // Explicitly NOT a shadow caster — a second shadow map would double the
    // per-frame cost for a light nobody can point to on screen.
    this.fill = new DirectionalLight(new Color(night ? 0xffb066 : SKY_TINT), night ? 0.18 : 0.25);
    this.fill.position.set(-this.dir.x, 0.6, -this.dir.z).multiplyScalar(120);
    this.fill.castShadow = false;
    this.root.add(this.fill);
  }

  /**
   * Refit the shadow frustum around whatever matters this frame.
   *
   * Pass the small set of objects the player is actually looking at — the
   * ball, the chasing fielder, the runners, the batter. Passing the whole
   * scene defeats the entire point and silently returns you to a mushy
   * park-wide shadow map.
   */
  fitShadowTo(targets: readonly Object3D[]): void {
    if (!this.key.castShadow || targets.length === 0) return;

    this.box.makeEmpty();
    for (const t of targets) this.box.expandByObject(t);
    if (this.box.isEmpty()) return;

    this.box.getCenter(this.centre);
    this.box.getSize(this.size);

    // Square the frustum around the larger horizontal extent so the shadow
    // doesn't stretch when the action is wide but shallow (a play down the
    // line), which would otherwise change shadow softness mid-play.
    const half = Math.max(this.size.x, this.size.z) * 0.5 + this.pad;

    const cam = this.key.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();

    // Keep the light a fixed distance back along its direction so near/far
    // stay valid regardless of where the action is on the field.
    this.key.target.position.copy(this.centre);
    this.key.position.copy(this.centre).addScaledVector(this.dir, 140);
    this.key.target.updateMatrixWorld();
  }

  /** Ambient/hemisphere strength, for the night-game variant later. */
  setDaylight(t: number): void {
    this.hemi.intensity = 0.2 + 0.35 * t;
    this.key.intensity = 0.5 + 1.0 * t;
    this.fill.intensity = 0.1 + 0.15 * t;
  }
}
