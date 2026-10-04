// ============================================================================
// AFTERSHIFT 3D: the three.js scene. Ground and dunes, sea, roads, buildings,
// landmarks, props, car models, sky and the day-night cycle, particles and
// cameras. Optional: without three.js or WebGL the game uses render2d.js.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.R3 = (() => {
  const D = AS.DATA, W = AS.World, Sim = AS.Sim;
  let T, renderer, scene, camera, sun, hemi, sky, stars, seaMat, envRT, pmrem;
  let carGroup = null, playerCar = null, headL = null, floodLight, cityGlow;
  const animated = [], nightMats = [], lampMats = [], trafficPool = [], npcGroups = [], hiddenCars = {};
  let fx = null, markers = null, camMode = 0, camState = null, lastEnv = -1e9, ok = false;
  const tmpV = () => new T.Vector3();

  // ---------------------------------------------------------- utilities ---
  const rng = W.rng(99);
  function canvasTex(w, h, draw, rep, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) t.repeat.set(rep[0], rep[1]);
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function noise(ctx, w, h, base, amt, n, size) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = (rng() - 0.5) * amt;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      const s = size * (0.5 + rng());
      ctx.fillRect(rng() * w, rng() * h, s, s);
    }
  }
  // merge geometries (with transforms and optional vertex colours) into one
  function merge(parts) {
    let n = 0;
    const gs = parts.map(p => { let g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); if (p.m) g.applyMatrix4(p.m); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    gs.forEach((g, k) => {
      // vertex colours are authored in sRGB; the pipeline works in linear
      const c = parts[k].c ? parts[k].c.clone().convertSRGBToLinear() : { r: 1, g: 1, b: 1 }, cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += cnt;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  const M4 = () => new T.Matrix4();
  const at = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => M4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), new T.Vector3(sx, sy, sz));
  const col = hex => new T.Color(hex);
  // box with UVs in metres / unit so facade textures tile at a real scale
  function box(w, h, d, uu = 0, vu = 0, roofUV = true) {
    const g = new T.BoxGeometry(w, h, d);
    if (uu) {
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k; let u = uv.getX(i), v = uv.getY(i);
        if (f < 2) { u *= d / uu; v *= h / vu; }
        else if (f < 4) { if (roofUV) { u *= w / uu; v *= d / uu; } else { u = 0.01; v = 0.01; } }
        else { u *= w / uu; v *= h / vu; }
        uv.setXY(i, u, v);
      }
    }
    return g;
  }
  // a prism lofted between a floor polygon and a scaled, shifted roof polygon
  function loft(poly, h, topScale = 1, dx = 0, dz = 0, rings = 1, bend = 0) {
    // wind the outline so the faces point outwards whichever way it was drawn
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area > 0) poly = poly.slice().reverse();
    const pos = [], uvs = [];
    const ring = k => { const t = k / rings, s = 1 + (topScale - 1) * t, ox = dx * t + bend * Math.sin(t * Math.PI), oz = dz * t; return poly.map(p => [p[0] * s + ox, t * h, p[1] * s + oz]); };
    let perim = 0; const pl = [0];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; perim += Math.hypot(b[0] - a[0], b[1] - a[1]); pl.push(perim); }
    for (let k = 0; k < rings; k++) {
      const A = ring(k), B = ring(k + 1);
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const q = [A[i], A[j], B[j], B[i]];
        const tri = [[0, 1, 2], [0, 2, 3]];
        const u0 = pl[i] / 24, u1 = pl[i + 1] / 24, v0 = k / rings * h / 28.8, v1 = (k + 1) / rings * h / 28.8;
        const quv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        for (const t of tri) for (const idx of t) { pos.push(...q[idx]); uvs.push(...quv[idx]); }
      }
    }
    const top = ring(rings), c = top.reduce((a, p) => [a[0] + p[0] / top.length, a[1] + p[1] / top.length, a[2] + p[2] / top.length], [0, 0, 0]);
    for (let i = 0; i < top.length; i++) { const j = (i + 1) % top.length; pos.push(...c, ...top[i], ...top[j]); uvs.push(0.01, 0.01, 0.01, 0.01, 0.01, 0.01); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }
  function ellipse(rx, rz, n = 16) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([Math.cos(a) * rx, -Math.sin(a) * rz]); } return p; }

  // ------------------------------------------------------------ textures ---
  let TX = {};
  function makeTextures() {
    TX.sand = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, '#ffffff', 0.18, 5000, 2); for (let i = 0; i < 40; i++) { c.strokeStyle = 'rgba(0,0,0,0.05)'; c.beginPath(); const y = rng() * h; c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 8, 2 * w / 3, y - 8, w, y); c.stroke(); } });
    TX.asphalt = (lines) => canvasTex(256, 512, (c, w, h) => {
      noise(c, w, h, lines.base || '#3c3d40', 0.12, 9000, 2);
      c.fillStyle = 'rgba(255,255,255,0.03)'; for (let i = 0; i < 6; i++) c.fillRect(rng() * w, 0, 20 + rng() * 30, h);
      for (const L of lines.marks || []) {
        c.fillStyle = L.c || '#e8e6df';
        const x = L.u * w - (L.w || 6) / 2;
        if (L.dash) for (let y = 0; y < h; y += 128) c.fillRect(x, y, L.w || 6, 64);
        else c.fillRect(x, 0, L.w || 6, h);
      }
    }, null);
    TX.kerb = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#e9e9e9'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8202c'; c.fillRect(0, 0, w, h / 2); });
    TX.glass = canvasTex(256, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#a9bfcf'); g.addColorStop(1, '#6f8798'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(220,230,240,0.55)';
      for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h);
      for (let y = 0; y < h; y += 32) c.fillRect(0, y, w, 4);
    });
    TX.glassLit = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) if (rng() < 0.45) {
        const warm = rng() < 0.7; c.fillStyle = warm ? `rgba(255,${190 + rng() * 40 | 0},${120 + rng() * 50 | 0},${0.5 + rng() * 0.5})` : `rgba(180,210,255,${0.4 + rng() * 0.4})`;
        c.fillRect(x + 4, y + 5, 26, 25);
      }
    });
    TX.stucco = canvasTex(256, 256, (c, w, h) => {
      noise(c, w, h, '#ffffff', 0.1, 3000, 3);
      for (let x = 0; x < w; x += 64) for (let y = 0; y < h; y += 64) { c.fillStyle = '#3d4650'; c.fillRect(x + 18, y + 16, 28, 30); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + 18, y + 16, 28, 3); }
    });
    TX.stuccoLit = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) for (let y = 0; y < h; y += 64) if (rng() < 0.5) { c.fillStyle = `rgba(255,${200 + rng() * 40 | 0},140,1)`; c.fillRect(x + 18, y + 16, 28, 30); }
    });
    TX.coral = canvasTex(256, 256, (c, w, h) => {
      noise(c, w, h, '#ffffff', 0.25, 6000, 3);
      c.fillStyle = 'rgba(80,60,40,0.25)';
      for (let x = 0; x < w; x += 128) { c.fillRect(x + 50, 70, 26, 40); c.fillRect(x + 50, 190, 26, 40); }
      c.fillStyle = 'rgba(60,40,25,0.75)'; for (let x = 0; x < w; x += 128) { c.fillRect(x + 54, 74, 18, 32); c.fillRect(x + 54, 194, 18, 32); }
    });
    TX.coralLit = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffc070'; for (let x = 0; x < w; x += 128) { if (rng() < 0.5) c.fillRect(x + 54, 74, 18, 32); if (rng() < 0.4) c.fillRect(x + 54, 194, 18, 32); } });
    TX.metal = canvasTex(128, 128, (c, w, h) => { noise(c, w, h, '#ffffff', 0.08, 800, 2); for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, 0, 2, h); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x + 3, 0, 2, h); } });
    TX.slats = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#efe4c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#4b3a28'; for (let y = 6; y < h; y += 10) c.fillRect(8, y, w - 16, 5); });
    TX.leaf = canvasTex(128, 32, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, h / 2); for (let x = 0; x <= w; x += 6) { c.lineTo(x, h / 2 - (h / 2 - 1) * Math.sin(x / w * Math.PI) * (x % 12 ? 1 : 0.4)); } for (let x = w; x >= 0; x -= 6) { c.lineTo(x, h / 2 + (h / 2 - 1) * Math.sin(x / w * Math.PI) * (x % 12 ? 1 : 0.4)); } c.fill(); });
    TX.dot = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, null, false);
    TX.waterN = canvasTex(256, 256, (c, w, h) => {
      const img = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const f = (a, b) => Math.sin((x * a + y * b) / w * Math.PI * 2);
        const nx = 0.5 * f(3, 1) + 0.3 * f(-2, 5) + 0.2 * f(7, -3), ny = 0.5 * f(1, 4) + 0.3 * f(5, -2) + 0.2 * f(-6, 7);
        const i = (y * w + x) * 4; img.data[i] = 128 + nx * 50; img.data[i + 1] = 128 + ny * 50; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, [400, 400], false);
  }

  // ----------------------------------------------------------- materials ---
  let MT = {};
  function makeMaterials() {
    const std = (o) => new T.MeshStandardMaterial(o);
    MT.ground = std({ vertexColors: true, map: TX.sand, roughness: 0.95, metalness: 0 });
    MT.glass = std({ map: TX.glass, emissiveMap: TX.glassLit, emissive: col('#ffffff'), emissiveIntensity: 0, vertexColors: true, metalness: 0.45, roughness: 0.18, envMapIntensity: 1.4 });
    MT.stucco = std({ map: TX.stucco, emissiveMap: TX.stuccoLit, emissive: col('#ffffff'), emissiveIntensity: 0, vertexColors: true, roughness: 0.85 });
    MT.coral = std({ map: TX.coral, emissiveMap: TX.coralLit, emissive: col('#ffffff'), emissiveIntensity: 0, vertexColors: true, roughness: 0.95 });
    MT.metal = std({ map: TX.metal, vertexColors: true, roughness: 0.55, metalness: 0.4 });
    MT.plain = std({ vertexColors: true, roughness: 0.8 });
    MT.concrete = std({ color: col('#cfc8ba'), roughness: 0.9 });
    MT.dark = std({ color: col('#2a2b2e'), roughness: 0.7 });
    MT.chrome = std({ color: col('#dddddd'), metalness: 1, roughness: 0.18 });
    MT.slats = std({ map: TX.slats, roughness: 0.9 });
    MT.lamp = new T.MeshBasicMaterial({ color: col('#4a4a40') });
    MT.leaf = std({ map: TX.leaf, alphaTest: 0.5, side: T.DoubleSide, color: col('#55743a'), roughness: 0.8 });
    MT.trunk = std({ color: col('#7b6243'), roughness: 1 });
    MT.bush = std({ color: col('#6c7a45'), roughness: 1, flatShading: true });
    MT.fabric = std({ color: col('#efe7d6'), roughness: 1, side: T.DoubleSide });
    nightMats.push([MT.glass, 1.15], [MT.stucco, 1.0], [MT.coral, 0.9]);
    lampMats.push(MT.lamp);
  }

  // --------------------------------------------------------------- init ---
  function init(canvas) {
    T = window.THREE;
    if (!T) return false;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    scene.fog = new T.FogExp2(0xd9cdb5, 0.00042);
    camera = new T.PerspectiveCamera(62, 1, 0.3, 9000);
    pmrem = new T.PMREMGenerator(renderer);
    makeTextures(); makeMaterials();
    buildSky(); buildLights(); buildGround(); buildSea(); buildRoads(); buildBuildings(); buildLandmarks(); buildProps(); buildSigns(); buildFx(); buildMarkers();
    ok = true;
    return true;
  }
  function resize(w, h) { if (!ok) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  // ----------------------------------------------------------- sky + sun ---
  let skyU;
  function buildSky() {
    skyU = { top: { value: col('#2f74c6') }, hor: { value: col('#d9e6ee') }, sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: col('#fff2d0') }, glow: { value: 1 } };
    const m = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vW;
        void main(){ float y = max(vW.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.55));
          float d = max(dot(normalize(vW), normalize(sunDir)), 0.0);
          c += sunCol * (pow(d, 900.0) * 6.0 + pow(d, 12.0) * 0.35 * glow + pow(d, 3.0) * 0.12 * glow);
          if (vW.y < 0.0) c = mix(hor, hor * 0.7, min(-vW.y * 4.0, 1.0));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    sky = new T.Mesh(new T.SphereGeometry(8000, 32, 16), m);
    sky.renderOrder = -1;
    scene.add(sky);
    const sp = [];
    for (let i = 0; i < 1500; i++) { const a = rng() * Math.PI * 2, e = Math.asin(rng() * 0.95 + 0.05); sp.push(Math.cos(a) * Math.cos(e) * 7500, Math.sin(e) * 7500, Math.sin(a) * Math.cos(e) * 7500); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
  }
  function buildLights() {
    hemi = new T.HemisphereLight(0xcfe3ff, 0xc9a77a, 0.6); scene.add(hemi);
    sun = new T.DirectionalLight(0xfff2d8, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 900;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(sun); scene.add(sun.target);
    floodLight = new T.DirectionalLight(0xf4f7ff, 0); floodLight.position.set(700, 400, 1500); floodLight.target.position.set(700, 0, 1600); scene.add(floodLight); scene.add(floodLight.target);
    cityGlow = new T.HemisphereLight(0xffc98a, 0x553a22, 0); scene.add(cityGlow);
  }

  // time of day keyframes: hour → sky top, horizon, sun colour, sun power, ambient, fog
  const KEYS = [
    [0, '#04070f', '#141b2e', '#8aa0ff', 0.10, 0.16, '#101626'],
    [4.8, '#060b1a', '#1d2440', '#8aa0ff', 0.10, 0.16, '#141a2c'],
    [5.7, '#1b2c55', '#d07a5a', '#ff9a60', 0.35, 0.3, '#5a4a52'],
    [6.6, '#3d6fae', '#f2c495', '#ffcf98', 1.3, 0.5, '#d9bfa0'],
    [9, '#3a7dc8', '#dfe5e6', '#fff1dc', 1.9, 0.5, '#dcd3c2'],
    [13, '#2f74c6', '#e2e6e4', '#fff6e8', 2.1, 0.52, '#e0d8c8'],
    [16.3, '#3a73b8', '#f1d6ac', '#ffe1b6', 1.8, 0.48, '#e4cfae'],
    [17.6, '#35558f', '#ff9d58', '#ff9145', 1.3, 0.42, '#e9aa78'],
    [18.25, '#26305e', '#f07454', '#ff6a35', 0.6, 0.38, '#b0705e'],
    [18.9, '#121a3a', '#5c3a58', '#ff6a35', 0.12, 0.24, '#3a2c3c'],
    [19.8, '#070b1c', '#1c2340', '#8aa0ff', 0.1, 0.17, '#141a2c'],
    [24, '#04070f', '#141b2e', '#8aa0ff', 0.10, 0.16, '#101626'],
  ];
  function lerpKey(h) {
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = (h - A[0]) / (B[0] - A[0] || 1);
    const c = k => col(A[k]).lerp(col(B[k]), t);
    return { top: c(1), hor: c(2), sun: c(3), power: A[4] + (B[4] - A[4]) * t, amb: A[5] + (B[5] - A[5]) * t, fog: c(6) };
  }
  let night = 0;
  function setTime(h, focus) {
    const K = lerpKey(h);
    // sun path: rises in the east (+x), sets in the west, a little to the south
    const ang = (h - 6.1) / 12.4 * Math.PI;
    const el = Math.sin(ang), dir = new T.Vector3(Math.cos(ang), Math.max(el, -0.3) * 1.15, 0.38).normalize();
    const moon = el < -0.05;
    const L = moon ? new T.Vector3(-0.4, 0.8, -0.3).normalize() : dir;
    night = Math.max(0, Math.min(1, (0.12 - el) / 0.22));
    skyU.top.value.copy(K.top); skyU.hor.value.copy(K.hor); skyU.sunDir.value.copy(dir); skyU.sunCol.value.copy(K.sun).multiplyScalar(moon ? 0 : 1); skyU.glow.value = 1 - night * 0.8;
    sun.color.copy(K.sun); sun.intensity = K.power * (moon ? 1 : 1);
    sun.position.set(focus.x + L.x * 400, L.y * 400, focus.z + L.z * 400); sun.target.position.set(focus.x, 0, focus.z);
    hemi.intensity = K.amb * 1.25; hemi.color.copy(K.top).lerp(col('#ffffff'), 0.5); hemi.groundColor.copy(K.hor).lerp(col('#c9a77a'), 0.5);
    scene.fog.color.copy(K.fog); scene.fog.density = 0.00032 + night * 0.00018;
    stars.material.opacity = night * 0.9;
    renderer.toneMappingExposure = 0.95 + night * 0.25;
    nightMats.forEach(([m, k]) => { m.emissiveIntensity = night * k; });
    lampMats.forEach(m => m.color.setRGB(0.3 + night * 2.2, 0.3 + night * 1.8, 0.25 + night * 1.1));
    // floodlit circuit, glowing city
    const dc = Math.hypot(focus.x - 700, focus.z - 1600), dCity = Math.hypot(focus.x - 900, focus.z - 1000);
    floodLight.intensity = night * 0.9 * Math.max(0, 1 - dc / 1300);
    cityGlow.intensity = night * 0.3 * Math.max(0.25, 1 - dCity / 1800);
    if (headL) headL.intensity = night > 0.3 ? 2.6 : 0;
    // refresh reflections every few game minutes
    if (Math.abs(h - lastEnv) > 0.25) { lastEnv = h; updateEnv(); }
    seaMat.color.copy(col('#23798f')).lerp(K.hor, 0.18).multiplyScalar(1 - night * 0.6);
  }
  function updateEnv() {
    const s = new T.Scene();
    s.add(sky.clone());
    const g = new T.Mesh(new T.CircleGeometry(7000, 16), new T.MeshBasicMaterial({ color: scene.fog.color.clone().multiplyScalar(0.8) }));
    g.rotation.x = -Math.PI / 2; g.position.y = -50; s.add(g);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(s, 0.02);
    scene.environment = envRT.texture;
  }

  // -------------------------------------------------------------- ground ---
  const GROUND = {
    desert: '#d6b98a', oilfield: '#c8a676', circuit: '#d8bf94', island: '#e0cba0', city: '#9d968a', oldtown: '#bba985', industrial: '#8c8579', sea: '#c7ad80',
  };
  function buildGround() {
    const { HG, HW, HD, heights } = W.grid, B = W.BOUNDS;
    const geo = new T.PlaneGeometry((HW - 1) * HG, (HD - 1) * HG, HW - 1, HD - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(B.x0 + (HW - 1) * HG / 2, 0, B.z0 + (HD - 1) * HG / 2);
    const pos = geo.attributes.position, colr = new Float32Array(pos.count * 3), uv = geo.attributes.uv;
    const c = new T.Color(), c2 = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const gi = Math.round((x - B.x0) / HG), gj = Math.round((z - B.z0) / HG);
      const h = heights[gj * HW + gi];
      pos.setY(i, h);
      let zone = W.zoneAt(x, z);
      c.set(GROUND[zone] || GROUND.desert);
      const ld = W.landDist(x, z);
      if (ld < 0) c.lerp(c2.set('#0f4b5c'), Math.min(1, -ld / 120));
      else if (ld < 30) c.lerp(c2.set('#efe0bd'), 1 - ld / 30);   // pale beach
      if (zone === 'desert' || zone === 'oilfield') {
        const n = Math.sin(x * 0.013 + z * 0.007) * 0.5 + Math.sin(x * 0.041 - z * 0.023) * 0.25;
        c.offsetHSL(0.005 * n, 0.04 * n, 0.04 * n + h * 0.004);
      }
      c.convertSRGBToLinear();
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
      uv.setXY(i, x / 9, z / 9);
    }
    geo.setAttribute('color', new T.BufferAttribute(colr, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, MT.ground);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  function buildSea() {
    seaMat = new T.MeshStandardMaterial({ color: col('#23798f'), roughness: 0.06, metalness: 0.15, normalMap: TX.waterN, normalScale: new T.Vector2(0.35, 0.35), transparent: true, opacity: 0.9 });
    const sea = new T.Mesh(new T.PlaneGeometry(20000, 20000), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(1000, -0.45, 0);
    scene.add(sea);
    animated.push(t => { TX.waterN.offset.set(t * 0.004, t * 0.0025); });
  }

  // --------------------------------------------------------------- roads ---
  const ROADLOOK = {
    highway:  { base: '#38393c', marks: [{ u: 0.04 }, { u: 0.96 }, { u: 0.27, dash: 1 }, { u: 0.73, dash: 1 }, { u: 0.49, c: '#e0b23a', w: 5 }, { u: 0.51, c: '#e0b23a', w: 5 }] },
    causeway: { base: '#3b3c3f', marks: [{ u: 0.04 }, { u: 0.96 }, { u: 0.5, dash: 1 }] },
    boulevard:{ base: '#3e3f42', marks: [{ u: 0.05 }, { u: 0.95 }, { u: 0.48, w: 4 }, { u: 0.52, w: 4 }, { u: 0.27, dash: 1 }, { u: 0.73, dash: 1 }] },
    street:   { base: '#424346', marks: [{ u: 0.06 }, { u: 0.94 }, { u: 0.5, dash: 1 }] },
    lane:     { base: '#8d8270', marks: [] },
    track:    { base: '#c9ad80', marks: [] },
    circuit:  { base: '#323336', marks: [{ u: 0.035, w: 8 }, { u: 0.965, w: 8 }] },
    pit:      { base: '#4a4b4f', marks: [{ u: 0.05 }, { u: 0.95 }] },
    drag:     { base: '#2d2e30', marks: [{ u: 0.04 }, { u: 0.5, w: 4 }, { u: 0.96 }] },
  };
  const ROADY = { circuit: 0.07, drag: 0.07, highway: 0.06, causeway: 0.06, boulevard: 0.055, street: 0.05, pit: 0.05, lane: 0.045, track: 0.03 };
  function ribbon(pts, closed, w, y, uvLen, offset = 0, follow = false) {
    const pos = [], uvs = [], n = pts.length, segs = closed ? n : n - 1;
    let s = 0;
    const P = i => pts[(i + n) % n];
    const side = i => {
      const a = closed ? P(i - 1) : P(Math.max(0, i - 1)), b = closed ? P(i + 1) : P(Math.min(n - 1, i + 1));
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      return [-dz / L, dx / L];
    };
    for (let i = 0; i < segs; i++) {
      const a = P(i), b = P(i + 1), na = side(i), nb = side(i + 1);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const o0 = offset - w / 2, o1 = offset + w / 2;
      const ya = follow ? Math.max(0, W.heightAt(a[0], a[1])) + y : y, yb = follow ? Math.max(0, W.heightAt(b[0], b[1])) + y : y;
      const A0 = [a[0] + na[0] * o0, ya, a[1] + na[1] * o0], A1 = [a[0] + na[0] * o1, ya, a[1] + na[1] * o1];
      const B0 = [b[0] + nb[0] * o0, yb, b[1] + nb[1] * o0], B1 = [b[0] + nb[0] * o1, yb, b[1] + nb[1] * o1];
      const v0 = s / uvLen, v1 = (s + L) / uvLen;
      pos.push(...A0, ...B1, ...B0, ...A0, ...A1, ...B1);
      uvs.push(0, v0, 1, v1, 0, v1, 0, v0, 1, v0, 1, v1);
      s += L;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }
  function buildRoads() {
    const byType = {};
    W.roads.forEach(r => { (byType[r.type] = byType[r.type] || []).push(r); });
    for (const [type, list] of Object.entries(byType)) {
      const tex = TX.asphalt(ROADLOOK[type]);
      const mat = new T.MeshStandardMaterial({ map: tex, roughness: type === 'track' ? 1 : 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 - (ROADY[type] * 40 | 0), polygonOffsetUnits: -2 });
      const geos = list.map(r => ({ g: ribbon(r.pts, r.closed, r.w, ROADY[type], r.w * 1.6) }));
      const mesh = new T.Mesh(merge(geos), mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    // circuit kerbs where the corner is tight
    const c = W.circuit, n = c.pts.length, kerbs = [];
    for (let i = 0; i < n; i++) {
      const a = c.pts[(i - 4 + n) % n], b = c.pts[i], d = c.pts[(i + 4) % n];
      const cr = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
      const k = cr / (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(d[0] - b[0], d[1] - b[1]) * Math.hypot(d[0] - a[0], d[1] - a[1]) / 2 + 1e-6);
      if (Math.abs(k) > 1 / 140) {
        const j = (i + 1) % n, seg = [c.pts[i], c.pts[j]];
        const inside = k > 0 ? 1 : -1;
        kerbs.push({ g: ribbon(seg, false, 1.4, 0.085, 3, inside * (c.w / 2 + 0.5)) }, { g: ribbon(seg, false, 1.0, 0.085, 3, -inside * (c.w / 2 + 0.4)) });
      }
    }
    if (kerbs.length) scene.add(new T.Mesh(merge(kerbs), new T.MeshStandardMaterial({ map: TX.kerb, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })));
    // start/finish line and grid boxes
    const p0 = W.pointAt(c, 0), ang = Math.atan2(p0.dx, p0.dz);
    const chk = canvasTex(128, 16, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); } });
    const line = new T.Mesh(new T.PlaneGeometry(c.w, 1.6), new T.MeshBasicMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -8 }));
    line.rotation.x = -Math.PI / 2; line.rotation.z = ang + Math.PI / 2; line.position.set(p0.x, 0.1, p0.z); scene.add(line);
    // causeway parapets and piers
    const bar = [];
    W.roads.forEach(r => {
      if (r.type === 'causeway') {
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
          const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          for (const sd of [-1, 1]) bar.push({ g: box(0.4, 1.0, L + 0.2), m: at(mx + nx * sd * (r.w / 2 + 0.3), 0.5, mz + nz * sd * (r.w / 2 + 0.3), ry) });
          bar.push({ g: box(r.w + 2, 0.8, L + 0.3), m: at(mx, -0.35, mz, ry) });
          if (i % 3 === 0) bar.push({ g: box(3, 5, 3), m: at(mx, -2.6, mz, ry) });
        }
      }
    });
    const bm = new T.Mesh(merge(bar), new T.MeshStandardMaterial({ vertexColors: true, color: col('#d8d2c6'), roughness: 0.85 }));
    bm.castShadow = true; bm.receiveShadow = true; scene.add(bm);
  }

  // ----------------------------------------------------------- buildings ---
  function buildBuildings() {
    const glass = [], stucco = [], coral = [], metal = [], plain = [], slats = [], fabric = [];
    const glassTints = ['#9fc4d8', '#b7d2c8', '#d8c7a2', '#a8b8cf', '#c9d6dc', '#86a9bf'];
    W.buildings.forEach(b => {
      if (b.hidden) return;   // drawn with the shelters
      const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, h = b.h;
      const t = b.tint;
      if (b.kind === 'tower') {
        const tint = col(glassTints[(t * glassTints.length) | 0]);
        const stepped = t > 0.55, h1 = stepped ? h * 0.62 : h;
        glass.push({ g: box(w, h1, d, 24, 28.8, false), m: at(cx, h1 / 2, cz), c: tint });
        if (stepped) glass.push({ g: box(w * 0.7, h - h1, d * 0.7, 24, 28.8, false), m: at(cx, h1 + (h - h1) / 2, cz), c: tint });
        plain.push({ g: box(w * (stepped ? 0.72 : 1.02), 2, d * (stepped ? 0.72 : 1.02)), m: at(cx, h + 1, cz), c: col('#d9d6cf') });
        if (t < 0.3) plain.push({ g: box(1, 18, 1), m: at(cx, h + 10, cz), c: col('#cccccc') });   // mast
        if (t > 0.8) plain.push({ g: new T.CylinderGeometry(w * 0.35, w * 0.35, 1.5, 20), m: at(cx, h + 2, cz), c: col('#5a6a5a') });   // helipad
        plain.push({ g: box(w + 4, 5, d + 4), m: at(cx, 2.5, cz), c: col('#e8e1d2') });   // podium
      } else if (b.kind === 'midrise') {
        stucco.push({ g: box(w, h, d, 9, 9, false), m: at(cx, h / 2, cz), c: col(['#f1ebdf', '#e8dcc6', '#f4f1ea', '#dcd3c0'][(t * 4) | 0]) });
        plain.push({ g: box(w + 0.6, 1.2, d + 0.6), m: at(cx, h + 0.6, cz), c: col('#e9e2d4') });
        for (let k = 0; k < 3; k++) plain.push({ g: box(2.4, 1.6, 2.4), m: at(cx + (k - 1) * w * 0.25, h + 0.8, cz + (t - 0.5) * d * 0.4), c: col('#b9b9b4') });
      } else if (b.kind === 'house') {
        const cc = col(['#ead9b8', '#e2cfa8', '#f0e4cb', '#dccaa3'][(t * 4) | 0]);
        coral.push({ g: box(w, h, d, 8, 8, false), m: at(cx, h / 2, cz), c: cc });
        // parapet with a stepped crenellation
        for (let k = 0; k < 4; k++) coral.push({ g: box(k % 2 ? 0.4 : w, 0.9, k % 2 ? d : 0.4), m: at(cx + (k === 1 ? w / 2 : k === 3 ? -w / 2 : 0), h + 0.45, cz + (k === 0 ? d / 2 : k === 2 ? -d / 2 : 0)), c: cc });
        if (b.windtower) {
          const s = 2.6, th = 6;
          coral.push({ g: box(s, th, s, 8, 8, false), m: at(cx + w * 0.25, h + th / 2, cz), c: cc });
          for (let k = 0; k < 4; k++) slats.push({ g: box(k % 2 ? 0.1 : s * 0.8, th * 0.55, k % 2 ? s * 0.8 : 0.1), m: at(cx + w * 0.25 + (k === 1 ? s / 2 + 0.02 : k === 3 ? -s / 2 - 0.02 : 0), h + th * 0.62, cz + (k === 0 ? s / 2 + 0.02 : k === 2 ? -s / 2 - 0.02 : 0)) });
        }
      } else if (b.kind === 'warehouse' || b.kind === 'shed') {
        const cc = col(['#c9cdd1', '#b8c3cc', '#d4cdbd', '#a9b4a8', '#e0ddd5'][(t * 5) | 0]);
        metal.push({ g: box(w, h, d, 4, 4, false), m: at(cx, h / 2, cz), c: cc });
        plain.push({ g: new T.CylinderGeometry(0.01, Math.hypot(w, 0) * 0.02 + 0.01, 0.1, 3), m: at(cx, h, cz), c: cc });
        // roller doors on the side facing the nearest road
        const rd = W.roadAt(cx, cz - d / 2 - 12, 10) ? -1 : 1;
        for (let k = 0; k < Math.max(1, (w / 9) | 0); k++) plain.push({ g: box(5, 5, 0.3), m: at(b.x0 + 5 + k * 9, 2.5, cz + rd * (d / 2 + 0.05)), c: col('#8d9399') });
      } else if (b.kind === 'bungalow') {
        stucco.push({ g: box(w, h, d, 9, 9, false), m: at(cx, h / 2, cz), c: col('#f4efe2') });
        plain.push({ g: box(w + 1.2, 0.35, d + 1.2), m: at(cx, h + 0.15, cz), c: col('#8a7a62') });
      } else if (b.kind === 'pits') {
        stucco.push({ g: box(w, 4.5, d, 9, 9, false), m: at(cx, 2.25, cz), c: col('#e9e9ea') });
        glass.push({ g: box(w, h - 4.5, d, 24, 28.8, false), m: at(cx, 4.5 + (h - 4.5) / 2, cz), c: col('#9fb8cc') });
        plain.push({ g: box(w + 2, 0.6, d + 6), m: at(cx, h + 0.3, cz + 1), c: col('#f2f2f2') });
        for (let x = b.x0 + 6; x < b.x1 - 4; x += 12) plain.push({ g: box(8, 3.8, 0.2), m: at(x, 2, b.z1 + 0.1), c: col('#2a2d33') });
      } else if (b.kind === 'grandstand') {
        const along = b.alongZ, len = along ? d : w, dep = along ? w : d;
        const rows = 8;
        for (let k = 0; k < rows; k++) {
          const y = 1 + k * (h - 3) / rows, off = (k / rows - 0.5) * dep * 0.85 * (b.face || 1);
          plain.push({ g: along ? box(dep / rows + 0.2, 1, len) : box(len, 1, dep / rows + 0.2), m: at(cx + (along ? -off : 0), y, cz + (along ? 0 : -off)), c: col(k % 2 ? '#c8202c' : '#e9e9e9') });
        }
        plain.push({ g: along ? box(dep + 2, 0.4, len + 2) : box(len + 2, 0.4, dep + 2), m: at(cx, h + 2, cz), c: col('#f1f1f1') });
        for (let k = 0; k <= 6; k++) { const s = (k / 6 - 0.5) * len; plain.push({ g: box(0.4, h + 2, 0.4), m: at(cx + (along ? dep / 2 : s), (h + 2) / 2, cz + (along ? s : dep / 2)), c: col('#cfcfcf') }); }
      }
    });
    const add = (list, mat) => { if (!list.length) return; const m = new T.Mesh(merge(list), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    add(glass, MT.glass); add(stucco, MT.stucco); add(coral, MT.coral); add(metal, MT.metal); add(plain, MT.plain); add(slats, MT.slats); add(fabric, MT.fabric);
  }

  // ----------------------------------------------------------- landmarks ---
  function buildLandmarks() {
    const glass = [], plain = [], coral = [], fabric = [], metal = [];
    W.landmarks.forEach(l => {
      const { x, z } = l;
      if (l.kind === 'twintowers') {
        // two sail-shaped towers joined by three sky bridges carrying wind turbines
        const sail = [[-20, 18], [14, 22], [22, 0], [14, -22], [-20, -18], [-10, 0]];
        for (const sd of [-1, 1]) {
          const poly = sail.map(p => [p[0] * sd, p[1]]);
          glass.push({ g: loft(poly, 240, 0.35, -sd * 6, 0, 10), m: at(x + sd * 32, 0, z), c: col('#b9d0dc') });
        }
        for (const y of [60, 120, 180]) {
          plain.push({ g: box(44, 3, 4), m: at(x, y, z), c: col('#d7dde0') });
          const rotor = new T.Group(); rotor.position.set(x, y, z + 3);
          for (let k = 0; k < 3; k++) { const bl = new T.Mesh(box(1.4, 14, 0.4), MT.concrete); bl.position.y = 7; const arm = new T.Group(); arm.rotation.z = k * Math.PI * 2 / 3; arm.add(bl); rotor.add(arm); }
          scene.add(rotor);
          animated.push(t => { rotor.rotation.z = t * 0.9; });
        }
        plain.push({ g: box(120, 8, 60), m: at(x, 4, z), c: col('#ece5d6') });
      } else if (l.kind === 'sailtower') {
        glass.push({ g: loft(ellipse(26, 18, 18), 200, 0.15, 10, 0, 12, -14), m: at(x, 0, z), c: col('#cfdde6') });
        plain.push({ g: new T.CylinderGeometry(30, 34, 10, 24), m: at(x, 5, z), c: col('#efe9dc') });
      } else if (l.kind === 'fort') {
        const cc = col('#d9c49c');
        for (const [dx, dz, w, d] of [[0, -40, 80, 4], [0, 40, 80, 4], [-40, 0, 4, 80], [40, 0, 4, 80]]) {
          coral.push({ g: box(w, 9, d, 8, 8, false), m: at(x + dx, 4.5, z + dz), c: cc });
          const len = Math.max(w, d);
          for (let k = -len / 2 + 2; k < len / 2; k += 4) coral.push({ g: box(w > d ? 2 : 4.4, 1.6, w > d ? 4.4 : 2), m: at(x + dx + (w > d ? k : 0), 9.8, z + dz + (w > d ? 0 : k)), c: cc });
        }
        for (const [dx, dz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
          coral.push({ g: new T.CylinderGeometry(7, 8, 13, 20), m: at(x + dx, 6.5, z + dz), c: cc });
          coral.push({ g: new T.CylinderGeometry(7.4, 7.4, 1.4, 20), m: at(x + dx, 13.5, z + dz), c: cc });
        }
        coral.push({ g: box(22, 15, 18, 8, 8, false), m: at(x, 7.5, z), c: cc });   // keep
      } else if (l.kind === 'mosque') {
        const cc = col('#f2ede2');
        coral.push({ g: box(26, 9, 26, 8, 8, false), m: at(x, 4.5, z), c: cc });
        plain.push({ g: new T.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m: at(x, 9, z), c: col('#e8e2d2') });
        plain.push({ g: new T.CylinderGeometry(8.2, 8.2, 1.2, 24), m: at(x, 9.6, z), c: cc });
        const mx = x + 17, mz = z - 13;
        plain.push({ g: new T.CylinderGeometry(1.8, 2.2, 34, 12), m: at(mx, 17, mz), c: cc });
        plain.push({ g: new T.CylinderGeometry(2.8, 2.4, 1.6, 12), m: at(mx, 27, mz), c: cc });
        plain.push({ g: new T.CylinderGeometry(1.3, 1.6, 4, 12), m: at(mx, 36, mz), c: cc });
        plain.push({ g: new T.ConeGeometry(1.6, 4.5, 12), m: at(mx, 40.2, mz), c: col('#c9b37a') });
      } else if (l.kind === 'lonetree') {
        const tr = new T.Group(); tr.position.set(x, W.heightAt(x, z), z);
        const trunk = new T.Mesh(new T.CylinderGeometry(0.9, 1.6, 6, 8), MT.trunk); trunk.position.y = 3; trunk.rotation.z = 0.15; tr.add(trunk);
        for (let k = 0; k < 5; k++) { const br = new T.Mesh(new T.CylinderGeometry(0.35, 0.7, 7, 6), MT.trunk); const a = k / 5 * Math.PI * 2; br.position.set(Math.cos(a) * 2.5, 6.4, Math.sin(a) * 2.5); br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); tr.add(br); }
        const leafM = new T.MeshStandardMaterial({ color: col('#4f6b34'), roughness: 1, flatShading: true });
        for (let k = 0; k < 14; k++) { const a = rng() * Math.PI * 2, r = rng() * 7; const bl = new T.Mesh(new T.IcosahedronGeometry(2.6 + rng() * 2, 0), leafM); bl.position.set(Math.cos(a) * r, 8.5 + rng() * 2.5, Math.sin(a) * r); bl.scale.y = 0.55; bl.castShadow = true; tr.add(bl); }
        trunk.castShadow = true; scene.add(tr);
      } else if (l.kind === 'circuittower') {
        plain.push({ g: new T.CylinderGeometry(3, 4.5, 48, 16), m: at(x, 24, z), c: col('#e6e6e6') });
        glass.push({ g: loft(ellipse(11, 9, 20), 9, 1.25, 0, 0, 1), m: at(x, 48, z), c: col('#a8c4d6') });
        plain.push({ g: new T.CylinderGeometry(15, 13, 1.5, 24), m: at(x, 58, z), c: col('#f4f4f4') });
        // the tower's signature sail canopy
        plain.push({ g: loft([[-1, -12], [1, -12], [1, 12], [-1, 12]], 22, 0.3, 0, 0, 4, 6), m: at(x, 58, z), c: col('#f2f2f2') });
      } else if (l.kind === 'carpark') {
        const cc = col('#c9c3b6');
        for (let lv = 0; lv < 4; lv++) plain.push({ g: box(70, 0.5, 60), m: at(x, 3.6 + lv * 3.4, z), c: cc });
        for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j += 2) if (!(i === 0 && j === 2)) plain.push({ g: box(0.7, 3.6 + 3 * 3.4, 0.7), m: at(x + i * 10, (3.6 + 3 * 3.4) / 2, z + j * 12), c: cc });
        for (const sd of [-1, 1]) plain.push({ g: box(70, 1.1, 0.3), m: at(x, 4.4 + 3.4, z + sd * 30), c: col('#e8e2d6') });
      } else if (l.kind === 'pumpstation') {
        for (let k = 0; k < 3; k++) metal.push({ g: new T.CylinderGeometry(6, 6, 9, 20), m: at(x + 20 + k * 14, 4.5, z + 22), c: col('#d5d0c4') });
        for (let k = 0; k < 3; k++) metal.push({ g: new T.CylinderGeometry(0.6, 0.6, 250, 8), m: M4().makeRotationX(Math.PI / 2).premultiply(at(x - 20 - k * 3, 1, z - 165)), c: col('#8c8a80') });
      } else if (l.kind === 'wintercamp') {
        for (let k = 0; k < 3; k++) fabric.push({ g: new T.ConeGeometry(4, 3, 4, 1, true), m: at(x - 20 + k * 11, W.heightAt(x, z) + 1.5, z - 18, Math.PI / 4), c: col('#a58f6c') });
      }
    });
    const add = (list, mat) => { if (!list.length) return; const m = new T.Mesh(merge(list), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); };
    add(glass, MT.glass); add(plain, MT.plain); add(coral, MT.coral); add(fabric, MT.fabric); add(metal, MT.metal);
    buildShelters();
  }
  // shelters over the hidden cars
  function buildShelters() {
    const plain = [], metal = [];
    Object.entries(D.LEADS).forEach(([id, L]) => {
      const s = L.spot, base = at(s.x, 0, s.z, -s.h);
      const place = (g, dx, dy, dz, c, list) => list.push({ g, m: base.clone().multiply(at(dx, dy, dz)), c });
      if (L.shelter === 'garage' || L.shelter === 'shed') {
        const big = L.shelter === 'shed', w = big ? 9 : 6.5, d = big ? 12 : 8, h = big ? 5.5 : 3.6;
        const cc = col(big ? '#b9b2a2' : '#e9e1cf');
        const list = big ? metal : plain;
        place(box(0.3, h, d), -w / 2, h / 2, 0, cc, list); place(box(0.3, h, d), w / 2, h / 2, 0, cc, list);
        place(box(w, h, 0.3), 0, h / 2, d / 2, cc, list);   // back wall (car faces the open front)
        place(box(w + 0.6, 0.3, d + 0.6), 0, h + 0.15, 0, col('#8f8676'), plain);
      } else if (L.shelter === 'canopy') {
        for (const [dx, dz] of [[-4, -5], [4, -5], [-4, 5], [4, 5]]) place(box(0.25, 3.2, 0.25), dx, 1.6, dz, col('#dddddd'), plain);
        place(box(9, 0.15, 11), 0, 3.3, 0, col('#f5f2ea'), plain);
      }
    });
    if (plain.length) { const m = new T.Mesh(merge(plain), MT.plain); m.castShadow = m.receiveShadow = true; scene.add(m); }
    if (metal.length) { const m = new T.Mesh(merge(metal), MT.metal); m.castShadow = m.receiveShadow = true; scene.add(m); }
  }

  // --------------------------------------------------------------- props ---
  function palmGeo() {
    const fr = [];
    for (let k = 0; k < 10; k++) {
      const g = new T.PlaneGeometry(5.2, 1.1, 4, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const xx = p.getX(i) + 2.6; p.setY(i, p.getY(i)); p.setZ(i, -0.06 * xx * xx); p.setX(i, xx); }
      g.computeVertexNormals();
      fr.push({ g, m: M4().makeRotationY(k / 10 * Math.PI * 2).multiply(M4().makeRotationX(-0.25 + (k % 2) * 0.35)) });
    }
    return merge(fr);
  }
  function scatter(list, mesh) {
    const im = new T.InstancedMesh(mesh.g, mesh.mat, list.length);
    list.forEach((p, i) => im.setMatrixAt(i, at(p[0], p[1], p[2], p[3] || 0, p[4] || 1, p[5] || p[4] || 1, p[4] || 1)));
    im.castShadow = mesh.shadow !== false; im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  function buildProps() {
    const palms = [], lamps = [], bushes = [], pumps = [], rocks = [];
    // palms: corniche, boulevards, old town, paddock, camp, island
    W.roads.forEach(r => {
      if (r.type === 'boulevard' || (r.type === 'highway' && r.name === 'Coastal Highway')) {
        for (let s = 10; s < r.len; s += r.type === 'boulevard' ? 22 : 45) {
          const p = W.pointAt(r, s);
          for (const sd of r.type === 'boulevard' ? [-1, 1] : [1]) {
            const x = p.x - p.dz * sd * (r.w / 2 + 3), z = p.z + p.dx * sd * (r.w / 2 + 3);
            if (!W.roadAt(x, z, 1) && !W.collide(x, z, 1.5)) palms.push([x, W.heightAt(x, z), z, rng() * 6, 0.85 + rng() * 0.35]);
          }
        }
      }
      // street lights
      if (['highway', 'boulevard', 'street', 'causeway', 'pit'].includes(r.type)) {
        const step = r.type === 'street' ? 40 : 34;
        for (let s = 0; s < r.len; s += step) {
          const p = W.pointAt(r, s), sd = (Math.floor(s / step) % 2) ? 1 : -1;
          const off = r.type === 'highway' ? 0 : sd * (r.w / 2 + 1.2);
          const x = p.x - p.dz * off, z = p.z + p.dx * off;
          if (r.type !== 'highway' && W.roadAt(x, z, 0)) continue;
          lamps.push([x, 0, z, Math.atan2(p.dx, p.dz) + (r.type === 'highway' ? 0 : sd * Math.PI / 2)]);
        }
      }
    });
    W.places.forEach(p => { for (let k = 0; k < 6; k++) { const a = rng() * Math.PI * 2, r = p.r + 6 + rng() * 14, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!W.roadAt(x, z, 2) && !W.collide(x, z, 2)) palms.push([x, W.heightAt(x, z), z, rng() * 6, 0.8 + rng() * 0.4]); } });
    for (let k = 0; k < 160; k++) { const x = -950 + rng() * 1270, z = -1430 + rng() * 480; if (!W.roadAt(x, z, 2) && !W.collide(x, z, 3)) palms.push([x, 0, z, rng() * 6, 0.7 + rng() * 0.5]); }
    for (let k = 0; k < 80; k++) { const a = rng() * Math.PI * 2, r = rng() * 220, x = W.ISLAND.x + Math.cos(a) * r, z = W.ISLAND.z + Math.sin(a) * r; if (W.landDist(x, z) > 8 && !W.roadAt(x, z, 2)) palms.push([x, W.heightAt(x, z), z, rng() * 6, 0.8 + rng() * 0.4]); }
    // desert scrub and rocks
    for (let k = 0; k < 2600; k++) {
      const x = W.BOUNDS.x0 + rng() * (W.BOUNDS.x1 - W.BOUNDS.x0), z = -200 + rng() * 2500;
      const zn = W.zoneAt(x, z);
      if ((zn === 'desert' || zn === 'oilfield') && !W.roadAt(x, z, 3)) (rng() < 0.8 ? bushes : rocks).push([x, W.heightAt(x, z) - 0.2, z, rng() * 6, 0.6 + rng() * 1.2]);
    }
    // oil pumps across the field
    for (let k = 0; k < 40 && pumps.length < 26; k++) {
      const x = -2100 + rng() * 1100, z = 100 + rng() * 1100;
      if (!W.roadAt(x, z, 25) && !W.collide(x, z, 6) && Math.hypot(x + 1560, z - 780) > 200) pumps.push([x, W.heightAt(x, z), z, rng() * 6]);
    }
    const palmTrunk = new T.CylinderGeometry(0.22, 0.38, 9, 6); palmTrunk.translate(0, 4.5, 0);
    scatter(palms, { g: palmTrunk, mat: MT.trunk });
    const pg = palmGeo(); pg.translate(0, 9, 0);
    scatter(palms, { g: pg, mat: MT.leaf });
    const bushG = new T.IcosahedronGeometry(0.9, 0); bushG.scale(1, 0.6, 1);
    scatter(bushes, { g: bushG, mat: MT.bush, shadow: false });
    const rockG = new T.DodecahedronGeometry(0.8, 0); rockG.scale(1.3, 0.6, 1);
    scatter(rocks, { g: rockG, mat: new T.MeshStandardMaterial({ color: col('#b59a74'), roughness: 1, flatShading: true }), shadow: false });
    // street lamps: pole + arm + glowing head
    const lp = merge([{ g: new T.CylinderGeometry(0.12, 0.18, 10, 6), m: at(0, 5, 0) }, { g: box(0.15, 0.15, 2.4), m: at(0, 10, 1.1) }]);
    scatter(lamps, { g: lp, mat: new T.MeshStandardMaterial({ color: col('#9a9c9e'), metalness: 0.6, roughness: 0.4 }), shadow: false });
    const head = box(0.5, 0.18, 1.0); head.translate(0, 9.9, 2.1);
    scatter(lamps, { g: head, mat: MT.lamp, shadow: false });
    // nodding-donkey pumps, animated
    const pm = new T.MeshStandardMaterial({ color: col('#5b5f63'), roughness: 0.6, metalness: 0.3 }), py = new T.MeshStandardMaterial({ color: col('#c9a227'), roughness: 0.6 });
    pumps.forEach(([x, y, z, r], i) => {
      const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = r;
      const base = new T.Mesh(box(2, 0.5, 8), pm); base.position.y = 0.25; g.add(base);
      for (const s of [-0.8, 0.8]) { const leg = new T.Mesh(box(0.25, 5, 0.25), pm); leg.position.set(s, 2.6, 0); leg.rotation.z = -s * 0.12; g.add(leg); }
      const beam = new T.Group(); beam.position.y = 5;
      const bm = new T.Mesh(box(0.5, 0.6, 9), py); beam.add(bm);
      const hd = new T.Mesh(box(0.6, 2.4, 1.2), py); hd.position.set(0, -0.8, -4.6); beam.add(hd);
      g.add(beam);
      const crank = new T.Mesh(box(0.6, 2.2, 1.4), pm); crank.position.set(0, 1.6, 3.5); g.add(crank);
      [base, bm, hd].forEach(m => { m.castShadow = true; });
      scene.add(g);
      const ph = i * 1.7, sp = 0.9 + (i % 5) * 0.1;
      animated.push(t => { beam.rotation.x = Math.sin(t * sp + ph) * 0.28; crank.rotation.x = t * sp + ph; });
    });
    // circuit floodlight masts and the drag strip tree
    const masts = [];
    const c = W.circuit;
    for (let s = 0; s < c.len; s += 90) { const p = W.pointAt(c, s); for (const sd of [1]) { const x = p.x - p.dz * sd * 22, z = p.z + p.dx * sd * 22; if (!W.roadAt(x, z, 2) && !W.collide(x, z, 2)) masts.push([x, 0, z, Math.atan2(-p.dz, p.dx)]); } }
    for (let zz = 1350; zz < 2000; zz += 80) masts.push([1225, 0, zz, Math.PI / 2], [1278, 0, zz, -Math.PI / 2]);
    scatter(masts, { g: (() => { const g = new T.CylinderGeometry(0.3, 0.5, 30, 6); g.translate(0, 15, 0); return g; })(), mat: new T.MeshStandardMaterial({ color: col('#aeb2b5'), metalness: 0.6, roughness: 0.4 }), shadow: false });
    const fl = box(6, 3, 0.4); fl.translate(0, 30, 0); scatter(masts, { g: fl, mat: MT.lamp, shadow: false });
    // dhows by the boatyard and in the marina, gently bobbing
    const hullM = new T.MeshStandardMaterial({ color: col('#8a5a32'), roughness: 0.8 });
    const dhow = (x, z, r, afloat) => {
      const g = new T.Group(); g.position.set(x, afloat ? -0.4 : W.heightAt(x, z) + 1.2, z); g.rotation.y = r;
      const hull = new T.Mesh(loft([[0, -8], [1.8, -4], [2, 2], [1.2, 6.5], [0, 8], [-1.2, 6.5], [-2, 2], [-1.8, -4]], 2.2, 1.15, 0, 0, 2), hullM);
      hull.castShadow = true; g.add(hull);
      const mast = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 10, 6), MT.trunk); mast.position.set(0, 6, -1); mast.rotation.x = -0.15; g.add(mast);
      scene.add(g);
      if (afloat) { const ph = x * 0.1; animated.push(t => { g.position.y = -0.55 + Math.sin(t * 1.1 + ph) * 0.12; g.rotation.z = Math.sin(t * 0.8 + ph) * 0.03; }); }
    };
    dhow(2350, 760, 0.6, false); dhow(2330, 690, 2.1, false); dhow(2520, 600, 1.2, true); dhow(2280, 520, 0.2, true);
    dhow(1380, -1540, 1.57, true); dhow(1250, -1550, 1.4, true);
    // marina yachts
    for (let k = 0; k < 6; k++) { const y = new T.Mesh(loft([[0, -7], [1.6, -3], [1.6, 4], [0, 6], [-1.6, 4], [-1.6, -3]], 1.8, 1.05, 0, 0, 1), new T.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.3 })); y.position.set(1480 + k * 14, -0.3, -1560 + (k % 2) * 4); y.rotation.y = 0.1; scene.add(y); }
    // marina boardwalk
    { const bw = new T.Mesh(box(160, 0.6, 14), new T.MeshStandardMaterial({ color: col('#b38a5e'), roughness: 0.9 })); bw.position.set(1460, 0.1, -1500); bw.receiveShadow = true; scene.add(bw); }
    // camp: majlis tents and lanterns
    const camp = W.place.camp;
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 1.4 + 2, x = camp.x + Math.cos(a) * 26, z = camp.z + Math.sin(a) * 26;
      const tent = new T.Mesh(loft([[-6, -4], [6, -4], [6, 4], [-6, 4]], 3, 0.15, 0, 0, 1), new T.MeshStandardMaterial({ color: col(k % 2 ? '#2b2420' : '#e9dcc1'), roughness: 1, side: T.DoubleSide }));
      tent.position.set(x, W.heightAt(x, z), z); tent.rotation.y = -a; tent.castShadow = true; scene.add(tent);
    }
    const fire = new T.PointLight(0xff8a3a, 0, 40, 2); fire.position.set(camp.x, 1.2, camp.z + 6); scene.add(fire);
    animated.push((t) => { fire.intensity = night * (2.2 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3); });
  }

  // --------------------------------------------------------------- signs ---
  function signTex(en, ar, sub, kind) {
    const shop = kind === 'shop';
    return canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = kind === 'gantry' ? '#1f4f9a' : shop ? '#1d1d1f' : '#7a4a2a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f5f5f5'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = shop ? '#f0c060' : '#ffffff'; c.textAlign = 'center';
      c.font = 'bold 64px "Noto Naskh Arabic","Geeza Pro","Segoe UI","Tahoma",sans-serif'; c.direction = 'rtl'; c.fillText(ar, w / 2, 92);
      c.direction = 'ltr'; c.font = 'bold 54px "Segoe UI","Helvetica Neue",Arial,sans-serif'; c.fillText(en, w / 2, 160);
      c.font = '34px "Segoe UI",Arial,sans-serif'; c.fillStyle = '#e8e8e8'; c.fillText(sub || '', w / 2, 214);
    });
  }
  function buildSigns() {
    const poleM = new T.MeshStandardMaterial({ color: col('#8f9396'), metalness: 0.6, roughness: 0.4 });
    W.signs.forEach(s => {
      const g = new T.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = -s.h;
      const tex = signTex(s.en, s.ar, s.sub, s.kind);
      const big = s.kind === 'gantry', w = big ? 9 : 5, h = w / 2, y = big ? 7.5 : s.kind === 'shop' ? 4.5 : 3.2;
      const board = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: tex, roughness: 0.6, emissiveMap: tex, emissive: col('#ffffff'), emissiveIntensity: 0, side: T.DoubleSide }));
      board.position.y = y; g.add(board);
      nightMats.push([board.material, s.kind === 'shop' ? 0.9 : 0.35]);
      for (const sd of big ? [-12.5, 12.5] : [0]) { const p = new T.Mesh(new T.CylinderGeometry(0.15, 0.2, y + (big ? 0 : -h / 2), 6), poleM); p.position.set(sd, (y + (big ? 0 : -h / 2)) / 2, -0.1); g.add(p); }
      if (big) { const beam = new T.Mesh(box(25.4, 0.4, 0.4), poleM); beam.position.set(0, y + h / 2 + 0.3, -0.1); g.add(beam); }
      scene.add(g);
    });
  }

  // ---------------------------------------------------------- car models ---
  // Side profiles per style, in metres from the front bumper. The body is an
  // extruded side silhouette with wheel arches cut in; the glasshouse sits on
  // top with a body-coloured roof.
  const PROFILE = {
    saloon:    { nose: 0.72, hood: 1.25, belt: 0.95, roof0: 1.95, roof1: 3.05, rear: 3.75, beltR: 0.98, tail: 0.92, R: 0.32 },
    van:       { nose: 0.95, hood: 0.75, belt: 1.15, roof0: 1.3, roof1: 4.85, rear: 4.88, beltR: 1.2, tail: 1.15, R: 0.33, flat: true },
    pickup:    { nose: 1.0, hood: 1.2, belt: 1.15, roof0: 1.9, roof1: 3.0, rear: 3.25, beltR: 1.15, tail: 1.1, R: 0.4, bed: true },
    suv:       { nose: 1.0, hood: 1.15, belt: 1.2, roof0: 1.8, roof1: 4.75, rear: 4.85, beltR: 1.22, tail: 1.18, R: 0.4, rack: true },
    boxy4x4:   { nose: 1.0, hood: 1.15, belt: 1.15, roof0: 1.45, roof1: 4.5, rear: 4.55, beltR: 1.15, tail: 1.15, R: 0.4, rack: true, spare: true, boxy: true },
    rally:     { nose: 0.7, hood: 1.0, belt: 0.9, roof0: 1.7, roof1: 2.75, rear: 3.6, beltR: 0.95, tail: 0.92, R: 0.33, wing: 'rally', lamps: true },
    hatch:     { nose: 0.72, hood: 1.0, belt: 0.95, roof0: 1.75, roof1: 3.6, rear: 4.15, beltR: 0.98, tail: 0.95, R: 0.32 },
    coupe:     { nose: 0.62, hood: 1.35, belt: 0.86, roof0: 2.15, roof1: 2.95, rear: 3.75, beltR: 0.9, tail: 0.86, R: 0.32 },
    drag:      { nose: 0.6, hood: 1.4, belt: 0.86, roof0: 2.2, roof1: 3.0, rear: 3.8, beltR: 0.9, tail: 0.88, R: 0.32, scoop: true, wing: 'drag', fatRear: true },
    landyacht: { nose: 0.78, hood: 1.75, belt: 0.92, roof0: 2.55, roof1: 3.85, rear: 4.45, beltR: 0.92, tail: 0.9, R: 0.36 },
    muscle:    { nose: 0.7, hood: 1.65, belt: 0.88, roof0: 2.35, roof1: 3.0, rear: 4.15, beltR: 0.9, tail: 0.88, R: 0.35, scoop: true },
    spider:    { nose: 0.58, hood: 1.6, belt: 0.82, roof0: 2.05, roof1: 2.2, rear: 2.6, beltR: 0.84, tail: 0.8, R: 0.34, open: true },
    cup:       { nose: 0.66, hood: 1.0, belt: 0.92, roof0: 1.75, roof1: 3.4, rear: 4.05, beltR: 0.96, tail: 0.95, R: 0.32, wing: 'cup' },
    supercar:  { nose: 0.5, hood: 1.15, belt: 0.82, roof0: 1.95, roof1: 2.6, rear: 4.2, beltR: 0.92, tail: 0.95, R: 0.35, wing: 'lip' },
    hyper:     { nose: 0.45, hood: 1.2, belt: 0.78, roof0: 2.0, roof1: 2.55, rear: 4.3, beltR: 0.88, tail: 0.9, R: 0.36, wing: 'big' },
  };
  function paintTex(hex, wear) {
    return canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = hex; c.fillRect(0, 0, w, h);
      if (wear <= 0) return;
      const n = Math.round(wear * 70);
      for (let i = 0; i < n; i++) {
        const x = rng() * w, y = rng() * h, r = 4 + rng() * 22 * wear;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const kind = rng();
        const cc = kind < 0.45 ? '120,72,38' : kind < 0.75 ? '190,180,160' : '90,90,90';
        g.addColorStop(0, `rgba(${cc},${0.8 * wear + 0.2})`); g.addColorStop(1, `rgba(${cc},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = `rgba(214,196,160,${wear * 0.35})`; c.fillRect(0, 0, w, h);   // dust
    });
  }
  // build a car model; returns a Group with .wheels and .lights for animation
  function carModel(id, cond, colorHex, opts = {}) {
    const C = D.CAR[id], st = Sim.STYLE[C.style], P = PROFILE[C.style];
    const L = st.L, Wd = st.Wd, H = st.H, wb = st.wb, R = P.R;
    const g = new T.Group();
    const bodyWear = cond ? Math.max(0, 1 - cond.body / 100) : 0;
    const paint = colorHex || C.color;
    const paintM = new T.MeshPhysicalMaterial({
      color: col('#ffffff'), map: paintTex(paint, bodyWear), metalness: 0.35 * (1 - bodyWear), roughness: 0.25 + bodyWear * 0.6,
      clearcoat: 1 - bodyWear, clearcoatRoughness: 0.05 + bodyWear * 0.4,
    });
    paintM.map.repeat.set(0.4, 0.4);
    const glassM = new T.MeshPhysicalMaterial({ color: col('#1a222b'), metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.88 });
    const trimM = new T.MeshStandardMaterial({ color: col('#1b1c1e'), roughness: 0.6 });
    const front = L / 2, cl = C.style === 'suv' || C.style === 'boxy4x4' || C.style === 'pickup' ? 0.36 : C.style === 'supercar' || C.style === 'hyper' ? 0.1 : 0.17;
    const ax0 = front - (L - wb) / 2 + (C.style === 'van' ? -0.25 : 0), ax1 = ax0 - wb;   // axle positions along s
    const S = (dist) => front - dist;   // distance from front → s coordinate
    // side silhouette
    const sh = new T.Shape();
    sh.moveTo(S(0), cl + 0.12);
    sh.lineTo(S(0), P.nose);
    sh.quadraticCurveTo(S(P.hood * 0.45), P.nose + (P.belt - P.nose) * 0.85, S(P.hood), P.belt);
    sh.lineTo(S(P.rear), P.beltR);
    sh.quadraticCurveTo(S(L - 0.1), P.beltR, S(L), P.tail);
    sh.lineTo(S(L), cl + 0.15);
    // bottom edge, rear to front, with wheel arches
    const archR = R + 0.07;
    sh.lineTo(ax1 - archR, cl + 0.15 > cl ? cl : cl);
    sh.absarc(ax1, Math.max(R, cl), archR, Math.PI, 0, true);
    sh.lineTo(ax0 - archR, cl);
    sh.absarc(ax0, Math.max(R, cl), archR, Math.PI, 0, true);
    sh.lineTo(S(0.05), cl);
    sh.lineTo(S(0), cl + 0.12);
    const bodyG = new T.ExtrudeGeometry(sh, { depth: Wd - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
    bodyG.translate(0, 0, -(Wd - 0.12) / 2);
    bodyG.rotateY(Math.PI / 2);
    const body = new T.Mesh(bodyG, paintM); body.castShadow = true; g.add(body);
    // glasshouse
    if (!P.open) {
      const gh = new T.Shape(), rt = H;
      const bF = P.belt + (P.beltR - P.belt) * 0.1;
      gh.moveTo(S(P.hood + 0.05), bF);
      gh.lineTo(S(P.roof0), rt);
      gh.lineTo(S(P.roof1), rt);
      gh.lineTo(S(P.rear - (P.flat || P.boxy ? 0 : 0.02)), P.beltR);
      gh.lineTo(S(P.hood + 0.05), bF);
      const gw = Wd * (P.boxy ? 0.9 : 0.8);
      const gg = new T.ExtrudeGeometry(gh, { depth: gw, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
      gg.translate(0, 0, -gw / 2); gg.rotateY(Math.PI / 2);
      const glass = new T.Mesh(gg, glassM); g.add(glass);
      // roof panel and pillars in body colour
      const roof = new T.Mesh(box(gw + 0.04, 0.06, (P.roof1 - P.roof0) + 0.1), paintM); roof.position.set(0, rt + 0.03, -(front - (P.roof0 + P.roof1) / 2)); roof.castShadow = true; g.add(roof);
      const pil = (d0, d1, y0, y1) => {
        const len = Math.hypot(d1 - d0, y1 - y0), m = new T.Mesh(box(0.08, len, 0.1), paintM);
        for (const sd of [-1, 1]) { const p = m.clone(); p.position.set(sd * (gw / 2 + 0.02), (y0 + y1) / 2, -(front - (d0 + d1) / 2)); p.rotation.x = Math.atan2(d1 - d0, y1 - y0); g.add(p); }
      };
      pil(P.hood + 0.05, P.roof0, bF, rt); pil(P.roof1, P.rear, rt, P.beltR);
    } else {
      // windscreen frame and a roll hoop for the open car
      const ws = new T.Mesh(box(Wd * 0.8, 0.35, 0.05), glassM); ws.position.set(0, P.belt + 0.2, -(front - P.hood - 0.15)); ws.rotation.x = -0.5; g.add(ws);
      const seat = new T.Mesh(box(Wd * 0.7, 0.4, 0.7), new T.MeshStandardMaterial({ color: col('#5a3a24'), roughness: 0.8 })); seat.position.set(0, P.belt - 0.05, -(front - 2.2)); g.add(seat);
    }
    // bed for the pickup
    if (P.bed) {
      const bm = paintM;
      for (const sd of [-1, 1]) { const w = new T.Mesh(box(0.08, 0.45, L - P.rear - 0.1), bm); w.position.set(sd * (Wd / 2 - 0.08), P.beltR + 0.2, -(front - (P.rear + L) / 2)); g.add(w); }
      const tg = new T.Mesh(box(Wd - 0.1, 0.45, 0.08), bm); tg.position.set(0, P.beltR + 0.2, -(front - L + 0.06)); g.add(tg);
    }
    if (P.rack) { const rk = new T.Mesh(box(Wd * 0.75, 0.06, (P.roof1 - P.roof0) * 0.8), trimM); rk.position.set(0, H + 0.12, -(front - (P.roof0 + P.roof1) / 2)); g.add(rk); }
    if (P.spare) { const sp = new T.Mesh(new T.CylinderGeometry(R, R, 0.25, 16), trimM); sp.rotation.x = Math.PI / 2; sp.position.set(0, P.tail - 0.1, -(front - L - 0.12)); g.add(sp); }
    if (P.scoop) { const sc = new T.Mesh(box(0.6, 0.15, 0.9), C.style === 'drag' ? trimM : paintM); sc.position.set(0, P.belt + 0.05, -(front - P.hood * 0.55)); g.add(sc); }
    if (P.wing) {
      const wy = P.wing === 'big' ? P.tail + 0.35 : P.wing === 'lip' ? P.tail + 0.05 : P.wing === 'drag' ? P.tail + 0.5 : P.tail + 0.3;
      const wg = new T.Mesh(box(Wd * (P.wing === 'lip' ? 0.9 : 0.95), 0.05, 0.35), P.wing === 'lip' ? paintM : trimM); wg.position.set(0, wy, -(front - L + 0.3)); g.add(wg);
      if (P.wing !== 'lip') for (const sd of [-0.35, 0.35]) { const st2 = new T.Mesh(box(0.05, wy - P.tail + 0.05, 0.15), trimM); st2.position.set(sd * Wd, (wy + P.tail) / 2, -(front - L + 0.3)); g.add(st2); }
    }
    if (P.lamps) for (let k = -1.5; k <= 1.5; k++) { const lm = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.08, 12), new T.MeshStandardMaterial({ color: 0xffffff, emissive: col('#fff6d0'), emissiveIntensity: 0.6 })); lm.rotation.x = Math.PI / 2; lm.position.set(k * 0.25, P.nose + 0.05, -(front + 0.05)); g.add(lm); }
    // bumpers, grille, lights
    const bumperF = new T.Mesh(box(Wd - 0.05, 0.22, 0.12), C.style === 'landyacht' || C.style === 'muscle' || C.style === 'boxy4x4' ? MT.chrome : trimM); bumperF.position.set(0, cl + 0.22, -(front + 0.02)); g.add(bumperF);
    const bumperR = bumperF.clone(); bumperR.position.z = (L - front) + 0.02; g.add(bumperR);
    const grille = new T.Mesh(box(Wd * 0.45, (P.nose - cl) * 0.35, 0.05), trimM); grille.position.set(0, cl + (P.nose - cl) * 0.6, -(front + 0.04)); g.add(grille);
    const headM = new T.MeshStandardMaterial({ color: col('#f4f4ee'), emissive: col('#fff3d6'), emissiveIntensity: 0.15, roughness: 0.1 });
    const tailM = new T.MeshStandardMaterial({ color: col('#7a0d12'), emissive: col('#ff1a1a'), emissiveIntensity: 0.3, roughness: 0.3 });
    for (const sd of [-1, 1]) {
      const hl = new T.Mesh(box(Wd * 0.2, 0.12, 0.06), headM); hl.position.set(sd * Wd * 0.33, P.nose - 0.08, -(front + 0.05)); g.add(hl);
      const tl = new T.Mesh(box(Wd * 0.22, 0.1, 0.06), tailM); tl.position.set(sd * Wd * 0.33, P.tail - 0.1, (L - front) + 0.05); g.add(tl);
      const mir = new T.Mesh(box(0.18, 0.1, 0.12), paintM); mir.position.set(sd * (Wd / 2 + 0.06), P.belt + 0.12, -(front - P.hood - 0.25)); g.add(mir);
    }
    // wheels
    const tyreM = new T.MeshStandardMaterial({ color: col('#161616'), roughness: 0.9 });
    const rimM = new T.MeshStandardMaterial({ color: col(cond && cond.tyres < 35 ? '#6b6258' : C.style === 'boxy4x4' ? '#e0e0e0' : '#b8bcc0'), metalness: 0.85, roughness: 0.3 });
    const wheels = [];
    const tw = C.style === 'drag' ? [0.2, 0.42] : [0.24, 0.26];
    [[ax0, 1], [ax0, -1], [ax1, 1], [ax1, -1]].forEach(([s, sd], k) => {
      const wg = new T.Group();
      const width = k < 2 ? tw[0] : tw[1], rr = k >= 2 && P.fatRear ? R + 0.04 : R;
      const tyre = new T.Mesh(new T.CylinderGeometry(rr, rr, width, 20), tyreM); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
      const spin = new T.Group(); spin.add(tyre);
      const rim = new T.Mesh(new T.CylinderGeometry(rr * 0.62, rr * 0.62, width + 0.01, 14), rimM); rim.rotation.z = Math.PI / 2; spin.add(rim);
      for (let j = 0; j < 5; j++) { const sp = new T.Mesh(box(width + 0.02, rr * 1.1, 0.05), rimM); sp.rotation.x = j / 5 * Math.PI; spin.add(sp); }
      wg.add(spin); wg.userData.spin = spin; wg.userData.front = k < 2; wg.userData.r = rr;
      wg.position.set(sd * (Wd / 2 - width / 2 + 0.02), rr, -s);
      g.add(wg); wheels.push(wg);
    });
    g.userData = { wheels, headM, tailM, paintM, id, L, Wd };
    return g;
  }
  function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }

  // a car under a dust cover, for undiscovered finds
  function coveredCar(id) {
    const C = D.CAR[id], st = Sim.STYLE[C.style];
    const g = new T.Group();
    const m = new T.Mesh(new T.SphereGeometry(1, 20, 12), new T.MeshStandardMaterial({ color: col('#8c8f7a'), roughness: 1 }));
    m.scale.set(st.Wd / 2 + 0.1, st.H * 0.9, st.L / 2 + 0.1); m.position.y = 0.05; m.castShadow = true; g.add(m);
    return g;
  }

  function setPlayer(owned) {
    if (playerCar) { scene.remove(playerCar); disposeGroup(playerCar); }
    playerCar = carModel(owned.id, owned.cond, owned.paint);
    scene.add(playerCar);
    if (!headL) { headL = new T.SpotLight(0xfff1d6, 0, 90, 0.5, 0.5, 1.2); scene.add(headL); scene.add(headL.target); }
  }
  function placeCar(g, c) {
    g.position.set(c.x, c.y, c.z);
    g.rotation.set(0, 0, 0);
    g.rotation.order = 'YXZ';
    g.rotation.y = -c.h; g.rotation.x = c.pitch; g.rotation.z = c.roll;
  }
  function animWheels(g, c, dt) {
    const sp = Sim.fwdSpeed(c);
    g.userData.wheels.forEach(w => {
      w.userData.spin.rotation.x -= sp * dt / w.userData.r;
      if (w.userData.front) w.rotation.y = -c.steer;
    });
  }

  // ----------------------------------------------------------- hidden cars ---
  function syncHidden(state) {
    for (const [id, L] of Object.entries(D.LEADS)) {
      const st = state.leads[id] || 'none';
      const want = st === 'done' ? null : (st === 'found' ? 'open' : 'covered');
      const cur = hiddenCars[id];
      if (cur && cur.kind === want) continue;
      if (cur) { scene.remove(cur.g); disposeGroup(cur.g); delete hiddenCars[id]; }
      if (!want) continue;
      const g = want === 'covered' ? coveredCar(L.car) : carModel(L.car, D.CAR[L.car].condition);
      g.position.set(L.spot.x, W.heightAt(L.spot.x, L.spot.z) * (L.shelter === 'none' ? 1 : 0), L.spot.z);
      g.rotation.y = -L.spot.h;
      scene.add(g);
      hiddenCars[id] = { g, kind: want };
    }
  }

  // ---------------------------------------------------------------- people ---
  function person(attire, tint) {
    const g = new T.Group();
    const skin = new T.MeshStandardMaterial({ color: col(['#8d5a3c', '#a46a45', '#c48d63', '#6f4630'][(rng() * 4) | 0]), roughness: 0.8 });
    const A = {
      thobe: ['#f4f2ec', '#f4f2ec', 'ghutra'], abaya: ['#141414', '#141414', 'shayla'], overalls: [tint || '#3b6fb6', tint || '#3b6fb6', null],
      racesuit: [tint || '#d33', '#222', null], casual: ['#2f3b4c', '#d9d2c3', null], outdoor: ['#6c5a3c', '#cfc3a4', 'cap'], suit: ['#20232a', '#20232a', null],
    }[attire] || ['#666', '#999', null];
    const lower = new T.MeshStandardMaterial({ color: col(A[0]), roughness: 0.9 }), upper = new T.MeshStandardMaterial({ color: col(A[1]), roughness: 0.9 });
    const long = attire === 'thobe' || attire === 'abaya';
    const legs = new T.Mesh(new T.CylinderGeometry(0.2, long ? 0.3 : 0.18, long ? 1.0 : 0.9, 10), lower); legs.position.y = long ? 0.5 : 0.45; g.add(legs);
    const torso = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 0.65, 10), long ? lower : upper); torso.position.y = 1.32; g.add(torso);
    const head = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.78; g.add(head);
    if (A[2] === 'ghutra') { const gh = new T.Mesh(new T.ConeGeometry(0.2, 0.42, 10, 1, true), new T.MeshStandardMaterial({ color: 0xf8f8f8, side: T.DoubleSide, roughness: 0.9 })); gh.position.y = 1.76; g.add(gh); const ag = new T.Mesh(new T.TorusGeometry(0.13, 0.025, 6, 16), new T.MeshStandardMaterial({ color: 0x111111 })); ag.rotation.x = Math.PI / 2; ag.position.y = 1.86; g.add(ag); }
    if (A[2] === 'shayla') { const sh = new T.Mesh(new T.SphereGeometry(0.16, 12, 10), lower); sh.position.y = 1.79; sh.scale.set(1, 1.1, 1.05); g.add(sh); const face = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), skin); face.position.set(0, 1.77, -0.07); g.add(face); }
    if (A[2] === 'cap') { const cp = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.08, 10), new T.MeshStandardMaterial({ color: 0x2a2a2a })); cp.position.y = 1.9; g.add(cp); }
    for (const sd of [-1, 1]) { const arm = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.62, 6), long ? lower : upper); arm.position.set(sd * 0.27, 1.3, 0); g.add(arm); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  let peopleBuilt = false;
  function buildPeople() {
    if (peopleBuilt) return; peopleBuilt = true;
    Object.entries(D.PEOPLE).forEach(([id, p]) => {
      const pl = W.place[p.place];
      const g = person(p.attire, p.color);
      g.position.set(pl.x + 4, W.heightAt(pl.x + 4, pl.z) * 0, pl.z - 3);
      scene.add(g);
      npcGroups.push({ id, g, base: g.position.clone() });
    });
    // ambient crowd at the café, marina and paddock
    const crowd = [['cafe', 9], ['marina', 10], ['paddock', 8], ['camp', 5], ['drag', 8]];
    const kinds = ['thobe', 'thobe', 'abaya', 'casual', 'casual', 'outdoor', 'thobe', 'abaya'];
    crowd.forEach(([pid, n]) => {
      const pl = W.place[pid];
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2, r = 7 + rng() * 9;
        const g = person(kinds[(rng() * kinds.length) | 0]);
        const x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
        if (W.roadAt(x, z, 0.5) || W.collide(x, z, 0.5)) continue;
        g.position.set(x, W.heightAt(x, z), z); g.rotation.y = rng() * 6;
        scene.add(g);
        npcGroups.push({ id: null, g, base: g.position.clone(), place: pid, ph: rng() * 6 });
      }
    });
    // seating at the café: low tables and stools
    const cafe = W.place.cafe;
    for (let k = 0; k < 6; k++) {
      const t = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.6, 12), new T.MeshStandardMaterial({ color: col('#6b4a2e') }));
      t.position.set(cafe.x - 10 + (k % 3) * 5, 0.3, cafe.z + 10 + Math.floor(k / 3) * 4); scene.add(t);
    }
  }
  function updatePeople(state, t) {
    npcGroups.forEach(n => {
      if (n.id) n.g.visible = Sim.present(state, n.id);
      else if (n.place === 'drag') n.g.visible = Sim.present(state, 'khalid');
      else if (n.place === 'marina') n.g.visible = Sim.hour(state) >= 15 || Sim.hour(state) < 1;
      if (!n.id && n.ph != null) n.g.rotation.y += Math.sin(t * 0.3 + n.ph) * 0.002;
    });
  }

  // ------------------------------------------------------------- traffic ---
  const TRAFFIC_COLORS = ['#f4f4f2', '#f4f4f2', '#c0c2c4', '#1b1c1e', '#d8d2c4', '#8a8f94', '#f4f4f2', '#7a1d22', '#22416e', '#efe9da'];
  const TRAFFIC_IDS = ['kestrel', 'kestrel', 'dune_patrol', 'halden_pickup', 'velk_van', 'novaro_gti', 'dune_patrol', 'kestrel', 'meridian_gt'];
  function syncTraffic(list) {
    while (trafficPool.length < list.length) {
      const k = trafficPool.length, id = TRAFFIC_IDS[k % TRAFFIC_IDS.length];
      const g = carModel(id, { engine: 90, body: 92, interior: 90, tyres: 90 }, TRAFFIC_COLORS[(k * 7) % TRAFFIC_COLORS.length]);
      scene.add(g); trafficPool.push(g);
    }
    trafficPool.forEach((g, i) => {
      const t = list[i];
      g.visible = !!t;
      if (!t) return;
      g.position.set(t.x, 0.04, t.z); g.rotation.set(0, -t.h, 0);
      g.userData.wheels.forEach(w => { w.userData.spin.rotation.x -= t.v * 0.016 / w.userData.r; });
      g.userData.headM.emissiveIntensity = night > 0.3 ? 2.5 : 0.15;
      g.userData.tailM.emissiveIntensity = (night > 0.3 ? 1.2 : 0.3) + (t.braking ? 2 : 0);
    });
  }
  function trafficStyle(i) { return TRAFFIC_IDS[i % TRAFFIC_IDS.length]; }

  // ------------------------------------------------------------ particles ---
  function buildFx() {
    const N = 900;
    const g = new T.BufferGeometry();
    const pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(colr, 3));
    g.setAttribute('size', new T.BufferAttribute(size, 1));
    g.setAttribute('alpha', new T.BufferAttribute(alpha, 1));
    const m = new T.ShaderMaterial({
      uniforms: { map: { value: TX.dot }, scale: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }',
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    fx = { g, N, i: 0, p: Array.from({ length: N }, () => ({ life: 0 })) };
  }
  function emit(x, y, z, vx, vy, vz, sz, life, color) {
    const p = fx.p[fx.i]; fx.i = (fx.i + 1) % fx.N;
    Object.assign(p, { x, y, z, vx, vy, vz, sz, life, max: life, c: color });
  }
  function updateFx(dt) {
    const pos = fx.g.attributes.position.array, cl = fx.g.attributes.color.array, sz = fx.g.attributes.size.array, al = fx.g.attributes.alpha.array;
    fx.p.forEach((p, i) => {
      if (p.life <= 0) { al[i] = 0; return; }
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.97; p.vz *= 0.97; p.vy *= 0.98;
      const t = 1 - p.life / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      cl[i * 3] = p.c.r; cl[i * 3 + 1] = p.c.g; cl[i * 3 + 2] = p.c.b;
      sz[i] = p.sz * (0.6 + t * 2.2); al[i] = Math.max(0, (1 - t) * 0.5);
    });
    fx.g.attributes.position.needsUpdate = fx.g.attributes.color.needsUpdate = fx.g.attributes.size.needsUpdate = fx.g.attributes.alpha.needsUpdate = true;
  }
  const DUST = { sand: '#d8bf94', track: '#cdb085', paved: '#bdb6a8', smoke: '#e6e6e6' };
  function carFx(c, dt) {
    const spd = Sim.speed(c), loose = c.surface === 'sand' || c.surface === 'track';
    const rate = loose ? Math.min(1, spd / 20) * 40 + c.wheelspin * 40 : (c.slip > 0.08 || c.wheelspin > 0.2) ? (c.slip * 120 + c.wheelspin * 60) : 0;
    let n = rate * dt; const colr = col(loose ? DUST[c.surface] : DUST.smoke);
    if (night > 0.5) colr.multiplyScalar(0.45);
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const back = -(c.p.L / 2 - 0.4), sd = (Math.random() - 0.5) * c.p.Wd;
      const x = c.x + Math.sin(c.h) * back + Math.cos(c.h) * sd, z = c.z - Math.cos(c.h) * back + Math.sin(c.h) * sd;
      emit(x, c.y + 0.3, z, -c.vx * 0.15 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), -c.vz * 0.15 + (Math.random() - 0.5) * 2, loose ? 2.6 : 1.8, loose ? 2.4 : 1.6, colr);
    }
  }

  // ------------------------------------------------------------- markers ---
  function buildMarkers() {
    markers = { list: [], ring: null, gates: [] };
    const ringM = new T.MeshBasicMaterial({ color: 0xf0c060, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false });
    markers.ringM = ringM;
    markers.beaconM = new T.MeshBasicMaterial({ color: 0xf0c060, transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending });
  }
  // markers: [{x,z,kind:'place'|'area'|'gate'|'target', r, color}]
  let markerMeshes = [];
  function setMarkers(list) {
    markerMeshes.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    markerMeshes = [];
    list.forEach(mk => {
      let m;
      if (mk.kind === 'area') {
        m = new T.Mesh(new T.RingGeometry(mk.r - 3, mk.r, 64), markers.ringM); m.rotation.x = -Math.PI / 2; m.position.set(mk.x, 0.4, mk.z);
      } else if (mk.kind === 'gate') {
        m = new T.Mesh(new T.CylinderGeometry(mk.r || 9, mk.r || 9, 14, 24, 1, true), new T.MeshBasicMaterial({ color: col(mk.color || '#f0c060'), transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        m.position.set(mk.x, Math.max(0, W.heightAt(mk.x, mk.z)) + 7, mk.z);
      } else {
        m = new T.Mesh(new T.CylinderGeometry(mk.r || 1.2, mk.r || 1.2, 60, 12, 1, true), new T.MeshBasicMaterial({ color: col(mk.color || '#f0c060'), transparent: true, opacity: 0.18, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
        m.position.set(mk.x, 30, mk.z);
      }
      m.renderOrder = 5;
      scene.add(m); markerMeshes.push(m);
    });
  }

  // ------------------------------------------------------------- cameras ---
  const CAMS = ['Chase', 'Far chase', 'Bonnet', 'Photo'];
  function cycleCam() { camMode = (camMode + 1) % 3; return CAMS[camMode]; }
  let photo = { yaw: 0.8, pitch: 0.25, dist: 7 };
  function updateCamera(c, dt, mode) {
    const L = c.p.L;
    const fwd = new T.Vector3(Math.sin(c.h), 0, -Math.cos(c.h));
    const spd = Sim.speed(c);
    if (mode === 'photo' || mode === 'garage') {
      if (mode === 'garage') photo.yaw += dt * 0.25;
      const p = new T.Vector3(c.x + Math.sin(c.h + photo.yaw) * -photo.dist * Math.cos(photo.pitch), c.y + 0.6 + Math.sin(photo.pitch) * photo.dist, c.z - Math.cos(c.h + photo.yaw) * -photo.dist * Math.cos(photo.pitch));
      camera.position.copy(p); camera.lookAt(c.x, c.y + 0.6, c.z); camera.fov = 45; camera.updateProjectionMatrix();
      return;
    }
    if (camMode === 2) {
      const p = new T.Vector3(c.x, c.y + c.p.H * 0.82, c.z).addScaledVector(fwd, L * 0.12);
      camera.position.copy(p);
      camera.lookAt(p.clone().addScaledVector(fwd, 20).add(new T.Vector3(0, -0.6, 0)));
      camera.fov = 70 + Math.min(14, spd * 0.18); camera.updateProjectionMatrix();
      return;
    }
    const far = camMode === 1;
    const dist = (far ? 10 : 5.6) + L * 0.55 + spd * 0.03, height = (far ? 3.6 : 1.9) + c.p.H * 0.5;
    // follow the direction of travel a little when sliding
    let dir = c.h;
    if (spd > 4) { const vh = Math.atan2(c.vx, -c.vz); let d = vh - c.h; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Sim.fwdSpeed(c) > 0) dir += d * 0.35; }
    if (!camState) camState = { dir, pos: new T.Vector3() };
    let dd = dir - camState.dir; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    camState.dir += dd * Math.min(1, dt * 4);
    const want = new T.Vector3(c.x - Math.sin(camState.dir) * dist, c.y + height, c.z + Math.cos(camState.dir) * dist);
    const gh = Math.max(0, W.heightAt(want.x, want.z)) + 1.0;
    if (want.y < gh) want.y = gh;
    if (camState.pos.lengthSq() === 0) camState.pos.copy(want);
    camState.pos.lerp(want, Math.min(1, dt * 7));
    camera.position.copy(camState.pos);
    camera.lookAt(c.x + Math.sin(c.h) * 3, c.y + c.p.H * 0.6 + 0.4, c.z - Math.cos(c.h) * 3);
    camera.fov = 60 + Math.min(16, spd * 0.2); camera.updateProjectionMatrix();
  }
  function photoInput(dx, dy, dz) { photo.yaw += dx; photo.pitch = Math.max(0.02, Math.min(1.3, photo.pitch + dy)); photo.dist = Math.max(3.5, Math.min(20, photo.dist + dz)); }
  function resetCam() { camState = null; }

  // -------------------------------------------------------------- frame ---
  let tAcc = 0;
  function frame(dt, st) {
    if (!ok) return;
    tAcc += dt;
    const c = st.car;
    setTime(st.hour, c);
    if (playerCar) {
      placeCar(playerCar, c); animWheels(playerCar, c, dt);
      const ud = playerCar.userData;
      ud.tailM.emissiveIntensity = (night > 0.3 ? 1.2 : 0.3) + (st.braking ? 2.5 : 0);
      ud.headM.emissiveIntensity = night > 0.3 ? 3 : 0.15;
      if (headL) { headL.position.set(c.x + Math.sin(c.h) * 2, c.y + 0.8, c.z - Math.cos(c.h) * 2); headL.target.position.set(c.x + Math.sin(c.h) * 30, 0, c.z - Math.cos(c.h) * 30); }
      if (st.mode === 'drive') carFx(c, dt);
    }
    syncTraffic(st.traffic || []);
    if (st.state) { syncHidden(st.state); buildPeople(); updatePeople(st.state, tAcc); }
    animated.forEach(f => f(tAcc));
    updateFx(dt);
    updateCamera(c, dt, st.mode);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  // turntable snapshot of a car for the register / garage cards
  let snapR = null;
  function snapshot(id, cond, w = 320, h = 180) {
    if (!ok) return null;
    if (!snapR) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      snapR = { r: new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }), s: new T.Scene(), cam: new T.PerspectiveCamera(30, w / h, 0.1, 100), cv };
      snapR.r.outputEncoding = T.sRGBEncoding; snapR.r.toneMapping = T.ACESFilmicToneMapping;
      snapR.s.add(new T.HemisphereLight(0xffffff, 0x886644, 1.0));
      const dl = new T.DirectionalLight(0xffffff, 2.2); dl.position.set(4, 6, 3); snapR.s.add(dl);
      snapR.s.environment = scene.environment;
    }
    snapR.s.environment = scene.environment;
    const g = carModel(id, cond);
    snapR.s.add(g);
    const L = D.CAR[id] && Sim.STYLE[D.CAR[id].style].L;
    snapR.cam.position.set(L * 0.95, L * 0.42, -L * 0.85); snapR.cam.lookAt(0, 0.55, 0);
    snapR.r.setClearColor(0x000000, 0);
    snapR.r.render(snapR.s, snapR.cam);
    const url = snapR.cv.toDataURL('image/png');
    snapR.s.remove(g); disposeGroup(g);
    return url;
  }

  return { info: () => renderer && renderer.info.render, init, resize, frame, setPlayer, setMarkers, cycleCam, photoInput, resetCam, snapshot, emit: (...a) => ok && emit(...a), get ok() { return ok; }, trafficStyle };
})();
