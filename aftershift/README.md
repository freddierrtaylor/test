# AFTERSHIFT

An automotive discovery and collection game set on a fictional island inspired by Bahrain and the Gulf. You start with a tired Kestrel saloon, a rented workshop unit and DN 1,500. You hear about forgotten cars, find them, buy and restore them, and work your way into the island's circuit, drag, desert and collector scenes.

This is a playable slice of the concept in [`docs/aftershift-concept.md`](../docs/aftershift-concept.md).

**Run it:** open `aftershift/index.html` in a browser. It also works from `file://`. The 3D view uses three.js from cdnjs. Without a connection or WebGL, the game falls back to a top-down view.

## The island

Every place, person, make and model is invented. Real places are only visual references, and the map does not claim to be Bahrain.

| Area | Inspired by | What's there |
|---|---|---|
| **Manara Bay** (خليج المنارة) | Manama, Bahrain Bay | Glass towers, the twin towers with wind turbines on their sky bridges, the corniche, Bay Motors showroom, a multi-storey car park, and the marina where the collectors gather on Friday evenings |
| **Lulu Quarter** (حي اللؤلؤ) | Muharraq | Coral-stone houses with wind towers, narrow lanes, the fort on the shore, a mosque, Qahwat Al Lulu café and the Al-Bahar family garage |
| **Ras Hadid** (رأس حديد) | Sitra and the industrial areas | Your workshop, Al-Sayed Parts & Salvage, warehouses and tuning shops |
| **Wadi Naft Field** (حقل وادي النفط) | Awali and the southern oil field | Nodding-donkey pumps, pipelines, the 1950s staff compound and the old pump station |
| **Al Rimal International Circuit** (حلبة الرمال الدولية) | Sakhir | A 2.7 km floodlit circuit with kerbs, pits, grandstands and the tower, plus a prepped drag strip |
| **Southern Desert** | Sakhir desert | Dunes, sand tracks, the lone tree, Noor's camp and an abandoned winter camp |
| **Jazirat Al Marsa** (جزيرة المرسى) | the islands, King Fahd Causeway | Reached over a causeway, with a boatyard, dhows and a long shed behind the slipway |

There's also bilingual Arabic and English signage, right-hand traffic, palms along the boulevards, a full day-night cycle with lit windows and street lamps, and a Friday–Saturday weekend.

## How you play

- **Leads.** Talk to people: Hassan at the café, Mariam at the parts yard, Noor at the camp, Khalid at the strip, Rania at the paddock, Jassim in the old quarter, Abu Faisal at the boatyard and Yousif at the marina. They tell you about cars, but each lead gives you a search area on the map, not an exact spot. You drive there and look for a car under a dust cover.
- **Discoveries.** Lift the cover to add the car to your register, then buy it from its owner. It is delivered to your workshop. The 15 cars come in five rarities, Common to One-off, and five sets. Completing a set pays a reward.
- **Restoration.** Restore four components: engine and drivetrain, body and paint, interior, and tyres and suspension. Each has three options:
  - **Standard** parts.
  - **Original** parts cost more, but collectors pay for originality.
  - **Performance** parts make the car quicker but less original.

  Condition changes how a car drives (power, grip, top speed) and how it looks (rust, dust and dull paint).
- **Reputation.** You earn reputation separately with five communities: circuit, drag, desert, classics and collectors. Each one opens its own leads, such as the pearl merchant's Spider, the Shooting Star drag car, the rally car in the boatyard and Yousif's Limitata.
- **Events.**
  - **Time trial:** a flying lap at Al Rimal, with medal times.
  - **Drag nights:** run 19:00 to 03:00, with a light tree and a ladder of five opponents.
  - **Desert run:** checkpoints from Noor's camp to the lone tree and back.
  - **Parts runs:** deliveries against the clock, for early money.
- **Showing cars.** Show a car at the café night meet or at the marina. At the Friday gathering, the collectors reward rare, clean cars.
- **Workshop.** Upgrade from two bays to four (which adds a paint booth) and then to eight (which adds a dyno for tuning). Rest there to skip to the morning, golden hour, the evening, or the Friday gathering.
- **Saving.** Progress saves automatically in your browser.

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Drive | Arrows or WASD | Left stick, RT, LT | ◀ ▶ ▲ ▼ |
| Handbrake | Space | A | HB |
| Interact | E or Enter | X | E |
| Map | M | | ☰ then Map |
| Menu (register, leads, reputation, settings) | Esc | Start | ☰ |
| Camera | C | Y | |
| Photo mode | P (F saves a picture) | | |
| Back to the road | R | | ☰ |

Driving assists (traction control, stability control and countersteer help) are on by default. Turn them off in Settings to drift.

## Code layout

| File | What it does |
|---|---|
| `js/data.js` | The car catalogue, rarities, sets, people, leads, restoration costs, workshop levels and drag opponents |
| `js/world.js` | The map: coast, zones, roads, places, landmarks, buildings and colliders, dune heights and surfaces. Deterministic, with no DOM |
| `js/sim.js` | Car physics (a 120 Hz bicycle model with surfaces, slopes, weight transfer, assists and collisions) and the career (money, garage, restoration, value, leads, sets, the clock, events and saving). No DOM |
| `js/render3d.js` | The three.js scene: terrain, sea, roads, buildings, landmarks, props, procedural car models, people, sky and lighting, particles and cameras |
| `js/render2d.js` | The minimap, the full map and the top-down fallback view |
| `js/audio.js` | Synthesised engine, tyres, sand, wind and UI sounds |
| `js/game.js` | Input, the game loop, traffic, interactions, dialogue, garage, showroom, events, menus and the HUD |

## Tests (Node, headless)

```sh
node aftershift/test/world.js     # places and hidden cars are on land, reachable and clear of walls
node aftershift/test/physics.js   # acceleration, braking, cornering, sand, walls, handbrake, dunes
node aftershift/test/career.js    # money, garage space, restoration, value, leads, sets, clock, saving
node aftershift/test/events.js    # a driving bot checks medal times and the drag ladder (--table prints every car)
```
