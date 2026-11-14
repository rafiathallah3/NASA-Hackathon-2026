import { LOGICAL_W, LOGICAL_H, COLS, ROWS, TILE, GRID_X, GRID_Y, MAP_LAYOUT, RAW_ITEMS, PROC_META, RECIPES, CREW_ROSTER } from '../config.js';
import { state, getScenario, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet } from '../net.js';
import { addFloatText, drawItemBadge, drawChibiEngineer, drawHardwareCanvas } from '../sprites.js';
import { renderTicketsHUD, updateTicketBarsOnly, updateBottomHUD, setStageBanner, showMissionToast } from '../hud.js';

export function buildStage1Map() {
  state.stations = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const code = MAP_LAYOUT[r][c];
      if (code === '.') continue;
      const st = {
        r, c,
        x: GRID_X + c * TILE,
        y: GRID_Y + r * TILE,
        type: code.startsWith('C:') ? 'CRATE' : code,
        crateItem: code.startsWith('C:') ? code.split(':')[1] : null,
        item: null,
        progress: 0,
        onFire: false,
        fireProg: 0,
        traysCount: code === 'T' ? 4 : 0,
        hasExtinguisher: code === 'F'
      };
      if (r === 1 && c === 7) {
        st.item = { kind: 'tray', parts: [], touchedBy: [] };
      }
      if (r === 2 && c === 10) {
        st.item = { kind: 'tray', parts: [], touchedBy: [] };
      }
      state.stations.push(st);
    }
  }
}

export function spawnOrder(recipeId = null) {
  if (state.orders.length >= 4) return;
  const rec = recipeId
    ? (RECIPES.find(r => r.id === recipeId) || RECIPES[0])
    : (RECIPES.find(r => !state.orders.some(o => o.recipe.id === r.id)) || RECIPES[Math.floor(Math.random() * RECIPES.length)]);
  state.orders.push({
    uid: Math.random().toString(36).slice(2),
    recipe: rec,
    remaining: rec.timeLimit,
    maxTime: rec.timeLimit
  });
  renderTicketsHUD();
  playTone(520, 'triangle', 0.12, 0.08);
}

export function skipStage1Tutorial() {
  state.tutorial = { active: false, step: 5, skipped: true };
  showMissionToast('Tutorial Skipped', 'Choose which NASA modules to build under your Rocket Mass & Budget caps.');
}

export function handleStage1CanvasClick(lx, ly) {
  if (state.stage !== 'STAGE1' || !state.tutorial?.active) return;
  // Skip Tutorial pill top-right: x=964..1104, y=10..40
  if (lx >= 964 && lx <= 1104 && ly >= 10 && ly <= 40) {
    skipStage1Tutorial();
  }
}

export function initStage1() {
  setStageBanner('', '', '', `<kbd>WASD</kbd> Move &nbsp;•&nbsp; <kbd>SHIFT</kbd> Dash &nbsp;•&nbsp; <kbd>SPACE</kbd> Interact &nbsp;•&nbsp; <kbd>F</kbd> Throw Part &nbsp;•&nbsp; <kbd>1</kbd>-<kbd>4</kbd> Crew`, {
    showTickets: true,
    showSkip: true,
    showNext: false
  });

  buildStage1Map();
  state.players = CREW_ROSTER.map((cr, i) => ({
    name: cr.id,
    role: cr.role,
    x: GRID_X + (i % 2 === 0 ? 4.5 : 9.5) * TILE,
    y: GRID_Y + (2.4 + Math.floor(i / 2) * 3.1) * TILE,
    angle: i % 2 === 0 ? 0 : Math.PI,
    color: cr.color,
    visor: cr.visor,
    holding: null,
    walk: 0,
    cd: 0,
    dashCd: 0,
    dashTimer: 0,
    dashVx: 0,
    dashVy: 0
  }));

  state.elapsedStage1 = 0;
  state.stage1Combo = 0;
  state.stage1ComboTimer = 0;
  state.thrownItems = [];
  state.floorItems = [];
  state.stage = 'STAGE1';
  state.orders = [];
  for (const r of RECIPES) {
    state.orders.push({
      uid: Math.random().toString(36).slice(2),
      recipe: r,
      remaining: r.timeLimit,
      maxTime: r.timeLimit
    });
  }
  renderTicketsHUD();
  state.tutorial = { active: !state.tutorial?.skipped, step: 0, skipped: Boolean(state.tutorial?.skipped) };
  updateBottomHUD();
}

export function handleStage1Dash(p) {
  if (!p || p.dashCd > 0) return;
  p.dashCd = 0.65;
  p.dashTimer = 0.16;
  p.dashVx = Math.cos(p.angle) * 580;
  p.dashVy = Math.sin(p.angle) * 580;
  for (let i = 0; i < 6; i++) {
    state.hangarSparks.push({
      x: p.x,
      y: p.y + 10,
      vx: -Math.cos(p.angle) * (60 + Math.random() * 80) + (Math.random() - 0.5) * 60,
      vy: -Math.sin(p.angle) * 50 - 20 - Math.random() * 30,
      life: 0.35,
      color: '#cbd5e1'
    });
  }
  playTone(320, 'sine', 0.06, 0.06);
}

export function handleStage1Throw(p) {
  if (!p || !p.holding) return;
  if (p.holding.kind !== 'raw' && p.holding.kind !== 'proc') {
    addFloatText(p.x, p.y - 34, 'Can only toss parts!', '#fbbf24');
    return;
  }
  const item = p.holding;
  item.lastBy = p.name;
  p.holding = null;
  const dist = 148;
  state.thrownItems.push({
    x: p.x + Math.cos(p.angle) * 20,
    y: p.y + Math.sin(p.angle) * 14,
    startX: p.x + Math.cos(p.angle) * 20,
    startY: p.y + Math.sin(p.angle) * 14,
    tx: Math.max(GRID_X + 24, Math.min(GRID_X + COLS * TILE - 24, p.x + Math.cos(p.angle) * dist)),
    ty: Math.max(GRID_Y + 24, Math.min(GRID_Y + ROWS * TILE - 24, p.y + Math.sin(p.angle) * dist)),
    t: 0,
    dur: 0.34,
    item,
    thrower: p.name
  });
  playTone(580, 'triangle', 0.09, 0.09);
}

