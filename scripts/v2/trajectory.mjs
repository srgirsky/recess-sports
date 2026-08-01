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
const { mphToFts, ftsToMph } = await import(sim('units.ts'));
const { VENUE_GEOMETRY, fenceDistAt } = await import(sim('field.ts'));
const { BALL_K_PER_FT, NATHAN_K_PER_FT } = await import(sim('ball.ts'));
const { groundBounce, rollStep, wallCarom, fenceGuard, isAtRest, groundCor } = await import(sim('bounce.ts'));
const { BOUNCE, AERO } = await import(sim('params.ts'));
const { resolveSwing, collisionEfficiency, exitVelocity } = await import(sim('contact.ts'));
const { batSpeedFts } = await import(sim('athletes.ts'));
const { releasePitch, flyToPlate, PITCHES } = await import(sim('pitch.ts'));
const { makeRng } = await import(sim('rng.ts'));
const { traceLooseBall } = await import(sim('bounce.ts'));
const { FIELD_POSITIONS, FIRST, SECOND, BASEPATH, dist, distFromHome } = await import(sim('field.ts'));
const { DEFENSE } = await import(sim('params.ts'));
const { makeFielder, electChaser, stepFielder, canReach, chaseTarget, throwFlightSec, maxThrowFt } =
  await import(sim('fielders.ts'));
const { makeRunner, startLeg, stepRunner } = await import(sim('runners.ts'));
const { sprintTopSpeedFts, sprintTimeSec, sprintAccelFtS2, sprintAccelSec, reachFt, throwSpeedFts, reactionSec } =
  await import(sim('athletes.ts'));
const { ROSTER, getCharacter } = await import(join(repo, 'src', 'data', 'characters.ts'));
const { autoAssign } = await import(join(repo, 'src', 'systems', 'lineup.ts'));

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

// --- The swing: what a kid can actually do ---------------------------------

const rng = makeRng('demo');
const eA = collisionEfficiency();

console.log('\n=== THE PITCH, SOLVED FROM THE MEASURED FLIGHT TIME ===');
console.log('  pace.pitchCorridor brackets 1230ms over the 46ft mound. That is a TIME:');
console.log('  aiming a release AT the plate arrives 26ft underground, so speed and');
console.log('  elevation are both solved from it.');
console.log('  kind        flight   at plate   crosses y   break x');
for (const kind of Object.keys(PITCHES)) {
  const f = flyToPlate(releasePitch({ kind, pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 }));
  const sp = Math.hypot(f.state.v.x, f.state.v.y, f.state.v.z);
  console.log(`  ${kind.padEnd(10)} ${(f.travelSec * 1000).toFixed(0).padStart(5)}ms  ${ftsToMph(sp).toFixed(1).padStart(5)} mph   ${f.state.p.y.toFixed(2).padStart(6)}    ${f.state.p.x >= 0 ? '+' : ''}${f.state.p.x.toFixed(2)}`);
}
console.log('  (curve breaks toward THIRD, screwball toward FIRST; the fastball not at all)');

const seenPitch = flyToPlate(releasePitch({ kind: 'fastball', pitchingStat: 5, aimHeightFt: 2.4, aimLateralFt: 0 }));
const pitchSpeed = Math.hypot(seenPitch.state.v.x, seenPitch.state.v.y, seenPitch.state.v.z);

function bestFor(kid) {
  let best = { carry: 0 };
  for (let u = 0; u <= 0.22; u += 0.005) {
    const r = resolveSwing({ timingErrorSec: 0, undercutFt: u, batter: kid, travelSec: seenPitch.travelSec, pitchSpeedFts: pitchSpeed }, rng);
    if (r.kind !== 'contact') continue;
    const c = fly({ ...r.launch }).carry;
    if (c > best.carry) best = { carry: c, ev: ftsToMph(r.launch.exitVelocityFts), la: r.launch.launchAngleDeg, spin: r.launch.spinRpm };
  }
  return best;
}

