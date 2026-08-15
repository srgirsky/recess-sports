// ---------------------------------------------------------------------------
// ★ AN AUTHORED FORM TABLE MUST SAY WHERE ITS NUMBERS CAME FROM, AND THE
// CITATION MUST STILL BE TRUE.
//
// This gate exists because of a failure that took seventeen rounds to name.
//
// Junebug is the one approved character, and every form table in her sculpt
// script carries its trace. Her torso reads: "Measured on junebug-turnaround
// .png the same way as the arms — the contiguous run through the figure's
// centre, once the arms have separated from the torso at y=520: the concept's
// torso is 136px across at z 2.04 (0.640ft) ... Recorded honestly: at z 2.04
// this ships 0.83ft against the concept's 0.64." Measure, author toward the
// number, record the residual and why. That process produced the only
// character that has ever passed.
//
// Tank's colours were traced the same way and they are right — sampled off his
// sheet, his tee is rgb(103,68,127) against an authored (106,70,130) and his
// shorts rgb(31,30,36) against (36,36,43). His FORM tables were not traced at
// all. They were authored by eye and then adjusted, round after round, against
// the prose of independent reviews.
//
// ⚠️ AND THERE WAS A REASON, WHICH IS THE PART THIS GATE IS SHAPED AROUND.
// Junebug's arms separate from her torso at y=520, so the trace is available.
// Tank's never do — every view of his sheet has a run count of 1 from crown to
// ankle, because the concept draws his arms resting against his body in all
// five poses. The trace that worked for her returns arm-plus-torso for him and
// means nothing, so it was skipped, and NOTHING ANYWHERE NOTICED.
//
// Eight independent reviews then spent themselves describing the consequence
// in words — "a cone of revolution", "a lampshade", "the bulk is gone",
// "stick limbs" — which are all one missing measurement wearing different
// clothes. Every round converted that prose into an adjustment instead of into
// a number, and the scores stayed flat at 2-3 for eight rounds.
//
// So the rule is not "remember to measure". That rule already effectively
// existed in the playbook and was skipped in silence. The rule is:
//
//   1. every authored form table carries a `measured:` citation, and
//   2. this gate RE-DERIVES the cited value from the concept sheet, so a
//      citation that drifts from the drawing goes red, and
//   3. where the landmark cannot be traced, the script must say so with
//      `not-traceable:` and a reason.
//
// (3) is the one that would have caught Tank in round 1 rather than round 17.
//
// ★ IT CHECKS THE CITATION, NOT THE TABLE. A sculpt may legitimately ship a
// value away from the concept's — Junebug's torso deliberately does, because
// the V-neck, the placket and the belt loops are all solved against that
// surface and a finishing pass may not move them all at once. What may not
// happen is a claim ABOUT the drawing that the drawing does not support.
// Deviation is the author's call and must be recorded; a false citation is not
// a call at all.
//
// Broken once, on purpose, in the last three cases below.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { figure, halfWidthAt, loadSheet, runsAt } from './turnaround.mjs';
import { slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');

// Which sculpt scripts are governed, and the tables in each that describe FORM.
// Colour swatches are not listed: they are traced by a different route (a
// direct pixel sample) and they are demonstrably right on both characters.
const GOVERNED = [
  { id: 'nostrike', script: 'sculpt-junebug-source.py' },
  { id: 'tank', script: 'sculpt-tank-source.py' },
  { id: 'grizz', script: 'sculpt-grizz-source.py' },
  { id: 'sprout', script: 'sculpt-sprout-source.py' },
  { id: 'bubbles', script: 'sculpt-bubbles-source.py' },
  { id: 'chip', script: 'sculpt-chip-source.py' },
  { id: 'bend_it', script: 'sculpt-bendy-bao-source.py' },
  { id: 'flash', script: 'sculpt-flash-gordon-jr-source.py' },
];

// A table is governed if its name matches. Deliberately a pattern rather than a
// list, so a new table cannot dodge the gate by being new.
const FORM_TABLE = /^([A-Z][A-Z0-9_]*(?:LEVELS|STATIONS|SECTION|PROFILE|TABLE))\s*(?::[^=]+)?=\s*\[/;

// `# measured: front z=2.04 halfWidth=0.640 tol=0.06`
const MEASURED = /#\s*measured:\s*(?<view>front|view\d+)\s+z=(?<z>-?[\d.]+)\s+(?<metric>halfWidth|runs)=(?<value>-?[\d.]+)(?:\s+tol=(?<tol>[\d.]+))?/;
// `# not-traceable: <reason>` — the reason is required and must be a sentence.
const NOT_TRACEABLE = /#\s*not-traceable:\s*(?<reason>.+\S)/;

const viewIndex = (name) => (name === 'front' ? 0 : Number(name.slice(4)));

/** The comment block immediately above a line, walking upward. */
function precedingComments(lines, index) {
  const block = [];
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('#')) { block.unshift(lines[i]); continue; }
    if (line === '') continue;
    break;
  }
  return block;
}

