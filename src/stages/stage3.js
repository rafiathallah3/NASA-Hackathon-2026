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

const ELEV_LIFT_PX = 24;

function isPointInRoundedRect(x, y, rect) {
  if (!rect) return false;
  if (x < rect.x1 || x > rect.x2 || y < rect.y1 || y > rect.y2) return false;
  const r = rect.r || 0;
  const ix = Math.max(rect.x1 + r, Math.min(rect.x2 - r, x));
  const iy = Math.max(rect.y1 + r, Math.min(rect.y2 - r, y));
  return Math.hypot(x - ix, y - iy) <= r;
}

function getRampElevAt(x, y, ramp) {
  const span = ramp.dir === 'x' ? (ramp.x2 - ramp.x1) : (ramp.y2 - ramp.y1);
  const rawT = span > 0
    ? (ramp.dir === 'x' ? (x - ramp.x1) : (y - ramp.y1)) / span
    : 0;
  const t = Math.max(0, Math.min(1, rawT));
  return ramp.fromElev + (ramp.toElev - ramp.fromElev) * t;
}

function getTerrainInfo(x, y) {
  const cliffs = state.lunarCliffs;
  if (!cliffs) return { elev: 0, zone: 'PLAIN', ramp: null, cliff: null, ledge: null };

  for (const ramp of cliffs.ramps || []) {
    if (x >= ramp.x1 && x <= ramp.x2 && y >= ramp.y1 && y <= ramp.y2) {
      const parent =
        (cliffs.plateaus || []).find(p => p.id === ramp.cliffId) ||
        (cliffs.basins || []).find(b => b.id === ramp.cliffId) ||
        null;
      return {
        elev: getRampElevAt(x, y, ramp),
        zone: 'RAMP',
        ramp,
        cliff: parent,
        ledge: null
      };
    }
  }

  for (const p of cliffs.plateaus || []) {
    if (isPointInRoundedRect(x, y, p)) {
      return { elev: p.elev, zone: 'HIGH_CLIFF', ramp: null, cliff: p, ledge: null };
    }
    for (const ledge of p.ledges || []) {
      if (isPointInRoundedRect(x, y, ledge)) {
        return { elev: ledge.elev, zone: 'LEDGE', ramp: null, cliff: p, ledge };
      }
    }
  }

  for (const b of cliffs.basins || []) {
    if (isPointInRoundedRect(x, y, b)) {
      return { elev: b.elev, zone: 'LOW_CLIFF', ramp: null, cliff: b, ledge: null };
    }
  }

  return { elev: 0, zone: 'PLAIN', ramp: null, cliff: null, ledge: null };
}

function getSurfaceElevation(x, y) {
  return getTerrainInfo(x, y).elev;
}

function getRampEndpoints(ramp) {
  const midX = (ramp.x1 + ramp.x2) * 0.5;
  const midY = (ramp.y1 + ramp.y2) * 0.5;
  if (ramp.dir === 'x') {
    const fromPt = { x: ramp.x1 - 14, y: midY };
    const toPt = { x: ramp.x2 + 14, y: midY };
    return {
      plainEnd: ramp.fromElev === 0 ? fromPt : toPt,
      cliffEnd: ramp.fromElev === 0 ? toPt : fromPt
    };
  }
  const fromPt = { x: midX, y: ramp.y1 - 14 };
  const toPt = { x: midX, y: ramp.y2 + 14 };
  return {
    plainEnd: ramp.fromElev === 0 ? fromPt : toPt,
    cliffEnd: ramp.fromElev === 0 ? toPt : fromPt
  };
}

