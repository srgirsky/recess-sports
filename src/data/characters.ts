// ---------------------------------------------------------------------------
// The neighborhood. 30 kids you can draft from.
//
// This file is CONTENT, not logic — add, remove, or rebalance kids freely.
// The 3 signature kids from the pitch use `ability` hooks; everyone else is
// `none` and is defined purely by their stats + look.
//
// Stats are 1-10. Aim for real trade-offs: sluggers can't run, speedsters
// can't hit for power, a few kids are weak-but-adorable, etc. The `visual`
// block drives the flat-mascot art (expression/hair/body/uniform/accessory).
// `draftLine` is the kid's own excited shout when picked (spoken in their
// derived voice — systems/voices.ts); `chatterLines` are optional signature
// field-chatter lines for the personality-forward kids (systems/chatter.ts
// has generic pools for everyone else).
// ---------------------------------------------------------------------------

import type { Character } from './types';

export const ROSTER: Character[] = [
  // --- The 3 signature kids -------------------------------------------------
  {
    id: 'nostrike',
    name: 'Junebug',
    emoji: '🎯',
    tagline: 'Never misses. Ever.',
    stats: { contact: 10, power: 3, speed: 6, pitching: 2, fielding: 6 },
    visual: { skin: 1, hair: 'ponytail', hairColor: 1, uniform: 2, accessory: 'headband', expression: 'determined', stance: 'crouch' },
    ability: 'never_strikes_out',
    draftLine: 'Smart pick. I literally never miss!',
    chatterLines: ['I never miss. Just saying.', 'Watch the ball. That is the whole secret.'],
  },
  {
    id: 'calls_shot',
    name: 'Big Talk Theo',
    emoji: '🗣️',
    tagline: 'Calls his shot. Always wrong.',
    stats: { contact: 5, power: 6, speed: 5, pitching: 4, fielding: 4 },
    visual: { skin: 3, hair: 'short', hairColor: 3, uniform: 4, accessory: 'cap', expression: 'grin', stance: 'high' },
    ability: 'calls_shot',
    draftLine: 'Best pick of your LIFE, right here!',
    chatterLines: ['This one is going over the fence. Guaranteed.', 'I called it. Whatever happens, I called it.'],
  },
  {
    id: 'wheelchair_ace',
    name: 'Zoom Ramirez',
    emoji: '🌀',
    tagline: "Throws a pitch nobody can hit. Not even him.",
    stats: { contact: 3, power: 4, speed: 7, pitching: 10, fielding: 7 },
    visual: { skin: 2, hair: 'spiky', hairColor: 0, uniform: 1, accessory: 'wheelchair', expression: 'cool' },
    ability: 'unhittable_pitch',
    draftLine: 'Yes! Nobody hits my pitch. Nobody.',
    chatterLines: ['Nobody hits the crazy ball.', 'Even I do not know where it goes.'],
  },

  // --- Sluggers (big power, slow) ------------------------------------------
  {
    id: 'big_lou',
    name: 'Big Lou',
    emoji: '💥',
    tagline: 'Hits it to the moon. Sometimes.',
    stats: { contact: 5, power: 10, speed: 2, pitching: 3, fielding: 2 },
    visual: { skin: 4, hair: 'buzz', hairColor: 3, uniform: 6, accessory: 'none', expression: 'goofy', bodyType: 'chunky', stance: 'open' },
    ability: 'none',
    draftLine: 'Moon shot time, baby!',
    chatterLines: ['I am hitting this one to the MOON.', 'Somebody hold my sandwich.'],
  },
  {
    id: 'tank',
    name: 'Tank',
    emoji: '🦍',
    tagline: 'Slow, strong, snacking.',
    stats: { contact: 4, power: 9, speed: 2, pitching: 4, fielding: 3 },
    visual: { skin: 2, hair: 'short', hairColor: 2, uniform: 3, accessory: 'none', expression: 'determined', bodyType: 'chunky', stance: 'open' },
    ability: 'none',
    draftLine: 'Tank smash! After snacks.',
    chatterLines: ['Tank ready.', 'Is it snack time or swing time?'],
  },
  {
    id: 'mimi_mash',
    name: 'Mimi Mash',
    emoji: '🔨',
    tagline: 'Swings for the fence. Only the fence.',
    stats: { contact: 4, power: 9, speed: 4, pitching: 2, fielding: 3 },
    visual: { skin: 0, hair: 'curly', hairColor: 5, uniform: 0, accessory: 'none', expression: 'grin', stance: 'high' },
    ability: 'none',
    draftLine: 'MASH TIME! Point me at the fence!',
    chatterLines: ['Fence, meet ball. Ball, fence.', 'I only know one swing. The BIG one.'],
  },

  // --- Speedsters (fast, contact-y, low power) -----------------------------
  {
    id: 'turbo',
    name: 'Turbo',
    emoji: '⚡',
    tagline: 'Already on second base.',
    stats: { contact: 7, power: 3, speed: 10, pitching: 3, fielding: 7 },
    visual: { skin: 1, hair: 'spiky', hairColor: 3, uniform: 4, accessory: 'none', expression: 'cool', bodyType: 'small', stance: 'open' },
    ability: 'none',
    draftLine: 'Fast pick! Get it? Because I am fast!',
    chatterLines: ['I am basically already on second.', 'Blink and you missed me.'],
  },
  {
    id: 'sprout',
    name: 'Sprout',
    emoji: '🌱',
    tagline: 'Tiny. Quick. Sneaky.',
    stats: { contact: 6, power: 2, speed: 9, pitching: 4, fielding: 6 },
    visual: { skin: 3, hair: 'short', hairColor: 0, uniform: 2, accessory: 'none', expression: 'happy', bodyType: 'small', freckles: true, stance: 'crouch' },
    ability: 'none',
    draftLine: 'You picked me?! YES! Tiny but mighty!',
  },
  {
    id: 'zippy',
    name: 'Zippy Kwan',
    emoji: '🛼',
    tagline: 'Runs before she hits.',
    stats: { contact: 7, power: 4, speed: 9, pitching: 3, fielding: 7 },
    visual: { skin: 1, hair: 'pigtails', hairColor: 3, uniform: 5, accessory: 'headband', expression: 'grin', stance: 'crouch' },
    ability: 'none',
    draftLine: 'Zippy is IN! Try to keep up!',
  },

  // --- All-rounders ---------------------------------------------------------
  {
    id: 'ace_kid',
    name: 'Ace',
    emoji: '⭐',
    tagline: 'Good at basically everything.',
    stats: { contact: 8, power: 7, speed: 7, pitching: 6, fielding: 8 },
    visual: { skin: 2, hair: 'short', hairColor: 1, uniform: 0, accessory: 'cap', expression: 'cool' },
    ability: 'none',
    draftLine: 'Good call. I do it all.',
  },
  {
    id: 'penny',
    name: 'Penny Pockets',
    emoji: '🪙',
    tagline: 'Steady as they come.',
    stats: { contact: 7, power: 6, speed: 6, pitching: 5, fielding: 7 },
    visual: { skin: 0, hair: 'curly', hairColor: 2, uniform: 2, accessory: 'none', expression: 'happy', freckles: true, stance: 'crouch' },
    ability: 'none',
    draftLine: 'Penny is on the team! Lucky you!',
  },
  {
    id: 'dex',
    name: 'Dex',
    emoji: '🧢',
    tagline: 'Quiet. Solid. Reliable.',
    stats: { contact: 6, power: 6, speed: 6, pitching: 6, fielding: 8 },
    visual: { skin: 4, hair: 'short', hairColor: 3, uniform: 1, accessory: 'cap', expression: 'cool' },
    ability: 'none',
    draftLine: 'Cool. Let us win.',
  },

  // --- Pitchers (arm > bat) -------------------------------------------------
  {
    id: 'lefty',
    name: 'Lefty Lu',
    emoji: '🌪️',
    tagline: 'Curveball from another zip code.',
    stats: { contact: 4, power: 3, speed: 5, pitching: 9, fielding: 6 },
    visual: { skin: 1, hair: 'ponytail', hairColor: 4, uniform: 4, accessory: 'cap', expression: 'determined' },
    ability: 'none',
    draftLine: 'My curveball says thank you!',
  },
  {
    id: 'smokey',
    name: 'Smokey',
    emoji: '🔥',
    tagline: 'Pure heat.',
    stats: { contact: 3, power: 5, speed: 5, pitching: 9, fielding: 5 },
    visual: { skin: 3, hair: 'buzz', hairColor: 3, uniform: 5, accessory: 'none', expression: 'determined' },
    ability: 'none',
    draftLine: 'You want heat? I brought heat!',
  },
  {
    id: 'bend_it',
    name: 'Bendy Bao',
    emoji: '🎳',
    tagline: 'The ball goes... around?',
    stats: { contact: 4, power: 4, speed: 6, pitching: 8, fielding: 5 },
    visual: { skin: 2, hair: 'short', hairColor: 0, uniform: 2, accessory: 'glasses', expression: 'goofy' },
    ability: 'none',
    draftLine: 'Yesss! My pitches go AROUND stuff!',
  },

  // --- Weak-but-cute / underdogs -------------------------------------------
  {
    id: 'noodle',
    name: 'Noodle',
    emoji: '🍜',
    tagline: 'Trying his best!',
    stats: { contact: 3, power: 2, speed: 4, pitching: 3, fielding: 3 },
    visual: { skin: 0, hair: 'bald', hairColor: 0, uniform: 3, accessory: 'glasses', expression: 'surprised', bodyType: 'small', freckles: true, stance: 'high' },
    ability: 'none',
    draftLine: 'Me?! REALLY?! I will try SO hard!',
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    emoji: '🫧',
    tagline: 'Here for a good time.',
    stats: { contact: 4, power: 3, speed: 5, pitching: 2, fielding: 4 },
    visual: { skin: 1, hair: 'curly', hairColor: 4, uniform: 5, accessory: 'none', expression: 'happy', freckles: true },
    ability: 'none',
    draftLine: 'Yay! This is the best recess EVER!',
  },
  {
    id: 'sniffles',
    name: 'Sniffles',
    emoji: '🤧',
    tagline: 'Allergic to the outfield.',
    stats: { contact: 3, power: 3, speed: 3, pitching: 5, fielding: 2 },
    visual: { skin: 2, hair: 'short', hairColor: 5, uniform: 0, accessory: 'none', expression: 'surprised', bodyType: 'small' },
    ability: 'none',
    draftLine: 'Picked! Achoo! I mean... yay!',
  },

  // --- Personalities / fillers with flavor ---------------------------------
  {
    id: 'the_prof',
    name: 'The Professor',
    emoji: '🤓',
    tagline: 'Calculates the launch angle.',
    stats: { contact: 6, power: 5, speed: 4, pitching: 7, fielding: 6 },
    visual: { skin: 3, hair: 'short', hairColor: 3, uniform: 1, accessory: 'glasses', expression: 'cool' },
    ability: 'none',
    draftLine: 'Statistically, an excellent decision.',
  },
  {
    id: 'diva',
    name: 'Dazzle',
    emoji: '✨',
    tagline: 'Blows a kiss after every hit.',
    stats: { contact: 7, power: 5, speed: 6, pitching: 3, fielding: 4 },
    visual: { skin: 1, hair: 'long', hairColor: 5, uniform: 3, accessory: 'headband', expression: 'grin', stance: 'high' },
    ability: 'none',
    draftLine: 'Obviously you picked me. Mwah!',
    chatterLines: ['Watch this. But like, really watch.', 'This next hit is dedicated to me.'],
  },
  {
    id: 'grizz',
    name: 'Grizz',
    emoji: '🐻',
    tagline: 'Grumpy. Powerful. Napping.',
    stats: { contact: 5, power: 8, speed: 3, pitching: 4, fielding: 4 },
    visual: { skin: 4, hair: 'afro', hairColor: 3, uniform: 4, accessory: 'none', expression: 'determined', bodyType: 'chunky', stance: 'open' },
    ability: 'none',
    draftLine: 'Fine. I was napping. Let us play.',
  },
  {
    id: 'flash',
    name: 'Flash Gordon Jr.',
    emoji: '📸',
    tagline: 'Fastest bat in the yard.',
    stats: { contact: 8, power: 4, speed: 8, pitching: 4, fielding: 7 },
    visual: { skin: 2, hair: 'mohawk', hairColor: 0, uniform: 0, accessory: 'none', expression: 'cool', stance: 'crouch' },
    ability: 'none',
    draftLine: 'Fastest bat in the yard, reporting in!',
  },
  {
    id: 'cricket',
    name: 'Cricket',
    emoji: '🦗',
    tagline: 'Bounces everywhere.',
    stats: { contact: 6, power: 3, speed: 8, pitching: 5, fielding: 8 },
    visual: { skin: 0, hair: 'spiky', hairColor: 2, uniform: 2, accessory: 'none', expression: 'goofy', bodyType: 'small', freckles: true, stance: 'crouch' },
    ability: 'none',
    draftLine: 'Boing! Picked! Boing boing!',
  },
  {
    id: 'moose',
    name: 'Moose',
    emoji: '🫎',
    tagline: 'Big kid, bigger heart.',
    stats: { contact: 6, power: 8, speed: 3, pitching: 5, fielding: 5 },
    visual: { skin: 3, hair: 'buzz', hairColor: 1, uniform: 6, accessory: 'cap', expression: 'happy', bodyType: 'chunky', stance: 'open' },
    ability: 'none',
    draftLine: 'Aw yeah! Team hug! Group hug, everybody!',
  },
  {
    id: 'peaches',
    name: 'Peaches',
    emoji: '🍑',
    tagline: 'Sweet swing, sunny smile.',
    stats: { contact: 8, power: 5, speed: 6, pitching: 4, fielding: 6 },
    visual: { skin: 1, hair: 'bun', hairColor: 2, uniform: 4, accessory: 'none', expression: 'happy', freckles: true },
    ability: 'none',
    draftLine: 'Sweet! Sweetest swing coming right up!',
  },
  {
    id: 'gizmo',
    name: 'Gizmo',
    emoji: '🔧',
    tagline: 'Built his own bat.',
    stats: { contact: 5, power: 6, speed: 5, pitching: 6, fielding: 6 },
    visual: { skin: 2, hair: 'short', hairColor: 0, uniform: 3, accessory: 'glasses', expression: 'determined' },
    ability: 'none',
    draftLine: 'Great! I brought my custom bat. I built it!',
  },
  {
    id: 'clover',
    name: 'Clover',
    emoji: '🍀',
    tagline: 'Somehow it always works out.',
    stats: { contact: 6, power: 6, speed: 7, pitching: 4, fielding: 5 },
    visual: { skin: 0, hair: 'pigtails', hairColor: 4, uniform: 2, accessory: 'headband', expression: 'happy', freckles: true },
    ability: 'none',
    draftLine: 'Lucky you! No really, I AM the luck!',
  },
  {
    id: 'rocket',
    name: 'Rocket Rosa',
    emoji: '🚀',
    tagline: 'Blasts off down the line.',
    stats: { contact: 7, power: 5, speed: 9, pitching: 3, fielding: 6 },
    visual: { skin: 3, hair: 'ponytail', hairColor: 0, uniform: 0, accessory: 'none', expression: 'cool' },
    ability: 'none',
    draftLine: 'Rosa, ready for liftoff!',
  },
  {
    id: 'chip',
    name: 'Chip',
    emoji: '🐿️',
    tagline: 'Little bat, quick feet.',
    stats: { contact: 6, power: 3, speed: 7, pitching: 5, fielding: 7 },
    visual: { skin: 2, hair: 'short', hairColor: 2, uniform: 5, accessory: 'cap', expression: 'happy', bodyType: 'small', freckles: true },
    ability: 'none',
    draftLine: 'Chip is on the team! Quick feet, coming through!',
  },
  {
    id: 'boomer',
    name: 'Boomer',
    emoji: '📣',
    tagline: 'Loud. Very loud.',
    stats: { contact: 5, power: 7, speed: 5, pitching: 5, fielding: 4 },
    visual: { skin: 4, hair: 'mohawk', hairColor: 3, uniform: 1, accessory: 'none', expression: 'grin', stance: 'high' },
    ability: 'none',
    draftLine: 'BOOMER! IS! ON! THE! TEAM!',
    chatterLines: ['HEY BATTER BATTER BATTER!', 'THIS IS ME BEING QUIET!'],
  },
];

/** Fast lookup by id. */
const BY_ID = new Map(ROSTER.map((c) => [c.id, c]));

export function getCharacter(id: string): Character {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}
