# ORBITAL KITCHEN — Team & Hackathon Summary

**ORBITAL KITCHEN** is a 2.5D cooperative **Lunar Sample Return** simulation webapp built for the NASA Space Apps Challenge. It combines **Overcooked**-style assembly hangar logistics, **Among Us**-style orbital ship tasks, and **NASA Systems Engineering / Artemis** mission trade-offs into one cohesive playable mission.

---

## 1. Core Concept & Educational Goal
Players coordinate four NASA mission segments—**Launch**, **Space**, **Science (User)**, and **Ground**—to build a spacecraft, launch it, survive cislunar transit, land on the Moon, gather lunar core samples with dual rovers, and return safely to Earth.

Every early hardware build and mid-mission engineering decision creates measurable consequences later in the flight:
- **Mass vs. Rocket Capacity (kg):** Overweight builds strain ascent fuel and lunar landing descent rates.
- **Power Generation vs. Consumption (W):** Solar-Battery modules protect against orbital eclipse brownouts and increase lunar rover battery range.
- **Ka-Band Downlink (Mb/d):** Ka-Relay modules drain onboard science data buffers during Ground Cones and widen the Earth atmospheric skip-reentry corridor.
- **Propellant Reserves (%):** Descent Cryo-Stage builds and clean Stage Separation directly supply Stage 3 lunar landing fuel.

---

## 2. Technical Architecture & File Map
The project uses **zero external dependencies** (`package.json` / `npm` / `node_modules` are not used) and runs on pure **HTML5 Canvas (`1120x620` logical, DPR-scaled)**, **CSS3 (Material Design 3 dark theme)**, and **native browser ES modules** (`<script type="module">`).

### Core Engine & UI
- `index.html` — 3-zone flex layout (Top HUD, Center Canvas + Snackbar Toast, Bottom Telemetry Strip), Briefing Modal, and Systems Engineering Field Guide (`#guide-modal`).
- `styles.css` — Material Design 3 dark palette, pill buttons, telemetry strip, modal layouts, and `#mission-toast` snackbar styles.
- `src/main.js` — Main DPR-scaled Canvas loop, stage transition state machine, keyboard/mouse input router, dilemma pause handling, camera `screenShake`, and empty-launch protection.
- `src/config.js` — Canvas/world dimensions (`1120x620` logical, `1880x980` orbital deck, `2400x1350` lunar plain), 4-player `CREW_ROSTER`, 3 `SCENARIOS`, 3 `LAUNCH_VEHICLES`, raw/processed components, and 4 spacecraft `RECIPES`.
- `src/state.js` — Shared mission state, `resetRunState()`, telemetry helpers, and causal `logBlackBox()` event recorder.
- `src/hud.js` — Top blueprint cards (showing `✓ xN` installed badges), live bottom telemetry bar, crew switcher, Mission Setup modal, and `showMissionToast()` educational snackbars.
- `src/dilemmas.js` — Material 3 two-option decision modal (`triggerDilemma`) that pauses simulation physics until the team selects a flight rule trade-off.
- `src/transitions.js` — Skippable animated interstitial scenes between stages (`SPACE`, `Enter`, or click).
- `src/sprites.js` — Procedural Canvas2D spacecraft, rover, chibi engineer sprites, floating feedback text, and on-canvas control bars.
- `src/net.js` — Cross-tab multiplayer sync using `BroadcastChannel('orbital_kitchen_4p_sync')`.
- `src/audio.js` — Procedural Web Audio API sound effects with HUD mute toggle.
- `serve.ps1` — Built-in zero-install Windows PowerShell HTTP server on `http://localhost:8080`.

### Mission Stages (`src/stages/`)
- `src/stages/stage1.js` — Stage 1A: Untimed Assembly Hangar + 5-step interactive tutorial
- `src/stages/stage1b.js` — Stage 1B: Rocket Liftoff, Pitch/Thrust control, Stage Separation, & Launch Abort Game Over
- `src/stages/stage2.js` — Stage 2: Roamable Orbital Cruiser Ship, 5 console mini-games, & Eclipse Dilemma
- `src/stages/stage3.js` — Stage 3A/3B/3C: 2.5D Lunar Descent, Dual LTV Rovers, Lunar Ascent & TEI Burn
- `src/stages/stage4.js` — Stage 4: Earth Atmospheric Reentry, Cryo Venting, Parachutes, Carrier Recovery & Game Over
- `src/stages/stage5.js` — Stage 5: Black Box Flight Log Debrief, KPIs, Saved History (`localStorage`), & JSON Report Export

---

## 3. Multiplayer & Crew Roles
Players can operate in four modes (cycled in the Top HUD):
1. **4P Squad (AI):** AI crewmates assist automatically across hangar assembly, ship repairs, lunar landing trim, rover co-op, and Earth recovery.
2. **Solo:** Play manually while hot-swapping across all 4 NASA roles (`1`–`4`).
3. **Local 2P:** Shared-keyboard co-op (`WASD` + `SPACE`/`LShift`/`F`/`Q` for P1; `IJKL` + `Enter`/`RShift`/`U` for P2).
4. **Net 4P:** Open multiple browser tabs/windows on the same machine to sync via `BroadcastChannel`.

**Crew Segments:**
- `P1 Launch` (Blue)
- `P2 Space` (Orange)
- `P3 Science` (Purple)
- `P4 Ground` (Green)

---

## 4. Complete Gameplay Scope

