// ---------------------------------------------------------------------------
// The game. v2's field, its nine fielders, its batter and every verb you have.
//
// ★ IT LIVED IN `spike/` UNTIL IT STOPPED BEING ONE. Twelve PRs built a complete
// headless sim and a render layer that had never met, and this was the page that
// introduced them: the Look Spike answers "does this look right?", the Anim
// Spike "does this move right?", and this one answered the question neither can
// — DOES IT PLAY RIGHT. It still answers it, at `/v2/?play=1`, but it is now
// also what `App.ts` mounts when a player presses PLAY, and a file the product
// runs on should not be filed under `spike/`. The two review pages stay where
// they are, because they really are spikes.
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
  BoxGeometry,
  EdgesGeometry,
  Fog,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type Quaternion,
} from 'three';
import { Renderer } from '../render/Renderer';
import { Lighting } from '../render/Lighting';
import { OutlineRegistry } from '../render/materials/outline';
import { VENUE_LOOKS, buildField, type FieldBuild } from '../render/Field';
import { buildFence, type FenceBuild } from '../render/Fence';
import { buildScenery, type SceneryBuild } from '../render/Scenery';
import { NIGHT_HORIZON, NIGHT_TOP, SKY_HORIZON, SKY_TOP, buildSky } from '../render/Sky';
import { createCharacter, proxyForced } from '../render/CharacterFactory';
import { configureModelLoader } from '../render/modelLoader';
import { AnimationDirector } from '../render/AnimationDirector';
import { buildProceduralClips } from '../render/proceduralClips';
import {
  PITCH_DELIVERY_RELEASE_SEC,
  cpuSwingCue,
  diveClip,
  playEventCue,
  slideCue,
} from '../render/actionCues';
import type { AnimName } from '../render/clips';
import { RIGS, chooseCamera, damp, type CameraCue, type CameraPreset } from '../render/cameraCues';
import { applyFrame, cameraInputFor, type SceneRefs } from '../render/bridge';
import { simulateGameLive, type GameResult, type LiveFrame, type SimEvent } from '../sim/game';
import type { PlayInputs } from '../sim/play';
import type { PitchKind } from '../sim/pitch';
import { FIRST, SECOND, THIRD, HOME, dist, fenceDistAt, pointAt, type FieldGeometry, type Vec2 } from '../sim/field';
import { hash01 } from '../../art/fieldTexture';
import { makeRng } from '../sim/rng';
import { VENUE_GEOMETRY, type VenueId } from '../sim/field';
import { planDefence } from '../sim/lineup';
import { ROSTER, getCharacter } from '../../data/characters';
import { clampBarrelFt, zoneBandFt, zoneHalfWidthFt } from '../sim/athletes';
import { BALL_RADIUS_FT } from '../sim/ball';
import { BAT, DEFENSE } from '../sim/params';
import { kidHeightFt } from '../render/ProxyCharacter';
import { UNIFORM_COLORS } from '../../art/palette';
import type { KidView } from '../render/CharacterModel';
import {
  DRAFT_CAST_POSITIONS,
  draftCast,
  draftHeroPose,
  type DraftSpotlightMode,
} from '../render/draftPresentation';
import { Scoreboard } from '../ui/Scoreboard';
import { Fireworks } from '../render/Fireworks';
import { InningBreak } from '../ui/InningBreak';
import { Matchup } from '../ui/Matchup';
import { MatchupTally } from '../ui/matchupModel';
import { PlayCallouts } from '../ui/PlayCallouts';
import { scoreboardModel, type ScoreboardTeams } from '../ui/scoreboardModel';

/**
 * How long the pitch frame is held PAST the crossing, seconds.
 *
 * ★ WITHOUT IT YOU CAN ONLY EVER BE EARLY. The view used to advance the instant
 * the ball reached the plate, so the latest reachable swing was exactly on time
 * and half the timing window — every late swing — was unreachable by
 * construction. Sized above the window's own edge (contact survives to about
 * ±0.22s, measured) so the whole of it is playable.
 */
const SWING_TAIL_SEC = 0.35;

/**
 * How long the pitcher may take before the ball is thrown for him, seconds.
 *
 * ★ NOTHING MAY HANG WAITING FOR A PERSON. v1's `FLOW.PITCH_CLOCK_MS` exists for
 * the same reason and its note is the rule: "dither on the pitch menu and the
 * game throws a fastball for you; nothing on the batting side waits for input,
 * so no mode can hang".
 */
const PITCH_CLOCK_SEC = 8;

/** The four kinds, in the order the picker shows them. */
const KINDS: PitchKind[] = ['fastball', 'changeup', 'curve', 'screwball'];

/**
 * What each pitch card shows. Icon first, one short word — the design pillar
 * is minimal reading, and BB2001/BB2026 both sell the pitch with the card art
 * (HEAT's flame, the hooks' curved path) rather than the label.
 */
const PITCH_CARDS: Record<PitchKind, { icon: string; label: string }> = {
  fastball: { icon: '🔥', label: 'FAST' },
  changeup: { icon: '🐢', label: 'SLOW' },
  curve: { icon: '🌈', label: 'CURVE' },
  screwball: { icon: '🌀', label: 'TWISTY' },
};

/** How long a between-pitch beat lasts, seconds. v1's `FLOW.BETWEEN_PITCH_MS`. */
const BETWEEN_SEC = 2.55;
/** The sim's own tick. Never the render delta — see the header. */
const SIM_HZ = 60;
/** Below this a pointer press is a TAP (a verb), above it a drag (steering). */
const TAP_MAX_MS = 220;
/** How close a tap must land to a bag to mean "throw there", ft. */
const BAG_TAP_FT = 14;

/**
 * How long a game is, in innings, and what that costs in minutes.
 *
 * ★ THE SIM'S DEFAULT IS SIX AND THE PRODUCT'S IS TWO, DELIBERATELY.
 * `GAME.REGULATION_INNINGS` is 6 and every harness record — `sim.gameShape`'s
 * 861 games, the 50,000-plate-appearance sweep — was measured at it; changing it
 * would silently restate all of them. So the SIM keeps its measurement default
 * and the PRODUCT chooses its own, which is what `GameSpec.regulationInnings`
 * is for.
 *
 * ★ AND THE PRODUCT'S ANSWER IS SHORT, BECAUSE THE BRIEF SAYS SO. "Short games"
 * is one of three design pillars for a four-to-eight-year-old audience, and v1
 * ships `INNINGS = 2`. v2 had been defaulting to the sim's 6 — measured at 217
 * pitches and about 17 minutes, against v1's 60 pitches and 5. Three and a half
 * times the sitting, from a constant nobody chose.
 */
