Here is the complete engineering specification, mathematical flight rules, and implementation code to replace the arcade Meteor Turret with a GMAT-inspired Mid-Course Correction (MCC) Trajectory Burn for Stage 2 (Transit).1. The Physics & Systems Engineering ConceptIn real cislunar flight (such as Artemis / Apollo / Lunar Sample Return), a spacecraft never shoots asteroids in transit. Instead, it must execute Mid-Course Correction (MCC) burns to counteract translunar dispersion errors and ensure the spacecraft enters the precise B-Plane capture corridor for lunar orbit insertion or direct descent.Flight Rule Mechanics & Asymmetric Crew RolesInstead of a single player blasting targets, the MCC maneuver requires real-time coordination across your 4 crew segments:P1 Launch / Propulsion: Commands the chemical engine burn duration ($\Delta t$) and throttle ($T$).P4 Ground / Navigation (Flight Dynamics): Monitors GMAT-style trajectory vectors ($\Delta V_x, \Delta V_y$), calculating the drift offset and calling out the required attitude trim angles.P3 Science: Monitors instrument thermal & solar aspect constraints during the burn to prevent sensor blinding or telemetry blackout.P2 Space / Flight Engineer: Balances electrical bus discharge and monitors propellant valve line pressures.2. Mathematical Flight ModelThe maneuver models planar trajectory targeting using standard impulsive/finite velocity change approximations:Velocity Deficit ($\vec{\Delta V}_{\text{target}}$): $$\Delta V_{\text{target}} = \sqrt{\Delta V_x^2 + \Delta V_y^2}$$Spacecraft Acceleration ($a$): $$a(t) = \frac{T}{m_0 - \dot{m} t}$$ Where $T$ is thruster output ($N$), $m_0$ is the wet mass determined in Stage 1A, and $\dot{m} = \frac{T}{I_{\text{sp}} g_0}$.Trajectory Error / B-Plane Offset ($B_{\text{miss}}$): $$\vec{r}_{\text{disp}} = \vec{r}_0 + \int (\vec{v}(t) - \vec{v}_{\text{nominal}}) \, dt$$Target Corridor: $B_{\text{miss}} \le 25 \text{ km}$ (nominal green zone).Penalty: If $B_{\text{miss}} > 75 \text{ km}$ at cutoff, the mission incurs a $\Delta V$ capture penalty (+18% fuel burn in Stage 3A Lunar Descent).3. Implementation Code for src/stages/stage2.jsReplace the Meteor Turret console mini-game handler with the following GMAT MCC mini-game module:// ============================================================================
// STAGE 2 CONSOLE: GMAT MID-COURSE CORRECTION (MCC) TRAJECTORY BURN
// ============================================================================

export class TrajectoryBurnConsole {
  constructor(canvas, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onComplete = onComplete;

    // Simulation targets
    this.targetPitch = 34.5; // degrees nominal burn attitude
    this.currentPitch = 12.0; // initial drift angle
    this.targetDeltaV = 42.0; // m/s required for lunar capture corridor
    this.burnedDeltaV = 0.0;
    
    // Thruster state
    this.isBurning = false;
    this.thrustOutput = 0.65; // kN
    this.propellantUsed = 0.0; // kg
    
    // Trajectory dispersion (B-plane offset in km)
    this.bPlaneMissKm = 120.0; // Start out-of-corridor
    this.captureThresholdKm = 25.0; // Nominal green corridor
    
    this.completed = false;
  }

  handleInput(key, isDown) {
    if (this.completed) return;

    if (key === "ArrowLeft" || key === "a" || key === "A") {
      this.currentPitch -= 0.8;
    } else if (key === "ArrowRight" || key === "d" || key === "D") {
      this.currentPitch += 0.8;
    }

    if (key === " " || key === "Space" || key === "w" || key === "W") {
      this.isBurning = isDown;
    }
  }

  update(dt) {
    if (this.completed) return;

    if (this.isBurning) {
      // Calculate alignment factor (1.0 = perfect burn attitude)
      const pitchError = Math.abs(this.currentPitch - this.targetPitch);
      const burnEfficiency = Math.max(0.1, 1.0 - pitchError / 40.0);

      // Integrate velocity and fuel
      const dV = 12.0 * burnEfficiency * dt;
      this.burnedDeltaV += dV;
      this.propellantUsed += 0.85 * dt;

      // Correct B-plane trajectory miss distance
      const correction = dV * 2.8;
      this.bPlaneMissKm = Math.max(0, this.bPlaneMissKm - correction);

      // Check cutoff condition
      if (this.burnedDeltaV >= this.targetDeltaV) {
        this.burnCutoff();
      }
    }
  }

