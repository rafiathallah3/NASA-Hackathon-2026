import { LOGICAL_W, LOGICAL_H, SHIP_W, SHIP_H, CREW_ROSTER } from '../config.js';
import { state, getScenario, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet, isWsMultiplayer, isWsGuest, isHumanSlotInWs, getMyWsSlot, sendGuestAction } from '../net.js';
import { getSlotKeys } from '../sync.js';
import { getAsset } from '../assets.js';
import { addFloatText, drawChibiEngineer, drawCanvasControlBar, createStarfield, drawStarfield, drawExplosionSprite } from '../sprites.js';
import { setStageBanner, updateBottomHUD, showMissionToast } from '../hud.js';
import { triggerDilemma } from '../dilemmas.js';

const CRUISE_STARS = createStarfield(90, LOGICAL_W, LOGICAL_H, 20261);

const ROOMS = [
  { id: 'REACTOR', name: 'REACTOR & POWER BAY', x: 70,   y: 70,  w: 540, h: 360, floor: '#182236', accent: '#f59e0b' },
  { id: 'BRIDGE',  name: 'BRIDGE & HOLO-DECK',  x: 610,  y: 70,  w: 660, h: 360, floor: '#142033', accent: '#38bdf8' },
  { id: 'SCI_LAB', name: 'SCIENCE LAB',         x: 1270, y: 70,  w: 540, h: 360, floor: '#1a2038', accent: '#a855f7' },
  { id: 'HALLWAY', name: 'CENTRAL SPINE DECK',  x: 70,   y: 430, w: 1740, h: 100, floor: '#1e293b', accent: '#64748b' },
  { id: 'ENGINE',  name: 'ENGINEERING BAY',     x: 70,   y: 530, w: 840, h: 380, floor: '#1b1f32', accent: '#ef4444' },
  { id: 'COMMS',   name: 'COMMS & AIRLOCK',     x: 910,  y: 530, w: 900, h: 380, floor: '#152332', accent: '#10b981' }
];

// Bulkhead walls with generous doorway gaps
const WALLS = [
  // Reactor <-> Bridge vertical divider (doorway at y 210..330)
  { x: 602, y: 70,  w: 16, h: 140 },
  { x: 602, y: 330, w: 16, h: 100 },
  // Bridge <-> Science Lab vertical divider (doorway at y 210..330)
  { x: 1262, y: 70,  w: 16, h: 140 },
  { x: 1262, y: 330, w: 16, h: 100 },
  // Top Rooms <-> Central Spine horizontal divider (doorways: x 290..410, x 880..1000, x 1480..1600)
  { x: 70,   y: 422, w: 220, h: 16 },
  { x: 410,  y: 422, w: 470, h: 16 },
  { x: 1000, y: 422, w: 480, h: 16 },
  { x: 1600, y: 422, w: 210, h: 16 },
  // Central Spine <-> Bottom Rooms horizontal divider (doorways: x 360..500, x 1300..1440)
  { x: 70,   y: 522, w: 290, h: 16 },
  { x: 500,  y: 522, w: 800, h: 16 },
  { x: 1440, y: 522, w: 370, h: 16 },
  // Engine <-> Comms vertical divider (doorway at y 670..790)
  { x: 902, y: 530, w: 16, h: 140 },
  { x: 902, y: 790, w: 16, h: 120 }
];

const DOORS = [
  { id: 'REACTOR_BRIDGE', x: 610,  y: 270, vertical: true,  span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'BRIDGE_SCILAB',  x: 1270, y: 270, vertical: true,  span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'REACTOR_HALL',   x: 350,  y: 430, vertical: false, span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'BRIDGE_HALL',    x: 940,  y: 430, vertical: false, span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'SCILAB_HALL',    x: 1540, y: 430, vertical: false, span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'ENGINE_HALL',    x: 430,  y: 530, vertical: false, span: 140, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'COMMS_HALL',     x: 1370, y: 530, vertical: false, span: 140, locked: false, lockTimer: 0, overrideProg: 0, overriding: false },
  { id: 'ENGINE_COMMS',   x: 910,  y: 730, vertical: true,  span: 120, locked: false, lockTimer: 0, overrideProg: 0, overriding: false }
];

function getDoorCollider(d) {
  const span = d.span || 120;
  return d.vertical
    ? { x: d.x - 8, y: d.y - span / 2, w: 16, h: span }
    : { x: d.x - span / 2, y: d.y - 8, w: span, h: 16 };
}

function getDoorAt(x, y) {
  return DOORS.find(d => Math.hypot(d.x - x, d.y - y) < 20) || null;
}

function createTransitAsteroids() {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const large = i % 3 === 0;
    list.push({
      x: (i * 193) % (SHIP_W + 240) - 120,
      y: i % 2 === 0 ? (10 + (i * 19) % 44) : (SHIP_H - 54 + (i * 13) % 42),
      vx: (large ? -26 : -44) - (i % 4) * 9,
      vy: ((i % 3) - 1) * 5,
      size: large ? 48 + (i % 3) * 10 : 22 + (i % 3) * 6,
      rot: i * 0.7,
      vr: ((i % 2 === 0 ? 1 : -1) * (0.35 + (i % 4) * 0.18)),
      large
    });
  }
  return list;
}

const WIRE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];

