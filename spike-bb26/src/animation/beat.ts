// OWNER: animation agent. The repeating ~6s pitch/swing/contact beat: a pure
// function of cycle time c = tMs mod PERIOD_MS, applied to the batter and
// pitcher rigs every tick, with edge-triggered events (each fires once per
// cycle, in ascending time order, so even a 100ms clamped dt cannot skip one).
//
// Timeline (ms into the cycle) — chosen so the default capture settle
// (180 × 16.7ms ≈ 3006ms) photographs the pitcher at the TOP of his windup and
// the batter mid-load: the two best anticipation silhouettes in the beat.
//
//     0        set / stance + waggle (idle life on top)
//  2000  ───  pitch:windup   pitcher: set → leg-lift windup (hold at peak)
//  2450        batter starts coiling (load)
//  3050        pitcher drives: windup → release stride
//  3300  ───  pitch:release  ball leaves the hand → plate (450ms)
//  3550  ───  bat:swing      load → contact whip (200ms)
//  3750  ───  bat:contact    ball relaunches plate → outfield (~2.1s)
//  3900        both settle into follow-through holds
//  5850ish ─  ball:land      (emitted by index.ts when the hit flight ends)
//  4900–6000   unwind back to set / stance — the cycle breathes out.

import * as THREE from 'three';
import { Rig, Snapshot, easeIn, easeInOut, easeOut, clamp01 } from './rig';
import { FlightBall } from './ball';

export const PERIOD_MS = 6000;

export const T = {
  windup: 2000,
  loadStart: 2450,
  drive: 3050,
  release: 3300,
  pitchMs: 450,
  swing: 3550,
  contact: 3750,
  swingEnd: 3900,
  unwind: 4900,
} as const;

/** Where the bat meets the ball, in feet over the plate. */
export const CONTACT_PT = new THREE.Vector3(0, 2.5, 0.3);

export type LandingSpot = { to: THREE.Vector3; apexFt: number; durMs: number };

export type BeatDeps = {
  emit(event: string, payload?: unknown): void;
  batter: Rig;
  pitcher: Rig;
  snaps: {
    // batter family (all derived from the stanceBat capture — the bat stays gripped)
    stance: Snapshot;
    load: Snapshot;
    contact: Snapshot;
    follow: Snapshot;
    // pitcher family
    set: Snapshot;
    windup: Snapshot;
    release: Snapshot;
    followP: Snapshot;
  };
  ball: FlightBall;
  pitcherHand: THREE.Object3D;
  pitcherHandBall: THREE.Object3D | null;
  spots: LandingSpot[];
};

const TAU = Math.PI * 2;
const V = new THREE.Vector3();
const VDIR = new THREE.Vector3();
const QH = new THREE.Quaternion();
const QD = new THREE.Quaternion();
const YUP = new THREE.Vector3(0, 1, 0);

// Barrel directions (world space) keying the swing sweep: cocked up-back →
// flat through the contact zone → wrapped high over the lead shoulder. World
// space because Euler-composing a 5-joint chain to aim a child is guesswork;
// resolving against the hand's live world quaternion is exact. Handedness
// note (cost one debug loop): cameras face +z, so world +x is FRAME-LEFT —
// the batter's back shoulder is −x (frame-right), the sweep runs −x → +x.
const BAT_COCKED = new THREE.Vector3(-0.35, 0.8, -0.5);
const BAT_CONTACT = new THREE.Vector3(0.95, 0.02, -0.12);
// (wrapped: after the ~2 rad body turn the lead shoulder faces frame-right,
// so the finish direction has NEGATIVE x — verified against capture.)
const BAT_WRAPPED = new THREE.Vector3(-0.5, 0.82, 0.15);

