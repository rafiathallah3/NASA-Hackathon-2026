import { LOGICAL_W, LOGICAL_H, COLS, ROWS, TILE, GRID_X, GRID_Y, STAGE1_LAYOUT, RAW_ITEMS, PROC_META, RECIPES, CREW_ROSTER } from '../config.js';
import { state, getScenario, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet, isWsMultiplayer, isHumanSlotInWs, getMyWsSlot } from '../net.js';
import { getSlotKeys } from '../sync.js';
import { addFloatText, drawItemBadge, drawChibiEngineer, drawHardwareCanvas } from '../sprites.js';
import { getAsset, getAnimFrame, getAnimFrameBounds, getSheetSlice, isImageReady } from '../assets.js';
import { renderTicketsHUD, updateTicketBarsOnly, updateBottomHUD, setStageBanner, showMissionToast, getActiveTargetRecipe, isProcPartReadyInHangar, isUiTourActive } from '../hud.js';

const PLAYER_RADIUS = 12;
const NAV_CELL = 16;
const NAV_COLS = Math.ceil(LOGICAL_W / NAV_CELL);
const NAV_ROWS = Math.ceil(LOGICAL_H / NAV_CELL);
let navGrid = null;

function getFloorBoundsAtY(y) {
  const f = STAGE1_LAYOUT.floor;
  const lt = Math.max(0, Math.min(1, (y - f.leftWallTopY) / (f.leftWallBottomY - f.leftWallTopY)));
  const minX = f.leftWallTopX + (f.leftWallBottomX - f.leftWallTopX) * lt;
  const rt = Math.max(0, Math.min(1, (y - f.rightWallTopY) / (f.rightWallBottomY - f.rightWallTopY)));
  const maxX = f.rightWallTopX + (f.rightWallBottomX - f.rightWallTopX) * rt;
  return { minX, maxX };
}

function collidesAt(nx, ny, r = PLAYER_RADIUS) {
  const f = STAGE1_LAYOUT.floor;
  if (ny - r < f.topY || ny + r > f.bottomY) return true;
  const { minX, maxX } = getFloorBoundsAtY(ny);
  if (nx - r < minX || nx + r > maxX) return true;
  for (const ob of STAGE1_LAYOUT.obstacles) {
    if (nx + r > ob.x && nx - r < ob.x + ob.w && ny + r > ob.y && ny - r < ob.y + ob.h) {
      return true;
    }
  }
  for (const s of state.stations) {
    if (s.type === 'G' || s.type === 'L') continue;
    if (nx + r > s.x && nx - r < s.x + s.w && ny + r > s.y && ny - r < s.y + s.h) {
      return true;
    }
  }
  return false;
}

function rebuildNavGrid() {
  navGrid = Array.from({ length: NAV_ROWS }, (_, nr) =>
    Array.from({ length: NAV_COLS }, (_, nc) => {
      const cx = (nc + 0.5) * NAV_CELL;
      const cy = (nr + 0.5) * NAV_CELL;
      return !collidesAt(cx, cy, PLAYER_RADIUS);
    })
  );
}

function isWalkableNavCell(nr, nc) {
  if (nr < 0 || nr >= NAV_ROWS || nc < 0 || nc >= NAV_COLS) return false;
  if (!navGrid) rebuildNavGrid();
  return navGrid[nr][nc];
}

function toNavCell(x, y) {
  return {
    r: Math.max(0, Math.min(NAV_ROWS - 1, Math.floor(y / NAV_CELL))),
    c: Math.max(0, Math.min(NAV_COLS - 1, Math.floor(x / NAV_CELL)))
  };
}

function findNearestWalkableCell(startR, startC) {
  const sr = Math.max(0, Math.min(NAV_ROWS - 1, startR));
  const sc = Math.max(0, Math.min(NAV_COLS - 1, startC));
  if (isWalkableNavCell(sr, sc)) return { r: sr, c: sc };
  const visited = Array.from({ length: NAV_ROWS }, () => Array(NAV_COLS).fill(false));
  const queue = [{ r: sr, c: sc }];
  visited[sr][sc] = true;
  const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const d of dirs) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (nr < 0 || nr >= NAV_ROWS || nc < 0 || nc >= NAV_COLS || visited[nr][nc]) continue;
      if (isWalkableNavCell(nr, nc)) return { r: nr, c: nc };
      visited[nr][nc] = true;
      queue.push({ r: nr, c: nc });
    }
  }
  return toNavCell(556, 290);
}

function findNearestWalkablePoint(x, y) {
  const cell = toNavCell(x, y);
  const safe = findNearestWalkableCell(cell.r, cell.c);
  return { x: (safe.c + 0.5) * NAV_CELL, y: (safe.r + 0.5) * NAV_CELL };
}

export function buildStage1Map() {
  state.stations = STAGE1_LAYOUT.stations.map(def => {
    const w = def.w ?? TILE;
    const h = def.h ?? TILE;
    const st = {
      ...def,
      w,
      h,
      vx: def.vx ?? def.x,
      vy: def.vy ?? def.y,
      vw: def.vw ?? w,
      vh: def.vh ?? h,
      cx: def.x + w / 2,
      cy: def.y + h / 2,
      itemX: def.itemX ?? (def.x + w / 2),
      itemY: def.itemY ?? (def.y + h * 0.42),
      item: def.defaultTray ? { kind: 'tray', parts: [], touchedBy: [] } : null,
      progress: 0,
      onFire: false,
      fireProg: 0,
      traysCount: def.type === 'T' ? 4 : 0,
      hasExtinguisher: def.type === 'F'
    };
    return st;
  });
  rebuildNavGrid();
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
  state.tutorial = { active: false, step: 5, paused: false, skipped: true };
  showMissionToast('Guide Closed', 'Follow the gold target outline and floor trail to build modules.');
}

export function handleStage1CanvasClick(lx, ly) {
  if (isUiTourActive()) return;
  if (state.stage !== 'STAGE1' || !state.tutorial?.active) return;
  const rects = state.tutorialBtnRects || {};
  if (rects.skip && lx >= rects.skip.x && lx <= rects.skip.x + rects.skip.w && ly >= rects.skip.y && ly <= rects.skip.y + rects.skip.h) {
    skipStage1Tutorial();
    return;
  }
  if (state.tutorial.paused) {
    state.tutorial.paused = false;
    playTone(540, 'sine', 0.06, 0.06);
  }
}

export function initStage1() {
  setStageBanner('', '', '', `<kbd>WASD</kbd> Move &nbsp;•&nbsp; <kbd>SPACE</kbd> Pick / Place &nbsp;•&nbsp; <kbd>SHIFT</kbd> Dash &nbsp;•&nbsp; <kbd>F</kbd> Throw &nbsp;•&nbsp; <kbd>1-4</kbd> Crew`, {
    showTickets: true,
    showSkip: true,
    showNext: false
  });

  buildStage1Map();
  const preferredSpots = [
    { x: 205, y: 286, a: 0 },
    { x: 556, y: 286, a: 0 },
    { x: 556, y: 452, a: Math.PI },
    { x: 890, y: 286, a: Math.PI }
  ];
  state.players = CREW_ROSTER.map((cr, i) => {
    const pref = preferredSpots[i];
    const safePt = findNearestWalkablePoint(pref.x, pref.y);
    return {
      name: cr.id,
      role: cr.role,
      x: safePt.x,
      y: safePt.y,
      angle: pref.a,
      color: cr.color,
      visor: cr.visor,
      holding: null,
      walk: 0,
      cd: 0,
      dashCd: 0,
      dashTimer: 0,
      dashVx: 0,
      dashVy: 0,
      stuckTime: 0,
      lastX: 0,
      lastY: 0
    };
  });

  state.elapsedStage1 = 0;
  state.stage1Combo = 0;
  state.stage1ComboTimer = 0;
  state.pinnedRecipeId = null;
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
  state.tutorial = {
    active: !state.tutorial?.skipped,
    step: 0,
    paused: !state.tutorial?.skipped,
    skipped: Boolean(state.tutorial?.skipped),
    startShipped: state.shippedCount || 0
  };
  renderTicketsHUD();
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
  const f = STAGE1_LAYOUT.floor;
  const rawTy = Math.max(f.topY + 18, Math.min(f.bottomY - 12, p.y + Math.sin(p.angle) * dist));
  const { minX, maxX } = getFloorBoundsAtY(rawTy);
  state.thrownItems.push({
    x: p.x + Math.cos(p.angle) * 20,
    y: p.y + Math.sin(p.angle) * 14,
    startX: p.x + Math.cos(p.angle) * 20,
    startY: p.y + Math.sin(p.angle) * 14,
    tx: Math.max(minX + 18, Math.min(maxX - 18, p.x + Math.cos(p.angle) * dist)),
    ty: rawTy,
    t: 0,
    dur: 0.34,
    item,
    thrower: p.name
  });
  playTone(580, 'triangle', 0.09, 0.09);
}

function distToStationRect(px, py, st) {
  const nx = Math.max(st.x, Math.min(st.x + st.w, px));
  const ny = Math.max(st.y, Math.min(st.y + st.h, py));
  return Math.hypot(px - nx, py - ny);
}

