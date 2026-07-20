// ---------------------------------------------------------------------------
// Field chatter, Backyard-Baseball style. PURE-ish (a tiny stateful picker
// with an injected rng, like Announcer): given a beat ('batterUp' when a kid
// steps in, 'fielding' when the defense settles), maybe pick a line for one
// kid — their signature chatterLines merged with a generic pool — in their
// own derived voice. Rate-limited on its own clock; the scene speaks it at
// audio mode 'chatter' (droppable), so it can never talk over the booth.
// ---------------------------------------------------------------------------

import { VOICE } from '../config';
import type { Character } from '../data/types';
import { kidVoice, type VoiceProfile } from './voices';

export type ChatterMoment = 'batterUp' | 'fielding';

export interface ChatterPick {
  text: string;
  profile: VoiceProfile;
}

/** Generic lines any kid can say (their signature chatterLines join these). */
const GENERIC: Record<ChatterMoment, string[]> = {
  batterUp: [
    "This one's going FAR.",
    'Easy. So easy.',
    'Okay. Okay okay okay. Focus.',
    'My grandma throws faster than this!',
    'I eat pitches like this for breakfast.',
    "I'm telling everyone about this hit already.",
    'Watch. WATCH.',
    'Just like practice. I skipped practice.',
  ],
  fielding: [
    'Hey batter batter!',
    'Hit it to me! Wait— don’t.',
    'Nothing gets past me! Mostly!',
    'Easy out, easy out!',
    'No batter, no batter!',
    "I'm ready! I was born ready!",
    'Two hands, everybody! Coach said!',
    'Is it my turn to catch it? It better not be.',
  ],
};

export class Chatter {
  private lastLine = '';
  private lastAt = -Infinity;

  constructor(private rng: () => number = Math.random) {}

  /** A kid line for this beat, or null (own cooldown + chance roll + no-repeat). */
  pick(moment: ChatterMoment, now: number, kid: Character): ChatterPick | null {
    if (now - this.lastAt < VOICE.CHATTER.COOLDOWN_MS) return null;
    if (this.rng() >= VOICE.CHATTER.CHANCE) return null;
    const pool = [...(kid.chatterLines ?? []), ...GENERIC[moment]];
    let text = pool[Math.floor(this.rng() * pool.length) % pool.length];
    if (text === this.lastLine && pool.length > 1) {
      text = pool[(pool.indexOf(text) + 1) % pool.length];
    }
    this.lastLine = text;
    this.lastAt = now;
    return { text, profile: kidVoice(kid) };
  }
}

/** Exported for tests. */
export function genericPoolSizes(): Record<ChatterMoment, number> {
  return { batterUp: GENERIC.batterUp.length, fielding: GENERIC.fielding.length };
}