export function getFacingStation(p) {
  const reach = 42;
  const fx = p.x + Math.cos(p.angle) * reach;
  const fy = p.y + Math.sin(p.angle) * reach;
  let best = null;
  let bestScore = 999;
  for (const st of state.stations) {
    const cx = st.x + TILE / 2;
    const cy = st.y + TILE / 2;
    const dist = Math.hypot(fx - cx, fy - cy);
    const pDist = Math.hypot(p.x - cx, p.y - cy);
    if (dist < 52 && pDist < 84) {
      const sc = dist + pDist * 0.25;
      if (sc < bestScore) {
        bestScore = sc;
        best = st;
      }
    }
  }
  return best;
}

function canAcceptPartOnTray(tray, procId) {
  if (procId === 'burned' || tray.parts.includes(procId) || tray.parts.length >= 2) return false;
  const cand = [...tray.parts, procId];
  return RECIPES.some(r => cand.every(pt => r.reqs.includes(pt)));
}

export function handleStage1Interact(p) {
  if (!p) return;

  // Pick up tossed/dropped item on hangar floor if hands empty
  if (!p.holding && state.floorItems.length > 0) {
    const fiIdx = state.floorItems.findIndex(fi => Math.hypot(fi.x - p.x, fi.y - p.y) < 46);
    if (fiIdx !== -1) {
      const [fi] = state.floorItems.splice(fiIdx, 1);
      p.holding = fi.item;
      playTone(490, 'sine', 0.07, 0.08);
      return;
    }
  }

  const st = getFacingStation(p);
  if (!st) return;

  if (st.type === 'F') {
    if (!p.holding && st.hasExtinguisher) {
      st.hasExtinguisher = false;
      p.holding = { kind: 'extinguisher' };
      addFloatText(st.x + 34, st.y, 'CO2 Extinguisher!', '#e2e8f0');
      playTone(540, 'sine', 0.08, 0.08);
    } else if (p.holding && p.holding.kind === 'extinguisher') {
      p.holding = null;
      st.hasExtinguisher = true;
      addFloatText(st.x + 34, st.y, 'Returned CO2', '#94a3b8');
      playTone(420, 'sine', 0.07, 0.07);
    }
    return;
  }

  if (st.type === 'X') {
    if (p.holding) {
      if (p.holding.kind === 'tray') {
        p.holding.parts = [];
        p.holding.touchedBy = [];
        addFloatText(st.x + 34, st.y, 'Tray Cleared!', '#94a3b8');
      } else if (p.holding.kind !== 'extinguisher') {
        p.holding = null;
        addFloatText(st.x + 34, st.y, 'Scrapped!', '#f87171');
      }
      playTone(180, 'sawtooth', 0.14, 0.09);
    }
    return;
  }

  if (st.type === '>') {
    if (p.holding && p.holding.kind === 'tray' && p.holding.parts.length === 2) {
      const matching = state.orders
        .filter(o => o.recipe.reqs.every(req => p.holding.parts.includes(req)))
        .sort((a, b) => b.remaining - a.remaining);
      if (matching.length > 0) {
        const matched = matching[0];
        const rec = matched.recipe;
        const tip = matched.remaining > 0 ? Math.round((matched.remaining / matched.maxTime) * 30) : 0;

        state.stage1Combo = state.stage1ComboTimer > 0 ? Math.min(4, state.stage1Combo + 1) : 1;
        state.stage1ComboTimer = 26;
        const comboBonus = state.stage1Combo > 1 ? (state.stage1Combo - 1) * 20 : 0;
        const touchers = new Set([...(p.holding.touchedBy || []), p.name]);
        const coopBonus = touchers.size >= 2 ? 30 : 0;

        let pts = rec.points + tip + comboBonus + coopBonus;

        state.telemetry.mass += rec.massKg;
        state.telemetry.budget -= rec.costM;
        if (state.telemetry.budget < 0) {
          pts = Math.max(40, pts - 20);
          addFloatText(st.x - 20, st.y - 24, 'BUDGET OVERRUN -20⭐', '#fbbf24');
          logBlackBox('STAGE 1A', `${rec.title} caused a budget overrun ($${state.telemetry.budget}M).`, 'warn');
        }
        if (state.telemetry.mass > state.telemetry.maxMass) {
          addFloatText(st.x - 20, st.y + 52, '⚠️ OVER ROCKET MASS CAP!', '#ef4444');
          logBlackBox('STAGE 1A', `Mass (${state.telemetry.mass} kg) exceeded Launch Vehicle capacity (${state.telemetry.maxMass} kg)!`, 'warn');
        }

        state.score += pts;
        state.shippedCount++;
        state.shippedModules[rec.id]++;
        state.telemetry.power += rec.telemetry.power;
        state.telemetry.comms += rec.telemetry.comms;
        state.telemetry.science += rec.telemetry.science;
        state.telemetry.fuel = Math.min(125, state.telemetry.fuel + rec.telemetry.fuel);

        logBlackBox('STAGE 1A', `${p.name} shipped ${rec.title} (+${rec.massKg}kg, -$${rec.costM}M${coopBonus ? ', Co-Op Pass!' : ''}).`, 'good');
        showMissionToast(rec.title, rec.lesson);
        state.screenShake = Math.max(state.screenShake || 0, 0.15);

        state.orders = state.orders.filter(o => o.uid !== matched.uid);
        state.flyingDeliveries.push({ x: st.x + 20, y: st.y + 34, parts: [...p.holding.parts] });
        p.holding = null;
        state.trayReturnQueue.push(2.5);
        spawnOrder(rec.id);
        renderTicketsHUD();
        updateBottomHUD();
        const tag = coopBonus > 0 ? `CO-OP SHIPPED! +${pts}⭐` : state.stage1Combo > 1 ? `COMBO x${state.stage1Combo}! +${pts}⭐` : `SHIPPED! +${pts}⭐`;
        addFloatText(st.x - 10, st.y, tag, coopBonus > 0 ? '#fde047' : '#4ade80');
        playSuccessChord();
      } else {
        addFloatText(st.x, st.y, 'No Matching Ticket!', '#f87171');
        playTone(150, 'square', 0.18, 0.1);
      }
    } else {
      addFloatText(st.x, st.y, 'Need Full 2-Part Tray!', '#fbbf24');
    }
    return;
  }

  if (st.type === 'CRATE') {
    if (!p.holding) {
      p.holding = { kind: 'raw', id: st.crateItem, lastBy: p.name };
      playTone(440, 'sine', 0.07, 0.08);
    }
    return;
  }

  if (st.type === 'T') {
    if (!p.holding && st.traysCount > 0) {
      st.traysCount--;
      p.holding = { kind: 'tray', parts: [], touchedBy: [p.name] };
      playTone(500, 'sine', 0.07, 0.08);
    }
    return;
  }

  if (st.onFire) {
    if (!p.holding || p.holding.kind !== 'extinguisher') {
      addFloatText(st.x + 34, st.y, '🔥 Grab CO2 Extinguisher [F]!', '#f87171');
      playTone(170, 'sawtooth', 0.12, 0.08);
    }
    return;
  }

  const isProc = (st.type === 'W' || st.type === 'A' || st.type === 'P');

  if (!p.holding && st.item) {
    if ((st.type === 'A' || st.type === 'P') && st.item.kind === 'raw' && st.progress < 1) {
      addFloatText(st.x + 34, st.y, 'Processing...', '#fbbf24');
      return;
    }
    p.holding = st.item;
    if (st.c === 7 && p.holding.lastBy && p.holding.lastBy !== p.name) {
      addFloatText(st.x + 34, st.y - 12, 'Nice Catch! 🤝', '#38bdf8');
    }
    st.item = null;
    st.progress = 0;
    playTone(480, 'sine', 0.07, 0.08);
    return;
  }

  if (p.holding && p.holding.kind === 'tray' && st.item && st.item.kind === 'proc') {
    if (canAcceptPartOnTray(p.holding, st.item.id)) {
      p.holding.parts.push(st.item.id);
      p.holding.touchedBy = [...new Set([...(p.holding.touchedBy || []), p.name, st.item.lastBy].filter(Boolean))];
      st.item = null;
      st.progress = 0;
      addFloatText(p.x, p.y - 30, 'Plated!', '#38bdf8');
      playTone(660, 'triangle', 0.09, 0.09);
    } else {
      addFloatText(p.x, p.y - 30, 'Wrong Combo!', '#f87171');
    }
    return;
  }

  if (p.holding && p.holding.kind === 'proc' && st.item && st.item.kind === 'tray') {
    if (canAcceptPartOnTray(st.item, p.holding.id)) {
      st.item.parts.push(p.holding.id);
      st.item.touchedBy = [...new Set([...(st.item.touchedBy || []), p.name, p.holding.lastBy].filter(Boolean))];
      p.holding = null;
      addFloatText(st.x + 34, st.y, 'Plated!', '#38bdf8');
      playTone(660, 'triangle', 0.09, 0.09);
    } else {
      addFloatText(st.x + 34, st.y, 'Wrong Combo!', '#f87171');
    }
    return;
  }

  if (p.holding && !st.item && p.holding.kind !== 'extinguisher') {
    if (isProc) {
      if (p.holding.kind !== 'raw') {
        addFloatText(st.x + 34, st.y, 'Raw Parts Only!', '#f87171');
        return;
      }
      const rawMeta = RAW_ITEMS[p.holding.id];
      const reqType = st.type === 'W' ? 'weld' : st.type === 'A' ? 'calibrate' : 'charge';
      if (rawMeta.procType !== reqType) {
        const names = { weld: 'Weld Bench', calibrate: 'Calibrate Rig', charge: 'Power Charger' };
        addFloatText(st.x + 34, st.y, `Use ${names[rawMeta.procType]}!`, '#fbbf24');
        playTone(180, 'sawtooth', 0.1, 0.09);
        return;
      }
    }
    p.holding.lastBy = p.holding.lastBy || p.name;
    st.item = p.holding;
    st.progress = 0;
    p.holding = null;
    playTone(360, 'sine', 0.07, 0.08);
  }
}

