// ---------------------------------------------------------------------------
// A held feature may not default on, and a hold may not be lifted without a
// record. This is what makes `docs/playtests/holds.json` binding.
//
// ★ THE FAILURE IT PREVENTS. On 2026-08-08 the re-audit recorded that shifts,
// stamina and power-ups were "deliberately not added: without playtest evidence
// they would make the measured core less legible". That sentence lived in two
// prose files and bound nothing: a port could land, default on, and nobody
// reading a diff would know a decision had been reversed. Special pitches were
// listed as a reference feature and never held at all — the same sentence
// could not even be quoted for them.
//
// So the holds are DATA (`holds.json`), the flags are CODE (`features.ts`),
// and this file joins them: every feature the holds file lists as `held` or
// `never-held` must default `false` in `DEFAULT_FEATURES`, and a hold may be
// `lifted` only by naming a record under `docs/playtests/` whose `verdicts`
// carry `lift` for that feature. The record is what a session with children
// produces (`PROTOCOL.md`); the lint is what makes producing one the ONLY way
// to turn a feature on by default.
//
// It also holds the records to the protocol's privacy rule — observations
// only, age bands, no names, no recordings, no observer names — because a
// record goes into a public repository and a reviewer cannot be the only
// thing between a child's name and a git history.
//
// ★ BROKEN ONCE EACH WAY BEFORE IT WAS TRUSTED. Setting `stamina: true` in
// `DEFAULT_FEATURES` fails § "the flags obey the holds" with:
//   `stamina` is `held` in docs/playtests/holds.json but DEFAULT_FEATURES.stamina
//   is `true` in src/v2/sim/features.ts. A held feature defaults OFF. To turn it
//   on, file a playtest record with `verdict: "lift"` (docs/playtests/PROTOCOL.md
//   § Lifting a hold), set the hold to `lifted` naming it in `liftedBy`, and
//   only then flip the default.
// Setting shifts to `"status": "lifted"` with no `liftedBy` fails § "a hold is
// lifted only by a record" with:
//   `shifts` is `lifted` but names no record: `liftedBy` must list ≥1 id of a
//   docs/playtests/<id>.json whose `verdicts.shifts` is "lift".
// Adding `"name": "…"` to a block in a record fails § "records are observations
// only" naming the path (`blocks[0].name`) and the rule.
//
// Lives in scripts/ as plain JS for the same reason the other lints do: it
// touches the filesystem, and tsconfig's `include` is src-only.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'playtests');
const read = (p) => readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));

const holds = json(join(DIR, 'holds.json'));
const FEATURES = Object.keys(holds.features);
const STATUSES = ['held', 'lifted', 'never-held'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;

/** Every `docs/playtests/*.json` that is a record (or the template) — not the holds file. */
const recordFiles = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'holds.json')
  .sort();
const records = recordFiles.map((f) => ({ file: f, id: f.replace(/\.json$/, ''), data: json(join(DIR, f)) }));
const real = records.filter((r) => r.data.template !== true);
const byId = new Map(real.map((r) => [r.id, r.data]));

/**
 * Keys that could identify a child, a parent or an observer. Case-insensitive,
 * matched against every key at every depth. The protocol lists them.
 */
const FORBIDDEN_KEYS = new Set(
  [
    'name', 'names', 'firstName', 'lastName', 'fullName', 'childName', 'kidName', 'participantName',
    'email', 'dob', 'birthdate', 'birthday', 'age', 'ages', 'phone', 'address', 'school', 'town', 'city',
    'observer', 'observerName', 'observers', 'recording', 'recordings', 'video', 'audio', 'photo', 'photos',
  ].map((k) => k.toLowerCase())
);
const EMAIL = /\S+@\S+\.\S+/;

/** Walk a JSON value, calling `visit(path, key, value)` at every object key. */
function walk(v, visit, path = '$') {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, visit, `${path}[${i}]`));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      visit(`${path}.${k}`, k, x);
      walk(x, visit, `${path}.${k}`);
    }
  }
}