export function getFacingStation(p) {
  const reach = 34;
  const fx = p.x + Math.cos(p.angle) * reach;
  const fy = p.y + Math.sin(p.angle) * reach;
  let best = null;
  let bestScore = 999;
  for (const st of state.stations) {
    if (st.type === 'G' || st.type === 'L') continue;
    const dist = distToStationRect(fx, fy, st);
    const pDist = distToStationRect(p.x, p.y, st);
    if (dist < 30 && pDist < 48) {
      const centerTie = Math.hypot(fx - st.cx, fy - st.cy) * 0.08;
      const sc = dist + pDist * 0.25 + centerTie;
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
  if (!st || st.type === 'G' || st.type === 'L') return;

  if (st.type === 'F') {
    if (!p.holding && st.hasExtinguisher) {
      st.hasExtinguisher = false;
      p.holding = { kind: 'extinguisher' };
      addFloatText(st.cx, st.y, 'CO2 Extinguisher!', '#e2e8f0');
      playTone(540, 'sine', 0.08, 0.08);
    } else if (p.holding && p.holding.kind === 'extinguisher') {
      p.holding = null;
      st.hasExtinguisher = true;
      addFloatText(st.cx, st.y, 'Returned CO2', '#94a3b8');
      playTone(420, 'sine', 0.07, 0.07);
    }
    return;
  }

  if (st.type === 'X') {
    if (p.holding) {
      if (p.holding.kind === 'tray') {
        p.holding.parts = [];
        p.holding.touchedBy = [];
        addFloatText(st.cx, st.y, 'Tray Cleared!', '#94a3b8');
      } else if (p.holding.kind !== 'extinguisher') {
        p.holding = null;
        addFloatText(st.cx, st.y, 'Scrapped!', '#f87171');
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
        if (state.pinnedRecipeId === rec.id) {
          state.pinnedRecipeId = null;
        }
        state.telemetry.power += rec.telemetry.power;
        state.telemetry.comms += rec.telemetry.comms;
        state.telemetry.science += rec.telemetry.science;
        state.telemetry.fuel = Math.min(125, state.telemetry.fuel + rec.telemetry.fuel);

        const allFourBuilt = Object.values(state.shippedModules).every(cnt => cnt >= 1);
        if (allFourBuilt && !state.missionChoices.fullStackBonus) {
          state.missionChoices.fullStackBonus = true;
          state.score += 150;
          addFloatText(LOGICAL_W / 2, 160, '🚀 FULL 4-SEGMENT ROCKET INTEGRATED! +150⭐', '#fde047');
          logBlackBox('STAGE 1A', 'All 4 core NASA segment modules integrated into payload fairing (+150⭐ bonus).', 'good');
        }

        logBlackBox('STAGE 1A', `${p.name} shipped ${rec.title} (+${rec.massKg}kg, -$${rec.costM}M${coopBonus ? ', Co-Op Pass!' : ''}).`, 'good');
        showMissionToast(rec.title, rec.lesson);
        state.screenShake = Math.max(state.screenShake || 0, 0.15);

        state.orders = state.orders.filter(o => o.uid !== matched.uid);
        const beltX = st.vx ?? st.x;
        const beltW = st.vw ?? st.w;
        state.flyingDeliveries.push({
          x: beltX + 28,
          y: st.itemY,
          intakeX: beltX + beltW * 0.82,
          parts: [...p.holding.parts]
        });
        p.holding = null;
        state.trayReturnQueue.push(2.5);
        spawnOrder(rec.id);
        renderTicketsHUD();
        updateBottomHUD();
        const tag = coopBonus > 0 ? `CO-OP SHIPPED! +${pts}⭐` : state.stage1Combo > 1 ? `COMBO x${state.stage1Combo}! +${pts}⭐` : `SHIPPED! +${pts}⭐`;
        addFloatText(st.cx, st.y, tag, coopBonus > 0 ? '#fde047' : '#4ade80');
        playSuccessChord();
      } else {
        addFloatText(st.cx, st.y, 'No Matching Ticket!', '#f87171');
        playTone(150, 'square', 0.18, 0.1);
      }
    } else {
      addFloatText(st.cx, st.y, 'Need Full 2-Part Tray!', '#fbbf24');
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
      addFloatText(st.cx, st.y, '🔥 Grab CO2 Extinguisher [F]!', '#f87171');
      playTone(170, 'sawtooth', 0.12, 0.08);
    }
    return;
  }

  const isProc = (st.type === 'W' || st.type === 'A' || st.type === 'P');

  if (!p.holding && st.item) {
    if ((st.type === 'A' || st.type === 'P') && st.item.kind === 'raw' && st.progress < 1) {
      addFloatText(st.cx, st.y, 'Processing...', '#fbbf24');
      return;
    }
    p.holding = st.item;
    if (st.type === '#' && p.holding.lastBy && p.holding.lastBy !== p.name) {
      addFloatText(st.cx, st.y - 12, 'Nice Catch! 🤝', '#38bdf8');
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
      addFloatText(st.cx, st.y, 'Plated!', '#38bdf8');
      playTone(660, 'triangle', 0.09, 0.09);
    } else {
      addFloatText(st.cx, st.y, 'Wrong Combo!', '#f87171');
    }
    return;
  }

  if (p.holding && !st.item && p.holding.kind !== 'extinguisher') {
    if (isProc) {
      if (p.holding.kind !== 'raw') {
        addFloatText(st.cx, st.y, 'Raw Parts Only!', '#f87171');
        return;
      }
      const rawMeta = RAW_ITEMS[p.holding.id];
      const reqType = st.type === 'W' ? 'weld' : st.type === 'A' ? 'calibrate' : 'charge';
      if (rawMeta.procType !== reqType) {
        const names = { weld: 'Weld Bench', calibrate: 'Calibrate Rig', charge: 'Power Charger' };
        addFloatText(st.cx, st.y, `Use ${names[rawMeta.procType]}!`, '#fbbf24');
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

function resolveBoxOverlap(p, box, r) {
  const left = box.x - r;
  const right = box.x + box.w + r;
  const top = box.y - r;
  const bottom = box.y + box.h + r;
  if (p.x > left && p.x < right && p.y > top && p.y < bottom) {
    const candidates = [
      { x: left, y: p.y, pen: p.x - left },
      { x: right, y: p.y, pen: right - p.x },
      { x: p.x, y: top, pen: p.y - top },
      { x: p.x, y: bottom, pen: bottom - p.y }
    ].filter(c => !collidesAt(c.x, c.y, r));
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.pen - b.pen);
      p.x = candidates[0].x;
      p.y = candidates[0].y;
    }
  }
}

function pushOutOfStations(p, r = PLAYER_RADIUS) {
  const f = STAGE1_LAYOUT.floor;
  p.y = Math.max(f.topY + r, Math.min(f.bottomY - r, p.y));
  const { minX, maxX } = getFloorBoundsAtY(p.y);
  p.x = Math.max(minX + r, Math.min(maxX - r, p.x));

  if (!collidesAt(p.x, p.y, r)) return;

  for (const ob of STAGE1_LAYOUT.obstacles) {
    resolveBoxOverlap(p, ob, r);
  }
  for (const s of state.stations) {
    if (s.type === 'G' || s.type === 'L') continue;
    resolveBoxOverlap(p, s, r);
  }

  if (collidesAt(p.x, p.y, r)) {
    const safePt = findNearestWalkablePoint(p.x, p.y);
    p.x = safePt.x;
    p.y = safePt.y;
  }
}

function moveStage1Player(p, vx, vy) {
  if (vx !== 0 || vy !== 0) {
    p.angle = Math.atan2(vy, vx);
    p.walk += 0.22;
  }
  const r = PLAYER_RADIUS;
  pushOutOfStations(p, r);

  if (!collidesAt(p.x + vx, p.y, r)) {
    p.x += vx;
  } else if (vx !== 0) {
    for (const step of [2.5, -2.5, 5, -5]) {
      if (!collidesAt(p.x + vx, p.y + step, r) && !collidesAt(p.x, p.y + step, r)) {
        p.y += Math.sign(step) * Math.min(Math.abs(step), 2.5);
        break;
      }
    }
  }

  if (!collidesAt(p.x, p.y + vy, r)) {
    p.y += vy;
  } else if (vy !== 0) {
    for (const step of [2.5, -2.5, 5, -5]) {
      if (!collidesAt(p.x + step, p.y + vy, r) && !collidesAt(p.x + step, p.y, r)) {
        p.x += Math.sign(step) * Math.min(Math.abs(step), 2.5);
        break;
      }
    }
  }
}

function getStationStandTile(st, actor) {
  const candidates = [];
  const offsets = [18, 24];
  for (const off of offsets) {
    const xs = [st.x + st.w * 0.2, st.x + st.w * 0.5, st.x + st.w * 0.8];
    const ys = [st.y + st.h * 0.25, st.y + st.h * 0.5, st.y + st.h * 0.75];
    for (const px of xs) {
      candidates.push({ x: px, y: st.y - off });
      candidates.push({ x: px, y: st.y + st.h + off });
    }
    for (const py of ys) {
      candidates.push({ x: st.x - off, y: py });
      candidates.push({ x: st.x + st.w + off, y: py });
    }
  }

  let best = null;
  let bestDist = 99999;
  for (const pt of candidates) {
    if (collidesAt(pt.x, pt.y, PLAYER_RADIUS)) continue;
    const cell = toNavCell(pt.x, pt.y);
    if (!isWalkableNavCell(cell.r, cell.c)) continue;
    const d = Math.hypot(pt.x - actor.x, pt.y - actor.y);
    if (d < bestDist) {
      bestDist = d;
      best = { r: cell.r, c: cell.c, x: pt.x, y: pt.y };
    }
  }
  if (best) return best;

  const fallback = findNearestWalkablePoint(st.cx, st.y + st.h + 22);
  const fCell = toNavCell(fallback.x, fallback.y);
  return { r: fCell.r, c: fCell.c, x: fallback.x, y: fallback.y };
}

function findFullPathBFS(startR, startC, goalR, goalC) {
  const safeStart = isWalkableNavCell(startR, startC) ? { r: startR, c: startC } : findNearestWalkableCell(startR, startC);
  const safeGoal = isWalkableNavCell(goalR, goalC) ? { r: goalR, c: goalC } : findNearestWalkableCell(goalR, goalC);
  if (safeStart.r === safeGoal.r && safeStart.c === safeGoal.c) return [safeStart];

  const visited = Array.from({ length: NAV_ROWS }, () => Array(NAV_COLS).fill(false));
  const parent = Array.from({ length: NAV_ROWS }, () => Array(NAV_COLS).fill(null));
  const queue = [safeStart];
  visited[safeStart.r][safeStart.c] = true;
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 }
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.r === safeGoal.r && cur.c === safeGoal.c) {
      const path = [];
      let p = cur;
      while (p) {
        path.unshift(p);
        p = parent[p.r][p.c];
      }
      return path;
    }
    for (const d of dirs) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (!isWalkableNavCell(nr, nc) || visited[nr][nc]) continue;
      if (d.dr !== 0 && d.dc !== 0) {
        if (!isWalkableNavCell(cur.r + d.dr, cur.c) || !isWalkableNavCell(cur.r, cur.c + d.dc)) continue;
      }
      visited[nr][nc] = true;
      parent[nr][nc] = cur;
      queue.push({ r: nr, c: nc });
    }
  }
  return [safeStart, safeGoal];
}

