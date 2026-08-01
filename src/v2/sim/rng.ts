// ---------------------------------------------------------------------------
// The sim's randomness. PURE, seeded, and INJECTED — never module-scope.
//
// ★ WHY SUBSTREAMS, AND WHY THIS IS THE FIRST FILE IN THE SIM
//
// v1's most expensive determinism bug is recorded in AGENTS.md: every
// `add.text(...)` creates a canvas texture whose key is a Phaser UUID drawn
// from `Math.random`, so *creating, removing or reordering ANY Text object*
// relative to a sim draw shifts the whole seeded stream and breaks the goldlog
// fingerprint. The lesson usually taken from that is "keep cosmetics off the
// rng". The deeper one is that A SINGLE GLOBAL STREAM MAKES CALL ORDER PART OF
// THE CONTRACT — so an unrelated change cascades, and the fingerprint reports a
// difference that means nothing.
//
// `fork(label)` deletes that class outright. `rng.fork('contact')` and
// `rng.fork('fielding')` are independent streams derived from the SAME ROOT
// SEED AND THE LABEL — never from the parent's position in its own stream. So:
//
//   * adding a draw to one substream cannot move another;
//   * forking in a different order gives the same streams;
//   * a substream that is never drawn from costs nothing and shifts nothing.
//
// The test that matters is `fork` independence, not uniformity — uniformity is
// a property of the generator, and this generator is a published one.
//
// ★ WHY sfc32 RATHER THAN v1's mulberry32
//
// 128 bits of state and a period around 2^128, against mulberry32's 32 bits and
// 2^32. The conformance harness runs 50,000 plate appearances across 8 seeds
// with several draws per pitch; 2^32 is close enough to that to be worth not
// thinking about. It costs about ten lines more.
//
// ★ WHAT IS DELIBERATELY NOT HERE, AND WHAT ARRIVED INSTEAD
//
// `normal()` / `gauss()` are still absent. Every textbook normal sampler
// (Box-Muller, Marsaglia polar, Ziggurat's tail) needs `Math.log`, and
// ECMAScript specifies `Math.log` / `exp` / `pow` / the trig functions as
// IMPLEMENTATION-APPROXIMATED — only `+ - * /` and `Math.sqrt` are required to
// be correctly rounded. A fingerprint that depends on them goes red on a V8
// bump and reads as somebody's bug.
//
// The first caller that genuinely needed bell-shaped noise is the batter's
// plate judgement (PR 7), and it does not need a NORMAL — it needs a symmetric,
// zero-mean, finite-tailed error. `bell()` is the Irwin-Hall sum of three
// uniforms, scaled to unit variance: `+` and `/` only, so it is bit-stable by
// the same argument as everything else here, and its support is bounded at ±3
// rather than running to infinity. A batter who misjudges a pitch by six sigma
// is not a batter, so the truncation is a feature.
//
// An `Rng` with no normal is honest; an `Rng` whose normal quietly makes the
// fingerprint version-dependent is not. `bell()` is not a normal and does not
// claim to be one.
//
// Everything in this file uses `Math.imul` (exactly specified), integer bit ops
// and `/`. All of it is bit-stable across platforms and V8 versions.
// ---------------------------------------------------------------------------

