// Event balance: a driving bot checks that medals and drag opponents sit where the
// progression expects. Prints the full table with --table.
// Run: node aftershift/test/events.js [--table]
const AS = require('./load')(), { World: W, Sim, DATA: D } = AS;
const bot = require('./bot')(AS);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const dt = 1 / 120, FULL = { engine: 100, body: 100, interior: 100, tyres: 100 };
const owned = (id, cond) => ({ uid: 1, id, cond: Object.assign({}, cond || D.CAR[id].condition), perf: {}, originality: 100 });

function lap(id, cond) {
  const road = W.circuit, p0 = W.pointAt(road, 0);
  const car = Sim.makeCar(owned(id, cond), p0.x, p0.z, Math.atan2(p0.dx, -p0.dz));
  const plan = bot.plan(road, car.p.grip * 1.1 * 0.8);
  let t = 0, last = 0, started = false;
  while (t < 400) {
    const inp = bot.drive(car, road, plan);
    Sim.step(car, inp, dt); t += dt;
    if (inp.s < last - road.len / 2) { if (started) return t; started = true; t = 0; }
    last = inp.s;
  }
  return null;
}
function quarter(id, cond) {
  const c = Sim.makeCar(owned(id, cond), 1246, 2005, 0); let t = 0;
  while (2005 - c.z < 402.3 && t < 60) { Sim.step(c, { throttle: 1, brake: 0, steer: 0, handbrake: false, assist: true }, dt); t += dt; }
  return t + 0.25;   // a decent human reaction
}
function desert(id, cond) {
  const cp = W.place.camp, c = Sim.makeCar(owned(id, cond), cp.x - 10, cp.z + 40, -Math.PI / 2);
  let t = 0, i = 0;
  while (i < W.desertRun.length && t < 600) {
    const g = W.desertRun[i], dx = g[0] - c.x, dz = g[1] - c.z;
    const fx = Math.sin(c.h), fz = -Math.cos(c.h), ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz), spd = Sim.speed(c);
    Sim.step(c, { throttle: Math.abs(ang) > 0.6 && spd > 12 ? 0 : 1, brake: Math.abs(ang) > 0.9 && spd > 10 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 3)), handbrake: false, assist: true }, dt);
    t += dt;
    if (Math.hypot(dx, dz) < 16) i++;
  }
  return i >= W.desertRun.length ? t : null;
}

if (process.argv.includes('--table')) {
  for (const c of D.CARS) console.log(c.id.padEnd(14), 'lap', (lap(c.id) || 0).toFixed(1), '/', (lap(c.id, FULL) || 0).toFixed(1), ' qm', quarter(c.id).toFixed(2), '/', quarter(c.id, FULL).toFixed(2), ' desert', (desert(c.id) || 0).toFixed(0), '/', (desert(c.id, FULL) || 0).toFixed(0));
}

const M = Sim.MEDALS;
const lk = lap('kestrel'), lm = lap('meridian_gt', FULL), ln = lap('novaro_gti', FULL);
check(lk && lk < M.bronze && lk > M.gold, `the starter Kestrel can take bronze but not gold (${lk && lk.toFixed(1)} s)`);
check(lm && lm < M.gold, `a Meridian GT can take gold (${lm && lm.toFixed(1)} s)`);
check(ln && ln < M.silver, `a restored Novaro GTi can take silver (${ln && ln.toFixed(1)} s)`);

// each drag opponent can be beaten by a car the player can get by then
const beat = (tier, id, cond) => { const t = quarter(id, cond), o = D.DRAG_TIERS[tier].et + 0.42; check(t < o, `drag tier ${tier + 1} (${D.DRAG_TIERS[tier].name}, ${o.toFixed(2)} s) beaten by ${id} (${t.toFixed(2)} s)`); };
const loses = (tier, id, cond) => { const t = quarter(id, cond), o = D.DRAG_TIERS[tier].et + 0.42; check(t > o, `drag tier ${tier + 1} too quick for ${id} (${t.toFixed(2)} s)`); };
beat(0, 'kestrel', { engine: 100, body: 55, interior: 50, tyres: 70 });
loses(0, 'kestrel');
beat(1, 'halden_pickup', FULL);
beat(2, 'novaro_gti', FULL);
beat(3, 'meridian_gt', FULL);
beat(4, 'hawk_rally', FULL);
loses(4, 'novaro_gti', FULL);

const DM = Sim.DESERT_MEDALS;
const dp = desert('dune_patrol'), dk = desert('kestrel'), dv = desert('vettore_v12');
check(dp && dp < DM.gold, `a Dune Patrol can take desert gold (${dp && dp.toFixed(0)} s)`);
check(dk && dk < DM.bronze && dk > DM.silver, `the starter Kestrel manages bronze in the desert (${dk && dk.toFixed(0)} s)`);
check(!dv || dv > DM.bronze, `a hypercar is hopeless on sand (${dv && dv.toFixed(0)} s)`);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