function build25DLunarTerrain() {
  state.lunarCliffs = {
    plateaus: [
      {
        id: 'high_nw',
        name: 'NW BASALT PLATEAU',
        elev: 1,
        x1: 530, y1: 335, x2: 1030, y2: 515, r: 34,
        wallH: 26,
        ledges: [
          { x1: 800, y1: 505, x2: 890, y2: 552, r: 12, elev: 0.5 }
        ]
      },
      {
        id: 'high_ne',
        name: 'NE RELAY RIDGE',
        elev: 1,
        x1: 1330, y1: 330, x2: 1860, y2: 605, r: 38,
        wallH: 28,
        ledges: [
          { x1: 1470, y1: 595, x2: 1570, y2: 642, r: 12, elev: 0.5 }
        ]
      }
    ],
    basins: [
      {
        id: 'low_ice',
        name: 'SHADOWED ICE BASIN',
        elev: -1,
        x1: 970, y1: 965, x2: 1300, y2: 1205, r: 34,
        wallH: 22
      },
      {
        id: 'low_crater',
        name: 'POINT B CRATER BASIN',
        elev: -1,
        x1: 1760, y1: 655, x2: 2140, y2: 910, r: 42,
        wallH: 22
      }
    ],
    ramps: [
      { id: 'ramp_nw_w', cliffId: 'high_nw', x1: 445, y1: 405, x2: 550, y2: 475, dir: 'x', fromElev: 0, toElev: 1 },
      { id: 'ramp_nw_e', cliffId: 'high_nw', x1: 1010, y1: 400, x2: 1110, y2: 470, dir: 'x', fromElev: 1, toElev: 0 },
      { id: 'ramp_ne_w', cliffId: 'high_ne', x1: 1240, y1: 485, x2: 1350, y2: 555, dir: 'x', fromElev: 0, toElev: 1 },
      { id: 'ramp_ne_s', cliffId: 'high_ne', x1: 1640, y1: 590, x2: 1720, y2: 675, dir: 'y', fromElev: 1, toElev: 0 },
      { id: 'ramp_ice_w', cliffId: 'low_ice', x1: 885, y1: 1045, x2: 990, y2: 1120, dir: 'x', fromElev: 0, toElev: -1 },
      { id: 'ramp_ice_n', cliffId: 'low_ice', x1: 1095, y1: 895, x2: 1175, y2: 985, dir: 'y', fromElev: 0, toElev: -1 },
      { id: 'ramp_crater_w', cliffId: 'low_crater', x1: 1685, y1: 800, x2: 1785, y2: 865, dir: 'x', fromElev: 0, toElev: -1 },
      { id: 'ramp_crater_n', cliffId: 'low_crater', x1: 1900, y1: 585, x2: 1980, y2: 675, dir: 'y', fromElev: 0, toElev: -1 }
    ]
  };

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

  const terrainUnder = getTerrainInfo(l.x, l.y);
  const surfaceZ = terrainUnder.elev * ELEV_LIFT_PX;
  const altAboveGround = Math.max(0, l.z - surfaceZ);

  if (altAboveGround < 90) l.legAnim = Math.min(1, l.legAnim + dt * 2.6);

  if ((l.thrusting || l.hoverTrim || l.p2AssistActive) && altAboveGround < 105) {
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      state.lunarParticles.push({
        x: l.x + Math.cos(ang) * 26,
        y: (l.y - surfaceZ) + Math.sin(ang) * 12,
        vx: Math.cos(ang) * (85 + Math.random() * 75),
        vy: Math.sin(ang) * (40 + Math.random() * 35),
        life: 0.55,
        size: 3.5 + Math.random() * 3.5,
        color: '#cbd5e1'
      });
    }
  }

  if (l.z <= surfaceZ) {
    l.z = surfaceZ;
    l.surfaceZ = surfaceZ;
    l.thrusting = false;
    l.hoverTrim = false;
    const vSpd = Math.abs(l.vz * 0.24);
    const tiltAbs = Math.abs(l.tiltX);
    const onSlope = Boolean(terrainUnder.ramp || terrainUnder.ledge);
    const maxTilt = onSlope ? 0.22 : 0.35;

    if (vSpd > 7.5 || tiltAbs > maxTilt) {
      const reason = vSpd > 7.5
        ? `Descent impact velocity too high (${vSpd.toFixed(1)} m/s vs 7.5 m/s limit). Fire [SPACE] retro-thrust earlier!`
        : onSlope
          ? `Lander touched down on a steep cliff slope (${Math.round((tiltAbs * 180) / Math.PI)} deg tilt) and toppled.`
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
    if (onPad && vSpd <= 4.2 && !onSlope) {
      l.hardLandingPenalty = false;
      pts = 200;
      state.landingGrade = 'TEXTBOOK 4P BUTTER LANDING (+200⭐)';
      state.score += 200;
      addFloatText(l.x - state.lunarCam.x, l.y - surfaceZ - state.lunarCam.y - 125, 'TEXTBOOK 4P TOUCHDOWN! +200⭐', '#4ade80');
      logBlackBox('STAGE 3A', `Textbook landing at Point A (${vSpd.toFixed(1)} m/s, ${Math.round(l.fuel)}% fuel left).`, 'good');
    } else if (onPad && vSpd <= 6.8 && !onSlope) {
      l.hardLandingPenalty = false;
      pts = 140;
      state.landingGrade = 'SAFE TOUCHDOWN (+140⭐)';
      state.score += 140;
      addFloatText(l.x - state.lunarCam.x, l.y - surfaceZ - state.lunarCam.y - 125, 'SAFE LANDING! +140⭐', '#38bdf8');
      logBlackBox('STAGE 3A', `Safe touchdown at Point A (${vSpd.toFixed(1)} m/s).`, 'good');
    } else {
      l.hardLandingPenalty = true;
      l.shockRepaired = false;
      pts = 85;
      state.landingGrade = onSlope
        ? 'CLIFF SLOPE TOUCHDOWN (+85⭐ • -28Wh SHOCK)'
        : onPad
          ? 'HARD PAD TOUCHDOWN (+85⭐ • -28Wh SHOCK)'
          : 'FIELD LANDING (+85⭐ • -28Wh SHOCK)';
      state.score += 85;
      addFloatText(l.x - state.lunarCam.x, l.y - surfaceZ - state.lunarCam.y - 125, onSlope ? 'CLIFF SLOPE TOUCHDOWN! ROVER SHOCK (-28Wh)!' : 'HARD TOUCHDOWN! ROVER BATTERY SHOCK (-28Wh)!', '#fbbf24');
      logBlackBox('STAGE 3A', `${onSlope ? 'Cliff slope' : 'Hard'} touchdown (${vSpd.toFixed(1)} m/s) caused -28 Wh rover battery shock (repairable at Lander).`, 'warn');
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
  state.stageTimer = 140;
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
  const r1x = Math.max(90, Math.min(LUNAR_W - 90, px + 92));
  const r1y = Math.max(295, Math.min(LUNAR_H - 70, py + 8));
  const r2x = Math.max(90, Math.min(LUNAR_W - 90, px + 76));
  const r2y = Math.max(295, Math.min(LUNAR_H - 70, py + 68));

  state.rover = {
    id: 'LTV-1 (P1+P3)',
    bodyColor: '#f59e0b',
    x: r1x, y: r1y, z: 0,
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
    groundElev: getSurfaceElevation(r1x, r1y),
    highCliffDrop: false,
    rcsCushioned: false,
    cliffWarnCd: 0,
    trackCd: 0
  };

  state.rover2 = {
    id: 'LTV-2 (P2+P4)',
    bodyColor: '#38bdf8',
    x: r2x, y: r2y, z: 0,
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
    groundElev: getSurfaceElevation(r2x, r2y),
    highCliffDrop: false,
    rcsCushioned: false,
    cliffWarnCd: 0,
    trackCd: 0
  };

  setStageBanner(
    'STAGE 3B: LUNAR SURFACE EVA',
    'Explore the Moon & Drill Point B Crater',
    'Climb High Cliff ramps for sunlit +4.5Wh/s recharge, descend into shadowed basins, drill Point B Crater, and board Point A Rocket.',
    `<kbd>WASD</kbd> LTV-1 &nbsp;•&nbsp; <kbd>IJKL</kbd> LTV-2 (2P) &nbsp;•&nbsp; <kbd>SHIFT</kbd> RCS Hop / Cushion &nbsp;•&nbsp; <kbd>SPACE</kbd> Task / Tether`,
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
  const rvElev = rv.groundElev ?? getSurfaceElevation(rv.x, rv.y);
  const padElev = getSurfaceElevation(state.lander.padX, state.lander.padY);
  if (Math.abs(rvElev - padElev) > 0.45) return false;
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
  const rvElev = rv.groundElev ?? getSurfaceElevation(rv.x, rv.y);

  for (const sn of state.scienceNodes) {
    const snElev = getSurfaceElevation(sn.x, sn.y);
    if (!sn.scanned && Math.abs(rvElev - snElev) <= 0.45 && Math.hypot(rv.x - sn.x, rv.y - sn.y) < 68) {
      sn.scanned = true;
      state.score += sn.pts;
      state.telemetry.science += 25;
      addFloatText(sn.x - state.lunarCam.x, sn.y - snElev * ELEV_LIFT_PX - state.lunarCam.y - 45, `${rv.id} SCANNED ${sn.name.toUpperCase()}! +${sn.pts}⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `${rv.id} scanned ${sn.name} (+25 science).`, 'good');
      playTone(720, 'triangle', 0.16, 0.12);
      updateBottomHUD();
      return;
    }
  }

  const padElev = getSurfaceElevation(state.lander.padX, state.lander.padY);
  const nearPad = Math.abs(rvElev - padElev) <= 0.45 && Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) < 125;

  if (
    state.lander.hardLandingPenalty &&
    !state.lander.shockRepaired &&
    !state.rover.hasSample &&
    !state.rover2.hasSample &&
    nearPad
  ) {
    state.lander.shockRepaired = true;
    state.rover.battery = state.rover.maxBattery;
    state.rover2.battery = state.rover2.maxBattery;
    state.score += 40;
    addFloatText(state.lander.padX - state.lunarCam.x, state.lander.padY - padElev * ELEV_LIFT_PX - state.lunarCam.y - 95, '🔧 SHOCK DAMAGE REPAIRED! FULL ROVER BATTERY +40⭐', '#4ade80');
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
    addFloatText(rv.x - state.lunarCam.x, rv.y - rvElev * ELEV_LIFT_PX - state.lunarCam.y - 45, '🤝 TETHER CHARGE SHARE +15⭐', '#38bdf8');
    playTone(600, 'sine', 0.12, 0.08);
    updateBottomHUD();
    return;
  }

  const r1AtPad = state.rover.hasSample && Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 115;
  const r2AtPad = state.rover2.hasSample && Math.hypot(state.rover2.x - state.lander.padX, state.rover2.y - state.lander.padY) < 115;
  const hasUnstowedAtPad = (r1AtPad && !state.rover.sampleStowed) || (r2AtPad && !state.rover2.sampleStowed);

  if (hasUnstowedAtPad && Math.abs(rvElev - padElev) <= 0.45 && Math.hypot(rv.x - state.lander.padX, rv.y - state.lander.padY) < 105) {
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
        state.lander.padY - padElev * ELEV_LIFT_PX - state.lunarCam.y - 125,
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
        state.lander.padY - padElev * ELEV_LIFT_PX - state.lunarCam.y - 145,
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

function canRoverMoveTo(fromElev, fromZ, toX, toY) {
  if (fromZ < 14) {
    for (const b of state.lunarBoulders) {
      const bElev = getSurfaceElevation(b.x, b.y);
      if (Math.abs(bElev - fromElev) <= 0.45 && Math.hypot(toX - b.x, (toY - b.y) * 1.6) < b.r + 17) {
        return { ok: false, reason: 'BOULDER' };
      }
    }
  }
  const toTerrain = getTerrainInfo(toX, toY);
  if (toTerrain.elev - fromElev > 0.35 && fromZ < 18) {
    return { ok: false, reason: 'CLIFF_WALL', toTerrain };
  }
  return { ok: true, toTerrain };
}

function applyRoverVerticalAndDropPhysics(rv, prevElev, newElev, hasCushionInput, dt) {
  if (newElev - prevElev > 0.35) {
    const liftPx = (newElev - prevElev) * ELEV_LIFT_PX;
    rv.z = Math.max(2, rv.z - liftPx);
  } else if (prevElev - newElev > 0.35) {
    const dropPx = (prevElev - newElev) * ELEV_LIFT_PX;
    rv.z += dropPx;
    if (prevElev >= 0.75 && newElev <= 0.25) {
      rv.highCliffDrop = true;
    }
  }
  rv.groundElev = newElev;

  if (rv.z > 0 && rv.highCliffDrop && hasCushionInput && rv.battery > 0.5) {
    rv.rcsHopping = true;
    if (rv.vz < -75) {
      rv.vz += 210 * dt;
    }
    rv.battery = Math.max(0, rv.battery - dt * 1.8);
  }

  if (rv.z > 0 || rv.vz > 0) {
    rv.vz -= 290 * dt;
    rv.z += rv.vz * dt;
    if (rv.z <= 0) {
      rv.z = 0;
      rv.vz = 0;
      if (rv.highCliffDrop) {
        rv.highCliffDrop = false;
        const cushioned = Boolean(hasCushionInput && rv.battery > 0.5);
        const visualY = rv.y - newElev * ELEV_LIFT_PX;
        if (cushioned) {
          addFloatText(rv.x - state.lunarCam.x, visualY - state.lunarCam.y - 44, 'RCS CUSHIONED LANDING!', '#38bdf8');
          playTone(340, 'sine', 0.1, 0.06);
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            state.lunarParticles.push({
              x: rv.x, y: visualY,
              vx: Math.cos(ang) * 55, vy: Math.sin(ang) * 25,
              life: 0.35, size: 3.5, color: '#38bdf8'
            });
          }
        } else {
          rv.battery = Math.max(0, rv.battery - 12);
          state.screenShake = Math.max(state.screenShake, 0.22);
          playTone(120, 'sawtooth', 0.2, 0.11);
          addFloatText(rv.x - state.lunarCam.x, visualY - state.lunarCam.y - 46, '-12Wh HIGH CLIFF SHOCK! (HOLD SHIFT)', '#f87171');
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            state.lunarParticles.push({
              x: rv.x, y: visualY,
              vx: Math.cos(ang) * 75, vy: Math.sin(ang) * 35 - 12,
              life: 0.45, size: 4, color: '#cbd5e1'
            });
          }
        }
      }
    }
  }
}

function updateSingleRover(rv, input, targetCrater, dt) {
  if (!rv || rv.boarded) return;
  rv.cliffWarnCd = Math.max(0, (rv.cliffWarnCd || 0) - dt);

  const prevTerrain = getTerrainInfo(rv.x, rv.y);
  const prevElev = rv.groundElev ?? prevTerrain.elev;
  const other = rv === state.rover ? state.rover2 : state.rover;
  const tethered = other && !other.boarded && state.coopMode !== 'SOLO' && Math.hypot(rv.x - other.x, rv.y - other.y) < 130;
  const coopMult = tethered ? 2.0 : 1.0;

  const tcElev = targetCrater ? getSurfaceElevation(targetCrater.x, targetCrater.y) : 0;
  const atCrater = targetCrater && Math.abs(prevElev - tcElev) <= 0.45 && Math.hypot(rv.x - targetCrater.x, rv.y - targetCrater.y) < 92;
  const nearEva = state.evaTasks.find(t => {
    if (t.done) return false;
    const tElev = getSurfaceElevation(t.x, t.y);
    return Math.abs(prevElev - tElev) <= 0.45 && Math.hypot(rv.x - t.x, rv.y - t.y) < 74;
  });

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
      const evElev = getSurfaceElevation(nearEva.x, nearEva.y);
      addFloatText(nearEva.x - state.lunarCam.x, nearEva.y - evElev * ELEV_LIFT_PX - state.lunarCam.y - 45, `${nearEva.name.toUpperCase()} ONLINE! +${nearEva.pts}⭐`, '#4ade80');
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
        y: rv.y - prevElev * ELEV_LIFT_PX,
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
      addFloatText(rv.x - state.lunarCam.x, rv.y - prevElev * ELEV_LIFT_PX - state.lunarCam.y - 62, `${rv.id} EXTRACTED ${flavor.shortLabel.toUpperCase()}! +150⭐`, '#4ade80');
      showMissionToast(`${flavor.shortLabel} Extracted`, `${rv.id}: ${flavor.yieldText} (+${Math.round(45 * sciMul)} Science). Return to Lander!`);
      logBlackBox('STAGE 3B', `${rv.id} drilled ${flavor.shortLabel} at Point B Crater (${flavor.yieldText}).`, 'good');
      playSuccessChord();
    }
  } else {
    rv.drilling = false;
    rv.armAnim = Math.max(0, rv.armAnim - dt * 3);

    const baseMaxSpd = rv.battery > 0 ? 255 : 145;
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

      let uphillRamp = false;
      if (prevTerrain.ramp) {
        const climbSign = Math.sign(prevTerrain.ramp.toElev - prevTerrain.ramp.fromElev);
        const climbDot = prevTerrain.ramp.dir === 'x' ? mx * climbSign : my * climbSign;
        if (climbDot > 0.15) uphillRamp = true;
      }

      const maxSpd = uphillRamp ? baseMaxSpd * 0.8 : baseMaxSpd;
      rv.vx += mx * 720 * dt;
      rv.vy += my * 580 * dt;
      const spd = Math.hypot(rv.vx, rv.vy);
      if (spd > maxSpd) {
        rv.vx = (rv.vx / spd) * maxSpd;
        rv.vy = (rv.vy / spd) * maxSpd;
      }

      const shadowMul = prevElev <= -0.85 ? 1.4 : 1.0;
      const slopeMul = uphillRamp ? 1.35 : 1.0;
      rv.battery = Math.max(0, rv.battery - dt * 1.6 * shadowMul * slopeMul);

      rv.trackCd = (rv.trackCd || 0) - dt;
      if (rv.z === 0 && rv.trackCd <= 0) {
        rv.trackCd = 0.08;
        state.roverTracks.push({
          x: rv.x,
          y: rv.y + 8 - prevElev * ELEV_LIFT_PX,
          angle: Math.atan2(my, mx),
          elev: prevElev
        });
        if (state.roverTracks.length > 220) state.roverTracks.shift();
      }
      if (rv.z === 0 && Math.random() < 0.32) {
        state.lunarParticles.push({
          x: rv.x - mx * 20,
          y: rv.y - my * 10 - prevElev * ELEV_LIFT_PX,
          vx: -mx * 35 + (Math.random() - 0.5) * 20,
          vy: -my * 20 - 10,
          life: 0.38,
          size: 3,
          color: prevElev <= -0.85 ? '#64748b' : '#94a3b8'
        });
      }
    } else {
      const damp = Math.pow(0.03, dt);
      rv.vx *= damp;
      rv.vy *= damp;
      if (Math.hypot(rv.vx, rv.vy) < 4) {
        rv.vx = 0;
        rv.vy = 0;
      }
      const rechargeRate = prevElev >= 0.85 ? 4.5 : prevElev <= -0.85 ? 1.2 : 3.0;
      rv.battery = Math.min(rv.maxBattery, rv.battery + dt * rechargeRate);
    }

    rv.rcsHopping = input.hop;
    if (rv.rcsHopping && rv.z === 0 && rv.battery > 2) {
      rv.vz = 165;
      rv.battery = Math.max(0, rv.battery - 3.0);
      playTone(260, 'sine', 0.14, 0.08);
    }
  }

  const candX = Math.max(90, Math.min(LUNAR_W - 90, rv.x + rv.vx * dt));
  const candY = Math.max(295, Math.min(LUNAR_H - 70, rv.y + rv.vy * dt));

  let nextX = candX;
  let nextY = candY;
  const checkBoth = canRoverMoveTo(prevElev, rv.z, candX, candY);
  if (!checkBoth.ok) {
    const checkX = canRoverMoveTo(prevElev, rv.z, candX, rv.y);
    const checkY = canRoverMoveTo(prevElev, rv.z, rv.x, candY);
    if (checkX.ok) {
      nextX = candX;
      nextY = rv.y;
      rv.vy *= 0.15;
    } else if (checkY.ok) {
      nextX = rv.x;
      nextY = candY;
      rv.vx *= 0.15;
    } else {
      nextX = rv.x;
      nextY = rv.y;
      rv.vx *= -0.25;
      rv.vy *= -0.25;
    }
    if (checkBoth.reason === 'CLIFF_WALL' && rv.cliffWarnCd <= 0) {
      rv.cliffWarnCd = 1.6;
      addFloatText(
        rv.x - state.lunarCam.x,
        rv.y - prevElev * ELEV_LIFT_PX - state.lunarCam.y - 46,
        'CLIFF WALL! USE RAMP OR [SHIFT] HOP',
        '#fbbf24'
      );
    }
  }

  rv.x = nextX;
  rv.y = nextY;
  rv.wheelSpin += Math.hypot(rv.vx, rv.vy) * dt * 0.08;

  const newElev = getSurfaceElevation(nextX, nextY);
  applyRoverVerticalAndDropPhysics(rv, prevElev, newElev, Boolean(input.hop), dt);
}

function getAIRampWaypoint(rv, currTerrain, goalX, goalY) {
  const goalTerrain = getTerrainInfo(goalX, goalY);
  const ramps = state.lunarCliffs?.ramps || [];

  if (currTerrain.ramp) {
    const eps = getRampEndpoints(currTerrain.ramp);
    if (goalTerrain.cliff && goalTerrain.cliff.id === currTerrain.ramp.cliffId) {
      return eps.cliffEnd;
    }
    if (Math.abs(currTerrain.elev - goalTerrain.elev) >= 0.35) {
      return eps.plainEnd;
    }
  }

  if (Math.abs(currTerrain.elev - goalTerrain.elev) < 0.5) {
    return { x: goalX, y: goalY };
  }

  if (currTerrain.cliff && Math.abs(currTerrain.elev) >= 0.85) {
    const cliffRamps = ramps.filter(r => r.cliffId === currTerrain.cliff.id);
    if (cliffRamps.length > 0) {
      let bestEps = null;
      let bestScore = Infinity;
      for (const r of cliffRamps) {
        const eps = getRampEndpoints(r);
        const score = Math.hypot(eps.cliffEnd.x - rv.x, eps.cliffEnd.y - rv.y) +
          Math.hypot(goalX - eps.plainEnd.x, goalY - eps.plainEnd.y) * 0.6;
        if (score < bestScore) {
          bestScore = score;
          bestEps = eps;
        }
      }
      if (bestEps) {
        if (Math.hypot(bestEps.cliffEnd.x - rv.x, bestEps.cliffEnd.y - rv.y) <= 16) {
          return bestEps.plainEnd;
        }
        return bestEps.cliffEnd;
      }
    }
  }

  if (goalTerrain.cliff && Math.abs(goalTerrain.elev) >= 0.85) {
    const cliffRamps = ramps.filter(r => r.cliffId === goalTerrain.cliff.id);
    if (cliffRamps.length > 0) {
      let bestEps = null;
      let bestScore = Infinity;
      for (const r of cliffRamps) {
        const eps = getRampEndpoints(r);
        const score = Math.hypot(eps.plainEnd.x - rv.x, eps.plainEnd.y - rv.y) +
          Math.hypot(goalX - eps.cliffEnd.x, goalY - eps.cliffEnd.y) * 0.6;
        if (score < bestScore) {
          bestScore = score;
          bestEps = eps;
        }
      }
      if (bestEps) {
        if (Math.hypot(bestEps.plainEnd.x - rv.x, bestEps.plainEnd.y - rv.y) <= 16) {
          return bestEps.cliffEnd;
        }
        return bestEps.plainEnd;
      }
    }
  }

  return { x: goalX, y: goalY };
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

  const currTerrain = getTerrainInfo(rv.x, rv.y);
  const prevElev = rv.groundElev ?? currTerrain.elev;
  const wp = getAIRampWaypoint(rv, currTerrain, goalX, goalY);
  const dx = wp.x - rv.x, dy = wp.y - rv.y;
  const d = Math.hypot(dx, dy);
  const goalDist = Math.hypot(goalX - rv.x, goalY - rv.y);
  const goalElev = getSurfaceElevation(goalX, goalY);
  const sameElevAsGoal = Math.abs(prevElev - goalElev) <= 0.45;

  if (goalDist > 26 && d > 8) {
    const nx = dx / d, ny = dy / d;
    rv.facingX = nx; rv.facingY = ny;
    const uphill = currTerrain.ramp && (
      (currTerrain.ramp.dir === 'x' ? nx : ny) * Math.sign(currTerrain.ramp.toElev - currTerrain.ramp.fromElev) > 0.15
    );
    const spdMul = uphill ? 0.8 : 1.0;
    const candX = Math.max(90, Math.min(LUNAR_W - 90, rv.x + nx * 145 * spdMul * dt));
    const candY = Math.max(295, Math.min(LUNAR_H - 70, rv.y + ny * 115 * spdMul * dt));
    const moveCheck = canRoverMoveTo(prevElev, rv.z, candX, candY);

    if (moveCheck.ok) {
      rv.x = candX;
      rv.y = candY;
    } else if (moveCheck.reason === 'CLIFF_WALL' && rv.z === 0) {
      rv.vz = 165;
      rv.rcsHopping = true;
    } else {
      const slideX = canRoverMoveTo(prevElev, rv.z, candX, rv.y);
      const slideY = canRoverMoveTo(prevElev, rv.z, rv.x, candY);
      if (slideX.ok) rv.x = candX;
      else if (slideY.ok) rv.y = candY;
    }

    rv.wheelSpin += 145 * spdMul * dt * 0.08;
    rv.trackCd = (rv.trackCd || 0) - dt;
    if (rv.z === 0 && rv.trackCd <= 0) {
      rv.trackCd = 0.1;
      state.roverTracks.push({
        x: rv.x,
        y: rv.y + 8 - prevElev * ELEV_LIFT_PX,
        angle: Math.atan2(ny, nx),
        elev: prevElev
      });
      if (state.roverTracks.length > 140) state.roverTracks.shift();
    }
    for (const b of state.lunarBoulders) {
      const bElev = getSurfaceElevation(b.x, b.y);
      if (rv.z === 0 && Math.abs(bElev - prevElev) <= 0.45 && Math.hypot(rv.x - b.x, rv.y - b.y) < b.r + 24) {
        rv.vz = 145;
      }
    }
  } else if (sameElevAsGoal && unscanned && !unscanned.scanned && goalDist <= 34) {
    unscanned.scanned = true;
    state.score += unscanned.pts;
    state.telemetry.science += 25;
    addFloatText(unscanned.x - state.lunarCam.x, unscanned.y - prevElev * ELEV_LIFT_PX - state.lunarCam.y - 45, `LTV-2 SCANNED ${unscanned.name.toUpperCase()}! +${unscanned.pts}⭐`, '#38bdf8');
  } else if (sameElevAsGoal && nextEva && !nextEva.done && Math.hypot(rv.x - nextEva.x, rv.y - nextEva.y) < 60) {
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
      addFloatText(nextEva.x - state.lunarCam.x, nextEva.y - prevElev * ELEV_LIFT_PX - state.lunarCam.y - 45, `LTV-2 DEPLOYED ${nextEva.name.toUpperCase()}! +${nextEva.pts}⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `LTV-2 deployed ${nextEva.name}.`, 'good');
    }
  } else if (sameElevAsGoal && !rv.hasSample && Math.hypot(rv.x - targetCrater.x, rv.y - targetCrater.y) < 75) {
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
      addFloatText(rv.x - state.lunarCam.x, rv.y - prevElev * ELEV_LIFT_PX - state.lunarCam.y - 55, `LTV-2 COLLECTED ${flavor.shortLabel.toUpperCase()}! +140⭐`, '#38bdf8');
      logBlackBox('STAGE 3B', `LTV-2 collected backup ${flavor.shortLabel} (${flavor.yieldText}).`, 'good');
    }
  }

  const newElev = getSurfaceElevation(rv.x, rv.y);
  applyRoverVerticalAndDropPhysics(rv, prevElev, newElev, true, dt);
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
    hop: state.keys['ShiftLeft'] || (state.coopMode !== 'LOCAL_2P' && state.keys['ShiftRight']),
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
    const r1Elev = state.rover.groundElev ?? getSurfaceElevation(state.rover.x, state.rover.y);
    for (const sn of state.scienceNodes) {
      const snElev = getSurfaceElevation(sn.x, sn.y);
      if (!sn.scanned && Math.abs(r1Elev - snElev) <= 0.45 && Math.hypot(state.rover.x - sn.x, state.rover.y - sn.y) < 58) {
        sn.scanned = true;
        state.score += sn.pts;
        state.telemetry.science += 25;
        addFloatText(sn.x - state.lunarCam.x, sn.y - snElev * ELEV_LIFT_PX - state.lunarCam.y - 45, `P3 LIDAR SCANNED ${sn.name.toUpperCase()}! +${sn.pts}⭐`, '#e9d5ff');
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

  // Far mountain & stepped highland mesa silhouette
  ctx.fillStyle = '#161e30';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= LOGICAL_W; x += 28) {
    const wx = x + cx * 0.22;
    const mesa = Math.sin(wx * 0.0042) > 0.35 ? 12 : 0;
    ctx.lineTo(x, horizonY - 28 - mesa - Math.sin(wx * 0.0065) * 16 - Math.cos(wx * 0.014) * 9);
  }
  ctx.lineTo(LOGICAL_W, horizonY);
  ctx.closePath();
  ctx.fill();

  // Foreground Moon cliff ridge locked to horizonY with faceted sunlit rock crest
  ctx.fillStyle = '#232e44';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= LOGICAL_W + 18; x += 18) {
    const wx = x + cx * 0.42;
    const ridgePeak =
      Math.abs(Math.sin(wx * 0.0068 + 1.1)) * 18 +
      Math.sin(wx * 0.021) * 7 +
      Math.cos(wx * 0.049) * 3.5;
    ctx.lineTo(x, horizonY - 11 - ridgePeak);
  }
  ctx.lineTo(LOGICAL_W, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
  ctx.lineWidth = 1.6;
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

function drawSingleCrater(ctx, cr, offsetY = 0) {
  const cy = cr.y + offsetY;
  if (cr.isTarget) {
    // Soft regolith ejecta blanket around Point B crater
    ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.beginPath();
    ctx.ellipse(cr.x, cy, cr.rx + 16, cr.ry + 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Raised outer crater rim slope
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cr.x, cy, cr.rx + 6, cr.ry + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Deep shaded crater depression
    const basinGrad = ctx.createLinearGradient(cr.x, cy - cr.ry, cr.x, cy + cr.ry);
    basinGrad.addColorStop(0, '#0b1120');
    basinGrad.addColorStop(0.58, '#172033');
    basinGrad.addColorStop(1, '#263246');
    ctx.fillStyle = basinGrad;
    ctx.beginPath();
    ctx.ellipse(cr.x, cy + 1, cr.rx - 4, cr.ry - 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner geological terraced ledge & subtle amber survey marker
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.ellipse(cr.x, cy + 2, cr.rx * 0.72, cr.ry * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Shadowed northern cliff overhang arc
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(cr.x, cy + 2, cr.rx - 5, cr.ry - 4, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POINT B: TARGET CRATER', cr.x, cy + cr.ry + 20);
    return;
  }

  // Outer raised rim highlight + sunken basin
  ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cr.x, cy, cr.rx + 7, cr.ry + 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#273246';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cr.x, cy, cr.rx, cr.ry, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Interior crater wall shading (sunlit far rim, shadowed near wall)
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cr.x, cy + 4, cr.rx * 0.85, cr.ry * 0.78, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

const CLIFF_GEOM_CACHE = new WeakMap();
const LUNAR_SUN_DIR = { x: -0.76, y: -0.65 };

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sampleRoundedRectPerimeter(rect, stepPx = 24) {
  const { x1, y1, x2, y2 } = rect;
  const r = Math.max(2, Math.min(rect.r || 12, (x2 - x1) * 0.45, (y2 - y1) * 0.45));
  const out = [];

  const pushLine = (ax, ay, bx, by, nx, ny) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / stepPx));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx, ny });
    }
  };

  const pushArc = (cx, cy, startAng, endAng) => {
    const arcLen = Math.abs(endAng - startAng) * r;
    const n = Math.max(2, Math.round(arcLen / Math.max(14, stepPx * 0.8)));
    for (let i = 0; i < n; i++) {
      const ang = startAng + (endAng - startAng) * (i / n);
      out.push({
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        nx: Math.cos(ang),
        ny: Math.sin(ang)
      });
    }
  };

  // Clockwise perimeter starting at top-left straight edge
  pushLine(x1 + r, y1, x2 - r, y1, 0, -1);
  pushArc(x2 - r, y1 + r, -Math.PI * 0.5, 0);
  pushLine(x2, y1 + r, x2, y2 - r, 1, 0);
  pushArc(x2 - r, y2 - r, 0, Math.PI * 0.5);
  pushLine(x2 - r, y2, x1 + r, y2, 0, 1);
  pushArc(x1 + r, y2 - r, Math.PI * 0.5, Math.PI);
  pushLine(x1, y2 - r, x1, y1 + r, -1, 0);
  pushArc(x1 + r, y1 + r, Math.PI, Math.PI * 1.5);
  return out;
}

function isNearFeatureRect(x, y, rects, pad = 16) {
  for (const r of rects || []) {
    if (x >= r.x1 - pad && x <= r.x2 + pad && y >= r.y1 - pad && y <= r.y2 + pad) {
      return true;
    }
  }
  return false;
}

function makeBoulderPoly(cx, cy, rx, ry, rot, rng) {
  const count = 6 + Math.floor(rng() * 3);
  const pts = [];
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const rad = 0.72 + rng() * 0.42;
    const lx = Math.cos(ang) * rx * rad;
    const ly = Math.sin(ang) * ry * rad;
    pts.push({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR
    });
  }
  return pts;
}

function getCliffGeometry(cliff, ramps = [], isBasin = false) {
  let cached = CLIFF_GEOM_CACHE.get(cliff);
  if (cached) return cached;

  const seed = hashString(String(cliff.id || `${cliff.x1}_${cliff.y1}_${cliff.x2}_${cliff.y2}`));
  const rng = makeSeededRng(seed);
  const rawPts = sampleRoundedRectPerimeter(cliff, isBasin ? 26 : 24);
  const ledges = cliff.ledges || [];
  const cx = (cliff.x1 + cliff.x2) * 0.5;
  const cy = (cliff.y1 + cliff.y2) * 0.5;
  const jagAmp = isBasin ? 13 : 15;

  const pts = rawPts.map((pt, idx) => {
    const nearRamp = isNearFeatureRect(pt.x, pt.y, ramps, 18);
    const nearLedge = isNearFeatureRect(pt.x, pt.y, ledges, 14);
    const quiet = nearRamp || nearLedge;
    const amp = quiet ? 0.18 : 1.0;
    const zig = (idx % 2 === 0 ? 1 : -0.75) * (0.35 + rng() * 0.65);
    const nOff = (zig * jagAmp * 0.55 + (rng() - 0.5) * jagAmp * 0.45) * amp;
    const tx = -pt.ny;
    const ty = pt.nx;
    const tOff = (rng() - 0.5) * 8 * amp;

    const x = pt.x + pt.nx * nOff + tx * tOff;
    const y = pt.y + pt.ny * nOff + ty * tOff;
    const flare = quiet ? 0 : (4.5 + rng() * 5.5);
    const baseX = x + pt.nx * flare;
    const baseY = y + pt.ny * flare * 0.42;
    const floorX = x + (cx - x) * 0.032;
    const floorY = y + (cy - y) * 0.018;

    return {
      x,
      y,
      nx: pt.nx,
      ny: pt.ny,
      baseX,
      baseY,
      floorX,
      floorY,
      nearRamp,
      nearLedge,
      strataShift: (rng() - 0.5) * 4.5,
      apronDist: quiet ? 4 : (10 + rng() * 11)
    };
  });

  // Scree & weathered talus boulders along visible cliff foot / basin rim
  const scree = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.nearRamp || p.nearLedge) continue;
    if (!isBasin && p.ny < -0.25) continue;
    const count = rng() < 0.72 ? 1 + Math.floor(rng() * 2) : 0;
    for (let k = 0; k < count; k++) {
      const dist = isBasin ? (4 + rng() * 14) : (2 + rng() * 11);
      const sx = (isBasin ? p.x : p.baseX) + p.nx * dist + (rng() - 0.5) * 14;
      const sy = (isBasin ? p.y : p.baseY) + p.ny * dist * 0.55 + (rng() - 0.5) * 7;
      if (isNearFeatureRect(sx, sy, ramps, 16) || isNearFeatureRect(sx, sy, ledges, 12)) continue;
      const rx = 4 + rng() * 6.5;
      const ry = rx * (0.48 + rng() * 0.28);
      scree.push({
        x: sx,
        y: sy,
        rx,
        ry,
        rot: (rng() - 0.5) * 0.7,
        shade: rng(),
        poly: makeBoulderPoly(sx, sy, rx, ry, (rng() - 0.5) * 0.7, rng)
      });
    }
  }

  // Interior geological ridges / fractures
  const ridges = [];
  const w = cliff.x2 - cliff.x1;
  const h = cliff.y2 - cliff.y1;
  const ridgeCount = isBasin ? 4 : 5;
  for (let i = 0; i < ridgeCount; i++) {
    const rx0 = cliff.x1 + w * (0.16 + rng() * 0.52);
    const ry0 = cliff.y1 + h * (0.18 + rng() * 0.64);
    const segs = [{ x: rx0, y: ry0 }];
    let curX = rx0;
    let curY = ry0;
    const steps = 3 + Math.floor(rng() * 3);
    const dir = rng() < 0.5 ? 1 : -1;
    for (let s = 0; s < steps; s++) {
      curX += (24 + rng() * 34) * dir;
      curY += (rng() - 0.45) * 22;
      segs.push({ x: curX, y: curY });
    }
    ridges.push(segs);
  }

  // Non-verbal subtle visual cues: solar glints on sunlit plateaus, ice crystals in shadowed basins
  const glints = [];
  if (!isBasin) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const sunDot = p.nx * LUNAR_SUN_DIR.x + p.ny * LUNAR_SUN_DIR.y;
      if (sunDot > 0.15 && !p.nearRamp && rng() < 0.42) {
        glints.push({
          x: p.x - p.nx * (6 + rng() * 14),
          y: p.y - p.ny * (4 + rng() * 10),
          r: 1.8 + rng() * 1.6,
          phase: rng() * Math.PI * 2
        });
      }
    }
    for (let i = 0; i < 4; i++) {
      glints.push({
        x: cliff.x1 + w * (0.15 + rng() * 0.5),
        y: cliff.y1 + h * (0.15 + rng() * 0.45),
        r: 1.7 + rng() * 1.4,
        phase: rng() * Math.PI * 2
      });
    }
  } else {
    const iceCount = cliff.id === 'low_ice' ? 14 : 7;
    for (let i = 0; i < iceCount; i++) {
      glints.push({
        x: cliff.x1 + 32 + rng() * Math.max(40, w - 64),
        y: cliff.y1 + 36 + rng() * Math.max(40, h - 72),
        size: 3.5 + rng() * 4.5,
        rot: (rng() - 0.5) * 0.8,
        phase: rng() * Math.PI * 2
      });
    }
  }

  cached = { pts, scree, ridges, glints };
  CLIFF_GEOM_CACHE.set(cliff, cached);
  return cached;
}