function findNextStepBFS(startR, startC, goalR, goalC) {
  const path = findFullPathBFS(startR, startC, goalR, goalC);
  return path.length > 1 ? path[1] : path[0];
}

function updateStage1Bot(bot, botSlot, claimedStations, dt) {
  if (state.orders.length === 0) return;

  // Pick a target recipe: primary bot assists active target, others assist remaining unbuilt modules
  const activeRec = getActiveTargetRecipe();
  const unbuiltOrders = state.orders.filter(o => (state.shippedModules[o.recipe.id] || 0) === 0);
  const chosenOrder = botSlot === 0
    ? (state.orders.find(o => o.recipe.id === activeRec.id) || state.orders[0])
    : (unbuiltOrders[botSlot % Math.max(1, unbuiltOrders.length)] || state.orders[botSlot % state.orders.length]);
  const needed = chosenOrder.recipe.reqs;

  const canClaim = s => s && !claimedStations.has(s);
  const traySt = state.stations.find(s => canClaim(s) && s.item && s.item.kind === 'tray' &&
    s.item.parts.every(pt => needed.includes(pt)) && s.item.parts.length < 2);
  const fullTraySt = state.stations.find(s => canClaim(s) && s.item && s.item.kind === 'tray' &&
    s.item.parts.length === 2);

  let targetSt = null;
  let act = null;

  if (bot.holding && bot.holding.kind === 'extinguisher') {
    const fireSt = state.stations.find(s => s.onFire);
    if (fireSt) {
      targetSt = fireSt;
      act = 'extinguish';
    } else {
      targetSt = state.stations.find(s => s.type === 'F');
      act = 'interact';
    }
  } else if (bot.holding && bot.holding.kind === 'tray' && bot.holding.parts.length === 2) {
    targetSt = state.stations.find(s => canClaim(s) && s.type === '>' && s.r >= 1) || state.stations.find(s => s.type === '>');
    act = 'interact';
  } else if (bot.holding && bot.holding.kind === 'tray' && bot.holding.parts.length < 2) {
    targetSt = state.stations.find(s => canClaim(s) && s.type === '#' && !s.item && s.c >= 6 && s.c <= 13)
      || state.stations.find(s => canClaim(s) && s.type === '#' && !s.item);
    act = 'interact';
  } else if (bot.holding && bot.holding.kind === 'proc') {
    if (bot.holding.id === 'burned') {
      targetSt = state.stations.find(s => s.type === 'X');
      act = 'interact';
    } else {
      const compatTray = state.stations.find(s => canClaim(s) && s.item && s.item.kind === 'tray' && canAcceptPartOnTray(s.item, bot.holding.id));
      if (compatTray) {
        targetSt = compatTray;
        act = 'interact';
      } else {
        targetSt = state.stations.find(s => canClaim(s) && s.type === '#' && !s.item && s.c >= 6 && s.c <= 13)
          || state.stations.find(s => canClaim(s) && s.type === '#' && !s.item);
        act = 'interact';
      }
    }
  } else if (bot.holding && bot.holding.kind === 'raw') {
    const rawMeta = RAW_ITEMS[bot.holding.id];
    const bType = rawMeta.procType === 'weld' ? 'W' : rawMeta.procType === 'calibrate' ? 'A' : 'P';
    const freeBench = state.stations.find(s => canClaim(s) && s.type === bType && !s.item && !s.onFire);
    if (freeBench) {
      targetSt = freeBench;
      act = 'interact';
    } else {
      const waitWeld = state.stations.find(s => canClaim(s) && s.type === 'W' && s.item && s.item.kind === 'raw');
      if (waitWeld) {
        targetSt = waitWeld;
        act = 'weld';
      }
    }
  } else if (!bot.holding) {
    const fireSt = state.stations.find(s => s.onFire);
    const extSt = state.stations.find(s => s.type === 'F' && s.hasExtinguisher);
    if (fireSt && extSt && canClaim(extSt)) {
      targetSt = extSt;
      act = 'interact';
    } else if (fullTraySt) {
      targetSt = fullTraySt;
      act = 'interact';
    } else {
      const readyPartSt = state.stations.find(s => canClaim(s) && s.item && s.item.kind === 'proc' && needed.includes(s.item.id) &&
        (!traySt || !traySt.item.parts.includes(s.item.id)));
      if (readyPartSt && traySt) {
        targetSt = readyPartSt;
        act = 'interact';
      } else if (!traySt && !fullTraySt) {
        const rack = state.stations.find(s => canClaim(s) && s.type === 'T' && s.traysCount > 0);
        if (rack) {
          targetSt = rack;
          act = 'interact';
        }
      }
      if (!targetSt) {
        const rawWeld = state.stations.find(s => canClaim(s) && s.type === 'W' && s.item && s.item.kind === 'raw');
        if (rawWeld) {
          targetSt = rawWeld;
          act = 'weld';
        } else {
          const existing = traySt ? traySt.item.parts : [];
          const inFlightProc = state.stations
            .filter(s => s.item && (s.item.kind === 'proc' || s.item.kind === 'raw'))
            .map(s => s.item.kind === 'raw' ? RAW_ITEMS[s.item.id]?.result : s.item.id);
          const miss = needed.find(req => !existing.includes(req) && !inFlightProc.includes(req)) || needed[botSlot % needed.length];
          const rawKey = Object.keys(RAW_ITEMS).find(k => RAW_ITEMS[k].result === miss);
          if (rawKey) {
            const crate = state.stations.find(s => canClaim(s) && s.type === 'CRATE' && s.crateItem === rawKey);
            if (crate) {
              targetSt = crate;
              act = 'interact';
            }
          }
        }
      }
    }
  }

  if (targetSt) {
    claimedStations.add(targetSt);
    const stand = getStationStandTile(targetSt, bot);
    const distToGoal = Math.hypot(stand.x - bot.x, stand.y - bot.y);

    if (distToGoal > 12) {
      const curCell = toNavCell(bot.x, bot.y);
      const nextCell = findNextStepBFS(curCell.r, curCell.c, stand.r, stand.c);
      const wpX = (nextCell.r === stand.r && nextCell.c === stand.c) ? stand.x : (nextCell.c + 0.5) * NAV_CELL;
      const wpY = (nextCell.r === stand.r && nextCell.c === stand.c) ? stand.y : (nextCell.r + 0.5) * NAV_CELL;

      let vx = wpX - bot.x;
      let vy = wpY - bot.y;
      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;

      // Soft repulsion from other crewmates so bots never stack on one pixel
      for (const other of state.players) {
        if (other === bot) continue;
        const odx = bot.x - other.x;
        const ody = bot.y - other.y;
        const od = Math.hypot(odx, ody);
        if (od > 0.1 && od < 26) {
          vx += (odx / od) * 0.25;
          vy += (ody / od) * 0.25;
        }
      }
      const vLen = Math.hypot(vx, vy) || 1;
      moveStage1Player(bot, (vx / vLen) * 185 * dt, (vy / vLen) * 185 * dt);

      // Anti-stuck check
      if (Math.hypot(bot.x - (bot.lastX || bot.x), bot.y - (bot.lastY || bot.y)) < 18 * dt) {
        bot.stuckTime = (bot.stuckTime || 0) + dt;
        if (bot.stuckTime > 0.45 && isWalkableNavCell(curCell.r, curCell.c)) {
          bot.x += ((curCell.c + 0.5) * NAV_CELL - bot.x) * 0.35;
          bot.y += ((curCell.r + 0.5) * NAV_CELL - bot.y) * 0.35;
          bot.stuckTime = 0;
        }
      } else {
        bot.stuckTime = 0;
      }
      bot.lastX = bot.x;
      bot.lastY = bot.y;
    } else {
      const aimX = Math.max(targetSt.x + 6, Math.min(targetSt.x + targetSt.w - 6, bot.x));
      const aimY = Math.max(targetSt.y + 6, Math.min(targetSt.y + targetSt.h - 6, bot.y));
      bot.angle = Math.atan2(aimY - bot.y, aimX - bot.x);
      if (act === 'interact') {
        bot.cd = (bot.cd || 0) - dt;
        if (bot.cd <= 0) {
          handleStage1Interact(bot);
          bot.cd = 0.38;
        }
      } else if (act === 'weld' || act === 'extinguish') {
        applyHoldWork(bot, dt);
      }
    }
  } else {
    // Idle standby home positions out of the player's way
    const homes = [
      { x: 200, y: 548 },
      { x: 556, y: 548 },
      { x: 556, y: 286 },
      { x: 890, y: 420 }
    ];
    const h = homes[botSlot % homes.length];
    const hd = Math.hypot(h.x - bot.x, h.y - bot.y);
    if (hd > 18) {
      const curCell = toNavCell(bot.x, bot.y);
      const goalCell = toNavCell(h.x, h.y);
      const nextCell = findNextStepBFS(curCell.r, curCell.c, goalCell.r, goalCell.c);
      const wpX = (nextCell.c + 0.5) * NAV_CELL;
      const wpY = (nextCell.r + 0.5) * NAV_CELL;
      const dx = wpX - bot.x, dy = wpY - bot.y, d = Math.hypot(dx, dy) || 1;
      moveStage1Player(bot, (dx / d) * 150 * dt, (dy / d) * 150 * dt);
    }
  }
}

