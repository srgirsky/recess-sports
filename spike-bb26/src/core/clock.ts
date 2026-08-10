// The scene clock. All animation reads tMs/dtMs from here — never
// performance.now or Date.now — so `window.__spike.step(ms)` can drive the
// world deterministically for capture. FROZEN after scaffold.

export class Clock {
  tMs = 0;
  dtMs = 0;

  step(ms: number): void {
    this.dtMs = ms;
    this.tMs += ms;
  }
}