function getLedgeGeometry(ledge) {
  let cached = CLIFF_GEOM_CACHE.get(ledge);
  if (cached) return cached;
  const rng = makeSeededRng(hashString(`ledge_${ledge.x1}_${ledge.y1}_${ledge.x2}_${ledge.y2}`));
  const raw = sampleRoundedRectPerimeter(ledge, 15);
  const pts = raw.map((pt, idx) => {
    const nOff = pt.ny < -0.35 ? 0 : ((idx % 2 === 0 ? 1 : -0.8) * (2.5 + rng() * 3.5));
    const x = pt.x + pt.nx * nOff;
    const y = pt.y + pt.ny * nOff;
    return {
      x,
      y,
      nx: pt.nx,
      ny: pt.ny,
      baseX: x + pt.nx * 3.5,
      baseY: y + pt.ny * 1.8
    };
  });
  const scree = [];
  for (const p of pts) {
    if (p.ny < 0.25 || rng() > 0.5) continue;
    const sx = p.baseX + (rng() - 0.5) * 8;
    const sy = p.baseY + rng() * 5;
    const rx = 3 + rng() * 3.5;
    const ry = rx * 0.55;
    scree.push({
      x: sx,
      y: sy,
      rx,
      ry,
      shade: rng(),
      poly: makeBoulderPoly(sx, sy, rx, ry, (rng() - 0.5) * 0.6, rng)
    });
  }
  cached = { pts, scree };
  CLIFF_GEOM_CACHE.set(ledge, cached);
  return cached;
}

