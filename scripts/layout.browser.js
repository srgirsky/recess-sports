// ---------------------------------------------------------------------------
// Layout audit (browser-side). Walks a live scene's display list, converts every
// tagged piece of chrome to a world-space AABB, and reports collisions.
//
// Dependency-free and self-contained, like goldlog.browser.js: the driver
// (scripts/layout-audit.mjs) injects this file into the page, and you can paste
// it into any dev tab and call `layoutAuditScene('GameSetup')` by hand.
//
// WHAT COUNTS AS CHROME. Only objects carrying the `ui` data key that the
// UI-kit builders attach (see src/ui/layout.ts tagUi). That is deliberate: it
// excludes the field preview graphics, the 30 schoolyard kids, confetti, album
// sticker art, mow stripes — none of which should ever be in an overlap check —
// and it cannot drift as new decorative art lands. Untagged INTERACTIVE objects
// are reported separately, so new hand-rolled UI can't quietly escape.
//
// WHY BOXES AND NOT PIXELS. Half of the bug this was written for was a hit-area
// collision, which produces no pixel difference at all.
// ---------------------------------------------------------------------------

/* eslint-disable */

(function () {
  const FRAME = { w: 960, h: 640, margin: 6 };
  const TOL = 2; // overlap smaller than this is antialiasing, not a defect
  const MIN_TOUCH = 44;
  // Stroke bleed + drop shadow: drawn, but not part of the tappable face.
  const DECOR_PX = 8;

  /** Collect every tagged object in the scene, descending into containers. */
  function collect(scene) {
    const items = [];
    (function walk(list) {
      for (const o of list) {
        const m = o.getData && o.getData('ui');
        if (m) items.push({ o, m });
        if (o.list) walk(o.list);
      }
    })(scene.children.list);
    return items;
  }

  function name(m) {
    return m.label || m.role;
  }

  /** World-space AABB of the tagged box. `unscaled` ignores the object's own scale. */
  function boxOf(it, unscaled) {
    const d = it.o.getWorldTransformMatrix().decomposeMatrix();
    const sx = unscaled ? 1 : d.scaleX;
    const sy = unscaled ? 1 : d.scaleY;
    return {
      x: d.translateX + it.m.ox * d.scaleX,
      y: d.translateY + it.m.oy * d.scaleY,
      w: it.m.w * sx,
      h: it.m.h * sy,
      label: name(it.m),
    };
  }

  /**
   * World-space AABB of the tap target. Container hit areas are origin-centred;
   * Text hit areas are in top-left frame coords, so those need the origin backed
   * out first.
   */
  function hitOf(it) {
    const h = it.o.input && it.o.input.hitArea;
    if (!h || typeof h.width !== 'number') return null;
    const d = it.o.getWorldTransformMatrix().decomposeMatrix();
    const isText = it.o.type === 'Text';
    const lx = h.x + h.width / 2 - (isText ? it.o.width * it.o.originX : 0);
    const ly = h.y + h.height / 2 - (isText ? it.o.height * it.o.originY : 0);
    return {
      x: d.translateX + lx * d.scaleX,
      y: d.translateY + ly * d.scaleY,
      w: h.width * Math.abs(d.scaleX),
      h: h.height * Math.abs(d.scaleY),
      label: name(it.m),
    };
  }

  function overlap(a, b, tol) {
    const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    return dx > tol && dy > tol ? { dx: +dx.toFixed(1), dy: +dy.toFixed(1) } : null;
  }

  function contains(outer, inner, tol) {
    return (
      inner.x - inner.w / 2 >= outer.x - outer.w / 2 - tol &&
      inner.x + inner.w / 2 <= outer.x + outer.w / 2 + tol &&
      inner.y - inner.h / 2 >= outer.y - outer.h / 2 - tol &&
      inner.y + inner.h / 2 <= outer.y + outer.h / 2 + tol
    );
  }

  /** b sits inside a in the display tree — a panel and its own label. */
  function isDescendant(a, b) {
    let p = b.o.parentContainer;
    while (p) {
      if (p === a.o) return true;
      p = p.parentContainer;
    }
    return false;
  }

  function rect(b) {
    const r = (n) => Math.round(n);
    return `${r(b.x - b.w / 2)},${r(b.y - b.h / 2)}..${r(b.x + b.w / 2)},${r(b.y + b.h / 2)}`;
  }

  /**
   * Audit one live scene. `opts.loose` runs only the rules that survive a
   * fallback font (see the font-blocked pass in the driver).
   */
  window.layoutAuditScene = function (key, opts) {
    opts = opts || {};
    const game = window.__game;
    const scene = game.scene.getScene(key);
    if (!scene || !scene.scene.isActive()) return { scene: key, error: 'scene not active' };

    const items = collect(scene);
    // Overlap uses DESIGN-size boxes: scenes read "unselected" as setScale(0.86),
    // and measuring the shrunken box would let a real collision pass whenever a
    // chip happens to be dimmed.
    const boxes = items.map((it) => boxOf(it, true));
    const hits = items.map(hitOf);
    const findings = [];
    const add = (code, detail, a, b) => findings.push({ code, detail, a, b: b || null });

    items.forEach((it, i) => {
      const b = boxes[i];
      if (
        b.x - b.w / 2 < FRAME.margin ||
        b.x + b.w / 2 > FRAME.w - FRAME.margin ||
        b.y - b.h / 2 < FRAME.margin ||
        b.y + b.h / 2 > FRAME.h - FRAME.margin
      ) {
        add('OUT_OF_FRAME', `${b.label} [${rect(b)}]`, b.label);
      }
      if (opts.loose) return;
      if (it.m.overflow) add('FONT_FLOOR', `${b.label} hit its minFontSize and still overflowed`, b.label);
      const hb = hits[i];
      if (hb && (hb.w < MIN_TOUCH || hb.h < MIN_TOUCH)) {
        add('TOUCH_TOO_SMALL', `${hb.label} ${hb.w.toFixed(0)}x${hb.h.toFixed(0)}`, hb.label);
      }
      // A control you can see but can't fully tap. Compared against the SCALED
      // box, because the hit area is measured in that same space, and against
      // the box inset by DECOR_PX — the stroke bleed and drop shadow are not
      // tappable surface and demanding they be covered flags every button.
      if (hb && it.o.input) {
        const bs = boxOf(it, false);
        const core = {
          x: bs.x,
          y: bs.y,
          w: Math.max(0, bs.w - DECOR_PX * 2),
          h: Math.max(0, bs.h - DECOR_PX * 2),
        };
        if (!contains(hb, core, 0)) {
          add(
            'HIT_UNDERSIZED',
            `${b.label} face ${core.w.toFixed(0)}x${core.h.toFixed(0)} vs hit ${hb.w.toFixed(0)}x${hb.h.toFixed(0)}`,
            b.label
          );
        }
      }
    });

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (isDescendant(items[i], items[j]) || isDescendant(items[j], items[i])) continue;
        const A = boxes[i];
        const B = boxes[j];
        // A label inside its panel is layout working, not failing.
        if (!contains(A, B, TOL) && !contains(B, A, TOL)) {
          const o = overlap(A, B, TOL);
          if (o && !opts.loose) add('OVERLAP', `${A.label} x ${B.label} by ${o.dx}x${o.dy}`, A.label, B.label);
        }
        const ha = hits[i];
        const hb = hits[j];
        if (ha && hb) {
          const o = overlap(ha, hb, TOL);
          if (o) add('HIT_OVERLAP', `${ha.label} x ${hb.label} by ${o.dx}x${o.dy}`, ha.label, hb.label);
        }
      }
    }

    // Anything interactive that nobody tagged is invisible to every rule above.
    const untagged = [];
    (function walk(list) {
      for (const o of list) {
        if (o.input && !(o.getData && o.getData('ui'))) untagged.push(o.type);
        if (o.list) walk(o.list);
      }
    })(scene.children.list);

    return { scene: key, tagged: items.length, untaggedInteractive: untagged.length, findings };
  };

  /** True when the brand font really loaded — otherwise every width is a lie. */
  window.layoutFontReady = function () {
    return !!(document.fonts && document.fonts.check('600 40px Fredoka'));
  };

  window.__layoutAuditReady = true;
})();
