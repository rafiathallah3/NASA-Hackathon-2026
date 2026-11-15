Here is the complete engineering specification, aerothermodynamic flight model, and implementation code for Stage 4 (Earth Atmospheric Entry & Recovery), upgrading it from generic arcade mechanics into an Artemis-style Skip Reentry vs. Apollo Direct Ballistic Entry systems engineering trade study.1. The Physics & Systems Engineering ConceptReturning from the Moon at translunar injection speeds (approx. 11 km/s / Mach 36) presents an extreme flight dynamics challenge. Modern missions (such as the Orion / Artemis program) utilize a Skip Reentry profile rather than a purely steep ballistic descent:Skip Reentry (Artemis Profile): The capsule dips into the upper atmosphere (generating aerodynamic lift $L/D$), "bounces" back out into a suborbital arc to shed kinetic energy and bleed velocity over time, and then makes a gentle secondary entry.Trade-off: Drastically lowers peak deceleration g-loads and peak convective heat flux, but dramatically lengthens the total heat soak duration and requires pinpoint roll-lift vector control.Direct Ballistic Entry (Apollo Profile): A single steep dive directly into the atmosphere without skipping.Trade-off: Concentrates peak heat flux ($\dot{q}_{\text{max}}$) and creates brutal g-forces (up to 8–10g) that endanger sensitive lunar core samples, but minimizes total atmospheric dwell time and avoids the risk of skipping off into deep space.Asymmetric Crew Segment Co-Op in Stage 4P1 Launch / Flight Dynamics: Controls entry flight path angle ($\gamma$) and modulates the lift-to-drag vector via bank angle roll ($\phi$).P2 Space / Thermal Protection System (TPS): Manages Avcoat / PICA-X heatshield ablation monitoring and vents residual descent stage cryo-propellant to prevent tank overpressurization.P3 Science / Sample Container: Regulates cryogenic sample vault cooling (preventing volatile ice core sample boiling if heat soak exceeds limits).P4 Ground / USS Midway Recovery: Tracks radar ionization blackout corridors, monitors the landing footprint (landing ellipse dispersion), and commands parachute deployment sequences.2. Aerothermodynamic Flight ModelAtmospheric Density (Exponential Barometric Approximation): $$\rho(h) = \rho_0 e^{-\frac{h}{H}}$$ (Where $H \approx 7.2 \text{ km}$ scale height, $\rho_0 = 1.225 \text{ kg/m}^3$).Stagnation Point Heat Flux (Sutton-Graves / Chapman Equation): $$\dot{q} = k \sqrt{\frac{\rho}{R_n}} v^3$$Peak Heat Flux: Driven by speed cubed ($v^3$) at dense altitudes.Integrated Heat Load (Heat Soak): $Q = \int \dot{q} \, dt$. This causes heat to penetrate into the interior science vault.Lift-Over-Drag Vector Modulation: $$a_{\text{drag}} = \frac{1}{2m} \rho v^2 C_D S, \quad a_{\text{lift}} = a_{\text{drag}} \left(\frac{L}{D}\right) \cos(\phi)$$Skip Condition: Pitching up with lift-vector upward ($\cos\phi > 0$) allows the capsule to climb from $60 \text{ km}$ back to $85 \text{ km}$ before final descent.3. Implementation Code for src/stages/stage4.jsHere is the modular implementation for Stage 4 with the flight dynamics loop, thermal envelope, and science sample protection:// ============================================================================
// STAGE 4: EARTH ATMOSPHERIC ENTRY & THERMAL CORRIDOR (ARTEMIS VS APOLLO)
// ============================================================================

export class ReentryFlightSim {
  constructor(canvas, missionState, onComplete) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = missionState;
    this.onComplete = onComplete;

    // Profile selection: 'SKIP' (Artemis) or 'BALLISTIC' (Apollo)
    this.reentryProfile = "SKIP"; 

    // Initial Orbital Flight Conditions (Translunar Return)
    this.altitudeKm = 120.0;    // Atmospheric interface entry at 120 km
    this.velocityKms = 11.0;    // 11.0 km/s (Mach 36)
    this.flightPathAngle = -5.8; // Gamma (degrees). Corridor: -5.5° to -6.2°
    this.rollAngle = 0.0;        // Bank angle for lift vector modulation
    
