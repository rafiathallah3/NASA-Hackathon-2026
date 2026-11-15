Here are the exact data structures and user flow to implement the Pre-Phase A / Science-First Formulation Phase directly into your project:
1. Data Schema for src/config.js
Add the scientific objective options, instrument pairings, and NASA Concept Maturity Level (CML) definitions into your configuration:

// ============================================================================
// PRE-PHASE A: SCIENCE OBJECTIVES & REQUIREMENTS MATRIX
// ============================================================================

export const SCIENCE_OBJECTIVES = {
  polar_volatiles: {
    id: "polar_volatiles",
    title: "South Pole Volatiles & Cryo-Ice",
    targetLocation: "Shackleton Crater Rim",
    scienceDomain: "Planetary Volatiles & In-Situ Resource Utilization (ISRU)",
    description: "Map hydrogen deposits and sample subsurface water ice in permanently shadowed regions (PSRs).",
    baselineBonus: { scienceMultiplier: 2.0, targetPpmH2O: 450 },
    // Minimum mandatory instruments to satisfy Baseline Science Requirements:
    requiredModules: ["sensor_pod", "power_pack"], // Lunar Spectrometer + High-Capacity Battery
    minRoverBatteryWh: 150,
    minCryoSamples: 2,
    failurePenalty: "Incomplete Volatile Data (-40% Final Evaluation)"
  },
  mantle_geochem: {
    id: "mantle_geochem",
    title: "Procellarum Basalt & Mantle Geochemistry",
    targetLocation: "Mare Tranquillitatis",
    scienceDomain: "Lunar Petrology & Volcanic Evolution",
    description: "Collect high-titanium basalts to reconstruct lunar thermal history and ancient impact stratigraphy.",
    baselineBonus: { scienceMultiplier: 1.4, targetTiFeRatio: 3.8 },
    requiredModules: ["sensor_pod", "comms_relay"], // Spectrometer + Ka-Band Relay
    minRoverBatteryWh: 100,
    minCryoSamples: 4,
    failurePenalty: "Insufficient Core Sample Stratigraphy (-30% Final Evaluation)"
  },
  heliophysics_space_weather: {
    id: "heliophysics_space_weather",
    title: "Cislunar Space Weather & Plasma Array",
    targetLocation: "Cislunar Transit Corridor & Lunar Orbit",
    scienceDomain: "Heliophysics & Solar Wind Deposition",
    description: "Measure real-time solar energetic particle (SEP) fluxes and cislunar magnetic reconnection.",
    baselineBonus: { scienceMultiplier: 1.6, plasmaBurstBonus: 60 },
    requiredModules: ["comms_relay", "power_pack"], // Ka-Relay + Continuous Solar-Battery
    minRoverBatteryWh: 80,
    minCryoSamples: 1,
    failurePenalty: "Telemetry Buffer Overflow / Unsampled CMEs (-35% Final Evaluation)"
  }
};

// Concept Maturity Level (CML) matrix for gatekeeping and HUD tracking
export const CML_LEVELS = {
  1: { level: 1, name: "Cocktail Napkin", label: "Initial Concept", minRequirementsMet: false },
  2: { level: 2, name: "Initial Feasibility", label: "Science Need Identified", minRequirementsMet: false },
  3: { level: 3, name: "Trade Space", label: "Architecture & Vehicle Selected", minRequirementsMet: false },
  4: { level: 4, name: "Point Design", label: "Baseline Requirements Verified", minRequirementsMet: true }
};

2. State & Verification Helpers for src/state.js
Add state variables to record the team's chosen science profile, verify requirements, and calculate CML progression:

// Inside createInitialState() or runState in src/state.js
export const runState = {
  // Existing state fields...
  scenario: "STANDARD",
  launchVehicle: null,
  builtModules: [],

  // New Pre-Phase A fields:
  selectedObjective: "polar_volatiles", // default selection
  currentCML: 2, // Starts at CML 2 once an objective is picked
  scienceAuditPassed: false,
  scienceAuditLog: []
};

/**
 * Validates fabricated modules against the chosen Science Objective.
 * Called before rocket liftoff (Stage 1B).
 */
