# Playtest protocol — ages 4–8

The instrument the product holds are judged on. `holds.json` beside this file
records that **defensive shifts, stamina and juice/power-ups were deliberately
not added** on 2026-08-08 — "without playtest evidence they would make the
measured core less legible rather than more complete" — and that **special
pitches** were listed but never formally held. Every one of those features
defaults OFF in `src/v2/sim/features.ts`, and `scripts/playtest.lint.test.js`
keeps it that way until a record filed here says `lift`.

A session with children is the only thing that can produce that record. This
file says how to run one so that what comes back is evidence rather than an
impression.

## What a session is

- **Two children at a time, or one.** Pairs talk, and what they say to each
  other is the best signal there is. A single child works; three is a crowd
  and the one not holding the device stops watching.
- **Two blocks of about fifteen minutes each.** Block one is the **baseline**:
  every held feature OFF, the game exactly as it ships. Block two switches
  **ONE** feature on. Never two — you cannot tell which one the child reacted
  to. If the child is done after one block, the session is one block and that
  is a valid record.
- **The observer does not help.** Answer a question with "what do you think?"
  The game is for a four-year-old who cannot read; if it needs you, that is
  the observation.
- **Stop when they want to stop.** A child who asks to stop is done and the
  block ends there. Write down the minute.

### URLs

The game reads its configuration off the address bar, so the whole block is
one link. Open it in a fresh tab; the tab must stay **foreground** (a
backgrounded tab freezes the game — the root brief's first gotcha).

| block | open |
|---|---|
| baseline | `/?log=1` |
| stamina | `/?features=stamina` |
| juice / power-ups | `/?features=juice` |
| special pitches | `/?features=specialPitches` |
| defensive shifts | `/?features=shifts` |

Any `?features=` turns the session log on by itself. `?log=1` turns it on for
the baseline, where nothing else would.

### The session log

While a block runs, the game counts what it did — pitches, the child's swings,
whiffs and hits, outs they made in the field, how often each verb was tapped,
how long the block ran and how it ended (`finished`, `quit`, or `unloaded` if
the tab went away). It counts and nothing else. At the end of a block tap
**⬇ LOG** (top right, beside the speaker) and keep the `playtest-<n>.json` it
downloads; the last twenty sessions also stay in that browser's storage. Paste
the block's counts into the record's `log` field.

## Per-feature observation prompts

Write down **behaviour**, one line each, as it happens. "Looked at the pitch
cards a long time before tapping" is an observation. "Confused" is a verdict;
save those for the end.

### Baseline (every block, before anything else)

- Which verb did they find first without help — swing, pitch, steer, throw?
- Did they find the pitch cards? Did they ever pick anything but the first?
- Did they know when it was their turn to bat versus pitch?
- Did they steer the fielder, or watch? If they steered, did the fielder go
  where they pointed?
- Did they tap a base to throw, or tap the field and dive?
- Did they laugh, and at what? Did they groan, and at what?
- What did they say to the other child?

### Stamina (`?features=stamina`)

- Did they notice the pitcher tiring at all? (The tell will be a sweat pip on
  the matchup plate and pitches missing the spot more.)
- If they noticed, did they say why they thought it was happening?
- Did it change what they did — pick a different pitch, aim safer, ask to
  change pitcher?
- Did a late inning feel different to them, or did they not notice the game
  had a shape?

### Juice / power-ups (`?features=juice`)

- Did they see the meter fill? Did they ask what it was?
- Did they find the spend tray on their own, and did they try each of the
  three?
- After a power swing, a turbo run or a golden-glove catch: did they connect
  the effect to the button they pressed, or did it read as luck?
- Did they save it or spend it the moment it was affordable?
- Did the meter distract from the pitch — were they watching it instead of
  the ball?

### Special pitches (`?features=specialPitches`)

- Did they notice the extra cards? Did they pick one before a normal pitch?
- Batting against one: did they swing at a floater early, at a fireball late?
  Did they laugh at the crazy ball, or complain it was unfair?
- Did they understand these cost something, or throw them every pitch?
- Did the pitch names mean anything to them (they cannot read — the icon has
  to carry it)?

### Defensive shifts (`?features=shifts`)

- Did they find the shift toggle? Did they touch it once and never again, or
  keep changing it?
- Could they see the fielders move when they toggled it?
- Did they shift for a reason they could say, or at random?
- When a ball went where the fielders had been, did they connect it to the
  toggle?

## The two questions a playtest closes

Two records in `scripts/measures.json` say in so many words that they cannot
be closed by measuring. Their `whatWouldClose` fields, verbatim, are the two
questions every session answers — with a feature on or not:

**`sim.human-pitch`** —

> A child actually pitching: whether picking a spot with a pointer is a verb a six-year-old enjoys, or whether it wants v1's 3x3 zone grid instead of continuous aim. That is a playtest, not a measurement.

**`sim.runner-sends`** —

> Whether a child can pick the right moment to send on a fly — the decision is a tag-up read, which is the hardest judgement in youth baseball. A playtest, not a measurement.

For the first: watch the child on the mound. Do they aim at a spot, or tap
anywhere? Do they try to aim after a ball, or after a hit? For the second:
watch every caught fly with a runner on. Do they tap a base ahead of the
runner, tap one behind him, or not notice there was a choice? Write what you
saw under `questions` in the record. The lint checks the keys are these two
ids and nothing else.

## Privacy — what a record may and may not contain

The record is **observations only**. It goes into a public repository.

- **No names.** Not the child's, not a parent's, not the observer's. The
  record's `privacy.namesRecorded`, `recordingsMade` and `observerNamed` are
  all `false` and the lint refuses a record where they are not.
- **Age bands, never ages.** `4-5` or `6-8`. No birthdays.
- **No recordings.** No video, no audio, no photographs, no screenshots that
  show a child. The session log is counts.
- **No school, no town, no date of birth, no contact detail.** The lint
  scans every key in a record for the obvious ones (`name`, `email`, `dob`,
  `phone`, `address`, `school`, `observer`, `recording`, `video`, `photo`)
  and every string for an email address, and fails the file.
- **Consent is a conversation with the parent, not a field.** Nothing about
  it is written down here.

If you are unsure whether a line identifies a child, it does not go in.

## Filing a record

1. Copy `TEMPLATE.json` to `docs/playtests/<YYYY-MM-DD>-<slug>.json` and
   remove the `"template": true` line. The `id` is the filename without
   `.json`; the `date` is its first ten characters.
2. Fill `participants` (counts per age band), one entry in `blocks` per block
   you ran (feature, age band, minutes, the URL, your observation lines, and
   the session log's counts), the two `questions`, and a `verdicts` entry for
   each feature you switched on: `lift`, `hold` or `inconclusive`.
3. `npm test` runs `scripts/playtest.lint.test.js` over every record here.
   Fix what it names.
4. Ship it as a PR like any other change.

### Lifting a hold

A `lift` verdict in a record does not change the game by itself. To lift the
hold, in the same or a later PR:

1. In `holds.json`, set the feature's `status` to `"lifted"`, add
   `"liftedOn": "<date>"` and `"liftedBy": ["<record id>", …]` naming every
   record whose `verdicts` carry `lift` for it. The lint checks each named
   record exists and says so.
2. Only then may `DEFAULT_FEATURES.<feature>` in `src/v2/sim/features.ts`
   become `true`. The lint fails a held or never-held feature that defaults on,
   whatever the reason.
3. Say so in `docs/OVERVIEW.md` — a hold lifted is a product decision.

A `hold` verdict leaves everything as it is and is worth filing anyway: the
next person to ask will find the session rather than repeating it.