function tracePoly(ctx, pts, dx = 0, dy = 0, scaleX = 1, scaleY = 1, useBase = false) {
  if (!pts || pts.length === 0) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const px = (useBase ? pts[i].baseX : pts[i].x) * scaleX + dx;
    const py = (useBase ? pts[i].baseY : pts[i].y) * scaleY + dy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawFacetedRockBoulders(ctx, stones, offsetY = 0) {
  for (const st of stones) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.36)';
    ctx.beginPath();
    ctx.ellipse(st.x + 2.5, st.y + offsetY + 1.5, st.rx * 1.15, st.ry * 0.65, st.rot || 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = st.shade > 0.5 ? '#475569' : '#334155';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    tracePoly(ctx, st.poly, 0, offsetY);
    ctx.fill();
    ctx.stroke();

    // Sunlit upper-left facet highlight
    if (st.poly.length >= 4) {
      ctx.fillStyle = 'rgba(203, 213, 225, 0.22)';
      ctx.beginPath();
      ctx.moveTo(st.x, st.y + offsetY);
      ctx.lineTo(st.poly[2].x, st.poly[2].y + offsetY);
      ctx.lineTo(st.poly[3].x, st.poly[3].y + offsetY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawCliffRamp(ctx, ramp) {
  const offFrom = -ramp.fromElev * ELEV_LIFT_PX;
  const offTo = -ramp.toElev * ELEV_LIFT_PX;
  const isBasinRamp = ramp.fromElev < 0 || ramp.toElev < 0;
  const rng = makeSeededRng(hashString(String(ramp.id || `${ramp.x1}_${ramp.y1}`)));

  ctx.save();
  if (ramp.dir === 'x') {
    const p1 = { x: ramp.x1, y: ramp.y1 + offFrom };
    const p2 = { x: ramp.x2, y: ramp.y1 + offTo };
    const p3 = { x: ramp.x2, y: ramp.y2 + offTo };
    const p4 = { x: ramp.x1, y: ramp.y2 + offFrom };

    // Soft regolith shoulder shadow & embankment
    ctx.fillStyle = 'rgba(2, 6, 23, 0.32)';
    ctx.beginPath();
    ctx.moveTo(p1.x - 4, p1.y - 3);
    ctx.lineTo(p2.x + 4, p2.y - 3);
    ctx.lineTo(p3.x + 6, Math.max(p3.y, ramp.y2) + 8);
    ctx.lineTo(p4.x - 6, Math.max(p4.y, ramp.y2) + 8);
    ctx.closePath();
    ctx.fill();

    if (!isBasinRamp) {
      // Raised basalt embankment skirt under the southern side of plateau ramp
      const skirtSegs = 5;
      for (let i = 0; i < skirtSegs; i++) {
        const t0 = i / skirtSegs;
        const t1 = (i + 1) / skirtSegs;
        const tx0 = p4.x + (p3.x - p4.x) * t0;
        const ty0 = p4.y + (p3.y - p4.y) * t0;
        const tx1 = p4.x + (p3.x - p4.x) * t1;
        const ty1 = p4.y + (p3.y - p4.y) * t1;
        const bx0 = tx0;
        const by0 = ramp.y2 + 5 + (rng() - 0.5) * 2.5;
        const bx1 = tx1;
        const by1 = ramp.y2 + 5 + (rng() - 0.5) * 2.5;

        ctx.fillStyle = i % 2 === 0 ? '#273449' : '#1b2638';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx0, ty0);
        ctx.lineTo(tx1, ty1);
        ctx.lineTo(bx1, by1);
        ctx.lineTo(bx0, by0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Basalt strata crease
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.beginPath();
        ctx.moveTo(tx0, (ty0 + by0) * 0.5);
        ctx.lineTo(tx1, (ty1 + by1) * 0.5);
        ctx.stroke();
      }
    } else {
      // Basin cut-bank shadow along north wall where ramp descends into pit
      ctx.fillStyle = '#0b1120';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - 5);
      ctx.lineTo(p2.x, p2.y - 4);
      ctx.lineTo(p2.x, p2.y + 4);
      ctx.lineTo(p1.x, p1.y + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Graded lunar regolith causeway surface
    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    const highCol = '#58677d';
    const plainCol = '#3b495e';
    const lowCol = '#1c273b';
    grad.addColorStop(0, ramp.fromElev > 0 ? highCol : ramp.fromElev < 0 ? lowCol : plainCol);
    grad.addColorStop(1, ramp.toElev > 0 ? highCol : ramp.toElev < 0 ? lowCol : plainCol);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y + 1);
    ctx.lineTo(p2.x, p2.y + 1);
    ctx.lineTo(p3.x, p3.y - 1);
    ctx.lineTo(p4.x, p4.y - 1);
    ctx.closePath();
    ctx.fill();

    // Subtle sunlit upper shoulder & shadowed lower shoulder
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y + 1);
    ctx.lineTo(p2.x, p2.y + 1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y - 1);
    ctx.lineTo(p3.x, p3.y - 1);
    ctx.stroke();

    // Compacted dual rover wheel ruts along the causeway
    const spanY = ramp.y2 - ramp.y1;
    for (const yFrac of [0.3, 0.7]) {
      const sy = ramp.y1 + spanY * yFrac;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ramp.x1 + 5, sy + offFrom);
      ctx.lineTo(ramp.x2 - 5, sy + offTo);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(203, 213, 225, 0.14)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ramp.x1 + 6, sy + offFrom - 2.5);
      ctx.lineTo(ramp.x2 - 6, sy + offTo - 2.5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Subtle embossed chevron track marks pressed into regolith dust
    const climbDir = ramp.toElev > ramp.fromElev ? 1 : -1;
    for (const frac of [0.26, 0.5, 0.74]) {
      const cx = ramp.x1 + (ramp.x2 - ramp.x1) * frac;
      const cy = (ramp.y1 + ramp.y2) * 0.5 + offFrom + (offTo - offFrom) * frac;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 4 * climbDir, cy - 5.5);
      ctx.lineTo(cx + 4 * climbDir, cy + 0.5);
      ctx.lineTo(cx - 4 * climbDir, cy + 6.5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4 * climbDir, cy - 6.5);
      ctx.lineTo(cx + 4 * climbDir, cy - 0.5);
      ctx.lineTo(cx - 4 * climbDir, cy + 5.5);
      ctx.stroke();
    }

    // Weathered guide boulders flanking top & bottom shoulders
    const guideBoulders = [];
    for (const frac of [0.16, 0.48, 0.82]) {
      const bx = ramp.x1 + (ramp.x2 - ramp.x1) * frac;
      const yOff = offFrom + (offTo - offFrom) * frac;
      for (const sideY of [ramp.y1 - 2, ramp.y2 + 2]) {
        const rx = 4.2 + rng() * 3.2;
        const ry = rx * 0.58;
        const gy = sideY + yOff;
        guideBoulders.push({
          x: bx, y: gy, rx, ry, rot: (rng() - 0.5) * 0.6, shade: rng(),
          poly: makeBoulderPoly(bx, gy, rx, ry, (rng() - 0.5) * 0.6, rng)
        });
      }
    }
    drawFacetedRockBoulders(ctx, guideBoulders);
  } else {
    const p1 = { x: ramp.x1, y: ramp.y1 + offFrom };
    const p2 = { x: ramp.x2, y: ramp.y1 + offFrom };
    const p3 = { x: ramp.x2, y: ramp.y2 + offTo };
    const p4 = { x: ramp.x1, y: ramp.y2 + offTo };

    // Soft side berm shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.34)';
    ctx.beginPath();
    ctx.moveTo(p1.x - 5, p1.y);
    ctx.lineTo(p2.x + 6, p2.y);
    ctx.lineTo(p3.x + 7, p3.y + 4);
    ctx.lineTo(p4.x - 5, p4.y + 4);
    ctx.closePath();
    ctx.fill();

    const grad = ctx.createLinearGradient(p1.x, p1.y, p4.x, p4.y);
    const highCol = '#58677d';
    const plainCol = '#3b495e';
    const lowCol = '#1c273b';
    grad.addColorStop(0, ramp.fromElev > 0 ? highCol : ramp.fromElev < 0 ? lowCol : plainCol);
    grad.addColorStop(1, ramp.toElev > 0 ? highCol : ramp.toElev < 0 ? lowCol : plainCol);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p1.x + 1, p1.y);
    ctx.lineTo(p2.x - 1, p2.y);
    ctx.lineTo(p3.x - 1, p3.y);
    ctx.lineTo(p4.x + 1, p4.y);
    ctx.closePath();
    ctx.fill();

    // Sunlit left shoulder & shadowed right cut-edge
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p1.x + 1, p1.y);
    ctx.lineTo(p4.x + 1, p4.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.58)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(p2.x - 1, p2.y);
    ctx.lineTo(p3.x - 1, p3.y);
    ctx.stroke();

    // Compacted dual rover wheel ruts
    const spanX = ramp.x2 - ramp.x1;
    for (const xFrac of [0.3, 0.7]) {
      const sx = ramp.x1 + spanX * xFrac;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, ramp.y1 + offFrom + 4);
      ctx.lineTo(sx, ramp.y2 + offTo - 4);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(203, 213, 225, 0.14)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx - 2.5, ramp.y1 + offFrom + 5);
      ctx.lineTo(sx - 2.5, ramp.y2 + offTo - 5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Subtle embossed chevron track marks
    const climbDir = ramp.toElev > ramp.fromElev ? 1 : -1;
    for (const frac of [0.26, 0.5, 0.74]) {
      const cx = (ramp.x1 + ramp.x2) * 0.5;
      const cy = ramp.y1 + (ramp.y2 - ramp.y1) * frac + offFrom + (offTo - offFrom) * frac;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 5.5, cy - 4 * climbDir + 1);
      ctx.lineTo(cx, cy + 4 * climbDir + 1);
      ctx.lineTo(cx + 5.5, cy - 4 * climbDir + 1);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 5.5, cy - 4 * climbDir);
      ctx.lineTo(cx, cy + 4 * climbDir);
      ctx.lineTo(cx + 5.5, cy - 4 * climbDir);
      ctx.stroke();
    }

    // Weathered guide boulders flanking left & right shoulders
    const guideBoulders = [];
    for (const frac of [0.16, 0.48, 0.82]) {
      const by = ramp.y1 + (ramp.y2 - ramp.y1) * frac + offFrom + (offTo - offFrom) * frac;
      for (const sideX of [ramp.x1 - 2, ramp.x2 + 2]) {
        const rx = 4.2 + rng() * 3.2;
        const ry = rx * 0.58;
        guideBoulders.push({
          x: sideX, y: by, rx, ry, rot: (rng() - 0.5) * 0.6, shade: rng(),
          poly: makeBoulderPoly(sideX, by, rx, ry, (rng() - 0.5) * 0.6, rng)
        });
      }
    }
    drawFacetedRockBoulders(ctx, guideBoulders);
  }
  ctx.restore();
}

