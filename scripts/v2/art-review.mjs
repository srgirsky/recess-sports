// ---------------------------------------------------------------------------
// Whole-game art acceptance. Technical success is not an aesthetic verdict.
// The matrix comes from the live roster, venues and screen files. Captures bind
// to source bytes, reviews bind to capture bytes, and human sign-off binds to
// the review. A changed light/model/camera invalidates the chain, even on the
// same git commit. Missing evidence stays missing; nothing auto-approves art.
// Character critiques remain in character-fidelity.json and its triage sidecar.
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const jsonDigest = value => digest(JSON.stringify(value));
export const VIEWPORTS = { desktop: { width: 1280, height: 720 }, phone: { width: 844, height: 390 } };
export const RUBRIC = {
  identity: 'Distinct silhouette, expressions and personality survive at the actual display size.',
  construction: 'Hair, clothes, joints, props and buildings have intentional form, thickness and clean intersections.',
  materials: 'Surfaces read as their intended material and share one cartoon art direction.',
  grounding: 'Consistent lighting, readable faces, contact shadows and believable contact with ground and props.',
  motion: 'Weight, anticipation, planted feet, contact and follow-through read in continuous motion.',
  composition: 'The ball, controlled kid and next action remain clear; scenery and HUD support them.',
  cohesion: 'Icons, type, cards, effects and 3D artwork belong to the same world.'
};
export function walk(root, base = root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walk(path, base) : entry.isFile() ? [relative(base, path).split(sep).join('/')] : [];
  }).sort();
}
// Conservative invalidation: all runtime source, shipped assets (including shared fonts), build inputs,
// and the review instruments. Docs-only edits do not invalidate screenshots.
export function sourceDigest(root) {
  const dirs = ['src', 'public', 'scripts/v2'];
  const files = dirs.flatMap(dir => walk(join(root, dir)).filter(p => !/\.test\.[jt]s$/.test(p)).map(p => `${dir}/${p}`));
  for (const file of ['index.html', 'v2/index.html', 'package.json', 'package-lock.json', 'vite.config.ts']) {
    if (existsSync(join(root, file))) files.push(file);
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0');
  return hash.digest('hex');
}
const shot = (id, kind = 'still') => ({ id, kind });
export function makeTargets(roster, venues, screens) {
  const sizes = Object.keys(VIEWPORTS);
  const lighting = ['day', 'night'];
  const criteria = Object.keys(RUBRIC);
  return [
    { id: 'benchmark:park', name: 'Parks Dept #2 — complete at-bat', owner: 'Art direction', criteria,
      required: sizes.flatMap(size => lighting.flatMap(light => [shot(`${size}-${light}`), shot(`${size}-${light}-motion`, 'sequence')])) },
    ...roster.map(kid => ({ id: `character:${kid.id}`, name: kid.name, owner: 'Character art and animation', criteria,
      required: sizes.flatMap(size => ['draft', 'field', 'run', 'swing', 'catch', 'celebrate'].map(beat => shot(`${size}-${beat}`, ['draft', 'field'].includes(beat) ? 'still' : 'sequence'))) })),
    ...venues.map(id => ({ id: `venue:${id}`, name: id, owner: 'Environment art', criteria: ['construction', 'materials', 'grounding', 'composition', 'cohesion'],
      required: sizes.flatMap(size => lighting.flatMap(light => ['plate', 'field', 'deep'].map(view => shot(`${size}-${light}-${view}`)))) })),
    ...screens.map(name => ({ id: `screen:${name}`, name, owner: 'UI art', criteria: ['composition', 'cohesion'], required: sizes.map(size => shot(size)) })),
    ...['contact', 'catch', 'throw', 'slide', 'home-run', 'replay', 'inning-break'].map(name => ({ id: `action:${name}`, name, owner: 'Animation and VFX', criteria: ['grounding', 'motion', 'composition', 'cohesion'], required: sizes.map(size => shot(size, 'sequence')) }))
  ];
}
function safeFile(root, file) {
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.split(/[\\/]/).includes('..')) return null;
  const path = resolve(root, file);
  return path.startsWith(resolve(root) + sep) && existsSync(path) && statSync(path).isFile() ? path : null;
}
export function evidenceErrors(receipt, target, root, currentHash) {
  const errors = [];
  if (!receipt || receipt.sourceHash !== currentHash) errors.push('Capture missing or stale — capture the current source.');
  if (receipt?.target !== target.id) errors.push('Capture target does not match.');
  const evidence = receipt?.evidence ?? [];
  if (new Set(evidence.map(e => e.id)).size !== evidence.length) errors.push('Duplicate evidence slots.');
  for (const required of target.required) {
    const item = evidence.find(e => e.id === required.id);
    if (!item || item.kind !== required.kind) { errors.push(`Missing ${required.id} (${required.kind}).`); continue; }
    if (!item.url || !item.viewport || !item.probe || item.surface !== 'full-page') errors.push(`${required.id}: record URL, viewport, probe and full-page capture.`);
    const size = required.id.split('-')[0];
    if (item.viewport?.width !== VIEWPORTS[size]?.width || item.viewport?.height !== VIEWPORTS[size]?.height) errors.push(`${required.id}: wrong viewport.`);
    if (!Array.isArray(item.files) || !item.files.length) { errors.push(`${required.id}: no media.`); continue; }
    if (item.kind === 'sequence' && new Set(item.files.map(f => f.path)).size !== item.files.length) errors.push(`${required.id}: repeated file paths are not a motion sequence.`);
    if (item.kind === 'sequence' && (item.files.length < 60 || item.fps !== 30 || item.clock !== 'devPaint')) errors.push(`${required.id}: require at least 60 consecutive frames at 30fps, painted from the fixed clock.`);
    if (target.id === 'benchmark:park' && item.kind === 'sequence' && item.probe.atBatCompleted !== true) errors.push(`${required.id}: capture through an actual at-bat outcome.`);
    for (const file of item.files) {
      const path = safeFile(root, file.path);
      if (!path || digest(readFileSync(path)) !== file.sha256) errors.push(`${required.id}: missing or changed media ${file.path}.`);
    }
  }
  return errors;
}
export function assess(target, receipt, record, root, currentHash, findings = []) {
  const issues = evidenceErrors(receipt, target, root, currentHash);
  if (!receipt) return { state: 'missing', issues };
  if (receipt.sourceHash !== currentHash) return { state: 'stale', issues };
  if (issues.length) return { state: 'incomplete', issues };
  const review = record?.review;
  if (!review) return { state: 'awaiting-review', issues: ['Evidence captured; no visual verdict recorded.'] };
  if (review.evidenceHash !== jsonDigest(receipt)) return { state: 'stale', issues: ['Evidence changed after review — review it again.'] };
  if (!review.author || !review.reviewer || review.author === review.reviewer || !validDate(review.at)) return { state: 'invalid-review', issues: ['Record a dated review by someone other than the asset author.'] };
  if (!review.reference?.source || !review.reference?.framesOrTime || !review.reference?.comparison) return { state: 'invalid-review', issues: ['Pin reference frames or a video time range and write the actual comparison.'] };
  if (target.criteria.some(key => !['pass', 'fail'].includes(review.criteria?.[key]?.verdict) || !review.criteria[key].notes?.trim())) return { state: 'invalid-review', issues: ['Every rubric criterion needs an observed verdict and notes.'] };
  if (target.criteria.some(key => review.criteria[key].verdict === 'fail') || findings.some(f => f.targets.includes(target.id) && f.status === 'open')) return { state: 'changes-requested', issues: ['Resolve the failed criteria and open findings, then capture and review again.'] };
  const approval = record.approval;
  if (!approval) return { state: 'awaiting-approval', issues: ['Independent review passed; maintainer approval remains.'] };
  if (approval.reviewHash !== jsonDigest(review)) return { state: 'stale', issues: ['Review changed after approval — ask the maintainer to review the new result.'] };
  if (approval.role !== 'maintainer' || !approval.by?.trim() || !approval.note?.trim() || !validDate(approval.at)) return { state: 'invalid-review', issues: ['Approval must transcribe an explicit, dated maintainer verdict.'] };
  return { state: 'approved', issues: [] };
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function validateLedger(ledger, targets) {
  const errors = [];
  const ids = new Set(targets.map(t => t.id));
  if (ledger.version !== 1) errors.push('Unsupported ledger version.');
  if (!Array.isArray(ledger.findings) || !ledger.reviews || typeof ledger.reviews !== 'object') return [...errors, 'Ledger needs findings and reviews.'];
  for (const id of Object.keys(ledger.reviews)) if (!ids.has(id)) errors.push(`Unknown review target ${id} — use the generated matrix.`);
  const seen = new Set();
  for (const f of ledger.findings) {
    if (seen.has(f.id)) errors.push(`Duplicate finding ${f.id}.`);
    seen.add(f.id);
    if (!f.id || !f.owner || !f.observation || !f.acceptance || !['open', 'resolved'].includes(f.status) || !['defect', 'review-task'].includes(f.kind)) errors.push(`${f.id}: findings need an owner, observation, acceptance, kind and status.`);
    if (!Array.isArray(f.targets) || !f.targets.length || f.targets.some(id => !ids.has(id))) errors.push(`${f.id}: unknown or missing targets.`);
    if (!Array.isArray(f.evidence) || !f.evidence.length) errors.push(`${f.id}: cite evidence or the documented coverage gap.`);
    if (f.status === 'resolved' && (!f.resolution?.note || !f.resolution?.receiptHash)) errors.push(`${f.id}: resolution needs a note and the new evidence receipt hash.`);
  }
  return errors;
}
export const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