const INNINGS_CHOICES = [
  { innings: 2, label: 'SHORT', minutes: 5 },
  { innings: 3, label: 'NORMAL', minutes: 9 },
  { innings: 6, label: 'LONG', minutes: 17 },
] as const;
export const GAME_LENGTHS = INNINGS_CHOICES;
export const DEFAULT_INNINGS = 2;

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

export class GameView {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  /** The same scene through the draft card's clipped presentation window. */
  private readonly draftCamera = new PerspectiveCamera(32, 1, 0.25, 160);
  private readonly renderer: Renderer;
  private lighting: Lighting;
  private readonly outlines = new OutlineRegistry();
  private readonly clipLibrary = buildProceduralClips();

  private field!: FieldBuild;
  private fence!: FenceBuild;
  private scenery!: SceneryBuild;
  /** Day or night. `?night=1` seeds it; the team screen's chip flips it live. */
  private night: boolean;
  private sky!: Mesh;
  /** Built lazily on the first night homer — a day game never pays for it. */
  private fireworks: Fireworks | null = null;
  private burstQueue: Array<{ delay: number; x: number; z: number; h: number; color: number }> = [];
  private uniformIdx = { away: 0, home: 1 };
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
  /**
   * The plate's own vertical plane — `HOME` is the origin, so z = 0.
   *
   * ★ THE SECOND AND LAST PLACE PIXELS BECOME FEET. Fielding asks the GROUND
   * where a tap landed; batting asks this one how HIGH it was. Two planes, two
   * verbs, and the sim still never sees a pixel.
   */
  private readonly platePlane = new Plane(new Vector3(0, 0, 1), 0);
  /** Where the player is holding the barrel, ft above the plate. */
  private aimHeightFt = 2;
  /** Where the player is aiming the PITCH, in plate coordinates, ft. */
  private spot = { x: 0, y: 2 };
  private pitchKind: PitchKind = 'fastball';
  /** Real seconds spent on the current windup, so it can never hang. */
  private windupElapsed = 0;
  /** The visible delivery runs before the sim releases the ball. */
  private deliveryElapsed = 0;
  private deliveryStarted = false;
  private cpuSwingStarted = false;
  private zoneBox: LineSegments | null = null;
  private aimBar: Mesh | null = null;
  private spotMarker: Mesh | null = null;
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
  private venue: VenueId;
  private readonly board = new Scoreboard();
  private readonly matchup = new Matchup();
  private readonly inningBreak = new InningBreak({
    forceEvery: new URLSearchParams(location.search).get('break') === '1',
  });
  private readonly matchupTally = new MatchupTally();
  private readonly callouts: PlayCallouts;
  private pickerEl: HTMLElement | null = null;
  private teamNames: ScoreboardTeams = { away: 'ROCKETS', home: 'COMETS' };

  /** Name the two sides. Set before `newGame`, or the scoreboard lies. */
  setTeamNames(t: ScoreboardTeams): void {
    this.teamNames = t;
  }

  /**
   * Called once, when the game ends.
   *
   * ★ THE RESULT WAS BEING THROWN AWAY. `simulateGameLive` RETURNS a
   * `GameResult` — the line score, every kid's line, the tally — and `advance`
   * read `r.done` to decide whether to keep the frame and dropped `r.value` on
   * the floor. The page simply froze on the last pitch, which looked like a
   * hang and was in fact a completed game with nobody listening.
   */
  private onEnd: ((result: GameResult) => void) | null = null;
  private simEvent: ((e: SimEvent) => void) | null = null;
  private frameTap: ((f: LiveFrame) => void) | null = null;
  /** charId -> the uniform they are currently wearing, so a rematch is cheap. */
  private readonly dressed = new Map<string, number>();
  private ended = false;
  private actionPlay: LiveFrame['play'] = null;
  private readonly slidLegs = new Set<string>();
  private readonly diveClips = new Map<string, AnimName>();
  private draftSpotlight: {
    id: string;
    pool: readonly string[];
    host: HTMLElement;
    mode: DraftSpotlightMode;
    ageSec: number;
    walkIn: boolean;
    cast: string[];
  } | null = null;
  private readonly draftProtected = new Set<string>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    const toasts = document.getElementById('toasts');
    if (!toasts) throw new Error('GameView: missing #toasts host');
    this.callouts = new PlayCallouts(toasts);
    this.venue = (params.get('venue') as VenueId) ?? 'park';
    this.night = params.get('night') === '1';
    this.renderer = new Renderer(canvas);
    this.renderer.bindOutlines(this.outlines);
    configureModelLoader(this.renderer.gl);
    this.camera = new PerspectiveCamera(RIGS.PITCH.fov, 1, 0.5, 900);
    this.lighting = new Lighting({ shadowMapSize: this.renderer.tier.shadowMapSize, night: this.night });
    this.scene.add(this.lighting.root);
    const skyc = this.skyColours();
    this.sky = buildSky(skyc.top, skyc.horizon);
    this.scene.add(this.sky);
    // Aerial haze is most of what sells DISTANCE in a flat-shaded scene —
    // and it must match the horizon it thickens toward, day or night, and
    // per venue (the city's night horizon is a sodium wash, not navy).
    this.scene.fog = new Fog(skyc.horizon, 260, 900);
    window.addEventListener('resize', this.onResize);
    // ★ ON THE CANVAS, which already receives every non-HUD tap by
    // construction: `#hud` is `pointer-events: none` and nothing on the
    // scoreboard is `.interactive`. v1's gotcha — "a scene-level pointerdown
    // swings on ANY tap, so corner buttons must stopPropagation" — cannot
    // happen here, and that is the one CSS rule doing it.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
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

