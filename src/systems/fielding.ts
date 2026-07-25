// ---------------------------------------------------------------------------
// Who goes and gets it. PURE — no Phaser, no rng.
//
// One fielder chases a loose ball (systems/liveplay.ts steers exactly one kid,
// `s.active`), so picking the RIGHT one is the whole defense. The old rule was
// "nearest to launch.landing, decided once at contact", which for a grounder
// measures distance to where the ball STOPS ROLLING — so a hard grounder up
// the right side elected the right fielder while the ball rolled through the
// second baseman's feet a second and a half earlier.
//
// The replacement has two regimes:
//   - ball in the AIR   -> nearest to the landing spot (unchanged; correct)
//   - ball on the GROUND -> earliest CUT-OFF, among fielders whose LEASH
//                           covers the settle point
//
// Ranking a rolling ball purely by "who gets there first" is a trap: a
// grounder starts at HOME and rolls outward, so the pitcher — 112px from the
// plate — is nearest its early path at every spray angle and would field
// essentially every ground ball. The leash encodes the thing a real defense
// does instead: the pitcher fields balls hit AT him and lets the rest go
// through. Gate on where the ball is GOING, then race for it.
// ---------------------------------------------------------------------------

import { LIVE } from '../config';
import { dist, type PositionId, type Vec } from './geometry';

/** A path sample: where the ball is, and how far into the play that is. */
export interface PathSample {
  p: Vec;
  t: number;
}

/** The read-only slice of a fielder the election needs. */
export interface ChaseFielder {
  position: PositionId;
  pos: Vec;
  /** Where they line up — the leash is measured from here, not from `pos`. */
  home: Vec;
}

export interface ChasePick {
  /** Index into the fielders array. */
  index: number;
  /** Where they should run to meet it (the cut-off spot, or the settle point). */
  point: Vec;
  /** Ball-time (ms from now) at which the meeting happens. */
  ms: number;
}

/**
 * Trace where a loose ball goes from here: samples along its remaining travel,
 * each stamped with how many ms from NOW the ball reaches it, then a tail of
 * samples parked at the settle point (a ball lying still is still gettable).
 *
 * This is an ELECTION-ONLY estimate, deliberately not a second copy of
 * `moveBall`. A divergence changes who gets sent, never where the ball
 * actually goes — so it can stay a cheap closed form.
 */
export function predictLoosePath(
  from: Vec,
  settle: Vec,
  rollSpeed: number,
  rollTotal: number,
  rollMult: number
): PathSample[] {
  const N = Math.max(2, LIVE.CHASE.SAMPLES);
  const out: PathSample[] = [];
  const total = dist(from, settle);
  // Walk the same decelerating roll the sim uses: v scales with how much of
  // the roll is left, floored so it never crawls to a halt.
  let t = 0;
  let travelled = 0;
  const step = total / N;
  for (let i = 0; i <= N; i++) {
    out.push({
      p: total < 1e-6 ? { ...settle } : lerp(from, settle, travelled / total),
      t: Math.min(t, LIVE.CHASE.HORIZON_MS),
    });
    const remain = Math.max(0, total - travelled);
    const v = Math.max(1, rollSpeed * rollMult * Math.max(0.15, remain / Math.max(1, rollTotal)));
    t += (step / v) * 1000;
    travelled += step;
  }
  // ...and it just lies there afterwards.
  const tail = out[out.length - 1];
  for (let i = 1; i <= 4; i++) {
    out.push({ p: { ...settle }, t: Math.min(tail.t + i * 400, LIVE.CHASE.HORIZON_MS) });
  }
  return out;
}

