// ---------------------------------------------------------------------------
// This game's BOX SCORE — PURE, v1 only. Backyard Baseball 2001 kept a running
// line for every kid ("1 FOR 1 TODAY, 1 1B" under the batter, "2 PT, 0 K, 0 BB"
// under the pitcher) and crowned a Player of the Game from what actually
// happened. `stats.ts` is the season ledger and is shared with v2's sim, so
// its KidStats stays narrow; this richer per-game record lives here, beside it,
// and nothing outside v1 imports it.
//
// The scene emits plain BoxEvents at moments it already knows about and
// foldBox reduces them. No rng, no clock — so tallying can never move the
// seeded game.
// ---------------------------------------------------------------------------

export interface BoxLine {
  /** Official at-bats (walks don't count). */
  ab: number;
  /** Hits — reaching on contact, playground scoring (errors count). */
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  /** Runs scored. */
  r: number;
  /** Walks drawn. */
  bb: number;
  /** Struck out (as the batter). */
  so: number;
  /** Stolen bases. */
  sb: number;
  /** Pitches thrown (BB2001's "PT"). */
  pt: number;
  /** Strikeouts thrown (as the pitcher). */
  k: number;
  /** Walks allowed (as the pitcher). */
  bbAllowed: number;
  /** Balls caught in the air (as a fielder). */
  catches: number;
}

/** How a plate appearance ended. `bases` 1-4 is a hit of that length. */
export type PaResult = { kind: 'hit'; bases: 1 | 2 | 3 | 4 } | { kind: 'out' } | { kind: 'k' } | { kind: 'walk' };

export type BoxEvent =
  | { t: 'pa'; kid: string; pitcher?: string; result: PaResult; rbi: number }
  | { t: 'run'; kid: string }
  | { t: 'sb'; kid: string }
  | { t: 'pitch'; pitcher: string }
  | { t: 'catch'; kid: string };

export const EMPTY_BOX: BoxLine = {
  ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, r: 0, bb: 0, so: 0, sb: 0,
  pt: 0, k: 0, bbAllowed: 0, catches: 0,
};

/** Fold events into a box (returns a new record; inputs untouched). */
export function foldBox(base: Record<string, BoxLine>, events: BoxEvent[]): Record<string, BoxLine> {
  const out: Record<string, BoxLine> = {};
  for (const [id, l] of Object.entries(base)) out[id] = { ...l };
  const line = (id: string) => (out[id] ??= { ...EMPTY_BOX });
  for (const e of events) {
    switch (e.t) {
      case 'pa': {
        const l = line(e.kid);
        l.rbi += Math.max(0, e.rbi);
        const r = e.result;
        if (r.kind === 'walk') {
          l.bb += 1;
          if (e.pitcher) line(e.pitcher).bbAllowed += 1;
          break;
        }
        l.ab += 1;
        if (r.kind === 'k') {
          l.so += 1;
          if (e.pitcher) line(e.pitcher).k += 1;
        } else if (r.kind === 'hit') {
          l.h += 1;
          if (r.bases === 2) l.doubles += 1;
          else if (r.bases === 3) l.triples += 1;
          else if (r.bases === 4) l.hr += 1;
        }
        break;
      }
      case 'run':
        line(e.kid).r += 1;
        break;
      case 'sb':
        line(e.kid).sb += 1;
        break;
      case 'pitch':
        line(e.pitcher).pt += 1;
        break;
      case 'catch':
        line(e.kid).catches += 1;
        break;
    }
  }
  return out;
}

const plural = (n: number, one: string, many = one) => `${n} ${n === 1 ? one : many}`;

/**
 * The batter's "today" line for the AT BAT block, BB2001-style: the hits
 * first, then what they were worth. '' until they've done anything.
 * "2-for-3 · HR · 2B · 3 RBI".
 */
export function todayLine(l: BoxLine | undefined): string {
  if (!l || (l.ab === 0 && l.bb === 0)) return '';
  const parts = [`${l.h}-for-${l.ab}`];
  const xbh = (n: number, tag: string) => {
    if (n === 1) parts.push(tag);
    else if (n > 1) parts.push(`${n} ${tag}`);
  };
  xbh(l.hr, 'HR');
  xbh(l.triples, '3B');
  xbh(l.doubles, '2B');
  if (l.rbi > 0) parts.push(`${l.rbi} RBI`);
  if (l.bb > 0) parts.push(plural(l.bb, 'BB'));
  if (l.sb > 0) parts.push(plural(l.sb, 'SB'));
  return parts.join(' · ');
}

/** The pitcher's line: "14 PITCHES · 3 K · 1 BB". '' before the first pitch. */
export function pitcherLine(l: BoxLine | undefined): string {
  if (!l || l.pt === 0) return '';
  const parts = [plural(l.pt, 'PITCH', 'PITCHES')];
  if (l.k > 0) parts.push(`${l.k} K`);
  if (l.bbAllowed > 0) parts.push(`${l.bbAllowed} BB`);
  return parts.join(' · ');
}

/**
 * How much a kid's game was worth — the Player of the Game ranking. Weighted
 * so a homer beats a single, a run driven in counts like a run scored, and a
 * pitcher's strikeouts and a fielder's catches can win it too. Striking out
 * costs a little, never enough to sink a kid who also did something.
 */
export function gameScore(l: BoxLine): number {
  const singles = l.h - l.doubles - l.triples - l.hr;
  return (
    singles * 2 + l.doubles * 3 + l.triples * 4 + l.hr * 6 +
    l.rbi * 2 + l.r * 2 + l.bb + l.sb * 1.5 +
    l.k * 1.5 + l.catches * 1.5 -
    l.so * 0.5
  );
}

/**
 * The Player of the Game from `team` (in team order, so a tie goes to the
 * earlier kid — the lineup order the player chose). null when nobody on the
 * team did anything worth crowning; the caller falls back to its old pick.
 */
export function playerOfTheGame(box: Record<string, BoxLine>, team: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const id of team) {
    const l = box[id];
    if (!l) continue;
    const s = gameScore(l);
    if (s > bestScore) {
      best = id;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Up to `max` short brag chips for the Player of the Game card, biggest first:
 * "2 HOMERS", "4 RBI", "3 K". Always at least the hit line if they batted.
 */
export function highlights(l: BoxLine, max = 3): string[] {
  const out: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) out.push(n === 1 ? one : `${n} ${many}`);
  };
  add(l.hr, 'HOME RUN', 'HOMERS');
  add(l.triples, 'TRIPLE', 'TRIPLES');
  add(l.doubles, 'DOUBLE', 'DOUBLES');
  if (l.rbi > 0) out.push(`${l.rbi} RBI`);
  if (l.k > 0) out.push(`${l.k} K`);
  add(l.sb, 'STOLEN BASE', 'STEALS');
  add(l.catches, 'BIG CATCH', 'CATCHES');
  if (l.r > 0) out.push(plural(l.r, 'RUN', 'RUNS'));
  if (out.length === 0 && l.ab > 0) out.push(`${l.h}-FOR-${l.ab}`);
  return out.slice(0, max);
}
