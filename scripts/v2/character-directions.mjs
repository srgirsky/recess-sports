// ---------------------------------------------------------------------------
// The production packet for the thirty kids — modelling, motion and voice.
//
// Runtime data says what a character IS and performance.ts says which shared
// acting family they use. Neither tells a sculptor, animator or actor what must
// make this kid recognisable when palette, rig and baseball verbs are shared.
// This file is the production-only layer that does: one hand-written card per
// ROSTER slot, kept out of the browser bundle, and rendered into the artist-
// facing brief by `npm run export:performance-brief`.
//
// The array follows ROSTER order so ids continue to be defined in exactly one
// place. character-directions.test.js makes an omission, duplicate, generic
// direction or stale generated brief fail CI.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROSTER } from '../../src/data/characters.ts';
import {
  heroClipFor,
  performanceFor,
  reactionClipFor,
} from '../../src/v2/render/performance.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const PERFORMANCE_BRIEF_PATH = join(here, '..', '..', 'docs', 'v2', 'character-performance-brief.md');

/**
 * `auditionVoice` is only the scratch TTS instrument used by
 * audition-voices.mjs. It is not a casting decision and never ships from this
 * file. The production brief is `casting`; `read` directs the roster-authored
 * line whether the approved performance is a stock AI voice or a human actor.
 */
