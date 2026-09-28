# Oasis Circuit Sim

A browser racing sim of the **Oasis / Inner Circuit at Bahrain International Circuit** (2.550 km, 8 turns). It's a single page with a top-down 2D canvas, written in vanilla HTML/CSS/JS. There is no build step and nothing to install.

**Run it:** open `index.html` in a browser. It works from `file://`.

## What's in it

**Cars.** There are four cars. Each has its own physics parameters, not just a different skin:

| | Layout | Box | Mass | Power | Weight F/R | Character |
|---|---|---|---|---|---|---|
| VW Scirocco 2.0 TSI | FWD | DSG | 1300 kg | 265 whp | 61/39 | Stable on the brakes; understeers on power; exits limited by front traction |
| Honda Civic 2.0 NA | FWD | 6MT | 1200 kg | 255 whp | 61/39 | Stiff front tyre and fast rack for the sharpest turn-in; no turbo lag, but little low-down torque |
| BMW 135i N54 | RWD | 6MT | 1450 kg | 245 whp | 52/48 | Wider rear tyres give good exit traction; steps out under aggressive throttle; lag on part-throttle |
| Audi TT 2.0 TFSI | FWD | DSG | 1250 kg | 262 whp | 60/40 | Scirocco-like but lighter on a shorter wheelbase, so it rotates more on the brakes |

**Drive mode.**
- Controls: arrows or WASD. Shift + throttle gives half throttle, for feeling the turbo lag.
- Gears: E/Q shift the manual cars, M toggles auto-shift, and DSG cars always shift themselves.
- Other keys: T traction control, G ghost, R reset, V camera, L racing line, N day/night, P pause, Esc menu. A gamepad also works.
- HUD: speed, gear, RPM, boost, throttle/brake, lap time, live delta to best, and sector splits. Sectors turn purple when they beat your best.
- Tyres: front/rear temperature and wear.
- Track limits: the lap is invalidated when all four wheels leave the track.
- Best lap per car is saved in `localStorage`, together with a ghost replay.

**Simulate mode.**
- The AI drives the full physics model on a racing line and speed profile computed for that car.
- Sessions: a qualifying lap, or a race stint of N laps. Each lap gets a small random pace and braking-point variance, and tyre wear and temperature build up.
- Live readouts: lap time, sector splits, and deltas to 1:15.8 (front-runner quali), 1:18.0 (front-runner race average) and your target time.
- A lap table and a stint summary show best, average, spread and tyre fall-off.
- Speed controls: 1× / 2× / 5× / 20×, or "Finish instantly".

**Compare all cars.** Runs an AI qualifying lap in each car. It shows every car's racing line on the map (scroll to zoom, drag to pan) and a speed-vs-distance chart with hover readout. A table lists minimum and exit speed at each corner. "Re-optimise lines" re-runs the line optimiser live in the browser; it takes about a minute.

**Extras.** Ghost of your best lap, day/night (floodlights, headlights), tyre wear across a stint, and skid marks.

## Physics (simplified, directionally honest)

- **Chassis:** a bicycle model (vx, vy, yaw rate) integrated at 240 Hz.
- **Weight transfer:** longitudinal transfer from CG height and wheelbase, lagged through the suspension, sets each axle's normal load.
- **Tyres:**
  - Grip per axle follows a Pacejka-style curve with load sensitivity.
  - Cornering stiffness grows less than linearly with load, which gives front-heavy cars their natural understeer.
  - Each axle has a friction ellipse. Drive or brake force shrinks the lateral grip left over, and past the limit the tyre spins or locks and lateral grip collapses.
  - This is what makes FWD cars push wide under power, the RWD 135i step out on throttle, and trail braking rotate the car.
- **Brakes:** fixed bias per car. ABS on the fronts, and EBD proportioning keeps the rears below their limit.
- **Engine:**
  - Torque curves are scaled so peak wheel power matches each car's WHP.
  - Turbo cars build boost with a first-order spool-up lag whose time constant grows at low rpm and at part throttle.
  - The model also covers engine braking, the rev limiter and launch clutch slip.
