import { LOGICAL_W, LOGICAL_H, SHIP_W, SHIP_H, CREW_ROSTER } from '../config.js';
import { state, getScenario, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet } from '../net.js';
import { addFloatText, drawChibiEngineer, drawCanvasControlBar } from '../sprites.js';
import { setStageBanner, updateBottomHUD, showMissionToast } from '../hud.js';
import { triggerDilemma } from '../dilemmas.js';

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
  { x: 610, y: 270, vertical: true },
  { x: 1270, y: 270, vertical: true },
  { x: 350, y: 430, vertical: false },
  { x: 940, y: 430, vertical: false },
  { x: 1540, y: 430, vertical: false },
  { x: 430, y: 530, vertical: false },
  { x: 1370, y: 530, vertical: false },
  { x: 910, y: 730, vertical: true }
];

const WIRE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];

export function startStage2() {
  state.stage = 'STAGE2';
  state.stageTimer = 42;
  state.activeMiniGame = null;
  state.floatingTexts = [];

  const startBatt = Math.max(45, Math.min(100, 60 + Math.round(state.telemetry.power * 0.25)));
  state.orbitState = {
    progress: 0,
    battery: startBatt,
    dataBuffer: 30,
    inEclipse: false,
    inGroundCone: false,
    inScanZone: false,
    eventTimer: 3.0,
    tasksCompleted: 0,
    arrivalReady: false,
    arrivalHold: 0,
    eclipseDilemmaShown: false
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
    { id: 'USER',   room: 'Bridge',      label: 'METEOR TURRET',   sub: 'Clear 5 Space Rocks',    x: 940,  y: 335, color: '#0284c7', alert: true,  needsWrench: false, botProg: 0 },
    { id: 'CALIB',  room: 'Science Lab', label: 'DISTRIBUTOR',     sub: 'Sync 3 Timing Rings',    x: 1555, y: 205, color: '#a855f7', alert: false, needsWrench: false, botProg: 0 },
    { id: 'LAUNCH', room: 'Engine Room', label: 'HULL BREACH',     sub: 'Wrench + Torque Bolts',  x: 680,  y: 720, color: '#dc2626', alert: false, needsWrench: true,  botProg: 0 },
    { id: 'GROUND', room: 'Comms Bay',   label: 'KA-BAND DISH',    sub: 'Tune Downlink Carrier',  x: 1560, y: 710, color: '#10b981', alert: false, needsWrench: false, botProg: 0 }
  ];

  setStageBanner(
    'STAGE 2 — ORBITAL CRUISER',
    'Follow Red Waypoint Arrows Across 5 Ship Bays',
    'Walk to flashing RED consoles (check Top-Left Checklist) and press [SPACE] or CLICK to clear alerts!',
    `<kbd>WASD</kbd> Move &nbsp;•&nbsp; <kbd>SPACE</kbd> / Click Task &nbsp;•&nbsp; <kbd>1</kbd>-<kbd>4</kbd> Switch Crew &nbsp;•&nbsp; <kbd>ESC</kbd> Close`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  updateBottomHUD();
}

function shuffledIndices() {
  const arr = [0, 1, 2, 3];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function openConsoleMiniGame(c) {
  const lead = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
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
    const rocks = Array.from({ length: 5 }, (_, i) => ({
      x: (Math.random() - 0.5) * 260,
      y: (Math.random() - 0.5) * 120,
      vx: (Math.random() < 0.5 ? -1 : 1) * (40 + i * 10),
      vy: (Math.random() < 0.5 ? -1 : 1) * (30 + i * 7),
      r: 16 + (i % 2) * 4,
      hit: false
    }));
    state.activeMiniGame = {
      type: 'ASTEROIDS',
      console: c,
      aimX: 0,
      aimY: 0,
      rocks,
      cleared: 0
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
      boltsNeeded: 5
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

function completeConsoleTask(c, msg, pts) {
  c.alert = false;
  c.botProg = 0;
  const lead = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
  if (c.id === 'LAUNCH' && lead.hasWrench) {
    lead.hasWrench = false;
    state.wrenchRack.available = true;
  }
  state.score += pts;
  state.telemetry.science += 25;
  state.orbitState.tasksCompleted++;
  if (c.id === 'SPACE') state.orbitState.battery = Math.min(100, state.orbitState.battery + 18);
  if (c.id === 'GROUND') state.orbitState.dataBuffer = Math.max(0, state.orbitState.dataBuffer - 40);
  addFloatText(c.x, c.y - 45, msg, '#4ade80');
  showMissionToast(c.label, `${c.room} nominal — bus telemetry stabilized.`);
  logBlackBox('STAGE 2', `${lead.name} completed ${c.label} in ${c.room}.`, 'good');
  playSuccessChord();
  state.activeMiniGame = null;
  updateBottomHUD();
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

export function handleStage2Interact() {
  const p = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];

  if (state.activeMiniGame) {
    const mg = state.activeMiniGame;
    if (mg.type === 'DISTRIBUTOR') {
      triggerDistributorHit(mg);
    } else if (mg.type === 'ASTEROIDS') {
      const target = mg.rocks.find(r => !r.hit && Math.hypot(mg.aimX - r.x, mg.aimY - r.y) <= r.r + 18);
      if (target) {
        target.hit = true;
        mg.cleared++;
        playTone(620, 'square', 0.07, 0.1);
        if (mg.cleared >= mg.rocks.length) {
          completeConsoleTask(mg.console, 'METEOROIDS CLEARED! +100⭐', 100);
        }
      } else {
        playTone(210, 'sine', 0.05, 0.06);
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

  for (const c of state.consoles) {
    if (Math.hypot(p.x - c.x, p.y - c.y) < 82) {
      if (c.alert) {
        openConsoleMiniGame(c);
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
    // Allow clicking nearby console directly on canvas to open it if in range
    const p = state.ctrlPlayers[state.activeCrewIndex] || state.ctrlPlayers[0];
    const wx = lx + state.stage2Cam.x;
    const wy = ly + state.stage2Cam.y;
    for (const c of state.consoles) {
      if (c.alert && Math.hypot(wx - c.x, wy - c.y) < 60 && Math.hypot(p.x - c.x, p.y - c.y) < 115) {
        openConsoleMiniGame(c);
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
  } else if (mg.type === 'ASTEROIDS') {
    const relX = lx - mx;
    const relY = ly - (my + 10);
    const target = mg.rocks.find(r => !r.hit && Math.hypot(relX - r.x, relY - r.y) <= r.r + 16);
    if (target) {
      target.hit = true;
      mg.cleared++;
      playTone(620, 'square', 0.07, 0.1);
      if (mg.cleared >= mg.rocks.length) {
        completeConsoleTask(mg.console, 'METEOROIDS CLEARED! +100⭐', 100);
      }
    }
  } else if (mg.type === 'LAUNCH') {
    mg.boltsTightened++;
    playTone(300 + mg.boltsTightened * 85, 'square', 0.08, 0.12);
    if (mg.boltsTightened >= mg.boltsNeeded) {
      completeConsoleTask(mg.console, 'HULL & GYRO REPAIRED! +105⭐', 105);
    }
  }
}

function moveCtrlPlayer(p, dx, dy) {
  const r = 16;
  const blocked = (nx, ny) => {
    if (nx < 88 || nx > SHIP_W - 88 || ny < 88 || ny > SHIP_H - 88) return true;
    for (const w of WALLS) {
      if (nx + r > w.x && nx - r < w.x + w.w && ny + r > w.y && ny - r < w.y + w.h) return true;
    }
    return false;
  };
  if (dx !== 0 && !blocked(p.x + dx, p.y)) p.x += dx;
  if (dy !== 0 && !blocked(p.x, p.y + dy)) p.y += dy;
}

function steerShipBot(b, tx, ty, dt) {
  // Use Spine Corridor (y = 480) when traversing between different rooms
  let wx = tx, wy = ty;
  const inSameBand = Math.abs(b.y - ty) < 150 && !(b.y < 430 && ty < 430 && Math.abs(b.x - tx) > 540);
  if (!inSameBand && Math.abs(b.y - 480) > 40) {
    // Route through nearest doorway to spine (x=350, 940, 1540 top; x=430, 1370 bottom)
    const doorsX = b.y < 430 ? [350, 940, 1540] : [430, 1370];
    let bestDoor = doorsX[0];
    for (const ddx of doorsX) {
      if (Math.abs(ddx - b.x) < Math.abs(bestDoor - b.x)) bestDoor = ddx;
    }
    wx = bestDoor;
    wy = 480;
  } else if (Math.abs(b.y - 480) <= 55 && Math.abs(ty - 480) > 65) {
    const targetDoorsX = ty < 430 ? [350, 940, 1540] : [430, 1370];
    let bestDoor = targetDoorsX[0];
    for (const ddx of targetDoorsX) {
      if (Math.abs(ddx - tx) < Math.abs(bestDoor - tx)) bestDoor = ddx;
    }
    if (Math.abs(b.x - bestDoor) > 36) {
      wx = bestDoor;
      wy = 480;
    }
  }

  const dx = wx - b.x;
  const dy = wy - b.y;
  const d = Math.hypot(dx, dy);
  if (d > 10) {
    b.angle = Math.atan2(dy, dx);
    b.walk += 0.2;
    moveCtrlPlayer(b, (dx / d) * 205 * dt, (dy / d) * 205 * dt);
  }
  return Math.hypot(tx - b.x, ty - b.y);
}

export function updateStage2(dt, onNextStage) {
  const scen = getScenario();
  const os = state.orbitState;

  if (state.stageTimer <= 0) {
    state.stageTimer = 0;
    os.arrivalReady = true;
    if (state.activeMiniGame) {
      os.arrivalHold = 0;
    } else {
      os.arrivalHold += dt;
      if (os.arrivalHold >= 2.6) {
        logBlackBox('STAGE 2', `Translunar cruise complete (${os.tasksCompleted} tasks, ${Math.round(os.battery)}% bus battery).`, 'info');
        onNextStage();
        return;
      }
    }
  }

  os.progress = Math.min(1, 1 - (state.stageTimer / 42));
  const phase = (os.progress * 3) % 1;
  os.inEclipse = (phase > 0.35 && phase < 0.62);
  os.inGroundCone = (phase > 0.68 && phase < 0.92);
  os.inScanZone = (phase > 0.08 && phase < 0.32);

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

  const powerGen = os.inEclipse
    ? (-3.2 * scen.eclipseDrainMul)
    : (2.2 + state.shippedModules.power_pack * 1.4);
  os.battery = Math.max(10, Math.min(100, os.battery + powerGen * dt));

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
        const calm = state.consoles.filter(c => !c.alert);
        if (calm.length > 0) calm[Math.floor(Math.random() * calm.length)].alert = true;
      }
    }
  }

  // Active Among Us Mini-Game Update
  if (state.activeMiniGame) {
    const mg = state.activeMiniGame;
    if (mg.type === 'ASTEROIDS') {
      if (state.keys['KeyW'] || state.keys['ArrowUp']) mg.aimY -= 200 * dt;
      if (state.keys['KeyS'] || state.keys['ArrowDown']) mg.aimY += 200 * dt;
      if (state.keys['KeyA'] || state.keys['ArrowLeft']) mg.aimX -= 200 * dt;
      if (state.keys['KeyD'] || state.keys['ArrowRight']) mg.aimX += 200 * dt;
      mg.aimX = Math.max(-165, Math.min(165, mg.aimX));
      mg.aimY = Math.max(-80, Math.min(80, mg.aimY));
      for (const r of mg.rocks) {
        if (r.hit) continue;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        if (Math.abs(r.x) > 155) r.vx *= -1;
        if (Math.abs(r.y) > 72) r.vy *= -1;
      }
    } else if (mg.type === 'DISTRIBUTOR') {
      for (let i = mg.ringIndex; i < 3; i++) {
        mg.angles[i] += mg.speeds[i] * dt;
      }
    } else if (mg.type === 'GROUND') {
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
  } else {
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

  // AI Crewmates roam rooms to assist consoles
  if (state.coopMode === '4P_AI' || state.coopMode === 'LOCAL_2P') {
    const alerting = state.consoles.filter(c => c.alert && !c.needsWrench && (!state.activeMiniGame || state.activeMiniGame.console !== c));
    for (let i = 0; i < state.ctrlPlayers.length; i++) {
      if (i === state.activeCrewIndex) continue;
      if (state.coopMode === 'LOCAL_2P' && i === 1) continue;
      const b = state.ctrlPlayers[i];
      const targetC = alerting[i % Math.max(1, alerting.length)];
      if (targetC) {
        const dist = steerShipBot(b, targetC.x, targetC.y + 44, dt);
        if (dist <= 32) {
          targetC.botProg += dt * 0.26;
          if (targetC.botProg >= 1) {
            targetC.alert = false;
            targetC.botProg = 0;
            state.score += 45;
            os.tasksCompleted++;
            addFloatText(targetC.x, targetC.y - 38, `${b.name} RESOLVED! +45⭐`, '#fbbf24');
          }
        }
      }
    }
  }

  state.telemetry.science = Math.round(state.telemetry.science);
  updateBottomHUD();
}

export function drawStage2(ctx) {
  // Deep space parallax starfield
  ctx.fillStyle = '#050814';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.fillStyle = '#e2e8f0';
  for (let i = 0; i < 65; i++) {
    const sx = ((i * 211) - state.stage2Cam.x * 0.2 + LOGICAL_W * 4) % LOGICAL_W;
    const sy = ((i * 113) - state.stage2Cam.y * 0.2 + LOGICAL_H * 4) % LOGICAL_H;
    ctx.fillRect(sx, sy, (i % 3 === 0) ? 2.5 : 1.5, (i % 3 === 0) ? 2.5 : 1.5);
  }

  ctx.save();
  ctx.translate(-state.stage2Cam.x, -state.stage2Cam.y);

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
    ctx.globalAlpha = 0.22;
    ctx.font = 'bold 20px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rm.name, rm.x + rm.w / 2, rm.y + 34);
    ctx.globalAlpha = 1;
  }

  // Conduits along Spine Deck
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(245, 195); ctx.lineTo(245, 480); ctx.lineTo(1560, 480); ctx.lineTo(1560, 710);
  ctx.moveTo(940, 210); ctx.lineTo(940, 480);
  ctx.moveTo(680, 720); ctx.lineTo(680, 480);
  ctx.stroke();

  // Sliding Airlock Doors
  for (const d of DOORS) {
    const open = state.ctrlPlayers.some(p => Math.hypot(p.x - d.x, p.y - d.y) < 110);
    if (!open) {
      ctx.fillStyle = '#0284c7';
      ctx.globalAlpha = 0.35;
      if (d.vertical) ctx.fillRect(d.x - 4, d.y - 58, 8, 116);
      else ctx.fillRect(d.x - 58, d.y - 4, 116, 8);
      ctx.globalAlpha = 1;
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
          : '⚠️ ALERT — GO HERE';
      ctx.fillText(promptTxt, c.x, c.y - 48);
    }
  }

  // Depth-sorted Crewmates
  [...state.ctrlPlayers]
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => a.p.y - b.p.y)
    .forEach(({ p, idx }) => drawChibiEngineer(ctx, p, idx === state.activeCrewIndex));

  ctx.restore();

  // Top-Left Ship Task Checklist Card (screen space)
  const alertList = state.consoles.filter(c => c.alert);
  const cardH = 38 + Math.max(1, Math.min(3, alertList.length)) * 22 + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = alertList.length > 0 ? '#ef4444' : '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(14, 14, 290, cardH, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = alertList.length > 0 ? '#fca5a5' : '#4ade80';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`SHIP TASKS (${state.orbitState.tasksCompleted} DONE) • ${alertList.length} ALERT${alertList.length === 1 ? '' : 'S'}`, 26, 35);
  if (alertList.length === 0) {
    ctx.fillStyle = '#cbd5e1'; ctx.font = '11.5px Fredoka, sans-serif';
    ctx.fillText('✅ All bays nominal — patrol or standby!', 26, 58);
  } else {
    alertList.slice(0, 3).forEach((c, idx) => {
      const needW = c.needsWrench && (!activeCrew || !activeCrew.hasWrench);
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 11.5px Fredoka, sans-serif';
      const line = needW
        ? `${idx + 1}. Engine Tool Rack 🔧 → ${c.label}`
        : `${idx + 1}. ${c.room}: ${c.label}`;
      ctx.fillText(line, 26, 58 + idx * 22);
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
        inHitWindow ? '🟢 IN GREEN ZONE — PRESS [SPACE] / CLICK NOW!' : 'Wait for the orange dot to cross the GREEN wedge!',
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
    } else if (mg.type === 'ASTEROIDS') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText(`BRIDGE DEFENSE: CLEAR METEOROIDS (${mg.cleared}/${mg.rocks.length})`, mx, my - 110);
      ctx.fillStyle = '#091122';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.fillRect(mx - 175, my - 82, 350, 178);
      ctx.strokeRect(mx - 175, my - 82, 350, 178);

      for (const r of mg.rocks) {
        if (r.hit) continue;
        ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx + r.x, my + 10 + r.y, r.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx + r.x, my + 10 + r.y, r.r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(mx + mg.aimX, my + 10 + mg.aimY, 15, 0, Math.PI * 2);
      ctx.moveTo(mx + mg.aimX - 20, my + 10 + mg.aimY); ctx.lineTo(mx + mg.aimX + 20, my + 10 + mg.aimY);
      ctx.moveTo(mx + mg.aimX, my + 10 + mg.aimY - 20); ctx.lineTo(mx + mg.aimX, my + 10 + mg.aimY + 20);
      ctx.stroke();
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px Fredoka, sans-serif';
      ctx.fillText('CLICK each Asteroid OR aim [WASD] + [SPACE]!', mx, my + 118);
    } else if (mg.type === 'GROUND') {
      const waveSynced = Math.abs(mg.playerFreq - mg.targetFreq) < 0.045;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillText('KA-BAND WAVE ALIGNMENT', mx, my - 110);
      ctx.fillStyle = waveSynced ? '#4ade80' : '#fde047'; ctx.font = 'bold 12.5px Fredoka, sans-serif';
      ctx.fillText(waveSynced ? '🟢 LOCKED ON! HOLD STILL TO COMPLETE!' : 'Hold [A] or [D] to match YELLOW wave to GREEN wave!', mx, my - 89);

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
      ctx.fillText('WRENCH BOLT TORQUE — TAP [SPACE] OR CLICK!', mx, my - 102);
      ctx.fillStyle = '#fde047'; ctx.font = 'bold 42px Fredoka, sans-serif';
      ctx.fillText(`🔧 ${mg.boltsTightened} / ${mg.boltsNeeded}`, mx, my + 8);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(mx - 130, my + 60, 260, 16);
      ctx.fillStyle = '#4ade80'; ctx.fillRect(mx - 130, my + 60, (260 * mg.boltsTightened) / mg.boltsNeeded, 16);
    }
  }

  // Smooth Lunar Orbit Arrival notice (never interrupts active task)
  if (state.orbitState.arrivalReady) {
    const secs = Math.max(1, Math.ceil(2.6 - state.orbitState.arrivalHold));
    const msg = state.activeMiniGame
      ? '🛸 LUNAR ORBIT READY — Finish active task to begin descent'
      : `🌙 ENTERING LUNAR ORBIT IN ${secs}s...`;
    ctx.save();
    ctx.fillStyle = state.activeMiniGame ? 'rgba(19, 27, 44, 0.94)' : 'rgba(6, 78, 59, 0.94)';
    ctx.strokeStyle = state.activeMiniGame ? '#38bdf8' : '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 210, 14, 420, 36, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eef2f8';
    ctx.font = '700 12.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, LOGICAL_W / 2, 36);
    ctx.restore();
  }

  // Always-visible High-Contrast Bottom Control Strip
  if (state.activeMiniGame) {
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
