// Physics checks: acceleration, braking, steering, surfaces, condition and walls.
// Run: node aftershift/test/physics.js
const AS = require('./load')(), { World: W, Sim, DATA: D } = AS;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const dt = 1 / 120;
const FULL = { engine: 100, body: 100, interior: 100, tyres: 100 };
const owned = (id, cond) => ({ uid: 1, id, cond: Object.assign({}, cond || FULL), perf: {}, originality: 100 });
const IN = (o) => Object.assign({ throttle: 0, brake: 0, steer: 0, handbrake: false, assist: true }, o);
// a long straight: the drag strip, heading north
const strip = (id, cond) => Sim.makeCar(owned(id, cond), -1900, 0, Math.PI / 2);   // King's Road, heading east

function zeroTo100(id, cond) {
  const c = strip(id, cond); let t = 0;
  while (Sim.speed(c) < 100 / 3.6 && t < 40) { Sim.step(c, IN({ throttle: 1 }), dt); t += dt; }
  return t;
}
const tm = zeroTo100('meridian_gt'), tk = zeroTo100('kestrel'), tkw = zeroTo100('kestrel', D.CAR.kestrel.condition);
check(tm < 5, `Meridian GT 0-100 km/h in ${tm.toFixed(1)} s`);
check(tk > 8 && tk < 14, `restored Kestrel 0-100 km/h in ${tk.toFixed(1)} s`);
check(tkw > tk * 1.1, `a worn engine is slower (${tkw.toFixed(1)} s)`);

// braking from 100 km/h on asphalt (King's Road, heading east)
{
  const c = Sim.makeCar(owned('novaro_gti'), -900, 0, Math.PI / 2); c.vx = 100 / 3.6;
  const x0 = c.x; let t = 0;
  while (Sim.speed(c) > 0.3 && t < 10) { Sim.step(c, IN({ brake: 1 }), dt); t += dt; }
  check(c.x - x0 < 50 && c.x - x0 > 30, `100-0 km/h in ${(c.x - x0).toFixed(1)} m`);
  for (let i = 0; i < 30; i++) Sim.step(c, IN({ brake: 1 }), dt);
  check(Sim.speed(c) < 0.05, 'stays stopped for a moment on the brakes');
  for (let i = 0; i < 240; i++) Sim.step(c, IN({ brake: 1 }), dt);
  check(Sim.fwdSpeed(c) < -1, 'then holding the brake reverses');
}

// steering right turns right, at a believable rate
{
  const c = Sim.makeCar(owned('novaro_gti'), -900, 0, Math.PI / 2); c.vx = 15;
  for (let i = 0; i < 120; i++) Sim.step(c, IN({ throttle: 0.3, steer: 1 }), dt);
  check(c.w > 0.3 && c.z > 0, `full right lock at 54 km/h turns right (yaw ${c.w.toFixed(2)} rad/s)`);
  const ay = Math.abs(c.ay) / 9.81;
  check(ay > 0.7 && ay < 1.4, `cornering at ${ay.toFixed(2)} g`);
}

// sand: a two-wheel-drive saloon bogs down, a 4x4 keeps going
function sandSpeed(id) { const c = Sim.makeCar(owned(id), -1600, 1250, Math.PI / 2); for (let i = 0; i < 120 * 10; i++) Sim.step(c, IN({ throttle: 1 }), dt); return { v: Sim.speed(c) * 3.6, surf: c.surface }; }
const sk = sandSpeed('kestrel'), sp = sandSpeed('dune_patrol');
check(sk.surf === 'sand' && sp.surf === 'sand', 'test drive is on open sand');
check(sp.v > sk.v * 1.4, `Dune Patrol on sand ${sp.v.toFixed(0)} km/h vs Kestrel ${sk.v.toFixed(0)} km/h`);

// walls stop the car instead of letting it through
{
  const b = W.buildings.find(b => b.kind === 'warehouse');
  const cz = (b.z0 + b.z1) / 2, c = Sim.makeCar(owned('kestrel'), b.x0 - 25, cz, Math.PI / 2);
  let hit = 0;
  for (let i = 0; i < 120 * 6; i++) { Sim.step(c, IN({ throttle: 1 }), dt); hit = Math.max(hit, c.impact); }
  check(c.x < b.x0 + 0.5 && hit > 2, `driving into a warehouse stops at the wall (impact ${hit.toFixed(1)} m/s)`);
}

// the handbrake swings the tail
{
  const c = Sim.makeCar(owned('marlin_v8'), -900, 0, Math.PI / 2); c.vx = 20;
  let slip = 0;
  for (let i = 0; i < 90; i++) { Sim.step(c, IN({ steer: 0.6, handbrake: true }), dt); slip = Math.max(slip, c.slip); }
  check(slip > 0.2, `handbrake turn slides (slip ${slip.toFixed(2)})`);
}

// slopes: climbing a dune slows you down
{
  let best = null;
  for (let x = -2000; x < -600; x += 20) { const g = (W.heightAt(x + 5, 1500) - W.heightAt(x - 5, 1500)) / 10; if (W.surfaceAt(x, 1500).kind === 'sand' && (!best || g > best.g)) best = { x, g }; }
  check(best && best.g > 0.05, `there are real dunes in the desert (grade ${(best.g * 100).toFixed(0)}%)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
