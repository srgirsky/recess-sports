// ---------------------------------------------------------------------------
// `/v2/?play=1` — the first page on which v2 plays baseball.
//
// ★ WHAT THIS IS FOR. Twelve PRs built a complete headless sim and a render
// layer with a park, characters, animation, materials and a camera policy, and
// the two had never met. The Look Spike answers "does this look right?"; the
// Anim Spike answers "does this move right?". This one answers the question
// neither can: DOES IT PLAY RIGHT — which is the only acceptance criterion for
// a game, and the one no test can express.
//
// ★ IT PUMPS THE SIM'S OWN GENERATOR. `simulateGameLive` is the ONE
// implementation of the game flow; `simulateGame` drains it and this pumps it
// against a real clock. A separate live driver would be a second implementation
// and would drift from the 50,000-plate-appearance harness silently.
//
// ★ AND IT STEPS AT A FIXED RATE, NEVER ON THE RENDER DELTA. Every `pace.*`
// record is a real-millisecond claim, and `scripts/simclock.lint.test.js` exists
// because a tempo scalar once put home-to-first at 6995ms while the record went
// on asserting 4197 — with every test green. Real time accumulates, the sim
// steps at its own rate, and there is no tempo dial to add.
//
// The scene is built by the SAME functions the Look Spike uses. Duplicating
// them would be a second park that drifts from the reviewed one.
// ---------------------------------------------------------------------------