function moveStage1Player(p, vx, vy) {
  if (vx !== 0 || vy !== 0) {
    p.angle = Math.atan2(vy, vx);
    p.walk += 0.22;
  }
  const r = 16;
  const collides = (nx, ny) => {
    if (nx < GRID_X + r || nx > GRID_X + COLS * TILE - r) return true;
    if (ny < GRID_Y + r || ny > GRID_Y + ROWS * TILE - r) return true;
    for (const s of state.stations) {
      if (nx + r > s.x + 4 && nx - r < s.x + TILE - 4 &&
          ny + r > s.y + 4 && ny - r < s.y + TILE - 4) return true;
    }
    return false;
  };
  if (!collides(p.x + vx, p.y)) p.x += vx;
  if (!collides(p.x, p.y + vy)) p.y += vy;
}

function updateStage1Bot(bot, orderIdx, dt) {
  if (state.orders.length === 0) return;
  const targetOrder = state.orders[Math.min(orderIdx, state.orders.length - 1)];
  const needed = targetOrder.recipe.reqs;

  const traySt = state.stations.find(s => s.item && s.item.kind === 'tray' &&
    s.item.parts.every(pt => needed.includes(pt)) && s.item.parts.length < 2);
  const fullTraySt = state.stations.find(s => s.item && s.item.kind === 'tray' &&
    needed.every(req => s.item.parts.includes(req)));

  let tx = null, ty = null, act = null;
  if (bot.holding && bot.holding.kind === 'tray' && needed.every(req => bot.holding.parts.includes(req))) {
    const conv = state.stations.find(s => s.type === '>' && s.r >= 1) || state.stations.find(s => s.type === '>');
    tx = conv.x - 22;
    ty = conv.y + 34;
    act = 'interact';
  } else if (bot.holding && bot.holding.kind === 'tray' && bot.holding.parts.length < 2) {
    const emptyCounter = state.stations.find(s => s.type === '#' && !s.item && s.r >= 1 && s.r <= 5 && s.c >= 3 && s.c <= 10);
    if (emptyCounter) {
      tx = emptyCounter.x + 34;
      ty = emptyCounter.y + 88;
      act = 'interact';
    }
  } else if (!bot.holding && fullTraySt) {
    tx = fullTraySt.x + 34; ty = fullTraySt.y + 88; act = 'interact';
  } else if (bot.holding && bot.holding.kind === 'proc' && traySt) {
    tx = traySt.x + 34; ty = traySt.y + 88; act = 'interact';
  } else if (!bot.holding) {
    const ready = state.stations.find(s => s.item && s.item.kind === 'proc' && needed.includes(s.item.id));
    if (ready) {
      tx = ready.x + 34; ty = ready.y + 88; act = 'interact';
    } else if (!traySt && !fullTraySt) {
      const rack = state.stations.find(s => s.type === 'T' && s.traysCount > 0);
      if (rack) {
        tx = rack.x + 34; ty = rack.y + 88; act = 'interact';
      }
    }
    if (tx === null) {
      const weld = state.stations.find(s => s.type === 'W' && s.item && s.item.kind === 'raw');
      if (weld) {
        tx = weld.x + 34; ty = weld.y + 88; act = 'weld';
      } else {
        const existing = traySt ? traySt.item.parts : [];
        const miss = needed.find(req => !existing.includes(req));
        const rawKey = Object.keys(RAW_ITEMS).find(k => RAW_ITEMS[k].result === miss);
        if (rawKey) {
          const crate = state.stations.find(s => s.type === 'CRATE' && s.crateItem === rawKey);
          if (crate) { tx = crate.x + 88; ty = crate.y + 34; act = 'interact'; }
        }
      }
    }
  } else if (bot.holding && bot.holding.kind === 'raw') {
    const rawMeta = RAW_ITEMS[bot.holding.id];
    const bType = rawMeta.procType === 'weld' ? 'W' : rawMeta.procType === 'calibrate' ? 'A' : 'P';
    const free = state.stations.find(s => s.type === bType && !s.item);
    if (free) { tx = free.x + 34; ty = free.y + 88; act = 'interact'; }
  }

  // Keep bots navigating through center aisle openings (r=3 or r=6) when crossing c=7 split wall
  if (tx !== null) {
    const splitX = GRID_X + 7.5 * TILE;
    if ((bot.x < splitX - 30 && tx > splitX + 30) || (bot.x > splitX + 30 && tx < splitX - 30)) {
      const gateY = Math.abs(bot.y - (GRID_Y + 3.5 * TILE)) < Math.abs(bot.y - (GRID_Y + 6.5 * TILE))
        ? GRID_Y + 3.5 * TILE
        : GRID_Y + 6.5 * TILE;
      if (Math.abs(bot.y - gateY) > 18) {
        tx = bot.x < splitX ? splitX - 58 : splitX + 58;
        ty = gateY;
        act = null;
      }
    }
    const dx = tx - bot.x;
    const dy = ty - bot.y;
    const d = Math.hypot(dx, dy);
    if (d > 14) {
      moveStage1Player(bot, (dx / d) * 175 * dt, (dy / d) * 175 * dt);
    } else {
      let near = null, nd = 999;
      for (const s of state.stations) {
        const sd = Math.hypot((s.x + 34) - bot.x, (s.y + 34) - bot.y);
        if (sd < nd) { nd = sd; near = s; }
      }
      if (near) bot.angle = Math.atan2((near.y + 34) - bot.y, (near.x + 34) - bot.x);
      if (act === 'interact') {
        bot.cd = (bot.cd || 0) - dt;
        if (bot.cd <= 0) {
          handleStage1Interact(bot);
          bot.cd = 0.4;
        }
      } else if (act === 'weld' && near && near.type === 'W' && near.item) {
        near.progress += dt * 0.55;
        if (Math.random() < 0.25) {
          state.hangarSparks.push({ x: near.x + 34, y: near.y + 18, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 40, life: 0.35, color: '#38bdf8' });
        }
        if (near.progress >= 1) {
          near.item = { kind: 'proc', id: RAW_ITEMS[near.item.id].result, lastBy: bot.name };
          near.progress = 1;
        }
      }
    }
  }
}

