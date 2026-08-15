// Build the roster sign-off page: one row per character, every fidelity board
// and every critic note on a single scrollable page for a human pass.
//
// ★ THE 40-PIXEL READ IS EMBEDDED LOSSLESSLY AND SEPARATELY FROM THE BOARD.
//
// The page was hand-rolled once and the boards went in as JPEG at 4:2:0 chroma,
// then got scaled into a ~650px grid column by the browser. Both steps are close
// to a worst case for the one panel whose evidence IS its pixels: JPEG ringing
// smears the hard block edges, 4:2:0 halves the colour resolution across them,
// and the downscale resamples a 7x nearest-neighbour zoom back down through a
// smooth filter. The reviewer's own words were "the 40 pixel gameplay read looks
// blurry" — on a page whose entire job is to let someone judge that read.
//
// So the board stays JPEG (it is mostly renders and concept art, where JPEG is
// the right call and the size budget is real — 30 boards at 1600x1150) but at
// quality 88 with NO chroma subsampling, and the 40px read is additionally
// embedded as its own PNG at its NATIVE 40px height, upscaled by the browser
// with `image-rendering: pixelated`. That PNG is ~1.7kB — losslessness here is
// nearly free, and it is the only copy on the page a reviewer should trust for
// the field read. The board's copy stays as context, not as evidence.
//
// Regenerate whenever the boards change: `npm run review:signoff-page`. The page
// is written to the scratch path given by --out (default docs/v2/concepts), and
// published as an Artifact by hand — it is a review instrument, not a shipped
// page, and nothing in the game imports it.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

import { AUTHORED_CHARACTERS, slugFor } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const concepts = join(repo, 'docs', 'v2', 'concepts');
const fidelity = JSON.parse(readFileSync(join(repo, 'assets', 'v2', 'source', 'character-fidelity.json'), 'utf8'));

