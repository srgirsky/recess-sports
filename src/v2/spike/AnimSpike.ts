// ---------------------------------------------------------------------------
// ★ THE CLIP REVIEW SURFACE — `/v2/?anims=1`.
//
// `docs/v2/animation-brief.md` ends with four acceptance criteria, and three of
// them are things you have to WATCH:
//
//   2. every clip plays on the selected production model (or its honest proxy
//      fallback) without popping into what it settles into
//   3. loops are seamless at 0.6x, 1.0x and 1.4x
//   4. every clip is readable at 40px tall
//
// Before this page there was no way to run any of them, which made them
// promises rather than gates. So: one proxy, every clip in the contract, the
// three playback rates as buttons, and a real 40px viewport rendered in the
// same frame as the big one — criterion 4 is then a thing you look at rather
// than imagine.
//
// Two readouts are COMPUTED rather than eyeballed, because eyes are bad at
// both:
//   * the loop seam, as the largest bone-quaternion delta between the first and
//     last keyframe (a seam that is "nearly" closed pops once per stride,
//     forever, and at 1.4x you will blame the rate instead of the seam), and
//   * the marker frame, flashed on the frame it actually lands on.
//
// It also answers the question the whole brief exists to de-risk: does the
// canonical skeleton EXPRESS these clips on the geometry that will ship? The
// proxy remains reachable with `?proxy=1`, but it must never impersonate an
// authored model on the review surface.
// ---------------------------------------------------------------------------

import { Fog, PerspectiveCamera, Quaternion, Scene, Vector2, type AnimationClip } from 'three';
import { ROSTER } from '../../data/characters';
import { VENUE_GEOMETRY } from '../sim/field';
import { Renderer } from '../render/Renderer';
import { Lighting } from '../render/Lighting';
import { OutlineRegistry } from '../render/materials/outline';
import { VENUE_LOOKS, buildField, type FieldBuild } from '../render/Field';
import { SKY_HORIZON, buildSky } from '../render/Sky';
import { ProxyCharacter } from '../render/ProxyCharacter';
import { createCharacter, type KidSource } from '../render/CharacterFactory';
import { FACE_CELLS } from '../render/faceAtlas';
import type { KidView } from '../render/CharacterModel';
import { AnimationDirector } from '../render/AnimationDirector';
import { buildProceduralClips } from '../render/proceduralClips';
import {
  configureModelLoader,
  loadAnimationLibrary,
  loadCharacterAnimationLibrary,
} from '../render/modelLoader';
import { hasDeliveredPerformance, loadManifest } from '../render/assets';
import { CLIPS, FPS, clipSpec, type AnimName, type ClipSpec } from '../render/clips';

/** The three rates the brief requires loops to survive. */
const RATES = [0.6, 1.0, 1.4] as const;

/** Criterion 4, literally: the thumbnail viewport is this many pixels tall. */
const THUMB_PX = 40;

export class AnimSpike {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: Renderer;
  private readonly lighting: Lighting;
  private readonly outlines = new OutlineRegistry();

  private field!: FieldBuild;
  private kid!: KidView;
  private kidSource: KidSource = 'proxy-undelivered';
  private director!: AnimationDirector;
  private deliveredClips: AnimationClip[] = [];
  private performanceClips: AnimationClip[] = [];

  private clipIndex = 0;
  private rate: number = 1;
  private kidIndex = 0;
  /** Index into `FACE_CELLS`; survives a kid rebuild so a sweep keeps its cell. */
  private faceIndex = 0;
  private kidLoadVersion = 0;
  private raf = 0;
  private lastNow = 0;
  private statsEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private readoutEl: HTMLElement | null = null;
  private markerFlash = 0;
  private lastClipTime = 0;
  private lastPlaying: AnimName | null = null;
  private lastReadout = '';
  private readonly size = new Vector2();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const requestedId = new URLSearchParams(location.search).get('kid');
    const requestedIndex = requestedId ? ROSTER.findIndex((character) => character.id === requestedId) : -1;
    if (requestedIndex >= 0) this.kidIndex = requestedIndex;

