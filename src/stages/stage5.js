import { SCIENCE_OBJECTIVES, CML_LEVELS } from '../config.js';
import { state, getScenario, getVehicle } from '../state.js';

const STORAGE_KEY = 'orbital_kitchen_mission_history_v1';

const DEFAULT_CML_NAMES = {
  1: 'Cocktail Napkin',
  2: 'Initial Feasibility',
  3: 'Trade Space',
  4: 'Point Design'
};

const GRADE_WEIGHT = { S: 4, A: 3, B: 2, C: 1 };

const GRADE_STYLE = {
  S: 'background:rgba(253,224,71,0.18);color:#fde047;border:1px solid rgba(253,224,71,0.55);',
  A: 'background:rgba(74,222,128,0.18);color:#4ade80;border:1px solid rgba(74,222,128,0.5);',
  B: 'background:rgba(56,189,248,0.18);color:#38bdf8;border:1px solid rgba(56,189,248,0.5);',
  C: 'background:rgba(248,113,113,0.18);color:#f87171;border:1px solid rgba(248,113,113,0.5);'
};

function round1(val) {
  return Math.round(Number(val || 0) * 10) / 10;
}

function resolveCmlName(level) {
  const entry = Array.isArray(CML_LEVELS)
    ? CML_LEVELS.find(item => item?.level === level || item?.id === level) || CML_LEVELS[level - 1]
    : CML_LEVELS?.[level];
  if (typeof entry === 'string') return entry;
  return entry?.name || entry?.title || entry?.label || DEFAULT_CML_NAMES[level] || 'Trade Space';
}

function resolveObjective() {
  return (
    SCIENCE_OBJECTIVES?.[state.selectedObjective]
    || Object.values(SCIENCE_OBJECTIVES || {})[0]
    || {
      id: state.selectedObjective || 'polar_volatiles',
      title: 'Lunar Science Investigation',
      scienceDomain: 'Planetary Science & Exploration',
      targetLocation: 'Lunar Surface',
      requiredModules: ['sensor_pod', 'power_pack'],
      minCryoSamples: 1,
      baselineBonus: { scienceMultiplier: 1.0, label: 'Science Yield' }
    }
  );
}

function loadMissionHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMissionRecord(record) {
  try {
    const list = loadMissionHistory();
    list.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 6)));
    return list.slice(0, 6);
  } catch {
    return [record];
  }
}

/**
 * Evaluate the 4-Pillar NASA Phase A Closeout and final CML Maturity Gate.
 */