// Quality 88 with 4:4:4. Measured: ~232kB a board, ~9.1MB of base64 across the
// roster, inside the 16MB artifact ceiling with room for the HTML and strips.
const BOARD_QUALITY = 88;

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function boardJpeg(path) {
  const buf = await sharp(path).jpeg({ quality: BOARD_QUALITY, chromaSubsampling: '4:4:4' }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

// The same downscale the board's own strip is built from — lanczos to 40px tall,
// which is what a GPU does to a kid at gameplay distance. It is NOT re-upscaled
// here: the browser does that, with pixelated, so no resampling happens twice.
async function fieldReadPng(path) {
  const buf = await sharp(path).resize({ height: 40, fit: 'contain' })
    .png({ compressionLevel: 9 }).toBuffer();
  const { width } = await sharp(buf).metadata();
  return { uri: `data:image/png;base64,${buf.toString('base64')}`, width };
}

function scoreClass(score) {
  if (score === null || score === undefined) return 'abstain';
  return score >= 4 ? 'pass' : 'low';
}

function categoryCards(review) {
  return Object.values(review.categories).map((category) =>
    `<div class="cat ${scoreClass(category.score)}" tabindex="0">` +
    `<span class="cat-name">${esc(category.label)}</span>` +
    `<span class="cat-score">${category.score === null ? 'n/a' : category.score}</span>` +
    `<div class="cat-note">${esc(category.note ?? '')}</div></div>`
  ).join('\n');
}

async function section(id) {
  const character = AUTHORED_CHARACTERS[id];
  const review = fidelity.characters[id];
  const slug = slugFor(id);
  const board = await boardJpeg(join(concepts, review.evidence));
  const field = await fieldReadPng(join(concepts, `${slug}-front-review.png`));
  const polish = review.polishFindings ?? [];
  const demoted = review.demotion
    ? `<span class="frozen">re-approval pending — ${esc(review.demotion.reason.split('.')[0])}.</span>`
    : '';
  return `
<section class="kid" id="${esc(id)}" data-kid="${esc(id)}">
  <header class="kid-head">
    <h2>${esc(character.name)}</h2>
    <code class="kid-id">${esc(id)}</code>
    <span class="status">${esc(review.status)}</span>
    ${demoted}
    <label class="reviewed-toggle"><input type="checkbox" data-check="${esc(id)}"> Reviewed</label>
  </header>
  <div class="kid-body">
    <figure class="board">
      <img src="${board}" alt="${esc(character.name)} fidelity review board" loading="lazy" data-zoom>
      <figcaption>Full resolution: <code>docs/v2/concepts/${esc(review.evidence)}</code> — click to enlarge.
      This copy is JPEG; for the field read use the lossless strip on the right.</figcaption>
    </figure>
    <aside class="rail">
      <figure class="fieldread">
        <figcaption class="fieldread-head">40-pixel gameplay read <span>lossless</span></figcaption>
        <div class="fieldread-row">
          <img class="zoomed" src="${field.uri}" alt="${esc(character.name)} at 40px, magnified 7x" loading="lazy">
          <div class="fieldread-actual">
            <img src="${field.uri}" alt="${esc(character.name)} at actual 40px size" loading="lazy">
            <span>actual size<br>${field.width}&times;40</span>
          </div>
        </div>
      </figure>
      <div class="cats">${categoryCards(review)}</div>
      ${polish.length ? `<div class="polish"><h3>Between the 4s and the 5s</h3><ul>${
        polish.map((p) => `<li>${esc(p)}</li>`).join('\n')}</ul></div>` : ''}
    </aside>
  </div>
</section>`;
}

function chrome(sections, order) {
  const chips = order.map(({ id, name }) =>
    `<a class="chip" href="#${esc(id)}" data-kid="${esc(id)}"><span class="chip-dot"></span>${esc(name)}</a>`
  ).join('\n');
  return `<title>Roster Sign-Off</title>
<style>
  :root {
    --ground: #141928; --surface: #1c2338; --raise: #232c46; --line: #2c3654;
    --ink: #e9ecf5; --muted: #97a1bd; --clay: #d9924a; --grass: #7fbf6a; --low: #d97062;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.55;
  }
  h1, h2, h3 { font-family: "Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif; text-wrap: balance; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85em; color: var(--muted); }

  .topbar {
    position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--ground) 88%, transparent);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 1.25rem; padding: 0.7rem 1.5rem; flex-wrap: wrap;
  }
  .topbar h1 { margin: 0; font-size: 1.35rem; letter-spacing: 0.06em; text-transform: uppercase; }
  .topbar .sub { color: var(--muted); font-size: 0.85rem; }
  .progress { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--clay); font-weight: 600; }

  .lede { max-width: 62ch; padding: 1.4rem 1.5rem 0.4rem; color: var(--muted); }
  .lede strong { color: var(--ink); }

  nav.roster { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.8rem 1.5rem 1.4rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.22rem 0.65rem;
    border: 1px solid var(--line); border-radius: 999px; background: var(--surface);
    color: var(--ink); text-decoration: none; font-size: 0.82rem;
  }
  .chip:hover, .chip:focus-visible { border-color: var(--clay); outline: none; }
  .chip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
  .chip.done .chip-dot { background: var(--grass); }

  .kid { border-top: 1px solid var(--line); padding: 1.6rem 1.5rem 2.2rem; scroll-margin-top: 4.2rem; }
  .kid-head { display: flex; align-items: baseline; gap: 0.9rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
  .kid-head h2 { margin: 0; font-size: 1.7rem; letter-spacing: 0.03em; text-transform: uppercase; }
  .status {
    font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase; font-weight: 700;
    color: var(--grass); border: 1px solid color-mix(in srgb, var(--grass) 45%, var(--line));
    border-radius: 999px; padding: 0.12rem 0.6rem;
  }
  .frozen { font-size: 0.78rem; color: var(--clay); }
  .reviewed-toggle {
    margin-left: auto; display: inline-flex; align-items: center; gap: 0.45rem;
    font-size: 0.85rem; color: var(--muted); cursor: pointer; user-select: none;
  }
  .reviewed-toggle input { accent-color: var(--grass); width: 1.05rem; height: 1.05rem; cursor: pointer; }
  .kid.is-reviewed .kid-head h2 { color: var(--muted); }

  .kid-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 1.4rem; align-items: start; }
  @media (max-width: 980px) { .kid-body { grid-template-columns: 1fr; } }

  .board { margin: 0; }
  .board img {
    max-width: 100%; display: block; border: 1px solid var(--line); border-radius: 6px; cursor: zoom-in;
  }
  .board figcaption { margin-top: 0.4rem; font-size: 0.78rem; color: var(--muted); }

  /* The lossless field read. Nothing here may be resampled by a smooth filter:
     the PNG is native 40px tall and the browser does the whole magnification
     with nearest-neighbour, so a reviewer counts the same pixels the GPU draws. */
  .fieldread {
    margin: 0 0 0.9rem; background: var(--surface); border: 1px solid var(--line);
    border-radius: 6px; padding: 0.7rem 0.8rem;
  }
  .fieldread-head {
    font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--clay); font-weight: 700; margin-bottom: 0.6rem;
  }
  .fieldread-head span {
    color: var(--grass); border: 1px solid color-mix(in srgb, var(--grass) 45%, var(--line));
    border-radius: 999px; padding: 0 0.45rem; margin-left: 0.4rem; letter-spacing: 0.04em;
  }
  .fieldread-row { display: flex; align-items: flex-end; gap: 1rem; }
  .fieldread img { image-rendering: pixelated; display: block; }
  .fieldread .zoomed { height: 280px; width: auto; }
  .fieldread-actual { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .fieldread-actual img { height: 40px; width: auto; }
  .fieldread-actual span { font-size: 0.68rem; color: var(--muted); text-align: center; line-height: 1.3; }

  .cats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .cat {
    position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
    padding: 0.5rem 0.65rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
  }
  .cat-name { font-size: 0.78rem; color: var(--muted); }
  .cat-score { font-family: ui-monospace, Menlo, monospace; font-weight: 700; font-size: 1.05rem; }
  .cat.pass .cat-score { color: var(--grass); }
  .cat.low .cat-score { color: var(--low); }
  .cat.abstain .cat-score { color: var(--muted); }
  .cat-note {
    display: none; position: absolute; left: 0; right: -60%; top: calc(100% + 6px); z-index: 10;
    background: var(--raise); border: 1px solid var(--line); border-radius: 6px;
    padding: 0.6rem 0.75rem; font-size: 0.78rem; line-height: 1.5; color: var(--ink);
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  }
  .cat:hover .cat-note, .cat:focus-within .cat-note, .cat:focus .cat-note { display: block; }
  .cats .cat:nth-child(even) .cat-note { left: -60%; right: 0; }

  .polish { margin-top: 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 0.8rem 1rem; }
  .polish h3 { margin: 0 0 0.4rem; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--clay); }
  .polish ul { margin: 0; padding-left: 1.1rem; }
  .polish li { font-size: 0.82rem; color: var(--muted); margin-bottom: 0.3rem; }

  /* Scrolls rather than fits, so the board can be inspected at its native 1600px
     instead of being downscaled a second time inside the overlay. */
  .lightbox {
    position: fixed; inset: 0; z-index: 50; background: rgba(10, 13, 24, 0.93);
    display: none; cursor: zoom-out; padding: 1.5rem; overflow: auto;
  }
  .lightbox.open { display: block; }
  .lightbox img { max-width: none; display: block; margin: 0 auto; border-radius: 4px; }

  .foot { padding: 1.6rem 1.5rem 2.5rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; max-width: 70ch; }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>

<div class="topbar">
  <h1>Roster Sign-Off</h1>
  <span class="sub">All 30 characters at candidate · every score from an independent critic</span>
  <span class="progress" id="progress">0 / 30 reviewed</span>
</div>

<p class="lede">One row per kid, alphabetical. The board is the same evidence the critic scored — click it to enlarge at full 1600px; the caption gives the repo path to the PNG. Hover a score for the critic's verbatim note.
<strong>The 40-pixel read is embedded separately and losslessly</strong> — the board's own copy goes through JPEG and a browser downscale, so judge the field read from the strip in the right-hand rail, which is a native 40px PNG magnified with nearest-neighbour.
<strong>Approval stays yours:</strong> the checkboxes only track your pass through the list (saved in this browser), they don't write anything to the repo.</p>

<nav class="roster" aria-label="Jump to character">
${chips}
</nav>

${sections}

<p class="foot">Recording an approval in the repo needs <code>approvedBy</code>, <code>approvedAt</code> and <code>approvedEvidenceSha256</code> on the kid's entry in <code>assets/v2/source/character-fidelity.json</code> — the authored-character gate binds it to the exact board above. Junebug is the one demoted entry: her mesh must not change until her re-approval lands.</p>

<div class="lightbox" id="lightbox" role="dialog" aria-label="Enlarged board"><img alt=""></div>

<script>
  const KEY = 'roster-signoff-reviewed';
  const state = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  const boxes = document.querySelectorAll('[data-check]');
  const progress = document.getElementById('progress');
  function paint() {
    let n = 0;
    boxes.forEach((b) => {
      const id = b.dataset.check;
      const on = state.has(id);
      b.checked = on;
      if (on) n++;
      document.querySelector('section[data-kid="' + id + '"]').classList.toggle('is-reviewed', on);
      document.querySelector('.chip[data-kid="' + id + '"]').classList.toggle('done', on);
    });
    progress.textContent = n + ' / ' + boxes.length + ' reviewed';
  }
  boxes.forEach((b) => b.addEventListener('change', () => {
    b.checked ? state.add(b.dataset.check) : state.delete(b.dataset.check);
    localStorage.setItem(KEY, JSON.stringify([...state]));
    paint();
  }));
  paint();

  const lightbox = document.getElementById('lightbox');
  const lbImg = lightbox.querySelector('img');
  document.querySelectorAll('[data-zoom]').forEach((img) => img.addEventListener('click', () => {
    lbImg.src = img.src; lbImg.alt = img.alt; lightbox.classList.add('open');
  }));
  lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') lightbox.classList.remove('open'); });
</script>`;
}

async function main() {
  const outFlag = process.argv.indexOf('--out');
  const out = outFlag > 0 ? process.argv[outFlag + 1] : join(concepts, 'roster-signoff.html');
  const order = Object.keys(fidelity.characters)
    .map((id) => ({ id, name: AUTHORED_CHARACTERS[id].name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = [];
  for (const { id } of order) sections.push(await section(id));
  const html = chrome(sections.join('\n'), order);
  writeFileSync(out, html);
  console.log(`✓ ${out} — ${order.length} characters, ${(Buffer.byteLength(html) / 1048576).toFixed(1)}MB`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
}