  burnCutoff() {
    this.isBurning = false;
    this.completed = true;

    const nominalCapture = this.bPlaneMissKm <= this.captureThresholdKm;
    const result = {
      nominalCapture,
      finalBPlaneMiss: Math.round(this.bPlaneMissKm),
      propellantBurnedKg: this.propellantUsed.toFixed(1),
      stage3FuelPenaltyPercent: nominalCapture ? 0 : 18
    };

    setTimeout(() => {
      this.onComplete(result);
    }, 1200);
  }

  draw() {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Dark vector HUD overlay
    ctx.fillStyle = "rgba(10, 15, 24, 0.94)";
    ctx.fillRect(cx - 320, cy - 220, 640, 440);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 320, cy - 220, 640, 440);

    // Header: GMAT Flight Dynamics Telemetry
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillText("NASA GMAT TRAJECTORY TRIM // MCC-1 CISLUNAR BURN", cx - 290, cy - 180);

    // Trajectory Corridor Display (B-Plane Target)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(cx - 290, cy - 150, 360, 260);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(cx - 290, cy - 150, 360, 260);

    // Target Capture Circle (Lunar B-Plane Green Zone)
    const targetX = cx - 110;
    const targetY = cy - 20;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.fillText("LUNAR CAPTURE CORRIDOR (±25 km)", cx - 275, cy - 125);

    // Current Spacecraft Trajectory Vector
    const offsetScale = 1.2;
    const curX = targetX + (this.bPlaneMissKm * offsetScale);
    const curY = targetY - ((this.currentPitch - this.targetPitch) * 2.5);

    ctx.fillStyle = this.bPlaneMissKm <= this.captureThresholdKm ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.arc(curX, curY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Right Telemetry Gauges
    const gx = cx + 100;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Target Attitude: ${this.targetPitch.toFixed(1)}°`, gx, cy - 110);
    
    ctx.fillStyle = Math.abs(this.currentPitch - this.targetPitch) < 3.0 ? "#22c55e" : "#f59e0b";
    ctx.fillText(`Current Pitch:   ${this.currentPitch.toFixed(1)}°`, gx, cy - 80);

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Required ΔV:     ${this.targetDeltaV.toFixed(1)} m/s`, gx, cy - 40);
    ctx.fillText(`Delivered ΔV:    ${this.burnedDeltaV.toFixed(1)} m/s`, gx, cy - 10);
    
    ctx.fillStyle = this.bPlaneMissKm <= this.captureThresholdKm ? "#22c55e" : "#ef4444";
    ctx.fillText(`B-Plane Miss:    ${this.bPlaneMissKm.toFixed(1)} km`, gx, cy + 30);

    // Control instructions & Thruster status
    ctx.fillStyle = this.isBurning ? "#38bdf8" : "#64748b";
    ctx.font = "bold 15px 'Courier New', monospace";
    const statusText = this.isBurning ? ">>> MAIN ENGINE FIRING <<<" : "[SPACE / W]: FIRE MAIN THRUSTER";
    ctx.fillText(statusText, cx - 180, cy + 160);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText("[A / D]: Trim Attitude Pitch  |  Hold vector inside green capture circle", cx - 260, cy + 190);
  }
}
4. Downstream Causal Propagation to Stages 3 & 5Stage 3A (Lunar Powered Descent):If result.nominalCapture is false, trigger a warning toast:"Trajectory offset: +18% descent fuel required for off-nominal lunar capture."Deduct 18% from the runState.propellantReserves inherited from Stage 1A, directly squeezing the player's landing hover time.Stage 5 (Black Box Log):Log the event in logBlackBox():MCC-1 Trajectory Burn executed: Final B-plane miss distance: ${result.finalBPlaneMiss} km (Capture Status: ${result.nominalCapture ? 'NOMINAL' : 'MARGINAL'}).🛰️ Would you like to outline the changes for Stage 4 to replace generic reentry roll with a dual-mode Skip-Reentry vs. Direct Ballistic Reentry thermal corridor trade?