const DIRECTIONS = [
  {
    sculpt: 'Compact and accuracy-first: pull the ponytail and headband into one clean arrow shape, keep the eyes narrow and alert, and let the striped athletic top feel neat rather than decorative.',
    motion: 'Use stillness as confidence. Junebug wastes no motion, stops the bat waggle when she decides, and lets one tiny satisfied shoulder release carry the win instead of a broad victory dance.',
    auditionVoice: 'marin',
    casting: 'A clear, grounded young girl voice with a low centre and precise consonants; confident without sounding older than the other kids.',
    read: 'Begin dry and matter-of-fact, clip “literally” cleanly, then allow the smallest real smile to appear on “miss.”',
    avoid: 'a gifted-child stereotype, sing-song cuteness, smugness, or an announcer finish',
  },
  {
    sculpt: 'Build a broad wedge-shaped face, oversized cap silhouette and open jacket front that all point outward; Theo should look as if his chest enters the frame one beat before the rest of him.',
    motion: 'Every entrance is already a performance. He points before he has an audience, overcommits to the hero pose, and catches his own balance half a beat late without ever losing belief.',
    auditionVoice: 'cedar',
    casting: 'A bright, elastic young boy voice that can race ahead of its breath while staying intelligible and genuinely likable.',
    read: 'Launch immediately, lean hard on “LIFE,” and include one tiny breathless stumble as though the boast arrived faster than his mouth.',
    avoid: 'adult salesman polish, mean swagger, a fake laugh, or winking at the joke',
  },
  {
    sculpt: 'Treat Zoom as a seated athlete, not a standing model placed in a chair: strong shoulders, active hands, integrated sport-chair geometry and a swept spiky crown should form one fast forward silhouette.',
    motion: 'Drive personality through shoulders, torso and wheel contact. His turns are quick pivots, his pitching coil stores energy across the chair, and his cool reactions finish with an inside-joke glance.',
    auditionVoice: 'coral',
    casting: 'A relaxed, inventive young boy voice with an easy smile in the tone and enough texture to feel grounded rather than slick.',
    read: 'Share a secret on the first sentence, give the second “Nobody” conspiratorial weight, and land the last word with a contained half-laugh.',
    avoid: 'inspirational framing, swagger, pity, breathy cool-guy acting, or added laughter',
  },
  {
    sculpt: 'Make Big Lou a soft, heavy crescent rather than a square bruiser: round belly, low shoulders, tiny buzzed crown and thick striped shirt, with friendly cheeks carrying more identity than muscle.',
    motion: 'His windups gather slowly and release all at once. Let the head trail the swing, the feet scramble after the follow-through, and the celebration feel delighted by the surprise of his own power.',
    auditionVoice: 'cedar',
    casting: 'A warm, roomy young boy voice with an unhurried rhythm and an effortless playground grin, never a mock “big guy” bass.',
    read: 'Take a tiny breath before “Moon shot,” then toss “baby” away as a happy phrase he heard somewhere and loves using.',
    avoid: 'a deep adult voice, slow-witted coding, food-character caricature, or forced toughness',
  },
  {
    sculpt: 'Keep Tank low, wide and beautifully simple: bald round crown, sleepy compact features, massive tee shape and short planted legs. The readable contrast is power outside, snacky calm inside.',
    motion: 'Tank moves only when needed, then the whole body commits. Anticipations are slow, impacts are enormous, and every settle looks ready to sit down again rather than pose for applause.',
    auditionVoice: 'cedar',
    casting: 'A small, blunt young boy voice with a comfortable low pitch and long pauses, as if every word was selected because extra words cost snack time.',
    read: 'Make “Tank smash” an honest little declaration, pause fully, then soften and speed up slightly for “After snacks.”',
    avoid: 'monster growls, caveman parody, an adult bass, shouting, or playing him as unintelligent',
  },
  {
    sculpt: 'Give Mimi a spring-loaded silhouette: dense curly halo, proud chin, broad hoodie pocket and strong forearms. She should read like a kid who chose every shape for maximum forward impact.',
    motion: 'She attacks poses with both feet and never performs at half volume. The bat nearly pulls her around, landings rebound once, and the hero beat points her entire torso at the fence.',
    auditionVoice: 'coral',
    casting: 'A powerful, raspy-edged young girl voice with a fast ignition and real joy underneath the competitive volume.',
    read: 'Explode into “MASH TIME,” take one excited reset, then turn “Point me” into a direct practical instruction.',
    avoid: 'adult rock-singer grit, anger, cheerleader rhythm, or a sustained scream',
  },
  {
    sculpt: 'Build Turbo from forward diagonals: narrow tee torso, sharp hair, small feet and a slightly nose-first posture. Even in bind pose the silhouette should look one step ahead of its shadow.',
    motion: 'He never quite reaches stillness. Weight changes happen on the balls of the feet, jokes interrupt the pose, and stops use two tiny recovery steps instead of a planted hero landing.',
    auditionVoice: 'cedar',
    casting: 'A quick, light young boy voice with crisp breath control and the delighted rhythm of someone who tells the joke before checking whether anyone followed.',
    read: 'Hit “Fast pick” immediately, give the question a genuine hopeful lift, and rush the explanation because he cannot leave the joke alone.',
    avoid: 'chipmunk pitch-shifting, frantic panic, smugness, or synthetic speed-up artifacts',
  },
  {
    sculpt: 'Protect Sprout’s tiny scale with an oversized curious head, button-bright eyes and a clear overall bib; the silhouette should feel seedling-small but never fragile or babyish.',
    motion: 'His confidence arrives after surprise. Start actions compressed, pop suddenly into full extension, and make the signature fidget a dirt-scrape that becomes an accidental practice bunt stance.',
    auditionVoice: 'cedar',
    casting: 'A high, natural young boy voice with breathy surprise at the edges and a determined centre that appears as the sentence continues.',
    read: 'Let “You picked me?” be honestly disbelieving, burst into “YES,” then plant both feet vocally for “Tiny but mighty.”',
    avoid: 'toddler speech, squeaking, helplessness, baby-talk consonants, or inspirational sentiment',
  },
  {
    sculpt: 'Use Zippy’s pigtails, headband and striped tee as three repeating speed marks, with long light legs and a narrow neck giving the whole model a bouncing roller-skate rhythm.',
    motion: 'She begins moving before the thought finishes. Pigtails should lag directional changes, the hero pose passes through rather than stops, and her win take exits on a playful challenge.',
    auditionVoice: 'marin',
    casting: 'A bright, athletic young girl voice with clean forward placement, fast rhythm and enough breath to sound like she arrived while running.',
    read: 'Snap the name into place, shorten the pause after “IN,” and throw “Try to keep up” back over the shoulder while already leaving.',
    avoid: 'valley-girl colour, cheerleading cadence, breathless distress, or cartoon squeals',
  },
  {
    sculpt: 'Ace needs balanced, unmistakably competent shapes rather than generic handsomeness: centred cap, clean jacket, even shoulder-to-hip taper and one asymmetrical pocket or brim break for memory.',
    motion: 'He makes hard actions look economical but not effortless. Poses settle square, catches absorb cleanly, and the card beat is a quiet check of glove and field rather than a camera stare.',
    auditionVoice: 'cedar',
    casting: 'A centred young boy voice with calm midrange warmth and no vocal gimmick; credibility should come from ease, not from sounding older.',
    read: 'Keep “Good call” conversational, pause as if checking the lineup, and state “I do it all” as a useful fact rather than a boast.',
    avoid: 'hero voice, adult coolness, bland commercial polish, smugness, or excessive vocal fry',
  },
  {
    sculpt: 'Shape Penny around practical pockets and soft symmetry: rounded curls, sturdy overall bib, visible pocket construction and a compact pear silhouette that feels dependable at thumbnail size.',
    motion: 'Her rhythm is steady and prepared. She checks a pocket before the card pose, catches with two hands, and celebrates by sharing the moment outward instead of jumping for attention.',
    auditionVoice: 'marin',
    casting: 'A warm, even young girl voice with a gentle smile and reassuring cadence, specific enough to be memorable without a novelty trait.',
    read: 'Say her own name with pleased certainty, let “Lucky you” sparkle as a friendly tease, and keep the ending small.',
    avoid: 'storybook sweetness, motherly warmth, a breathy whisper, or magical-character affectation',
  },
  {
    sculpt: 'Keep Dex visually quiet but authored: dense cap-and-curl silhouette, button eyes, compact hoodie and one strong vertical seam. Nothing should be flashy, and nothing should be default.',
    motion: 'He is the cast’s still point. Idle weight changes are nearly invisible, fielding is square and early, and the hero beat is one glove tap followed by direct eye contact.',
    auditionVoice: 'cedar',
    casting: 'A soft, dry young boy voice with a low-key midrange and deliberate pace; confidence lives in finishing the thought without decoration.',
    read: 'Leave a real pause after “Cool,” then make “Let us win” sound like the next obvious task on a short list.',
    avoid: 'mumbling, sleepy acting, detached sarcasm, adult stoicism, or adding emotional emphasis',
  },
  {
    sculpt: 'Make Lefty’s long ponytail, narrow shoulders and tilted cap create a curved S-line through the model; jacket seams should echo the bend without turning into a costume motif.',
    motion: 'She thinks in arcs. The pitching coil travels around the spine, glove and ponytail finish on delayed curves, and even a shrug traces a clean controlled loop.',
    auditionVoice: 'marin',
    casting: 'A focused young girl voice with a slightly husky middle, precise timing and a private sense of humour that never breaks concentration.',
    read: 'Place a tiny curve in the melody of “curveball,” then offer “thank you” with mock formality and a restrained smile.',
    avoid: 'sports-anime intensity, mystical fortune-teller colour, adult sarcasm, or a broad punchline',
  },
  {
    sculpt: 'Smokey should be a compact hot coal: close buzz cut, narrowed face, thick tee chest and minimal loose detail, with the darkest values concentrated around eyes and shoulders.',
    motion: 'All energy stays contained until release. Windup tension compresses into the planted leg, the arm snaps through, and reactions end in a hard exhale rather than extra posing.',
    auditionVoice: 'cedar',
    casting: 'A tight, energetic young boy voice with a little natural rasp and short phrasing, intense without sounding angry or older.',
    read: 'Challenge on “You want heat?” without shouting, then answer himself immediately with a clipped, satisfied second sentence.',
    avoid: 'villain menace, macho gravel, yelling, fire sound effects, or exaggerated toughness',
  },
  {
    sculpt: 'Let Bendy’s bun, round glasses and striped shirt form stacked circles interrupted by a narrow crooked torso; the model should look curious from every angle, never merely nerd-coded.',
    motion: 'His body follows the path he imagines for the ball. Gestures draw curves in space, balances recover through unexpected side steps, and the goofy win is discovery rather than slapstick.',
    auditionVoice: 'cedar',
    casting: 'A curious young boy voice with flexible pitch, careful words and sudden delighted acceleration when an idea becomes visible.',
    read: 'Stretch “Yesss” because the experiment worked, physically trace the word “around,” and finish in wonder instead of triumph.',
    avoid: 'nasal nerd stereotype, foreign accent coding, manic scientist acting, or random vocal wobble',
  },
  {
    sculpt: 'Noodle is long where Sprout is small: narrow shoulders, lifted neck, oversized glasses and loose striped sleeves should create a lovable vertical wobble without making him look breakable.',
    motion: 'Effort is visible before outcome. He rehearses the pose, checks whether it worked, then commits too hard; recoveries are earnest and carefully rebuilt rather than broad pratfalls.',
    auditionVoice: 'cedar',
    casting: 'A light, sincere young boy voice with open vowels, quick nervous breaths and a surprising streak of resolve when given a job.',
    read: 'Let both questions be genuinely stunned, take a breath after “REALLY,” and drive “SO hard” from determination rather than desperation.',
    avoid: 'whining, weakness as a joke, stammer caricature, baby voice, or pity-seeking sentiment',
  },
  {
    sculpt: 'Make Bubbles a cluster of soft buoyant shapes: cloud curls, round cheeks, flared dress and small hands, with two or three deliberate asymmetries keeping the silhouette handmade.',
    motion: 'She rebounds from every contact as if the ground is friendly. Holds are short, turns float through the shoulders, and celebration energy keeps finding one more person to include.',
    auditionVoice: 'coral',
    casting: 'A sunny young girl voice with rounded vowels, natural giggle energy held inside the words, and enough grounding to avoid a toy-commercial sound.',
    read: 'Open with an unforced “Yay,” discover the superlative in real time, and let “EVER” bloom without adding a laugh.',
    avoid: 'squealing, fairy voice, relentless high pitch, commercial cuteness, or audible giggle buttons',
  },
  {
    sculpt: 'Build Sniffles from tucked shapes: slightly raised shoulders, small hoodie opening, soft under-eye forms and one practical handkerchief pocket, while keeping the face lively rather than sickly.',
    motion: 'He braces for sneezes that may not arrive. The signature fidget is a nose scrunch and aborted reach for the pocket; athletic actions briefly forget the allergy entirely.',
    auditionVoice: 'cedar',
    casting: 'A gentle young boy voice with a naturally stuffy edge used sparingly, clear speech underneath and a hopeful lift after embarrassment.',
    read: 'Celebrate first, let the sneeze interrupt rather than become a sound-effect routine, then rebuild “yay” with sheepish sincerity.',
    avoid: 'constant congestion, gross-out comedy, frailty, fake sneezing fits, or a nasal stereotype',
  },
  {
    sculpt: 'The Professor needs precise construction, not generic glasses: squared jacket pockets, measured hair part, slightly long face and clean tool-like angles balanced by unmistakably child-sized hands.',
    motion: 'He observes before acting and annotates the result afterward. The card pose includes one invisible calculation, while successful contact causes a rare uncontrolled flash of delight.',
    auditionVoice: 'cedar',
    casting: 'A crisp young boy voice with deliberate diction and a quiet upward curiosity, intelligent without imitating an adult lecturer.',
    read: 'Treat “Statistically” as familiar playground vocabulary, pause to verify the conclusion, then warm “excellent decision” by one degree.',
    avoid: 'professor parody, British affectation, robotic precision, condescension, or precocious-adult cadence',
  },
  {
    sculpt: 'Dazzle’s long hair, headband and dress should form one dramatic curtain around a sharp confident face; reserve the brightest accent for a small star-like detail, not all-over sparkle.',
    motion: 'She always knows where the camera would be. Turns finish on a clean three-quarter, the kiss is tossed after the baseball action is complete, and a missed beat protects dignity before revealing hurt.',
    auditionVoice: 'marin',
    casting: 'A poised young girl voice with musical phrasing, playful certainty and enough ordinary playground texture to keep glamour self-invented.',
    read: 'Make “Obviously” affectionate rather than dismissive, take ownership of the pause, and place a quick real kiss on “Mwah.”',
    avoid: 'adult diva impersonation, breathy seduction, mean-girl coding, pageant polish, or excessive sparkle sounds',
  },
  {
    sculpt: 'Grizz is a sleepy storm cloud: wide afro mass, heavy brow, rounded tee body and low-set hands. Preserve a soft cheek line so the grumpiness reads as mood, never threat.',
    motion: 'Gravity wins until baseball interrupts it. His idle nearly naps, power wakes through one enormous uncoiling action, and the upset take is mostly the inconvenience of having to react.',
    auditionVoice: 'cedar',
    casting: 'A low, fuzzy young boy voice with slow onset, dry warmth and the sound of someone who was comfortable two seconds ago.',
    read: 'Use “Fine” to finish an argument nobody heard, make the nap complaint honest, then find a small competitive spark in “play.”',
    avoid: 'bear growls, adult bass, hostility, lazy-child judgement, or monotone mumbling',
  },
  {
    sculpt: 'Make Flash a bolt made from elbows, mohawk and striped torso: lean limbs, sharp crown and a bat-side shoulder slightly ahead, while keeping the facial planes friendly and young.',
    motion: 'His hands are faster than the rest of him and he enjoys proving it. Bat actions snap around a clear hold, while locomotion stays smooth enough that speed reads as control.',
    auditionVoice: 'cedar',
    casting: 'A taut, bright young boy voice with quick clean attacks and competitive energy, more sprinter than superhero.',
    read: 'Fire “Fastest bat” as a practiced title, then make “reporting in” a playful formal arrival with no extra flourish.',
    avoid: 'comic-book hero voice, speed-up processing, cockiness, shouting, or military parody',
  },
  {
    sculpt: 'Cricket should look assembled from springs: spiky crown, small overall bib, long elastic limbs and offset button details. Keep the asymmetry controlled so she remains readable, not chaotic.',
    motion: 'She stores energy in every crouch and releases it vertically. The signature fidget is one contained bounce that accidentally becomes three, followed by a proud attempt at stillness.',
    auditionVoice: 'coral',
    casting: 'A buoyant young girl voice with percussive consonants, quick pitch hops and a strong natural centre beneath the play.',
    read: 'Make each “Boing” a different discovered bounce, keep “Picked” intelligible in the middle, and stop cleanly after the final one.',
    avoid: 'rubber sound effects, chipmunk processing, uncontrolled squeals, or randomness without intention',
  },
  {
    sculpt: 'Moose needs a protective, open silhouette: broad hoodie, big cap, soft cheeks and long embracing arms. Avoid narrowing the waist so his size reads as warmth before strength.',
    motion: 'He moves toward teammates, not the camera. Throws use his whole frame gently, victories open into a group hug, and even frustration turns into checking whether someone else is okay.',
    auditionVoice: 'cedar',
    casting: 'A large, warm young boy voice with open resonance, easy laughter inside the breath and no pressure to sound tough.',
    read: 'Start with spontaneous delight, build “Team hug” into an invitation, and let “everybody” widen as if locating the whole bench.',
    avoid: 'oaf coding, adult baritone, booming volume, forced cuddliness, or slow speech as stupidity',
  },
  {
    sculpt: 'Peaches should read as sun-warmed rather than sugary: neat bun, freckled button face, simple dress flare and one leaf-like seam, with a balanced batter-ready stance under the softness.',
    motion: 'Her timing is smooth and generous. The swing begins with a quiet breath, follow-through opens toward the team, and the hero pose lets the smile arrive after the body settles.',
    auditionVoice: 'marin',
    casting: 'A warm young girl voice with clear midrange, an easy smile and a gentle Southern sunlight quality without using a regional accent.',
    read: 'Let the first “Sweet” be a real response, enjoy the repeated word, and promise the swing with relaxed certainty rather than salesmanship.',
    avoid: 'syrupy sweetness, Southern caricature, princess tone, whispering, or commercial warmth',
  },
  {
    sculpt: 'Gizmo’s glasses, spiky hair and overall hardware should look purpose-built: visible fasteners, one modified pocket and a bat-grip detail, but never so many gadgets that the child disappears.',
    motion: 'He tests mechanisms even while waiting. The fidget checks the bat, the hero pose presents one improvement, and surprise at a great hit is immediately followed by analysing why.',
    auditionVoice: 'cedar',
    casting: 'A focused young boy voice with quick technical enthusiasm, compact phrasing and a tactile delight in naming something he made.',
    read: 'Treat “Great” as confirmation, point vocally to the bat, pause, then make “I built it” the proud emotional centre.',
    avoid: 'robot voice, mad-scientist energy, nasal nerd coding, jargon additions, or gadget sound effects',
  },
  {
    sculpt: 'Clover’s pigtails and dress should create a four-leaf rhythm only on second glance: four soft outward lobes, tiny freckles and one off-centre seam keep luck embedded rather than costumed.',
    motion: 'Good outcomes seem to happen around her before she notices. She dodges by accident, catches on a late soft reach, and celebrates with amused gratitude rather than claiming control.',
    auditionVoice: 'coral',
    casting: 'A light, natural young girl voice with a curious upward lilt and playful timing, lucky because she is open rather than mystical.',
    read: 'Tease gently on “Lucky you,” correct herself with real urgency, and make the last “luck” sound like evidence she just remembered.',
    avoid: 'leprechaun colour, magical whispering, manic perkiness, Irish accent coding, or smug certainty',
  },
  {
    sculpt: 'Rocket Rosa is a clean launch shape: swept ponytail, narrow tee torso, long forward legs and a small nose-up chin. Echo a rocket only through silhouette, never literal fins or flames.',
    motion: 'Every start has a visible countdown in the knees and one decisive release. Her ponytail marks acceleration, turns bank cleanly, and stops finish in a compact ready stance.',
    auditionVoice: 'marin',
    casting: 'A cool, athletic young girl voice with firm breath support, concise phrasing and a bright lift that appears only at launch.',
    read: 'State her name like a systems check, hold the comma-sized beat, then let “liftoff” rise cleanly without becoming a shout.',
    avoid: 'astronaut radio effects, superhero tone, adult coolness, engine noises, or excessive breathiness',
  },
  {
    sculpt: 'Chip needs a compact squirrel-fast silhouette without becoming an animal mascot: small hoodie, quick feet, three loose cap wisps and full cheeks, with the bat deliberately a little undersized.',
    motion: 'He makes many tiny adjustments and one clean decision. Feet patter under an otherwise calm glove, the card pose arrives in two hops, and the win ends by making room for the next play.',
    auditionVoice: 'cedar',
    casting: 'A small, bright young boy voice with nimble consonants, friendly urgency and enough calm to keep speed from becoming nervousness.',
    read: 'Announce his own name with happy surprise, accelerate through “Quick feet,” and use “coming through” as a polite moving warning.',
    avoid: 'squirrel noises, chipmunk pitch, baby voice, frantic breathlessness, or cartoon-animal coding',
  },
  {
    sculpt: 'Boomer is a loud graphic exclamation: tall mohawk, wide mouth, heavy striped chest and planted legs. Keep the eyes warm and the outline clean so volume reads as generosity, not aggression.',
    motion: 'He broadcasts through the whole skeleton. Even a whisper uses giant mime, celebrations hit four clear beats, and the settle includes a sheepish check that everyone survived the volume.',
    auditionVoice: 'cedar',
    casting: 'A resonant young boy voice with excellent projection and rhythmic control; loudness must sound joyful and safe, never strained.',
    read: 'Give each written word its own stadium beat, build through the second “IS,” and finish “TEAM” cleanly without clipping or extra yelling.',
    avoid: 'microphone distortion, adult stadium announcer voice, anger, throat strain, or a single undifferentiated scream',
  },
];

