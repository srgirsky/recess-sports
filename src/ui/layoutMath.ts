// ---------------------------------------------------------------------------
// The layout solver: pure geometry for placing rows and columns of UI chrome.
//
// WHY THIS EXISTS. `pill()` sizes itself to MEASURED text (`max(minW, label.width
// + 32)`), but every scene used to place items at a hardcoded pitch (`x0 + i *
// PITCH`) computed as though the pill were exactly `minW` wide. When the rendered
// text ran wider than `pitch - 32` the row silently overlapped itself — and since
// emoji glyph widths differ per platform font fallback, a row that looked fine on
// one machine collided on another. Measure first, then place.
//
// RENDER-SIDE ONLY, like projection.ts / plateView.ts: never import this from
// systems/. Pure functions (no Phaser) so it stays vitest-testable — the Phaser
// adapter that reads real object sizes lives next door in layout.ts.
// ---------------------------------------------------------------------------

import { GAME_WIDTH, GAME_HEIGHT } from '../config';

/** An axis-aligned box. x,y are the CENTER (matching Phaser's setOrigin(0.5)). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RowSpec {
  /** Item widths, in order. */
  widths: number[];
  /** Desired gap between adjacent items. */
  gap: number;
  /** Floor the gap may shrink to before scaling engages. */
  minGap?: number;
  /** Total width budget. Undefined = unbounded. */
  maxW?: number;
  /** Legibility floor. Below this we report overflow instead of squashing further. */
  minScale?: number;
}

export interface RowSolution {
  /** Center x per item, relative to the row's center (0). Already scaled. */
  offsets: number[];
  /** Final total width of the row, after gap shrink and scaling. */
  width: number;
  /** The gap actually used (pre-scale). */
  gap: number;
  /** Uniform scale the caller should apply to every item. */
  scale: number;
  /** True when even minScale could not fit the budget — the caller must warn. */
  overflow: boolean;
}

export const DEFAULT_MIN_GAP = 10;
export const DEFAULT_MIN_SCALE = 0.85;

/**
 * Fit a run of items into an optional width budget.
 *
 * Order matters: we spend the gap first and only scale as a last resort, because
 * shrinking whitespace is invisible while shrinking a pill is not. Scaling then
 * clamps at `minScale` — going below that trades an overlap for illegible text,
 * which is not an improvement, so we report `overflow` and let the audit fail.
 */
export function solveRow(spec: RowSpec): RowSolution {
  const { widths, gap: wantGap, maxW } = spec;
  const minGap = spec.minGap ?? DEFAULT_MIN_GAP;
  const minScale = spec.minScale ?? DEFAULT_MIN_SCALE;
  const n = widths.length;
  if (n === 0) return { offsets: [], width: 0, gap: wantGap, scale: 1, overflow: false };

  const sum = widths.reduce((a, b) => a + b, 0);
  let gap = Math.max(0, wantGap);
  let total = sum + gap * (n - 1);

  // 1. Spend the gap down to its floor.
  if (maxW != null && total > maxW && n > 1) {
    gap = Math.max(minGap, (maxW - sum) / (n - 1));
    total = sum + gap * (n - 1);
  }

  // 2. Only then scale, clamped at the legibility floor.
  let scale = 1;
  let overflow = false;
  if (maxW != null && total > maxW) {
    scale = maxW / total;
    if (scale < minScale) {
      scale = minScale;
      overflow = true;
    }
    total *= scale;
  }

  const offsets: number[] = [];
  let cursor = -total / 2;
  for (let i = 0; i < n; i++) {
    const w = widths[i] * scale;
    offsets.push(cursor + w / 2);
    cursor += w + gap * scale;
  }
  return { offsets, width: total, gap, scale, overflow };
}

export interface ColumnSpec {
  /** Top edge of the column's budget. */
  top: number;
  /** Gap between rows (a floor when justify is 'space-between'). */
  gap: number;
  /** Bottom edge of the budget. Required for 'space-between'. */
  bottom?: number;
  /**
   * 'start' stacks from the top with exactly `gap`.
   * 'space-between' distributes the leftover slack evenly into the gaps — this
   * is what flows a screen without hand-tuned y constants.
   */
  justify?: 'start' | 'space-between';
}

/** Center y for each row, given each row's height. */
export function solveColumn(heights: number[], spec: ColumnSpec): number[] {
  const n = heights.length;
  if (n === 0) return [];
  const { top, bottom, justify = 'start' } = spec;
  let gap = Math.max(0, spec.gap);

  if (justify === 'space-between' && bottom != null && n > 1) {
    const sum = heights.reduce((a, b) => a + b, 0);
    const slack = bottom - top - sum - gap * (n - 1);
    if (slack > 0) gap += slack / (n - 1);
  }

  const centers: number[] = [];
  let cursor = top;
  for (let i = 0; i < n; i++) {
    centers.push(cursor + heights[i] / 2);
    cursor += heights[i] + gap;
  }
  return centers;
}

// --- Collision predicates (shared by the audit, the dev overlay, and tests) ---

/** Overlap by more than `tol` on BOTH axes. Touching edges are not an overlap. */
export function overlaps(a: Box, b: Box, tol = 0): boolean {
  const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return dx > tol && dy > tol;
}

