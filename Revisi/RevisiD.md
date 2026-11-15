To transform your game's final screen into an authentic NASA Concept Maturity Level (CML) Phase A Post-Flight Review & Systems Engineering Debrief, here is the design specification, the JSON telemetry schema, and the implementation code for Stage 51more_horiz.This replaces a generic arcade score screen with a structured NASA review modeled on the JPL Concept Maturity Levels (CML 1–4), Goddard Mission Design Lab (MDL) closeout deliverables, and NASA Systems Engineering processes (Identify Need $\rightarrow$ Define Requirements $\rightarrow$ Design $\rightarrow$ Build/Verify $\rightarrow$ Implement)1more_horiz.1. Conceptual Framework: NASA Phase A Post-Flight ReviewIn formal aerospace mission reviews (such as Post-Flight Assessment Reviews), missions are judged across four pillars:Science Traceability & Mission Success Criteria: Did the payload meet the baseline scientific investigation defined in Pre-Phase A89?Systems Architecture & Margins: Did the vehicle preserve standard NASA margins across mass, power, and $\Delta V$1011?CML Maturity Gate: What level of concept maturity did the design actually attain (e.g., did it demonstrate a validated CML 4 Point Design or remain an unverified CML 3 Trade Study)1more_horiz?Causal Black Box Flight Telemetry: An end-to-end traceability matrix showing how early fabrication choices caused specific operational anomalies or triumphs downstream1415.2. Exportable NASA JSON Schema (mission_debrief.json)The final screen will allow players to export their mission data in a structured NASA engineering format16:{
  "project": "ORBITAL KITCHEN // NASA SPACE APPS CHALLENGE",
  "reviewType": "NASA Phase A Mission Closeout & Post-Flight Assessment",
  "timestamp": "2026-11-14T06:58:00Z",
  "cmlMaturitySummary": {
    "targetCML": 4,
    "achievedCML": 4,
    "maturityLevelName": "Point Design",
    "gateReviewVerdict": "PASS - FLIGHT DEMONSTRATED"
  },
  "prePhaseABaseline": {
    "objectiveId": "polar_volatiles",
    "scienceDomain": "Planetary Volatiles & In-Situ Resource Utilization (ISRU)",
    "targetLocation": "Shackleton Crater Rim",
    "baselineRequirements": {
      "mandatoryModules": ["sensor_pod", "power_pack"],
      "minimumCoreSamples": 2,
      "maxCoreVaultTempC": 0.0
    }
  },
  "systemsEngineeringMargins": {
    "launchVehicle": "SLS Block 1B Heavy",
    "dryMassKg": 820.0,
    "massMarginPercent": 21.9,
    "endOfMissionBatteryMarginPercent": 34.2,
    "cislunarDeltaVMarginPercent": 14.5
  },
  "flightOperationalOutcomes": {
    "stage1B_Liftoff": { "stageSeparationEfficiency": 96.5, "ascentPitchNominal": true },
    "stage2_Transit": { "mcc1BurnExecuted": true, "finalBPlaneMissKm": 18.2, "lunarCorridorCaptured": true },
    "stage3_Surface": { "samplesDrilled": 3, "samplePurityH2O_ppm": 482, "roverTetherBonusAchieved": true },
    "stage4_Reentry": { "profileSelected": "SKIP", "peakDecelG": 4.2, "heatshieldMaxTempC": 2140, "sampleVaultFinalTempC": -42.8 }
  },
  "scientificEvaluation": {
    "baselineScienceYieldPercent": 100.0,
    "bonusScienceYieldPercent": 45.0,
    "totalMissionScore": 2480,
    "nasaMissionRating": "FLAGSHIP CLASS SUCCESS (CLASS A/B)"
  },
  "causalTraceabilityLog": [
    "STAGE 1A: Lunar Spectrometer & Solar-Battery fabricated without thermal flaws.",
    "STAGE 2: MCC-1 burn achieved B-plane miss distance of 18.2 km (< 25 km threshold); 0% fuel penalty incurred for Stage 3.",
    "STAGE 3B: Dual rovers deployed battery tether; harvested 3 PSR core samples (482 ppm H2O equivalent).",
    "STAGE 4: Artemis Skip Reentry profile shed orbital kinetic energy; peak deceleration kept at 4.2 G and sample vault remained at -42.8°C."
  ]
}
3. Implementation Code for src/stages/stage5.jsHere is the complete JavaScript module to compute the debrief metrics, render the NASA Command Center HUD, and trigger the JSON file download16:// ============================================================================
// STAGE 5: NASA CML PHASE A CLOSEOUT REVIEW & BLACK BOX DEBRIEF
// ============================================================================

