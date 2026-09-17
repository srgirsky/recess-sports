// ---------------------------------------------------------------------------
// node scripts/v2/sculptlib-freshness.mjs            (npm run census:sculptlib)
//
// WHICH KIDS ARE ACTUALLY BUILT ON HEAD's SHARED LIBRARY — a report, not a gate.
//
// ★ WHY A REPORT AND NOT A LINT. A change to `scripts/v2/blender/sculptlib/**`
// reaches a kid only when that kid's `.blend` is rebuilt through Blender and
// re-exported (`.claude/skills/sculpt-character` § The two instruments that
// lie: `export:authored-character` reads the .blend, it does not run the
// sculpt script). So the nose rows (#221), the joint sweeps (#208-#220) and
// every later builder change sit on main while most of the roster still ships
// a mesh the OLD library produced — and every one of those kids' critiques
// describes that older mesh, with its `scoredBoardSha256` still honestly bound
// to the board it was scored from. `evidence-freshness.lint` cannot see this:
// the GLB, the stills and the record all agree with each other; they only
// disagree with the library.
//
// A gate here would demand every kid be rebuilt in the same PR as any
// sculptlib change, which is thirty Blender runs and thirty critic rounds per
// primitive. That is the wrong shape. The right shape is: a shared fix lands,
// and this census says who has not absorbed it yet, in what order, and whether
// they can afford it. It is the batch list for a polish sweep.
//
// What it prints, per authored kid:
//   stale   — commits to sculptlib/ since the kid's .blend was last committed
//             (0 = built on HEAD's library), and which library files moved
//   lod0    — delivered LOD0 triangles and headroom under the 7000 ceiling
//             (every joint ring costs 56-112; a kid under ~60 spare pays for a
//             shared change by trimming before it can build — see Boomer's
//             worked example in `sculpt-boomer-source.py`)
//   status  — the fidelity record's status and six scores
//   open    — open polish findings by triage class (no-defect-note excluded)
//
// Sorted worst-first: most stale, then least headroom. That order is where the
// shared-fix discoveries land earliest, which is what the campaign's rule
// ("build the primitive once, then sweep") wants.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTHORED_CHARACTERS } from './character-registry.mjs';
import { RUNTIME_DIR, loadContract, validateFile } from './validate-models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const LOD0_BUDGET = 7000;

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

const fidelity = JSON.parse(readFileSync(join(repo, 'assets/v2/source/character-fidelity.json'), 'utf8'));
const triage = JSON.parse(readFileSync(join(repo, 'assets/v2/source/character-fidelity-triage.json'), 'utf8'));

/** Open findings by class for one kid, from the triage sidecar. */
function openByClass(id) {
  const out = {};
  for (const row of Object.values(triage.findings)) {
    if (row.char !== id || row.class === 'no-defect-note') continue;
    out[row.class] = (out[row.class] ?? 0) + 1;
  }
  return out;
}

/** LOD0 triangle count from the validator's own measurement, never a re-parse. */
function lod0Triangles(id, contract) {
  const { report } = validateFile(join(RUNTIME_DIR, `kid_${id}.glb`), contract);
  const line = report.items.find((i) => i.rule === 'character.lod' && i.message.includes('_LOD0:'));
  const m = line && /_LOD0: (\d+) triangles/.exec(line.message);
  return m ? Number(m[1]) : null;
}

export async function census() {
  const contract = await loadContract();
  const rows = [];
  for (const [id, record] of Object.entries(AUTHORED_CHARACTERS)) {
    const blend = `assets/v2/source/${record.source}`;
    const last = git('log', '-1', '--format=%h', '--', blend);
    const since = last ? git('log', '--format=%h', `${last}..HEAD`, '--', 'scripts/v2/blender/sculptlib/') : '';
    const staleCommits = since ? since.split('\n').filter(Boolean) : [];
    const files = last
      ? [...new Set(git('log', '--name-only', '--format=', `${last}..HEAD`, '--', 'scripts/v2/blender/sculptlib/')
          .split('\n').filter(Boolean).map((f) => f.replace('scripts/v2/blender/sculptlib/', '')))]
      : [];
    const dirty = git('status', '--porcelain', '--', blend) !== '';
    const lod0 = lod0Triangles(id, contract);
    const rec = fidelity.characters[id] ?? {};
    const scores = fidelity.categories.map((c) => rec.categories?.[c.id ?? c]?.score ?? '·');
    rows.push({
      id, slug: record.source.replace('-pilot.blend', ''), lastBlend: last, dirty,
      stale: staleCommits.length, files, lod0, headroom: lod0 == null ? null : LOD0_BUDGET - lod0,
      status: rec.status ?? 'unrecorded', scores, open: openByClass(id),
    });
  }
  rows.sort((a, b) => b.stale - a.stale || (a.headroom ?? 0) - (b.headroom ?? 0));
  return rows;
}

function fmtOpen(open) {
  return Object.entries(open).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—';
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const rows = await census();
  const head = git('rev-parse', '--short', 'HEAD');
  const lib = git('log', '-1', '--format=%h %s', '--', 'scripts/v2/blender/sculptlib/');
  console.log(`sculptlib freshness at ${head} — last library change: ${lib}\n`);
  console.log('kid              stale  lod0  spare  status        scores        open findings by class');
  for (const r of rows) {
    const flag = r.dirty ? '*' : ' ';
    console.log(
      `${flag}${r.id.padEnd(16)} ${String(r.stale).padStart(3)}   ${String(r.lod0 ?? '?').padStart(4)}  ${String(r.headroom ?? '?').padStart(4)}   ${r.status.padEnd(13)} ${r.scores.join(' ').padEnd(13)} ${fmtOpen(r.open)}`
    );
  }
  const stale = rows.filter((r) => r.stale > 0);
  console.log(`\n${stale.length}/${rows.length} kids ship a mesh built before HEAD's sculptlib (* = .blend dirty in the working tree).`);
  const tight = rows.filter((r) => r.headroom != null && r.headroom < 60);
  if (tight.length) console.log(`under 60 spare LOD0 triangles — trim before any shared change can build: ${tight.map((r) => r.id).join(', ')}`);
}
