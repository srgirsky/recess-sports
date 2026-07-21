// ---------------------------------------------------------------------------
// Gold-log regression harness (browser-side). Paste/eval in the game tab via
// the verify skill's javascript_tool, in TWO steps:
//
//   Step 1: goldLogPrepare('main' | 'kid')  — pins every persisted knob and
//           reloads the page so the run starts from a known world.
//   Step 2: await goldLogRun(seed)          — seeds Math.random (mulberry32),
//           installs the clock pump, plays one full scripted game, and
//           returns the state-transition log as a JSON string.
//
// The log is a behavioral fingerprint: {inning, half, phase, scores, outs,
// count} appended every time any of those change. Behavior-identical
// refactors (plan P1/P2) must reproduce it byte-for-byte for the same seed.
// The whole drive runs inside ONE eval so tween wall-clock time can't drift
// between calls (tweens follow Date.now(); the pump rewinds startTime only
// for pumped steps, not real gaps between evals).
// ---------------------------------------------------------------------------

/* eslint-disable */

function goldLogPrepare(mode) {
  localStorage.setItem('recess_mode', mode);
  localStorage.setItem('recess_venue', 'park');
  localStorage.setItem('recess_settings', JSON.stringify({ v: 1, sfx: 0, voice: 0, innings: 1 }));
  localStorage.setItem('recess_team', JSON.stringify({ v: 1, color: 5, logo: 0 }));
  // FULL mute: speech jitter draws from Math.random on wall-clock speech
  // timing — muting no-ops say() before any draw, keeping the rng stream
  // on the deterministic pump grid.
  localStorage.setItem('recess_muted', '1');
  localStorage.removeItem('recess_season');
  localStorage.removeItem('recess_pickcounts');
  localStorage.removeItem('recess_games_played');
  localStorage.removeItem('recess_album');
  location.reload();
}

async function goldLogRun(seed = 42) {
  // Deterministic PRNG for EVERYTHING the app rolls after this point.
  const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = mulberry32(seed);

  // Virtual wall clock: tweens run on Date.now(), and real compute drift
  // between runs would shift tween-callback ticks (whose effects consume rng)
  // off the pump grid. Locking Date.now to the pump grid makes tween time
  // EXACTLY the game time, byte-reproducible.
  const realNow = Date.now();
  let virtualNow = realNow;
  Date.now = () => virtualNow;

  const game = window.__game;
  // Persistent virtual loop clock: sync to performance.now() ONCE. Re-syncing
  // per pump call would jump the loop clock by however long the real awaits
  // between drive sections took (module parse, texture loads) — making the
  // log depend on BUILD COMPOSITION rather than game behavior.
  let virtT = null;
  const pump = (ms, dt = 50) => {
    if (virtT === null) virtT = Math.max(game.loop.time, performance.now());
    for (let e = 0; e < ms; e += dt) {
      virtT += dt;
      virtualNow += dt;
      game.loop.step(virtT);
    }
  };
  window.pump = pump;

  // Wait for boot (loader may be rAF-stalled in a hidden tab — pump it).
  let bootGuard = 0;
  while (!game.scene.isActive('Schoolyard') && bootGuard++ < 200) {
    pump(200);
    await new Promise((r) => setTimeout(r, 20));
  }
  pump(800);

  // FIXED teams, skipping the visual draft entirely. The draft's greedy
  // chooser jitters every candidate with rng, so ANY upstream cosmetic draw
  // (a new title button's tween, an ambient hop) would cascade into different
  // teams — the fingerprint would measure title-screen cosmetics, not game
  // behavior. The Schoolyard flow has its own coverage; this harness gates
  // the LINEUP + GAME surface, which is what the refactor phases touch.
  const TEAM_A = ['nostrike', 'wheelchair_ace', 'big_lou', 'turbo', 'penny', 'dex', 'smokey', 'clover', 'diva'];
  const TEAM_B = ['calls_shot', 'tank', 'mimi_mash', 'sprout', 'zippy', 'ace_kid', 'lefty', 'bend_it', 'noodle'];
  // Fresh, boot-independent stream for everything from Lineup onward.
  Math.random = mulberry32(seed + 1);
  const mode = localStorage.getItem('recess_mode');
  game.scene.getScene('Schoolyard').scene.start(mode === 'main' ? 'Lineup' : 'Game', {
    playerTeam: TEAM_A,
    aiTeam: TEAM_B,
    matchType: 'solo',
  });
  pump(600);

  // CLASSIC passes through the Lineup screen (auto plan, no edits).
  if (game.scene.isActive('Lineup')) {
    pump(1500);
    await new Promise((r) => setTimeout(r, 700)); // jersey bake
    pump(500);
    game.scene.getScene('Lineup').go();
  }
  // Wait until the GAME is actually up: go() may defer on the jersey loader
  // (real async — its duration is BUILD-dependent). Small pumps process the
  // queued scene start; real sleeps let the loader finish. The variable pump
  // count here spends virtual time while only Lineup exists (no rng, no game
  // timers), and the Game then starts ON the 50ms grid — so what follows is
  // alignment-identical regardless of how long the loader took.
  let gameWait = 0;
  while (!game.scene.isActive('Game') && gameWait++ < 300) {
    pump(50);
    await new Promise((r) => setTimeout(r, 25));
  }
  pump(500);

  const g = game.scene.getScene('Game');
  const log = [];
  let last = '';
  const sample = () => {
    const c = g.halfState?.count ?? {};
    const entry = {
      inning: g.inning,
      half: g.half,
      phase: g.phase,
      p: g.playerScore,
      a: g.aiScore,
      outs: g.halfState?.outs ?? -1,
      b: c.balls ?? -1,
      s: c.strikes ?? -1,
    };
    const key = JSON.stringify(entry);
    if (key !== last) {
      last = key;
      log.push(entry);
    }
  };

  // Scripted policy: deterministic band sequence at bat; center fastballs on
  // the mound; live plays run on CPU policies + no-soft-lock guards.
  // 50ms-grid stepping + per-step sampling: every state transition ≥ one step
  // long is captured, so the log can't alias on batch alignment.
  const bands = ['miss', 'good', 'miss', 'perfect', 'weak', 'miss'];
  let swingN = 0;
  let guard = 0;
  while (!game.scene.isActive('Result') && guard++ < 3600) {
    pump(50);
    sample();
    try {
      if (g.phase === 'pitching' && g.half === 'top' && game.loop.time - g.pitchStart > 200) {
        g.resolvePlayerSwing(bands[swingN++ % bands.length], false);
      } else if (g.half === 'bottom' && g.phase === 'resolving' && g.pitchSelect) {
        g.resolvePlayerPitchPlan('fastball', { x: 0, y: 0 }, 'good');
      } else if (g.half === 'bottom' && g.phase === 'aiming') {
        g.resolvePlayerPitch('good'); // kid-mode mound meter
      }
    } catch (e) {
      log.push({ err: String(e).slice(0, 80) });
    }
    sample();
  }
  // NOTE: no iteration counters in the log — the pre-game loader wait is
  // real-async, so raw counts vary run-to-run without any behavior change.
  log.push({ done: game.scene.isActive('Result') });
  void guard;
  const out = JSON.stringify(log);
  // Stash for retrieval in a fresh eval — long drives can outlive one
  // CDP evaluate's timeout even after finishing the game.
  try {
    sessionStorage.setItem('goldlog_last', out);
  } catch (e) {
    /* fine */
  }
  return out;
}

window.goldLogPrepare = goldLogPrepare;
window.goldLogRun = goldLogRun;