  /**
   * Screen to a HEIGHT at the plate, by raycasting the plate's vertical plane.
   *
   * ★ AND THE HEIGHT IS ALL THE MODEL WANTS. `resolveSwing` reads how far under
   * the ball's centre the barrel passed; where the ball goes laterally is
   * already decided by `timingErrorSec`, because pulling it is what being early
   * MEANS. So the cursor is a bar, not a dot — a two-axis cursor would have put
   * a lateral intent on the wire that nothing downstream reads. `sim.humanSwing`.
   */
  private toPlate(e: PointerEvent): { x: number; y: number } | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.platePlane, hit)) return null;
    return { x: hit.x, y: hit.y };
  }

  /**
   * Where the player is holding the barrel, ft above the plate.
   *
   * ★ CLAMPED TO WHERE A KID CAN ACTUALLY HOLD A BAT, and that is a physical
   * fact rather than a tolerance. The raw raycast is unbounded: the plate plane
   * is infinite, so a pointer on the outfield fence set the barrel SIX FEET up —
   * above the batter's own head — and drew the aim bar floating in the sky while
   * every swing missed for a reason nothing on screen explained. Found by
   * looking at the new PITCH framing, which is exactly what a camera pass is for.
   *
   * ★ AND IT IS CLAMPED HERE, IN THE VIEW, NOT IN THE SIM. `sim.humanSwing`'s
   * rule is that a human's pointer IS the placement and the model must not
   * reinterpret it — so the sim keeps receiving an honest number, and the
   * membrane that already turns pixels into feet is the thing that knows a bat
   * cannot be held above its owner. The band is the batter's OWN height, so a
   * tall kid really can reach higher; it is deliberately not tightened toward
   * the zone, because narrowing it would be a batting assist and there is none.
   */
  private toPlateHeight(e: PointerEvent): number | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.platePlane, hit)) return null;
    return clampBarrelFt(hit.y, this.batterHeightFt());
  }

  /** The batter's own height in feet, or the reference kid's if he is unknown. */
  private batterHeightFt(): number {
    const id = this.frame?.batterId;
    return id ? kidHeightFt(getCharacter(id).visual) : DEFENSE.REFERENCE_HEIGHT_FT;
  }

  /**
   * ★ THE HUMAN BATS IN THE TOP HALF AND TAKES THE MOUND IN THE BOTTOM.
   *
   * A spike decision, and it has to be made somewhere: the same tap on a base
   * means THROW THERE when you are fielding and SEND HIM THERE when you are
   * batting, so without a side the two verbs collide. v1 answers this with
   * seats (`humanBats`/`humanPitches` on `SeatState`); v2's sim has no seat
   * concept yet, so the view picks the half. Both verbs stay reachable in one
   * game, which is what this page exists to test.
   */
  private get humanBats(): boolean {
    return this.frame?.half === 'top';
  }

  /** Is the player swinging right now? Only during a pitch he is batting at. */
  private get batting(): boolean {
    return this.frame?.phase === 'pitch' && this.humanBats;
  }

  /** Is the player choosing a pitch right now? */
  private get onTheMound(): boolean {
    return this.frame?.phase === 'windup' && !this.humanBats;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerDownAt = performance.now();
    if (this.batting) {
      const h = this.toPlateHeight(e);
      if (h !== null) this.aimHeightFt = h;
      return;
    }
    if (this.onTheMound) {
      const at = this.toPlate(e);
      if (at) this.spot = at;
      return;
    }
    const at = this.toField(e);
    if (at) this.inputs.pointer = at;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    // ★ AIM TRACKS WITHOUT A BUTTON HELD; steering needs one. A batter is
    // watching the ball for its whole flight and has nothing to press until he
    // decides to swing, so requiring a drag would make the aim unreachable
    // exactly when it matters.
    if (this.batting) {
      const h = this.toPlateHeight(e);
      if (h !== null) this.aimHeightFt = h;
      return;
    }
    if (this.onTheMound) {
      const at = this.toPlate(e);
      if (at) this.spot = at;
      return;
    }
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
    if (this.batting) {
      // ★ THE TAP IS THE WHOLE SWING, and it carries the time it happened
      // rather than firing immediately: the pitch resolves when the frame ends,
      // so `atSec` is what preserves WHEN he went. Swinging twice at one pitch
      // keeps the first — a bat cannot be un-swung.
      if (!this.inputs.swing) {
        this.inputs.swing = { atSec: this.pitchElapsed, aimHeightFt: this.aimHeightFt };
        // The human's tap IS the simulated swing instant. We learn it now, so
        // the director seeks the CONTACT marker onto this rendered tick and
        // plays the follow-through rather than drawing contact late.
        this.refs.directors.get(this.frame!.batterId)?.playToMarker('swing_contact', 0);
      }
      return;
    }
    if (this.onTheMound) {
      // ★ THE TAP RELEASES IT. There is no meter to fill — `sim.humanPitch`:
      // how hard it leaves the hand is the kid's arm and how far it misses the
      // spot is his `pitching` stat, so a meter would be a second source for
      // something the roster already decides.
      this.inputs.pitch = {
        kind: this.pitchKind,
        aimLateralFt: this.spot.x,
        aimHeightFt: this.spot.y,
      };
      this.beginPitchDelivery();
      return;
    }
    const at = this.toField(e);
    if (!at) return;
    if (this.humanBats) return this.tapBaseAsRunner(at);
    const bag = nearestBase(at);
    if (bag !== null) this.inputs.throwTo = { base: bag };
    else this.inputs.dive = true;
  };

  /**
   * v1's baserunning verb, unchanged: tap a base AHEAD of a runner to send him,
   * tap one BEHIND him to turn him back.
   *
   * The runner is chosen by the base rather than by tapping the kid, because a
   * kid at 40px is a smaller target than a bag and there may be three of them
   * converging on the same spot.
   */
  private tapBaseAsRunner(at: Vec2): void {
    const play = this.frame?.play;
    const bag = nearestBase(at);
    if (!play || bag === null) return;
    const live = play.runners.filter((r) => r.done === null);
    const ahead = live.find((r) => r.from + 1 === bag);
    if (ahead) {
      this.inputs.sendRunner = ahead.charId;
      return;
    }
    const behind = live.find((r) => r.from >= bag && r.from > 0);
    if (behind) this.inputs.holdRunner = behind.charId;
  }

  /** Number keys pick the pitch. Labelled in the HUD, so nothing is hidden. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const i = KINDS.indexOf(KINDS[Number(e.key) - 1]);
    if (Number(e.key) >= 1 && Number(e.key) <= KINDS.length && i >= 0) {
      this.pitchKind = KINDS[Number(e.key) - 1];
    }
  };

  async start(): Promise<void> {
    const geo = VENUE_GEOMETRY[this.venue];
    const look = VENUE_LOOKS[this.venue];
    this.field = buildField(geo, look, this.outlines, { anisotropy: this.renderer.tier.anisotropy });
    this.fence = buildFence(geo, look, this.outlines);
    this.scenery = buildScenery(geo, this.venue, { night: this.night });
    this.scene.add(this.field.root, this.fence.root, this.scenery.root);

    const ball = new Mesh(
      new SphereGeometry(0.12, 12, 8),
      new MeshStandardMaterial({ color: 0xf8f6ef })
    );
    this.scene.add(ball);
    this.refs.ball = ball;

    // ★ EVERY KID ON THE ROSTER, built once — all THIRTY, not the first
    // eighteen. A substitution mid-game would otherwise stall the frame on a
    // model load, and `CharacterFactory` already falls back to a proxy silently
    // for anyone undelivered.
    //
    // ⚠️ IT USED TO BUILD ROSTER[0..17], AND THE DRAFT MADE THAT A BUG. Before
    // there was a draft the two teams WERE the first eighteen in roster order,
    // so the slice was the whole cast. The moment a player picks their own nine,
    // the teams are scattered across all thirty — and a kid the scene never
    // built simply does not appear. He bats, he fields, he is announced, and
    // there is nobody there. No error, no warning: `showOnly` asks
    // `refs.kids.get(id)` and skips a miss. Drafting from the back of the board
    // put two invisible players on the field. `game.test.ts` pins the whole
    // roster now, because the failure is silent and the slice looked harmless.
    //
    // Cost: they are hidden until the frame names them, and a hidden object
    // draws nothing — so twelve more kids cost build time and memory, not draw
    // calls. `render.characterDrawCost` is about what is VISIBLE.
    await Promise.all(
      ROSTER.map(async (c, i) => {
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

    await this.newGame(new URLSearchParams(location.search).get('seed') ?? 'play');

    this.buildPlateCues();
    this.mountHud();
    this.onResize();
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  /**
   * The strike zone and the aim bar, drawn at the plate.
   *
   * ★ DRAWN FROM THE UMPIRE'S OWN GEOMETRY, never from numbers typed twice.
   * `isStrike` asks `zoneBandFt`/`zoneHalfWidthFt` and so does this, so a zone
   * the player is shown is the zone he is judged against by construction. A
   * second copy would be a drawing that could disagree with the call.
   */
  private buildPlateCues(): void {
    const [lo, hi] = zoneBandFt();
    const hw = zoneHalfWidthFt();
    const box = new EdgesGeometry(new BoxGeometry(hw * 2, hi - lo, 0.02));
    this.zoneBox = new LineSegments(box, new LineBasicMaterial({ color: 0xffffff }));
    this.zoneBox.position.set(HOME.x, (lo + hi) / 2, HOME.z);
    this.scene.add(this.zoneBox);
    this.aimHeightFt = (lo + hi) / 2;

    // The barrel, at the height he is holding it. Its THICKNESS is the real
    // tolerance — `BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT`, 2.70in — so what he
    // is asked to do is what the model actually measures, drawn at true size.
    const reach = (BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT) * 2;
    this.aimBar = new Mesh(
      new BoxGeometry(hw * 2.4, reach, 0.02),
      new MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6b5300 })
    );
    this.aimBar.position.set(HOME.x, this.aimHeightFt, HOME.z);
    this.scene.add(this.aimBar);

    // The pitcher's spot. A point, not a bar — he aims in two axes, and unlike
    // the batter his lateral intent IS read (`aimLateralFt` reaches the release).
    this.spotMarker = new Mesh(
      new BoxGeometry(0.35, 0.35, 0.02),
      new MeshStandardMaterial({ color: 0xff5470, emissive: 0x66131f })
    );
    this.spot = { x: 0, y: (lo + hi) / 2 };
    this.spotMarker.position.set(this.spot.x, this.spot.y, HOME.z);
    this.scene.add(this.spotMarker);
  }

  /** Show the plate cues only while a pitch is in the air. */
  private paintPlateCues(): void {
    // The zone is shown to whoever is being asked to aim at it — the batter
    // while the ball is in the air, the pitcher while he is choosing.
    if (this.zoneBox) this.zoneBox.visible = this.batting || this.onTheMound;
    if (this.aimBar) {
      this.aimBar.visible = this.batting;
      this.aimBar.position.y = this.aimHeightFt;
    }
    if (this.spotMarker) {
      this.spotMarker.visible = this.onTheMound;
      this.spotMarker.position.set(this.spot.x, this.spot.y, HOME.z);
    }
  }

  /**
   * Start a game. Called by `start`, and again by PLAY AGAIN.
   *
   * ★ IT REBUILDS THE GENERATOR AND NOTHING ELSE. The park, the fence, the
   * thirty characters and their mixers are all still here and still correct, so
   * a rematch costs one object instead of a scene rebuild and a model reload —
   * which is the difference between an instant PLAY AGAIN and a visible stall
   * on the one button a kid presses most.
   */
  /**
   * Anyone this game can field that the scene never built.
   *
   * ★ THE FAILURE IS SILENT, WHICH IS WHY IT IS A THROW AND NOT A WARNING.
   * `showOnly` and `applyIdleDefence` both do `refs.kids.get(id)` and skip a
   * miss, so a kid with no scene object bats, fields, gets announced and is
   * simply not there. Nothing errors and the game plays on. Exported so a test
   * can drive the rule without a GPU.
   */
  static missingFromScene(rosterIds: readonly string[], built: ReadonlySet<string>): string[] {
    return rosterIds.filter((id) => !built.has(id));
  }

  async newGame(
    seed: string,
    rosters?: { away: string[]; home: string[] },
    uniforms: { away: number; home: number } = { away: 0, home: 1 },
    innings = DEFAULT_INNINGS
  ): Promise<void> {
    const geo = VENUE_GEOMETRY[this.venue];
    // ★ THE DRAFTED TEAM, WHEN THERE IS ONE. `/v2/?play=1` has no draft in front
    // of it and must still play, so the first eighteen of the roster stay the
    // fallback — which is also what every measurement sweep and the layout audit
    // drive, and what keeps a seeded game reproducible without a draft.
    const away = {
      name: this.teamNames.away,
      ids: rosters?.away ?? ROSTER.slice(0, 9).map((c) => c.id),
    };
    const home = {
      name: this.teamNames.home,
      ids: rosters?.home ?? ROSTER.slice(9, 18).map((c) => c.id),
    };
    // ★ THE UNIFORMS ARE REBUILT, NOT RECOLOURED, because a rebuild is free and
    // a recolour is not. `ProxyCharacter` bakes its palette into geometry at
    // construction, so changing a shirt colour means re-running the builder —
    // measured at 2.2ms a kid, 39ms for a whole game's eighteen, which is
    // imperceptible behind the button that starts the game. A `setUniform` that
    // rewrote vertex colours would be more code for a saving nobody can see.
    //
    // ⚠️ AND IT HAS TO HAPPEN AT ALL, or you cannot tell the teams apart. Before
    // the draft the two sides WERE roster halves, so a uniform keyed on roster
    // index happened to match the team; once a player picks their own nine that
    // coincidence is gone and each team wears a mixture of both colours.
    this.uniformIdx = { ...uniforms };
    await this.dressTeams(away.ids, home.ids, uniforms);
    const missing = GameView.missingFromScene(
      [...away.ids, ...home.ids],
      new Set(this.refs.kids.keys())
    );
    if (missing.length > 0) {
      throw new Error(
        `GameView: ${missing.join(', ')} would play with no scene object. ` +
          'Every id a roster can name must be built in start() — see the note there.'
      );
    }
    this.inningBreak.setTeams(this.teamNames, innings);
    this.matchupTally.reset();
    this.placeSpectators(geo, [...away.ids, ...home.ids]);
    void planDefence(away.ids, getCharacter);
    this.game = simulateGameLive(
      {
        away,
        home,
        lookup: getCharacter,
        geo,
        regulationInnings: innings,
        onEvent: (e) => {
          this.matchupTally.onEvent(e);
          this.callouts.onEvent(e);
          if (e.t === 'pa') this.reactToPlateAppearance(e);
          // ★ THE SKY AGREES WITH A NIGHT HOMER. Render-side chrome reacting
          // to the same event the booth calls; the sim never knows.
          if (e.t === 'contact' && e.hit === 'HR' && !e.foul && this.night) this.queueFireworks();
          this.simEvent?.(e);
        },
      },
      makeRng(seed)
    );
    this.ended = false;
    this.callouts.reset();
    this.actionPlay = null;
    this.slidLegs.clear();
    this.diveClips.clear();
    this.inputs = {};
    this.wait = 0;
    this.pitchElapsed = 0;
    this.windupElapsed = 0;
    this.cue = null;
    this.advance();
  }

  /** Let both principals react to the plate appearance they just finished.
   * The bridge protects these one-shots from its idle loops until they settle. */
  private reactToPlateAppearance(e: Extract<SimEvent, { t: 'pa' }>): void {
    const batterWon = e.result === 'hit' || e.result === 'walk';
    this.refs.directors.get(e.batterId)?.play(batterWon ? 'cheer' : 'upset', { restart: true });
    this.refs.directors.get(e.pitcherId)?.play(batterWon ? 'upset' : 'cheer', { restart: true });
  }

  /**
   * Put each team in its own colour.
   *
   * Only the eighteen in this game are rebuilt; the rest of the roster keeps
   * whatever it was built with and is never shown. The old view is disposed
   * before the new one is added, or every rematch leaks a scene graph.
   */
  private async dressTeams(
    away: string[],
    home: string[],
    uniforms: { away: number; home: number }
  ): Promise<void> {
    const wanted = [
      ...away.map((id) => [id, uniforms.away] as const),
      ...home.map((id) => [id, uniforms.home] as const),
    ];
    await Promise.all(
      wanted.map(async ([id, uniform]) => {
        if (this.dressed.get(id) === uniform) return;
        const character = getCharacter(id);
        const made = await createCharacter(character, {
          forceProxy: proxyForced(),
          outlines: this.outlines,
          uniform,
        });
        const old = this.refs.kids.get(id);
        if (old) {
          this.scene.remove(old.root);
          old.dispose();
        }
        const view: KidView = made.view;
        this.scene.add(view.root);
        view.root.visible = false;
        this.refs.kids.set(id, view);
        this.refs.directors.set(id, new AnimationDirector(view.mesh, { fallback: this.clipLibrary }));
        this.dressed.set(id, uniform);
      })
    );
  }

  /** The two team names, for the scoreboard and the Result screen. */
  get teams(): ScoreboardTeams {
    return this.teamNames;
  }

  /** Who the human is playing as, for the Result screen's verdict. */
  get humanSide(): 'away' | 'home' {
    // The spike bats the top half, and the top half is the AWAY team's.
    return 'away';
  }

  /** Register the end-of-game callback. */
  onGameEnd(fn: (result: GameResult) => void): void {
    this.onEnd = fn;
  }

  /**
   * Listen to the sim's own event stream.
   *
   * ★ THE OBSERVER `GameSpec` HAS CARRIED SINCE PR 8, WITH ONE CONSUMER. Its
   * comment says "`harness.ts` is its only consumer"; sound is the second, and
   * it wants exactly what the harness wants — what HAPPENED, synchronously,
   * rather than what the frame looks like afterwards. By the time a frame is
   * yielded a swing and a take are indistinguishable.
   */
  onSimEvent(fn: (e: SimEvent) => void): void {
    this.simEvent = fn;
  }

  /** Read every rendered frame. Read-only, like everything on this side. */
  onFrame(fn: (f: LiveFrame) => void): void {
    this.frameTap = fn;
  }

  /**
   * Put the candidate and a waiting group into the draft card's live 3D window.
   * The screen reports identity and bounds; this view keeps all model and clip
   * work on the render side and uses the characters loaded during `start()`.
   */
  setDraftSpotlight(
    id: string | null,
    pool: readonly string[],
    host: HTMLElement | null,
    mode: DraftSpotlightMode
  ): void {
    if (!id || !host) {
      this.draftSpotlight = null;
      this.draftProtected.clear();
      return;
    }
    const previous = this.draftSpotlight;
    const sameKid = previous?.id === id;
    const sameBeat = sameKid && previous?.mode === mode;
    const cast = draftCast(id, pool);
    this.draftSpotlight = {
      id,
      pool: [...pool],
      host,
      mode,
      ageSec: sameBeat ? previous.ageSec : 0,
      walkIn: sameBeat ? previous.walkIn : !sameKid,
      cast,
    };
    this.draftProtected.clear();
    for (const castId of cast) this.draftProtected.add(castId);
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
    if (r.done) {
      this.frame = null;
      // ★ ONCE. The tick loop keeps running after the game ends (the park is
      // still on screen behind the Result screen), and `advance` is reachable
      // from `pump`, so an unguarded call would re-fire the callback every
      // frame — which reads as a Result screen that will not go away.
      if (!this.ended) {
        this.ended = true;
        this.onEnd?.(r.value as GameResult);
      }
      return;
    }
    this.frame = r.value;
    if (this.frame.phase === 'pitch') this.pitchElapsed = 0;
    if (this.frame.phase === 'pitch') this.cpuSwingStarted = false;
    if (this.frame.phase === 'windup') {
      this.windupElapsed = 0;
      this.deliveryElapsed = 0;
      this.deliveryStarted = false;
      // The CPU has no picker to wait for; its visible delivery is the wait.
      if (!this.onTheMound) this.beginPitchDelivery();
    }
    if (this.frame.phase === 'between') this.wait = BETWEEN_SEC;
    this.showOnly(this.frame);
    if (this.frame.phase === 'live' && this.frame.play) this.animatePlayActions(this.frame.play);
  }

  /** Start the complete windup -> stride -> release chain once. */
  private beginPitchDelivery(): void {
    if (this.deliveryStarted || !this.frame) return;
    this.deliveryStarted = true;
    this.deliveryElapsed = 0;
    this.refs.directors.get(this.frame.pitcherId)?.play('pitch_windup', { restart: true });
  }

  /** Schedule the CPU bat only when the authored pre-roll can land on its read. */
  private animateCpuSwing(): void {
    if (!this.frame || this.frame.phase !== 'pitch' || this.humanBats) return;
    const cue = cpuSwingCue(
      this.frame.batterId,
      this.pitchElapsed,
      this.frame.pitch!.cpuSwingAtSec,
      this.cpuSwingStarted
    );
    if (!cue) return;
    this.refs.directors
      .get(cue.characterId)
      ?.playToMarker(cue.clip, cue.secUntilEvent);
    this.cpuSwingStarted = true;
  }

  /** Consume each sim event once, and fit runner slides to their current leg. */
  private animatePlayActions(play: NonNullable<LiveFrame['play']>): void {
    if (this.actionPlay !== play) {
      this.actionPlay = play;
      this.slidLegs.clear();
      this.diveClips.clear();
    }

    for (const event of play.events) {
      if (event.t === 'dive') {
        const clip = diveClip(play, event.fielder);
        this.diveClips.set(event.fielder, clip);
        this.refs.directors.get(event.fielder)?.play(clip, { restart: true });
        continue;
      }
      if (event.t === 'diveMiss') {
        this.diveClips.delete(event.fielder);
        continue;
      }
      const cue = playEventCue(event, play);
      if (!cue) continue;
      const clip = event.t === 'catch' ? (this.diveClips.get(event.fielder) ?? cue.clip) : cue.clip;
      this.refs.directors.get(cue.characterId)?.playToMarker(clip, cue.secUntilEvent);
      if (event.t === 'catch') this.diveClips.delete(event.fielder);
    }

    for (const runner of play.runners) {
      const cue = slideCue(runner);
      if (!cue || this.slidLegs.has(cue.key)) continue;
      this.slidLegs.add(cue.key);
      this.refs.directors.get(cue.characterId)?.play(cue.clip, {
        rate: cue.rate,
        restart: true,
      });
    }
  }

  /** Only the kids actually on the field are visible — plus the yard kids. */
  private showOnly(frame: LiveFrame): void {
    const live = new Set<string>(Object.keys(frame.defence));
    if (frame.play) {
      for (const f of frame.play.fielders) live.add(f.charId);
      for (const r of frame.play.runners) if (r.done === null) live.add(r.charId);
    }
    live.add(frame.batterId);
    live.add(frame.pitcherId);
    for (const [id, view] of this.refs.kids) {
      view.root.visible = live.has(id) || this.spectators.has(id);
    }
  }

  /**
   * The kids the draft left behind, watching from beyond the fence.
   *
   * BB's parks read as a neighborhood partly because somebody is always
   * WATCHING (`docs/research/backyard-2026-reference.md` item 5). We already
   * build all thirty kids — the twelve nobody drafted were sitting invisible
   * in the scene. They now stand in the fence-to-privacy-ring band, facing
   * home, idling on the shared directors (`applyFrame` updates every director
   * and repositions only live ids, so this costs nothing per frame).
   *
   * Placement is hash-jittered off the roster INDEX, never random — the same
   * game shows the same crowd. Render-side set dressing only: the sim never
   * knows they are there, and the fence keeps them out of every play. Cost:
   * twelve proxies at 2 draws each against the measured 46-draw scene — and
   * they are wall-occluded in the plate cameras, visible from the aerial ones.
   */
  private readonly spectators = new Set<string>();

  private placeSpectators(geo: FieldGeometry, playing: string[]): void {
    const inGame = new Set(playing);
    this.spectators.clear();
    const bench = ROSTER.map((c) => c.id).filter((id) => !inGame.has(id));
    bench.forEach((id, i) => {
      const view = this.refs.kids.get(id);
      if (!view) return;
      const spray = -44 + (88 * i) / Math.max(1, bench.length - 1) + (hash01(i, 131) - 0.5) * 6;
      const distFt = fenceDistAt(geo, spray) + 5 + hash01(i, 137) * 9;
      const p = pointAt(spray, distFt);
      view.setPosition(p.x, p.z);
      view.setFacing(Math.atan2(HOME.x - p.x, HOME.z - p.z));
      this.spectators.add(id);
      const dir = this.refs.directors.get(id);
      dir?.play(i % 3 === 0 ? 'field_ready' : 'idle');
      // Staggered phase, so the crowd does not breathe in unison.
      dir?.update(hash01(i, 139) * 1.7);
    });
  }

  /** Keep the front-end clips authoritative while the live sim remains scenery. */
  private updateDraftPresentation(dt: number): void {
    const draft = this.draftSpotlight;
    if (!draft) return;
    draft.ageSec += dt;
    const hero = draftHeroPose(draft.ageSec, draft.mode, draft.walkIn);
    this.refs.directors.get(draft.id)?.play(hero.clip);
    for (const id of draft.cast.slice(1)) this.refs.directors.get(id)?.play('idle');
  }

  /**
   * Draw the selected kid and a waiting group through the transparent DOM card.
   *
   * No character is cloned and no second loader exists. Their transforms and
   * visibility are borrowed for one clipped render pass after the world has
   * already drawn, then restored before the next simulation frame.
   */
  private renderDraftPresentation(): void {
    const draft = this.draftSpotlight;
    if (!draft || !draft.host.isConnected) return;
    const rect = draft.host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const saved = new Map<
      string,
      { visible: boolean; position: Vector3; quaternion: Quaternion }
    >();
    for (const [id, view] of this.refs.kids) {
      saved.set(id, {
        visible: view.root.visible,
        position: view.root.position.clone(),
        quaternion: view.root.quaternion.clone(),
      });
      view.root.visible = false;
    }
    const ballVisible = this.refs.ball.visible;
    this.refs.ball.visible = false;

    try {
      const hero = draftHeroPose(draft.ageSec, draft.mode, draft.walkIn);
      const selected = this.refs.kids.get(draft.id);
      if (!selected) return;
      selected.root.visible = true;
      selected.setPosition(hero.xFt, 0);
      // Proxy/model facial geometry is +Z at rotation zero. The card camera is
      // behind home on -Z, so PI turns that face toward the presentation lens.
      selected.setFacing(Math.PI);

      draft.cast.slice(1).forEach((id, i) => {
        const view = this.refs.kids.get(id);
        const at = DRAFT_CAST_POSITIONS[i];
        if (!view || !at) return;
        view.root.visible = true;
        view.setPosition(at[0], at[1]);
        view.setFacing(Math.PI);
      });

      this.draftCamera.aspect = rect.width / rect.height;
      this.draftCamera.position.set(0, 3.7, -11.5);
      this.draftCamera.lookAt(0, 2.3, 2.4);
      this.draftCamera.updateProjectionMatrix();
      this.renderer.renderInset(this.scene, this.draftCamera, rect);
    } finally {
      this.refs.ball.visible = ballVisible;
      for (const [id, state] of saved) {
        const view = this.refs.kids.get(id);
        if (!view) continue;
        view.root.visible = state.visible;
        view.root.position.copy(state.position);
        view.root.quaternion.copy(state.quaternion);
      }
    }
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

    // Fireworks are chrome: stepped here, never tweened, built on demand.
    if (this.burstQueue.length > 0) {
      for (const b of this.burstQueue) b.delay -= dt;
      const due = this.burstQueue.filter((b) => b.delay <= 0);
      if (due.length > 0) {
        if (!this.fireworks) {
          this.fireworks = new Fireworks();
          this.scene.add(this.fireworks.points);
        }
        for (const b of due) this.fireworks.spawn(b.x, b.z, b.h, b.color);
        this.burstQueue = this.burstQueue.filter((b) => b.delay > 0);
      }
    }
    this.fireworks?.update(dt);

    if (this.frame) {
      this.frameTap?.(this.frame);
      applyFrame(this.refs, this.frame, dt, this.pitchElapsed, this.draftProtected);
      this.updateDraftPresentation(dt);
      this.animateCpuSwing();
      this.paintPlateCues();
      this.driveCamera(this.frame, dt);
      this.paintHud(this.frame);
    }
    this.renderer.render(this.scene, this.camera, now);
    this.renderDraftPresentation();
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
    if (this.frame.phase === 'windup') {
      this.windupElapsed += step;
      // A person gets until the pitch clock to choose. Once chosen (or timed
      // out), the complete visible delivery reaches RELEASE before the sim is
      // advanced, so the ball cannot leave a stationary pitcher's hand.
      if (!this.deliveryStarted) {
        const waiting = this.onTheMound && !this.inputs.pitch;
        const timedOut = this.windupElapsed >= PITCH_CLOCK_SEC;
        if (waiting && !timedOut) return;
        this.beginPitchDelivery();
      }
      this.deliveryElapsed += step;
      if (this.deliveryElapsed >= PITCH_DELIVERY_RELEASE_SEC) this.advance();
      return;
    }
    if (this.frame.phase === 'pitch') {
      this.pitchElapsed += step;
      if (this.pitchElapsed >= this.frame.pitch!.travelSec + SWING_TAIL_SEC) this.advance();
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
  /**
   * A SCREEN's camera, overriding the play policy while one is up.
   *
   * BB2026's menus are 3D scenes; ours are DOM over the live park, and this
   * is the "camera cue per screen" half of that equivalence — the draft looks
   * down the whole diamond, the team picker frames the defence whose jerseys
   * the swatches recolour, the result settles low behind the plate. Null
   * hands the camera back to `chooseCamera`. Eased through the same damp as
   * every other move, so showing a screen PANS rather than teleports.
   */
  private screenCue: CameraPreset | null = null;

  setScreenCue(preset: CameraPreset | null): void {
    this.screenCue = preset;
  }

  private driveCamera(frame: LiveFrame, dt: number): void {
    if (this.screenCue) {
      const rig = RIGS[this.screenCue];
      const wantEye = new Vector3(rig.eye[0], rig.eye[1], rig.eye[2]);
      const wantTgt = new Vector3(rig.target[0], rig.target[1], rig.target[2]);
      for (const ax of ['x', 'y', 'z'] as const) {
        [this.eye[ax], this.eyeVel[ax]] = damp(this.eye[ax], wantEye[ax], this.eyeVel[ax], dt);
        [this.target[ax], this.targetVel[ax]] = damp(this.target[ax], wantTgt[ax], this.targetVel[ax], dt);
      }
      this.camera.fov = rig.fov;
      this.camera.position.copy(this.eye);
      this.camera.lookAt(this.target);
      this.camera.updateProjectionMatrix();
      // The play cue is dropped so leaving the screen re-cuts cleanly.
      this.cue = null;
      return;
    }
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
   * The scoreboard and the pitch picker, as DOM under `#hud`.
   *
   * ★ THEY INHERIT THE ONE CSS RULE. `#hud` is `pointer-events: none` and only
   * `.interactive` children opt back in, which is what makes every non-HUD tap
   * fall through to the canvas BY CONSTRUCTION. v1's equivalent gotcha ("a
   * scene-level pointerdown swings on ANY tap, so corner buttons must
   * stopPropagation") simply cannot happen here.
   *
   * ★ THE PITCH CARDS ARE TAPPABLE, which reverses an earlier deliberate call
   * ("the picker is a READOUT of the number keys, not a menu"). What changed:
   * a touch player had NO way to choose a pitch at all — the number keys were
   * the only input, so every phone game was all fastballs. The old rationale
   * (four live targets over the field during a steer beat) is answered by
   * placement and timing rather than by keeping the cards dead: they sit at
   * the right EDGE, and only during `windup`, the one beat with nothing to
   * steer. The verb is still CHOOSING — `sim.humanPitch` is unchanged.
   */
  private mountHud(): void {
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.appendChild(this.board.root);
    hud.appendChild(this.matchup.root);
    hud.appendChild(this.inningBreak.root);
    this.pickerEl = document.createElement('div');
    this.pickerEl.className = 'pitch-picker';
    KINDS.forEach((kind, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pitch-card interactive';
      card.dataset.kind = kind;
      const art = PITCH_CARDS[kind];
      card.innerHTML =
        `<span class="pitch-card__icon">${art.icon}</span>` +
        `<span class="pitch-card__name">${art.label}</span>` +
        `<kbd class="pitch-card__key">${i + 1}</kbd>`;
      card.addEventListener('pointerdown', () => {
        this.pitchKind = kind;
      });
      this.pickerEl?.appendChild(card);
    });
    hud.appendChild(this.pickerEl);
  }

  private paintHud(frame: LiveFrame): void {
    this.board.update(
      scoreboardModel(
        frame,
        this.teamNames,
        (id) => getCharacter(id).name,
        this.humanBats ? 'bat' : 'pitch'
      )
    );
    this.inningBreak.update(frame);
    this.matchup.update(
      frame.batterId,
      frame.pitcherId,
      this.matchupTally.lines(frame.batterId, frame.pitcherId),
      // Both reference games collapse the HUD the moment the ball is live.
      frame.phase !== 'live'
    );
    // ★ THE PICKER IS SHOWN, NOT HIDDEN BEHIND A KEYBINDING NOBODY KNOWS.
    if (!this.pickerEl) return;
    this.pickerEl.classList.toggle('is-open', this.onTheMound);
    if (!this.onTheMound) return;
    for (const chip of this.pickerEl.children) {
      const el = chip as HTMLElement;
      el.classList.toggle('is-picked', el.dataset.kind === this.pitchKind);
    }
  }

  /**
   * Flip the park between day and night, live.
   *
   * The team screen's sun/moon chip calls this so the preview rule holds —
   * the park behind the picker IS the park the game starts in. Sky, fog,
   * lights and scenery swap; the sim never knows what time it is.
   */
  applyNight(night: boolean): void {
    if (night === this.night) return;
    this.night = night;

    this.applySky();

    this.scene.remove(this.lighting.root);
    this.lighting.key.dispose();
    this.lighting.fill.dispose();
    this.lighting.hemi.dispose();
    this.lighting = new Lighting({ shadowMapSize: this.renderer.tier.shadowMapSize, night });
    this.scene.add(this.lighting.root);

    const geo = VENUE_GEOMETRY[this.venue];
    this.scenery.root.removeFromParent();
    this.scenery.dispose();
    this.scenery = buildScenery(geo, this.venue, { night });
    this.scene.add(this.scenery.root);
  }

  /** This venue's sky pair for the current time of day. */
  private skyColours(): { top: number; horizon: number } {
    if (!this.night) return { top: SKY_TOP, horizon: SKY_HORIZON };
    return VENUE_LOOKS[this.venue].nightSky ?? { top: NIGHT_TOP, horizon: NIGHT_HORIZON };
  }

  /** Rebuild the sky and re-tint the fog from current (venue, night) state. */
  private applySky(): void {
    const { top, horizon } = this.skyColours();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    (this.sky.material as { dispose(): void }).dispose();
    this.sky = buildSky(top, horizon);
    this.scene.add(this.sky);
    (this.scene.fog as Fog).color.set(horizon);
  }

  /**
   * Swap the park itself, live — the venue chips' preview.
   *
   * Visual layers rebuild NOW (field, fence, scenery — the same trio
   * `LookSpike.buildVenue` swaps); the SIM keeps its current geometry until
   * `newGame` re-reads `VENUE_GEOMETRY[this.venue]`. That mismatch window is
   * deliberate and safe: the chips only exist on the team screen, which
   * covers the field, and PLAY BALL always starts a fresh game on the new
   * geometry.
   */
  applyVenue(id: VenueId): void {
    if (id === this.venue) return;
    this.venue = id;
    const geo = VENUE_GEOMETRY[id];
    const look = VENUE_LOOKS[id];
    this.field.root.removeFromParent();
    this.field.dispose();
    this.fence.root.removeFromParent();
    this.fence.dispose();
    this.scenery.root.removeFromParent();
    this.scenery.dispose();
    this.field = buildField(geo, look, this.outlines, { anisotropy: this.renderer.tier.anisotropy });
    this.fence = buildFence(geo, look, this.outlines);
    this.scenery = buildScenery(geo, id, { night: this.night });
    this.scene.add(this.field.root, this.fence.root, this.scenery.root);
    // A venue owns its night sky, so switching parks after dark re-tints it.
    this.applySky();
  }

  /** Three staggered team-colour bursts over the outfield. */
  private queueFireworks(): void {
    const side = this.frame?.half === 'bottom' ? 'home' : 'away';
    const hex = Number(
      (UNIFORM_COLORS[this.uniformIdx[side]]?.jersey ?? '#ffce3a').replace('#', '0x')
    );
    const geo = VENUE_GEOMETRY[this.venue];
    [-24, 2, 26].forEach((spray, i) => {
      const d = fenceDistAt(geo, spray) + 34;
      const p = pointAt(spray, d);
      // Low on purpose — the clouds' lesson (PR 28): the plate camera's
      // frame top is ~11° of elevation, so a "realistic" 60ft shell pops
      // OFFSCREEN. Fence-top height is where the reference's bursts read.
      this.burstQueue.push({ delay: 0.25 + i * 0.45, x: p.x, z: p.z, h: 26 + i * 6, color: hex });
    });
  }

  /** What the HUD shows. Read-only, like everything else on this side. */
  scoreboard(): LiveFrame | null {
    return this.frame;
  }

  /**
   * Advance the fixed clock without drawing, for the DOM layout audit only.
   *
   * The audit needs a settled HUD at four game states; rendering every
   * intermediate frame in software WebGL spent the CI watchdog on pixels it
   * immediately discarded. This uses the exact `pump(1 / SIM_HZ)` path the
   * live tick uses, is inert in production, and the audit still calls `tick`
   * once at the reached state before measuring any box.
   */
  devStepFixedClock(ticks = 6): LiveFrame | null {
    if (!import.meta.env.DEV) return this.frame;
    const count = Math.max(0, Math.floor(ticks));
    for (let i = 0; i < count; i++) this.pump(1 / SIM_HZ);
    return this.frame;
  }
}
