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

  it('gives Mimi a batter hero, fierce reactions and quick ignition', () => {
    const mimi = performanceFor('mimi_mash');
    expect(heroClipFor(mimi)).toBe('bat_stance');
    expect(reactionClipFor(mimi, true)).toBe('cheer_fierce');
    expect(reactionClipFor(mimi, false)).toBe('upset_fierce');
    expect(actingRateFor(mimi, 'idle')).toBeGreaterThan(1);
  });

  it('directs Batch 2 — Turbo, Sprout and Zippy — as three different kids at one quick tempo', () => {
    const turbo = performanceFor('turbo');
    const sprout = performanceFor('sprout');
    const zippy = performanceFor('zippy');
    expect([heroClipFor(turbo), heroClipFor(sprout), heroClipFor(zippy)]).toEqual([
      'bat_stance',
      'nervous',
      'field_ready',
    ]);
    expect([reactionClipFor(turbo, true), reactionClipFor(sprout, true), reactionClipFor(zippy, true)])
      .toEqual(['cheer_goofy', 'cheer', 'cheer']);
    expect([reactionClipFor(turbo, false), reactionClipFor(sprout, false), reactionClipFor(zippy, false)])
      .toEqual(['upset_goofy', 'upset', 'upset']);
    for (const kid of [turbo, sprout, zippy]) expect(actingRateFor(kid, 'idle')).toBeGreaterThan(1);
  });

  it('directs Batches 3 and 4 — four gloves, a swagger and a bashful — each on its own read', () => {
    const [ace, penny, dex, lefty, smokey, bendit] = ['ace_kid', 'penny', 'dex', 'lefty', 'smokey', 'bend_it'].map(performanceFor);
    expect([ace, penny, dex, lefty].map(heroClipFor)).toEqual(['field_ready', 'field_ready', 'field_ready', 'field_ready']);
    expect(heroClipFor(smokey)).toBe('pose_card');
    expect(heroClipFor(bendit)).toBe('nervous');
    expect([ace, penny, dex, lefty, smokey, bendit].map((k) => reactionClipFor(k, true)))
      .toEqual(['cheer_cool', 'cheer_tender', 'cheer_cool', 'cheer_fierce', 'cheer_fierce', 'cheer_goofy']);
    expect(actingRateFor(dex, 'idle')).toBeLessThan(1);
    expect(actingRateFor(smokey, 'idle')).toBeGreaterThan(1);
  });

  it('directs Batches 5 and 6 — three bashfuls, two swaggers and a glove', () => {
    const [noodle, bubbles, sniffles, prof, diva, grizz] = ['noodle', 'bubbles', 'sniffles', 'the_prof', 'diva', 'grizz'].map(performanceFor);
    expect([noodle, sniffles, grizz].map(heroClipFor)).toEqual(['nervous', 'nervous', 'nervous']);
    expect([bubbles, diva].map(heroClipFor)).toEqual(['pose_card', 'pose_card']);
    expect(heroClipFor(prof)).toBe('field_ready');
    expect([noodle, bubbles, sniffles, prof, diva, grizz].map((k) => reactionClipFor(k, true)))
      .toEqual(['cheer_tender', 'cheer', 'cheer_tender', 'cheer_cool', 'cheer_fierce', 'cheer_cool']);
    expect(actingRateFor(grizz, 'idle')).toBeLessThan(1);
    expect(actingRateFor(bubbles, 'idle')).toBeGreaterThan(1);
  });

  it('directs Batches 7 and 8 — the last nine — each on its own read', () => {
    const kids = ['flash', 'cricket', 'moose', 'peaches', 'gizmo', 'clover', 'rocket', 'chip', 'boomer'].map(performanceFor);
    expect(kids.map(heroClipFor)).toEqual([
      'bat_stance', 'nervous', 'field_ready', 'bat_stance', 'pose_card', 'pose_card', 'field_ready', 'field_ready', 'pose_card',
    ]);
    expect(kids.map((k) => reactionClipFor(k, true))).toEqual([
      'cheer_fierce', 'cheer_goofy', 'cheer_tender', 'cheer', 'cheer_cool', 'cheer', 'cheer_fierce', 'cheer', 'cheer_goofy',
    ]);
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