function applyHoldWork(p, dt) {
  const facing = getFacingStation(p);
  if (!facing) return;
  if (facing.onFire && p.holding && p.holding.kind === 'extinguisher') {
    facing.fireProg += dt * 1.1;
    if (Math.random() < 0.5) {
      state.hangarSparks.push({ x: facing.x + 34, y: facing.y + 16, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, life: 0.35, color: '#f8fafc' });
    }
    if (facing.fireProg >= 1) {
      facing.onFire = false;
      facing.fireProg = 0;
      if (facing.item && facing.item.id === 'burned') {
        facing.item = null;
        facing.progress = 0;
      }
      state.score += 30;
      addFloatText(facing.x + 34, facing.y, 'FIRE DOUSED! +30⭐', '#4ade80');
      playSuccessChord();
    }
    return;
  }
  if (facing.type === 'W' && !facing.onFire && facing.item && facing.item.kind === 'raw') {
    facing.progress += dt * 0.72;
    if (Math.random() < 0.35) {
      state.hangarSparks.push({ x: facing.x + 34, y: facing.y + 18, vx: (Math.random() - 0.5) * 110, vy: -35 - Math.random() * 50, life: 0.35, color: '#fde047' });
    }
    if (Math.random() < 0.3) playTone(320 + Math.random() * 260, 'sawtooth', 0.04, 0.04);
    if (facing.progress >= 1) {
      facing.item = { kind: 'proc', id: RAW_ITEMS[facing.item.id].result, lastBy: p.name };
      facing.progress = 1;
      addFloatText(facing.x + 34, facing.y, 'Welded!', '#4ade80');
      playTone(760, 'triangle', 0.12, 0.1);
    }
  }
}

