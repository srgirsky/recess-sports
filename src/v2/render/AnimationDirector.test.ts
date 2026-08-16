// ---------------------------------------------------------------------------
// The director, and the placeholder library it drives.
//
// Everything asserted here is a property a DELIVERED library must also have,
// which is why the procedural clips are worth testing: they are a working
// example of the contract, so the gates are proven against real animation data
// before any arrives. Root motion, loop seams and marker peaks are all checked
// the same way `validate-models` checks the real file.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { AnimationClip, Object3D, Vector3, VectorKeyframeTrack } from 'three';
import { AnimationDirector } from './AnimationDirector';
import { OutlineRegistry, attachOutline } from './materials/outline';
import { buildDirectedReactionClips, buildJunebugPilotClips, buildMimiMashPilotClips, buildProceduralClips, buildTankPilotClips, buildTheoPilotClips, buildZoomPilotClips } from './proceduralClips';
import { CLIPS, CLIP_NAMES, FPS, LOOP_MAX_RATE, LOOP_MIN_RATE, clipSpec, type AnimName } from './clips';
import { ProxyCharacter } from './ProxyCharacter';
import { ROSTER } from '../../data/characters';
import { performanceFor } from './performance';
import type { FaceCell } from './faceAtlas';

const clips = buildProceduralClips();
const byName = new Map(clips.map((c) => [c.name, c]));

function proxy(): ProxyCharacter {
  return new ProxyCharacter(ROSTER[0].visual);
}