export function startStage2() {
  const scen = getScenario();
  const totalDuration = 64;
  const minTasksRequired = scen?.id === 'south_pole' ? 5 : 4;
  state.stage = 'STAGE2';
  state.stageTimer = totalDuration;
  state.activeMiniGame = null;
  state.floatingTexts = [];

  for (const d of DOORS) {
    d.locked = false;
    d.lockTimer = 0;
    d.overrideProg = 0;
    d.overriding = false;
  }
  state.stage2Doors = DOORS;

  const startBatt = Math.max(45, Math.min(100, 60 + Math.round(state.telemetry.power * 0.25)));
  state.orbitState = {
    progress: 0,
    stageDuration: totalDuration,
    battery: startBatt,
    shipIntegrity: 100,
    dataBuffer: 30,
    inEclipse: false,
    inGroundCone: false,
    inScanZone: false,
    eventTimer: 3.4,
    tasksCompleted: 0,
    minTasksRequired,
    overtimeHold: 0,
    alarmPulseCd: 0,
    arrivalReady: false,
    arrivalHold: 0,
    eclipseDilemmaShown: false,
    surge1Triggered: false,
    surge2Triggered: false,
    surgeFlashTimer: 0,
    interferenceTimer: 0,
    impacts: [],
    asteroids: createTransitAsteroids()
  };

  state.wrenchRack = { x: 230, y: 690, available: true };

  state.ctrlPlayers = CREW_ROSTER.map((cr, i) => ({
    name: cr.id,
    role: cr.role,
    x: 860 + i * 52,
    y: 480,
    angle: 0,
    color: cr.color,
    visor: cr.visor,
    walk: 0,
    hasWrench: false
  }));

  state.stage2Cam = {
    x: Math.max(0, Math.min(SHIP_W - LOGICAL_W, 940 - LOGICAL_W / 2)),
    y: Math.max(0, Math.min(SHIP_H - LOGICAL_H, 480 - LOGICAL_H / 2))
  };

  state.consoles = [
    { id: 'SPACE',  room: 'Reactor Bay', label: 'REACTOR WIRING',  sub: 'Match 4 Color Wires',    x: 245,  y: 195, color: '#f59e0b', alert: true,  needsWrench: false, botProg: 0 },
    { id: 'USER',   room: 'Bridge',      label: 'MCC-1 BURN',      sub: 'GMAT Trajectory Trim',   x: 940,  y: 335, color: '#0284c7', alert: true,  needsWrench: false, botProg: 0 },
    { id: 'CALIB',  room: 'Science Lab', label: 'DISTRIBUTOR',     sub: 'Sync 3 Timing Rings',    x: 1555, y: 205, color: '#a855f7', alert: false, needsWrench: false, botProg: 0 },
    { id: 'LAUNCH', room: 'Engine Room', label: 'HULL BREACH',     sub: 'Wrench + Torque Bolts',  x: 680,  y: 720, color: '#dc2626', alert: false, needsWrench: true,  botProg: 0 },
    { id: 'GROUND', room: 'Comms Bay',   label: 'KA-BAND DISH',    sub: 'Tune Downlink Carrier',  x: 1560, y: 710, color: '#10b981', alert: false, needsWrench: false, botProg: 0 }
  ];

  state.mccResult = {
    completed: false,
    bPlaneMissKm: 120,
    nominalCapture: false,
    fuelPenaltyPct: 18,
    propellantBurnedKg: 0
  };
  ensureMccPointerListeners();

  setStageBanner(
    'STAGE 2: ORBITAL CRUISER',
    'Clear Red Console Alerts Across 5 Ship Bays',
    'Follow red arrows to flashing consoles (see top-left checklist) and press [SPACE] or CLICK.',
    `<kbd>WASD</kbd> Move &nbsp;•&nbsp; <kbd>SPACE</kbd> / Click Task &nbsp;•&nbsp; <kbd>1</kbd>-<kbd>4</kbd> Crew &nbsp;•&nbsp; <kbd>ESC</kbd> Close`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  updateBottomHUD();
}

let mccPointerBound = false;

function getMccFireButtonRect(mx, my) {
  return { x: mx - 110, y: my + 80, w: 220, h: 32 };
}

function isPointInRect(lx, ly, rect) {
  return lx >= rect.x && lx <= rect.x + rect.w && ly >= rect.y && ly <= rect.y + rect.h;
}

function ensureMccPointerListeners() {
  if (mccPointerBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  const canvas = document.getElementById('game');
  if (!canvas) return;
  mccPointerBound = true;

  canvas.addEventListener('pointerdown', (e) => {
    if (state.stage !== 'STAGE2' || state.activeMiniGame?.type !== 'MCC_BURN') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const lx = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
    const ly = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;
    const btn = getMccFireButtonRect(LOGICAL_W / 2, LOGICAL_H / 2 + 12);
    if (isPointInRect(lx, ly, btn)) {
      state.activeMiniGame.buttonHeld = true;
      state.activeMiniGame.holdStartMs = performance.now();
    }
  });

  window.addEventListener('pointerup', () => {
    const mg = state.activeMiniGame;
    if (!mg || mg.type !== 'MCC_BURN' || !mg.buttonHeld) return;
    const heldMs = performance.now() - (mg.holdStartMs || 0);
    mg.buttonHeld = false;
    if (heldMs > 200) {
      mg.isBurning = false;
      mg.suppressNextClick = true;
    }
  });
}

function shuffledIndices() {
  const arr = [0, 1, 2, 3];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function openConsoleMiniGame(c, actor = null) {
  const lead = actor || state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  if (c.id === 'LAUNCH' && c.needsWrench && !lead.hasWrench) {
    addFloatText(c.x, c.y - 45, 'Grab Wrench from Engine Rack First! 🔧', '#fbbf24');
    playTone(170, 'sawtooth', 0.16, 0.1);
    return;
  }

  if (c.id === 'SPACE') {
    state.activeMiniGame = {
      type: 'WIRES',
      console: c,
      rightOrder: shuffledIndices(),
      selectedLeft: null,
      matched: [false, false, false, false]
    };
  } else if (c.id === 'USER') {
    state.activeMiniGame = {
      type: 'MCC_BURN',
      console: c,
      targetPitch: 34.5,
      currentPitch: 12.0,
      targetDeltaV: 45.0,
      burnedDeltaV: 0,
      bPlaneMissKm: 110,
      captureThresholdKm: 25.0,
      propellantUsed: 0,
      isBurning: false,
      buttonHeld: false,
      holdStartMs: 0,
      suppressNextClick: false,
      completed: false
    };
  } else if (c.id === 'CALIB') {
    state.activeMiniGame = {
      type: 'DISTRIBUTOR',
      console: c,
      ringIndex: 0,
      angles: [0.4, 2.2, 4.1],
      speeds: [2.5, -3.1, 3.6],
      locked: [false, false, false]
    };
  } else if (c.id === 'GROUND') {
    state.activeMiniGame = {
      type: 'GROUND',
      console: c,
      targetFreq: 0.3 + Math.random() * 0.45,
      playerFreq: 0.15,
      holdTime: 0
    };
  } else if (c.id === 'LAUNCH') {
    state.activeMiniGame = {
      type: 'LAUNCH',
      console: c,
      boltsTightened: 0,
      boltsNeeded: 7
    };
  }
  playTone(480, 'sine', 0.08, 0.1);
}

export function toggleBreaker(idx) {
  const mg = state.activeMiniGame;
  if (!mg) return;
  if (mg.type === 'WIRES' && idx >= 0 && idx < 4) {
    if (!mg.matched[idx]) {
      mg.selectedLeft = idx;
      playTone(460 + idx * 60, 'sine', 0.06, 0.08);
    }
  }
}

function applyConsoleCompletion(c, actor, msg, pts, opts = {}) {
  c.alert = false;
  c.botProg = 0;
  const lead = actor || state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  if (c.id === 'LAUNCH' && lead?.hasWrench) {
    lead.hasWrench = false;
    state.wrenchRack.available = true;
  }
  state.score += pts;
  state.telemetry.science += 25;
  state.orbitState.tasksCompleted++;
  state.orbitState.shipIntegrity = Math.min(100, (state.orbitState.shipIntegrity ?? 100) + 10);
  state.orbitState.battery = Math.min(100, state.orbitState.battery + (c.id === 'SPACE' ? 18 : 8));
  if (c.id === 'GROUND') state.orbitState.dataBuffer = Math.max(0, state.orbitState.dataBuffer - 40);
  addFloatText(c.x, c.y - 45, msg, opts.floatColor || '#4ade80');
  showMissionToast(c.label, opts.toastDetail || `${c.room} cleared. Bus power stabilized.`);
  logBlackBox('STAGE 2', opts.blackBoxText || `${lead?.name || 'Crew'} completed ${c.label} in ${c.room}.`, opts.blackBoxKind || 'good');
  playSuccessChord();
  updateBottomHUD();
}

function completeConsoleTask(c, msg, pts, opts = {}) {
  if (isWsGuest()) {
    sendGuestAction('STAGE2_COMPLETE_CONSOLE', {
      consoleId: c.id,
      msg,
      pts,
      opts: {
        floatColor: opts.floatColor,
        toastDetail: opts.toastDetail,
        blackBoxText: opts.blackBoxText,
        blackBoxKind: opts.blackBoxKind
      },
      mccResult: opts.mccResult || null
    });
    playSuccessChord();
    state.activeMiniGame = null;
    return;
  }
  applyConsoleCompletion(c, state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0], msg, pts, opts);
  state.activeMiniGame = null;
}

export function completeRemoteConsoleTask(slot, payload) {
  if (state.stage !== 'STAGE2' || !payload?.consoleId) return;
  const c = state.consoles.find(item => item.id === payload.consoleId);
  if (!c || !c.alert) return;
  if (payload.mccResult) {
    state.mccResult = { ...payload.mccResult };
  }
  const actor = state.ctrlPlayers[slot] || state.ctrlPlayers[0];
  applyConsoleCompletion(c, actor, payload.msg || `${c.label} CLEARED!`, Number(payload.pts || 0), payload.opts || {});
}

function completeMccBurn(mg) {
  if (mg.completed) return;
  mg.completed = true;
  mg.isBurning = false;
  mg.buttonHeld = false;

  const missKm = Math.round(mg.bPlaneMissKm);
  const propKg = Number(mg.propellantUsed.toFixed(1));
  let nominalCapture = false;
  let fuelPenaltyPct = 18;
  let pts = 0;
  let floatMsg = '';
  let floatColor = '#fde047';
  let toastDetail = '';
  let blackBoxKind = 'warn';

  if (missKm <= mg.captureThresholdKm) {
    nominalCapture = true;
    fuelPenaltyPct = 0;
    pts = 120;
    floatMsg = `MCC-1 NOMINAL (${missKm} km)! +120⭐`;
    floatColor = '#4ade80';
    toastDetail = `B-Plane miss ${missKm} km. Lunar capture corridor locked (0% descent fuel penalty).`;
    blackBoxKind = 'good';
  } else if (missKm <= 75) {
    nominalCapture = false;
    fuelPenaltyPct = 8;
    pts = 60;
    floatMsg = `MCC-1 MARGINAL (${missKm} km) +60⭐`;
    floatColor = '#fbbf24';
    toastDetail = `B-Plane miss ${missKm} km. +8% descent fuel penalty in Stage 3A.`;
    blackBoxKind = 'warn';
  } else {
    nominalCapture = false;
    fuelPenaltyPct = 18;
    pts = 0;
    floatMsg = `MCC-1 OFF-CORRIDOR (${missKm} km)`;
    floatColor = '#f87171';
    toastDetail = `B-Plane miss ${missKm} km (>75 km). +18% descent fuel penalty in Stage 3A.`;
    blackBoxKind = 'warn';
  }

  const mccPayload = {
    completed: true,
    bPlaneMissKm: missKm,
    nominalCapture,
    fuelPenaltyPct,
    propellantBurnedKg: propKg
  };
  if (!isWsGuest()) {
    state.mccResult = mccPayload;
  }

  const statusTag = nominalCapture ? 'NOMINAL' : (fuelPenaltyPct === 8 ? 'MARGINAL +8% fuel' : 'OFF-CORRIDOR +18% fuel');
  completeConsoleTask(mg.console, floatMsg, pts, {
    floatColor,
    toastDetail,
    blackBoxText: `MCC-1 trajectory burn complete: B-Plane miss ${missKm} km (${statusTag}, ${propKg} kg propellant used).`,
    blackBoxKind,
    mccResult: mccPayload
  });
}

function triggerDistributorHit(mg) {
  const idx = mg.ringIndex;
  // Target notch window around angle 0 (mod 2PI)
  const norm = ((mg.angles[idx] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const diff = Math.min(norm, Math.PI * 2 - norm);
  if (diff <= 0.55) {
    mg.locked[idx] = true;
    playTone(540 + idx * 140, 'triangle', 0.1, 0.12);
    if (idx >= 2) {
      completeConsoleTask(mg.console, 'DISTRIBUTOR SYNCED! +110⭐', 110);
    } else {
      mg.ringIndex++;
    }
  } else {
    mg.ringIndex = 0;
    mg.locked = [false, false, false];
    playTone(160, 'sawtooth', 0.15, 0.1);
  }
}

export function handleStage2Interact(actor = null, isRemote = false) {
  const p = actor || state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];

  if (!isRemote && state.activeMiniGame) {
    const mg = state.activeMiniGame;
    if (mg.type === 'DISTRIBUTOR') {
      triggerDistributorHit(mg);
    } else if (mg.type === 'MCC_BURN') {
      if (!mg.completed) {
        mg.isBurning = !mg.isBurning;
        playTone(mg.isBurning ? 320 : 210, 'triangle', 0.08, 0.09);
      }
    } else if (mg.type === 'WIRES') {
      const nextUnmatched = mg.matched.findIndex(m => !m);
      if (nextUnmatched !== -1) {
        mg.matched[nextUnmatched] = true;
        mg.selectedLeft = null;
        playTone(500 + nextUnmatched * 90, 'triangle', 0.08, 0.1);
        if (mg.matched.every(Boolean)) {
          completeConsoleTask(mg.console, 'REACTOR WIRES PATCHED! +100⭐', 100);
        }
      }
    } else if (mg.type === 'LAUNCH') {
      mg.boltsTightened++;
      playTone(300 + mg.boltsTightened * 85, 'square', 0.08, 0.12);
      if (mg.boltsTightened >= mg.boltsNeeded) {
        completeConsoleTask(mg.console, 'HULL & GYRO REPAIRED! +105⭐', 105);
      }
    }
    return;
  }

  if (Math.hypot(p.x - state.wrenchRack.x, p.y - state.wrenchRack.y) < 64) {
    if (!isRemote && isWsGuest()) {
      sendGuestAction('STAGE2_INTERACT');
      return;
    }
    if (!p.hasWrench && state.wrenchRack.available) {
      p.hasWrench = true;
      state.wrenchRack.available = false;
      addFloatText(state.wrenchRack.x, state.wrenchRack.y - 30, `${p.name} Equipped Wrench 🔧`, '#fde047');
      playTone(540, 'sine', 0.08, 0.1);
      return;
    } else if (p.hasWrench) {
      p.hasWrench = false;
      state.wrenchRack.available = true;
      addFloatText(state.wrenchRack.x, state.wrenchRack.y - 30, 'Returned Wrench', '#94a3b8');
      return;
    }
  }

  for (const d of DOORS) {
    if (d.locked && Math.hypot(p.x - d.x, p.y - d.y) < 92) {
      if (!isRemote && isWsGuest()) {
        sendGuestAction('STAGE2_INTERACT');
        return;
      }
      d.overriding = true;
      d.overrideProg = Math.max(d.overrideProg || 0, 0.18);
      playTone(380, 'square', 0.06, 0.08);
      return;
    }
  }

  if (isRemote) return;

  for (const c of state.consoles) {
    if (Math.hypot(p.x - c.x, p.y - c.y) < 82) {
      if (c.alert) {
        openConsoleMiniGame(c, p);
      } else {
        addFloatText(c.x, c.y - 40, `${c.label} Nominal ✅`, '#4ade80');
      }
      return;
    }
  }
}

export function handleStage2CanvasClick(lx, ly) {
  if (state.stage !== 'STAGE2') return;
  const mg = state.activeMiniGame;
  const mx = LOGICAL_W / 2;
  const my = LOGICAL_H / 2 + 12;

  if (!mg) {
    // Allow clicking nearby console or locked bulkhead door directly on canvas
    const p = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
    const wx = lx + state.stage2Cam.x;
    const wy = ly + state.stage2Cam.y;
    for (const d of DOORS) {
      if (d.locked && Math.hypot(wx - d.x, wy - d.y) < 64 && Math.hypot(p.x - d.x, p.y - d.y) < 115) {
        if (isWsGuest()) {
          sendGuestAction('STAGE2_INTERACT');
          return;
        }
        d.overriding = true;
        d.overrideProg = Math.max(d.overrideProg || 0, 0.18);
        playTone(380, 'square', 0.06, 0.08);
        return;
      }
    }
    for (const c of state.consoles) {
      if (c.alert && Math.hypot(wx - c.x, wy - c.y) < 60 && Math.hypot(p.x - c.x, p.y - c.y) < 115) {
        openConsoleMiniGame(c, p);
        return;
      }
    }
    return;
  }

  // Click Close [X] button top-right of modal
  if (lx >= mx + 178 && lx <= mx + 206 && ly >= my - 134 && ly <= my - 106) {
    state.activeMiniGame = null;
    return;
  }

  if (mg.type === 'WIRES') {
    // Left terminals at mx - 140, y = my - 65 + i*48
    for (let i = 0; i < 4; i++) {
      const ty = my - 65 + i * 48;
      if (Math.hypot(lx - (mx - 140), ly - ty) < 26 && !mg.matched[i]) {
        mg.selectedLeft = i;
        playTone(460 + i * 60, 'sine', 0.06, 0.08);
        return;
      }
      const colorIdx = mg.rightOrder[i];
      if (Math.hypot(lx - (mx + 140), ly - ty) < 26 && mg.selectedLeft !== null) {
        if (mg.selectedLeft === colorIdx) {
          mg.matched[colorIdx] = true;
          mg.selectedLeft = null;
          playTone(540 + colorIdx * 80, 'triangle', 0.09, 0.11);
          if (mg.matched.every(Boolean)) {
            completeConsoleTask(mg.console, 'REACTOR WIRES PATCHED! +100⭐', 100);
          }
        } else {
          mg.selectedLeft = null;
          playTone(170, 'sawtooth', 0.12, 0.09);
        }
        return;
      }
    }
  } else if (mg.type === 'DISTRIBUTOR') {
    if (lx >= mx - 210 && lx <= mx + 210 && ly >= my - 140 && ly <= my + 140) {
      triggerDistributorHit(mg);
    }
  } else if (mg.type === 'MCC_BURN') {
    if (mg.suppressNextClick) {
      mg.suppressNextClick = false;
      return;
    }
    const fireBtn = getMccFireButtonRect(mx, my);
    if (!mg.completed && isPointInRect(lx, ly, fireBtn)) {
      mg.isBurning = !mg.isBurning;
      playTone(mg.isBurning ? 320 : 210, 'triangle', 0.08, 0.09);
    }
  } else if (mg.type === 'LAUNCH') {
    mg.boltsTightened++;
    playTone(300 + mg.boltsTightened * 85, 'square', 0.08, 0.12);
    if (mg.boltsTightened >= mg.boltsNeeded) {
      completeConsoleTask(mg.console, 'HULL & GYRO REPAIRED! +105⭐', 105);
    }
  }
}

const CTRL_RADIUS = 18;
const HOLO_TABLE_BOX = { x: 670, y: 86, w: 540, h: 120 };
const SHIP_COLLIDERS = [...WALLS, HOLO_TABLE_BOX];

function resolveCircleBox(nx, ny, r, box) {
  const cx = Math.max(box.x, Math.min(nx, box.x + box.w));
  const cy = Math.max(box.y, Math.min(ny, box.y + box.h));
  const dx = nx - cx;
  const dy = ny - cy;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return { x: nx, y: ny };
  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const push = r - dist;
    return { x: nx + (dx / dist) * push, y: ny + (dy / dist) * push };
  }
  const left = nx - box.x;
  const right = box.x + box.w - nx;
  const top = ny - box.y;
  const bottom = box.y + box.h - ny;
  const minEdge = Math.min(left, right, top, bottom);
  if (minEdge === left) return { x: box.x - r, y: ny };
  if (minEdge === right) return { x: box.x + box.w + r, y: ny };
  if (minEdge === top) return { x: nx, y: box.y - r };
  return { x: nx, y: box.y + box.h + r };
}

function moveCtrlPlayer(p, dx, dy) {
  const stepDist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(stepDist / 6));
  const sx = dx / steps;
  const sy = dy / steps;
  const lockedDoors = DOORS.filter(d => d.locked);
  let nx = p.x;
  let ny = p.y;
  for (let s = 0; s < steps; s++) {
    nx += sx;
    ny += sy;
    for (let iter = 0; iter < 2; iter++) {
      for (const box of SHIP_COLLIDERS) {
        const res = resolveCircleBox(nx, ny, CTRL_RADIUS, box);
        nx = res.x;
        ny = res.y;
      }
      for (const d of lockedDoors) {
        const res = resolveCircleBox(nx, ny, CTRL_RADIUS, getDoorCollider(d));
        nx = res.x;
        ny = res.y;
      }
      nx = Math.max(70 + CTRL_RADIUS, Math.min(SHIP_W - 70 - CTRL_RADIUS, nx));
      ny = Math.max(70 + CTRL_RADIUS, Math.min(SHIP_H - 70 - CTRL_RADIUS, ny));
    }
  }
  p.x = nx;
  p.y = ny;
}

function segmentIntersectsBox(ax, ay, bx, by, box, pad = 20) {
  const minX = box.x - pad;
  const maxX = box.x + box.w + pad;
  const minY = box.y - pad;
  const maxY = box.y + box.h + pad;
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const checks = [
    [-dx, ax - minX],
    [dx, maxX - ax],
    [-dy, ay - minY],
    [dy, maxY - ay]
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

function hasClearShipLOS(ax, ay, bx, by, pad = 20) {
  for (const box of SHIP_COLLIDERS) {
    if (segmentIntersectsBox(ax, ay, bx, by, box, pad)) return false;
  }
  for (const d of DOORS) {
    if (d.locked && segmentIntersectsBox(ax, ay, bx, by, getDoorCollider(d), pad)) return false;
  }
  return true;
}

function getShipRoomId(x, y) {
  if (y >= 430 && y <= 530) return 'HALLWAY';
  if (y < 430) {
    if (x < 610) return 'REACTOR';
    if (x < 1270) return 'BRIDGE';
    return 'SCI_LAB';
  }
  return x < 910 ? 'ENGINE' : 'COMMS';
}

const ROOM_DOORS = {
  REACTOR: [
    { to: 'BRIDGE',  from: { x: 556, y: 270 }, into: { x: 664, y: 270 }, door: { x: 610, y: 270 } },
    { to: 'HALLWAY', from: { x: 350, y: 376 }, into: { x: 350, y: 480 }, door: { x: 350, y: 430 } }
  ],
  BRIDGE: [
    { to: 'REACTOR', from: { x: 664, y: 270 }, into: { x: 556, y: 270 }, door: { x: 610, y: 270 } },
    { to: 'SCI_LAB', from: { x: 1216, y: 270 }, into: { x: 1324, y: 270 }, door: { x: 1270, y: 270 } },
    { to: 'HALLWAY', from: { x: 940, y: 376 }, into: { x: 940, y: 480 }, door: { x: 940, y: 430 } }
  ],
  SCI_LAB: [
    { to: 'BRIDGE',  from: { x: 1324, y: 270 }, into: { x: 1216, y: 270 }, door: { x: 1270, y: 270 } },
    { to: 'HALLWAY', from: { x: 1540, y: 376 }, into: { x: 1540, y: 480 }, door: { x: 1540, y: 430 } }
  ],
  HALLWAY: [
    { to: 'REACTOR', from: { x: 350, y: 480 }, into: { x: 350, y: 376 }, door: { x: 350, y: 430 } },
    { to: 'BRIDGE',  from: { x: 940, y: 480 }, into: { x: 940, y: 376 }, door: { x: 940, y: 430 } },
    { to: 'SCI_LAB', from: { x: 1540, y: 480 }, into: { x: 1540, y: 376 }, door: { x: 1540, y: 430 } },
    { to: 'ENGINE',  from: { x: 430, y: 480 }, into: { x: 430, y: 584 }, door: { x: 430, y: 530 } },
    { to: 'COMMS',   from: { x: 1370, y: 480 }, into: { x: 1370, y: 584 }, door: { x: 1370, y: 530 } }
  ],
  ENGINE: [
    { to: 'HALLWAY', from: { x: 430, y: 584 }, into: { x: 430, y: 480 }, door: { x: 430, y: 530 } },
    { to: 'COMMS',   from: { x: 856, y: 730 }, into: { x: 964, y: 730 }, door: { x: 910, y: 730 } }
  ],
  COMMS: [
    { to: 'HALLWAY', from: { x: 1370, y: 584 }, into: { x: 1370, y: 480 }, door: { x: 1370, y: 530 } },
    { to: 'ENGINE',  from: { x: 964, y: 730 }, into: { x: 856, y: 730 }, door: { x: 910, y: 730 } }
  ]
};

function findFirstShipDoor(startRoom, goalRoom, allowLocked = false) {
  if (startRoom === goalRoom) return null;
  const visited = new Set([startRoom]);
  const queue = [];
  for (const edge of (ROOM_DOORS[startRoom] || [])) {
    const door = getDoorAt(edge.door.x, edge.door.y);
    if (!allowLocked && door?.locked) continue;
    queue.push({ room: edge.to, firstEdge: edge });
    visited.add(edge.to);
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.room === goalRoom) return cur.firstEdge;
    for (const edge of (ROOM_DOORS[cur.room] || [])) {
      const door = getDoorAt(edge.door.x, edge.door.y);
      if (!allowLocked && door?.locked) continue;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ room: edge.to, firstEdge: cur.firstEdge });
      }
    }
  }
  return null;
}

