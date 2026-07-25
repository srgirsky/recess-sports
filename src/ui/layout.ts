// ---------------------------------------------------------------------------
// The Phaser side of the layout system: read what an object ACTUALLY measures,
// then place it. The solver math lives in layoutMath.ts (pure, unit-tested).
//
// MEASURE-THEN-PLACE, never build-and-place. `scene.add.text(...)` is the only
// UI call that draws from Math.random (Phaser stamps each Text with a UUID
// texture key), so a factory that batched construction would reorder those draws
// and shift the seeded goldlog stream. Placing already-built objects only calls
// setX/setY/setScale/setInteractive, all of which consume zero rng — this module
// is fingerprint-neutral by construction. See AGENTS.md "Gotchas".
//
// Every UI-kit builder tags itself via `tagUi()` with its TRUE footprint —
// including the panel stroke bleed, the drop shadow, and makeButton's bottom
// lip — so nothing downstream has to guess at those. That tag is also how the
// layout audit (scripts/layout.browser.js) knows what counts as chrome.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { solveRow, solveColumn, type Box } from './layoutMath';

export type UiRole = 'panel' | 'ribbon' | 'pill' | 'heading' | 'button' | 'icon' | 'card';

export interface UiMeta {
  role: UiRole;
  /** Box center offset from the object's origin, in the object's local units. */
  ox: number;
  oy: number;
  /** Box size INCLUDING stroke bleed / shadow / lip, in local units. */
  w: number;
  h: number;
  /** Human-readable name, so audit failures name the thing you can see. */
  label?: string;
  /** Set when a maxW shrink hit its minFontSize floor and still didn't fit. */
  overflow?: boolean;
}

/** Anything with a transform we can place — Container, Text, Image. */
export type Item = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform & { setScale(x: number, y?: number): unknown };

export const UI_KEY = 'ui';

/** Publish an object's true footprint. Costs no rng — setData draws nothing. */
export function tagUi<T extends Phaser.GameObjects.GameObject>(o: T, meta: UiMeta): T {
  o.setData(UI_KEY, meta);
  return o;
}

export function uiMeta(o: Phaser.GameObjects.GameObject): UiMeta | undefined {
  return (o.getData?.(UI_KEY) as UiMeta) ?? undefined;
}

/**
 * Re-publish a Text's footprint after its content changed. New text is a new
 * width, and a stale measurement is exactly how a row quietly starts colliding
 * again — re-flow the row that owns it right after calling this.
 */
export function remeasureText(t: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const prev = uiMeta(t);
  return tagUi(t, {
    role: prev?.role ?? 'heading',
    ox: 0,
    oy: 0,
    w: t.width,
    h: t.height,
    label: t.text,
  });
}

/** Fall back to the container's own size for objects nobody tagged. */
function metaOf(o: Item): UiMeta {
  const m = uiMeta(o);
  if (m) return m;
  const anyO = o as unknown as { width?: number; height?: number };
  return { role: 'panel', ox: 0, oy: 0, w: anyO.width ?? 0, h: anyO.height ?? 0 };
}

/**
 * The object's box in its PARENT's space (its own scale applied).
 * `unscaled` reports the design-size box instead — what row/column place with,
 * and what the audit's overlap rule uses so a selection highlight that shrinks a
 * chip to 0.86 can never turn a real collision into a pass.
 */
export function localBox(o: Item, unscaled = false): Box {
  const m = metaOf(o);
  const sx = unscaled ? 1 : o.scaleX;
  const sy = unscaled ? 1 : o.scaleY;
  return { x: o.x + m.ox * sx, y: o.y + m.oy * sy, w: m.w * sx, h: m.h * sy };
}

/** The object's box in world space, resolving container nesting. */
export function worldBox(o: Item, unscaled = false): Box {
  const m = metaOf(o);
  const d = o.getWorldTransformMatrix().decomposeMatrix();
  const sx = unscaled ? 1 : d.scaleX;
  const sy = unscaled ? 1 : d.scaleY;
  return {
    x: d.translateX + m.ox * d.scaleX,
    y: d.translateY + m.oy * d.scaleY,
    w: m.w * sx,
    h: m.h * sy,
  };
}

export interface RowOpts {
  /** Center y for every item's BOX (not its origin — oy is compensated). */
  y?: number;
  /** Center the row here. Defaults to the canvas center. */
  centerX?: number;
  /** Left-anchor instead of centering. */
  left?: number;
  /** Right-anchor instead of centering. */
  right?: number;
  gap?: number;
  minGap?: number;
  maxW?: number;
  minScale?: number;
  /** false = report the squeeze via the returned box, don't shrink the items. */
  applyScale?: boolean;
}

/**
 * Place already-built items on one row, spaced by their MEASURED widths.
 * Returns the row's bounding box. Safe to call again after a label changes.
 */