export function makeBeat(d: BeatDeps) {
  let lastCycle = -1;
  const fired = new Set<string>();
  let currentSpot: LandingSpot = d.spots[0];

  const fire = (name: string, atMs: number, c: number, fn: () => void): void => {
    if (c >= atMs && !fired.has(name)) {
      fired.add(name);
      fn();
    }
  };

  const pitcherPose = (c: number, tMs: number): void => {
    const p = d.pitcher;
    const s = d.snaps;
    if (c < 1400) {
      p.apply(s.set);
    } else if (c < T.windup) {
      // Gather: a slow dip before the lift telegraphs the delivery.
      const u = easeInOut((c - 1400) / 600);
      p.apply(s.set);
      p.addHipsPos(0, -0.09 * u);
      p.add('hips', -0.1 * u, 0, 0);
    } else if (c < 2600) {
      p.blend(s.set, s.windup, easeInOut((c - T.windup) / 600));
    } else if (c < T.drive) {
      // Hold the peak with a balance tremble — a held pose that still lives.
      p.apply(s.windup);
      const w = Math.sin(tMs * 0.02) * 0.018;
      p.add('hips', 0, 0, w);
      p.add('armL', 0, 0, -w * 1.5);
      p.add('armR', 0, 0, w * 1.5);
    } else if (c < T.release) {
      p.blend(s.windup, s.release, easeIn((c - T.drive) / (T.release - T.drive)));
    } else if (c < T.swingEnd) {
      p.blend(s.release, s.followP, easeOut((c - T.release) / (T.swingEnd - T.release)));
    } else if (c < 5200) {
      p.apply(s.followP);
      // Straighten up a little while holding.
      const u = easeInOut((c - T.swingEnd) / 1300);
      p.add('hips', -0.25 * u, 0, 0);
      p.addHipsPos(0, 0.12 * u);
    } else {
      const from = c - 5200;
      p.blend(s.followP, s.set, easeInOut(from / (PERIOD_MS - 5200)));
    }
  };

  /** Aim the bat's +y barrel along a world direction, wherever the hand is. */
  const aimBatWorld = (dir: THREE.Vector3): void => {
    const bat = d.batter.j.bat;
    const hand = d.batter.j.handR;
    if (!bat || !hand) return;
    d.batter.kid.updateWorldMatrix(true, true);
    hand.getWorldQuaternion(QH);
    QD.setFromUnitVectors(YUP, VDIR.copy(dir).normalize());
    bat.quaternion.copy(QH.invert().multiply(QD));
  };

  const batterPose = (c: number, tMs: number): void => {
    const b = d.batter;
    const s = d.snaps;
    if (c < T.loadStart) {
      b.apply(s.stance);
      // Continuous bat waggle: hips micro-twist + arm circles move the tip.
      const w = clamp01((T.loadStart - c) / 300); // fade out into the load
      const t = tMs / 1000;
      b.add('hips', 0, 0.055 * w * Math.sin(TAU * 0.8 * t), 0);
      b.add('armR', 0.055 * w * Math.sin(TAU * 0.9 * t + 1.3), 0, 0.04 * w * Math.sin(TAU * 0.7 * t));
      b.add('armL', 0.055 * w * Math.sin(TAU * 0.9 * t + 1.3), 0, 0);
      b.add('kneeL', 0.05 * w * Math.sin(TAU * 0.5 * t + 0.4), 0, 0);
      b.add('kneeR', 0.05 * w * Math.sin(TAU * 0.5 * t + 2.1), 0, 0);
    } else if (c < T.swing) {
      // Load: coil away from the pitcher, front knee gathers — anticipation.
      b.blend(s.stance, s.load, easeInOut((c - T.loadStart) / (T.swing - T.loadStart)));
    } else if (c < T.contact) {
      const u = easeIn((c - T.swing) / (T.contact - T.swing));
      b.blend(s.load, s.contact, u);
      aimBatWorld(VDIR.copy(BAT_COCKED).lerp(BAT_CONTACT, u));
    } else if (c < T.swingEnd) {
      const u = easeOut((c - T.contact) / (T.swingEnd - T.contact));
      b.blend(s.contact, s.follow, u);
      aimBatWorld(VDIR.copy(BAT_CONTACT).lerp(BAT_WRAPPED, u));
    } else if (c < T.unwind) {
      b.apply(s.follow);
      // Sting wobble: a damped ring right after the hit, then a quiet hold.
      const dt = (c - T.swingEnd) / 1000;
      const ring = 0.07 * Math.exp(-dt * 3.2) * Math.sin(dt * 26);
      b.add('hips', 0, ring, 0);
      aimBatWorld(BAT_WRAPPED);
    } else {
      b.blend(s.follow, s.stance, easeInOut((c - T.unwind) / (PERIOD_MS - T.unwind)));
    }
  };

  return {
    update(tMs: number): void {
      const cycle = Math.floor(tMs / PERIOD_MS);
      const c = tMs - cycle * PERIOD_MS;
      if (cycle !== lastCycle) {
        lastCycle = cycle;
        fired.clear();
        currentSpot = d.spots[cycle % d.spots.length];
        if (d.pitcherHandBall) d.pitcherHandBall.visible = true; // new ball
      }

      pitcherPose(c, tMs);
      batterPose(c, tMs);

      // Events, ascending — poses above are already in tonight's positions.
      fire('pitch:windup', T.windup, c, () => d.emit('pitch:windup'));
      fire('pitch:release', T.release, c, () => {
        // The ball leaves from wherever the hand actually is right now.
        d.pitcher.kid.updateWorldMatrix(true, true);
        d.pitcherHand.getWorldPosition(V);
        if (d.pitcherHandBall) d.pitcherHandBall.visible = false;
        d.ball.launch(tMs, V, CONTACT_PT, 1.1, T.pitchMs, 'pitch');
        d.emit('pitch:release', { from: [V.x, V.y, V.z], durMs: T.pitchMs });
      });
      fire('bat:swing', T.swing, c, () => d.emit('bat:swing'));
      fire('bat:contact', T.contact, c, () => {
        const spot = currentSpot;
        d.ball.launch(tMs, CONTACT_PT, spot.to, spot.apexFt, spot.durMs, 'hit');
        d.emit('bat:contact', {
          at: [CONTACT_PT.x, CONTACT_PT.y, CONTACT_PT.z],
          to: [spot.to.x, spot.to.y, spot.to.z],
          durMs: spot.durMs,
        });
      });
    },
    /** Cycle-relative time, for anyone reading the beat through ctx. */
    cycleTime(tMs: number): number {
      return tMs - Math.floor(tMs / PERIOD_MS) * PERIOD_MS;
    },
    currentSpotOf(tMs: number): LandingSpot {
      return d.spots[Math.floor(tMs / PERIOD_MS) % d.spots.length];
    },
  };
}
