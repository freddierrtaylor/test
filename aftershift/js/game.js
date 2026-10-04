// ============================================================================
// AFTERSHIFT GAME: input, the main loop, traffic, places and people, leads
// and discoveries, events (time trial, drag nights, desert run, parts runs),
// the garage, showroom, register, map, HUD and saving.
// ============================================================================
(() => {
  const D = AS.DATA, W = AS.World, Sim = AS.Sim, R3 = AS.R3, R2 = AS.R2, SND = AS.Audio;
  const $ = id => document.getElementById(id);
  const fmt = n => D.CURRENCY + ' ' + Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SAVE_KEY = 'aftershift.save.v1', PREF_KEY = 'aftershift.prefs.v1';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  let S = null, car = null, mode = 'title', use3d = false, panelOpen = false;
  let prefs = Object.assign({ assist: true, sound: true }, JSON.parse(store.get(PREF_KEY) || '{}'));
  let event = null, traffic = [], lastSave = 0, simAcc = 0, pendingShot = false, playTime = 0;
  const rnd = W.rng(Date.now() & 0xffff);

  // ---------------------------------------------------------------- input ---
  const keys = {}, touch = {};
  const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  addEventListener('keydown', e => {
    if (e.repeat && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    keys[e.code] = true;
    SND.start();
    if (mode === 'title') return;
    if (panelOpen) { panelKey(e); return; }
    if (e.code === 'Escape') { e.preventDefault(); if (mode === 'photo') togglePhoto(); else openPause(); }
    else if (e.code === 'KeyE' || e.code === 'Enter') interact();
    else if (e.code === 'KeyM') openMap();
    else if (e.code === 'KeyC' && use3d && mode === 'drive') toast('Camera: ' + R3.cycleCam());
    else if (e.code === 'KeyP' && use3d) togglePhoto();
    else if (e.code === 'KeyR' && mode === 'drive') recover(false);
    else if (e.code === 'KeyF' && mode === 'photo') pendingShot = true;
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function readInput(dt) {
    const k = c => !!keys[c];
    let thr = (k('ArrowUp') || k('KeyW') || touch.gas) ? 1 : 0, brk = (k('ArrowDown') || k('KeyS') || touch.brake) ? 1 : 0;
    let st = ((k('ArrowRight') || k('KeyD') || touch.right) ? 1 : 0) - ((k('ArrowLeft') || k('KeyA') || touch.left) ? 1 : 0);
    let hb = k('Space') || !!touch.hb;
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    if (gp) {
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) st = ax;
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (rt > 0.05) thr = rt; if (lt > 0.05) brk = lt;
      if (gp.buttons[0] && gp.buttons[0].pressed) hb = true;
      gp._e = gp._e || {};
      const edge = (i, f) => { const p = gp.buttons[i] && gp.buttons[i].pressed; if (p && !gpPrev[i]) f(); gpPrev[i] = p; };
      edge(2, () => panelOpen ? clickSelected() : interact());
      edge(9, () => panelOpen ? closePanel() : openPause());
      edge(3, () => { if (!panelOpen && use3d) toast('Camera: ' + R3.cycleCam()); });
      edge(1, () => { if (panelOpen) closePanel(); });
      edge(12, () => panelOpen && moveSel(-1)); edge(13, () => panelOpen && moveSel(1));
    }
    // smooth keyboard steering so taps are gentle and holds are full lock
    const target = st;
    if (Math.abs(target) < 0.01) input.steer += (0 - input.steer) * Math.min(1, dt * 10);
    else input.steer += (target - input.steer) * Math.min(1, dt * (Math.sign(target) !== Math.sign(input.steer) ? 9 : 4.5));
    input.throttle = thr; input.brake = brk; input.handbrake = hb;
  }
  const gpPrev = {};
  // touch buttons
  [['t-left', 'left'], ['t-right', 'right'], ['t-gas', 'gas'], ['t-brake', 'brake'], ['t-hb', 'hb']].forEach(([id, k]) => {
    const b = $(id);
    const on = e => { e.preventDefault(); touch[k] = true; b.classList.add('on'); SND.start(); };
    const off = e => { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
  $('t-act').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
  $('t-menu').addEventListener('pointerdown', e => { e.preventDefault(); if (mode === 'photo') togglePhoto(); else openPause(); });
  $('prompt').addEventListener('click', () => interact());
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ------------------------------------------------------------- toasts ---
  function toast(msg, kind = '', ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.innerHTML = msg;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }
  function repText(list) { return (list || []).filter(r => r && r.n > 0).map(r => '+' + r.n + ' ' + D.REP[r.k].name).join(' · '); }

  // ------------------------------------------------------------- setup ---
  const view = $('view');
  function start() {
    use3d = R3.init(view);
    if (!use3d) { view.getContext('2d'); }
    resize();
    $('loading').classList.add('hidden');
    showTitle();
    requestAnimationFrame(loop);
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (use3d) R3.resize(w, h);
    else { const dpr = Math.min(2, devicePixelRatio || 1); view.width = w * dpr; view.height = h * dpr; }
  }
  addEventListener('resize', resize);

  function showTitle() {
    mode = 'title';
    $('title').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    const has = !!Sim.load(store.get(SAVE_KEY) || '');
    $('b-continue').classList.toggle('hidden', !has);
    $('b-new').className = has ? 'btn ghost' : 'btn';
    // a sunset backdrop while the title is up
    S = S || Sim.newGame();
    S.time = Math.floor(S.time / 1440) * 1440 + 17.9 * 60;
    if (!car) spawnCar(Sim.activeCar(S), W.place.marina.x - 30, W.place.marina.z + 60, -2.2);
  }
  $('b-new').addEventListener('click', () => {
    if (store.get(SAVE_KEY) && !confirm('Start a new game? Your saved progress will be replaced.')) return;
    S = Sim.newGame(); begin(true);
  });
  $('b-continue').addEventListener('click', () => { S = Sim.load(store.get(SAVE_KEY)); begin(false); });
  function begin(fresh) {
    SND.start(); SND.setOn(prefs.sound);
    $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
    if (isTouch) $('touch').classList.remove('hidden');
    spawnCar(Sim.activeCar(S), W.spawn.x, W.spawn.z, W.spawn.h);
    traffic = []; event = null; mode = 'drive';
    if (use3d) R3.resetCam();
    refreshMarkers();
    if (fresh) {
      openDialogue('ahmed', [
        'Welcome to Ras Hadid. So you\'re the one who rented the unit next to mine. That\'s your Kestrel? It runs, mostly.',
        'Here is how it works on this island. Nobody puts the good cars in an advert. You hear about them over karak at a café, from a collector, from someone at the parts yard. Then you go looking.',
        'Start small. Mariam at the parts yard up the road pays for parts runs, and the circuit at Al Rimal runs time trials every day. When you have some money, go and see Hassan at Qahwat Al Lulu in the old quarter. He worked the oil field for forty years and he knows where things are buried.',
      ]);
    }
  }
  function spawnCar(owned, x, z, h) {
    car = Sim.makeCar(owned, x, z, h);
    if (use3d) R3.setPlayer(owned);
  }
  function save() { if (S && mode !== 'title') { store.set(SAVE_KEY, Sim.save(S)); lastSave = playTime; } }
  function savePrefs() { store.set(PREF_KEY, JSON.stringify(prefs)); }

  // ------------------------------------------------------------- traffic ---
  const T_ROADS = W.roads.filter(r => r.traffic);
  const T_SPEED = { highway: 25, causeway: 20, boulevard: 15, street: 12 };
  function laneOffset(r) { return r.type === 'highway' ? r.w * 0.27 : r.type === 'boulevard' ? r.w * 0.27 : r.w * 0.23; }
  function spawnTraffic() {
    for (let tries = 0; tries < 6; tries++) {
      const r = T_ROADS[(rnd() * T_ROADS.length) | 0], s = rnd() * r.len, p = W.pointAt(r, s);
      const d = Math.hypot(p.x - car.x, p.z - car.z);
      if (d < 140 || d > 520) continue;
      const dir = rnd() < 0.5 ? 1 : -1;
      if (traffic.some(t => t.r === r && Math.abs(t.s - s) < 25)) continue;
      const v = (T_SPEED[r.type] || 12) * (0.85 + rnd() * 0.3);
      traffic.push({ r, s, dir, v, vmax: v, x: p.x, z: p.z, h: 0, stop: 0, braking: false });
      return;
    }
  }
  function updateTraffic(dt) {
    const want = event && (event.type === 'tt' || event.type === 'drag') ? 0 : (W.zoneAt(car.x, car.z) === 'desert' ? 6 : 16);
    if (traffic.length < want && rnd() < 0.3) spawnTraffic();
    for (let i = traffic.length - 1; i >= 0; i--) {
      const t = traffic[i];
      if (t.drag) continue;
      const far = Math.hypot(t.x - car.x, t.z - car.z) > 650;
      const end = !t.r.closed && (t.s < 2 || t.s > t.r.len - 2);
      if (far || end || traffic.length > want + 2) { traffic.splice(i, 1); continue; }
      // follow: slow for the car ahead in the same lane, and for the player
      let gap = 1e9;
      const fx = Math.sin(t.h), fz = -Math.cos(t.h);
      const check = (x, z) => { const dx = x - t.x, dz = z - t.z, ahead = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx); if (ahead > 0 && lat < 3.2) gap = Math.min(gap, ahead); };
      traffic.forEach(o => { if (o !== t) check(o.x, o.z); });
      check(car.x, car.z);
      let target = gap < 9 ? 0 : gap < 30 ? t.vmax * (gap - 9) / 21 : t.vmax;
      if (t.stop > 0) { t.stop -= dt; target = 0; }
      t.braking = target < t.v - 0.5;
      t.v += Math.max(-8 * dt, Math.min(2.5 * dt, target - t.v));
      t.s += t.dir * t.v * dt;
      const p = W.pointAt(t.r, t.s), off = laneOffset(t.r) * t.dir;
      const dx = p.dx * t.dir, dz = p.dz * t.dir;
      t.x = p.x - p.dz * off; t.z = p.z + p.dx * off;
      const nh = Math.atan2(dx, -dz);
      let dh = nh - t.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); t.h += dh * Math.min(1, dt * 8);
      // contact with the player
      const cdx = car.x - t.x, cdz = car.z - t.z, cd = Math.hypot(cdx, cdz);
      if (cd < 3.4 && cd > 0.01) {
        const nx = cdx / cd, nz = cdz / cd, push = 3.4 - cd;
        car.x += nx * push; car.z += nz * push;
        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) { car.vx -= 1.4 * vn * nx; car.vz -= 1.4 * vn * nz; }
        car.vx += nx * t.v * 0.3; car.vz += nz * t.v * 0.3;
        if (t.stop <= 0) { SND.thud(Math.abs(vn) + 4); t.stop = 2.5; }
      }
    }
  }

  // -------------------------------------------------------------- places ---
  const PLACE_ACTION = {
    workshop: 'Open your garage', yard: 'Talk to Mariam', cafe: 'Talk to Hassan', familygarage: 'Talk to Jassim', showroom: 'Visit Bay Motors',
    marina: 'Talk to Yousif', paddock: 'Talk to Rania', drag: 'Talk to Khalid', camp: 'Talk to Noor', boatyard: 'Talk to Abu Faisal',
  };
  const PLACE_ICON = { workshop: 'W', yard: 'P', cafe: 'C', familygarage: 'G', showroom: 'S', marina: 'M', paddock: 'T', drag: 'D', camp: 'K', boatyard: 'B' };
  function nearby() {
    const spd = Sim.speed(car);
    if (event && event.type !== 'parts') return null;
    for (const [id, L] of Object.entries(D.LEADS)) {
      const st = S.leads[id];
      if (st === 'done') continue;
      if (Math.hypot(car.x - L.spot.x, car.z - L.spot.z) < 9) return { kind: 'find', id, label: st === 'found' ? 'Look at the ' + D.CAR[L.car].name : st === 'active' ? 'Lift the cover' : 'Look under the cover' };
    }
    for (const p of W.places) if (Math.hypot(car.x - p.x, car.z - p.z) < p.r) {
      if (spd > 6) return { kind: 'slow' };
      return { kind: 'place', id: p.id, label: PLACE_ACTION[p.id] };
    }
    return null;
  }
  function interact() {
    if (mode !== 'drive' || panelOpen) return;
    const n = nearby();
    if (!n || n.kind === 'slow') return;
    SND.ui();
    if (n.kind === 'find') return openFind(n.id);
    if (n.id === 'workshop') return openGarage();
    if (n.id === 'showroom') return openShowroom();
    const pid = Object.keys(D.PEOPLE).find(k => D.PEOPLE[k].place === n.id);
    if (pid) talk(pid);
  }

  // ---------------------------------------------------------------- panel ---
  function openPanel(html, narrow) {
    panelOpen = true;
    $('card').className = 'card' + (narrow ? ' narrow' : '');
    $('card').innerHTML = html;
    $('panel').classList.remove('hidden');
    $('prompt').classList.add('hidden');
    const first = $('card').querySelector('.opt:not([disabled]), .btn:not([disabled])');
    if (first && !isTouch) first.classList.add('sel');
    $('card').scrollTop = 0;
    // forget handlers whose buttons are gone
    const live = new Set([...$('card').querySelectorAll('[data-act]')].map(b => b.dataset.act));
    for (const k of Object.keys(ACTS)) if (!live.has(k)) delete ACTS[k];
  }
  function closePanel() {
    panelOpen = false; $('panel').classList.add('hidden');
    if (mode === 'garage') mode = 'drive';
    save();
  }
  $('panel').addEventListener('pointerdown', e => { if (e.target === $('panel')) closePanel(); });
  function selectable() { return [...$('card').querySelectorAll('.opt:not([disabled]), .btn:not([disabled])')]; }
  function moveSel(d) {
    const list = selectable(); if (!list.length) return;
    let i = list.findIndex(b => b.classList.contains('sel'));
    list.forEach(b => b.classList.remove('sel'));
    i = (i + d + list.length) % list.length; list[i].classList.add('sel'); list[i].scrollIntoView({ block: 'nearest' });
  }
  function clickSelected() { const b = $('card').querySelector('.sel'); if (b) b.click(); }
  function panelKey(e) {
    if (e.code === 'Escape') { e.preventDefault(); closePanel(); }
    else if (e.code === 'ArrowDown' || e.code === 'Tab' && !e.shiftKey) { e.preventDefault(); moveSel(1); }
    else if (e.code === 'ArrowUp' || e.code === 'Tab' && e.shiftKey) { e.preventDefault(); moveSel(-1); }
    else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); clickSelected(); }
    else if (e.code === 'KeyM' && $('mapcv')) closePanel();
  }
  // buttons carry data-act; one delegated handler runs them
  const ACTS = {};
  let actN = 0;
  function act(fn) { const id = 'a' + (actN++); ACTS[id] = fn; return `data-act="${id}"`; }
  $('card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    SND.ui();
    const f = ACTS[b.dataset.act]; if (f) f(b);
  });
  function option(label, fn, sub, disabled) { return `<button class="opt" ${disabled ? 'disabled' : act(fn)}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`; }
  const closeBtn = () => `<button class="close" ${act(closePanel)} aria-label="Close">×</button>`;

  // ------------------------------------------------------------ dialogue ---
  function header(pid) { const p = D.PEOPLE[pid]; return `${closeBtn()}<h2>${esc(p.name)}</h2><div class="role">${esc(p.role)} · ${esc(W.place[p.place].name)}</div>`; }
  function openDialogue(pid, lines, opts, i = 0) {
    const last = i >= lines.length - 1;
    openPanel(header(pid) + `<div class="say">${lines[i]}</div><div class="opts">` +
      (last ? (opts || option('Thanks', closePanel)) : option('Go on', () => openDialogue(pid, lines, opts, i + 1))) + '</div>', true);
  }
  function waitOption(h, label) {
    return option(label || ('Wait here until ' + String(h).padStart(2, '0') + ':00'), () => { Sim.waitUntil(S, h); toast('It is now ' + Sim.clockText(S)); closePanel(); });
  }
  const GREET = {
    mariam: ['Salam. Looking for parts or looking for work?', 'You again. The yard\'s busy, so make it quick.', 'Ahlan. I set aside a few things you might like.'],
    hassan: ['Ahlan, sit down. The karak here is the best in the quarter.', 'Ah, my young friend. Sit, sit.', 'Every car has a story. Most of them I was there for.'],
    jassim: ['Salam alaikum. You are welcome in the quarter.', 'My father kept this garage swept every Friday until he was ninety.'],
    rania: ['Hi! Track\'s open. Helmet on and let\'s see a lap.', 'Kerbs are your friend at the last hairpin. Not at turn one.'],
    khalid: ['Lanes are hot tonight. You racing or watching?', 'Reaction time wins more races than horsepower. Watch the last amber.'],
    noor: ['Welcome to the camp. Coffee is on the fire.', 'Soft sand today. Keep your momentum and don\'t fight the wheel.'],
    yousif: ['Good evening. A beautiful night for cars.', 'Have you brought me something interesting?'],
    abu_faisal: ['Ahlan wa sahlan. Mind the slipway, it\'s slippery.', 'Dhows and engines, my whole life. What can I do for you?'],
  };
  function leadOptions(pid) {
    let out = '';
    for (const [id, L] of Object.entries(D.LEADS)) {
      if (L.npc !== pid) continue;
      const st = Sim.leadState(S, id);
      if (st === 'available') out += option('“Heard of anything interesting?”', () => giveLead(pid, id), 'New lead');
      else if (st === 'active') out += option('About “' + esc(L.title) + '”…', () => openDialogue(pid, ['Still looking? ' + esc(L.text)], option('I\'ll keep looking', () => { closePanel(); openMap({ x: L.area.x, z: L.area.z }); })), 'Remind me');
      else if (st === 'locked') out += option('“Heard of anything interesting?”', () => openDialogue(pid, [lockedLine(pid, id)]), 'Not yet: ' + Sim.leadNeeds(S, id).join(', '), false);
    }
    return out;
  }
  function lockedLine(pid, id) {
    const need = Sim.leadNeeds(S, id).join(' and ');
    return {
      hassan: 'Maybe. But first show me you can bring an old car back. (' + need + ')',
      mariam: 'Perhaps. Do a few jobs for me first, and let people see you treat old cars properly. (' + need + ')',
      jassim: 'There is something. But I need to know you restore cars properly, with original parts. Come back when the classic crowd talks about you. (' + need + ')',
      rania: 'Get a gold medal on my time trial and we\'ll talk. (' + need + ')',
      khalid: 'Keep winning down the strip. When the drag crowd knows your name, I\'ll tell you a story. (' + need + ')',
      noor: 'Spend more time in the desert first. (' + need + ')',
      yousif: 'We\'ve only just met. Show your cars at the gatherings and let people get to know you. (' + need + ')',
      abu_faisal: 'Perhaps. Noor tells me who the desert people trust. Ask her about me later. (' + need + ')',
    }[pid] || need;
  }
  function giveLead(pid, id) {
    const L = D.LEADS[id];
    openDialogue(pid, [esc(L.text)], option('“I\'ll find it.”', () => {
      Sim.takeLead(S, id); SND.good();
      toast('<b>New lead:</b> ' + esc(L.title) + ' · search the gold circle on the map', 'good', 4500);
      refreshMarkers(); save(); closePanel();
    }));
  }
  function talk(pid) {
    const p = D.PEOPLE[pid];
    if (!Sim.present(S, pid)) {
      const [a] = p.hours;
      openPanel(header(pid) + `<div class="say">${esc(p.name)} isn't here right now. ${pid === 'khalid' ? 'Drag nights run from 19:00 to 03:00.' : 'Come back from ' + a + ':00.'}</div><div class="opts">${waitOption(a)}${option('Leave', closePanel)}</div>`, true);
      return;
    }
    const g = GREET[pid] || ['Salam.'];
    let opts = leadOptions(pid);
    if (pid === 'mariam') {
      opts = (event && event.type === 'parts' ? option('Cancel the parts run', () => { endEvent(); toast('Parts run cancelled.'); closePanel(); }) : option('Parts run', () => offerParts(), 'Deliver parts across the island against the clock')) + opts;
      opts += option('Restoration discount', () => openDialogue(pid, ['The more the classic crowd respects you, the better my prices. Right now you get ' + Math.round(Math.min(20, S.rep.classics / 4)) + '% off restoration parts.']));
    }
    if (pid === 'hassan') {
      const meet = Sim.hour(S) >= 20 || Sim.hour(S) < 2;
      opts += option('Show your ' + D.CAR[car.owned.id].name + ' at the café meet', () => doShow('cafe'), meet ? 'The night meet is on' : 'The café meet runs from 20:00 to 02:00', !meet);
      if (!meet) opts += waitOption(20, 'Wait for the night meet (20:00)');
    }
    if (pid === 'rania') {
      opts = option('Time trial: one flying lap', () => startTT(), `Gold ${fmtT(Sim.MEDALS.gold)} · Silver ${fmtT(Sim.MEDALS.silver)} · Bronze ${fmtT(Sim.MEDALS.bronze)}${S.best[car.owned.id] ? ' · Your best in this car ' + fmtT(S.best[car.owned.id]) : ''}`) + opts;
    }
    if (pid === 'khalid') {
      const tier = D.DRAG_TIERS[Math.min(S.dragTier, D.DRAG_TIERS.length - 1)];
      opts = option('Race ' + esc(tier.name), () => startDrag(), `Quarter mile · their best is ${tier.et.toFixed(1)} s · purse ${fmt(tier.purse)} · entry ${fmt(50)}`, S.money < 50) + opts;
    }
    if (pid === 'noor') {
      opts = option('Desert run to the lone tree and back', () => startDesert(), `Gold ${fmtT(Sim.DESERT_MEDALS.gold)} · Silver ${fmtT(Sim.DESERT_MEDALS.silver)} · Bronze ${fmtT(Sim.DESERT_MEDALS.bronze)}${S.desertBest ? ' · Your best ' + fmtT(S.desertBest) : ''}`) + opts;
    }
    if (pid === 'yousif') {
      const gath = Sim.gathering(S);
      opts += option('Show your ' + D.CAR[car.owned.id].name, () => doShow('marina'), gath ? 'The Friday gathering is on: the collectors are all here' : 'Better on Friday evenings, when the collectors gather');
      opts += option('Sell a car to Yousif', () => openSell('yousif'), 'He pays well for rare cars in good condition');
      if (!gath) opts += option('Wait for the Friday gathering', () => { Sim.waitUntil(S, 17, 5); toast('Friday evening at the marina'); closePanel(); });
    }
    if (pid === 'abu_faisal' && !opts) opts += option('Ask about the boatyard', () => openDialogue(pid, ['We still build and repair dhows here the old way, with teak and hand-sewn planks. The engines are newer. Mostly.']));
    if (pid === 'jassim' && !opts) opts += option('Ask about the quarter', () => openDialogue(pid, ['Lulu means pearl. Before oil, every family here lived from the pearl banks. The houses kept cool with wind towers. Some still do.']));
    openPanel(header(pid) + `<div class="say">${g[(Math.random() * g.length) | 0]}</div><div class="opts">${opts}${option('Leave', closePanel)}</div>`, true);
  }
  function doShow(where) {
    const r = Sim.showCar(S, car.owned, where);
    if (!r.ok) { toast(r.why, 'bad'); return; }
    const t = repText(r.rep);
    SND.good(); toast('People gather round your ' + D.CAR[car.owned.id].name + '. ' + (t || 'They\'ve seen better.'), 'good');
    afterRep(); closePanel();
  }
  function afterRep() { checkNewLeads(); save(); }
  const seenAvailable = new Set();
  function checkNewLeads() {
    for (const id of Object.keys(D.LEADS)) if (Sim.leadState(S, id) === 'available' && !seenAvailable.has(id)) {
      seenAvailable.add(id);
      if (D.LEADS[id].needs && Object.keys(D.LEADS[id].needs).length) toast(esc(D.PEOPLE[D.LEADS[id].npc].name) + ' may have something for you now.', 'good', 4500);
    }
  }

  // -------------------------------------------------------------- finds ---
  function openFind(id) {
    const L = D.LEADS[id], C = D.CAR[L.car], st = S.leads[id];
    if (st !== 'active' && st !== 'found') {
      openPanel(`${closeBtn()}<h2>Under a dust cover</h2><div class="say">A car-shaped shape under a sun-bleached cover. Whoever owns it hasn't been here in years. Someone on the island must know its story.</div><div class="opts">${option('Leave it be', closePanel)}</div>`, true);
      return;
    }
    if (st === 'active') {
      Sim.discover(S, id); SND.find();
      toast('<b>Discovered:</b> ' + esc(C.name) + ' <span class="rar" style="color:' + D.RARITY[C.rarity].color + '">' + D.RARITY[C.rarity].name + '</span>', 'good', 5000);
      refreshMarkers(); save();
    }
    const img = use3d ? R3.snapshot(C.id, C.condition) : null;
    const k = C.condition;
    const cond = Object.entries(D.COMPONENTS).map(([cid, comp]) => `<div class="hint">${comp.name}</div>${bar(k[cid])}`).join('');
    openPanel(`${closeBtn()}<h2>${esc(C.name)}</h2><div class="role">${C.year} · <span class="rar" style="color:${D.RARITY[C.rarity].color}">${D.RARITY[C.rarity].name}</span> · ${D.SETS[C.set].name}</div>
      ${img ? `<img src="${img}" style="width:100%;max-height:220px;object-fit:contain" alt="">` : ''}
      <p>${esc(C.desc)}</p><div class="row" style="align-items:flex-start;gap:24px"><div style="flex:1;min-width:200px">${cond}</div>
      <div class="kv" style="flex:1;min-width:200px"><b>Owner</b><span>${esc(L.owner)}</span><b>Asking</b><span>${fmt(L.price)}</span><b>Restored value</b><span>about ${fmt(C.value)}</span><b>Your money</b><span>${fmt(S.money)}</span><b>Workshop space</b><span>${S.garage.length} / ${Sim.capacity(S)}</span></div></div>
      <div class="opts">${option('Buy it for ' + fmt(L.price), () => {
        const r = Sim.claimLead(S, id);
        if (!r.ok) { SND.bad(); toast(r.why, 'bad'); return; }
        SND.good(); toast('The ' + esc(C.name) + ' is on a truck to your workshop.', 'good', 4500);
        setsToast(r.sets); refreshMarkers(); afterRep(); closePanel();
      }, 'Delivered to your workshop', S.money < L.price || S.garage.length >= Sim.capacity(S))}${option('Not yet', closePanel)}</div>`);
  }
  function setsToast(sets) { (sets || []).forEach(sid => toast('<b>Set complete:</b> ' + D.SETS[sid].name + ' · ' + fmt(D.SETS[sid].reward.money) + ' reward', 'good', 6000)); }
  const bar = (v) => `<div class="bar ${v < 35 ? 'bad' : v < 70 ? 'warn' : ''}"><i style="width:${v}%"></i></div>`;

  // -------------------------------------------------------------- garage ---
  let garageSel = null;
  function openGarage(tab = 'cars') {
    mode = 'garage';
    car.vx = car.vz = car.w = 0;
    const ws = D.WORKSHOP[S.workshop - 1];
    if (!garageSel || !S.garage.find(g => g.uid === garageSel)) garageSel = car.owned.uid;
    const o = S.garage.find(g => g.uid === garageSel);
    const tabs = `<div class="tabs">${[['cars', 'Cars'], ['workshop', 'Workshop'], ['ahmed', 'Ask Ahmed'], ['rest', 'Rest']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" ${act(() => openGarage(k))}>${n}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'cars') {
      body = `<div class="grid">${S.garage.map(g => carCard(g, g.uid === garageSel, () => { garageSel = g.uid; openGarage('cars'); })).join('')}${S.garage.length < ws.capacity ? `<div class="carcard"><div class="unknown">+</div><div class="meta">Free bay (${S.garage.length} / ${ws.capacity})</div></div>` : ''}</div>`;
      body += carDetail(o);
    } else if (tab === 'workshop') {
      const next = D.WORKSHOP[S.workshop];
      body = `<div class="kv"><b>Level</b><span>${S.workshop}: ${ws.name}</span><b>Bays</b><span>${ws.capacity}</span><b>About</b><span>${ws.desc}</span></div>` +
        (next ? `<h3>Upgrade</h3><p>${esc(next.name)}: ${next.capacity} bays. ${esc(next.desc)}</p><div class="row"><button class="btn" ${S.money < ws.upgrade ? 'disabled' : act(() => { const r = Sim.upgradeWorkshop(S); if (r.ok) { SND.good(); toast('Workshop upgraded: ' + D.WORKSHOP[S.workshop - 1].name, 'good'); } openGarage('workshop'); })}>Upgrade for ${fmt(ws.upgrade)}</button></div>` : '<p>Your workshop is fully equipped.</p>') +
        `<h3>Reputation</h3>${repBars()}<h3>Stats</h3><div class="kv"><b>Distance</b><span>${(S.stats.km / 1000).toFixed(1)} km</span><b>Events</b><span>${S.stats.events}</span><b>Restoration jobs</b><span>${S.stats.restored}</span><b>Register</b><span>${Object.values(S.register).filter(v => v === 'owned' || v === 'sold').length} / ${D.CARS.length} owned</span></div>`;
    } else if (tab === 'ahmed') {
      body = `<div class="say">${hint()}</div>`;
    } else if (tab === 'rest') {
      body = `<p>Time passes while you rest. Some people keep hours: Khalid's drag nights run 19:00 to 03:00, Yousif is at the marina from 16:00, and the collectors gather there on Friday evenings.</p><div class="opts">${waitOption(7, 'Sleep until morning (07:00)')}${waitOption(17, 'Rest until golden hour (17:00)')}${waitOption(20, 'Rest until evening (20:00)')}${option('Rest until Friday evening', () => { Sim.waitUntil(S, 17, 5); toast('Friday evening: the collectors gather at the marina.'); closePanel(); })}</div>`;
    }
    openPanel(`${closeBtn()}<h2>AFTERSHIFT workshop <span class="ar" style="font-size:16px;color:var(--sand2)">· ورشة أفترشفت</span></h2><div class="role">${fmt(S.money)} · ${Sim.clockText(S)} · ${esc(ws.name)}</div>${tabs}${body}`);
  }
  const snapCache = {};
  function snap(id, cond) {
    if (!use3d) return null;
    const key = id + ':' + (cond ? Object.values(cond).join(',') : '');
    if (!snapCache[key]) snapCache[key] = R3.snapshot(id, cond);
    return snapCache[key];
  }
  function carCard(g, sel, fn) {
    const C = D.CAR[g.id], img = snap(g.id, g.cond);
    return `<button class="carcard opt ${sel ? 'sel' : ''}" style="text-align:left" ${act(fn)}>${img ? `<img src="${img}" alt="">` : '<div class="unknown">🚗</div>'}<div class="nm">${esc(C.name)}</div><div class="meta"><span class="rar" style="color:${D.RARITY[C.rarity].color}">${D.RARITY[C.rarity].name}</span> · ${Math.round(Sim.condScore(g))}% · ${fmt(Sim.value(g))}${g.uid === car.owned.uid ? ' · <b style="color:var(--sand)">driving</b>' : ''}</div></button>`;
  }
  function carDetail(o) {
    const C = D.CAR[o.id], p = Sim.params(o);
    const comps = Object.entries(D.COMPONENTS).map(([cid, comp]) => {
      const qs = ['standard', 'original', 'performance'].map(m => [m, Sim.restoreQuote(S, o, cid, m)]);
      const q0 = qs[0][1];
      const btns = q0.ok ? qs.filter(([m]) => m !== 'performance' || cid === 'engine' || cid === 'tyres').map(([m, q]) => `<button class="btn ${m === 'standard' ? '' : 'ghost'}" ${S.money < q.cost ? 'disabled' : act(() => doRestore(o, cid, m))} title="${m === 'original' ? 'Original parts keep the car authentic, which collectors pay for' : m === 'performance' ? 'Faster, but less original' : 'Good-quality replacement parts'}">${m === 'standard' ? '+' + q.gain + '%' : m === 'original' ? 'Original' : 'Performance'} ${fmt(q.cost)}</button>`).join('') : `<span class="hint">${q0.why}</span>`;
      return `<div class="comp"><div><b>${comp.name}</b><br><span class="hint">${o.cond[cid]}%${o.perf[cid] ? ' · performance parts' : ''} · ${comp.hours} h per step</span></div>${bar(o.cond[cid])}<div class="btns">${btns}</div></div>`;
    }).join('');
    const driving = o.uid === car.owned.uid;
    return `<h3>${esc(C.name)} · ${C.year}</h3><p class="hint">${esc(C.desc)}</p>
      <div class="kv"><b>Value now</b><span>${fmt(Sim.value(o))} (restored: about ${fmt(C.value)})</span><b>Power</b><span>${Math.round(p.power / 1000 * 1.341)} hp${o.tune ? ' (tuned)' : ''} · ${C.drive} · ${C.mass} kg</span><b>Originality</b><span>${o.originality}%</span><b>Set</b><span>${D.SETS[C.set].name}</span></div>
      <h3>Restoration</h3>${comps}
      <div class="row" style="margin-top:14px">${driving ? '<span class="hint">You are driving this car.</span>' : `<button class="btn" ${act(() => { switchCar(o); })}>Drive this car</button>`}
      ${S.workshop >= 3 && !o.tune ? `<button class="btn ghost" ${act(() => { const r = Sim.tune(S, o.uid); toast(r.ok ? 'Tuned on the dyno for ' + fmt(r.cost) : r.why, r.ok ? 'good' : 'bad'); openGarage('cars'); })}>Dyno tune</button>` : ''}</div>`;
  }
  function doRestore(o, cid, m) {
    const r = Sim.restore(S, o.uid, cid, m);
    if (!r.ok) { SND.bad(); toast(r.why, 'bad'); return; }
    SND.good();
    toast(D.COMPONENTS[cid].name + ' +' + r.gain + '% · ' + fmt(r.cost) + (repText(r.rep) ? ' · ' + repText(r.rep) : ''), 'good');
    if (o.uid === car.owned.uid) { car.p = Sim.params(o); if (use3d) R3.setPlayer(o); }
    afterRep();
    openGarage('cars');
  }
  function switchCar(o) {
    S.active = o.uid;
    const ws = W.place.workshop;
    spawnCar(o, ws.x, ws.z - 10, 0);
    toast('Now driving the ' + D.CAR[o.id].name);
    openGarage('cars');
  }
  function repBars() { return Object.entries(D.REP).map(([k, r]) => `<div class="rep"><span>${r.name} <span class="ar" style="color:var(--muted);font-size:12px">${r.nameAr}</span></span><div class="bar"><i style="width:${S.rep[k]}%"></i></div><b>${S.rep[k]}</b></div>`).join(''); }

  // --------------------------------------------------------- hints / goal ---
  function hint() {
    const H = [];
    if (!S.stats.events) H.push('Earn your first dinars. Mariam at the parts yard pays for parts runs, and Rania runs time trials at Al Rimal circuit to the south.');
    if (!Object.keys(S.leads).length) H.push('Go and see Hassan at Qahwat Al Lulu in the old quarter, north-west of here. He has stories about the old oil field.');
    const lead = Object.entries(S.leads).find(([, v]) => v === 'active');
    if (lead) H.push('You have a lead: “' + D.LEADS[lead[0]].title + '”. Drive into the gold circle on the map and look for a car under a cover.');
    const found = Object.entries(S.leads).find(([, v]) => v === 'found');
    if (found) H.push('You found the ' + D.CAR[D.LEADS[found[0]].car].name + '. Go back to it when you have ' + fmt(D.LEADS[found[0]].price) + ' and a free bay.');
    if (S.garage.length >= Sim.capacity(S)) H.push('Your workshop is full. Sell a car at Bay Motors or to Yousif, or upgrade the workshop.');
    if (S.rep.classics < 40 && S.garage.some(g => Sim.condScore(g) < 95)) H.push('Fully restore a car (95% or more) to earn respect from the classic crowd. Original parts earn the most.');
    if (S.rep.drag < 30) H.push('Drag nights at the strip run from 19:00. Win to earn the drag crowd\'s respect.');
    if (S.rep.offroad < 25) H.push('Noor runs desert runs from her camp. Something with four-wheel drive helps in soft sand.');
    if (S.rep.collectors < 45) H.push('Show clean, rare cars at the marina on Friday evenings to win over the collectors.');
    H.push('Keep exploring. The register (Esc, then Register) shows what you have found and what is still out there.');
    return H.slice(0, 3).map(esc).join('<br><br>');
  }
  function objective() {
    if (event) return event.label || '';
    const lead = Object.entries(S.leads).find(([, v]) => v === 'active');
    if (lead) return '<b>Lead:</b> ' + esc(D.LEADS[lead[0]].title) + ' · search the gold circle';
    const found = Object.entries(S.leads).find(([, v]) => v === 'found');
    if (found) { const L = D.LEADS[found[0]]; return '<b>Found:</b> ' + esc(D.CAR[L.car].name) + ' · ' + fmt(L.price) + ' to buy'; }
    if (!S.stats.events) return 'Earn some money: a parts run at <b>Al-Sayed Parts</b> or a lap at <b>Al Rimal</b>';
    if (!Object.keys(S.leads).length) return 'Find <b>Hassan</b> at Qahwat Al Lulu, in the old quarter';
    return 'Explore, race and listen for leads';
  }

  // ------------------------------------------------------------ showroom ---
  function openShowroom(tab = 'buy') {
    const list = D.CARS.filter(c => c.source.type === 'showroom');
    const tabs = `<div class="tabs"><button class="${tab === 'buy' ? 'on' : ''}" ${act(() => openShowroom('buy'))}>Buy</button><button class="${tab === 'sell' ? 'on' : ''}" ${act(() => openShowroom('sell'))}>Trade in</button></div>`;
    let body = '';
    if (tab === 'buy') {
      body = `<div class="grid">${list.map(c => {
        const img = snap(c.id, c.condition);
        const can = S.money >= c.source.price && S.garage.length < Sim.capacity(S);
        return `<div class="carcard">${img ? `<img src="${img}" alt="">` : ''}<div class="nm">${esc(c.name)}</div><div class="meta">${c.year} · <span class="rar" style="color:${D.RARITY[c.rarity].color}">${D.RARITY[c.rarity].name}</span> · ${c.drive} · ${Math.round(c.power * 1.341)} hp</div><div class="meta" style="margin:6px 0">${esc(c.desc)}</div><button class="btn" ${can ? act(() => { const r = Sim.buy(S, c.id, c.source.price); if (r.ok) { SND.good(); toast('Bought the ' + esc(c.name) + '. It will be waiting at your workshop.', 'good'); setsToast(r.sets); save(); } else toast(r.why, 'bad'); openShowroom('buy'); }) : 'disabled'}>${fmt(c.source.price)}</button></div>`;
      }).join('')}</div><p class="hint">${S.garage.length} / ${Sim.capacity(S)} bays used at your workshop.</p>`;
    } else body = sellList('showroom');
    openPanel(`${closeBtn()}<h2>Bay Motors <span class="ar" style="font-size:16px;color:var(--sand2)">· باي موتورز</span></h2><div class="role">Salman, showroom manager · ${fmt(S.money)}</div>${tabs}${body}`);
  }
  function sellList(buyer) {
    const cars = S.garage.filter(g => g.uid !== car.owned.uid);
    if (!cars.length) return '<p>You can\'t sell the car you are driving. Switch cars at your workshop first.</p>';
    return `<div class="grid">${cars.map(g => { const C = D.CAR[g.id], pr = Sim.sellPrice(S, g, buyer), img = snap(g.id, g.cond); return `<div class="carcard">${img ? `<img src="${img}" alt="">` : ''}<div class="nm">${esc(C.name)}</div><div class="meta">${Math.round(Sim.condScore(g))}% · worth ${fmt(Sim.value(g))}</div><button class="btn" style="margin-top:6px" ${act(() => { if (!confirm('Sell the ' + C.name + ' for ' + fmt(pr) + '?')) return; const r = Sim.sell(S, g.uid, buyer); if (r.ok) { SND.good(); toast('Sold for ' + fmt(r.price) + (repText(r.rep) ? ' · ' + repText(r.rep) : ''), 'good'); afterRep(); } buyer === 'yousif' ? openSell('yousif') : openShowroom('sell'); })}>Sell for ${fmt(pr)}</button></div>`; }).join('')}</div>`;
  }
  function openSell(buyer) { openPanel(`${closeBtn()}<h2>Sell to Yousif</h2><div class="role">He pays more for rare cars, and more again as the collectors come to trust you.</div>${sellList(buyer)}`); }

  // ------------------------------------------------------------- events ---
  const fmtT = t => t == null ? '–' : Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');
  function endEvent() { event = null; traffic = traffic.filter(t => !t.drag); $('hud-event').innerHTML = ''; $('tree').classList.add('hidden'); refreshMarkers(); }

  // time trial: a rolling start from the last corner, one flying lap through 12 gates
  function startTT() {
    closePanel();
    const c = W.circuit, s0 = c.len - 140, p = W.pointAt(c, s0);
    car.x = p.x; car.z = p.z; car.h = Math.atan2(p.dx, -p.dz); car.vx = car.vz = car.w = 0; car.steer = 0;
    traffic = [];
    event = { type: 'tt', state: 'out', t: 0, gate: 0, gates: 12, label: '<b>Time trial</b> · cross the line to start your lap' };
    if (use3d) R3.resetCam();
    refreshMarkers();
  }
  function circuitS() {
    const r = W.roadAt(car.x, car.z, 40);
    return r && r.road === W.circuit ? r : null;
  }
  function updateTT(dt) {
    const e = event, c = W.circuit, r = circuitS();
    if (e.state === 'lap') e.t += dt;
    if (r) {
      const s = r.s;
      if (e.prevS != null && e.prevS > c.len - 60 && s < 60) {
        if (e.state === 'out') { e.state = 'lap'; e.t = 0; e.gate = 1; SND.go(); toast('Lap started', 'good', 1500); }
        else if (e.state === 'lap') {
          if (e.gate >= e.gates) return finishTT(e.t);
          toast('Lap not counted: you missed part of the track', 'bad'); e.t = 0; e.gate = 1;
        }
      }
      if (e.state === 'lap' && e.gate < e.gates && s > e.gate * c.len / e.gates && s < e.gate * c.len / e.gates + 80) e.gate++;
      e.prevS = s;
    }
    const best = S.best[car.owned.id];
    $('hud-event').innerHTML = e.state === 'lap' ? `<div class="big">${fmtT(e.t)}</div><div class="sub">Gold ${fmtT(Sim.MEDALS.gold)} · Silver ${fmtT(Sim.MEDALS.silver)} · Bronze ${fmtT(Sim.MEDALS.bronze)}${best ? ' · Best ' + fmtT(best) : ''}</div>` : '<div class="sub">Rolling start: cross the start line to begin</div>';
  }
  function finishTT(t) {
    const res = Sim.timeTrialResult(S, car.owned.id, t);
    SND.good();
    const med = res.medal ? `<b style="color:${{ gold: '#f5c542', silver: '#d6dde3', bronze: '#d08a4c' }[res.medal]}">${res.medal[0].toUpperCase() + res.medal.slice(1)} medal</b>` : 'No medal this time';
    event.state = 'out'; event.prevS = 0;
    openPanel(`<h2>${fmtT(t)}</h2><div class="role">Time trial · ${esc(D.CAR[car.owned.id].name)}${res.newBest ? ' · new personal best' : ''}</div><div class="say">${med}. ${res.pay ? 'You earned ' + fmt(res.pay) + '.' : ''} ${repText(res.rep)}</div>
      <div class="opts">${option('Another lap', () => { closePanel(); startTT(); })}${option('Back to the paddock', () => { closePanel(); endEvent(); const p = W.place.paddock; car.x = p.x; car.z = p.z + 12; car.vx = car.vz = 0; car.h = Math.PI / 2; })}</div>`, true);
    afterRep();
  }

  // drag: a christmas tree start against the current opponent, quarter mile north
  const DRAG = { x: 1250, z0: 2005, len: 402.3 };
  function startDrag() {
    closePanel();
    const tier = D.DRAG_TIERS[Math.min(S.dragTier, D.DRAG_TIERS.length - 1)];
    car.x = DRAG.x - 4; car.z = DRAG.z0; car.h = 0; car.vx = car.vz = car.w = 0; car.steer = 0;
    traffic = [{ drag: true, x: DRAG.x + 4, z: DRAG.z0, h: 0, v: 0, braking: false, r: null }];
    event = { type: 'drag', state: 'stage', t: 0, tier, label: '<b>Drag race</b> vs ' + esc(tier.name) + ' · launch on green', lights: 0 };
    toast('Off the throttle. Launch on the green light.', '', 2200);
    $('tree').classList.remove('hidden');
    if (use3d) R3.resetCam();
    refreshMarkers();
  }
  function updateDrag(dt) {
    const e = event, opp = traffic.find(t => t.drag);
    e.t += dt;
    const tree = [...$('tree').children];
    if (e.state === 'stage') {
      const n = Math.floor(e.t / 0.5);
      tree.forEach((l, i) => { l.className = i < Math.min(3, n) ? 'amber' : ''; });
      if (n !== e.lights && n <= 3) { e.lights = n; if (n > 0 && n < 4) SND.light(); }
      if (n >= 1 && n < 4 && input.throttle > 0.2) { e.state = 'done'; tree.forEach(l => { l.className = 'red'; }); return dragDone(false, null, 'Red light! You went before the green.'); }
      if (n >= 4) { e.state = 'run'; e.t = 0; SND.go(); tree.forEach((l, i) => { l.className = i === 3 ? 'green' : ''; }); }
      car.vx = car.vz = car.w = 0; car.x = DRAG.x - 4; car.z = DRAG.z0; car.h = 0;   // held on the brakes until green
      if (e.state === 'stage') return;
    }
    if (e.state === 'run') {
      if (e.t > 1.2) $('tree').classList.add('hidden');
      // opponent: reaction 0.42 s, then covers the quarter in its ET
      const ot = Math.max(0, e.t - 0.42), et = e.tier.et;
      const d = ot < et ? DRAG.len * Math.pow(ot / et, 1.7) : DRAG.len + (ot - et) * DRAG.len * 1.7 / et;
      opp.z = DRAG.z0 - d; opp.v = ot < et ? DRAG.len * 1.7 * Math.pow(ot / et, 0.7) / et : 0;
      const pd = DRAG.z0 - car.z;
      if (pd >= DRAG.len && !e.playerT) { e.playerT = e.t; e.trap = Sim.speed(car) * 3.6; }
      const oppT = et + 0.42;
      if (e.playerT || e.t > oppT + 6) {
        e.state = 'done';
        const won = !!e.playerT && e.playerT < oppT;
        dragDone(won, e.playerT, null, oppT);
      }
      $('hud-event').innerHTML = `<div class="big">${e.t.toFixed(2)}</div><div class="sub">${Math.max(0, DRAG.len - (DRAG.z0 - car.z)).toFixed(0)} m to go</div>`;
    }
  }
  function dragDone(won, t, why, oppT) {
    const res = Sim.dragResult(S, won, t);
    won ? SND.good() : SND.bad();
    const tier = event.tier;
    setTimeout(() => {
      openPanel(`<h2>${won ? 'You win!' : 'You lose'}</h2><div class="role">Drag race vs ${esc(tier.name)}</div><div class="say">${why ? why : `Your time ${t ? t.toFixed(3) + ' s' : 'DNF'}${event && event.trap ? ' at ' + event.trap.toFixed(0) + ' km/h' : ''}. Their time ${oppT.toFixed(3)} s.`} ${won ? 'Purse ' + fmt(res.pay) + '. ' + repText(res.rep) : 'Entry fee ' + fmt(50) + '.'}</div>
        <div class="opts">${option('Run again', () => { closePanel(); startDrag(); }, 'Next: ' + esc(D.DRAG_TIERS[Math.min(S.dragTier, D.DRAG_TIERS.length - 1)].name), S.money < 50)}${option('Leave the strip', () => { closePanel(); endEvent(); const p = W.place.drag; car.x = p.x; car.z = p.z; car.vx = car.vz = 0; })}</div>`, true);
      afterRep();
    }, why ? 300 : 1200);
  }

  // desert run: checkpoints from the camp to the lone tree and back
  function startDesert() {
    closePanel();
    const c = W.place.camp;
    car.x = c.x - 10; car.z = c.z + 40; car.h = -Math.PI / 2; car.vx = car.vz = car.w = 0;
    event = { type: 'desert', state: 'run', t: 0, i: 0, label: '<b>Desert run</b> · through every gate to the lone tree and back' };
    toast('Go! Follow the gates.', 'good', 1500); SND.go();
    refreshMarkers();
  }
  function updateDesert(dt) {
    const e = event; e.t += dt;
    const g = W.desertRun[e.i];
    if (Math.hypot(car.x - g[0], car.z - g[1]) < 16) {
      e.i++; SND.light();
      if (e.i >= W.desertRun.length) {
        const res = Sim.desertResult(S, e.t);
        SND.good(); endEvent();
        openPanel(`<h2>${fmtT(e.t)}</h2><div class="role">Desert run · ${esc(D.CAR[car.owned.id].name)}</div><div class="say">${res.medal ? res.medal[0].toUpperCase() + res.medal.slice(1) + ' medal. ' : 'No medal. '}${res.pay ? 'You earned ' + fmt(res.pay) + '. ' : ''}${repText(res.rep)}</div><div class="opts">${option('Run again', () => { closePanel(); startDesert(); })}${option('Done', closePanel)}</div>`, true);
        afterRep(); return;
      }
      refreshMarkers();
    }
    $('hud-event').innerHTML = `<div class="big">${fmtT(e.t)}</div><div class="sub">Gate ${e.i + 1} of ${W.desertRun.length} · gold ${fmtT(Sim.DESERT_MEDALS.gold)}</div>`;
  }

  // parts runs from Mariam's yard
  function offerParts() {
    const job = Sim.partsJob(S, rnd), to = W.place[job.to];
    openDialogue('mariam', [`A customer at ${esc(to.name)} needs a gearbox mount, today. ${fmt(job.pay)} if you get it there inside ${Math.floor(job.limit / 60)}:${String(job.limit % 60).padStart(2, '0')}. Half if you're late.`],
      option('Take the job', () => { event = { type: 'parts', job, t: 0, label: '<b>Parts run</b> to ' + esc(to.name) }; closePanel(); refreshMarkers(); toast('Deliver to ' + esc(to.name) + ': follow the marker', 'good'); }) + option('Not now', closePanel));
  }
  function updateParts(dt) {
    const e = event, to = W.place[e.job.to]; e.t += dt;
    const left = e.job.limit - e.t;
    $('hud-event').innerHTML = `<div class="big" style="color:${left < 0 ? 'var(--red)' : '#fff'}">${left < 0 ? '+' : ''}${fmtT(Math.abs(left))}</div><div class="sub">to ${esc(to.name)} · ${(Math.hypot(car.x - to.x, car.z - to.z) / 1000).toFixed(1)} km</div>`;
    if (Math.hypot(car.x - to.x, car.z - to.z) < to.r + 6 && Sim.speed(car) < 6) {
      const pay = left >= 0 ? e.job.pay : Math.round(e.job.pay / 2);
      S.money += pay; S.stats.events++;
      SND.good(); toast('Delivered! ' + fmt(pay) + (left < 0 ? ' (late)' : ''), 'good');
      endEvent(); save();
    }
  }

  // ------------------------------------------------------------ markers ---
  function refreshMarkers() {
    const list = [];
    for (const [id, L] of Object.entries(D.LEADS)) if (S.leads[id] === 'active') list.push({ kind: 'area', x: L.area.x, z: L.area.z, r: L.area.r });
    if (event && event.type === 'desert') { const g = W.desertRun[event.i]; if (g) list.push({ kind: 'gate', x: g[0], z: g[1], r: 14, color: '#5fd0ff' }); }
    if (event && event.type === 'parts') { const p = W.place[event.job.to]; list.push({ kind: 'beacon', x: p.x, z: p.z, r: 2, color: '#5fd0ff' }); }
    if (!event) Object.entries(D.LEADS).forEach(([id, L]) => { if (S.leads[id] === 'found') list.push({ kind: 'beacon', x: L.spot.x, z: L.spot.z, r: 1.2 }); });
    if (use3d) R3.setMarkers(list);
  }
  function mapOverlays(forMini) {
    const ov = { areas: [], places: [], traffic: forMini ? traffic : [], player: car, gates: [] };
    for (const [id, L] of Object.entries(D.LEADS)) {
      if (S.leads[id] === 'active') ov.areas.push(L.area);
      if (S.leads[id] === 'found') ov.places.push({ x: L.spot.x, z: L.spot.z, icon: '★', color: '#c48a1c', label: forMini ? '' : D.CAR[L.car].name });
    }
    W.places.forEach(p => ov.places.push({ x: p.x, z: p.z, icon: PLACE_ICON[p.id], color: p.id === 'workshop' ? '#e8b45a' : '#1d1d1f', label: forMini ? '' : p.name, big: p.id === 'workshop' }));
    if (event && event.type === 'desert') ov.gates = W.desertRun.slice(event.i).map(g => ({ x: g[0], z: g[1] }));
    if (event && event.type === 'parts') { const p = W.place[event.job.to]; ov.gates = [{ x: p.x, z: p.z }]; }
    return ov;
  }

  // ---------------------------------------------------------------- map ---
  let mapView = null;
  function openMap(focus) {
    if (mode === 'title') return;
    mapView = { x: focus ? focus.x : car.x, z: focus ? focus.z : car.z, ppm: focus ? 0.55 : 0.32 };
    openPanel(`${closeBtn()}<h2>Map <span class="ar" style="font-size:16px;color:var(--sand2)">· الخريطة</span></h2><div class="role">Drag to pan, scroll or pinch to zoom. Gold circles are search areas for your leads.</div><canvas id="mapcv"></canvas>
      <div class="legend"><span>W your workshop</span><span>P parts yard</span><span>C café</span><span>G family garage</span><span>S showroom</span><span>M marina</span><span>T circuit paddock</span><span>D drag strip</span><span>K desert camp</span><span>B boatyard</span><span>★ found car</span></div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" ${act(() => { mapView.ppm *= 1.4; drawMap(); })}>Zoom in</button><button class="btn ghost" ${act(() => { mapView.ppm /= 1.4; drawMap(); })}>Zoom out</button><button class="btn ghost" ${act(() => { mapView.x = car.x; mapView.z = car.z; drawMap(); })}>Centre on me</button></div>`);
    const cv = $('mapcv');
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; mapView.x -= (e.clientX - drag.x) / mapView.ppm; mapView.z -= (e.clientY - drag.y) / mapView.ppm; drag = { x: e.clientX, y: e.clientY }; drawMap(); });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); mapView.ppm = Math.max(0.12, Math.min(3, mapView.ppm * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); drawMap(); }, { passive: false });
    drawMap();
  }
  function drawMap() {
    const cv = $('mapcv'); if (!cv) return;
    const dpr = cv.width / cv.getBoundingClientRect().width || 1;
    R2.draw(cv.getContext('2d'), cv.width, cv.height, mapView.x, mapView.z, mapView.ppm * dpr, 0, mapOverlays(false));
  }

  // -------------------------------------------------------------- pause ---
  function openPause(tab = 'menu') {
    if (mode === 'title') return;
    const tabs = `<div class="tabs">${[['menu', 'Menu'], ['register', 'Register'], ['leads', 'Leads'], ['rep', 'Reputation'], ['settings', 'Settings']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" ${act(() => openPause(k))}>${n}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'menu') body = `<div class="opts">${option('Resume', closePanel)}${option('Map', () => openMap())}${option('Back to the road', () => { closePanel(); recover(false); }, 'If you are stuck in the sand or upside down')}${event ? option('Abandon the current event', () => { endEvent(); closePanel(); }) : ''}${option('Save and quit to title', () => { save(); closePanel(); endEvent(); showTitle(); })}</div><h3>What next?</h3><div class="say">${hint()}</div>`;
    else if (tab === 'register') body = registerHTML();
    else if (tab === 'leads') {
      const ls = Object.entries(D.LEADS).filter(([id]) => S.leads[id]);
      body = ls.length ? ls.map(([id, L]) => `<div class="say"><b>${esc(L.title)}</b> · <span class="hint">${{ active: 'searching', found: 'found, not bought', done: 'bought' }[S.leads[id]]} · from ${esc(D.PEOPLE[L.npc].name)}</span><br>${esc(L.text)}${S.leads[id] !== 'done' ? `<div class="row" style="margin-top:8px"><button class="btn ghost" ${act(() => openMap({ x: L.area.x, z: L.area.z }))}>Show on map</button></div>` : ''}</div>`).join('') : '<p>No leads yet. Talk to people: Hassan at the café in Lulu Quarter is a good start.</p>';
    } else if (tab === 'rep') body = repBars() + '<p class="hint">Each community opens its own leads and events. Win events, restore cars properly and show them at the right places.</p>';
    else if (tab === 'settings') body = `<div class="opts">${option('Driving assists: ' + (prefs.assist ? 'on' : 'off'), () => { prefs.assist = !prefs.assist; savePrefs(); openPause('settings'); }, 'Traction control, stability and countersteer help. Turn off for drifting.')}${option('Sound: ' + (prefs.sound ? 'on' : 'off'), () => { prefs.sound = !prefs.sound; SND.setOn(prefs.sound); savePrefs(); openPause('settings'); })}${use3d ? option('Camera: change', () => { toast('Camera: ' + R3.cycleCam()); }) : ''}</div><p class="hint">Keys: arrows/WASD drive · Space handbrake · E interact · M map · C camera · P photo mode (F saves a picture) · R back to the road · Esc menu</p>`;
    openPanel(`${closeBtn()}<h2>AFTERSHIFT</h2><div class="role">${fmt(S.money)} · ${Sim.clockText(S)} · driving the ${esc(D.CAR[car.owned.id].name)}</div>${tabs}${body}`);
  }
  function registerHTML() {
    return Object.entries(D.SETS).map(([sid, set]) => {
      const cars = D.CARS.filter(c => c.set === sid);
      const owned = cars.filter(c => Sim.everOwned(S, c.id)).length;
      return `<h3>${set.name} <span class="ar" style="text-transform:none;font-size:13px;color:var(--muted)">${set.nameAr}</span> · ${owned}/${cars.length}${S.setsDone[sid] ? ' ✓' : ` · reward ${fmt(set.reward.money)}`}</h3><div class="grid">${cars.map(c => {
        const st = S.register[c.id];
        if (!st) return `<div class="carcard"><div class="unknown">?</div><div class="nm">Unknown</div><div class="meta"><span class="rar" style="color:${D.RARITY[c.rarity].color}">${D.RARITY[c.rarity].name}</span> · keep listening for leads</div></div>`;
        if (st === 'heard') return `<div class="carcard"><div class="unknown">…</div><div class="nm">${esc(c.name)}</div><div class="meta">Heard about · <span class="rar" style="color:${D.RARITY[c.rarity].color}">${D.RARITY[c.rarity].name}</span></div></div>`;
        const img = snap(c.id, c.condition);
        return `<div class="carcard">${img ? `<img src="${img}" alt="">` : ''}<div class="nm">${esc(c.name)}</div><div class="meta">${c.year} · <span class="rar" style="color:${D.RARITY[c.rarity].color}">${D.RARITY[c.rarity].name}</span> · ${{ seen: 'seen', owned: 'owned', sold: 'once owned' }[st]}</div></div>`;
      }).join('')}</div>`;
    }).join('');
  }

  // ------------------------------------------------------- photo + misc ---
  function togglePhoto() {
    if (mode === 'drive') { mode = 'photo'; $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); toast('Photo mode · arrows orbit · W/S zoom · F save picture · P exit', '', 2500); setTimeout(() => $('hud').classList.add('hidden'), 0); }
    else if (mode === 'photo') { mode = 'drive'; $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden'); }
  }
  function recover(water) {
    const L = car.lastSafe;
    const r = W.roadAt(L.x, L.z, 30);
    car.x = r ? r.px : L.x; car.z = r ? r.pz : L.z; car.h = r ? Math.atan2(r.dx, -r.dz) : L.h;
    if (r && Math.cos(car.h - L.h) < 0) car.h += Math.PI;
    car.vx = car.vz = car.w = 0; car.steer = 0;
    if (water) { S.money = Math.max(0, S.money - 50); toast('Pulled out of the water. Recovery cost ' + fmt(50) + '.', 'bad'); }
    if (use3d) R3.resetCam();
  }

  // ---------------------------------------------------------------- loop ---
  let last = performance.now(), hudT = 0, miniT = 0, zoneShown = '';
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!S || !car) return;
    const driving = (mode === 'drive' || mode === 'photo') && !panelOpen;
    if (mode === 'title') { S.time += dt * 0.6; }
    readInput(dt);
    if (driving && mode === 'drive') {
      playTime += dt;
      S.time += dt;   // one real second is one game minute
      const inp = { throttle: input.throttle, brake: input.brake, steer: input.steer, handbrake: input.handbrake, assist: prefs.assist };
      if (event && event.type === 'drag') inp.steer *= 0.25;
      simAcc += dt;
      const h = 1 / 120;
      let impact = 0;
      while (simAcc >= h) { Sim.step(car, inp, h); impact = Math.max(impact, car.impact); simAcc -= h; }
      S.stats.km += Sim.speed(car) * dt;
      if (impact > 3) SND.thud(impact);
      if (impact > 9) { car.owned.cond.body = Math.max(5, car.owned.cond.body - Math.min(3, Math.round(impact / 6))); toast('Ouch. That will need body work.', 'bad', 1500); }
      if (car.surface === 'water') recover(true);
      if (Math.abs(car.x) > 4000 || Math.abs(car.z) > 4000) recover(false);
      updateTraffic(dt);
      if (event) { if (event.type === 'tt') updateTT(dt); else if (event.type === 'drag') updateDrag(dt); else if (event.type === 'desert') updateDesert(dt); else if (event.type === 'parts') updateParts(dt); }
      if (playTime - lastSave > 30) save();
    } else if (mode === 'photo') {
      const k = c => !!keys[c];
      R3.photoInput(((k('ArrowRight') || k('KeyD')) - (k('ArrowLeft') || k('KeyA'))) * dt * 1.2, ((k('ArrowUp')) - (k('ArrowDown'))) * dt * 0.8, ((k('KeyS')) - (k('KeyW'))) * dt * 6);
    }
    if (mode === 'garage') { car.vx = car.vz = 0; }
    SND.update(car, input.throttle, mode === 'drive' && !panelOpen);
    const st = { car, hour: Sim.hour(S), traffic, state: S, mode: mode === 'title' ? 'garage' : mode, braking: input.brake > 0 && Sim.fwdSpeed(car) > 0.5 };
    if (use3d) {
      R3.frame(dt, st);
      if (pendingShot) { pendingShot = false; const a = document.createElement('a'); a.download = 'aftershift-' + Date.now() + '.png'; a.href = view.toDataURL('image/png'); a.click(); toast('Picture saved'); }
    } else R2.fallbackFrame(view.getContext('2d'), view.width, view.height, st, view.width / innerWidth);
    // HUD
    if (mode === 'drive' || mode === 'garage') {
      hudT -= dt; miniT -= dt;
      const kmh = Math.abs(Sim.fwdSpeed(car)) * 3.6;
      $('spd').textContent = Math.round(kmh);
      $('gear').textContent = Sim.fwdSpeed(car) < -0.5 ? 'R' : String(car.gear + 1);
      $('rpmbar').firstChild.style.width = (Math.min(1, car.rpm / car.p.redline) * 100).toFixed(1) + '%';
      if (hudT <= 0) {
        hudT = 0.25;
        $('money').innerHTML = fmt(S.money);
        $('clock').textContent = Sim.clockText(S) + (Sim.gathering(S) ? ' · Collectors at the marina' : '');
        const zn = W.ZONES[W.zoneAt(car.x, car.z)];
        const zt = `${esc(zn.name)}<span class="ar">${zn.ar}</span>`;
        if (zt !== zoneShown) { zoneShown = zt; $('zone').innerHTML = zt; }
        $('objective').innerHTML = objective();
        $('surf').textContent = W.SURF[car.surface] ? W.SURF[car.surface].name : '';
        $('carname').textContent = D.CAR[car.owned.id].name;
        const n = !panelOpen && mode === 'drive' ? nearby() : null;
        if (n && n.kind !== 'slow') { $('prompt').innerHTML = `<kbd>${isTouch ? 'E' : 'E'}</kbd>${esc(n.label)}`; $('prompt').classList.remove('hidden'); }
        else if (n && n.kind === 'slow') { $('prompt').innerHTML = 'Slow down to stop here'; $('prompt').classList.remove('hidden'); }
        else $('prompt').classList.add('hidden');
      }
      if (miniT <= 0) {
        miniT = 1 / 15;
        const mm = $('minimap');
        R2.draw(mm.getContext('2d'), mm.width, mm.height, car.x, car.z, 0.55 * mm.width / 176 * (1 - Math.min(0.5, Sim.speed(car) / 120)), -car.h, mapOverlays(true));
      }
    }
  }

  // a read-only handle for the headless tests
  window.AFTERSHIFT = { get car() { return car; }, get state() { return S; }, get mode() { return mode; }, get event() { return event; }, get panel() { return panelOpen; } };
  start();
})();