export function row(items: Item[], opts: RowOpts = {}): Box {
  const live = items.filter(Boolean);
  if (live.length === 0) return { x: 0, y: opts.y ?? 0, w: 0, h: 0 };

  const metas = live.map((i) => metaOf(i));
  const sol = solveRow({
    widths: metas.map((m) => m.w),
    gap: opts.gap ?? 16,
    minGap: opts.minGap,
    maxW: opts.maxW,
    minScale: opts.minScale,
  });

  const scale = opts.applyScale === false ? 1 : sol.scale;
  const originX =
    opts.left != null
      ? opts.left + sol.width / 2
      : opts.right != null
        ? opts.right - sol.width / 2
        : (opts.centerX ?? GAME_WIDTH / 2);

  let maxH = 0;
  live.forEach((item, i) => {
    if (scale !== 1) item.setScale(scale);
    item.setX(originX + sol.offsets[i]);
    // `y` names where the BOX should sit; back out the shadow/lip offset so a
    // pill and a heading on the same row read as vertically centered together.
    if (opts.y != null) item.setY(opts.y - metas[i].oy * scale);
    maxH = Math.max(maxH, metas[i].h * scale);
  });

  return { x: originX, y: opts.y ?? live[0].y, w: sol.width, h: maxH };
}

export interface ColumnOpts {
  top: number;
  bottom?: number;
  gap?: number;
  justify?: 'start' | 'space-between';
}

/** Tallest measured height in a row, at design size. */
function rowHeight(r: Item[]): number {
  return r.reduce((h, i) => Math.max(h, metaOf(i).h), 0);
}

/** Put every item in the row's box centre on `y`. */
function placeRowY(r: Item[], y: number): void {
  for (const item of r) item.setY(y - metaOf(item).oy);
}

/**
 * Flow rows of items down a column, spacing by their measured heights.
 * Only touches y — pair it with row() for the horizontal pass.
 *
 * Heights are read at DESIGN size, ignoring each item's own scale, because a
 * selection highlight that shrinks a chip to 0.86 must never re-flow the page.
 */
export function column(rows: Item[][], opts: ColumnOpts): Box[] {
  const live = rows.map((r) => r.filter(Boolean));
  const heights = live.map(rowHeight);
  const centers = solveColumn(heights, {
    top: opts.top,
    bottom: opts.bottom,
    gap: opts.gap ?? 16,
    justify: opts.justify,
  });

  return live.map((r, i) => {
    placeRowY(r, centers[i]);
    let left = Infinity;
    let right = -Infinity;
    for (const item of r) {
      const b = localBox(item, true);
      left = Math.min(left, b.x - b.w / 2);
      right = Math.max(right, b.x + b.w / 2);
    }
    return {
      x: r.length ? (left + right) / 2 : 0,
      y: centers[i],
      w: r.length ? right - left : 0,
      h: heights[i],
    };
  });
}

/**
 * Flow GROUPS of rows down a column: rows inside a group hug each other at
 * `innerGap`, and all the leftover slack goes between the groups.
 *
 * This is the shape a settings page actually has — a heading belongs to the
 * pills under it, not to the whitespace above them. Spacing all ten rows
 * uniformly reads as ten unrelated things.
 */
export function columnGroups(
  groups: Item[][][],
  opts: ColumnOpts & { innerGap?: number }
): Box[] {
  const innerGap = opts.innerGap ?? 6;
  const live = groups.map((g) => g.map((r) => r.filter(Boolean)).filter((r) => r.length));
  const rowHs = live.map((g) => g.map(rowHeight));
  const groupHs = rowHs.map((hs) => hs.reduce((a, b) => a + b, 0) + innerGap * (hs.length - 1));

  const centers = solveColumn(groupHs, {
    top: opts.top,
    bottom: opts.bottom,
    gap: opts.gap ?? 16,
    justify: opts.justify ?? 'space-between',
  });

  live.forEach((g, gi) => {
    let cursor = centers[gi] - groupHs[gi] / 2;
    g.forEach((r, ri) => {
      placeRowY(r, cursor + rowHs[gi][ri] / 2);
      cursor += rowHs[gi][ri] + innerGap;
    });
  });

  return centers.map((y, i) => ({ x: 0, y, w: 0, h: groupHs[i] }));
}

export interface HitOpts {
  padX?: number;
  padY?: number;
  /** Smallest tap target, in canvas units. See MIN_TOUCH. */
  minTouch?: number;
  handCursor?: boolean;
}

/**
 * 52, not 44, because selection state shrinks chips.
 *
 * Scenes read "unselected" as `setScale(0.86)`, and Phaser transforms the
 * pointer into the container's local space — so a 44-unit rect on a dimmed chip
 * is really a 37.8-unit target. 52 x 0.86 = 44.7, which clears the guideline in
 * the state the chip actually spends most of its time in.
 */
export const MIN_TOUCH = 52;

/**
 * Derive the interactive rectangle from the object's MEASURED box.
 *
 * This retires the hand-written `Rectangle(-55, -22, 110, 44)` literals that
 * assumed a pill was exactly `minW` wide — the assumption that let tap targets
 * drift away from the shapes they belong to (and that someone had already
 * patched by hand twice in SchoolyardScene). `hitrect.lint.test.ts` keeps them
 * from coming back.
 */
export function hitFromBox(c: Phaser.GameObjects.Container, opts: HitOpts = {}): void {
  const { padX = 0, padY = 0, minTouch = MIN_TOUCH, handCursor = true } = opts;
  const m = metaOf(c as unknown as Item);
  const w = Math.max(m.w + padX * 2, minTouch);
  const h = Math.max(m.h + padY * 2, minTouch);
  c.setInteractive(
    new Phaser.Geom.Rectangle(m.ox - w / 2, m.oy - h / 2, w, h),
    Phaser.Geom.Rectangle.Contains
  );
  if (handCursor && c.input) c.input.cursor = 'pointer';
}
