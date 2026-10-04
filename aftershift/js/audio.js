// ============================================================================
// AFTERSHIFT SOUND: everything synthesised with Web Audio. Engine (firing
// pulses through a filter that opens with throttle), tyre squeal, sand and
// gravel rumble, wind, impacts and UI chimes.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.Audio = (() => {
  let ctx = null, master, eng = null, on = true;
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = on ? 0.55 : 0; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    // engine: two detuned saws and a square sub through a resonant low-pass
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.value = 600;
    const osc = [['sawtooth', 1, 0.35], ['sawtooth', 1.007, 0.25], ['square', 0.5, 0.3], ['triangle', 2, 0.12]].map(([type, mul, gain]) => {
      const o = ctx.createOscillator(); o.type = type; const og = ctx.createGain(); og.gain.value = gain; o.connect(og); og.connect(lp); o.start(); return { o, mul };
    });
    // amplitude wobble at firing frequency gives the burble
    const am = ctx.createGain(); am.gain.value = 0.7; lp.connect(am); am.connect(g); g.connect(comp);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; const lfoG = ctx.createGain(); lfoG.gain.value = 0.3; lfo.connect(lfoG); lfoG.connect(am.gain); lfo.start();
    // noise bed for tyres, sand and wind
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const ng = ctx.createGain(); ng.gain.value = 0; s.connect(fl); fl.connect(ng); ng.connect(comp); s.start(); return { g: ng, f: fl }; };
    eng = { g, lp, osc, lfo, squeal: mkNoise('bandpass', 1500, 9), sand: mkNoise('lowpass', 420, 0.7), wind: mkNoise('bandpass', 700, 0.4), comp };
  }
  function setOn(v) { on = v; if (master) master.gain.value = v ? 0.55 : 0; }
  // c: sim car, thr: throttle 0..1
  function update(c, thr, active) {
    if (!ctx || !eng) return;
    const t = ctx.currentTime, k = 0.05;
    const rpm = c ? c.rpm : 900, cyl = c && /landyacht|muscle|suv|drag/.test(c.p.style) ? 8 : c && /hyper/.test(c.p.style) ? 12 : 4;
    const fire = rpm / 60 * cyl / 2;
    eng.osc.forEach(({ o, mul }) => o.frequency.setTargetAtTime(fire * mul * 0.5, t, k));
    eng.lfo.frequency.setTargetAtTime(fire * 0.25, t, k);
    eng.lp.frequency.setTargetAtTime(300 + rpm * 0.25 + thr * 1800, t, k);
    eng.g.gain.setTargetAtTime(active ? 0.12 + thr * 0.16 : 0, t, 0.08);
    const spd = c ? Math.hypot(c.vx, c.vz) : 0;
    const loose = c && (c.surface === 'sand' || c.surface === 'track');
    eng.squeal.g.gain.setTargetAtTime(active && !loose ? Math.min(0.18, Math.max(0, c.slip - 0.06) * 0.8 + c.wheelspin * 0.1) : 0, t, 0.05);
    eng.squeal.f.frequency.setTargetAtTime(1300 + spd * 8, t, 0.1);
    eng.sand.g.gain.setTargetAtTime(active && loose ? Math.min(0.35, spd * 0.012) : active ? Math.min(0.06, spd * 0.0015) : 0, t, 0.1);
    eng.wind.g.gain.setTargetAtTime(active ? Math.min(0.2, spd * spd * 0.00004) : 0, t, 0.2);
  }
  function blip(freqs, dur = 0.12, type = 'sine', vol = 0.18) {
    if (!ctx) return;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
      const t0 = ctx.currentTime + i * dur * 0.8;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(eng ? eng.comp : master); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  function thud(v) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(Math.min(0.6, v * 0.04), ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g); g.connect(eng.comp); o.start(); o.stop(ctx.currentTime + 0.35);
  }
  return {
    start, setOn, update, thud,
    get on() { return on; },
    ui: () => blip([660], 0.06, 'triangle', 0.1),
    good: () => blip([523, 659, 784], 0.14, 'triangle', 0.16),
    bad: () => blip([330, 247], 0.18, 'square', 0.08),
    light: () => blip([440], 0.25, 'sine', 0.2),
    go: () => blip([880], 0.4, 'sine', 0.25),
    find: () => blip([392, 523, 659, 1046], 0.18, 'triangle', 0.18),
  };
})();
