# Lunar Mission

**Lunar Mission** is a 2.5D cooperative **Lunar Sample Return** simulation built for the **NASA Space Apps Challenge**. It blends **Overcooked**-style assembly hangar logistics, **Among Us**-style orbital ship maintenance, and **NASA Systems Engineering / Artemis** mission trade-offs into a continuous end-to-end lunar mission—from spacecraft assembly to Earth splashdown and Black Box debrief.

- **Play Online (Render.com):** `https://nasa-hackathon-2026.onrender.com`

---

## Key Features

- **Zero-Dependency Web App:** Built with pure **HTML5 Canvas** (`1120×620` logical resolution, `devicePixelRatio`-scaled pixel-art renderer), **CSS3**, and **native browser ES modules** (`<script type="module">`). No `npm`, `package.json`, or `node_modules` required.
- **4-Player NASA Segment Roles:** Coordinate **P1 Launch** (Blue), **P2 Space** (Orange), **P3 Science** (Purple), and **P4 Ground** (Green) across four modes:
  - **4P AI Squad:** Autonomous AI crewmates with BFS grid pathfinding assist across stages.
  - **Solo Hot-Swap:** Switch between all 4 roles on the fly (`1`–`4`).
  - **Local 2P Co-Op:** Shared-keyboard play (`WASD` + `SPACE`/`Shift`/`F` for P1; `IJKL` + `Enter`/`RShift`/`U` for P2).
  - **Online / Cross-Tab 4P:** Sync across browser tabs via `BroadcastChannel` or online via the built-in zero-dependency WebSocket relay (`server/ws-server.mjs`).
- **Causal Systems Engineering:** Every early hardware build and mid-mission dilemma creates measurable downstream consequences:
  - **Mass vs. Rocket Capacity (kg):** Overweight builds strain ascent fuel and lunar landing descent rates.
  - **Power Generation (W):** Solar-Battery modules protect against orbital eclipse brownouts and extend lunar rover battery range.
  - **Ka-Band Downlink (Mb/d):** Ka-Relay modules drain onboard science buffers and widen the Earth atmospheric skip-reentry corridor.
  - **Propellant Reserves (%):** Descent Cryo-Stage builds and clean Stage Separation supply Stage 3 lunar landing fuel.

---

## Mission Stages

1. **Pre-Game Flow (`Title` → `Crew Lobby` → `Mission Setup`)**
   - Full-bleed pixel-art attract screen, 4-seat Crew Lobby with customizable astronaut avatars (skin tone, hair, helmet, badges) and deterministic BOT backfill, plus Mission Setup (Scenarios, Science Objectives, Launch Vehicles, and Online 4P WebSocket Co-Op).
2. **Stage 1A — Assembly Hangar (`FREE BUILD`)**
   - Pick up raw parts from crates, process them on **Weld**, **Calibrate**, and **Charge** benches, assemble onto **Fairing Trays**, and ship via the conveyor. Includes an interactive UI/hangar tour, live Active Target Recipe Bar, and a `+150⭐` full-stack integration bonus when all 4 core modules are installed.
3. **Stage 1B — Rocket Liftoff & Ascent**
   - Hold vertical thrust (`W`/`S`) and horizontal pitch stabilizer (`A`/`D`) inside target corridors against dynamic Wind Shear gusts, then trigger Max-Q booster staging (`SPACE`).
4. **Stage 2 — Orbital Mission Control**
   - Roam the spacecraft control deck across ship bays and clear console mini-games (Spectrometer Target Tracking, Eclipse Load-Shedding Breakers, Ka-Band Wave Alignment, Wrench Bolt Torque) while managing bulkheads during solar flare / micrometeoroid surges.
5. **Stage 3A / 3B / 3C — Lunar Descent, Dual Rover EVA & Moon Launch**
   - **3A (Powered Lunar Descent):** Touch down on **Point A: Landing Pad** (`W`/`SPACE` retro-thrust, `A`/`D` lateral RCS).
   - **3B (Dual Moon Rover EVA):** Drive `LTV-1` and `LTV-2` across 2.5D lunar cliffs (`Shift` RCS Hop), complete 3 surface EVA tasks, drill core samples at **Point B: Target Crater**, and return to the lander.
   - **3C (Lunar Ascent & TEI Burn):** Launch the Ascent Capsule and fire the Trans-Earth Injection (`TEI`) burn inside the green trajectory window.
6. **Stage 4 — Earth Atmospheric Skip-Reentry & Carrier Recovery**
   - Fly the entry corridor (`W`/`S`), roll to shed heat (`A`/`D`), vent cryo coolant (`SPACE`), deploy Triple Main Chutes in the `8–18 km` window, and steer onto the recovery carrier (`A`/`D` + `J`/`L`).
