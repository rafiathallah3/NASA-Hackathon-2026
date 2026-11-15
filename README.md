# Orbital Kitchen

Orbital Kitchen is a 4-player 2.5D lunar sample return game built by CKC for the NASA International Space Apps Challenge. Four crew members (`P1 Launch`, `P2 Space`, `P3 Science`, `P4 Ground`) design, assemble, launch, fly, land, rove, and recover a lunar sample return mission across five connected stages. Every engineering trade and piloting mistake carries forward into the next phase, from payload mass and mid-course burn accuracy down to rover battery reserves and cryogenic core purity at Pacific splashdown.

The entire game runs on native HTML5 Canvas, CSS3, and browser ES modules (`<script type="module">`) with zero npm dependencies and no build step.

## Run Locally

Browsers block ES module imports over `file://`, so serve the repository root over local HTTP:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Crew Roles & Multiplayer Modes

Every mission seats four NASA segment specialists: `P1 Launch` (Lead Booster & Stage Assembly), `P2 Space` (Orbital Guidance & Cryo Prop), `P3 Science` (Lunar Geology & Spectrometer), and `P4 Ground` (DSN Telemetry & Recovery). In the pre-game Crew Lobby, players customize their astronaut's skin tone, hairstyle, hair color, country arm badge, and helmet toggle, which persists in `localStorage` (`orbital_kitchen_profile_v1`). Unclaimed seats fill with deterministic bots derived from the 6-character room code.

You can run the four-person crew in four modes:

1. `4P AI (Solo)`: Switch between `P1` through `P4` at any time with keys `1` to `4` while BFS grid-pathfinding bots work the remaining three seats.
2. `Local 2P + Bots`: Two players share one keyboard (`P1` on `WASD` + `SPACE` + `SHIFT` + `F`, `P2` on `IJKL` + `ENTER` + `Right Shift` + `U`) alongside two bots.
3. `Multi-Tab 4P`: Open up to four browser tabs on the same machine. Tabs synchronize at 30 Hz over `BroadcastChannel` (`orbital_kitchen_4p_sync`).
4. `Online 4P (WebSocket)`: Host or join a 6-character room code through a WebSocket relay (`ws://localhost:8787` by default, or any `wss://` relay via `?room=CODE&ws=wss://...`). The host simulates at 60 Hz (kept alive in background tabs by an inline Web Worker timer) and broadcasts state snapshots at 30 Hz while guests stream inputs at 60 Hz.

## Mission Flow & Stages

### Pre-Phase A Architecture Setup (CML-1 to CML-3)

Before entering the hangar, the crew defines the mission baseline across three NASA Concept Maturity Levels. At `CML-1`, you pick one of three science objectives: *South Pole Volatiles & Cryo-Ice* at Shackleton Crater Rim, *Procellarum Basalt & Mantle Geochem* at Mare Tranquillitatis, or *Cislunar Space Weather & Plasma* at Highland Transit Ridge. At `CML-2`, you select a mission budget and site difficulty (*Artemis Tranquility* at $240M, *South Pole Ice* at $190M, or *Open Sandbox* at $400M). At `CML-3`, you trade payload mass cap against rocket cost between *Heavy Block 1B* (1050 kg, $65M), *Commercial Heavy* (850 kg, $40M), and *Compact Reusable* (680 kg, $22M).

### Stage 1A: Spacecraft Assembly Hangar (CML-4 Point Design)

Stage 1A is an untimed free-build floor on an `18x8` tile grid. Crew members pull raw components from six part crates (`Optics`, `Circuit`, `Battery`, `Solar`, `Dish`, `Fuel Tank`), process them at Weld benches (hold `SPACE`, where overcooking sparks a bench fire that requires the `CO2` extinguisher), Calibrate rigs, or Power Chargers, combine two processed parts onto a tray, and load them onto the rocket integration conveyor.