import {
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { Renderer } from '../render/Renderer';
import { Lighting } from '../render/Lighting';
import { OutlineRegistry } from '../render/materials/outline';
import { VENUE_LOOKS, buildField, type FieldBuild } from '../render/Field';
import { buildFence, type FenceBuild } from '../render/Fence';
import { buildSky } from '../render/Sky';
import { createCharacter, proxyForced } from '../render/CharacterFactory';
import { configureModelLoader } from '../render/modelLoader';
import { AnimationDirector } from '../render/AnimationDirector';
import { buildProceduralClips } from '../render/proceduralClips';
import { RIGS, chooseCamera, damp, type CameraCue } from '../render/cameraCues';
import { applyFrame, cameraInputFor, type SceneRefs } from '../render/bridge';
import { simulateGameLive, type LiveFrame } from '../sim/game';
import type { PlayInputs } from '../sim/play';
import { FIRST, SECOND, THIRD, HOME, dist, type Vec2 } from '../sim/field';
import { makeRng } from '../sim/rng';
import { VENUE_GEOMETRY, type VenueId } from '../sim/field';
import { planDefence } from '../sim/lineup';
import { ROSTER, getCharacter } from '../../data/characters';
import type { KidView } from '../render/CharacterModel';

/** How long a between-pitch beat lasts, seconds. v1's `FLOW.BETWEEN_PITCH_MS`. */
const BETWEEN_SEC = 2.55;
/** The sim's own tick. Never the render delta — see the header. */
const SIM_HZ = 60;
/** Below this a pointer press is a TAP (a verb), above it a drag (steering). */
const TAP_MAX_MS = 220;
/** How close a tap must land to a bag to mean "throw there", ft. */
const BAG_TAP_FT = 14;

/** Which bag a tap meant, or null for "somewhere on the field". */
function nearestBase(at: Vec2): 1 | 2 | 3 | 4 | null {
  const bags: Array<[1 | 2 | 3 | 4, Vec2]> = [
    [1, FIRST],
    [2, SECOND],
    [3, THIRD],
    [4, HOME],
  ];
  let best: 1 | 2 | 3 | 4 | null = null;
  let bestD = BAG_TAP_FT;
  for (const [n, p] of bags) {
    const d = dist(at, p);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export class PlayView {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: Renderer;
  private readonly lighting: Lighting;
  private readonly outlines = new OutlineRegistry();
  private readonly clipLibrary = buildProceduralClips();

  private field!: FieldBuild;
  private fence!: FenceBuild;
  private refs: SceneRefs = { kids: new Map(), directors: new Map(), ball: new Mesh() };

  private game: Generator<LiveFrame, unknown, PlayInputs> | null = null;
  /**
   * What the player is asking for this tick.
   *
   * ★ `PlayInputs` HAS EXISTED SINCE PR 6 AND `stepPlay` NEVER READ IT — the
   * parameter was literally `_inputs`. Its own header called it "a typed seam
   * so the signature does not change when they land". This is them landing, and
   * the signature did not change.
   */
  private inputs: PlayInputs = {};
  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private pointerDownAt = 0;
  private frame: LiveFrame | null = null;
  private cue: CameraCue | null = null;

  private eye = new Vector3();
  private eyeVel = new Vector3();
  private target = new Vector3();
  private targetVel = new Vector3();

  private acc = 0;
  private last = 0;
  /** Real seconds spent on the current pitch, so the ball can be drawn flying. */
  private pitchElapsed = 0;
  /** Real seconds still to wait on a `between` beat. */
  private wait = 0;
  private readonly venue: VenueId;
  private hudEl: HTMLElement | null = null;
  private hudText = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.venue = (params.get('venue') as VenueId) ?? 'park';
    this.renderer = new Renderer(canvas);
    this.renderer.bindOutlines(this.outlines);
    configureModelLoader(this.renderer.gl);
    this.camera = new PerspectiveCamera(RIGS.PITCH.fov, 1, 0.5, 900);
    this.lighting = new Lighting({ shadowMapSize: this.renderer.tier.shadowMapSize });
    this.scene.add(this.lighting.root);
    this.scene.add(buildSky());
    // Aerial haze is most of what sells DISTANCE in a flat-shaded scene.
    this.scene.fog = new Fog(0xcfe9f7, 260, 900);
    window.addEventListener('resize', this.onResize);
    // ★ ON THE CANVAS, which already receives every non-HUD tap by
    // construction: `#hud` is `pointer-events: none` and nothing on the
    // scoreboard is `.interactive`. v1's gotcha — "a scene-level pointerdown
    // swings on ANY tap, so corner buttons must stopPropagation" — cannot
    // happen here, and that is the one CSS rule doing it.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  /**
   * Screen to field, by raycasting the ground plane.
   *
   * v2's answer to v1's `unproject`, and render-side for the same reason
   * `art/projection.ts` is: the sim stays in feet and only this membrane knows
   * about pixels.
   */
  private toField(e: PointerEvent): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerDownAt = performance.now();
    const at = this.toField(e);
    if (at) this.inputs.pointer = at;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.buttons === 0) return;
    const at = this.toField(e);
    if (at) this.inputs.pointer = at;
  };

  /**
   * A short tap is a verb; a drag is steering.
   *
   * ★ v1's RULE, AND ITS REASON. `LIVE.DIVE.TAP_MAX_MS` distinguishes "I am
   * pointing there" from "go now" — without it every steer would also dive.
   * Tapping a BASE throws to it; tapping anywhere else, while chasing, dives.
   */
  private readonly onPointerUp = (e: PointerEvent): void => {
    const quick = performance.now() - this.pointerDownAt < TAP_MAX_MS;
    if (!quick) return;
    const at = this.toField(e);
    if (!at) return;
    const bag = nearestBase(at);
    if (bag !== null) this.inputs.throwTo = { base: bag };
    else this.inputs.dive = true;
  };

  async start(): Promise<void> {
    const geo = VENUE_GEOMETRY[this.venue];
    const look = VENUE_LOOKS[this.venue];
    this.field = buildField(geo, look, this.outlines, { anisotropy: this.renderer.tier.anisotropy });
    this.fence = buildFence(geo, look, this.outlines);
    this.scene.add(this.field.root, this.fence.root);

    const ball = new Mesh(
      new SphereGeometry(0.12, 12, 8),
      new MeshStandardMaterial({ color: 0xf8f6ef })
    );
    this.scene.add(ball);
    this.refs.ball = ball;

    // ★ EVERY KID ON BOTH ROSTERS, built once. A substitution mid-game would
    // otherwise stall the frame on a model load, and `CharacterFactory` already
    // falls back to a proxy silently for anyone undelivered.
    const ids = [...ROSTER.slice(0, 9), ...ROSTER.slice(9, 18)];
    await Promise.all(
      ids.map(async (c, i) => {
        const made = await createCharacter(c, {
          forceProxy: proxyForced(),
          outlines: this.outlines,
          uniform: i < 9 ? 0 : 1,
        });
        const view: KidView = made.view;
        this.scene.add(view.root);
        view.root.visible = false;
        this.refs.kids.set(c.id, view);
        this.refs.directors.set(
          c.id,
          new AnimationDirector(view.mesh, { fallback: this.clipLibrary })
        );
      })
    );

    const away = { name: 'ROCKETS', ids: ROSTER.slice(0, 9).map((c) => c.id) };
    const home = { name: 'COMETS', ids: ROSTER.slice(9, 18).map((c) => c.id) };
    void planDefence(away.ids, getCharacter);
    this.game = simulateGameLive(
      { away, home, lookup: getCharacter, geo },
      makeRng(new URLSearchParams(location.search).get('seed') ?? 'play')
    );
    this.advance();

    this.mountHud();
    this.onResize();
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  /** Pull the next frame out of the sim. Null once the game is over. */
  private advance(): void {
    if (!this.game) return;
    const r = this.game.next(this.inputs);
    // ★ THE ONE-SHOTS ARE CONSUMED, the pointer is not. A dive or a throw is an
    // instant; steering is a state that persists until the player moves it. v1
    // makes the same split, and conflating them means either a dive that fires
    // every tick or a fielder who forgets where he was sent.
    this.inputs = { pointer: this.inputs.pointer };
    this.frame = r.done ? null : r.value;
    if (!this.frame) return;
    if (this.frame.phase === 'pitch') this.pitchElapsed = 0;
    if (this.frame.phase === 'between') this.wait = BETWEEN_SEC;
    this.showOnly(this.frame);
  }

  /** Only the kids actually on the field are visible. */
  private showOnly(frame: LiveFrame): void {
    const live = new Set<string>(Object.keys(frame.defence));
    if (frame.play) {
      for (const f of frame.play.fielders) live.add(f.charId);
      for (const r of frame.play.runners) if (r.done === null) live.add(r.charId);
    }
    live.add(frame.batterId);
    live.add(frame.pitcherId);
    for (const [id, view] of this.refs.kids) view.root.visible = live.has(id);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    // ★ FIXED-STEP ACCUMULATOR. The sim never sees the render delta.
    this.acc += dt;
    const step = 1 / SIM_HZ;
    while (this.acc >= step) {
      this.acc -= step;
      this.pump(step);
    }

    if (this.frame) {
      applyFrame(this.refs, this.frame, dt, this.pitchElapsed);
      this.driveCamera(this.frame, dt);
      this.paintHud(this.frame);
    }
    this.renderer.render(this.scene, this.camera, now);
    requestAnimationFrame(this.tick);
  };

  /** One sim step of real time. */
  private pump(step: number): void {
    if (!this.frame) return;
    if (this.frame.phase === 'between') {
      this.wait -= step;
      if (this.wait <= 0) this.advance();
      return;
    }
    if (this.frame.phase === 'pitch') {
      this.pitchElapsed += step;
      if (this.pitchElapsed >= this.frame.pitch!.travelSec) this.advance();
      return;
    }
    // Live: one frame of the generator IS one sim tick, so pulling advances it.
    this.advance();
  }

  /**
   * ★ THE CAMERA POLICY'S FIRST CALLER. `chooseCamera` has been complete,
   * tested and invoked by nothing since it was written. The hard cut is
   * honoured as it specifies — instant, no blend across contact.
   */
  private driveCamera(frame: LiveFrame, dt: number): void {
    const next = chooseCamera(cameraInputFor(frame), this.cue ?? undefined);
    const cut = next.transition === 'cut' || !this.cue;
    this.cue = next;
    const rig = RIGS[next.preset];
    const wantEye = new Vector3(rig.eye[0], rig.eye[1], rig.eye[2]);
    const wantTgt = new Vector3(next.focus[0], next.focus[1], next.focus[2]);
    if (cut) {
      this.eye.copy(wantEye);
      this.target.copy(wantTgt);
      this.eyeVel.set(0, 0, 0);
      this.targetVel.set(0, 0, 0);
    } else {
      for (const ax of ['x', 'y', 'z'] as const) {
        [this.eye[ax], this.eyeVel[ax]] = damp(this.eye[ax], wantEye[ax], this.eyeVel[ax], dt);
        [this.target[ax], this.targetVel[ax]] = damp(
          this.target[ax],
          wantTgt[ax],
          this.targetVel[ax],
          dt
        );
      }
    }
    this.camera.fov = rig.fov;
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  private readonly onResize = (): void => {
    this.renderer.resize();
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  /**
   * The scoreboard, as DOM under `#hud`.
   *
   * ★ IT INHERITS THE ONE CSS RULE. `#hud` is `pointer-events: none` and only
   * `.interactive` children opt back in, which is what makes every non-HUD tap
   * fall through to the canvas BY CONSTRUCTION — so this cannot eat the input
   * PR 14 is about to add. v1's equivalent gotcha ("a scene-level pointerdown
   * swings on ANY tap, so corner buttons must stopPropagation") simply cannot
   * happen here, and nothing on this scoreboard is interactive.
   */
  private mountHud(): void {
    const hud = document.getElementById('hud');
    if (!hud) return;
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'play-hud';
    hud.appendChild(this.hudEl);
  }

  private paintHud(frame: LiveFrame): void {
    if (!this.hudEl) return;
    const half = frame.half === 'top' ? '▲' : '▼';
    const outs = '●'.repeat(frame.outs) + '○'.repeat(Math.max(0, 3 - frame.outs));
    const bases = frame.bases.map((b) => (b ? '◆' : '◇')).join('');
    const line = `${half}${frame.inning}  ROCKETS ${frame.awayScore} – ${frame.homeScore} COMETS   ${frame.balls}-${frame.strikes}  ${outs}  ${bases}`;
    if (line !== this.hudText) {
      this.hudEl.textContent = line;
      this.hudText = line;
    }
  }

  /** What the HUD shows. Read-only, like everything else on this side. */
  scoreboard(): LiveFrame | null {
    return this.frame;
  }
}
