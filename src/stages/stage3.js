import { LOGICAL_W, LOGICAL_H, LUNAR_W, LUNAR_H, CREW_ROSTER, SCIENCE_OBJECTIVES } from '../config.js';
import { state, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet } from '../net.js';
import { addFloatText, drawCanvasControlBar } from '../sprites.js';
import { setStageBanner, updateBottomHUD, showMissionToast } from '../hud.js';
import { triggerDilemma } from '../dilemmas.js';

function getObjectiveSampleFlavor(objectiveId, sampleCount = 1, sciMul = 1) {
  const highYield = sampleCount >= 2 || sciMul > 1;
  if (objectiveId === 'mantle_geochem') {
    return {
      shortLabel: 'Ti/Fe Basalt Core',
      yieldText: highYield ? '8.6% Ti/Fe Basalt' : '7.4% Ti/Fe Basalt',
      detail: 'Titanium-Iron Basalt stratigraphy verified'
    };
  }
  if (objectiveId === 'heliophysics_space_weather') {
    return {
      shortLabel: 'Solar Wind Regolith',
      yieldText: highYield ? 'SEP Flux 2.4x10^4' : 'SEP Flux 1.8x10^4',
      detail: 'Solar Wind Regolith / SEP Flux trapped isotopes logged'
    };
  }
  return {
    shortLabel: 'Cryo-Ice Core',
    yieldText: highYield ? '540 ppm H2O Eq.' : '480 ppm H2O Eq.',
    detail: 'Subsurface volatiles ppm H2O Equivalent verified'
  };
}

function build25DLunarTerrain() {
  state.lunarCraters = [
    { x: 640,  y: 440,  rx: 48, ry: 22, isTarget: false },
    { x: 890,  y: 960,  rx: 56, ry: 26, isTarget: false },
    { x: 1180, y: 490,  rx: 44, ry: 20, isTarget: false },
    { x: 1480, y: 1080, rx: 60, ry: 28, isTarget: false },
    { x: 1620, y: 420,  rx: 50, ry: 22, isTarget: false },
    { x: 1980, y: 690,  rx: 88, ry: 42, isTarget: true }
  ];

  state.lunarBoulders = [
    { x: 580,  y: 660,  r: 18 },
    { x: 760,  y: 560,  r: 21 },
    { x: 1020, y: 740,  r: 19 },
    { x: 1290, y: 640,  r: 22 },
    { x: 1380, y: 890,  r: 17 },
    { x: 1680, y: 780,  r: 20 },
    { x: 1810, y: 540,  r: 18 }
  ];

  state.scienceNodes = [
    { id: 'basalt',   name: 'Basalt Ridge',     x: 840,  y: 410,  scanned: false, pts: 65 },
    { id: 'ice',      name: 'Shadowed Ice Core', x: 1120, y: 1090, scanned: false, pts: 75 },
    { id: 'regolith', name: 'South Rim Vein',    x: 1580, y: 360,  scanned: false, pts: 75 }
  ];

  state.evaTasks = [
    { id: 'seismic', kind: 'SEISMIC', name: 'Seismic Array',    x: 960,  y: 840, progress: 0, done: false, pts: 95 },
    { id: 'beacon',  kind: 'RELAY',   name: 'Lunar Relay Dish', x: 1420, y: 560, progress: 0, done: false, pts: 95 },
    { id: 'thermal', kind: 'SEISMIC', name: 'Thermal Sensor',   x: 1740, y: 980, progress: 0, done: false, pts: 105 }
  ];
}