7. **Stage 5 — Mission Debrief & Causal Black Box**
   - 4-pillar NASA grade breakdown (`S`/`A`/`B`/`C`), interactive telemetry replay timeline, saved run history (`localStorage`), and causal Black Box Flight Recorder.

---

## Controls

| Action | Key(s) |
| :--- | :--- |
| **Move / Pitch & Thrust** | `W` `A` `S` `D` (P2 Local: `I` `J` `K` `L`) |
| **Interact / Vent / Chutes / TEI** | `SPACE` (or `Enter`) |
| **Dash / Rover RCS Hop** | `Shift` |
| **Throw / Pass Part** | `F` |
| **Switch Active Crewmate** | `1` – `4` |
| **Toggle Spacecraft Blueprint** | `B` |
| **Pause / Resume** | `ESC` |

---

## Running Locally

Because native ES modules (`<script type="module">`) cannot run over `file://`, serve the project over HTTP using any of the following methods:

### Option 1: Built-in Windows PowerShell Server (Zero Install)
```powershell
.\serve.ps1
```
Then open `http://localhost:8080`.

### Option 2: Built-in Node.js WebSocket + Static Server (Enables Online 4P Co-Op)
```bash
node server/ws-server.mjs
```
Then open `http://localhost:8787` in up to 4 browser tabs or devices on your LAN.

### Option 3: Python HTTP Server
```bash
python -m http.server 8080
```
Then open `http://localhost:8080`.

---

## Render.com & Online Multiplayer Deployment

- **Render.com (Play Online + WebSocket Relay):** Deploy **Lunar Mission** on [Render](https://render.com/) as a **Web Service** running `node server/ws-server.mjs` (no build command needed). Render serves both the static game frontend over `https://` and the persistent WebSocket relay (`wss://`) for Online 4P Co-Op from a single deployment.
- **Static-Only Hosting:** If deploying without Online 4P WebSocket co-op, Render's **Static Site** option (Publish Directory `.`, empty Build Command) also works out of the box. See [DEPLOY_MULTIPLAYER.md](DEPLOY_MULTIPLAYER.md) for relay setup instructions.

---

## Project Structure

```text
├── index.html                  # 3-zone viewport layout, HUD, modals, import map
├── styles.css                  # Pixel-art notched frames, HUD, splash & lobby styles
├── serve.ps1                   # Zero-install Windows PowerShell HTTP server
├── DEPLOY_MULTIPLAYER.md       # WebSocket relay deployment guide (Render / Railway / Fly.io)
├── Assets/                     # Spritesheets, layered backgrounds, rocket & avatar art
├── server/
│   └── ws-server.mjs           # Zero-dependency Node.js WebSocket relay & static server
└── src/
    ├── main.js                 # DPR-scaled canvas loop, pre-game flow, input router
    ├── pixel.js                # 560×310 pixel renderer blitted nearest-neighbour
    ├── config.js               # Scenarios, launch vehicles, science objectives, recipes
    ├── state.js                # Shared mission state & causal Black Box logger
    ├── hud.js                  # Top/bottom HUD, title screen, mission setup, toasts
    ├── lobby.js / lobby-ui.js  # 4-seat crew lobby model & UI
    ├── avatar.js / avatar-data.js # Procedural astronaut customization & spritesheets
    ├── spacecraft.js           # Cropped & anchored Apollo rocket/lander/pad renderer
    ├── sprites.js              # Chibi crew sprites & canvas UI helpers
    ├── dilemmas.js             # Mid-mission systems engineering trade-off modals
    ├── transitions.js          # Animated stage transition sequences
    ├── net.js / sync.js        # BroadcastChannel & WebSocket multiplayer sync
    ├── audio.js                # Procedural Web Audio API sound effects
    ├── icons.js                # Pixel-art icon registry
    └── stages/
        ├── stage1.js           # Stage 1A: Assembly Hangar & UI/Hangar tours
        ├── stage1b.js          # Stage 1B: Rocket Liftoff & Max-Q Staging
        ├── stage2.js           # Stage 2: Orbital Cruiser & Console Mini-Games
        ├── stage3.js           # Stage 3A–3C: Lunar Descent, Dual Rovers & Ascent
        ├── stage4.js           # Stage 4: Skip-Reentry & Carrier Splashdown
        └── stage5.js           # Stage 5: Mission Debrief & Causal Black Box
```

---

## AI-Use Acknowledgement

Portions of this project's codebase, UI styling, documentation, and asset-processing scripts were developed with assistance from generative AI coding tools (Gemini, Claude, and ChatGPT). All game design, NASA systems-engineering mechanics, integration, testing, and final code review were performed by the team.

---

With <3 Rafi, Erick, Jauna, Louis, and Axella
