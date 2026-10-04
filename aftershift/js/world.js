// ============================================================================
// AFTERSHIFT WORLD: the fictional island map. Roads, zones, surfaces, dune
// heights, buildings and colliders, places and signs. Pure data and queries,
// no DOM, so it runs headless in the tests.
//
// Coordinates are metres. x runs east, z runs south, so north is -z. The sea
// is to the north and east, the desert to the south and west.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.World = (() => {
  const D = AS.DATA;
  const BOUNDS = { x0: -2300, x1: 2700, z0: -1750, z1: 2300 };

  // deterministic RNG so the world is identical on every load
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------------------------------------------------------- coast ---
  const coastN = x => -1500 + 50 * Math.sin(x / 300) + 18 * Math.sin(x / 83);
  const coastE = z => 1800 + 60 * Math.sin(z / 350) + 15 * Math.sin(z / 71);
  const ISLAND = { x: 2400, z: 700, r: 250 };
  function islandR(x, z) {
    const a = Math.atan2(z - ISLAND.z, x - ISLAND.x);
    return ISLAND.r + 30 * Math.sin(a * 3) + 15 * Math.sin(a * 7 + 1);
  }
  // signed distance to the coast: positive on land, negative at sea (metres, roughly)
  function landDist(x, z) {
    const dn = z - coastN(x), de = coastE(z) - x;
    let d = Math.min(dn, de);
    const di = islandR(x, z) - Math.hypot(x - ISLAND.x, z - ISLAND.z);
    return Math.max(d, di);
  }

  // ---------------------------------------------------------------- zones ---
  const ZONES = {
    city:       { name: 'Manara Bay',            ar: 'خليج المنارة',         ground: 'paved' },
    oldtown:    { name: 'Lulu Quarter',          ar: 'حي اللؤلؤ',            ground: 'paved' },
    industrial: { name: 'Ras Hadid Industrial Area', ar: 'منطقة رأس حديد الصناعية', ground: 'paved' },
    circuit:    { name: 'Al Rimal International Circuit', ar: 'حلبة الرمال الدولية', ground: 'sand' },
    oilfield:   { name: 'Wadi Naft Field',       ar: 'حقل وادي النفط',       ground: 'sand' },
    island:     { name: 'Jazirat Al Marsa',      ar: 'جزيرة المرسى',         ground: 'sand' },
    desert:     { name: 'Southern Desert',       ar: 'الصحراء الجنوبية',     ground: 'sand' },
    sea:        { name: 'The Gulf',              ar: 'الخليج',               ground: 'water' },
  };
  const RECTS = [
    ['city', 380, -1560, 1820, -500],
    ['oldtown', -980, -1560, 330, -940],
    ['industrial', -260, -400, 960, 400],
    ['circuit', 150, 1120, 1350, 2080],
    ['oilfield', -2250, -150, -950, 1250],
  ];
  const PAVED_PATCHES = [
    [380, 1140, 960, 1290],      // paddock
    [-1700, 680, -1450, 880],    // staff compound
    [1180, 1980, 1330, 2060],    // drag strip staging
  ];
  function zoneAt(x, z) {
    if (landDist(x, z) < 0) return 'sea';
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r + 60) return 'island';
    for (const r of RECTS) if (x >= r[1] && x <= r[3] && z >= r[2] && z <= r[4]) return r[0];
    return 'desert';
  }

  // ---------------------------------------------------------------- roads ---
  const ROAD_W = { highway: 22, boulevard: 18, street: 12, lane: 8, track: 10, circuit: 14, drag: 20, causeway: 16, pit: 10 };
  const roads = [];
  function catmull(pts, closed, step) {
    const out = [], n = pts.length;
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  function addRoad(type, name, ar, ctrl, opts = {}) {
    const pts = opts.straight ? densify(ctrl, 25) : catmull(ctrl, !!opts.closed, opts.step || 10);
    const r = { id: roads.length, type, name, ar, w: opts.w || ROAD_W[type], pts, closed: !!opts.closed, traffic: !!opts.traffic };
    // cumulative length
    r.s = [0];
    for (let i = 1; i < pts.length; i++) r.s.push(r.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    if (r.closed) r.len = r.s[r.s.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    else r.len = r.s[r.s.length - 1];
    roads.push(r);
    return r;
  }
  function densify(ctrl, step) {
    const out = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const a = ctrl[i], b = ctrl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    out.push(ctrl[ctrl.length - 1].slice());
    return out;
  }

  // highways and main links
  const kingsRoad = addRoad('highway', 'King\'s Road', 'شارع الملك', [[-2200, 10], [-1500, 0], [-1000, 0], [-200, 0], [600, 0], [1200, -10], [1600, 0], [1655, 0]], { traffic: true, step: 20 });
  addRoad('highway', 'Coastal Highway', 'الطريق الساحلي', [[1700, -540], [1690, -260], [1655, 0], [1640, 300], [1600, 600], [1470, 930], [1180, 1160], [880, 1230]], { traffic: true, step: 20 });
  addRoad('highway', 'Sitra Link', 'وصلة سترة', [[900, -540], [900, -200], [905, 0], [880, 400], [790, 800], [700, 1060], [660, 1150]], { traffic: true, step: 20 });
  addRoad('causeway', 'Marsa Causeway', 'جسر المرسى', [[1600, 600], [1800, 620], [2000, 660], [2170, 690], [2300, 700], [2380, 690]], { traffic: true, step: 20 });
  addRoad('boulevard', 'Corniche', 'الكورنيش', [[-920, -1345], [-400, -1360], [300, -1345], [900, -1340], [1500, -1340], [1700, -1300], [1715, -1000], [1700, -540]], { traffic: true, step: 15 });
  addRoad('street', 'Old Town Road', 'طريق البلدة القديمة', [[-300, -1010], [-280, -800], [-240, -600], [-200, -380]], { traffic: true });
  addRoad('street', 'Oilfield Road', 'طريق الحقل', [[-1000, 0], [-1100, 220], [-1300, 480], [-1480, 680], [-1560, 760]], { traffic: true });

  // city grid
  const CITY_X = [420, 580, 740, 900, 1060, 1220, 1380, 1540], CITY_Z = [-1180, -1020, -860, -700, -540];
  for (const x of CITY_X) if (x !== 900) addRoad(x === 1220 ? 'boulevard' : 'street', 'Avenue ' + x, 'شارع', [[x, -1340], [x, -540]], { straight: true, traffic: true });
  addRoad('boulevard', 'Bay Avenue', 'جادة الخليج', [[900, -1340], [900, -540]], { straight: true, traffic: true });
  for (const z of CITY_Z) addRoad(z === -860 ? 'boulevard' : 'street', 'Road ' + (-z), 'طريق', [[420, z], [1700, z]], { straight: true, traffic: true });

  // old quarter lanes (jittered grid, so they wind)
  const R0 = rng(7);
  const OT_X = [-900, -780, -660, -540, -420, -300, -180, -60, 60, 180, 300], OT_Z = [-1345, -1230, -1120, -1010];
  const otNode = OT_X.map((x, i) => OT_Z.map((z, j) => [x + (j === 0 ? 0 : (R0() - 0.5) * 40), z + (j === 0 ? 0 : (R0() - 0.5) * 30)]));
  for (let i = 0; i < OT_X.length; i++) addRoad('lane', 'Lane', 'زقاق', OT_Z.map((_, j) => otNode[i][j]), { step: 6 });
  for (let j = 1; j < OT_Z.length; j++) addRoad('lane', 'Lane', 'زقاق', OT_X.map((_, i) => otNode[i][j]), { step: 6 });
  addRoad('street', 'Lulu Link', 'وصلة اللؤلؤ', [[300, -1010], [420, -1020]], { straight: true });

  // industrial grid
  const IN_X = [-200, 0, 200, 400, 600], IN_Z = [-300, 150, 300];
  for (const x of IN_X) addRoad('street', 'Industrial Ave ' + (x / 100 + 3), 'شارع صناعي', [[x, -380], [x, 380]], { straight: true, traffic: true });
  for (const z of IN_Z) addRoad('street', 'Industrial Road', 'طريق صناعي', [[-200, z], [905, z]], { straight: true, traffic: true });

  // oilfield compound and sand tracks
  addRoad('street', 'Compound Lane', 'زقاق المجمع', [[-1690, 700], [-1460, 700], [-1460, 860], [-1690, 860], [-1690, 700]], { straight: true });
  addRoad('street', 'Compound Lane', 'زقاق المجمع', [[-1690, 780], [-1460, 780]], { straight: true });
  addRoad('track', 'Pipeline Track', 'مسار الأنابيب', [[-1800, 0], [-1815, 140], [-1835, 280], [-1850, 330]]);
  addRoad('track', 'Lone Tree Track', 'مسار الشجرة', [[-1560, 860], [-1520, 1100], [-1460, 1350], [-1490, 1600], [-1500, 1690]]);
  addRoad('track', 'Camp Track', 'مسار المخيم', [[-1500, 1690], [-1200, 1760], [-900, 1750], [-600, 1700], [-300, 1700], [0, 1560], [180, 1400], [400, 1230]]);
  addRoad('track', 'Winter Camp Track', 'مسار المخيم الشتوي', [[-1200, 1760], [-1240, 1880]]);
  addRoad('track', 'Dune Track', 'مسار الكثبان', [[-300, 1700], [-200, 1950], [100, 2100], [500, 2150], [900, 2120], [1200, 2060]]);

  // the circuit: a clockwise 3.4 km loop, main straight along the paddock
  const circuit = addRoad('circuit', 'Al Rimal GP Circuit', 'حلبة الرمال', [
    [360, 1305], [620, 1300], [900, 1300], [1030, 1320], [1075, 1400], [1040, 1480], [960, 1540], [985, 1640], [1060, 1730],
    [1060, 1830], [990, 1880], [800, 1885], [600, 1880], [500, 1850], [470, 1780], [520, 1720], [470, 1660], [360, 1650],
    [300, 1580], [330, 1500], [400, 1460], [370, 1390], [300, 1360],
  ], { closed: true, step: 6 });
  addRoad('pit', 'Pit Lane', 'ممر الصيانة', [[380, 1275], [620, 1270], [880, 1275]], { step: 8 });
  addRoad('street', 'Paddock Road', 'طريق المضمار', [[660, 1150], [660, 1255]], { straight: true });
  addRoad('street', 'Paddock Road', 'طريق المضمار', [[420, 1200], [880, 1210], [880, 1230]], { straight: true });
  const drag = addRoad('drag', 'Drag Strip', 'مضمار السحب', [[1250, 2020], [1250, 1300]], { straight: true });
  addRoad('street', 'Strip Access', 'مدخل مضمار السحب', [[1180, 1160], [1250, 1250], [1250, 1300]]);
  addRoad('street', 'Strip Return', 'طريق العودة', [[1250, 2020], [1290, 2040], [1310, 2000], [1310, 1350], [1280, 1290]], { w: 9 });
  // island
  addRoad('street', 'Boatyard Road', 'طريق المرفأ', [[2380, 690], [2420, 640], [2470, 680], [2450, 760], [2380, 780], [2330, 740], [2380, 690]], { step: 8 });

  // ------------------------------------------------------- road queries ---
  const CELL = 50, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  roads.forEach(r => {
    const n = r.pts.length, segs = r.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = r.pts[i], b = r.pts[(i + 1) % n], pad = r.w / 2 + 2;
      const i0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL), i1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
      const j0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL), j1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
        const k = key(ii, jj); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([r, i]);
      }
    }
  });
  function segProject(r, i, x, z) {
    const n = r.pts.length, a = r.pts[i], b = r.pts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t, pz = a[1] + dz * t, L = Math.sqrt(L2);
    return { px, pz, t, d: Math.hypot(x - px, z - pz), dx: dx / L, dz: dz / L, L };
  }
  // the road under (or nearest to) a point, within `range` metres of its edge
  function roadAt(x, z, range = 0) {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    let best = null;
    if (!list) return null;
    for (const [r, i] of list) {
      const p = segProject(r, i, x, z), edge = p.d - r.w / 2;
      if (edge <= range && (!best || edge < best.edge || (r.type === 'circuit' && edge <= 0 && best.road.type !== 'circuit'))) {
        best = { road: r, seg: i, t: p.t, edge, d: p.d, px: p.px, pz: p.pz, dx: p.dx, dz: p.dz, s: r.s[i] + p.t * p.L };
      }
    }
    return best;
  }
  // every road whose surface is within `range` metres of the point
  function roadsNear(x, z, range = 0) {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))), out = new Set();
    if (list) for (const [r, i] of list) if (segProject(r, i, x, z).d - r.w / 2 <= range) out.add(r);
    return [...out];
  }
  // distance from a point to the nearest road centreline, searching outward
  function roadDist(x, z, maxR = 200) {
    let best = maxR;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = Math.ceil(maxR / CELL);
    const seen = new Set();
    for (let ii = ci - k; ii <= ci + k; ii++) for (let jj = cj - k; jj <= cj + k; jj++) {
      const list = grid.get(key(ii, jj)); if (!list) continue;
      for (const [r, i] of list) {
        const id = r.id * 10000 + i; if (seen.has(id)) continue; seen.add(id);
        const d = segProject(r, i, x, z).d - r.w / 2; if (d < best) best = d;
      }
    }
    return best;
  }
  function pointAt(r, s) {
    s = r.closed ? ((s % r.len) + r.len) % r.len : Math.max(0, Math.min(r.len, s));
    let lo = 0, hi = r.s.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r.s[m] <= s) lo = m; else hi = m - 1; }
    const n = r.pts.length, a = r.pts[lo], b = r.pts[(lo + 1) % n];
    const segL = (lo + 1 < r.s.length ? r.s[lo + 1] : r.len) - r.s[lo] || 1, t = (s - r.s[lo]) / segL;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * t, z: a[1] + dz * t, dx: dx / L, dz: dz / L };
  }

  // --------------------------------------------------------------- places ---
  const P = (id, name, ar, x, z, kind, extra) => Object.assign({ id, name, ar, x, z, kind, r: 16 }, extra || {});
  const places = [
    P('workshop', 'Your workshop', 'ورشتك', 100, 60, 'workshop', { r: 18 }),
    P('yard', 'Al-Sayed Parts & Salvage', 'قطع غيار السيد', 434, -205, 'yard'),
    P('cafe', 'Qahwat Al Lulu', 'قهوة اللؤلؤ', -120, -1175, 'cafe'),
    P('familygarage', 'Al-Bahar family garage', 'كراج عائلة البحر', -439, -1180, 'familygarage'),
    P('showroom', 'Bay Motors showroom', 'معرض باي موتورز', 1300, -898, 'showroom'),
    P('marina', 'Marina plaza', 'ساحة المارينا', 1420, -1385, 'marina', { r: 22 }),
    P('paddock', 'Al Rimal paddock', 'منطقة الصيانة', 560, 1240, 'paddock', { r: 20 }),
    P('drag', 'Drag strip staging lanes', 'مضمار السحب', 1220, 2035, 'drag', { r: 20 }),
    P('camp', 'Noor\'s desert camp', 'مخيم نور', -300, 1660, 'camp', { r: 22 }),
    P('boatyard', 'Marsa boatyard', 'مرفأ المرسى', 2400, 650, 'boatyard'),
  ];
  const place = {}; places.forEach(p => { place[p.id] = p; });

  // landmarks for the renderer (and exclusion zones for random buildings)
  const landmarks = [
    { kind: 'twintowers', x: 1130, z: -1255, r: 70 },
    { kind: 'sailtower', x: 660, z: -1260, r: 45 },
    { kind: 'fort', x: -700, z: -1430, r: 80 },
    { kind: 'mosque', x: -560, z: -1070, r: 35 },
    { kind: 'mosque', x: 1470, z: -620, r: 35 },
    { kind: 'lonetree', x: -1540, z: 1720, r: 30 },
    { kind: 'circuittower', x: 420, z: 1225, r: 25 },
    { kind: 'carpark', x: 1140, z: -1100, r: 60 },
    { kind: 'pumpstation', x: -1850, z: 330, r: 40 },
    { kind: 'wintercamp', x: -1250, z: 1920, r: 40 },
  ];

  // ------------------------------------------------------------ buildings ---
  // AABB colliders: {x0,z0,x1,z1,h,kind,tint}. Generated per zone, kept clear
  // of roads, places, landmarks and hidden cars.
  const buildings = [];
  const exclusions = [];
  places.forEach(p => exclusions.push({ x: p.x, z: p.z, r: p.r + 18 }));
  landmarks.forEach(l => exclusions.push({ x: l.x, z: l.z, r: l.r }));
  Object.values(D.LEADS).forEach(l => exclusions.push({ x: l.spot.x, z: l.spot.z, r: 22 }));
  function clearOf(x0, z0, x1, z1, gap) {
    for (const e of exclusions) {
      const cx = Math.max(x0, Math.min(e.x, x1)), cz = Math.max(z0, Math.min(e.z, z1));
      if (Math.hypot(cx - e.x, cz - e.z) < e.r) return false;
    }
    // sample the footprint for road clearance
    const xs = [x0, (x0 + x1) / 2, x1], zs = [z0, (z0 + z1) / 2, z1];
    for (const x of xs) for (const z of zs) if (roadDist(x, z, gap + 30) < gap) return false;
    if (landDist(x0, z0) < 10 || landDist(x1, z1) < 10 || landDist(x0, z1) < 10 || landDist(x1, z0) < 10) return false;
    for (const b of buildings) if (x0 < b.x1 + 2 && x1 > b.x0 - 2 && z0 < b.z1 + 2 && z1 > b.z0 - 2) return false;
    return true;
  }
  function tryAdd(b, gap) { if (clearOf(b.x0, b.z0, b.x1, b.z1, gap)) { buildings.push(b); return true; } return false; }

  const R1 = rng(42);
  // city: towers near the corniche, mid-rise further south
  for (let i = 0; i < CITY_X.length; i++) for (let j = -1; j < CITY_Z.length - 1; j++) {
    const xa = CITY_X[i], xb = i + 1 < CITY_X.length ? CITY_X[i + 1] : 1700;
    const za = j < 0 ? -1340 : CITY_Z[j], zb = j < 0 ? CITY_Z[0] : CITY_Z[j + 1];
    const north = za <= -1180;
    for (let k = 0; k < 4; k++) {
      const qx = k % 2, qz = (k / 2) | 0;
      const cx = xa + (xb - xa) * (0.28 + 0.44 * qx), cz = za + (zb - za) * (0.28 + 0.44 * qz);
      const s = 22 + R1() * 22, s2 = 22 + R1() * 22;
      const tall = north ? 70 + R1() * 150 : (za <= -1020 ? 40 + R1() * 90 : 14 + R1() * 40);
      tryAdd({ x0: cx - s, z0: cz - s2, x1: cx + s, z1: cz + s2, h: tall, kind: tall > 60 ? 'tower' : 'midrise', tint: R1() }, 10);
    }
  }
  // old quarter: low coral-stone houses, some with wind towers
  for (let x = -960; x < 320; x += 24) for (let z = -1440; z < -950; z += 24) {
    if (R1() < 0.25) continue;
    const w = 9 + R1() * 8, d = 9 + R1() * 8;
    tryAdd({ x0: x, z0: z, x1: x + w, z1: z + d, h: 5 + R1() * 7, kind: 'house', tint: R1(), windtower: R1() < 0.18 }, 5);
  }
  // industrial: warehouses and workshop rows
  for (let x = -250; x < 960; x += 50) for (let z = -390; z < 390; z += 45) {
    if (R1() < 0.2) continue;
    const w = 20 + R1() * 25, d = 18 + R1() * 22;
    tryAdd({ x0: x, z0: z, x1: x + w, z1: z + d, h: 7 + R1() * 8, kind: 'warehouse', tint: R1() }, 7);
  }
  // staff compound bungalows
  for (let x = -1680; x < -1470; x += 42) for (const z of [720, 740, 800, 820]) {
    tryAdd({ x0: x + 6, z0: z, x1: x + 24, z1: z + 14, h: 4.2, kind: 'bungalow', tint: R1() }, 4);
  }
  // circuit buildings (explicit): pit building, grandstands, team garages
  buildings.push({ x0: 380, z0: 1248, x1: 880, z1: 1262, h: 9, kind: 'pits', tint: 0.5 });
  buildings.push({ x0: 420, z0: 1322, x1: 880, z1: 1345, h: 14, kind: 'grandstand', tint: 0.5, face: -1 });
  buildings.push({ x0: 600, z0: 1898, x1: 900, z1: 1915, h: 10, kind: 'grandstand', tint: 0.5, face: -1 });
  buildings.push({ x0: 1095, z0: 1340, x1: 1112, z1: 1460, h: 10, kind: 'grandstand', tint: 0.5, face: -1, alongZ: true });
  buildings.push({ x0: 1268, z0: 1600, x1: 1290, z1: 1900, h: 8, kind: 'grandstand', tint: 0.5, face: -1, alongZ: true });
  // island boatyard sheds (the long one is the Hawk's)
  buildings.push({ x0: 2330, z0: 620, x1: 2360, z1: 650, h: 7, kind: 'shed', tint: 0.6 });

  // walls of the garages and sheds that hide lead cars (open at the car's front)
  Object.values(D.LEADS).forEach(L => {
    if (L.shelter !== 'garage' && L.shelter !== 'shed') return;
    const big = L.shelter === 'shed', w = big ? 9 : 6.5, d = big ? 12 : 8, h = big ? 5.5 : 3.6, s = L.spot;
    const c = Math.cos(s.h), sn = Math.sin(s.h), quarter = Math.abs(sn) > 0.7;
    const wall = (dx, dz, ww, dd) => {
      const x = s.x + dx * c - dz * sn, z = s.z + dx * sn + dz * c;
      const hw = (quarter ? dd : ww) / 2, hd = (quarter ? ww : dd) / 2;
      buildings.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd, h, kind: 'shelterwall', hidden: true });
    };
    wall(-w / 2, 0, 0.3, d); wall(w / 2, 0, 0.3, d); wall(0, d / 2, w, 0.3);
  });

  // --------------------------------------------------------- height map ---
  // Dunes only where there is sand and no road nearby. Roads sit at y = 0.
  const HG = 20, HW = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / HG) + 1, HD = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / HG) + 1;
  const heights = new Float32Array(HW * HD), roadMask = new Float32Array(HW * HD);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function rawDune(x, z) {
    const a = Math.sin(x * 0.011 + Math.sin(z * 0.004) * 2.2) * Math.cos(z * 0.0075 + x * 0.002);
    const b = Math.sin((x + z) * 0.019) * 0.35 + Math.sin(x * 0.031 - z * 0.017) * 0.2;
    return Math.max(0, a * 0.8 + b + 0.35);
  }
  for (let j = 0; j < HD; j++) for (let i = 0; i < HW; i++) {
    const x = BOUNDS.x0 + i * HG, z = BOUNDS.z0 + j * HG;
    const ld = landDist(x, z);
    let h;
    if (ld < 0) h = Math.max(-6, ld * 0.08) - 0.8;
    else {
      const zone = zoneAt(x, z);
      const amp = zone === 'desert' ? 9 : zone === 'oilfield' ? 4 : zone === 'island' ? 1.5 : zone === 'circuit' ? 1.2 : 0;
      const rd = amp ? roadDist(x, z, 160) : 0;
      let ex = 1;
      for (const e of exclusions) { const d = Math.hypot(x - e.x, z - e.z); if (d < e.r + 80) ex = Math.min(ex, smooth(e.r + 10, e.r + 80, d)); }
      const m = amp ? smooth(25, 140, rd) * ex * smooth(0, 60, ld) : 0;
      roadMask[j * HW + i] = m;
      h = rawDune(x, z) * amp * m - (ld < 25 ? (25 - ld) / 25 * 0.6 : 0);
    }
    heights[j * HW + i] = h;
  }
  function heightAt(x, z) {
    const fx = (x - BOUNDS.x0) / HG, fz = (z - BOUNDS.z0) / HG;
    const i = Math.max(0, Math.min(HW - 2, Math.floor(fx))), j = Math.max(0, Math.min(HD - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const h00 = heights[j * HW + i], h10 = heights[j * HW + i + 1], h01 = heights[(j + 1) * HW + i], h11 = heights[(j + 1) * HW + i + 1];
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }

  // --------------------------------------------------------------- surface ---
  // grip mu, rolling resistance, and whether it throws up dust
  const SURF = {
    circuit: { mu: 1.1, roll: 0.012, dust: 0,   name: 'Circuit' },
    drag:    { mu: 1.5, roll: 0.012, dust: 0,   name: 'Prepped strip' },
    asphalt: { mu: 1.0, roll: 0.015, dust: 0,   name: 'Asphalt' },
    paved:   { mu: 0.9, roll: 0.02,  dust: 0.1, name: 'Paved' },
    track:   { mu: 0.72, roll: 0.045, dust: 0.7, name: 'Packed sand' },
    sand:    { mu: 0.55, roll: 0.10, dust: 1,   name: 'Sand' },
    water:   { mu: 0.2, roll: 0.5,  dust: 0,   name: 'Water' },
  };
  function inPatch(x, z) { for (const p of PAVED_PATCHES) if (x >= p[0] && x <= p[2] && z >= p[1] && z <= p[3]) return true; return false; }
  function surfaceAt(x, z) {
    const r = roadAt(x, z, 0);
    if (r) return { kind: r.road.type === 'track' ? 'track' : r.road.type === 'circuit' ? 'circuit' : r.road.type === 'drag' ? 'drag' : 'asphalt', road: r };
    if (landDist(x, z) < -2) return { kind: 'water', road: null };
    if (inPatch(x, z)) return { kind: 'paved', road: null };
    return { kind: ZONES[zoneAt(x, z)].ground === 'paved' ? 'paved' : 'sand', road: null };
  }

  // ------------------------------------------------------------ colliders ---
  const BC = 60, bgrid = new Map();
  buildings.forEach((b, idx) => {
    for (let i = Math.floor(b.x0 / BC); i <= Math.floor(b.x1 / BC); i++) for (let j = Math.floor(b.z0 / BC); j <= Math.floor(b.z1 / BC); j++) {
      const k = key(i, j); if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(idx);
    }
  });
  // landmark solids (circles) the car can hit
  const solids = [];
  landmarks.forEach(l => {
    if (l.kind === 'twintowers') { solids.push({ x: l.x - 32, z: l.z, r: 24 }, { x: l.x + 32, z: l.z, r: 24 }); }
    if (l.kind === 'sailtower') solids.push({ x: l.x, z: l.z, r: 26 });
    if (l.kind === 'mosque') solids.push({ x: l.x, z: l.z, r: 16 });
    if (l.kind === 'circuittower') solids.push({ x: l.x, z: l.z, r: 9 });
    if (l.kind === 'lonetree') solids.push({ x: l.x, z: l.z, r: 1.6 });
  });
  // the fort: four walls of circles
  { const f = landmarks.find(l => l.kind === 'fort'); for (let a = -40; a <= 40; a += 8) solids.push({ x: f.x + a, z: f.z - 40, r: 5 }, { x: f.x + a, z: f.z + 40, r: 5 }, { x: f.x - 40, z: f.z + a, r: 5 }, { x: f.x + 40, z: f.z + a, r: 5 }); }
  // returns push-out vector for a circle at (x, z) with radius r, or null
  function collide(x, z, r) {
    let px = 0, pz = 0, hit = false;
    const list = bgrid.get(key(Math.floor(x / BC), Math.floor(z / BC)));
    const check = b => {
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        hit = true;
        if (d > 1e-4) { px += dx / d * (r - d); pz += dz / d * (r - d); }
        else { // centre inside the box: push out the shortest way
          const o = [[x - b.x0, -1, 0], [b.x1 - x, 1, 0], [z - b.z0, 0, -1], [b.z1 - z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
          px += o[1] * (o[0] + r); pz += o[2] * (o[0] + r);
        }
      }
    };
    if (list) for (const idx of list) check(buildings[idx]);
    for (const s of solids) {
      const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
      if (d < s.r + r && d > 1e-4) { hit = true; px += dx / d * (s.r + r - d); pz += dz / d * (s.r + r - d); }
    }
    return hit ? { x: px, z: pz } : null;
  }

  // ---------------------------------------------------------------- signs ---
  const signs = [
    { x: 1640, z: -150, h: 0, en: 'Manara Bay', ar: 'خليج المنارة', sub: '↑ 2 km', kind: 'gantry', road: 'highway' },
    { x: 1625, z: 420, h: Math.PI, en: 'Al Rimal Circuit', ar: 'حلبة الرمال', sub: '↓ 3 km', kind: 'gantry' },
    { x: 1700, z: 610, h: Math.PI / 2, en: 'Jazirat Al Marsa', ar: 'جزيرة المرسى', sub: '→ Causeway', kind: 'gantry' },
    { x: -400, z: 0, h: -Math.PI / 2, en: 'Wadi Naft Field', ar: 'حقل وادي النفط', sub: '← 1.2 km', kind: 'gantry' },
    { x: 300, z: 0, h: Math.PI / 2, en: 'Ras Hadid', ar: 'رأس حديد', sub: 'Industrial Area', kind: 'gantry' },
    { x: 905, z: 600, h: Math.PI, en: 'Al Rimal Circuit', ar: 'حلبة الرمال الدولية', sub: '↓', kind: 'gantry' },
    { x: 900, z: -480, h: 0, en: 'Corniche', ar: 'الكورنيش', sub: '↑', kind: 'gantry' },
    { x: -260, z: -750, h: 0, en: 'Lulu Quarter', ar: 'حي اللؤلؤ', sub: '↑ Old Town', kind: 'post' },
    { x: 115, z: 30, h: 0, en: 'AFTERSHIFT', ar: 'أفترشفت', sub: 'Workshop', kind: 'shop' },
    { x: 434, z: -226, h: 0, en: 'Al-Sayed Parts', ar: 'قطع غيار السيد', sub: 'Salvage & spares', kind: 'shop' },
    { x: -120, z: -1198, h: 0, en: 'Qahwat Al Lulu', ar: 'قهوة اللؤلؤ', sub: 'Karak · Coffee', kind: 'shop' },
    { x: 1300, z: -918, h: 0, en: 'Bay Motors', ar: 'باي موتورز', sub: 'New & pre-owned', kind: 'shop' },
    { x: 560, z: 1180, h: 0, en: 'Al Rimal', ar: 'حلبة الرمال', sub: 'Paddock · Track days', kind: 'post' },
    { x: 1215, z: 2060, h: 0, en: 'Drag Nights', ar: 'ليالي السحب', sub: '19:00 – 03:00', kind: 'post' },
    { x: -300, z: 1625, h: 0, en: 'Desert Camp', ar: 'مخيم الصحراء', sub: 'Noor Qassim', kind: 'post' },
    { x: 2400, z: 620, h: 0, en: 'Marsa Boatyard', ar: 'مرفأ المرسى', sub: 'Dhow repairs', kind: 'shop' },
    { x: -1580, z: 690, h: 0, en: 'Staff Compound', ar: 'مجمع الموظفين', sub: 'Est. 1952', kind: 'post' },
  ];

  // ------------------------------------------------------------- events ---
  // desert run checkpoints: camp → lone tree → camp along the tracks
  const desertRun = [[-600, 1700], [-900, 1750], [-1200, 1760], [-1500, 1690], [-1240, 1880], [-900, 1750], [-300, 1700]];
  const spawn = { x: 100, z: 25, h: 0 };

  return {
    BOUNDS, ZONES, SURF, roads, circuit, drag, kingsRoad, places, place, landmarks, buildings, signs, desertRun, spawn,
    zoneAt, landDist, roadAt, roadsNear, roadDist, pointAt, surfaceAt, heightAt, collide, rng, coastN, coastE, ISLAND,
    grid: { HG, HW, HD, heights, roadMask },
  };
})();

if (typeof module !== 'undefined') module.exports = AS;
