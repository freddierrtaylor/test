// Drives the Easy-mode arcade model around the lap with a simple autopilot
// (curvature steering + the arcade speed plan) to check it laps cleanly and to
// calibrate the AI rivals' pace against it.
// Run: node test/arcade.js
const Core = require('./load-core.js')();
const tr = Core.buildTrack(), N = tr.N, dt = 1 / 240;
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const out = {};
for (const key of Object.keys(Core.CARS)) {
  const c = Core.CARS[key], line = Core.carLine(tr, key).line, prof = Core.arcadeProfile(c, line, 1, tr);
  const st = Core.newCarState(c, tr, N - 30, 0, 0);
  const tm = Core.makeTimer(tr);
  let t = 0, li = -1, off = 0, laps = [];
  while (laps.length < 3 && t < 400) {
    // nearest line point
    let best = li, bd = 1e9;
    for (let q = li < 0 ? 0 : li - 30; q < (li < 0 ? N : li + 30); q++) { const i = (q + N) % N, d = (st.x - line.px[i]) ** 2 + (st.y - line.py[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    li = best;
    const v = Math.max(0, st.vx), look = Math.round(4 + v * 0.35), tgt = (li + look) % N;
    const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), dx = line.px[tgt] - st.x, dy = line.py[tgt] - st.y;
    const k = 2 * Math.sin(Math.atan2(-dx * sy + dy * cy, dx * cy + dy * sy)) / Math.hypot(dx, dy);
    const rMax = Math.min(Math.max(v, 0.1) * Math.tan(c.steerMax * 1.1) / c.wb, Core.arcadeAyMax(c, 1, v) / Math.max(v, 4));
    const steer = Math.max(-1, Math.min(1, v * k / rMax));
    let aNeed = 0; for (let q = 3; q < 20 + v * v / 15; q += 3) { const vq = prof.v[(li + q) % N]; if (vq < v) aNeed = Math.max(aNeed, (v * v - vq * vq) / (2 * q)); }
    const braking = aNeed > 0.7 * Core.ARCADE.brakeG * 9.81 * 0.8;
    const sat = Math.abs(steer) > 0.95; // out of lock: lift, as a driver would
    Core.stepArcade(c, st, { thr: braking ? 0 : sat ? 0.2 : 1, brk: braking ? Math.min(1, aNeed / (Core.ARCADE.brakeG * 9.81)) : 0, steer }, dt, tr, {});
    t += dt; if (st.off) off++;
    for (const e of tm.update(st, t, dt)) if (e.type === 'lap') laps.push(e.rec.time);
  }
  out[key] = laps;
  console.log(`${c.short.padEnd(9)} arcade laps ${laps.map(fmt).join('  ')} · off-track ${(off * dt).toFixed(2)} s`);
}
