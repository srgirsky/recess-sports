// ---------------------------------------------------------------------------
// ★ STAGE 0 — THE LOOK SPIKE.
//
// The whole point of this file is to make the ONE expensive, irreversible
// decision — commissioning 30 bespoke character models — against evidence
// instead of hope. It renders the park at real kid scale, toon-shaded with
// inverted-hull outlines under the brand's upper-left key light, populated
// with proxy kids, on the solved FIELD camera.
//
// It is deliberately NOT gameplay. Nothing here steps a sim. If the look
// doesn't land, we find out in a week rather than after the art budget.
//
// Done test: 60fps at 1x on a real iPad, draw calls and triangles inside
// budget, and a side-by-side against BB2026 / Paw Patrol reference that gets
// an explicit yes.
// ---------------------------------------------------------------------------

import { Fog, PerspectiveCamera, Scene, Vector3 } from 'three';
import { ROSTER } from '../../data/characters';
import { FIELD_POSITIONS, VENUE_GEOMETRY, type PositionId, type VenueId } from '../sim/field';
import { Renderer } from '../render/Renderer';
import { Lighting } from '../render/Lighting';
import { OutlineRegistry } from '../render/materials/outline';
import { VENUE_LOOKS, buildField, type FieldBuild } from '../render/Field';
import { buildFence, type FenceBuild } from '../render/Fence';
import { buildScenery, type SceneryBuild } from '../render/Scenery';
import { SKY_HORIZON, buildSky } from '../render/Sky';
import { CharacterModel, type KidView } from '../render/CharacterModel';
import { createCharacter, proxyForced, type KidSource } from '../render/CharacterFactory';
import { configureModelLoader } from '../render/modelLoader';
import { AnimationDirector } from '../render/AnimationDirector';
import { performanceFor } from '../render/performance';
import { buildProceduralClips } from '../render/proceduralClips';
import type { AnimName } from '../render/clips';
import { FACE_CELLS, type FaceCell } from '../render/faceAtlas';
import { RIGS, damp, type CameraPreset } from '../render/cameraCues';

const PRESET_ORDER: CameraPreset[] = ['PLAY', 'FIELD', 'PITCH', 'DEEP', 'PITCH_HERO'];
const VENUE_ORDER = Object.keys(VENUE_GEOMETRY) as VenueId[];

/** Away team colour index vs home team colour index (from art/palette.ts). */
const AWAY_UNIFORM = 1; // blue
const HOME_UNIFORM = 0; // red

export class LookSpike {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: Renderer;
  private readonly lighting: Lighting;
  private readonly outlines = new OutlineRegistry();

  private field!: FieldBuild;
  private fence!: FenceBuild;
  private scenery!: SceneryBuild;
  private kids: KidView[] = [];
  private directors: AnimationDirector[] = [];
  /** How each kid on the field was resolved — the review readout's whole point. */
  private sources: KidSource[] = [];
  /** `?proxy=1` at boot; the toggle button flips it without a reload. */
  private forceProxy = proxyForced();
  private building = false;
  // Built once and SHARED by every kid: an AnimationClip is immutable data, so
  // 18 mixers can play the same one. Building per character would be 18x the
  // memory for identical tracks.
  private readonly clipLibrary = buildProceduralClips();
  private readonly rosterReview = new URLSearchParams(location.search).has('roster');
  private readonly singleReviewId = new URLSearchParams(location.search).get('kid');

  private venueIdx = 0;
  private presetIdx = 0;
  private eye = new Vector3();
  private eyeVel = new Vector3();
  private target = new Vector3();
  private targetVel = new Vector3();

  private raf = 0;
  private statsEl: HTMLElement | null = null;
  private lastStats = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const rosterReview = this.rosterReview;
    if (rosterReview) this.presetIdx = PRESET_ORDER.indexOf('PITCH');
    else if (this.singleReviewId) this.presetIdx = PRESET_ORDER.indexOf('PITCH_HERO');
    const initialPreset = PRESET_ORDER[this.presetIdx];
    this.renderer = new Renderer(canvas);
    this.renderer.bindOutlines(this.outlines);
    // Before any load: KTX2 textures cannot transcode without asking the GPU
    // which compressed formats it takes.
    configureModelLoader(this.renderer.gl);

    this.camera = new PerspectiveCamera(RIGS[initialPreset].fov, 1, 0.5, 1600);
    this.eye.set(...RIGS[initialPreset].eye);
    this.target.set(...RIGS[initialPreset].target);
    if (rosterReview) {
      // Elevated contact sheet: enough pitch to separate all five rows while
      // preserving the face-on read the model review exists to judge.
      this.camera.fov = 37;
      this.eye.set(0, 15, -28);
      this.target.set(0, 2.5, 12);
    } else if (this.singleReviewId) {
      this.camera.fov = 32;
      this.eye.set(0, 4.2, -10);
      this.target.set(0, 2.8, 2);
    }

