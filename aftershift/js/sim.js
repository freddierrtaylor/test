// ============================================================================
// AFTERSHIFT SIM: car physics and the career. No DOM, so the tests can run it.
//
// Physics: a bicycle model at 120 Hz with weight transfer, a friction ellipse
// per axle, surface grip and rolling resistance, dune slopes, handbrake and
// building collisions. A car's condition feeds straight into its power, grip
// and top speed, so a neglected car drives worse than a restored one.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.Sim = (() => {
  const D = AS.DATA, W = AS.World;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const G = 9.81, RHO = 1.2;

  // length, width, height, wheelbase, front weight share, CG height
  const STYLE = {
    saloon:    { L: 4.6,  Wd: 1.78, H: 1.45, wb: 2.68, fw: 0.60, hcg: 0.52 },
    van:       { L: 4.9,  Wd: 1.95, H: 2.3,  wb: 3.0,  fw: 0.58, hcg: 0.8 },
    pickup:    { L: 5.3,  Wd: 1.86, H: 1.8,  wb: 3.1,  fw: 0.57, hcg: 0.72 },
    suv:       { L: 4.95, Wd: 1.95, H: 1.9,  wb: 2.9,  fw: 0.55, hcg: 0.78 },
    boxy4x4:   { L: 4.6,  Wd: 1.8,  H: 1.85, wb: 2.6,  fw: 0.55, hcg: 0.76 },
    rally:     { L: 4.0,  Wd: 1.8,  H: 1.35, wb: 2.45, fw: 0.45, hcg: 0.46 },
    hatch:     { L: 4.25, Wd: 1.79, H: 1.44, wb: 2.6,  fw: 0.61, hcg: 0.5 },
    coupe:     { L: 4.45, Wd: 1.78, H: 1.3,  wb: 2.55, fw: 0.53, hcg: 0.46 },
    drag:      { L: 4.5,  Wd: 1.8,  H: 1.28, wb: 2.6,  fw: 0.50, hcg: 0.45 },
    landyacht: { L: 5.6,  Wd: 2.0,  H: 1.4,  wb: 3.0,  fw: 0.56, hcg: 0.55 },
    muscle:    { L: 4.8,  Wd: 1.85, H: 1.3,  wb: 2.75, fw: 0.56, hcg: 0.5 },
    spider:    { L: 4.3,  Wd: 1.68, H: 1.2,  wb: 2.4,  fw: 0.52, hcg: 0.44 },
    cup:       { L: 4.3,  Wd: 1.75, H: 1.38, wb: 2.6,  fw: 0.60, hcg: 0.44 },
    supercar:  { L: 4.55, Wd: 1.95, H: 1.2,  wb: 2.65, fw: 0.42, hcg: 0.42 },
    hyper:     { L: 4.7,  Wd: 2.03, H: 1.13, wb: 2.7,  fw: 0.43, hcg: 0.4 },
  };

  // ----------------------------------------------------------- car params ---
  function params(owned) {
    const c = D.CAR[owned.id], st = STYLE[c.style], k = owned.cond;
    const eng = 0.45 + 0.55 * k.engine / 100;
    const power = c.power * 1000 * eng * (owned.perf && owned.perf.engine ? 1.12 : 1) * (owned.tune ? 1.08 : 1);
    const grip = c.grip * (0.78 + 0.22 * k.tyres / 100) * (owned.perf && owned.perf.tyres ? 1.07 : 1);
    const vtop = c.top / 3.6;
    // drag area chosen so full power meets drag (plus rolling) at the catalogue top speed
    const P0 = c.power * 1000 * 0.9;
    const CdA = Math.max(0.3, 2 * (P0 - 0.015 * c.mass * G * vtop) / (RHO * vtop * vtop * vtop));
    return {
      id: c.id, style: c.style, mass: c.mass, power, grip, drive: c.drive, offroad: c.offroad, CdA,
      L: st.L, Wd: st.Wd, H: st.H, wb: st.wb, fw: st.fw, hcg: st.hcg, vtop,
      gears: c.drive === 'AWD' && c.style === 'suv' ? 6 : (c.style === 'drag' ? 4 : 5),
      redline: c.style === 'landyacht' || c.style === 'muscle' ? 5600 : c.style === 'hyper' ? 8800 : 7200,
    };
  }

  function makeCar(owned, x, z, h) {
    return { owned, p: params(owned), x, z, h, vx: 0, vz: 0, w: 0, steer: 0, y: 0, pitch: 0, roll: 0,
      ax: 0, ay: 0, rpm: 900, gear: 0, slip: 0, wheelspin: 0, surface: 'asphalt', impact: 0, offroadDust: 0, lastSafe: { x, z, h }, odo: 0 };
  }

  // -------------------------------------------------------------- physics ---
  // inp: { throttle 0..1, brake 0..1, steer -1..1, handbrake bool, assist bool }
  function step(c, inp, dt) {
    const p = c.p, m = p.mass, L = p.wb, a = L * (1 - p.fw), b = L * p.fw, Iz = m * 1.45;
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    const fx = sh, fz = -ch, rx = ch, rz = sh;
    let u = c.vx * fx + c.vz * fz, v = c.vx * rx + c.vz * rz, w = c.w;

    const sf = W.surfaceAt(c.x, c.z), S = W.SURF[sf.kind];
    c.surface = sf.kind;
    const loose = sf.kind === 'sand' || sf.kind === 'track';
    let mu = S.mu; if (loose) mu += (1.0 - mu) * p.offroad * 0.8;
    mu *= p.grip;
    let roll = S.roll; if (loose) roll *= (1 - 0.8 * p.offroad);

    // steering: less lock at speed, rate limited, optional countersteer help
    // speed-sensitive lock: full lock stays close to the tyres' peak slip at speed
    const u2 = Math.max(u * u, 1);
    const sMax = clamp(p.wb * Math.max(mu, 0.5) * G / u2 + 0.085, 0.1, 0.62);
    let target = inp.steer * sMax;
    const beta = Math.abs(u) > 3 ? Math.atan2(v, Math.abs(u)) : 0;
    // countersteer help only once the car is really sliding, not in normal cornering
    if (inp.assist && !inp.handbrake) target += clamp(Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.1) * 0.9, -0.35, 0.35) * Math.sign(u || 1);
    c.steer += clamp(target - c.steer, -dt * 3.0, dt * 3.0);
    const delta = c.steer;

    // normal loads with longitudinal weight transfer
    let Nf = m * G * b / L - m * c.ax * p.hcg / L;
    Nf = clamp(Nf, m * G * 0.2, m * G * 0.8);
    const Nr = m * G - Nf;

    // drive and brakes
    let Fdrive = 0, FbF = 0, FbR = 0;
    const thr = inp.throttle;
    if (thr > 0) Fdrive = thr * p.power / Math.max(Math.abs(u), 5);
    // the brake pedal becomes reverse once the car has been stopped for a moment
    c.stopT = (inp.brake > 0 && thr <= 0.05 && Math.abs(u) < 0.6) ? (c.stopT || 0) + dt : (u < -0.5 && inp.brake > 0 ? c.stopT : 0);
    if (inp.brake > 0) {
      if (u > 1.0) { FbF = inp.brake * mu * Nf * 0.92; FbR = inp.brake * mu * Nr * 0.7; }
      else if (thr <= 0.05 && (c.stopT > 0.35 || u < -0.5)) { if (u > -9) Fdrive = -inp.brake * Math.min(p.power * 0.3 / Math.max(Math.abs(u), 3), m * G * 0.45); }
    }
    if (inp.handbrake) FbR += mu * Nr * 0.75;
    const driven = p.drive === 'FWD' ? Nf : p.drive === 'RWD' ? Nr : m * G;
    const tractionMax = mu * driven;
    c.wheelspin = Math.abs(Fdrive) > tractionMax ? clamp((Math.abs(Fdrive) - tractionMax) / tractionMax, 0, 1) : 0;
    // traction control (with the assist) keeps a margin of grip for steering
    const tc = inp.assist ? 0.8 : 1;
    Fdrive = clamp(Fdrive, -tractionMax * tc, tractionMax * tc);
    let FxF = (p.drive === 'FWD' ? Fdrive : p.drive === 'AWD' ? Fdrive * 0.45 : 0);
    let FxR = (p.drive === 'RWD' ? Fdrive : p.drive === 'AWD' ? Fdrive * 0.55 : 0);
    // stability control (with the assist): cornering grip comes first, drive gets what is left
    if (inp.assist && Fdrive > 0) {
      const left = (N, fy) => Math.sqrt(Math.max((mu * N) ** 2 - fy * fy, (0.3 * mu * N) ** 2));
      FxF = Math.min(FxF, left(Nf, c.fyF || 0)); FxR = Math.min(FxR, left(Nr, c.fyR || 0));
    }
    const sgn = u >= 0 ? 1 : -1;

    // tyre lateral forces in each wheel's frame
    const vf = v + a * w, vr = v - b * w;
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const latF = -u * sd + vf * cd, lonF = u * cd + vf * sd;
    const alphaF = Math.atan2(latF, Math.max(Math.abs(lonF), 1.5));
    const alphaR = Math.atan2(vr, Math.max(Math.abs(u), 1.5));
    const CF = 16 * Nf, CR = 17 * Nr;
    const capF = Math.max(0.3 * mu * Nf, Math.sqrt(Math.max(0, (mu * Nf) ** 2 - (FxF - FbF * sgn) ** 2)));
    // a little extra rear grip keeps the car stable on lift-off; the handbrake removes it
    const muR = mu * (inp.handbrake ? 1 : inp.assist ? 1.22 : 1.08);
    let capR = Math.max(inp.handbrake ? 0 : 0.25 * muR * Nr, Math.sqrt(Math.max(0, (muR * Nr) ** 2 - (FxR - FbR * sgn) ** 2)));
    if (inp.handbrake) capR *= 0.4;
    const FyFw = clamp(-CF * alphaF, -capF, capF), FyR = clamp(-CR * alphaR, -capR, capR);
    c.fyF = FyFw; c.fyR = FyR;
    c.slip = Math.max(Math.abs(alphaF) - 0.12, Math.abs(alphaR) - 0.1, 0) + (inp.handbrake && Math.abs(u) > 4 ? 0.2 : 0);

    // slope along and across the car
    const e = 1.5;
    const gx = (W.heightAt(c.x + e, c.z) - W.heightAt(c.x - e, c.z)) / (2 * e);
    const gz = (W.heightAt(c.x, c.z + e) - W.heightAt(c.x, c.z - e)) / (2 * e);
    const onRoad = !!sf.road;
    const slopeF = onRoad ? 0 : gx * fx + gz * fz, slopeR = onRoad ? 0 : gx * rx + gz * rz;

    let Fx = FxF + FxR + FyFw * -sd - (FbF + FbR) * sgn - 0.5 * RHO * p.CdA * u * Math.abs(u) - roll * m * G * sgn - m * G * slopeF;
    let Fy = FyFw * cd + FyR - m * G * slopeR * 0.6;
    let Mz = a * FyFw * cd - b * FyR;
    // stability assist: resist yaw beyond what the tyres can sustain at this speed
    if (inp.assist && !inp.handbrake && Math.abs(u) > 5) {
      const wMax = mu * G * 1.1 / Math.abs(u), ex = Math.abs(w) - wMax;
      if (ex > 0) Mz -= Math.sign(w) * ex * Iz * 6;
    }

    // stop cleanly instead of creeping backwards under brakes or rolling resistance
    if (Math.abs(u) < 0.6 && Math.abs(Fdrive) < 1 && (inp.brake > 0 || inp.handbrake || thr === 0)) {
      if (Math.abs(Fx) < (roll + 0.4) * m * G + (FbF + FbR)) { Fx = -u * m / dt * 0.5; }
    }

    c.ax = c.ax + (Fx / m - c.ax) * Math.min(1, dt * 8);
    // velocity lives in world space, so the frame rotation is already accounted for
    // when u and v are re-projected next step: no Coriolis terms here
    u += (Fx / m) * dt;
    v += (Fy / m) * dt;
    w += (Mz / Iz) * dt;
    if (Math.abs(u) < 2) w *= Math.pow(0.02, dt);   // low-speed yaw damping
    c.ay = u * w;

    c.vx = u * fx + v * rx; c.vz = u * fz + v * rz; c.w = w;
    c.x += c.vx * dt; c.z += c.vz * dt; c.h += w * dt;
    c.odo += Math.abs(u) * dt;

    // collisions: two circles along the car
    c.impact = 0;
    const off = p.L / 2 - p.Wd / 2, rad = p.Wd / 2 + 0.15;
    const nfx = Math.sin(c.h), nfz = -Math.cos(c.h);
    for (const s of [off, -off]) {
      const hit = W.collide(c.x + nfx * s, c.z + nfz * s, rad);
      if (hit) {
        c.x += hit.x; c.z += hit.z;
        const n = Math.hypot(hit.x, hit.z) || 1, nx = hit.x / n, nz = hit.z / n;
        const vn = c.vx * nx + c.vz * nz;
        if (vn < 0) {
          c.vx -= 1.35 * vn * nx; c.vz -= 1.35 * vn * nz;
          c.vx *= 0.85; c.vz *= 0.85; c.w *= 0.5;
          c.impact = Math.max(c.impact, -vn);
          // a glancing blow turns the car along the wall
          c.w += (s > 0 ? 1 : -1) * ((nfx * nz - nfz * nx) > 0 ? -1 : 1) * Math.min(1.5, -vn * 0.05);
        }
      }
    }

    // ride height and attitude from the ground
    const gh = onRoad ? 0.04 : W.heightAt(c.x, c.z);
    c.y = gh;
    c.pitch = Math.atan(slopeF) + clamp(-c.ax * 0.004, -0.04, 0.04);
    c.roll = Math.atan(slopeR) + clamp(c.ay * 0.004, -0.05, 0.05);
    if (onRoad && sf.kind !== 'water') c.lastSafe = { x: c.x, z: c.z, h: c.h };

    // engine speed and gear for the sound and dash
    const spd = Math.abs(u), n = p.gears;
    const vmaxG = i => p.vtop * 1.04 * Math.pow((i + 1) / n, 0.8);
    const idle = 850, red = p.redline;
    let rpm = idle + (red - idle) * spd / vmaxG(c.gear);
    if (rpm > red * 0.96 && c.gear < n - 1) c.gear++;
    else if (c.gear > 0 && idle + (red - idle) * spd / vmaxG(c.gear - 1) < red * 0.62) c.gear--;
    rpm = idle + (red - idle) * spd / vmaxG(c.gear);
    if (c.wheelspin > 0.05 || (thr > 0.1 && spd < 3)) rpm = Math.max(rpm, idle + (red - idle) * (0.45 + 0.4 * thr) * (spd < 3 ? 1 : c.wheelspin + 0.6));
    c.rpm += (clamp(rpm, idle * (thr > 0.05 ? 1.4 : 1), red) - c.rpm) * Math.min(1, dt * 12);
    return c;
  }
  const speed = c => Math.hypot(c.vx, c.vz);
  const fwdSpeed = c => c.vx * Math.sin(c.h) - c.vz * Math.cos(c.h);

  // --------------------------------------------------------------- career ---
  const START_TIME = 4 * 1440 + 17 * 60 + 30;   // Thursday 17:30
  let uidN = 1;
  function newGame() {
    const s = {
      v: 1, money: 1500, time: START_TIME, workshop: 1, active: null, garage: [], register: {}, leads: {},
      rep: { circuit: 0, drag: 0, offroad: 0, classics: 0, collectors: 0 },
      medals: {}, best: {}, dragTier: 0, desertBest: null, setsDone: {}, shown: {}, flags: {}, stats: { km: 0, events: 0, restored: 0 },
    };
    const car = addCar(s, 'kestrel');
    s.active = car.uid;
    D.CARS.forEach(c => { if (c.source.type === 'showroom') s.register[c.id] = s.register[c.id] || 'seen'; });
    return s;
  }
  function addCar(s, id, cond) {
    const c = D.CAR[id];
    uidN = Math.max(uidN, ...s.garage.map(g => g.uid + 1), 1);
    const owned = { uid: uidN++, id, cond: Object.assign({}, cond || c.condition), perf: { engine: false, tyres: false }, tune: false, originality: 100 };
    s.garage.push(owned);
    s.register[id] = 'owned';
    return owned;
  }
  const activeCar = s => s.garage.find(g => g.uid === s.active) || s.garage[0];
  const capacity = s => D.WORKSHOP[s.workshop - 1].capacity;

  // value: condition-weighted, with originality mattering for classics and rare cars
  function condScore(o) {
    const k = o.cond; let sum = 0, wsum = 0;
    for (const [id, comp] of Object.entries(D.COMPONENTS)) { sum += k[id] * comp.weight; wsum += comp.weight; }
    return sum / wsum;
  }
  function value(o) {
    const c = D.CAR[o.id], q = condScore(o) / 100;
    const orig = (c.set === 'classics' || c.rarity === 'legendary' || c.rarity === 'oneoff') ? 0.55 + 0.45 * o.originality / 100 : 1;
    return Math.round(c.value * (0.18 + 0.82 * Math.pow(q, 1.4)) * orig / 10) * 10;
  }

  // restoration: each step adds up to 25 points to one component
  function restoreQuote(s, o, comp, mode) {
    const c = D.CAR[o.id], C = D.COMPONENTS[comp], cur = o.cond[comp];
    const cap = comp === 'body' ? D.WORKSHOP[s.workshop - 1].bodyCap : 100;
    if (cur >= cap) return { ok: false, why: cur >= 100 ? 'Already perfect.' : 'Needs a paint booth (workshop level 2) to go past ' + cap + '%.' };
    const gain = Math.min(25, cap - cur);
    let cost = Math.round((60 + c.value * 0.028 * C.weight) * gain / 25 / 10) * 10;
    const rep = s.rep.classics;
    if (mode === 'original') cost = Math.round(cost * 1.35 / 10) * 10;
    if (mode === 'performance') cost = Math.round(cost * 0.9 / 10) * 10;
    cost = Math.round(cost * (1 - Math.min(0.2, rep / 400)) / 10) * 10;   // Mariam's discount grows with reputation
    return { ok: true, gain, cost, hours: C.hours, cap };
  }
  function restore(s, uid, comp, mode) {
    const o = s.garage.find(g => g.uid === uid); if (!o) return { ok: false, why: 'No such car.' };
    const q = restoreQuote(s, o, comp, mode);
    if (!q.ok) return q;
    if (s.money < q.cost) return { ok: false, why: 'Not enough money.' };
    s.money -= q.cost; s.time += q.hours * 60;
    o.cond[comp] = Math.min(100, o.cond[comp] + q.gain);
    if (mode === 'performance' && (comp === 'engine' || comp === 'tyres')) {
      if (!o.perf[comp]) o.originality = Math.max(0, o.originality - (comp === 'engine' ? 35 : 10));
      o.perf[comp] = true;
    }
    if (mode === 'original' && o.originality < 100) o.originality = Math.min(100, o.originality + 5);
    s.stats.restored++;
    const out = { ok: true, cost: q.cost, gain: q.gain, rep: [] };
    // finishing a full restoration of a classic or rare car earns classics respect, once per car
    if (condScore(o) >= 95 && !(s.flags['restored_' + o.uid])) {
      s.flags['restored_' + o.uid] = true;
      const c = D.CAR[o.id];
      const r = Math.round(6 * D.RARITY[c.rarity].mult * (o.originality / 100 * 0.6 + 0.4));
      out.rep.push(addRep(s, 'classics', r));
      if (c.set === 'desert') out.rep.push(addRep(s, 'offroad', 5));
    }
    return out;
  }
  function tune(s, uid) {
    const o = s.garage.find(g => g.uid === uid);
    if (s.workshop < 3) return { ok: false, why: 'Needs the dyno (workshop level 3).' };
    if (o.tune) return { ok: false, why: 'Already tuned.' };
    const cost = Math.round((400 + D.CAR[o.id].value * 0.02) / 10) * 10;
    if (s.money < cost) return { ok: false, why: 'Not enough money.' };
    s.money -= cost; o.tune = true; o.originality = Math.max(0, o.originality - 10); s.time += 180;
    return { ok: true, cost };
  }
  function upgradeWorkshop(s) {
    const cur = D.WORKSHOP[s.workshop - 1];
    if (s.workshop >= D.WORKSHOP.length) return { ok: false, why: 'Already a full facility.' };
    if (s.money < cur.upgrade) return { ok: false, why: 'Not enough money.' };
    s.money -= cur.upgrade; s.workshop++;
    return { ok: true, cost: cur.upgrade };
  }

  function buy(s, id, price, cond) {
    if (s.garage.length >= capacity(s)) return { ok: false, why: 'Your workshop is full. Sell a car or upgrade the workshop.' };
    if (s.money < price) return { ok: false, why: 'Not enough money.' };
    s.money -= price;
    const o = addCar(s, id, cond);
    return { ok: true, car: o, sets: checkSets(s) };
  }
  function sellPrice(s, o, buyer) {
    const c = D.CAR[o.id], v = value(o);
    if (buyer === 'yousif') {
      const rareish = ['rare', 'legendary', 'oneoff'].includes(c.rarity);
      return Math.round(v * (rareish ? 0.9 + Math.min(0.25, s.rep.collectors / 200) : 0.75) / 10) * 10;
    }
    return Math.round(v * 0.62 / 10) * 10;   // showroom trade-in
  }
  function sell(s, uid, buyer) {
    if (s.garage.length <= 1) return { ok: false, why: 'You need at least one car.' };
    const i = s.garage.findIndex(g => g.uid === uid); if (i < 0) return { ok: false, why: 'No such car.' };
    const o = s.garage[i], price = sellPrice(s, o, buyer);
    s.garage.splice(i, 1); s.money += price;
    if (!s.garage.some(g => g.id === o.id)) s.register[o.id] = 'sold';
    if (s.active === uid) s.active = s.garage[0].uid;
    const rep = [];
    if (buyer === 'yousif' && condScore(o) > 85) rep.push(addRep(s, 'collectors', Math.round(3 * D.RARITY[D.CAR[o.id].rarity].mult)));
    return { ok: true, price, rep };
  }

  function addRep(s, k, n) {
    const before = s.rep[k];
    s.rep[k] = clamp(before + n, 0, 100);
    return { k, n: s.rep[k] - before };
  }

  // sets complete when every car in them has been owned at some point
  function everOwned(s, id) { return s.register[id] === 'owned' || s.register[id] === 'sold'; }
  function checkSets(s) {
    const done = [];
    for (const [sid, set] of Object.entries(D.SETS)) {
      if (s.setsDone[sid]) continue;
      const cars = D.CARS.filter(c => c.set === sid);
      if (cars.every(c => everOwned(s, c.id))) {
        s.setsDone[sid] = true; s.money += set.reward.money;
        for (const [k, n] of Object.entries(set.reward.rep)) addRep(s, k, n);
        done.push(sid);
      }
    }
    return done;
  }

  // ------------------------------------------------------------------ leads ---
  function leadNeeds(s, id) {
    const L = D.LEADS[id], n = L.needs, miss = [];
    if (n.rep) for (const [k, v] of Object.entries(n.rep)) if (s.rep[k] < v) miss.push(D.REP[k].name + ' reputation ' + v);
    if (n.owns && !everOwned(s, n.owns)) miss.push('own the ' + D.CAR[n.owns].name);
    if (n.medal && !s.medals[n.medal]) miss.push('a ' + n.medal + ' medal in the time trial');
    return miss;
  }
  function leadState(s, id) { return s.leads[id] || (leadNeeds(s, id).length ? 'locked' : 'available'); }
  function takeLead(s, id) {
    if (leadState(s, id) !== 'available') return false;
    s.leads[id] = 'active';
    const car = D.LEADS[id].car;
    if (!s.register[car]) s.register[car] = 'heard';
    return true;
  }
  function discover(s, id) {
    if (s.leads[id] !== 'active') return false;
    s.leads[id] = 'found';
    const car = D.LEADS[id].car;
    if (s.register[car] === 'heard' || !s.register[car]) s.register[car] = 'seen';
    return true;
  }
  function claimLead(s, id) {
    const L = D.LEADS[id];
    if (s.leads[id] !== 'found') return { ok: false, why: 'Find it first.' };
    const r = buy(s, L.car, L.price);
    if (r.ok) { s.leads[id] = 'done'; s.time += 120; }
    return r;
  }

  // ---------------------------------------------------------------- clock ---
  const day = s => Math.floor(s.time / 1440) % 7;
  const hour = s => (s.time % 1440) / 60;
  function clockText(s) {
    const h = Math.floor(hour(s)), mi = Math.floor(s.time % 60);
    return D.DAYS[day(s)] + ' ' + String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }
  function present(s, personId) {
    const p = D.PEOPLE[personId]; if (!p.hours) return true;
    const h = hour(s), [a, b] = p.hours;
    return a < b ? (h >= a && h < b) : (h >= a || h < b);
  }
  const gathering = s => day(s) === 5 && hour(s) >= 17 && hour(s) < 23;   // Friday evening at the marina
  // jump the clock forward to the next time it is targetHour (on targetDay, if given)
  function waitUntil(s, targetHour, targetDay) {
    let t = Math.floor(s.time / 1440) * 1440 + targetHour * 60;
    while (t <= s.time || (targetDay != null && Math.floor(t / 1440) % 7 !== targetDay)) t += 1440;
    s.time = t;
  }

  // -------------------------------------------------------------- events ---
  // Time trial medal times (seconds) for one lap of the 2.7 km GP loop. A worn
  // Kestrel can take bronze; gold needs a quick car driven well.
  const MEDALS = { gold: 92, silver: 104, bronze: 120 };
  const MEDAL_PAY = { gold: 2500, silver: 1200, bronze: 500 };
  function timeTrialResult(s, carId, t) {
    const out = { medal: null, pay: 0, rep: [], newBest: false, firstMedal: false };
    if (!s.best[carId] || t < s.best[carId]) { s.best[carId] = t; out.newBest = true; }
    for (const m of ['gold', 'silver', 'bronze']) if (t <= MEDALS[m]) { out.medal = m; break; }
    if (out.medal) {
      const first = !s.medals[out.medal];
      out.firstMedal = first;
      out.pay = Math.round(MEDAL_PAY[out.medal] * (first ? 1 : 0.15));
      if (first) { ['bronze', 'silver', 'gold'].forEach(m => { if (MEDALS[m] >= MEDALS[out.medal]) s.medals[m] = true; }); }
      out.rep.push(addRep(s, 'circuit', first ? { gold: 20, silver: 10, bronze: 6 }[out.medal] : 1));
    } else out.pay = 50;
    s.money += out.pay; s.stats.events++;
    return out;
  }
  // desert run medals: gold needs a capable 4x4 driven well
  const DESERT_MEDALS = { gold: 80, silver: 95, bronze: 115 };
  function desertResult(s, t) {
    const out = { medal: null, pay: 0, rep: [] };
    for (const m of ['gold', 'silver', 'bronze']) if (t <= DESERT_MEDALS[m]) { out.medal = m; break; }
    const first = out.medal && !s.flags['desert_' + out.medal];
    if (out.medal) {
      out.pay = first ? { gold: 3000, silver: 1500, bronze: 700 }[out.medal] : 150;
      if (first) ['bronze', 'silver', 'gold'].forEach(m => { if (DESERT_MEDALS[m] >= DESERT_MEDALS[out.medal]) s.flags['desert_' + m] = true; });
      out.rep.push(addRep(s, 'offroad', first ? { gold: 22, silver: 12, bronze: 7 }[out.medal] : 2));
    }
    if (s.desertBest == null || t < s.desertBest) s.desertBest = t;
    s.money += out.pay; s.stats.events++;
    return out;
  }
  function dragResult(s, won, et) {
    const tier = D.DRAG_TIERS[Math.min(s.dragTier, D.DRAG_TIERS.length - 1)];
    const out = { won, pay: 0, rep: [] };
    s.money -= 50;   // entry fee
    if (won) {
      out.pay = tier.purse;
      out.rep.push(addRep(s, 'drag', s.dragTier < D.DRAG_TIERS.length ? 8 + s.dragTier * 3 : 2));
      if (s.dragTier < D.DRAG_TIERS.length - 1) s.dragTier++;
      else s.flags.dragChamp = true;
    }
    s.money += out.pay; s.stats.events++;
    return out;
  }
  // show a car at the marina: once per car per gathering (or café meet)
  function showCar(s, o, where) {
    const c = D.CAR[o.id], key = where + ':' + o.uid + ':' + Math.floor(s.time / 1440);
    if (s.shown[key]) return { ok: false, why: 'People have already seen this car today.' };
    s.shown[key] = true;
    const q = condScore(o) / 100;
    const base = D.RARITY[c.rarity].mult * (0.3 + 0.7 * q * q);
    const out = { ok: true, rep: [] };
    if (where === 'marina') out.rep.push(addRep(s, 'collectors', Math.max(1, Math.round(base * (gathering(s) ? 6 : 2)))));
    else out.rep.push(addRep(s, c.set === 'classics' ? 'classics' : c.set === 'desert' ? 'offroad' : c.set === 'street' ? 'drag' : 'classics', Math.max(1, Math.round(base * 3))));
    return out;
  }

  // parts runs from Mariam's yard: pay depends on distance and the deadline
  function partsJob(s, rand) {
    const dests = W.places.filter(p => p.id !== 'yard' && p.id !== 'workshop');
    const d = dests[Math.floor(rand() * dests.length)], y = W.place.yard;
    const dist = Math.hypot(d.x - y.x, d.z - y.z);
    const pay = Math.round((120 + dist * 0.12) / 10) * 10;
    const limit = Math.round(40 + dist / 14);
    return { to: d.id, pay, limit };
  }

  function save(s) { return JSON.stringify(s); }
  function load(str) {
    try { const s = JSON.parse(str); if (!s || s.v !== 1 || !Array.isArray(s.garage) || !s.garage.length) return null; return s; }
    catch (e) { return null; }
  }

  return {
    STYLE, params, makeCar, step, speed, fwdSpeed, clamp,
    newGame, addCar, activeCar, capacity, condScore, value, restoreQuote, restore, tune, upgradeWorkshop, buy, sell, sellPrice, addRep, checkSets,
    leadNeeds, leadState, takeLead, discover, claimLead, everOwned,
    day, hour, clockText, present, gathering, waitUntil,
    MEDALS, MEDAL_PAY, DESERT_MEDALS, timeTrialResult, desertResult, dragResult, showCar, partsJob, save, load,
  };
})();

if (typeof module !== 'undefined') module.exports = AS;
