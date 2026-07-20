// ---------------------------------------------------------------------------
// The booth: two kid commentators — Pip (speaker 'A', a hyped little kid) and
// Rocco (speaker 'B', a deadpan older kid) — perched on a milk crate behind
// the backstop. PURE-ish (a tiny stateful picker with an injected rng): line
// pools per moment, a no-immediate-repeat rule, a rate limiter so the booth
// doesn't talk over itself, strict speaker alternation, and an occasional
// two-line call-and-response on the big moments. The scene feeds each line
// into audio.say() with the matching commentator VoiceProfile.
// ---------------------------------------------------------------------------

import { VOICE } from '../config';
import type { Speaker } from './voices';

export type AnnounceKind =
  | 'homer'
  | 'calledShot'
  | 'strikeoutSwinging'
  | 'strikeoutPitched'
  | 'hitSafe'
  | 'outRace'
  | 'doublePlay'
  | 'catch'
  | 'errorDrop'
  | 'errorWild'
  | 'stealSafe'
  | 'stealCaught'
  | 'walk'
  | 'sacFly'
  | 'crazyPitch'
  | 'bonk'
  | 'winning'
  | 'losing';

export interface AnnounceLine {
  text: string;
  speaker: Speaker;
}

const POOLS: Record<AnnounceKind, string[]> = {
  homer: [
    'It is GONE! That is a home run! Rocco, say something!',
    'See ya! That ball is going to a whole different recess!',
    'Kiss it goodbye! Home run, {name}!',
    'Over the fence! Somebody littler than me go get that!',
  ],
  calledShot: [
    'They called it! THEY ACTUALLY CALLED IT! Pip, did you see?!',
    'No way. NO WAY! Right where they pointed!',
    'Called shot! I am never doubting {name} again. Probably.',
  ],
  strikeoutSwinging: [
    'Swing and a miss — strike three!',
    'Struck em out! Go sit on the curb!',
    'Got em swinging! That is a strikeout, folks. The folks are us.',
    '{name} goes down swinging!',
  ],
  strikeoutPitched: [
    'Strike three! What a pitch!',
    'You struck em out! Rocco owes me a nickel!',
    'Down goes {name}! Strikeout!',
    'Filthy! I have gum older than that swing!',
  ],
  hitSafe: [
    'Base hit! Everybody is safe!',
    'That one found the grass! Safe!',
    '{name} is aboard! Write it down, Pip!',
    'A knock! Way to go, {name}!',
  ],
  outRace: [
    'Got em at the bag!',
    'Out! The throw beats em! Barely! But it counts!',
    'Not today! That is an OUT!',
    'What a play! Rocco, I am freaking out! He is not freaking out.',
  ],
  doublePlay: [
    'TWO! A double play! Are you kidding me?!',
    'Two outs, one ball! Pip just fell off the crate.',
    'Double play! That is the coolest thing I have seen since lunch!',
  ],
  catch: [
    'Caught it! What a grab!',
    'The fly ball is... snagged! Out!',
    '{name} squeezes it! Out!',
    'Right in the glove! I could do that. I could not.',
  ],
  errorDrop: [
    'Oh no, they dropped it!',
    'It popped out of the glove! Everybody run!',
    'Butterfingers! The ball is loose and so is Pip!',
  ],
  errorWild: [
    'The throw sails away! Take a base!',
    'Wild throw! It is rolling forever! It is still rolling, Rocco.',
    'Where are they throwing that?! Keep running!',
  ],
  stealSafe: [
    '{name} steals the base! What speed!',
    'Going... going... SAFE! Stolen base!',
    'Swiped it! The catcher never had a chance!',
  ],
  stealCaught: [
    'Caught stealing! The arm wins!',
    'The throw is down... GOT EM!',
    'Bad idea! Rocco said it was a bad idea! I did say that.',
  ],
  walk: [
    'Ball four — take your base!',
    'A walk! Free baseball! My favorite price!',
    'Four balls! Trot on down!',
  ],
  sacFly: [
    'The runner tags and SCORES! Sacrifice fly!',
    'Deep enough! Tag up and come home!',
    'A sac fly! That is TEAMWORK, Rocco!',
  ],
  crazyPitch: [
    'Here comes the CRAZY one! Look at it dance!',
    'What IS that pitch?! It went around my head!',
    'The crazy ball! Rocco, cover your juice box!',
  ],
  bonk: [
    'Off the tree! Play it, somebody!',
    'BONK! The old oak says no!',
    'Tree ball! Rocco says that is a legal play. It is.',
  ],
  winning: [
    'What a ballgame! You win! Pip is actually crying.',
    'Victory! The kids storm the field!',
    'That is the game! Best one since ever!',
  ],
  losing: [
    'Tough one today. Get em next recess!',
    'The other team takes it. Rematch tomorrow. Bring snacks.',
    'We lost the game but Rocco says we won the snacks. I did not say that.',
  ],
};