/**
 * A seeded random source. Call it for a uniform [0, 1).
 *
 * Always passed in, never reached for: `scripts/v2/purity.lint.test.js` fails a
 * module-scope `makeRng` in `src/v2/sim/**`, because a module-scope generator is
 * a hidden global and gives up the seeding that the whole harness rests on.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
  /** The seed key this stream was derived from. Debugging and fork identity. */
  readonly key: string;
  /** How many raw values have been drawn. Instrumentation only — never logic. */
  readonly draws: number;
  /** Uniform integer in [0, nExclusive). */
  int(nExclusive: number): number;
  /** Uniform real in [lo, hi). */
  range(lo: number, hi: number): number;
  /** True with probability p. */
  bool(p: number): boolean;
  /**
   * Symmetric zero-mean noise with unit variance, in [-3, 3].
   *
   * The Irwin-Hall sum of three uniforms, scaled. NOT a normal — see the header
   * — but the right shape for a judgement error: most misses small, big ones
   * rare, and none of them absurd. Always draws exactly THREE values, so its
   * cost to the stream is fixed and a caller cannot shift a sibling by taking a
   * different branch.
   */
  bell(): number;
  /** A uniformly chosen element. Throws on an empty list. */
  pick<T>(xs: readonly T[]): T;
  /**
   * An independent substream for `label`, derived from the root seed and the
   * label — NOT from this stream's position. Forking twice with the same label
   * gives two generators that produce the same sequence, which is the point:
   * the substream's output depends on nothing but (seed, label).
   */
  fork(label: string): Rng;
}

/**
 * Separates a parent key from a child label.
 *
 * NUL, written as an ESCAPE so it is visible in source rather than an invisible
 * byte. It is the separator because keys are built by concatenation: a label
 * that could contain the separator would let `fork('a<sep>b')` and
 * `fork('a').fork('b')` collide on ONE stream — two different substreams
 * silently sharing values, which is exactly what `fork` exists to prevent.
 * `fork` rejects a label containing it, so that collision is impossible rather
 * than merely unlikely.
 */
const FORK_SEP = '\u0000';

/**
 * xmur3 — a string hash that emits a stream of 32-bit seeds. Used only to turn
 * a seed key into sfc32's four words, never for sim randomness.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function nextSeed(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32 — Chris Doty-Humphrey's Small Fast Counting generator, 32-bit. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function next(): number {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Rounds discarded after seeding, so two keys that hash to nearby states do not
 * produce correlated openings. sfc32's author recommends a warm-up; 12 is the
 * usual figure and costs nothing at construction.
 */
const WARMUP_ROUNDS = 12;

/**
 * Build a seeded generator.
 *
 * A numeric seed is its own decimal string, so `makeRng(42)` and `makeRng('42')`
 * are the same stream — there is one keyspace, not two.
 */
export function makeRng(seed: number | string): Rng {
  const key = typeof seed === 'number' ? String(seed) : seed;
  const seeder = xmur3(key);
  const next = sfc32(seeder(), seeder(), seeder(), seeder());
  for (let i = 0; i < WARMUP_ROUNDS; i++) next();

  let draws = 0;

  const rng = function uniform(): number {
    draws++;
    return next();
  } as Rng;

  Object.defineProperties(rng, {
    key: { value: key, enumerable: true },
    draws: { get: () => draws, enumerable: true },
  });

  rng.int = function int(nExclusive: number): number {
    if (!(nExclusive > 0)) {
      throw new RangeError(`Rng.int needs a positive bound, got ${nExclusive}`);
    }
    return Math.floor(rng() * nExclusive);
  };

  rng.range = function range(lo: number, hi: number): number {
    return lo + (hi - lo) * rng();
  };

  rng.bool = function bool(p: number): boolean {
    // p <= 0 and p >= 1 still DRAW, so a probability that happens to be
    // degenerate this tick cannot shift the stream relative to one that is not.
    return rng() < p;
  };

  rng.bell = function bell(): number {
    // U(0,1) x3 has mean 3/2 and variance 3/12 = 1/4, so subtracting 1.5 and
    // doubling gives mean 0, variance 1, support [-3, 3]. Exactly three draws,
    // unconditionally.
    return (rng() + rng() + rng() - 1.5) * 2;
  };

  rng.pick = function pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new RangeError('Rng.pick on an empty list');
    return xs[rng.int(xs.length)];
  };

  rng.fork = function fork(label: string): Rng {
    if (label.includes(FORK_SEP)) {
      throw new RangeError('Rng.fork label may not contain the path separator');
    }
    return makeRng(key + FORK_SEP + label);
  };

  return rng;
}
