// ---------------------------------------------------------------------------
// Backyard-style labeled action cards stacked on the RIGHT screen edge — the
// shared factory behind the pitch-select stack (mound) and the swing-type
// stack (batting). Pure view: cards report taps via onSelect and restyle via
// setSelected; the caller owns all game meaning. Geometry in config.HUD.CARDS.
// Every card stops propagation — GameScene's scene-level tap swings/throws.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, HUD } from '../../config';
import { panel, FONT } from '../../ui/theme';

export interface CardDef {
  id: string;
  /** Big emoji on the card's left. */
  icon: string;
  /** Short word label (FAST, SLOW, BIG...). */
  label: string;
  /** Small bottom-right badge, e.g. a juice cost ('⚡60'). */
  sub?: string;
  /** Locked = dimmed + 🔒, not tappable (e.g. can't afford the juice). */
  locked?: boolean;
  /** Extra 8px gap above this card (groups base pitches vs specials). */
  gapBefore?: boolean;
}

export interface CardStack {
  destroy(): void;
  setSelected(id: string): void;
}

export function makeCardStack(
  scene: Phaser.Scene,
  opts: {
    cards: CardDef[];
    selectedId?: string;
    onSelect: (id: string) => void;
    pin: <T extends Phaser.GameObjects.GameObject>(o: T) => T;
  }
): CardStack {
  const { X, W, H, GAP, TOP_Y } = HUD.CARDS;
  const root = scene.add.container(0, 0).setDepth(94);
  let selected = opts.selectedId;
  const restyles: Array<() => void> = [];

  let y = TOP_Y;
  for (const def of opts.cards) {
    if (def.gapBefore) y += 8;
    const card = panel(scene, X, y, W, H, {
      fill: COLORS.cream,
      radius: 14,
      strokeWidth: 4,
      shadowAlpha: 0.15,
    });
    const icon = scene.add.text(-58, 0, def.icon, { fontSize: '22px' }).setOrigin(0.5);
    const label = scene.add
      .text(-38, 0, def.label, { fontFamily: FONT, fontSize: '16px', color: '#14202e', fontStyle: '700' })
      .setOrigin(0, 0.5);
    card.add([icon, label]);
    if (def.sub) {
      card.add(
        scene.add
          .text(W / 2 - 8, H / 2 - 6, def.sub, { fontFamily: FONT, fontSize: '11px', color: '#5a6672', fontStyle: '700' })
          .setOrigin(1, 1)
      );
    }
    if (def.locked) {
      card.setAlpha(0.5);
      card.add(scene.add.text(W / 2 - 26, -H / 2 + 12, '🔒', { fontSize: '13px' }).setOrigin(0.5));
    } else {
      // Repaint the panel graphics gold/cream on selection change.
      const gfx = card.getAt(0) as Phaser.GameObjects.Graphics;
      const paint = (fill: number) => {
        gfx.clear();
        gfx.fillStyle(0x26333f, 0.15);
        gfx.fillRoundedRect(-W / 2, -H / 2 + 7, W, H, 14);
        gfx.fillStyle(fill, 1);
        gfx.fillRoundedRect(-W / 2, -H / 2, W, H, 14);
        gfx.lineStyle(4, 0x26333f, 1);
        gfx.strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
      };
      const restyle = () => {
        const sel = def.id === selected;
        // Opaque either way — translucent cards let the fielders bleed through.
        paint(sel ? COLORS.gold : COLORS.cream);
        card.setScale(sel ? 1.06 : 1);
      };
      restyles.push(restyle);
      restyle();
      card.setInteractive(
        new Phaser.Geom.Rectangle(-W / 2, -H / 2, W, H),
        Phaser.Geom.Rectangle.Contains
      );
      card.on(
        'pointerdown',
        (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          selected = def.id;
          for (const r of restyles) r();
          opts.onSelect(def.id);
        }
      );
    }
    root.add(card);
    y += GAP;
  }

  opts.pin(root);
  return {
    destroy: () => root.destroy(),
    setSelected(id: string) {
      selected = id;
      for (const r of restyles) r();
    },
  };
}