console.log('\n=== ★ POWER -> BAT SPEED -> EXIT VELOCITY -> CARRY, over the real roster ===');
const park = VENUE_GEOMETRY.park, sandlot = VENUE_GEOMETRY.sandlot;
const line = fenceDistAt(park, -45), cf = fenceDistAt(park, 0), porch = fenceDistAt(sandlot, 45);
const byPower = new Map();
for (const c of ROSTER) { if (!byPower.has(c.stats.power)) byPower.set(c.stats.power, []); byPower.get(c.stats.power).push(c); }
console.log('  power  n   bat    EV    LA  spin   carry   clears');
for (const p of [...byPower.keys()].sort((a, b) => a - b)) {
  const kids = byPower.get(p), b = bestFor(kids[0]);
  const clears = [b.carry >= porch ? 'porch' : null, b.carry >= line ? 'park-line' : null, b.carry >= cf ? 'park-CF' : null].filter(Boolean).join('+') || '-';
  console.log(`   ${String(p).padStart(2)}    ${String(kids.length).padStart(2)}  ${ftsToMph(batSpeedFts(p)).toFixed(1).padStart(4)}  ${b.ev.toFixed(1).padStart(4)}  ${b.la.toFixed(0).padStart(3)} ${b.spin.toFixed(0).padStart(5)}   ${b.carry.toFixed(0).padStart(4)}   ${clears}`);
}
const clearsLine = ROSTER.filter((c) => bestFor(c).carry >= line).length;
const clearsPorch = ROSTER.filter((c) => bestFor(c).carry >= porch).length;
const clearsCf = ROSTER.filter((c) => bestFor(c).carry >= cf).length;
console.log(`\n  of 30 kids: ${clearsPorch} clear the sandlot porch, ${clearsLine} the park line, ${clearsCf} the park centre.`);
console.log('  Nobody on the roster has power 1 -- the realised span is 2 to 10.');

console.log('\n=== THE OPEN QUESTION THIS WALKS INTO ===');
const belowFit = ROSTER.filter((c) => ftsToMph(exitVelocity(eA, pitchSpeed, batSpeedFts(c.stats.power))) < AERO.FIT_SPEED_BAND_MPH[0]).length;
console.log(`  Nathan's drag fit is verified over ${AERO.FIT_SPEED_BAND_MPH[0]}-${AERO.FIT_SPEED_BAND_MPH[1]} mph.`);
console.log(`  ${belowFit} of ${ROSTER.length} kids hit BELOW that floor, so essentially every batted ball`);
console.log('  in this game is an extrapolation past the edge of the measurement.');
console.log('  Recorded as sim.aeroModelLowSpeed, significance raised rather than leaned on.');

// ---------------------------------------------------------------------------
// PR 5: the defence. Who gets there, and does the throw beat the runner?
// ---------------------------------------------------------------------------

const TICK = 1 / 240;
// Through the SHIPPED planner, so the arms sit where a real lineup puts them.
const PLAN = autoAssign(ROSTER.slice(0, 9).map((c) => c.id));
const defence = () => Object.entries(PLAN.positions).map(([id, pos]) => makeFielder(getCharacter(id), pos));

console.log('\n=== ★ ONE SPEED FUNCTION: A FIELDER AND A RUNNER ARE THE SAME KID ===');
console.log('  v1 kept two constants. FIELDER_SPEED drifted to 2.48x RUNNER_SPEED across');
console.log('  five retunes, and the fix then scaled BOTH and preserved the ratio exactly.');
console.log(`  Acceleration is SOLVED from pace.homeToFirst, not chosen: T = 2*(4.200 - 60/V)`);
console.log(`  = ${sprintAccelSec().toFixed(4)}s, i.e. ${sprintAccelFtS2(5).toFixed(2)} ft/s^2 for the anchored kid.`);
console.log('  stat   top speed        accel    home->1B   home->2B');
for (const s of [1, 3, 5, 8, 10]) {
  console.log(
    `   ${String(s).padStart(2)}   ${sprintTopSpeedFts(s).toFixed(2).padStart(5)} ft/s ` +
      `(${ftsToMph(sprintTopSpeedFts(s)).toFixed(1)} mph)  ${sprintAccelFtS2(s).toFixed(2).padStart(5)}   ` +
      `${(sprintTimeSec(BASEPATH, s) * 1000).toFixed(0).padStart(6)}ms   ` +
      `${(sprintTimeSec(2 * BASEPATH, s) * 1000).toFixed(0).padStart(6)}ms`
  );
}
console.log('  (pace.homeToFirst measured 4200ms, n=3, spread 261. The stat-5 kid runs 4200.)');