/** Every `id` in scripts/measures.json, with its record. */
function measureRecords() {
  const out = new Map();
  walk(json(join(ROOT, 'scripts', 'measures.json')), (_, k, v) => {
    if (k === 'id' && typeof v === 'string') out.set(v, null);
  });
  // Second pass to attach the owning record object to each id.
  walk(json(join(ROOT, 'scripts', 'measures.json')), (_, __, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string' && out.has(v.id)) out.set(v.id, v);
  });
  return out;
}

describe('docs/playtests/holds.json is well formed', () => {
  it('lists at least one feature, and every status is one of the three', () => {
    expect(FEATURES.length).toBeGreaterThan(0);
    for (const f of FEATURES) {
      expect(STATUSES, `${f}: status "${holds.features[f].status}" is not one of ${STATUSES.join(' | ')}`).toContain(
        holds.features[f].status
      );
    }
  });

  it('a held feature says when, by whom, from where and why', () => {
    for (const f of FEATURES) {
      const h = holds.features[f];
      if (h.status !== 'held') continue;
      expect(h.heldOn, `${f}: heldOn must be YYYY-MM-DD`).toMatch(ISO_DAY);
      expect(typeof h.heldBy === 'string' && h.heldBy.length > 0, `${f}: heldBy is who decided`).toBe(true);
      expect(Array.isArray(h.source) && h.source.length > 0, `${f}: source cites the doc that records the hold`).toBe(true);
      expect(typeof h.reason === 'string' && h.reason.length > 20, `${f}: reason quotes the hold`).toBe(true);
    }
  });

  it('a never-held feature carries a note saying so', () => {
    for (const f of FEATURES) {
      const h = holds.features[f];
      if (h.status !== 'never-held') continue;
      expect(typeof h.note === 'string' && h.note.length > 20, `${f}: never-held needs a note`).toBe(true);
    }
  });

  it('the source docs it cites actually contain the reason', () => {
    // A hold that quotes a sentence no doc holds is a hold with no provenance.
    const overview = read(join(ROOT, 'docs', 'OVERVIEW.md')).replace(/\s+/g, ' ');
    for (const f of FEATURES) {
      const h = holds.features[f];
      if (h.status !== 'held') continue;
      const reason = h.reason.replace(/\s+/g, ' ');
      expect(overview.includes(reason), `${f}: docs/OVERVIEW.md no longer contains the quoted reason`).toBe(true);
    }
  });

  it('★ the questions are measures.json records that a playtest — not a measurement — closes', () => {
    const measures = measureRecords();
    expect(Array.isArray(holds.questions) && holds.questions.length > 0).toBe(true);
    for (const q of holds.questions) {
      expect(measures.has(q), `question "${q}" is not an id in scripts/measures.json`).toBe(true);
      const rec = measures.get(q);
      expect(
        typeof rec?.whatWouldClose === 'string' && /playtest/i.test(rec.whatWouldClose),
        `"${q}".whatWouldClose does not say a playtest closes it — it is not a question for this instrument`
      ).toBe(true);
    }
  });

  it('PROTOCOL.md quotes each question’s whatWouldClose verbatim', () => {
    const protocol = read(join(DIR, 'PROTOCOL.md')).replace(/\s+/g, ' ');
    const measures = measureRecords();
    for (const q of holds.questions) {
      const text = measures.get(q).whatWouldClose.replace(/\s+/g, ' ');
      expect(protocol.includes(text), `PROTOCOL.md must quote "${q}".whatWouldClose verbatim`).toBe(true);
    }
  });
});

