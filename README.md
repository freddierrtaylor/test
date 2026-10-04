# Oasis Circuit Sim

A racing game on the **Oasis / Inner Circuit at Bahrain International Circuit** (2.55 km, 11 turns), with a 3D chase camera, a first-person cockpit view and a top-down view. It's a single `index.html` page written in vanilla HTML/CSS/JS, with no build step and nothing to install.

This repo also holds **AFTERSHIFT**, an automotive discovery and collection game set on a fictional island inspired by Bahrain. Open [`aftershift/index.html`](aftershift/index.html) to play it, or read [its README](aftershift/README.md), [the concept](docs/aftershift-concept.md) and [the full game prompt](docs/aftershift-prompt.md). The rest of this page is about the circuit sim.

**Run it:** open `index.html` in a browser. It also works from `file://`. The 3D views use three.js from cdnjs. Without a connection or WebGL, the game stays top-down.

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

## Views and elevation

- **Cameras** (V or C cycles; also in the pause menu):
  - **3D chase**, the default.
  - **Cockpit:** first person from the driver's seat, with the bonnet, dash, a steering wheel that turns with your inputs, A-pillars and mirror. The field of view widens with speed.
  - **Top-down chase, top-down follow and map overview.**
- The pit stop cuts to the top-down view so you can watch the crew work.
- **Elevation:** the whole BIC site varies by about 17 m, with its high point at GP Turn 13 and an undulating downhill back straight. The steepest grades are 3.6% up and 5.6% down.
  - The Inner loop runs that back straight in reverse, so the start straight climbs to T1, the high point.
  - The lap then falls along the T2–T3 diagonal, rises to T6 and a crest at T8, and drops into T9–T11. That's about 10 m in total, with grades up to 2.4%.
  - Slopes pull the car back on climbs and push it on descents. Crests go light, and dips add grip.
- **Terrain:** dunes around the circuit and hills further out. The 3D views show them directly, and the top-down view shows them as hill-shading.

## Graphics

- **Lighting:** real-time sun shadows follow your car.
- **Paint and environment:** reflective clear-coat paint, plus Bahrain flags that wave in the wind.
- **Tyre effects:**
  - Tyre smoke when you slide, spin the wheels or lock up.
  - Sand dust when you go off.
  - Skid marks laid on the asphalt.
- **Exhaust and impacts:**
  - Exhaust pops and flames when you lift at high revs.
  - Sparks on wall hits and contact.
- **Lights:** brake lights that glow, and headlight flares at night.
- **Trackside:**
  - Barrier banners ("Bahrain International Circuit", "Home of Motorsport in the Middle East", series names).
  - 150/100/50 brake boards before the slow corners.

## Replays

Every race and time-trial session is recorded.
- **Starting a replay:** choose **Watch replay** on the results screen, or **Replay** in the pause menu.
- **Cameras:** trackside TV cameras zoom to follow the car and cut to the next camera as it passes. Chase and onboard views are also available.
- **Controls:** ←/→ change car, C changes camera, Space pauses, ↑/↓ change speed, R restarts and Esc exits.

## Fun extras (Arcade)

- **Nitro (Shift):** a big shove and a higher top speed while the bottle lasts. It refills slowly on its own and faster while drifting or in a slipstream. The N2O bar is on the dash.
- **Drifts:** flick the handbrake (Space), then stay on the throttle with lock on to hold the slide. The drift score builds with a combo multiplier and banks when you catch the slide cleanly. Running off the track or hitting a wall loses it.
- **Slipstream:** tuck in behind a car to get a tow (shown as SLIPSTREAM).
- **Overtake callouts** in races. Rival name tags float over the cars in 3D.

## Secret cars

