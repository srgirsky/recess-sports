import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../data/characters';
import {
  PERFORMANCE_COUNT,
  actingRateFor,
  faceForClip,
  hasDirection,
  heroClipFor,
  performanceFor,
  performancePhase,
  reactionClipFor,
} from './performance';

describe('character performance direction', () => {
  it('directs every roster slot, and no slot the roster does not have', () => {
    // The table is keyed by slot id. A positional table once handed every kid
    // a neighbour's acting when ROSTER was reordered, and only the pins below
    // noticed; this gate notices on its own.
    expect(PERFORMANCE_COUNT).toBe(ROSTER.length);
    for (const c of ROSTER) expect(hasDirection(c.id), `${c.id} has no direction`).toBe(true);
    expect(hasDirection('custom_player')).toBe(false);
  });

  it('gives the Seven seven hero silhouettes and emotional reads that do not all repeat', () => {
    // The cast sheet's ensemble table: underdog, swagger, intensity, heart,
    // chaos, prodigy, purist. The silhouette promise is the sheet's; the acting
    // must not collapse them back into one kid.
    const [junebug, mars, jay, sonny, dev, zaya, ezra] =
      ['nostrike', 'calls_shot', 'smokey', 'tank', 'wheelchair_ace', 'rocket', 'bend_it'].map(performanceFor);

    expect([junebug, mars, jay, sonny, dev, zaya, ezra].map(heroClipFor)).toEqual([
      'bat_stance', 'pose_card', 'field_ready', 'field_ready', 'field_ready', 'field_ready', 'pose_card',
    ]);
    expect([junebug, mars, jay, sonny, dev, zaya, ezra].map((k) => reactionClipFor(k, true))).toEqual([
      'cheer_fierce', 'cheer_goofy', 'cheer_fierce', 'cheer_tender', 'cheer', 'cheer_cool', 'cheer_cool',
    ]);
    expect([junebug, mars, jay, sonny, dev, zaya, ezra].map((k) => reactionClipFor(k, false))).toEqual([
      'upset_fierce', 'upset_goofy', 'upset_fierce', 'upset_tender', 'upset', 'upset_cool', 'upset_cool',
    ]);
    // The original signature trio stays three different kids.
    expect(new Set([junebug, mars, dev].map(heroClipFor)).size).toBe(3);
    expect(new Set([junebug, mars, dev].map((k) => k.spirit)).size).toBe(3);
    expect([faceForClip(junebug, 'cheer', 'determined'), faceForClip(mars, 'cheer', 'grin'), faceForClip(dev, 'cheer', 'grin')])
      .toEqual(['determined', 'tongue', 'cheer']);
  });

  it('makes Mars\'s called shot a swagger pose with a goofy, quick read — wrong and unembarrassed', () => {
    const mars = performanceFor('calls_shot');
    expect(heroClipFor(mars)).toBe('pose_card');
    expect(reactionClipFor(mars, true)).toBe('cheer_goofy');
    expect(reactionClipFor(mars, false)).toBe('upset_goofy');
    expect(faceForClip(mars, 'pose_card', 'grin')).toBe('tongue');
    expect(actingRateFor(mars, 'idle')).toBeGreaterThan(1);
  });

  it('gives Sonny a catcher\'s ready pose, tender reactions and a calm tempo — never fierce', () => {
    // The biggest kid with the softest voice: he apologizes to the runner he
    // tagged. Tank's sleepy rest face left with Tank; Sonny rests on his own
    // authored expression.
    const sonny = performanceFor('tank');
    expect(heroClipFor(sonny)).toBe('field_ready');
    expect(reactionClipFor(sonny, true)).toBe('cheer_tender');
    expect(reactionClipFor(sonny, false)).toBe('upset_tender');
    expect(actingRateFor(sonny, 'idle')).toBeLessThan(1);
    expect(actingRateFor(sonny, 'upset_tender')).toBeLessThan(0.9);
    expect(sonny.restFace).toBeUndefined();
    expect(faceForClip(sonny, 'field_ready', 'happy')).toBe('neutral');
    expect(faceForClip(sonny, 'cheer_tender', 'happy')).toBe('surprised');
  });

  it('keeps Zaya silent and cool: a ready crouch, a wink, quick ignition', () => {
    const zaya = performanceFor('rocket');
    expect(heroClipFor(zaya)).toBe('field_ready');
    expect(reactionClipFor(zaya, true)).toBe('cheer_cool');
    expect(faceForClip(zaya, 'cheer_cool', 'determined')).toBe('wink');
    expect(faceForClip(zaya, 'idle_fidget', 'determined')).toBe('sleepy');
    expect(actingRateFor(zaya, 'idle')).toBeGreaterThan(1);
  });

  it('directs the three speedsters as three different kids', () => {
    const [zaya, ollie, fatou] = ['rocket', 'turbo', 'zippy'].map(performanceFor);
    expect([zaya, ollie, fatou].map(heroClipFor)).toEqual(['field_ready', 'pose_card', 'bat_stance']);
    expect([zaya, ollie, fatou].map((k) => reactionClipFor(k, true))).toEqual(['cheer_cool', 'cheer_cool', 'cheer']);
    for (const kid of [zaya, ollie, fatou]) expect(actingRateFor(kid, 'idle')).toBeGreaterThan(1);
  });

  it('directs the four sluggers — Mars, Guri, Yaz and Toby — without two of them sharing a read', () => {
    const [mars, guri, yaz, toby] = ['calls_shot', 'big_lou', 'mimi_mash', 'chip'].map(performanceFor);
    expect([mars, guri, yaz, toby].map(heroClipFor)).toEqual(['pose_card', 'pose_card', 'bat_stance', 'bat_stance']);
    expect([mars, guri, yaz, toby].map((k) => reactionClipFor(k, true)))
      .toEqual(['cheer_goofy', 'cheer_goofy', 'cheer_goofy', 'cheer']);
    expect(heroClipFor(guri)).toBe('pose_card');
    expect(faceForClip(guri, 'pose_card', 'goofy')).toBe('tongue');
    expect(actingRateFor(guri, 'idle')).toBeLessThan(1);
    expect(actingRateFor(mars, 'idle')).toBeGreaterThan(1);
    expect(new Set([mars, guri, yaz, toby].map((k) => `${k.hero}/${k.spirit}/${k.tempo}`)).size).toBe(4);
  });

  it('directs the arms — fireballers, junkballers, knucklers and cannons — as gloves with their own spirits', () => {
    const [jay, roz, kwame] = ['smokey', 'diva', 'boomer'].map(performanceFor);
    expect([jay, roz, kwame].map(heroClipFor)).toEqual(['field_ready', 'field_ready', 'nervous']);
    expect([jay, roz, kwame].map((k) => reactionClipFor(k, true))).toEqual(['cheer_fierce', 'cheer_cool', 'cheer_tender']);

    const [ezra, lu, bao] = ['bend_it', 'lefty', 'the_prof'].map(performanceFor);
    expect([ezra, lu, bao].map(heroClipFor)).toEqual(['pose_card', 'field_ready', 'field_ready']);
    expect([ezra, lu, bao].map((k) => reactionClipFor(k, true))).toEqual(['cheer_cool', 'cheer_fierce', 'cheer_goofy']);
    expect(actingRateFor(ezra, 'idle')).toBeLessThan(1);

    const [dev, musa] = ['wheelchair_ace', 'gizmo'].map(performanceFor);
    expect([dev, musa].map(heroClipFor)).toEqual(['field_ready', 'nervous']);
    expect([dev, musa].map((k) => reactionClipFor(k, true))).toEqual(['cheer', 'cheer']);

    const [rudy, amir, roya] = ['flash', 'ace_kid', 'moose'].map(performanceFor);
    expect([rudy, amir, roya].map(heroClipFor)).toEqual(['field_ready', 'pose_card', 'pose_card']);
    expect([rudy, amir, roya].map((k) => reactionClipFor(k, true))).toEqual(['cheer_fierce', 'cheer_cool', 'cheer']);
  });

  it('directs the walls as gloves at a calm tempo, one tender and one fierce', () => {
    const [sonny, greta] = ['tank', 'grizz'].map(performanceFor);
    expect([sonny, greta].map(heroClipFor)).toEqual(['field_ready', 'field_ready']);
    expect([sonny, greta].map((k) => reactionClipFor(k, true))).toEqual(['cheer_tender', 'cheer_fierce']);
    for (const kid of [sonny, greta]) expect(actingRateFor(kid, 'idle')).toBeLessThan(1);
  });

  it('directs the bats — table-setters, pests and clutch — each on its own read', () => {
    const [junebug, hattie, anton] = ['nostrike', 'peaches', 'sniffles'].map(performanceFor);
    expect([junebug, hattie, anton].map(heroClipFor)).toEqual(['bat_stance', 'bat_stance', 'bat_stance']);
    expect([junebug, hattie, anton].map((k) => reactionClipFor(k, true))).toEqual(['cheer_fierce', 'cheer_tender', 'cheer']);

    const [winnie, rafi, josie, sam] = ['cricket', 'sprout', 'clover', 'noodle'].map(performanceFor);
    expect([winnie, rafi, josie, sam].map(heroClipFor)).toEqual(['bat_stance', 'bat_stance', 'nervous', 'nervous']);
    expect([winnie, rafi, josie, sam].map((k) => reactionClipFor(k, true)))
      .toEqual(['cheer_cool', 'cheer_goofy', 'cheer_goofy', 'cheer_cool']);
    expect(faceForClip(josie, 'nervous', 'goofy')).toBe('tongue');
    expect(faceForClip(sam, 'nervous', 'cool')).toBe('worried');
    expect(actingRateFor(winnie, 'idle')).toBeLessThan(1);
    expect(actingRateFor(rafi, 'idle')).toBeGreaterThan(1);

    const [nora, marcus, yui] = ['penny', 'dex', 'bubbles'].map(performanceFor);
    expect([nora, marcus, yui].map(heroClipFor)).toEqual(['field_ready', 'bat_stance', 'nervous']);
    expect([nora, marcus, yui].map((k) => reactionClipFor(k, true))).toEqual(['cheer_cool', 'cheer_cool', 'cheer']);
    expect(actingRateFor(nora, 'idle')).toBeLessThan(1);
    expect(actingRateFor(yui, 'idle')).toBeGreaterThan(1);
  });

  it('does not let acting tempo retime a marker or locomotion calculation', () => {
    const fast = performanceFor('rocket');
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