export function updateStage1(dt) {
  state.elapsedStage1 += dt;
  if (state.stage1ComboTimer > 0) {
    state.stage1ComboTimer -= dt;
    if (state.stage1ComboTimer <= 0) state.stage1Combo = 0;
  }

  const scen = getScenario();
  state.orderTimer += dt;
  if (state.orderTimer >= 12) {
    state.orderTimer = 0;
    spawnOrder();
  }
  for (const ord of state.orders) {
    if (ord.remaining > 0) {
      ord.remaining = Math.max(0, ord.remaining - dt * scen.orderDrainMul);
    }
  }
  updateTicketBarsOnly();

  for (const pl of state.players) {
    pl.dashCd = Math.max(0, (pl.dashCd || 0) - dt);
    if (pl.dashTimer > 0) {
      pl.dashTimer -= dt;
      moveStage1Player(pl, pl.dashVx * dt, pl.dashVy * dt);
    }
  }

  const lead = state.players[state.activeCrewIndex] || state.players[0];
  if (lead.dashTimer <= 0) {
    let mx = 0, my = 0;
    if (state.keys['KeyW'] || state.keys['ArrowUp']) my -= 1;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) my += 1;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) mx -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) mx += 1;
    if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
    moveStage1Player(lead, mx * 245 * dt, my * 245 * dt);
    if (mx !== 0 || my !== 0) {
      broadcastNet({ type: 'CREW_INPUT', slot: state.activeCrewIndex, x: lead.x, y: lead.y, angle: lead.angle });
    }
  }

  if (state.keys['Space'] || state.keys['KeyE']) {
    applyHoldWork(lead, dt);
  }

  if (state.coopMode === 'LOCAL_2P') {
    const p2 = state.players[1];
    if (p2.dashTimer <= 0) {
      let mx2 = 0, my2 = 0;
      if (state.keys['KeyI']) my2 -= 1;
      if (state.keys['KeyK']) my2 += 1;
      if (state.keys['KeyJ']) mx2 -= 1;
      if (state.keys['KeyL']) mx2 += 1;
      if (mx2 !== 0 && my2 !== 0) { mx2 *= 0.7071; my2 *= 0.7071; }
      moveStage1Player(p2, mx2 * 245 * dt, my2 * 245 * dt);
    }
    if (state.keys['Enter']) {
      applyHoldWork(p2, dt);
    }
  }

  if (state.coopMode === '4P_AI' || state.coopMode === 'LOCAL_2P') {
    for (let i = 0; i < state.players.length; i++) {
      if (i === state.activeCrewIndex) continue;
      if (state.coopMode === 'LOCAL_2P' && i === 1) continue;
      updateStage1Bot(state.players[i], i % 2, dt);
    }
  }

  // Update thrown flying parts (Overcooked toss & auto-catch on benches/trays/counters)
  for (let i = state.thrownItems.length - 1; i >= 0; i--) {
    const th = state.thrownItems[i];
    th.t += dt / th.dur;
    const p = Math.min(1, th.t);
    th.x = th.startX + (th.tx - th.startX) * p;
    th.y = th.startY + (th.ty - th.startY) * p;
    if (p >= 1) {
      let landedSt = null, bestD = 54;
      for (const s of state.stations) {
        const d = Math.hypot(s.x + 34 - th.tx, s.y + 34 - th.ty);
        if (d < bestD) { bestD = d; landedSt = s; }
      }
      let absorbed = false;
      if (landedSt && !landedSt.onFire) {
        if (th.item.kind === 'proc' && landedSt.item && landedSt.item.kind === 'tray' && canAcceptPartOnTray(landedSt.item, th.item.id)) {
          landedSt.item.parts.push(th.item.id);
          landedSt.item.touchedBy = [...new Set([...(landedSt.item.touchedBy || []), th.thrower].filter(Boolean))];
          addFloatText(landedSt.x + 34, landedSt.y - 10, 'SLAM DUNK TRAY! 🎯', '#4ade80');
          playTone(720, 'triangle', 0.1, 0.1);
          absorbed = true;
        } else if (!landedSt.item && (landedSt.type === '#' || landedSt.type === 'W' || landedSt.type === 'A' || landedSt.type === 'P')) {
          const isProc = (landedSt.type === 'W' || landedSt.type === 'A' || landedSt.type === 'P');
          if (!isProc || (th.item.kind === 'raw' && RAW_ITEMS[th.item.id].procType === (landedSt.type === 'W' ? 'weld' : landedSt.type === 'A' ? 'calibrate' : 'charge'))) {
            landedSt.item = th.item;
            landedSt.progress = 0;
            addFloatText(landedSt.x + 34, landedSt.y - 10, 'Caught! 🙌', '#38bdf8');
            playTone(540, 'sine', 0.08, 0.08);
            absorbed = true;
          }
        }
      }
      if (!absorbed) {
        state.floorItems.push({ x: th.tx, y: th.ty, item: th.item });
      }
      state.thrownItems.splice(i, 1);
    }
  }

  for (const st of state.stations) {
    if (st.onFire && Math.random() < 0.35) {
      state.hangarSparks.push({ x: st.x + 22 + Math.random() * 24, y: st.y + 8, vx: (Math.random() - 0.5) * 30, vy: -45 - Math.random() * 35, life: 0.4, color: Math.random() < 0.5 ? '#ef4444' : '#fde047' });
    }
    if ((st.type === 'A' || st.type === 'P') && st.item && !st.onFire) {
      if (st.item.kind === 'raw') {
        st.progress += dt * 0.32;
        if (st.progress >= 1) {
          st.item = { kind: 'proc', id: RAW_ITEMS[st.item.id].result, lastBy: st.item.lastBy };
          playTone(680, 'sine', 0.1, 0.09);
        }
      } else if (st.item.kind === 'proc' && st.item.id !== 'burned') {
        st.progress += dt * 0.06;
        if (st.progress >= 1.75) {
          st.item = { kind: 'proc', id: 'burned' };
          st.onFire = true;
          st.fireProg = 0;
          state.overheatedParts++;
          addFloatText(st.x + 34, st.y, 'BENCH FIRE! GRAB CO2 [F]!', '#ef4444');
          playTone(130, 'sawtooth', 0.25, 0.12);
        }
      }
    }
  }

  const rack = state.stations.find(s => s.type === 'T');
  for (let i = state.trayReturnQueue.length - 1; i >= 0; i--) {
    state.trayReturnQueue[i] -= dt;
    if (state.trayReturnQueue[i] <= 0) {
      if (rack) rack.traysCount++;
      state.trayReturnQueue.splice(i, 1);
    }
  }
  state.conveyorOffset = (state.conveyorOffset + dt * 45) % 24;
  for (let i = state.flyingDeliveries.length - 1; i >= 0; i--) {
    state.flyingDeliveries[i].x += dt * 150;
    if (state.flyingDeliveries[i].x > 1180) state.flyingDeliveries.splice(i, 1);
  }
  for (let i = state.hangarSparks.length - 1; i >= 0; i--) {
    const sp = state.hangarSparks[i];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 180 * dt;
    sp.life -= dt;
    if (sp.life <= 0) state.hangarSparks.splice(i, 1);
  }

  // Interactive 5-Step Tutorial Progression
  if (state.tutorial?.active) {
    const tut = state.tutorial;
    const anyCal = state.stations.some(s => s.type === 'A' && s.item && (s.item.id === 'optics' || s.item.id === 'cal_optics'));
    const hasCalOptics = lead.holding?.id === 'cal_optics' || anyCal || state.stations.some(s => s.item?.kind === 'tray' && s.item.parts.includes('cal_optics'));
    const hasSolderPcb = lead.holding?.id === 'weld_circuit' || state.stations.some(s => s.item?.id === 'weld_circuit' || (s.item?.kind === 'tray' && s.item.parts.includes('weld_circuit')));
    const hasFullTray = lead.holding?.kind === 'tray' && lead.holding.parts.length === 2 || state.stations.some(s => s.item?.kind === 'tray' && s.item.parts.length === 2);

    if (tut.step === 0 && (lead.holding?.id === 'optics' || hasCalOptics)) {
      tut.step = 1; playTone(620, 'sine', 0.08, 0.09);
    } else if (tut.step === 1 && hasCalOptics) {
      tut.step = 2; playTone(660, 'sine', 0.08, 0.09);
    } else if (tut.step === 2 && hasSolderPcb) {
      tut.step = 3; playTone(700, 'sine', 0.08, 0.09);
    } else if (tut.step === 3 && hasFullTray) {
      tut.step = 4; playTone(760, 'sine', 0.09, 0.1);
    } else if (tut.step === 4 && state.shippedCount >= 1) {
      tut.active = false;
      tut.skipped = true;
      state.score += 50;
      addFloatText(LOGICAL_W / 2, 120, 'TUTORIAL COMPLETE! +50⭐', '#4ade80');
      showMissionToast('Ready to Engineer', 'Choose which modules fit your Rocket Mass & Budget caps, then click Launch Mission!');
    }
  }

  updateBottomHUD();
}

