// ---------------------------------------------------------------------------
// The announcer. PURE-ish (a tiny stateful picker with an injected rng): line
// pools per moment, a no-immediate-repeat rule, and a rate limiter so the
// booth doesn't talk over itself. The scene feeds lines into audio.say().
// ---------------------------------------------------------------------------

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

const POOLS: Record<AnnounceKind, string[]> = {
  homer: [
    'It is GONE! Home run!',
    'See ya! That ball is outta here!',
    'Kiss it goodbye! Home run, {name}!',
    'Over the fence! Somebody go get that!',
  ],
  calledShot: ['He called it! HE ACTUALLY CALLED IT!', 'No way. NO WAY! Right where he pointed!'],
  strikeoutSwinging: [
    'Swing and a miss — strike three!',
    'Struck him out! Sit down!',
    'Got him swinging! That is a strikeout.',
    '{name} goes down swinging!',
  ],
  strikeoutPitched: [
    'Strike three! What a pitch!',
    'You struck him out! Nice pitching!',
    'Down goes {name}! Strikeout!',
    'Filthy! Another K!',
  ],
  hitSafe: [
    'Base hit! Everybody is safe!',
    'That one found the grass! Safe!',
    '{name} is aboard!',
    'A knock! Way to go, {name}!',
  ],
  outRace: [
    'Got him at the bag!',
    'Out! The throw beats him!',
    'Not today! He is OUT!',
    'What a play! Out at the base!',
  ],
  doublePlay: [
    'TWO! A double play! Are you kidding me?',
    'Twin killing! Two outs on one ball!',
    'Double play! The infield turns two!',
  ],
  catch: [
    'Caught it! What a grab!',
    'The fly ball is... snagged! Out!',
    '{name} squeezes it! Out!',
    'Right in the glove!',
  ],
  errorDrop: [
    'Oh no, he dropped it!',
    'It popped out of the glove! Everybody run!',
    'Butterfingers! The ball is loose!',
  ],
  errorWild: [
    'The throw sails away! Take a base!',
    'Wild throw! It is rolling forever!',
    'Where is he throwing that?! Keep running!',
  ],
  stealSafe: [
    '{name} steals the base! What speed!',
    'He is going... SAFE! Stolen base!',
    'Swiped it! The catcher never had a chance!',
  ],
  stealCaught: [
    'Caught stealing! The arm wins!',
    'The throw is down... GOT HIM!',
    'Bad idea! Thrown out at the bag!',
  ],
  walk: ['Ball four — take your base!', 'A walk! Free baseball!', 'Four balls! Trot on down!'],
  sacFly: [
    'The runner tags and SCORES! Sacrifice fly!',
    'Deep enough! He tags up and comes home!',
  ],
  crazyPitch: ['Here comes the CRAZY one! Look at it dance!', 'What IS that pitch?! It is everywhere!'],
  bonk: ['Off the tree! Play it, somebody!', 'BONK! The old oak says no!'],
  winning: ['What a ballgame! You win!', 'Victory! The kids storm the field!'],
  losing: ['Tough one today. Get em next recess!', 'The other team takes it. Rematch tomorrow!'],
};

/** Lower-priority calls are dropped while the booth is still "talking". */
export const ANNOUNCE_COOLDOWN_MS = 2500;

export class Announcer {
  private lastLine = '';
  private lastAt = -Infinity;

  constructor(private rng: () => number = Math.random) {}

  /**
   * Pick a line for this moment, or null if the booth is busy (priority 1)
   * or would repeat itself. Priority 2 moments (homers, DPs) always speak.
   */
  line(kind: AnnounceKind, now: number, ctx: { name?: string } = {}, priority: 1 | 2 = 1): string | null {
    if (priority < 2 && now - this.lastAt < ANNOUNCE_COOLDOWN_MS) return null;
    const pool = POOLS[kind];
    let pick = pool[Math.floor(this.rng() * pool.length) % pool.length];
    if (pick === this.lastLine && pool.length > 1) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    this.lastLine = pick;
    this.lastAt = now;
    return pick.replace('{name}', ctx.name ?? 'the kid');
  }
}

/** Exported for tests: every kind has a non-empty pool. */
export function poolSizes(): Record<AnnounceKind, number> {
  return Object.fromEntries(Object.entries(POOLS).map(([k, v]) => [k, v.length])) as Record<
    AnnounceKind,
    number
  >;
}
