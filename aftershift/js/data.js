// ============================================================================
// AFTERSHIFT DATA: the car catalogue, sets, people, leads, events and prices.
// Every make, model, person and place here is fictional. Real places in
// Bahrain are only the visual inspiration for the map.
// ============================================================================
var AS = (typeof AS !== 'undefined') ? AS : {};

AS.DATA = (() => {
  const RARITY = {
    common:    { name: 'Common',    color: '#b9b3a6', mult: 1 },
    uncommon:  { name: 'Uncommon',  color: '#5fc3a4', mult: 1.2 },
    rare:      { name: 'Rare',      color: '#4f9cf0', mult: 1.5 },
    legendary: { name: 'Legendary', color: '#e8a93a', mult: 2 },
    oneoff:    { name: 'One-off',   color: '#e2557a', mult: 2.5 },
  };

  const SETS = {
    daily:    { name: 'Daily drivers',     nameAr: 'سيارات يومية',      reward: { money: 1500,  rep: { classics: 5 } } },
    desert:   { name: 'Desert & 4x4',      nameAr: 'الصحراء والدفع الرباعي', reward: { money: 8000,  rep: { offroad: 15 } } },
    street:   { name: 'Street & drag',     nameAr: 'الشارع والسحب',     reward: { money: 10000, rep: { drag: 15 } } },
    classics: { name: 'Classics',          nameAr: 'الكلاسيكيات',       reward: { money: 25000, rep: { classics: 20, collectors: 10 } } },
    paddock:  { name: 'Paddock & supercars', nameAr: 'الحلبة والسيارات الخارقة', reward: { money: 40000, rep: { circuit: 15, collectors: 15 } } },
  };

  // power kW, mass kg, top km/h, grip = base tyre grip, offroad 0..1.
  // style picks the 3D body builder. condition is how the car is found.
  const CARS = [
    { id: 'kestrel', name: 'Kestrel 1.6 Saloon', year: 2009, rarity: 'common', set: 'daily', style: 'saloon',
      value: 1800, power: 80, mass: 1150, top: 182, grip: 0.95, drive: 'FWD', offroad: 0.15, color: '#c9c4b8',
      desc: 'A tired family saloon with 240,000 km on the clock. Every enthusiast in the Gulf started with one of these.',
      source: { type: 'start' }, condition: { engine: 62, body: 55, interior: 50, tyres: 45 } },
    { id: 'velk_van', name: 'Velk Courier Van', year: 2014, rarity: 'common', set: 'daily', style: 'van',
      value: 2600, power: 95, mass: 1650, top: 165, grip: 0.9, drive: 'FWD', offroad: 0.2, color: '#f2f2ee',
      desc: 'The van that delivers half the parts in Ras Hadid. Slow, square and unkillable.',
      source: { type: 'showroom', price: 2900 }, condition: { engine: 75, body: 70, interior: 65, tyres: 70 } },
    { id: 'halden_pickup', name: 'Halden Workmate Pickup', year: 2012, rarity: 'common', set: 'daily', style: 'pickup',
      value: 3400, power: 120, mass: 1750, top: 175, grip: 0.92, drive: 'AWD', offroad: 0.7, color: '#d8d3c4',
      desc: 'A double-cab pickup that has seen every farm, building site and camp in the country.',
      source: { type: 'showroom', price: 3800 }, condition: { engine: 80, body: 72, interior: 70, tyres: 75 } },

    { id: 'dune_patrol', name: 'Dune Patrol 4.8', year: 2008, rarity: 'uncommon', set: 'desert', style: 'suv',
      value: 9500, power: 210, mass: 2450, top: 200, grip: 0.95, drive: 'AWD', offroad: 0.95, color: '#f4f4f0',
      desc: 'The straight-six SUV the desert crowd swears by. Climbs dunes all day and drives to the café after.',
      source: { type: 'showroom', price: 10500 }, condition: { engine: 82, body: 78, interior: 74, tyres: 80 } },
    { id: 'atlas_4x4', name: 'Atlas Station 4x4', year: 1984, rarity: 'rare', set: 'desert', style: 'boxy4x4',
      value: 16000, power: 115, mass: 2100, top: 150, grip: 0.9, drive: 'AWD', offroad: 1.0, color: '#b9905a',
      desc: 'A classic station wagon 4x4, left at a desert camp when its gearbox jammed in low range. The sand has done the rest.',
      source: { type: 'lead', lead: 'atlas' }, condition: { engine: 25, body: 30, interior: 20, tyres: 15 } },
    { id: 'hawk_rally', name: 'Hawk Rally 4WD', year: 1986, rarity: 'legendary', set: 'desert', style: 'rally',
      value: 120000, power: 370, mass: 1000, top: 225, grip: 1.05, drive: 'AWD', offroad: 0.85, color: '#ffffff',
      desc: 'Shipped in for a desert rally that was cancelled the week it arrived. It never turned a wheel in anger.',
      source: { type: 'lead', lead: 'hawk' }, condition: { engine: 40, body: 55, interior: 45, tyres: 20 } },

    { id: 'novaro_gti', name: 'Novaro Hatch GTi', year: 2016, rarity: 'uncommon', set: 'street', style: 'hatch',
      value: 7800, power: 162, mass: 1290, top: 245, grip: 1.0, drive: 'FWD', offroad: 0.1, color: '#c8202c',
      desc: 'Every car park meet has three of them. The good ones are the ones that have been left alone.',
      source: { type: 'showroom', price: 8600 }, condition: { engine: 85, body: 82, interior: 80, tyres: 78 } },
    { id: 'arrow_rs', name: 'Arrow RS Coupé', year: 1997, rarity: 'uncommon', set: 'street', style: 'coupe',
      value: 12000, power: 210, mass: 1350, top: 250, grip: 1.0, drive: 'RWD', offroad: 0.05, color: '#1f4fa8',
      desc: 'Under a cover in a basement car park for fifteen years. The parking fees were never paid.',
      source: { type: 'lead', lead: 'arrow' }, condition: { engine: 45, body: 60, interior: 55, tyres: 10 } },
    { id: 'shooting_star', name: 'Najm "Shooting Star" Drag Coupé', year: 1990, rarity: 'oneoff', set: 'street', style: 'drag',
      value: 60000, power: 520, mass: 1250, top: 285, grip: 1.08, drive: 'RWD', offroad: 0.0, color: '#6a1fa0',
      desc: 'The local legend that ran the first 9-second pass at the strip. It has sat behind a closed tuning shop since its builder retired.',
      source: { type: 'lead', lead: 'star' }, condition: { engine: 35, body: 50, interior: 40, tyres: 25 } },

    { id: 'sable_lx', name: 'Sable LX V8 Saloon', year: 1978, rarity: 'rare', set: 'classics', style: 'landyacht',
      value: 14000, power: 150, mass: 2000, top: 190, grip: 0.85, drive: 'RWD', offroad: 0.1, color: '#2e4a3a',
      desc: 'An oil-company staff car, still on its original registration, sealed in a compound garage since the eighties.',
      source: { type: 'lead', lead: 'sable' }, condition: { engine: 30, body: 45, interior: 50, tyres: 10 } },
    { id: 'marlin_v8', name: 'Marlin 427 Fastback', year: 1969, rarity: 'rare', set: 'classics', style: 'muscle',
      value: 38000, power: 300, mass: 1600, top: 230, grip: 0.9, drive: 'RWD', offroad: 0.05, color: '#b8862a',
      desc: 'The compound manager\'s weekend car. When he left, it was locked in the pump-station shed and the key went with him.',
      source: { type: 'lead', lead: 'marlin' }, condition: { engine: 20, body: 35, interior: 30, tyres: 5 } },
    { id: 'orsini_spider', name: 'Orsini 330 Spider', year: 1965, rarity: 'legendary', set: 'classics', style: 'spider',
      value: 180000, power: 220, mass: 1100, top: 245, grip: 0.95, drive: 'RWD', offroad: 0.0, color: '#9e1b1b',
      desc: 'Bought new by a pearl merchant\'s son and kept in the family garage ever since. The family will only sell it to someone who restores cars properly.',
      source: { type: 'lead', lead: 'orsini' }, condition: { engine: 30, body: 40, interior: 35, tyres: 10 } },

    { id: 'kestrel_cup', name: 'Kestrel Cup Racer', year: 2004, rarity: 'rare', set: 'paddock', style: 'cup',
      value: 22000, power: 165, mass: 1050, top: 215, grip: 1.18, drive: 'FWD', offroad: 0.0, color: '#f2c200',
      desc: 'A car from the first club season at Al Rimal. Rania raced it and kept it.',
      source: { type: 'lead', lead: 'cup' }, condition: { engine: 70, body: 65, interior: 60, tyres: 55 } },
    { id: 'meridian_gt', name: 'Meridian GT 4.0', year: 2021, rarity: 'rare', set: 'paddock', style: 'supercar',
      value: 95000, power: 450, mass: 1500, top: 315, grip: 1.12, drive: 'RWD', offroad: 0.0, color: '#d9d9d9',
      desc: 'The car every showroom on the bay puts in the window.',
      source: { type: 'showroom', price: 105000 }, condition: { engine: 100, body: 100, interior: 100, tyres: 100 } },
    { id: 'vettore_v12', name: 'Vettore V12 Limitata', year: 2015, rarity: 'legendary', set: 'paddock', style: 'hyper',
      value: 400000, power: 600, mass: 1550, top: 340, grip: 1.2, drive: 'AWD', offroad: 0.0, color: '#0d0d10',
      desc: 'One of 99. Yousif keeps it at the marina, and he sells only to people he trusts.',
      source: { type: 'lead', lead: 'vettore' }, condition: { engine: 95, body: 92, interior: 95, tyres: 90 } },
  ];
  const CAR = {}; CARS.forEach(c => { CAR[c.id] = c; });

  // People. place is a key into World.places. hours: [from, to) on a 24 h clock
  // (to < from wraps past midnight). attire drives the 3D figure.
  const PEOPLE = {
    ahmed:  { name: 'Ahmed Rahman', role: 'Mechanic, the unit next door', place: 'workshop', attire: 'overalls', color: '#3b6fb6' },
    mariam: { name: 'Mariam Al-Sayed', role: 'Runs the Ras Hadid parts yard', place: 'yard', attire: 'abaya', color: '#222' },
    hassan: { name: 'Hassan Al-Mansoori', role: 'Retired oil-field engineer', place: 'cafe', attire: 'thobe', color: '#f3f1ea' },
    jassim: { name: 'Jassim Al-Bahar', role: 'Keeps the family garage in Lulu Quarter', place: 'familygarage', attire: 'thobe', color: '#efe9dc' },
    rania:  { name: 'Rania Haddad', role: 'Track-day instructor at Al Rimal', place: 'paddock', attire: 'racesuit', color: '#d33' },
    khalid: { name: 'Khalid Saleh', role: 'Runs drag nights at the strip', place: 'drag', attire: 'casual', color: '#333', hours: [19, 3] },
    noor:   { name: 'Noor Qassim', role: 'Desert guide and off-road club captain', place: 'camp', attire: 'outdoor', color: '#8a6a3c' },
    yousif: { name: 'Yousif Abdulla', role: 'Collector, the marina gathering', place: 'marina', attire: 'thobe', color: '#fff', hours: [16, 24] },
    salman: { name: 'Salman', role: 'Showroom manager', place: 'showroom', attire: 'suit', color: '#222' },
    abu_faisal: { name: 'Abu Faisal', role: 'Boatyard owner, Jazirat Al Marsa', place: 'boatyard', attire: 'thobe', color: '#ece6d6' },
  };

  // Leads: who gives them, what they need first, the search area (x, z, r),
  // the exact hidden spot and how the car is acquired.
  const LEADS = {
    sable: {
      npc: 'hassan', car: 'sable_lx', needs: {},
      title: 'The company car',
      text: 'When I started at the field in 1979, the staff cars were big American saloons. One was never collected when its driver went home. They sealed it in a garage at the old staff compound in Wadi Naft. I would look along the row of garages on the west side.',
      area: { x: -1560, z: 760, r: 170 }, spot: { x: -1640, z: 820, h: 1.57, shelter: 'garage' },
      owner: 'Wadi Naft estate office', price: 4200,
    },
    marlin: {
      npc: 'hassan', car: 'marlin_v8', needs: { owns: 'sable_lx' },
      title: 'The manager\'s weekend car',
      text: 'You found the Sable! Then you should know about the other one. The compound manager had a gold fastback he raced on the old airstrip on Fridays. When he left, it was locked inside the pump-station shed north of the field. Look where the pipelines meet.',
      area: { x: -1780, z: 260, r: 220 }, spot: { x: -1830, z: 300, h: 0, shelter: 'shed' },
      owner: 'Wadi Naft estate office', price: 18000,
    },
    arrow: {
      npc: 'mariam', car: 'arrow_rs', needs: { rep: { classics: 5 } },
      title: 'Basement level three',
      text: 'A building manager in Manara Bay called me. There\'s a blue coupé under a cover on the lowest level of a car park near the corniche, and nobody has paid for its space in fifteen years. He wants it gone, and he wants the fees. Find it and the paperwork is yours.',
      area: { x: 1090, z: -1070, r: 200 }, spot: { x: 1140, z: -1100, h: 0, shelter: 'carpark' },
      owner: 'Manara Bay building management', price: 4800,
    },
    atlas: {
      npc: 'noor', car: 'atlas_4x4', needs: {},
      title: 'Stuck in low range',
      text: 'An old Atlas station wagon has been sitting at an abandoned winter camp south-west of the lone tree since the gearbox jammed. The family that owned it said whoever drags it out can have it, for the cost of the recovery. The sand there is soft, so bring something that can cope.',
      area: { x: -1300, z: 1850, r: 200 }, spot: { x: -1250, z: 1920, h: 0.6, shelter: 'none' },
      owner: 'The Al-Hamar family', price: 1500,
    },
    hawk: {
      npc: 'abu_faisal', car: 'hawk_rally', needs: { rep: { offroad: 25 } },
      title: 'The rally that never ran',
      text: 'In 1987 a team shipped a rally car in for a desert event. It was cancelled, the team went bankrupt, and the crate has been in my back shed since then. I want it to go to someone the desert people respect. Noor says that is you. It is in the long shed behind the slipway.',
      area: { x: 2380, z: 700, r: 130 }, spot: { x: 2420, z: 735, h: 3.14, shelter: 'shed' },
      owner: 'Abu Faisal', price: 52000,
    },
    star: {
      npc: 'khalid', car: 'shooting_star', needs: { rep: { drag: 30 } },
      title: 'The Shooting Star',
      text: 'You\'ve earned this one. The Najm brothers built the first nine-second car in the country, in a unit at the east end of Ras Hadid. The shop has been shut for years, but the car is still in there. Their sons will sell to someone who will keep it running at the strip. Tell them I sent you.',
      area: { x: 720, z: 180, r: 160 }, spot: { x: 760, z: 222, h: 4.71, shelter: 'garage' },
      owner: 'The Najm family', price: 28000,
    },
    orsini: {
      npc: 'jassim', car: 'orsini_spider', needs: { rep: { classics: 40 } },
      title: 'The pearl merchant\'s Spider',
      text: 'My grandfather\'s brother bought it new in 1965 and drove it along the old coast road every Friday. It has not moved since 1991. People have offered me a fortune for it, but I have seen your work. It is in the back of this garage. Restore it properly. Original parts.',
      area: { x: -425, z: -1225, r: 60 }, spot: { x: -420, z: -1250, h: 0, shelter: 'garage' },
      owner: 'Jassim Al-Bahar', price: 45000,
    },
    cup: {
      npc: 'rania', car: 'kestrel_cup', needs: { medal: 'gold' },
      title: 'Rania\'s old Cup car',
      text: 'A gold-medal lap! My old Cup car is in the back of garage 12 in the paddock. It needs a proper owner, someone who will take it out on track days.',
      area: { x: 690, z: 1220, r: 80 }, spot: { x: 720, z: 1228, h: 1.57, shelter: 'garage' },
      owner: 'Rania Haddad', price: 15000,
    },
    vettore: {
      npc: 'yousif', car: 'vettore_v12', needs: { rep: { collectors: 45 } },
      title: 'One of ninety-nine',
      text: 'I have watched you at the gatherings. You treat cars properly. The Limitata is under the canopy at the end of the marina. If you can find the money, it is yours.',
      area: { x: 1440, z: -1400, r: 90 }, spot: { x: 1480, z: -1420, h: 1.57, shelter: 'canopy' },
      owner: 'Yousif Abdulla', price: 260000,
    },
  };

  // Restoration: weight drives the price of each 25-point step, hours is game time.
  const COMPONENTS = {
    engine:   { name: 'Engine & drivetrain', weight: 1.0,  hours: 4 },
    body:     { name: 'Body & paint',        weight: 0.8,  hours: 5 },
    interior: { name: 'Interior',            weight: 0.45, hours: 3 },
    tyres:    { name: 'Tyres & suspension',  weight: 0.15, hours: 1 },
  };

  const WORKSHOP = [
    { level: 1, name: 'Rented unit',     capacity: 2, bodyCap: 75, upgrade: 6000,  desc: 'One bay and a borrowed compressor. Body work stops at 75% without a paint booth.' },
    { level: 2, name: 'Two-bay workshop', capacity: 4, bodyCap: 100, upgrade: 30000, desc: 'A paint booth for full body restoration.' },
    { level: 3, name: 'Full facility',    capacity: 8, bodyCap: 100, upgrade: 0,     desc: 'A dyno for engine tuning, plus a showroom floor for your collection.' },
  ];

  const REP = {
    circuit:    { name: 'Circuit',       nameAr: 'الحلبة' },
    drag:       { name: 'Drag',          nameAr: 'السحب' },
    offroad:    { name: 'Desert',        nameAr: 'الصحراء' },
    classics:   { name: 'Classics',      nameAr: 'الكلاسيكيات' },
    collectors: { name: 'Collectors',    nameAr: 'المقتنون' },
  };

  // Drag opponents in order. et = elapsed time over the quarter mile.
  const DRAG_TIERS = [
    { name: 'Hamad, Kestrel on street tyres', et: 16.3, purse: 250 },
    { name: 'Sara, Halden Workmate', et: 15.0, purse: 500 },
    { name: 'Bu Saad, Dune Patrol', et: 13.6, purse: 900 },
    { name: 'Ali, Meridian GT', et: 11.4, purse: 1800 },
    { name: 'The Najm replica', et: 10.0, purse: 3500 },
  ];

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return { RARITY, SETS, CARS, CAR, PEOPLE, LEADS, COMPONENTS, WORKSHOP, REP, DRAG_TIERS, DAYS, DAYS_AR, CURRENCY: 'DN' };
})();

if (typeof module !== 'undefined') module.exports = AS;
