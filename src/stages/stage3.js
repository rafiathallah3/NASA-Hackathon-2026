import { LOGICAL_W, LOGICAL_H, LUNAR_W, LUNAR_H, CREW_ROSTER, SCIENCE_OBJECTIVES } from '../config.js';
import { state, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet } from '../net.js';
import { addFloatText, drawCanvasControlBar, createStarfield, drawStarfield } from '../sprites.js';
import { setStageBanner, updateBottomHUD, showMissionToast } from '../hud.js';
import { triggerDilemma } from '../dilemmas.js';

const SKY_HORIZON_WORLD_Y = 260;
const LUNAR_STARS = createStarfield(95, LOGICAL_W, 300, 30315);
const TEI_STARS = createStarfield(95, LOGICAL_W, LOGICAL_H, 30399);

function buildStaticLunarSurfaceFeatures() {
  let seed = 918273;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const patches = [];
  for (let i = 0; i < 42; i++) {
    patches.push({
      x: 80 + rnd() * (LUNAR_W - 160),
      y: 320 + rnd() * (LUNAR_H - 380),
      rx: 48 + rnd() * 95,
      ry: 18 + rnd() * 34,
      dark: rnd() < 0.65
    });
  }
  const pebbles = [];
  for (let i = 0; i < 160; i++) {
    pebbles.push({
      x: 40 + rnd() * (LUNAR_W - 80),
      y: 315 + rnd() * (LUNAR_H - 360),
      rx: 2.5 + rnd() * 4.5,
      ry: 1.4 + rnd() * 2.2,
      light: rnd() < 0.4
    });
  }
  return { patches, pebbles };
}
const LUNAR_SURFACE = buildStaticLunarSurfaceFeatures();

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
    { x: 1920, y: 780,  rx: 84, ry: 38, isTarget: true }
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
    { id: 'basalt',   name: 'Basalt Ridge',     x: 840,  y: 445,  scanned: false, pts: 65 },
    { id: 'ice',      name: 'Shadowed Ice Core', x: 1120, y: 1090, scanned: false, pts: 75 },
    { id: 'regolith', name: 'South Rim Vein',    x: 1580, y: 425,  scanned: false, pts: 75 }
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
    crashed: false,
    crashReason: '',
    landingPts: 0,
    landingSpeedMs: 0,
    landingOnPad: false,
    readyToContinue: false,
    continueBtnRect: null,
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