function getLeadGuidanceText(lead) {
  if (!lead) return '1. Grab Raw Part ➔ 2. Bench ➔ 3. Pass/Plate Tray ➔ 4. Conveyor | [SHIFT] Dash • [F] Throw';
  if (!lead.holding) {
    return `${lead.name} (${lead.role}): Grab Raw Part, catch a Pass Counter part, or [SHIFT] Dash!`;
  }
  if (lead.holding.kind === 'extinguisher') {
    return `${lead.name} holding CO2: Hold [SPACE] facing any 🔥 Fire to extinguish!`;
  }
  if (lead.holding.kind === 'raw') {
    const rm = RAW_ITEMS[lead.holding.id];
    const dest = rm.procType === 'weld' ? 'Blue WELD Bench' : rm.procType === 'calibrate' ? 'Purple CALIBRATE Rig' : 'Green CHARGE Station';
    return `${lead.name} holding ${rm.name}: Place on ${dest} (or press [F] to Throw)!`;
  }
  if (lead.holding.kind === 'proc') {
    if (lead.holding.id === 'burned') return `${lead.name} holding Scrap: Toss in Red SCRAP Bin (bottom-right)!`;
    return `${lead.name} holding ${PROC_META[lead.holding.id].name}: Plate onto Tray or Pass/Throw [F] across Counter!`;
  }
  if (lead.holding.kind === 'tray') {
    if (lead.holding.parts.length < 2) return `${lead.name} holding Tray (${lead.holding.parts.length}/2): Plate matching parts onto this Tray!`;
    return `${lead.name} Tray READY! Deliver to Right CONVEYOR (or click 🚀 Launch Mission anytime)!`;
  }
  return '';
}

