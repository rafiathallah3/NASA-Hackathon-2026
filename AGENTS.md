# Project Context: ORBITAL KITCHEN (2.5D Lunar Sample Return)

## Technical Constraints
- **Zero Dependencies:** Use pure HTML5 Canvas, CSS3, and native browser ES modules (`<script type="module">`). Do NOT initialize `npm` or create `package.json` or `node_modules`.
- **4-Player Multiplayer Architecture:** Support 4 NASA segment roles (**P1 Launch**, **P2 Space**, **P3 Science**, **P4 Ground**) via role switching (`1`-`4`), Local 2P (`WASD` + `IJKL`), AI squadmates, and `BroadcastChannel` (`orbital_kitchen_4p_sync`).
- **Rendering:** Maintain crisp `devicePixelRatio` scaling on a logical `1120x620` canvas with a 3-zone non-overlapping flex viewport (Top Overcooked HUD, Center Canvas, Bottom Telemetry Strip). Keep sub-stage HUD badges (`STAGE 1B`, `STAGE 2`, `STAGE 3A`, `STAGE 3B`, `STAGE 3C`, `STAGE 4`).

## 4-Stage Macro Level Architecture & Sub-Stages
1. **Stage 1 — Build & Launch (`src/stages/stage1.js`, `src/stages/stage1b.js`):**
   - **Stage 1A (Overcooked Assembly Hangar — Free Build):** Clickable order tickets with exact Crate-to-Bench component steps, a single top Active Target Recipe Bar with live step checkmarks, on-floor target station highlight rings, BFS grid-pathfinding AI squadmates, and a `+150⭐` full-stack integration bonus when all 4 core modules are installed.
   - **Stage 1B (Rocket Liftoff & Ascent):** Vertical thrust target band (`W`/`S`), horizontal pitch stabilizer (`A`/`D`), dynamic high-altitude Wind Shear gusts, and a precision Max-Q booster staging window (`SPACE`) with outward-peeling twin SRBs.
2. **Stage 2 — Inside the Rocket: Orbital Mission Control (`src/stages/stage2.js`):**
   - Among Us-style spacecraft control deck with a translunar trajectory holo-table, physical wrench rack, and 4 interactive console mini-games (Spectrometer Target Tracking, Eclipse Load-Shedding Breakers, Ka-Band Wave Alignment, Wrench Bolt Torque).
   - Unresolved console alerts actively drain Bus Battery & Ship Integrity (triggering a red emergency alarm vignette when 3+ alerts stack or systems drop critical), and Lunar Orbit insertion requires meeting the minimum task quota (`3` tasks) and clearing active alerts.
3. **Stage 3 — Moon Landing & Surface Exploration (`src/stages/stage3.js` — `3A` & `3B`):**
   - **Stage 3A (Powered Lunar Descent):** Tilted 3/4 perspective lunar plain with Y-depth sorting; powered touchdown on **Point A: Landing Pad** (`W`/`SPACE` retro-thrust, `A`/`D` lateral RCS). Hard or off-pad landings apply a `-28 Wh` starting rover battery shock penalty in `3B`.
   - **Stage 3B (Dual Moon Rover EVA):** Dual 6-wheeled rovers (`LTV-1` and `LTV-2`) with a live Lunar EVA Mission Checklist Card, off-screen directional waypoint arrows, field repair at the Point A Lander (`SPACE` to clear shock damage), 3 surface EVA tasks, and core sample drilling at **Point B: Target Crater** before returning to the rocket.
4. **Stage 4 — Lunar Launch & Earth Return (`src/stages/stage3.js` `3C`, `src/stages/stage4.js`, `src/stages/stage5.js`):**
   - **Stage 3C (Lunar Ascent & Cislunar TEI Burn):** Ascent Capsule launches vertically from the lunar descent stage (`W`/`SPACE` + `A`/`D` pitch corridor) and fires a timed Trans-Earth Injection (`TEI`) burn inside the green trajectory window (`progress 0.36..0.68`) to widen the Stage 4 Earth entry corridor.
   - **Stage 4 (Atmospheric Skip-Reentry & Carrier Recovery):** Guided atmospheric entry corridor (`W`/`S`), roll cooling (`A`/`D`), cryo heatshield venting (`SPACE`), altitude-gated Triple Main Chute deployment (`8–18 km` optimal window), and ocean carrier splashdown (`A`/`D` + `J`/`L`) guided by a visual Carrier Landing Zone Beacon.
   - **Stage 5 (Mission Debrief & Causal Black Box):** 4-pillar NASA grade breakdown (`S`/`A`/`B`/`C`), interactive telemetry replay timeline, and causal Black Box Flight Recorder linking every stage's choices to mission survival.
