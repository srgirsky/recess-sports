// ---------------------------------------------------------------------------
// The game. BOTH halves are interactive with the same one-button timing input:
// the player bats the top of each inning (swing when the ring closes) and
// PITCHES the bottom (throw when the mound ring closes — a good throw drags the
// CPU batter's swing down). Walks, walk-offs, and one bonus inning on a tie.
//
// This scene owns all the "juice": ball tracking, a timing ring, contact pops,
// screen shake, ball flight, animated baserunning, and sound. The RULES still
// live in the pure systems/ reducers — this scene just plays back what they say.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  PITCH_TRAVEL_MS,
  PITCH_METER_MS,
  PITCH_AUTO_THROW_MS,
  CPU_PITCH_TRAVEL_MS,
  FLOW,
  INNINGS,
  MAX_EXTRA_INNINGS,
  TEAM_SIZE,
  SHAKE,
  PLATE_VIEW,
  RUNNER_TWEEN_MS,
  SHOW_TIMING_RING,
  ANIM,
  FX,
} from '../config';
import type { Character } from '../data/types';
import { getCharacter } from '../data/characters';
import {
  bandFromError,
  resolveContact,
  resolveContactAimed,
  timingForSwing,
  type SwingType,
  type Launch,
  type SwingBand,
  type AtBatResult,
} from '../systems/atbat';
import {
  pitchBandFromError,
  resolveCpuPitch,
  resolveCpuPitchLocated,
  rollAiWildPitch,
  wildSwingBand,
  type PitchBand,
  type CpuPitchPlan,
} from '../systems/pitch';
import {
  chooseCpuPitch,
  resolvePitchLocation,
  ballCurveAt,
  type PitchPlan,
  type PlateLoc,
} from '../systems/pitchkind';
import { showPitchSelect, zoneOutline, type PitchSelect } from './ui/PitchSelectUI';
import { plateToScreen, screenToPlate, clampToCursorRange } from '../art/plateView';
import { BattingView } from './ui/BattingView';
import { homerSpectacle, powerSwingFx, crazyPitchFx } from './ui/Spectacle';
import type { GameInitData } from './LineupScene';
import { swapPositions, type LineupPlan } from '../systems/lineup';
import { newFatigue, drainPitch, effectivePitching, isTired, cpuWantsRelief, type FatigueState } from '../systems/fatigue';
import { rampLevel, rampedArm, rampedCpuBatter } from '../systems/difficulty';
import { teamName, TEAM_LOGOS, type TeamIdentity } from '../systems/team';
import { UNIFORM_COLORS } from '../art/palette';
import { showHandoffSplash } from './ui/HandoffSplash';
import { LivePlayView } from './ui/LivePlayView';
import { getSettings } from '../systems/settings';
import type { StatEvent } from '../systems/stats';
import { getSeason, saveSeason, recordSeasonGame } from '../systems/season';
import {
  snapshotLive,
  applyFrame,
  isReplayWorthy,
  newHighlights,
  type ReplayFrame,
} from '../systems/replay';
import { setTeamVariant, clearTeamVariant, teamSuffix } from '../art/textureFactory';
import { createScoreboard, type Scoreboard } from './ui/Scoreboard';
import { shouldSkipBottom, isWalkOff, decideAfterHalf } from '../systems/gameflow';
import {
  newHalfInning,
  applyAtBat,
  applyLivePlay,
  applySteal,
  isHalfOver,
  type HalfInningState,
  type RunnerMove,
} from '../systems/inning';
import { rollSteal, cpuWantsSteal } from '../systems/steal';
import {
  newJuice,
  juiceGain,
  addJuice,
  canSpend,
  spend,
  cpuWantsSpend,
  type JuiceState,
  type JuiceEventKind,
} from '../systems/juice';
import {
  HOME,
  FIRST,
  SECOND,
  THIRD,
  MOUND,
  basePos,
  dist,
  fencePointAt,
  fenceYAtX,
  type FieldGeometry,
  type PositionId,
  type Vec,
} from '../systems/geometry';
import { getVenue, getFieldGeometry } from '../systems/venue';
import type { VenueDef } from '../data/venues';
import {
  startLivePlay,
  stepLivePlay,
  finishLivePlay,
  chooseThrowTarget,
  type LivePlayState,
  type LiveInputs,
} from '../systems/liveplay';
import { getMode, getFeatures, getSwingTiming, resolveLiveParams, type LiveParams } from '../systems/mode';
import {
  LIVE,
  CURSOR,
  JUICE,
  PLATE_ZONE,
  KID_SIZE,
  type GameMode,
  type ModeFeatures,
  type PitchKind,
} from '../config';
import { recordGamePlayed, getGamesPlayed } from '../systems/picklog';
import * as audio from '../systems/audio';
import { screenShake, burst, floatingText } from '../ui/effects';
import { makeMuteButton } from '../ui/MuteButton';
import { FONT, pill } from '../ui/theme';
import { idleBob, squashHop, groundShadow, runCycle, reactPose } from '../ui/anim';
import { poseKey } from '../art/textureFactory';
import { project, unproject, depthScale } from '../art/projection';
import { Announcer, type AnnounceKind } from '../systems/announcer';
import { commentatorProfile } from '../systems/voices';
import { Chatter, type ChatterMoment } from '../systems/chatter';

/**
 * 'pitching' = ball is inbound, swing now. 'aiming' = you're on the mound,
 * throw now. 'fielding' = live play, you steer the glowing fielder.
 * 'running' = live play, tap to send your runners.
 */
type Phase = 'pitching' | 'resolving' | 'aiming' | 'fielding' | 'running' | 'ended';

const POSITION_ORDER: PositionId[] = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

const BALL_GREEN = 0x57d977; // "good eye" green for called balls

const RUNNER_H = KID_SIZE.RUNNER_H; // runner sprite height

/** Shadow tone for a 0xrrggbb int: mix toward cool navy (matches CharacterArt). */
function shadeInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((color >> 16) & 255, 0x2c);
  const g = mix((color >> 8) & 255, 0x3e);
  const b = mix(color & 255, 0x66);
  return (r << 16) | (g << 8) | b;
}

/** Highlight tone for a 0xrrggbb int: mix toward warm near-white. */
function lightenInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  const r = mix((color >> 16) & 255, 0xff);
  const g = mix((color >> 8) & 255, 0xfa);
  const b = mix(color & 255, 0xe8);
  return (r << 16) | (g << 8) | b;
}

/**
 * One team's seat at the ballpark — everything that used to live in the
 * paired "player"/"ai" scene fields. seats[0] = away (the original player
 * side), seats[1] = home (the original CPU side); battingSeat()/fieldingSeat()
 * resolve by half. `humanBats`/`humanPitches` say which flow family serves the
 * seat (solo: seat 0 both, seat 1 neither — the CPU); `recordsStats` gates the
 * season stat feed (seat 0 only in solo).
 */
interface SeatState {
  team: string[];
  score: number;
  lineupIdx: number;
  pitcher?: Character;
  plan?: LineupPlan;
  fatigue: FatigueState;
  juice: JuiceState;
  identity?: TeamIdentity;
  humanBats: boolean;
  humanPitches: boolean;
  recordsStats: boolean;
  stats: StatEvent[];
}

function newSeatState(human: boolean): SeatState {
  return {
    team: [],
    score: 0,
    lineupIdx: 0,
    fatigue: newFatigue(),
    juice: newJuice(),
    humanBats: human,
    humanPitches: human,
    recordsStats: human,
    stats: [],
  };
}

export class GameScene extends Phaser.Scene {
  /** The two seats. Declaration-initialized ONCE (like the old field
   *  initializers) — init() resets the per-game parts through the accessors,
   *  preserving the exact pre-seat reset semantics. */
  private seats: [SeatState, SeatState] = [newSeatState(true), newSeatState(false)];

  /** The seat whose team is at bat this half. */
  private battingSeat(): SeatState {
    return this.seats[this.half === 'top' ? 0 : 1];
  }

  /** The seat whose team is in the field this half. */
  private fieldingSeat(): SeatState {
    return this.seats[this.half === 'top' ? 1 : 0];
  }

  // --- Legacy seat accessors -------------------------------------------------
  // Mechanical bridge from the old paired fields to the seat model: call sites
  // migrate to battingSeat()/fieldingSeat()/seats[i] group-by-group, then these
  // disappear. Behavior-identical by construction.
  private get playerTeam(): string[] { return this.seats[0].team; }
  private set playerTeam(v: string[]) { this.seats[0].team = v; }
  private get aiTeam(): string[] { return this.seats[1].team; }
  private set aiTeam(v: string[]) { this.seats[1].team = v; }
  private get playerScore(): number { return this.seats[0].score; }
  private set playerScore(v: number) { this.seats[0].score = v; }
  private get aiScore(): number { return this.seats[1].score; }
  private set aiScore(v: number) { this.seats[1].score = v; }
  private get playerLineup(): number { return this.seats[0].lineupIdx; }
  private set playerLineup(v: number) { this.seats[0].lineupIdx = v; }
  private get aiLineup(): number { return this.seats[1].lineupIdx; }
  private set aiLineup(v: number) { this.seats[1].lineupIdx = v; }
  private get playerPitcher(): Character { return this.seats[0].pitcher!; }
  private set playerPitcher(v: Character) { this.seats[0].pitcher = v; }
  private get aiPitcher(): Character { return this.seats[1].pitcher!; }
  private set aiPitcher(v: Character) { this.seats[1].pitcher = v; }
  private get playerPlan(): LineupPlan | undefined { return this.seats[0].plan; }
  private set playerPlan(v: LineupPlan | undefined) { this.seats[0].plan = v; }
  private get aiPlan(): LineupPlan | undefined { return this.seats[1].plan; }
  private set aiPlan(v: LineupPlan | undefined) { this.seats[1].plan = v; }
  private get playerFatigue(): FatigueState { return this.seats[0].fatigue; }
  private set playerFatigue(v: FatigueState) { this.seats[0].fatigue = v; }
  private get playerJuice(): JuiceState { return this.seats[0].juice; }
  private set playerJuice(v: JuiceState) { this.seats[0].juice = v; }
  private get cpuJuice(): JuiceState { return this.seats[1].juice; }
  private set cpuJuice(v: JuiceState) { this.seats[1].juice = v; }
  private get identity(): TeamIdentity | undefined { return this.seats[0].identity; }
  private set identity(v: TeamIdentity | undefined) { this.seats[0].identity = v; }
  private get rival(): TeamIdentity | undefined { return this.seats[1].identity; }
  private set rival(v: TeamIdentity | undefined) { this.seats[1].identity = v; }
  private get statEvents(): StatEvent[] { return this.seats[0].stats; }
  private set statEvents(v: StatEvent[]) { this.seats[0].stats = v; }
  // ---------------------------------------------------------------------------

  private reliefBtn?: Phaser.GameObjects.Container;
  private reliefOverlay?: Phaser.GameObjects.Container;
  private pitchAutoPick?: Phaser.Time.TimerEvent;
  // The newer juice spends: armed until their live play happens (turbo/glove)
  // or the batting half ends (rally cap).
  private armedTurbo = false;
  private armedGlove = false;
  private rallyCapOn = false;
  private spendChips?: Phaser.GameObjects.Container;
  private activeLiveParams?: LiveParams; // per-play override (goldenGlove/turbo)
  private ramp = 0; // CPU difficulty ramp level (CLASSIC, from games played)
  private regulation = INNINGS; // game length (settings can pick 1/2/3)
  private practice = false; // batting practice: endless pitches, no outs, no innings
  private seasonGame = false; // this game counts toward Recess Week
  private matchType: 'solo' | 'passplay' = 'solo';

  /** Whose juice meter/chips are on screen: the device holder — the batting
   *  player in pass-and-play, always seat 0 in solo. */
  private deviceSeat(): SeatState {
    return this.matchType === 'passplay' ? this.battingSeat() : this.seats[0];
  }
  // 📼 instant replay: per-tick position snapshots of the current live play.
  private replayFrames: ReplayFrame[] = [];
  private playHighlights = newHighlights();
  private replaying = false;
  private replayed = false; // one replay per play, max
  private replayT = 0;
  private replayIdx = 0;
  private replayChrome?: Phaser.GameObjects.Container;

  private inning = 1;
  private half: 'top' | 'bottom' = 'top';
  private firstPitchOfGame = true;
  private firstDefenseOfGame = true;

  private halfState!: HalfInningState;
  private phase: Phase = 'resolving';
  private pauseRequested = false;

  // per-pitch visuals
  private ball?: Phaser.GameObjects.Arc;
  private ballShadow?: Phaser.GameObjects.Ellipse;
  private ringShrink?: Phaser.GameObjects.Arc;
  private ringTarget?: Phaser.GameObjects.Arc;
  private trailTimer?: Phaser.Time.TimerEvent;
  private pitchStart = 0;
  private swung = false;
  private batter!: Character;
  private pitchIsWild = false;
  /** Flight time of the pitch currently inbound (varies by kind in main mode). */
  private pitchTravelMs = PITCH_TRAVEL_MS;
  /** The located pitch coming at the player (main mode; public for dev/tests). */
  pitchPlan?: PitchPlan;
  private zoneGfx?: Phaser.GameObjects.Graphics;
  /** Main-mode batting cursor reticle (follows the pointer over the plate). */
  private swingCursor?: Phaser.GameObjects.Container;

  // defense half (the player pitches)
  private cpuBatter!: Character;
  private meterStart = 0;
  private threw = false;
  private autoThrowTimer?: Phaser.Time.TimerEvent;
  /** Main mode: the pitch kind + aim chosen before the meter starts. */
  private selectedPitch?: { kind: PitchKind; target: PlateLoc };
  private pitchSelect?: PitchSelect;
  /** Main mode: the base a player steal was armed from this pitch. */
  private armedSteal?: 1 | 2;
  private stealChips: Phaser.GameObjects.Container[] = [];
  /** Main mode: a CPU runner is stealing on the current pitch. */
  private cpuStealFrom?: 1 | 2;
  // Juice meters (main mode): charge on great plays, spend on power moves.
  private armedPower = false;
  private powerBtn?: Phaser.GameObjects.Container;
  private juiceGfx?: Phaser.GameObjects.Graphics;
  private announcer = new Announcer();
  private chatter = new Chatter();

  /** Field chatter: maybe let a kid pipe up (droppable — never talks over the booth). */
  private kidChat(moment: ChatterMoment, kid: Character): void {
    const c = this.chatter.pick(moment, this.time.now, kid);
    if (c) audio.say(c.text, c.profile, 'chatter');
  }

  /** Play-by-play: the booth kids call the moment (rate-limited, sometimes a 2-line exchange). */
  private callIt(kind: AnnounceKind, ctx: { name?: string } = {}, priority: 1 | 2 = 1): void {
    const lines = this.announcer.line(kind, this.time.now, ctx, priority);
    lines?.forEach((l, i) =>
      audio.say(l.text, commentatorProfile(l.speaker), priority === 2 && i === 0 ? 'flush' : 'queue')
    );
  }

  // baserunners currently on the diamond, keyed by base (1-3) — each is the kid
  private runners = new Map<number, Phaser.GameObjects.Container>();

  // --- live play (interactive fielding / running) ---
  private liveParams!: LiveParams;
  private venue!: VenueDef;
  private geo!: FieldGeometry;
  private mode!: GameMode;
  /** Which main-mode mechanics are on (public: read by controls & dev drivers). */
  features!: ModeFeatures;
  private livePlay?: LivePlayState;
  /** Defensive assignment for the current half, sim order (index 0 = P). */
  private fieldAssignment: Array<{ position: PositionId; charId: string }> = [];
  /** The live-play sprite layer (scenes/ui/LivePlayView.ts) — the sim's
   *  fielders/runners/ball/chrome. Rebuilt fresh every create(). */
  private liveView!: LivePlayView;
  private lastPointer: Vec = { ...MOUND };
  /** When the pointer last actually moved/tapped — stale pointers stop steering. */
  private lastPointerAt = -Infinity;
  private charging = false;
  private chargeStart = 0;
  private chargeBase: 1 | 2 | 3 | 4 = 1;
  private pendingThrow?: { base: 1 | 2 | 3 | 4; power: number };
  private pendingDive = false;
  private pressAt = 0; // pointerdown time — a short press+release is a dive tap
  private swingType: SwingType = 'normal'; // pre-pitch chip choice, reset per batter
  private swingChips?: Phaser.GameObjects.Container;
  private pendingRun = false;
  /** Main-mode per-runner taps, consumed by the next sim tick. */
  private pendingSend?: string;
  private pendingHold?: string;
  private firstFieldPlay = true;
  private firstRunPlay = true;

  // display objects
  private batterSprite?: Phaser.GameObjects.Image;
  private batterScale = 1;
  private batterIdle?: Phaser.Tweens.Tween;
  private pitcherSprite?: Phaser.GameObjects.Image;
  private scoreboard!: Scoreboard;
  private announce!: Phaser.GameObjects.Text;
  private announceBg!: Phaser.GameObjects.Rectangle;
  private baseMarks: Phaser.GameObjects.Polygon[] = [];
  private batterLabel!: Phaser.GameObjects.Text;