    this.renderer = new Renderer(canvas);
    this.renderer.bindOutlines(this.outlines);
    configureModelLoader(this.renderer.gl);

    // Close, slightly above eye level, looking at the chest — the framing an
    // animator reviews in. Not a gameplay rig; nothing here is a gameplay rig.
    this.camera = new PerspectiveCamera(34, 1, 0.1, 400);
    // ~17ft out: a 10ft-tall frame around a 6.4ft kid, so a dive or a leap
    // stays inside it. Closer than this and `catch_jump` leaves the top.
    this.camera.position.set(8.2, 6.0, 14.6);

    this.lighting = new Lighting({ shadowMapSize: this.renderer.tier.shadowMapSize });
    this.scene.add(this.lighting.root);
    this.scene.add(buildSky());
    this.scene.fog = new Fog(SKY_HORIZON, 260, 900);

    const geo = VENUE_GEOMETRY.park;
    this.field = buildField(geo, VENUE_LOOKS.park, this.outlines, { anisotropy: this.renderer.tier.anisotropy });
    this.scene.add(this.field.root);

    this.buildInitialProxy();
    this.mountUi();
    this.onResize();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
  }

  // --- Build ---------------------------------------------------------------

  private installKid(kid: KidView, source: KidSource): void {
    if (this.kid) {
      this.director.dispose();
      this.kid.root.removeFromParent();
      this.kid.dispose();
    }
    this.kid = kid;
    this.kidSource = source;
    // Stand at the origin, turned so a lateral dive travels ACROSS the frame
    // rather than into it — but three-quarters toward the camera, not away
    // from it.
    //
    // ★ This was `Math.PI * 0.82`, which puts the camera BEHIND the head: the
    // face-toward-camera dot is −0.47, so the page reviewing whether a clip
    // faces the right way was showing the back of the head by default. At 0.5
    // the dot is +0.49 — a true three-quarter view with both eyes in shot —
    // and the lateral component is still 0.87 of maximum, so a dive crosses
    // the frame very nearly as well as it did.
    kid.setPosition(0, 0);
    kid.setFacing(Math.PI * 0.5);
    this.scene.add(kid.root);

    this.director = new AnimationDirector(kid.mesh, {
      clips: this.deliveredClips,
      performanceClips: this.performanceClips,
      fallback: buildProceduralClips(),
    });
    this.playCurrent();
  }

  private buildInitialProxy(): void {
    const character = ROSTER[this.kidIndex % ROSTER.length];
    this.installKid(
      new ProxyCharacter(character.visual, { uniform: 1, outlines: this.outlines }),
      'proxy-undelivered'
    );
  }

  /** The clip the reviewer SELECTED. */
  private get spec(): ClipSpec {
    return CLIPS[this.clipIndex] as ClipSpec;
  }

  /**
   * Reviewed vs actually playing — they diverge, and the readout used to lie
   * about it.
   *
   * A one-shot ends and the director plays its `returnsTo` clip. The readout
   * kept counting that clip's time against the REVIEWED clip's frame count, so
   * `throw_overhand` (24f) settling into `field_ready` (40f) displayed "frame
   * 33 / 24" — a counter past its own maximum, which reads as a broken clip
   * rather than as the settle it is.
   */
  private get live(): { reviewed: ClipSpec; playing: ClipSpec; settled: boolean } {
    const reviewed = this.spec;
    const name = this.director?.playing ?? null;
    const playing = name ? clipSpec(name) : reviewed;
    return { reviewed, playing, settled: playing.name !== reviewed.name };
  }

  private playCurrent(): void {
    const spec = this.spec;
    this.director.play(spec.name as AnimName, { rate: this.rate, restart: true });
    // We deliberately let a one-shot settle away rather than `hold()`ing it:
    // criterion 2 IS the settle ("plays without popping into what it settles
    // into"), so suppressing it would suppress the thing under review. The
    // readout says which clip is on screen — see `live`.
    this.lastClipTime = 0;
    this.lastPlaying = spec.name as AnimName;
    this.markerFlash = 0;
    this.refreshList();
  }

  // --- UI -------------------------------------------------------------------

  private mountUi(): void {
    const hud = document.getElementById('hud');
    if (!hud) return;

    const panel = document.createElement('div');
    panel.className = 'interactive anim-list';
    panel.style.cssText =
      'grid-area: left; align-self: stretch; overflow-y: auto; margin: var(--s2);' +
      'padding: var(--s2); border-radius: var(--radius); background: rgb(20 32 46 / .82);' +
      'font: 500 .74rem/1.5 ui-monospace, Menlo, monospace; min-width: 15rem; pointer-events: auto;';
    this.listEl = panel;
    hud.appendChild(panel);

    const bar = document.createElement('div');
    bar.style.cssText =
      'grid-area: bottom; display:flex; gap:.5rem; justify-content:center; padding:1rem; flex-wrap:wrap;';

    const btn = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'interactive';
      b.textContent = label;
      b.style.cssText =
        'font:600 1rem/1 var(--font); padding:.7rem 1rem; border-radius:var(--radius);' +
        'border:var(--stroke) solid var(--outline); background:var(--cream); color:var(--ink);' +
        'box-shadow:var(--shadow); cursor:pointer;';
      b.addEventListener('click', onClick);
      bar.appendChild(b);
      return b;
    };

    btn('◀', () => this.step(-1));
    btn('▶', () => this.step(1));
    btn('↻ REPLAY', () => this.playCurrent());
    const rateBtn = btn('1.0×', () => {
      const i = (RATES.indexOf(this.rate as (typeof RATES)[number]) + 1) % RATES.length;
      this.rate = RATES[i];
      rateBtn.textContent = `${this.rate.toFixed(1)}×`;
      this.playCurrent();
    });
    const kidBtn = btn(`👤 ${ROSTER[this.kidIndex % ROSTER.length].name}`, () => {
      this.kidIndex++;
      kidBtn.textContent = `👤 ${ROSTER[this.kidIndex % ROSTER.length].name}`;
      void this.rebuildKid();
    });
    // ★ EXPRESSIONS ARE REVIEWABLE HERE NOW. Rubric 3.14 and 5.1 both ask for
    // the expression cells judged in gameplay lighting — 3.14 by name, "lips,
    // teeth and tongue where a cell opens the mouth" — and until this button
    // existed there was no surface anywhere that showed one. Two consecutive
    // reviews recorded 3.14 as unverifiable for want of it, which is a gap in
    // the instrument rather than a finding about any character. `setExpression`
    // is a no-op on a proxy, so this reads `neutral` on a stand-in and the cell
    // name in the readout says which is which.
    const faceBtn = btn(`😐 ${FACE_CELLS[this.faceIndex]}`, () => {
      this.faceIndex = (this.faceIndex + 1) % FACE_CELLS.length;
      faceBtn.textContent = `😐 ${FACE_CELLS[this.faceIndex]}`;
      this.kid?.setExpression(FACE_CELLS[this.faceIndex]);
    });

    hud.appendChild(bar);

    const readout = document.createElement('div');
    readout.style.cssText =
      'grid-area: top; justify-self: center; margin: var(--s2); padding: var(--s2) var(--s3);' +
      'border-radius: var(--radius); background: rgb(20 32 46 / .82); text-align:center;' +
      'font: 600 .9rem/1.5 var(--font);';
    this.readoutEl = readout;
    hud.appendChild(readout);

    this.statsEl = document.createElement('pre');
    this.statsEl.id = 'devstats';
    document.getElementById('app')?.appendChild(this.statsEl);

    this.refreshList();
  }

  private refreshList(): void {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    CLIPS.forEach((c, i) => {
      const row = document.createElement('button');
      const on = i === this.clipIndex;
      const source = this.director?.sourceFor(c.name) ?? 'procedural';
      const placeholder = source === 'procedural';
      row.className = 'interactive';
      row.style.cssText =
        'display:block; width:100%; text-align:left; border:0; cursor:pointer; padding:.15rem .35rem;' +
        'border-radius:.35rem; font:inherit; min-block-size:auto; min-inline-size:auto;' +
        `background:${on ? 'var(--cream)' : 'transparent'}; color:${on ? 'var(--ink)' : 'var(--cream)'};` +
        `opacity:${placeholder ? 0.72 : 1};`;
      const marker = c.marker ? ` ●${c.marker.frame}` : '';
      const sourceMark = source === 'character' ? '★' : source === 'shared' ? '▪' : '▫';
      row.textContent = `${sourceMark} ${c.name.padEnd(15)}${String(c.frames).padStart(3)}f${c.loop ? ' ↻' : '  '}${marker}`;
      row.addEventListener('click', () => {
        this.clipIndex = i;
        this.playCurrent();
      });
      this.listEl!.appendChild(row);
    });
  }

  private step(delta: number): void {
    this.clipIndex = (this.clipIndex + delta + CLIPS.length) % CLIPS.length;
    this.playCurrent();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === ' ') this.step(1);
    if (e.key === 'ArrowLeft') this.step(-1);
    if (e.key === 'r') this.playCurrent();
    if (e.key >= '1' && e.key <= '3') {
      this.rate = RATES[Number(e.key) - 1];
      this.playCurrent();
    }
  };

  private onResize = (): void => {
    this.renderer.resize();
    const c = this.canvas;
    this.camera.aspect = (c.clientWidth || 1) / (c.clientHeight || 1);
    this.camera.updateProjectionMatrix();
  };

  // --- Loop -----------------------------------------------------------------

  async start(): Promise<void> {
    await loadManifest();
    try {
      this.deliveredClips = await loadAnimationLibrary();
    } catch (error) {
      console.warn(
        `[AnimSpike] shared animation library unavailable; reviewing procedural fallbacks: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    await this.rebuildKid();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.update(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Load the selected kid's optional partial take, then rebuild atomically. */
  private async rebuildKid(): Promise<void> {
    const version = ++this.kidLoadVersion;
    const character = ROSTER[this.kidIndex % ROSTER.length];
    const made = await createCharacter(character, { uniform: 1, outlines: this.outlines });
    let performanceClips: AnimationClip[] = [];
    if (hasDeliveredPerformance(character.id)) {
      try {
        performanceClips = await loadCharacterAnimationLibrary(character.id);
      } catch (error) {
        console.warn(
          `[AnimSpike] ${character.id} performance unavailable; reviewing shared motion: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    if (version !== this.kidLoadVersion) {
      made.view.dispose();
      return;
    }
    this.performanceClips = performanceClips;
    this.installKid(made.view, made.source);
  }

  private update(now: number): void {
    // REAL dt, not LookSpike's fixed 1/60: judging a 0.6x loop against a
    // hardcoded step would be judging arithmetic, not animation.
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 1 / 60;
    this.lastNow = now;

    this.director.update(dt);
    this.camera.lookAt(0, 3.4, 0);
    this.lighting.fitShadowTo([this.kid.root]);

    const gl = this.renderer.gl;
    // ★ CSS pixels, NOT `domElement.width`. three's `setViewport` multiplies by
    // the pixel ratio itself, so handing it device pixels double-scales the
    // whole render: at DPR 2 the scene draws at 2x anchored to the bottom-left
    // and the subject slides off the right of the frame. (Observed exactly
    // that: a centred ground shadow under a character rendered off-screen.)
    gl.getSize(this.size);
    const w = this.size.x;
    const h = this.size.y;

    gl.setScissorTest(false);
    gl.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.camera, now);

    // ★ Criterion 4, rendered rather than imagined: the SAME character in the
    // SAME pose at 40 CSS pixels tall. A clip that is unreadable here is
    // unreadable in the game, where the wide camera draws a kid about that big.
    const tw = Math.round(THUMB_PX * (this.camera.aspect || 1));
    const th = THUMB_PX;
    gl.setScissorTest(true);
    gl.setViewport(w - tw - 12, h - th - 12, tw, th);
    gl.setScissor(w - tw - 12, h - th - 12, tw, th);
    gl.render(this.scene, this.camera);
    gl.setScissorTest(false);

    this.readout();
  }

  private readout(): void {
    const { reviewed, playing, settled } = this.live;
    const action = this.director.action;
    const t = action ? action.time : 0;
    const frame = Math.floor(t * FPS);

    // Flash on the marker frame — of whatever is ON SCREEN. Wrapping back to 0
    // means the clip looped; so does crossing into the settle clip, which
    // starts at 0 and would otherwise read as a loop wrap.
    if (playing.name !== this.lastPlaying) {
      this.lastClipTime = 0;
      this.markerFlash = 0;
      this.lastPlaying = playing.name as AnimName;
    }
    if (playing.marker) {
      if (t < this.lastClipTime) this.markerFlash = 0;
      if (frame === playing.marker.frame) this.markerFlash = 1;
      else this.markerFlash = Math.max(0, this.markerFlash - 0.06);
    } else {
      this.markerFlash = 0;
    }
    this.lastClipTime = t;

    if (this.readoutEl) {
      const flash = this.markerFlash > 0.05;
      const m = playing.marker;
      const markerText = m ? ` · ${m.name}@${m.frame}` : '';
      const title = settled
        ? `${reviewed.name} <span style="opacity:.55">→ ${playing.name}</span>`
        : reviewed.name;
      const html =
        `<div style="font-size:1.15rem">${title}</div>` +
        `<div style="opacity:.8">frame ${String(frame).padStart(2)} / ${playing.frames} · ${this.rate.toFixed(1)}×${markerText}</div>` +
        (settled ? '<div style="opacity:.55;font-size:.78rem">SETTLED</div>' : '') +
        (flash ? '<div style="color:#ffd34d">◉ MARKER</div>' : '');
      // This page exists to judge smoothness, so it must not relayout the HUD
      // on every frame just to write the same string back.
      if (html !== this.lastReadout) {
        this.readoutEl.innerHTML = html;
        this.lastReadout = html;
      }
    }

    if (!this.statsEl) return;
    const s = this.renderer.stats();
    // Seam is a property of what is LOOPING on screen. Reviewing a one-shot
    // therefore shows no seam until it settles, and then shows the seam of the
    // loop it settled into — which is the seam that would pop forever in game.
    const seam = playing.loop ? this.seamError() : null;
    this.statsEl.textContent =
      `model  ${this.kidSource}\n` +
      `clip   ${reviewed.name}  (${this.director.sourceFor(reviewed.name)})\n` +
      (settled ? `now    ${playing.name}  (settled via returnsTo)\n` : '') +
      `frames ${playing.frames}  loop ${playing.loop ? 'yes' : 'no'}  blend ${playing.blendMs}ms` +
      `${playing.returnsTo ? `  settles into ${playing.returnsTo}` : ''}\n` +
      (playing.authoredSpeedFts ? `speed  authored ${playing.authoredSpeedFts} ft/s\n` : '') +
      (playing.bodyTravelFt !== undefined ? `travel ${playing.bodyTravelFt} ft\n` : '') +
      (seam !== null ? `seam   ${seam.toFixed(4)} rad  ${seam < 1e-3 ? '(closed)' : '(OPEN — will pop)'}\n` : '') +
      `fps ${s.fps.toFixed(0)}  p95 ${s.p95Ms.toFixed(1)}ms  draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(1)}k`;
  }

  /**
   * Largest angle between a bone's first and last keyframe, in radians.
   *
   * This is criterion 3 as a NUMBER. A seam that is merely close reads as fine
   * at 1.0x and as a hitch at 1.4x, and by then the reviewer blames the rate.
   */
  private seamError(): number {
    const clip = this.director.action?.getClip();
    if (!clip) return 0;
    let worst = 0;
    const a = new Quaternion();
    const b = new Quaternion();
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const v = track.values;
      const n = v.length / 4;
      if (n < 2) continue;
      a.set(v[0], v[1], v[2], v[3]);
      b.set(v[(n - 1) * 4], v[(n - 1) * 4 + 1], v[(n - 1) * 4 + 2], v[(n - 1) * 4 + 3]);
      worst = Math.max(worst, a.angleTo(b));
    }
    return worst;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    this.director.dispose();
    this.kid.dispose();
    this.field.dispose();
    this.outlines.dispose();
    this.renderer.dispose();
  }
}