export const CHARACTER_DIRECTIONS = DIRECTIONS.map((direction, index) => ({
  character: ROSTER[index],
  ...direction,
}));

export function voiceInstruction(card) {
  return (
    `Act a youthful, natural neighborhood ballplayer. ${card.casting} ` +
    `${card.read} Avoid ${card.avoid}. One clean take; no added words or sounds.`
  );
}

export function directionSheet() {
  return CHARACTER_DIRECTIONS.map((card) => {
    const profile = performanceFor(card.character.id);
    return {
      ...card,
      id: card.character.id,
      name: card.character.name,
      tagline: card.character.tagline,
      line: card.character.draftLine ?? card.character.name,
      profile,
      priorityClips: [
        heroClipFor(profile),
        'idle_fidget',
        reactionClipFor(profile, true),
        reactionClipFor(profile, false),
      ].filter((name, index, all) => all.indexOf(name) === index),
      direction: voiceInstruction(card),
    };
  });
}

export function performanceBrief() {
  const cards = directionSheet();
  const lines = [
    '# Character performance production brief',
    '',
    '**Deliverable:** thirty recognisable kids whose sculpt, motion and voice still read as themselves after the shared rig, team tint and baseball verbs are applied.',
    '',
    'This packet is generated from `scripts/v2/character-directions.mjs`; edit that source and run `npm run export:performance-brief`. The roster copy remains owned by `src/data/characters.ts`, and runtime acting families remain owned by `src/v2/render/performance.ts`.',
    '',
    '## Delivery contract',
    '',
    '- Models replace `public/v2/models/kid_<id>.glb` and must pass `npm run validate:models`; deliver in batches of five or six after one signed-off pilot.',
    '- Shared baseball mechanics remain in `anims_recess_v1.glb`. Bespoke takes go in a partial `anims_<id>_v1.glb`; included clip names override shared motion for that kid only, and omitted names keep the shared library.',
    '- The default voice path is free local Kokoro inference through `npm run generate:ai-voice`: audition named stock voices, record the selected voice and speed in `scripts/v2/ai-voice-cast.mjs`, then use `--ship <ids>`. Never clone, imitate or condition on a real person’s voice without documented rights and consent.',
    '- Voice masters are clean 48 kHz/24-bit mono PCM WAV, delivered as `assets/v2/voice-delivery/kids/<id>.wav` and checked with `npm run validate:voice-delivery -- <ids>`. Runtime copies are mono MP3 named `public/v2/audio/voices/kids/<id>.mp3`; preserve the authored line exactly and disclose AI-generated performances in the product.',
    '- A human performer remains an optional future replacement. Adults may perform; if a minor performs, obtain guardian consent and follow the production jurisdiction’s child-performer and data-retention rules.',
    '- Review every model and motion at hero scale and at 40 px. Review every voice line in the draft flow, not only in isolation.',
    '',
    '## Review order',
    '',
    'Pilot Junebug, Theo and Zoom first. For each, sign off the model, the listed partial animation takes and the draft line together; a beautiful sculpt with a generic read is not an accepted character. Then deliver the remaining cast in the roster batches below.',
    '',
  ];

  cards.forEach((card, index) => {
    if (index === 3 || (index > 3 && (index - 3) % 6 === 0)) {
      lines.push(`## Batch ${index === 3 ? 1 : 2 + Math.floor((index - 3) / 6)}`, '');
    }
    lines.push(
      `### ${index + 1}. ${card.name} \`${card.id}\``,
      '',
      `> ${card.tagline}`,
      '',
      `- **Runtime direction:** ${card.profile.hero} hero · ${card.profile.spirit} spirit · ${card.profile.tempo} tempo`,
      `- **Priority takes:** ${card.priorityClips.map((clip) => `\`${clip}\``).join(' · ')}`,
      `- **Sculpt:** ${card.sculpt}`,
      `- **Motion:** ${card.motion}`,
      `- **Casting:** ${card.casting}`,
      `- **Line:** “${card.line}”`,
      `- **Read:** ${card.read}`,
      `- **Avoid:** ${card.avoid}.`,
      ''
    );
  });

  lines.push(
    '## Acceptance',
    '',
    '1. Technical model, animation and voice-master validators pass.',
    '2. The kid is identifiable without their name card in a same-team-colour contact sheet.',
    '3. A/B review shows the character-specific takes with ★ on `/v2/?anims=1&kid=<id>` and shared fallbacks with ▪.',
    '4. A blind listener can distinguish the line from the two adjacent roster entries and describe the intended attitude without seeing the card.',
    '5. The maintainer records performer/model/animation provenance before shipping; generated and system stand-ins are not final delivery.',
    ''
  );
  return lines.join('\n');
}

export function writePerformanceBrief() {
  mkdirSync(dirname(PERFORMANCE_BRIEF_PATH), { recursive: true });
  writeFileSync(PERFORMANCE_BRIEF_PATH, performanceBrief());
  return PERFORMANCE_BRIEF_PATH;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`wrote ${writePerformanceBrief()}`);
}