| Spacecraft Module | Recipe Steps | Mass & Cost | Subsystem Delta |
| :--- | :--- | :--- | :--- |
| `Lunar Spectrometer` | Weld `Optics` + Calibrate `Circuit` | 95 kg / $28M | +45 Science, -35 W Power, -15 Mb/d Data |
| `Rover Solar-Battery` | Charge `Battery` + Weld `Solar` | 110 kg / $24M | +130 W Power |
| `Deep-Space Ka-Relay` | Weld `Dish` + Calibrate `Circuit` | 75 kg / $22M | +110 Mb/d Data, +10 Science, -25 W Power |
| `Descent Cryo-Stage` | Weld `Fuel Tank` + Charge `Battery` | 135 kg / $32M | +25% Descent Fuel |

Shipping at least two modules unlocks the green Launch Pad (`SPACE`), while installing both mandatory `REQ` modules for your chosen science goal passes the `CML-4` Point Design audit. Building all four unique modules before liftoff awards a `+150` star full-stack integration bonus. Press `B` at any time to open the non-pausing NASA Spacecraft Blueprint Schematic drawer and inspect installed parts.

### Stage 1B: Rocket Liftoff & Ascent

Once the crew triggers launch, the mission moves to a 14-second climb from Launch Complex 39B. Hold `W` and `S` to keep engine thrust inside the rising target band, because stalling below 25% or over-thrusting above 93% damages hull integrity. Use `A` and `D` to counter high-altitude wind shear gusts and keep pitch centered. Between `5.5s` and `1.5s` remaining on the ascent clock, press `SPACE` inside the Max-Q window to jettison the twin solid rocket boosters and first stage for a `+12%` to `+18%` orbital fuel bonus.

### Stage 2: Orbital Mission Control & Translunar Cruise

During the 64-second translunar coast across six spacecraft compartments (`Reactor & Power Bay`, `Bridge & Holo-Deck`, `Science Lab`, `Central Spine Deck`, `Engineering Bay`, and `Comms & Airlock`), the crew must resolve at least four console alerts (five on South Pole Hard) before Lunar Orbit Insertion. Active alerts drain bus battery and hull integrity until cleared:

1. `Reactor Wiring` (`Reactor Bay`): Match four color-coded HV bus leads to restore primary power output.
2. `MCC-1 Trajectory Burn` (`Bridge Holo-Table`): Trim radial and prograde delta-v in the GMAT B-plane solver. Trimming the B-plane miss distance below `25 km` eliminates the Stage 3A descent fuel penalty (`0%`), whereas `25-75 km` costs `8%` fuel and exceeding `75 km` costs `18%` fuel.
3. `Power Distributor` (`Science Lab`): Lock three spinning phase rings at top dead center to balance payload bus load.
4. `Micrometeoroid Hull Breach` (`Engineering Bay` / `Spine`): Pick up the physical torque wrench from the Engineering rack (`SPACE`) and torque seven bulkhead bolts before cabin pressure drops.
5. `Ka-Band High-Gain Dish` (`Comms & Airlock`): Sweep frequency and gain sliders until the Deep Space Network carrier locks above 88%.

Mid-cruise solar flares and micrometeoroid storms also slam bulkhead doors shut (press `SPACE` at a locked door to cycle the manual override) and force an eclipse power-routing decision between keeping the spectrometer heater warm or preserving full battery charge for lunar descent.

### Stage 3A: Powered Lunar Descent

The lunar lander drops toward Point A across a 45-second 2.5D approach. Before ignition, the crew chooses between `Precision Rim Hover` (`112 px` landing pad radius, `0.85x` lateral drift, `1x` science multiplier) and `Direct Rim Drop` (`74 px` pad radius, `1.45x` drift, `2x` sample science multiplier). Feather `SPACE` for main retro-thrust, `SHIFT` for hover trim, and `WASD` for lateral RCS thrusters to clear basalt boulders and touch down on the target pad under `7.5 m/s` (`<= 4.2 m/s` on the pad earns a Textbook Landing and `+200` stars). Touching down harder than `4.2 m/s` or landing off-pad on a cliff slope inflicts a `-28 Wh` battery shock penalty on the surface rovers in Stage 3B.

### Stage 3B: Dual Moon Rover Surface EVA