export function drawStage1(ctx) {
  // Hangar backdrop & overhead gantry crane beam
  ctx.fillStyle = '#182032';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  ctx.fillStyle = '#232c40';
  ctx.fillRect(GRID_X - 8, 12, COLS * TILE + 16, GRID_Y - 12);
  // Safety stripe trim along top gantry
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(GRID_X - 8, GRID_Y - 10, COLS * TILE + 16, 10);
  ctx.fillStyle = '#0f172a';
  for (let sx = GRID_X; sx < GRID_X + COLS * TILE; sx += 28) {
    ctx.fillRect(sx, GRID_Y - 10, 12, 10);
  }

  // Hangar floor tiles with subtle rivets
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#2b354b' : '#252e42';
      ctx.fillRect(GRID_X + c * TILE, GRID_Y + r * TILE, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(GRID_X + c * TILE + 4, GRID_Y + r * TILE + 4, 3, 3);
    }
  }

  // Diegetic floor workflow hints + Pass Counter Split Zone
  ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1. RAW CRATES & WELD ➔', GRID_X + 2.8 * TILE, GRID_Y + 6.45 * TILE);
  ctx.fillText('↔ PASS COUNTER', GRID_X + 7.5 * TILE, GRID_Y + 3.45 * TILE);
  ctx.fillText('2. CAL / CHARGE / TRAY ➔ SUBMIT', GRID_X + 11.2 * TILE, GRID_Y + 6.45 * TILE);

  const lead = state.players[state.activeCrewIndex] || state.players[0];
  const facing = lead ? getFacingStation(lead) : null;
  const renderables = [
    ...state.stations.map(s => ({ kind: 'station', y: s.y + TILE, obj: s })),
    ...state.floorItems.map(fi => ({ kind: 'floor', y: fi.y + 8, obj: fi })),
    ...state.players.map((p, idx) => ({ kind: 'player', y: p.y + 15, obj: p, isLead: idx === state.activeCrewIndex }))
  ].sort((a, b) => a.y - b.y);

  for (const ent of renderables) {
    if (ent.kind === 'floor') {
      drawItemBadge(ctx, ent.obj.x, ent.obj.y, ent.obj.item);
    } else if (ent.kind === 'station') {
      const s = ent.obj;
      const isHi = (facing === s);

      ctx.fillStyle = '#151b28';
      ctx.fillRect(s.x + 2, s.y + 10, TILE - 4, TILE - 6);

      let topCol = s.c === 7 && s.type === '#' ? '#64748b' : '#475569', label = s.c === 7 && s.type === '#' ? 'PASS' : '', lampCol = null;
      if (s.type === 'CRATE') {
        topCol = '#b45309';
        const rm = RAW_ITEMS[s.crateItem];
        label = rm.name;
        lampCol = rm.procType === 'weld' ? '#38bdf8' : rm.procType === 'calibrate' ? '#a78bfa' : '#4ade80';
      } else if (s.type === 'W') { topCol = '#0369a1'; label = 'WELD'; lampCol = '#38bdf8'; }
      else if (s.type === 'A') { topCol = '#6d28d9'; label = 'CALIBRATE'; lampCol = '#a78bfa'; }
      else if (s.type === 'P') { topCol = '#15803d'; label = 'CHARGE'; lampCol = '#4ade80'; }
      else if (s.type === 'T') { topCol = '#0f766e'; label = `TRAYS (${s.traysCount})`; }
      else if (s.type === 'F') { topCol = '#b91c1c'; label = s.hasExtinguisher ? 'CO2' : 'EMPTY'; }
      else if (s.type === 'X') { topCol = '#991b1b'; label = 'SCRAP'; }
      else if (s.type === '>') { topCol = '#1e293b'; label = 'SUBMIT'; }

      ctx.fillStyle = topCol;
      ctx.strokeStyle = isHi ? '#fde047' : '#0f172a';
      ctx.lineWidth = isHi ? 3.5 : 2.2;
      ctx.beginPath();
      ctx.roundRect(s.x + 3, s.y - 5, TILE - 6, TILE - 6, 9);
      ctx.fill(); ctx.stroke();

      // Top highlight bevel
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(s.x + 8, s.y - 2, TILE - 16, 4);

      if (isHi) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.strokeRect(s.x + 1, s.y - 7, TILE - 2, TILE - 2);
      }

      if (lampCol) {
        ctx.fillStyle = lampCol;
        ctx.beginPath(); ctx.arc(s.x + TILE - 12, s.y + 4, 4, 0, Math.PI * 2); ctx.fill();
      }

      if (s.type === '>') {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(s.x + 5, s.y - 3, TILE - 10, TILE - 10, 7); ctx.clip();
        ctx.fillStyle = '#38bdf8';
        for (let bx = -24; bx < TILE + 24; bx += 22) {
          ctx.fillRect(s.x + bx + state.conveyorOffset, s.y + 14, 9, 24);
        }
        ctx.restore();
      }

      if (s.type === 'CRATE') {
        drawHardwareCanvas(ctx, s.x + TILE / 2, s.y + 20, RAW_ITEMS[s.crateItem].shape, false, 0.95);
      } else if (s.type === 'F' && s.hasExtinguisher) {
        ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(s.x + 26, s.y + 8, 16, 26, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(s.x + 31, s.y + 4, 6, 5);
      }
      if (label) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9.5px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, s.x + TILE / 2, s.y + 49);
      }

      if (s.item) drawItemBadge(ctx, s.x + TILE / 2, s.y + 18, s.item);

      if (s.onFire) {
        const fl = 8 + Math.sin(performance.now() * 0.02 + s.c) * 4;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(s.x + TILE / 2, s.y + 14, 14 + fl * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(s.x + TILE / 2, s.y + 16, 8 + fl * 0.2, 0, Math.PI * 2); ctx.fill();
        if (s.fireProg > 0) {
          ctx.fillStyle = '#0f172a'; ctx.fillRect(s.x + 9, s.y - 16, 50, 7);
          ctx.fillStyle = '#38bdf8'; ctx.fillRect(s.x + 9, s.y - 16, 50 * s.fireProg, 7);
        }
      } else if (s.item && s.progress > 0 && s.item.id !== 'burned') {
        const bw = 50, bh = 7, bx = s.x + (TILE - bw) / 2, by = s.y - 14;
        ctx.fillStyle = '#0f172a'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        if (s.progress <= 1) {
          ctx.fillStyle = s.progress >= 1 ? '#4ade80' : '#38bdf8';
          ctx.fillRect(bx, by, bw * s.progress, bh);
        } else {
          const warn = Math.min(1, (s.progress - 1) / 0.75);
          ctx.fillStyle = Math.floor(performance.now() / 120) % 2 === 0 ? '#ef4444' : '#fde047';
          ctx.fillRect(bx, by, bw * warn, bh);
        }
      }
    } else {
      drawChibiEngineer(ctx, ent.obj, ent.isLead);
    }
  }

  for (const th of state.thrownItems) {
    const arcY = th.y - Math.sin(Math.min(1, th.t) * Math.PI) * 32;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(th.x, th.y + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawItemBadge(ctx, th.x, arcY, th.item);
  }

  for (const sp of state.hangarSparks) {
    ctx.globalAlpha = Math.max(0, sp.life * 2.5);
    ctx.fillStyle = sp.color;
    ctx.fillRect(sp.x, sp.y, 3, 3);
    ctx.globalAlpha = 1;
  }

  for (const fd of state.flyingDeliveries) {
    drawItemBadge(ctx, fd.x, fd.y, { kind: 'tray', parts: fd.parts });
  }

  // Intuitive Active Guidance Banner + Tutorial Overlay + Combo Badge along top gantry
  if (state.stage === 'STAGE1') {
    if (state.tutorial?.active) {
      const tutSteps = [
        { title: 'TUTORIAL 1/5: Grab Raw Optics', text: 'Walk [WASD] to the flashing Optics Crate and press [SPACE] to pick it up.', find: s => s.crateItem === 'optics' },
        { title: 'TUTORIAL 2/5: Calibrate Optics', text: 'Place Optics on the Purple CALIBRATE station ([SPACE]) — raw optics must be calibrated!', find: s => s.type === 'A' },
        { title: 'TUTORIAL 3/5: Solder a Circuit', text: 'Grab Circuit -> put on Blue WELD bench & HOLD [SPACE] until welded!', find: s => lead.holding?.id === 'circuit' ? s.type === 'W' : s.crateItem === 'circuit' },
        { title: 'TUTORIAL 4/5: Assemble Fairing Tray', text: 'Plate BOTH Cal. Optics & Solder PCB onto a Fairing Tray ([SPACE])!', find: s => s.item?.kind === 'tray' },
        { title: 'TUTORIAL 5/5: Ship on Conveyor', text: 'Carry your completed Tray to the Right CONVEYOR ([SPACE]) to install it on the rocket!', find: s => s.type === '>' }
      ];
      const cur = tutSteps[state.tutorial.step] || tutSteps[0];
      const targetSt = state.stations.find(cur.find);
      if (targetSt) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
        const bob = Math.sin(performance.now() * 0.01) * 6;
        ctx.save();
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.55 + pulse * 0.45})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(targetSt.x - 4, targetSt.y - 4, TILE + 8, TILE + 8, 12); ctx.stroke();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(targetSt.x + TILE / 2, targetSt.y - 10 + bob);
        ctx.lineTo(targetSt.x + TILE / 2 - 9, targetSt.y - 24 + bob);
        ctx.lineTo(targetSt.x + TILE / 2 + 9, targetSt.y - 24 + bob);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(19, 27, 44, 0.95)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(16, 8, 934, 34, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38bdf8'; ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(cur.title, 30, 29);
      ctx.fillStyle = '#eef2f8'; ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(cur.text, 250, 29);

      // Skip Tutorial clickable pill
      ctx.fillStyle = '#24314e';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(964, 10, 140, 30, 15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cbd5e1'; ctx.font = '600 11.5px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Skip Tutorial [Tab]', 1034, 29);
    } else {
      const guideText = getLeadGuidanceText(lead);
      ctx.fillStyle = 'rgba(19, 27, 44, 0.92)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(16, 8, 690, 32, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0f2fe';
      ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(guideText, 32, 28);

      // Mission Readiness Forecast pill on right side of gantry
      const pwrOk = state.telemetry.power >= 30;
      const comOk = state.telemetry.comms >= 60;
      const massOk = state.telemetry.mass <= state.telemetry.maxMass;
      ctx.fillStyle = 'rgba(19, 27, 44, 0.92)';
      ctx.strokeStyle = massOk ? 'rgba(74, 222, 128, 0.38)' : 'rgba(248, 113, 113, 0.6)';
      ctx.beginPath(); ctx.roundRect(718, 8, 386, 32, 16); ctx.fill(); ctx.stroke();
      ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = massOk ? '#4ade80' : '#f87171';
      ctx.fillText(
        `Mass ${massOk ? 'OK' : 'OVER!'}  •  Power ${pwrOk ? 'OK' : 'LOW'}  •  Comms ${comOk ? 'OK' : 'LOW'}`,
        911,
        28
      );
    }

    if (state.stage1Combo > 1 && !state.tutorial?.active) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.roundRect(LOGICAL_W - 146, 46, 126, 24, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`STREAK x${state.stage1Combo}`, LOGICAL_W - 83, 62);
    }
  }

  if (facing && lead) {
    let hint = '';
    if (facing.type === 'CRATE' && !lead.holding) hint = `[SPACE] Grab ${RAW_ITEMS[facing.crateItem].name}`;
    else if (facing.type === 'W' && facing.item && facing.item.kind === 'raw') hint = `[HOLD SPACE] Welding ${Math.round(facing.progress * 100)}%`;
    else if (facing.type === '>' && lead.holding && lead.holding.kind === 'tray' && lead.holding.parts.length === 2) hint = `[SPACE] Submit Module! 🚀`;
    else if (lead.holding && facing.item && ((lead.holding.kind === 'tray' && facing.item.kind === 'proc') || (lead.holding.kind === 'proc' && facing.item.kind === 'tray'))) hint = `[SPACE] Plate onto Tray`;
    else if (!lead.holding && facing.item) hint = `[SPACE] Pick Up`;
    else if (lead.holding && !facing.item) hint = `[SPACE] Place`;

    if (hint) {
      ctx.font = 'bold 11px Fredoka, sans-serif';
      const tw = ctx.measureText(hint).width + 18;
      const px = Math.max(8, Math.min(1120 - tw - 8, facing.x + TILE / 2 - tw / 2));
      const py = Math.max(8, facing.y - 32);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(px, py, tw, 22, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(hint, px + tw / 2, py + 15);
    }
  }
}
