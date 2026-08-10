// OWNER: characters agent. Deterministic sub-rng: ONE draw from ctx.get('rng')
// at init seeds the subsystem (same pattern as materials/noise.ts, reimplemented
// here because cross-subsystem imports are forbidden). Every kid builds from
// subRng(baseSeed, seedOffset), so makeKid is order-independent: calling it
// later, twice, or from another subsystem can never reorder anyone's stream.

export type KidRng = {
  next(): number; // [0, 1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
};

export function subRng(baseSeed: number, offset: number): KidRng {
  // Mix base seed and offset into one 32-bit state (splitmix-style avalanche).
  let h = (baseSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = (h + Math.imul(offset + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x735a2d97);
  let a = (h ^ (h >>> 16)) >>> 0;

  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}
