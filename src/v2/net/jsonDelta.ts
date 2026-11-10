// ---------------------------------------------------------------------------
// A structural diff over plain JSON trees. PURE.
//
// ★ WHY THE WIRE NEEDS ONE. A live play yields one frame per sim tick, sixty a
// second, and a frame is about four kilobytes of JSON — nine fielders, their
// posts and speeds, the runners, the ball. Almost none of it changes from one
// tick to the next: seven of the nine fielders are standing still and every
// kid's top speed is the same number it was a tick ago. Sending what CHANGED
// is a few hundred bytes; sending the frame is a megabit and a half.
//
// ★ AND WHY IT IS GENERIC RATHER THAN A HAND-PICKED LIST OF "DYNAMIC" FIELDS.
// A list has to be kept in step with `PlayState` by hand, and the day a field
// is added to the sim and not to the list, the guest's kids stop doing whatever
// that field drives — silently, on one device, in a mode no headless test
// plays. A diff cannot fall behind the thing it diffs.
//
// The delta is itself plain JSON, so it rides the data channel as it is:
//   { $: value }   replace what is here with `value`
//   { _: 1 }       this key is gone
//   { k: delta }   look inside `k`
// `$` and `_` are therefore reserved: no object on the wire may use either as a
// key. `diff` throws on one rather than emitting a delta that means something
// else on arrival.
//
// Arrays of equal length are walked by index, so nine fielders cost only the
// fields that moved; an array whose LENGTH changed is replaced whole, which is
// exactly right for `events` (empty, then one event, then empty again).
// ---------------------------------------------------------------------------

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A replacement, a removal, or a map of child deltas. */
export type Delta = { $: Json } | { _: 1 } | { [key: string]: Delta };

const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What turns `a` into `b`, or `undefined` when they are already equal.
 * Neither argument is mutated or retained.
 */
export function diff(a: Json, b: Json): Delta | undefined {
  if (a === b) return undefined;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    let out: Record<string, Delta> | undefined;
    for (let i = 0; i < b.length; i++) {
      const d = diff(a[i], b[i]);
      if (d !== undefined) (out ??= {})[i] = d;
    }
    return out;
  }
  if (isObject(a) && isObject(b)) {
    let out: Record<string, Delta> | undefined;
    for (const key of Object.keys(b)) {
      if (key === '$' || key === '_') throw new Error(`jsonDelta: "${key}" is a reserved key`);
      const d = key in a ? diff(a[key], b[key]) : { $: b[key] };
      if (d !== undefined) (out ??= {})[key] = d;
    }
    for (const key of Object.keys(a)) {
      if (!(key in b)) (out ??= {})[key] = { _: 1 };
    }
    return out;
  }
  return { $: b };
}

/**
 * Apply a delta IN PLACE and return the result. In place is the contract, not
 * an optimisation: the guest's frame object is one object reused every tick,
 * exactly as the sim's is, so everything that already holds a reference to it
 * (or to a fielder inside it) sees the new tick.
 *
 * A replaced value is installed as received — the caller owns the delta and
 * must not reuse it afterwards.
 */
export function patch<T extends Json>(target: T, delta: Delta): T {
  if ('$' in delta) return (delta as { $: Json }).$ as T;
  const node = target as unknown as Record<string, Json>;
  for (const key of Object.keys(delta)) {
    const d = (delta as Record<string, Delta>)[key];
    if ('_' in d) {
      delete node[key];
    } else if ('$' in d) {
      node[key] = (d as { $: Json }).$;
    } else {
      node[key] = patch(node[key], d);
    }
  }
  return target;
}

/** A deep copy with floats rounded to 1/`k`: the wire has no use for sixteen digits. */
export function quantize(v: Json, k = 10_000): Json {
  const walk = (x: Json): Json => {
    if (typeof x === 'number') return Number.isInteger(x) ? x : Math.round(x * k) / k;
    if (Array.isArray(x)) return x.map(walk);
    if (isObject(x)) {
      const out: Record<string, Json> = {};
      for (const key of Object.keys(x)) out[key] = walk(x[key]);
      return out;
    }
    return x;
  };
  return walk(v);
}
