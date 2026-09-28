// Directional physics checks: each car should *behave* like its drivetrain.
// Run: node test/behaviour.js
const Core = require('./load-core.js')();
const tr = Core.buildTrack();
const dt = 1 / 240;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

// Circle "track" so project() works anywhere.
function circle(R) {
  const N = Math.round(2 * Math.PI * R), X = new Float64Array(N), Y = new Float64Array(N), H = new Float64Array(N), K = new Float64Array(N);
  for (let i = 0; i < N; i++) { const t = i / R; X[i] = R * Math.sin(t); Y[i] = R - R * Math.cos(t); H[i] = t; K[i] = 1 / R; }
  return { N, L: N, X, Y, H, K, hw: 200 };
}

// Hold a steady corner near the limit, then go to full throttle: FWD yaw rate
// should drop (push wide), RWD rear slip should grow (step out).
function powerOnMidCorner(key) {
  const c = Core.CARS[key], R = 40, ctr = circle(R);
  Core.prepareDriver(c);
  const v = Math.sqrt(0.85 * c.ayCal * R);
  const lineN = new Float64Array(ctr.N);
  const line = { n: lineN, px: ctr.X, py: ctr.Y, ds: new Float64Array(ctr.N).fill(1), k: ctr.K };
  const ai = Core.makeAI(c, ctr, { line, prof: { v: new Float64Array(ctr.N).fill(v) } }, {});
  const st = Core.newCarState(c, ctr, 0, 0, v); st.tT = [92, 92];
  for (let k = 0; k < 240 * 4; k++) { Core.step(c, st, ai.control(st, dt), dt, ctr, { wear: false }); st.tT = [92, 92]; }
  const steer = st.steer, r0 = st.r, aR0 = st.aR;
  // lock the steering, floor it
  let rMin = r0, aRMax = Math.abs(aR0);
  for (let k = 0; k < 240 * 1.0; k++) {
    Core.step(c, st, { thr: 1, brk: 0, steerAngle: steer, autoShift: true }, dt, ctr, { wear: false });
    rMin = Math.min(rMin, st.r); aRMax = Math.max(aRMax, Math.abs(st.aR));
  }
  return { r0, r1: st.r, aR0: Math.abs(aR0), aR1: Math.abs(st.aR), aRMax, uD: c.driven === 0 ? st.uF : st.uR };
}
for (const key of ['scirocco', 'civic', 'tt']) {
  const r = powerOnMidCorner(key);
  check(r.r1 < r.r0 * 0.95, `${key}: power-on mid-corner understeer (yaw rate ${r.r0.toFixed(3)} -> ${r.r1.toFixed(3)} rad/s)`);
}
{
  const r = powerOnMidCorner('bmw135');
  check(r.aRMax > r.aR0 * 1.5, `bmw135: power-on mid-corner oversteer (rear slip ${(r.aR0 * 57.3).toFixed(1)}° -> ${(r.aRMax * 57.3).toFixed(1)}°)`);
}

// Turbo lag: from part throttle at 3000 rpm, step to full throttle and time
// how long until boost reaches 90%. The NA Civic has no boost to wait for.
function spool(key, fromThr) {
  const c = Core.CARS[key];
  const st = Core.newCarState(c, tr, 400, 0, 0);
  st.gear = 3; const v = 3000 / (c.gears[3] * c.final * 30 / Math.PI) * c.rw; st.vx = v;
  for (let k = 0; k < 240 * 3; k++) { Core.step(c, st, { thr: fromThr, brk: 0, steerAngle: 0 }, dt, tr, {}); st.vx = v; }
  let t = 0;
  while (st.boost < 0.9 * (Math.min(1, (st.rpm - c.turbo.start) / (c.turbo.full - c.turbo.start))) && t < 5) { Core.step(c, st, { thr: 1, brk: 0, steerAngle: 0 }, dt, tr, {}); st.vx = v; t += dt; }
  return t;
}
const lagB = spool('bmw135', 0.3), lagS = spool('scirocco', 0.3), lagT = spool('tt', 0.3);
check(lagB > 0.3 && lagS > 0.2, `turbo lag from 30% throttle @3000 rpm: 135i ${lagB.toFixed(2)} s, Scirocco ${lagS.toFixed(2)} s, TT ${lagT.toFixed(2)} s`);
check(lagB > lagS, '135i spools slower than the Scirocco on part-throttle transitions');

// Torque at 4000 rpm vs peak: the Civic should have little low-down torque.
const rel = key => { const c = Core.CARS[key]; let pk = 0; for (let r = 1000; r <= c.redline; r += 50) pk = Math.max(pk, Core.engineTorqueSS(c, r)); return Core.engineTorqueSS(c, 4000) / pk; };
check(rel('civic') < rel('scirocco') && rel('civic') < rel('bmw135'), `torque at 4000 rpm relative to peak: Civic ${(rel('civic') * 100).toFixed(0)}%, Scirocco ${(rel('scirocco') * 100).toFixed(0)}%, 135i ${(rel('bmw135') * 100).toFixed(0)}%`);

// Trail braking: braking while turning loads the front and rotates the car more
// than the same steering input without brakes.
function trail(key, brk) {
  const c = Core.CARS[key];
  const st = Core.newCarState(c, tr, 400, 0, 30);
  let rMax = 0;
  for (let k = 0; k < 240 * 0.8; k++) { Core.step(c, st, { thr: 0, brk, steerAngle: 0.05 }, dt, tr, {}); rMax = Math.max(rMax, st.r / Math.max(1, st.vx)); }
  return rMax;
}
for (const key of ['tt', 'bmw135']) {
  const a = trail(key, 0), b = trail(key, 0.35);
  check(b > a, `${key}: trail braking adds rotation (path curvature ${a.toFixed(4)} -> ${b.toFixed(4)} 1/m)`);
}

// Weight transfer: front load up under braking, down under acceleration.
{
  const c = Core.CARS.scirocco, st = Core.newCarState(c, tr, 400, 0, 30);
  for (let k = 0; k < 120; k++) Core.step(c, st, { thr: 0, brk: 0.8, steerAngle: 0 }, dt, tr, {});
  const fb = st.fz[0];
  const st2 = Core.newCarState(c, tr, 400, 0, 10);
  for (let k = 0; k < 120; k++) Core.step(c, st2, { thr: 1, brk: 0, steerAngle: 0 }, dt, tr, {});
  check(fb > st2.fz[0] * 1.2, `weight transfer: front load braking ${fb.toFixed(0)} N vs accelerating ${st2.fz[0].toFixed(0)} N`);
}

// Lap times: AI qualifying laps in a sensible window around the 1:15.8 reference.
for (const key of Object.keys(Core.CARS)) {
  const r = Core.simulate(key, tr, { laps: 1, pace: 1, wear: false }).results[0];
  check(r && r.valid && r.time > 72 && r.time < 80, `${key}: AI qualifying lap ${r ? r.time.toFixed(3) : 'none'} s (valid: ${r && r.valid})`);
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