// ============================================================================
// STAGE 3A: SMOOTH 2.5D LUNAR DESCENT (ZERO SNAPPING!)
// ============================================================================
export function startStage3A() {
  state.stage = 'STAGE3A';
  state.stageTimer = 45;
  state.lunarParticles = [];
  state.floatingTexts = [];
  state.roverTracks = [];
  state.landingGrade = 'Nominal';
  state.sampleCollected = false;
  state.samplesCollectedCount = 0;
  state.sampleYieldText = '';

  const objective = SCIENCE_OBJECTIVES?.[state.selectedObjective] || SCIENCE_OBJECTIVES?.polar_volatiles;
  const targetSiteName = objective?.targetLocation || 'Shackleton Crater Rim';
  const targetScienceLabel = objective?.baselineBonus?.label || objective?.title || 'ppm H2O Eq.';

  const baseFuel = Math.max(60, Math.min(125, state.telemetry.fuel));
  const mcc = state.mccResult;
  const rawPenaltyPct = mcc
    ? (mcc.nominalCapture
        ? 0
        : (typeof mcc.fuelPenaltyPct === 'number'
            ? mcc.fuelPenaltyPct
            : (mcc.bPlaneMissKm > 75 || !mcc.completed ? 18 : 8)))
    : 0;
  const fuelPenaltyPct = Math.max(0, rawPenaltyPct);
  const startFuel = fuelPenaltyPct > 0
    ? Math.max(40, Math.round(baseFuel * (1 - fuelPenaltyPct / 100)))
    : baseFuel;

  state.missionChoices.landingSite = targetSiteName;
  state.missionChoices.targetSiteName = targetSiteName;
  state.missionChoices.targetScienceLabel = targetScienceLabel;
  state.missionChoices.scienceMul = state.missionChoices.scienceMul || 1;
  state.missionChoices.approachProfile = state.missionChoices.approachProfile || 'Precision Rim Hover';

  state.lander = {
    x: 880,
    y: 590,
    z: 235,
    vx: -28,
    vy: 10,
    vz: -14,
    tiltX: 0,
    fuel: startFuel,
    maxFuel: startFuel,
    thrusting: false,
    hoverTrim: false,
    p2AssistActive: false,
    legAnim: 0,
    legCompress: 0,
    settleTimer: 0,
    autoLanding: false,
    padX: 430,
    padY: 730,
    padRadius: 105,
    windMul: 1.0,
    landed: false,
    targetSiteName,
    targetScienceLabel
  };

  build25DLunarTerrain();

  state.lunarCam = {
    x: Math.max(0, Math.min(LUNAR_W - LOGICAL_W, state.lander.x - LOGICAL_W / 2)),
    y: Math.max(0, Math.min(LUNAR_H - LOGICAL_H, state.lander.y - LOGICAL_H / 2 - 40))
  };

  setStageBanner(
    'STAGE 3A: LUNAR DESCENT',
    `Land Safely on POINT A (${targetSiteName})`,
    `Hold SPACE for retro-thrust, steer with WASD onto Point A (${targetScienceLabel}), and hold SHIFT for hover trim.`,
    `<kbd>WASD</kbd> Steer &nbsp;•&nbsp; <kbd>SPACE</kbd> Retro Thrust &nbsp;•&nbsp; <kbd>SHIFT</kbd> Hover Trim`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  playTone(300, 'triangle', 0.25, 0.12);

  if (fuelPenaltyPct > 0) {
    const missTxt = mcc?.bPlaneMissKm != null ? `${Math.round(mcc.bPlaneMissKm)} km B-plane miss` : 'off-nominal MCC-1';
    showMissionToast('MCC-1 Fuel Penalty', `-${fuelPenaltyPct}% descent propellant (${missTxt}).`);
    logBlackBox('STAGE 3A', `MCC-1 ${missTxt} imposed -${fuelPenaltyPct}% descent fuel penalty (start fuel ${startFuel}%).`, 'warn');
  }
  updateBottomHUD();

  const fuelNote = fuelPenaltyPct > 0
    ? ` Off-nominal MCC-1 reduced descent propellant by ${fuelPenaltyPct}% (${startFuel}% remaining).`
    : '';

  triggerDilemma({
    id: 'APPROACH_PROFILE',
    badge: 'Stage 3A • Approach Profile',
    title: `Descent Approach: ${targetSiteName}`,
    stageTag: 'STAGE 3A',
    prompt: `Target site locked from Pre-Phase A (${targetSiteName} | ${targetScienceLabel}). Select your powered descent approach profile:${fuelNote}`,
    options: [
      {
        label: 'Precision Rim Hover',
        accent: '#4ade80',
        trade: 'Wider Point A pad (112px) and calmer lateral drift (0.85x); standard 1x EVA science yield.',
        lesson: 'Controlled hover approach reduces touchdown dispersion and protects rover batteries.'
      },
      {
        label: 'Direct Rim Drop',
        accent: '#38bdf8',
        trade: 'Tighter Point A target (74px) and 1.45x lateral drift, but 2x Lunar Sample Science yield!',
        lesson: 'Aggressive direct descent targets higher-yield crater samples at tighter piloting margins.'
      }
    ]
  }, (idx) => {
    if (idx === 0) {
      state.lander.padRadius = 112;
      state.lander.windMul = 0.85;
      state.missionChoices.scienceMul = 1;
      state.missionChoices.approachProfile = 'Precision Rim Hover';
      state.missionChoices.landingSite = targetSiteName;
      showMissionToast('Precision Rim Hover', `Wide pad locked at ${targetSiteName}.`);
    } else {
      state.lander.padRadius = 74;
      state.lander.windMul = 1.45;
      state.missionChoices.scienceMul = 2;
      state.missionChoices.approachProfile = 'Direct Rim Drop';
      state.missionChoices.landingSite = targetSiteName;
      showMissionToast('Direct Rim Drop', `Tight pad locked at ${targetSiteName} with 2x EVA Science.`);
    }
  });
}

export function updateStage3A(dt, onNextStage) {
  const l = state.lander;

  // Smooth post-touchdown suspension settle before advancing (never snap!)
  if (l.landed) {
    l.tiltX *= Math.pow(0.08, dt);
    l.legCompress = Math.max(0, l.legCompress - dt * 1.4);
    l.settleTimer += dt;
    // Smooth camera pan stays locked cleanly on landed rocket
    const tx = Math.max(0, Math.min(LUNAR_W - LOGICAL_W, l.x - LOGICAL_W / 2 + 120));
    const ty = Math.max(0, Math.min(LUNAR_H - LOGICAL_H, l.y - LOGICAL_H / 2));
    state.lunarCam.x += (tx - state.lunarCam.x) * Math.min(1, dt * 4);
    state.lunarCam.y += (ty - state.lunarCam.y) * Math.min(1, dt * 4);
    if (l.settleTimer >= 1.55) {
      onNextStage();
    }
    return;
  }

  // Smooth auto-pilot descent if timer reaches 0 (no teleporting!)
  if (state.stageTimer <= 0 && !l.autoLanding) {
    l.autoLanding = true;
    addFloatText(l.x - state.lunarCam.x, l.y - l.z - state.lunarCam.y - 60, 'P2 AUTO-GLIDE FINAL APPROACH!', '#38bdf8');
  }

  const massPenalty = state.telemetry.mass > state.telemetry.maxMass ? 1.25 : 1.0;
  const lunarGravity = 20;
  const mainThrust = 52;

  if (l.autoLanding) {
    l.thrusting = l.vz < -11;
    l.hoverTrim = true;
    const dx = l.padX - l.x;
    const dy = l.padY - l.y;
    l.vx += (Math.max(-95, Math.min(95, dx * 1.1)) - l.vx) * Math.min(1, dt * 3);
    l.vy += (Math.max(-80, Math.min(80, dy * 1.1)) - l.vy) * Math.min(1, dt * 3);
    l.tiltX = Math.max(-0.18, Math.min(0.18, l.vx * 0.002));
    const targetVz = l.z > 25 ? -36 : -12;
    l.vz += (targetVz - l.vz) * Math.min(1, dt * 4.5);
  } else {
    l.thrusting = (state.keys['Space'] || state.keys['ArrowUp']) && l.fuel > 0;
    l.hoverTrim = (state.keys['ShiftLeft'] || state.keys['ShiftRight'] || state.keys['KeyI']) && l.fuel > 0;

    l.p2AssistActive = false;
    if ((state.coopMode === '4P_AI' || state.coopMode === 'NET_4P') && l.z < 95 && l.vz < -20 && !l.thrusting && !l.hoverTrim && l.fuel > 10) {
      l.p2AssistActive = true;
      l.vz += 15 * dt;
    }

    if (l.thrusting) {
      l.vz += mainThrust * dt;
      l.fuel = Math.max(0, l.fuel - dt * 5.8 * massPenalty);
      if (Math.random() < 0.35) playTone(110 + Math.random() * 30, 'sawtooth', 0.06, 0.05);
    } else if (l.hoverTrim || l.p2AssistActive) {
      l.vz += (lunarGravity - l.vz * 1.9) * dt;
      l.fuel = Math.max(0, l.fuel - dt * 2.8 * massPenalty);
    }

    let ax = 0, ay = 0;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) ax -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) ax += 1;
    if (state.keys['KeyW']) ay -= 1;
    if (state.keys['KeyS']) ay += 1;

    if (ax !== 0 || ay !== 0) {
      l.vx += ax * 60 * dt;
      l.vy += ay * 48 * dt;
      l.tiltX += (ax * 0.16 - l.tiltX) * Math.min(1, dt * 7);
      if (l.fuel > 0) l.fuel = Math.max(0, l.fuel - dt * 1.0);
    } else {
      l.vx *= Math.pow(0.28, dt);
      l.vy *= Math.pow(0.28, dt);
      l.tiltX *= Math.pow(0.15, dt);
    }

    l.vx += Math.sin(performance.now() * 0.0019) * 14 * (l.windMul || 1) * dt;
    l.vz -= lunarGravity * dt;
  }

  l.x = Math.max(150, Math.min(LUNAR_W - 150, l.x + l.vx * dt));
  l.y = Math.max(260, Math.min(LUNAR_H - 120, l.y + l.vy * dt));
  l.z += l.vz * dt;

  // Smooth camera tracking
  const camTargetX = Math.max(0, Math.min(LUNAR_W - LOGICAL_W, l.x - LOGICAL_W / 2));
  const camTargetY = Math.max(0, Math.min(LUNAR_H - LOGICAL_H, (l.y - l.z * 0.45) - LOGICAL_H / 2));
  state.lunarCam.x += (camTargetX - state.lunarCam.x) * Math.min(1, dt * 6);
  state.lunarCam.y += (camTargetY - state.lunarCam.y) * Math.min(1, dt * 6);

  if (l.z < 90) l.legAnim = Math.min(1, l.legAnim + dt * 2.6);

  if ((l.thrusting || l.hoverTrim || l.p2AssistActive) && l.z < 105) {
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      state.lunarParticles.push({
        x: l.x + Math.cos(ang) * 26,
        y: l.y + Math.sin(ang) * 12,
        vx: Math.cos(ang) * (85 + Math.random() * 75),
        vy: Math.sin(ang) * (40 + Math.random() * 35),
        life: 0.55,
        size: 3.5 + Math.random() * 3.5,
        color: '#cbd5e1'
      });
    }
  }

  if (l.z <= 0) {
    l.z = 0;
    l.landed = true;
    l.legCompress = 0.65;
    l.settleTimer = 0;
    state.screenShake = 0.25;
    const vSpd = Math.abs(l.vz * 0.24);
    const padDist = Math.hypot(l.x - l.padX, (l.y - l.padY) * 1.4);
    const onPad = padDist <= (l.padRadius || 105);

    // Never snap position! Set Point A pad marker cleanly or keep exact landed coordinates for Stage 3B
    if (!onPad) {
      l.padX = l.x;
      l.padY = l.y;
    }

    if (onPad && vSpd <= 4.2) {
      l.hardLandingPenalty = false;
      state.landingGrade = 'TEXTBOOK 4P BUTTER LANDING (+200⭐)';
      state.score += 200;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 105, 'TEXTBOOK 4P TOUCHDOWN! +200⭐', '#4ade80');
      logBlackBox('STAGE 3A', `Textbook landing at Point A (${vSpd.toFixed(1)} m/s, ${Math.round(l.fuel)}% fuel left).`, 'good');
    } else if (onPad && vSpd <= 6.8) {
      l.hardLandingPenalty = false;
      state.landingGrade = 'SAFE TOUCHDOWN (+140⭐)';
      state.score += 140;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 105, 'SAFE LANDING! +140⭐', '#38bdf8');
      logBlackBox('STAGE 3A', `Safe touchdown at Point A (${vSpd.toFixed(1)} m/s).`, 'good');
    } else {
      l.hardLandingPenalty = true;
      l.shockRepaired = false;
      state.landingGrade = onPad ? 'HARD PAD TOUCHDOWN (+85⭐ • -28Wh SHOCK)' : 'FIELD LANDING (+85⭐ • -28Wh SHOCK)';
      state.score += 85;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 105, 'HARD TOUCHDOWN! ROVER BATTERY SHOCK (-28Wh)!', '#fbbf24');
      logBlackBox('STAGE 3A', `Hard touchdown (${vSpd.toFixed(1)} m/s) caused -28 Wh rover battery shock (repairable at Lander).`, 'warn');
    }
    playSuccessChord();
    showMissionToast('Lunar Touchdown', state.landingGrade);
  }
  updateBottomHUD();
}

