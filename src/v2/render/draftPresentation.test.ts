import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DRAFT_REACT_SEC,
  DRAFT_BENCH_X_FT,
  DRAFT_WALK_OFF_SEC,
  DRAFT_WALK_SEC,
  draftCast,
  draftHeroPose,
  draftStageCast,
} from './draftPresentation';

describe('draft presentation policy', () => {
  it('walks a new candidate to centre, then holds the authored card pose', () => {
    expect(draftHeroPose(0, 'pick', true)).toEqual({ clip: 'walk_on', xFt: -3.8 });
    const mid = draftHeroPose(DRAFT_WALK_SEC / 2, 'pick', true);
    expect(mid.clip).toBe('walk_on');
    expect(mid.xFt).toBeGreaterThan(-3.8);
    expect(mid.xFt).toBeLessThan(0);
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true)).toEqual({ clip: 'pose_card', xFt: 0 });
  });

  it('lets each candidate own the held hero silhouette', () => {
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true, 'nostrike').clip).toBe('bat_stance');
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true, 'calls_shot').clip).toBe('pose_card');
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true, 'wheelchair_ace').clip).toBe('field_ready');
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true, 'big_lou').clip).toBe('pose_card');
    expect(draftHeroPose(DRAFT_WALK_SEC, 'pick', true, 'tank').clip).toBe('bat_stance');
  });

  it('reacts in place when the same candidate is picked', () => {
    expect(draftHeroPose(0, 'mine', false)).toEqual({ clip: 'cheer', xFt: 0 });
    expect(draftHeroPose(DRAFT_REACT_SEC, 'mine', false)).toEqual({ clip: 'walk_on', xFt: 0 });
    const leaving = draftHeroPose(DRAFT_REACT_SEC + DRAFT_WALK_OFF_SEC / 2, 'mine', false);
    expect(leaving.clip).toBe('walk_on');
    expect(leaving.xFt).toBeGreaterThan(0);
    expect(draftHeroPose(DRAFT_REACT_SEC + DRAFT_WALK_OFF_SEC, 'mine', false)).toEqual({
      clip: 'pose_card', xFt: DRAFT_BENCH_X_FT,
    });
    expect(draftHeroPose(0, 'cpu', false).clip).toBe('cheer');
  });

  it('uses the picked kid\'s directed reaction instead of a shared cheer', () => {
    expect(draftHeroPose(0, 'mine', false, 'nostrike').clip).toBe('cheer_fierce');
    expect(draftHeroPose(0, 'mine', false, 'calls_shot').clip).toBe('cheer_goofy');
    expect(draftHeroPose(0, 'cpu', false, 'wheelchair_ace').clip).toBe('cheer_cool');
    expect(draftHeroPose(0, 'mine', false, 'big_lou').clip).toBe('cheer_goofy');
    expect(draftHeroPose(0, 'mine', false, 'tank').clip).toBe('cheer_fierce');
  });

  it('puts the selected kid first and never duplicates the waiting cast', () => {
    expect(draftCast('c', ['a', 'b', 'c', 'd'], 3)).toEqual(['c', 'a', 'b']);
    expect(draftCast('c', ['c', 'c', 'a'], 7)).toEqual(['c', 'a']);
  });

  it('stages waiting kids and both benches once, within the visible cap', () => {
    const cast = draftStageCast(
      'c',
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      ['mine-0', 'mine-1', 'c'],
      ['cpu-0', 'cpu-1']
    );
    expect(cast.waiting).toEqual(['a', 'b', 'd', 'e', 'f', 'g']);
    expect(cast.player).toEqual(['mine-1', 'mine-0']);
    expect(cast.cpu).toEqual(['cpu-1', 'cpu-0']);
    expect(new Set(cast.all).size).toBe(cast.all.length);
    expect(cast.all).toHaveLength(11);
  });

  it('is connected from the draft screen to the one scene and renderer', () => {
    const app = readFileSync(new URL('../App.ts', import.meta.url), 'utf8');
    const screen = readFileSync(new URL('../ui/screens/DraftScreen.ts', import.meta.url), 'utf8');
    const view = readFileSync(new URL('../game/GameView.ts', import.meta.url), 'utf8');
    expect(app).toMatch(/setDraftSpotlight/);
    expect(screen).toMatch(/draft-preview__art.*is-live/s);
    expect(view).toMatch(/draftHeroPose\(/);
    expect(view).toMatch(/renderInset\(this\.scene, this\.draftCamera/);
  });
});