function pointNearSeg(px, py, ax, ay, bx, by, maxPerpDist) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1) return false;
  const t = ((px - ax) * vx + (py - ay) * vy) / lenSq;
  if (t < -0.1 || t > 1.05) return false;
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  return Math.hypot(px - projX, py - projY) <= maxPerpDist;
}

function steerShipBot(b, tx, ty, dt) {
  let wx = tx;
  let wy = ty;

  // Use straight path only when cleanly unobstructed with 20px wall/table/locked-door margin
  if (!hasClearShipLOS(b.x, b.y, tx, ty, 20)) {
    const botRoom = getShipRoomId(b.x, b.y);
    const targetRoom = getShipRoomId(tx, ty);
    if (botRoom !== targetRoom) {
      const edge = findFirstShipDoor(botRoom, targetRoom, false) || findFirstShipDoor(botRoom, targetRoom, true);
      if (edge) {
        const door = getDoorAt(edge.door.x, edge.door.y);
        if (door?.locked && Math.hypot(b.x - door.x, b.y - door.y) < 88) {
          door.overrideProg = Math.min(1, (door.overrideProg || 0) + dt / 0.95);
          b.angle = Math.atan2(door.y - b.y, door.x - b.x);
          if (door.overrideProg >= 1) {
            door.locked = false;
            door.lockTimer = 0;
            door.overrideProg = 0;
            door.overriding = false;
            addFloatText(door.x, door.y - 24, `🔓 ${b.name} OVERRODE DOOR`, '#4ade80');
            playTone(540, 'triangle', 0.1, 0.08);
          }
          return Math.hypot(tx - b.x, ty - b.y);
        }
        const atApproach = Math.hypot(b.x - edge.from.x, b.y - edge.from.y) <= 18;
        const inDoorCorridor = pointNearSeg(b.x, b.y, edge.from.x, edge.from.y, edge.into.x, edge.into.y, 18);
        if (atApproach || inDoorCorridor) {
          wx = edge.into.x;
          wy = edge.into.y;
        } else {
          wx = edge.from.x;
          wy = edge.from.y;
        }
      }
    } else {
      // Bot just crossed a room boundary line while still inside wall doorway band: clear the nearest unlocked door portal first
      let nearestPortal = null;
      let bestDist = Infinity;
      for (const edge of (ROOM_DOORS[botRoom] || [])) {
        const door = getDoorAt(edge.door.x, edge.door.y);
        if (door?.locked) continue;
        const dDoor = Math.hypot(b.x - edge.door.x, b.y - edge.door.y);
        if (dDoor < 78 && dDoor < bestDist) {
          bestDist = dDoor;
          nearestPortal = edge.from;
        }
      }
      if (nearestPortal) {
        wx = nearestPortal.x;
        wy = nearestPortal.y;
      } else if (botRoom === 'BRIDGE') {
        wx = 940;
        wy = 270;
      }
    }
  }

  const dx = wx - b.x;
  const dy = wy - b.y;
  const d = Math.hypot(dx, dy);
  if (d > 6) {
    const step = Math.min(d, 210 * dt);
    b.angle = Math.atan2(dy, dx);
    b.walk += 0.2;
    moveCtrlPlayer(b, (dx / d) * step, (dy / d) * step);
  }
  return Math.hypot(tx - b.x, ty - b.y);
}