export function auditScienceBaselineRequirements() {
  const objective = SCIENCE_OBJECTIVES[runState.selectedObjective];
  if (!objective) return { passed: true, missing: [], cml: 4 };

  const missingModules = objective.requiredModules.filter(
    (req) => !runState.builtModules.includes(req)
  );

  const passed = missingModules.length === 0;
  runState.scienceAuditPassed = passed;
  runState.currentCML = passed ? 4 : 3; // Promotes to CML 4 (Point Design) only if requirements match
  runState.scienceAuditLog = missingModules.map(
    (mod) => `Missing mandatory payload: ${mod} required for ${objective.title}`
  );

  return {
    passed,
    missing: missingModules,
    cml: runState.currentCML,
    auditText: passed
      ? `✓ CML 4 Point Design: All baseline science requirements met for ${objective.title}!`
      : `⚠ CML 3 Trade Warning: Missing ${missingModules.join(", ")}. Mission science yield will be degraded.`
  };
}

3. User Flow & UI Screen Sequence
To introduce this into your game loop seamlessly:

[Main Menu] 
     ↓
[Step 1: Define Science Need] (NEW Modal: Select 1 of 3 Science Objectives)
     ↓
[Step 2: Architecture Setup] (Existing Scenario & Launch Vehicle Selection)
     ↓
[Stage 1A: Free Build Assembly Hangar]
     ↳ HUD displays selected Science Objective & Required Module badges
     ↳ On clicking "Proceed to Launch": runs auditScienceBaselineRequirements()
     ↳ If missing modules: displays a NASA Systems Engineering CML 3 Review Dialog
       (Option to launch with science penalty or return to bench to build missing module)
     ↓
[Stage 1B: Liftoff] → [Stage 2: Transit] → [Stage 3: Lunar Surface] ...

Modal Markup to embed in index.html:

<div id="science-setup-modal" class="modal-backdrop">
  <div class="m3-dialog-card">
    <div class="dialog-header">
      <span class="badge">NASA PRE-PHASE A</span>
      <h2>1. Define Science Need & Goals</h2>
      <p class="subtitle">Select the primary scientific investigation that defines your mission architecture:</p>
    </div>
    
    <div class="objective-grid">
      <!-- Generated dynamically from SCIENCE_OBJECTIVES in config.js -->
      <div class="objective-card selected" data-objective="polar_volatiles">
        <h3>🧊 South Pole Volatiles & Water Ice</h3>
        <span class="target-chip">Shackleton Crater Rim</span>
        <p>Prospect hydrogen deposits and cryo-core samples in permanently shadowed craters.</p>
        <div class="req-chips">
          <span class="chip mandatory">Req: Spectrometer</span>
          <span class="chip mandatory">Req: Solar-Battery Pack</span>
        </div>
      </div>
      <!-- Additional objective cards -->
    </div>

    <div class="dialog-actions">
      <button id="btn-confirm-science" class="m3-button primary">Accept Mission Baseline & Select Vehicle →</button>
    </div>
  </div>
</div>

4. Stage 3B & Stage 5 Downstream Payoffs
Integrating this data model directly fuels later gameplay stages:

    Stage 3B (Lunar Drilling):
        If runState.selectedObjective === "polar_volatiles", drilling in shadowed terrain yields ppm H₂O Equivalent telemetry instead of generic score points.
        If runState.selectedObjective === "mantle_geochem", the drill yields Titanium-Iron (Ti/Fe) Basalt percentage profiles.
    Stage 5 (Black Box Flight Debrief):
        The final report evaluates the flight against the original baseline requirements:
            CML Achieved: Displays whether the final spacecraft reached CML 4 (Point Design) or operated as an under-scoped CML 3 prototype.
            Science Return Score: Rewards bonus multipliers for fulfilling all instrument constraints selected during Pre-Phase A.

🔬 Would you like to review the specific flight rules and math for swapping out the cislunar Meteor Turret with the GMAT-inspired Mid-Course Trajectory Correction (MCC) burn in Stage 2?