describe('★ the flags obey the holds', () => {
  const src = read(join(ROOT, 'src', 'v2', 'sim', 'features.ts'));
  const block = src.match(/DEFAULT_FEATURES[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  const iface = src.match(/export interface Features \{([\s\S]*?)\n\}/);

  it('can find DEFAULT_FEATURES and the Features interface', () => {
    expect(block, 'DEFAULT_FEATURES = Object.freeze({ … }) not found in features.ts — this lint has gone stale').toBeTruthy();
    expect(iface, 'export interface Features { … } not found in features.ts — this lint has gone stale').toBeTruthy();
  });

  const defaults = {};
  for (const m of (block?.[1] ?? '').matchAll(/(\w+)\s*:\s*(true|false)/g)) defaults[m[1]] = m[2] === 'true';
  const declared = [...(iface?.[1] ?? '').matchAll(/^\s*(\w+)\s*:\s*boolean/gm)].map((m) => m[1]);

  it('every held feature is a flag, and every flag is a held feature', () => {
    // A flag with no hold entry is a feature nobody judged; a hold with no
    // flag is a decision nothing can enforce.
    expect([...FEATURES].sort(), 'holds.json features must equal the Features interface').toEqual([...declared].sort());
    expect(Object.keys(defaults).sort(), 'DEFAULT_FEATURES must name every Features key').toEqual([...declared].sort());
  });

  it.each(FEATURES)('★ %s defaults off unless its hold is lifted', (f) => {
    const status = holds.features[f].status;
    expect(typeof defaults[f], `DEFAULT_FEATURES.${f} is missing`).toBe('boolean');
    if (status === 'lifted') return;
    expect(
      defaults[f],
      `\`${f}\` is \`${status}\` in docs/playtests/holds.json but DEFAULT_FEATURES.${f} is \`true\` in ` +
        `src/v2/sim/features.ts. A held feature defaults OFF. To turn it on, file a playtest record with ` +
        `\`verdict: "lift"\` (docs/playtests/PROTOCOL.md § Lifting a hold), set the hold to \`lifted\` naming it ` +
        `in \`liftedBy\`, and only then flip the default.`
    ).toBe(false);
  });
});

describe('★ a hold is lifted only by a record', () => {
  it.each(FEATURES)('%s', (f) => {
    const h = holds.features[f];
    if (h.status !== 'lifted') {
      expect(h.liftedBy, `${f}: liftedBy belongs only on a lifted hold`).toBeUndefined();
      return;
    }
    expect(
      Array.isArray(h.liftedBy) && h.liftedBy.length > 0,
      `\`${f}\` is \`lifted\` but names no record: \`liftedBy\` must list ≥1 id of a docs/playtests/<id>.json ` +
        `whose \`verdicts.${f}\` is "lift".`
    ).toBe(true);
    expect(typeof h.liftedOn === 'string' && ISO_DAY.test(h.liftedOn), `${f}: liftedOn must be YYYY-MM-DD`).toBe(true);
    for (const id of h.liftedBy) {
      const rec = byId.get(id);
      expect(rec, `${f}: liftedBy names "${id}" but docs/playtests/${id}.json is not a record (missing, or a template)`).toBeTruthy();
      expect(
        rec?.verdicts?.[f],
        `${f}: docs/playtests/${id}.json does not carry verdicts.${f} = "lift" — a record can lift only what it judged`
      ).toBe('lift');
    }
  });
});

describe('the records', () => {
  it('include the template, and the template says so', () => {
    const t = records.find((r) => r.file === 'TEMPLATE.json');
    expect(t, 'docs/playtests/TEMPLATE.json is missing').toBeTruthy();
    expect(t.data.template).toBe(true);
  });

  it.each(records.map((r) => r.file))('%s has the record shape', (file) => {
    const r = records.find((x) => x.file === file);
    const d = r.data;
    const isTemplate = d.template === true;
    if (!isTemplate) {
      expect(d.template, `${file}: "template" is either absent or true — a record is not a template`).toBeUndefined();
      expect(r.id, `${file}: the filename must be <YYYY-MM-DD>-<slug>.json`).toMatch(RECORD_ID);
      expect(d.id, `${file}: "id" must equal the filename without .json`).toBe(r.id);
      expect(d.date, `${file}: "date" must be YYYY-MM-DD`).toMatch(ISO_DAY);
      expect(r.id.startsWith(d.date), `${file}: the id must start with the date`).toBe(true);
    }
    expect(d.v, `${file}: v must be 1`).toBe(1);
    expect(Array.isArray(d.participants) && d.participants.length > 0, `${file}: participants is a non-empty array`).toBe(true);
    for (const p of d.participants) {
      expect(holds.ageBands, `${file}: ageBand "${p.ageBand}" is not one of ${holds.ageBands.join(' | ')}`).toContain(p.ageBand);
      expect(Number.isInteger(p.count) && p.count >= 0, `${file}: participants[].count is a whole number`).toBe(true);
    }
    expect(Array.isArray(d.blocks) && d.blocks.length > 0, `${file}: blocks is a non-empty array`).toBe(true);
    for (const b of d.blocks) {
      expect(
        ['baseline', ...FEATURES],
        `${file}: block feature "${b.feature}" is not "baseline" or a feature in holds.json`
      ).toContain(b.feature);
      expect(holds.ageBands, `${file}: block ageBand "${b.ageBand}"`).toContain(b.ageBand);
      expect(typeof b.minutes === 'number' && b.minutes >= 0, `${file}: block minutes is a number`).toBe(true);
      expect(Array.isArray(b.observations), `${file}: block observations is an array of lines`).toBe(true);
      for (const line of b.observations) expect(typeof line, `${file}: observations are strings`).toBe('string');
      expect(b.log === null || (b.log && typeof b.log === 'object'), `${file}: block log is null or the session log's counts`).toBe(true);
    }
    expect(d.questions && typeof d.questions === 'object', `${file}: questions is an object`).toBe(true);
    for (const q of Object.keys(d.questions)) {
      expect(holds.questions, `${file}: question "${q}" is not one of holds.json's questions`).toContain(q);
    }
    expect(d.verdicts && typeof d.verdicts === 'object', `${file}: verdicts is an object`).toBe(true);
    for (const [f, v] of Object.entries(d.verdicts)) {
      expect(FEATURES, `${file}: verdict for "${f}", which is not a feature in holds.json`).toContain(f);
      expect(holds.verdicts, `${file}: verdict "${v}" for ${f} is not one of ${holds.verdicts.join(' | ')}`).toContain(v);
    }
    if (!isTemplate) {
      // A verdict on a feature the session never switched on is a guess.
      const tested = new Set(d.blocks.map((b) => b.feature));
      for (const f of Object.keys(d.verdicts)) {
        expect(tested.has(f), `${file}: verdicts.${f} without a block that ran ?features=${f}`).toBe(true);
      }
    }
  });

  it.each(records.map((r) => r.file))('★ %s is observations only — no names, ages, recordings or observers', (file) => {
    const d = records.find((x) => x.file === file).data;
    expect(d.privacy?.namesRecorded, `${file}: privacy.namesRecorded must be false`).toBe(false);
    expect(d.privacy?.recordingsMade, `${file}: privacy.recordingsMade must be false`).toBe(false);
    expect(d.privacy?.observerNamed, `${file}: privacy.observerNamed must be false`).toBe(false);
    const bad = [];
    walk(d, (path, k, v) => {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) bad.push(`${path} (key "${k}" may identify someone)`);
      if (typeof v === 'string' && EMAIL.test(v)) bad.push(`${path} (contains an email address)`);
    });
    expect(
      bad,
      `${file} carries something the protocol forbids:\n  ${bad.join('\n  ')}\n` +
        `A record is observations only — behaviour, age bands, counts. See docs/playtests/PROTOCOL.md § Privacy.`
    ).toEqual([]);
  });

  it('every real record is reachable from a hold or stands alone as a hold verdict', () => {
    // Not an error to file a `hold` or `inconclusive` record nobody cites;
    // it IS an error for a record to claim `lift` for a feature whose hold
    // was lifted WITHOUT naming it — the census would be silently partial.
    for (const [id, d] of byId) {
      for (const [f, v] of Object.entries(d.verdicts ?? {})) {
        const h = holds.features[f];
        if (v === 'lift' && h?.status === 'lifted') {
          expect(h.liftedBy, `${f} is lifted and ${id} says lift, but liftedBy does not name it`).toContain(id);
        }
      }
    }
  });
});

describe('the protocol exists and names the rules the lint enforces', () => {
  const protocol = read(join(DIR, 'PROTOCOL.md'));
  it('is there', () => {
    expect(existsSync(join(DIR, 'PROTOCOL.md'))).toBe(true);
  });
  it.each(['4-5', '6-8', 'namesRecorded', 'liftedBy', 'TEMPLATE.json', '?features=', '?log=1', 'DEFAULT_FEATURES'])(
    'mentions %s',
    (needle) => {
      expect(protocol.includes(needle), `PROTOCOL.md must mention ${needle}`).toBe(true);
    }
  );
  it.each(FEATURES)('has an observation section for %s', (f) => {
    expect(protocol.includes(`?features=${f}`), `PROTOCOL.md has no block URL for ${f}`).toBe(true);
  });
});