On the `2400x1350` 2.5D lunar surface, the crew splits across two 6-wheeled rovers: `LTV-1` (`P1` + `P3`) and `LTV-2` (`P2` + `P4`). The terrain has three elevation tiers: shadowed low basins (`-1`), flat regolith (`0`), and sunlit basalt plateaus (`+1`). Driving in shadowed basins draws `1.4x` battery power, while parking on a sunlit high plateau deploys solar arrays to recharge at `+4.5 Wh/s`. Pressing `SHIFT` fires rover RCS thrusters to hop up low ledges or cushion drops off high cliffs.

Within the 140-second EVA window, the rovers must:
1. Clear any landing shock damage at the Point A Lander (`SPACE`).
2. Scan three geological ridges to locate the richest volatile vein.
3. Deploy three surface instruments (`Seismic Array`, `Lunar Relay Dish`, and `Thermal Sensor`).
4. Drive to Point B Target Crater and hold `SPACE` to drill and extract the cryogenic core samples. Parking both rovers side by side at the crater links a `2x` co-op power tether that doubles drill speed.
5. Return both rovers to Point A Lander and press `SPACE` to transfer the sealed sample canister into the ascent stage.

### Stage 3C: Lunar Ascent & Trans-Earth Injection (TEI)

The lunar ascent module blasts off from the descent base (`W`/`SPACE` thrust and `A`/`D` pitch trim to stay inside the launch corridor), then enters a cislunar transfer arc. As the trajectory cursor sweeps along the return orbit, press `SPACE` inside the green Trans-Earth Injection (`TEI`) burn window (`36%` to `68%` arc progress) to lock in a wide Earth atmospheric entry corridor for Stage 4.

### Stage 4: Earth Skip-Reentry & Splashdown Recovery

Before hitting the entry interface at `120 km` altitude and `Mach 32`, the crew picks an entry profile: `Shallow Skip-Entry` (`0.75x` peak heating rate, longer thermal soak on the sample vault) or `Steep Ballistic Entry` (`+120` stars, `1.35x` heating rate, higher G-load).

During Phase 1 (`120 km` down to `24 km`, including an ionization communications blackout between `85 km` and `35 km`), use `W` and `S` to hold the capsule inside the green flight-path angle corridor, `A` and `D` to roll-cool the ablative heatshield, and `SPACE` to vent limited cryo coolant (`-22%` heatshield load and `-14°C` sample vault temperature per charge). If internal heat soak pushes the cryogenic sample vault to `0°C` or warmer, polar ice sublimates and drops sample purity to `45%` (keeping the vault at `-20°C` preserves `100%` purity).

Below `24 km` (Phase 2), press `SPACE` inside the `8–18 km` altitude window to deploy the triple main parachutes (deploying above `18 km` shreds the canopies; deploying below `6 km` slams into the ocean at high speed) and steer `A`/`D` into the drifting Pacific recovery ship target zone.

### Stage 5: NASA Phase A Mission Closeout & Black Box

The post-mission debrief grades the flight across four NASA review pillars (`Science Traceability`, `Systems Margins`, `Flight Ops`, and `Reentry & Vault`) from `S` down to `C`, determines whether the `CML-4 Point Design` passed validation, and plots a causal Black Box flight recorder showing how decisions in earlier stages helped or hurt survival downstream. Runs are saved locally in `localStorage` (`orbital_kitchen_mission_history_v1`), and clicking `Export NASA JSON` downloads a machine-readable `NASA_CML_PhaseA_Debrief_<timestamp>.json` closeout report.

## Controls Reference

| Action | Player 1 / Solo | Player 2 (`LOCAL_2P`) | Notes |
| :--- | :--- | :--- | :--- |
| Move / Steer / Pitch / Roll | `WASD` or Arrow Keys | `IJKL` | Hangar movement, rocket pitch, rover driving, capsule trim |
| Primary Action / Thrust / Interact | `SPACE` or `E` | `ENTER` | Pick up/drop, weld, retro-thrust, drill core, deploy chutes |
| Dash / Hover Trim / Rover RCS Hop | `SHIFT` | `Right Shift` | Hangar dash, Stage 3A hover trim, Stage 3B cliff hop |
| Cycle Target / Rover Camera Focus | `F` or `TAB` | `U` | Switch active module order in Stage 1A or rover focus in 3B |
| Switch Active Crew Role (`4P AI`) | `1`, `2`, `3`, `4` | N/A | Jump between `P1 Launch`, `P2 Space`, `P3 Science`, `P4 Ground` |
| Spacecraft Blueprint Drawer | `B` | N/A | Toggle non-pausing schematic overlay during gameplay |
| HUD Spotlight Tour | `H` or `?` | N/A | Step through the 5-part HUD & telemetry tour |
| Pause / Mission Setup Menu | `ESC` or `P` | N/A | Open pause overlay or restart stage |

