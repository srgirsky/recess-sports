// ---------------------------------------------------------------------------
// A populated gallery is not approval. These mutation tests break the chain:
// change source/media/review, remove a required view, substitute stills for
// motion, or let an author review their own work. Each must lose acceptance.
// Existing unfinished art is allowed in CI; unsupported approval claims are
// not. `check:art-parity` is the deliberately stricter whole-product gate.
// Break-it record: fixtures below exercise each failure, including one altered
// byte in a screenshot; it reports "missing or changed media", not "approved".
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER } from '../../src/data/characters';
import { VENUE_GEOMETRY } from '../../src/v2/sim/field';
import { assess, digest, jsonDigest, makeTargets, sourceDigest, validateLedger, VIEWPORTS } from './art-review.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const targets = makeTargets(ROSTER, Object.keys(VENUE_GEOMETRY), readdirSync(join(root, 'src/v2/ui/screens')).filter(f => f.endsWith('Screen.ts')).map(f => f.replace(/\.ts$/, '')));
const ledger = JSON.parse(readFileSync(join(root, 'docs/v2/art/reviews.json')));
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'art-review-'));
  try {
    for (let i = 0; i < 60; i++) writeFileSync(join(dir, `shot-${i}.png`), 'original pixels');
    const target = { id: 'sample', criteria: ['motion'], required: [{ id: 'desktop-motion', kind: 'sequence' }] };
    const receipt = { target: 'sample', sourceHash: 'source', evidence: [{ id: 'desktop-motion', kind: 'sequence', url: '/v2/', viewport: VIEWPORTS.desktop, probe: { phase: 'live' }, surface: 'full-page', clock: 'devPaint', fps: 30, files: Array.from({ length: 60 }, (_, i) => ({ path: `shot-${i}.png`, sha256: digest('original pixels') })) }] };
    const review = { author: 'artist', reviewer: 'critic', at: '2026-09-18T00:00:00Z', evidenceHash: jsonDigest(receipt), reference: { source: 'reference movie', framesOrTime: '1:00–1:05', comparison: 'Observed planted feet and comparable readable contact.' }, criteria: { motion: { verdict: 'pass', notes: 'Watched contact and follow-through.' } } };
    const record = { review, approval: { by: 'maintainer', role: 'maintainer', at: '2026-09-18T01:00:00Z', note: 'Explicit approval fixture only', reviewHash: jsonDigest(review) } };
    const result = () => assess(target, receipt, record, dir, 'source');
    run({ dir, target, receipt, record, result });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
describe('art acceptance cannot be manufactured by a successful capture', () => {
  it('requires both an independent review and a bound maintainer verdict', () => fixture(({ target, receipt, dir, record, result }) => {
    expect(result().state).toBe('approved');
    expect(assess(target, receipt, {}, dir, 'source').state).toBe('awaiting-review');
    delete record.approval;
    expect(result().state).toBe('awaiting-approval');
    record.review.reviewer = record.review.author;
    expect(result().state).toBe('invalid-review');
  }));
  it('invalidates source, evidence, and changed verdicts', () => fixture(({ target, receipt, dir, record, result }) => {
    expect(assess(target, receipt, record, dir, 'changed-source').state).toBe('stale');
    receipt.evidence[0].probe.phase = 'between';
    expect(result().state).toBe('stale');
    record.review.evidenceHash = jsonDigest(receipt);
    expect(result().state).toBe('stale');
    record.approval.reviewHash = jsonDigest(record.review);
    expect(result().state).toBe('approved');
    writeFileSync(join(dir, 'shot-0.png'), 'changed pixels');
    expect(result().issues.join(' ')).toContain('missing or changed media');
  }));
  it('refuses missing views, still-only motion and lost HUD', () => fixture(({ receipt, result }) => {
    receipt.evidence[0].surface = 'canvas';
    expect(result().state).toBe('incomplete');
    receipt.evidence[0].surface = 'full-page';
    receipt.evidence[0].files[1] = receipt.evidence[0].files[0];
    expect(result().issues.join(' ')).toContain('repeated file paths');
    receipt.evidence[0].files.length = 1;
    expect(result().state).toBe('incomplete');
    receipt.evidence = [];
    expect(result().issues.join(' ')).toContain('Missing desktop-motion');
  }));
  it('does not approve failed criteria or open findings', () => fixture(({ target, receipt, record, dir, result }) => {
    expect(assess(target, receipt, record, dir, 'source', [{ targets: ['sample'], status: 'open' }]).state).toBe('changes-requested');
    record.review.criteria.motion.verdict = 'fail';
    expect(result().state).toBe('changes-requested');
  }));
  it('requires a pinned comparison, not a memory of the reference', () => fixture(({ record, result }) => {
    delete record.review.reference;
    expect(result().state).toBe('invalid-review');
  }));
  it('detects dirty source bytes and ignores generated review output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-source-'));
    try {
      mkdirSync(join(dir, 'src')); writeFileSync(join(dir, 'src/light.ts'), 'warm');
      const before = sourceDigest(dir);
      mkdirSync(join(dir, '.art-review')); writeFileSync(join(dir, '.art-review/report.json'), '{}');
      expect(sourceDigest(dir)).toBe(before);
      writeFileSync(join(dir, 'src/light.ts'), 'cold');
      expect(sourceDigest(dir)).not.toBe(before);
      const afterSource = sourceDigest(dir);
      mkdirSync(join(dir, 'public/fonts'), { recursive: true });
      writeFileSync(join(dir, 'public/fonts/face.woff2'), 'changed shared font');
      expect(sourceDigest(dir)).not.toBe(afterSource);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
describe('the live art inventory stays covered', () => {
  it('derives every character, park and screen, including additions', () => {
    expect(targets.filter(t => t.id.startsWith('character:'))).toHaveLength(ROSTER.length);
    expect(targets.filter(t => t.id.startsWith('venue:'))).toHaveLength(Object.keys(VENUE_GEOMETRY).length);
    expect(makeTargets([...ROSTER, { id: 'fixture', name: 'Fixture' }], ['future-park'], ['FutureScreen']).map(t => t.id)).toContain('character:fixture');
    for (const target of targets) expect(new Set(target.required.map(r => r.id)).size).toBe(target.required.length);
  });
  it('keeps findings owned, evidenced, and attached to real targets', () => {
    expect(validateLedger(ledger, targets)).toEqual([]);
    const broken = structuredClone(ledger);
    delete broken.findings[0].owner;
    expect(validateLedger(broken, targets).join(' ')).toContain('owner');
  });
  it('rejects stale or unsupported recorded approvals in CI', () => {
    const hash = sourceDigest(root);
    for (const [id, record] of Object.entries(ledger.reviews)) {
      const receipt = JSON.parse(readFileSync(join(root, record.receipt)));
      const result = assess(targets.find(t => t.id === id), receipt, record, root, hash, ledger.findings);
      expect(['stale', 'invalid-review', 'incomplete', 'missing'], `${id}: ${result.issues.join(' ')}`).not.toContain(result.state);
      if (record.approval) expect(result.state, `${id}: invalidate approval and retain it in history before changing the art`).toBe('approved');
    }
  });
});