// ============================================================================
// STAGE 3B: DUAL 6-WHEELED MOON ROVER EVA + VARIED EVA TASKS
// ============================================================================
export function startStage3B() {
  state.stage = 'STAGE3B';
  state.stageTimer = 95;
  state.lunarParticles = [];
  state.roverTracks = [];
  state.sampleCollected = false;
  state.samplesCollectedCount = 0;
  state.sampleYieldText = '';

  const px = state.lander.padX || 430;
  const py = state.lander.padY || 730;
  const bonusWh = state.missionChoices?.roverBonusWh || 0;
  const maxBatt = Math.max(85, Math.min(180, 90 + Math.round(state.telemetry.power * 0.25) + bonusWh));
  const startBatt = state.lander.hardLandingPenalty ? Math.max(38, maxBatt - 28) : maxBatt;
  state.rover = {
    id: 'LTV-1 (P1+P3)',
    bodyColor: '#f59e0b',
    x: px + 92, y: py + 8, z: 0,
    vx: 0, vy: 0, vz: 0,
    facingX: 1, facingY: 0,
    wheelSpin: 0,
    battery: startBatt,
    maxBattery: maxBatt,
    hasSample: false,
    sampleStowed: false,
    drilling: false,
    drillProgress: 0,
    armAnim: 0,
    rcsHopping: false,
    trackCd: 0
  };

  state.rover2 = {
    id: 'LTV-2 (P2+P4)',
    bodyColor: '#38bdf8',
    x: px + 76, y: py + 68, z: 0,
    vx: 0, vy: 0, vz: 0,
    facingX: 1, facingY: 0,
    wheelSpin: 0,
    battery: startBatt,
    maxBattery: maxBatt,
    hasSample: false,
    sampleStowed: false,
    drilling: false,
    drillProgress: 0,
    armAnim: 0,
    rcsHopping: false,
    trackCd: 0
  };

  setStageBanner(
    'STAGE 3B: LUNAR SURFACE EVA',
    'Explore the Moon & Drill Point B Crater',
    'Follow the checklist and directional arrows. Park both rovers together for 2x drill speed, finish EVA tasks, and return to the lander.',
    `<kbd>WASD</kbd> LTV-1 &nbsp;•&nbsp; <kbd>IJKL</kbd> LTV-2 (2P) &nbsp;•&nbsp; <kbd>SHIFT</kbd> Hop &nbsp;•&nbsp; <kbd>SPACE</kbd> Task / Tether`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  updateBottomHUD();
}

export function handleStage3BInteract(rv, onNextStage) {
  if (!rv) return;
  for (const sn of state.scienceNodes) {
    if (!sn.scanned && Math.hypot(rv.x - sn.x, rv.y - sn.y) < 68) {
      sn.scanned = true;
      state.score += sn.pts;
      state.telemetry.science += 25;
      addFloatText(sn.x - state.lunarCam.x, sn.y - state.lunarCam.y - 45, `${rv.id} SCANNED ${sn.name.toUpperCase()}! +${sn.pts}⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `${rv.id} scanned ${sn.name} (+25 science).`, 'good');
      playTone(720, 'triangle', 0.16, 0.12);
      updateBottomHUD();
      return;
    }
  }

  if (
    state.lander.hardLandingPenalty &&
    !state.lander.shockRepaired &&
    !state.rover.hasSample &&
    !state.rover2.hasSample &&
    Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) < 125
  ) {
    state.lander.shockRepaired = true;
    state.rover.battery = state.rover.maxBattery;
    state.rover2.battery = state.rover2.maxBattery;
    state.score += 40;
    addFloatText(state.lander.padX - state.lunarCam.x, state.lander.padY - state.lunarCam.y - 95, '🔧 SHOCK DAMAGE REPAIRED! FULL ROVER BATTERY +40⭐', '#4ade80');
    showMissionToast('Rover Battery Repaired', 'Landing shock damage cleared. Full battery restored.');
    logBlackBox('STAGE 3B', 'Crew repaired landing shock damage on rover battery bus (+28 Wh restored).', 'good');
    playSuccessChord();
    updateBottomHUD();
    return;
  }

  // Co-Op Battery Tether Share if near teammate rover and not at a node
  const other = rv === state.rover ? state.rover2 : state.rover;
  if (other && state.coopMode !== 'SOLO' && Math.hypot(rv.x - other.x, rv.y - other.y) < 110 && !rv.hasSample && Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) > 105) {
    rv.battery = Math.min(rv.maxBattery, rv.battery + 18);
    other.battery = Math.min(other.maxBattery, other.battery + 18);
    state.score += 15;
    addFloatText(rv.x - state.lunarCam.x, rv.y - state.lunarCam.y - 45, '🤝 TETHER CHARGE SHARE +15⭐', '#38bdf8');
    playTone(600, 'sine', 0.12, 0.08);
    updateBottomHUD();
    return;
  }

  const r1AtPad = state.rover.hasSample && Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 115;
  const r2AtPad = state.rover2.hasSample && Math.hypot(state.rover2.x - state.lander.padX, state.rover2.y - state.lander.padY) < 115;
  const hasUnstowedAtPad = (r1AtPad && !state.rover.sampleStowed) || (r2AtPad && !state.rover2.sampleStowed);

  if (hasUnstowedAtPad && Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) < 105) {
    const sciMul = state.missionChoices?.scienceMul || 1;
    const objective = SCIENCE_OBJECTIVES?.[state.selectedObjective] || SCIENCE_OBJECTIVES?.polar_volatiles;

    if (r1AtPad) state.rover.sampleStowed = true;
    if (r2AtPad) state.rover2.sampleStowed = true;

    const stowedCount = (state.rover.sampleStowed ? 1 : 0) + (state.rover2.sampleStowed ? 1 : 0);
    const flavor = getObjectiveSampleFlavor(state.selectedObjective, stowedCount, sciMul);
    state.sampleYieldText = flavor.yieldText;

    if (!state.sampleCollected) {
      state.sampleCollected = true;
      state.samplesCollectedCount = Math.max(1, stowedCount);
      const dualBonus = stowedCount >= 2 ? 100 : 0;
      const dualSciBonus = stowedCount >= 2 ? (objective?.dualSampleBonus || 0) : 0;
      const sciGain = Math.round(60 * sciMul) + dualSciBonus;
      const totalPts = 220 + dualBonus;
      state.score += totalPts;
      state.telemetry.science += sciGain;

      addFloatText(
        state.lander.padX - state.lunarCam.x,
        state.lander.padY - state.lunarCam.y - 125,
        `${flavor.shortLabel.toUpperCase()} BOARDED! +${totalPts}⭐`,
        '#4ade80'
      );
      showMissionToast(
        `${flavor.shortLabel} Stowed`,
        `${flavor.yieldText} (+${sciGain} Science${dualBonus > 0 ? ', Dual-Rover Bonus' : ''}).`
      );
      logBlackBox(
        'STAGE 3B',
        `${dualBonus > 0 ? 'Dual-rover' : 'Primary'} ${flavor.shortLabel} stowed aboard Ascent Capsule (${flavor.yieldText}${dualBonus > 0 ? ', +100 dual bonus' : ''}).`,
        'good'
      );
      playSuccessChord();
      updateBottomHUD();
      setTimeout(() => {
        if (state.stage === 'STAGE3B' && onNextStage) onNextStage();
      }, 1000);
    } else if (stowedCount >= 2 && (state.samplesCollectedCount || 0) < 2) {
      state.samplesCollectedCount = 2;
      const dualSciBonus = objective?.dualSampleBonus || 0;
      state.score += 100;
      state.telemetry.science += dualSciBonus;

      addFloatText(
        state.lander.padX - state.lunarCam.x,
        state.lander.padY - state.lunarCam.y - 145,
        'DUAL-ROVER BONUS CORE STOWED! +100⭐',
        '#fde047'
      );
      showMissionToast('Dual-Rover Bonus', `2/2 cores stowed (${flavor.yieldText}).`);
      logBlackBox('STAGE 3B', `Second rover stowed backup ${flavor.shortLabel} (${flavor.yieldText}, +100 dual bonus).`, 'good');
      playSuccessChord();
      updateBottomHUD();
    }
  }
}

function updateSingleRover(rv, input, targetCrater, dt) {
  const other = rv === state.rover ? state.rover2 : state.rover;
  const tethered = other && state.coopMode !== 'SOLO' && Math.hypot(rv.x - other.x, rv.y - other.y) < 130;
  const coopMult = tethered ? 2.0 : 1.0;

  const atCrater = Math.hypot(rv.x - targetCrater.x, rv.y - targetCrater.y) < 92;
  const nearEva = state.evaTasks.find(t => !t.done && Math.hypot(rv.x - t.x, rv.y - t.y) < 74);

  if (nearEva && input.drill) {
    rv.drilling = true;
    rv.vx *= 0.8;
    rv.vy *= 0.8;
    rv.armAnim = Math.min(1, rv.armAnim + dt * 3);
    nearEva.progress += dt * 0.65 * coopMult;
    if (Math.random() < 0.35) playTone(440 + nearEva.progress * 320, 'sine', 0.05, 0.05);
    if (nearEva.progress >= 1) {
      nearEva.done = true;
      rv.drilling = false;
      const sciMul = state.missionChoices?.scienceMul || 1;
      state.score += nearEva.pts + (tethered ? 35 : 0);
      state.telemetry.science += 35 * sciMul;
      if (nearEva.kind === 'RELAY') state.telemetry.comms += 25;
      addFloatText(nearEva.x - state.lunarCam.x, nearEva.y - state.lunarCam.y - 45, `${nearEva.name.toUpperCase()} ONLINE! +${nearEva.pts}⭐`, '#4ade80');
      showMissionToast(nearEva.name, `+${35 * sciMul} Science logged${tethered ? ' (Co-Op Tether 2x speed!)' : ''}.`);
      logBlackBox('STAGE 3B', `${rv.id} deployed ${nearEva.name} (+35 science${tethered ? ', Co-Op Boost!' : ''}).`, 'good');
      playSuccessChord();
    }
  } else if (atCrater && !rv.hasSample && input.drill) {
    rv.drilling = true;
    rv.vx *= 0.8;
    rv.vy *= 0.8;
    rv.armAnim = Math.min(1, rv.armAnim + dt * 3);
    rv.drillProgress += dt * 0.45 * coopMult;
    if (Math.random() < 0.4) {
      state.lunarParticles.push({
        x: rv.x + rv.facingX * 22,
        y: rv.y,
        vx: (Math.random() - 0.5) * 85,
        vy: -25 - Math.random() * 35,
        life: 0.4,
        size: 3,
        color: tethered ? '#38bdf8' : '#4ade80'
      });
    }
    if (rv.drillProgress >= 1) {
      rv.hasSample = true;
      rv.drilling = false;
      const sciMul = state.missionChoices?.scienceMul || 1;
      const extractedCount = (state.rover.hasSample ? 1 : 0) + (state.rover2.hasSample ? 1 : 0);
      const flavor = getObjectiveSampleFlavor(state.selectedObjective, extractedCount, sciMul);
      state.sampleYieldText = flavor.yieldText;
      state.score += 150 + (tethered ? 40 : 0);
      state.telemetry.science += Math.round(45 * sciMul);
      addFloatText(rv.x - state.lunarCam.x, rv.y - state.lunarCam.y - 62, `${rv.id} EXTRACTED ${flavor.shortLabel.toUpperCase()}! +150⭐`, '#4ade80');
      showMissionToast(`${flavor.shortLabel} Extracted`, `${rv.id}: ${flavor.yieldText} (+${Math.round(45 * sciMul)} Science). Return to Lander!`);
      logBlackBox('STAGE 3B', `${rv.id} drilled ${flavor.shortLabel} at Point B Crater (${flavor.yieldText}).`, 'good');
      playSuccessChord();
    }
  } else {
    rv.drilling = false;
    rv.armAnim = Math.max(0, rv.armAnim - dt * 3);

    const maxSpd = rv.battery > 0 ? 235 : 135;
    let mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      rv.facingX = mx;
      rv.facingY = my;
      rv.vx += mx * 540 * dt;
      rv.vy += my * 420 * dt;
      const spd = Math.hypot(rv.vx, rv.vy);
      if (spd > maxSpd) {
        rv.vx = (rv.vx / spd) * maxSpd;
        rv.vy = (rv.vy / spd) * maxSpd;
      }
      rv.battery = Math.max(0, rv.battery - dt * 1.6);
      rv.trackCd = (rv.trackCd || 0) - dt;
      if (rv.z === 0 && rv.trackCd <= 0) {
        rv.trackCd = 0.08;
        state.roverTracks.push({ x: rv.x, y: rv.y + 8, angle: Math.atan2(my, mx) });
        if (state.roverTracks.length > 220) state.roverTracks.shift();
      }
      if (rv.z === 0 && Math.random() < 0.32) {
        state.lunarParticles.push({
          x: rv.x - mx * 20,
          y: rv.y - my * 10,
          vx: -mx * 35 + (Math.random() - 0.5) * 20,
          vy: -my * 20 - 10,
          life: 0.38,
          size: 3,
          color: '#94a3b8'
        });
      }
    } else {
      rv.vx *= 0.86;
      rv.vy *= 0.86;
      rv.battery = Math.min(rv.maxBattery, rv.battery + dt * 3.0);
    }

    rv.rcsHopping = input.hop;
    if (rv.rcsHopping && rv.z === 0 && rv.battery > 2) {
      rv.vz = 165;
      rv.battery = Math.max(0, rv.battery - 3.0);
      playTone(260, 'sine', 0.14, 0.08);
    }
  }

  let nextX = Math.max(90, Math.min(LUNAR_W - 90, rv.x + rv.vx * dt));
  let nextY = Math.max(255, Math.min(LUNAR_H - 70, rv.y + rv.vy * dt));

  if (rv.z < 14) {
    for (const b of state.lunarBoulders) {
      const dist = Math.hypot(nextX - b.x, (nextY - b.y) * 1.6);
      if (dist < b.r + 17) {
        nextX = rv.x;
        nextY = rv.y;
        rv.vx *= -0.3;
        rv.vy *= -0.3;
      }
    }
  }

  rv.x = nextX;
  rv.y = nextY;
  rv.wheelSpin += Math.hypot(rv.vx, rv.vy) * dt * 0.08;

  if (rv.z > 0 || rv.vz > 0) {
    rv.vz -= 290 * dt;
    rv.z += rv.vz * dt;
    if (rv.z <= 0) { rv.z = 0; rv.vz = 0; }
  }
}

function updateCompanionRoverAI(rv, targetCrater, dt) {
  let goalX = state.lander.padX + 48, goalY = state.lander.padY + 25;
  const unscanned = state.scienceNodes.find(s => !s.scanned);
  const nextEva = state.evaTasks.find(t => !t.done);

  if (unscanned) {
    goalX = unscanned.x; goalY = unscanned.y;
  } else if (nextEva) {
    goalX = nextEva.x; goalY = nextEva.y;
  } else if (!rv.hasSample) {
    goalX = targetCrater.x; goalY = targetCrater.y + 22;
  }

  const dx = goalX - rv.x, dy = goalY - rv.y;
  const d = Math.hypot(dx, dy);

  if (d > 26) {
    const nx = dx / d, ny = dy / d;
    rv.facingX = nx; rv.facingY = ny;
    rv.x += nx * 135 * dt;
    rv.y += ny * 105 * dt;
    rv.wheelSpin += 135 * dt * 0.08;
    rv.trackCd = (rv.trackCd || 0) - dt;
    if (rv.z === 0 && rv.trackCd <= 0) {
      rv.trackCd = 0.1;
      state.roverTracks.push({ x: rv.x, y: rv.y + 8, angle: Math.atan2(ny, nx) });
      if (state.roverTracks.length > 140) state.roverTracks.shift();
    }
    for (const b of state.lunarBoulders) {
      if (rv.z === 0 && Math.hypot(rv.x - b.x, rv.y - b.y) < b.r + 24) {
        rv.vz = 145;
      }
    }
  } else if (unscanned && !unscanned.scanned) {
    unscanned.scanned = true;
    state.score += unscanned.pts;
    state.telemetry.science += 25;
    addFloatText(unscanned.x, unscanned.y - 45, `LTV-2 SCANNED ${unscanned.name.toUpperCase()}! +${unscanned.pts}⭐`, '#38bdf8');
  } else if (nextEva && !nextEva.done && Math.hypot(rv.x - nextEva.x, rv.y - nextEva.y) < 60) {
    rv.drilling = true;
    rv.armAnim = 1;
    nextEva.progress += dt * 0.55;
    if (nextEva.progress >= 1) {
      nextEva.done = true;
      rv.drilling = false;
      rv.armAnim = 0;
      state.score += nextEva.pts;
      state.telemetry.science += 35;
      if (nextEva.kind === 'RELAY') state.telemetry.comms += 25;
      addFloatText(nextEva.x, nextEva.y - 45, `LTV-2 DEPLOYED ${nextEva.name.toUpperCase()}! +${nextEva.pts}⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `LTV-2 deployed ${nextEva.name}.`, 'good');
    }
  } else if (!rv.hasSample && Math.hypot(rv.x - targetCrater.x, rv.y - targetCrater.y) < 75) {
    rv.drilling = true;
    rv.armAnim = 1;
    rv.drillProgress += dt * 0.42;
    if (rv.drillProgress >= 1) {
      rv.hasSample = true;
      rv.drilling = false;
      rv.armAnim = 0;
      const sciMul = state.missionChoices?.scienceMul || 1;
      const extractedCount = (state.rover.hasSample ? 1 : 0) + (state.rover2.hasSample ? 1 : 0);
      const flavor = getObjectiveSampleFlavor(state.selectedObjective, extractedCount, sciMul);
      state.sampleYieldText = flavor.yieldText;
      state.score += 140;
      addFloatText(rv.x - state.lunarCam.x, rv.y - state.lunarCam.y - 55, `LTV-2 COLLECTED ${flavor.shortLabel.toUpperCase()}! +140⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `LTV-2 collected backup ${flavor.shortLabel} (${flavor.yieldText}).`, 'good');
    }
  }

  if (rv.z > 0 || rv.vz > 0) {
    rv.vz -= 290 * dt;
    rv.z += rv.vz * dt;
    if (rv.z <= 0) { rv.z = 0; rv.vz = 0; }
  }
}

export function updateStage3B(dt, onNextStage) {
  if (state.stageTimer <= 0) {
    if (!state.sampleCollected) {
      logBlackBox('STAGE 3B', 'EVA timer expired before sample stowage.', 'warn');
    }
    onNextStage();
    return;
  }

  const targetCrater = state.lunarCraters.find(c => c.isTarget);

  updateSingleRover(state.rover, {
    up: state.keys['KeyW'] || state.keys['ArrowUp'],
    down: state.keys['KeyS'] || state.keys['ArrowDown'],
    left: state.keys['KeyA'] || state.keys['ArrowLeft'],
    right: state.keys['KeyD'] || state.keys['ArrowRight'],
    hop: state.keys['ShiftLeft'],
    drill: state.keys['Space'] || state.keys['KeyE']
  }, targetCrater, dt);

  if (state.coopMode === 'LOCAL_2P') {
    updateSingleRover(state.rover2, {
      up: state.keys['KeyI'],
      down: state.keys['KeyK'],
      left: state.keys['KeyJ'],
      right: state.keys['KeyL'],
      hop: state.keys['ShiftRight'],
      drill: state.keys['Enter']
    }, targetCrater, dt);
    broadcastNet({
      type: 'ROVER2_SYNC',
      x: state.rover2.x, y: state.rover2.y, z: state.rover2.z,
      facingX: state.rover2.facingX, facingY: state.rover2.facingY
    });
  } else if (state.coopMode === '4P_AI') {
    updateCompanionRoverAI(state.rover2, targetCrater, dt);
  }

  if (state.coopMode !== 'SOLO') {
    for (const sn of state.scienceNodes) {
      if (!sn.scanned && Math.hypot(state.rover.x - sn.x, state.rover.y - sn.y) < 58) {
        sn.scanned = true;
        state.score += sn.pts;
        state.telemetry.science += 25;
        addFloatText(sn.x - state.lunarCam.x, sn.y - state.lunarCam.y - 45, `P3 LIDAR SCANNED ${sn.name.toUpperCase()}! +${sn.pts}⭐`, '#e9d5ff');
        playTone(740, 'triangle', 0.14, 0.1);
      }
    }
  }

  // Smooth scrolling camera follows player rover LTV-1 across the 2400x1350 lunar sector
  const camTargetX = Math.max(0, Math.min(LUNAR_W - LOGICAL_W, state.rover.x - LOGICAL_W / 2));
  const camTargetY = Math.max(0, Math.min(LUNAR_H - LOGICAL_H, state.rover.y - LOGICAL_H / 2));
  state.lunarCam.x += (camTargetX - state.lunarCam.x) * Math.min(1, dt * 6);
  state.lunarCam.y += (camTargetY - state.lunarCam.y) * Math.min(1, dt * 6);

  const r1AtPadWithNew = state.rover.hasSample && !state.rover.sampleStowed && Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 92;
  const r2AtPadWithNew = state.rover2.hasSample && !state.rover2.sampleStowed && Math.hypot(state.rover2.x - state.lander.padX, state.rover2.y - state.lander.padY) < 92;
  if (r1AtPadWithNew || r2AtPadWithNew) {
    handleStage3BInteract(r1AtPadWithNew ? state.rover : state.rover2, onNextStage);
  }

  updateBottomHUD();
}

// ============================================================================
// STAGE 3C: LUNAR ASCENT & CISLUNAR TRANSFER
// ============================================================================
export function startStage3CMoonLaunch() {
  state.stage = 'STAGE3C';
  state.stageTimer = 18;
  state.lunarParticles = [];
  state.floatingTexts = [];

  state.moonLaunch = {
    phase: 'LIFTOFF',
    capsuleY: state.lander.padY,
    velocityY: 0,
    thrusting: false,
    tilt: 0,
    velTilt: (Math.random() < 0.5 ? -1 : 1) * 0.16,
    progress: 0,
    teiBurnDone: false,
    teiQuality: 'PENDING'
  };

  setStageBanner(
    'STAGE 3C: MOON LAUNCH',
    'Lunar Ascent & Return Burn',
    'Hold W/SPACE to lift off from the lander base, steer with A/D, and press SPACE in the green TEI burn window.',
    `<kbd>W</kbd>/<kbd>SPACE</kbd> Ascent Thrust &nbsp;•&nbsp; <kbd>A</kbd>/<kbd>D</kbd> Steer &nbsp;•&nbsp; <kbd>SPACE</kbd> TEI Burn`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  playTone(240, 'sawtooth', 0.35, 0.13);
  updateBottomHUD();
}

export function handleStage3CTEIBurn() {
  const ml = state.moonLaunch;
  if (ml.phase === 'TEI_BURN' && !ml.teiBurnDone) {
    ml.teiBurnDone = true;
    const inGreenWindow = ml.progress >= 0.36 && ml.progress <= 0.68;
    if (inGreenWindow) {
      ml.teiQuality = 'PRECISION';
      state.missionChoices.teiQuality = 'PRECISION';
      state.score += 140;
      addFloatText(LOGICAL_W / 2, 200, '🎯 PRECISION TEI BURN LOCKED! +140⭐ (WIDER EARTH CORRIDOR!)', '#fde047');
      logBlackBox('STAGE 3C', 'Precision Translunar Injection burn widened Stage 4 Earth reentry corridor.', 'good');
      playTone(760, 'triangle', 0.25, 0.15);
    } else {
      ml.teiQuality = 'NOMINAL';
      state.missionChoices.teiQuality = 'NOMINAL';
      state.score += 90;
      addFloatText(LOGICAL_W / 2, 200, 'TRANSLUNAR INJECTION LOCKED! +90⭐', '#4ade80');
      logBlackBox('STAGE 3C', 'Ascent Stage cleared lunar gravity & executed TEI burn.', 'info');
      playTone(640, 'triangle', 0.22, 0.14);
    }
  }
}

export function updateStage3C(dt, onNextStage) {
  if (state.stageTimer <= 0) {
    if (!state.moonLaunch.teiBurnDone) {
      state.missionChoices.teiQuality = 'LATE';
      logBlackBox('STAGE 3C', 'Missed manual TEI burn window (narrowed Earth entry corridor).', 'warn');
    }
    onNextStage();
    return;
  }

  const ml = state.moonLaunch;
  if (ml.phase === 'LIFTOFF') {
    ml.thrusting = (state.keys['KeyW'] || state.keys['ArrowUp'] || state.keys['Space']);
    if (ml.thrusting) {
      ml.velocityY += 85 * dt;
      if (Math.random() < 0.4) playTone(125 + Math.random() * 35, 'sawtooth', 0.06, 0.05);
    } else {
      ml.velocityY = Math.max(18, ml.velocityY - 22 * dt);
    }

    ml.velTilt += Math.sin(performance.now() * 0.0031) * 0.48 * dt;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) ml.velTilt -= 1.55 * dt;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) ml.velTilt += 1.55 * dt;
    if (state.coopMode === '4P_AI' || state.coopMode === 'NET_4P') ml.velTilt -= ml.tilt * 0.6 * dt;
    ml.tilt = Math.max(-0.45, Math.min(0.45, ml.tilt + ml.velTilt * dt));
    ml.velTilt *= 0.94;

    if (ml.thrusting && Math.abs(ml.tilt) <= 0.2) {
      state.score += Math.round(dt * 18);
    }

    ml.capsuleY -= ml.velocityY * dt;

    if (ml.thrusting) {
      state.lunarParticles.push({
        x: state.lander.padX + (Math.random() - 0.5) * 20,
        y: ml.capsuleY - 20,
        vx: (Math.random() - 0.5) * 65,
        vy: 75 + Math.random() * 60,
        life: 0.45,
        size: 4.5,
        color: '#fbbf24'
      });
    }

    if (ml.capsuleY <= (state.lander.padY || 730) - 420) {
      ml.phase = 'TEI_BURN';
      ml.progress = 0;
      addFloatText(LOGICAL_W / 2, 160, 'LUNAR ORBIT CLEARED! TIME [SPACE] IN GREEN TEI WINDOW!', '#38bdf8');
      playTone(540, 'triangle', 0.16, 0.12);
    }
  } else if (ml.phase === 'TEI_BURN') {
    const speed = ml.teiBurnDone ? 0.34 : 0.2;
    ml.progress += speed * dt;
    if (ml.progress >= 1) {
      if (!ml.teiBurnDone) {
        state.missionChoices.teiQuality = 'LATE';
        logBlackBox('STAGE 3C', 'Late automated TEI burn narrowed Stage 4 Earth entry corridor.', 'warn');
      }
      onNextStage();
      return;
    }
  }
  updateBottomHUD();
}

// ============================================================================
// 2.5D LUNAR RENDERERS (3A, 3B, 3C WITH CAMERA + RADAR MAP)
// ============================================================================
function draw25DLunarWorld(ctx) {
  const cx = state.lunarCam.x;
  const cy = state.lunarCam.y;
  const horizonY = Math.max(85, 220 - cy * 0.45);

  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, LOGICAL_W, horizonY);

  ctx.fillStyle = '#e2e8f0';
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 197) - cx * 0.08 + LOGICAL_W * 4) % LOGICAL_W;
    const sy = (i * 53) % Math.max(40, horizonY - 20);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Earth in lunar sky with atmospheric halo
  ctx.save();
  const earthX = 920 - cx * 0.06;
  const earthY = Math.max(48, 76 - cy * 0.05);
  ctx.beginPath(); ctx.arc(earthX, earthY, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#1d4ed8'; ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.arc(earthX - 8, earthY - 8, 10, 0, Math.PI * 2); ctx.arc(earthX + 10, earthY + 6, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(earthX - 5, earthY - 13, 14, 4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(earthX, earthY, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Distant Moon Mountain Ridge with sunlit rim (parallax)
  ctx.fillStyle = '#1e2638';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= LOGICAL_W; x += 35) {
    const wx = x + cx * 0.28;
    ctx.lineTo(x, horizonY - 26 - Math.sin(wx * 0.008) * 20 - Math.cos(wx * 0.019) * 11);
  }
  ctx.lineTo(LOGICAL_W, horizonY);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const plainGrad = ctx.createLinearGradient(0, horizonY, 0, LOGICAL_H);
  plainGrad.addColorStop(0, '#475569');
  plainGrad.addColorStop(0.45, '#334155');
  plainGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = plainGrad;
  ctx.fillRect(0, horizonY, LOGICAL_W, LOGICAL_H - horizonY);
}

function drawLunarCratersAndPad(ctx) {
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  ctx.lineWidth = 1.5;
  for (let gx = 100; gx < LUNAR_W; gx += 180) {
    ctx.beginPath(); ctx.moveTo(gx, 240); ctx.lineTo(gx, LUNAR_H); ctx.stroke();
  }
  for (let gy = 260; gy < LUNAR_H; gy += 110) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(LUNAR_W, gy); ctx.stroke();
  }

  for (const cr of state.lunarCraters) {
    ctx.fillStyle = cr.isTarget ? '#1e293b' : '#273246';
    ctx.strokeStyle = cr.isTarget ? '#f59e0b' : '#64748b';
    ctx.lineWidth = cr.isTarget ? 3.5 : 2;
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y, cr.rx, cr.ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y + 4, cr.rx * 0.85, cr.ry * 0.78, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    if (cr.isTarget) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 13px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POINT B: TARGET CRATER', cr.x, cr.y + cr.ry + 20);
    }
  }

  // Point A Landing Pad
  const px = state.lander.padX, py = state.lander.padY;
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(px, py, 96, 42, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(px, py, 70, 30, 0, 0, Math.PI * 2); ctx.stroke();

  const beaconCol = Math.floor(performance.now() / 250) % 2 === 0 ? '#4ade80' : '#38bdf8';
  ctx.fillStyle = beaconCol;
  ctx.beginPath();
  ctx.arc(px - 86, py, 5.5, 0, Math.PI * 2);
  ctx.arc(px + 86, py, 5.5, 0, Math.PI * 2);
  ctx.arc(px, py - 38, 5.5, 0, Math.PI * 2);
  ctx.arc(px, py + 38, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POINT A: LANDING BASE', px, py + 58);
  if (state.lander?.targetSiteName) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10.5px Fredoka, sans-serif';
    ctx.fillText(state.lander.targetSiteName.toUpperCase(), px, py + 72);
  }
}

function drawLunarRadarMap(ctx) {
  const mmW = 204, mmH = 114, mmX = LOGICAL_W - mmW - 14, mmY = 14;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(mmX, mmY, mmW, mmH, 10); ctx.fill(); ctx.stroke();
  const sx = mmW / LUNAR_W, sy = mmH / LUNAR_H;

  // Camera viewport box
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX + state.lunarCam.x * sx, mmY + state.lunarCam.y * sy, LOGICAL_W * sx, LOGICAL_H * sy);

  // Point A & Point B
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath(); ctx.arc(mmX + state.lander.padX * sx, mmY + state.lander.padY * sy, 4, 0, Math.PI * 2); ctx.fill();
  const tc = state.lunarCraters.find(c => c.isTarget);
  if (tc) {
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(mmX + tc.x * sx, mmY + tc.y * sy, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  for (const sn of state.scienceNodes) {
    if (!sn.scanned) {
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(mmX + sn.x * sx - 2, mmY + sn.y * sy - 2, 4, 4);
    }
  }
  for (const ev of state.evaTasks) {
    if (!ev.done) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(mmX + ev.x * sx - 2.5, mmY + ev.y * sy - 2.5, 5, 5);
    }
  }
  if (state.stage === 'STAGE3B') {
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(mmX + state.rover.x * sx, mmY + state.rover.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
    if (state.coopMode !== 'SOLO') {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(mmX + state.rover2.x * sx, mmY + state.rover2.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 8.5px Fredoka, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('LUNAR RADAR (2400m)', mmX + 7, mmY + 12);
}

// BIGGER, DETAILED HEROIC ARTEMIS-CLASS LUNAR ROCKET LANDER (~2x scale!)
function draw25DLander(ctx, x, y, z, tiltX, legAnim, thrusting, hoverTrim, rampOpen = false, ascentLaunched = false) {
  const shadowScale = Math.max(0.45, 1 - z / 320);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, 54 * shadowScale, 24 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  if (z > 2) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - z); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(x, y - z);
  ctx.rotate(tiltX);

  // Main Engine Plume
  if (thrusting || hoverTrim) {
    const len = thrusting ? (56 + Math.random() * 24) : (26 + Math.random() * 12);
    ctx.fillStyle = thrusting ? '#f97316' : '#38bdf8';
    ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(0, 12 + len); ctx.lineTo(16, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(0, 12 + len * 0.55); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
  }

  // 4 Articulated Landing Struts & Footpads
  const spreadX = 30 + legAnim * 28;
  const footY = 8 + legAnim * 18;
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-26, -6); ctx.lineTo(-spreadX, footY);
  ctx.moveTo(26, -6);  ctx.lineTo(spreadX, footY);
  ctx.moveTo(-18, -3); ctx.lineTo(-spreadX * 0.68, footY + 7);
  ctx.moveTo(18, -3);  ctx.lineTo(spreadX * 0.68, footY + 7);
  ctx.stroke();

  // Secondary Strut Braces
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-22, 6); ctx.lineTo(-spreadX * 0.72, footY * 0.55);
  ctx.moveTo(22, 6); ctx.lineTo(spreadX * 0.72, footY * 0.55);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-spreadX - 8, footY - 3, 16, 6, 3); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(spreadX - 8, footY - 3, 16, 6, 3); ctx.fill(); ctx.stroke();

  // Engine Bell
  ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-12, 2); ctx.lineTo(-16, 14); ctx.lineTo(16, 14); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Gold Kapton Foil Descent Stage Octagon (remains on Moon after Ascent Stage launches!)
  ctx.fillStyle = '#eab308'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-38, -32, 76, 34, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(-34, -18, 68, 5);
  // Crew boarding ladder on descent stage
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(22, -28); ctx.lineTo(22, 2);
  ctx.moveTo(30, -28); ctx.lineTo(30, 2);
  for (let ry = -24; ry <= -2; ry += 7) {
    ctx.moveTo(22, ry); ctx.lineTo(30, ry);
  }
  ctx.stroke();

  if (!ascentLaunched) {
    // Interstage Adapter Ring
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.fillRect(-32, -40, 64, 8); ctx.strokeRect(-32, -40, 64, 8);

    // Large White Crew Ascent Rocket Cabin
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-29, -82, 58, 42, 12); ctx.fill(); ctx.stroke();

    // Blue NASA Livery Band & Nose Cone
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-27, -56, 54, 7);
    ctx.fillStyle = '#0284c7';
    ctx.beginPath(); ctx.roundRect(-18, -75, 36, 14, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-13, -72, 14, 4);

    // RCS Thruster Quads
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-36, -68, 7, 12); ctx.strokeRect(-36, -68, 7, 12);
    ctx.fillRect(29, -68, 7, 12); ctx.strokeRect(29, -68, 7, 12);

    // Top Docking Collar & Dish Antenna
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.roundRect(-14, -92, 28, 10, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -92); ctx.lineTo(0, -106); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -108, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }

  if (rampOpen) {
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(34, -4); ctx.lineTo(74, 24); ctx.stroke();
  }

  ctx.restore();
}

export function drawStage3A(ctx) {
  const l = state.lander;
  draw25DLunarWorld(ctx);

  ctx.save();
  ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
  drawLunarCratersAndPad(ctx);

  ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(l.x, l.y, 58, 26, 0, 0, Math.PI * 2);
  ctx.stroke();

  const padDist = Math.hypot(l.x - l.padX, (l.y - l.padY) * 1.4);
  const aligned = padDist <= (l.padRadius || 105);
  const beamGrad = ctx.createLinearGradient(0, l.padY - 260, 0, l.padY);
  beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.02)');
  beamGrad.addColorStop(1, aligned ? 'rgba(74, 222, 128, 0.25)' : 'rgba(251, 191, 36, 0.15)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(l.padX - 140, l.padY - 260);
  ctx.lineTo(l.padX + 140, l.padY - 260);
  ctx.lineTo(l.padX + 92, l.padY);
  ctx.lineTo(l.padX - 92, l.padY);
  ctx.closePath();
  ctx.fill();

  const compressPx = (l.legCompress || 0) * 8;
  draw25DLander(ctx, l.x, l.y + compressPx, l.z, l.tiltX, l.legAnim, l.thrusting, l.hoverTrim || l.p2AssistActive, false, false);

  const vSpd = Math.abs(l.vz * 0.24).toFixed(1);
  const ly = l.y - l.z;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = Number(vSpd) <= 5.0 ? '#4ade80' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(l.x + 56, ly - 74, 124, 44, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px JetBrains Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText(`V:${vSpd} m/s`, l.x + 64, ly - 56);
  ctx.fillStyle = (l.hoverTrim || l.p2AssistActive) ? '#38bdf8' : '#94a3b8';
  ctx.fillText(l.p2AssistActive ? 'P2 TRIMMING' : `ALT:${Math.round(l.z * 0.45)}m`, l.x + 64, ly - 39);

  drawLunarParticles(ctx);
  ctx.restore();

  drawLunarRadarMap(ctx);

  drawCanvasControlBar(ctx, LOGICAL_W, [
    { key: 'SPACE / W', label: 'Retro-Thrust' },
    { key: 'WASD', label: 'Align Blue Pad' },
    { key: 'I / J / L', label: 'P2 RCS Trim' }
  ]);
}

function draw25DSingleRover(ctx, rv, crewA, crewB) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(rv.x, rv.y + 4, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(rv.x, rv.y - 10 - rv.z);

  const dirAngle = Math.atan2(rv.facingY * 0.6, rv.facingX);
  ctx.save();
  ctx.rotate(dirAngle);
  const lightGrad = ctx.createLinearGradient(0, 0, 110, 0);
  lightGrad.addColorStop(0, 'rgba(253, 224, 71, 0.28)');
  lightGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = lightGrad;
  ctx.beginPath(); ctx.moveTo(18, -4); ctx.lineTo(110, -24); ctx.lineTo(110, 24); ctx.closePath(); ctx.fill();
  ctx.restore();

  if (rv.rcsHopping && rv.z > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-12, 6); ctx.lineTo(-18, 22 + Math.random() * 8); ctx.lineTo(-6, 6);
    ctx.moveTo(6, 6); ctx.lineTo(12, 22 + Math.random() * 8); ctx.lineTo(18, 6);
    ctx.fill();
  }

  const wheelXs = [-19, 0, 19];
  for (const wx of wheelXs) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(wx + 4, 4, 6.5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = rv.bodyColor;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.roundRect(-24, -10, 48, 14, 5); ctx.fill(); ctx.stroke();

  // Rear miniature Ka-band dish mast
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(-20, -24); ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath(); ctx.arc(-20, -26, 5, 0.2 * Math.PI, 0.9 * Math.PI); ctx.fill();

  // Seat 1
  ctx.fillStyle = crewA.color;
  ctx.strokeStyle = '#0f172a';
  ctx.beginPath(); ctx.roundRect(1, -21, 13, 12, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(7, -25, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = crewA.visor;
  ctx.fillRect(7 + rv.facingX * 2 - 3, -28, 7, 4.5);

  // Seat 2
  ctx.fillStyle = crewB.color;
  ctx.beginPath(); ctx.roundRect(-14, -21, 13, 12, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(-8, -25, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = crewB.visor;
  ctx.fillRect(-8 + rv.facingX * 2 - 3, -28, 7, 4.5);

  if (rv.hasSample) {
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath(); ctx.roundRect(-24, -19, 10, 10, 3); ctx.fill(); ctx.stroke();
  }

  if (rv.armAnim > 0.05) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rv.facingX * 18, -4);
    ctx.lineTo(rv.facingX * (26 + rv.armAnim * 10), -4 + rv.armAnim * 20);
    ctx.stroke();
  }

  for (const wx of wheelXs) {
    ctx.save();
    ctx.translate(wx - 2, 9);
    ctx.rotate(rv.wheelSpin);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9.5px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(rv.id, 0, -37);
  ctx.restore();
}

export function drawStage3B(ctx) {
  draw25DLunarWorld(ctx);

  ctx.save();
  ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
  drawLunarCratersAndPad(ctx);

  // Subtle Lunar Regolith Tire Tracks
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (const tr of state.roverTracks) {
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);
    ctx.fillRect(-4, -7, 6, 3);
    ctx.fillRect(-4, 4, 6, 3);
    ctx.restore();
  }

  const targetCrater = state.lunarCraters.find(c => c.isTarget);
  const anySample = state.rover.hasSample || state.rover2.hasSample;

  // Co-Op Power Tether between LTV-1 and LTV-2 when close
  const tethered = state.coopMode !== 'SOLO' && Math.hypot(state.rover.x - state.rover2.x, state.rover.y - state.rover2.y) < 130;
  if (tethered) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(state.rover.x, state.rover.y - 16);
    ctx.lineTo(state.rover2.x, state.rover2.y - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⚡ CO-OP 2x TETHER', (state.rover.x + state.rover2.x) / 2, (state.rover.y + state.rover2.y) / 2 - 26);
  }

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(state.lander.padX, state.lander.padY - 70);
  ctx.lineTo(state.rover.x, state.rover.y - 18);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = anySample ? 'rgba(74, 222, 128, 0.45)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(state.lander.padX + 75, state.lander.padY);
  ctx.lineTo(targetCrater.x, targetCrater.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const depthList = [
    { kind: 'rocket', y: state.lander.padY },
    { kind: 'rover1', y: state.rover.y },
    ...(state.coopMode !== 'SOLO' ? [{ kind: 'rover2', y: state.rover2.y }] : []),
    ...state.lunarBoulders.map(b => ({ kind: 'boulder', y: b.y, obj: b })),
    ...state.scienceNodes.map(s => ({ kind: 'science', y: s.y, obj: s })),
    ...state.evaTasks.map(t => ({ kind: 'eva', y: t.y, obj: t }))
  ].sort((a, b) => a.y - b.y);

  for (const item of depthList) {
    if (item.kind === 'rocket') {
      draw25DLander(ctx, state.lander.padX, state.lander.padY, 0, 0, 1, false, false, true, false);
    } else if (item.kind === 'rover1') {
      draw25DSingleRover(ctx, state.rover, CREW_ROSTER[0], CREW_ROSTER[2]);
    } else if (item.kind === 'rover2') {
      draw25DSingleRover(ctx, state.rover2, CREW_ROSTER[1], CREW_ROSTER[3]);
    } else if (item.kind === 'boulder') {
      const b = item.obj;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 4, b.r * 1.1, b.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y - b.r * 0.35, b.r, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (item.kind === 'science') {
      const sn = item.obj;
      ctx.fillStyle = sn.scanned ? '#64748b' : '#38bdf8';
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sn.x - 9, sn.y); ctx.lineTo(sn.x, sn.y - 22); ctx.lineTo(sn.x + 9, sn.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!sn.scanned && Math.hypot(state.rover.x - sn.x, state.rover.y - sn.y) < 75) {
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`[SPACE] Scan ${sn.name} (+${sn.pts}⭐)`, sn.x, sn.y - 30);
      }
    } else if (item.kind === 'eva') {
      const ev = item.obj;
      if (ev.kind === 'SEISMIC') {
        if (ev.done) {
          const pulse = ((performance.now() * 0.04) % 45);
          ctx.strokeStyle = `rgba(74, 222, 128, ${1 - pulse / 45})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(ev.x, ev.y, 14 + pulse, (14 + pulse) * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ev.x, ev.y - 22); ctx.lineTo(ev.x - 12, ev.y); ctx.moveTo(ev.x, ev.y - 22); ctx.lineTo(ev.x + 12, ev.y); ctx.stroke();
        ctx.fillStyle = ev.done ? '#4ade80' : '#f59e0b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(ev.x - 10, ev.y - 28, 20, 12, 4); ctx.fill(); ctx.stroke();
      } else {
        if (ev.done) {
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(ev.x, ev.y - 26); ctx.lineTo(ev.x + 140, 110); ctx.stroke();
        }
        ctx.fillStyle = '#334155'; ctx.fillRect(ev.x - 6, ev.y - 12, 12, 12);
        ctx.fillStyle = ev.done ? '#4ade80' : '#a78bfa'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ev.x, ev.y - 20, 14, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill(); ctx.stroke();
      }
      if (!ev.done && Math.hypot(state.rover.x - ev.x, state.rover.y - ev.y) < 76) {
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(ev.progress > 0 ? `${ev.name}: ${Math.round(ev.progress * 100)}%` : `[HOLD SPACE] Deploy ${ev.name} (+${ev.pts}⭐)`, ev.x, ev.y - 38);
      }
    }
  }

  if (!state.rover.hasSample) {
    ctx.fillStyle = '#4ade80'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetCrater.x - 10, targetCrater.y);
    ctx.lineTo(targetCrater.x - 4, targetCrater.y - 24);
    ctx.lineTo(targetCrater.x + 4, targetCrater.y - 24);
    ctx.lineTo(targetCrater.x + 10, targetCrater.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    if (Math.hypot(state.rover.x - targetCrater.x, state.rover.y - targetCrater.y) < 92) {
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(state.rover.drilling ? `DRILLING SAMPLE... ${Math.round(state.rover.drillProgress * 100)}%` : '[HOLD SPACE] DRILL CORE SAMPLE', targetCrater.x, targetCrater.y - 36);
      if (state.rover.drilling) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(targetCrater.x - 45, targetCrater.y - 54, 90, 9);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(targetCrater.x - 43, targetCrater.y - 52, 86 * state.rover.drillProgress, 5);
      }
    }
  }

  if (
    state.lander.hardLandingPenalty &&
    !state.lander.shockRepaired &&
    !anySample &&
    Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 130
  ) {
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🔧 [SPACE] REPAIR LANDING SHOCK (+28Wh BATTERY)', state.lander.padX, state.lander.padY - 122);
  } else if (anySample) {
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⬇️ BOARD ROCKET FOR MOON LAUNCH! ⬇️', state.lander.padX, state.lander.padY - 122);
  }

  drawLunarParticles(ctx);
  ctx.restore();

  // Top-Left Lunar EVA Mission Checklist Card (screen space)
  const scannedCount = state.scienceNodes.filter(s => s.scanned).length;
  const doneEvaCount = state.evaTasks.filter(t => t.done).length;
  const needsRepair = state.lander.hardLandingPenalty && !state.lander.shockRepaired;
  const checklistRows = [
    { done: scannedCount === state.scienceNodes.length, text: `1. 🔬 Science Ridges: ${scannedCount}/${state.scienceNodes.length} Scanned` },
    { done: doneEvaCount === state.evaTasks.length,     text: `2. 🛠️ EVA Instruments: ${doneEvaCount}/${state.evaTasks.length} Online` },
    { done: anySample,                                  text: `3. 🧪 Point B Crater Core: ${anySample ? 'EXTRACTED ✅' : 'Hold [SPACE] at Crater'}` },
    { done: state.sampleCollected,                      text: `4. 🚀 Point A Rocket: ${anySample ? 'Drive Back & [SPACE]!' : 'Awaiting Core Sample'}` }
  ];
  if (needsRepair) {
    checklistRows.unshift({ done: false, warn: true, text: '🔧 Lander Pad: [SPACE] Repair Shock (-28Wh)' });
  }
  const cardH = 38 + checklistRows.length * 20 + 10;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = anySample ? '#4ade80' : '#38bdf8';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(14, 14, 304, cardH, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = anySample ? '#4ade80' : '#38bdf8';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('LUNAR EVA MISSION CHECKLIST', 26, 34);
  checklistRows.forEach((row, idx) => {
    ctx.fillStyle = row.warn ? '#fbbf24' : row.done ? '#4ade80' : '#e2e8f0';
    ctx.font = row.done ? '600 11px Fredoka, sans-serif' : 'bold 11px Fredoka, sans-serif';
    ctx.fillText(row.text, 26, 54 + idx * 20);
  });

  // Off-Screen Directional Waypoint Arrows for Lunar EVA Objectives
  const evaWaypoints = [];
  if (anySample) {
    evaWaypoints.push({ x: state.lander.padX, y: state.lander.padY, label: '🚀 BOARD ROCKET', col: '#4ade80' });
  } else {
    if (targetCrater) {
      evaWaypoints.push({ x: targetCrater.x, y: targetCrater.y, label: '🧪 POINT B CRATER', col: '#fde047' });
    }
    const nextEva = state.evaTasks.find(t => !t.done);
    if (nextEva) {
      evaWaypoints.push({ x: nextEva.x, y: nextEva.y, label: `🛠️ ${nextEva.name.toUpperCase()}`, col: '#f97316' });
    }
    const nextSci = state.scienceNodes.find(s => !s.scanned);
    if (nextSci) {
      evaWaypoints.push({ x: nextSci.x, y: nextSci.y, label: `🔬 ${nextSci.name.toUpperCase()}`, col: '#a78bfa' });
    }
  }

  for (const wp of evaWaypoints) {
    const sx = wp.x - state.lunarCam.x;
    const sy = wp.y - state.lunarCam.y;
    if (sx >= 65 && sx <= LOGICAL_W - 65 && sy >= 65 && sy <= LOGICAL_H - 75) continue;

    const cx = LOGICAL_W / 2, cy = LOGICAL_H / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const padX = LOGICAL_W / 2 - 98;
    const padY = LOGICAL_H / 2 - 82;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const tX = Math.abs(cosA) > 0.001 ? padX / Math.abs(cosA) : 9999;
    const tY = Math.abs(sinA) > 0.001 ? padY / Math.abs(sinA) : 9999;
    const tEdge = Math.min(tX, tY);
    const ax = cx + cosA * tEdge;
    const ay = cy + sinA * tEdge;
    const distM = Math.round(Math.hypot(wp.x - state.rover.x, wp.y - state.rover.y));

    ctx.save();
    ctx.translate(ax, ay);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = wp.col;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.roundRect(-68, -17, 136, 34, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = wp.col;
    ctx.font = 'bold 10px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wp.label, 0, -2);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 9.5px JetBrains Mono, monospace';
    ctx.fillText(`${distM}m`, 0, 11);

    ctx.rotate(ang);
    ctx.fillStyle = wp.col;
    ctx.beginPath();
    ctx.moveTo(80, 0);
    ctx.lineTo(69, -7);
    ctx.lineTo(69, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawLunarRadarMap(ctx);

  drawCanvasControlBar(ctx, LOGICAL_W, [
    { key: 'WASD', label: 'Drive LTV-1' },
    { key: 'IJKL', label: 'Drive LTV-2' },
    { key: 'SPACE', label: 'Drill / Sample' },
    { key: 'F', label: 'Power Tether' }
  ]);
}

export function drawStage3C(ctx) {
  const ml = state.moonLaunch;
  if (ml.phase === 'LIFTOFF') {
    state.lunarCam.x = Math.max(0, Math.min(LUNAR_W - LOGICAL_W, state.lander.padX - LOGICAL_W / 2));
    state.lunarCam.y = Math.max(0, Math.min(LUNAR_H - LOGICAL_H, ml.capsuleY - LOGICAL_H / 2));
    draw25DLunarWorld(ctx);
    ctx.save();
    ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
    drawLunarCratersAndPad(ctx);
    // Big Gold Descent Stage remains on Point A as the Lunar Launch Table!
    draw25DLander(ctx, state.lander.padX, state.lander.padY, 0, 0, 1, false, false, false, true);

    // Big White Crew Ascent Stage blasting off vertically!
    ctx.save();
    ctx.translate(state.lander.padX, ml.capsuleY - 62);
    ctx.rotate(ml.tilt);

    if (ml.thrusting) {
      const len = 48 + Math.random() * 24;
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.moveTo(-14, 18); ctx.lineTo(0, 18 + len); ctx.lineTo(14, 18); ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-29, -24, 58, 42, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(-27, 2, 54, 7);
    ctx.fillStyle = '#0284c7';
    ctx.beginPath(); ctx.roundRect(-18, -17, 36, 14, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(0, 13, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawLunarParticles(ctx);
    ctx.restore();

    // Lunar Ascent Pitch Corridor Bar (Top Center)
    const barW = 340, bx = (LOGICAL_W - barW) / 2, by = 44;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(bx, by, barW, 22, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
    ctx.fillRect(bx + barW * 0.32, by + 2, barW * 0.36, 18);
    const markerX = bx + barW / 2 + ml.tilt * 280;
    ctx.fillStyle = Math.abs(ml.tilt) <= 0.2 ? '#4ade80' : '#f87171';
    ctx.beginPath(); ctx.arc(markerX, by + 11, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LUNAR ASCENT TRIM: [A] LEFT • [D] RIGHT | HOLD [W/SPACE] THRUST', LOGICAL_W / 2, by - 8);

    // Orbital Insertion Climb Progress Gauge (Left Side)
    const climbPct = Math.max(0, Math.min(1, ((state.lander.padY || 730) - ml.capsuleY) / 420));
    const gx = 92, gy = 140, gw = 28, gh = 260;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(gx + 3, gy + gh - 3 - (gh - 6) * climbPct, gw - 6, (gh - 6) * climbPct);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 11px Fredoka, sans-serif';
    ctx.fillText('ORBIT', gx + gw / 2, gy - 8);
    ctx.fillText(`${Math.round(climbPct * 100)}%`, gx + gw / 2, gy + gh + 18);
  } else {
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < 65; i++) {
      ctx.fillRect((i * 173) % LOGICAL_W, (i * 97) % LOGICAL_H, 2, 2);
    }

    const moonR = Math.max(36, 95 - ml.progress * 55);
    ctx.fillStyle = '#64748b';
    ctx.beginPath(); ctx.arc(170, 340, moonR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.arc(155, 325, moonR * 0.22, 0, Math.PI * 2); ctx.arc(190, 355, moonR * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('MOON (DEPARTED)', 170, 340 + moonR + 24);

    const earthR = 52 + ml.progress * 88;
    ctx.save();
    ctx.beginPath(); ctx.arc(920, 310, earthR, 0, Math.PI * 2);
    ctx.fillStyle = '#1d4ed8'; ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(900, 290, earthR * 0.34, 0, Math.PI * 2);
    ctx.arc(945, 330, earthR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(920, 310, earthR + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 14px Fredoka, sans-serif';
    ctx.fillText('PLANET EARTH (ENTRY INTERFACE)', 920, 310 + earthR + 26);

    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(230, 340); ctx.quadraticCurveTo(550, 210, 825, 305); ctx.stroke();
    ctx.setLineDash([]);

    // Highlight Optimal Green TEI Burn Window on trajectory arc (t = 0.36 .. 0.68)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let st = 0.36; st <= 0.68; st += 0.02) {
      const wx = (1 - st) * (1 - st) * 230 + 2 * (1 - st) * st * 550 + st * st * 825;
      const wy = (1 - st) * (1 - st) * 340 + 2 * (1 - st) * st * 210 + st * st * 305;
      if (st === 0.36) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();

    const t = ml.progress;
    const cx = (1 - t) * (1 - t) * 230 + 2 * (1 - t) * t * 550 + t * t * 825;
    const cy = (1 - t) * (1 - t) * 340 + 2 * (1 - t) * t * 210 + t * t * 305;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.2);
    if (ml.teiBurnDone) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-52 - Math.random() * 14, 0); ctx.lineTo(-22, 6); ctx.fill();
    }
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-16, -16); ctx.lineTo(-16, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    if (!ml.teiBurnDone) {
      const inTeiWin = ml.progress >= 0.36 && ml.progress <= 0.68;
      ctx.fillStyle = inTeiWin ? '#16a34a' : '#f97316';
      ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 220, 52, 440, 56, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Fredoka, sans-serif';
      ctx.fillText(
        inTeiWin ? '🟢 IN GREEN TEI WINDOW: PRESS [SPACE]!' : 'WAIT FOR GREEN TEI WINDOW, THEN PRESS [SPACE]!',
        LOGICAL_W / 2,
        75
      );
      const tbx = LOGICAL_W / 2 - 170, tby = 86, tbw = 340, tbh = 12;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(tbx, tby, tbw, tbh);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.65)'; ctx.fillRect(tbx + tbw * 0.36, tby + 1, tbw * 0.32, tbh - 2);
      ctx.fillStyle = '#fde047'; ctx.fillRect(tbx + tbw * ml.progress - 3, tby - 2, 6, tbh + 4);
    }
    drawLunarParticles(ctx);
  }

  drawCanvasControlBar(
    ctx,
    LOGICAL_W,
    ml.phase === 'LIFTOFF'
      ? [{ key: 'SPACE / W', label: 'Launch Ascent Stage' }]
      : [{ key: 'SPACE', label: 'Fire Earth Injection Burn' }]
  );
}

function drawLunarParticles(ctx) {
  for (const pt of state.lunarParticles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.6);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
