// ---------------------------------------------------------------------------
// node scripts/v2/capture-catcher.mjs [outDir] [--ids=a,b] [--clip=catcher_squat]
//
// Review stills for the catcher behind the plate, every roster kid, through
// the cameras that actually see him: the in-game PITCH and PITCH_HERO rigs
// with a real batter in the box, plus a side and a front view for posture
// (balance, knee fold, self-intersection) that the plate camera hides.
//
// The page is the game's own scene (`/v2/?play=1`), native rAF frozen and
// every frame painted explicitly, like `presentation-smoke.mjs`. The game's
// own nine kids are hidden; each catcher is built through the same factory,
// performance take and director the game uses, so a still shows the shipped
// clip on the delivered model. `--clip=field_ready` shoots the stance it
// replaced, for before/after boards.
//
// Not a test and not a gate: `src/v2/render/catcherSquat.test.ts` is the gate.
// This is evidence for an independent reviewer.
// ---------------------------------------------------------------------------

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const out = resolve(root, args.find((a) => !a.startsWith('--')) ?? '.art-review/catcher');
const ids = (args.find((a) => a.startsWith('--ids='))?.slice(6) ?? '').split(',').filter(Boolean);
const clip = args.find((a) => a.startsWith('--clip='))?.slice(7) ?? 'catcher_squat';
const port = Number(process.env.CATCHER_CAPTURE_PORT ?? 5193);
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(Error('vite did not start in 30s')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('ready in')) { clearTimeout(timer); ok(); } });
  server.once('exit', (code) => { clearTimeout(timer); fail(Error(`vite exited: ${code}`)); });
});

const VIEWS = ['pitch', 'hero', 'side', 'front'];
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => {}; });
  await page.goto(`http://localhost:${port}/v2/?play=1&seed=art-benchmark&venue=park`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__spike?.refs?.kids?.size > 0);
  await page.evaluate(() => { document.getElementById('hud')?.style.setProperty('display', 'none'); });

  const roster = await page.evaluate(async () => (await import('/src/data/characters.ts')).ROSTER.map((c) => c.id));
  const wanted = ids.length ? roster.filter((id) => ids.includes(id)) : roster;

  for (const id of wanted) {
    const shots = await page.evaluate(async ({ id, clip, views }) => {
      const { PerspectiveCamera } = await import('/node_modules/three/build/three.module.js');
      const { ROSTER } = await import('/src/data/characters.ts');
      const { createCharacter } = await import('/src/v2/render/CharacterFactory.ts');
      const { battingPlacement } = await import('/src/v2/render/battingPose.ts');
      const { RIGS } = await import('/src/v2/render/cameraCues.ts');
      const { FIELD_POSITIONS } = await import('/src/v2/sim/field.ts');
      const s = window.__spike;
      s.setControlMode('watch');
      s.devStepFixedClock(0);
      s.devPaint(1);
      for (const k of s.refs.kids.values()) k.root.visible = false;
      if (s.refs.ball) s.refs.ball.visible = false;
      window.__catcherCast?.forEach((v) => v.root.removeFromParent());

      const build = async (c) => {
        const { view } = await createCharacter(c, { noProxyLevel: true });
        await s.prepareCharacterPerformance(c.id);
        return { view, dir: s.directorFor(c, view) };
      };
      const catcher = await build(ROSTER.find((c) => c.id === id));
      const batter = await build(ROSTER.find((c) => c.id === 'nostrike'));
      const post = FIELD_POSITIONS.C;
      catcher.view.setPosition(post.x, post.z);
      catcher.view.setFacing(Math.atan2(-post.x, -post.z));
      const box = battingPlacement(batter.view.root.scale.x, batter.dir.battingPose.seated);
      batter.view.setPosition(box.x, box.z);
      batter.view.setFacing(box.facing);
      s.scene.add(catcher.view.root, batter.view.root);
      window.__catcherCast = [catcher.view, batter.view];
      catcher.dir.setGloveVisible?.(true);
      batter.dir.setGloveVisible?.(false);
      catcher.dir.play(clip);
      batter.dir.play('bat_stance');
      for (let i = 0; i < 40; i++) { catcher.dir.update(1 / 60); batter.dir.update(1 / 60); }

      // Rig eyes are drawn-frame; sim x negates at the root mirror.
      const cams = {
        pitch: { eye: RIGS.PITCH.eye, at: [0, 2.4, 1], fov: RIGS.PITCH.fov },
        hero: { eye: RIGS.PITCH_HERO.eye, at: [0, 2.6, 2], fov: RIGS.PITCH_HERO.fov },
        side: { eye: [-14, 3.2, -5], at: [0, 2.4, -5], fov: 32 },
        front: { eye: [0, 3.6, 9], at: [0, 2.4, -5], fov: 30 },
      };
      const gl = s.renderer.gl;
      const canvas = gl.domElement;
      const shots = {};
      for (const v of views) {
        const c = cams[v];
        const cam = new PerspectiveCamera(c.fov, canvas.width / canvas.height, 0.5, 1600);
        cam.position.set(c.eye[0], c.eye[1], c.eye[2]);
        cam.lookAt(c.at[0], c.at[1], c.at[2]);
        batter.view.root.visible = v === 'pitch' || v === 'hero';
        gl.render(s.scene, cam);
        shots[v] = canvas.toDataURL('image/png');
      }
      return shots;
    }, { id, clip, views: VIEWS });
    const tiles = await Promise.all(VIEWS.map((v) => sharp(Buffer.from(shots[v].split(',')[1], 'base64')).resize(480, 270).png().toBuffer()));
    await sharp({ create: { width: 960, height: 540, channels: 3, background: '#000' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 480, top: Math.floor(i / 2) * 270 })))
      .png()
      .toFile(resolve(out, `${clip}-${id}.png`));
    console.log(`  ${id}`);
  }
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
