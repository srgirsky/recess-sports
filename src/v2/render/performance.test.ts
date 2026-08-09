import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../data/characters';
import {
  PERFORMANCE_COUNT,
  actingRateFor,
  faceForClip,
  heroClipFor,
  performanceFor,
  performancePhase,
  reactionClipFor,
} from './performance';

describe('character performance direction', () => {
  it('authors one profile for every roster slot without defining ids twice', () => {
    expect(PERFORMANCE_COUNT).toBe(ROSTER.length);
    expect(ROSTER.map((c) => performanceFor(c.id))).toHaveLength(30);
  });

  it('gives the signature trio different hero silhouettes and emotional reads', () => {
    const junebug = performanceFor('nostrike');
    const theo = performanceFor('calls_shot');
    const zoom = performanceFor('wheelchair_ace');

    expect([heroClipFor(junebug), heroClipFor(theo), heroClipFor(zoom)]).toEqual([
      'bat_stance',
      'pose_card',
      'field_ready',
    ]);
    expect([faceForClip(junebug, 'cheer', 'determined'), faceForClip(theo, 'cheer', 'grin'), faceForClip(zoom, 'cheer', 'cool')])
      .toEqual(['determined', 'tongue', 'wink']);
    expect([reactionClipFor(junebug, true), reactionClipFor(theo, true), reactionClipFor(zoom, true)])
      .toEqual(['cheer_fierce', 'cheer_goofy', 'cheer_cool']);
    expect([reactionClipFor(junebug, false), reactionClipFor(theo, false), reactionClipFor(zoom, false)])
      .toEqual(['upset_fierce', 'upset_goofy', 'upset_cool']);
  });

  it('starts Batch 1 with Big Lou\'s swagger-goofy character read', () => {
    const lou = performanceFor('big_lou');
    expect(heroClipFor(lou)).toBe('pose_card');
    expect(reactionClipFor(lou, true)).toBe('cheer_goofy');
    expect(reactionClipFor(lou, false)).toBe('upset_goofy');
    expect(faceForClip(lou, 'pose_card', 'goofy')).toBe('tongue');
  });

  it('gives Tank a planted hero pose and fierce reactions without changing his calm tempo', () => {
    const tank = performanceFor('tank');
    expect(heroClipFor(tank)).toBe('bat_stance');
    expect(reactionClipFor(tank, true)).toBe('cheer_fierce');
    expect(reactionClipFor(tank, false)).toBe('upset_fierce');
    expect(actingRateFor(tank, 'idle')).toBeLessThan(1);
    expect(faceForClip(tank, 'bat_stance', 'determined')).toBe('sleepy');
  });

  it('does not let acting tempo retime a marker or locomotion calculation', () => {
    const fast = performanceFor('boomer');
    expect(actingRateFor(fast, 'cheer')).toBeGreaterThan(1);
    // The director only consults this default when the caller did not provide
    // a physics-owned rate; marker/locomotion calls always do.
    expect(actingRateFor(fast, 'swing_contact')).toBeGreaterThan(1);
  });

  it('stably de-synchronizes identical loops by character identity', () => {
    const a = performancePhase('nostrike', 17);
    expect(performancePhase('nostrike', 17)).toBe(a);
    expect(performancePhase('calls_shot', 17)).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});
