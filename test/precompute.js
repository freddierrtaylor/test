// Runs the per-car racing-line optimiser offline; prints packed offsets + skidpad calibration.
const Core = require('./load-core.js')({ noPrecomputed: true });
const tr = Core.buildTrack();
const key = process.argv[2]; const c = Core.CARS[key]; Core.prepareDriver(c);
const t0 = Date.now();
const it = Core.lineOptimiser(tr, c, Core.baseLine(tr)); let r; while (!(r = it.next()).done);
const res = r.value;
console.error(key, 'from', res.start.toFixed(3), 'to', res.best.toFixed(3), 'evals', res.evals, 'ayCal', c.ayCal.toFixed(4), ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log(JSON.stringify({ key, ayCal: +c.ayCal.toFixed(4), n: Core.packOffsets(res.n) }));
