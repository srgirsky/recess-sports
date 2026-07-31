// ---------------------------------------------------------------------------
// The generator is a published one, so uniformity is a sanity check, not the
// point. The point is `fork` INDEPENDENCE — that is the property this file
// exists for, and the one that has to hold for the conformance harness to mean
// anything.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { makeRng, type Rng } from './rng';

/** n raw draws as an array. */
function take(rng: Rng, n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = rng();
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db);
}

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    expect(take(makeRng(42), 64)).toEqual(take(makeRng(42), 64));
    expect(take(makeRng('recess'), 64)).toEqual(take(makeRng('recess'), 64));
  });

  it('treats a numeric seed as its own decimal string — one keyspace, not two', () => {
    expect(take(makeRng(42), 32)).toEqual(take(makeRng('42'), 32));
  });

  it('gives different seeds different streams', () => {
    expect(take(makeRng(1), 32)).not.toEqual(take(makeRng(2), 32));
    // Adjacent seeds are the hard case: xmur3 + the warm-up is what stops two
    // nearby keys from opening with correlated values.
    const a = take(makeRng(1000), 4096);
    const b = take(makeRng(1001), 4096);
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.03);
  });

  it('stays inside [0, 1)', () => {
    // Folded, not spread: `Math.min(...xs)` on 200k values overflows the call
    // stack, which fails as a RangeError that looks like a generator bug.
    const rng = makeRng('bounds');
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 200_000; i++) {
      const v = rng();
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(1);
  });

  it('is uniform to a chi-square test', () => {
    const BINS = 256;
    const N = 256_000;
    const counts = new Array<number>(BINS).fill(0);
    const rng = makeRng('uniformity');
    for (let i = 0; i < N; i++) counts[Math.floor(rng() * BINS)]++;
    const expected = N / BINS;
    let chi2 = 0;
    for (const c of counts) chi2 += ((c - expected) * (c - expected)) / expected;
    // 255 df, upper 0.1% critical value ~ 330.5.
    expect(chi2).toBeLessThan(330.5);
  });

  it('counts its draws, and only its own', () => {
    const rng = makeRng('draws');
    expect(rng.draws).toBe(0);
    take(rng, 10);
    expect(rng.draws).toBe(10);
    rng.int(6);
    expect(rng.draws).toBe(11);
    // A fork is a separate generator with its own counter.
    const child = rng.fork('x');
    take(child, 3);
    expect(child.draws).toBe(3);
    expect(rng.draws).toBe(11);
  });
});

describe('the helpers', () => {
  it('int stays in range and covers it', () => {
    const rng = makeRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('int refuses a non-positive bound rather than returning junk', () => {
    const rng = makeRng('int-bad');
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-1)).toThrow(RangeError);
  });

  it('range stays in range', () => {
    const rng = makeRng('range');
    for (let i = 0; i < 5000; i++) {
      const v = rng.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it('bool draws even when the probability is degenerate', () => {
    // Otherwise a probability that happens to be 0 or 1 this tick shifts the
    // stream relative to one that is not — the same class of bug as v1's
    // "errors-off skips the roll", but silent.
    const a = makeRng('bool');
    a.bool(0);
    a.bool(1);
    expect(a.draws).toBe(2);
    expect(makeRng('bool').bool(0)).toBe(false);
    expect(makeRng('bool').bool(1)).toBe(true);
  });

  it('pick covers the list and refuses an empty one', () => {
    const rng = makeRng('pick');
    const xs = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(rng.pick(xs));
    expect(seen.size).toBe(3);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('fork independence — the reason this file exists', () => {
  it('gives a substream that does not depend on whether its siblings exist', () => {
    // The v1 failure this prevents: adding, removing or reordering a draw
    // somewhere else shifts every later value. Here, `contact` must be the same
    // stream whether or not `fielding` was ever forked or drawn from.
    const alone = makeRng(7).fork('contact');

    const withSibling = makeRng(7);
    const sibling = withSibling.fork('fielding');
    take(sibling, 500);
    const contact = withSibling.fork('contact');

    expect(take(contact, 64)).toEqual(take(alone, 64));
  });

  it('does not depend on fork ORDER', () => {
    const r1 = makeRng('order');
    const a1 = r1.fork('a');
    const b1 = r1.fork('b');

    const r2 = makeRng('order');
    const b2 = r2.fork('b');
    const a2 = r2.fork('a');

    expect(take(a1, 32)).toEqual(take(a2, 32));
    expect(take(b1, 32)).toEqual(take(b2, 32));
  });

  it('does not depend on how far the PARENT has been drawn', () => {
    const early = makeRng('parent').fork('child');
    const late = makeRng('parent');
    take(late, 1000);
    expect(take(late.fork('child'), 32)).toEqual(take(early, 32));
  });

  it('gives different labels genuinely uncorrelated streams', () => {
    const root = makeRng('corr');
    const a = take(root.fork('contact'), 20_000);
    const b = take(root.fork('fielding'), 20_000);
    expect(a).not.toEqual(b);
    // SE of r at n=20,000 is 0.0071, so 0.03 is > 4 SE. Deterministic, so this
    // is a fixed number, not a flaky threshold.
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.03);
  });

  it('keys substreams by the whole path, and forbids the label that would collide', () => {
    const SEP = '\u0000';
    const root = makeRng('nest');
    expect(root.fork('a').key).toBe(`nest${SEP}a`);
    expect(root.fork('a').fork('b').key).toBe(`nest${SEP}a${SEP}b`);

    // Keys are built by concatenation, so a label containing the separator
    // would make fork('a<SEP>b') and fork('a').fork('b') the SAME stream — two
    // substreams silently sharing values, the exact failure fork prevents.
    // Rejected, so it cannot happen rather than merely being unlikely.
    expect(() => root.fork(`a${SEP}b`)).toThrow(RangeError);
  });

  it('root seeds stay independent under the same label', () => {
    const a = take(makeRng('seedA').fork('contact'), 32);
    const b = take(makeRng('seedB').fork('contact'), 32);
    expect(a).not.toEqual(b);
  });
});
