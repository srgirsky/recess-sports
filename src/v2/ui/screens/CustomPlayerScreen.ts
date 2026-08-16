// ---------------------------------------------------------------------------
// Make-your-own captain. Choices are pictures, swatches and short nicknames;
// no keyboard stands between a young player and the field.
// ---------------------------------------------------------------------------

import { HAIR_COLORS, SKIN_TONES } from '../../../art/palette';
import type { Accessory, HairStyle } from '../../../data/types';
import {
  CUSTOM_ACCESSORIES,
  CUSTOM_HAIR,
  CUSTOM_NAMES,
  CUSTOM_STYLES,
  DEFAULT_CUSTOM_PLAYER,
  customPlayerCharacter,
  type CustomPlayerProfile,
} from '../customPlayer';
import { button, el } from '../dom';
import { portrait } from '../portrait';
import type { Screen } from '../Router';

const HAIR_ICONS: Record<HairStyle, string> = {
  short: '✂️', curly: '➰', ponytail: '🎀', buzz: '▪️', mohawk: '⚡', bald: '✨',
  afro: '☁️', pigtails: '🎗️', spiky: '💥', bun: '🧶', long: '〰️',
};

const ACCESSORY_ICONS: Record<Accessory, string> = {
  none: '🙂', cap: '🧢', headband: '🎽', glasses: '👓', wheelchair: '🦽',
};

export class CustomPlayerScreen implements Screen {
  private profile: CustomPlayerProfile;
  private root!: HTMLElement;
  private art!: HTMLElement;
  private name!: HTMLElement;
  private tagline!: HTMLElement;

  constructor(
    start: CustomPlayerProfile | null,
    private readonly onSave: (profile: CustomPlayerProfile) => void,
    private readonly onBack: () => void
  ) {
    this.profile = { ...(start ?? DEFAULT_CUSTOM_PLAYER) };
  }

  mount(): HTMLElement {
    this.root = el('div', 'screen screen--custom-player');
    const panel = el('div', 'custom-player-panel');
    const preview = el('section', 'custom-player-preview');
    preview.appendChild(el('div', 'custom-player-preview__badge', '⭐ YOUR CAPTAIN'));
    this.art = el('div', 'custom-player-preview__art');
    this.name = el('h1', 'custom-player-preview__name');
    this.tagline = el('p', 'custom-player-preview__tag');
    preview.append(this.art, this.name, this.tagline);

    const choices = el('section', 'custom-player-choices');
    choices.append(
      this.row('📛 NAME', CUSTOM_NAMES.map((label, i) => this.choice(label.toUpperCase(), 'name', String(i), () => this.set({ name: i })))),
      this.row('⚾ PLAY LIKE', CUSTOM_STYLES.map((style) => this.choice(`${style.icon} ${style.label}`, 'style', style.id, () => this.set({ style: style.id })))),
      this.row('🙂 FACE', SKIN_TONES.map((color, i) => this.swatch(color, 'skin', String(i), `Skin tone ${i + 1}`, () => this.set({ skin: i })))),
      this.row('✂️ HAIR', CUSTOM_HAIR.map((hair) => this.choice(HAIR_ICONS[hair], 'hair', hair, () => this.set({ hair }), hair))),
      this.row('🎨 HAIR COLOR', HAIR_COLORS.map((color, i) => this.swatch(color, 'hairColor', String(i), `Hair color ${i + 1}`, () => this.set({ hairColor: i })))),
      this.row('🎒 GEAR', CUSTOM_ACCESSORIES.map((accessory) => this.choice(ACCESSORY_ICONS[accessory], 'accessory', accessory, () => this.set({ accessory }), accessory))),
      this.row('🔊 VOICE', [
        this.choice('A', 'voice', 'girl', () => this.set({ voice: 'girl' }), 'Voice A'),
        this.choice('B', 'voice', 'boy', () => this.set({ voice: 'boy' }), 'Voice B'),
      ])
    );

    const actions = el('div', 'custom-player-actions');
    actions.append(
      button('←', this.onBack, 'btn--quiet custom-player-back'),
      button('⭐  SAVE MY PLAYER', () => this.onSave({ ...this.profile }), 'btn--hero custom-player-save')
    );
    // The panel scrolls inside `.screen-scroll`; the actions stay on glass so
    // SAVE is always visible (round-2 re-audit's hero rule).
    panel.append(preview, choices);
    const scroll = el('div', 'screen-scroll');
    scroll.appendChild(panel);
    this.root.append(scroll, actions);
    this.paint();
    return this.root;
  }

  private row(label: string, controls: HTMLElement[]): HTMLElement {
    const row = el('div', 'custom-player-row');
    row.appendChild(el('h2', 'custom-player-row__label', label));
    const list = el('div', 'custom-player-row__choices');
    list.append(...controls);
    row.appendChild(list);
    return row;
  }

  private choice(
    label: string,
    field: keyof CustomPlayerProfile,
    value: string,
    onClick: () => void,
    aria = label
  ): HTMLButtonElement {
    const control = button(label, onClick, 'custom-choice');
    control.dataset.field = field;
    control.dataset.value = value;
    control.setAttribute('aria-label', aria);
    return control;
  }

  private swatch(
    color: string,
    field: keyof CustomPlayerProfile,
    value: string,
    aria: string,
    onClick: () => void
  ): HTMLButtonElement {
    const control = this.choice('', field, value, onClick, aria);
    control.classList.add('custom-swatch');
    control.style.setProperty('--swatch', color);
    return control;
  }

  private set(patch: Partial<CustomPlayerProfile>): void {
    this.profile = { ...this.profile, ...patch };
    this.paint();
  }

  private paint(): void {
    const kid = customPlayerCharacter(this.profile);
    this.art.replaceChildren(portrait(kid.visual, kid.name, { street: true }));
    this.name.textContent = `⭐ ${kid.name}`;
    this.tagline.textContent = kid.tagline;
    for (const control of this.root.querySelectorAll<HTMLElement>('.custom-choice')) {
      const field = control.dataset.field as keyof CustomPlayerProfile;
      control.classList.toggle('is-picked', String(this.profile[field]) === control.dataset.value);
    }
  }
}