import { SCIENCE_OBJECTIVES, CML_LEVELS } from "../config.js";

export class Stage5Debrief {
  constructor(canvas, missionState, onRestart) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = missionState;
    this.onRestart = onRestart;

    this.evaluation = this.evaluateMission();
    this.reportData = this.buildReportJSON();
  }

  evaluateMission() {
    const s = this.state;
    const objective = SCIENCE_OBJECTIVES[s.selectedObjective] || {};
    
    // 1. Traceability audit
    const requirementsMet = s.scienceAuditPassed && (s.samplesCollected >= (objective.minCryoSamples || 1));
    const vaultIntact = (s.reentrySampleVaultTempC || -80) < 0.0;
    
    // 2. Concept Maturity Level (CML) Gate
    let achievedCML = 3;
    let gateVerdict = "CONDITIONAL (CML 3)";
    if (requirementsMet && vaultIntact && s.missionSuccess) {
      achievedCML = 4;
      gateVerdict = "MISSION SUCCESS // CML 4 POINT DESIGN VALIDATED";
    } else if (!s.missionSuccess) {
      achievedCML = 2;
      gateVerdict = "MISSION FAILED // CRITICAL ANOMALY";
    }

    // 3. Final Scoring Breakdown
    let baseScore = s.missionSuccess ? 1500 : 400;
    let scienceBonus = (s.sciencePoints || 0) * (objective.baselineBonus?.scienceMultiplier || 1.0);
    let efficiencyBonus = Math.round((s.propellantReserves || 0) * 8.5);
    let totalScore = Math.round(baseScore + scienceBonus + efficiencyBonus);

    return {
      achievedCML,
      gateVerdict,
      requirementsMet,
      vaultIntact,
      totalScore,
      objectiveTitle: objective.title || "Generic Lunar Mission",
      targetLocation: objective.targetLocation || "Lunar Surface"
    };
  }

  buildReportJSON() {
    return {
      project: "ORBITAL KITCHEN // NASA SPACE APPS CHALLENGE",
      reviewType: "NASA Phase A Mission Closeout & Post-Flight Assessment",
      timestamp: new Date().toISOString(),
      cmlMaturity: {
        achievedCML: this.evaluation.achievedCML,
        verdict: this.evaluation.gateVerdict
      },
      missionSetup: {
        objective: this.evaluation.objectiveTitle,
        site: this.evaluation.targetLocation,
        vehicle: this.state.launchVehicle || "Commercial Heavy",
        fabricatedModules: this.state.builtModules || []
      },
      flightTelemetry: {
        transitMCC_BPlaneMissKm: this.state.mccBPlaneMissKm || 0,
        surfaceSamplesDrilled: this.state.samplesCollected || 0,
        reentryProfile: this.state.reentryProfile || "SKIP",
        reentryPeakG: this.state.reentryMaxG || 1.0,
        reentryMaxAblatorTempC: this.state.reentryMaxThermalC || 300,
        finalSampleVaultTempC: this.state.reentrySampleVaultTempC || -80
      },
      score: this.evaluation.totalScore,
      flightLog: this.state.blackBoxLog || []
    };
  }

  exportJSON() {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.reportData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `NASA_CML_PhaseA_Debrief_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  handleInput(key) {
    if (key === "e" || key === "E") {
      this.exportJSON();
    } else if (key === " " || key === "Space" || key === "Enter") {
      this.onRestart();
    }
  }

  draw() {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;

    // Command Center Background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top Header
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.fillText("NASA GODDARD MDL / JPL CML PHASE A POST-FLIGHT REPORT", 40, 48);

    // CML Status Banner
    const isSuccess = this.evaluation.achievedCML === 4;
    ctx.fillStyle = isSuccess ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
    ctx.fillRect(40, 65, canvas.width - 80, 45);
    ctx.strokeStyle = isSuccess ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(40, 65, canvas.width - 80, 45);

    ctx.fillStyle = isSuccess ? "#22c55e" : "#ef4444";
    ctx.font = "bold 15px 'Courier New', monospace";
    ctx.fillText(`STATUS: ${this.evaluation.gateVerdict}`, 55, 93);

    // Left Column: Systems Engineering & Science Traceability
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText("--- SCIENCE & SYSTEMS AUDIT ---", 40, 145);

    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Investigation: ${this.evaluation.objectiveTitle}`, 40, 175);
    ctx.fillText(`Landing Site:  ${this.evaluation.targetLocation}`, 40, 200);
    ctx.fillText(`Samples Core:  ${this.state.samplesCollected || 0} Drilled`, 40, 225);

    ctx.fillStyle = this.evaluation.vaultIntact ? "#22c55e" : "#ef4444";
    ctx.fillText(`Cryo Vault:    ${this.state.reentrySampleVaultTempC || -80}°C (${this.evaluation.vaultIntact ? "INTACT" : "BOILED"})`, 40, 250);

    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Reentry Mode:  ${this.state.reentryProfile || "SKIP"} (Peak G: ${this.state.reentryMaxG || 1.0}G)`, 40, 275);
    ctx.fillText(`Final Score:   ${this.evaluation.totalScore} PTS`, 40, 300);

    // Right Column: Causal Flight Log (Black Box)
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("--- CAUSAL BLACK BOX FLIGHT LOG ---", cx + 20, 145);

    const logLines = (this.state.blackBoxLog && this.state.blackBoxLog.length > 0)
      ? this.state.blackBoxLog.slice(-5)
      : [
          "STAGE 1A: Fabricated baseline science modules.",
          "STAGE 2: Mid-Course Correction (MCC) burn within corridor.",
          "STAGE 3: Surface core extraction completed nominal.",
          "STAGE 4: Atmospheric interface entry executed nominal."
        ];

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px 'Courier New', monospace";
    logLines.forEach((line, idx) => {
      ctx.fillText(`> ${line}`, cx + 20, 175 + (idx * 25));
    });

    // Bottom Action Prompts
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.fillText("[E]: EXPORT FORMAL NASA JSON REPORT", 40, canvas.height - 35);

    ctx.fillStyle = "#f59e0b";
    ctx.fillText("[ENTER / SPACE]: RETURN TO MAIN MISSION MENU", cx + 80, canvas.height - 35);
  }
}
4. Summary of Improvements Across All StagesWith these additions implemented across your codebase:StageNASA System AlignmentKey Mechanical UpgradePre-Phase AScience Mission Goals & CML 1–219Science Objective selection driving mandatory instrument payloads817.Stage 1AMaster Equipment List (MEL) & CML 3112Systems Engineering audit checking mass, power, and science baseline before liftoff1018.Stage 2GMAT Trajectory Analysis & Flight Dynamics1920Replaced arcade asteroid turret with a realistic MCC-1 Trajectory Burn targeting the B-plane lunar corridor2122.Stage 3Planetary Exploration & ISRU2324Site-specific sampling (ppm $\text{H}_2\text{O}$ equivalent vs. Titanium basalts) with dual-rover battery tethering2324.Stage 4Aerothermodynamics & Orion/Artemis Flight Rules25Artemis Skip Reentry vs. Apollo Direct Entry trade-off balancing G-loads, heat soak, and volatile sample survival2627.Stage 5JPL CML & Goddard MDL Closeout Review112Comprehensive Phase A review verifying science requirements with exportable JSON telemetry616.Would you like to draft a concise submission pitch write-up highlighting these specific NASA systems engineering features for your Space Apps Challenge project page?
