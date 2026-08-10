// OWNER: animation agent. Wires the animation subsystem: builds a Rig per
// kid, captures pose snapshots ONCE at init (paying characters' FK arm solver
// off the frame loop), gives every kid phase-offset idle life, and drives the
// repeating pitch → swing → contact beat (beat.ts) plus the flying ball
// (ball.ts) from the 'tick' event. Nothing here reads wall-clock or
// Math.random: all rng draws happen at init in a fixed order, and every
// runtime pose is a pure function of tick time — same seed + same steps ⇒
// same pixels (the capture contract).
//
// Events emitted: pitch:windup · pitch:release {from,durMs} ·
// bat:swing · bat:contact {at,to,durMs} · ball:land {at}.
//
// Registered API (ctx.get('animation')):
//   periodMs — beat cycle length (6000)
//   timeline — event times within the cycle (ms), for ui/render sync
//   cycleTimeMs(tMs) — cycle-relative time
//   ballMesh — the flying ball (render/ui may read its position, not move it)

import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import type { Rng } from '../core/rng';
import type { CharactersApi } from '../characters/index';
import { Rig, derive, easeInOut } from './rig';
import { IdleLife } from './idle';
import { FlightBall } from './ball';
import { makeBeat, PERIOD_MS, T, type LandingSpot } from './beat';

type MaterialsLike = { color(key: string): THREE.Color };

