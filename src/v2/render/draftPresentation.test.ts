import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DRAFT_REACT_SEC,
  DRAFT_WALK_SEC,
  draftCast,
  draftHeroPose,
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

  it('reacts in place when the same candidate is picked', () => {
    expect(draftHeroPose(0, 'mine', false)).toEqual({ clip: 'cheer', xFt: 0 });
    expect(draftHeroPose(DRAFT_REACT_SEC, 'mine', false)).toEqual({ clip: 'pose_card', xFt: 0 });
    expect(draftHeroPose(0, 'cpu', false).clip).toBe('cheer');
  });

  it('puts the selected kid first and never duplicates the waiting cast', () => {
    expect(draftCast('c', ['a', 'b', 'c', 'd'], 3)).toEqual(['c', 'a', 'b']);
    expect(draftCast('c', ['c', 'c', 'a'], 7)).toEqual(['c', 'a']);
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
