/**
 * The recess stream-out crowd sim: 30 kids pour out of the school doors,
 * hop down the steps, funnel through the wall gap, and fan out to their
 * wall spots — without running through each other.
 *
 * Pure logic, no Phaser. SchoolyardScene steps this from update() and
 * positions the kid containers directly each frame (never with tweens),
 * the same way GameScene drives the live-play sim.
 *
 * All randomness is pre-rolled in createCrowd (launch jitter, lanes,
 * speeds) — stepCrowd is fully deterministic, which keeps the tests
 * simple and the fast-forward path exact.
 */

export type KidPhase = 'waiting' | 'stairs' | 'yard' | 'settled';

export interface CrowdKid {
  id: string;
  phase: KidPhase;
  pos: { x: number; y: number };
  /** Post-separation displacement per ms — drives render flipX. */
  vel: { x: number; y: number };
  home: { x: number; y: number };
  /** When this kid wants to leave the door (stagger + jitter baked in). */
  launchAtMs: number;
  /** Time the kid actually launched (for the no-soft-lock guard). */
  launchedAtMs: number;
  /** Exit-lane x offset at the door. */
  lane: number;
  /** Run speed in px/ms. */
  speed: number;
  /** Phase offset for the render-side run bob. */
  bobSeed: number;
  /**
   * True once the kid has run clear of the wall gap. Needed because the back
   * curb row sits *inside* the wall band — kids run down past the gap first,
   * then turn and fan out (up, for the back row) to their spots.
   */
  cleared: boolean;
  /** 0 at the door → 1 at the wall, monotonic. Drives render scale. */
  progress: number;
  /** Separation radius, grows with progress (kids are drawn small at the door). */
  radius: number;
}

export interface CrowdGeometry {
  door: { x: number; y: number };
  /** y of the bottom of the school steps. */
  stairBottomY: number;
  /** x clamp around door.x while a kid is on the steps. */
  stairHalfW: number;
  /** The opening in the brick wall the kids run through. */
  gap: { left: number; right: number };
  /** Below this y a kid is clear of the wall and free to fan out. */
  gapExitY: number;
  /** Top of the wall band — the funnel constraint applies from here down. */
  wallTopY: number;
}

export interface CrowdConfig {
  STAGGER_MS: number;
  STAGGER_JITTER_MS: number;
  DOOR_CLEAR_R: number;
  LANE_SPREAD: number;
  SPEED: number;
  SPEED_JITTER: number;
  RADIUS: number;
  SEP_ITERATIONS: number;
  ARRIVE_R: number;
  GAP_MARGIN: number;
  STAIR_HALF_W: number;
  MAX_DT_MS: number;
  MAX_RUN_MS: number;
}

export interface CrowdKidInit {
  id: string;
  home: { x: number; y: number };
}

export type CrowdEvent = { type: 'launched' | 'settled'; id: string };

export interface CrowdState {
  kids: CrowdKid[];
  geom: CrowdGeometry;
  timeMs: number;
  allSettled: boolean;
  /** Rebuilt every tick; the scene drains it each frame. */
  events: CrowdEvent[];
}

/** How much of the full body size a kid starts at (matches the door art scale). */
const DOOR_SCALE = 0.55;

/** First kid leaves this long after the bell (doors need time to open). */
const FIRST_LAUNCH_MS = 620;

/** How far past the gap exit a kid runs before turning toward their spot. */
const GAP_OVERSHOOT = 14;

export function createCrowd(
  inits: CrowdKidInit[],
  geom: CrowdGeometry,
  cfg: CrowdConfig,
  rng: () => number
): CrowdState {
  const kids: CrowdKid[] = inits.map((init, i) => ({
    id: init.id,
    phase: 'waiting',
    pos: { x: geom.door.x, y: geom.door.y },
    vel: { x: 0, y: 0 },
    home: { x: init.home.x, y: init.home.y },
    launchAtMs:
      FIRST_LAUNCH_MS + i * cfg.STAGGER_MS + (rng() * 2 - 1) * cfg.STAGGER_JITTER_MS,
    launchedAtMs: 0,
    lane: (rng() * 2 - 1) * cfg.LANE_SPREAD,
    speed: cfg.SPEED * (1 + (rng() * 2 - 1) * cfg.SPEED_JITTER),
    bobSeed: rng() * Math.PI * 2,
    cleared: false,
    progress: 0,
    radius: cfg.RADIUS * DOOR_SCALE,
  }));
  return { kids, geom, timeMs: 0, allSettled: false, events: [] };
}

