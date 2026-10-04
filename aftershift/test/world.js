// World checks: every place and hidden car is on land, reachable and clear of buildings.
// Run: node aftershift/test/world.js
const AS = require('./load')(), { World: W, DATA: D } = AS;
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

for (const p of W.places) {
  check(W.landDist(p.x, p.z) > 5, `${p.id}: on land`);
  check(!W.collide(p.x, p.z, 2.5), `${p.id}: clear of buildings`);
  check(W.roadDist(p.x, p.z, 120) < 60, `${p.id}: within 60 m of a road (${W.roadDist(p.x, p.z, 120).toFixed(0)} m)`);
}
for (const [id, L] of Object.entries(D.LEADS)) {
  const s = L.spot;
  check(W.landDist(s.x, s.z) > 3, `lead ${id}: hidden car on land`);
  check(!W.collide(s.x, s.z, 1.2), `lead ${id}: hidden car not inside a wall`);
  check(Math.hypot(s.x - L.area.x, s.z - L.area.z) < L.area.r, `lead ${id}: hidden car inside its search area`);
  // the open front of the shelter must be reachable: a point 8 m ahead of the car is clear
  const fx = s.x + Math.sin(s.h) * 8, fz = s.z - Math.cos(s.h) * 8;
  check(!W.collide(fx, fz, 1.5) && W.landDist(fx, fz) > 2, `lead ${id}: approach in front of the car is clear`);
  check(!W.roadAt(s.x, s.z, 0), `lead ${id}: hidden car is off the carriageway`);
}
check(!W.collide(W.spawn.x, W.spawn.z, 2.5), 'spawn point is clear');
check(Math.abs(W.circuit.len - 2734) < 60, `circuit length ${W.circuit.len.toFixed(0)} m`);
// roads sit flat: no dunes under any carriageway
let worst = 0;
for (const r of W.roads) for (const p of r.pts) if (W.landDist(p[0], p[1]) > 0) worst = Math.max(worst, W.heightAt(p[0], p[1]));
check(worst < 0.5, `ground under roads stays flat (max ${worst.toFixed(2)} m)`);
// surfaces
check(W.surfaceAt(W.pointAt(W.circuit, 100).x, W.pointAt(W.circuit, 100).z).kind === 'circuit', 'circuit surface on the track');
check(W.surfaceAt(-1500, 1300).kind === 'sand', 'open desert is sand');
check(W.surfaceAt(1250, 1800).kind === 'drag', 'the drag strip is prepped');
check(W.surfaceAt(1000, -1700).kind === 'water', 'the bay is water');
check(W.zoneAt(1000, -1000) === 'city' && W.zoneAt(-400, -1200) === 'oldtown' && W.zoneAt(300, 100) === 'industrial', 'zones are where the map says');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