function applyHoldWork(p, dt) {
  const facing = getFacingStation(p);
  if (!facing) return;
  if (facing.onFire && p.holding && p.holding.kind === 'extinguisher') {
    facing.fireProg += dt * 1.1;
    if (Math.random() < 0.5) {
      state.hangarSparks.push({ x: facing.cx, y: facing.y + 16, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, life: 0.35, color: '#f8fafc' });
    }
    if (facing.fireProg >= 1) {
      facing.onFire = false;
      facing.fireProg = 0;
      if (facing.item && facing.item.id === 'burned') {
        facing.item = null;
        facing.progress = 0;
      }
      state.score += 30;
      addFloatText(facing.cx, facing.y, 'FIRE DOUSED! +30⭐', '#4ade80');
      playSuccessChord();
    }
    return;
  }
  if (facing.type === 'W' && !facing.onFire && facing.item && facing.item.kind === 'raw') {
    facing.progress += dt * 0.72;
    if (Math.random() < 0.35) {
      state.hangarSparks.push({ x: facing.cx, y: facing.y + 18, vx: (Math.random() - 0.5) * 110, vy: -35 - Math.random() * 50, life: 0.35, color: '#fde047' });
    }
    if (Math.random() < 0.3) playTone(320 + Math.random() * 260, 'sawtooth', 0.04, 0.04);
    if (facing.progress >= 1) {
      facing.item = { kind: 'proc', id: RAW_ITEMS[facing.item.id].result, lastBy: p.name };
      facing.progress = 1;
      addFloatText(facing.cx, facing.y, 'Welded!', '#4ade80');
      playTone(760, 'triangle', 0.12, 0.1);
    }
  }
}

export function updateStage1(dt) {
  const lead = state.players[state.activeCrewIndex] || state.players[0];
  if (lead) pushOutOfStations(lead, PLAYER_RADIUS);

  // When paused on a Stage 1 Spotlight Tutorial step, hold timers & bots so the player can read the spotlight
  if (state.tutorial?.active && state.tutorial?.paused) {
    state.conveyorOffset = (state.conveyorOffset + dt * 24) % 24;
    updateBottomHUD();
    return;
  }

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

  if (isWsMultiplayer()) {
    for (let i = 0; i < state.players.length; i++) {
      const pl = state.players[i];
      if (!pl) continue;
      if (i !== getMyWsSlot() && !isHumanSlotInWs(i)) continue;
      pushOutOfStations(pl, PLAYER_RADIUS);
      const keys = getSlotKeys(i);
      if (pl.dashTimer <= 0) {
        let mx = 0, my = 0;
        if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) my += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
        if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
        moveStage1Player(pl, mx * 245 * dt, my * 245 * dt);
      }
      if (keys['Space'] || keys['KeyE']) {
        applyHoldWork(pl, dt);
      }
    }
  } else {
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
  }

  // During the guided walkthrough, let bots wait cleanly so they don't steal the player's first target parts
  if (!state.tutorial?.active && (state.coopMode === '4P_AI' || state.coopMode === 'LOCAL_2P' || state.coopMode === 'WS_4P')) {
    const claimedStations = new Set();
    for (let i = 0; i < state.players.length; i++) {
      const isHuman = isWsMultiplayer()
        ? (i === getMyWsSlot() || isHumanSlotInWs(i))
        : (i === state.activeCrewIndex || (state.coopMode === 'LOCAL_2P' && i === 1));
      if (!isHuman) continue;
      const facing = getFacingStation(state.players[i]);
      if (facing) claimedStations.add(facing);
    }
    let botSlot = 0;
    for (let i = 0; i < state.players.length; i++) {
      if (isWsMultiplayer()) {
        if (i === getMyWsSlot() || isHumanSlotInWs(i)) continue;
      } else {
        if (i === state.activeCrewIndex) continue;
        if (state.coopMode === 'LOCAL_2P' && i === 1) continue;
      }
      updateStage1Bot(state.players[i], botSlot++, claimedStations, dt);
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
      let landedSt = null, bestD = 38;
      for (const s of state.stations) {
        if (s.type === 'G' || s.type === 'L') continue;
        const d = distToStationRect(th.tx, th.ty, s);
        if (d < bestD) { bestD = d; landedSt = s; }
      }
      let absorbed = false;
      if (landedSt && !landedSt.onFire) {
        if (th.item.kind === 'proc' && landedSt.item && landedSt.item.kind === 'tray' && canAcceptPartOnTray(landedSt.item, th.item.id)) {
          landedSt.item.parts.push(th.item.id);
          landedSt.item.touchedBy = [...new Set([...(landedSt.item.touchedBy || []), th.thrower].filter(Boolean))];
          addFloatText(landedSt.cx, landedSt.y - 10, 'SLAM DUNK TRAY! 🎯', '#4ade80');
          playTone(720, 'triangle', 0.1, 0.1);
          absorbed = true;
        } else if (!landedSt.item && (landedSt.type === '#' || landedSt.type === 'W' || landedSt.type === 'A' || landedSt.type === 'P')) {
          const isProc = (landedSt.type === 'W' || landedSt.type === 'A' || landedSt.type === 'P');
          if (!isProc || (th.item.kind === 'raw' && RAW_ITEMS[th.item.id].procType === (landedSt.type === 'W' ? 'weld' : landedSt.type === 'A' ? 'calibrate' : 'charge'))) {
            landedSt.item = th.item;
            landedSt.progress = 0;
            addFloatText(landedSt.cx, landedSt.y - 10, 'Caught! 🙌', '#38bdf8');
            playTone(540, 'sine', 0.08, 0.08);
            absorbed = true;
          }
        }
      }
      if (!absorbed) {
        const dropPt = collidesAt(th.tx, th.ty, 8) ? findNearestWalkablePoint(th.tx, th.ty) : { x: th.tx, y: th.ty };
        state.floorItems.push({ x: dropPt.x, y: dropPt.y, item: th.item });
      }
      state.thrownItems.splice(i, 1);
    }
  }

  for (const st of state.stations) {
    if (st.onFire) {
      if (Math.random() < 0.45) {
        state.hangarSparks.push({
          x: st.cx + (Math.random() - 0.5) * Math.min(32, st.w * 0.6),
          y: st.y + 4,
          vx: (Math.random() - 0.5) * 26,
          vy: -52 - Math.random() * 38,
          life: 0.45,
          r: 2.5,
          color: Math.random() < 0.5 ? '#ef4444' : '#fde047'
        });
      }
      if (Math.random() < 0.35) {
        state.hangarSparks.push({
          x: st.cx + (Math.random() - 0.5) * Math.min(24, st.w * 0.5),
          y: st.y - 6,
          vx: (Math.random() - 0.5) * 18,
          vy: -36 - Math.random() * 22,
          life: 0.65,
          r: 6 + Math.random() * 5,
          isSmoke: true,
          color: 'rgba(148, 163, 184, 0.55)'
        });
      }
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
        if (st.progress >= 2.15) {
          st.item = { kind: 'proc', id: 'burned' };
          st.onFire = true;
          st.fireProg = 0;
          state.overheatedParts++;
          addFloatText(st.cx, st.y, 'BENCH FIRE! GRAB CO2 [F]!', '#ef4444');
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
    const fd = state.flyingDeliveries[i];
    fd.x += dt * 150;
    if (fd.x > (fd.intakeX ?? 1150) + 30) state.flyingDeliveries.splice(i, 1);
  }
  for (let i = state.hangarSparks.length - 1; i >= 0; i--) {
    const sp = state.hangarSparks[i];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    if (!sp.isSmoke) sp.vy += 180 * dt;
    sp.life -= dt;
    if (sp.life <= 0) state.hangarSparks.splice(i, 1);
  }

  // Interactive 5-Step Spotlight Tutorial Progression
  if (state.tutorial?.active) {
    const tut = state.tutorial;
    const calPlaced = state.stations.some(s => s.type === 'A' && s.item && (s.item.id === 'optics' || s.item.id === 'cal_optics'));
    const hasCalOptics = lead.holding?.id === 'cal_optics' || isProcPartReadyInHangar('cal_optics');
    const hasSolderPcb = lead.holding?.id === 'weld_circuit' || isProcPartReadyInHangar('weld_circuit');
    const hasFullTray =
      (lead.holding?.kind === 'tray' && lead.holding.parts.length === 2) ||
      state.stations.some(s => s.item?.kind === 'tray' && s.item.parts.length === 2);

    const advanceTo = (nextStep) => {
      tut.step = nextStep;
      tut.paused = true;
      playTone(620 + nextStep * 45, 'sine', 0.09, 0.09);
    };

    if (tut.step === 0 && (lead.holding?.id === 'optics' || calPlaced || hasCalOptics)) {
      advanceTo(1);
    } else if (tut.step === 1 && (calPlaced || hasCalOptics)) {
      advanceTo(2);
    } else if (tut.step === 2 && hasSolderPcb) {
      advanceTo(3);
    } else if (tut.step === 3 && hasFullTray) {
      advanceTo(4);
    } else if (tut.step === 4 && state.shippedCount > (tut.startShipped || 0)) {
      tut.active = false;
      tut.paused = false;
      tut.skipped = true;
      state.score += 50;
      addFloatText(LOGICAL_W / 2, 120, 'FIRST MODULE BUILT! +50⭐', '#4ade80');
      showMissionToast('Guide Complete', 'Build any modules under your mass and budget caps, or click Launch Mission.');
    }
  }

  updateBottomHUD();
}

function lerpAngleStage1(a, b, t) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

export function updateStage1GuestLocal(dt) {
  const mySlot = getMyWsSlot();
  state.activeCrewIndex = mySlot;

  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i];
    if (!pl) continue;
    if (i === mySlot) {
      pushOutOfStations(pl, PLAYER_RADIUS);
      pl.dashCd = Math.max(0, (pl.dashCd || 0) - dt);
      if (pl.dashTimer > 0) {
        pl.dashTimer -= dt;
        moveStage1Player(pl, pl.dashVx * dt, pl.dashVy * dt);
      } else {
        let mx = 0, my = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) my -= 1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) my += 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) mx -= 1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) mx += 1;
        if (mx !== 0 || my !== 0) {
          if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
          pl.facingX = mx;
          pl.facingY = my;
          pl.angle = Math.atan2(my, mx);
          pl.walk = (pl.walk || 0) + 0.24 * (dt * 60);
          moveStage1Player(pl, mx * 245 * dt, my * 245 * dt);
        }
      }
      pushOutOfStations(pl, PLAYER_RADIUS);
      if (typeof pl.netTx === 'number' && typeof pl.netTy === 'number') {
        const err = Math.hypot(pl.netTx - pl.x, pl.netTy - pl.y);
        if (err > 85) {
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
            pl.walk = (pl.walk || 0) + 0.24 * (dt * 60);
          }
        }
      }
      if (typeof pl.netAngle === 'number') {
        pl.angle = lerpAngleStage1(pl.angle || 0, pl.netAngle, Math.min(1, dt * 18));
      }
    }
  }

  for (let i = state.orders.length - 1; i >= 0; i--) {
    const ord = state.orders[i];
    if (ord.remaining > 0) ord.remaining = Math.max(0, ord.remaining - dt);
  }
  updateTicketBarsOnly();

  for (let i = state.thrownItems.length - 1; i >= 0; i--) {
    const th = state.thrownItems[i];
    th.t = Math.min(1, th.t + dt / (th.dur || 0.26));
    const ease = 1 - Math.pow(1 - th.t, 2);
    th.x = th.sx + (th.tx - th.sx) * ease;
    th.y = th.sy + (th.ty - th.sy) * ease - Math.sin(th.t * Math.PI) * 32;
  }

  for (const st of state.stations) {
    if ((st.type === 'A' || st.type === 'P') && st.item && !st.onFire) {
      if (st.item.kind === 'raw' && st.progress < 0.99) {
        st.progress = Math.min(0.99, st.progress + dt * 0.32);
      } else if (st.item.kind === 'proc' && st.item.id !== 'burned' && st.progress < 2.14) {
        st.progress = Math.min(2.14, st.progress + dt * 0.06);
      }
    }
  }

  state.conveyorOffset = (state.conveyorOffset + dt * 45) % 24;
  for (let i = state.flyingDeliveries.length - 1; i >= 0; i--) {
    const fd = state.flyingDeliveries[i];
    fd.x += dt * 150;
    if (fd.x > (fd.intakeX ?? 1150) + 30) state.flyingDeliveries.splice(i, 1);
  }
  for (let i = state.hangarSparks.length - 1; i >= 0; i--) {
    const sp = state.hangarSparks[i];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    if (!sp.isSmoke) sp.vy += 180 * dt;
    sp.life -= dt;
    if (sp.life <= 0) state.hangarSparks.splice(i, 1);
  }
}