function triggerTransitSurge(surgeNum, os) {
  const isSolar = surgeNum === 2;
  const primaryIds = isSolar ? ['GROUND', 'LAUNCH', 'CALIB', 'SPACE'] : ['LAUNCH', 'SPACE', 'GROUND', 'CALIB'];
  let alerted = 0;
  for (const id of primaryIds) {
    if (alerted >= 2) break;
    const c = state.consoles.find(con => con.id === id);
    if (c && !c.alert) {
      c.alert = true;
      c.botProg = 0;
      alerted++;
    }
  }
  if (alerted < 2) {
    for (const c of state.consoles) {
      if (alerted >= 2) break;
      if (!c.alert && !(c.id === 'USER' && state.mccResult?.completed)) {
        c.alert = true;
        c.botProg = 0;
        alerted++;
      }
    }
  }

  // Lock 1-2 bulkhead doors away from any crewmate standing inside the doorway
  const candidateIds = isSolar
    ? ['BRIDGE_HALL', 'COMMS_HALL', 'SCILAB_HALL', 'ENGINE_COMMS']
    : ['REACTOR_HALL', 'ENGINE_HALL', 'ENGINE_COMMS', 'BRIDGE_HALL'];
  let lockedCount = 0;
  for (const doorId of candidateIds) {
    if (lockedCount >= 2) break;
    const d = DOORS.find(dr => dr.id === doorId);
    if (!d || d.locked) continue;
    const crewBlocking = state.ctrlPlayers.some(p => Math.hypot(p.x - d.x, p.y - d.y) < 38);
    if (crewBlocking) continue;
    d.locked = true;
    d.lockTimer = 15;
    d.overrideProg = 0;
    d.overriding = false;
    lockedCount++;
  }

  os.surgeFlashTimer = 0.85;
  os.interferenceTimer = Math.max(os.interferenceTimer || 0, isSolar ? 16 : 13);
  os.shipIntegrity = Math.max(15, (os.shipIntegrity ?? 100) - 8);
  state.screenShake = 0.42;

  const impactSpots = isSolar
    ? [
        { x: 1580, y: 890, age: 0, dur: 0.85, size: 120 },
        { x: 960, y: 76, age: -0.12, dur: 0.8, size: 102 }
      ]
    : [
        { x: 645, y: 892, age: 0, dur: 0.85, size: 124 },
        { x: 245, y: 78, age: -0.1, dur: 0.8, size: 96 },
        { x: 680, y: 720, age: -0.18, dur: 0.75, size: 92 }
      ];
  os.impacts.push(...impactSpots);

  for (const imp of impactSpots) {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      state.lunarParticles.push({
        x: imp.x,
        y: imp.y,
        vx: Math.cos(ang) * (50 + Math.random() * 80),
        vy: Math.sin(ang) * (50 + Math.random() * 80),
        life: 0.55,
        size: 3 + Math.random() * 3,
        color: i % 2 === 0 ? '#ef4444' : '#fde047'
      });
    }
  }

  playTone(isSolar ? 145 : 128, 'sawtooth', 0.34, 0.14);
  if (isSolar) {
    showMissionToast('☀️ SOLAR FLARE SURGE', 'Dual alerts + Ka-Band frequency drift & bulkhead lockdowns! Press [SPACE] to override doors.');
    logBlackBox('STAGE 2', 'Solar flare CME surge caused Ka-Band interference drift, dual alerts, and bulkhead lockdowns.', 'warn');
  } else {
    showMissionToast('☄️ MICROMETEOROID IMPACT', 'Dual alerts & bulkhead lockdown! Press [SPACE] at locked doors to override.');
    logBlackBox('STAGE 2', 'Micrometeoroid impact surge triggered dual console alerts and temporary bulkhead lockdowns.', 'warn');
  }
}

function updateActiveMiniGameLocal(dt, os, activeAlertCount) {
  const mg = state.activeMiniGame;
  if (!mg) return;
  if (mg.type === 'MCC_BURN' && !mg.completed) {
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) mg.currentPitch -= 28 * dt;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) mg.currentPitch += 28 * dt;
    mg.currentPitch = Math.max(-30, Math.min(80, mg.currentPitch));

    const keyBurn = Boolean(state.keys['KeyW'] || state.keys['ArrowUp']);
    const burning = mg.isBurning || keyBurn || mg.buttonHeld;
    if (burning) {
      const pitchError = Math.abs(mg.currentPitch - mg.targetPitch);
      const burnEfficiency = Math.max(0.25, 1.0 - pitchError / 40.0);
      const dV = 14.0 * burnEfficiency * dt;
      const correction = dV * 3.4;

      mg.burnedDeltaV = Math.min(mg.targetDeltaV, mg.burnedDeltaV + 14.0 * dt);
      mg.propellantUsed += 0.85 * dt;
      mg.bPlaneMissKm = Math.max(0, mg.bPlaneMissKm - correction);

      if (mg.bPlaneMissKm <= 0 || mg.burnedDeltaV >= mg.targetDeltaV) {
        completeMccBurn(mg);
      }
    }
  } else if (mg.type === 'DISTRIBUTOR') {
    for (let i = mg.ringIndex; i < 3; i++) {
      mg.angles[i] += mg.speeds[i] * dt;
    }
  } else if (mg.type === 'GROUND') {
    const interferenceActive = os.inEclipse || (os.interferenceTimer || 0) > 0 || activeAlertCount >= 2;
    if (interferenceActive) {
      mg.targetFreq = Math.max(0.2, Math.min(0.8, mg.targetFreq + Math.sin(performance.now() * 0.0024) * 0.055 * dt));
    }
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) mg.playerFreq = Math.max(0.1, mg.playerFreq - 0.35 * dt);
    if (state.keys['KeyD'] || state.keys['ArrowRight']) mg.playerFreq = Math.min(0.85, mg.playerFreq + 0.35 * dt);

    if (Math.abs(mg.playerFreq - mg.targetFreq) < 0.045) {
      mg.holdTime += dt * 0.72;
      if (mg.holdTime >= 1) {
        completeConsoleTask(mg.console, 'DATA DOWNLINKED! +95⭐', 95);
      }
    } else {
      mg.holdTime = Math.max(0, mg.holdTime - dt * 0.25);
    }
  }
}

function lerpAngleStage2(a, b, t) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

export function updateStage2GuestLocal(dt) {
  const os = state.orbitState || {};
  const activeAlertCount = state.consoles.filter(c => c.alert).length;
  const mySlot = getMyWsSlot();
  state.activeCrewIndex = mySlot;

  if (Array.isArray(os.asteroids)) {
    for (const ast of os.asteroids) {
      ast.x += ast.vx * dt;
      ast.y += ast.vy * dt;
      ast.rot += ast.vr * dt;
      if (ast.x < -120) ast.x = SHIP_W + 110;
      if (ast.x > SHIP_W + 120) ast.x = -110;
    }
  }

  for (let i = 0; i < state.ctrlPlayers.length; i++) {
    const pl = state.ctrlPlayers[i];
    if (!pl) continue;
    if (i === mySlot) {
      if (!state.activeMiniGame) {
        let mx = 0, my = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) my -= 1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) my += 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) mx -= 1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) mx += 1;
        if (mx !== 0 || my !== 0) {
          if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
          pl.angle = Math.atan2(my, mx);
          pl.walk = (pl.walk || 0) + 0.22 * (dt * 60);
          moveCtrlPlayer(pl, mx * 265 * dt, my * 265 * dt);
        }
      }
      if (typeof pl.netTx === 'number' && typeof pl.netTy === 'number') {
        const err = Math.hypot(pl.netTx - pl.x, pl.netTy - pl.y);
        if (err > 90) {
          pl.x = pl.netTx;
          pl.y = pl.netTy;
        } else if (err > 1.5) {
          const blend = Math.min(1, dt * 10);
          pl.x += (pl.netTx - pl.x) * blend;
          pl.y += (pl.netTy - pl.y) * blend;
        }
      }
    } else {
      if (typeof pl.netTx === 'number' && typeof pl.netTy === 'number') {
        const dx = pl.netTx - pl.x;
        const dy = pl.netTy - pl.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 160) {
          pl.x = pl.netTx;
          pl.y = pl.netTy;
        } else if (dist > 0.25) {
          const blend = Math.min(1, dt * 18);
          pl.x += dx * blend;
          pl.y += dy * blend;
          if (dist > 0.8) {
            pl.walk = (pl.walk || 0) + 0.22 * (dt * 60);
          }
        }
      }
      if (typeof pl.netAngle === 'number') {
        pl.angle = lerpAngleStage2(pl.angle || 0, pl.netAngle, Math.min(1, dt * 18));
      }
    }
  }

  if (state.activeMiniGame) {
    updateActiveMiniGameLocal(dt, os, activeAlertCount);
  }
  const lead = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  if (lead) {
    const targetCamX = Math.max(0, Math.min(SHIP_W - LOGICAL_W, lead.x - LOGICAL_W / 2));
    const targetCamY = Math.max(0, Math.min(SHIP_H - LOGICAL_H, lead.y - LOGICAL_H / 2));
    state.stage2Cam.x += (targetCamX - state.stage2Cam.x) * Math.min(1, dt * 7);
    state.stage2Cam.y += (targetCamY - state.stage2Cam.y) * Math.min(1, dt * 7);
  }
}