/** Short second-kid reactions for the big moments (call-and-response). */
const REACTS: Partial<Record<AnnounceKind, string[]>> = {
  homer: ['NO WAY!', 'I am telling the whole school!', 'That ball is in another zip code.'],
  calledShot: ['I need to sit down. I AM sitting down.', 'Unbelievable. Genuinely.'],
  doublePlay: ['TWO of them! At ONCE!', 'You owe me a juice box.'],
  outRace: ['So close! But no!', 'That is going in my diary.'],
  catch: ['Robbed! ROBBED!', 'What a glove.'],
  stealSafe: ['Zoom.', 'Did you even SEE them go?!'],
  stealCaught: ['Ouch.', 'Told ya.'],
  winning: ['Best day ever!', 'We should do this every recess.'],
  losing: ['Still fun though.', 'I want a rematch. Today.'],
  crazyPitch: ['My eyes hurt.', 'That should not be allowed. It is allowed.'],
};

/** Lower-priority calls are dropped while the booth is still "talking". */
export const ANNOUNCE_COOLDOWN_MS = 2500;

export class Announcer {
  private lastLine = '';
  private lastAt = -Infinity;
  private lastSpeaker: Speaker = 'B'; // Pip ('A') opens the game

  constructor(private rng: () => number = Math.random) {}

  /**
   * Lines for this moment, or null if the booth is busy (priority 1) or would
   * repeat itself. Priority 2 moments (homers, DPs) always speak — and can
   * come back as a two-line exchange where the other kid reacts.
   */
  line(
    kind: AnnounceKind,
    now: number,
    ctx: { name?: string } = {},
    priority: 1 | 2 = 1,
  ): AnnounceLine[] | null {
    if (priority < 2 && now - this.lastAt < ANNOUNCE_COOLDOWN_MS) return null;
    const pool = POOLS[kind];
    let pick = pool[Math.floor(this.rng() * pool.length) % pool.length];
    if (pick === this.lastLine && pool.length > 1) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    this.lastLine = pick;
    this.lastAt = now;
    // Alternate the booth — unless the line name-drops the other kid, which
    // pins it to the mouth it was written for (Pip talks about Rocco & v.v.).
    const speaker: Speaker = pick.includes('Rocco')
      ? 'A'
      : pick.includes('Pip')
        ? 'B'
        : this.lastSpeaker === 'A'
          ? 'B'
          : 'A';
    this.lastSpeaker = speaker;
    const lines: AnnounceLine[] = [
      { text: pick.replace('{name}', ctx.name ?? 'the kid'), speaker },
    ];
    const reacts = REACTS[kind];
    if (priority === 2 && reacts && this.rng() < VOICE.EXCHANGE_CHANCE) {
      const react = reacts[Math.floor(this.rng() * reacts.length) % reacts.length];
      lines.push({ text: react, speaker: speaker === 'A' ? 'B' : 'A' });
    }
    return lines;
  }
}

/** Exported for tests: every kind has a non-empty pool. */
export function poolSizes(): Record<AnnounceKind, number> {
  return Object.fromEntries(Object.entries(POOLS).map(([k, v]) => [k, v.length])) as Record<
    AnnounceKind,
    number
  >;
}