function getTutorialStepInfo(lead) {
  const step = state.tutorial?.step || 0;
  const steps = [
    {
      title: 'Step 1 of 5: Pick up Optics',
      text: 'Walk to the highlighted Optics crate and press SPACE to grab it.',
      find: () => state.stations.find(s => s.crateItem === 'optics')
    },
    {
      title: 'Step 2 of 5: Calibrate Optics',
      text: 'Put Optics on a Purple CALIBRATE bench (SPACE). It calibrates automatically.',
      find: () => state.stations.find(s => s.type === 'A' && !s.item) || state.stations.find(s => s.type === 'A')
    },
    {
      title: 'Step 3 of 5: Weld a Circuit',
      text: lead?.holding?.id === 'circuit'
        ? 'Place Circuit on a Blue WELD bench (SPACE), then HOLD SPACE until finished.'
        : state.stations.some(s => s.type === 'W' && s.item?.id === 'circuit')
          ? 'Stand at the Blue WELD bench and HOLD SPACE until the Circuit finishes welding.'
          : 'Grab a Circuit from the top-left crate beside the lockers, place it on Blue WELD, and HOLD SPACE.',
      find: () => lead?.holding?.id === 'circuit'
        ? (state.stations.find(s => s.type === 'W' && !s.item) || state.stations.find(s => s.type === 'W'))
        : (state.stations.find(s => s.type === 'W' && s.item?.id === 'circuit') || state.stations.find(s => s.crateItem === 'circuit'))
    },
    {
      title: 'Step 4 of 5: Load Both onto a Tray',
      text: 'Pick up each finished part and press SPACE on a Tray to pack them together.',
      find: () => {
        if (lead?.holding?.kind === 'proc') {
          return state.stations.find(s => s.item?.kind === 'tray' && canAcceptPartOnTray(s.item, lead.holding.id))
            || state.stations.find(s => s.type === 'T' && s.traysCount > 0);
        }
        return state.stations.find(s => s.item?.kind === 'proc' && (s.item.id === 'cal_optics' || s.item.id === 'weld_circuit'))
          || state.stations.find(s => s.item?.kind === 'tray' && s.item.parts.length < 2)
          || state.stations.find(s => s.type === 'A' && s.item?.id === 'optics');
      }
    },
    {
      title: 'Step 5 of 5: Send on Submit Belt',
      text: lead?.holding?.kind === 'tray' && lead.holding.parts.length === 2
        ? 'Walk to any SUBMIT belt on the right and press SPACE to load the rocket.'
        : 'Pick up your 2-part READY tray and carry it to a right SUBMIT belt.',
      find: () => (lead?.holding?.kind === 'tray' && lead.holding.parts.length === 2)
        ? (state.stations.find(s => s.type === '>' && s.r >= 1) || state.stations.find(s => s.type === '>'))
        : (state.stations.find(s => s.item?.kind === 'tray' && s.item.parts.length === 2) || state.stations.find(s => s.type === '>'))
    }
  ];
  const cur = steps[Math.min(step, steps.length - 1)];
  return { ...cur, targetSt: cur.find() };
}