/** Wrap an angle into [-π, π]. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function init(ctx: Ctx): void {
  const rng = ctx.get<Rng>('rng');
  const chars = ctx.get<CharactersApi>('characters');
  const { scene } = ctx.get<{ scene: THREE.Scene }>('render');
  const materials = ctx.get<MaterialsLike>('materials');
  const { cast } = chars;

  // ---- rigs --------------------------------------------------------------
  const batter = new Rig(cast.batter);
  const pitcher = new Rig(cast.pitcher);
  const catcher = new Rig(cast.catcher);
  const fielders = [cast.first, cast.second, cast.short, cast.third].map((k) => new Rig(k));
  const watchers = cast.watchers.map((k) => new Rig(k));

  // ---- pose snapshots (solver runs here, once, never per tick) -----------
  // Batter family: everything derives from the stanceBat capture, so the
  // solver-fit two-hand grip survives every blend — the swing is mostly a hip
  // uncoil that carries arms and bat together.
  chars.pose(cast.batter, 'stanceBat');
  const stance = batter.capture();
  const load = derive(
    stance,
    { hips: [-0.05, -0.36, 0], legR: [-0.5, 0, 0], kneeR: [0.55, 0, 0], head: [0, 0.32, 0] },
    [0, -0.07, 0],
  );
  const contact = derive(
    stance,
    {
      hips: [0.08, 1.2, 0],
      legR: [0.15, 0, 0],
      head: [0.05, 0.6, 0],
    },
    [0, -0.03, 0],
  );
  // Arms EXTENDED at the ball: absolute joints, not stance deltas — with the
  // arm pitched ~1.35 forward and the elbow straight, the hand's +y axis (and
  // so a zero-rotation bat) points out over the plate, which is the read that
  // matters: bat meeting ball, not still cocked at the shoulder.
  contact.rot.armR = [1.35, 0, -0.3];
  contact.rot.elbowR = [-0.15, 0, 0];
  contact.rot.armL = [1.3, 0, 0.35];
  contact.rot.elbowL = [-0.25, 0, 0];
  contact.rot.bat = [0, 0, 0];
  const follow = derive(
    stance,
    {
      hips: [-0.1, 1.75, 0.06],
      legR: [0.35, 0, 0],
      kneeR: [0.25, 0, 0],
      head: [-0.12, 1.0, 0],
    },
    [0, -0.05, 0],
  );
  // Wrap the bat high over the lead shoulder — the classic finish silhouette.
  follow.rot.armR = [1.7, 0, 0.55];
  follow.rot.elbowR = [-1.0, 0, 0];
  follow.rot.armL = [1.55, 0, 0.4];
  follow.rot.elbowL = [-1.1, 0, 0];
  follow.rot.bat = [-0.5, 0, 0];

  // Pitcher family: windup comes from the characters preset; set/release/
  // follow-through are authored as deltas over the zeroed 'stand' pose.
  chars.pose(cast.pitcher, 'windup');
  const windup = pitcher.capture();
  chars.pose(cast.pitcher, 'stand');
  const zero = pitcher.capture();
  const set = derive(zero, {
    legL: [0, 0, 0.06],
    legR: [0, 0, -0.06],
    armR: [0.8, 0, -0.18],
    elbowR: [-1.45, 0, 0],
    armL: [0.8, 0, 0.18],
    elbowL: [-1.35, 0, 0],
    hips: [0.06, 0, 0],
  });
  const release = derive(
    zero,
    {
      legL: [-0.95, 0, 0.1],
      kneeL: [0.3, 0, 0],
      footL: [0.65, 0, 0],
      legR: [0.75, 0, -0.06],
      kneeR: [0.4, 0, 0],
      footR: [-0.5, 0, 0],
      hips: [0.5, -0.15, 0.05],
      armR: [2.1, 0, -0.3],
      elbowR: [-0.2, 0, 0],
      armL: [0.7, 0, 0.5],
      elbowL: [-1.5, 0, 0],
      head: [-0.5, 0.1, 0],
    },
    [0, -0.3, 0],
  );
  const followP = derive(
    zero,
    {
      legL: [-0.8, 0, 0.1],
      kneeL: [0.5, 0, 0],
      footL: [0.3, 0, 0],
      legR: [0.9, 0, -0.05],
      kneeR: [0.5, 0, 0],
      footR: [-0.6, 0, 0],
      hips: [0.75, -0.35, 0.08],
      armR: [0.7, 0, -0.55],
      elbowR: [-0.3, 0, 0],
      armL: [0.5, 0, 0.6],
      elbowL: [-1.2, 0, 0],
      head: [-0.6, 0.15, 0],
    },
    [0, -0.35, 0],
  );

  // Everyone else keeps the pose the characters owner placed them in.
  const catcherBase = catcher.capture();
  const fielderBases = fielders.map((r) => r.capture());
  const watcherBases = watchers.map((r) => r.capture());

  // Rest the principals in their cycle-start poses until the first tick.
  batter.apply(stance);
  pitcher.apply(set);

  // ---- idle life (all rng draws happen in this fixed order) --------------
  // Principals: breathing + a whisper of sway, eyes stay on the game.
  const batterIdle = new IdleLife(rng, batter, null, { sway: 0.35, glance: 0 });
  const pitcherIdle = new IdleLife(rng, pitcher, null, { sway: 0.3, glance: 0 });
  const catcherIdle = new IdleLife(rng, catcher, catcherBase, { breath: 0.8, sway: 0.3, glance: 0.35 });
  const fielderIdles = fielders.map((r, i) => new IdleLife(rng, r, fielderBases[i], { sway: 0.8 }));
  const watcherIdles = watchers.map((r, i) => new IdleLife(rng, r, watcherBases[i]));

  // ---- landing spots: a fixed rota drawn at init, cycled per beat --------
  const spots: LandingSpot[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = rng.range(-0.62, 0.62); // radians off dead center, inside the foul cone
    const r = rng.range(115, 180);
    spots.push({
      to: new THREE.Vector3(Math.sin(angle) * r, 0.19, Math.cos(angle) * r),
      apexFt: rng.range(26, 42),
      durMs: rng.range(1900, 2350),
    });
  }

  // ---- the ball ----------------------------------------------------------
  const ball = new FlightBall(new THREE.MeshLambertMaterial({ color: materials.color('ballWhite') }));
  scene.add(ball.mesh);
  const pitcherHand = cast.pitcher.getObjectByName('handR')!;
  const pitcherHandBall = pitcherHand.getObjectByName('ball') ?? null;

  const beat = makeBeat({
    emit: (event, payload) => ctx.emit(event, payload),
    batter,
    pitcher,
    snaps: { stance, load, contact, follow, set, windup, release, followP },
    ball,
    pitcherHand,
    pitcherHandBall,
    spots,
  });

  // ---- spectator head-tracking of the hit ball ---------------------------
  // Fielders and watchers turn toward where this cycle's hit is going —
  // deterministic (spot is known from the cycle index), reads as a crowd
  // following the ball. Static placement, so yaw offsets are computed once.
  const trackers = [...fielders, ...watchers].map((rig) => ({
    rig,
    x: rig.kid.position.x,
    z: rig.kid.position.z,
    yaw: rig.kid.rotation.y,
  }));
  const trackBall = (tMs: number): void => {
    const cycle = Math.floor(tMs / PERIOD_MS);
    const c = tMs - cycle * PERIOD_MS;
    const spot = spots[cycle % spots.length];
    const landAt = T.contact + spot.durMs;
    if (c < T.contact + 60 || c > landAt + 600) return;
    const env =
      c < T.contact + 360
        ? easeInOut((c - T.contact - 60) / 300)
        : c > landAt
          ? 1 - easeInOut((c - landAt) / 600)
          : 1;
    for (const tr of trackers) {
      const want = wrap(Math.atan2(spot.to.x - tr.x, spot.to.z - tr.z) - tr.yaw);
      const turn = Math.max(-1.05, Math.min(1.05, want));
      tr.rig.add('head', -0.12 * env, turn * env, 0);
    }
  };

  // ---- the frame loop ----------------------------------------------------
  ctx.on('tick', (payload) => {
    const { tMs } = payload as { tMs: number };

    // 1. Beat poses the principals (absolute) and fires events.
    beat.update(tMs);

    // 2. Idle life: principals additive-only; everyone else re-bases then adds.
    batterIdle.apply(tMs);
    pitcherIdle.apply(tMs);
    catcherIdle.apply(tMs);
    for (const idle of fielderIdles) idle.apply(tMs);
    for (const idle of watcherIdles) idle.apply(tMs);

    // 3. Crowd follows the hit.
    trackBall(tMs);

    // 4. Ball kinematics; the hit flight landing is the ball:land beat.
    const done = ball.update(tMs);
    if (done === 'hit') {
      const p = ball.position;
      ctx.emit('ball:land', { at: [p.x, p.y, p.z] });
    }
  });

  ctx.set('animation', {
    periodMs: PERIOD_MS,
    timeline: { windupMs: T.windup, releaseMs: T.release, swingMs: T.swing, contactMs: T.contact },
    cycleTimeMs: (tMs: number) => beat.cycleTime(tMs),
    ballMesh: ball.mesh,
  });
}

export type AnimationApi = {
  periodMs: number;
  timeline: { windupMs: number; releaseMs: number; swingMs: number; contactMs: number };
  cycleTimeMs(tMs: number): number;
  ballMesh: THREE.Mesh;
};