export function updateStage2(dt, onNextStage) {
  const scen = getScenario();
  const os = state.orbitState;
  const activeAlertCount = state.consoles.filter(c => c.alert).length;
  const quotaMet = os.tasksCompleted >= (os.minTasksRequired || 4) && activeAlertCount < 3;

  os.surgeFlashTimer = Math.max(0, (os.surgeFlashTimer || 0) - dt);
  os.interferenceTimer = Math.max(0, (os.interferenceTimer || 0) - dt);

  if (Array.isArray(os.impacts)) {
    for (let i = os.impacts.length - 1; i >= 0; i--) {
      os.impacts[i].age += dt;
      if (os.impacts[i].age >= os.impacts[i].dur) os.impacts.splice(i, 1);
    }
  }

  if (Array.isArray(os.asteroids)) {
    for (const ast of os.asteroids) {
      ast.x += ast.vx * dt;
      ast.y += ast.vy * dt;
      ast.rot += ast.vr * dt;
      if (ast.x < -120) ast.x = SHIP_W + 110;
      if (ast.x > SHIP_W + 120) ast.x = -110;
    }
  }

  for (const d of DOORS) {
    if (d.locked) {
      d.lockTimer -= dt;
      if (d.lockTimer <= 0) {
        d.locked = false;
        d.lockTimer = 0;
        d.overrideProg = 0;
        d.overriding = false;
      }
    }
  }

  if (state.stageTimer <= 0) {
    state.stageTimer = 0;
    os.arrivalReady = true;
    if (state.activeMiniGame) {
      os.arrivalHold = 0;
    } else if (!quotaMet && os.overtimeHold < 10) {
      os.overtimeHold += dt;
      os.arrivalHold = 0;
      if (activeAlertCount === 0) {
        const calm = state.consoles.filter(c => !c.alert && !(c.id === 'USER' && state.mccResult?.completed));
        if (calm.length > 0) calm[Math.floor(Math.random() * calm.length)].alert = true;
      }
    } else {
      os.arrivalHold += dt;
      if (os.arrivalHold >= 2.6) {
        if (!state.mccResult?.completed) {
          state.mccResult = {
            completed: false,
            bPlaneMissKm: state.mccResult?.bPlaneMissKm ?? 120,
            nominalCapture: false,
            fuelPenaltyPct: 18,
            propellantBurnedKg: state.mccResult?.propellantBurnedKg ?? 0
          };
          logBlackBox('STAGE 2', 'MCC-1 burn uncompleted before Lunar Orbit Insertion (+18% Stage 3A descent fuel penalty).', 'warn');
        }
        if (!quotaMet) {
          state.telemetry.fuel = Math.max(35, state.telemetry.fuel - 10);
          logBlackBox('STAGE 2', `Unresolved ship alerts at Lunar Orbit Insertion cost -10% descent propellant.`, 'warn');
        } else {
          logBlackBox('STAGE 2', `Translunar cruise complete (${os.tasksCompleted} tasks, ${Math.round(os.battery)}% bus battery, ${Math.round(os.shipIntegrity)}% hull).`, 'good');
        }
        onNextStage();
        return;
      }
    }
  }

  os.progress = Math.min(1, 1 - (state.stageTimer / (os.stageDuration || 64)));
  const phase = (os.progress * 3) % 1;
  os.inEclipse = (phase > 0.35 && phase < 0.62);
  os.inGroundCone = (phase > 0.68 && phase < 0.92);
  os.inScanZone = (phase > 0.08 && phase < 0.32);

  if (os.progress >= 0.30 && !os.surge1Triggered) {
    os.surge1Triggered = true;
    triggerTransitSurge(1, os);
  }
  if (os.progress >= 0.70 && !os.surge2Triggered) {
    os.surge2Triggered = true;
    triggerTransitSurge(2, os);
  }

  if (os.inEclipse && !os.eclipseDilemmaShown) {
    os.eclipseDilemmaShown = true;
    triggerDilemma({
      id: 'ECLIPSE_LOADSHED',
      badge: 'Stage 2 • Engineering Decision',
      title: 'Lunar Umbra Eclipse Entered',
      stageTag: 'STAGE 2',
      prompt: 'Solar arrays just went dark behind the Moon. How should P2 manage spacecraft bus power?',
      options: [
        {
          label: 'Load-Shed Spectrometer',
          accent: '#4ade80',
          trade: '+24% Cruiser Battery & +25 Wh reserve for Lunar Rovers in Stage 3B.',
          lesson: 'Power rationing protects bus voltage and saves surface battery margin.'
        },
        {
          label: 'Full Instrument Power',
          accent: '#fde047',
          trade: '+55 Science bonus right now, but -18% Battery and triggers Reactor Wiring alert.',
          lesson: 'Maxing science during zero solar input strains the electrical bus.'
        }
      ]
    }, (idx) => {
      if (idx === 0) {
        os.battery = Math.min(100, os.battery + 24);
        state.missionChoices.roverBonusWh = 25;
        state.missionChoices.eclipse = 'Load-Shed';
        showMissionToast('Power Conserved', 'Bus battery +24% and +25 Wh transferred to Lunar Rovers.');
      } else {
        os.battery = Math.max(12, os.battery - 18);
        state.telemetry.science += 55;
        const reactor = state.consoles.find(c => c.id === 'SPACE');
        if (reactor) reactor.alert = true;
        state.missionChoices.eclipse = 'Full Science';
        showMissionToast('Full Science Power', '+55 Science gained! Check Reactor Bay for thermal load.');
      }
    });
    return;
  }

  const alertDrain = activeAlertCount * 0.9;
  const powerGen = (os.inEclipse
    ? (-3.2 * scen.eclipseDrainMul)
    : (2.2 + state.shippedModules.power_pack * 1.4)) - alertDrain;
  os.battery = Math.max(0, Math.min(100, os.battery + powerGen * dt));

  if (activeAlertCount >= 2) {
    os.shipIntegrity = Math.max(0, (os.shipIntegrity ?? 100) - (activeAlertCount - 1) * 1.65 * dt);
  } else if (activeAlertCount === 0 && (os.shipIntegrity ?? 100) < 100) {
    os.shipIntegrity = Math.min(100, (os.shipIntegrity ?? 100) + 0.6 * dt);
  }

  if (activeAlertCount >= 3 || os.battery < 22 || (os.shipIntegrity ?? 100) < 35) {
    os.alarmPulseCd = (os.alarmPulseCd || 0) - dt;
    if (os.alarmPulseCd <= 0) {
      os.alarmPulseCd = 1.9;
      playTone(195, 'sawtooth', 0.14, 0.08);
    }
  }

  if (os.battery <= 0 || (os.shipIntegrity ?? 100) <= 0) {
    os.battery = Math.max(35, os.battery);
    os.shipIntegrity = Math.max(55, os.shipIntegrity ?? 55);
    state.score = Math.max(0, state.score - 60);
    state.telemetry.fuel = Math.max(30, state.telemetry.fuel - 8);
    let cleared = 0;
    for (const c of state.consoles) {
      if (c.alert && cleared < 2) { c.alert = false; c.botProg = 0; cleared++; }
    }
    state.screenShake = 0.25;
    showMissionToast('Auxiliary Bus Reboot', 'Critical alert overload forced backup power reset (-60⭐, -8% fuel)!');
    logBlackBox('STAGE 2', 'Critical alert overload triggered Emergency Bus Reboot (-8% descent fuel).', 'warn');
  }

  if (os.inScanZone && os.dataBuffer < 98) {
    os.dataBuffer = Math.min(100, os.dataBuffer + (4.5 + state.shippedModules.sensor_pod * 1.5) * dt);
    state.telemetry.science += dt * (1.2 + state.shippedModules.sensor_pod * 0.8);
    state.telemetry.science = Math.round(state.telemetry.science * 10) / 10;
  }
  if (os.inGroundCone) {
    const downlinkRate = 5.0 + state.shippedModules.comms_relay * 2.5 + Math.max(0, state.telemetry.comms * 0.02);
    os.dataBuffer = Math.max(0, os.dataBuffer - downlinkRate * dt);
  }

  if (!os.arrivalReady) {
    os.eventTimer -= dt;
    if (os.eventTimer <= 0) {
      os.eventTimer = 5.4;
      if (os.inEclipse) state.consoles.find(c => c.id === 'SPACE').alert = true;
      else if (os.dataBuffer > 55) state.consoles.find(c => c.id === 'GROUND').alert = true;
      else {
        const calm = state.consoles.filter(c => !c.alert && !(c.id === 'USER' && state.mccResult?.completed));
        if (calm.length > 0) calm[Math.floor(Math.random() * calm.length)].alert = true;
      }
    }
  }

  // Active Among Us Mini-Game Update
  if (state.activeMiniGame) {
    updateActiveMiniGameLocal(dt, os, activeAlertCount);
  }

  if (isWsMultiplayer()) {
    const mySlot = getMyWsSlot();
    for (let i = 0; i < state.ctrlPlayers.length; i++) {
      const pl = state.ctrlPlayers[i];
      if (!pl) continue;
      if (i !== mySlot && !isHumanSlotInWs(i)) continue;
      if (i === mySlot && state.activeMiniGame) continue;
      const keys = getSlotKeys(i);
      let mx = 0, my = 0;
      if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) my += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
      if (mx !== 0 || my !== 0) {
        if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
        pl.angle = Math.atan2(my, mx);
        pl.walk += 0.22;
        moveCtrlPlayer(pl, mx * 265 * dt, my * 265 * dt);
      }
    }

    for (const d of DOORS) {
      if (!d.locked) continue;
      let someoneOverriding = false;
      for (let i = 0; i < state.ctrlPlayers.length; i++) {
        if (i !== mySlot && !isHumanSlotInWs(i)) continue;
        const pl = state.ctrlPlayers[i];
        const keys = getSlotKeys(i);
        if (Math.hypot(pl.x - d.x, pl.y - d.y) < 92 && (d.overriding || keys['Space'] || keys['KeyE'])) {
          someoneOverriding = true;
          break;
        }
      }
      if (someoneOverriding) {
        d.overrideProg = Math.min(1, (d.overrideProg || 0) + dt / 0.6);
        if (d.overrideProg >= 1) {
          d.locked = false;
          d.lockTimer = 0;
          d.overrideProg = 0;
          d.overriding = false;
          state.score += 20;
          addFloatText(d.x, d.y - 24, '🔓 DOOR OVERRIDDEN! +20⭐', '#4ade80');
          playTone(620, 'triangle', 0.12, 0.1);
        }
      } else if (d.overriding) {
        d.overriding = false;
      }
    }
  } else if (!state.activeMiniGame) {
    const p = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
    let mx = 0, my = 0;
    if (state.keys['KeyW'] || state.keys['ArrowUp']) my -= 1;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) my += 1;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) mx -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) mx += 1;
    if (mx !== 0 || my !== 0) {
      if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
      p.angle = Math.atan2(my, mx);
      p.walk += 0.22;
      moveCtrlPlayer(p, mx * 265 * dt, my * 265 * dt);
      broadcastNet({ type: 'CREW_INPUT', slot: state.activeCrewIndex, x: p.x, y: p.y, angle: p.angle });
    }

    for (const d of DOORS) {
      if (!d.locked) continue;
      const nearDoor = Math.hypot(p.x - d.x, p.y - d.y) < 92;
      if (nearDoor && (d.overriding || state.keys['Space'] || state.keys['KeyE'])) {
        d.overrideProg = Math.min(1, (d.overrideProg || 0) + dt / 0.6);
        if (d.overrideProg >= 1) {
          d.locked = false;
          d.lockTimer = 0;
          d.overrideProg = 0;
          d.overriding = false;
          state.score += 20;
          addFloatText(d.x, d.y - 24, '🔓 DOOR OVERRIDDEN! +20⭐', '#4ade80');
          playTone(620, 'triangle', 0.12, 0.1);
        }
      } else if (!nearDoor && d.overriding) {
        d.overriding = false;
      }
    }

    if (state.coopMode === 'LOCAL_2P') {
      const p2 = state.ctrlPlayers[1];
      let mx2 = 0, my2 = 0;
      if (state.keys['KeyI']) my2 -= 1;
      if (state.keys['KeyK']) my2 += 1;
      if (state.keys['KeyJ']) mx2 -= 1;
      if (state.keys['KeyL']) mx2 += 1;
      if (mx2 !== 0 || my2 !== 0) {
        if (mx2 !== 0 && my2 !== 0) { mx2 *= 0.7071; my2 *= 0.7071; }
        p2.angle = Math.atan2(my2, mx2);
        p2.walk += 0.22;
        moveCtrlPlayer(p2, mx2 * 265 * dt, my2 * 265 * dt);
      }
    }
  }

  // Smooth Camera following active crewmate
  const lead = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  const targetCamX = Math.max(0, Math.min(SHIP_W - LOGICAL_W, lead.x - LOGICAL_W / 2));
  const targetCamY = Math.max(0, Math.min(SHIP_H - LOGICAL_H, lead.y - LOGICAL_H / 2));
  state.stage2Cam.x += (targetCamX - state.stage2Cam.x) * Math.min(1, dt * 7);
  state.stage2Cam.y += (targetCamY - state.stage2Cam.y) * Math.min(1, dt * 7);

  // AI Crewmates roam rooms to assist consoles without stacking (never solo-clear MCC-1 USER or Hull Breach LAUNCH)
  if (state.coopMode === '4P_AI' || state.coopMode === 'LOCAL_2P' || state.coopMode === 'WS_4P') {
    const alerting = state.consoles.filter(
      c => c.alert && !c.needsWrench && c.id !== 'USER' && c.id !== 'LAUNCH' && (!state.activeMiniGame || state.activeMiniGame.console !== c)
    );
    const homeConsoles = ['LAUNCH', 'SPACE', 'CALIB', 'GROUND'];
    let alertIdx = 0;
    for (let i = 0; i < state.ctrlPlayers.length; i++) {
      if (isWsMultiplayer()) {
        if (i === getMyWsSlot() || isHumanSlotInWs(i)) continue;
      } else {
        if (i === state.activeCrewIndex) continue;
        if (state.coopMode === 'LOCAL_2P' && i === 1) continue;
      }
      const b = state.ctrlPlayers[i];
      const targetC = alerting.length > 0
        ? alerting[alertIdx++ % alerting.length]
        : state.consoles.find(c => c.id === homeConsoles[i % homeConsoles.length]);
      if (targetC) {
        const standX = targetC.x + ((i % 2 === 0 ? -1 : 1) * 18);
        const standY = targetC.y + 46;
        const dist = steerShipBot(b, standX, standY, dt);
        if (targetC.alert && !targetC.needsWrench && targetC.id !== 'USER' && targetC.id !== 'LAUNCH' && dist <= 36) {
          targetC.botProg += dt * 0.13;
          if (targetC.botProg >= 1) {
            targetC.alert = false;
            targetC.botProg = 0;
            state.score += 45;
            os.tasksCompleted++;
            os.shipIntegrity = Math.min(100, (os.shipIntegrity ?? 100) + 6);
            os.battery = Math.min(100, os.battery + 6);
            addFloatText(targetC.x, targetC.y - 38, `${b.name} RESOLVED! +45⭐`, '#fbbf24');
          }
        }
      }
    }
  }

  state.telemetry.science = Math.round(state.telemetry.science);
  updateBottomHUD();
}

