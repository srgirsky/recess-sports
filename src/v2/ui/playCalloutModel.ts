// ---------------------------------------------------------------------------
// Big-play feedback, as a pure decision.
//
// BB2026 writes the verdict over the field in letters a child can read from
// across the room: STRIKE / SAFE / OUT, with EARLY or LATE beneath a swing.
// The sim already emits the umpire's verdict and the play's resolved hit type,
// so this file translates those facts and never re-judges a pitch or play.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';
import type { SpendKind } from '../sim/juice';

export type PlayCalloutKind = 'ball' | 'strike' | 'foul' | 'safe' | 'out' | 'homer' | 'spend';

/** What each spend is called over the field — an icon carries it; the word is short. */
const SPEND_LABELS: Record<SpendKind, string> = {
  powerSwing: '💥 POWER SWING!',
  turboLegs: '💨 TURBO LEGS!',
  goldenGlove: '🧤 GOLDEN GLOVE!',
  // The three special pitches (`features.specialPitches`) are spends too, and
  // the icon is the card's — a kid connects the callout to what he tapped.
  crazy: '🤪 CRAZY BALL!',
  fireball: '☄️ BLAZE!',
  freezeball: '🧊 FLOATER!',
};

/**
 * ★ THE VERDICT STAYS UP LONG ENOUGH TO READ. The first beat was one 1050ms
 * CSS pop that sat fully opaque for ~650ms of it (16%..78%) — a blink for a
 * four-year-old, and BB2026 holds its verdicts. The approved bar
 * (docs/research/backyard-2026-reference.md, 2026-09-29) is at least 1.2s at
 * full strength. The beat is data here so a test can hold it, and it runs on
 * the GAME's clock (`PlayCallouts.tick`), so pause freezes it and an
 * instrument painting the fixed clock paints what a player sees.
 */
export const CALLOUT_BEAT = { popMs: 170, holdMs: 1250, fadeMs: 280 } as const;
export const CALLOUT_TOTAL_MS = CALLOUT_BEAT.popMs + CALLOUT_BEAT.holdMs + CALLOUT_BEAT.fadeMs;

/** The pop, the hold and the fade as Web Animations keyframes. */
export function calloutKeyframes(motionScale = 1): Keyframe[] {
  const at = (ms: number) => ms / CALLOUT_TOTAL_MS;
  const t = (scale: number, rot: number, lift = -50) => `translate(-50%, ${lift}%) scale(${scale}) rotate(${rot}deg)`;
  return [
    { offset: 0, opacity: 0, transform: t(0.7, -2) },
    { offset: at(CALLOUT_BEAT.popMs * 0.6), opacity: 1, transform: t(1 + 0.12 * motionScale, 1) },
    { offset: at(CALLOUT_BEAT.popMs), opacity: 1, transform: t(1, -1) },
    { offset: at(CALLOUT_BEAT.popMs + CALLOUT_BEAT.holdMs), opacity: 1, transform: t(1, -1) },
    { offset: 1, opacity: 0, transform: t(0.98, -1, -56) },
  ];
}

export interface PlayCalloutModel {
  kind: PlayCalloutKind;
  label: string;
  detail: string | null;
}

function timingDetail(errorSec: number | null): string | null {
  if (errorSec === null) return null;
  if (errorSec < 0) return 'EARLY';
  if (errorSec > 0) return 'LATE';
  return 'ON TIME';
}

export function playCalloutFor(e: SimEvent): PlayCalloutModel | null {
  if (e.t === 'pitch') {
    switch (e.kind) {
      case 'ball':
        return { kind: 'ball', label: e.balls === 3 ? 'WALK!' : 'BALL', detail: null };
      case 'calledStrike':
        return {
          kind: 'strike',
          label: e.strikes === 2 ? 'STRIKEOUT!' : 'STRIKE',
          detail: 'LOOKING',
        };
      case 'swingingStrike':
        return {
          kind: 'strike',
          label: e.strikes === 2 ? 'STRIKEOUT!' : 'STRIKE',
          detail: timingDetail(e.timingErrorSec),
        };
      case 'foulTip':
        return { kind: 'foul', label: 'FOUL', detail: timingDetail(e.timingErrorSec) };
      case 'inPlay':
        // The contact event arrives after the live play and owns the verdict.
        return null;
    }
  }

  if (e.t === 'pa') return null;
  if (e.t === 'spend') return { kind: 'spend', label: SPEND_LABELS[e.kind], detail: null };
  if (e.foul) return { kind: 'foul', label: 'FOUL', detail: timingDetail(e.timingErrorSec) };
  if (e.hit === 'HR') return { kind: 'homer', label: 'HOME RUN!', detail: 'TOUCH ’EM ALL' };
  if (e.hit === 'out') return { kind: 'out', label: 'OUT', detail: e.flyCaught ? 'NICE CATCH' : null };
  const detail = e.hit === '1B' ? 'SINGLE' : e.hit === '2B' ? 'DOUBLE' : 'TRIPLE';
  return { kind: 'safe', label: 'SAFE!', detail };
}
