# Project Context: ORBITAL KITCHEN (2.5D Lunar Sample Return)

## Technical Constraints
- **Zero Dependencies:** Use pure HTML5 Canvas, CSS3, and native browser ES modules (`<script type="module">`). Do NOT initialize `npm` or create `package.json` or `node_modules`.
- **4-Player Multiplayer Architecture:** Support 4 NASA segment roles (**P1 Launch**, **P2 Space**, **P3 Science**, **P4 Ground**) via role switching (`1`-`4`), Local 2P (`WASD` + `IJKL`), AI squadmates, and `BroadcastChannel` (`orbital_kitchen_4p_sync`).
- **Rendering:** Maintain crisp `devicePixelRatio` scaling on a logical `1120x620` canvas with a 3-zone non-overlapping flex viewport (Top Overcooked HUD, Center Canvas, Bottom Telemetry Strip).

## Complete 6-Stage Gameplay Loop
1. **Stage 1A (Overcooked Assembly Hangar — 90s Timer):** Hanging order tickets, raw material crates, color-coded processing benches (Weld, Calibrate, Charge), Fairing Trays, and moving Conveyor submission that feeds telemetry (`power`, `comms`, `science`, `fuel`) into later stages.
2. **Stage 1B (Rocket Liftoff & Ascent):** Vertical thrust target band (`W`/`S`), horizontal pitch stabilizer (`A`/`D`), and `SPACE` stage separation window.
3. **Stage 2 (Orbital Mission Control):** Among Us-style control deck with a translunar trajectory holo-table, physical wrench rack, and 4 interactive console mini-games (Spectrometer Target Tracking, Eclipse Load-Shedding Breakers, Ka-Band Wave Alignment, Wrench Bolt Torque).
4. **Stage 3A & 3B (2.5D Lunar Descent & Dual Moon Rover EVA):** Tilted 3/4 perspective lunar plain with Y-depth sorting; powered touchdown on **Point A: Landing Pad**, followed by dual 6-wheeled rovers (`LTV-1` and `LTV-2`) driving to **Point B: Target Crater** to drill core samples and return to the rocket.
5. **Stage 3C (Lunar Ascent & Cislunar Transfer):** Descent stage remains on the Moon while the Ascent Capsule launches vertically (`W`/`SPACE`) and fires a Translunar Injection burn toward Earth.
6. **Stage 4 & 5 (Earth Return & Black Box Debrief):** Guided atmospheric entry corridor (`W`/`S`), triple parachute deployment (`SPACE`), ocean carrier splashdown (`A`/`D` + `J`/`L`), and a Black Box causal debrief linking Stage 1 build choices to mission survival.