  // --- Two views (Backyard-style hard cut) ---
  /** HUD camera: world objects are hidden from it via pinUI's inverse — see
   *  the addedtoscene hook in create(). Neither camera ever pans or zooms:
   *  'close' just shows the behind-plate rig over the field. */
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private viewMode: 'close' | 'wide' = 'wide';
  /** The behind-home-plate pitch view (scenes/ui/BattingView.ts). */
  private rig!: BattingView;
  /** Raw screen pointer coords — the rig's cursor input (never unprojected). */
  private lastScreenPointer: Vec = { x: PLATE_VIEW.ZONE.CX, y: PLATE_VIEW.ZONE.CY };
  /** The corner mini-diamond inset's base dots (gold = occupied). */
  private miniBaseDots: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super('Game');
  }

  init(data: GameInitData): void {
    this.playerTeam = data.playerTeam;
    this.aiTeam = data.aiTeam;
    this.playerPlan = data.playerPlan;
    this.aiPlan = data.aiPlan;
    // Team jerseys: arm the texture-variant resolver so EVERY sprite in this
    // scene (and Result) wears team colors. Schoolyard clears it again.
    clearTeamVariant();
    if (data.identity) setTeamVariant(data.playerTeam, teamSuffix(data.identity.color, data.identity.logo));
    if (data.rival) setTeamVariant(data.aiTeam, teamSuffix(data.rival.color, data.rival.logo));
    this.identity = data.identity;
    this.rival = data.rival;
    this.regulation = getSettings().innings;
    this.practice = data.practice ?? false;
    this.seasonGame = data.seasonGame ?? false;
    this.matchType = data.matchType ?? 'solo';
    // Seat flags EVERY game (the seat objects persist across scene restarts):
    // pass-and-play makes the home seat a human batter too — both halves run
    // the human-batting family; the human-pitching family is never entered.
    const passplay = this.matchType === 'passplay';
    this.seats[0].humanBats = true;
    this.seats[0].humanPitches = !passplay;
    this.seats[0].recordsStats = true;
    this.seats[1].humanBats = passplay;
    this.seats[1].humanPitches = false;
    this.seats[1].recordsStats = passplay;
    this.seats[1].stats = [];
    this.statEvents = [];
    this.inning = 1;
    this.half = 'top';
    this.playerScore = 0;
    this.aiScore = 0;
    this.playerLineup = 0;
    this.aiLineup = 0;
    this.phase = 'resolving';
    this.pauseRequested = false;
    this.firstPitchOfGame = true;
    this.firstDefenseOfGame = true;
    this.baseMarks = [];
    this.runners = new Map();
    this.pitchIsWild = false;
    this.threw = false;
    this.autoThrowTimer = undefined;
    this.livePlay = undefined;
    this.pitchPlan = undefined;
    this.pitchTravelMs = PITCH_TRAVEL_MS;
    this.selectedPitch = undefined;
    this.pitchSelect = undefined;
    this.zoneGfx = undefined;
    this.armedSteal = undefined;
    this.cpuStealFrom = undefined;
    this.stealChips = [];
    this.fieldAssignment = [];
    this.charging = false;
    this.pendingThrow = undefined;
    this.pendingDive = false;
    this.pendingRun = false;
    this.pendingSend = undefined;
    this.pendingHold = undefined;
    this.firstFieldPlay = true;
    this.firstRunPlay = true;
    this.viewMode = 'wide';
    this.miniBaseDots = [];
  }

  create(): void {
    // Lineup plans (CLASSIC, from LineupScene) name the starters; without a
    // plan (kid mode / legacy) the best arm just takes the mound.
    this.aiPitcher = this.aiPlan ? getCharacter(this.aiPlan.pitcherId) : bestPitcher(this.aiTeam);
    this.playerPitcher = this.playerPlan
      ? getCharacter(this.playerPlan.pitcherId)
      : bestPitcher(this.playerTeam);
    this.mode = getMode();
    this.features = getFeatures(this.mode);
    this.liveParams = resolveLiveParams(this.mode);
    this.venue = getVenue();
    this.geo = getFieldGeometry(this.venue);
    // Ramp is read BEFORE this game is tallied (game 1 plays at level 0),
    // and only in CLASSIC — kid mode never sharpens.
    // Pass-and-play is PvP: symmetric CPU defenses, no ramp, and it doesn't
    // feed the solo ramp's games-played tally.
    this.ramp =
      this.mode === 'main' && this.matchType !== 'passplay' ? rampLevel(getGamesPlayed()) : 0;
    if (this.matchType !== 'passplay') recordGamePlayed();
    // The booth introduces the matchup.
    if (this.identity && this.rival) {
      audio.say(`${teamName(this.identity)} versus ${teamName(this.rival)}! Play ball!`, undefined, 'queue');
    }
    // Batting practice: a big DONE button is the only way out (no innings).
    // Deferred a tick — pinUI needs the UI camera, which is built later in
    // create().
    if (this.practice) {
      this.time.delayedCall(0, () => {
        const done = pill(this, GAME_WIDTH / 2, 40, '✅ DONE', { fill: COLORS.gold, fontSize: 20, minW: 130 });
        done.container.setDepth(95);
        this.pinUI(done.container);
        done.container.setInteractive(
          new Phaser.Geom.Rectangle(-65, -22, 130, 44),
          Phaser.Geom.Rectangle.Contains
        );
        done.container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          this.scene.start('Schoolyard', { straightToDraft: false });
        });
      });
    }

    // The UI camera renders HUD chrome only and never zooms. Every object is
    // world by default: this hook hides it from the UI cam the moment it's
    // added (so bursts/floating text/trails spawned mid-play stay world-side);
    // pinUI() flips an object the other way. Registered BEFORE any add() call.
    this.uiCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const routeToWorld = (go: Phaser.GameObjects.GameObject) => this.uiCam.ignore(go);
    this.events.on('addedtoscene', routeToWorld);
    this.events.once('shutdown', () => this.events.off('addedtoscene', routeToWorld));

    this.cameras.main.fadeIn(250, 0x5b, 0xbf, 0x5a);
    this.uiCam.fadeIn(250, 0x5b, 0xbf, 0x5a);

    this.playerJuice = newJuice();
    this.cpuJuice = newJuice();
    this.armedPower = false;

    this.drawField();
    this.rig = new BattingView(this, this.venue.look);
    this.liveView = new LivePlayView(this, {
      pitcherSprite: () => this.pitcherSprite,
      charge: () => ({ active: this.charging, start: this.chargeStart }),
      pin: (o) => this.pinUI(o),
      look: this.venue.look,
    });
    this.drawHud();
    this.drawMiniDiamond();
    if (this.features.juice) this.drawJuiceMeter();
    this.bindSwingInput();
    // Below the count panel so it never sits on the B/S/OUT pips.
    this.pinUI(makeMuteButton(this, GAME_WIDTH - 30, 122));
    this.addPauseButton();
    // The overlay's PLAY button resumes us; re-arm the pause guard.
    const onResume = () => {
      this.pauseRequested = false;
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once('shutdown', () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));

    this.pitcherSprite = this.add.image(MOUND.x, MOUND.y, this.aiPitcher.id).setOrigin(0.5, 1);
    this.pitcherSprite.setScale(KID_SIZE.PITCHER_H / this.pitcherSprite.height);
    idleBob(this, this.pitcherSprite, { amp: 4, dur: 1100 }); // gentle breathing (y); wind-up uses angle
    this.setMoundPitcher(this.aiPitcher);

    this.startHalf();
  }

  // --- Camera choreography -------------------------------------------------

  /**
   * Move a display object (and any container children) onto the UI camera:
   * the main camera stops rendering it, so the gameplay zoom never touches
   * it. Children are routed too — the hit-tester checks them individually.
   */
  private pinUI<T extends Phaser.GameObjects.GameObject>(go: T): T {
    const route = (o: Phaser.GameObjects.GameObject) => {
      o.cameraFilter &= ~this.uiCam.id;
      this.cameras.main.ignore(o);
      const kids = (o as Phaser.GameObjects.Container).list;
      if (kids) kids.forEach(route);
    };
    route(go);
    return go;
  }

  /**
   * 'close' = the behind-home-plate pitch view (the rig: your batter seen
   * from behind, pitcher facing you, ball flying at the camera). 'wide' =
   * the 3/4 field for live plays and baserunning. A hard Backyard-style cut
   * with a white-flash punch — the camera itself never pans or zooms.
   *
   * NOTE: rig actors must refresh on EVERY 'close' call, not just on view
   * changes — the view stays close across batters (strikeout -> next kid).
   */
  private setView(view: 'close' | 'wide'): void {
    if (view === 'close') {
      // The rig's batter is whoever the batting seat's flow family put in the
      // box: the human-batting family owns `batter`, the CPU family `cpuBatter`.
      const humanBatting = this.battingSeat().humanBats;
      const catcher = this.fieldAssignment.find((a) => a.position === 'C');
      this.rig.show({
        batterId: (humanBatting ? this.batter : this.cpuBatter).id,
        pitcherId: this.moundCharId,
        catcherId: catcher?.charId ?? this.moundCharId,
        fielders: this.fieldAssignment.filter((a) => a.position !== 'P' && a.position !== 'C'),
      });
    } else {
      this.rig.hide();
    }
    if (this.viewMode !== view) {
      this.viewMode = view;
      this.cameras.main.flash(PLATE_VIEW.CUT_FLASH_MS, 255, 255, 255);
    }
  }

  // --- Field & HUD ---------------------------------------------------------
  private drawField(): void {
    const W = GAME_WIDTH;
    const HORIZON = 210; // ground starts here; sky/backdrop/fence above
    const look = this.venue.look;

    // Base ground fill (prevents any gaps behind everything else).
    this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, look.grass);

    // --- Sky (gradient) ---
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x8fd0ff, 0x8fd0ff, 0xd4efff, 0xd4efff, 1);
    sky.fillRect(0, 68, W, HORIZON - 68);
    // Sun + soft glow, top-LEFT — the whole game is lit from the upper-left
    // (character cel-shade sits on the right side), so the sun must agree.
    this.add.circle(96, 104, 46, 0xfff2b0, 0.5);
    this.add.circle(96, 104, 30, 0xffe066, 1);
    // A couple of clouds.
    this.cloud(320, 110);
    this.cloud(660, 94);

    if (look.stands) {
      // --- Stands + crowd (the park) ---
      this.add.rectangle(W / 2, 168, W, 44, 0x5b6a7a).setOrigin(0.5);
      const crowdColors = [0xeb5a52, 0x3f86e0, 0x43b56f, 0x9161d0, 0xff924a, 0xf5c542, 0xffffff, 0x2fb4ac];
      for (let i = 0; i < 110; i++) {
        const x = Math.random() * W;
        const y = 150 + Math.random() * 32;
        this.add.circle(x, y, 4 + Math.random() * 2, crowdColors[(Math.random() * crowdColors.length) | 0]);
      }
    } else if (this.venue.id === 'sandlot') {
      // Backyard skyline: a treeline and a couple of neighbor rooftops.
      for (let x = 30; x < W; x += 90) {
        this.add.circle(x, 168 + ((x / 90) % 3) * 8, 34, 0x3f7d3a, 0.9);
      }
      for (const hx of [180, 470, 760]) {
        this.add.rectangle(hx, 178, 90, 46, 0xc9b8a4).setStrokeStyle(3, 0x8a7a66);
        const roof = this.add.graphics({ x: hx, y: 155 });
        roof.fillStyle(0xa14f3c, 1);
        roof.fillTriangle(-55, 0, 55, 0, 0, -30);
        this.add.rectangle(hx - 18, 186, 16, 16, 0x7fb2d8).setStrokeStyle(2, 0x5c7d99);
        this.add.rectangle(hx + 18, 186, 16, 16, 0x7fb2d8).setStrokeStyle(2, 0x5c7d99);
      }
    } else {
      // Blacktop: the school wall behind the court.
      this.add.rectangle(W / 2, 168, W, 44, 0xb0503c).setOrigin(0.5);
      const mortar = this.add.graphics();
      mortar.lineStyle(2, 0x8f3f30, 0.6);
      for (let y = 152; y <= 184; y += 10) mortar.lineBetween(0, y, W, y);
    }

    // --- Outfield fence: a band that follows the venue's fence ARC (rounded,
    // deepest toward center — plus the sandlot's slant), sampled across the
    // screen so a short porch still reads at a glance ---
    const wallY = (x: number) => fenceYAtX(this.geo, x);
    // A band between wallY+topOff and wallY+botOff as one closed sampled strip.
    const wallStrip = (g: Phaser.GameObjects.Graphics, topOff: number, botOff: number) => {
      const pts: Phaser.Geom.Point[] = [];
      const STEP = 32;
      for (let x = 0; x <= W; x += STEP) pts.push(new Phaser.Geom.Point(x, wallY(x) + topOff));
      for (let x = W; x >= 0; x -= STEP) pts.push(new Phaser.Geom.Point(x, wallY(x) + botOff));
      g.fillPoints(pts, true);
    };
    const fence = this.add.graphics();
    fence.fillStyle(look.fence, 1);
    wallStrip(fence, -26, 0);
    fence.fillStyle(look.fenceTrim, 1);
    wallStrip(fence, -32, -26);
    // The fence casts a soft shadow onto the ground in front of it — the
    // contact shadow is what makes it read as a standing wall, not a stripe.
    fence.fillStyle(0x1b2833, 0.18);
    wallStrip(fence, 0, 9);
    // Fence posts: vertical darker slats that give the wall thickness.
    fence.fillStyle(shadeInt(look.fence, 0.25), 1);
    for (let x = 40; x < W; x += 120) {
      fence.fillRect(x - 3, wallY(x) - 32, 6, 32);
    }
    if (this.venue.id === 'sandlot') {
      // Wood-plank verticals.
      const planks = this.add.graphics();
      planks.lineStyle(2, 0x6d4426, 0.7);
      for (let x = 8; x < W; x += 22) {
        const y = wallY(x);
        planks.lineBetween(x, y - 26, x, y);
      }
    } else if (this.venue.id === 'blacktop') {
      // Chain-link diamonds.
      const links = this.add.graphics();
      links.lineStyle(1.5, 0xcfd6db, 0.5);
      for (let x = 0; x < W; x += 16) {
        const yl = wallY(x);
        const yr = wallY(x + 13);
        links.lineBetween(x, yl - 26, x + 13, yr);
        links.lineBetween(x + 13, yr - 26, x, yl);
      }
    } else if (look.stands) {
      // Park bunting triangles hanging off the cap.
      const bunt = [0xeb5a52, 0xffffff, 0x3f86e0];
      for (let x = 20; x < W; x += 60) {
        const pennant = this.add.graphics({ x, y: 193 }).setAlpha(0.9);
        pennant.fillStyle(bunt[Math.floor(x / 60) % bunt.length], 1);
        pennant.fillTriangle(-20, 0, 20, 0, 0, 22);
      }
    }

    // --- Ground texture ---
    if (look.stripes) {
      // Mow stripes as PROJECTED trapezoids — they converge toward the fence
      // with the 3/4 camera, which is what makes the ground read as a plane
      // receding in depth instead of a painted backdrop.
      const stripes = this.add.graphics();
      stripes.fillStyle(look.grassDark, 0.35);
      for (let x = 0; x < W; x += 96) {
        if (((x / 96) & 1) !== 0) continue;
        const tl = project({ x, y: HORIZON });
        const tr = project({ x: x + 96, y: HORIZON });
        stripes.fillPoints(
          [
            new Phaser.Geom.Point(tl.x, HORIZON),
            new Phaser.Geom.Point(tr.x, HORIZON),
            new Phaser.Geom.Point(x + 96, GAME_HEIGHT),
            new Phaser.Geom.Point(x, GAME_HEIGHT),
          ],
          true
        );
      }
    } else if (look.asphalt) {
      // Faded expansion seams + a painted center ring around second base.
      const seams = this.add.graphics();
      seams.lineStyle(2, look.grassDark, 0.7);
      for (let x = 120; x < W; x += 240) seams.lineBetween(x, HORIZON, x, GAME_HEIGHT);
      seams.lineBetween(0, 470, W, 470);
      this.add.circle(SECOND.x, SECOND.y, 45).setStrokeStyle(4, 0xf2e6c9, 0.5);
    } else {
      // Backyard grass: scruffy tufts.
      const tufts = this.add.graphics();
      tufts.lineStyle(2, look.grassDark, 0.8);
      for (let i = 0; i < 70; i++) {
        const x = (i * 137) % W;
        const y = HORIZON + 20 + ((i * 89) % (GAME_HEIGHT - HORIZON - 40));
        tufts.lineBetween(x, y, x - 4, y - 7);
        tufts.lineBetween(x, y, x + 4, y - 7);
      }
    }

    // --- Atmospheric haze: distant things are lighter and cooler. A soft
    // sky-tinted band over the fence + deep outfield pushes the far edge of
    // the world back in space. ---
    const hazeTop = Math.min(wallY(0), wallY(W / 2), wallY(W)) - 32;
    const hazeBot = Math.max(wallY(0), wallY(W / 2), wallY(W)) + 110;
    const haze = this.add.graphics();
    haze.fillGradientStyle(0xdfefff, 0xdfefff, 0xdfefff, 0xdfefff, 0.22, 0.22, 0, 0);
    haze.fillRect(0, hazeTop, W, hazeBot - hazeTop);

    // --- Infield dirt diamond ---
    // NOTE: Phaser polygon points must be 0-based (no negatives) — negative
    // coords get double-shifted by the display origin and land off-field.
    const cx = (FIRST.x + THIRD.x) / 2;
    const cy = (SECOND.y + HOME.y) / 2;
    const toPts = (pts: Vec[]) => pts.map((p) => { const q = project(p); return new Phaser.Geom.Point(q.x, q.y); });
    const dirt = this.add.graphics();
    dirt.fillStyle(look.dirt, 1);
    dirt.lineStyle(3, look.asphalt ? look.grassDark : 0xb87a3f, 1);
    const diamondPts = toPts([
      { x: cx, y: SECOND.y - 24 },
      { x: FIRST.x + 24, y: cy },
      { x: cx, y: HOME.y + 24 },
      { x: THIRD.x - 24, y: cy },
    ]);
    dirt.fillPoints(diamondPts, true);
    dirt.strokePoints(diamondPts, true, true);
    // Ground tilt: far half of the diamond darker, near half catching light.
    dirt.fillStyle(shadeInt(look.dirt, 0.35), 0.16);
    dirt.fillPoints([diamondPts[0], diamondPts[1], diamondPts[3]], true);
    dirt.fillStyle(lightenInt(look.dirt, 0.5), 0.14);
    dirt.fillPoints([diamondPts[3], diamondPts[2], diamondPts[1]], true);
    // Ground "cutout" in the middle of the infield for that manicured look.
    const cut = this.add.graphics();
    cut.fillStyle(look.grass, 1);
    cut.fillPoints(
      toPts([
        { x: cx, y: cy + 6 - 45 },
        { x: cx + 61, y: cy + 6 },
        { x: cx, y: cy + 6 + 45 },
        { x: cx - 61, y: cy + 6 },
      ]),
      true
    );

    // --- Foul lines (home out to where they meet THIS venue's fence) ---
    const leftPole = project(fencePointAt(this.geo, 0));
    const rightPole = project(fencePointAt(this.geo, 1));
    const lines = this.add.graphics();
    lines.lineStyle(4, 0xffffff, 0.85);
    lines.lineBetween(HOME.x, HOME.y, rightPole.x, rightPole.y);
    lines.lineBetween(HOME.x, HOME.y, leftPole.x, leftPole.y);

    // Base paths.
    const paths = this.add.graphics();
    paths.lineStyle(5, 0xe9d9bf, 0.6);
    paths.strokePoints(
      [HOME, FIRST, SECOND, THIRD, HOME].map((p) => { const q = project(p); return new Phaser.Math.Vector2(q.x, q.y); }),
      true
    );

    // --- Pitcher's mound + rubber (a lit dome, not a flat disc) ---
    this.add.ellipse(MOUND.x + 6, MOUND.y + 8, 96, 54, 0x1b2833, 0.14); // cast shadow, down-right
    this.add.ellipse(MOUND.x, MOUND.y + 4, 92, 60, look.dirt).setStrokeStyle(3, look.asphalt ? look.grassDark : 0xb87a3f);
    this.add.ellipse(MOUND.x, MOUND.y + 12, 78, 34, shadeInt(look.dirt, 0.3), 0.3); // shaded near slope
    this.add.ellipse(MOUND.x - 8, MOUND.y - 4, 54, 24, lightenInt(look.dirt, 0.4), 0.45); // lit crown, upper-left
    this.add.rectangle(MOUND.x, MOUND.y, 26, 8, COLORS.white).setStrokeStyle(2, 0x9a9a9a);

    // --- Home plate (pentagon) ---
    this.add
      .polygon(HOME.x, HOME.y + 6, [0, 0, 26, 0, 26, 12, 13, 22, 0, 12], COLORS.white)
      .setStrokeStyle(3, COLORS.ink)
      .setOrigin(0.5);
    // Batter's boxes.
    const box = this.add.graphics();
    box.lineStyle(3, 0xffffff, 0.7);
    box.strokeRect(HOME.x - 58, HOME.y - 20, 26, 52);
    box.strokeRect(HOME.x + 32, HOME.y - 20, 26, 52);

    // --- Base plates (white squares, lit gold when occupied) ---
    [FIRST, SECOND, THIRD].forEach((p, i) => {
      const q = project(p);
      // A flattened diamond, so the bag lies ON the ground plane instead of
      // standing up like a sign. (Points 0-based — see the polygon gotcha.)
      const plate = this.add
        .polygon(q.x, q.y, [14, 0, 28, 9, 14, 18, 0, 9], COLORS.white)
        .setStrokeStyle(3, COLORS.ink)
        .setOrigin(0.5);
      this.baseMarks[i] = plate;
    });

    // --- Venue obstacles (the sandlot oak) — the sim knows they're there ---
    for (const o of this.venue.obstacles) {
      if (o.kind !== 'tree') continue;
      const q = project({ x: o.x, y: o.y });
      const r = o.r * depthScale({ x: o.x, y: o.y });
      this.add.rectangle(q.x, q.y + r - 6, 14, 26, 0x6d4426).setStrokeStyle(3, 0x4e3019).setDepth(23);
      this.add.circle(q.x - r * 0.45, q.y - r * 0.2, r * 0.62, 0x3f7d3a).setDepth(23);
      this.add.circle(q.x + r * 0.45, q.y - r * 0.2, r * 0.62, 0x478940).setDepth(23);
      this.add.circle(q.x, q.y - r * 0.55, r * 0.7, 0x529a49).setDepth(23);
      groundShadow(this, 0, 0, r * 1.4).setPosition(q.x, q.y + r).setDepth(22);
    }
  }

  /** A simple two-lobe cloud. */
  private cloud(x: number, y: number): void {
    this.add.circle(x, y, 20, 0xffffff);
    this.add.circle(x + 24, y + 4, 26, 0xffffff);
    this.add.circle(x + 52, y, 18, 0xffffff);
    this.add.ellipse(x + 26, y + 14, 80, 24, 0xffffff);
  }

  private drawHud(): void {
    // The scoreboard strip: score / inning / labeled B-S-OUT count, all pinned.
    // Team logos + colors label the score panel when identities exist (solo
    // CLASSIC has both; kid mode falls back to YOU/CPU).
    const idA = this.seats[0].identity;
    const idB = this.seats[1].identity;
    const seatLabel = (id: TeamIdentity) => ({
      label: TEAM_LOGOS[id.logo].icon,
      color: UNIFORM_COLORS[id.color].jersey,
    });
    this.scoreboard = createScoreboard(
      this,
      (o) => this.pinUI(o),
      idA && idB ? { away: seatLabel(idA), home: seatLabel(idB) } : undefined
    );

    // Announcer lives in its own band below the HUD so it never sits on a sprite.
    this.announceBg = this.pinUI(
      this.add
        .rectangle(GAME_WIDTH / 2, 108, 640, 62, COLORS.ink, 0.55)
        .setOrigin(0.5)
        .setDepth(90)
        .setAlpha(0)
    );
    this.announce = this.pinUI(
      this.add
        .text(GAME_WIDTH / 2, 108, '', {
          fontFamily: FONT,
          fontSize: '38px',
          color: '#ffffff',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5)
        .setStroke('#14202e', 7)
        .setDepth(91)
    );

    this.batterLabel = this.add
      .text(HOME.x, HOME.y + 34, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#14202e', 5)
      .setDepth(30);

    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreboard.refresh({
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      inning: this.inning,
      innings: this.regulation,
      half: this.half,
      bonus: this.inning > this.regulation,
      balls: this.halfState ? this.halfState.count.balls : 0,
      strikes: this.halfState ? this.halfState.count.strikes : 0,
      outs: this.halfState ? this.halfState.outs : 0,
    });
    for (let i = 0; i < 3; i++) {
      const lit = this.halfState?.bases[i];
      this.baseMarks[i]?.setFillStyle(lit ? COLORS.gold : COLORS.white);
      this.miniBaseDots[i]?.setFillStyle(lit ? COLORS.gold : 0xffffff, lit ? 1 : 0.85);
    }
  }

  /**
   * The corner mini-diamond inset (the Backyard "Steal!" widget): base state
   * at a glance while the batting close-up hides the outfield. Steal chips
   * anchor next to it — see showStealChips(). UI camera, so it never zooms.
   */
  private drawMiniDiamond(): void {
    const c = this.add.container(72, 158).setDepth(92);
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 0.55);
    g.fillRoundedRect(-52, -48, 104, 96, 12);
    // Basepath diamond: home at the bottom, second at the top.
    const pts = [
      new Phaser.Geom.Point(0, 34), // home
      new Phaser.Geom.Point(30, 2), // first
      new Phaser.Geom.Point(0, -30), // second
      new Phaser.Geom.Point(-30, 2), // third
    ];
    g.lineStyle(3, 0xffffff, 0.55);
    g.strokePoints(pts, true, true);
    c.add(g);
    // Home marker + the three base dots (gold when occupied — refreshHud).
    c.add(this.add.circle(0, 34, 4, 0xffffff, 0.9));
    this.miniBaseDots = [pts[1], pts[2], pts[3]].map((p) => {
      const dot = this.add.circle(p.x, p.y, 7, 0xffffff, 0.85).setStrokeStyle(2, COLORS.ink);
      c.add(dot);
      return dot;
    });
    this.pinUI(c);
  }

  // --- Juice meter (main mode) ---------------------------------------------

  /** ⚡ bar under the HUD strip — the player's juice at a glance. */
  private drawJuiceMeter(): void {
    this.pinUI(
      this.add
        .text(22, 78, '⚡', { fontSize: '20px' })
        .setOrigin(0, 0.5)
        .setDepth(90)
    );
    this.juiceGfx = this.pinUI(this.add.graphics().setDepth(90));
    this.refreshJuiceMeter();
  }

  private refreshJuiceMeter(): void {
    const g = this.juiceGfx;
    if (!g) return;
    const p = Phaser.Math.Clamp(this.deviceSeat().juice.value / this.deviceSeat().juice.max, 0, 1);
    const full = canSpend(this.deviceSeat().juice, 'powerSwing');
    g.clear();
    g.fillStyle(COLORS.ink, 0.45);
    g.fillRoundedRect(48, 70, 128, 16, 8);
    if (p > 0.05) {
      g.fillStyle(full ? COLORS.gold : COLORS.white, 1);
      g.fillRoundedRect(51, 73, 122 * p, 10, 5);
    }
  }

  /** Charge a side's meter for a great play. */
  /** Legacy shim: 'player' = seat 0, 'cpu' = seat 1 (bottom family still uses it). */
  private gainJuice(side: 'player' | 'cpu', kind: JuiceEventKind, ability?: Character['ability']): void {
    this.gainJuiceSeat(this.seats[side === 'player' ? 0 : 1], kind, ability);
  }

  private gainJuiceSeat(seat: SeatState, kind: JuiceEventKind, ability?: Character['ability']): void {
    if (!this.features.juice) return;
    const amount = juiceGain(kind, ability ?? 'none');
    // The on-screen meter (and its READY pop) belongs to the device holder.
    if (seat === this.deviceSeat()) {
      const was = canSpend(seat.juice, 'powerSwing');
      seat.juice = addJuice(seat.juice, amount);
      this.refreshJuiceMeter();
      if (!was && canSpend(seat.juice, 'powerSwing')) {
        this.pinUI(floatingText(this, 110, 96, 'JUICE READY! ⚡', COLORS.gold, 22));
      }
    } else {
      seat.juice = addJuice(seat.juice, amount);
    }
  }

  // --- Half-inning orchestration ------------------------------------------
  /**
   * Stale-state hygiene at every half boundary: any timer or one-shot input
   * left over from the previous half must die here, BEFORE the new half
   * schedules anything. In solo these were already cancelled along the normal
   * flow — centralizing them protects the 2P modes, where a half flips which
   * human the timers serve. Pure hardening; no solo behavior change.
   */
  private enterHalf(): void {
    this.pitchAutoPick?.remove(false);
    this.pitchAutoPick = undefined;
    this.autoThrowTimer?.remove(false);
    this.autoThrowTimer = undefined;
    this.charging = false;
    this.liveView.cancelCharge();
    this.pendingThrow = undefined;
    this.pendingDive = false;
  }

  private startHalf(): void {
    this.enterHalf(); // stale-timer hygiene BEFORE anything schedules anew
    this.setView('wide'); // between-halves beat: see the whole yard
    this.halfState = newHalfInning();
    this.clearRunners();
    this.buildDefense();
    this.refreshHud();
    // Route by which flow family serves the batting seat: a human batter runs
    // the batting engine; otherwise the human pitches to the CPU order.
    const begin = () => {
      if (this.battingSeat().humanBats) {
        this.setMoundPitcher(this.fieldingSeat().pitcher!);
        this.flashAnnounce(`Inning ${this.inning}\nYOU'RE UP!`, COLORS.gold);
        if (this.firstPitchOfGame) audio.say('Play ball!', commentatorProfile('A'));
        this.time.delayedCall(FLOW.HALF_START_MS, () => this.nextPlayerBatter());
      } else {
        this.setMoundPitcher(this.playerPitcher);
        this.flashAnnounce('YOU PITCH!\nGET 3 OUTS', COLORS.gold);
        if (this.firstDefenseOfGame) {
          audio.say('You pitch! Throw when the ring closes!', commentatorProfile('B'), 'flush');
          this.firstDefenseOfGame = false;
        }
        this.time.delayedCall(FLOW.HALF_START_MS, () => this.nextCpuBatter());
      }
    };
    if (this.matchType === 'passplay') {
      // Nothing schedules until the right kid holds the device.
      const seat = this.battingSeat();
      showHandoffSplash(this, seat.identity, seat.team[0], begin, (o) => this.pinUI(o));
    } else {
      begin();
    }
  }

  private moundCharId = '';

  /** Put a kid on the mound (the AI's ace in the top, YOUR ace in the bottom). */
  private setMoundPitcher(char: Character): void {
    this.moundCharId = char.id;
    const p = this.pitcherSprite;
    if (!p || p.texture.key === char.id) return;
    p.setTexture(poseKey(char.id, 'stand'));
    p.setScale(KID_SIZE.PITCHER_H / p.height);
  }

  private endHalf(): void {
    this.swingChips?.destroy();
    this.swingChips = undefined;
    this.reliefBtn?.destroy();
    this.reliefBtn = undefined;
    this.reliefOverlay?.destroy();
    this.reliefOverlay = undefined;
    this.spendChips?.destroy();
    this.spendChips = undefined;
    this.rallyCapOn = false; // the rally cap comes off between halves
    this.armedTurbo = false;
    this.armedGlove = false;
    // Home (CPU) already leads after the top of the final inning: their
    // at-bats can't change anything, so the game just ends.
    if (
      this.half === 'top' &&
      shouldSkipBottom(this.inning, this.regulation, this.aiScore, this.playerScore)
    ) {
      this.flashAnnounce('GAME OVER!', COLORS.red, 900);
      this.time.delayedCall(1000, () => this.gameOver());
      return;
    }

    const next = decideAfterHalf(
      this.inning,
      this.half,
      this.regulation,
      this.playerScore,
      this.aiScore,
      MAX_EXTRA_INNINGS
    );
    if (next.done) {
      this.gameOver();
      return;
    }
    this.inning = next.inning;
    this.half = next.half;
    if (next.extra) {
      this.flashAnnounce('TIE GAME!\nBONUS INNING!', COLORS.gold, 1100);
      audio.say('Bonus inning!', commentatorProfile('A'));
      this.time.delayedCall(1300, () => this.startHalf());
    } else {
      this.startHalf();
    }
  }

  private gameOver(): void {
    this.phase = 'ended';
    this.setView('wide'); // the final beat plays out over the whole yard
    if (this.playerScore !== this.aiScore) {
      this.callIt(this.playerScore > this.aiScore ? 'winning' : 'losing', {}, 2);
    }
    // A season game folds into the week before the Result screen shows.
    if (this.seasonGame) {
      const season = getSeason();
      if (season) {
        const result =
          this.playerScore > this.aiScore ? 'W' : this.playerScore < this.aiScore ? 'L' : 'T';
        saveSeason(recordSeasonGame(season, result, this.statEvents));
      }
    }
    this.time.delayedCall(400, () => {
      this.scene.start('Result', {
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        playerTeam: this.playerTeam,
        aiTeam: this.aiTeam,
        seasonGame: this.seasonGame,
        matchType: this.matchType,
        awayIdentity: this.seats[0].identity,
        homeIdentity: this.seats[1].identity,
      });
    });
  }

  // --- Pause ---------------------------------------------------------------

  /** The ⏸ corner button, on the right rail under the mute toggle. */
  private addPauseButton(): void {
    const btn = this.add
      .text(GAME_WIDTH - 30, 168, '⏸', { fontSize: '30px' })
      .setOrigin(0.5)
      .setDepth(500)
      .setInteractive({ useHandCursor: true });
    // stopPropagation: without it the tap falls through to the scene-level
    // pointerdown below and swings/throws mid-pitch.
    btn.on(
      'pointerdown',
      (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation()
    );
    btn.on(
      'pointerup',
      (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.pauseGame();
      }
    );
    this.pinUI(btn);
  }

  /**
   * Freeze everything via scene.pause (update loop, Clock timers, tweens,
   * camera effects, input) and put the Pause overlay on top. The overlay owns
   * resume input while we're frozen — never add a manual-freeze pause path.
   */
  private pauseGame(): void {
    if (this.phase === 'ended') return; // game-over handoff owns the scene
    if (this.pauseRequested) return; // double-tap guard (scene ops are queued)
    this.pauseRequested = true;
    // A held throw-charge would orphan its pointerup while input is paused,
    // making the next unrelated pointerup fire the throw. Cancel it.
    if (this.charging) {
      this.charging = false;
      this.liveView.cancelCharge();
    }
    audio.cancelSpeech(); // the announcer must not talk over the menu
    this.scene.launch('Pause'); // launch before pause: both ops queue in order
    this.scene.pause();
  }

  // --- Player at-bats (interactive) ---------------------------------------
  private nextPlayerBatter(): void {
    if (isHalfOver(this.halfState)) {
      this.endHalf();
      return;
    }
    // The CPU-run defense manages its own bullpen between batters.
    const fielding = this.fieldingSeat();
    if (this.features.fatigue && fielding.plan && cpuWantsRelief(fielding.fatigue)) {
      const tiredArm = fielding.pitcher!;
      const best = fielding.team
        .filter((id) => id !== tiredArm.id)
        .sort((a, b) => getCharacter(b).stats.pitching - getCharacter(a).stats.pitching)[0];
      fielding.plan = swapPositions(fielding.plan, tiredArm.id, best);
      fielding.pitcher = getCharacter(best);
      fielding.fatigue = newFatigue();
      this.buildDefense();
      this.setMoundPitcher(fielding.pitcher);
      this.flashAnnounce(`CPU brings in\n${fielding.pitcher.name}!`, COLORS.white, FLOW.BANNER_HOLD_MS);
    }
    const seat = this.battingSeat();
    this.batter = getCharacter(seat.team[seat.lineupIdx % TEAM_SIZE]);
    this.showBatter(this.batter);
    this.batterLabel.setText(this.batter.name);
    this.kidChat('batterUp', this.batter);
    this.swingType = 'normal'; // the chip choice is per-at-bat
    this.showSwingChips();
    this.showSpendChips();

    if (this.batter.ability === 'calls_shot') {
      this.flashAnnounce('"HOME RUN,\nCALLED IT!"', COLORS.white, 900);
      this.time.delayedCall(950, () => this.throwPitch());
    } else {
      // A beat for the new batter to step in before the wind-up starts.
      this.time.delayedCall(FLOW.NEW_BATTER_MS, () => this.throwPitch());
    }
  }

  private throwPitch(): void {
    // Wind up first, then release. Input is ignored until the ball is live.
    this.phase = 'resolving';
    this.setView('close'); // the batting view: batter + mound fill the screen
    this.pitcherWindup();
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchPitch());
  }

  private pitcherWindup(): void {
    if (this.rig.visible) this.rig.windup(); // the distant rig pitcher coils too
    // Tired-arm tell: sweat flies off the mound as the wind-up starts.
    if (this.features.fatigue) {
      const f = this.fieldingSeat().fatigue;
      if (isTired(f)) {
        const at = this.rig.visible ? this.rig.pitcherAnchor : project(MOUND);
        floatingText(this, at.x + 24, at.y - 60, '💦', COLORS.white, 26);
      }
    }
    const p = this.pitcherSprite;
    if (!p) return;
    // Real wind-up art (arm coiled, knee up) + the lean tween on top.
    if (this.moundCharId) p.setTexture(poseKey(this.moundCharId, 'windup'));
    this.tweens.chain({
      targets: p,
      tweens: [
        { angle: -13, scaleY: p.scaleX * 1.05, duration: ANIM.WINDUP_MS * 0.55, ease: 'Quad.out' },
        { angle: 11, scaleY: p.scaleX * 0.97, duration: ANIM.WINDUP_MS * 0.45, ease: 'Quad.in' },
        { angle: 0, scaleY: p.scaleX, duration: 220, ease: 'Sine.out' },
      ],
      onComplete: () => {
        if (p.active && this.moundCharId) p.setTexture(this.moundCharId);
      },
    });
  }

  private launchPitch(): void {
    if (this.features.pitchSelection) {
      this.launchPitchMain();
      return;
    }
    this.phase = 'pitching';
    this.swung = false;
    this.pitchStart = this.time.now;
    this.firstPitchOfGame = false;
    this.pitchPlan = undefined;
    this.pitchTravelMs = PITCH_TRAVEL_MS;
    // Sometimes the AI throws a WILD one — telegraphed in red, visibly off the
    // plate. Don't swing at those! Taking it earns a ball (4 = walk).
    this.pitchIsWild = rollAiWildPitch(this.fieldingSeat().pitcher!, () => Math.random());
    const wild = this.pitchIsWild;
    // Wild pitches sail visibly off the plate (plate-coord px, past the edge).
    const end = plateToScreen({ x: wild ? (Math.random() < 0.5 ? -60 : 60) : 0, y: 0 });
    const start = this.rig.releasePoint;
    audio.pitchWoosh();

    // Timing ring: a white ring shrinks to meet the gold target ring exactly
    // when the ball reaches the plate — swing when they line up. On a wild
    // pitch the shrink ring turns red: the "let it go" cue.
    if (SHOW_TIMING_RING) {
      const rc = plateToScreen({ x: 0, y: 0 });
      this.ringTarget = this.add
        .circle(rc.x, rc.y, PLATE_VIEW.RING_R)
        .setStrokeStyle(4, COLORS.gold)
        .setDepth(PLATE_VIEW.DEPTH + 4);
      this.ringShrink = this.add
        .circle(rc.x, rc.y, PLATE_VIEW.RING_R)
        .setStrokeStyle(5, wild ? COLORS.red : COLORS.white)
        .setDepth(PLATE_VIEW.DEPTH + 5);
      this.ringShrink.setScale(3.6);
      this.tweens.add({
        targets: this.ringShrink,
        scale: 1,
        duration: PITCH_TRAVEL_MS,
        ease: 'Sine.in',
      });
    }

    // The ball flies AT the camera and grows — no shadow in the head-on view.
    this.ball = this.add
      .circle(start.x, start.y, 10, wild ? 0xffd6d0 : COLORS.white)
      .setDepth(PLATE_VIEW.DEPTH + 8);
    this.ball.setStrokeStyle(2, wild ? COLORS.red : COLORS.ink);

    this.tweens.add({
      targets: this.ball,
      x: end.x,
      y: end.y,
      scale: { from: PLATE_VIEW.BALL.SCALE_FROM, to: PLATE_VIEW.BALL.SCALE_TO },
      duration: PITCH_TRAVEL_MS,
      ease: wild ? 'Sine.inOut' : 'Sine.in',
      onComplete: () => {
        if (!this.swung && this.phase === 'pitching') this.resolvePlayerSwing('miss', true);
      },
    });

    this.startBallTrail();
  }

  /** A faint fading trail behind the inbound ball. */
  private startBallTrail(): void {
    this.trailTimer = this.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => {
        if (!this.ball) return;
        const dot = this.add
          .circle(this.ball.x, this.ball.y, 6 * this.ball.scale, COLORS.white, 0.4)
          .setDepth(PLATE_VIEW.DEPTH + 7);
        this.tweens.add({ targets: dot, alpha: 0, duration: 220, onComplete: () => dot.destroy() });
      },
    });
  }

  /**
   * Main-mode inbound pitch: the CPU picks a kind + spot (pitchkind.ts) and
   * the ball flies a curved path to its ACTUAL crossing point over the drawn
   * strike zone. No red telegraph — reading the zone is the skill. Taking a
   * pitch outside the zone is a ball; chasing one caps the swing.
   */
  private launchPitchMain(): void {
    this.phase = 'pitching';
    this.swung = false;
    this.firstPitchOfGame = false;
    // The CPU arm tires too — same drain, same sag. The ramp sharpens it.
    const moundSeat = this.fieldingSeat();
    if (this.features.fatigue) moundSeat.fatigue = drainPitch(moundSeat.fatigue, null);
    let cpuArm = this.features.fatigue
      ? effectivePitching(moundSeat.pitcher!.stats.pitching, moundSeat.fatigue)
      : moundSeat.pitcher!.stats.pitching;
    cpuArm = rampedArm(cpuArm, this.ramp);
    let plan = chooseCpuPitch(
      cpuArm,
      this.halfState.count,
      PITCH_TRAVEL_MS,
      () => Math.random()
    );
    // A trailing CPU digs into its own juice for the crazy pitch. Never in
    // pass-and-play: the CPU defense must not burn a HUMAN seat's meter.
    if (
      this.features.juice &&
      this.matchType !== 'passplay' &&
      cpuWantsSpend(
        moundSeat.juice,
        'crazyPitch',
        moundSeat.score - this.battingSeat().score,
        () => Math.random(),
        moundSeat.pitcher!.ability
      )
    ) {
      moundSeat.juice = spend(moundSeat.juice, 'crazyPitch', moundSeat.pitcher!.ability);
      if (this.features.fatigue) moundSeat.fatigue = drainPitch(moundSeat.fatigue, 'crazy');
      plan = resolvePitchLocation(
        'crazy',
        plan.target,
        cpuArm,
        60,
        PITCH_TRAVEL_MS,
        () => Math.random()
      );
      floatingText(this, this.pitchCalloutPos().x, this.pitchCalloutPos().y, '⚡ CRAZY PITCH!', COLORS.red, 26);
      crazyPitchFx(this, this.pitchCalloutPos().x, this.pitchCalloutPos().y);
      this.callIt('crazyPitch', {}, 2);
    }
    this.pitchPlan = plan;
    this.pitchIsWild = !plan.inZone; // reuses the take-a-ball / capped-chase rules
    this.pitchTravelMs = plan.travelMs;
    this.pitchStart = this.time.now;
    audio.pitchWoosh();

    this.zoneGfx = zoneOutline(this);
    const start = this.rig.releasePoint;
    const end = plateToScreen(plan.actual);
    const bendScale = PLATE_VIEW.ZONE.SCALE; // flight bend is plate-coord px

    if (SHOW_TIMING_RING) {
      this.ringTarget = this.add
        .circle(end.x, end.y, PLATE_VIEW.RING_R)
        .setStrokeStyle(4, COLORS.gold)
        .setDepth(PLATE_VIEW.DEPTH + 4);
      this.ringShrink = this.add
        .circle(end.x, end.y, PLATE_VIEW.RING_R)
        .setStrokeStyle(5, COLORS.white)
        .setDepth(PLATE_VIEW.DEPTH + 5);
      this.ringShrink.setScale(3.6);
      this.tweens.add({ targets: this.ringShrink, scale: 1, duration: plan.travelMs, ease: 'Sine.in' });
    }

    const ball = this.add.circle(start.x, start.y, 10, COLORS.white).setDepth(PLATE_VIEW.DEPTH + 8);
    ball.setStrokeStyle(2, COLORS.ink);
    this.ball = ball;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: plan.travelMs,
      ease: 'Sine.in',
      onUpdate: (tw) => {
        if (this.ball !== ball) return;
        const t = tw.getValue() ?? 0;
        const bend = ballCurveAt(plan, t);
        ball.setPosition(
          start.x + (end.x - start.x) * t + bend.x * bendScale,
          start.y + (end.y - start.y) * t + bend.y * bendScale
        );
        ball.setScale(
          PLATE_VIEW.BALL.SCALE_FROM + t * (PLATE_VIEW.BALL.SCALE_TO - PLATE_VIEW.BALL.SCALE_FROM)
        );
      },
      onComplete: () => {
        if (!this.swung && this.phase === 'pitching') this.resolvePlayerSwing('miss', true);
      },
    });
    this.startBallTrail();
    if (this.features.battingCursor) this.showSwingCursor();
    if (this.features.steals) this.showStealChips();
    if (this.features.juice) this.showPowerButton();
  }

  /**
   * 🛡/🏏/💪/🤏 swing-type chips (CLASSIC batting): a vertical icon stack on
   * the left edge. Sticky for the at-bat, reset to normal for each batter.
   * Chips stopPropagation — a chip tap must never double as a swing.
   */
  private showSwingChips(): void {
    this.swingChips?.destroy();
    this.swingChips = undefined;
    if (!this.features.swingChoice || !this.battingSeat().humanBats) return;
    const defs: Array<{ t: SwingType; icon: string }> = [
      { t: 'safe', icon: '🛡' },
      { t: 'normal', icon: '🏏' },
      { t: 'big', icon: '💪' },
      { t: 'bunt', icon: '🤏' },
    ];
    const root = this.add.container(0, 0).setDepth(94);
    defs.forEach((d, i) => {
      const y = GAME_HEIGHT - 118 - (defs.length - 1 - i) * 54;
      const selected = this.swingType === d.t;
      const { container } = pill(this, 44, y, d.icon, {
        fill: selected ? COLORS.gold : COLORS.cream,
        fontSize: 22,
        minW: 58,
      });
      container.setAlpha(selected ? 1 : 0.75);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-32, -22, 64, 44),
        Phaser.Geom.Rectangle.Contains
      );
      container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (this.swingType === d.t) return;
        this.swingType = d.t;
        audio.pop();
        this.showSwingChips(); // restyle
      });
      root.add(container);
    });
    this.pinUI(root);
    this.swingChips = root;
  }

  /**
   * 🥵 relief chip: appears with the pitch-select UI once your arm is gassed.
   * Tapping it opens a portrait picker; the new kid takes the mound fresh and
   * trades positions with the old pitcher (the lineup plan stays valid).
   */
  private showReliefButton(): void {
    this.reliefBtn?.destroy();
    this.reliefBtn = undefined;
    if (!this.features.fatigue || !this.playerPlan || !isTired(this.playerFatigue)) return;
    const { container } = pill(this, 116, GAME_HEIGHT - 96, '🥵 NEW PITCHER', {
      fill: COLORS.red,
      fontSize: 17,
      minW: 170,
    });
    container.setDepth(94);
    this.pinUI(container);
    container.setInteractive(new Phaser.Geom.Rectangle(-90, -18, 180, 36), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.showReliefPicker();
    });
    this.tweens.add({ targets: container, scale: 1.06, duration: 380, yoyo: true, repeat: -1 });
    this.reliefBtn = container;
  }

  /** The bullpen: eight portraits; tap one and they jog to the mound fresh. */
  private showReliefPicker(): void {
    if (this.reliefOverlay) return;
    this.pitchAutoPick?.remove(false);
    this.pitchAutoPick = undefined;
    this.pitchSelect?.destroy();
    this.pitchSelect = undefined;
    const root = this.add.container(0, 0).setDepth(96);
    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.ink, 0.55)
      .setInteractive(); // swallow taps behind the picker
    root.add(dim);
    const candidates = this.playerTeam.filter((id) => id !== this.playerPitcher.id);
    candidates.forEach((id, i) => {
      const x = GAME_WIDTH / 2 + (i % 4) * 130 - 195;
      const y = GAME_HEIGHT / 2 + Math.floor(i / 4) * 150 - 70;
      const chip = this.add.container(x, y);
      const bg = this.add.circle(0, 0, 44, COLORS.cream).setStrokeStyle(4, COLORS.ink, 0.9);
      const img = this.add.image(0, 4, id).setOrigin(0.5, 0.55);
      img.setScale(74 / img.height);
      const arm = getCharacter(id).stats.pitching;
      const tag = this.add
        .text(0, 52, '⚾'.repeat(Math.max(1, Math.round(arm / 3))), { fontSize: '14px' })
        .setOrigin(0.5);
      chip.add([bg, img, tag]);
      chip.setInteractive(new Phaser.Geom.Rectangle(-48, -48, 96, 112), Phaser.Geom.Rectangle.Contains);
      chip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.doRelief(id);
      });
      root.add(chip);
    });
    this.pinUI(root);
    this.reliefOverlay = root;
  }

  private doRelief(id: string): void {
    this.reliefOverlay?.destroy();
    this.reliefOverlay = undefined;
    this.reliefBtn?.destroy();
    this.reliefBtn = undefined;
    const newPitcher = getCharacter(id);
    if (this.playerPlan) this.playerPlan = swapPositions(this.playerPlan, this.playerPitcher.id, id);
    this.playerPitcher = newPitcher;
    this.playerFatigue = newFatigue();
    this.buildDefense();
    this.setMoundPitcher(newPitcher);
    audio.cheer();
    this.flashAnnounce(`${newPitcher.name}\nTAKES THE MOUND!`, COLORS.gold, FLOW.BANNER_HOLD_MS);
    this.time.delayedCall(FLOW.BANNER_HOLD_MS, () => this.beginPitchTurn());
  }

  /**
   * The newer juice spends, one chip each above the power button: batting
   * shows 💨 TURBO (next play's runners) + 🧢 RALLY (this half's swings);
   * defense shows 🧤 GLOVE (next play error-proof). Armed = gold + pulsing.
   */
  private showSpendChips(): void {
    this.spendChips?.destroy();
    this.spendChips = undefined;
    if (!this.features.juice) return;
    // Batting chips vs pitching chips follow the human's ROLE this half (and
    // so does the y-offset — the pitching stack sits above the relief chip).
    const humanBatting = this.battingSeat().humanBats;
    const defs: Array<{ kind: 'turboLegs' | 'goldenGlove' | 'rallyCap'; label: string; armed: boolean; arm: () => void }> =
      humanBatting
        ? [
            { kind: 'turboLegs', label: '💨 TURBO', armed: this.armedTurbo, arm: () => (this.armedTurbo = true) },
            { kind: 'rallyCap', label: '🧢 RALLY', armed: this.rallyCapOn, arm: () => (this.rallyCapOn = true) },
          ]
        : [{ kind: 'goldenGlove', label: '🧤 GLOVE', armed: this.armedGlove, arm: () => (this.armedGlove = true) }];
    const root = this.add.container(0, 0).setDepth(94);
    let row = 0;
    for (const d of defs) {
      if (!d.armed && !canSpend(this.deviceSeat().juice, d.kind)) continue;
      const y = GAME_HEIGHT - (humanBatting ? 96 : 148) - row * 46;
      row += 1;
      const { container } = pill(this, 116, y, d.armed ? `${d.label}!` : d.label, {
        fill: d.armed ? COLORS.gold : COLORS.cream,
        fontSize: 16,
        minW: 150,
      });
      if (d.armed) {
        this.tweens.add({ targets: container, scale: 1.06, duration: 340, yoyo: true, repeat: -1 });
      } else {
        container.setInteractive(new Phaser.Geom.Rectangle(-80, -17, 160, 34), Phaser.Geom.Rectangle.Contains);
        container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          if (!canSpend(this.deviceSeat().juice, d.kind)) return;
          this.deviceSeat().juice = spend(this.deviceSeat().juice, d.kind);
          d.arm();
          this.refreshJuiceMeter();
          audio.pop();
          const hue = d.kind === 'turboLegs' ? 0x4aa5e0 : d.kind === 'goldenGlove' ? 0x3fae6b : COLORS.red;
          powerSwingFx(this, PLATE_VIEW.ZONE.CX, PLATE_VIEW.ZONE.CY, hue);
          this.showSpendChips(); // restyle as armed
        });
      }
      root.add(container);
    }
    this.pinUI(root);
    this.spendChips = root;
  }

  /** 💥 POWER SWING button, shown while the meter can afford it. */
  private showPowerButton(): void {
    this.powerBtn?.destroy();
    this.powerBtn = undefined;
    if (!this.armedPower && !canSpend(this.deviceSeat().juice, 'powerSwing')) return;
    const { container } = pill(
      this,
      116,
      GAME_HEIGHT - 42,
      this.armedPower ? '💥 POWERED UP!' : '💥 POWER SWING',
      { fill: this.armedPower ? COLORS.gold : COLORS.cream, fontSize: 18, minW: 170 }
    );
    container.setDepth(94);
    this.pinUI(container);
    if (!this.armedPower) {
      container.setInteractive(new Phaser.Geom.Rectangle(-90, -18, 180, 36), Phaser.Geom.Rectangle.Contains);
      container.on('pointerdown', () => {
        if (this.armedPower || !canSpend(this.deviceSeat().juice, 'powerSwing')) return;
        this.deviceSeat().juice = spend(this.deviceSeat().juice, 'powerSwing');
        this.armedPower = true;
        this.refreshJuiceMeter();
        audio.pop();
        powerSwingFx(this, PLATE_VIEW.ZONE.CX, PLATE_VIEW.ZONE.CY);
        this.showPowerButton(); // restyle as armed
      });
    } else {
      this.tweens.add({ targets: container, scale: 1.07, duration: 300, yoyo: true, repeat: -1 });
    }
    this.powerBtn = container;
  }

  /**
   * 💨 STEAL! chips for runners with an open base ahead. They anchor next to
   * the mini-diamond inset (NOT the world bases — the behind-plate rig hides
   * the whole field), Backyard-style: the inset IS the steal UI.
   */
  private showStealChips(): void {
    this.stealChips.forEach((c) => c.destroy());
    this.stealChips = [];
    this.armedSteal = undefined;
    for (const fromBase of [1, 2] as const) {
      if (!this.runners.has(fromBase) || this.runners.has(fromBase + 1)) continue;
      const { container } = pill(
        this,
        212,
        fromBase === 1 ? 176 : 136,
        fromBase === 1 ? '💨 STEAL 2ND!' : '💨 STEAL 3RD!',
        {
          fill: COLORS.cream,
          fontSize: 16,
          minW: 136,
        }
      );
      container.setDepth(93).setAlpha(0.92);
      this.pinUI(container);
      container.setInteractive(new Phaser.Geom.Rectangle(-70, -17, 140, 34), Phaser.Geom.Rectangle.Contains);
      container.on('pointerdown', () => {
        this.armedSteal = fromBase;
        audio.pop();
        // Highlight the armed chip; dim any other.
        for (const c of this.stealChips) c.setAlpha(0.4);
        container.setAlpha(1).setScale(1.12);
        // A little lead-off toward the next bag sells the intent.
        const token = this.runners.get(fromBase);
        if (token) {
          const next = project(basePos(fromBase + 1));
          const len = Math.max(1, dist({ x: token.x, y: token.y }, next));
          this.tweens.add({
            targets: token,
            x: token.x + ((next.x - token.x) / len) * 18,
            y: token.y + ((next.y - token.y) / len) * 18,
            duration: 180,
          });
        }
      });
      this.stealChips.push(container);
    }
  }

  /** The aim reticle: sweet-spot ring + faint contact ring, pointer-driven.
   *  Radii are plate-coord px, scaled up by the frontal zone mapping. */
  private showSwingCursor(): void {
    this.swingCursor?.destroy();
    const s = PLATE_VIEW.ZONE.SCALE;
    const c = this.add.container(0, 0).setDepth(PLATE_VIEW.DEPTH + 6);
    const outer = this.add.circle(0, 0, CURSOR.CONTACT_R * s).setStrokeStyle(2, COLORS.white, 0.35);
    const inner = this.add.circle(0, 0, CURSOR.SWEET_R * s).setStrokeStyle(4, COLORS.gold, 0.95);
    const dot = this.add.circle(0, 0, 4, COLORS.gold, 0.9);
    c.add([outer, inner, dot]);
    this.swingCursor = c;
    this.positionSwingCursor();
  }

  /** Pointer -> plate coords on the frontal zone, clamped to the roam window.
   *  RAW screen coords on purpose: the rig ignores the 3/4 projection. */
  private cursorPlate(): PlateLoc {
    return clampToCursorRange(screenToPlate(this.lastScreenPointer));
  }

  /** Where mound-side callouts (pitch bands, ⚡ CRAZY) float: over the rig's
   *  distant pitcher while the plate view is up, over the world mound after. */
  private pitchCalloutPos(): Vec {
    if (this.rig.visible) {
      const a = this.rig.pitcherAnchor;
      return { x: a.x, y: a.y - PLATE_VIEW.PITCHER.H - 16 };
    }
    return { x: MOUND.x, y: MOUND.y - 90 };
  }

  private positionSwingCursor(): void {
    if (!this.swingCursor) return;
    const p = plateToScreen(this.cursorPlate());
    this.swingCursor.setPosition(p.x, p.y);
  }

  private clearPitchVisuals(): void {
    this.trailTimer?.remove();
    this.trailTimer = undefined;
    this.ball?.destroy();
    this.ball = undefined;
    this.ballShadow?.destroy();
    this.ballShadow = undefined;
    this.ringShrink?.destroy();
    this.ringShrink = undefined;
    this.ringTarget?.destroy();
    this.ringTarget = undefined;
    this.zoneGfx?.destroy();
    this.zoneGfx = undefined;
    this.swingCursor?.destroy();
    this.swingCursor = undefined;
    this.stealChips.forEach((c) => c.destroy());
    this.stealChips = [];
    this.powerBtn?.destroy();
    this.powerBtn = undefined;
  }

  private onSwing(): void {
    if (this.phase !== 'pitching' || this.swung) return;
    this.swung = true;
    const error = this.time.now - this.pitchStart - this.pitchTravelMs;
    if (this.features.battingCursor && this.pitchPlan) {
      this.resolvePlayerSwingAimed(error, this.cursorPlate());
      return;
    }
    const band = bandFromError(error);
    this.resolvePlayerSwing(band, false);
  }

  /** Public headless hook (main mode): swing with the cursor at `cursor`. */
  resolvePlayerSwingAimed(errorMs: number, cursor: PlateLoc): void {
    const plan = this.pitchPlan!;
    this.phase = 'resolving';
    this.swung = true;
    this.clearPitchVisuals();
    this.animateSwing();

    const powered = this.armedPower;
    this.armedPower = false;
    // Rally cap: the whole bench believes — every swing window widens.
    let timing = timingForSwing(getSwingTiming(this.mode), this.swingType);
    if (this.rallyCapOn) {
      const f = JUICE.RALLY_FORGIVE_MS;
      timing = { PERFECT: timing.PERFECT + f * 0.5, GOOD: timing.GOOD + f, CONTACT: timing.CONTACT + f };
    }
    const { swing, band } = resolveContactAimed({
      band: bandFromError(errorMs, timing),
      errorMs,
      cursor,
      plan,
      batter: this.batter,
      pitcher: this.fieldingSeat().pitcher!,
      rng: () => Math.random(),
      boost: { power: powered },
      swingType: this.swingType,
      geo: this.geo,
    });
    this.showBandFeedback(band);
    if (band === 'perfect') this.gainJuiceSeat(this.battingSeat(), 'perfectSwing', this.batter.ability);

    if (swing.kind !== 'inPlay') {
      if (swing.kind === 'strike') audio.whiff();
      else audio.crack();
      this.applyAndContinue({ kind: swing.kind, bases: 0, description: swing.description });
      return;
    }
    audio.crack();
    if (swing.launch.homer) {
      this.hitPause(() => {
        this.flyHitBall();
        screenShake(this, SHAKE.homer);
        this.gainJuiceSeat(this.battingSeat(), 'homer', this.batter.ability);
        if (powered && this.batter.ability === 'calls_shot') this.callIt('calledShot', {}, 2);
        else this.callIt('homer', { name: this.batter.name }, 2);
        this.applyAndContinue({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      });
      return;
    }
    this.hitPause(() => {
      screenShake(this, SHAKE.single);
      this.beginLivePlay('offense', swing.launch);
    });
  }

  private resolvePlayerSwing(band: SwingBand, took: boolean): void {
    this.phase = 'resolving';
    this.clearPitchVisuals();

    if (took) {
      if (this.pitchIsWild) {
        // Good eye! Letting a wild one go is a ball.
        this.scoreboard.umpCall('BALL!', BALL_GREEN);
        this.applyAndContinue({ kind: 'ball', bases: 0, description: 'Ball! Good eye!' });
      } else {
        this.scoreboard.umpCall('STRIKE!', COLORS.red);
        this.applyAndContinue({ kind: 'strike', bases: 0, description: 'Strike! (took it)' });
      }
      return;
    }

    // Chasing a wild pitch caps the swing — the telegraph is the lesson.
    if (this.pitchIsWild) band = wildSwingBand(band);

    this.animateSwing();
    this.showBandFeedback(band);

    const outcome = resolveContact(band, this.batter, this.fieldingSeat().pitcher!, () => Math.random(), this.geo);
    if (outcome.kind !== 'inPlay') {
      if (outcome.kind === 'strike') audio.whiff();
      else audio.crack();
      this.applyAndContinue({ kind: outcome.kind, bases: 0, description: outcome.description });
      return;
    }
    // Contact! Homers keep the classic celebration; everything else goes live.
    audio.crack();
    if (outcome.launch.homer) {
      this.hitPause(() => {
        this.flyHitBall();
        screenShake(this, SHAKE.homer);
        this.applyAndContinue({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      });
      return;
    }
    this.hitPause(() => {
      screenShake(this, SHAKE.single);
      this.beginLivePlay('offense', outcome.launch);
    });
  }

  private applyAndContinue(result: AtBatResult): void {
    const prevBatter = this.batter;
    const seat = this.battingSeat();
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    // Batting practice: outs never stick, so the half never ends.
    if (this.practice) this.halfState = { ...this.halfState, outs: 0 };
    if (applied.runsScored > 0) seat.score += applied.runsScored;

    const walked = result.kind === 'ball' && applied.batterDone;
    // The defending pitcher charges off striking this batter out.
    if (result.kind === 'strike' && applied.batterOut) {
      this.gainJuiceSeat(this.fieldingSeat(), 'strikeoutThrown');
      this.callIt('strikeoutSwinging', { name: prevBatter.name });
    }
    // Season stat feed: a completed non-walk AB, and homers. (Runs on live
    // plays arrive via the 'score' event; a homer's runs are known right
    // here — batter + everyone who was aboard.)
    if (this.seasonGame && seat.recordsStats && applied.batterDone && !walked) {
      seat.stats.push({ t: 'atBat', kid: prevBatter.id });
      if (result.kind === 'hit') {
        seat.stats.push({ t: 'hit', kid: prevBatter.id, homer: result.bases >= 4 });
        if (result.bases >= 4) {
          seat.stats.push({ t: 'run', kid: prevBatter.id });
          for (const token of this.runners.values()) {
            seat.stats.push({ t: 'run', kid: token.getData('id') as string });
          }
        }
      }
    }

    // An armed steal races the catcher on a strike or a (non-walk) ball;
    // fouls and balls-four are dead — the runner scampers back.
    if (this.armedSteal !== undefined && this.features.steals) {
      const from = this.armedSteal;
      this.armedSteal = undefined;
      const token = this.runners.get(from);
      const liveOnPitch =
        (result.kind === 'strike' || (result.kind === 'ball' && !walked)) &&
        !isHalfOver(this.halfState);
      if (token && liveOnPitch) {
        this.setView('wide'); // the race is at the bases
        const runner = getCharacter(token.getData('id') as string);
        const catcher = getCharacter(this.fieldAssignment.find((a) => a.position === 'C')!.charId);
        const safe = rollSteal(
          {
            runnerSpeed: runner.stats.speed,
            catcherArm: catcher.stats.pitching,
            pitchKind: this.pitchPlan?.kind ?? null,
          },
          () => Math.random()
        );
        this.halfState = applySteal(this.halfState, from, safe).state;
        this.animateSteal(from, token, safe);
      } else if (token) {
        // Dead ball — sneak back to the bag.
        const p = project(basePos(from));
        this.tweens.add({ targets: token, x: p.x, y: p.y - 6, duration: 220 });
      }
    }

    // Baserunning animation, driven by the reducer's movement list (hit or walk).
    let runDelay = 0;
    if (applied.movements.length > 0) {
      this.setView('wide'); // runners moving — show the bases
      runDelay = this.animateBaserunning(applied.movements, prevBatter);
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) {
      audio.cheer();
      if (result.bases >= 4 && this.mode === 'kid') this.callIt('homer', { name: prevBatter.name }, 2);
    }
    if (walked) this.callIt('walk', {}, 2);

    const color =
      result.kind === 'hit'
        ? COLORS.gold
        : result.kind === 'ball'
          ? BALL_GREEN
          : result.kind === 'foul'
            ? COLORS.white
            : COLORS.red;
    if (result.kind === 'foul') this.scoreboard.umpCall('FOUL!', COLORS.white);
    const struckOut = result.kind === 'strike' && applied.batterOut;
    // The K'd kid turns to the camera and slumps.
    if (struckOut) this.rig.reactBatter('upset', ANIM.REACT_HOLD_MS);
    let msg = walked ? 'WALK!' : struckOut ? 'STRIKEOUT!' : result.description;
    if (applied.runsScored > 0)
      msg += `\n+${applied.runsScored} RUN${applied.runsScored > 1 ? 'S' : ''}!`;
    const big = walked || struckOut || applied.runsScored > 0;
    this.flashAnnounce(msg, color, big ? FLOW.BIG_BANNER_HOLD_MS : FLOW.BANNER_HOLD_MS);
    this.refreshHud();

    // The invariant: whatever banner is up must finish before the next beat.
    const floor = big ? FLOW.BIG_BANNER_HOLD_MS : FLOW.BETWEEN_PITCH_MS;
    const baseDelay =
      applied.movements.length > 0
        ? Math.max(FLOW.AFTER_PLAY_MS, floor, runDelay + FLOW.RUN_SETTLE_PAD_MS)
        : floor;
    this.time.delayedCall(baseDelay, () => {
      if (applied.batterDone) seat.lineupIdx += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (applied.batterDone) {
        this.nextPlayerBatter();
      } else {
        this.throwPitch();
      }
    });
  }

  /** Sprint the stealing runner to the next bag (or fade them on the out). */
  private animateSteal(
    from: 1 | 2,
    token: Phaser.GameObjects.Container,
    safe: boolean,
    cpuRunner = false
  ): void {
    this.runners.delete(from);
    const to = project(basePos(from + 1));
    const img = token.getAt(1) as Phaser.GameObjects.Image;
    const cycle = runCycle(this, img, token.getData('id') as string);
    img.setFlipX(to.x < token.x);
    this.tweens.add({
      targets: token,
      x: to.x,
      y: to.y - 6,
      duration: 380,
      ease: 'Sine.in',
      onComplete: () => {
        cycle.stop(true);
        img.setFlipX(false);
        // Color/SFX read from the PLAYER's point of view.
        if (safe) {
          floatingText(this, to.x, to.y - 50, 'STOLE IT!', cpuRunner ? COLORS.red : COLORS.gold, 28);
          this.tweens.add({ targets: img, scaleY: img.scaleY * 0.85, yoyo: true, duration: 90 });
          this.runners.set(from + 1, token);
          this.gainJuice(cpuRunner ? 'cpu' : 'player', 'steal');
          this.callIt('stealSafe', { name: getCharacter(token.getData('id') as string).name });
          if (cpuRunner) audio.whiff();
          else audio.cheer();
        } else {
          floatingText(this, to.x, to.y - 50, cpuRunner ? 'GOT HIM!' : 'CAUGHT!', cpuRunner ? COLORS.gold : COLORS.red, 28);
          this.callIt('stealCaught', {});
          screenShake(this, 3);
          if (cpuRunner) audio.cheer();
          else audio.whiff();
          this.tweens.add({
            targets: token,
            alpha: 0,
            y: token.y - 10,
            duration: 320,
            delay: 150,
            onComplete: () => token.destroy(),
          });
        }
        this.refreshHud();
      },
    });
  }

  // --- Animated baserunning -----------------------------------------------
  /** Move the kids around the bases per the reducer's movements. Returns the duration. */
  private animateBaserunning(movements: RunnerMove[], batter: Character): number {
    const next = new Map<number, Phaser.GameObjects.Container>();
    let maxBases = 0;

    for (const m of movements) {
      maxBases = Math.max(maxBases, m.toBase - m.fromBase);
      // The batter (fromBase 0) gets a fresh runner at home; others already exist.
      let token = m.fromBase === 0 ? this.makeRunner(batter) : this.runners.get(m.fromBase);
      if (!token) token = this.makeRunner(batter); // safety
      this.runners.delete(m.fromBase);
      const img = token.getAt(1) as Phaser.GameObjects.Image; // [0]=shadow, [1]=kid
      const runnerId = token.getData('id') as string;

      // Each leg flips the sprite to face its direction of travel.
      const legs: Array<{
        x: number;
        y: number;
        duration: number;
        ease: string;
        onStart?: () => void;
      }> = [];
      let fromP = project(basePos(m.fromBase));
      for (let b = m.fromBase + 1; b <= m.toBase; b++) {
        const p = project(basePos(b));
        const facesLeft = p.x < fromP.x;
        legs.push({
          x: p.x,
          y: p.y,
          duration: RUNNER_TWEEN_MS,
          ease: 'Sine.inOut',
          onStart: () => img.setFlipX(facesLeft),
        });
        fromP = p;
      }

      const scored = m.toBase >= 4;
      if (legs.length > 0) {
        // Real run frames + a small bob while the container travels.
        const cycle = runCycle(this, img, runnerId);
        const bounce = this.tweens.add({
          targets: img,
          y: -3,
          duration: RUNNER_TWEEN_MS / 2,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        this.tweens.chain({
          targets: token,
          tweens: legs,
          onComplete: () => {
            cycle.stop(true);
            bounce.stop();
            img.y = 0;
            img.setFlipX(false);
            if (scored) {
              squashHop(this, img, { height: 20 });
              burst(this, HOME.x, HOME.y - 20, COLORS.gold, 14);
              this.time.delayedCall(520, () => token!.destroy());
            } else {
              this.tweens.add({ targets: img, scaleY: img.scaleY * 0.85, yoyo: true, duration: 90 });
            }
          },
        });
      }
      if (!scored) next.set(m.toBase, token);
    }

    this.runners = next;
    return maxBases * RUNNER_TWEEN_MS;
  }

  /** A baserunner = the actual kid (over a ground shadow), in a container. */
  private makeRunner(char: Character): Phaser.GameObjects.Container {
    const c = this.add.container(HOME.x, HOME.y - 6).setDepth(40);
    const shadow = groundShadow(this, 0, 4, 42);
    const img = this.add.image(0, 0, poseKey(char.id, 'stand')).setOrigin(0.5, 0.92);
    img.setScale(RUNNER_H / img.height);
    c.add([shadow, img]);
    c.setData('id', char.id);
    return c;
  }

  private clearRunners(): void {
    this.runners.forEach((t) => t.destroy());
    this.runners.clear();
  }

  /** Arc the hit ball out toward the outfield; distance scales with the hit. */
  /**
   * The contact frame: hold the rig for a beat at bat-meets-ball with a white
   * pop, THEN run the cut/celebration. Never pauses the sim clock — the live
   * play (or homer flight) simply starts a beat later.
   */
  private hitPause(then: () => void): void {
    const ms = PLATE_VIEW.HIT_PAUSE_MS;
    if (ms <= 0 || this.viewMode !== 'close') {
      then();
      return;
    }
    this.cameras.main.flash(ms + 50, 255, 255, 255);
    this.time.delayedCall(ms, then);
  }

  /** The classic homer celebration: cut wide, run the full Spectacle show. */
  private flyHitBall(): void {
    this.setView('wide'); // watch it go
    homerSpectacle(
      this,
      { x: HOME.x, y: HOME.y - 26 },
      { x: 360 + Math.random() * 240, y: -70 }
    );
  }

  // --- Live plays: interactive fielding & baserunning ----------------------

  /**
   * Decide who stands where for this half (index 0 = the pitcher), then hand
   * the assignment to the view to stand the nine kids up.
   */
  private buildDefense(): void {
    const defendingIds = this.fieldingSeat().team;
    const pitcher = this.fieldingSeat().pitcher!;
    const plan = this.fieldingSeat().plan;
    if (plan) {
      // The lineup plan says exactly who stands where.
      const byPos = new Map<PositionId, string>();
      for (const [id, pos] of Object.entries(plan.positions)) byPos.set(pos, id);
      this.fieldAssignment = [
        { position: 'P' as PositionId, charId: byPos.get('P') ?? pitcher.id },
        ...POSITION_ORDER.map((position) => ({
          position,
          charId: byPos.get(position) ?? defendingIds[0],
        })),
      ];
    } else {
      const others = defendingIds.filter((id) => id !== pitcher.id);
      this.fieldAssignment = [
        { position: 'P' as PositionId, charId: pitcher.id },
        ...POSITION_ORDER.map((position, i) => ({ position, charId: others[i % others.length] })),
      ];
    }

    this.liveView.buildDefense(this.fieldAssignment);
  }

  /** Contact! Hand the play to the sim and switch input modes. */
  private beginLivePlay(mode: 'defense' | 'offense', launch: Launch): void {
    const batterChar = mode === 'offense' ? this.batter : this.cpuBatter;
    const baseRunners: Array<{ base: 1 | 2 | 3; charId: string; speed: number }> = [];
    for (const [base, token] of this.runners) {
      const id = token.getData('id') as string;
      baseRunners.push({ base: base as 1 | 2 | 3, charId: id, speed: getCharacter(id).stats.speed });
    }

    // Armed juice spends modify THIS play's params only.
    let params = this.liveParams;
    if (mode === 'offense' && this.armedTurbo) {
      this.armedTurbo = false;
      params = { ...params, playerRunSpeed: params.playerRunSpeed * JUICE.TURBO_SPEED_MULT };
      floatingText(this, HOME.x, HOME.y - 80, '💨 TURBO LEGS!', COLORS.gold, 30);
    }
    if (mode === 'defense' && this.armedGlove) {
      this.armedGlove = false;
      params = {
        ...params,
        playerErrorMult: 0,
        assistBlend: JUICE.GLOVE_BLEND,
        catchRadius: params.catchRadius + JUICE.GLOVE_REACH_BONUS,
        pickupRadius: params.pickupRadius + JUICE.GLOVE_REACH_BONUS,
      };
      floatingText(this, HOME.x, HOME.y - 80, '🧤 GOLDEN GLOVE!', COLORS.gold, 30);
    }
    this.activeLiveParams = params;

    this.livePlay = startLivePlay({
      mode,
      launch,
      batter: { charId: batterChar.id, speed: batterChar.stats.speed },
      baseRunners,
      // Each kid fields with their own legs, glove, and arm.
      defense: this.fieldAssignment.map((a) => {
        const c = getCharacter(a.charId);
        return { ...a, speed: c.stats.speed, glove: c.stats.fielding, arm: c.stats.pitching };
      }),
      outs: this.halfState.outs,
      params,
      geo: this.geo,
    });
    this.setView('wide'); // ball's in play — whole field, fast
    this.phase = mode === 'defense' ? 'fielding' : 'running';
    this.pendingThrow = undefined;
    this.pendingDive = false;
    this.pendingRun = false;
    this.pendingSend = undefined;
    this.pendingHold = undefined;
    this.charging = false;
    // Fresh replay recording for this play.
    this.replayFrames = [];
    this.playHighlights = newHighlights();
    this.replaying = false;
    this.replayed = false;

    // Sprite setup is the view's job: it wraps the settled runner tokens, adds
    // the batter's fresh token, and raises the ball/marker/rings/GO chrome.
    this.fadeOutBatter();
    const batterToken = this.makeRunner(batterChar);
    const firstPlay = mode === 'defense' ? this.firstFieldPlay : this.firstRunPlay;
    if (mode === 'defense') this.firstFieldPlay = false;
    else this.firstRunPlay = false;
    this.liveView.beginPlay(this.livePlay, {
      runnerTokens: this.runners,
      batterToken,
      batterId: batterChar.id,
      manualBaserunning: this.features.manualBaserunning,
      firstPlay,
    });
    this.runners = new Map(); // rebuilt from the outcome at settle
  }

  /** The per-frame heartbeat of a live play. Everything sim-owned is placed here. */
  update(_time: number, delta: number): void {
    if (this.swingCursor && this.phase === 'pitching') this.positionSwingCursor();
    if (this.replaying) {
      this.stepReplay(delta);
      return;
    }
    if (!this.livePlay || this.livePlay.phase === 'done') return;

    const inputs: LiveInputs = {};
    if (this.phase === 'fielding') {
      inputs.pointer = this.lastPointer;
      // A pointer that hasn't moved (and isn't held) recently stops steering,
      // which is what lets the kid-mode auto-fielder take over.
      inputs.pointerActive =
        this.input.activePointer.isDown ||
        this.time.now - this.lastPointerAt < LIVE.ASSIST.POINTER_STALE_MS;
      if (this.pendingThrow) {
        inputs.throwTo = this.pendingThrow;
        this.pendingThrow = undefined;
        this.charging = false;
      }
      if (this.pendingDive) {
        inputs.dive = true;
        this.pendingDive = false;
      }
    } else if (this.phase === 'running') {
      if (this.pendingRun) {
        inputs.run = true;
        this.pendingRun = false;
      }
      if (this.pendingSend) {
        inputs.sendRunner = this.pendingSend;
        this.pendingSend = undefined;
      }
      if (this.pendingHold) {
        inputs.holdRunner = this.pendingHold;
        this.pendingHold = undefined;
      }
    }

    this.livePlay = stepLivePlay(
      this.livePlay,
      inputs,
      delta,
      this.activeLiveParams ?? this.liveParams,
      () => Math.random()
    );
    // Record the frame for a possible 📼 (positions only — never inputs).
    if (this.features.replay && this.replayFrames.length < FX.REPLAY.MAX_FRAMES) {
      this.replayFrames.push(snapshotLive(this.livePlay));
    }
    this.drainLiveEvents();
    this.liveView.render(this.livePlay);
    if (this.livePlay.phase === 'done') {
      if (
        this.features.replay &&
        !this.replayed &&
        this.replayFrames.length > 12 &&
        isReplayWorthy(this.playHighlights)
      ) {
        this.startReplay();
      } else {
        this.settleLivePlay();
      }
    }
  }

  // --- 📼 Instant replay ----------------------------------------------------

  /** Roll the tape: slow-motion playback of the recorded play, then settle. */
  private startReplay(): void {
    this.replaying = true;
    this.replayed = true;
    this.replayT = 0;
    this.replayIdx = 0;
    this.phase = 'resolving'; // input router ignores everything until settle
    audio.pop();
    // Out/scored runners faded during the live play — bring everyone back.
    this.liveView.restoreRunnersForReplay();
    // Letterbox bars + the ribbon, pinned over everything.
    const chrome = this.add.container(0, 0).setDepth(96);
    chrome.add(this.add.rectangle(GAME_WIDTH / 2, 24, GAME_WIDTH, 48, COLORS.ink, 0.9));
    chrome.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 24, GAME_WIDTH, 48, COLORS.ink, 0.9));
    const tag = this.add
      .text(GAME_WIDTH / 2, 24, '📼 INSTANT REPLAY', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '22px',
        color: '#ffce3a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    chrome.add(tag);
    this.tweens.add({ targets: tag, alpha: 0.5, duration: 420, yoyo: true, repeat: -1 });
    this.pinUI(chrome);
    this.replayChrome = chrome;
    // Any tap skips straight to the end.
    this.input.once('pointerdown', () => {
      if (this.replaying) this.endReplay();
    });
  }

  private stepReplay(delta: number): void {
    const s = this.livePlay;
    if (!s || this.replayFrames.length === 0) {
      this.endReplay();
      return;
    }
    this.replayT += delta * FX.REPLAY.SPEED;
    const start = this.replayFrames[0].t;
    while (
      this.replayIdx < this.replayFrames.length - 1 &&
      this.replayFrames[this.replayIdx + 1].t - start <= this.replayT
    ) {
      this.replayIdx += 1;
    }
    applyFrame(s, this.replayFrames[this.replayIdx]);
    this.liveView.render(s);
    if (this.replayIdx >= this.replayFrames.length - 1) this.endReplay();
  }

  /** Restore the true final state and rejoin the normal settle flow. */
  private endReplay(): void {
    if (!this.replaying) return;
    this.replaying = false;
    this.replayChrome?.destroy();
    this.replayChrome = undefined;
    const s = this.livePlay;
    if (s && this.replayFrames.length > 0) {
      applyFrame(s, this.replayFrames[this.replayFrames.length - 1]);
      this.liveView.render(s);
    }
    this.settleLivePlay();
  }

  /** Turn this tick's sim events into juice: SFX, pops, shakes, text. */
  private drainLiveEvents(): void {
    const s = this.livePlay!;
    for (const e of s.events) {
      switch (e.t) {
        case 'catch': {
          audio.pop();
          const bq = project(s.ball.pos);
          floatingText(this, bq.x, bq.y - 40, 'CAUGHT!', COLORS.gold, 30);
          if (s.mode === 'defense') audio.cheer();
          if (this.playHighlights.sawDive) this.playHighlights.diveCatch = true;
          // The catcher's glove-up beat.
          const cspr = this.liveView.fielderSprite(e.fielder);
          if (cspr && cspr.img.active) {
            cspr.cycle?.stop(false);
            cspr.cycle = null;
            reactPose(this, cspr.img, e.fielder, 'catch', { holdMs: ANIM.ACTION_HOLD_MS, restoreTo: e.fielder });
          }
          break;
        }
        case 'pickup':
          audio.pop();
          if (s.mode === 'defense') this.liveView.showBaseRings();
          break;
        case 'land': {
          const lq = project(s.ball.pos);
          burst(this, lq.x, lq.y, COLORS.dirt, 6);
          // Chalk ring marking the landing spot — reads at a glance where the
          // ball came down even if you were watching your runner.
          const ring = this.add.ellipse(lq.x, lq.y, 26, 11).setStrokeStyle(4, COLORS.white, 0.85).setDepth(13);
          this.tweens.add({
            targets: ring,
            scaleX: 2.1,
            scaleY: 2.1,
            alpha: 0,
            duration: FX.LAND_RING_MS,
            ease: 'Quad.out',
            onComplete: () => ring.destroy(),
          });
          break;
        }
        case 'bonk': {
          const kq = project(s.ball.pos);
          floatingText(this, kq.x, kq.y - 40, 'BONK! 🌳', COLORS.white, 26);
          burst(this, kq.x, kq.y - 20, 0x529a49, 8);
          audio.pop();
          this.callIt('bonk', {});
          break;
        }
        case 'carom': {
          const cq = project(s.ball.pos);
          floatingText(this, cq.x, cq.y - 36, 'OFF THE WALL!', COLORS.gold, 26);
          burst(this, cq.x, cq.y - 12, this.venue.look.fenceTrim, 8);
          screenShake(this, 2);
          audio.pop();
          this.playHighlights.carom = true;
          break;
        }
        case 'error': {
          const label = e.kind === 'wild' ? 'WILD THROW!' : e.kind === 'drop' ? 'DROPPED IT!' : 'BOBBLED!';
          const eq = project(s.ball.pos);
          floatingText(this, eq.x, eq.y - 44, label, COLORS.red, 28);
          screenShake(this, 3);
          audio.whiff();
          this.callIt(e.kind === 'wild' ? 'errorWild' : 'errorDrop', {});
          // The flustered kid wears it on their face for the fumble beat.
          const fspr = this.liveView.fielderSprite(e.fielder);
          if (fspr && !fspr.cycle && fspr.img.active) {
            reactPose(this, fspr.img, e.fielder, 'upset');
          }
          // An error by the CPU while your kids run = a gift. Cheer it.
          if (s.mode === 'offense') audio.cheer();
          break;
        }
        case 'throw': {
          audio.pitchWoosh();
          this.liveView.hideBaseRings();
          // The thrower whips through the release pose, facing the target bag.
          const tspr = e.fielder ? this.liveView.fielderSprite(e.fielder) : undefined;
          if (tspr && tspr.img.active) {
            tspr.cycle?.stop(false);
            tspr.cycle = null;
            tspr.img.setFlipX(project(basePos(e.toBase)).x < tspr.container.x);
            reactPose(this, tspr.img, e.fielder!, 'throw', { holdMs: ANIM.ACTION_HOLD_MS, restoreTo: e.fielder! });
          }
          break;
        }
        case 'out': {
          const p = project(basePos(e.base));
          floatingText(this, p.x, p.y - 46, 'OUT!', COLORS.red, 32);
          screenShake(this, 4);
          if (s.mode === 'defense') audio.cheer();
          else audio.whiff();
          this.playHighlights.outs += 1;
          const spr = this.liveView.runnerSprite(e.runner);
          if (spr) {
            spr.cycle?.stop(false);
            spr.cycle = null;
            // Fade but DON'T destroy — a replay may need them back; the
            // settle sweep disposes of everyone off-base.
            this.tweens.add({
              targets: spr.container,
              alpha: 0,
              y: spr.container.y - 10,
              duration: 320,
              delay: 120,
            });
          }
          break;
        }
        case 'score': {
          burst(this, HOME.x, HOME.y - 20, COLORS.gold, 14);
          audio.cheer();
          floatingText(this, HOME.x, HOME.y - 60, '+1', COLORS.gold, 34);
          if (this.seasonGame && s.mode === 'offense') {
            this.statEvents.push({ t: 'run', kid: e.runner });
          }
          const spr = this.liveView.runnerSprite(e.runner);
          if (spr) {
            spr.cycle?.stop(true);
            spr.cycle = null;
            squashHop(this, spr.img, { height: 18 });
            this.time.delayedCall(480, () => spr.container.setAlpha(0)); // sweep disposes at settle
          }
          break;
        }
        case 'dive': {
          const dq = project(s.fielders[s.active].pos);
          burst(this, dq.x, dq.y + 4, COLORS.dirt, 5);
          audio.pitchWoosh();
          this.playHighlights.sawDive = true;
          break;
        }
        case 'diveMiss': {
          const mq = project(s.fielders[s.active].pos);
          floatingText(this, mq.x, mq.y - 40, 'JUST MISSED!', COLORS.white, 24);
          burst(this, mq.x, mq.y + 2, COLORS.dirt, 8);
          break;
        }
        case 'safe':
        case 'run':
        case 'playOver':
          break;
      }
    }
  }

  /** The play is over — fold it into the inning and rejoin the normal flow. */
  private settleLivePlay(): void {
    const s = this.livePlay!;
    const outcome = finishLivePlay(s);
    this.livePlay = undefined;
    this.phase = 'resolving';

    // Chrome down + fielders trot home + runner-map rebuild — the view's job.
    this.charging = false;
    this.runners = this.liveView.settlePlay({ baseIds: outcome.baseIds, outs: outcome.outs });

    // Rules layer: fold in outs/runs/bases.
    const applied = applyLivePlay(this.halfState, outcome);
    this.halfState = applied.state;
    if (this.practice) this.halfState = { ...this.halfState, outs: 0 }; // BP: outs never stick
    const isOffense = s.mode === 'offense';
    const batSeat = this.battingSeat();
    // Season stat feed: contact always completes the batter's AB; reaching on
    // it is a hit (playground scoring — errors count, and that's fine).
    // The batter char came from whichever flow family ran this half.
    const playBatter = isOffense ? this.batter : this.cpuBatter;
    if (this.seasonGame && batSeat.recordsStats) {
      batSeat.stats.push({ t: 'atBat', kid: playBatter.id });
      if (!outcome.batterOut) batSeat.stats.push({ t: 'hit', kid: playBatter.id });
    }
    if (applied.runsScored > 0) batSeat.score += applied.runsScored;

    // Juice: the batting side charges off hits/runs, the fielding side off outs.
    if (!outcome.batterOut && !outcome.flyCaught) this.gainJuiceSeat(batSeat, 'hit');
    for (let i = 0; i < applied.runsScored; i++) this.gainJuiceSeat(batSeat, 'runScored');
    if (outcome.outs >= 2) this.gainJuiceSeat(this.fieldingSeat(), 'doublePlay');
    else if (outcome.flyCaught) this.gainJuiceSeat(this.fieldingSeat(), 'cleanCatch');

    // Play-by-play for how the play ended.
    const batterName = (isOffense ? this.batter : this.cpuBatter)?.name;
    if (outcome.outs >= 2) this.callIt('doublePlay', {}, 2);
    else if (outcome.flyCaught && applied.runsScored > 0) this.callIt('sacFly', {}, 2);
    else if (outcome.flyCaught) this.callIt('catch', {});
    else if (outcome.outs === 1) this.callIt('outRace', {});
    else this.callIt('hitSafe', { name: batterName });

    const color = isOffense
      ? outcome.outs > 0
        ? COLORS.red
        : COLORS.gold
      : outcome.outs > 0
        ? COLORS.gold
        : COLORS.white;
    const bigPlay = outcome.outs > 0 || applied.runsScored > 0;
    this.flashAnnounce(
      outcome.description,
      color,
      bigPlay ? FLOW.BIG_BANNER_HOLD_MS : FLOW.BANNER_HOLD_MS
    );
    this.refreshHud();

    // Walk-off: the HOME seat just took the lead in the bottom of the final
    // inning. (Home/away are seat POSITIONS — seats[1]/seats[0] — not roles.)
    if (
      !isOffense &&
      isWalkOff(this.inning, this.regulation, this.half, this.seats[1].score, this.seats[0].score)
    ) {
      this.phase = 'ended';
      this.flashAnnounce(`WALK-OFF!\n${this.seats[1].identity ? teamName(this.seats[1].identity) : 'CPU'} WINS!`, COLORS.red, FLOW.BIG_BANNER_HOLD_MS);
      this.time.delayedCall(FLOW.BIG_BANNER_HOLD_MS + 200, () => this.gameOver());
      return;
    }

    this.time.delayedCall(FLOW.AFTER_LIVE_PLAY_MS, () => {
      batSeat.lineupIdx += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (batSeat.humanBats) {
        this.nextPlayerBatter();
      } else {
        this.nextCpuBatter();
      }
    });
  }

  // --- Headless / dev hooks for live plays ---------------------------------
  /** Public for headless driving (see CLAUDE.md): steer the fielder. */
  setLivePointer(x: number, y: number): void {
    this.lastPointer = { x, y };
    this.lastPointerAt = this.time.now; // headless steering counts as steering
  }

  /** Public for headless driving: release a throw at a base. */
  commandThrow(base: 1 | 2 | 3 | 4, power: number): void {
    this.pendingThrow = { base, power };
  }

  /** Public for headless driving: the "everybody GO!" tap. */
  commandRun(): void {
    this.pendingRun = true;
  }

  /** Public for headless driving (main mode): send / turn back one runner. */
  commandSend(charId: string): void {
    this.pendingSend = charId;
  }

  commandHold(charId: string): void {
    this.pendingHold = charId;
  }

  /**
   * Main-mode running tap → a base: send the settled runner whose NEXT base
   * was tapped, or turn back the mid-leg runner who LEFT the tapped base.
   */
  private handleRunTap(p: Vec): void {
    const s = this.livePlay;
    if (!s) return;
    const base = this.nearestBaseTo(p);
    const send = s.runners.find(
      (r) => r.done === null && (r.tagging ? r.startBase : r.from) + 1 === base &&
        (r.tagging || r.to === r.from)
    );
    if (send) {
      this.pendingSend = send.charId;
      audio.pop();
      return;
    }
    const back = s.runners.find(
      (r) => r.done === null && r.to > r.from && r.progress < 1 && r.from === base
    );
    if (back) {
      this.pendingHold = back.charId;
      audio.pop();
    }
  }

  getLivePlay(): LivePlayState | undefined {
    return this.livePlay;
  }

  // --- Opponent half (YOU pitch — same one-button timing, on the mound) ----
  private nextCpuBatter(): void {
    if (isHalfOver(this.halfState)) {
      this.endHalf();
      return;
    }
    this.cpuBatter = getCharacter(this.aiTeam[this.aiLineup % TEAM_SIZE]);
    this.showBatter(this.cpuBatter, true); // jogs in from the dugout
    this.batterLabel.setText(this.cpuBatter.name);
    // Your defense heckles the incoming batter, Backyard style.
    const heckler = getCharacter(this.playerTeam[Math.floor(Math.random() * this.playerTeam.length)]);
    this.kidChat('fielding', heckler);
    this.time.delayedCall(FLOW.CPU_NEW_BATTER_MS, () => this.beginPitchTurn());
  }

  /** Main mode picks a pitch + aim first; kid mode goes straight to the meter. */
  private beginPitchTurn(): void {
    this.setView('close'); // the pitching view mirrors the batting one
    // Two strikes on the CPU kid: they turn around and sweat while you pick.
    if (this.halfState.count.strikes === 2) this.rig.reactBatter('nervous', ANIM.REACT_HOLD_MS);
    this.showReliefButton();
    this.showSpendChips();
    if (!this.features.pitchSelection) {
      this.startPitchMeter();
      return;
    }
    this.phase = 'resolving'; // the select UI owns input until the aim is tapped
    const confirm = (kind: PitchKind, target: PlateLoc) => {
      autoPick.remove();
      this.pitchSelect?.destroy();
      this.pitchSelect = undefined;
      if (kind === 'crazy') {
        this.playerJuice = spend(this.playerJuice, 'crazyPitch', this.playerPitcher.ability);
        this.refreshJuiceMeter();
        floatingText(this, this.pitchCalloutPos().x, this.pitchCalloutPos().y, '⚡ CRAZY PITCH!', COLORS.gold, 26);
        crazyPitchFx(this, this.pitchCalloutPos().x, this.pitchCalloutPos().y);
        this.callIt('crazyPitch', {}, 2);
      }
      this.selectedPitch = { kind, target };
      // Next tick, not now: the confirming tap's pointerdown is still being
      // dispatched, and starting the meter synchronously would let that same
      // tap fall through to the scene handler and instantly "throw" wild.
      this.time.delayedCall(60, () => this.startPitchMeter());
    };
    // Idle-kid rescue: nobody stalls the game on the pitch menu. Tracked as a
    // field so the relief picker can cancel it (its stale closure would
    // otherwise auto-throw over the NEXT pitch turn's fresh menu).
    this.pitchAutoPick?.remove(false);
    const autoPick = this.time.delayedCall(9000, () => {
      if (this.pitchSelect) confirm('fastball', { x: 0, y: 0 });
    });
    this.pitchAutoPick = autoPick;
    this.pitchSelect?.destroy();
    this.pitchSelect = showPitchSelect(this, {
      allowCrazy: this.features.juice && canSpend(this.playerJuice, 'crazyPitch', this.playerPitcher.ability),
      onDone: confirm,
      pin: (o) => this.pinUI(o),
    });
  }

  /**
   * The mound ring: shrinks onto the target over PITCH_METER_MS — press right
   * when it closes for a perfect pitch. An idle kid never stalls the game: a
   * fallback auto-throw fires shortly after the moment (late = weak/wild).
   */
  private startPitchMeter(): void {
    this.phase = 'aiming';
    this.threw = false;
    this.meterStart = this.time.now;
    // The throw meter rings the rig's distant pitcher (your kid on the hill).
    const rp = this.rig.releasePoint;
    this.ringTarget = this.add
      .circle(rp.x, rp.y, 26)
      .setStrokeStyle(4, COLORS.gold)
      .setDepth(PLATE_VIEW.DEPTH + 4);
    this.ringShrink = this.add
      .circle(rp.x, rp.y, 26)
      .setStrokeStyle(5, COLORS.white)
      .setDepth(PLATE_VIEW.DEPTH + 5);
    this.ringShrink.setScale(3.2);
    this.tweens.add({
      targets: this.ringShrink,
      scale: 1,
      duration: PITCH_METER_MS,
      ease: 'Sine.in',
    });
    this.autoThrowTimer = this.time.delayedCall(PITCH_METER_MS + PITCH_AUTO_THROW_MS, () =>
      this.onThrow()
    );
  }

  private onThrow(): void {
    if (this.phase !== 'aiming' || this.threw) return;
    this.threw = true;
    const error = this.time.now - this.meterStart - PITCH_METER_MS;
    const band = pitchBandFromError(error);
    if (this.features.pitchSelection && this.selectedPitch) {
      this.resolvePlayerPitchPlan(this.selectedPitch.kind, this.selectedPitch.target, band, error);
    } else {
      this.resolvePlayerPitch(band);
    }
  }

  /** Public for the same headless/dev driving as resolvePlayerSwing. */
  resolvePlayerPitch(band: PitchBand): void {
    this.phase = 'resolving';
    this.autoThrowTimer?.remove();
    this.autoThrowTimer = undefined;
    this.clearPitchVisuals();
    this.showPitchFeedback(band);
    this.pitcherWindup();

    // The CPU batter's plan is pure logic; the scene just acts it out.
    const plan = resolveCpuPitch(band, this.playerPitcher, this.cpuBatter, () => Math.random());
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchCpuPitch(band, plan));
  }

  private lastPitchKind?: PitchKind;

  /** Public headless hook (main mode): resolve an aimed, typed pitch. */
  resolvePlayerPitchPlan(kind: PitchKind, target: PlateLoc, band: PitchBand, errorMs?: number): void {
    this.lastPitchKind = kind;
    // Speedy CPU runners sometimes take off on the pitch.
    this.cpuStealFrom = undefined;
    if (this.features.steals) {
      for (const from of [2, 1] as const) {
        if (!this.runners.has(from) || this.runners.has(from + 1)) continue;
        const runner = getCharacter(this.runners.get(from)!.getData('id') as string);
        if (cpuWantsSteal(runner.stats.speed, () => Math.random())) {
          this.cpuStealFrom = from;
          break;
        }
      }
    }
    // Nominal meter error per band, for callers that only know the band.
    const NOMINAL: Record<PitchBand, number> = { perfect: 0, good: 110, weak: 205, wild: 320 };
    const err = errorMs ?? NOMINAL[band];
    this.phase = 'resolving';
    this.autoThrowTimer?.remove();
    this.autoThrowTimer = undefined;
    this.selectedPitch = undefined;
    this.pitchSelect?.destroy(); // headless callers can skip the menu
    this.pitchSelect = undefined;
    this.clearPitchVisuals();
    this.showPitchFeedback(band);
    this.pitcherWindup();

    // A tired arm throws with a sagged effective stat — more scatter.
    if (this.features.fatigue) this.playerFatigue = drainPitch(this.playerFatigue, kind);
    const armStat = this.features.fatigue
      ? effectivePitching(this.playerPitcher.stats.pitching, this.playerFatigue)
      : this.playerPitcher.stats.pitching;
    const plan = resolvePitchLocation(
      kind,
      target,
      armStat,
      err,
      CPU_PITCH_TRAVEL_MS,
      () => Math.random()
    );
    const cpuPlan = resolveCpuPitchLocated(
      plan,
      band,
      rampedCpuBatter(this.cpuBatter, this.ramp),
      () => Math.random()
    );
    this.time.delayedCall(ANIM.WINDUP_MS, () => this.launchCpuPitchMain(plan, cpuPlan));
  }

  /** The aimed pitch flies its curved path over the drawn zone, then settles. */
  private launchCpuPitchMain(plan: PitchPlan, cpuPlan: CpuPitchPlan): void {
    audio.pitchWoosh();
    this.zoneGfx = zoneOutline(this);
    if (this.cpuStealFrom !== undefined) {
      // World bases are hidden under the rig — flag it by the mini-diamond.
      this.pinUI(floatingText(this, 212, 96, 'RUNNER GOING!', COLORS.red, 26));
    }
    const start = this.rig.releasePoint;
    const end = plateToScreen(plan.actual);
    const bendScale = PLATE_VIEW.ZONE.SCALE;
    const ball = this.add
      .circle(start.x, start.y, 9, COLORS.white)
      .setStrokeStyle(2, COLORS.ink)
      .setDepth(PLATE_VIEW.DEPTH + 8);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: plan.travelMs,
      ease: 'Sine.in',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const bend = ballCurveAt(plan, t);
        ball.setPosition(
          start.x + (end.x - start.x) * t + bend.x * bendScale,
          start.y + (end.y - start.y) * t + bend.y * bendScale
        );
        ball.setScale(
          PLATE_VIEW.BALL.SCALE_FROM + t * (PLATE_VIEW.BALL.SCALE_TO - PLATE_VIEW.BALL.SCALE_FROM)
        );
      },
      onComplete: () => {
        ball.destroy();
        this.zoneGfx?.destroy();
        this.zoneGfx = undefined;
        this.settleCpuPitch(cpuPlan);
      },
    });
  }

  /** Fast ball flight mound -> plate; wild pitches fly red and off-target. */
  private launchCpuPitch(band: PitchBand, plan: CpuPitchPlan): void {
    audio.pitchWoosh();
    const wild = band === 'wild';
    const start = this.rig.releasePoint;
    const end = plateToScreen({ x: plan.isBall ? (Math.random() < 0.5 ? -60 : 60) : 0, y: 0 });
    const ball = this.add
      .circle(start.x, start.y, 9, wild ? 0xffd6d0 : COLORS.white)
      .setStrokeStyle(2, wild ? COLORS.red : COLORS.ink)
      .setDepth(PLATE_VIEW.DEPTH + 8);
    this.tweens.add({
      targets: ball,
      x: end.x,
      y: end.y,
      scale: { from: PLATE_VIEW.BALL.SCALE_FROM, to: PLATE_VIEW.BALL.SCALE_TO },
      duration: CPU_PITCH_TRAVEL_MS,
      ease: 'Sine.in',
      onComplete: () => {
        ball.destroy();
        this.settleCpuPitch(plan);
      },
    });
  }

  private settleCpuPitch(plan: CpuPitchPlan): void {
    if (!plan.cpuSwings) {
      if (plan.isBall) {
        this.scoreboard.umpCall('BALL!', BALL_GREEN);
        this.resolveCpuStealThen({ kind: 'ball', bases: 0, description: 'Ball!' });
      } else {
        this.scoreboard.umpCall('STRIKE!', COLORS.gold);
        audio.whiff();
        this.resolveCpuStealThen({ kind: 'strike', bases: 0, description: 'Strike! Looking!' });
      }
      return;
    }

    this.animateSwing();
    // A trailing CPU muscles up with its own juice.
    let cpuBand = plan.cpuBand;
    if (
      this.features.juice &&
      cpuBand !== 'miss' &&
      cpuWantsSpend(this.cpuJuice, 'powerSwing', this.aiScore - this.playerScore, () => Math.random())
    ) {
      this.cpuJuice = spend(this.cpuJuice, 'powerSwing');
      const up: Record<SwingBand, SwingBand> = { miss: 'weak', weak: 'good', good: 'perfect', perfect: 'perfect' };
      cpuBand = up[cpuBand];
      floatingText(this, PLATE_VIEW.ZONE.CX, PLATE_VIEW.ZONE.CY - 120, '⚡ POWER SWING!', COLORS.red, 24);
      powerSwingFx(this, PLATE_VIEW.ZONE.CX, PLATE_VIEW.ZONE.CY, COLORS.red);
    }
    const outcome = resolveContact(cpuBand, this.cpuBatter, this.playerPitcher, () => Math.random(), this.geo);
    if (outcome.kind !== 'inPlay') {
      if (outcome.kind === 'strike') audio.whiff();
      else audio.crack();
      this.resolveCpuStealThen({ kind: outcome.kind, bases: 0, description: outcome.description });
      return;
    }
    this.cpuStealFrom = undefined; // contact: the live play owns the runners now
    audio.crack();
    if (outcome.launch.homer) {
      this.hitPause(() => {
        this.flyHitBall();
        screenShake(this, SHAKE.homer);
        this.callIt('homer', { name: this.cpuBatter.name }, 2);
        this.applyCpuResult({ kind: 'hit', bases: 4, description: 'HOME RUN! 💥' });
      });
      return;
    }
    this.hitPause(() => {
      screenShake(this, SHAKE.single);
      this.beginLivePlay('defense', outcome.launch);
    });
  }

  /**
   * If a CPU runner took off on this pitch, race them first (a quick tap on
   * the throw-down prompt sharpens the catcher's arm), then fold in the
   * at-bat result. Fouls and ball-four are dead balls — the runner goes back.
   */
  private resolveCpuStealThen(result: AtBatResult): void {
    const from = this.cpuStealFrom;
    this.cpuStealFrom = undefined;
    const token = from !== undefined ? this.runners.get(from) : undefined;
    const willWalk = result.kind === 'ball' && this.halfState.count.balls + 1 >= 4;
    const live =
      from !== undefined &&
      token !== undefined &&
      !willWalk &&
      (result.kind === 'strike' || result.kind === 'ball');
    if (!live) {
      this.applyCpuResult(result);
      return;
    }

    this.setView('wide'); // the race happens on the bases
    const { container } = pill(this, GAME_WIDTH / 2, GAME_HEIGHT - 46, '🚨 TAP! THROW HIM OUT!', {
      fill: COLORS.red,
      textColor: '#ffffff',
      fontSize: 26,
    });
    container.setDepth(95);
    this.pinUI(container);
    const start = this.time.now;
    let done = false;
    const finish = (reactMs: number) => {
      if (done) return;
      done = true;
      container.destroy();
      const runner = getCharacter(token!.getData('id') as string);
      const catcher = getCharacter(this.fieldAssignment.find((a) => a.position === 'C')!.charId);
      const reactBonus = Math.max(0, (900 - reactMs) / 900) * 3;
      const safe = rollSteal(
        {
          runnerSpeed: runner.stats.speed,
          catcherArm: catcher.stats.pitching,
          pitchKind: this.lastPitchKind ?? null,
          reactBonus,
        },
        () => Math.random()
      );
      this.halfState = applySteal(this.halfState, from!, safe).state;
      this.animateSteal(from!, token!, safe, true);
      // A caught-stealing third out ends the half; the at-bat carries over conceptually.
      if (isHalfOver(this.halfState)) {
        this.refreshHud();
        this.time.delayedCall(900, () => this.endHalf());
        return;
      }
      this.time.delayedCall(600, () => this.applyCpuResult(result));
    };
    this.input.once('pointerdown', () => finish(this.time.now - start));
    this.time.delayedCall(900, () => finish(900));
  }

  private applyCpuResult(result: AtBatResult): void {
    const prevBatter = this.cpuBatter;
    const applied = applyAtBat(this.halfState, result);
    this.halfState = applied.state;
    if (applied.runsScored > 0) this.aiScore += applied.runsScored;
    // YOU threw the K — charge the meter (and your pitcher's stat line).
    if (result.kind === 'strike' && applied.batterOut) {
      this.gainJuice('player', 'strikeoutThrown', this.playerPitcher.ability);
      this.callIt('strikeoutPitched', { name: prevBatter.name });
      if (this.seasonGame) this.statEvents.push({ t: 'kThrown', kid: this.playerPitcher.id });
    }

    const walked = result.kind === 'ball' && applied.batterDone;

    let runDelay = 0;
    if (applied.movements.length > 0) {
      this.setView('wide'); // runners moving — show the bases
      runDelay = this.animateBaserunning(applied.movements, prevBatter);
      this.fadeOutBatter();
    }

    if (applied.runsScored > 0) audio.cheer();

    const color =
      result.kind === 'hit'
        ? COLORS.gold
        : result.kind === 'ball'
          ? BALL_GREEN
          : result.kind === 'out' || result.kind === 'strike'
            ? COLORS.gold // an out for THEM is good news for you
            : COLORS.white;
    if (result.kind === 'foul') this.scoreboard.umpCall('FOUL!', COLORS.white);
    const struckOut = result.kind === 'strike' && applied.batterOut;
    // YOUR strikeout victim slumps too.
    if (struckOut) this.rig.reactBatter('upset', ANIM.REACT_HOLD_MS);
    let msg = walked
      ? `${prevBatter.name} walks!`
      : struckOut
        ? `STRIKEOUT!\nYou got ${prevBatter.name}!`
        : `${prevBatter.name}: ${result.description}`;
    if (applied.runsScored > 0)
      msg += `\n+${applied.runsScored} FOR CPU`;
    const big = walked || struckOut || applied.runsScored > 0;
    this.flashAnnounce(msg, color, big ? FLOW.BIG_BANNER_HOLD_MS : FLOW.BANNER_HOLD_MS);
    this.refreshHud();

    // Walk-off: the CPU just took the lead in the bottom of the final inning.
    if (isWalkOff(this.inning, this.regulation, this.half, this.aiScore, this.playerScore)) {
      this.phase = 'ended';
      this.flashAnnounce(`WALK-OFF!\n${this.seats[1].identity ? teamName(this.seats[1].identity) : 'CPU'} WINS!`, COLORS.red, FLOW.BIG_BANNER_HOLD_MS);
      this.time.delayedCall(
        Math.max(FLOW.BIG_BANNER_HOLD_MS + 200, runDelay + FLOW.RUN_SETTLE_PAD_MS),
        () => this.gameOver()
      );
      return;
    }

    const delay = Math.max(
      FLOW.CPU_STEP_MS,
      big ? FLOW.BIG_BANNER_HOLD_MS : 0,
      runDelay + FLOW.RUN_SETTLE_PAD_MS
    );
    this.time.delayedCall(delay, () => {
      if (applied.batterDone) this.aiLineup += 1;
      if (isHalfOver(this.halfState)) {
        this.endHalf();
      } else if (applied.batterDone) {
        this.nextCpuBatter();
      } else {
        this.beginPitchTurn();
      }
    });
  }

  private showPitchFeedback(band: PitchBand): void {
    const map: Record<PitchBand, { label: string; color: number }> = {
      perfect: { label: 'PERFECT!', color: COLORS.gold },
      good: { label: 'GOOD!', color: 0x3fae6b },
      weak: { label: 'ok', color: 0xff8c42 },
      wild: { label: 'WILD!', color: COLORS.red },
    };
    const f = map[band];
    const p = this.pitchCalloutPos();
    floatingText(this, p.x, p.y, f.label, f.color, band === 'perfect' ? 36 : 30);
  }

  // --- Little visual helpers ----------------------------------------------
  private showBatter(char: Character, walkIn = false): void {
    this.batterIdle?.stop();
    this.batterSprite?.destroy();

    // The batting-stance pose has the bat baked in, drawn facing the pitch.
    const targetX = HOME.x - 70;
    const spr = this.add
      .image(walkIn ? GAME_WIDTH + 50 : targetX, HOME.y + 6, poseKey(char.id, 'bat'))
      .setOrigin(0.5, 1)
      .setDepth(28);
    const s = KID_SIZE.BATTER_H / spr.height;
    spr.setScale(s);
    this.batterSprite = spr;
    this.batterScale = s;

    if (walkIn) {
      // Jog to the plate with real run frames (facing left = flipX on).
      spr.setFlipX(true);
      const cycle = runCycle(this, spr, char.id);
      this.tweens.add({
        targets: spr,
        x: targetX,
        duration: 460,
        ease: 'Sine.out',
        onComplete: () => {
          cycle.stop(false);
          if (this.batterSprite !== spr) return;
          spr.setFlipX(false);
          spr.setTexture(poseKey(char.id, 'bat'));
          this.startBatterIdle(spr, s);
        },
      });
      return;
    }

    // Entrance, then a gentle "breathing" idle (scaleY only, so a swing can
    // still tilt/step the body without fighting it).
    this.tweens.add({
      targets: spr,
      scaleX: { from: s * 1.15, to: s },
      scaleY: { from: s * 1.15, to: s },
      duration: 200,
      ease: 'Back.out',
      onComplete: () => this.startBatterIdle(spr, s),
    });
  }

  private startBatterIdle(spr: Phaser.GameObjects.Image, s: number): void {
    if (this.batterSprite !== spr) return;
    this.batterIdle = this.tweens.add({
      targets: spr,
      scaleY: s * 1.04,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private fadeOutBatter(): void {
    this.batterIdle?.stop();
    if (!this.batterSprite) return;
    const s = this.batterSprite;
    this.batterSprite = undefined;
    this.tweens.add({ targets: s, alpha: 0, y: s.y - 8, duration: 300, delay: 90, onComplete: () => s.destroy() });
  }

  private animateSwing(): void {
    if (this.rig.visible) this.rig.swingBatter(); // the rear-view kid whips
    this.batterIdle?.stop();
    const spr = this.batterSprite;
    if (spr) {
      // The bat is part of the stance art — whip the whole kid through it.
      spr.setScale(this.batterScale); // clear any mid-breath scale
      this.tweens.add({ targets: spr, angle: 16, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
      this.tweens.add({ targets: spr, x: spr.x + 10, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    }
  }

  private showBandFeedback(band: SwingBand): void {
    const map: Record<SwingBand, { label: string; color: number }> = {
      perfect: { label: 'PERFECT!', color: COLORS.gold },
      good: { label: 'GOOD!', color: 0x3fae6b },
      weak: { label: 'ok', color: 0xff8c42 },
      miss: { label: 'MISS!', color: COLORS.red },
    };
    const f = map[band];
    // Over the frontal zone while the rig is up; at the world plate otherwise.
    const p = this.rig.visible
      ? { x: PLATE_VIEW.ZONE.CX, y: PLATE_VIEW.ZONE.CY - (PLATE_ZONE.H / 2) * PLATE_VIEW.ZONE.SCALE - 30 }
      : { x: HOME.x, y: HOME.y - 70 };
    floatingText(this, p.x, p.y, f.label, f.color, band === 'perfect' ? 40 : 32);
  }

  private flashAnnounce(text: string, color: number, hold = FLOW.BANNER_HOLD_MS): void {
    this.announce.setText(text);
    this.announce.setColor('#' + color.toString(16).padStart(6, '0'));
    this.announce.setScale(0.6);
    this.announce.setAlpha(1);
    this.announceBg.setAlpha(0.55);
    this.tweens.add({ targets: this.announce, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: [this.announce, this.announceBg], alpha: 0, delay: hold, duration: 250 });
  }

  /**
   * ONE pointer, routed by phase: batting -> swing, mound -> throw,
   * fielding -> steer / hold-to-charge a throw, running -> "everybody GO!".
   */
  private bindSwingInput(): void {
    // Wide-view (field) input goes through the 3/4 projection. Rig input
    // (the swing cursor) uses lastScreenPointer instead — RAW screen coords,
    // never unprojected, because the rig isn't drawn in field space.
    const toLogical = (p: Phaser.Input.Pointer): Vec => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      return unproject({ x: w.x, y: w.y });
    };

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.lastScreenPointer = { x: p.x, y: p.y };
      this.lastPointer = toLogical(p);
      this.lastPointerAt = this.time.now;
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastScreenPointer = { x: p.x, y: p.y };
      this.lastPointer = toLogical(p);
      this.lastPointerAt = this.time.now;
      if (this.phase === 'pitching') this.onSwing();
      else if (this.phase === 'aiming') this.onThrow();
      else if (this.phase === 'running') {
        if (this.features.manualBaserunning) this.handleRunTap(this.lastPointer);
        else this.pendingRun = true;
      } else if (this.phase === 'fielding') {
        this.pressAt = this.time.now;
        this.beginThrowCharge();
      }
    });

    this.input.on('pointerup', () => {
      if (this.phase === 'fielding' && this.charging) {
        this.releaseThrow();
      } else if (
        this.phase === 'fielding' &&
        this.features.dive &&
        this.time.now - this.pressAt < LIVE.DIVE.TAP_MAX_MS
      ) {
        // A quick tap while chasing (not charging a throw) = DIVE. Press-and-
        // hold keeps meaning "steer" — only the fast tap lunges.
        this.pendingDive = true;
      }
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.phase === 'pitching') this.onSwing();
      else if (this.phase === 'aiming') this.onThrow();
      else if (this.phase === 'running') {
        if (this.features.manualBaserunning) {
          // Keyboard shortcut: send the lead settled runner.
          const s = this.livePlay;
          const lead = s?.runners
            .filter((r) => r.done === null && !r.tagging && r.to === r.from && r.from < 4)
            .sort((a, b) => b.from - a.from)[0];
          if (lead) this.pendingSend = lead.charId;
        } else {
          this.pendingRun = true;
        }
      }
      else if (this.phase === 'fielding' && this.livePlay?.ball.phase === 'held') {
        // Keyboard shortcut: a solid throw to the sim's best target.
        const speed =
          this.liveParams.throwSpeedMin +
          0.8 * (this.liveParams.throwSpeedMax - this.liveParams.throwSpeedMin);
        this.pendingThrow = { base: chooseThrowTarget(this.livePlay, speed), power: 0.8 };
      }
    });

    // Pause keys. Guard key-repeat so a held key doesn't bounce pause/resume.
    const pauseKey = (e: KeyboardEvent) => {
      if (!e.repeat) this.pauseGame();
    };
    this.input.keyboard?.on('keydown-ESC', pauseKey);
    this.input.keyboard?.on('keydown-P', pauseKey);
  }

  /** A fresh press while holding the ball = start charging a throw at a base. */
  private beginThrowCharge(): void {
    const s = this.livePlay;
    if (!s || s.ball.phase !== 'held') return; // still chasing — press just steers
    this.charging = true;
    this.chargeStart = this.time.now;
    this.chargeBase = this.nearestBaseTo(this.lastPointer);
    this.liveView.beginCharge(this.chargeBase);
  }

  private releaseThrow(): void {
    // Re-snap to wherever the pointer ended up — dragging onto a base aims there.
    this.chargeBase = this.nearestBaseTo(this.lastPointer);
    const held = this.time.now - this.chargeStart;
    const power = Math.min(1, Math.max(0.2, held / LIVE.THROW_METER_MS));
    this.pendingThrow = { base: this.chargeBase, power };
    this.charging = false;
    this.liveView.releaseCharge();
  }

  private nearestBaseTo(p: Vec): 1 | 2 | 3 | 4 {
    let best: 1 | 2 | 3 | 4 = 1;
    let bestD = Infinity;
    for (const base of [1, 2, 3, 4] as const) {
      const d = dist(p, basePos(base));
      if (d < bestD) {
        bestD = d;
        best = base;
      }
    }
    return best;
  }
}

// --- helpers ---------------------------------------------------------------

function bestPitcher(teamIds: string[]): Character {
  return teamIds
    .map(getCharacter)
    .reduce((best, c) => (c.stats.pitching > best.stats.pitching ? c : best));
}
