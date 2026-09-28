# Oasis Circuit Sim

A top-down racing game on the **Oasis / Inner Circuit at Bahrain International Circuit** (2.55 km, 11 turns). It's a single `index.html` page written in vanilla HTML/CSS/JS, with no build step and nothing to install.

**Run it:** open `index.html` in a browser. It also works from `file://`.

## Modes

- **Race.** You against the other three cars over 3, 5 or 10 laps.
  - You start fourth on the grid, with a five-light start.
  - The AI rivals follow cars ahead, look for a way past and give room alongside.
  - Light rubber-banding keeps races close.
  - Cars make contact, walls bounce you back onto the track, and the race ends with a results screen (and confetti if you win).
- **Time Trial.** Hot laps against a ghost of your best lap, with sector splits and a live delta. Each car has gold, silver and bronze medal times, derived from that car's own ideal lap.
- **Watch AI.** The AI drives your car for a qualifying lap or a race stint, with lap-to-lap variance and tyre wear. It shows live deltas to 1:15.8 (front-runner quali), 1:18.0 (front-runner race average) and your target time. Speeds run from 1× to 20×, or you can finish instantly.
- **Compare.** Runs an AI lap in every car and overlays their racing lines and speed traces.

## Difficulty

- **Easy (default).** A forgiving arcade car, with extra grip, quick steering and strong brakes.
  - Steering picks a line the tyres can actually hold, with automatic countersteer, traction control and auto-shift.
  - **Brake assist** slows you for each corner.
  - The **racing line** ahead of you is coloured green (accelerate), yellow (lift or carry speed) or red (brake now).
- **Pro.** The raw simulation: power understeer in the FWD cars, throttle oversteer in the 135i, lift-off rotation, and E/Q for manual gears.

Brake assist and the racing line can be switched on or off in either mode.

## Controls

- Arrows or WASD drive. Shift + throttle gives half throttle, for feeling the turbo lag.
- Keys: Esc pause, V camera (chase, follow, overview), L racing line, R back on track, N night, O sound.
- Gamepad: left stick, RT and LT, RB and LB to shift, Start to pause.
- Phones get on-screen buttons.
- In the garage, ← and → change car and Enter starts.

## The cars

Each car is drawn top-down at its real length and width, with its own details: the Scirocco's wide rear and light bar, the FN2 Civic's long windscreen, roof spoiler and triangle tail lights, the 135i's long bonnet, kidney grille and set-back cabin, and the TT's dome roof and round fuel cap. Each comes in five factory paint colours.

| | Layout | Box | Mass | Power | Weight F/R | Character |
|---|---|---|---|---|---|---|
| VW Scirocco 2.0 TSI | FWD | DSG | 1300 kg | 265 whp | 61/39 | Stable, understeers on power, near-instant shifts |
| Honda Civic 2.0 NA | FWD | 6MT | 1200 kg | 255 whp | 61/39 | Sharpest turn-in, no turbo lag, little low-down torque |
| BMW 135i N54 | RWD | 6MT | 1450 kg | 245 whp | 52/48 | Good exit traction, steps out under aggressive throttle, part-throttle lag |
| Audi TT 2.0 TFSI | FWD | DSG | 1250 kg | 262 whp | 60/40 | Scirocco-like, lighter and more willing to rotate |

## Track, pits and scenery

- **Track:** traced from the official BIC map of the Inner layout. The start/finish straight runs north–south on the west side, then comes the T1 hairpin, the long T2–T3 diagonal, T4–T5, the T6 hairpin, T7–T8, the T9 hairpin and T10–T11 back onto the straight. Each map vertex is filleted with a corner radius and the loop is scaled to 2,550 m. The track is 15 m wide.
- **Pit lane:** alongside the main straight, behind a pit wall, with a 60 km/h limiter. Stop in your box for an animated tyre change: crew, jacks, four wheel guns and the lollipop.
- **Scenery:** the Sakhir Tower, main and corner grandstands with crowds, the paddock, palm groves and an oasis pond, floodlight towers, car parks and asphalt run-off with walls. There's also a day/night switch.

## Sound

Everything is synthesized live with the Web Audio API, with no samples.

- **Engine:** each cylinder fires a pulse through resonant exhaust pipes, a muffler that opens with load, an intake resonator and a rasp path. It runs in an AudioWorklet, with a ScriptProcessor fallback.
- **Per-car voices:** the turbo four with DSG upshift crack (Scirocco, TT); the Civic, which gets louder and brighter above 5,800 rpm (VTEC); and the straight-six with twin-turbo whistle and flutter (135i).
- **Effects:** blow-off, overrun pops, tyre squeal, wind, kerbs, gravel, impacts and scrapes, pit wheel guns and jacks, crowd, start lights and lap chimes.

## Under the hood

- **Physics:**
  - A bicycle model at 240 Hz, with longitudinal weight transfer and load-sensitive tyres.
  - A per-axle friction ellipse, which makes the FWD cars push on power and lets the 135i step out.
  - Rear ABS/EBD that accounts for cornering load.
  - Turbo spool lag that depends on rpm and throttle.
  - Tyre temperature and wear.
- **AI:** each car's racing line is optimised for its own lap time (`Core.lineOptimiser`, pre-computed in the `BIC_PRECOMPUTED` block). The speed profile is limited by grip, weight transfer, drive layout, power and lateral jerk. The driver uses path tracking with yaw-rate control, braking feed-forward and throttle discipline.
- **Lap times:** AI qualifying laps are about 1:16.6–1:18.5 in the simulation physics, and race stints average about 1:17.3–1:19.1.

## Tests (Node, headless)

```sh
node test/behaviour.js    # FWD power understeer, RWD throttle oversteer, turbo lag, trail-brake rotation, weight transfer, lap times
node test/lap-check.js    # AI qualifying lap + race stint per car: line tracking, off-track time, tyre wear
node test/precompute.js scirocco   # re-run the line optimiser; prints JSON for the BIC_PRECOMPUTED block
```

## Code layout (all in `index.html`)

- `precomputed`: racing lines and skidpad calibration.
- `core`: the track, cars, physics, speed planner, line optimiser, AI, lap timer and headless `simulate()`. It has no DOM access.
- `audio`: the sound engine.
- `scenery`: everything drawn around the circuit.
- `cars`: the top-down car drawings.
- `ui`: the garage, game modes, assists, pit stops, HUD and rendering.