## Architecture & Pixel Renderer

All game code lives in `src/` and loads via the native `<script type="module">` import map in [index.html](file:///home/rafia/Projects/NASAHackathon2026/index.html):

| File | Responsibility |
| :--- | :--- |
| [src/main.js](file:///home/rafia/Projects/NASAHackathon2026/src/main.js) | Main loop, pre-game screen state machine (`title` -> `lobby` -> `setup`), stage router, CML audit checks, Web Worker background host ticker |
| [src/config.js](file:///home/rafia/Projects/NASAHackathon2026/src/config.js) | Canvas geometry (`1120x620` logical), crew role definitions, CML 1–4 tables, science goals, launch vehicles, module recipes |
| [src/pixel.js](file:///home/rafia/Projects/NASAHackathon2026/src/pixel.js) | Low-res pixel art renderer (`560x310` offscreen canvas upscaled 2x nearest-neighbor to `1120x620`), high-DPI `Jersey 10` text pass, posterized gradients, alpha-hardened sprites |
| [src/spacecraft.js](file:///home/rafia/Projects/NASAHackathon2026/src/spacecraft.js) | Anchor-aligned spacecraft sprite sheet crops (`Assets/rocket/Apollo Rocket_00NN.png`) and articulated launch pad swing arms |
| [src/avatar.js](file:///home/rafia/Projects/NASAHackathon2026/src/avatar.js) & [src/avatar-data.js](file:///home/rafia/Projects/NASAHackathon2026/src/avatar-data.js) | Dynamic crew sprite sheet recoloring (skin tone, hair, helmet, country badge) cached into `8x2` animation sheets |
| [src/lobby.js](file:///home/rafia/Projects/NASAHackathon2026/src/lobby.js) & [src/lobby-ui.js](file:///home/rafia/Projects/NASAHackathon2026/src/lobby-ui.js) | 4-seat Crew Lobby state model, room code generator, bot backfill, and profile customizer UI |
| [src/net.js](file:///home/rafia/Projects/NASAHackathon2026/src/net.js) & [src/sync.js](file:///home/rafia/Projects/NASAHackathon2026/src/sync.js) | `BroadcastChannel` multi-tab sync and WebSocket online relay client with host migration and 30 Hz snapshot interpolation |
| [src/hud.js](file:///home/rafia/Projects/NASAHackathon2026/src/hud.js) | Top Overcooked HUD bar, bottom telemetry strip, splash screen, blueprint drawer, and interactive HUD tour |
| [src/stages/stage1.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage1.js) & [src/stages/stage1b.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage1b.js) | Stage 1A assembly floor (with BFS bot pathfinding) and Stage 1B Max-Q rocket liftoff |
| [src/stages/stage2.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage2.js) & [src/stages/dilemmas.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/dilemmas.js) | Stage 2 translunar cruise interior, 5 console mini-games, GMAT B-plane solver, and mid-flight engineering trade dilemmas |
| [src/stages/stage3.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage3.js) | Stage 3A powered lunar descent, Stage 3B dual-rover 2.5D cliff terrain EVA, and Stage 3C lunar ascent & TEI burn |
| [src/stages/stage4.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage4.js) | Stage 4 atmospheric skip-reentry heating, cryo vault cooling, parachute deployment, and carrier splashdown |
| [src/stages/stage5.js](file:///home/rafia/Projects/NASAHackathon2026/src/stages/stage5.js) | Stage 5 NASA Phase A mission closeout, 4-pillar grading, causal Black Box timeline, and JSON telemetry export |
