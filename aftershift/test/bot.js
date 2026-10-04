// A simple driving bot: pure pursuit along a road with a curvature speed plan.
module.exports = (AS) => {
  const { World: W, Sim } = AS;
  function plan(road, mu) {
    const n = road.pts.length, v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = road.pts[(i - 3 + n) % n], b = road.pts[i], c = road.pts[(i + 3) % n];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const k = 2 * cross / (ab * bc * ac + 1e-9);
      v[i] = Math.min(90, Math.sqrt(mu * 9.81 / Math.max(k, 1e-5)));
    }
    // braking pass backwards, twice around for closed loops
    for (let rep = 0; rep < 2; rep++) for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n, ds = Math.hypot(road.pts[j][0] - road.pts[i][0], road.pts[j][1] - road.pts[i][1]);
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * mu * 9.81 * 0.75 * ds));
    }
    return v;
  }
  // nearest point on this road only, searched around the previous index
  function locate(car, road) {
    const n = road.pts.length;
    let best = 1e9, bi = car._bi || 0;
    const from = car._bi == null ? 0 : car._bi - 20, to = car._bi == null ? n : car._bi + 40;
    for (let k = from; k < to; k++) {
      const i = ((k % n) + n) % n, p = road.pts[i], d = (p[0] - car.x) ** 2 + (p[1] - car.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    car._bi = bi;
    return { i: bi, s: road.s[bi], d: Math.sqrt(best) };
  }
  function drive(car, road, vplan, look = 5) {
    const r = locate(car, road), spd = Sim.speed(car);
    const tgt = W.pointAt(road, r.s + look + spd * 0.3);
    const dx = tgt.x - car.x, dz = tgt.z - car.z;
    const fx = Math.sin(car.h), fz = -Math.cos(car.h);
    const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);   // positive = target to the right
    const vt = vplan[r.i];
    const steer = Math.max(-1, Math.min(1, ang * 1.6 / (0.62 / (1 + spd / 16))));
    return { throttle: spd < vt ? 1 : 0, brake: spd > vt + 1 ? 1 : 0, steer, handbrake: false, assist: true, s: r.s };
  }
  return { plan, drive };
};