function drawAsteroidSprite(ctx, ast) {
  const img = getAsset(ast.large ? 'asteroidLg' : 'asteroidSm');
  ctx.save();
  ctx.translate(ast.x, ast.y);
  ctx.rotate(ast.rot);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -ast.size / 2, -ast.size / 2, ast.size, ast.size);
  } else {
    const r = ast.size * 0.42;
    ctx.fillStyle = '#574232';
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.3);
    ctx.lineTo(-r * 0.3, -r);
    ctx.lineTo(r * 0.7, -r * 0.7);
    ctx.lineTo(r, r * 0.2);
    ctx.lineTo(r * 0.2, r);
    ctx.lineTo(-r * 0.8, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawShipBayDecorations(ctx, nowMs) {
  const glowPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.005);

  // Subtle inset metallic deck plating in each room
  ctx.save();
  for (const rm of ROOMS) {
    ctx.strokeStyle = rm.accent;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 2;
    ctx.strokeRect(rm.x + 12, rm.y + 12, rm.w - 24, rm.h - 24);
  }
  ctx.globalAlpha = 1;

  // Spine Deck transverse structural hull ribs
  ctx.fillStyle = '#273549';
  for (let rx = 160; rx < 1760; rx += 180) {
    ctx.fillRect(rx - 4, 434, 8, 92);
  }

  // Bay directional floor decals near doorways
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  const doorSigns = [
    { x: 350,  y: 454, txt: '▲ REACTOR', col: '#f59e0b' },
    { x: 940,  y: 454, txt: '▲ BRIDGE',  col: '#38bdf8' },
    { x: 1540, y: 454, txt: '▲ SCI LAB', col: '#a855f7' },
    { x: 430,  y: 514, txt: '▼ ENGINE',  col: '#ef4444' },
    { x: 1370, y: 514, txt: '▼ COMMS',   col: '#10b981' }
  ];
  for (const ds of doorSigns) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath(); ctx.roundRect(ds.x - 42, ds.y - 10, 84, 15, 4); ctx.fill();
    ctx.fillStyle = ds.col;
    ctx.fillText(ds.txt, ds.x, ds.y + 1);
  }

  // 1. REACTOR BAY: Glowing Fission Reactor Core + Coolant Manifolds
  const rcX = 485, rcY = 162;
  const rcGrad = ctx.createRadialGradient(rcX, rcY, 10, rcX, rcY, 54);
  rcGrad.addColorStop(0, `rgba(245, 158, 11, ${0.42 + glowPulse * 0.25})`);
  rcGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = rcGrad;
  ctx.beginPath(); ctx.arc(rcX, rcY, 54, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(rcX, rcY, 36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(rcX, rcY, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = `rgba(253, 224, 71, ${0.65 + glowPulse * 0.35})`;
  ctx.beginPath(); ctx.arc(rcX, rcY, 11, 0, Math.PI * 2); ctx.fill();
  // Coolant feed pipes along upper Reactor bulkhead
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(115, 92); ctx.lineTo(485, 92); ctx.lineTo(485, 126); ctx.stroke();
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(115, 92); ctx.lineTo(485, 92); ctx.lineTo(485, 126); ctx.stroke();

  // 2. BRIDGE: Panoramic Starfield & Asteroid Viewports + Helm Crew Seats
  const astLg = getAsset('asteroidLg');
  const astSm = getAsset('asteroidSm');
  for (const wx of [735, 1145]) {
    ctx.save();
    ctx.fillStyle = '#030712';
    ctx.beginPath(); ctx.roundRect(wx - 74, 64, 148, 22, 6); ctx.fill();
    ctx.clip();
    const drift = ((nowMs * 0.025 + wx) % 210) - 35;
    ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.fillRect(wx - 58 + (drift * 0.2) % 120, 69, 2, 2);
    ctx.fillRect(wx + 8 - (drift * 0.15) % 80, 74, 2, 2);
    ctx.fillRect(wx + 34, 71, 3, 3);
    const vpAst = wx < 900 ? astLg : astSm;
    const ax = wx + 82 - drift;
    const ay = 75 + Math.sin(nowMs * 0.0018 + wx) * 3;
    if (vpAst && vpAst.complete && vpAst.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(vpAst, ax - 10, ay - 10, 20, 20);
    } else {
      ctx.fillStyle = '#78553a';
      ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(wx - 74, 64, 148, 22, 6); ctx.stroke();
  }
  for (const seatX of [810, 1070]) {
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(seatX - 18, 222, 36, 24, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(seatX - 12, 240, 24, 6);
  }

  // 3. SCIENCE LAB: Cryo-Sample Containment Rack + Spectroscopy Workbench
  ctx.fillStyle = '#1e1b4b'; ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(1310, 96, 118, 40, 8); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#c084fc';
    ctx.beginPath(); ctx.arc(1330 + i * 26, 116, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(1660, 96, 112, 42, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(1672, 106, 36, 20);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(1716, 108, 42, 16);

  // 4. ENGINEERING BAY: Twin Ion Thruster Bells + Hazard Caution Border + Tool Lockers
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)'; ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(92, 550, 796, 340);
  ctx.setLineDash([]);
  // Tool lockers beside Engine Wrench Rack
  ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(102, 566, 94, 34, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(112, 574, 22, 18); ctx.fillRect(142, 574, 22, 18);
  // Twin Thruster Core Chambers along rear Engine bulkhead
  for (const tx of [185, 345]) {
    const tGrad = ctx.createRadialGradient(tx, 855, 6, tx, 855, 42);
    tGrad.addColorStop(0, `rgba(56, 189, 248, ${0.45 + glowPulse * 0.25})`);
    tGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = tGrad;
    ctx.beginPath(); ctx.arc(tx, 855, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(tx - 32, 828, 64, 48, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(tx, 852, 13, 0, Math.PI * 2); ctx.fill();
  }

  // 5. COMMS & AIRLOCK: EVA Suit Lockers + Circular Floor Airlock Hatch + Telemetry Array
  ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(985, 558, 152, 38, 8); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.roundRect(1002 + i * 44, 566, 26, 22, 5); ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(1007 + i * 44, 570, 16, 6);
  }
  // Floor Airlock Hatch
  const ax = 1210, ay = 785;
  ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(ax, ay, 48, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(ax, ay, 36, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.arc(ax, ay, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9.5px JetBrains Mono, monospace';
  ctx.fillText('EVA AIRLOCK', ax, ay + 62);
  // Deep-Space Relay Rack
  ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(1675, 795, 96, 68, 8); ctx.fill(); ctx.stroke();
  for (let r = 0; r < 3; r++) {
    ctx.fillStyle = (Math.floor(nowMs / 400) + r) % 2 === 0 ? '#4ade80' : '#0ea5e9';
    ctx.beginPath(); ctx.arc(1694 + r * 24, 816, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawStage2(ctx) {
  const nowMs = performance.now();
  // Layered deep-space parallax backdrop
  ctx.fillStyle = '#050814';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  const spaceBack = getAsset('spaceBack');
  const spaceStars = getAsset('spaceStars');
  const spacePlanet = getAsset('spacePlanet');
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (spaceBack && spaceBack.complete && spaceBack.naturalWidth > 0) {
    const bx = -((state.stage2Cam.x * 0.08) % LOGICAL_W);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(spaceBack, bx, 0, LOGICAL_W, LOGICAL_H);
    ctx.drawImage(spaceBack, bx + LOGICAL_W, 0, LOGICAL_W, LOGICAL_H);
  }
  if (spaceStars && spaceStars.complete && spaceStars.naturalWidth > 0) {
    const sx = -((state.stage2Cam.x * 0.14 + nowMs * 0.012) % LOGICAL_W);
    ctx.globalAlpha = 0.88;
    ctx.drawImage(spaceStars, sx, 0, LOGICAL_W, LOGICAL_H);
    ctx.drawImage(spaceStars, sx + LOGICAL_W, 0, LOGICAL_W, LOGICAL_H);
  }
  if (spacePlanet && spacePlanet.complete && spacePlanet.naturalWidth > 0) {
    ctx.globalAlpha = 0.55;
    const pW = LOGICAL_W * 1.15;
    const pH = LOGICAL_H * 0.78;
    ctx.drawImage(spacePlanet, -state.stage2Cam.x * 0.05, LOGICAL_H - pH + 70 - state.stage2Cam.y * 0.04, pW, pH);
  }
  ctx.restore();

  drawStarfield(ctx, CRUISE_STARS, LOGICAL_W, LOGICAL_H, {
    offsetX: state.stage2Cam.x * 0.14,
    offsetY: state.stage2Cam.y * 0.14,
    nowSec: nowMs * 0.001
  });

  ctx.save();
  ctx.translate(-state.stage2Cam.x, -state.stage2Cam.y);

  // Drifting transit asteroids in outer space outside ship hull
  if (Array.isArray(state.orbitState?.asteroids)) {
    for (const ast of state.orbitState.asteroids) {
      drawAsteroidSprite(ctx, ast);
    }
  }

  // Outer Hull Shell
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.roundRect(62, 62, SHIP_W - 124, SHIP_H - 124, 28); ctx.fill(); ctx.stroke();

  // Named Ship Bays
  for (const rm of ROOMS) {
    ctx.fillStyle = rm.floor;
    ctx.fillRect(rm.x, rm.y, rm.w, rm.h);
    // Floor tile grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let gx = rm.x; gx < rm.x + rm.w; gx += 60) {
      ctx.beginPath(); ctx.moveTo(gx, rm.y); ctx.lineTo(gx, rm.y + rm.h); ctx.stroke();
    }
    ctx.fillStyle = rm.accent;
    ctx.globalAlpha = 0.24;
    ctx.font = 'bold 20px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rm.name, rm.x + rm.w / 2, rm.y + 34);
    ctx.globalAlpha = 1;
  }

  drawShipBayDecorations(ctx, nowMs);

  // Conduits along Spine Deck
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(245, 195); ctx.lineTo(245, 480); ctx.lineTo(1560, 480); ctx.lineTo(1560, 710);
  ctx.moveTo(940, 210); ctx.lineTo(940, 480);
  ctx.moveTo(680, 720); ctx.lineTo(680, 480);
  ctx.stroke();

  // Sliding Airlock Doors & Locked Bulkheads with proximity LEDs
  const activeCrewForDoor = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  for (const d of DOORS) {
    const span = d.span || 120;
    const halfSpan = span / 2;
    if (d.locked) {
      const col = getDoorCollider(d);
      const nearLocked = activeCrewForDoor && Math.hypot(activeCrewForDoor.x - d.x, activeCrewForDoor.y - d.y) < 92;
      ctx.save();
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = nearLocked ? '#fde047' : '#ef4444';
      ctx.lineWidth = nearLocked ? 3 : 2;
      ctx.fillRect(col.x, col.y, col.w, col.h);
      ctx.strokeRect(col.x, col.y, col.w, col.h);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = nearLocked ? '#fde047' : '#ef4444';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(d.x - 56, d.y - 16, 112, 32, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = nearLocked ? '#fde047' : '#fca5a5';
      ctx.font = 'bold 9.5px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(nearLocked ? '🔒 [SPACE] OVERRIDE' : '🔒 LOCKED', d.x, d.y + (d.overrideProg > 0 ? -1 : 3));
      if (d.overrideProg > 0) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(d.x - 44, d.y + 4, 88, 6);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(d.x - 44, d.y + 4, 88 * Math.min(1, d.overrideProg), 6);
      }
      ctx.restore();
    } else {
      const open = state.ctrlPlayers.some(p => Math.hypot(p.x - d.x, p.y - d.y) < 110);
      if (!open) {
        ctx.fillStyle = '#0284c7';
        ctx.globalAlpha = 0.35;
        if (d.vertical) ctx.fillRect(d.x - 4, d.y - halfSpan + 2, 8, span - 4);
        else ctx.fillRect(d.x - halfSpan + 2, d.y - 4, span - 4, 8);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = open ? '#4ade80' : '#f59e0b';
      if (d.vertical) {
        ctx.beginPath(); ctx.arc(d.x, d.y - halfSpan, 4, 0, Math.PI * 2); ctx.arc(d.x, d.y + halfSpan, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(d.x - halfSpan, d.y, 4, 0, Math.PI * 2); ctx.arc(d.x + halfSpan, d.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Bulkhead Walls
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  for (const w of WALLS) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // Translunar Trajectory Holo-Table in Bridge
  const hx = 670, hy = 86;
  ctx.fillStyle = '#091122';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.roundRect(hx, hy, 540, 120, 16); ctx.fill(); ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.fillRect(hx + 95, hy + 8, 105, 104);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(hx + 210, hy + 8, 120, 104);
  ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
  ctx.fillRect(hx + 340, hy + 8, 105, 104);

  ctx.font = 'bold 9.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#38bdf8'; ctx.fillText('SCAN ZONE', hx + 148, hy + 22);
  ctx.fillStyle = '#94a3b8'; ctx.fillText('ECLIPSE', hx + 270, hy + 22);
  ctx.fillStyle = '#4ade80'; ctx.fillText('DOWNLINK', hx + 392, hy + 22);

  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(hx + 50, hy + 68, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(hx + 490, hy + 68, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#38bdf8'; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(hx + 75, hy + 68); ctx.quadraticCurveTo(hx + 270, hy + 24, hx + 468, hy + 68); ctx.stroke();
  ctx.setLineDash([]);
  const sx = hx + 75 + state.orbitState.progress * 393;
  const sy = hy + 68 - Math.sin(state.orbitState.progress * Math.PI) * 22;
  ctx.fillStyle = '#fde047';
  ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();

  // Physical Wrench Rack in Engine Room
  const activeCrew = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  const breachActive = state.consoles.some(c => c.id === 'LAUNCH' && c.alert);
  const wrenchNeeded = breachActive && activeCrew && !activeCrew.hasWrench && state.wrenchRack.available;
  const nearRack = activeCrew && Math.hypot(activeCrew.x - state.wrenchRack.x, activeCrew.y - state.wrenchRack.y) < 64;

  ctx.fillStyle = wrenchNeeded ? '#422006' : '#334155';
  ctx.strokeStyle = wrenchNeeded ? '#facc15' : state.wrenchRack.available ? '#fde047' : '#475569';
  ctx.lineWidth = wrenchNeeded ? 4 : 3;
  ctx.beginPath(); ctx.roundRect(state.wrenchRack.x - 56, state.wrenchRack.y - 26, 112, 52, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(state.wrenchRack.available ? '🔧 TOOL RACK' : 'RACK EMPTY', state.wrenchRack.x, state.wrenchRack.y + 4);
  if (nearRack && state.wrenchRack.available) {
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif';
    ctx.fillText('PRESS [SPACE] TO GRAB 🔧', state.wrenchRack.x, state.wrenchRack.y - 34);
  }

  // Interactive Segment Consoles
  for (const c of state.consoles) {
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
    const inRange = activeCrew && Math.hypot(activeCrew.x - c.x, activeCrew.y - c.y) < 82;
    if (c.alert) {
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + pulse * 0.45})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.roundRect(c.x - 90, c.y - 44, 180, 88, 18); ctx.stroke();
    }
    ctx.fillStyle = c.alert ? '#7f1d1d' : '#1e293b';
    ctx.strokeStyle = inRange ? '#fde047' : c.alert ? '#ef4444' : c.color;
    ctx.lineWidth = inRange ? 4.5 : 3.5;
    ctx.beginPath(); ctx.roundRect(c.x - 80, c.y - 34, 160, 68, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(c.label, c.x, c.y - 4);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '11px Fredoka, sans-serif';
    ctx.fillText(c.sub, c.x, c.y + 14);

    if (c.alert) {
      const needWrenchHere = c.needsWrench && (!activeCrew || !activeCrew.hasWrench);
      ctx.fillStyle = needWrenchHere ? '#fb923c' : inRange ? '#4ade80' : '#fde047';
      ctx.font = 'bold 12px Fredoka, sans-serif';
      const promptTxt = needWrenchHere
        ? '🔧 GRAB WRENCH IN ENGINE FIRST!'
        : inRange
          ? '🟢 PRESS [SPACE] OR CLICK NOW!'
          : '⚠️ ALERT: GO HERE';
      ctx.fillText(promptTxt, c.x, c.y - 48);
      if (c.botProg > 0.02 && !c.needsWrench && c.id !== 'USER' && c.id !== 'LAUNCH') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(c.x - 42, c.y + 24, 84, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(c.x - 42, c.y + 24, 84 * Math.min(1, c.botProg), 6);
      }
    }
  }

  // Depth-sorted Crewmates
  [...state.ctrlPlayers]
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => a.p.y - b.p.y)
    .forEach(({ p, idx }) => drawChibiEngineer(ctx, p, idx === state.activeCrewIndex));

  // Hull Impact Explosion Sprite Bursts
  if (Array.isArray(state.orbitState?.impacts)) {
    for (const imp of state.orbitState.impacts) {
      const prog = imp.age / imp.dur;
      if (prog >= 0 && prog <= 1) {
        drawExplosionSprite(ctx, imp.x, imp.y, prog, imp.size);
      }
    }
  }

  ctx.restore();

  // Top-Left Ship Task Checklist Card + Red Emergency Lighting Pulse (screen space)
  const alertList = state.consoles.filter(c => c.alert);
  const os = state.orbitState;
  const minQuota = os.minTasksRequired || 4;
  const quotaDone = os.tasksCompleted >= minQuota;
  const redAlert = alertList.length >= 3 || os.battery < 25 || (os.shipIntegrity ?? 100) < 35;

  if (redAlert || (os.surgeFlashTimer || 0) > 0) {
    const surgeFlash = (os.surgeFlashTimer || 0) > 0 ? Math.min(0.42, os.surgeFlashTimer * 0.5) : 0;
    const alarmAlpha = Math.max(surgeFlash, redAlert ? 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(performance.now() * 0.012)) : 0);
    ctx.save();
    ctx.fillStyle = `rgba(220, 38, 38, ${alarmAlpha})`;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + alarmAlpha * 2})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, LOGICAL_W - 8, LOGICAL_H - 8);
    ctx.restore();
  }

  const cardH = 56 + Math.max(1, Math.min(3, alertList.length)) * 22 + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = redAlert ? '#ef4444' : alertList.length > 0 ? '#f59e0b' : '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(14, 14, 304, cardH, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = redAlert ? '#fca5a5' : alertList.length > 0 ? '#fde047' : '#4ade80';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`SHIP QUOTA: ${os.tasksCompleted}/${minQuota} ${quotaDone ? '✅' : '⏳'} • ${alertList.length} ALERT${alertList.length === 1 ? '' : 'S'}`, 26, 34);
  ctx.fillStyle = (os.shipIntegrity ?? 100) < 45 ? '#f87171' : '#94a3b8';
  ctx.font = 'bold 11px Fredoka, sans-serif';
  ctx.fillText(`🛡️ Hull Integrity: ${Math.round(os.shipIntegrity ?? 100)}% • 🔋 Bus: ${Math.round(os.battery)}%`, 26, 52);

  if (alertList.length === 0) {
    ctx.fillStyle = '#cbd5e1'; ctx.font = '11.5px Fredoka, sans-serif';
    ctx.fillText('✅ All bays clear. Patrol or stand by.', 26, 74);
  } else {
    alertList.slice(0, 3).forEach((c, idx) => {
      const needW = c.needsWrench && (!activeCrew || !activeCrew.hasWrench);
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 11.5px Fredoka, sans-serif';
      const line = needW
        ? `${idx + 1}. Engine Tool Rack 🔧 → ${c.label}`
        : `${idx + 1}. ${c.room}: ${c.label}`;
      ctx.fillText(line, 26, 74 + idx * 22);
    });
  }

  // Off-Screen Directional Waypoint Arrows pointing to Alerting Consoles (or Wrench Rack)
  if (!state.activeMiniGame) {
    const waypoints = alertList.map(c => {
      const needW = c.needsWrench && (!activeCrew || !activeCrew.hasWrench);
      return needW
        ? { x: state.wrenchRack.x, y: state.wrenchRack.y, label: '🔧 WRENCH', col: '#facc15' }
        : { x: c.x, y: c.y, label: c.label, col: '#ef4444' };
    });
    for (const wp of waypoints) {
      const sx = wp.x - state.stage2Cam.x;
      const sy = wp.y - state.stage2Cam.y;
      if (sx >= 50 && sx <= LOGICAL_W - 50 && sy >= 50 && sy <= LOGICAL_H - 65) continue;

      const cx = LOGICAL_W / 2, cy = LOGICAL_H / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const padX = LOGICAL_W / 2 - 95;
      const padY = LOGICAL_H / 2 - 80;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      const tX = Math.abs(cosA) > 0.001 ? padX / Math.abs(cosA) : 9999;
      const tY = Math.abs(sinA) > 0.001 ? padY / Math.abs(sinA) : 9999;
      const tEdge = Math.min(tX, tY);
      const ax = cx + cosA * tEdge;
      const ay = cy + sinA * tEdge;
      const distM = Math.round(Math.hypot(wp.x - (activeCrew?.x || wp.x), wp.y - (activeCrew?.y || wp.y)) / 10);

      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = wp.col;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-64, -18, 128, 36, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = wp.col;
      ctx.font = 'bold 11px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠️ ${wp.label}`, 0, -2);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 10px Fredoka, sans-serif';
      ctx.fillText(`${distM}m away`, 0, 12);

      // Directional chevron on outer side of pill
      ctx.rotate(ang);
      ctx.fillStyle = wp.col;
      ctx.beginPath();
      ctx.moveTo(76, 0);
      ctx.lineTo(65, -8);
      ctx.lineTo(65, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Top-Right Ship Radar Minimap (screen space)
  const mmW = 190, mmH = 100, mmX = LOGICAL_W - mmW - 14, mmY = 14;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(mmX, mmY, mmW, mmH, 10); ctx.fill(); ctx.stroke();
  const sxScale = mmW / SHIP_W, syScale = mmH / SHIP_H;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  for (const rm of ROOMS) {
    ctx.strokeRect(mmX + rm.x * sxScale, mmY + rm.y * syScale, rm.w * sxScale, rm.h * syScale);
  }
  for (const d of DOORS) {
    if (!d.locked) continue;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(mmX + d.x * sxScale - 3, mmY + d.y * syScale - 3, 6, 6);
  }
  for (const c of state.consoles) {
    ctx.fillStyle = c.alert ? '#ef4444' : '#4ade80';
    ctx.beginPath(); ctx.arc(mmX + c.x * sxScale, mmY + c.y * syScale, c.alert ? 4.5 : 2.5, 0, Math.PI * 2); ctx.fill();
  }
  state.ctrlPlayers.forEach((p, i) => {
    ctx.fillStyle = i === state.activeCrewIndex ? '#fde047' : p.color;
    ctx.beginPath(); ctx.arc(mmX + p.x * sxScale, mmY + p.y * syScale, i === state.activeCrewIndex ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
  });

  // Among Us Overlay Mini-Game Panel (screen space centered)
  if (state.activeMiniGame) {
    const mx = LOGICAL_W / 2, my = LOGICAL_H / 2 + 12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(mx - 220, my - 145, 440, 290, 18); ctx.fill(); ctx.stroke();

    // Close [X] button
    ctx.fillStyle = '#334155';
    ctx.beginPath(); ctx.roundRect(mx + 180, my - 133, 26, 26, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('✕', mx + 193, my - 115);

    const mg = state.activeMiniGame;
    const wireLabels = ['RED', 'BLU', 'YLW', 'GRN'];
    if (mg.type === 'WIRES') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText('TASK: PATCH REACTOR WIRES', mx, my - 112);
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif';
      ctx.fillText(
        mg.selectedLeft === null
          ? '1) Click a LEFT color block (or press [SPACE])'
          : `2) Now click matching RIGHT [${wireLabels[mg.selectedLeft]}] block!`,
        mx,
        my - 91
      );

      for (let i = 0; i < 4; i++) {
        const ly = my - 65 + i * 48;
        const rIdx = mg.rightOrder.indexOf(i);
        const ry = my - 65 + rIdx * 48;
        if (mg.matched[i]) {
          ctx.strokeStyle = WIRE_COLORS[i];
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(mx - 140, ly); ctx.lineTo(mx + 140, ry); ctx.stroke();
        } else if (mg.selectedLeft === i) {
          ctx.strokeStyle = WIRE_COLORS[i];
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(mx - 118, ly); ctx.lineTo(mx + 118, ry); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      for (let i = 0; i < 4; i++) {
        const y = my - 65 + i * 48;
        ctx.fillStyle = WIRE_COLORS[i];
        ctx.strokeStyle = mg.selectedLeft === i ? '#fff' : '#0f172a';
        ctx.lineWidth = mg.selectedLeft === i ? 4 : 2.5;
        ctx.beginPath(); ctx.roundRect(mx - 166, y - 14, 52, 28, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 11px Fredoka, sans-serif';
        ctx.fillText(wireLabels[i], mx - 140, y + 4);

        const rColIdx = mg.rightOrder[i];
        ctx.fillStyle = WIRE_COLORS[rColIdx];
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(mx + 114, y - 14, 52, 28, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.fillText(wireLabels[rColIdx], mx + 140, y + 4);
      }
    } else if (mg.type === 'DISTRIBUTOR') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText('TASK: CALIBRATE DISTRIBUTOR', mx, my - 112);
      const norm = ((mg.angles[mg.ringIndex] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const inHitWindow = Math.min(norm, Math.PI * 2 - norm) <= 0.55;
      ctx.fillStyle = inHitWindow ? '#4ade80' : '#fde047';
      ctx.font = 'bold 12.5px Fredoka, sans-serif';
      ctx.fillText(
        inHitWindow ? '🟢 IN GREEN ZONE: PRESS [SPACE] OR CLICK!' : 'Wait for the orange dot to cross the GREEN wedge!',
        mx,
        my - 91
      );

      // Green alignment window at right (angle 0)
      ctx.fillStyle = inHitWindow ? 'rgba(74, 222, 128, 0.45)' : 'rgba(74, 222, 128, 0.25)';
      ctx.beginPath(); ctx.arc(mx, my + 12, 96, -0.45, 0.45); ctx.lineTo(mx, my + 12); ctx.closePath(); ctx.fill();

      const radii = [38, 62, 86];
      for (let i = 0; i < 3; i++) {
        const rad = radii[i];
        ctx.strokeStyle = mg.locked[i] ? '#4ade80' : (i === mg.ringIndex ? '#fde047' : '#475569');
        ctx.lineWidth = i === mg.ringIndex ? 6 : 4;
        ctx.beginPath(); ctx.arc(mx, my + 12, rad, 0, Math.PI * 2); ctx.stroke();

        const ang = mg.angles[i];
        const nx = mx + Math.cos(ang) * rad;
        const ny = my + 12 + Math.sin(ang) * rad;
        ctx.fillStyle = mg.locked[i] ? '#4ade80' : '#f97316';
        ctx.beginPath(); ctx.arc(nx, ny, 8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mg.type === 'MCC_BURN') {
      const pitchError = Math.abs(mg.currentPitch - mg.targetPitch);
      const burnEfficiency = Math.max(0.25, 1.0 - pitchError / 40.0);
      const burning = !mg.completed && (mg.isBurning || Boolean(state.keys['KeyW'] || state.keys['ArrowUp']) || mg.buttonHeld);
      const inCorridor = mg.bPlaneMissKm <= mg.captureThresholdKm;
      const marginalCorridor = mg.bPlaneMissKm <= 75;

      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 14px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GMAT TRAJECTORY TRIM: MCC-1 BURN', mx - 10, my - 116);

      // Left B-Plane Plot inside 440x290 panel
      const plotX = mx - 204, plotY = my - 96, plotW = 204, plotH = 166;
      ctx.fillStyle = '#091122';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(plotX, plotY, plotW, plotH, 8); ctx.fill(); ctx.stroke();

      const targetX = plotX + 46;
      const targetY = plotY + 90;
      const offsetScale = 1.15;
      const corridorR = mg.captureThresholdKm * offsetScale;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.16)';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(targetX, targetY, corridorR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX + 8, targetY); ctx.lineTo(plotX + plotW - 8, targetY);
      ctx.moveTo(targetX, plotY + 24); ctx.lineTo(targetX, plotY + plotH - 8);
      ctx.stroke();

      ctx.fillStyle = '#4ade80'; ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('LUNAR B-PLANE CORRIDOR (±25 km)', plotX + plotW / 2, plotY + 15);

      const curX = Math.max(plotX + 10, Math.min(plotX + plotW - 10, targetX + mg.bPlaneMissKm * offsetScale));
      const curY = Math.max(plotY + 26, Math.min(plotY + plotH - 10, targetY - (mg.currentPitch - mg.targetPitch) * 1.6));

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(targetX, targetY); ctx.lineTo(curX, curY); ctx.stroke();
      ctx.setLineDash([]);

      if (burning) {
        ctx.fillStyle = 'rgba(251, 146, 60, 0.35)';
        ctx.beginPath(); ctx.arc(curX, curY, 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = inCorridor ? '#22c55e' : marginalCorridor ? '#f59e0b' : '#ef4444';
      ctx.beginPath(); ctx.arc(curX, curY, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.5; ctx.stroke();

      // Right Telemetry Readouts & Delta-V Progress Bar
      const rx = mx + 12;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 12px Fredoka, sans-serif';
      ctx.fillText(`Target Pitch: ${mg.targetPitch.toFixed(1)}°`, rx, my - 80);

      ctx.fillStyle = pitchError <= 3.0 ? '#4ade80' : pitchError <= 10.0 ? '#fbbf24' : '#f87171';
      ctx.fillText(`Current Pitch: ${mg.currentPitch.toFixed(1)}°`, rx, my - 59);

      ctx.fillStyle = burnEfficiency >= 0.85 ? '#4ade80' : '#fbbf24';
      ctx.fillText(`Align Eff: ${Math.round(burnEfficiency * 100)}%`, rx, my - 38);

      ctx.fillStyle = inCorridor ? '#4ade80' : marginalCorridor ? '#fbbf24' : '#f87171';
      ctx.fillText(`B-Plane Miss: ${mg.bPlaneMissKm.toFixed(1)} km`, rx, my - 15);

      const barW = 194, barH = 20, barY = my + 4;
      const dvPct = Math.min(1, mg.burnedDeltaV / mg.targetDeltaV);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(rx, barY, barW, barH, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = inCorridor ? '#22c55e' : '#38bdf8';
      if (dvPct > 0) {
        ctx.beginPath(); ctx.roundRect(rx, barY, Math.max(8, barW * dvPct), barH, 6); ctx.fill();
      }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`ΔV: ${mg.burnedDeltaV.toFixed(1)} / ${mg.targetDeltaV.toFixed(1)} m/s`, rx + barW / 2, barY + 14);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 11.5px Fredoka, sans-serif';
      ctx.fillText(`Propellant: ${mg.propellantUsed.toFixed(1)} kg`, rx, my + 42);

      ctx.fillStyle = burning ? '#fb923c' : pitchError <= 3.0 ? '#4ade80' : '#fde047';
      ctx.fillText(
        burning ? 'STATUS: ENGINE FIRING' : pitchError <= 3.0 ? 'STATUS: PITCH LOCKED' : 'TRIM PITCH [A/D] FIRST',
        rx,
        my + 62
      );

      // Clickable FIRE THRUSTER Button
      const fireBtn = getMccFireButtonRect(mx, my);
      ctx.fillStyle = burning ? '#ea580c' : '#0284c7';
      ctx.strokeStyle = burning ? '#fde047' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(fireBtn.x, fireBtn.y, fireBtn.w, fireBtn.h, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(burning ? '>>> FIRING THRUSTER <<<' : '🔥 FIRE THRUSTER', mx, fireBtn.y + 21);

      ctx.fillStyle = '#cbd5e1'; ctx.font = 'bold 11px Fredoka, sans-serif';
      ctx.fillText('[A/D] Trim Pitch  •  Hold [W] / Click or [SPACE] Fire', mx, my + 130);
    } else if (mg.type === 'GROUND') {
      const waveSynced = Math.abs(mg.playerFreq - mg.targetFreq) < 0.045;
      const interferenceActive = os.inEclipse || (os.interferenceTimer || 0) > 0 || alertList.length >= 2;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText('KA-BAND WAVE ALIGNMENT', mx, my - 110);
      ctx.fillStyle = waveSynced ? '#4ade80' : '#fde047'; ctx.font = 'bold 12.5px Fredoka, sans-serif';
      ctx.fillText(
        waveSynced
          ? '🟢 LOCKED ON! HOLD STILL TO COMPLETE!'
          : interferenceActive
            ? '📡 SOLAR DRIFT: Track drifting GREEN wave with [A/D]!'
            : 'Hold [A] or [D] to match YELLOW wave to GREEN wave!',
        mx,
        my - 89
      );

      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < 320; i += 4) {
        const y = my + Math.sin(i * 0.08 * mg.targetFreq + performance.now() * 0.005) * 34;
        if (i === 0) ctx.moveTo(mx - 160 + i, y); else ctx.lineTo(mx - 160 + i, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 320; i += 4) {
        const y = my + Math.sin(i * 0.08 * mg.playerFreq + performance.now() * 0.005) * 34;
        if (i === 0) ctx.moveTo(mx - 160 + i, y); else ctx.lineTo(mx - 160 + i, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#1e293b'; ctx.fillRect(mx - 130, my + 82, 260, 16);
      ctx.fillStyle = waveSynced ? '#4ade80' : '#38bdf8'; ctx.fillRect(mx - 130, my + 82, 260 * mg.holdTime, 16);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Fredoka, sans-serif';
      ctx.fillText(`SYNC: ${Math.round(mg.holdTime * 100)}%`, mx, my + 94);
    } else if (mg.type === 'LAUNCH') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText('WRENCH BOLT TORQUE: TAP [SPACE] OR CLICK!', mx, my - 102);
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 42px Fredoka, sans-serif';
      ctx.fillText(`🔧 ${mg.boltsTightened} / ${mg.boltsNeeded}`, mx, my + 8);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(mx - 130, my + 60, 260, 16);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(mx - 130, my + 60, (260 * mg.boltsTightened) / mg.boltsNeeded, 16);
    }
  }

  // Smooth Lunar Orbit Arrival notice (never interrupts active task, holds if quota not met)
  if (state.orbitState.arrivalReady) {
    const quotaMet = os.tasksCompleted >= minQuota && alertList.length < 3;
    const overtimeLeft = Math.max(1, Math.ceil(10 - (os.overtimeHold || 0)));
    const secs = Math.max(1, Math.ceil(2.6 - state.orbitState.arrivalHold));
    const msg = state.activeMiniGame
      ? '🛸 LUNAR ORBIT READY: Finish active task to begin descent'
      : (!quotaMet && (os.overtimeHold || 0) < 10)
        ? `⚠️ ORBIT INSERTION HOLD: Finish Quota (${os.tasksCompleted}/${minQuota}) & Clear Alerts (${overtimeLeft}s)`
        : `🌙 ENTERING LUNAR ORBIT IN ${secs}s...`;
    const isHold = !state.activeMiniGame && !quotaMet && (os.overtimeHold || 0) < 10;
    ctx.save();
    ctx.fillStyle = isHold ? 'rgba(127, 29, 29, 0.94)' : state.activeMiniGame ? 'rgba(19, 27, 44, 0.94)' : 'rgba(6, 78, 59, 0.94)';
    ctx.strokeStyle = isHold ? '#ef4444' : state.activeMiniGame ? '#38bdf8' : '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 255, 14, 510, 36, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eef2f8';
    ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, LOGICAL_W / 2, 36);
    ctx.restore();
  }

  // Always-visible High-Contrast Bottom Control Strip
  if (state.activeMiniGame?.type === 'MCC_BURN') {
    drawCanvasControlBar(ctx, LOGICAL_W, [
      { key: 'A / D', label: 'Trim Pitch' },
      { key: 'W / SPACE / CLICK', label: 'Fire Thruster' },
      { key: 'ESC', label: 'Close Panel' }
    ]);
  } else if (state.activeMiniGame) {
    drawCanvasControlBar(ctx, LOGICAL_W, [
      { key: 'SPACE / CLICK', label: 'Interact Task' },
      { key: 'WASD', label: 'Aim / Tune' },
      { key: 'ESC', label: 'Close Panel' }
    ]);
  } else {
    drawCanvasControlBar(ctx, LOGICAL_W, [
      { key: 'WASD', label: 'Roam Ship' },
      { key: 'SPACE / CLICK', label: 'Open Task' },
      { key: '1 - 4', label: 'Switch Crew' }
    ]);
  }
}