console.log('\n=== ★ THE ARM, AND WHY THE RELAY IS NOT AN INVENTED MECHANIC ===');
console.log('  v1 gated its cutoff relay on a hand-picked 1.39 basepath legs, because');
console.log('  "throw DISTANCE provably cannot do this job". Here an arm has a range.');
console.log('  arm   speed      max range   SS->1B    CF->2B    CF->1B');
for (const a of [2, 4, 6, 8, 10]) {
  const t = (from, to) => {
    const sec = throwFlightSec(from, to, a);
    return sec === null ? '   --  ' : `${(sec * 1000).toFixed(0).padStart(5)}ms`;
  };
  console.log(
    `   ${String(a).padStart(2)}   ${ftsToMph(throwSpeedFts(a)).toFixed(1).padStart(4)} mph   ` +
      `${maxThrowFt(a).toFixed(0).padStart(6)}ft   ${t(FIELD_POSITIONS.SS, FIRST)}  ` +
      `${t(FIELD_POSITIONS.CF, SECOND)}  ${t(FIELD_POSITIONS.CF, FIRST)}`
  );
}
const cfToFirst = dist(FIELD_POSITIONS.CF, FIRST);
console.log(
  `  CF->1B is ${cfToFirst.toFixed(0)}ft. ` +
    `${ROSTER.filter((c) => maxThrowFt(c.stats.pitching) < cfToFirst).length} of 30 kids cannot make it at all,`
);
console.log('  so a cutoff man is what happens when nobody can reach the bag.');

console.log('\n=== ★ THE GLOVE: 3ft, AGAINST v1 s ELEVEN ===');
console.log(`  reach ${reachFt()}ft, centred ${DEFENSE.CATCH_CENTRE_FT}ft up, so nothing above`);
console.log(`  ${(DEFENSE.CATCH_CENTRE_FT + reachFt()).toFixed(0)}ft is catchable. v1: CATCH_RADIUS 34px = 11.36ft, a dive out to 21.4ft.`);
console.log(`  Area goes as r^2, so a v1 fielder covered ${((11.356 / reachFt()) ** 2).toFixed(1)}x the ground.`);
console.log(`  Reading the ball: ${(reactionSec(10) * 1000).toFixed(0)}-${(reactionSec(1) * 1000).toFixed(0)}ms, plus a ${(DEFENSE.RELEASE_SEC * 1000).toFixed(0)}ms release.`);
console.log('  v1 stands still for cpuReactionMs 835 + cpuThrowDelayMs 1192 = 2027ms.');

const { beginPlay, stepPlay, finishPlay, simulatePlay } = await import(sim('play.ts'));

/** Hit it, and let the real reducer play it out. */
function playIt(spec, seed, over = {}) {
  const s = beginPlay(
    { launch: spec, batter: ROSTER.find((c) => c.stats.speed === 5), runners: [], defence: PLAN.positions,
      lookup: getCharacter, outs: 0, geo: park, ...over },
    makeRng(seed)
  );
  const evs = [];
  let n = 0;
  while (s.phase === 'live' && n++ < 20 * 60) { stepPlay(s, 1 / 60); evs.push(...s.events); }
  return { s, evs, o: finishPlay(s) };
}