export function evaluatePhaseACloseout() {
  const scen = getScenario();
  const veh = getVehicle();
  const objective = resolveObjective();
  const reqMods = Array.isArray(objective.requiredModules) ? objective.requiredModules : [];
  const shipped = state.shippedModules || {};
  const allReqBuilt = reqMods.length > 0 ? reqMods.every(id => Number(shipped[id] || 0) > 0) : true;
  const auditPassed = typeof state.scienceAuditPassed === 'boolean' ? state.scienceAuditPassed : allReqBuilt;

  const roverSamples = (state.rover?.hasSample ? 1 : 0) + (state.rover2?.hasSample ? 1 : 0);
  const samplesCount = Math.max(
    Number(state.samplesCollectedCount || 0),
    roverSamples,
    state.sampleCollected ? 1 : 0
  );
  const minSamples = Number(objective.minCryoSamples || 1);
  const samplesMet = samplesCount >= minSamples || Boolean(state.sampleCollected);

  // Pillar 1: Science Traceability
  let scienceGrade = 'C';
  if (auditPassed && samplesCount >= Math.max(2, minSamples + 1)) {
    scienceGrade = 'S';
  } else if (auditPassed && samplesMet) {
    scienceGrade = 'A';
  } else if (auditPassed || samplesCount >= 1 || state.sampleCollected) {
    scienceGrade = 'B';
  }
  const scienceYieldInfo = state.sampleYieldText ? ` | ${state.sampleYieldText}` : '';
  const scienceDetail = `${auditPassed ? 'Pre-Phase A Audit PASS' : 'Audit Incomplete'} | ${samplesCount} sample${samplesCount === 1 ? '' : 's'}${scienceYieldInfo}`;

  // Pillar 2: Systems Margins
  const mass = Number(state.telemetry?.mass ?? 0);
  const maxMass = Number(state.telemetry?.maxMass ?? veh.maxMass ?? 1050);
  const massOk = mass <= maxMass;
  const massMarginPct = maxMass > 0 ? ((maxMass - mass) / maxMass) * 100 : 0;
  const budget = Number(state.telemetry?.budget ?? 0);
  const budgetOk = budget >= 0;
  const fuel = Number(state.telemetry?.fuel ?? 0);
  const batteryMarginPct = Math.max(0, Math.min(100, Number(state.rover?.battery ?? state.telemetry?.power ?? 0)));

  let systemsGrade = 'C';
  if (massOk && budgetOk && massMarginPct >= 15 && fuel >= 50) {
    systemsGrade = 'S';
  } else if (massOk && budgetOk && fuel >= 25) {
    systemsGrade = 'A';
  } else if ((massOk && budgetOk) || ((massOk || budgetOk) && fuel >= 15)) {
    systemsGrade = 'B';
  }
  const systemsDetail = `Mass ${massMarginPct >= 0 ? '+' : ''}${massMarginPct.toFixed(1)}% | $${budget}M | Fuel ${Math.round(fuel)}%`;

  // Pillar 3: Flight Ops (Ascent + Stage 2 MCC-1 + Stage 3 Touchdown)
  const ascentAborted = Boolean(state.ascent?.aborted);
  const ascentIntegrity = Number(state.ascent?.integrity ?? 100);
  const ascentNominal = !ascentAborted && ascentIntegrity >= 60;
  const ascentEfficiency = state.ascent?.separated
    ? round1(Math.min(100, Math.max(0, ascentIntegrity)))
    : round1(Math.max(0, ascentIntegrity * 0.75));

  const mcc = state.mccResult || {};
  const mccCompleted = Boolean(mcc.completed);
  const bPlaneMissKm = Number(mcc.bPlaneMissKm ?? 120);
  const mccNominal = Boolean(mcc.nominalCapture || (mccCompleted && bPlaneMissKm <= 25));
  const mccMarginal = !mccNominal && Boolean(mccCompleted && bPlaneMissKm <= 75);
  const mccFuelPenaltyPct = Number(mcc.fuelPenaltyPct ?? (mccNominal ? 0 : mccMarginal ? 8 : 18));

  const landingStr = String(state.landingGrade || 'Nominal');
  const landingTextbook = /TEXTBOOK/i.test(landingStr);
  const landingDegraded = /HARD|FIELD|SHOCK|ABORT|FAIL/i.test(landingStr);
  const landingClean = !landingDegraded;

  let flightGrade = 'C';
  if (ascentNominal && mccNominal && landingTextbook) {
    flightGrade = 'S';
  } else if (ascentNominal && ((mccNominal && landingClean) || (mccMarginal && landingTextbook))) {
    flightGrade = 'A';
  } else if (ascentNominal && (mccNominal || mccMarginal || landingClean)) {
    flightGrade = 'B';
  }
  const mccLabel = mccCompleted ? `MCC-1 ${round1(bPlaneMissKm)} km` : 'MCC-1 Skipped';
  const flightDetail = `Ascent ${ascentNominal ? 'OK' : 'WARN'} | ${mccLabel} | ${landingStr}`;

  // Pillar 4: Reentry & Vault Integrity
  const r = state.reentry || {};
  const reentrySurvived = !r.aborted;
  const sampleVaultTempC = Number(r.sampleVaultTempC ?? -80);
  const vaultIntact = sampleVaultTempC < 0;
  const samplePurity = Number(r.samplePurity ?? (vaultIntact ? 100 : 45));
  const peakG = Number(r.peakG ?? r.gLoad ?? 3.8);
  const peakHeat = Number(r.peakHeat ?? r.heat ?? 35);
  const reentryGradeStr = String(r.grade || 'Nominal');
  const carrierPinpoint = /CARRIER|PINPOINT/i.test(reentryGradeStr);

  let reentryGrade = 'C';
  if (reentrySurvived && vaultIntact && samplePurity >= 100 && sampleVaultTempC <= -20 && (carrierPinpoint || /Nominal/i.test(reentryGradeStr))) {
    reentryGrade = 'S';
  } else if (reentrySurvived && vaultIntact && samplePurity >= 75) {
    reentryGrade = 'A';
  } else if (reentrySurvived) {
    reentryGrade = 'B';
  }
  const reentryDetail = reentrySurvived
    ? `Vault ${round1(sampleVaultTempC)}C (${Math.round(samplePurity)}% purity) | Peak ${round1(peakG)}G`
    : `Reentry Aborted: ${r.abortReason || 'Thermal/Entry Loss'}`;

  // Overall Grade & CML Gate Verdict
  const pillarGrades = [scienceGrade, systemsGrade, flightGrade, reentryGrade];
  const avgWeight = pillarGrades.reduce((sum, g) => sum + GRADE_WEIGHT[g], 0) / 4;
  const hasC = pillarGrades.includes('C');

  let overallGrade = 'C';
  if (!reentrySurvived) {
    overallGrade = 'C';
  } else if (avgWeight >= 3.5 && !hasC) {
    overallGrade = 'S';
  } else if (avgWeight >= 2.75) {
    overallGrade = 'A';
  } else if (avgWeight >= 1.75) {
    overallGrade = 'B';
  }

  const requirementsMet = auditPassed && samplesMet;
  const cml4Validated = requirementsMet && vaultIntact && reentrySurvived;
  const targetCML = 4;
  const achievedCML = cml4Validated ? 4 : 3;
  const maturityLevelName = resolveCmlName(achievedCML);
  const gateVerdict = cml4Validated ? 'CML-4 Point Design Validated' : 'CML-3 Conditional';
  const gateVerdictCode = cml4Validated
    ? 'PASS - FLIGHT DEMONSTRATED'
    : (reentrySurvived ? 'CONDITIONAL - PHASE A REVIEW' : 'ANOMALY - REDESIGN REQUIRED');

  return {
    overallGrade,
    achievedCML,
    targetCML,
    maturityLevelName,
    gateVerdict,
    gateVerdictCode,
    cml4Validated,
    requirementsMet,
    auditPassed,
    samplesMet,
    vaultIntact,
    reentrySurvived,
    objective,
    scenario: scen,
    vehicle: veh,
    samplesCount,
    minSamples,
    pillars: [
      { id: 'science', title: '1. Science Traceability', grade: scienceGrade, detail: scienceDetail },
      { id: 'systems', title: '2. Systems Margins', grade: systemsGrade, detail: systemsDetail },
      { id: 'flight', title: '3. Flight Ops', grade: flightGrade, detail: flightDetail },
      { id: 'reentry', title: '4. Reentry & Vault', grade: reentryGrade, detail: reentryDetail }
    ],
    metrics: {
      mass,
      maxMass,
      massMarginPct: round1(massMarginPct),
      budget,
      fuel: round1(fuel),
      batteryMarginPct: round1(batteryMarginPct),
      ascentEfficiency,
      ascentNominal,
      ascentAborted,
      mccCompleted,
      bPlaneMissKm: round1(bPlaneMissKm),
      mccNominal,
      mccFuelPenaltyPct,
      landingStr,
      sampleVaultTempC: round1(sampleVaultTempC),
      samplePurity: Math.round(samplePurity),
      peakG: round1(peakG),
      peakHeat: round1(peakHeat),
      heatshieldMaxTempC: Math.round(350 + peakHeat * 21),
      reentryGradeStr,
      sciencePoints: Math.round(state.telemetry?.science ?? 0),
      totalScore: Math.round(state.score ?? 0)
    }
  };
}