function tablesIn(source) {
  const lines = source.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const match = FORM_TABLE.exec(line.trim());
    if (match) found.push({ name: match[1], line: index + 1, comments: precedingComments(lines, index) });
  });
  return found;
}

const sheets = new Map();
async function sheetFor(id) {
  if (!sheets.has(id)) {
    const path = join(concepts, `${slugFor(id)}-turnaround.png`);
    sheets.set(id, existsSync(path) ? await loadSheet(path) : null);
  }
  return sheets.get(id);
}

/** Every provenance problem across the governed scripts. */
async function provenanceErrors(overrides = {}) {
  const errors = [];
  for (const { id, script } of GOVERNED) {
    const path = join(here, 'blender', script);
    if (!existsSync(path)) { errors.push(`${script}: missing`); continue; }
    const source = overrides[script] ?? readFileSync(path, 'utf8');
    const sheet = await sheetFor(id);
    if (!sheet) { errors.push(`${id}: no turnaround to trace against`); continue; }

    for (const table of tablesIn(source)) {
      const block = table.comments.join('\n');
      const cited = [...block.matchAll(new RegExp(MEASURED, 'g'))];
      const declared = NOT_TRACEABLE.exec(block);
      if (!cited.length && !declared) {
        errors.push(
          `${script}: ${table.name} (line ${table.line}) has no provenance — ` +
          'add `# measured: <view> z=<ft> halfWidth=<ft>` citing the concept sheet, ' +
          'or `# not-traceable: <why>` if the drawing cannot give it',
        );
        continue;
      }
      for (const citation of cited) {
        const { view, z, metric, value, tol } = citation.groups;
        const f = figure(sheet, viewIndex(view));
        const actual = metric === 'runs' ? runsAt(f, Number(z)) : halfWidthAt(f, Number(z));
        const tolerance = Number(tol ?? (metric === 'runs' ? 0 : 0.03));
        if (actual === null) {
          errors.push(`${script}: ${table.name} cites ${view} z=${z}, which is off the figure`);
        } else if (Math.abs(actual - Number(value)) > tolerance) {
          errors.push(
            `${script}: ${table.name} cites ${metric}=${value} at ${view} z=${z}, ` +
            `but the sheet measures ${actual.toFixed(4)} (tol ${tolerance})`,
          );
        }
      }
    }
  }
  return errors;
}

describe('a sculpt script says where its form numbers came from', () => {
  it('has a traced or declared provenance for every authored form table', async () => {
    expect(await provenanceErrors()).toEqual([]);
  });

  // ★ Break it once. A rule that never fires is indistinguishable from no rule,
  // and this one has three edges, so it is broken three ways.
  it('fires on a form table with no provenance at all', async () => {
    const errors = await provenanceErrors({
      'sculpt-tank-source.py': 'FAKE_LEVELS = [\n    (1.0, 0.5, 0.5, "Hips"),\n]\n',
    });
    expect(errors.some((error) => error.includes('FAKE_LEVELS') && error.includes('has no provenance'))).toBe(true);
  });

  it('fires on a citation the concept sheet does not support', async () => {
    const errors = await provenanceErrors({
      'sculpt-tank-source.py': '# measured: front z=2.00 halfWidth=0.100\nFAKE_LEVELS = [\n    (1.0, 0.5),\n]\n',
    });
    expect(errors.some((error) => error.includes('but the sheet measures'))).toBe(true);
  });

  it('accepts a declared-untraceable landmark, which is the case that was silent', async () => {
    const errors = await provenanceErrors({
      'sculpt-tank-source.py':
        '# not-traceable: his arms rest against the body in all five views, so a\n' +
        '# centre run is arm plus torso. Depth is taken from the profile instead.\n' +
        'FAKE_LEVELS = [\n    (1.0, 0.5),\n]\n',
    });
    expect(errors.filter((error) => error.includes('FAKE_LEVELS'))).toEqual([]);
  });
});
