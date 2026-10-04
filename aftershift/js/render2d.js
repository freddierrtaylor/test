// ============================================================================
// AFTERSHIFT 2D: the map (minimap and full map) and the top-down fallback
// view when three.js or WebGL is unavailable.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.R2 = (() => {
  const W = AS.World, D = AS.DATA, Sim = AS.Sim;
  const MPP = 4;   // metres per pixel in the base map
  let base = null;
  const ZC = { desert: '#d9c39b', oilfield: '#cdb088', circuit: '#dac6a2', island: '#e2d1ac', city: '#c3bcae', oldtown: '#d3c3a2', industrial: '#b1aa9d', sea: '#1f6d80' };
  const RC = { highway: '#f2efe6', causeway: '#f2efe6', boulevard: '#ffffff', street: '#fbf8f1', lane: '#efe3c9', track: '#b99a6c', circuit: '#3b3c40', pit: '#77787c', drag: '#3b3c40' };
  const BC = { shelterwall: '#8f8676', tower: '#8ea9b9', midrise: '#e8e0d0', house: '#e2d2b0', warehouse: '#a9b2b8', bungalow: '#f2ede2', pits: '#d9dde0', grandstand: '#c8202c', shed: '#b9b2a2' };

  function buildBase() {
    const B = W.BOUNDS, w = Math.ceil((B.x1 - B.x0) / MPP), h = Math.ceil((B.z1 - B.z0) / MPP);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const cache = {}; Object.keys(ZC).forEach(k => { cache[k] = hex(ZC[k]); });
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = B.x0 + i * MPP, z = B.z0 + j * MPP, zn = W.zoneAt(x, z);
      let col = cache[zn];
      const k = (j * w + i) * 4;
      let shade = 1;
      if (zn !== 'sea') { const hh = W.heightAt(x, z), hx = W.heightAt(x + 4, z); shade = 1 + (hh - hx) * 0.06; }
      else { const ld = W.landDist(x, z); shade = 1 + Math.max(-0.35, ld / 300); }
      img.data[k] = col[0] * shade; img.data[k + 1] = col[1] * shade; img.data[k + 2] = col[2] * shade; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.save(); c.scale(1 / MPP, 1 / MPP); c.translate(-B.x0, -B.z0);
    W.buildings.forEach(b => { c.fillStyle = BC[b.kind] || '#ccc'; c.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); });
    c.lineCap = 'round'; c.lineJoin = 'round';
    const order = ['track', 'lane', 'street', 'pit', 'boulevard', 'drag', 'causeway', 'highway', 'circuit'];
    for (const pass of [0, 1]) for (const t of order) W.roads.filter(r => r.type === t).forEach(r => {
      c.beginPath(); r.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); if (r.closed) c.closePath();
      if (pass === 0) { c.strokeStyle = t === 'track' ? 'rgba(0,0,0,0)' : 'rgba(60,50,40,0.45)'; c.lineWidth = r.w + 8; }
      else { c.strokeStyle = RC[t]; c.lineWidth = Math.max(r.w, t === 'track' ? 8 : 10); }
      c.stroke();
    });
    c.restore();
    base = cv;
  }

  // draw the map into ctx: centred on (cx, cz), `ppm` pixels per metre, rotated by `rot`
  function draw(ctx, w, h, cx, cz, ppm, rot, ov) {
    if (!base) buildBase();
    ctx.save();
    ctx.fillStyle = ZC.sea; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2); ctx.rotate(rot || 0); ctx.scale(ppm, ppm); ctx.translate(-cx, -cz);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, W.BOUNDS.x0, W.BOUNDS.z0, base.width * MPP, base.height * MPP);
    const s = 1 / ppm;   // one screen pixel in metres
    if (ov) {
      (ov.areas || []).forEach(a => { ctx.beginPath(); ctx.arc(a.x, a.z, a.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(240,192,96,0.18)'; ctx.fill(); ctx.setLineDash([8 * s, 6 * s]); ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#f0c060'; ctx.stroke(); ctx.setLineDash([]); });
      (ov.route || []).forEach((p, i, arr) => { if (!i) return; ctx.beginPath(); ctx.moveTo(arr[i - 1][0], arr[i - 1][1]); ctx.lineTo(p[0], p[1]); ctx.strokeStyle = 'rgba(80,200,255,0.8)'; ctx.lineWidth = 3 * s; ctx.stroke(); });
      (ov.gates || []).forEach((g, i) => { ctx.beginPath(); ctx.arc(g.x, g.z, (i === 0 ? 7 : 5) * s, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#5fd0ff' : 'rgba(95,208,255,0.5)'; ctx.fill(); });
      (ov.places || []).forEach(p => {
        ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(-(rot || 0)); ctx.scale(s, s);
        ctx.beginPath(); ctx.arc(0, 0, p.big ? 9 : 7, 0, Math.PI * 2); ctx.fillStyle = p.color || '#1d1d1f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.icon || '•', 0, 0.5);
        if (p.label) { ctx.font = '600 12px system-ui,sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(p.label, 0, 12); ctx.fillText(p.label, 0, 12); }
        ctx.restore();
      });
      (ov.traffic || []).forEach(t => { ctx.save(); ctx.translate(t.x, t.z); ctx.rotate(t.h); ctx.fillStyle = '#777'; ctx.fillRect(-1, -2.3, 2, 4.6); ctx.restore(); });
      if (ov.player) {
        const p = ov.player;
        ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(p.h); ctx.scale(Math.max(1, s * 2.4), Math.max(1, s * 2.4));
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(0, 2.2); ctx.lineTo(-3.5, 4); ctx.closePath();
        ctx.fillStyle = '#ff5a3c'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------- top-down fallback view ---
  function fallbackFrame(ctx, w, h, st, dpr = 1) {
    const c = st.car, ppm = (6.5 - Math.min(3.5, Sim.speed(c) * 0.06)) * dpr;
    draw(ctx, w, h, c.x + Math.sin(c.h) * 30, c.z - Math.cos(c.h) * 30, ppm, 0, null);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(ppm, ppm); ctx.translate(-(c.x + Math.sin(c.h) * 30), -(c.z - Math.cos(c.h) * 30));
    const car = (x, z, hh, L, Wd, color) => { ctx.save(); ctx.translate(x, z); ctx.rotate(hh); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-Wd / 2 + 0.3, -L / 2 + 0.4, Wd, L); ctx.fillStyle = color; ctx.fillRect(-Wd / 2, -L / 2, Wd, L); ctx.fillStyle = 'rgba(20,30,40,0.7)'; ctx.fillRect(-Wd / 2 + 0.2, -L / 2 + L * 0.28, Wd - 0.4, L * 0.32); ctx.restore(); };
    (st.traffic || []).forEach(t => car(t.x, t.z, t.h, 4.6, 1.8, '#d9d9d9'));
    Object.entries(D.LEADS).forEach(([id, L]) => { const s = st.state.leads[id]; if (s !== 'done') car(L.spot.x, L.spot.z, L.spot.h, 4.5, 1.8, s === 'found' ? D.CAR[L.car].color : '#8c8f7a'); });
    car(c.x, c.z, c.h, c.p.L, c.p.Wd, D.CAR[c.owned.id].color);
    ctx.restore();
    if (st.hour < 6 || st.hour > 19) { ctx.fillStyle = 'rgba(10,15,40,0.45)'; ctx.fillRect(0, 0, w, h); }
  }

  return { draw, fallbackFrame, buildBase };
})();