/**
 * Build the structured RevisiD NASA Phase A Closeout JSON report.
 */
export function buildPhaseADebriefReport(evaluation = evaluatePhaseACloseout()) {
  const ev = evaluation;
  const m = ev.metrics;
  const obj = ev.objective;
  const reqMods = Array.isArray(obj.requiredModules) ? obj.requiredModules : [];

  const ratingByGrade = {
    S: 'FLAGSHIP CLASS EXCELLENCE (CLASS S)',
    A: 'FLAGSHIP CLASS SUCCESS (CLASS A)',
    B: 'DISCOVERY CLASS CONDITIONAL (CLASS B)',
    C: 'ANOMALY REVIEW REQUIRED (CLASS C)'
  };

  const events = Array.isArray(state.blackBoxEvents) ? state.blackBoxEvents : [];
  const causalTraceabilityLog = events.length > 0
    ? events.map(item => `${item.stage}: ${item.text}`)
    : ['PRE-LAUNCH: Baseline telemetry initialized with no anomalies logged.'];

  const baselineYield = ev.requirementsMet ? 100.0 : (ev.samplesCount >= 1 || ev.auditPassed ? 60.0 : 0.0);
  const bonusYield = round1((ev.samplesCount >= 2 ? 25 : 0) + Math.min(45, m.sciencePoints * 0.25));

  return {
    project: 'ORBITAL KITCHEN // NASA SPACE APPS CHALLENGE',
    reviewType: 'NASA Phase A Mission Closeout & Post-Flight Assessment',
    timestamp: new Date().toISOString(),
    cmlMaturitySummary: {
      targetCML: ev.targetCML,
      achievedCML: ev.achievedCML,
      maturityLevelName: ev.maturityLevelName,
      gateReviewVerdict: ev.gateVerdictCode,
      gateVerdictLabel: ev.gateVerdict,
      overallNasaGrade: ev.overallGrade,
      fourPillarGrades: {
        scienceTraceability: ev.pillars[0].grade,
        systemsMargins: ev.pillars[1].grade,
        flightOps: ev.pillars[2].grade,
        reentryAndVault: ev.pillars[3].grade
      }
    },
    prePhaseABaseline: {
      objectiveId: obj.id || state.selectedObjective || 'polar_volatiles',
      objectiveTitle: obj.title || 'Lunar Science Investigation',
      scienceDomain: obj.scienceDomain || 'Planetary Science & Exploration',
      targetLocation: obj.targetLocation || 'Lunar Surface',
      baselineRequirements: {
        mandatoryModules: reqMods,
        minimumCoreSamples: ev.minSamples,
        maxCoreVaultTempC: 0.0
      },
      scienceAuditPassed: ev.auditPassed,
      shippedModules: { ...(state.shippedModules || {}) }
    },
    systemsEngineeringMargins: {
      launchVehicle: ev.vehicle.name,
      scenario: ev.scenario.name,
      dryMassKg: m.mass,
      maxMassKg: m.maxMass,
      massMarginPercent: m.massMarginPct,
      remainingBudgetM: m.budget,
      endOfMissionBatteryMarginPercent: m.batteryMarginPct,
      cislunarDeltaVMarginPercent: m.fuel
    },
    flightOperationalOutcomes: {
      stage1B_Liftoff: {
        stageSeparationEfficiency: m.ascentEfficiency,
        ascentPitchNominal: m.ascentNominal,
        aborted: m.ascentAborted
      },
      stage2_Transit: {
        mcc1BurnExecuted: m.mccCompleted,
        finalBPlaneMissKm: m.bPlaneMissKm,
        lunarCorridorCaptured: m.mccNominal,
        fuelPenaltyPct: m.mccFuelPenaltyPct
      },
      stage3_Surface: {
        landingGrade: m.landingStr,
        samplesDrilled: ev.samplesCount,
        sampleYield: state.sampleYieldText || (ev.samplesCount > 0 ? `${m.sciencePoints} pts` : 'None collected'),
        roverTetherBonusAchieved: Boolean(state.missionChoices?.roverTether || ev.samplesCount >= 2)
      },
      stage4_Reentry: {
        profileSelected: state.missionChoices?.reentry || 'Standard Entry',
        peakDecelG: m.peakG,
        heatshieldMaxTempC: m.heatshieldMaxTempC,
        peakHeatPercent: m.peakHeat,
        sampleVaultFinalTempC: m.sampleVaultTempC,
        samplePurityPercent: m.samplePurity,
        recoveryGrade: m.reentryGradeStr
      }
    },
    scientificEvaluation: {
      baselineScienceYieldPercent: baselineYield,
      bonusScienceYieldPercent: bonusYield,
      totalSciencePoints: m.sciencePoints,
      totalMissionScore: m.totalScore,
      nasaMissionRating: ratingByGrade[ev.overallGrade] || ratingByGrade.B
    },
    causalTraceabilityLog
  };
}