Type **SAKHIR** in the garage (on a phone, tap the car's name 7 times) to unlock two secret cars. Both always use Arcade handling.

- **Ferrari F2004** (Time Trial only):
  - 3.0 V10 revving to 19,000 rpm, about 900 hp in 605 kg with the driver.
  - Downforce adds grip and braking with speed.
  - Its own open-wheel model: raised nose, sidepods, airbox, wings, exposed wheels and a Schumacher-red helmet.
  - Screaming V10 sound and an onboard camera.
- **Lancia Delta S4** (Race and Time Trial):
  - Group B, mid-engined, four-wheel drive, a 1.8 with both a supercharger and a turbo, over 500 hp in under a tonne.
  - Martini stripes, rally lamps, roof intake and rear wing.
  - Anti-lag crackles in the sound.

## Controls

- Arrows or WASD drive. Space is the handbrake.
- Shift is nitro in Arcade. In Simulation, Shift + throttle gives half throttle, for feeling the turbo lag.
- Keys: Esc pause, V/C camera, L racing line, R back on track, N night, O sound.
- Gamepad: left stick, RT and LT, A handbrake, X nitro, RB and LB to shift, Start to pause.
- Phones get on-screen buttons.
- In the garage, ← and → change car and Enter starts.

## The cars

Each car is a race car, modelled at its real length, width and height and built to look like the cars that race at Sakhir.
- **Scirocco Cup:**
  - **Scirocco Cup 2010:** yellow with the Volkswagen sun strip, #01 on the bonnet, "Scirocco R-Cup" doors and a grey chequered-flag motif.
  - **Sakhir Touring Cup #7:** pink, white and black.
  - **Rising Blue #23.**
- **Civic EG (K20 swap):** the hatch from the BIC 2000cc Challenge.
  - **#14:** white with purple bumpers, skirts, mirrors and spoiler, the red "BIC 2000 CC Challenge" banner, yellow window numbers, a roof vent and gunmetal six-spoke wheels.
- **BMW 135i E82 race car:** blacked-out kidneys, angel eyes, widened arches, splitter and a wing on stands.
  - **Formido #509:** white with blue nose corners and a blue sweep along the flanks.
- **Audi TT Cup:** white, red and black, with a big wing and a splitter.

**What every race car has:**
- **Bodywork:** lofted from its own bonnet line, sill line, width and roof profile. The wheel arches are cut in, and the glasshouse has pillars and see-through glass.
- **Race kit:** a roll cage and bucket seat with harness, visible through the windows, plus tow straps, a front splitter and race wheels with red calipers.
- **Paint:** glossy, with a clear coat that reflects the sky.
- **Liveries:** painted onto the body, with canvas-drawn decals for sun strips, door and roof numbers, and sponsor text.
- **Garage and top-down view:** pick from three liveries per car in the garage (shown on a 3D turntable). The top-down sprites are rendered from the same models.

| | Layout | Box | Mass | Power | Weight F/R | Character |
|---|---|---|---|---|---|---|
| VW Scirocco 2.0 TSI | FWD | DSG | 1300 kg | 265 whp | 61/39 | Stable, understeers on power, near-instant shifts |
| Honda Civic EG (K20 swap) | FWD | 6MT | 1200 kg | 255 whp | 61/39 | Sharpest turn-in, no turbo lag, little low-down torque |
| BMW 135i N54 | RWD | 6MT | 1450 kg | 245 whp | 52/48 | Good exit traction, steps out under aggressive throttle, part-throttle lag |
| Audi TT 2.0 TFSI | FWD | DSG | 1250 kg | 262 whp | 60/40 | Scirocco-like, lighter and more willing to rotate |

## Track, pits and scenery

- **Track:** the Inner/Oasis layout is a 2.55 km anticlockwise infield loop with 11 turns.
  - **How the centreline was made:** it was extracted from the official BIC map by taking the skeleton of the drawn track, smoothing it and scaling the lap to 2,550 m. At that scale the drawn track comes out about 15 m wide, as it should be.
  - **The lap:** cars head south down the west straight into the T1 hairpin, climb the T2–T3 diagonal to T4–T5 and the T6 hairpin, come back west through T7–T8, round the T9 hairpin, and run north past T10 to the T11 hairpin.
  - **Corners:** these are detected from curvature peaks and named from the map's corner numbers.
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
- `cars`: the top-down car drawings (fallback when WebGL is unavailable).
- `models`: the 3D race-car models and liveries (lofted bodies, glasshouse, cage, wheels, decals, and the F2004 open-wheeler).
- `view3d`: the terrain and the three.js scene: track, walls, stands, pit building, tower, palms, car models, cockpit, and the chase and cockpit cameras.
- `ui`: the garage, game modes, assists, pit stops, HUD and rendering.
