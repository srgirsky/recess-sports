// OWNER: ui agent. Palette access + color math + the sticker style kit.
//
// ARCHITECTURE rule: materials/palette.ts is the only file with hex values, so
// every color here is fetched at runtime via ctx.get('materials').rawColor(key)
// and derived shades are computed (mix/darken/rgba emit rgb()/rgba() strings,
// never hex literals). The font is a rounded-heavy SYSTEM stack — no downloads.

import type { Ctx } from '../core/ctx';

/** Rounded heavy system stack — Arial Rounded ships on macOS, the rest degrade politely. */
export const FONT =
  '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", "Trebuchet MS", Verdana, sans-serif';

export type Theme = {
  /** Palette key (or '#hex' passthrough upstream) → css color string. */
  c(key: string): string;
  /** Palette key at alpha → rgba() string. */
  rgba(key: string, a: number): string;
  /** Blend two palette keys → rgb() string (t=0 → a, t=1 → b). */
  mix(a: string, b: string, t: number): string;
  /** Darken a palette key toward ink → rgb() string. */
  dark(key: string, t: number): string;
  /** Lighten a palette key toward cream → rgb() string. */
  light(key: string, t: number): string;
  /** Raw [r,g,b] for canvas gradient work. */
  rgb(key: string): [number, number, number];
};

export function makeTheme(ctx: Ctx): Theme {
  const mats = ctx.get<{ rawColor(k: string): string }>('materials');

  const rgb = (key: string): [number, number, number] => {
    const h = mats.rawColor(key).replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const blend = (a: string, b: string, t: number): [number, number, number] => {
    const x = rgb(a);
    const y = rgb(b);
    return [0, 1, 2].map((i) => Math.round(x[i]! + (y[i]! - x[i]!) * t)) as [number, number, number];
  };
  const css = (v: [number, number, number]): string => `rgb(${v[0]},${v[1]},${v[2]})`;

  return {
    c: (key) => mats.rawColor(key),
    rgba: (key, a) => {
      const [r, g, b] = rgb(key);
      return `rgba(${r},${g},${b},${a})`;
    },
    mix: (a, b, t) => css(blend(a, b, t)),
    dark: (key, t) => css(blend(key, 'hudShadow', t)),
    light: (key, t) => css(blend(key, 'hudCream', t)),
    rgb,
  };
}

/** Shared sticker chassis: cream field, thick colored border, rounded corners,
 *  drop shadow, per-element rotation jitter (hardcoded constants — the HUD is
 *  chrome, not world, so it does not draw from the seeded rng). */
export function sticker(
  t: Theme,
  el: HTMLElement,
  opts: { bg?: string; border?: string; borderW?: number; radius?: number; rotDeg?: number; pad?: string },
): void {
  Object.assign(el.style, {
    position: 'absolute',
    background: opts.bg ?? t.c('hudCream'),
    border: `${opts.borderW ?? 4}px solid ${opts.border ?? t.c('hudInk')}`,
    borderRadius: `${opts.radius ?? 14}px`,
    boxShadow: `0 6px 12px ${t.rgba('hudShadow', 0.35)}, 0 2px 0 ${t.rgba('hudShadow', 0.2)}`,
    transform: `rotate(${opts.rotDeg ?? 0}deg)`,
    padding: opts.pad ?? '0',
    boxSizing: 'border-box',
  });
}

/** Heavy outlined label text — the card/verdict lettering. */
export function chunkyText(
  t: Theme,
  text: string,
  sizePx: number,
  fill: string,
  strokePx: number,
): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    fontFamily: FONT,
    fontWeight: '900',
    fontSize: `${sizePx}px`,
    lineHeight: '1',
    color: fill,
    letterSpacing: `${Math.max(0.5, sizePx * 0.02)}px`,
    webkitTextStroke: strokePx > 0 ? `${strokePx}px ${t.c('hudInk')}` : '',
    paintOrder: 'stroke fill',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
  return el;
}

/** Small rounded keyboard key chip (ESC / T / Z / C…). Never a flat rect. */
export function keyChip(t: Theme, label: string, sizePx = 26): HTMLElement {
  const el = document.createElement('span');
  el.textContent = label;
  Object.assign(el.style, {
    display: 'inline-block',
    fontFamily: FONT,
    fontWeight: '900',
    fontSize: `${Math.round(sizePx * 0.52)}px`,
    lineHeight: `${sizePx - 6}px`,
    minWidth: `${sizePx}px`,
    height: `${sizePx}px`,
    padding: '0 5px',
    textAlign: 'center',
    color: t.c('hudInk'),
    background: t.c('hudCream'),
    border: `2px solid ${t.dark('hudBlue', 0.25)}`,
    borderBottomWidth: '4px',
    borderRadius: '7px',
    boxSizing: 'border-box',
    boxShadow: `0 2px 3px ${t.rgba('hudShadow', 0.3)}`,
    verticalAlign: 'middle',
  });
  return el;
}
