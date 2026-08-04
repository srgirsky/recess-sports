// ---------------------------------------------------------------------------
// The three DOM helpers every screen needs, and nothing else.
//
// ★ THIS IS THE WHOLE OF WHAT v1's `ui/theme.ts` + `ui/layout.ts` DO HERE. v1
// had to compute rounded corners, stroke bleed and drop-shadow footprints by
// hand and then SOLVE a row's positions, because Phaser rectangles cannot round
// and a `pill()` sizes itself to its rendered text. CSS does all of that
// natively: `tokens.css` owns the look and grid owns the placement, so what is
// left is "make an element" and "make a button".
//
// The one rule that survives is v1's real one, and it is enforced by CSS rather
// than by discipline: a control is `.interactive`, which is both what opts it
// back into pointer events under `#hud` and what applies the `--tap-min` floor.
// You cannot make something tappable and forget to make it big enough, because
// it is the same class.
// ---------------------------------------------------------------------------

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A button.
 *
 * ★ ALWAYS `.interactive`, and that is not a convention — it is the class that
 * carries `min-inline-size`/`min-block-size: var(--tap-min)`, so a control that
 * is not interactive is also not guaranteed to be tappable. `scripts/v2/ui-audit.mjs`
 * measures every `.interactive` against that floor at six viewports.
 *
 * A real `<button>` rather than a styled div, so it is focusable and reachable
 * from a keyboard without a `tabindex` anyone has to remember.
 */
export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', `btn interactive ${className}`.trim());
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

/** Remove every child. Screens are rebuilt rather than diffed — they are rare. */
export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