function drawLowCliffBasin(ctx, b, ramps, craters, minWorldY) {
  if (b.y2 + 30 < minWorldY) return;
  const depth = ELEV_LIFT_PX;
  const geom = getCliffGeometry(b, ramps, true);
  const pts = geom.pts;

  ctx.save();
  // Soft regolith ejecta collar blending basin rim into plain
  tracePoly(ctx, pts);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
  ctx.lineWidth = 22;
  ctx.lineJoin = 'round';
  ctx.stroke();

  tracePoly(ctx, pts);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
  ctx.lineWidth = 9;
  ctx.stroke();

  // Clip interior to jagged basin rim polygon
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();

  // Deep abyssal shadow fill behind drop walls
  ctx.fillStyle = '#070c18';
  ctx.fillRect(b.x1 - 24, b.y1 - 24, (b.x2 - b.x1) + 48, (b.y2 - b.y1) + 48);

  // Faceted interior basalt cliff drop-walls (rim -> sunken floor)
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const len = Math.hypot(ex, ey) || 1;
    // Inward normal is negative outward normal
    const inx = -ey / len;
    const iny = ex / len;
    if (iny < -0.22) continue; // South overhang face is hidden under rim lip

    const lit = inx * LUNAR_SUN_DIR.x + iny * LUNAR_SUN_DIR.y;
    const topCol = lit > 0.18 ? '#3d4c63' : lit > -0.28 ? '#233046' : '#101729';
    const botCol = lit > 0.18 ? '#212d42' : lit > -0.28 ? '#131c2e' : '#070b16';

    const f1x = p1.floorX;
    const f1y = p1.floorY + depth;
    const f2x = p2.floorX;
    const f2y = p2.floorY + depth;

    const wallGrad = ctx.createLinearGradient(0, Math.min(p1.y, p2.y), 0, Math.max(f1y, f2y));
    wallGrad.addColorStop(0, topCol);
    wallGrad.addColorStop(1, botCol);
    ctx.fillStyle = wallGrad;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(f2x, f2y);
    ctx.lineTo(f1x, f1y);
    ctx.closePath();
    ctx.fill();

    // Stratified rock ledges & vertical fracture along facet seam
    ctx.strokeStyle = lit > 0 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(99, 102, 241, 0.12)';
    ctx.lineWidth = 1.4;
    for (const frac of [0.36, 0.68]) {
      ctx.beginPath();
      ctx.moveTo(p1.x + (f1x - p1.x) * frac, p1.y + (f1y - p1.y) * frac + p1.strataShift * 0.4);
      ctx.lineTo(p2.x + (f2x - p2.x) * frac, p2.y + (f2y - p2.y) * frac + p2.strataShift * 0.4);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(f1x, f1y);
    ctx.stroke();
  }

  // Sunken rocky basin floor shifted down by +depth
  const floorGrad = ctx.createLinearGradient(b.x1, b.y1 + depth, b.x2, b.y2 + depth);
  floorGrad.addColorStop(0, '#0b1224');
  floorGrad.addColorStop(0.5, '#152036');
  floorGrad.addColorStop(1, '#212f48');
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const fx = pts[i].floorX;
    const fy = pts[i].floorY + depth;
    if (i === 0) ctx.moveTo(fx, fy);
    else ctx.lineTo(fx, fy);
  }
  ctx.closePath();
  ctx.fill();

  // Deep indigo shadow wash cast inward from NW rim (non-verbal 1.4x drain zone cue)
  const indigoShadow = ctx.createRadialGradient(
    b.x1 + (b.x2 - b.x1) * 0.26,
    b.y1 + depth + (b.y2 - b.y1) * 0.24,
    18,
    (b.x1 + b.x2) * 0.5,
    (b.y1 + b.y2) * 0.5 + depth,
    Math.max(b.x2 - b.x1, b.y2 - b.y1) * 0.72
  );
  indigoShadow.addColorStop(0, 'rgba(30, 27, 75, 0.46)');
  indigoShadow.addColorStop(0.65, 'rgba(49, 46, 129, 0.2)');
  indigoShadow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = indigoShadow;
  ctx.fillRect(b.x1 - 12, b.y1 - 12, (b.x2 - b.x1) + 24, (b.y2 - b.y1) + 40);

  // Subtle floor rock fracture creases
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.48)';
  ctx.lineWidth = 1.6;
  for (const r of geom.ridges) {
    ctx.beginPath();
    r.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y + depth);
      else ctx.lineTo(pt.x, pt.y + depth);
    });
    ctx.stroke();
  }

  // Icy crystal glints on shadowed basin floor
  const nowSec = performance.now() * 0.001;
  for (const ic of geom.glints) {
    const pulse = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(nowSec * 2.2 + ic.phase));
    const iy = ic.y + depth;
    ctx.save();
    ctx.translate(ic.x, iy);
    ctx.rotate(ic.rot);
    ctx.fillStyle = `rgba(129, 140, 248, ${0.26 + pulse * 0.24})`;
    ctx.beginPath();
    ctx.moveTo(0, -ic.size);
    ctx.lineTo(ic.size * 0.58, 0);
    ctx.lineTo(0, ic.size * 0.72);
    ctx.lineTo(-ic.size * 0.58, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(165, 243, 252, ${0.32 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, -ic.size * 0.25, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const cr of craters) {
    drawSingleCrater(ctx, cr, depth);
  }
  ctx.restore();

  // Crisp jagged basin rim edge: dark inner drop on NW, grazing sunlit lip on SE
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    if (p1.nearRamp && p2.nearRamp) continue;
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const len = Math.hypot(ex, ey) || 1;
    const inx = -ey / len;
    const iny = ex / len;
    const rimLit = inx * LUNAR_SUN_DIR.x + iny * LUNAR_SUN_DIR.y;

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    if (rimLit > -0.1) {
      ctx.strokeStyle = `rgba(203, 213, 225, ${0.22 + Math.max(0, rimLit) * 0.28})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p1.x - inx * 1.4, p1.y - iny * 1.4);
      ctx.lineTo(p2.x - inx * 1.4, p2.y - iny * 1.4);
      ctx.stroke();
    }
  }

  // Scattered weathered boulders around outer crater-basin rim
  drawFacetedRockBoulders(ctx, geom.scree);

  // Graded access ramps bridging across the basin rim
  for (const ramp of ramps) {
    drawCliffRamp(ctx, ramp);
  }
  ctx.restore();
}

function drawHighCliffPlateau(ctx, p, ramps, craters) {
  const lift = ELEV_LIFT_PX;
  const geom = getCliffGeometry(p, ramps, false);
  const pts = geom.pts;

  ctx.save();
  // Ground regolith dust skirt & directional lunar cast shadow (away from NW sun)
  tracePoly(ctx, pts, 0, 0, 1, 1, true);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.24)';
  ctx.lineWidth = 20;
  ctx.lineJoin = 'round';
  ctx.stroke();

  tracePoly(ctx, pts, 16, 11, 1, 1, true);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
  ctx.fill();

  // Faceted 2.5D extruded rock escarpment wall quads (lifted top rim -> flared ground base)
  const wallFacets = [];
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = ey / len;
    const ny = -ex / len;
    if (ny < -0.35) continue; // Back/north rim is covered cleanly by plateau top
    wallFacets.push({
      p1,
      p2,
      nx,
      ny,
      sortY: Math.max(p1.baseY, p2.baseY)
    });
  }
  wallFacets.sort((a, b) => a.sortY - b.sortY);

  for (const f of wallFacets) {
    const { p1, p2, nx, ny } = f;
    const lit = nx * LUNAR_SUN_DIR.x + ny * LUNAR_SUN_DIR.y;
    const topCol = lit > 0.16 ? '#54647c' : lit > -0.28 ? '#3b4a62' : '#243044';
    const botCol = lit > 0.16 ? '#2a374c' : lit > -0.28 ? '#1b2639' : '#0f172a';

    const t1y = p1.y - lift;
    const t2y = p2.y - lift;
    const wallGrad = ctx.createLinearGradient(0, Math.min(t1y, t2y), 0, Math.max(p1.baseY, p2.baseY));
    wallGrad.addColorStop(0, topCol);
    wallGrad.addColorStop(0.62, botCol);
    wallGrad.addColorStop(1, '#0b1220');

    ctx.fillStyle = wallGrad;
    ctx.beginPath();
    ctx.moveTo(p1.x, t1y);
    ctx.lineTo(p2.x, t2y);
    ctx.lineTo(p2.baseX, p2.baseY);
    ctx.lineTo(p1.baseX, p1.baseY);
    ctx.closePath();
    ctx.fill();

    // Stratified lunar basalt rock ledges along cliff face
    ctx.strokeStyle = lit > 0 ? 'rgba(203, 213, 225, 0.22)' : 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1.5;
    for (const frac of [0.34, 0.67]) {
      ctx.beginPath();
      ctx.moveTo(p1.x + (p1.baseX - p1.x) * frac, t1y + (p1.baseY - t1y) * frac + p1.strataShift * 0.45);
      ctx.lineTo(p2.x + (p2.baseX - p2.x) * frac, t2y + (p2.baseY - t2y) * frac + p2.strataShift * 0.45);
      ctx.stroke();
    }

    // Vertical angular facet crease + dark base contact seam
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.52)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p1.x, t1y);
    ctx.lineTo(p1.baseX, p1.baseY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.baseX, p1.baseY);
    ctx.lineTo(p2.baseX, p2.baseY);
    ctx.stroke();
  }

  // Weathered scree & talus boulders piled along cliff wall feet
  drawFacetedRockBoulders(ctx, geom.scree);

  // Sunlit plateau top surface shifted up by -lift
  const topGrad = ctx.createLinearGradient(p.x1, p.y1 - lift, p.x2, p.y2 - lift);
  topGrad.addColorStop(0, '#6a7a91');
  topGrad.addColorStop(0.5, '#4e5f77');
  topGrad.addColorStop(1, '#37455b');
  ctx.fillStyle = topGrad;
  tracePoly(ctx, pts, 0, -lift);
  ctx.fill();

  ctx.save();
  tracePoly(ctx, pts, 0, -lift);
  ctx.clip();

  // Warm sunlit highland wash on NW ridge (non-verbal +4.5Wh/s solar cue)
  const sunWash = ctx.createRadialGradient(
    p.x1 + (p.x2 - p.x1) * 0.28,
    p.y1 - lift + (p.y2 - p.y1) * 0.25,
    20,
    p.x1 + (p.x2 - p.x1) * 0.42,
    p.y1 - lift + (p.y2 - p.y1) * 0.42,
    Math.max(p.x2 - p.x1, p.y2 - p.y1) * 0.78
  );
  sunWash.addColorStop(0, 'rgba(253, 224, 71, 0.12)');
  sunWash.addColorStop(0.6, 'rgba(254, 240, 138, 0.04)');
  sunWash.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = sunWash;
  ctx.fillRect(p.x1 - 24, p.y1 - lift - 24, (p.x2 - p.x1) + 48, (p.y2 - p.y1) + 48);

  // Subtle interior basalt rock ridges & surface creases
  for (const r of geom.ridges) {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    r.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y - lift);
      else ctx.lineTo(pt.x, pt.y - lift);
    });
    ctx.stroke();

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    r.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y - lift - 1.5);
      else ctx.lineTo(pt.x, pt.y - lift - 1.5);
    });
    ctx.stroke();
  }
  ctx.restore();

  // Directional sunlit crest & shadowed rim highlights around plateau top
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    if (p1.nearRamp && p2.nearRamp) continue;
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = ey / len;
    const ny = -ex / len;
    const lit = nx * LUNAR_SUN_DIR.x + ny * LUNAR_SUN_DIR.y;

    ctx.strokeStyle = lit > 0.12
      ? 'rgba(254, 240, 138, 0.62)'
      : lit > -0.22
        ? 'rgba(226, 232, 240, 0.36)'
        : 'rgba(15, 23, 42, 0.78)';
    ctx.lineWidth = lit > 0.12 ? 2.4 : 2.0;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - lift);
    ctx.lineTo(p2.x, p2.y - lift);
    ctx.stroke();
  }

  // Tiny solar glint particles along sunlit highland ridges
  const nowSec = performance.now() * 0.001;
  for (const g of geom.glints) {
    const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowSec * 2.6 + g.phase));
    const gy = g.y - lift;
    ctx.fillStyle = `rgba(253, 224, 71, ${0.42 * tw})`;
    ctx.beginPath();
    ctx.arc(g.x, gy, g.r * (1.2 + tw * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * tw})`;
    ctx.beginPath();
    ctx.arc(g.x, gy, g.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Craters resting on top of this plateau
  for (const cr of craters) {
    drawSingleCrater(ctx, cr, -lift);
  }

  // Natural stepped rock shelves along cliff rim for SHIFT RCS Hop
  for (const ledge of p.ledges || []) {
    const ledgeLift = Math.round(ledge.elev * ELEV_LIFT_PX);
    const lGeom = getLedgeGeometry(ledge);
    const lPts = lGeom.pts;

    // Ground shadow
    tracePoly(ctx, lPts, 6, 4, 1, 1, true);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.38)';
    ctx.fill();

    // Faceted rock ledge wall
    for (let i = 0; i < lPts.length; i++) {
      const p1 = lPts[i];
      const p2 = lPts[(i + 1) % lPts.length];
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const len = Math.hypot(ex, ey) || 1;
      const nx = ey / len;
      const ny = -ex / len;
      if (ny < -0.3) continue;
      const lit = nx * LUNAR_SUN_DIR.x + ny * LUNAR_SUN_DIR.y;
      ctx.fillStyle = lit > 0 ? '#3a495f' : '#1e293b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - ledgeLift);
      ctx.lineTo(p2.x, p2.y - ledgeLift);
      ctx.lineTo(p2.baseX, p2.baseY);
      ctx.lineTo(p1.baseX, p1.baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    drawFacetedRockBoulders(ctx, lGeom.scree);

    // Jagged shelf top surface
    const lGrad = ctx.createLinearGradient(ledge.x1, ledge.y1 - ledgeLift, ledge.x2, ledge.y2 - ledgeLift);
    lGrad.addColorStop(0, '#5a6a82');
    lGrad.addColorStop(1, '#3d4c63');
    ctx.fillStyle = lGrad;
    tracePoly(ctx, lPts, 0, -ledgeLift);
    ctx.fill();

    // Subtle cool rock-step edge highlight & tiny embossed step chevrons (no noisy text)
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.56)';
    ctx.lineWidth = 1.8;
    tracePoly(ctx, lPts, 0, -ledgeLift);
    ctx.stroke();

    const lmx = (ledge.x1 + ledge.x2) * 0.5;
    const lmy = (ledge.y1 + ledge.y2) * 0.5 - ledgeLift;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
    ctx.lineWidth = 1.6;
    for (const dy of [-2, 4]) {
      ctx.beginPath();
      ctx.moveTo(lmx - 6, lmy + dy + 2);
      ctx.lineTo(lmx, lmy + dy - 3);
      ctx.lineTo(lmx + 6, lmy + dy + 2);
      ctx.stroke();
    }
  }

  // Graded regolith causeways connecting plain to plateau
  for (const ramp of ramps) {
    drawCliffRamp(ctx, ramp);
  }
  ctx.restore();
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

  const cliffs = state.lunarCliffs || { plateaus: [], basins: [], ramps: [] };
  for (const b of cliffs.basins || []) {
    const basinRamps = (cliffs.ramps || []).filter(r => r.cliffId === b.id);
    const basinCraters = state.lunarCraters.filter(cr => isPointInRoundedRect(cr.x, cr.y, b));
    drawLowCliffBasin(ctx, b, basinRamps, basinCraters, minWorldY);
  }

  for (const cr of state.lunarCraters) {
    if (cr.y + cr.ry + 16 < minWorldY) continue;
    const elev = getSurfaceElevation(cr.x, cr.y);
    if (Math.abs(elev) >= 0.35) continue;
    drawSingleCrater(ctx, cr, 0);
  }

  // Point A Landing Pad
  const px = state.lander.padX, py = state.lander.padY;
  const padElevOff = getSurfaceElevation(px, py) * ELEV_LIFT_PX;
  const padVisualY = py - padElevOff;
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(px, padVisualY, 96, 42, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(px, padVisualY, 70, 30, 0, 0, Math.PI * 2); ctx.stroke();

  const beaconCol = Math.floor(performance.now() / 250) % 2 === 0 ? '#4ade80' : '#38bdf8';
  ctx.fillStyle = beaconCol;
  ctx.beginPath();
  ctx.arc(px - 86, padVisualY, 5.5, 0, Math.PI * 2);
  ctx.arc(px + 86, padVisualY, 5.5, 0, Math.PI * 2);
  ctx.arc(px, padVisualY - 38, 5.5, 0, Math.PI * 2);
  ctx.arc(px, padVisualY + 38, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POINT A: LANDING BASE', px, padVisualY + 58);
  if (state.lander?.targetSiteName) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10.5px Fredoka, sans-serif';
    ctx.fillText(state.lander.targetSiteName.toUpperCase(), px, padVisualY + 72);
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

  // High Cliff Plateau & Low Cliff Basin rocky contour outlines on Lunar Radar
  const cliffs = state.lunarCliffs || { plateaus: [], basins: [], ramps: [] };
  for (const p of cliffs.plateaus || []) {
    const pRamps = (cliffs.ramps || []).filter(r => r.cliffId === p.id);
    const geom = getCliffGeometry(p, pRamps, false);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    tracePoly(ctx, geom.pts, mmX, mmY, sx, sy);
    ctx.fill();
    ctx.stroke();
  }
  for (const b of cliffs.basins || []) {
    const bRamps = (cliffs.ramps || []).filter(r => r.cliffId === b.id);
    const geom = getCliffGeometry(b, bRamps, true);
    ctx.fillStyle = 'rgba(49, 46, 129, 0.65)';
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.2;
    tracePoly(ctx, geom.pts, mmX, mmY, sx, sy);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 2]);
  for (const r of cliffs.ramps || []) {
    const mx = ((r.x1 + r.x2) * 0.5) * sx;
    const my = ((r.y1 + r.y2) * 0.5) * sy;
    ctx.beginPath();
    if (r.dir === 'x') {
      ctx.moveTo(mmX + r.x1 * sx, mmY + my);
      ctx.lineTo(mmX + r.x2 * sx, mmY + my);
    } else {
      ctx.moveTo(mmX + mx, mmY + r.y1 * sy);
      ctx.lineTo(mmX + mx, mmY + r.y2 * sy);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

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

function drawAllHighCliffPlateaus(ctx) {
  const cliffs = state.lunarCliffs || { plateaus: [], ramps: [] };
  for (const p of cliffs.plateaus || []) {
    const pRamps = (cliffs.ramps || []).filter(r => r.cliffId === p.id);
    const pCraters = state.lunarCraters.filter(cr => isPointInRoundedRect(cr.x, cr.y, p));
    drawHighCliffPlateau(ctx, p, pRamps, pCraters);
  }
}

export function drawStage3A(ctx) {
  const l = state.lander;
  draw25DLunarWorld(ctx);

  ctx.save();
  ctx.translate(-state.lunarCam.x, -state.lunarCam.y);
  drawLunarCratersAndPad(ctx);

  const terrainUnder = getTerrainInfo(l.x, l.y);
  const surfaceZ = l.landed && l.surfaceZ != null ? l.surfaceZ : terrainUnder.elev * ELEV_LIFT_PX;
  const altAboveGround = Math.max(0, l.z - surfaceZ);
  const padDist = Math.hypot(l.x - l.padX, (l.y - l.padY) * 1.4);
  const aligned = padDist <= (l.padRadius || 105);

  const groundY = l.y - surfaceZ;
  const padElevOff = getSurfaceElevation(l.padX, l.padY) * ELEV_LIFT_PX;
  const padVisualY = l.padY - padElevOff;

  const drawLanderStack3A = () => {
    // Ground touchdown predictor ring directly underneath lander footpads on current terrain surface
    ctx.strokeStyle = l.landed
      ? 'rgba(74, 222, 128, 0.72)'
      : (terrainUnder.ramp || terrainUnder.ledge)
        ? 'rgba(251, 191, 36, 0.85)'
        : aligned
          ? 'rgba(74, 222, 128, 0.65)'
          : 'rgba(168, 85, 247, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(l.x, groundY, 58, 26, 0, 0, Math.PI * 2);
    ctx.stroke();

    const beamGrad = ctx.createLinearGradient(0, padVisualY - 260, 0, padVisualY);
    beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.02)');
    beamGrad.addColorStop(1, aligned ? 'rgba(74, 222, 128, 0.25)' : 'rgba(251, 191, 36, 0.15)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(l.padX - 140, padVisualY - 260);
    ctx.lineTo(l.padX + 140, padVisualY - 260);
    ctx.lineTo(l.padX + 92, padVisualY);
    ctx.lineTo(l.padX - 92, padVisualY);
    ctx.closePath();
    ctx.fill();

    draw25DLander(ctx, l.x, groundY, altAboveGround, l.tiltX, l.legAnim, l.thrusting, l.hoverTrim || l.p2AssistActive, false, false, l.legCompress || 0);
  };

  if (!l.landed) {
    drawAllHighCliffPlateaus(ctx);
    drawLanderStack3A();
  } else {
    const cliffs = state.lunarCliffs || { plateaus: [], ramps: [] };
    const landerElev = getSurfaceElevation(l.x, l.y);
    const landerOnHighRamp = Boolean(terrainUnder.ramp && terrainUnder.cliff && terrainUnder.cliff.elev > 0);
    const landerSortY = (landerElev >= 0.35 || landerOnHighRamp)
      ? ((terrainUnder.cliff?.y2 || l.y) + 0.001 + l.y * 0.000001)
      : l.y;
    const items3A = [
      ...(cliffs.plateaus || []).map(p => ({ kind: 'cliff', sortY: p.y2, cliff: p })),
      { kind: 'lander', sortY: landerSortY }
    ].sort((a, b) => a.sortY - b.sortY);
    for (const it of items3A) {
      if (it.kind === 'cliff') {
        const p = it.cliff;
        const pRamps = (cliffs.ramps || []).filter(r => r.cliffId === p.id);
        const pCraters = state.lunarCraters.filter(cr => isPointInRoundedRect(cr.x, cr.y, p));
        drawHighCliffPlateau(ctx, p, pRamps, pCraters);
      } else {
        drawLanderStack3A();
      }
    }
  }

  const vSpdNum = Math.abs(l.vz * 0.24);
  const vSpd = vSpdNum.toFixed(1);
  const footBottom = 11 + l.legAnim * 18;
  const ly = groundY - altAboveGround - footBottom;
  if (!l.landed && !l.crashed) {
    const hazardSlope = Boolean(terrainUnder.ramp || terrainUnder.ledge);
    const hazardCliff = Math.abs(terrainUnder.elev) >= 0.35;
    const cardH = (hazardSlope || hazardCliff) ? 60 : 44;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = hazardSlope ? '#fbbf24' : vSpdNum <= 4.2 ? '#4ade80' : vSpdNum <= 7.5 ? '#fbbf24' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(l.x + 56, ly - 74, 144, cardH, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`V:${vSpd} m/s`, l.x + 64, ly - 56);
    ctx.fillStyle = (l.hoverTrim || l.p2AssistActive) ? '#38bdf8' : '#94a3b8';
    ctx.fillText(l.p2AssistActive ? 'P2 TRIMMING' : `ALT:${Math.round(altAboveGround * 0.45)}m`, l.x + 64, ly - 39);
    if (hazardSlope) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText('⚠ CLIFF SLOPE!', l.x + 64, ly - 22);
    } else if (hazardCliff) {
      ctx.fillStyle = terrainUnder.elev > 0 ? '#fde047' : '#818cf8';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(terrainUnder.elev > 0 ? '▲ HIGH CLIFF' : '▼ LOW BASIN', l.x + 64, ly - 22);
    }
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
  const elev = rv.groundElev ?? getSurfaceElevation(rv.x, rv.y);
  const elevOffset = elev * ELEV_LIFT_PX;
  const groundY = rv.y - elevOffset;
  const shadowScale = Math.max(0.45, 1 - rv.z / 95);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(rv.x, groundY + 4, 28 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  if (rv.z > 6) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(rv.x, groundY + 2);
    ctx.lineTo(rv.x, groundY - rv.z);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(rv.x, groundY - 10 - rv.z);

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

  const spd = Math.hypot(rv.vx || 0, rv.vy || 0);
  if (elev >= 0.85 && spd < 8 && rv.battery < rv.maxBattery - 0.5) {
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 8.5px JetBrains Mono, monospace';
    ctx.fillText('☀️ +4.5Wh/s', 0, -49);
  } else if (elev <= -0.85 && spd > 12) {
    ctx.fillStyle = '#a5b4fc';
    ctx.font = 'bold 8.5px JetBrains Mono, monospace';
    ctx.fillText('🌑 1.4x DRAIN', 0, -49);
  }
  ctx.restore();
}

function drawStage3BDepthItem(ctx, item, targetCrater) {
  const r1Elev = state.rover.groundElev ?? getSurfaceElevation(state.rover.x, state.rover.y);

  if (item.kind === 'highCliff') {
    const p = item.cliff;
    const cliffs = state.lunarCliffs || { ramps: [] };
    const pRamps = (cliffs.ramps || []).filter(r => r.cliffId === p.id);
    const pCraters = state.lunarCraters.filter(cr => isPointInRoundedRect(cr.x, cr.y, p));
    drawHighCliffPlateau(ctx, p, pRamps, pCraters);
  } else if (item.kind === 'rocket') {
    const padOff = getSurfaceElevation(state.lander.padX, state.lander.padY) * ELEV_LIFT_PX;
    draw25DLander(ctx, state.lander.padX, state.lander.padY - padOff, 0, 0, 1, false, false, true, false);
  } else if (item.kind === 'rover1') {
    draw25DSingleRover(ctx, state.rover, CREW_ROSTER[0], CREW_ROSTER[2]);
  } else if (item.kind === 'rover2') {
    draw25DSingleRover(ctx, state.rover2, CREW_ROSTER[1], CREW_ROSTER[3]);
  } else if (item.kind === 'boulder') {
    const b = item.obj;
    const by = b.y - getSurfaceElevation(b.x, b.y) * ELEV_LIFT_PX;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath(); ctx.ellipse(b.x + 5, by + 1, b.r * 1.18, b.r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - b.r, by + 1);
    ctx.lineTo(b.x - b.r * 0.82, by - b.r * 0.58);
    ctx.lineTo(b.x - b.r * 0.15, by - b.r * 0.95);
    ctx.lineTo(b.x + b.r * 0.65, by - b.r * 0.65);
    ctx.lineTo(b.x + b.r, by + 1);
    ctx.quadraticCurveTo(b.x, by + 5, b.x - b.r, by + 1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(203, 213, 225, 0.25)';
    ctx.beginPath();
    ctx.moveTo(b.x - b.r * 0.78, by - b.r * 0.48);
    ctx.lineTo(b.x - b.r * 0.15, by - b.r * 0.88);
    ctx.lineTo(b.x + b.r * 0.15, by - b.r * 0.35);
    ctx.lineTo(b.x - b.r * 0.45, by - b.r * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (item.kind === 'science') {
    const sn = item.obj;
    const snElev = getSurfaceElevation(sn.x, sn.y);
    const sy = sn.y - snElev * ELEV_LIFT_PX;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
    ctx.beginPath(); ctx.ellipse(sn.x + 3, sy + 2, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sn.x - 14, sy + 2);
    ctx.lineTo(sn.x - 9, sy - 14);
    ctx.lineTo(sn.x - 1, sy - 25);
    ctx.lineTo(sn.x + 10, sy - 12);
    ctx.lineTo(sn.x + 15, sy + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = sn.scanned ? '#64748b' : '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sn.x - 6, sy - 3);
    ctx.lineTo(sn.x - 1, sy - 19);
    ctx.lineTo(sn.x + 5, sy - 5);
    ctx.stroke();
    if (!sn.scanned && Math.hypot(state.rover.x - sn.x, state.rover.y - sn.y) < 75) {
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
      const promptTxt = Math.abs(r1Elev - snElev) <= 0.45
        ? `[SPACE] Scan ${sn.name} (+${sn.pts}⭐)`
        : 'Use Ramp or [SHIFT] Hop to reach';
      ctx.fillText(promptTxt, sn.x, sy - 34);
    }
  } else if (item.kind === 'eva') {
    const ev = item.obj;
    const evElev = getSurfaceElevation(ev.x, ev.y);
    const ey = ev.y - evElev * ELEV_LIFT_PX;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath(); ctx.ellipse(ev.x + 2, ey + 2, 18, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    if (ev.kind === 'SEISMIC') {
      if (ev.done) {
        const pulse = ((performance.now() * 0.04) % 45);
        ctx.strokeStyle = `rgba(74, 222, 128, ${1 - pulse / 45})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(ev.x, ey, 14 + pulse, (14 + pulse) * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ev.x, ey - 20); ctx.lineTo(ev.x - 12, ey + 1);
      ctx.moveTo(ev.x, ey - 20); ctx.lineTo(ev.x + 12, ey + 1);
      ctx.moveTo(ev.x, ey - 20); ctx.lineTo(ev.x, ey + 3);
      ctx.stroke();
      ctx.fillStyle = ev.done ? '#4ade80' : '#f59e0b'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(ev.x - 10, ey - 28, 20, 12, 4); ctx.fill(); ctx.stroke();
    } else {
      if (ev.done) {
        const beamGrad = ctx.createLinearGradient(ev.x + 2, ey - 24, ev.x + 95, ey - 165);
        beamGrad.addColorStop(0, 'rgba(74, 222, 128, 0.65)');
        beamGrad.addColorStop(1, 'rgba(74, 222, 128, 0)');
        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ev.x + 2, ey - 24); ctx.lineTo(ev.x + 95, ey - 165); ctx.stroke();
      }
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ev.x, ey - 14); ctx.lineTo(ev.x - 10, ey + 1);
      ctx.moveTo(ev.x, ey - 14); ctx.lineTo(ev.x + 10, ey + 1);
      ctx.stroke();
      ctx.fillStyle = '#334155'; ctx.fillRect(ev.x - 6, ey - 16, 12, 10);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ev.x, ey - 16); ctx.lineTo(ev.x, ey - 22); ctx.stroke();
      ctx.fillStyle = ev.done ? '#4ade80' : '#a78bfa'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ev.x, ey - 24, 13, 0.12 * Math.PI, 0.88 * Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(ev.x, ey - 20); ctx.lineTo(ev.x + 3, ey - 29); ctx.stroke();
    }
    if (!ev.done && Math.hypot(state.rover.x - ev.x, state.rover.y - ev.y) < 76) {
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
      const msg = Math.abs(r1Elev - evElev) <= 0.45
        ? (ev.progress > 0 ? `${ev.name}: ${Math.round(ev.progress * 100)}%` : `[HOLD SPACE] Deploy ${ev.name} (+${ev.pts}⭐)`)
        : 'Use Ramp or [SHIFT] Hop to reach';
      ctx.fillText(msg, ev.x, ey - 42);
    }
  } else if (item.kind === 'targetDrill' && targetCrater && !state.rover.hasSample && !state.sampleCollected) {
    const tcElev = getSurfaceElevation(targetCrater.x, targetCrater.y);
    const tcy = targetCrater.y - tcElev * ELEV_LIFT_PX;
    const tPulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
    ctx.save();
    ctx.translate(targetCrater.x, tcy);

    const boreGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    boreGlow.addColorStop(0, `rgba(74, 222, 128, ${0.42 * tPulse})`);
    boreGlow.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = boreGlow;
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, 3); ctx.lineTo(-4, -14);
    ctx.moveTo(12, 3); ctx.lineTo(4, -14);
    ctx.moveTo(0, 5); ctx.lineTo(0, -14);
    ctx.stroke();

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
    ctx.moveTo(0, -11); ctx.lineTo(0, 2);
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(0, -26, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (Math.hypot(state.rover.x - targetCrater.x, state.rover.y - targetCrater.y) < 92) {
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
      const msg = Math.abs(r1Elev - tcElev) <= 0.45
        ? (state.rover.drilling ? `DRILLING SAMPLE... ${Math.round(state.rover.drillProgress * 100)}%` : '[HOLD SPACE] DRILL CORE SAMPLE')
        : 'Enter Basin Ramp or Drop In to Drill';
      ctx.fillText(msg, targetCrater.x, tcy - 38);
      if (state.rover.drilling) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(targetCrater.x - 45, tcy - 56, 90, 9);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(targetCrater.x - 43, tcy - 54, 86 * state.rover.drillProgress, 5);
      }
    }
  }
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

  const rawEntities = [
    { kind: 'rocket', x: state.lander.padX, y: state.lander.padY },
    ...(!state.rover.boarded ? [{ kind: 'rover1', x: state.rover.x, y: state.rover.y, rv: state.rover }] : []),
    ...(state.coopMode !== 'SOLO' && !state.rover2.boarded ? [{ kind: 'rover2', x: state.rover2.x, y: state.rover2.y, rv: state.rover2 }] : []),
    ...state.lunarBoulders.map(b => ({ kind: 'boulder', x: b.x, y: b.y, obj: b })),
    ...state.scienceNodes.map(s => ({ kind: 'science', x: s.x, y: s.y, obj: s })),
    ...state.evaTasks.map(t => ({ kind: 'eva', x: t.x, y: t.y, obj: t })),
    ...(targetCrater && !state.rover.hasSample && !state.sampleCollected
      ? [{ kind: 'targetDrill', x: targetCrater.x, y: targetCrater.y, obj: targetCrater }]
      : [])
  ];

  // Pass 1: Entities inside Low Cliff Basins (elev < -0.35), Y-sorted
  const basinItems = [];
  const mainItems = [];
  const cliffs = state.lunarCliffs || { plateaus: [] };

  for (const ent of rawEntities) {
    if (ent.kind !== 'rocket' && ent.y < minWorldY) continue;
    const info = getTerrainInfo(ent.x, ent.y);
    const elev = ent.rv ? (ent.rv.groundElev ?? info.elev) : info.elev;
    const onHighRamp = Boolean(info.ramp && info.cliff && info.cliff.elev > 0);
    if (elev < -0.35) {
      basinItems.push({ ...ent, sortY: ent.y });
    } else if (elev >= 0.35 || onHighRamp) {
      const parentPlateau = info.cliff || (cliffs.plateaus || [])[0];
      const baseY = parentPlateau ? parentPlateau.y2 : ent.y;
      mainItems.push({ ...ent, sortY: baseY + 0.001 + ent.y * 0.000001 });
    } else {
      mainItems.push({ ...ent, sortY: ent.y });
    }
  }

  for (const p of cliffs.plateaus || []) {
    mainItems.push({ kind: 'highCliff', sortY: p.y2, cliff: p });
  }

  basinItems.sort((a, b) => a.sortY - b.sortY);
  mainItems.sort((a, b) => a.sortY - b.sortY);

  for (const item of basinItems) {
    drawStage3BDepthItem(ctx, item, targetCrater);
  }
  for (const item of mainItems) {
    drawStage3BDepthItem(ctx, item, targetCrater);
  }

  // Co-Op Power Tether between LTV-1 and LTV-2 when close and both deployed
  const tethered =
    state.coopMode !== 'SOLO' &&
    !state.rover.boarded &&
    !state.rover2.boarded &&
    Math.hypot(state.rover.x - state.rover2.x, state.rover.y - state.rover2.y) < 130;
  if (tethered) {
    const r1y = state.rover.y - (state.rover.groundElev || 0) * ELEV_LIFT_PX - state.rover.z - 16;
    const r2y = state.rover2.y - (state.rover2.groundElev || 0) * ELEV_LIFT_PX - state.rover2.z - 16;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(state.rover.x, r1y);
    ctx.lineTo(state.rover2.x, r2y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⚡ CO-OP 2x TETHER', (state.rover.x + state.rover2.x) / 2, (r1y + r2y) / 2 - 12);
  }

  const padOff = getSurfaceElevation(state.lander.padX, state.lander.padY) * ELEV_LIFT_PX;
  const padVisualY = state.lander.padY - padOff;
  if (
    state.lander.hardLandingPenalty &&
    !state.lander.shockRepaired &&
    !anySample &&
    Math.hypot(state.rover.x - state.lander.padX, state.rover.y - state.lander.padY) < 130
  ) {
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🔧 [SPACE] REPAIR LANDING SHOCK (+28Wh BATTERY)', state.lander.padX, padVisualY - 150);
  } else if (anySample) {
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    if (state.stage3BLaunch?.launching) {
      ctx.fillText(`🚀 HATCH SEALED! IGNITION IN ${state.stage3BLaunch.countdown.toFixed(1)}s`, state.lander.padX, padVisualY - 150);
    } else if (boardedCount < reqRovers.length) {
      ctx.fillText(`⬇️ GATHER INSIDE ROCKET TO LAUNCH (CREW ${boardedCount}/${reqRovers.length}) ⬇️`, state.lander.padX, padVisualY - 150);
    } else {
      ctx.fillText('⬇️ ALL CREW AT ROCKET - STOWING CORE SAMPLE! ⬇️', state.lander.padX, padVisualY - 150);
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
    const wpElevOff = getSurfaceElevation(wp.x, wp.y) * ELEV_LIFT_PX;
    const sx = wp.x - state.lunarCam.x;
    const sy = (wp.y - wpElevOff) - state.lunarCam.y;
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
    ...(state.coopMode === 'LOCAL_2P' ? [{ key: 'IJKL', label: 'Drive LTV-2' }] : []),
    { key: 'SHIFT', label: 'RCS Hop / Cushion' },
    { key: 'SPACE', label: 'Drill / Scan / Board' }
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
    drawAllHighCliffPlateaus(ctx);
    const padOff = getSurfaceElevation(state.lander.padX, state.lander.padY) * ELEV_LIFT_PX;
    // Big Gold Descent Stage remains on Point A as the Lunar Launch Table!
    draw25DLander(ctx, state.lander.padX, state.lander.padY - padOff, 0, 0, 1, false, false, false, true);

    // Big White Crew Ascent Stage blasting off vertically!
    ctx.save();
    ctx.translate(state.lander.padX, ml.capsuleY - padOff - 91);
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