- **Gearboxes:** DSG shifts are near-instant with a small torque dip. The manual cars lose drive for about 0.16 to 0.22 s per shift.
- **Tyre temperature and wear:** both are driven by sliding power (lateral slip × force, plus wheelspin) and cooled by airflow. Grip peaks around 95 °C. Wear speeds up when the tyres overheat and costs grip late in a stint.

## AI, racing line and speed profile

1. **Skidpad calibration.** Each car is driven on virtual 30/45/60 m circles in the full physics model to measure its real lateral limit.
2. **Speed profile.** A quasi-steady-state forward/backward pass along the line. It uses the car's per-axle friction ellipse with weight transfer, its engine force curve and brake bias, and three extra limits:
   - Braking may only go as hard as still leaves the unloaded rear axle its share of cornering grip.
   - A lateral-jerk limit (v³·dκ/ds) accounts for how quickly each car can change direction.
   - The traction limit on the driven axle is what separates FWD from RWD on exits.
3. **Racing line.** Start from the geometric minimum-curvature line, then minimise that car's own lap time with coordinate descent on wide, smooth deformations around each corner (`Core.lineOptimiser`).
   - The results are embedded in the `BIC_PRECOMPUTED` block so the page opens instantly.
   - The 135i's line ends up as much as about 1.8 m away from the FWD cars' lines. It carries different entry, minimum and exit speeds; the Compare view shows the details.
4. **Driver.** Path tracking uses course and lateral error feeding commanded curvature, with yaw-rate PI control on top. Speed control uses braking feed-forward from the profile. The AI also has these skills:
   - It feels the front tyres and won't brake beyond the friction ellipse.
   - It trails off the brakes when the rear is loaded, won't steer past the fronts' peak slip angle, and countersteers.
   - It modulates throttle on the driven axle's traction. The 135i lifts when the rear steps out, while the FWD cars keep a little throttle in.
   - A "marshal" resets the car after a big excursion; that lap is invalid.

With the current tuning, AI qualifying laps (100% pace) come out at about 1:15.0 for the Scirocco, 1:15.6 for the Civic and TT, and 1:17.4 for the 135i. At 99% pace, race stints average about 1:15.8 to 1:17.2, with tyre fall-off over the stint.

## Track

The layout is reconstructed as a clockwise sequence of straights and constant-radius arcs:

- Start/finish straight → T1 hairpin (R) → T2 (L) → T3 (R) → back straight → T4 (R) → infield link T5 (R), T6 (L), T7 (R) → T8 (R) onto the main straight.
- The two long straights are solved so the loop closes exactly, then the whole thing is scaled to 2,550 m. The track is 12 m wide.
- Corner radii and straight lengths are approximations based on public track maps. No survey data was available, so treat the geometry as a close sketch rather than CAD.

## Tests (Node, headless)

The simulation core runs without a DOM. The test loader pulls it out of `index.html`:

```sh
node test/behaviour.js    # FWD power-on understeer, RWD throttle oversteer, turbo lag, trail-brake rotation, weight transfer, lap-time window
node test/lap-check.js    # AI quali lap + race stint per car: line-tracking error, off-track time, wear
node test/precompute.js scirocco   # re-run the line optimiser offline; prints JSON for the BIC_PRECOMPUTED block
```

If you change car parameters, re-run `precompute.js` for each car and paste the output into the `BIC_PRECOMPUTED` script block. Alternatively, press "Re-optimise lines" in the Compare view.

## Code layout (all in `index.html`)

- `<script id="precomputed">`: per-car racing-line offsets and skidpad calibration.
- `<script id="core">`: the track, cars, physics step, speed profile, line optimiser, AI driver, lap timer and headless `simulate()`. It has no DOM access.
- `<script id="ui">`: canvas rendering, input, HUD, the drive, sim and compare sessions, and `localStorage` persistence.