### Mission Setup (`MENU`)
- **Scenarios:** *Artemis Mare Tranquillitatis* (`STANDARD`, `$240M`), *South Pole Ice Prospecting* (`HARD`, `$190M`, harsher eclipses), *MDL Sandbox Trade Lab* (`SANDBOX`, `$400M`).
- **Launch Vehicles:** *SLS Block 1B Heavy* (`1050 kg`, `$65M`), *Commercial Heavy* (`850 kg`, `$40M`), *Compact Reusable* (`680 kg`, `$22M`).

### Stage 1A — Untimed Assembly Hangar & Interactive Tutorial
- **No Timer (`FREE BUILD`):** Accessible pacing so players can learn systems engineering trade-offs without panic.
- **5-Step Guided Tutorial:** Highlights target crates, benches, Fairing Trays, and Conveyor with a pulsing spotlight and arrow, plus a clickable **`Skip Tutorial [Tab]`** pill.
- **Overcooked Mechanics:** Pick up raw parts (`SPACE`/`E`), dash (`Shift`), throw/pass (`F`/`Q`), process at **Weld**, **Calibrate**, or **Charge** benches (watch out for overheat burns + extinguisher `X`), assemble onto **Fairing Trays**, and ship on the **Right Conveyor (`>`)**.
- **All 4 Spacecraft Modules Selectable:** *Lunar Spectrometer* (`sensor_pod`), *Rover Solar-Battery* (`power_pack`), *Deep-Space Ka-Relay* (`comms_relay`), and *Descent Cryo-Stage* (`booster_core`), with live **`Mass OK / Power / Comms`** readiness indicator and snackbar educational takeaways.
- **Accidental Launch Guard:** Warns via toast on first click if attempting to launch with `0` modules built.

### Stage 1B — Rocket Liftoff & Ascent
- Hold vertical thrust (`W`/`S`) and horizontal pitch stabilizer (`A`/`D`) inside the green zones, then hit `SPACE` during the **Stage Separation** window (`+15%` propellant bonus + camera shake).
- Failing to control thrust/tilt or staying idle triggers a **Launch Abort — Game Over** modal with instant retry (`Retry Liftoff` or `Return to Hangar`).

### Stage 2 — Orbital Cruiser Deck
- Roam across 5 ship bays (**Reactor Bay**, **Bridge**, **Science Lab**, **Engine Room**, **Comms Bay**) plus the physical **Wrench Rack** to clear alerts via 5 mini-games:
  - *Reactor Wiring* (color match)
  - *Meteor Turret* (clear 5 asteroids)
  - *Distributor* (sync 3 timing rings)
  - *Hull Breach* (grab physical Wrench first + torque bolts)
  - *Ka-Band Dish* (carrier alignment)
- **Non-Abrupt Transition:** Stage 2 holds cleanly until any open console task modal is closed.
- **Mid-Mission Dilemma (`ECLIPSE_LOADSHED`):** When entering lunar shadow, choose between **Load-Shed Spectrometer** (`+24%` Battery + `+25 Wh` bonus rover range in Stage 3B) or **Full Instrument Power** (`+55` Science immediately, `-18%` Battery, triggers Reactor alert).

### Stage 3A / 3B / 3C — 2.5D Lunar Descent, Dual Rovers & Moon Launch
- **Stage 3A (Descent):** Opens with **`LANDING_SITE`** decision (*Mare Tranquillitatis* wider `112px` pad vs. *Shackleton Crater Rim* tighter `72px` pad + `1.5x` lateral drift + **`2x` Lunar Science**). Features smooth powered landing physics, camera `screenShake`, suspension settle, and smooth auto-glide if timer expires.
- **Stage 3B (Surface EVA):** Drive dual 6-wheeled rovers (`LTV-1` and `LTV-2`) across the `2400x1350` lunar plain with radar minimap, drill core samples at the **Target Crater**, complete secondary EVA tasks, and link nearby rovers for a **Battery Tether + `2x` Co-Op work speed boost**.
- **Stage 3C (Moon Launch):** Ascent Capsule separates from the descent stage and executes the Translunar Injection (`TEI`) burn home.

### Stage 4 & 5 — Earth Return & Black Box Debrief
- **Stage 4 (Reentry):** Opens with **`REENTRY_PROFILE`** decision (*Shallow Skip-Entry* `0.75x` plasma heating vs. *Steep Ballistic Entry* `+120⭐` & `1.35x` heat rate). Fly the pitch corridor (`W`/`S`), roll to shed heat (`A`/`D`), vent cryo (`SPACE`/`Enter`), open **Triple Main Chutes** (`SPACE`), and steer recovery ship USS Midway (`J`/`L` or P4 `A`/`D`).
- **Stage 4 Game Overs:** Reaching `100%` heat triggers **Heatshield Burnup — Game Over**, and hitting the ocean without main chutes triggers **Hard Splashdown Failure — Game Over**, both with instant retry.
- **Stage 5 (Black Box Debrief):** Displays final score, stars, KPIs, a causal **Black Box Flight Log** linking build & dilemma choices to mission outcomes, recent saved runs (`localStorage`), and **Export JSON** report download.

---

## 5. How to Run Locally (For Group Members)
Because native browser ES modules (`<script type="module">`) require HTTP rather than opening `index.html` directly via `file://`:

1. Share the entire project folder (ZIP or Git repository).
2. On Windows, open PowerShell in the project folder and run the built-in server:
   ```powershell
   .\serve.ps1
   ```
3. Open **http://localhost:8080** in Edge or Chrome.

*(Alternative on Mac/Linux or Python environments: run `python3 -m http.server 8080` in the project folder and visit `http://localhost:8080`.)*