/** The overlapping region, or null. Used to report a finding's severity. */
export function intersection(a: Box, b: Box): Box | null {
  const l = Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const r = Math.min(a.x + a.w / 2, b.x + b.w / 2);
  const t = Math.max(a.y - a.h / 2, b.y - b.h / 2);
  const bt = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  if (r <= l || bt <= t) return null;
  return { x: (l + r) / 2, y: (t + bt) / 2, w: r - l, h: bt - t };
}

/** `inner` sits entirely within `outer` (a label inside its panel is legal). */
export function contains(outer: Box, inner: Box, tol = 0): boolean {
  return (
    inner.x - inner.w / 2 >= outer.x - outer.w / 2 - tol &&
    inner.x + inner.w / 2 <= outer.x + outer.w / 2 + tol &&
    inner.y - inner.h / 2 >= outer.y - outer.h / 2 - tol &&
    inner.y + inner.h / 2 <= outer.y + outer.h / 2 + tol
  );
}

/** The box fits inside the canvas, keeping `margin` clear of every edge. */
export function insideFrame(b: Box, w = GAME_WIDTH, h = GAME_HEIGHT, margin = 0): boolean {
  return contains({ x: w / 2, y: h / 2, w: w - margin * 2, h: h - margin * 2 }, b);
}

// --- The HUD lanes ----------------------------------------------------------

/**
 * ★ `config.HUD`'s declared lanes as boxes, so "every screen-anchored element
 * claims its lane here so overlaps are a config review, not a scavenger hunt"
 * (HUD's own docstring) becomes a CHECKED claim instead of an aspiration.
 *
 * It was an aspiration. The practice/spectator exit button never claimed a lane
 * — it was a bare `pill(this, 480, 92, …)` inside GameScene — and it spent its
 * whole life sitting on the announcer band, drawing over every half-start
 * banner. Nothing could have caught that: `npm run audit:layout` walks MENU
 * scenes only, GameScene is deliberately excluded from its matrix (its HUD is
 * on the seeded goldlog path), and the banner is transient — alpha 0 at rest —
 * so even booting GameScene into the audit would not see the collision without
 * firing a `flashAnnounce` mid-settle, which the audit's spec schema has no
 * axis for.
 *
 * So the gate is here instead, over the DECLARATIONS rather than the pixels:
 * pure, no Phaser, no boot, runs in `npm test`. Its power comes entirely from
 * lanes being declared — which is why moving the exit button's number was not
 * enough, and it had to become `HUD.EXIT`.
 *
 * Only lanes with a real extent are returned. `SPEND_COL` / `STEAL` are column
 * anchors whose rows are sized by their content, and `JUICE` is a cluster of
 * separate anchors; they are excluded rather than guessed at, since inventing
 * an extent for them would make the test assert a fiction.
 */
export function hudLaneBoxes(hud: {
  STRIP: { CY: number; W: number; H: number };
  CARDS: { X: number; W: number; H: number; TOP_Y: number };
  ANNOUNCER: { CY: number; W: number; H: number };
  CORNER: { MUTE_X: number; PAUSE_X: number; Y: number };
  EXIT: { X: number; Y: number; W: number; H: number };
}): Record<string, Box> {
  // The two corner buttons are NOT the same size, and modelling them as if
  // they were is what first made this function report a collision that does
  // not exist. MuteButton widens its 30px glyph to MIN_TOUCH; the ⏸ button
  // takes Phaser's text bounds unchanged. See `CORNER_SPACING` below for the
  // constraint that fact hides.
  const MUTE_HIT = 52; // MIN_TOUCH, from MuteButton.ts
  const PAUSE_HIT = 34; // the bare 30px glyph's bounds
  return {
    STRIP: { x: GAME_WIDTH / 2, y: hud.STRIP.CY, w: hud.STRIP.W, h: hud.STRIP.H },
    // The card stack's TOP card only: the stack grows DOWNWARD from TOP_Y, so
    // the top card is the one that can reach up into the banner band.
    CARDS: { x: hud.CARDS.X, y: hud.CARDS.TOP_Y, w: hud.CARDS.W, h: hud.CARDS.H },
    ANNOUNCER: { x: GAME_WIDTH / 2, y: hud.ANNOUNCER.CY, w: hud.ANNOUNCER.W, h: hud.ANNOUNCER.H },
    MUTE: { x: hud.CORNER.MUTE_X, y: hud.CORNER.Y, w: MUTE_HIT, h: MUTE_HIT },
    PAUSE: { x: hud.CORNER.PAUSE_X, y: hud.CORNER.Y, w: PAUSE_HIT, h: PAUSE_HIT },
    EXIT: { x: hud.EXIT.X, y: hud.EXIT.Y, w: hud.EXIT.W, h: hud.EXIT.H },
  };
}

/**
 * The gap between the two corner buttons' centres, and the width they would
 * each need to be a legal tap target.
 *
 * ★ These disagree, and the disagreement is load-bearing. ⏸ is drawn as a bare
 * 30px glyph with no widened hit area, so it is an UNDERSIZED tap target for a
 * game whose audience is four to eight years old — and the obvious fix is to
 * give it the same `MIN_TOUCH` treatment `MuteButton` already applies. But the
 * centres are 48px apart against a 52px `MIN_TOUCH`, so doing only that would
 * put the two hit areas 4px into each other, and a mistap on ⏸ would mute.
 *
 * Recorded rather than fixed: widening ⏸ is a real improvement and belongs in
 * its own change, and whoever makes it has to move `CORNER` too. The test that
 * pins this pair is what will tell them.
 */
export const CORNER_SPACING = { gap: 48, minTouch: 52 };
