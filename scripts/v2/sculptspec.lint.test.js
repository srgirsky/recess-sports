// ---------------------------------------------------------------------------
// ★ A DEFAULT ON A SPEC FIELD IS ONE KID'S BODY SILENTLY WORN BY TWENTY-NINE.
//
// `sculptlib/` is the shared construction: what a sneaker IS, what an ear IS,
// how a skull is laid out. Each module takes a `*Spec` dataclass carrying the
// numbers that were traced off ONE character's turnaround. The package doc
// states the rule — a function belongs there when it reads no character's table
// — and a defaulted field is the one way to break it while looking like you
// kept it, because the number is still in the library, just spelled `= ...`.
//
// ⚠️ THIS IS NOT HYPOTHETICAL. IT HAD ALREADY HAPPENED TWICE.
//
//   · `EarSpec` was lifted with Junebug's centre and radii baked in. Tank's
//     ears sat at HER (0.045, 3.128) at HER size, and his board came back with
//     a head aspect of 0.97 against the concept's 1.12 — the concept measures
//     head width ACROSS THE EARS. It survived review because the geometry was
//     byte-identical for the character it was extracted FROM, which proves a
//     lift was faithful and says nothing about whether it was general.
//   · `HeadSpec.island` defaulted to three module constants that were Junebug's
//     face-atlas window — on a field whose own comment says "IT IS PER
//     CHARACTER". She was correct only because they were hers. The stated
//     failure mode is an atlas drawn with a clipped mouth and nothing going red.
//
// The second one hid a second defect behind it: `head_surface` laid the face
// ROWS out on those constants while UV-mapping the same vertices through
// `spec.island`. That does not misplace a feature — the two windows compose to
// an affine map and a mark still lands where its own window says — but it left
// Tank's face rows covering only atlas v 0.123 to 0.823, with the island's
// outer 30% carried by the sparse crown and chin cap rows. `head.py`'s note at
// the row layout works the arithmetic; it is recorded here because the DEFAULT
// is what let a second character inherit the first one's span at all.
//
// ★ WHY A LINT AND NOT A REVIEW NOTE. Every instance above passed review. The
// property is mechanical — a field with a default — so it is checkable, and a
// checkable rule that is left to reviewers is a rule that holds until someone
// is tired.
//
// Break-it record: restoring `island: tuple[float, float, float] = (FACE_BEARING,
// FACE_LOW, FACE_SPAN)` fires with
//   sculptlib/head.py: HeadSpec.island has a default
// and the message names the sculpt scripts that must state it instead.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIB = 'scripts/v2/blender/sculptlib';
const SCULPTS = 'scripts/v2/blender';

const modules = readdirSync(LIB).filter((f) => f.endsWith('.py'));

/** Every `@dataclass` field line in a `*Spec` class, with its class name. */
function specFields(source) {
  const out = [];
  const lines = source.split('\n');
  let cls = null;
  for (const line of lines) {
    const open = /^class (\w*Spec)\b/.exec(line);
    if (open) { cls = open[1]; continue; }
    if (cls === null) continue;
    // Dedent to column 0 ends the class body.
    if (line.trim() && !line.startsWith(' ')) { cls = null; continue; }
    // A field is `    name: type` at exactly one indent level. Methods,
    // comments, docstring prose and nested blocks are all excluded.
    const field = /^ {4}(\w+)\s*:\s*(.+)$/.exec(line);
    if (field) out.push({ cls, name: field[1], decl: field[2] });
  }
  return out;
}

describe('a shared sculpt spec cannot carry one character in its defaults', () => {
  it('finds the spec dataclasses at all, so a rename cannot silently empty this gate', () => {
    // A lint that iterates an empty list is indistinguishable from a lint that
    // passes. These are the specs that exist today; adding another is fine and
    // means updating this line, losing all of them is not.
    const found = new Set();
    for (const file of modules) {
      for (const f of specFields(readFileSync(join(LIB, file), 'utf8'))) found.add(f.cls);
    }
    expect([...found].sort()).toEqual(['ArmSpec', 'EarSpec', 'HandSpec', 'HeadSpec', 'ShoeSpec']);
  });

  it('gives no spec field a default value', () => {
    const bad = [];
    for (const file of modules) {
      for (const { cls, name, decl } of specFields(readFileSync(join(LIB, file), 'utf8'))) {
        // A default is an `=` outside the type's own brackets. `tuple[float,
        // float]` has no `=`; `= (0.92, -1.10, 1.54)` does.
        let depth = 0;
        for (const ch of decl) {
          if (ch === '[' || ch === '(') depth += 1;
          else if (ch === ']' || ch === ')') depth -= 1;
          else if (ch === '=' && depth === 0) { bad.push(`${file}: ${cls}.${name} has a default`); break; }
        }
      }
    }
    expect(
      bad,
      'A defaulted spec field is one character\'s measurement living in the shared library. ' +
        'Delete the default and state the value in each sculpt script beside the ' +
        '`# measured:` citation that produced it — see this file\'s header for the two ' +
        'times this shipped and what it cost.',
    ).toEqual([]);
  });

  it('has every sculpt script state every field of every spec it constructs', () => {
    // The complement of the rule above. Removing a default is only half the
    // guard: Python would catch a missing argument at sculpt time, but the
    // sculpt runs in Blender and nothing in `npm test` drives it, so a script
    // can sit broken through a whole green suite. That happened in this very
    // change — Tank's source lost its `ShoeSpec` construction entirely and the
    // full suite stayed green because no test opens Blender.
    const libSource = modules.map((f) => readFileSync(join(LIB, f), 'utf8')).join('\n');
    const fieldsOf = {};
    for (const { cls, name } of specFields(libSource)) (fieldsOf[cls] ??= []).push(name);

    const scripts = readdirSync(SCULPTS).filter((f) => /^sculpt-.*-source\.py$/.test(f));
    expect(scripts.length).toBeGreaterThan(0);

    const bad = [];
    for (const file of scripts) {
      const source = readFileSync(join(SCULPTS, file), 'utf8');
      for (const [cls, fields] of Object.entries(fieldsOf)) {
        // Each construction site, from `Cls(` to its matching paren.
        for (const m of source.matchAll(new RegExp(`\\b${cls}\\(`, 'g'))) {
          let i = m.index + m[0].length, depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '(') depth += 1;
            else if (source[i] === ')') depth -= 1;
            i += 1;
          }
          const call = source.slice(m.index, i);
          for (const f of fields) {
            if (!new RegExp(`(^|[(,\\s])${f}\\s*=`).test(call)) bad.push(`${file}: ${cls}( omits ${f}=`);
          }
        }
      }
    }
    expect(
      bad,
      'A sculpt script must state every field of the spec it builds. Without a default ' +
        'this is a TypeError — but only when Blender runs, which no test does.',
    ).toEqual([]);
  });
});