function lerp(a: Vec, b: Vec, k: number): Vec {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Is this fielder allowed to leave their post for a ball settling here? */
function withinLeash(position: PositionId, home: Vec, settle: Vec): boolean {
  const leash = LIVE.CHASE.LEASH[position];
  return leash === undefined || dist(home, settle) <= leash;
}

/**
 * Score one fielder against a predicted path: the earliest sample they can
 * beat the ball to (within CUTOFF_GRACE_MS), or null if the ball outruns them
 * entirely. `reach` lets a fielder count a sample they get within arm's length
 * of rather than needing to stand exactly on it.
 */
function cutOff(f: ChaseFielder, path: PathSample[], speed: number, reach: number): PathSample | null {
  for (const s of path) {
    const travelMs = (Math.max(0, dist(f.pos, s.p) - reach) / speed) * 1000;
    if (travelMs <= s.t + LIVE.CHASE.CUTOFF_GRACE_MS) return s;
  }
  return null;
}

/**
 * Pick who chases. Deterministic: ties break on travel distance, then on
 * fielder index, and nothing here touches rng.
 *
 * `incumbent` is the current chaser (-1 at play start). Hysteresis keeps the
 * job with them unless a challenger is decisively better — see the three
 * guards in `shouldSwitch`. Callers only re-run this when the ball turns up
 * somewhere new (it lands, caroms, is bobbled, a wild throw dies); running it
 * every tick would flicker the kid the player is steering.
 */
export function electChaser(args: {
  fielders: ChaseFielder[];
  inAir: boolean;
  /** Landing spot while airborne; the settle point once it's down. */
  settle: Vec;
  /** The ball's remaining ground path (ignored while airborne). */
  path: PathSample[];
  speedOf: (f: ChaseFielder, i: number) => number;
  reach: number;
}): ChasePick {
  const { fielders, inAir, settle, path, speedOf, reach } = args;

  // In the air: whoever is nearest where it will come down. Camping under it
  // is the right read, and there is no roll to cut off yet.
  if (inAir) return nearestTo(fielders, settle, (i) => ({ index: i, point: settle, ms: 0 }));

  const eligible = fielders
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => withinLeash(f.position, f.home, settle));
  const pool = eligible.length > 0 ? eligible : fielders.map((f, i) => ({ f, i }));

  // Score everyone who can head it off at all.
  const scored = pool.map(({ f, i }) => {
    const hit = cutOff(f, path, speedOf(f, i), reach);
    return { f, i, hit, ms: hit ? hit.t : Infinity, zone: dist(f.home, settle) };
  });

  // WHOSE BALL IS IT: the fielder whose post is nearest where it comes to
  // rest. Ranking on cut-off time alone is not enough — a third baseman can
  // genuinely reach a ball rolling at the shortstop sooner, by charging across
  // in front of him, which is both bad baseball and the same "nearest to the
  // early path wins" trap the leash exists to prevent. The zone owner keeps it
  // unless somebody gets there MEANINGFULLY sooner.
  const owner = scored.reduce((a, b) => (b.zone < a.zone ? b : a));
  const ownerMs = owner.ms;

  let best = owner;
  for (const c of scored) {
    if (c === owner || !c.hit) continue;
    if (c.ms + LIVE.CHASE.CUT_AHEAD_MS >= ownerMs) continue; // not decisively sooner
    // Among genuine cut-offs, earliest wins; ties go to whoever's zone it is
    // nearer (sampling is coarse enough that exact ties are common), then to
    // the lower index so the pick is fully deterministic.
    if (best === owner || c.ms < best.ms || (c.ms === best.ms && c.zone < best.zone)) best = c;
  }

  if (best.hit) return { index: best.i, point: { ...best.hit.p }, ms: best.ms };
  // Nobody can head it off — it's through the infield or past everyone. Send
  // the zone owner to where it will stop; that's the old rule, and the right
  // one for a ball that has already beaten the defense.
  return { index: owner.i, point: { ...settle }, ms: Infinity };
}

function nearestTo(
  fielders: ChaseFielder[],
  target: Vec,
  make: (i: number) => ChasePick
): ChasePick {
  let bestI = 0;
  let bestD = Infinity;
  fielders.forEach((f, i) => {
    const d = dist(f.pos, target);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  });
  return make(bestI);
}

/**
 * Should the job actually change hands? Three guards, all needed:
 *  1. a chaser already ON the ball keeps it — "you're on it, it's yours", and
 *     this is what stops the player's kid being taken away mid-reach;
 *  2. handovers can't come faster than SWITCH_COOLDOWN_MS;
 *  3. the challenger must beat the incumbent's own score (measured from where
 *     the incumbent is NOW, so a kid halfway there usually keeps it on merit)
 *     by SWITCH_MARGIN_MS.
 */
export function shouldSwitch(args: {
  incumbent: number;
  incumbentMs: number | null;
  challenger: ChasePick;
  incumbentToBall: number;
  sinceElection: number;
}): boolean {
  const { incumbent, incumbentMs, challenger, incumbentToBall, sinceElection } = args;
  if (challenger.index === incumbent) return false;
  if (incumbent < 0) return true;
  if (incumbentToBall <= LIVE.CHASE.KEEP_RADIUS) return false;
  if (sinceElection < LIVE.CHASE.SWITCH_COOLDOWN_MS) return false;
  if (incumbentMs === null) return true;
  return challenger.ms + LIVE.CHASE.SWITCH_MARGIN_MS < incumbentMs;
}