/** One deterministic tick. Clamps dt, mutates + returns s (liveplay style). */
export function stepCrowd(s: CrowdState, dtMs: number, cfg: CrowdConfig): CrowdState {
  const dt = Math.min(Math.max(dtMs, 0), cfg.MAX_DT_MS);
  s.timeMs += dt;
  s.events = [];
  const { geom } = s;

  const active = (k: CrowdKid): boolean => k.phase === 'stairs' || k.phase === 'yard';

  // Launch gate: next kid steps out only when the door mouth is clear, so the
  // doorway meters itself into a queue instead of stacking bodies on one pixel.
  for (const k of s.kids) {
    if (k.phase !== 'waiting' || s.timeMs < k.launchAtMs) continue;
    const doorBusy = s.kids.some(
      (o) =>
        active(o) &&
        Math.hypot(o.pos.x - geom.door.x, o.pos.y - geom.door.y) < cfg.DOOR_CLEAR_R
    );
    if (doorBusy) continue;
    k.phase = 'stairs';
    k.launchedAtMs = s.timeMs;
    k.pos.x = geom.door.x + k.lane;
    k.pos.y = geom.door.y;
    s.events.push({ type: 'launched', id: k.id });
  }

  // Seek: each active kid runs toward its current waypoint.
  const prev = new Map<string, { x: number; y: number }>();
  for (const k of s.kids) {
    if (!active(k)) continue;
    prev.set(k.id, { x: k.pos.x, y: k.pos.y });
    let tx: number;
    let ty: number;
    if (k.phase === 'stairs') {
      tx = geom.door.x + k.lane;
      ty = geom.stairBottomY;
    } else if (!k.cleared) {
      // Run straight through the gap first — home spots (the back curb row
      // especially) are only reachable from the yard side of the wall.
      tx = clamp(k.home.x, geom.gap.left + cfg.GAP_MARGIN, geom.gap.right - cfg.GAP_MARGIN);
      ty = geom.gapExitY + GAP_OVERSHOOT;
    } else {
      tx = k.home.x;
      ty = k.home.y;
    }
    const dx = tx - k.pos.x;
    const dy = ty - k.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = k.speed * dt;
    if (dist <= step) {
      k.pos.x = tx;
      k.pos.y = ty;
    } else {
      k.pos.x += (dx / dist) * step;
      k.pos.y += (dy / dist) * step;
    }
    if (k.phase === 'stairs' && k.pos.y >= geom.stairBottomY) k.phase = 'yard';
    if (k.pos.y >= geom.gapExitY) k.cleared = true;
  }

  // Separation: positional relaxation over active pairs — stiff, can't
  // oscillate, and overlapping bodies simply can't persist.
  const movers = s.kids.filter(active);
  for (let iter = 0; iter < cfg.SEP_ITERATIONS; iter++) {
    for (let a = 0; a < movers.length; a++) {
      for (let b = a + 1; b < movers.length; b++) {
        const ka = movers[a];
        const kb = movers[b];
        const dx = kb.pos.x - ka.pos.x;
        const dy = kb.pos.y - ka.pos.y;
        const dist = Math.hypot(dx, dy);
        const minDist = ka.radius + kb.radius;
        if (dist >= minDist) continue;
        // Coincident pair: pick a stable axis from launch order.
        const nx = dist > 0.001 ? dx / dist : 1;
        const ny = dist > 0.001 ? dy / dist : 0;
        const push = (minDist - dist) / 2;
        ka.pos.x -= nx * push;
        ka.pos.y -= ny * push;
        kb.pos.x += nx * push;
        kb.pos.y += ny * push;
      }
    }
    // Constraints re-applied after every relaxation pass so pushes can't
    // shove anyone through the stair rails or the brick wall.
    for (const k of movers) {
      if (k.phase === 'stairs') {
        k.pos.x = clamp(k.pos.x, geom.door.x - geom.stairHalfW, geom.door.x + geom.stairHalfW);
      } else if (!k.cleared && k.pos.y >= geom.wallTopY) {
        // Only uncleared kids are wall-bound; cleared kids at curb height are
        // on the yard side and free to fan out past the gap posts.
        k.pos.x = clamp(k.pos.x, geom.gap.left + cfg.GAP_MARGIN, geom.gap.right - cfg.GAP_MARGIN);
      }
    }
  }

  // Arrival, progress, velocity, and the no-soft-lock guard.
  for (const k of s.kids) {
    if (!active(k)) continue;
    const stuck = s.timeMs - k.launchedAtMs > cfg.MAX_RUN_MS;
    if (
      stuck ||
      (k.phase === 'yard' &&
        k.cleared &&
        Math.hypot(k.home.x - k.pos.x, k.home.y - k.pos.y) <= cfg.ARRIVE_R)
    ) {
      k.pos.x = k.home.x;
      k.pos.y = k.home.y;
      k.phase = 'settled';
      k.progress = 1;
      k.vel.x = 0;
      k.vel.y = 0;
      s.events.push({ type: 'settled', id: k.id });
      continue;
    }
    const p = prev.get(k.id);
    if (p && dt > 0) {
      k.vel.x = (k.pos.x - p.x) / dt;
      k.vel.y = (k.pos.y - p.y) / dt;
    }
    const span = k.home.y - s.geom.door.y;
    const raw = span > 0 ? (k.pos.y - s.geom.door.y) / span : 1;
    k.progress = Math.max(k.progress, clamp(raw, 0, 1));
    k.radius = cfg.RADIUS * (DOOR_SCALE + (1 - DOOR_SCALE) * k.progress);
  }

  s.allSettled = s.kids.every((k) => k.phase === 'settled');
  return s;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