    // Thermal & Structural Limits
    this.heatshieldTempC = 300.0;
    this.maxHeatshieldTempC = 2800.0;
    this.sampleVaultTempC = -80.0; // Cryogenic core storage
    this.maxSampleVaultTempC = 0.0; // Volatiles sublimate/boil at > 0°C
    this.gLoad = 1.0;
    
    // State flags
    this.isSkipAscent = false;
    this.blackoutActive = false;
    this.chutesDeployed = false;
    this.completed = false;
    this.failureReason = null;
  }

  setProfile(profile) {
    this.reentryProfile = profile;
    this.flightPathAngle = profile === "SKIP" ? -5.6 : -6.8;
  }

  handleInput(key, isDown) {
    if (this.completed) return;

    // P1: Roll / Bank control (lifts or drops trajectory)
    if (key === "ArrowLeft" || key === "a" || key === "A") {
      this.rollAngle = Math.max(-60, this.rollAngle - 3.0);
    } else if (key === "ArrowRight" || key === "d" || key === "D") {
      this.rollAngle = Math.min(60, this.rollAngle + 3.0);
    }

    // P2: Active Cryo Purge / Heatshield Coolant Dump
    if (key === "v" || key === "V") {
      if (this.heatshieldTempC > 600) {
        this.heatshieldTempC -= 40.0; // Coolant purge
      }
    }

    // P4: Parachute Deployment (Active below 10 km altitude & sub-Mach 1.2)
    if ((key === " " || key === "Space") && this.altitudeKm <= 10.0 && this.velocityKms < 0.4) {
      this.chutesDeployed = true;
    }
  }

  update(dt) {
    if (this.completed) return;

    // Atmospheric density model (scale height ~ 7.2 km)
    const rho = 1.225 * Math.exp(-this.altitudeKm / 7.2);
    const dynamicPressure = 0.5 * rho * Math.pow(this.velocityKms * 1000, 2);

    // Aerodynamic Forces
    const dragAccel = (dynamicPressure * 0.4) / 1000; // Drag acceleration (m/s^2 scaled)
    const liftVector = dragAccel * 0.28 * Math.cos((this.rollAngle * Math.PI) / 180);

    // Velocity & Altitude integration
    this.velocityKms = Math.max(0.1, this.velocityKms - (dragAccel * 0.0001 * dt));
    
    if (this.reentryProfile === "SKIP" && this.altitudeKm < 65.0 && this.velocityKms > 7.5 && liftVector > 0) {
      // Atmospheric Skip: Capsule climbs back into suborbital lob
      this.altitudeKm += 4.5 * dt;
      this.isSkipAscent = true;
    } else {
      this.altitudeKm -= (Math.abs(this.velocityKms * Math.sin((this.flightPathAngle * Math.PI) / 180)) * 6.0) * dt;
      this.isSkipAscent = false;
    }

    // Aerodynamic Heating (Convective flux ~ rho^0.5 * v^3)
    const heatFlux = Math.sqrt(Math.max(0, rho)) * Math.pow(this.velocityKms, 3) * 450;
    this.heatshieldTempC = Math.min(3200, this.heatshieldTempC + (heatFlux * 0.012 - (this.heatshieldTempC * 0.001)) * dt);
    
    // Heat soak conduction into sample vault
    this.sampleVaultTempC += (this.heatshieldTempC * 0.00035) * dt;

    // G-Loads & Ionization Blackout
    this.gLoad = 1.0 + (dragAccel * 0.04);
    this.blackoutActive = this.velocityKms > 3.5 && this.altitudeKm < 85 && this.altitudeKm > 35;

    // Safety checks & Game Overs
    if (this.heatshieldTempC >= this.maxHeatshieldTempC) {
      this.triggerFailure("HEATSHIELD BREACH: Thermal limit exceeded (> 2800°C)");
    } else if (this.sampleVaultTempC >= this.maxSampleVaultTempC) {
      this.triggerFailure("SAMPLE INTEGRITY LOSS: Cryo-core volatile samples boiled");
    } else if (this.altitudeKm <= 0) {
      if (!this.chutesDeployed) {
        this.triggerFailure("IMPACT TERMINAL: Main chutes failed to deploy prior to splashdown");
      } else {
        this.completeReentry();
      }
    }
  }

  triggerFailure(reason) {
    this.completed = true;
    this.failureReason = reason;
    this.onComplete({ success: false, reason });
  }

  completeReentry() {
    this.completed = true;
    const finalScore = {
      success: true,
      profile: this.reentryProfile,
      maxG: this.gLoad.toFixed(1),
      maxThermalC: Math.round(this.heatshieldTempC),
      sampleVaultFinalTempC: this.sampleVaultTempC.toFixed(1),
      samplePurityRetained: this.sampleVaultTempC < -40.0 ? 100 : 70
    };
    this.onComplete(finalScore);
  }

  draw() {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Dark Reentry HUD
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic Plasma Sheath Glow on screen edges
    if (this.heatshieldTempC > 1200) {
      const alpha = Math.min(0.7, (this.heatshieldTempC - 1200) / 1600);
      const grad = ctx.createRadialGradient(cx, cy, 300, cx, cy, 600);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(249, 115, 22, ${alpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Corridor Profile Title
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillText(`EARTH REENTRY CORRIDOR // PROFILE: ${this.reentryProfile}`, 40, 50);

    // Altitude & Velocity Gauges
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Altitude:   ${this.altitudeKm.toFixed(1)} km`, 40, 90);
    ctx.fillText(`Velocity:   ${(this.velocityKms * 1000).toFixed(0)} m/s (Mach ${(this.velocityKms * 2.9).toFixed(1)})`, 40, 115);
    ctx.fillText(`Decel Gs:   ${this.gLoad.toFixed(1)} G`, 40, 140);

    // Heatshield Gauge (Warning if > 2200°C)
    ctx.fillStyle = this.heatshieldTempC > 2200 ? "#ef4444" : "#f59e0b";
    ctx.fillText(`TPS Ablator: ${Math.round(this.heatshieldTempC)}°C / 2800°C Max`, 40, 180);

    // Science Vault Cryo Gauge
    ctx.fillStyle = this.sampleVaultTempC > -20.0 ? "#ef4444" : "#38bdf8";
    ctx.fillText(`Core Vault:  ${this.sampleVaultTempC.toFixed(1)}°C (Boil point: 0°C)`, 40, 205);

    // Status Badges
    if (this.blackoutActive) {
      ctx.fillStyle = "#ef4444";
      ctx.fillText("[DSN IONIZATION BLACKOUT - NO COMM]", 40, 245);
    }
    if (this.isSkipAscent) {
      ctx.fillStyle = "#22c55e";
      ctx.fillText("▲ ARTEMIS SKIP-LOB: ASCENDING OUT OF ATMOSPHERE", 40, 275);
    }
    if (this.chutesDeployed) {
      ctx.fillStyle = "#22c55e";
      ctx.fillText("✓ MAIN CHUTES INFLATED - TERMINAL SINK 8 m/s", 40, 305);
    }

    // Control Help
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText("[A / D]: Roll Lift-Vector  |  [V]: Vent Cryo Line  |  [SPACE]: Main Chutes (< 10km)", 40, canvas.height - 30);
  }
}
4. Downstream Systems Engineering Causal CouplingPrevious Stage FactorPropagation to Stage 4 ReentryStage 1A: Vehicle Dry MassHeavier spacecraft increases ballistic coefficient ($\beta = m / C_D A$), driving higher convective heat flux and shifting the skip pull-up altitude lower into dangerous g-force zones.Stage 1A: Cryo Tank BuildHigh residual propellant without venting risks tank rupture during peak deceleration (triggers P2 cryo venting requirement).Stage 2: Trajectory Trim (MCC)An off-nominal $\Delta V$ offset from Stage 2 widens the entry flight path angle uncertainty ($\Delta \gamma$), increasing the chance of skipping off into space or entering too steeply.Stage 3B: Lunar Core SamplesCore samples must be maintained below cryogenic limits ($< 0^\circ\text{C}$) throughout heat soak; choosing the long Artemis Skip Reentry requires P3 active vault monitoring to preserve volatile ice integrity.5. Final Stage 5 Debrief IntegrationIn Stage 5, log the reentry performance directly into the NASA CML Post-Flight Closeout Report:Entry Profile Selected: Artemis Skip-Glide vs. Apollo Steep Ballistic.Peak G-Load Experienced: Human/payload structural margin verification.Volatile Sample Purity: Evaluates whether cryo-ice survived entry without thermal degradation.📋 Would you like to review the updated NASA CML Phase A Debrief Report generator for Stage 5 to turn the final debrief into an exportable formal Systems Engineering review document?
