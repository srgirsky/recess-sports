import { describe, expect, it } from 'vitest';
import { controlsAt, type PlayerControlMode } from './controlMode';

describe('focused game controls', () => {
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
