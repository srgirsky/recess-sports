// ---------------------------------------------------------------------------
// `npm run sim:trajectory` — what the ball actually does, printed next to the
// fences it has to clear.
//
// ★ THIS IS THE POINT OF SEQUENCING THE INTEGRATOR FIRST. The scale question —
// can a kid hit a home run over a 185ft fence off a 25.6mph pitch? — is the
// single most likely thing in the v2 plan to be wrong, and it is answerable
// with the ball alone. No contact model, no fielders, no play reducer: nothing
// that could absorb a bad answer by being tuned around it.
//
// Node >= 22.6 (TypeScript type stripping), same as the other v2 scripts. The
// resolution hook is registered by the npm script's `--import`, matching
// export-proxy-kid.mjs — registering it from inside the module is too late for
// the module's own static imports.
// ---------------------------------------------------------------------------

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const sim = (f) => join(repo, 'src', 'v2', 'sim', f);

const { stepFlight, groundGuard, cloneState, FLIGHT_HZ } = await import(sim('flight.ts'));
const { launch } = await import(sim('launch.ts'));
const { mphToFts } = await import(sim('units.ts'));
const { VENUE_GEOMETRY, fenceDistAt } = await import(sim('field.ts'));
const { BALL_K_PER_FT, NATHAN_K_PER_FT } = await import(sim('ball.ts'));
const { groundBounce, rollStep, wallCarom, fenceGuard, isAtRest, groundCor } = await import(sim('bounce.ts'));
const { BOUNCE } = await import(sim('params.ts'));

/** Fly to the ground. Returns carry, hang, apex. */
function fly(spec) {
  let s = cloneState(launch(spec));
  const dt = 1 / FLIGHT_HZ;
  let t = 0;
  let apex = s.p.y;
  while (t < 20) {
    const { state, event } = stepFlight(s, dt, { ground: groundGuard });
    t += event ? event.tSec : dt;
    s = state;
    if (s.p.y > apex) apex = s.p.y;
    if (event) break;
  }
  return { carry: Math.hypot(s.p.x, s.p.z), hang: t, apex };
}

const best = (mph, rpm) => {
  let b = { carry: 0 };
  for (let la = 10; la <= 50; la += 1) {
    const r = fly({ exitVelocityFts: mphToFts(mph), launchAngleDeg: la, sprayDeg: 0, spinRpm: rpm, heightFt: 2.5 });
    if (r.carry > b.carry) b = { ...r, la };
  }
  return b;
};

const pad = (v, n) => String(v).padStart(n);

console.log('K (1/ft): ours %s   Nathan published %s   gap %s%%',
  BALL_K_PER_FT.toExponential(4), NATHAN_K_PER_FT.toExponential(4),
  (100 * Math.abs(BALL_K_PER_FT - NATHAN_K_PER_FT) / NATHAN_K_PER_FT).toFixed(2));

console.log('\n=== MLB SCALE — the validation that has to come first ===');
console.log('  100mph, 30deg, 3ft:');
for (const rpm of [0, 1000, 2000, 3000]) {
  const r = fly({ exitVelocityFts: mphToFts(100), launchAngleDeg: 30, sprayDeg: 0, spinRpm: rpm, heightFt: 3 });
  console.log(`    ${pad(rpm, 4)} rpm -> carry ${pad(r.carry.toFixed(0), 3)} ft   hang ${r.hang.toFixed(2)}s   apex ${pad(r.apex.toFixed(0), 3)} ft`);
}
console.log('  (Statcast rule of thumb for a well-struck ball: ~400 ft.)');

console.log('\n=== KID SCALE — carry (ft) by exit velocity x launch angle, 1500rpm ===');
const ANGLES = [15, 20, 25, 30, 35, 40, 45];
console.log('        ' + ANGLES.map((a) => pad(a + 'd', 7)).join(''));
for (const mph of [35, 40, 45, 50, 55, 60, 65, 70]) {
  let row = `EV ${pad(mph, 2)}mph `;
  for (const la of ANGLES) {
    row += pad(fly({ exitVelocityFts: mphToFts(mph), launchAngleDeg: la, sprayDeg: 0, spinRpm: 1500, heightFt: 2.5 }).carry.toFixed(0), 7);
  }
  console.log(row + `   | best ${pad(best(mph, 1500).carry.toFixed(0), 3)}`);
}