function triggerStage3AAbort(reason, onAbortToMenu) {
  const l = state.lander;
  l.crashed = true;
  l.crashReason = reason;
  l.thrusting = false;
  l.hoverTrim = false;
  state.screenShake = 0.45;
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const spd = 70 + Math.random() * 140;
    state.lunarParticles.push({
      x: l.x + (Math.random() - 0.5) * 20,
      y: l.y - 12,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd * 0.55 - 35,
      life: 0.9,
      size: 4 + Math.random() * 5,
      color: i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? '#f97316' : '#fde047'
    });
  }
  logBlackBox('STAGE 3A', `LUNAR CRASH: ${reason}`, 'warn');
  playTone(95, 'sawtooth', 0.5, 0.16);
  updateBottomHUD();

  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (modal && mc) {
    modal.classList.remove('hidden');
    mc.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#f87171;margin:0 0 8px;">Lunar Landing Failed: Game Over</h2>
        <p class="sub" style="margin-bottom:16px;">${reason}</p>
        <div class="config-panel" style="text-align:left;margin-bottom:20px;">
          <div><b style="color:#fde047;">[SPACE / ArrowUp]</b> Fire retro-thrust to keep vertical speed below <b style="color:#4ade80;">7.5 m/s</b> at touchdown (<= 4.2 m/s for Textbook).</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[SHIFT]</b> Engage Hover Trim near the surface to cushion descent gently.</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[WASD]</b> Keep the lander level and aligned with the <b style="color:#38bdf8;">Point A</b> pad ring.</div>
        </div>
        <div class="modal-actions" style="justify-content:center;">
          <button id="btn-crash-menu" class="btn-secondary" type="button">Return to Menu</button>
          <button id="btn-retry-landing" class="btn-primary" style="background:#f87171;color:#0b111e;" type="button">Retry Lunar Descent</button>
        </div>
      </div>
    `;
    const retryBtn = document.getElementById('btn-retry-landing');
    const menuBtn = document.getElementById('btn-crash-menu');
    if (retryBtn) {
      retryBtn.onclick = () => {
        modal.classList.add('hidden');
        startStage3A();
      };
    }
    if (menuBtn) {
      menuBtn.onclick = () => {
        modal.classList.add('hidden');
        if (onAbortToMenu) onAbortToMenu();
      };
    }
  }
}

export function handleStage3AContinue(onNextStage) {
  const l = state.lander;
  if (state.stage !== 'STAGE3A' || !l || !l.landed || l.crashed) return false;
  if (!l.readyToContinue && l.settleTimer < 0.35) return false;
  playTone(640, 'triangle', 0.16, 0.1);
  if (onNextStage) onNextStage();
  return true;
}

export function updateStage3A(dt, onNextStage, onAbortToMenu) {
  const l = state.lander;
  if (l.crashed) return;

  // Smooth post-touchdown suspension settle; wait for explicit player Continue click/key
  if (l.landed) {
    l.tiltX *= Math.pow(0.08, dt);
    l.legCompress = Math.max(0, l.legCompress - dt * 1.4);
    l.settleTimer += dt;
    if (l.settleTimer >= 0.65) {
      l.readyToContinue = true;
    }
    // Smooth camera pan frames landed rocket cleanly above bottom Touchdown Card
    const tx = Math.max(0, Math.min(LUNAR_W - LOGICAL_W, l.x - LOGICAL_W / 2));
    const ty = Math.max(0, Math.min(LUNAR_H - LOGICAL_H, l.y - LOGICAL_H / 2 + 45));
    state.lunarCam.x += (tx - state.lunarCam.x) * Math.min(1, dt * 4);
    state.lunarCam.y += (ty - state.lunarCam.y) * Math.min(1, dt * 4);
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
    l.thrusting = false;
    l.hoverTrim = false;
    const vSpd = Math.abs(l.vz * 0.24);
    const tiltAbs = Math.abs(l.tiltX);

    if (vSpd > 7.5 || tiltAbs > 0.35) {
      const reason = vSpd > 7.5
        ? `Descent impact velocity too high (${vSpd.toFixed(1)} m/s vs 7.5 m/s limit). Fire [SPACE] retro-thrust earlier!`
        : `Lander touched down tilted too far (${Math.round((tiltAbs * 180) / Math.PI)} deg) and toppled on the lunar surface.`;
      triggerStage3AAbort(reason, onAbortToMenu);
      return;
    }

    l.landed = true;
    l.legCompress = 0.65;
    l.settleTimer = 0;
    l.readyToContinue = false;
    state.screenShake = 0.25;
    const padDist = Math.hypot(l.x - l.padX, (l.y - l.padY) * 1.4);
    const onPad = padDist <= (l.padRadius || 105);

    // Never snap position! Set Point A pad marker cleanly or keep exact landed coordinates for Stage 3B
    if (!onPad) {
      l.padX = l.x;
      l.padY = l.y;
    }

    let pts = 85;
    if (onPad && vSpd <= 4.2) {
      l.hardLandingPenalty = false;
      pts = 200;
      state.landingGrade = 'TEXTBOOK 4P BUTTER LANDING (+200⭐)';
      state.score += 200;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 125, 'TEXTBOOK 4P TOUCHDOWN! +200⭐', '#4ade80');
      logBlackBox('STAGE 3A', `Textbook landing at Point A (${vSpd.toFixed(1)} m/s, ${Math.round(l.fuel)}% fuel left).`, 'good');
    } else if (onPad && vSpd <= 6.8) {
      l.hardLandingPenalty = false;
      pts = 140;
      state.landingGrade = 'SAFE TOUCHDOWN (+140⭐)';
      state.score += 140;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 125, 'SAFE LANDING! +140⭐', '#38bdf8');
      logBlackBox('STAGE 3A', `Safe touchdown at Point A (${vSpd.toFixed(1)} m/s).`, 'good');
    } else {
      l.hardLandingPenalty = true;
      l.shockRepaired = false;
      pts = 85;
      state.landingGrade = onPad ? 'HARD PAD TOUCHDOWN (+85⭐ • -28Wh SHOCK)' : 'FIELD LANDING (+85⭐ • -28Wh SHOCK)';
      state.score += 85;
      addFloatText(l.x - state.lunarCam.x, l.y - state.lunarCam.y - 125, 'HARD TOUCHDOWN! ROVER BATTERY SHOCK (-28Wh)!', '#fbbf24');
      logBlackBox('STAGE 3A', `Hard touchdown (${vSpd.toFixed(1)} m/s) caused -28 Wh rover battery shock (repairable at Lander).`, 'warn');
    }
    l.landingPts = pts;
    l.landingSpeedMs = vSpd;
    l.landingOnPad = onPad;
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
  state.stage3BLaunch = { countdown: 0, launching: false };

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
    boarded: false,
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
    boarded: false,
    drilling: false,
    drillProgress: 0,
    armAnim: 0,
    rcsHopping: false,
    trackCd: 0
  };

  setStageBanner(
    'STAGE 3B: LUNAR SURFACE EVA',
    'Explore the Moon & Drill Point B Crater',
    'Drill Point B Crater, return with all active crew to Point A Rocket, and board together for Moon Ascent.',
    `<kbd>WASD</kbd> LTV-1 &nbsp;•&nbsp; <kbd>IJKL</kbd> LTV-2 (2P) &nbsp;•&nbsp; <kbd>SHIFT</kbd> Hop &nbsp;•&nbsp; <kbd>SPACE</kbd> Task / Tether`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  updateBottomHUD();
}

function getRequiredStage3BRovers() {
  return state.coopMode === 'SOLO' ? [state.rover] : [state.rover, state.rover2];
}

function tryBoardRoverAtLander(rv, radius = 125) {
  if (!rv || rv.boarded) return false;
  const sampleReady = state.sampleCollected || state.rover.hasSample || state.rover2.hasSample;
  if (!sampleReady) return false;
  if (Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) > radius) return false;
  if (rv.hasSample && !rv.sampleStowed) return false;

  rv.boarded = true;
  rv.drilling = false;
  rv.vx = 0;
  rv.vy = 0;
  rv.x = state.lander.padX;
  rv.y = state.lander.padY;

  const req = getRequiredStage3BRovers();
  const boardedCount = req.filter(r => r.boarded).length;
  const tag = rv.id.split(' ')[0];

  if (state.sampleCollected && boardedCount === req.length) {
    if (!state.stage3BLaunch?.launching) {
      state.stage3BLaunch = { countdown: 1.0, launching: true };
      addFloatText(
        state.lander.padX - state.lunarCam.x,
        state.lander.padY - state.lunarCam.y - 155,
        `ALL CREW ABOARD (${boardedCount}/${req.length})! HATCH SEALED!`,
        '#4ade80'
      );
      showMissionToast('All Crew Aboard', `${boardedCount}/${req.length} crew inside Point A Rocket. Launching Ascent Stage!`);
      playSuccessChord();
    }
  } else {
    addFloatText(
      state.lander.padX - state.lunarCam.x,
      state.lander.padY - state.lunarCam.y - 140,
      `${tag} BOARDED (${boardedCount}/${req.length}) - WAITING FOR CREW`,
      '#38bdf8'
    );
    showMissionToast(`${tag} Boarded`, `Crew inside Rocket: ${boardedCount}/${req.length}. Waiting for remaining crew & core sample.`);
    playTone(580, 'triangle', 0.14, 0.1);
  }
  updateBottomHUD();
  return true;
}

export function handleStage3BInteract(rv, onNextStage) {
  if (!rv || rv.boarded) return;
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

  for (const r of getRequiredStage3BRovers()) {
    tryBoardRoverAtLander(r, 125);
  }
}

function updateSingleRover(rv, input, targetCrater, dt) {
  if (!rv || rv.boarded) return;
  const other = rv === state.rover ? state.rover2 : state.rover;
  const tethered = other && !other.boarded && state.coopMode !== 'SOLO' && Math.hypot(rv.x - other.x, rv.y - other.y) < 130;
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
  let nextY = Math.max(335, Math.min(LUNAR_H - 70, rv.y + rv.vy * dt));

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
  if (!rv || rv.boarded) return;
  let goalX = state.lander.padX + 12, goalY = state.lander.padY + 12;
  const sampleReady = state.sampleCollected || state.rover.hasSample || rv.hasSample;
  const unscanned = !sampleReady ? state.scienceNodes.find(s => !s.scanned) : null;
  const nextEva = !sampleReady ? state.evaTasks.find(t => !t.done) : null;

  if (sampleReady) {
    goalX = state.lander.padX + 12;
    goalY = state.lander.padY + 12;
  } else if (unscanned) {
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

  const r1AtPadWithNew = state.rover.hasSample && !state.rover.sampleStowed && Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 115;
  const r2AtPadWithNew = state.rover2.hasSample && !state.rover2.sampleStowed && Math.hypot(state.rover2.x - state.lander.padX, state.rover2.y - state.lander.padY) < 115;
  if (r1AtPadWithNew || r2AtPadWithNew) {
    handleStage3BInteract(r1AtPadWithNew ? state.rover : state.rover2, onNextStage);
  }

  for (const r of getRequiredStage3BRovers()) {
    tryBoardRoverAtLander(r, 115);
  }

  if (state.stage3BLaunch?.launching) {
    state.stage3BLaunch.countdown = Math.max(0, state.stage3BLaunch.countdown - dt);
    if (state.stage3BLaunch.countdown <= 0) {
      state.stage3BLaunch.launching = false;
      if (state.stage === 'STAGE3B' && onNextStage) onNextStage();
      return;
    }
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
function getLunarHorizonY() {
  return Math.max(76, SKY_HORIZON_WORLD_Y - state.lunarCam.y);
}

function draw25DLunarWorld(ctx) {
  const cx = state.lunarCam.x;
  const cy = state.lunarCam.y;
  const horizonY = getLunarHorizonY();

  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, LOGICAL_W, horizonY);

  // Stationary seeded starfield clipped cleanly above horizon (never jumps vertically or aligns in grids)
  drawStarfield(ctx, LUNAR_STARS, LOGICAL_W, 300, {
    offsetX: cx * 0.04,
    maxY: horizonY - 6,
    nowSec: performance.now() * 0.001
  });

  // Earth in lunar sky with atmospheric halo
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LOGICAL_W, horizonY);
  ctx.clip();
  const earthX = 920 - cx * 0.05;
  const earthY = Math.max(38, Math.min(horizonY - 36, 72 - cy * 0.03));
  ctx.beginPath(); ctx.arc(earthX, earthY, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#1d4ed8'; ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.arc(earthX - 8, earthY - 8, 10, 0, Math.PI * 2); ctx.arc(earthX + 10, earthY + 6, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(earthX - 5, earthY - 13, 14, 4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(earthX, earthY, 34, 0, Math.PI * 2); ctx.stroke();

  // Far mountain ridge silhouette
  ctx.fillStyle = '#161e30';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= LOGICAL_W; x += 28) {
    const wx = x + cx * 0.22;
    ctx.lineTo(x, horizonY - 28 - Math.sin(wx * 0.0065) * 18 - Math.cos(wx * 0.014) * 11);
  }
  ctx.lineTo(LOGICAL_W, horizonY);
  ctx.closePath();
  ctx.fill();

  // Foreground Moon mountain ridge locked to horizonY with sunlit rim
  ctx.fillStyle = '#232e44';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= LOGICAL_W; x += 24) {
    const wx = x + cx * 0.42;
    ctx.lineTo(x, horizonY - 14 - Math.sin(wx * 0.009 + 1.1) * 14 - Math.cos(wx * 0.022) * 8);
  }
  ctx.lineTo(LOGICAL_W, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  const plainGrad = ctx.createLinearGradient(0, horizonY, 0, LOGICAL_H);
  plainGrad.addColorStop(0, '#475569');
  plainGrad.addColorStop(0.42, '#334155');
  plainGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = plainGrad;
  ctx.fillRect(0, horizonY, LOGICAL_W, LOGICAL_H - horizonY);

  // Horizon atmospheric terminator seam so terrain reads cleanly behind distant mountains
  const seam = ctx.createLinearGradient(0, horizonY, 0, horizonY + 28);
  seam.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  seam.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = seam;
  ctx.fillRect(0, horizonY, LOGICAL_W, 28);
}

function drawLunarCratersAndPad(ctx) {
  const horizonY = getLunarHorizonY();
  const minWorldY = state.lunarCam.y + horizonY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(state.lunarCam.x, minWorldY, LOGICAL_W, LOGICAL_H - horizonY + 24);
  ctx.clip();

  // Stationary regolith mare patches & scattered pebbles (replaces flat floating 2D grid)
  for (const mp of LUNAR_SURFACE.patches) {
    if (mp.y + mp.ry < minWorldY) continue;
    ctx.fillStyle = mp.dark ? 'rgba(15, 23, 42, 0.22)' : 'rgba(148, 163, 184, 0.09)';
    ctx.beginPath();
    ctx.ellipse(mp.x, mp.y, mp.rx, mp.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const pb of LUNAR_SURFACE.pebbles) {
    if (pb.y < minWorldY) continue;
    ctx.fillStyle = pb.light ? 'rgba(203, 213, 225, 0.22)' : 'rgba(15, 23, 42, 0.36)';
    ctx.beginPath();
    ctx.ellipse(pb.x, pb.y, pb.rx, pb.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const cr of state.lunarCraters) {
    if (cr.y + cr.ry + 16 < minWorldY) continue;
    if (cr.isTarget) {
      // Soft regolith ejecta blanket around Point B crater
      ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y, cr.rx + 16, cr.ry + 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Raised outer crater rim slope
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y, cr.rx + 6, cr.ry + 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Deep shaded crater depression
      const basinGrad = ctx.createLinearGradient(cr.x, cr.y - cr.ry, cr.x, cr.y + cr.ry);
      basinGrad.addColorStop(0, '#0b1120');
      basinGrad.addColorStop(0.58, '#172033');
      basinGrad.addColorStop(1, '#263246');
      ctx.fillStyle = basinGrad;
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y + 1, cr.rx - 4, cr.ry - 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner geological terraced ledge & subtle amber survey marker
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y + 2, cr.rx * 0.72, cr.ry * 0.66, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Shadowed northern cliff overhang arc
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.78)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y + 2, cr.rx - 5, cr.ry - 4, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POINT B: TARGET CRATER', cr.x, cr.y + cr.ry + 20);
      continue;
    }

    // Outer raised rim highlight + sunken basin
    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y, cr.rx + 7, cr.ry + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#273246';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y, cr.rx, cr.ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Interior crater wall shading (sunlit far rim, shadowed near wall)
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cr.x, cr.y + 4, cr.rx * 0.85, cr.ry * 0.78, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
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
  ctx.restore();
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
function draw25DLander(ctx, x, y, z, tiltX, legAnim, thrusting, hoverTrim, rampOpen = false, ascentLaunched = false, legCompress = 0) {
  const footBottom = 11 + legAnim * 18;
  const shadowScale = Math.max(0.45, 1 - z / 320);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, 54 * shadowScale, 24 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  if (z > 2) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - z); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  // Anchor footpad bottoms squarely onto (x, y - z) so landing indicator never passes up past the rocket
  ctx.translate(x, y - z - footBottom + legCompress * 5);
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
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(74, footBottom); ctx.stroke();
  }

  ctx.restore();
}

export function drawStage3A(ctx) {
  const l = state.lander;
  draw25DLunarWorld(ctx);

  ctx.save();
  ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
  drawLunarCratersAndPad(ctx);

  const padDist = Math.hypot(l.x - l.padX, (l.y - l.padY) * 1.4);
  const aligned = padDist <= (l.padRadius || 105);

  // Ground touchdown predictor ring directly underneath lander footpads
  ctx.strokeStyle = l.landed
    ? 'rgba(74, 222, 128, 0.72)'
    : aligned
      ? 'rgba(74, 222, 128, 0.65)'
      : 'rgba(168, 85, 247, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(l.x, l.y, 58, 26, 0, 0, Math.PI * 2);
  ctx.stroke();

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

  draw25DLander(ctx, l.x, l.y, l.z, l.tiltX, l.legAnim, l.thrusting, l.hoverTrim || l.p2AssistActive, false, false, l.legCompress || 0);

  const vSpdNum = Math.abs(l.vz * 0.24);
  const vSpd = vSpdNum.toFixed(1);
  const footBottom = 11 + l.legAnim * 18;
  const ly = l.y - l.z - footBottom;
  if (!l.landed && !l.crashed) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = vSpdNum <= 4.2 ? '#4ade80' : vSpdNum <= 7.5 ? '#fbbf24' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(l.x + 56, ly - 74, 130, 44, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`V:${vSpd} m/s`, l.x + 64, ly - 56);
    ctx.fillStyle = (l.hoverTrim || l.p2AssistActive) ? '#38bdf8' : '#94a3b8';
    ctx.fillText(l.p2AssistActive ? 'P2 TRIMMING' : `ALT:${Math.round(l.z * 0.45)}m`, l.x + 64, ly - 39);
  }

  drawLunarParticles(ctx);
  ctx.restore();

  drawLunarRadarMap(ctx);

  if (l.landed && !l.crashed) {
    const cw = 520, ch = 148;
    const cx = LOGICAL_W / 2 - cw / 2;
    const cy = LOGICAL_H - 178;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
    const accent = l.hardLandingPenalty ? '#fbbf24' : '#4ade80';

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 16); ctx.fill(); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.fillText('LUNAR SURFACE CONTACT CONFIRMED', LOGICAL_W / 2, cy + 24);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 19px Fredoka, sans-serif';
    ctx.fillText(state.landingGrade, LOGICAL_W / 2, cy + 50);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    ctx.fillText(
      `Touchdown: ${l.landingSpeedMs.toFixed(1)} m/s  •  Zone: ${l.landingOnPad ? 'Point A Pad' : 'Lunar Plain'}  •  Fuel: ${Math.round(l.fuel)}%`,
      LOGICAL_W / 2,
      cy + 74
    );

    const bx = cx + 56, by = cy + 92, bw = cw - 112, bh = 40;
    l.continueBtnRect = { x: bx, y: by, w: bw, h: bh };
    const btnGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
    btnGrad.addColorStop(0, '#0284c7');
    btnGrad.addColorStop(1, '#16a34a');
    ctx.fillStyle = btnGrad;
    ctx.strokeStyle = `rgba(253, 224, 71, ${0.55 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 11); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Fredoka, sans-serif';
    ctx.fillText('CONTINUE TO STAGE 3B: DEPLOY ROVERS  [SPACE / CLICK] ▶', LOGICAL_W / 2, by + 25);
    ctx.restore();
  } else {
    l.continueBtnRect = null;
    drawCanvasControlBar(ctx, LOGICAL_W, [
      { key: 'SPACE / W', label: 'Retro-Thrust' },
      { key: 'WASD', label: 'Align Blue Pad' },
      { key: 'SHIFT', label: 'Hover Trim' }
    ]);
  }
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

  const minWorldY = state.lunarCam.y + getLunarHorizonY();

  ctx.save();
  ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
  drawLunarCratersAndPad(ctx);

  // Subtle Lunar Regolith Tire Tracks (clipped cleanly below horizon)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (const tr of state.roverTracks) {
    if (tr.y - 8 < minWorldY) continue;
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);
    ctx.fillRect(-4, -7, 6, 3);
    ctx.fillRect(-4, 4, 6, 3);
    ctx.restore();
  }

  const targetCrater = state.lunarCraters.find(c => c.isTarget);
  const anySample = state.rover.hasSample || state.rover2.hasSample || state.sampleCollected;
  const reqRovers = getRequiredStage3BRovers();
  const boardedCount = reqRovers.filter(r => r.boarded).length;

  // Co-Op Power Tether between LTV-1 and LTV-2 when close and both deployed
  const tethered =
    state.coopMode !== 'SOLO' &&
    !state.rover.boarded &&
    !state.rover2.boarded &&
    Math.hypot(state.rover.x - state.rover2.x, state.rover.y - state.rover2.y) < 130;
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

  const depthList = [
    { kind: 'rocket', y: state.lander.padY },
    ...(!state.rover.boarded ? [{ kind: 'rover1', y: state.rover.y }] : []),
    ...(state.coopMode !== 'SOLO' && !state.rover2.boarded ? [{ kind: 'rover2', y: state.rover2.y }] : []),
    ...state.lunarBoulders.map(b => ({ kind: 'boulder', y: b.y, obj: b })),
    ...state.scienceNodes.map(s => ({ kind: 'science', y: s.y, obj: s })),
    ...state.evaTasks.map(t => ({ kind: 'eva', y: t.y, obj: t }))
  ].sort((a, b) => a.y - b.y);

  for (const item of depthList) {
    if (item.kind !== 'rocket' && item.y < minWorldY) continue;
    if (item.kind === 'rocket') {
      draw25DLander(ctx, state.lander.padX, state.lander.padY, 0, 0, 1, false, false, true, false);
    } else if (item.kind === 'rover1') {
      draw25DSingleRover(ctx, state.rover, CREW_ROSTER[0], CREW_ROSTER[2]);
    } else if (item.kind === 'rover2') {
      draw25DSingleRover(ctx, state.rover2, CREW_ROSTER[1], CREW_ROSTER[3]);
    } else if (item.kind === 'boulder') {
      const b = item.obj;
      // Grounded shadow + seated faceted boulder with zero air gap
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.beginPath(); ctx.ellipse(b.x + 5, b.y + 1, b.r * 1.18, b.r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.r, b.y + 1);
      ctx.lineTo(b.x - b.r * 0.82, b.y - b.r * 0.58);
      ctx.lineTo(b.x - b.r * 0.15, b.y - b.r * 0.95);
      ctx.lineTo(b.x + b.r * 0.65, b.y - b.r * 0.65);
      ctx.lineTo(b.x + b.r, b.y + 1);
      ctx.quadraticCurveTo(b.x, b.y + 5, b.x - b.r, b.y + 1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Sunlit top-left facet highlight
      ctx.fillStyle = 'rgba(203, 213, 225, 0.25)';
      ctx.beginPath();
      ctx.moveTo(b.x - b.r * 0.78, b.y - b.r * 0.48);
      ctx.lineTo(b.x - b.r * 0.15, b.y - b.r * 0.88);
      ctx.lineTo(b.x + b.r * 0.15, b.y - b.r * 0.35);
      ctx.lineTo(b.x - b.r * 0.45, b.y - b.r * 0.12);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === 'science') {
      const sn = item.obj;
      // Grounded contact shadow + seated mineral rock formation
      ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
      ctx.beginPath(); ctx.ellipse(sn.x + 3, sn.y + 2, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sn.x - 14, sn.y + 2);
      ctx.lineTo(sn.x - 9, sn.y - 14);
      ctx.lineTo(sn.x - 1, sn.y - 25);
      ctx.lineTo(sn.x + 10, sn.y - 12);
      ctx.lineTo(sn.x + 15, sn.y + 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Glowing mineral/ice seam inlaid onto rock
      ctx.strokeStyle = sn.scanned ? '#64748b' : '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sn.x - 6, sn.y - 3);
      ctx.lineTo(sn.x - 1, sn.y - 19);
      ctx.lineTo(sn.x + 5, sn.y - 5);
      ctx.stroke();
      if (!sn.scanned && Math.hypot(state.rover.x - sn.x, state.rover.y - sn.y) < 75) {
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`[SPACE] Scan ${sn.name} (+${sn.pts}⭐)`, sn.x, sn.y - 34);
      }
    } else if (item.kind === 'eva') {
      const ev = item.obj;
      // Ground contact pad & shadow under EVA instrument
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.beginPath(); ctx.ellipse(ev.x + 2, ev.y + 2, 18, 7.5, 0, 0, Math.PI * 2); ctx.fill();
      if (ev.kind === 'SEISMIC') {
        if (ev.done) {
          const pulse = ((performance.now() * 0.04) % 45);
          ctx.strokeStyle = `rgba(74, 222, 128, ${1 - pulse / 45})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(ev.x, ev.y, 14 + pulse, (14 + pulse) * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ev.x, ev.y - 20); ctx.lineTo(ev.x - 12, ev.y + 1);
        ctx.moveTo(ev.x, ev.y - 20); ctx.lineTo(ev.x + 12, ev.y + 1);
        ctx.moveTo(ev.x, ev.y - 20); ctx.lineTo(ev.x, ev.y + 3);
        ctx.stroke();
        ctx.fillStyle = ev.done ? '#4ade80' : '#f59e0b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(ev.x - 10, ev.y - 28, 20, 12, 4); ctx.fill(); ctx.stroke();
      } else {
        if (ev.done) {
          const beamGrad = ctx.createLinearGradient(ev.x + 2, ev.y - 24, ev.x + 95, ev.y - 165);
          beamGrad.addColorStop(0, 'rgba(74, 222, 128, 0.65)');
          beamGrad.addColorStop(1, 'rgba(74, 222, 128, 0)');
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(ev.x + 2, ev.y - 24); ctx.lineTo(ev.x + 95, ev.y - 165); ctx.stroke();
        }
        // Connected tripod base + pedestal mast + dish reflector
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ev.x, ev.y - 14); ctx.lineTo(ev.x - 10, ev.y + 1);
        ctx.moveTo(ev.x, ev.y - 14); ctx.lineTo(ev.x + 10, ev.y + 1);
        ctx.stroke();
        ctx.fillStyle = '#334155'; ctx.fillRect(ev.x - 6, ev.y - 16, 12, 10);
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(ev.x, ev.y - 16); ctx.lineTo(ev.x, ev.y - 22); ctx.stroke();
        ctx.fillStyle = ev.done ? '#4ade80' : '#a78bfa'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ev.x, ev.y - 24, 13, 0.12 * Math.PI, 0.88 * Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(ev.x, ev.y - 20); ctx.lineTo(ev.x + 3, ev.y - 29); ctx.stroke();
      }
      if (!ev.done && Math.hypot(state.rover.x - ev.x, state.rover.y - ev.y) < 76) {
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(ev.progress > 0 ? `${ev.name}: ${Math.round(ev.progress * 100)}%` : `[HOLD SPACE] Deploy ${ev.name} (+${ev.pts}⭐)`, ev.x, ev.y - 42);
      }
    }
  }

  if (targetCrater && !state.rover.hasSample && !state.sampleCollected) {
    const tPulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
    ctx.save();
    ctx.translate(targetCrater.x, targetCrater.y);

    // Core-drill laser glow on crater floor
    const boreGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    boreGlow.addColorStop(0, `rgba(74, 222, 128, ${0.42 * tPulse})`);
    boreGlow.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = boreGlow;
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Grounded tripod struts inside the crater basin
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, 3);
    ctx.lineTo(-4, -14);
    ctx.moveTo(12, 3);
    ctx.lineTo(4, -14);
    ctx.moveTo(0, 5);
    ctx.lineTo(0, -14);
    ctx.stroke();

    // Brushed metallic + gold core-drill head & glowing laser rod
    ctx.fillStyle = '#eab308';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-8, -22, 16, 11, 3);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 2);
    ctx.stroke();

    // Top telemetry beacon pulse
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(0, -26, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (Math.hypot(state.rover.x - targetCrater.x, state.rover.y - targetCrater.y) < 92) {
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(state.rover.drilling ? `DRILLING SAMPLE... ${Math.round(state.rover.drillProgress * 100)}%` : '[HOLD SPACE] DRILL CORE SAMPLE', targetCrater.x, targetCrater.y - 38);
      if (state.rover.drilling) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(targetCrater.x - 45, targetCrater.y - 56, 90, 9);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(targetCrater.x - 43, targetCrater.y - 54, 86 * state.rover.drillProgress, 5);
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
    ctx.fillText('🔧 [SPACE] REPAIR LANDING SHOCK (+28Wh BATTERY)', state.lander.padX, state.lander.padY - 150);
  } else if (anySample) {
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    if (state.stage3BLaunch?.launching) {
      ctx.fillText(`🚀 HATCH SEALED! IGNITION IN ${state.stage3BLaunch.countdown.toFixed(1)}s`, state.lander.padX, state.lander.padY - 150);
    } else if (boardedCount < reqRovers.length) {
      ctx.fillText(`⬇️ GATHER INSIDE ROCKET TO LAUNCH (CREW ${boardedCount}/${reqRovers.length}) ⬇️`, state.lander.padX, state.lander.padY - 150);
    } else {
      ctx.fillText('⬇️ ALL CREW AT ROCKET - STOWING CORE SAMPLE! ⬇️', state.lander.padX, state.lander.padY - 150);
    }
  }

  drawLunarParticles(ctx);
  ctx.restore();

  // Top-Left Lunar EVA Mission Checklist Card (screen space)
  const scannedCount = state.scienceNodes.filter(s => s.scanned).length;
  const doneEvaCount = state.evaTasks.filter(t => t.done).length;
  const needsRepair = state.lander.hardLandingPenalty && !state.lander.shockRepaired;
  const allCrewBoarded = state.sampleCollected && boardedCount === reqRovers.length;
  const rocketStatusText = state.stage3BLaunch?.launching
    ? `Launching (${state.stage3BLaunch.countdown.toFixed(1)}s)`
    : anySample
      ? `Crew ${boardedCount}/${reqRovers.length} Boarded`
      : 'Awaiting Core Sample';
  const checklistRows = [
    { done: scannedCount === state.scienceNodes.length, text: `1. 🔬 Science Ridges: ${scannedCount}/${state.scienceNodes.length} Scanned` },
    { done: doneEvaCount === state.evaTasks.length,     text: `2. 🛠️ EVA Instruments: ${doneEvaCount}/${state.evaTasks.length} Online` },
    { done: anySample,                                  text: `3. 🧪 Point B Crater Core: ${anySample ? 'EXTRACTED ✅' : 'Hold [SPACE] at Crater'}` },
    { done: allCrewBoarded,                             text: `4. 🚀 Point A Rocket: ${rocketStatusText}` }
  ];
  if (needsRepair) {
    checklistRows.unshift({ done: false, warn: true, text: '🔧 Lander Pad: [SPACE] Repair Shock (-28Wh)' });
  }
  const cardH = 38 + checklistRows.length * 20 + 10;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = anySample ? '#4ade80' : '#38bdf8';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(14, 14, 308, cardH, 12); ctx.fill(); ctx.stroke();
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
    if (!state.rover.boarded || !state.sampleCollected) {
      evaWaypoints.push({ x: state.lander.padX, y: state.lander.padY, label: `🚀 BOARD ROCKET (${boardedCount}/${reqRovers.length})`, col: '#4ade80' });
    }
    if (state.rover.boarded && state.coopMode !== 'SOLO' && !state.rover2.boarded) {
      evaWaypoints.push({ x: state.rover2.x, y: state.rover2.y, label: '🚐 LTV-2 EN ROUTE', col: '#38bdf8' });
    }
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
    ctx.translate(state.lander.padX, ml.capsuleY - 91);
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
    drawStarfield(ctx, TEI_STARS, LOGICAL_W, LOGICAL_H, {
      offsetX: ml.progress * 45,
      nowSec: performance.now() * 0.001
    });

    const nowSec = performance.now() * 0.001;
    const moonX = 160;
    const moonY = 345;
    const moonR = Math.max(38, 86 - ml.progress * 44);

    // Realistic shaded Lunar sphere (departed)
    ctx.save();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    const moonGrad = ctx.createRadialGradient(
      moonX - moonR * 0.35, moonY - moonR * 0.35, moonR * 0.1,
      moonX, moonY, moonR * 1.05
    );
    moonGrad.addColorStop(0, '#cbd5e1');
    moonGrad.addColorStop(0.55, '#64748b');
    moonGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = moonGrad;
    ctx.fill();
    ctx.clip();
    // Subtle mare basins & craters clipped inside Moon limb
    ctx.fillStyle = 'rgba(30, 41, 59, 0.38)';
    ctx.beginPath();
    ctx.ellipse(moonX - moonR * 0.22, moonY - moonR * 0.14, moonR * 0.34, moonR * 0.24, -0.3, 0, Math.PI * 2);
    ctx.ellipse(moonX + moonR * 0.18, moonY + moonR * 0.16, moonR * 0.26, moonR * 0.2, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.32, moonY + moonR * 0.28, moonR * 0.12, 0, Math.PI * 2);
    ctx.arc(moonX + moonR * 0.26, moonY - moonR * 0.26, moonR * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOON (DEPARTED)', moonX, moonY + moonR + 24);

    // Realistic shaded Planet Earth framed cleanly inside right viewport (zero clipping)
    const earthX = 900;
    const earthY = 325;
    const earthR = 54 + ml.progress * 44; // max radius 98 -> right edge 998 < 1120

    // Outer atmospheric blue scattering aura
    const atmoHalo = ctx.createRadialGradient(earthX, earthY, earthR * 0.85, earthX, earthY, earthR * 1.38);
    atmoHalo.addColorStop(0, 'rgba(56, 189, 248, 0.36)');
    atmoHalo.addColorStop(0.55, 'rgba(56, 189, 248, 0.12)');
    atmoHalo.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = atmoHalo;
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR * 1.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
    const oceanGrad = ctx.createRadialGradient(
      earthX - earthR * 0.38, earthY - earthR * 0.35, earthR * 0.08,
      earthX + earthR * 0.15, earthY + earthR * 0.15, earthR * 1.15
    );
    oceanGrad.addColorStop(0, '#38bdf8');
    oceanGrad.addColorStop(0.45, '#1d4ed8');
    oceanGrad.addColorStop(0.85, '#1e3a8a');
    oceanGrad.addColorStop(1, '#091124');
    ctx.fillStyle = oceanGrad;
    ctx.fill();
    ctx.clip();

    // Sculpted continents (North Pacific / Americas + Pacific Islands / Asia-Australia contours)
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(earthX - earthR * 0.55, earthY - earthR * 0.62);
    ctx.bezierCurveTo(earthX - earthR * 0.08, earthY - earthR * 0.72, earthX + earthR * 0.16, earthY - earthR * 0.38, earthX + earthR * 0.02, earthY - earthR * 0.08);
    ctx.bezierCurveTo(earthX - earthR * 0.08, earthY + earthR * 0.08, earthX - earthR * 0.34, earthY + earthR * 0.04, earthX - earthR * 0.45, earthY - earthR * 0.16);
    ctx.bezierCurveTo(earthX - earthR * 0.64, earthY - earthR * 0.3, earthX - earthR * 0.68, earthY - earthR * 0.52, earthX - earthR * 0.55, earthY - earthR * 0.62);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(earthX + earthR * 0.04, earthY + earthR * 0.04);
    ctx.bezierCurveTo(earthX + earthR * 0.42, earthY - earthR * 0.02, earthX + earthR * 0.54, earthY + earthR * 0.35, earthX + earthR * 0.22, earthY + earthR * 0.62);
    ctx.bezierCurveTo(earthX + earthR * 0.05, earthY + earthR * 0.66, earthX - earthR * 0.06, earthY + earthR * 0.34, earthX + earthR * 0.04, earthY + earthR * 0.04);
    ctx.closePath();
    ctx.fill();

    // Subtle arid highland tint inside continents
    ctx.fillStyle = 'rgba(234, 179, 8, 0.32)';
    ctx.beginPath();
    ctx.ellipse(earthX - earthR * 0.25, earthY - earthR * 0.32, earthR * 0.14, earthR * 0.09, -0.4, 0, Math.PI * 2);
    ctx.ellipse(earthX + earthR * 0.22, earthY + earthR * 0.26, earthR * 0.12, earthR * 0.08, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Polar ice cap highlight
    ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
    ctx.beginPath();
    ctx.ellipse(earthX, earthY - earthR * 0.94, earthR * 0.48, earthR * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wispy orbital cloud bands gently drifting
    const cloudShift = Math.sin(nowSec * 0.4) * earthR * 0.04;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.beginPath();
    ctx.ellipse(earthX - earthR * 0.26 + cloudShift, earthY - earthR * 0.12, earthR * 0.44, earthR * 0.07, -0.18, 0, Math.PI * 2);
    ctx.ellipse(earthX + earthR * 0.12 - cloudShift, earthY + earthR * 0.18, earthR * 0.5, earthR * 0.065, -0.12, 0, Math.PI * 2);
    ctx.ellipse(earthX - earthR * 0.05 + cloudShift, earthY - earthR * 0.52, earthR * 0.36, earthR * 0.055, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Night-side terminator shadow crescent on bottom-right
    const nightShade = ctx.createLinearGradient(earthX - earthR * 0.35, earthY - earthR * 0.35, earthX + earthR * 0.88, earthY + earthR * 0.85);
    nightShade.addColorStop(0, 'rgba(2, 6, 23, 0)');
    nightShade.addColorStop(0.58, 'rgba(2, 6, 23, 0.12)');
    nightShade.addColorStop(1, 'rgba(2, 6, 23, 0.78)');
    ctx.fillStyle = nightShade;
    ctx.fillRect(earthX - earthR, earthY - earthR, earthR * 2, earthR * 2);
    ctx.restore();

    // Crisp atmospheric Fresnel rim + Entry Interface corridor marker arc
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.68)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR + 1.5, 0, Math.PI * 2);
    ctx.stroke();

    const eiPointX = earthX - earthR - 14;
    const eiPointY = earthY - 12;
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(earthX, earthY, earthR + 14, Math.PI * 0.82, Math.PI * 1.18);
    ctx.stroke();

    ctx.fillStyle = '#bae6fd';
    ctx.font = 'bold 13px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PLANET EARTH (ENTRY INTERFACE)', earthX, earthY + earthR + 28);

    // Trajectory anchored cleanly from Moon departure rim to Earth atmospheric entry point
    const p0 = { x: moonX + moonR + 8, y: moonY - 4 };
    const p1 = { x: 520, y: 205 };
    const p2 = { x: eiPointX, y: eiPointY };

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Entry Interface target ring at curve endpoint
    ctx.fillStyle = '#fb923c';
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Highlight Optimal Green TEI Burn Window on trajectory arc (t = 0.36 .. 0.68)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let st = 0.36; st <= 0.68; st += 0.02) {
      const omt = 1 - st;
      const wx = omt * omt * p0.x + 2 * omt * st * p1.x + st * st * p2.x;
      const wy = omt * omt * p0.y + 2 * omt * st * p1.y + st * st * p2.y;
      if (st === 0.36) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Detailed Orion Crew + Service Module aligned along curve tangent
    const t = ml.progress;
    const omt = 1 - t;
    const cx = omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x;
    const cy = omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y;
    const tx = 2 * omt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const ty = 2 * omt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const craftAngle = Math.atan2(ty, tx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(craftAngle);
    if (ml.teiBurnDone) {
      const flameLen = 28 + Math.random() * 14;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-22, -6);
      ctx.lineTo(-22 - flameLen, 0);
      ctx.lineTo(-22, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(-22, -3);
      ctx.lineTo(-22 - flameLen * 0.55, 0);
      ctx.lineTo(-22, 3);
      ctx.closePath();
      ctx.fill();
    }
    // Solar array wings
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-14, -24, 11, 14);
    ctx.strokeRect(-14, -24, 11, 14);
    ctx.fillRect(-14, 10, 11, 14);
    ctx.strokeRect(-14, 10, 11, 14);
    // Engine nozzle & Service Module cylinder
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-16, -5);
    ctx.lineTo(-23, -8);
    ctx.lineTo(-23, 8);
    ctx.lineTo(-16, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.roundRect(-16, -8, 18, 16, 3);
    ctx.fill();
    ctx.stroke();
    // Conical Orion Crew Capsule + NASA accent
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(2, -10);
    ctx.lineTo(20, -4.5);
    ctx.lineTo(20, 4.5);
    ctx.lineTo(2, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(3, -8, 3, 16);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(10, -3.5, 5, 3);
    ctx.fillRect(10, 0.5, 5, 3);
    ctx.restore();

    if (!ml.teiBurnDone) {
      const inTeiWin = ml.progress >= 0.36 && ml.progress <= 0.68;
      const cardW = 470;
      const cardX = LOGICAL_W / 2 - cardW / 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = inTeiWin ? '#4ade80' : '#f97316';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(cardX, 34, cardW, 66, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = inTeiWin ? '#4ade80' : '#fb923c';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TRANS-EARTH INJECTION CORRIDOR', LOGICAL_W / 2, 52);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px Fredoka, sans-serif';
      ctx.fillText(
        inTeiWin ? '🟢 IN GREEN TEI WINDOW: PRESS [SPACE] NOW!' : 'WAIT FOR GREEN TEI WINDOW, THEN PRESS [SPACE]',
        LOGICAL_W / 2,
        71
      );

      const tbx = LOGICAL_W / 2 - 180, tby = 80, tbw = 360, tbh = 12;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(tbx, tby, tbw, tbh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(74, 222, 128, 0.78)';
      ctx.beginPath();
      ctx.roundRect(tbx + tbw * 0.36, tby + 2, tbw * 0.32, tbh - 4, 4);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.roundRect(tbx + tbw * ml.progress - 3, tby - 2, 6, tbh + 4, 2);
      ctx.fill();
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