describe('the procedural stand-in library', () => {
  it('covers every clip in the contract', () => {
    // A missing stand-in is a clip that silently falls back to idle — i.e. one
    // nobody ever notices is not being reviewed.
    expect(clips.map((c) => c.name).sort()).toEqual([...CLIP_NAMES].sort());
  });

  it('exports all eight directed reaction takes into the first-party GLB', () => {
    expect(buildDirectedReactionClips().map((clip) => clip.name)).toEqual([
      'cheer_cool', 'cheer_fierce', 'cheer_goofy', 'cheer_tender',
      'upset_cool', 'upset_fierce', 'upset_goofy', 'upset_tender',
    ]);
  });

  it('never translates Root', () => {
    // The rule that gets a delivery rejected most often, asserted on our own
    // library so the gate is known to work before it is pointed at an artist.
    for (const clip of clips) {
      for (const track of clip.tracks) {
        expect(track.name.startsWith('Root.'), `${clip.name} keys ${track.name}`).toBe(false);
      }
    }
  });

  it('runs the full authored length', () => {
    for (const spec of CLIPS) {
      expect(byName.get(spec.name)!.duration, spec.name).toBeCloseTo(spec.frames / FPS, 6);
    }
  });

  it('closes every loop seam exactly', () => {
    // "Seamless at 0.6x, 1.0x and 1.4x" is only achievable if the seam is
    // exact — close enough still pops once per stride, forever.
    for (const spec of CLIPS) {
      if (!spec.loop) continue;
      for (const track of byName.get(spec.name)!.tracks) {
        const stride = track.getValueSize();
        const n = track.values.length / stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${spec.name} ${track.name}[${i}]`).toBeCloseTo(
            track.values[(n - 1) * stride + i],
            6
          );
        }
      }
    }
  });

  it('keeps body travel to what the sim expects', () => {
    // A dive's travel IS the reach the sim grants; a slide's must stay near
    // zero because the basepath track is sim-owned.
    for (const spec of CLIPS) {
      const track = byName.get(spec.name)!.tracks.find((t) => t.name === 'Hips.position') as
        | VectorKeyframeTrack
        | undefined;
      const travel = track ? maxHorizontalTravel(track) : 0;
      if (spec.bodyTravelFt === undefined) {
        expect(travel, `${spec.name} travels but declares nothing`).toBeLessThan(0.5);
      } else {
        expect(travel, `${spec.name} travel`).toBeGreaterThan(spec.bodyTravelFt - 0.35);
        expect(travel, `${spec.name} travel`).toBeLessThan(spec.bodyTravelFt + 0.35);
      }
    }
  });

  it('puts each marker where the motion says the event is', () => {
    // This is the property `validate-models` derives a delivered marker from —
    // glTF cannot carry a named marker, so the event has to be findable in the
    // motion itself. If it holds for these, the derivation is sound.
    for (const spec of CLIPS) {
      if (!spec.marker) continue;
      const found = markerFrameOf(byName.get(spec.name)!, spec.marker.name, spec.frames);
      expect(
        Math.abs(found - spec.marker.frame),
        `${spec.name}: motion says ${found}, contract says ${spec.marker.frame}`
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe('the Junebug vertical slice', () => {
  const pilot = buildJunebugPilotClips();

  it('overrides the five high-frequency clips and all Junebug priority takes', () => {
    expect(pilot.map((clip) => clip.name)).toEqual([
      'idle', 'idle_fidget', 'run', 'bat_stance', 'swing_contact', 'swing_follow',
      'cheer_fierce', 'upset_fierce',
    ]);
  });

  it('closes its three loops and derives contact on frame 7', () => {
    for (const clip of pilot.filter((candidate) => clipSpec(candidate.name).loop)) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${clip.name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
    const swing = pilot.find((clip) => clip.name === 'swing_contact')!;
    expect(markerFrameOf(swing, 'CONTACT', clipSpec('swing_contact').frames)).toBe(7);
  });

  it('contains no root motion', () => {
    for (const clip of pilot) {
      expect(clip.tracks.some((track) => track.name.startsWith('Root.')), clip.name).toBe(false);
    }
  });

  it('settles each bespoke personality beat back into its opening pose', () => {
    for (const name of ['idle_fidget', 'cheer_fierce', 'upset_fierce']) {
      const clip = pilot.find((candidate) => candidate.name === name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
  });
});

describe('the Big Talk Theo character pass', () => {
  const pilot = buildTheoPilotClips();

  it('overrides the five high-frequency clips and all four Theo priority takes', () => {
    expect(pilot.map((clip) => clip.name)).toEqual([
      'idle', 'idle_fidget', 'run', 'bat_stance', 'swing_contact', 'swing_follow',
      'pose_card', 'cheer_goofy', 'upset_goofy',
    ]);
  });

  it('closes its loops, derives contact on frame 7 and carries no root motion', () => {
    for (const clip of pilot.filter((candidate) => clipSpec(candidate.name).loop)) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${clip.name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
    const swing = pilot.find((clip) => clip.name === 'swing_contact')!;
    expect(markerFrameOf(swing, 'CONTACT', clipSpec('swing_contact').frames)).toBe(7);
    for (const clip of pilot) {
      expect(clip.tracks.some((track) => track.name.startsWith('Root.')), clip.name).toBe(false);
    }
  });

  it('returns every personality beat to its opening pose', () => {
    for (const name of ['idle_fidget', 'cheer_goofy', 'upset_goofy']) {
      const clip = pilot.find((candidate) => candidate.name === name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
  });
});

describe('the Zoom Ramirez character pass', () => {
  const pilot = buildZoomPilotClips();

  it('overrides five high-frequency clips plus Zoom fielding and reaction priorities', () => {
    expect(pilot.map((clip) => clip.name)).toEqual([
      'idle', 'idle_fidget', 'run', 'bat_stance', 'swing_contact', 'swing_follow',
      'field_ready', 'cheer_cool', 'upset_cool',
    ]);
  });

  it('closes seated loops, derives contact on frame 7 and carries no root motion', () => {
    for (const clip of pilot.filter((candidate) => clipSpec(candidate.name).loop)) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${clip.name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
    const swing = pilot.find((clip) => clip.name === 'swing_contact')!;
    expect(markerFrameOf(swing, 'CONTACT', clipSpec('swing_contact').frames)).toBe(7);
    for (const clip of pilot) {
      expect(clip.tracks.some((track) => track.name.startsWith('Root.')), clip.name).toBe(false);
    }
  });

  it('returns every personality beat to its opening pose', () => {
    for (const name of ['idle_fidget', 'cheer_cool', 'upset_cool']) {
      const clip = pilot.find((candidate) => candidate.name === name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
  });
});

describe('the Tank character pass', () => {
  const pilot = buildTankPilotClips();

  it('overrides the five high-frequency clips and all Tank priority takes', () => {
    expect(pilot.map((clip) => clip.name)).toEqual([
      'idle', 'idle_fidget', 'run', 'bat_stance', 'swing_contact', 'swing_follow',
      'cheer_fierce', 'upset_fierce',
    ]);
  });

  it('closes its loops, derives contact on frame 7 and carries no root motion', () => {
    for (const clip of pilot.filter((candidate) => clipSpec(candidate.name).loop)) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${clip.name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
    const swing = pilot.find((clip) => clip.name === 'swing_contact')!;
    expect(markerFrameOf(swing, 'CONTACT', clipSpec('swing_contact').frames)).toBe(7);
    for (const clip of pilot) {
      expect(clip.tracks.some((track) => track.name.startsWith('Root.')), clip.name).toBe(false);
    }
  });

  it('returns each economical personality beat to its opening pose', () => {
    for (const name of ['idle_fidget', 'cheer_fierce', 'upset_fierce']) {
      const clip = pilot.find((candidate) => candidate.name === name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
  });
});

describe('the Mimi Mash character pass', () => {
  const pilot = buildMimiMashPilotClips();

  it('overrides the five high-frequency clips and all Mimi priority takes', () => {
    expect(pilot.map((clip) => clip.name)).toEqual([
      'idle', 'idle_fidget', 'run', 'bat_stance', 'swing_contact', 'swing_follow',
      'cheer_fierce', 'upset_fierce',
    ]);
  });

  it('closes its loops, derives contact on frame 7 and carries no root motion', () => {
    for (const clip of pilot.filter((candidate) => clipSpec(candidate.name).loop)) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${clip.name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
    const swing = pilot.find((clip) => clip.name === 'swing_contact')!;
    expect(markerFrameOf(swing, 'CONTACT', clipSpec('swing_contact').frames)).toBe(7);
    for (const clip of pilot) {
      expect(clip.tracks.some((track) => track.name.startsWith('Root.')), clip.name).toBe(false);
    }
  });

  it('rebounds each personality beat back to its opening pose', () => {
    for (const name of ['idle_fidget', 'cheer_fierce', 'upset_fierce']) {
      const clip = pilot.find((candidate) => candidate.name === name)!;
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        const last = track.values.length - stride;
        for (let i = 0; i < stride; i++) {
          expect(track.values[i], `${name} ${track.name}[${i}]`).toBeCloseTo(track.values[last + i], 6);
        }
      }
    }
  });
});

describe('the director', () => {
  it('lets a character take override shared and procedural motion by name', () => {
    const kid = proxy();
    const shared = new AnimationClip('idle', 1, []);
    const character = new AnimationClip('idle', 2, []);
    const dir = new AnimationDirector(kid.mesh, {
      fallback: clips,
      clips: [shared],
      performanceClips: [character],
    });
    dir.play('idle');
    expect(dir.action!.getClip()).toBe(character);
    expect(dir.sourceFor('idle')).toBe('character');
    expect(dir.sourceFor('run')).toBe('procedural');
    dir.dispose();
    kid.dispose();
  });

  it('shows the bat during plate clips and hides it everywhere else', () => {
    const kid = proxy();
    const bat = new Object3D();
    bat.visible = false;
    const dir = new AnimationDirector(kid.mesh, { fallback: clips, bat });
    dir.play('bat_stance');
    expect(bat.visible).toBe(true);
    dir.play('swing_contact' as AnimName);
    expect(bat.visible).toBe(true);
    // A dodge settles back into the stance — a batter bailing out keeps his bat.
    dir.play('dodge' as AnimName);
    expect(bat.visible).toBe(true);
    // The batter turned runner drops it the moment locomotion takes over.
    dir.setLocomotionSpeed(12);
    expect(bat.visible).toBe(false);
    dir.play('field_ready' as AnimName);
    expect(bat.visible).toBe(false);
    dir.dispose();
    kid.dispose();
  });

  it('plays a clip and reports it', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    dir.play('run' as AnimName);
    expect(dir.playing).toBe('run');
    expect(dir.action!.isRunning()).toBe(true);
    dir.dispose();
    kid.dispose();
  });

  it('acts with face, tempo, blink and a staggered idle fidget', () => {
    const kid = proxy();
    const faces: FaceCell[] = [];
    const profile = performanceFor('calls_shot');
    const dir = new AnimationDirector(kid.mesh, {
      fallback: clips,
      actor: {
        id: 'calls_shot',
        profile,
        authoredRest: 'grin',
        setExpression: (cell) => faces.push(cell),
      },
    });

    dir.play('cheer');
    expect(faces[faces.length - 1]).toBe('tongue');
    expect(dir.action!.timeScale).toBeCloseTo(1.12, 6);

    dir.play('idle');
    let sawFidget = false;
    for (let i = 0; i < 240; i++) {
      dir.update(0.05);
      sawFidget ||= dir.playing === 'idle_fidget';
    }
    expect(faces).toContain('blink');
    expect(sawFidget).toBe(true);
    expect(faces).toContain('tongue');
    dir.dispose();
    kid.dispose();
  });

  it('casts reactions from the actor profile rather than replaying one shared take', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, {
      fallback: clips,
      actor: {
        id: 'calls_shot',
        profile: performanceFor('calls_shot'),
        setExpression: () => {},
      },
    });
    expect(dir.playReaction(true)).toBe('cheer_goofy');
    expect(dir.playing).toBe('cheer_goofy');
    expect(dir.playReaction(false, { restart: true })).toBe('upset_goofy');
    expect(dir.playing).toBe('upset_goofy');
    dir.dispose();
    kid.dispose();
  });

  it('lands a marker on the simulated instant, at any lead time', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    // Contact is 7 frames (233ms) in. Ask for it in 233ms and 120ms; both must
    // put the action's local time exactly on frame 7 when the event arrives.
    for (const lead of [7 / FPS, 0.12, 0.4]) {
      const { rate } = dir.playToMarker('swing_contact' as AnimName, lead);
      dir.update(lead);
      expect(dir.action!.time, `lead ${lead}`).toBeCloseTo(7 / FPS, 4);
      expect(rate).toBeCloseTo(7 / FPS / lead, 6);
    }
    dir.dispose();
    kid.dispose();
  });

  it('seeks to the marker when the sim reports the event on this tick', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    const result = dir.playToMarker('catch_chest' as AnimName, 0);
    expect(result).toEqual({ rate: 1, clamped: false });
    expect(dir.action!.time).toBeCloseTo(clipSpec('catch_chest').marker!.frame / FPS, 6);
    dir.dispose();
    kid.dispose();
  });

  it('settles a one-shot into the clip it names', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    let done = 0;
    dir.play('swing_follow' as AnimName, { onDone: () => done++ });
    // Step past the end in small steps — the mixer fires `finished` on update.
    for (let i = 0; i < 40; i++) dir.update(1 / FPS);
    expect(done).toBe(1);
    expect(dir.playing).toBe(clipSpec('swing_follow').returnsTo);
    dir.dispose();
    kid.dispose();
  });

  it('walks the whole settle chain without popping to bind pose', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    dir.play('dive_left' as AnimName); // -> getup -> field_ready (a loop)
    for (let i = 0; i < 200; i++) dir.update(1 / FPS);
    expect(dir.playing).toBe('field_ready');
    dir.dispose();
    kid.dispose();
  });

  it('holds the last frame of a one-shot rather than snapping to T-pose', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    const action = dir.play('pose_card' as AnimName)!;
    expect(action.clampWhenFinished).toBe(true);
    dir.dispose();
    kid.dispose();
  });

  it('switches locomotion clip with speed, staying inside the loop band', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    for (let v = 4; v <= 19; v += 0.5) {
      const name = dir.setLocomotionSpeed(v);
      expect(dir.action!.timeScale, `${v} ft/s on ${name}`).toBeGreaterThanOrEqual(LOOP_MIN_RATE);
      expect(dir.action!.timeScale, `${v} ft/s on ${name}`).toBeLessThanOrEqual(LOOP_MAX_RATE);
    }
    expect(dir.setLocomotionSpeed(0)).toBe('idle');
    dir.dispose();
    kid.dispose();
  });

  it('prefers a delivered clip over its stand-in, name by name', () => {
    // The partial-delivery path: the pilot batch of five lands next to thirty
    // placeholders and must simply take over.
    const kid = proxy();
    const delivered = new AnimationClip('run', 1, []);
    const fellBack: string[] = [];
    const dir = new AnimationDirector(kid.mesh, {
      clips: [delivered],
      fallback: clips,
      onFallback: (n) => fellBack.push(n),
    });
    expect(dir.isProcedural('run')).toBe(false);
    expect(dir.isProcedural('idle')).toBe(true);
    expect(fellBack).not.toContain('run');
    expect(fellBack.length).toBe(CLIPS.length - 1);
    dir.dispose();
    kid.dispose();
  });

  it('falls back to idle instead of freezing when a clip is missing', () => {
    const kid = proxy();
    const dir = new AnimationDirector(kid.mesh, { fallback: [byName.get('idle')!] });
    dir.play('cheer' as AnimName);
    expect(dir.playing).toBe('idle');
    dir.dispose();
    kid.dispose();
  });

  it('actually moves the skeleton', () => {
    // The end-to-end check: a clip, through the mixer, moves a real bone on a
    // real proxy. Everything above could pass with the tracks bound to nothing.
    const kid = proxy();
    const bone = kid.bones.find((b) => b.name === 'RightArm')!;
    const before = bone.quaternion.clone();
    const dir = new AnimationDirector(kid.mesh, { fallback: clips });
    dir.play('run' as AnimName);
    dir.update(0.2);
    expect(before.angleTo(bone.quaternion)).toBeGreaterThan(0.05);
    dir.dispose();
    kid.dispose();
  });

  it('animates the outline hull with the body, not one frame behind it', () => {
    // `attachOutline` shares the Skeleton OBJECT, so the hull follows for free.
    // Asserting it means a future refactor that clones the skeleton — an easy,
    // plausible mistake — shows up here rather than as a navy smear in motion.
    const kid = proxy();
    const scene = new Object3D();
    scene.add(kid.root);
    const reg = new OutlineRegistry();
    const hull = attachOutline(kid.mesh, reg) as unknown as { skeleton?: unknown };
    expect(hull.skeleton).toBe(kid.skeleton);
    reg.dispose();
    kid.dispose();
  });
});

// --- helpers ----------------------------------------------------------------

function maxHorizontalTravel(track: VectorKeyframeTrack): number {
  const v = track.values;
  let max = 0;
  for (let i = 3; i < v.length; i += 3) {
    max = Math.max(max, Math.hypot(v[i] - v[0], v[i + 2] - v[2]));
  }
  return max;
}

/**
 * ★ Where the motion says the event is — the same derivation
 * `scripts/v2/modelRules.mjs` runs on a delivered file, kept in step with it
 * deliberately: if the two ever disagree, the gate is checking something the
 * engine does not believe.
 *
 * The measure differs per marker type, because the physics does:
 *
 *   CONTACT / RELEASE  peak SPEED of the acting hand. A bat meets a ball, and
 *                      a ball leaves a hand, at the fastest moment of the whip.
 *   CATCH              full EXTENSION of the glove hand — furthest from the
 *                      hips. Peak speed is wrong here and it is worth saying
 *                      why: on a leaping catch the fastest the glove ever
 *                      moves is during the take-off, several frames before it
 *                      touches the ball. `catch_jump` failed exactly that way.
 */
function markerFrameOf(clip: AnimationClip, marker: 'CONTACT' | 'RELEASE' | 'CATCH', frames: number): number {
  const kid = proxy();
  // The full library as fallback so a one-shot reaching its end can settle
  // normally instead of warning about a missing clip.
  const dir = new AnimationDirector(kid.mesh, { clips: [clip], fallback: clips });
  const boneName = marker === 'CONTACT' ? 'Prop_BatGrip' : marker === 'RELEASE' ? 'RightHand' : 'LeftHand';
  const bone = kid.bones.find((b) => b.name === boneName)!;
  const hips = kid.bones.find((b) => b.name === 'Hips')!;

  dir.play(clip.name as AnimName, { fadeMs: 0 });
  // Apply frame 0 BEFORE sampling. Without this the first sample is the BIND
  // pose rather than the clip's opening pose, and the jump between them looks
  // like a speed spike on frame 1 — which is exactly what it reported.
  dir.update(0);

  const pos: Vector3[] = [];
  const reach: number[] = [];
  for (let f = 0; f <= frames; f++) {
    if (f > 0) dir.update(1 / FPS);
    kid.root.updateMatrixWorld(true);
    pos.push(bone.getWorldPosition(new Vector3()));
    reach.push(bone.getWorldPosition(new Vector3()).distanceTo(hips.getWorldPosition(new Vector3())));
  }
  dir.dispose();
  kid.dispose();

  let best = 0;
  let bestScore = -Infinity;
  for (let f = 1; f < pos.length - 1; f++) {
    // Central difference for speed, so a peak at f needs f-1 and f+1 to
    // bracket it and a single fast segment cannot claim two frames.
    const score = marker === 'CATCH' ? reach[f] : pos[f + 1].distanceTo(pos[f - 1]);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}
