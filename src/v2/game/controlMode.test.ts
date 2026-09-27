import { describe, expect, it } from 'vitest';
import { controlHint, controlsAt, playerOf, type PlayerControlMode } from './controlMode';

describe('focused game controls', () => {
  it('never coaches an ignored input during spectator or CPU-controlled halves', () => {
    for (const phase of ['windup', 'pitch', 'live', 'between'] as const) {
      expect(controlHint('watch', 'top', phase)).toBe('');
      expect(controlHint('watch', 'bottom', phase)).toBe('');
      expect(controlHint('batting', 'bottom', phase)).toBe('');
      expect(controlHint('pitching', 'top', phase)).toBe('');
    }
    expect(controlHint('both', 'top', 'pitch')).toContain('TAP');
    expect(controlHint('both', 'bottom', 'windup')).toContain('PITCH');
    expect(controlHint('both', 'bottom', 'live')).toContain('THROW');
    expect(controlHint('both', 'top', 'live')).toContain('RUN');
    expect(controlHint('both', 'top', 'between')).toBe('');
  });
  it.each([
    ['both', {
      top: { bat: true, pitch: false, run: true, field: false },
      bottom: { bat: false, pitch: true, run: false, field: true },
    }],
    ['batting', {
      top: { bat: true, pitch: false, run: true, field: false },
      bottom: { bat: false, pitch: false, run: false, field: false },
    }],
    ['pitching', {
      top: { bat: false, pitch: false, run: false, field: false },
      bottom: { bat: false, pitch: true, run: false, field: true },
    }],
    ['watch', {
      top: { bat: false, pitch: false, run: false, field: false },
      bottom: { bat: false, pitch: false, run: false, field: false },
    }],
  ] as const)('%s mode exposes only its promised verbs', (mode, expected) => {
    expect(controlsAt(mode as PlayerControlMode, 'top')).toEqual(expected.top);
    expect(controlsAt(mode as PlayerControlMode, 'bottom')).toEqual(expected.bottom);
  });
});

describe('pass and play', () => {
  it('gives every half a batter and a fielder, and hands base taps to the fielder', () => {
    for (const half of ['top', 'bottom'] as const) {
      expect(controlsAt('versus', half)).toEqual({ bat: true, pitch: true, run: false, field: true });
      expect(playerOf(half, 'bat')).not.toBe(playerOf(half, 'field'));
    }
    expect(playerOf('top', 'bat')).toBe(1);
    expect(playerOf('bottom', 'bat')).toBe(2);
    expect(controlHint('versus', 'top', 'windup')).toContain('P2');
    expect(controlHint('versus', 'top', 'pitch')).toContain('P1');
    expect(controlHint('versus', 'bottom', 'pitch')).toContain('P2');
    expect(controlHint('versus', 'top', 'between')).toBe('');
  });
});
