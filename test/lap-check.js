// Headless AI laps for every car: qualifying lap, tracking error, off-track
// time, and a short race stint with lap-to-lap variance and tyre wear.
// Run: node test/lap-check.js [laps=8] [pace=0.99]
const Core = require('./load-core.js')();
const tr = Core.buildTrack();
const laps = +(process.argv[2] || 8), pace = +(process.argv[3] || 0.99);
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;

for (const key of Object.keys(Core.CARS)) {
  const c = Core.CARS[key], lo = Core.carLine(tr, key);
  // qualifying lap with tracking stats
  const ai = Core.makeAI(c, tr, lo, { pace: 1 });
  const s0 = tr.L - 250, i0 = Math.floor(s0);
  const st = Core.newCarState(c, tr, s0, lo.line.n[i0], lo.prof.v[i0]);
  st.tT = [88, 88]; ai.replan(st); ai.newLap(null);
  const tm = Core.makeTimer(tr), dt = 1 / 240;
  let t = 0, maxErr = 0, offT = 0, lap = null;
  for (let k = 0; k < 240 * 120 && !lap; k++) {
    Core.step(c, st, ai.control(st, dt), dt, tr, {});
    t += dt;
    for (const e of tm.update(st, t, dt)) if (e.type === 'lap') lap = e.rec;
    if (tm.started) {
      maxErr = Math.max(maxErr, Math.hypot(st.x - lo.line.px[ai.li], st.y - lo.line.py[ai.li]));
      if (st.off) offT += dt;
    }
  }
  console.log(`${c.short.padEnd(9)} quali ${lap ? fmt(lap.time) : 'DNF'} (planner ${fmt(lo.prof.lapTime)}) · max line error ${maxErr.toFixed(1)} m · off-track ${offT.toFixed(2)} s`);
  // race stint
  const r = Core.simulate(key, tr, { laps, pace, variance: 0.004, seed: 11 });
  const times = r.results.map(x => x.time), avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${''.padEnd(9)} race  ${r.results.map(x => x.time.toFixed(2) + (x.valid ? '' : '✕')).join(' ')} · avg ${fmt(avg)} · wear F/R ${r.results.at(-1).wear.map(w => (w * 100).toFixed(0) + '%').join('/')}`);
}