    this.lighting = new Lighting({ shadowMapSize: this.renderer.tier.shadowMapSize });
    this.scene.add(this.lighting.root);
    this.scene.add(buildSky());
    // Aerial haze cools the deep outfield and is most of what sells DISTANCE
    // in a flat-shaded scene — without it a 200ft fence reads as 40ft away.
    this.scene.fog = new Fog(SKY_HORIZON, 260, 900);

    this.buildVenue();
    void this.buildKids();
    this.mountControls();
    this.onResize();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
  }

  // --- Build ---------------------------------------------------------------

  private buildVenue(): void {
    const id = VENUE_ORDER[this.venueIdx];
    const geo = VENUE_GEOMETRY[id];
    const look = VENUE_LOOKS[id];

    this.field?.root.removeFromParent();
    this.field?.dispose();
    this.fence?.root.removeFromParent();
    this.fence?.dispose();
    this.scenery?.root.removeFromParent();
    this.scenery?.dispose();

    this.field = buildField(geo, look, this.outlines, { anisotropy: this.renderer.tier.anisotropy });
    this.fence = buildFence(geo, look, this.outlines);
    this.scenery = buildScenery(geo, id);
    this.scene.add(this.field.root);
    this.scene.add(this.fence.root);
    this.scene.add(this.scenery.root);
  }

  /**
   * Nine defenders at real posts, a batter and catcher at the plate, plus
   * baserunners — 13 characters, which is what a live play actually shows.
   * `?kids=18` forces the full worst case for a stress read.
   */
  private async buildKids(): Promise<void> {
    // Guard against the toggle being hammered: two overlapping builds would
    // race on `this.kids` and leave the losers parented to the scene forever.
    if (this.building) return;
    this.building = true;

    for (const d of this.directors) d.dispose();
    for (const k of this.kids) {
      k.root.removeFromParent();
      k.dispose();
    }
    this.kids = [];
    this.directors = [];
    this.sources = [];

    const want = Number(new URLSearchParams(location.search).get('kids') ?? '13');
    const rosterReview = new URLSearchParams(location.search).has('roster');
    const reviewId = this.singleReviewId;
    const reviewCharacter = reviewId ? ROSTER.find((c) => c.id === reviewId) : undefined;
    const positions = Object.keys(FIELD_POSITIONS) as PositionId[];

    /**
     * Give a kid a mixer and start them on a looping clip.
     *
     * A tableau of motionless kids was a fair Stage 0 read — the question was
     * whether the LOOK landed — but a still character in a 3D scene reads as a
     * bug, and the placeholder library costs nothing to hang here. It also
     * puts real per-frame mixer cost inside the draw-call budget this spike
     * exists to measure, which is the honest version of that measurement.
     *
     * `offset` staggers the phase so 13 kids do not breathe in unison.
     */
    const animate = (kid: KidView, character: (typeof ROSTER)[number], clip: AnimName, offset: number): void => {
      const requestedFace = new URLSearchParams(location.search).get('face');
      const dir = new AnimationDirector(kid.mesh, {
        fallback: this.clipLibrary,
        actor: requestedFace ? undefined : {
          id: character.id,
          profile: performanceFor(character.id),
          authoredRest: character.visual.expression,
          setExpression: (cell) => kid.setExpression(cell),
        },
      });
      dir.play(clip);
      dir.update(offset);
      this.directors.push(dir);
    };

    /**
     * Resolve one character through the factory — model if there is one, proxy
     * otherwise — and record WHICH, because that is what this page is for.
     */
    const place = async (
      c: (typeof ROSTER)[number],
      uniform: number,
      x: number,
      z: number,
      facing: number,
      clip: AnimName,
      offset: number
    ): Promise<void> => {
      const { view, source } = await createCharacter(c, {
        uniform,
        outlines: this.outlines,
        lodBias: this.renderer.tier.lodBias,
        forceProxy: this.forceProxy,
      });
      const requestedFace = new URLSearchParams(location.search).get('face');
      if (requestedFace && FACE_CELLS.includes(requestedFace as FaceCell)) {
        view.setExpression(requestedFace as FaceCell);
      }
      view.setPosition(x, z);
      view.setFacing(facing);
      this.scene.add(view.root);
      this.kids.push(view);
      this.sources.push(source);
      animate(view, c, clip, offset);
    };

    if (reviewCharacter) {
      await place(reviewCharacter, HOME_UNIFORM, 0, 2, Math.PI, 'idle', 0);
      this.building = false;
      return;
    }

    if (rosterReview) {
      // One evidence frame for the whole delivery: six columns by five rows,
      // all facing the camera and all resolved through the real model factory.
      // This is a content review surface, not gameplay layout.
      for (const [i, character] of ROSTER.entries()) {
        const col = i % 6;
        const row = Math.floor(i / 6);
        await place(
          character,
          i % 2 ? AWAY_UNIFORM : HOME_UNIFORM,
          -8.5 + col * 3.4,
          1 + row * 5.2,
          Math.PI,
          'idle',
          i * 0.11
        );
      }
      this.building = false;
      return;
    }

    for (const [i, pos] of positions.entries()) {
      const p = FIELD_POSITIONS[pos];
      // Everyone faces the plate. `atan2(x, z)` + π points them back at home.
      await place(
        ROSTER[i % ROSTER.length],
        HOME_UNIFORM,
        p.x,
        p.z,
        Math.atan2(p.x, p.z) + Math.PI,
        // The defence is set: `field_ready`, not `idle`.
        'field_ready',
        i * 0.17
      );
    }

    // Batter (right-handed box), on-deck, and runners for the away team.
    const extras: Array<[number, number, number]> = [
      [-2.6, 0.4, 0], // batter
      [4.2, -4.5, Math.PI * 0.15], // on deck
      [40, 43.5, -Math.PI * 0.75], // runner at first
      [-40, 43.5, Math.PI * 0.75], // runner at third
      [2, 84, Math.PI], // runner at second
    ];
    // The batter takes their stance; everyone else waits their turn.
    const extraClips: AnimName[] = ['bat_stance', 'idle', 'idle', 'idle', 'idle'];
    for (let i = 0; i < extras.length && this.kids.length < want; i++) {
      const [x, z, face] = extras[i];
      await place(ROSTER[(i + 11) % ROSTER.length], AWAY_UNIFORM, x, z, face, extraClips[i], i * 0.29);
    }

    // Pad out to the requested count for a stress read.
    let n = 0;
    while (this.kids.length < want) {
      await place(
        ROSTER[(n + 3) % ROSTER.length],
        AWAY_UNIFORM,
        -58 + (n % 6) * 7,
        18 + Math.floor(n / 6) * 6,
        Math.PI,
        'idle',
        n * 0.23
      );
      n++;
    }

    this.building = false;
  }

  /**
   * ★ What is on screen, split model vs proxy and by LOD level.
   *
   * Reported SEPARATELY from what was asked for, following the precedent
   * `/v2/?anims=1` set when it started labelling the reviewed clip apart from
   * the playing one. A kid that silently fell back to a proxy while the page
   * said "model" is the same bug: a review surface that agrees with your
   * intention instead of with the frame.
   */
  private census(): string {
    const models = this.sources.filter((s) => s === 'model').length;
    const failed = this.sources.filter((s) => s === 'proxy-failed').length;
    const levels = new Map<string, number>();
    for (const k of this.kids) {
      const level = k instanceof CharacterModel ? k.activeLevel() : 'proxy';
      levels.set(level, (levels.get(level) ?? 0) + 1);
    }
    const histogram = [...levels]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => `${name}:${n}`)
      .join(' ');
    return (
      `drawn ${models} model / ${this.kids.length - models} proxy` +
      (failed ? `  (${failed} FAILED to load)` : '') +
      `\n${histogram}`
    );
  }

  // --- Controls ------------------------------------------------------------

  private mountControls(): void {
    const hud = document.getElementById('hud');
    if (!hud) return;

    const bar = document.createElement('div');
    bar.className = 'spike-bar';
    bar.style.cssText =
      'grid-area: bottom; display:flex; gap:.5rem; justify-content:center; padding:1rem; flex-wrap:wrap;';

    const btn = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'interactive spike-btn';
      b.textContent = label;
      b.style.cssText =
        'font:600 1rem/1 var(--font); padding:.75rem 1.1rem; border-radius:var(--radius);' +
        'border:var(--stroke) solid var(--outline); background:var(--cream); color:var(--ink);' +
        'box-shadow:var(--shadow); cursor:pointer;';
      b.addEventListener('click', onClick);
      bar.appendChild(b);
      return b;
    };

    const camBtn = btn(`📷 ${PRESET_ORDER[this.presetIdx]}`, () => {
      this.presetIdx = (this.presetIdx + 1) % PRESET_ORDER.length;
      camBtn.textContent = `📷 ${PRESET_ORDER[this.presetIdx]}`;
    });
    const venueBtn = btn('🌳 PARK', () => {
      this.venueIdx = (this.venueIdx + 1) % VENUE_ORDER.length;
      this.buildVenue();
      venueBtn.textContent = `${['🌳 PARK', '🏡 SANDLOT', '🏀 BLACKTOP'][this.venueIdx]}`;
    });
    // ★ The A/B the asset contract §5 names. Same scene, same positions, same
    // clips — only the geometry source changes, which is the only way to judge
    // whether a delivered model is actually better than the stand-in it cost
    // money to replace.
    const artBtn = btn(this.forceProxy ? '🧍 PROXIES' : '🎨 MODELS', () => {
      this.forceProxy = !this.forceProxy;
      artBtn.textContent = this.forceProxy ? '🧍 PROXIES' : '🎨 MODELS';
      void this.buildKids();
    });
    btn('🔄 RELOAD KIDS', () => void this.buildKids());

    hud.appendChild(bar);

    this.statsEl = document.createElement('pre');
    this.statsEl.id = 'devstats';
    document.getElementById('app')?.appendChild(this.statsEl);
  }

  private onKey = (e: KeyboardEvent): void => {
    const i = PRESET_ORDER.indexOf(e.key.toUpperCase() as CameraPreset);
    if (i >= 0) this.presetIdx = i;
    if (e.key >= '1' && e.key <= '5') this.presetIdx = Number(e.key) - 1;
    if (e.key.toLowerCase() === 'v') {
      this.venueIdx = (this.venueIdx + 1) % VENUE_ORDER.length;
      this.buildVenue();
    }
    if (e.key.toLowerCase() === 'p') {
      this.forceProxy = !this.forceProxy;
      void this.buildKids();
    }
  };

  private onResize = (): void => {
    this.renderer.resize();
    const c = this.canvas;
    this.camera.aspect = (c.clientWidth || 1) / (c.clientHeight || 1);
    this.camera.updateProjectionMatrix();
  };

  // --- Loop ----------------------------------------------------------------

  start(): void {
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.update(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(now: number): void {
    const dt = 1 / 60;
    const rig = this.rosterReview
      ? { eye: [0, 15, -28], target: [0, 2.5, 12], fov: 37 }
      : this.singleReviewId
        ? { eye: [0, 4.2, -10], target: [0, 2.8, 2], fov: 32 }
      : RIGS[PRESET_ORDER[this.presetIdx]];

    for (const d of this.directors) d.update(dt);

    // Critically damped move to the active rig — never overshoots.
    for (const axis of ['x', 'y', 'z'] as const) {
      const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      [this.eye[axis], this.eyeVel[axis]] = damp(this.eye[axis], rig.eye[i], this.eyeVel[axis], dt);
      [this.target[axis], this.targetVel[axis]] = damp(
        this.target[axis],
        rig.target[i],
        this.targetVel[axis],
        dt
      );
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
    if (Math.abs(this.camera.fov - rig.fov) > 0.01) {
      this.camera.fov += (rig.fov - this.camera.fov) * 0.15;
      this.camera.updateProjectionMatrix();
    }

    // ★ The shadow trick: fit the frustum to the ACTION, not the park.
    //
    // In the real game the "action" is the ball, the chaser, the runners and
    // the batter — a handful of objects inside a ~60ft box, which is what
    // gives a 1024 map ~40x the texel density of a park-wide fit. The spike is
    // a static tableau with no action, so it fits ALL the characters: still
    // vastly tighter than the 560ft turf plane, and it makes the point
    // visible. (Fitting a SUBSET, as this did at first, silently drops
    // everyone outside the frustum out of the shadow pass entirely — the
    // fielders cast nothing at all.)
    this.lighting.fitShadowTo(this.kids.map((k) => k.root));

    this.renderer.render(this.scene, this.camera, now);

    if (this.statsEl && now - this.lastStats > 250) {
      this.lastStats = now;
      const s = this.renderer.stats();
      this.statsEl.textContent =
        `fps ${s.fps.toFixed(0)}   p95 ${s.p95Ms.toFixed(1)}ms   scale ${s.scale}\n` +
        `draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(1)}k  progs ${s.programs}\n` +
        `tier ${s.tier}   kids ${this.kids.length}   venue ${VENUE_ORDER[this.venueIdx]}\n` +
        `cam ${PRESET_ORDER[this.presetIdx]}   budget: draws<=90 tris<=180k\n` +
        `${this.census()}`;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    for (const d of this.directors) d.dispose();
    for (const k of this.kids) k.dispose();
    this.field.dispose();
    this.fence.dispose();
    this.outlines.dispose();
    this.renderer.dispose();
  }
}
