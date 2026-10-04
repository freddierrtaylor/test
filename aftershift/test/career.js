// Career checks: money, garage space, restoration, value, leads, sets, the clock and saving.
// Run: node aftershift/test/career.js
const AS = require('./load')(), { Sim, DATA: D } = AS;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

let s = Sim.newGame();
check(s.money === 1500 && s.garage.length === 1 && s.garage[0].id === 'kestrel', 'new game: DN 1,500 and a Kestrel');
check(s.register.meridian_gt === 'seen' && !s.register.orsini_spider, 'showroom cars are seen, hidden cars unknown');
check(Sim.capacity(s) === 2, 'rented unit holds two cars');

// buying and space
check(!Sim.buy(s, 'meridian_gt', 105000).ok, 'cannot buy without the money');
s.money = 50000;
check(Sim.buy(s, 'velk_van', 2900).ok, 'buy a van');
const full = Sim.buy(s, 'novaro_gti', 8600);
check(!full.ok && /full/.test(full.why), 'workshop full at two cars');

// restoration
const k = s.garage[0];
const q = Sim.restoreQuote(s, k, 'engine', 'standard'), qo = Sim.restoreQuote(s, k, 'engine', 'original');
check(q.ok && qo.cost > q.cost, `original parts cost more (${q.cost} vs ${qo.cost})`);
const v0 = Sim.value(k), t0 = s.time, m0 = s.money;
const r = Sim.restore(s, k.uid, 'engine', 'standard');
check(r.ok && k.cond.engine === 87 && s.money === m0 - q.cost && s.time === t0 + 4 * 60, 'restoring the engine: +25%, costs money, takes 4 hours');
check(Sim.value(k) > v0, 'restoration raises value');
k.cond.body = 75;
check(!Sim.restoreQuote(s, k, 'body', 'standard').ok, 'body work capped at 75% without a paint booth');
s.workshop = 2;
check(Sim.restoreQuote(s, k, 'body', 'standard').ok, 'paint booth lifts the cap');
const p0 = Sim.params(k).power;
Sim.restore(s, k.uid, 'engine', 'performance');
check(k.perf.engine && k.originality < 100 && Sim.params(k).power > p0, 'performance parts add power and cost originality');

// classics care about originality
const a = { uid: 90, id: 'sable_lx', cond: { engine: 100, body: 100, interior: 100, tyres: 100 }, perf: {}, originality: 100 };
const b = Object.assign({}, a, { originality: 40 });
check(Sim.value(a) > Sim.value(b) * 1.2, 'an original classic is worth more than a modified one');
check(Math.abs(Sim.value(a) - D.CAR.sable_lx.value) < 50, 'a perfect original car is worth its catalogue value');

// leads
s = Sim.newGame(); s.money = 100000; s.workshop = 3;
check(Sim.leadState(s, 'sable') === 'available', 'Hassan\'s first lead is open from the start');
check(Sim.leadState(s, 'marlin') === 'locked', 'the second lead waits until you own the first car');
check(Sim.leadState(s, 'orsini') === 'locked' && /Classics/.test(Sim.leadNeeds(s, 'orsini')[0]), 'Orsini needs classics reputation');
check(!Sim.discover(s, 'sable'), 'cannot discover a car before taking the lead');
Sim.takeLead(s, 'sable');
check(s.leads.sable === 'active' && s.register.sable_lx === 'heard', 'taking a lead: active, car heard of');
check(!Sim.claimLead(s, 'sable').ok, 'cannot buy before finding it');
Sim.discover(s, 'sable');
check(s.leads.sable === 'found' && s.register.sable_lx === 'seen', 'discovering: found, car seen');
const before = s.money, cl = Sim.claimLead(s, 'sable');
check(cl.ok && s.leads.sable === 'done' && s.money === before - D.LEADS.sable.price && s.register.sable_lx === 'owned', 'buying a found car');
check(Sim.leadState(s, 'marlin') === 'available', 'owning the Sable opens the Marlin lead');
s.rep.classics = 40;
check(Sim.leadState(s, 'orsini') === 'available', 'classics 40 opens the Orsini lead');

// a full restoration earns classics respect once
const sab = s.garage.find(g => g.id === 'sable_lx');
s.rep.classics = 0;
for (let i = 0; i < 20; i++) for (const c of Object.keys(D.COMPONENTS)) Sim.restore(s, sab.uid, c, 'original');
check(Sim.condScore(sab) >= 99 && s.rep.classics > 0, `fully restored Sable earns classics reputation (+${s.rep.classics})`);

// sets
s = Sim.newGame(); s.money = 100000; s.workshop = 3;
const m1 = s.money;
Sim.buy(s, 'velk_van', 2900); const res = Sim.buy(s, 'halden_pickup', 3800);
check(res.sets.includes('daily') && s.money === m1 - 2900 - 3800 + D.SETS.daily.reward.money, 'owning all daily drivers completes the set and pays out');

// selling
s = Sim.newGame();
check(!Sim.sell(s, s.garage[0].uid, 'showroom').ok, 'cannot sell your only car');
s.money = 5000; Sim.buy(s, 'velk_van', 2900);
const van = s.garage[1], price = Sim.sellPrice(s, van, 'showroom');
check(Sim.sell(s, van.uid, 'showroom').ok && s.money === 2100 + price && s.register.velk_van === 'sold', 'trade in the van at the showroom');

// clock
s = Sim.newGame(); s.time = 4 * 1440 + 19 * 60 + 34.7;
Sim.waitUntil(s, 20);
check(Sim.clockText(s) === 'Thu 20:00', 'resting until 20:00 the same evening (' + Sim.clockText(s) + ')');
Sim.waitUntil(s, 17, 5);
check(Sim.clockText(s) === 'Fri 17:00' && Sim.gathering(s), 'waiting for the Friday gathering');
s.time = 4 * 1440 + 22 * 60;
check(Sim.present(s, 'khalid') && Sim.present(s, 'yousif'), 'Khalid and Yousif are around at 22:00');
s.time = 4 * 1440 + 10 * 60;
check(!Sim.present(s, 'khalid'), 'no drag nights in the morning');

// events
s = Sim.newGame();
const tt = Sim.timeTrialResult(s, 'kestrel', Sim.MEDALS.bronze - 1);
check(tt.medal === 'bronze' && tt.pay === Sim.MEDAL_PAY.bronze, 'first bronze pays in full');
const tt2 = Sim.timeTrialResult(s, 'kestrel', Sim.MEDALS.bronze - 2);
check(tt2.pay < Sim.MEDAL_PAY.bronze, 'repeat medals pay less');
const tg = Sim.timeTrialResult(s, 'kestrel', Sim.MEDALS.gold - 1);
check(tg.medal === 'gold' && s.medals.gold && Sim.leadState(s, 'cup') === 'available', 'gold opens Rania\'s lead');
s = Sim.newGame(); s.money = 1000;
for (let i = 0; i < 3; i++) Sim.dragResult(s, true, 12);
check(s.dragTier === 3 && s.rep.drag >= 30 && Sim.leadState(s, 'star') === 'available', `three drag wins move up the ladder and open the Shooting Star lead (drag ${s.rep.drag})`);

// saving
const str = Sim.save(s), l = Sim.load(str);
check(l && l.money === s.money && l.garage.length === s.garage.length && l.dragTier === 3, 'save and load round trip');
check(Sim.load('{oops') === null && Sim.load('{"v":2}') === null, 'bad saves are rejected');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