function downloadJSONReport(report) {
  const filename = `NASA_CML_PhaseA_Debrief_${Date.now()}.json`;
  const jsonText = JSON.stringify(report, null, 2);
  let url = null;
  let useObjectUrl = false;

  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([jsonText], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    useObjectUrl = true;
  } else {
    url = `data:application/json;charset=utf-8,${encodeURIComponent(jsonText)}`;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  if (document.body?.appendChild) {
    document.body.appendChild(a);
  }
  a.click();
  if (typeof a.remove === 'function') {
    a.remove();
  }
  if (useObjectUrl && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function startStage5Debrief(onRestart, onBackToMenu) {
  state.stage = 'STAGE5';
  const btnNext = document.getElementById('btn-next');
  const btnSkip = document.getElementById('btn-skip');
  if (btnNext) btnNext.style.display = 'none';
  if (btnSkip) btnSkip.style.display = 'none';

  const evalResult = evaluatePhaseACloseout();
  state.currentCML = evalResult.achievedCML;

  const scen = evalResult.scenario;
  const veh = evalResult.vehicle;
  const m = evalResult.metrics;
  const stars = state.score >= 1200 ? '⭐⭐⭐' : state.score >= 750 ? '⭐⭐' : '⭐';

  const record = {
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    scenario: scen.name,
    vehicle: veh.name,
    score: state.score,
    science: m.sciencePoints,
    mass: `${m.mass}/${m.maxMass}kg`,
    samples: evalResult.samplesCount,
    grade: evalResult.overallGrade,
    cml: `CML-${evalResult.achievedCML}`
  };
  const history = saveMissionRecord(record);

  const gateBannerStyle = evalResult.cml4Validated
    ? 'background:rgba(74,222,128,0.14);border:1px solid rgba(74,222,128,0.45);color:#bbf7d0;'
    : 'background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.45);color:#fef08a;';

  const checkTag = (ok, label) => (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;background:${ok ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)'};color:${ok ? '#4ade80' : '#f87171'};border:1px solid ${ok ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'};">${ok ? 'PASS' : 'MISS'}: ${label}</span>`
  );

  const pillarCards = evalResult.pillars.map(p => `
    <div class="pillar-card" style="background:rgba(27,37,59,0.92);border:1px solid rgba(148,163,184,0.22);border-radius:14px;padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:700;color:#eef2f8;">${p.title}</span>
        <span class="grade-pill grade-${p.grade.toLowerCase()}" style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;padding:2px 9px;border-radius:9999px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:800;${GRADE_STYLE[p.grade]}">${p.grade}</span>
      </div>
      <div style="font-size:11.5px;color:#94a3b8;line-height:1.35;">${p.detail}</div>
    </div>
  `).join('');

  const timelineRows = state.blackBoxEvents.slice(-8).map(ev => `
    <div class="timeline-item">
      <span><b style="color:${ev.kind === 'good' ? '#4ade80' : ev.kind === 'warn' ? '#fbbf24' : '#38bdf8'}">${ev.stage}</b> &middot; ${ev.text}</span>
    </div>
  `).join('');

  const historyRows = history.map((h, i) => `
    <div class="timeline-item">
      <span>#${i + 1} ${h.scenario}${h.grade ? ` (${h.grade})` : ''}</span>
      <span><b>${h.score}⭐</b> &middot; ${h.science} sci</span>
    </div>
  `).join('');

  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
      <h1 style="margin:0;">${stars} NASA Phase A Mission Closeout</h1>
      <span class="grade-pill grade-${evalResult.overallGrade.toLowerCase()}" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:9999px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;${GRADE_STYLE[evalResult.overallGrade]}">NASA GRADE ${evalResult.overallGrade}</span>
    </div>
    <p class="sub" style="margin-bottom:12px;">${evalResult.objective.title} &middot; ${scen.name} &middot; ${veh.name} &middot; Recovery: <b>${m.reentryGradeStr}</b></p>

    <div style="${gateBannerStyle}border-radius:14px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;opacity:0.85;">Concept Maturity Level Gate (${evalResult.maturityLevelName})</div>
        <div style="font-size:15px;font-weight:800;margin-top:2px;">${evalResult.gateVerdict}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${checkTag(evalResult.requirementsMet, 'Science Req')}
        ${checkTag(evalResult.vaultIntact, `Vault ${m.sampleVaultTempC}C`)}
        ${checkTag(evalResult.reentrySurvived, 'Reentry')}
      </div>
    </div>

    <div class="pillar-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px;">
      ${pillarCards}
    </div>

    <div class="debrief-kpis">
      <div class="kpi-card"><small>Score</small><b>${m.totalScore}⭐</b></div>
      <div class="kpi-card"><small>Science</small><b>${m.sciencePoints} pts</b></div>
      <div class="kpi-card"><small>Mass</small><b>${m.mass}/${m.maxMass}kg</b></div>
      <div class="kpi-card"><small>Vault Temp</small><b>${m.sampleVaultTempC}C (${m.samplePurity}%)</b></div>
      <div class="kpi-card"><small>Samples</small><b>${evalResult.samplesCount}/${Math.max(2, evalResult.minSamples)}</b></div>
    </div>

    <div class="config-row">
      <div class="config-panel">
        <h3>Black Box Flight Log</h3>
        <div class="timeline-list">${timelineRows || '<div class="timeline-item">No events logged.</div>'}</div>
      </div>
      <div class="config-panel">
        <h3>Saved Runs</h3>
        <div class="timeline-list">${historyRows}</div>
      </div>
    </div>

    <div class="modal-actions">
      <button id="btn-export-report" class="btn-secondary" type="button">Export JSON</button>
      <button id="btn-change-design" class="btn-secondary" type="button">Change Setup</button>
      <button id="btn-fly-again" class="btn-play" type="button">Fly New Mission</button>
    </div>
  `;

  document.getElementById('btn-fly-again').addEventListener('click', onRestart);
  document.getElementById('btn-change-design').addEventListener('click', onBackToMenu);
  document.getElementById('btn-export-report').addEventListener('click', () => {
    const report = buildPhaseADebriefReport(evalResult);
    downloadJSONReport(report);
  });

  modal.classList.remove('hidden');
}