function drawStage1Trail(ctx, actor, targetSt, bright = false) {
  if (!actor || !targetSt) return;
  const stand = getStationStandTile(targetSt, actor);
  const startCell = toNavCell(actor.x, actor.y);
  const cellPath = findFullPathBFS(startCell.r, startCell.c, stand.r, stand.c);

  const rawPts = [{ x: actor.x, y: actor.y + 8 }];
  for (let i = 1; i < cellPath.length; i++) {
    rawPts.push({
      x: (cellPath[i].c + 0.5) * NAV_CELL,
      y: (cellPath[i].r + 0.5) * NAV_CELL
    });
  }
  // Simplify nearly collinear waypoints so dotted trail stays smooth
  const pts = [rawPts[0]];
  for (let i = 1; i < rawPts.length - 1; i++) {
    const prev = pts[pts.length - 1];
    const curr = rawPts[i];
    const next = rawPts[i + 1];
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    if (Math.abs(dx1 * dy2 - dy1 * dx2) > 12 || Math.hypot(curr.x - prev.x, curr.y - prev.y) > 48) {
      pts.push(curr);
    }
  }
  if (rawPts.length > 1) pts.push(rawPts[rawPts.length - 1]);
  pts.push({ x: targetSt.cx, y: targetSt.cy });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = bright ? 'rgba(253, 224, 71, 0.92)' : 'rgba(253, 224, 71, 0.36)';
  ctx.lineWidth = bright ? 4 : 2.5;
  ctx.setLineDash([8, 10]);
  ctx.lineDashOffset = -(performance.now() * 0.045) % 18;
  ctx.beginPath();
  pts.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Small directional dots along intermediate waypoints
  if (bright) {
    ctx.fillStyle = '#fde047';
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function getNextTargetStation(lead, targetRec) {
  if (!lead || !targetRec) return null;
  const needed = targetRec.reqs;

  const fireSt = state.stations.find(s => s.onFire);
  if (fireSt) {
    if (lead.holding?.kind === 'extinguisher') return fireSt;
    return state.stations.find(s => s.type === 'F' && s.hasExtinguisher) || fireSt;
  }

  if (lead.holding) {
    if (lead.holding.kind === 'tray' && lead.holding.parts.length === 2) {
      return state.stations.find(s => s.type === '>' && s.r >= 1) || state.stations.find(s => s.type === '>');
    }
    if (lead.holding.kind === 'raw') {
      const rm = RAW_ITEMS[lead.holding.id];
      const bType = rm.procType === 'weld' ? 'W' : rm.procType === 'calibrate' ? 'A' : 'P';
      return state.stations.find(s => s.type === bType && !s.item) || state.stations.find(s => s.type === bType);
    }
    if (lead.holding.kind === 'proc') {
      if (lead.holding.id === 'burned') return state.stations.find(s => s.type === 'X');
      return (
        state.stations.find(s => s.item && s.item.kind === 'tray' && canAcceptPartOnTray(s.item, lead.holding.id)) ||
        state.stations.find(s => s.type === 'T' && s.traysCount > 0)
      );
    }
    if (lead.holding.kind === 'tray' && lead.holding.parts.length < 2) {
      const miss = needed.find(r => !lead.holding.parts.includes(r));
      const readyBench = state.stations.find(s => s.item && s.item.kind === 'proc' && s.item.id === miss);
      if (readyBench) return readyBench;
      return state.stations.find(s => s.type === '#' && !s.item && s.c >= 6 && s.c <= 13)
        || state.stations.find(s => s.type === '#' && !s.item);
    }
  }

  const fullTray = state.stations.find(s => s.item && s.item.kind === 'tray' && needed.every(r => s.item.parts.includes(r)));
  if (fullTray) return fullTray;

  const partialTray = state.stations.find(s => s.item && s.item.kind === 'tray' && s.item.parts.every(pt => needed.includes(pt)) && s.item.parts.length < 2);
  const readyProc = state.stations.find(s => s.item && s.item.kind === 'proc' && needed.includes(s.item.id) && (!partialTray || !partialTray.item.parts.includes(s.item.id)));
  if (readyProc) return readyProc;

  const activeWeld = state.stations.find(s => s.type === 'W' && s.item && s.item.kind === 'raw' && needed.includes(RAW_ITEMS[s.item.id]?.result));
  if (activeWeld) return activeWeld;

  const missReq = needed.find(r => !isProcPartReadyInHangar(r)) || needed[0];
  const rawMeta = PROC_META[missReq];
  if (rawMeta?.rawId) {
    const activeBench = state.stations.find(s => (s.type === 'A' || s.type === 'P' || s.type === 'W') && s.item && s.item.id === rawMeta.rawId);
    if (activeBench) return activeBench;
    return state.stations.find(s => s.type === 'CRATE' && s.crateItem === rawMeta.rawId);
  }
  return null;
}

function drawSpriteFitted(ctx, img, bounds, dx, dy, dw, dh, preserveAspect = true) {
  if (!isImageReady(img)) return false;
  const sx = bounds ? bounds.x : 0;
  const sy = bounds ? bounds.y : 0;
  const sw = bounds ? bounds.w : img.naturalWidth;
  const sh = bounds ? bounds.h : img.naturalHeight;
  if (!preserveAspect) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  }
  const scale = Math.min(dw / sw, dh / sh);
  const rw = sw * scale;
  const rh = sh * scale;
  const rx = dx + (dw - rw) / 2;
  const ry = dy + (dh - rh);
  ctx.drawImage(img, sx, sy, sw, sh, rx, ry, rw, rh);
  return true;
}

function drawSliceBox(ctx, slice, dx, dy, dw, dh, preserveAspect = true) {
  if (!slice || !slice.ready || !slice.img) return false;
  return drawSpriteFitted(ctx, slice.img, { x: slice.sx, y: slice.sy, w: slice.sw, h: slice.sh }, dx, dy, dw, dh, preserveAspect);
}

function drawSmallStationPill(ctx, cx, y, text, bg = 'rgba(15, 23, 42, 0.85)', fg = '#f8fafc') {
  ctx.save();
  ctx.font = '700 9px "Plus Jakarta Sans", system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2, y - 9, tw, 13, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 1);
  ctx.restore();
}

export function drawStage1(ctx) {
  const now = performance.now();
  const bg = getAsset('stage1Bg');
  const bgReady = isImageReady(bg);

  if (bgReady) {
    ctx.drawImage(bg, 0, 0, LOGICAL_W, LOGICAL_H);
  } else {
    // Procedural fallback hangar backdrop & gantry
    ctx.fillStyle = '#182032';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.fillStyle = '#232c40';
    ctx.fillRect(GRID_X - 8, 12, COLS * TILE + 16, GRID_Y - 12);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(GRID_X - 8, GRID_Y - 10, COLS * TILE + 16, 10);
    ctx.fillStyle = '#0f172a';
    for (let sx = GRID_X; sx < GRID_X + COLS * TILE; sx += 28) {
      ctx.fillRect(sx, GRID_Y - 10, 12, 10);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#2b354b' : '#252e42';
        ctx.fillRect(GRID_X + c * TILE, GRID_Y + r * TILE, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(GRID_X + c * TILE + 4, GRID_Y + r * TILE + 4, 3, 3);
      }
    }
  }

  const lead = state.players[state.activeCrewIndex] || state.players[0];
  const facing = lead ? getFacingStation(lead) : null;
  const targetRec = getActiveTargetRecipe();
  const nextTargetSt = state.stage === 'STAGE1' ? getNextTargetStation(lead, targetRec) : null;
  const tutActive = state.stage === 'STAGE1' && Boolean(state.tutorial?.active);
  const tutInfo = tutActive && lead ? getTutorialStepInfo(lead) : null;
  const activeTargetSt = (tutActive && tutInfo?.targetSt) ? tutInfo.targetSt : nextTargetSt;

  // Draw 3 table cluster slices from Tables_Stage 1.png aligned to painted floor hazard boxes
  const leftUSlice = getSheetSlice('tablesSheet', 'left_u');
  const centerUSlice = getSheetSlice('tablesSheet', 'center_u');
  const rightLSlice = getSheetSlice('tablesSheet', 'right_l');
  const tablesReady = Boolean(leftUSlice?.ready && centerUSlice?.ready && rightLSlice?.ready);
  const tCfg = STAGE1_LAYOUT.tables;

  const drawClippedTable = (slice, box, clipYMin, clipYMax) => {
    if (!slice?.ready) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipYMin, LOGICAL_W, clipYMax - clipYMin);
    ctx.clip();
    drawSliceBox(ctx, slice, box.dx, box.dy, box.dw, box.dh, false);
    ctx.restore();
  };

  // Subtle floor pass-through indicator on Swing-Gate 'G' when crew approaches
  for (const g of state.stations) {
    if (g.type !== 'G') continue;
    const nearActor = (state.players || []).some(pl => Math.hypot(pl.x - g.cx, pl.y - g.cy) < 76);
    if (nearActor) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(g.x + 4, g.y + 4, g.w - 8, g.h - 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (!tablesReady) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x + 4, g.y + 8, g.w - 8, g.h - 16);
      ctx.restore();
    }
  }

  // Live BFS dotted floor path trail from active player to next target station
  if (state.stage === 'STAGE1' && lead && activeTargetSt) {
    drawStage1Trail(ctx, lead, activeTargetSt, tutActive);
  }

  // On-floor target/hover highlight ring below stations
  for (const s of state.stations) {
    if (s.type === 'G' || s.type === 'L') continue;
    const isHi = (facing === s);
    const isNextGoal = (activeTargetSt === s && !isHi);
    if (!isHi && !isNextGoal) continue;
    const pulse = 0.55 + 0.45 * Math.sin(now * 0.008);
    const rx = Math.max(22, Math.min(48, s.w * 0.48));
    const ry = Math.max(10, Math.min(18, s.h * 0.22));
    ctx.save();
    ctx.fillStyle = isHi ? 'rgba(253, 224, 71, 0.24)' : `rgba(253, 224, 71, ${0.14 * pulse})`;
    ctx.strokeStyle = isHi ? '#fde047' : `rgba(253, 224, 71, ${pulse})`;
    ctx.lineWidth = isHi ? 3 : 2.2;
    ctx.beginPath();
    ctx.ellipse(s.cx, s.y + s.h - 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const renderables = [
    ...state.stations.filter(s => s.type !== 'L' && s.type !== 'G').map(s => ({ kind: 'station', y: s.y + s.h, obj: s })),
    ...state.stations.filter(s => s.type === '#' && s.item).map(s => ({ kind: 'counterItem', y: s.y + s.h + 2, obj: s })),
    ...state.floorItems.map(fi => ({ kind: 'floor', y: fi.y + 8, obj: fi })),
    ...state.players.map((p, idx) => ({ kind: 'player', y: p.y + 15, obj: p, isLead: idx === state.activeCrewIndex }))
  ];

  if (tablesReady) {
    renderables.push(
      { kind: 'tableClip', y: 350, slice: leftUSlice, box: tCfg.left_u, yMin: 0, yMax: tCfg.left_u.splitY },
      { kind: 'tableClip', y: tCfg.left_u.dy + tCfg.left_u.dh, slice: leftUSlice, box: tCfg.left_u, yMin: tCfg.left_u.splitY, yMax: LOGICAL_H },
      { kind: 'tableClip', y: 350, slice: centerUSlice, box: tCfg.center_u, yMin: 0, yMax: tCfg.center_u.splitY },
      { kind: 'tableClip', y: tCfg.center_u.dy + tCfg.center_u.dh, slice: centerUSlice, box: tCfg.center_u, yMin: tCfg.center_u.splitY, yMax: LOGICAL_H },
      { kind: 'tableClip', y: tCfg.right_l.dy + tCfg.right_l.dh, slice: rightLSlice, box: tCfg.right_l, yMin: 0, yMax: LOGICAL_H },
      { kind: 'tableProps', y: 351 }
    );
  }

  renderables.sort((a, b) => a.y - b.y);

  for (const ent of renderables) {
    if (ent.kind === 'tableClip') {
      drawClippedTable(ent.slice, ent.box, ent.yMin, ent.yMax);
    } else if (ent.kind === 'tableProps') {
      const propBeacon = getAnimFrame('tableProps', 0);
      const propArm = getAnimFrame('tableProps', 1);
      const propMon = getAnimFrame('tableProps', 2);
      const pr = tCfg.props;
      if (isImageReady(propBeacon)) {
        const bBounds = getAnimFrameBounds('tableProps', 0);
        drawSpriteFitted(ctx, propBeacon, bBounds, pr.beacon.x, pr.beacon.y, pr.beacon.w, pr.beacon.h, true);
        const blink = 0.25 + 0.45 * Math.sin(now * 0.009);
        ctx.save();
        ctx.fillStyle = `rgba(251, 146, 60, ${blink})`;
        ctx.beginPath();
        ctx.arc(pr.beacon.x + pr.beacon.w / 2, pr.beacon.y + 9, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (isImageReady(propArm)) {
        const aBounds = getAnimFrameBounds('tableProps', 1);
        const swayX = Math.sin(now * 0.0025) * 3;
        drawSpriteFitted(ctx, propArm, aBounds, pr.arm.x + swayX, pr.arm.y, pr.arm.w, pr.arm.h, true);
      }
      if (isImageReady(propMon)) {
        const mBounds = getAnimFrameBounds('tableProps', 2);
        drawSpriteFitted(ctx, propMon, mBounds, pr.monitor.x, pr.monitor.y, pr.monitor.w, pr.monitor.h, true);
      }
    } else if (ent.kind === 'floor') {
      drawItemBadge(ctx, ent.obj.x, ent.obj.y, ent.obj.item);
    } else if (ent.kind === 'counterItem') {
      const s = ent.obj;
      drawItemBadge(ctx, s.itemX, s.itemY, s.item);
    } else if (ent.kind === 'station') {
      const s = ent.obj;
      const isHi = (facing === s);
      const isNextGoal = (activeTargetSt === s && !isHi);
      let drewSprite = false;

      if (s.type === 'CRATE') {
        const slice = getSheetSlice('cratesSheet', s.crateItem);
        if (drawSliceBox(ctx, slice, s.vx, s.vy, s.vw, s.vh, true)) {
          drewSprite = true;
        }
      } else if (s.type === 'W') {
        const activeWeld = Boolean(s.item && s.item.kind === 'raw');
        const frameIdx = activeWeld ? Math.floor(now / 110) % 3 : 0;
        const img = getAnimFrame('weldFrames', frameIdx);
        const bounds = getAnimFrameBounds('weldFrames', frameIdx);
        if (drawSpriteFitted(ctx, img, bounds, s.vx, s.vy, s.vw, s.vh, true)) {
          drewSprite = true;
        }
      } else if (s.type === 'A') {
        const activeCal = Boolean(s.item && s.item.kind === 'raw' && s.progress < 1);
        const frameIdx = activeCal ? Math.floor(now / 140) % 3 : 0;
        const img = getAnimFrame('calFrames', frameIdx);
        const bounds = getAnimFrameBounds('calFrames', frameIdx);
        if (drawSpriteFitted(ctx, img, bounds, s.vx, s.vy, s.vw, s.vh, true)) {
          drewSprite = true;
        }
      } else if (s.type === 'P') {
        const activeChg = Boolean(s.item && s.item.kind === 'raw' && s.progress < 1);
        const frameIdx = activeChg ? Math.floor(now / 170) % 3 : 0;
        const img = getAnimFrame('chgFrames', frameIdx);
        const bounds = getAnimFrameBounds('chgFrames', frameIdx);
        if (drawSpriteFitted(ctx, img, bounds, s.vx, s.vy, s.vw, s.vh, true)) {
          drewSprite = true;
        }
      } else if (s.type === '>') {
        const frameIdx = Math.floor(now / 110) % 4;
        const img = getAnimFrame('conveyorFrames', frameIdx);
        const bounds = getAnimFrameBounds('conveyorFrames', frameIdx);
        if (drawSpriteFitted(ctx, img, bounds, s.vx, s.vy, s.vw, s.vh, false)) {
          drewSprite = true;
        }
      } else if (s.type === 'T') {
        const slice = getSheetSlice('logisticsSheet', 'tray_stack');
        if (slice?.ready) {
          ctx.save();
          if (s.traysCount <= 0) ctx.globalAlpha = 0.35;
          drawSliceBox(ctx, slice, s.vx, s.vy, s.vw, s.vh, true);
          ctx.restore();
          drewSprite = true;
        }
      } else if (s.type === 'X') {
        const slice = getSheetSlice('logisticsSheet', 'scrap_bin');
        if (drawSliceBox(ctx, slice, s.vx, s.vy, s.vw, s.vh, true)) {
          drewSprite = true;
        }
      } else if (s.type === 'F') {
        const slice = getSheetSlice('logisticsSheet', 'extinguisher');
        if (slice?.ready) {
          ctx.save();
          if (!s.hasExtinguisher) ctx.globalAlpha = 0.25;
          drawSliceBox(ctx, slice, s.vx, s.vy, s.vw, s.vh, true);
          ctx.restore();
          drewSprite = true;
        }
      } else if (s.type === '#' && tablesReady) {
        drewSprite = true;
      }

      if (!drewSprite) {
        ctx.fillStyle = '#151b28';
        ctx.fillRect(s.x + 2, s.y + 8, s.w - 4, s.h - 6);

        let topCol = '#475569', label = '', lampCol = null;
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
        ctx.roundRect(s.x + 2, s.y - 2, s.w - 4, s.h - 2, 8);
        ctx.fill(); ctx.stroke();

        if (lampCol) {
          ctx.fillStyle = lampCol;
          ctx.beginPath(); ctx.arc(s.x + s.w - 10, s.y + 6, 4, 0, Math.PI * 2); ctx.fill();
        }

        if (s.type === '>') {
          ctx.save();
          ctx.beginPath(); ctx.roundRect(s.x + 4, s.y, s.w - 8, s.h - 6, 7); ctx.clip();
          ctx.fillStyle = '#38bdf8';
          for (let bx = -24; bx < s.w + 24; bx += 22) {
            ctx.fillRect(s.x + bx + state.conveyorOffset, s.y + 10, 9, s.h - 20);
          }
          ctx.restore();
        }

        if (s.type === 'CRATE') {
          drawHardwareCanvas(ctx, s.cx, s.cy, RAW_ITEMS[s.crateItem].shape, false, 0.9);
        } else if (s.type === 'F' && s.hasExtinguisher) {
          ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(s.cx - 7, s.y + 6, 14, 24, 5); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#e2e8f0'; ctx.fillRect(s.cx - 3, s.y + 2, 6, 5);
        }
        if (label) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px Fredoka, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, s.cx, s.y + s.h - 8);
        }
      }

      if (s.type !== '#' && s.item) {
        drawItemBadge(ctx, s.itemX, s.itemY, s.item);
      }
    } else {
      drawChibiEngineer(ctx, ent.obj, ent.isLead);
    }
  }

  // Station interaction/target outlines, compact pills (only when hovered or active goal), progress bars, and fires
  for (const s of state.stations) {
    if (s.type === 'G' || s.type === 'L') continue;
    const isHi = (facing === s);
    const isNextGoal = (activeTargetSt === s && !isHi);

    if (isHi) {
      ctx.save();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.roundRect(s.x + 1, s.y - 1, s.w - 2, s.h + 2, 8);
      ctx.stroke();
      ctx.restore();
    } else if (isNextGoal) {
      const pulse = 0.55 + 0.45 * Math.sin(now * 0.007);
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(s.x + 1, s.y - 1, s.w - 2, s.h + 2, 8);
      ctx.stroke();
      ctx.restore();
    }

    if (isHi || isNextGoal) {
      const pillY = Math.min(LOGICAL_H - 8, s.y + s.h + 10);
      if (s.type === 'CRATE') drawSmallStationPill(ctx, s.cx, pillY, RAW_ITEMS[s.crateItem].name);
      else if (s.type === 'W') drawSmallStationPill(ctx, s.cx, pillY, 'WELD', 'rgba(3, 105, 161, 0.92)', '#e0f2fe');
      else if (s.type === 'A') drawSmallStationPill(ctx, s.cx, pillY, 'CAL', 'rgba(109, 40, 217, 0.92)', '#f3e8ff');
      else if (s.type === 'P') drawSmallStationPill(ctx, s.cx, pillY, 'CHARGE', 'rgba(21, 128, 61, 0.92)', '#dcfce7');
      else if (s.type === '>') drawSmallStationPill(ctx, s.cx, pillY, 'SUBMIT', 'rgba(15, 23, 42, 0.9)', '#38bdf8');
      else if (s.type === 'T') drawSmallStationPill(ctx, s.cx, pillY, `TRAYS (${s.traysCount})`, 'rgba(15, 118, 110, 0.92)', '#ccfbf1');
      else if (s.type === 'X') drawSmallStationPill(ctx, s.cx, pillY, 'SCRAP', 'rgba(153, 27, 27, 0.92)', '#fee2e2');
      else if (s.type === 'F') drawSmallStationPill(ctx, s.cx, pillY, s.hasExtinguisher ? 'CO2' : 'EMPTY', 'rgba(185, 28, 28, 0.92)', '#fee2e2');
    }

    if (s.onFire) {
      const sway = Math.sin(now * 0.015 + s.c * 1.7) * 5;
      const pulse = 0.55 + 0.45 * Math.sin(now * 0.012);
      const baseY = s.y + s.h * 0.52;

      ctx.save();
      ctx.fillStyle = `rgba(239, 68, 68, ${0.24 + pulse * 0.22})`;
      ctx.beginPath(); ctx.roundRect(s.x, s.y - 4, s.w, s.h + 4, 11); ctx.fill();
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.65 + pulse * 0.35})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x - 1, s.y - 5, s.w + 2, s.h + 6);

      const fireImg = getAnimFrame('fireSmokeFrames', Math.floor(now / 70) % 16);
      if (isImageReady(fireImg)) {
        ctx.drawImage(fireImg, s.cx - 36, s.y - 34, 72, 92);
      } else {
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.moveTo(s.cx - 18, baseY);
        ctx.quadraticCurveTo(s.cx - 22, baseY - 18, s.cx - 8 + sway * 0.4, baseY - 30 - pulse * 6);
        ctx.quadraticCurveTo(s.cx + 2, baseY - 22, s.cx + 6 + sway * 0.7, baseY - 38 - pulse * 8);
        ctx.quadraticCurveTo(s.cx + 22, baseY - 20, s.cx + 18, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(s.cx - 11, baseY);
        ctx.quadraticCurveTo(s.cx - 13, baseY - 12, s.cx - 2 + sway * 0.5, baseY - 24 - pulse * 4);
        ctx.quadraticCurveTo(s.cx + 12, baseY - 14, s.cx + 11, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fef9c3';
        ctx.beginPath();
        ctx.arc(s.cx + sway * 0.2, baseY - 6, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.roundRect(s.cx - 22, s.y - 22, 44, 15, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9.5px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('FIRE!', s.cx, s.y - 11);
      ctx.restore();

      if (s.fireProg > 0) {
        const bw = Math.max(40, s.w - 10);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(s.cx - bw / 2, s.y - 32, bw, 7);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(s.cx - bw / 2, s.y - 32, bw * s.fireProg, 7);
      }
    } else if (s.item && s.progress > 0 && s.item.id !== 'burned') {
      const bw = 46, bh = 7, bx = s.cx - bw / 2, by = Math.max(46, s.y - 12);
      ctx.fillStyle = '#0f172a'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      if (s.progress <= 1) {
        ctx.fillStyle = s.progress >= 1 ? '#4ade80' : '#38bdf8';
        ctx.fillRect(bx, by, bw * s.progress, bh);
      } else {
        const warn = Math.min(1, (s.progress - 1) / 1.15);
        ctx.fillStyle = Math.floor(now / 120) % 2 === 0 ? '#ef4444' : '#fde047';
        ctx.fillRect(bx, by, bw * warn, bh);
      }
    }
  }

  for (const th of state.thrownItems) {
    const arcY = th.y - Math.sin(Math.min(1, th.t) * Math.PI) * 32;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(th.x, th.y + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawItemBadge(ctx, th.x, arcY, th.item);
  }

  for (const sp of state.hangarSparks) {
    ctx.globalAlpha = Math.max(0, sp.isSmoke ? sp.life * 0.9 : sp.life * 2.4);
    ctx.fillStyle = sp.color;
    if (sp.r) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(sp.x, sp.y, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  for (const fd of state.flyingDeliveries) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, fd.intakeX ?? LOGICAL_W, LOGICAL_H);
    ctx.clip();
    drawItemBadge(ctx, fd.x, fd.y, { kind: 'tray', parts: fd.parts });
    ctx.restore();
  }

  // Single Compact Active Target Recipe Bar along Top Gantry
  if (state.stage === 'STAGE1' && targetRec) {
    const m1 = PROC_META[targetRec.reqs[0]] || {};
    const m2 = PROC_META[targetRec.reqs[1]] || {};
    const r1Raw = m1.rawName || m1.name || 'Part 1';
    const r1Verb = m1.verb || 'Prep';
    const r2Raw = m2.rawName || m2.name || 'Part 2';
    const r2Verb = m2.verb || 'Prep';
    const r1Done = isProcPartReadyInHangar(targetRec.reqs[0]);
    const r2Done = isProcPartReadyInHangar(targetRec.reqs[1]);
    const trayDone =
      (lead?.holding?.kind === 'tray' && targetRec.reqs.every(r => lead.holding.parts.includes(r))) ||
      state.stations.some(s => s.item?.kind === 'tray' && targetRec.reqs.every(r => s.item.parts.includes(r)));
    const uniqueBuilt = Object.values(state.shippedModules || {}).filter(v => v > 0).length;

    const barW = 952, barH = 34, barX = (LOGICAL_W - barW) / 2, barY = 8;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 14);
    ctx.fill();
    ctx.stroke();

    // Target Title Pill on Left
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(barX + 6, barY + 5, 262, 24, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎯 TARGET (${uniqueBuilt}/4): ${targetRec.title}`, barX + 14, barY + 21);

    // 3 Clear Step Pills: Part 1 -> Part 2 -> Tray & Submit
    const steps = [
      { label: `${r1Done ? '✓' : '1.'} ${r1Raw} ➔ ${r1Verb}`, done: r1Done },
      { label: `${r2Done ? '✓' : '2.'} ${r2Raw} ➔ ${r2Verb}`, done: r2Done },
      { label: `${trayDone ? '✓' : '3.'} Plate on Tray ➔ Submit`, done: trayDone }
    ];

    let sx = barX + 282;
    steps.forEach((st, idx) => {
      const pw = idx === 2 ? 210 : 206;
      ctx.fillStyle = st.done ? 'rgba(22, 163, 74, 0.25)' : 'rgba(30, 41, 59, 0.9)';
      ctx.strokeStyle = st.done ? '#4ade80' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(sx, barY + 5, pw, 24, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = st.done ? '#86efac' : '#e2e8f0';
      ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.label, sx + pw / 2, barY + 21);

      if (idx < 2) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.fillText(idx === 0 ? '+' : '➔', sx + pw + 11, barY + 21);
      }
      sx += pw + 22;
    });
    ctx.restore();
  }

  // Compact Fire Alert Pill below Top Gantry when any bench is burning
  const burningSt = state.stations.find(st => st.onFire);
  if (state.stage === 'STAGE1' && burningSt) {
    const hasCo2 = lead?.holding?.kind === 'extinguisher';
    const flash = Math.floor(performance.now() / 260) % 2 === 0;
    const msg = hasCo2
      ? 'EXTINGUISH FIRE! Face Burning Bench and Hold [SPACE]!'
      : 'BENCH FIRE! Grab CO2 Extinguisher (Top-Right Wall) + Hold [SPACE]!';
    ctx.save();
    ctx.fillStyle = flash ? 'rgba(185, 28, 28, 0.95)' : 'rgba(127, 29, 29, 0.95)';
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 260, 46, 520, 28, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, LOGICAL_W / 2, 64);
    ctx.restore();
  }

  // Compact Floating Action Pill above Active Player (never obscures crate labels)
  if (facing && lead) {
    let hint = '';
    if (facing.onFire && lead.holding?.kind === 'extinguisher') hint = '[HOLD SPACE] Extinguish Fire!';
    else if (facing.onFire) hint = 'FIRE! Need CO2 Extinguisher';
    else if (facing.type === 'F' && facing.hasExtinguisher && !lead.holding) hint = '[SPACE] Grab CO2';
    else if (facing.type === 'CRATE' && !lead.holding) hint = `[SPACE] ${RAW_ITEMS[facing.crateItem].name}`;
    else if (facing.type === 'W' && facing.item && facing.item.kind === 'raw') hint = `[HOLD SPACE] Weld ${Math.round(facing.progress * 100)}%`;
    else if (facing.type === '>' && lead.holding && lead.holding.kind === 'tray' && lead.holding.parts.length === 2) hint = `[SPACE] Submit 🚀`;
    else if (lead.holding && facing.item && ((lead.holding.kind === 'tray' && facing.item.kind === 'proc') || (lead.holding.kind === 'proc' && facing.item.kind === 'tray'))) hint = `[SPACE] Plate Tray`;
    else if (!lead.holding && facing.item) hint = `[SPACE] Pick Up`;
    else if (lead.holding && !facing.item) hint = `[SPACE] Place`;

    if (hint) {
      ctx.font = '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
      const tw = ctx.measureText(hint).width + 16;
      const px = Math.max(8, Math.min(LOGICAL_W - tw - 8, lead.x - tw / 2));
      const py = Math.max(46, lead.y - 58);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(px, py, tw, 20, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(hint, px + tw / 2, py + 14);
    }
  }

  // Interactive 5-Step Spotlight Overlay & Active Guide Banner
  state.tutorialBtnRects = {};
  if (tutActive && tutInfo && lead && !isUiTourActive()) {
    const tTarget = tutInfo.targetSt;
    if (state.tutorial.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 18, 0.72)';
      ctx.beginPath();
      ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
      // Cut transparent circle around player
      ctx.moveTo(lead.x + 44, lead.y - 4);
      ctx.arc(lead.x, lead.y - 4, 44, 0, Math.PI * 2);
      // Cut transparent circle around guided target station
      if (tTarget) {
        const tx = tTarget.vx + tTarget.vw / 2;
        const ty = tTarget.vy + tTarget.vh / 2;
        const tr = Math.max(46, Math.min(72, Math.max(tTarget.vw, tTarget.vh) * 0.62));
        ctx.moveTo(tx + tr, ty);
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      }
      ctx.fill('evenodd');

      // Pulsing spotlight outlines
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.008);
      ctx.strokeStyle = `rgba(56, 189, 248, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lead.x, lead.y - 4, 45, 0, Math.PI * 2);
      ctx.stroke();

      if (tTarget) {
        const tx = tTarget.vx + tTarget.vw / 2;
        const ty = tTarget.vy + tTarget.vh / 2;
        const tr = Math.max(46, Math.min(72, Math.max(tTarget.vw, tTarget.vh) * 0.62)) + 1;
        ctx.strokeStyle = `rgba(253, 224, 71, ${pulse})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.stroke();
        drawStage1Trail(ctx, lead, tTarget, true);
      }

      // Callout Card positioned clear of target & player
      const cardW = 540;
      const cardH = 104;
      const cardX = (LOGICAL_W - cardW) / 2;
      const lowerOccupied = (tTarget && (tTarget.y + tTarget.h > LOGICAL_H - 190)) || lead.y > LOGICAL_H - 190;
      const cardY = lowerOccupied ? 58 : LOGICAL_H - 126;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = '800 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(tutInfo.title, cardX + 18, cardY + 26);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(tutInfo.text, cardX + 18, cardY + 50);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('Press SPACE or ENTER (or click Continue) to proceed.', cardX + 18, cardY + 84);

      const contRect = { x: cardX + cardW - 224, y: cardY + 66, w: 100, h: 28 };
      const skipRect = { x: cardX + cardW - 116, y: cardY + 66, w: 102, h: 28 };
      state.tutorialBtnRects = { cont: contRect, skip: skipRect };

      ctx.fillStyle = '#2563eb';
      ctx.beginPath(); ctx.roundRect(contRect.x, contRect.y, contRect.w, contRect.h, 8); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Continue', contRect.x + contRect.w / 2, contRect.y + 18);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(skipRect.x, skipRect.y, skipRect.w, skipRect.h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Skip [Tab]', skipRect.x + skipRect.w / 2, skipRect.y + 18);
      ctx.restore();
    } else {
      // Unpaused active step banner at bottom-center
      ctx.save();
      const bw = 840, bh = 34, bx = (LOGICAL_W - bw) / 2, by = LOGICAL_H - 42;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${tutInfo.title}: `, bx + 14, by + 21);
      const titleW = ctx.measureText(`${tutInfo.title}: `).width;

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '500 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(tutInfo.text, bx + 14 + titleW, by + 21);

      const skipRect = { x: bx + bw - 96, y: by + 5, w: 86, h: 24 };
      state.tutorialBtnRects = { skip: skipRect };
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.beginPath(); ctx.roundRect(skipRect.x, skipRect.y, skipRect.w, skipRect.h, 6); ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Skip [Tab]', skipRect.x + skipRect.w / 2, skipRect.y + 16);
      ctx.restore();
    }
  }
}