console.log('\n=== ★ THE GAP BALL, WHICH IS THE QUESTION v2 EXISTS TO ANSWER ===');
console.log('  defense.fielderSpeed.notSufficient measured these six in v1 and every one');
console.log('  was an out at first. Run here through the REAL play reducer -- nine kids,');
console.log('  runners, throws, relays -- not the one-chaser harness PR 5 had to use.');
console.log('  play                     v1               v2         took   events');
const PLAYS = [
  ['routine grounder SS', 'out by 1397ms', { exitVelocityFts: 45, launchAngleDeg: -2, sprayDeg: -22, spinRpm: -400, heightFt: 2.5 }],
  ['slow roller to 3B', 'out by 347ms', { exitVelocityFts: 35, launchAngleDeg: 2, sprayDeg: -30, spinRpm: -200, heightFt: 2.5 }],
  ['through the 5-6 hole', 'out by 1047ms', { exitVelocityFts: 62, launchAngleDeg: -3, sprayDeg: -30, spinRpm: -500, heightFt: 2.5 }],
  ['true LF-CF gap', 'out by 897ms', { exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg: -13, spinRpm: 1800, heightFt: 2.5 }],
  ['true CF-RF gap', 'out by 1097ms', { exitVelocityFts: 95, launchAngleDeg: 22, sprayDeg: 13, spinRpm: 1800, heightFt: 2.5 }],
  ['down the RF line', 'out by 2047ms', { exitVelocityFts: 95, launchAngleDeg: 20, sprayDeg: 38, spinRpm: 1600, heightFt: 2.5 }],
  ['lazy fly to CF', '-', { exitVelocityFts: 70, launchAngleDeg: 38, sprayDeg: 0, spinRpm: 1500, heightFt: 2.5 }],
];
for (const [label, v1, spec] of PLAYS) {
  const r = playIt(spec, `six:${label}`);
  const res = r.o.flyCaught ? 'CAUGHT' : r.o.batterOut ? 'OUT' : r.o.bases[2] ? 'TRIPLE' : r.o.bases[1] ? 'DOUBLE' : 'single';
  const tags = [...new Set(r.evs.map((e) => e.t))].filter((t) => ['relay', 'error', 'carom', 'bonk'].includes(t));
  console.log(
    `  ${label.padEnd(23)} ${v1.padEnd(16)} ${res.padEnd(8)} ${r.s.elapsedSec.toFixed(2)}s  ${tags.join(',')}`
  );
}
console.log('\n  A gap ball is a DOUBLE. v1 measured it as an out by 897ms, and its own');
console.log('  record said the cause was structural: "our outfield is too shallow relative');
console.log('  to the diamond... any real fix has to touch geometry, not the chase."');

console.log('\n=== ★★ OUTS GRADE INTO HITS WITH CONTACT, AND NOTHING WAS TUNED FOR IT ===');
console.log('  exit vel            spray, degrees from centre');
process.stdout.write('             ');
for (let sp = -42; sp <= 42; sp += 6) process.stdout.write(String(sp).padStart(4));
process.stdout.write('\n');
for (const ev of [45, 62, 80]) {
  process.stdout.write(`  ${ftsToMph(ev).toFixed(0).padStart(2)} mph    `);
  let hits = 0;
  for (let sp = -42; sp <= 42; sp += 6) {
    const o = simulatePlay(
      { launch: { exitVelocityFts: ev, launchAngleDeg: -3, sprayDeg: sp, spinRpm: -500, heightFt: 2.5 },
        batter: ROSTER.find((c) => c.stats.speed === 5), runners: [], defence: PLAN.positions,
        lookup: getCharacter, outs: 0, geo: park },
      makeRng(`g${ev}${sp}`), 1 / 60
    );
    const isHit = !o.batterOut && o.outs === 0;
    if (isHit) hits++;
    process.stdout.write(`${isHit ? 'H' : 'O'}`.padStart(4));
  }
  console.log(`   ${hits}/15 hits`);
}
console.log('\n  v1 measured every ball a fielder reached as an out, at every angle and');
console.log('  every contact quality -- a defence with no gradient at all. This is NOT');
console.log('  BABIP: grounders only, no strikeouts, uniform sprays. PR 8 measures that.');
