// ---------------------------------------------------------------------------
// DEV-ONLY. Press L to see what the layout audit sees: every tagged chrome box
// in green, every tap target in blue, and any colliding pair in flashing red.
//
// This is a DEBUGGER, not a guard — the guard is `npm run audit:layout`. It
// deliberately reuses the same worldBox() and the same pure overlaps()/contains()
// predicates the CI gate uses, so what you see here is exactly what CI asserts.
//
// Menu scenes only. Its render path calls add.text, and add.text draws a UUID
// from Math.random — mounting it in GameScene or LineupScene would put that gun
// in the room with the seeded goldlog stream. See AGENTS.md "Gotchas".
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { worldBox, uiMeta, type Item } from '../ui/layout';
import { overlaps, contains, insideFrame, type Box } from '../ui/layoutMath';

const TOL = 2;
const MARGIN = 6;
const DEPTH = 9000;

function collect(scene: Phaser.Scene): Item[] {
  const out: Item[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const o of list) {
      if (uiMeta(o)) out.push(o as Item);
      const kids = (o as Phaser.GameObjects.Container).list;
      if (kids) walk(kids);
    }
  };
  walk(scene.children.list);
  return out;
}

/** b sits inside a in the display tree — a panel and its own label. */
function isDescendant(a: Item, b: Item): boolean {
  let p = b.parentContainer;
  while (p) {
    if (p === (a as unknown as Phaser.GameObjects.Container)) return true;
    p = p.parentContainer;
  }
  return false;
}

function hitBox(o: Item): Box | null {
  const input = (o as Phaser.GameObjects.GameObject).input;
  const h = input?.hitArea as Phaser.Geom.Rectangle | undefined;
  if (!h || typeof h.width !== 'number') return null;
  const d = o.getWorldTransformMatrix().decomposeMatrix();
  const isText = (o as Phaser.GameObjects.GameObject).type === 'Text';
  const t = o as unknown as { width: number; height: number; originX: number; originY: number };
  const lx = h.x + h.width / 2 - (isText ? t.width * t.originX : 0);
  const ly = h.y + h.height / 2 - (isText ? t.height * t.originY : 0);
  return {
    x: d.translateX + lx * d.scaleX,
    y: d.translateY + ly * d.scaleY,
    w: h.width * Math.abs(d.scaleX),
    h: h.height * Math.abs(d.scaleY),
  };
}

export function mountLayoutOverlay(scene: Phaser.Scene): void {
  let layer: Phaser.GameObjects.Container | undefined;

  const stroke = (g: Phaser.GameObjects.Graphics, b: Box, color: number, width = 1) => {
    g.lineStyle(width, color, 1);
    g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  };

  const render = (): Phaser.GameObjects.Container => {
    const c = scene.add.container(0, 0).setDepth(DEPTH);
    const g = scene.add.graphics();
    c.add(g);

    const items = collect(scene);
    // Overlap uses design-size boxes, matching the audit: a chip dimmed to 0.86
    // must not be able to hide a real collision.
    const boxes = items.map((o) => worldBox(o, true));
    const hits = items.map(hitBox);
    const findings: string[] = [];
    const hot = new Set<number>();

    boxes.forEach((b, i) => {
      if (!insideFrame(b, GAME_WIDTH, GAME_HEIGHT, MARGIN)) {
        hot.add(i);
        findings.push(`OUT_OF_FRAME  ${uiMeta(items[i])?.label ?? '?'}`);
      }
    });

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (isDescendant(items[i], items[j]) || isDescendant(items[j], items[i])) continue;
        const A = boxes[i];
        const B = boxes[j];
        const la = uiMeta(items[i])?.label ?? '?';
        const lb = uiMeta(items[j])?.label ?? '?';
        if (!contains(A, B, TOL) && !contains(B, A, TOL) && overlaps(A, B, TOL)) {
          hot.add(i);
          hot.add(j);
          findings.push(`OVERLAP       ${la} x ${lb}`);
        }
        const ha = hits[i];
        const hb = hits[j];
        if (ha && hb && overlaps(ha, hb, TOL)) {
          hot.add(i);
          hot.add(j);
          findings.push(`HIT_OVERLAP   ${la} x ${lb}`);
        }
      }
    }

    // Frame safe area.
    g.lineStyle(1, 0xffffff, 0.25);
    g.strokeRect(MARGIN, MARGIN, GAME_WIDTH - MARGIN * 2, GAME_HEIGHT - MARGIN * 2);
    hits.forEach((h) => h && stroke(g, h, 0x4aa3ff));
    boxes.forEach((b, i) => stroke(g, b, hot.has(i) ? 0xff3b30 : 0x3ddc84, hot.has(i) ? 3 : 1));

    const summary = findings.length
      ? `${findings.length} FINDING(S)\n${findings.slice(0, 12).join('\n')}`
      : 'LAYOUT CLEAN';
    c.add(
      scene.add
        .text(8, GAME_HEIGHT - 8, `${summary}\n${items.length} boxes   L: close`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: findings.length ? '#ff6b60' : '#3ddc84',
          backgroundColor: '#0b1520cc',
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0, 1)
    );

    if (findings.length) {
      scene.tweens.add({ targets: g, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 });
    }
    return c;
  };

  scene.input.keyboard?.on('keydown-L', () => {
    if (layer) {
      layer.destroy();
      layer = undefined;
    } else {
      layer = render();
    }
  });
}