console.log('\n=== WHAT IT TAKES TO CLEAR EACH FENCE (optimal angle, 1500rpm) ===');
const targets = [];
for (const [venue, geo] of Object.entries(VENUE_GEOMETRY)) {
  for (const [label, spray] of [['LF line', -45], ['LCF', -22.5], ['CF', 0], ['RCF', 22.5], ['RF line', 45]]) {
    targets.push({ venue, label, dist: fenceDistAt(geo, spray) });
  }
}
const seen = new Set();
for (const t of targets.sort((a, b) => a.dist - b.dist)) {
  const key = `${t.venue}|${Math.round(t.dist)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  let need = null;
  for (let mph = 25; mph <= 120; mph += 0.5) {
    if (best(mph, 1500).carry >= t.dist) { need = mph; break; }
  }
  console.log(`  ${t.venue.padEnd(9)} ${t.label.padEnd(8)} ${pad(t.dist.toFixed(0), 3)} ft  ->  ${need ? need.toFixed(1) + ' mph' : '> 120 mph'}`);
}

console.log('\n=== FLY HANG vs the pace.flyHang anchor (home->1B = 4200ms) ===');
for (const [mph, la] of [[40, 45], [45, 35], [50, 40], [55, 30], [60, 35]]) {
  const r = fly({ exitVelocityFts: mphToFts(mph), launchAngleDeg: la, sprayDeg: 0, spinRpm: 1500, heightFt: 2.5 });
  console.log(`  EV ${pad(mph, 2)} LA ${pad(la, 2)}: carry ${pad(r.carry.toFixed(0), 3)}ft  hang ${r.hang.toFixed(2)}s  ratio ${(r.hang / 4.2).toFixed(3)}`);
}
console.log('  pace.flyHang measured band: 0.685 - 1.208 (n=4, confidence low).');

console.log('\nPublished youth reference: 8U exit velocity is 45-55 mph off a TEE,');
console.log('and game exit velocity runs 5-10 mph below tee maximums.');

// --- Landing to rest: the half the integrator alone could not show ---------

/** Fly, bounce, roll, stop — the loop the play reducer will run. */
function playOut(geo, spec) {
  let s = cloneState(launch(spec));
  const dt = 1 / FLIGHT_HZ;
  let t = 0, hops = 0, caroms = 0, rolling = false, landed = null, apex = s.p.y;
  while (t < 30 && !isAtRest(s)) {
    if (rolling) { s = rollStep(s, geo, dt); t += dt; continue; }
    const r = stepFlight(s, dt, { ground: groundGuard, fence: fenceGuard(geo) });
    t += r.event ? r.event.tSec : dt;
    s = r.state;
    if (s.p.y > apex) apex = s.p.y;
    if (r.event?.kind === 'ground') {
      if (landed === null) landed = Math.hypot(s.p.x, s.p.z);
      s = groundBounce(s, geo);
      hops++;
      if (Math.abs(s.v.y) < BOUNCE.REST_BOUNCE_FTS) {
        rolling = true;
        s = cloneState(s);
        s.p.y = 0; s.v.y = 0;
      }
    } else if (r.event?.kind === 'fence') {
      s = wallCarom(s, geo);
      caroms++;
    }
  }
  return { hops, caroms, t, landed: landed ?? 0, rest: Math.hypot(s.p.x, s.p.z), apex };
}

console.log('\n=== GROUND RESTITUTION vs the published band ===');
console.log('  Brosnan & McNitt (Pennbounce, Penn State): infield COR 0.4-0.6,');
console.log('  tracking surface HARDNESS; skinned >= synthetic > natural grass.');
for (const [id, geo] of Object.entries(VENUE_GEOMETRY)) {
  const cor = groundCor(geo);
  const inBand = cor >= 0.4 && cor <= 0.6;
  console.log(`  ${id.padEnd(9)} COR ${cor.toFixed(2)}  mu_roll ${String(geo.rollFriction).padEnd(5)} ${inBand ? 'in band' : 'OUTSIDE the band (asphalt is not turf)'}`);
}

console.log('\n=== A BALL INTO THE GAP: land, hop, roll, stop ===');
console.log('  venue     EV/LA    land  rest  hops caroms  time');
for (const [mph, la] of [[70, 8], [80, 14], [60, 25]]) {
  for (const [id, geo] of Object.entries(VENUE_GEOMETRY)) {
    const r = playOut(geo, { exitVelocityFts: mphToFts(mph), launchAngleDeg: la, sprayDeg: -20, spinRpm: 1200, heightFt: 2.5 });
    console.log(`  ${id.padEnd(9)} ${String(mph).padStart(2)}/${String(la).padStart(2)}   ${r.landed.toFixed(0).padStart(4)}  ${r.rest.toFixed(0).padStart(4)}   ${String(r.hops).padStart(2)}    ${String(r.caroms).padStart(2)}   ${r.t.toFixed(1)}s`);
  }
}

console.log('\n=== BACKSPIN OFF THE GROUND ===');
console.log('  a 20 ft/s grounder hitting at -30 ft/s, by backspin rate');
console.log('  (a real batted ball carries roughly 150-300 rad/s = 1400-2900 rpm)');
for (const w of [0, 50, 100, 200, 300, 800, 1650]) {
  const out = groundBounce({ p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: -30, z: 20 }, w: { x: -w, y: 0, z: 0 } }, VENUE_GEOMETRY.park);
  const rpm = ((w * 60) / (2 * Math.PI)).toFixed(0);
  const real = w <= 300 ? '' : '   (beyond a real baseball)';
  console.log(`    ${String(w).padStart(4)} rad/s (${String(rpm).padStart(5)} rpm) -> forward ${out.v.z.toFixed(1).padStart(6)} ft/s${out.v.z < 0 ? '  <-- comes BACK' : ''}${real}`);
}
