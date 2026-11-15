import { PROC_META, RECIPES, SCENARIOS, LAUNCH_VEHICLES, SCIENCE_OBJECTIVES, CML_LEVELS } from './config.js';
import { state, getScenario, getVehicle } from './state.js';
import { getHardwareSVG } from './sprites.js';
import { claimCrewSlot } from './net.js';
import { iconize } from './icons.js';
import { getItemSprite, getItemBounds, isImageReady } from './assets.js';
import { getPixelBitmap } from './pixel.js';

// Ticket part thumbnails: the real item sprite, downscaled onto the pixel grid.
const PART_ICON_PX = 24;
const partIconCache = new Map();
function partIconHtml(itemId, shape) {
  const cached = partIconCache.get(itemId);
  if (cached) return cached;
  const img = getItemSprite(itemId);
  const b = getItemBounds(itemId);
  if (!isImageReady(img) || !b) return getHardwareSVG(shape, true);
  const fit = PART_ICON_PX / Math.max(b.w, b.h);
  const bmp = getPixelBitmap(img, b.x, b.y, b.w, b.h, b.w * fit, b.h * fit);
  if (!bmp) return getHardwareSVG(shape, true);
  const box = document.createElement('canvas');
  box.width = PART_ICON_PX;
  box.height = PART_ICON_PX;
  box.getContext('2d').drawImage(bmp, Math.floor((PART_ICON_PX - bmp.width) / 2), Math.floor((PART_ICON_PX - bmp.height) / 2));
  const html = `<img class="px-item" alt="" src="${box.toDataURL()}">`;
  partIconCache.set(itemId, html);
  return html;
}

const MODULE_SHORT_NAMES = {
  sensor_pod: 'Spectrometer',
  power_pack: 'Solar-Battery',
  comms_relay: 'Ka-Relay',
  booster_core: 'Cryo-Stage'
};

function getModuleShortName(moduleId) {
  if (MODULE_SHORT_NAMES[moduleId]) return MODULE_SHORT_NAMES[moduleId];
  const rec = RECIPES.find(r => r.id === moduleId);
  return rec ? rec.title : moduleId;
}

function getSelectedObjective() {
  const list = Object.values(SCIENCE_OBJECTIVES || {});
  return SCIENCE_OBJECTIVES?.[state.selectedObjective] || SCIENCE_OBJECTIVES?.polar_volatiles || list[0] || null;
}

function clampPct(val, max = 100) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(val || 0) / max) * 100)));
}

function miniBarHtml(pct, color) {
  const safePct = Math.max(0, Math.min(100, Math.round(pct)));
  return `<span class="t-bar" aria-hidden="true"><span class="t-bar-fill" style="width:${safePct}%;background:${color}"></span></span>`;
}

let lastLaunchBtnSig = '';
export function updateLaunchButtonState() {
  const btn = document.getElementById('btn-skip');
  if (!btn) return;
  if (state.stage !== 'STAGE1' && state.stage !== 'MENU') {
    if (lastLaunchBtnSig !== 'OTHER') {
      lastLaunchBtnSig = 'OTHER';
      btn.classList.remove('locked', 'warn', 'ready');
    }
    return;
  }

  const obj = getSelectedObjective();
  const reqList = obj?.requiredModules || [];
  const reqTotal = reqList.length || 2;
  const reqDone = reqList.filter(id => (state.shippedModules?.[id] || 0) > 0).length;
  const totalShipped = state.shippedCount || 0;
  const minBuiltMet = totalShipped >= 2;
  const allReqMet = reqDone >= reqTotal;

  let text;
  let modeClass;
  if (minBuiltMet && allReqMet) {
    text = '🚀 LAUNCH READY';
    modeClass = 'ready';
  } else if (minBuiltMet) {
    text = `🚀 LAUNCH (${reqDone}/${reqTotal} REQ)`;
    modeClass = 'warn';
  } else if (totalShipped === reqDone) {
    text = `🚀 LAUNCH (${reqDone}/${reqTotal} REQ)`;
    modeClass = 'locked';
  } else {
    text = `🚀 LAUNCH (${totalShipped}/2 • ${reqDone}/${reqTotal} REQ)`;
    modeClass = 'locked';
  }

  const title = `Built: ${totalShipped}/2 min modules • Science REQ: ${reqDone}/${reqTotal}`;
  const sig = `${text}|${modeClass}|${title}`;
  if (sig === lastLaunchBtnSig) return;
  lastLaunchBtnSig = sig;
  btn.innerHTML = iconize(text);
  btn.title = title;
  btn.classList.remove('locked', 'warn', 'ready');
  btn.classList.add(modeClass);
}

let toastTimer = null;
export function showMissionToast(tag, text, ms = 4400) {
  const el = document.getElementById('mission-toast');
  if (!el) return;
  el.innerHTML = iconize(`<span class="toast-tag">${tag}</span><span>${text}</span>`);
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, ms);
}

export function hideMissionToast() {
  const el = document.getElementById('mission-toast');
  if (el) el.classList.add('hidden');
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

export function selectActiveCrew(idx) {
  state.activeCrewIndex = idx;
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`pchip-${i}`);
    if (el) el.classList.toggle('active', i === idx);
  }
  if (state.coopMode === 'NET_4P') {
    claimCrewSlot(idx);
  }
}

export function cycleCoopMode() {
  const btn = document.getElementById('btn-coop');
  if (state.coopMode === '4P_AI') {
    state.coopMode = 'LOCAL_2P';
    btn.textContent = 'Crew: Local 2P + Bots';
    btn.className = 'btn-hud btn-bot local2p';
  } else if (state.coopMode === 'LOCAL_2P') {
    state.coopMode = 'NET_4P';
    btn.textContent = 'Crew: Multi-Tab 4P';
    btn.className = 'btn-hud btn-bot net4p';
    claimCrewSlot(state.activeCrewIndex);
  } else if (state.coopMode === 'NET_4P') {
    state.coopMode = 'SOLO';
    btn.textContent = 'Crew: Solo';
    btn.className = 'btn-hud btn-bot off';
  } else {
    state.coopMode = '4P_AI';
    btn.textContent = 'Crew: 4P AI';
    btn.className = 'btn-hud btn-bot';
  }
}

export function setStageBanner(badge, title, desc, controlsHtml, { showTickets = false, showSkip = false, showNext = false } = {}) {
  document.getElementById('tickets-bar').style.display = showTickets ? 'flex' : 'none';
  document.getElementById('btn-skip').style.display = showSkip ? 'inline-flex' : 'none';
  document.getElementById('btn-next').style.display = showNext ? 'inline-flex' : 'none';

  const sb = document.getElementById('stage-banner');
  if (showTickets) {
    sb.style.display = 'none';
  } else {
    sb.style.display = 'flex';
    document.getElementById('sb-badge').textContent = badge;
    document.getElementById('sb-title').textContent = title;
    document.getElementById('sb-desc').textContent = desc;
    const statusPill = document.getElementById('sb-status-pill');
    if (statusPill) {
      const obj = getSelectedObjective();
      statusPill.textContent = obj ? `GOAL: ${obj.targetLocation.toUpperCase()}` : 'TELEMETRY LIVE';
    }
  }
  document.getElementById('controls-hint').innerHTML = iconize(controlsHtml);
  updateLaunchButtonState();
}

export function getActiveTargetRecipe() {
  if (state.pinnedRecipeId) {
    const pinned = RECIPES.find(r => r.id === state.pinnedRecipeId);
    if (pinned) return pinned;
  }
  const unbuilt = RECIPES.find(r => (state.shippedModules[r.id] || 0) === 0);
  if (unbuilt) return unbuilt;
  return state.orders[0]?.recipe || RECIPES[0];
}

export function isProcPartReadyInHangar(procId) {
  if ((state.players || []).some(p => p.holding && ((p.holding.kind === 'proc' && p.holding.id === procId) || (p.holding.kind === 'tray' && p.holding.parts.includes(procId))))) {
    return true;
  }
  return (state.stations || []).some(s => s.item && ((s.item.kind === 'proc' && s.item.id === procId) || (s.item.kind === 'tray' && s.item.parts.includes(procId))));
}

export function renderTicketsHUD() {
  const bar = document.getElementById('tickets-bar');
  if (!bar) return;
  const targetRec = getActiveTargetRecipe();
  const obj = getSelectedObjective();
  const reqModules = obj?.requiredModules || [];

  bar.innerHTML = iconize(state.orders.map(o => {
    const m1 = PROC_META[o.recipe.reqs[0]] || {};
    const m2 = PROC_META[o.recipe.reqs[1]] || {};
    const r1Raw = m1.rawName || m1.name || 'Part 1';
    const r2Raw = m2.rawName || m2.name || 'Part 2';
    const summaryText = o.recipe.summary || `${o.recipe.massKg}kg, $${o.recipe.costM}M`;
    const pct = Math.max(0, (o.remaining / o.maxTime) * 100);
    const hasBonus = o.remaining > 0;
    const builtCount = state.shippedModules[o.recipe.id] || 0;
    const isTarget = targetRec && targetRec.id === o.recipe.id;
    const isScienceReq = reqModules.includes(o.recipe.id);
    const reqBadgeHtml = isScienceReq
      ? `<span class="req-badge ${builtCount > 0 ? 'req-met' : ''}" title="Required for ${obj?.title || 'Science Goal'}">${builtCount > 0 ? '✓ REQ' : 'REQ'}</span>`
      : '';
    const r1Ready = isProcPartReadyInHangar(o.recipe.reqs[0]);
    const r2Ready = isProcPartReadyInHangar(o.recipe.reqs[1]);

    return `
      <div class="ticket ${isTarget ? 'target-ticket' : ''} ${builtCount > 0 ? 'built-ticket' : ''}" id="tk-${o.uid}" data-recipe="${o.recipe.id}" title="Click to set ${o.recipe.title} as your target">
        <div class="ticket-header" style="background:${isTarget ? '#ca8a04' : builtCount > 0 ? '#15803d' : o.recipe.segColor}">
          <span>${isTarget ? '🎯 TARGET' : o.recipe.segment}</span>
          <span class="ticket-header-right">${reqBadgeHtml}<span>${builtCount > 0 ? `✓ x${builtCount}` : `+${o.recipe.points}⭐`}</span></span>
        </div>
        <div class="ticket-timer-bg">
          <div class="ticket-timer-fill" id="tk-bar-${o.uid}" style="width:${hasBonus ? pct : 100}%;background:${hasBonus ? '#22c55e' : '#38bdf8'}"></div>
        </div>
        <div class="ticket-body">
          <div class="ticket-title">${o.recipe.title}</div>
          <div class="ticket-trade">${summaryText}</div>
          <div class="ticket-reqs">
            <div class="req-chip ${r1Ready ? 'chip-ready' : ''}" id="tk-c1-${o.uid}">
              ${partIconHtml(o.recipe.reqs[0], m1.shape)}
              <span class="pname">${r1Ready ? '✓ ' : ''}${r1Raw}</span>
              <small style="color:${m1.verbColor}">${m1.verb}</small>
            </div>
            <div class="req-chip ${r2Ready ? 'chip-ready' : ''}" id="tk-c2-${o.uid}">
              ${partIconHtml(o.recipe.reqs[1], m2.shape)}
              <span class="pname">${r2Ready ? '✓ ' : ''}${r2Raw}</span>
              <small style="color:${m2.verbColor}">${m2.verb}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join(''));

  bar.querySelectorAll('.ticket').forEach(el => {
    el.addEventListener('click', () => {
      state.pinnedRecipeId = el.dataset.recipe;
      if (state.tutorial?.active) {
        state.tutorial.active = false;
        state.tutorial.skipped = true;
      }
      renderTicketsHUD();
    });
  });
  updateLaunchButtonState();
}

export function updateTicketBarsOnly() {
  for (const o of state.orders) {
    const el = document.getElementById(`tk-bar-${o.uid}`);
    if (el) {
      if (o.remaining > 0) {
        const pct = Math.max(0, (o.remaining / o.maxTime) * 100);
        el.style.width = pct + '%';
        el.style.backgroundColor = pct > 50 ? '#22c55e' : '#f59e0b';
      } else {
        el.style.width = '100%';
        el.style.backgroundColor = '#38bdf8';
      }
    }
    const c1 = document.getElementById(`tk-c1-${o.uid}`);
    const c2 = document.getElementById(`tk-c2-${o.uid}`);
    if (c1) c1.classList.toggle('chip-ready', isProcPartReadyInHangar(o.recipe.reqs[0]));
    if (c2) c2.classList.toggle('chip-ready', isProcPartReadyInHangar(o.recipe.reqs[1]));
  }
}

export function getCmlLevel(shippedCount = state.shippedCount) {
  const cmlNum = state.currentCML || (shippedCount >= 4 ? 4 : shippedCount >= 2 ? 3 : 2);
  const info = CML_LEVELS?.[cmlNum];
  if (info) return `CML-${info.level} ${info.name}`;
  if (shippedCount >= 6) return 'CML-4 Point Design';
  if (shippedCount >= 4) return 'CML-3 Trade Space';
  if (shippedCount >= 2) return 'CML-2 Initial Feasibility';
  return 'CML-1 Cocktail Napkin';
}

const STAGE_LABELS = {
  TRANSITION: 'Stage Transition',
  STAGE1: 'Stage 1A: Assembly Hangar',
  STAGE1B: 'Stage 1B: Rocket Liftoff',
  STAGE2: 'Stage 2: Orbital Mission Control',
  STAGE3A: 'Stage 3A: Lunar Descent',
  STAGE3B: 'Stage 3B: Lunar Surface EVA',
  STAGE3C: 'Stage 3C: Lunar Ascent & TEI',
  STAGE4: 'Stage 4: Earth Reentry'
};

export function syncPauseUI() {
  const canPause = state.stage !== 'MENU' && state.stage !== 'STAGE5';
  const isPaused = Boolean(state.paused && canPause);
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.disabled = !canPause;
    // Runs every frame via updateClockHUD: only touch the DOM when the label flips.
    if (pauseBtn.dataset.pausedLabel !== String(isPaused)) {
      pauseBtn.dataset.pausedLabel = String(isPaused);
      pauseBtn.innerHTML = iconize(isPaused ? '▶ Resume' : '⏸ Pause');
    }
    pauseBtn.classList.toggle('paused', isPaused);
  }
  const overlay = document.getElementById('pause-overlay');
  if (overlay) {
    overlay.classList.toggle('hidden', !isPaused);
  }
  const sub = document.getElementById('pause-stage-label');
  if (sub) {
    const label = STAGE_LABELS[state.stage] || 'Active Mission';
    sub.textContent = `${label} frozen. Press ESC or Resume to continue.`;
  }
}

export function updateClockHUD() {
  const pill = document.getElementById('clock-pill');
  const disp = document.getElementById('clock-display');
  if (state.stage === 'STAGE1' || state.stage === 'MENU') {
    pill.classList.remove('clock-urgent');
    pill.classList.add('clock-free');
    disp.textContent = 'FREE BUILD';
  } else if (state.stage === 'TRANSITION') {
    pill.classList.remove('clock-urgent', 'clock-free');
    disp.textContent = 'TRANSIT';
  } else {
    pill.classList.remove('clock-free');
    const mins = Math.floor(Math.max(0, state.stageTimer) / 60);
    const secs = Math.floor(Math.max(0, state.stageTimer) % 60);
    disp.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    pill.classList.toggle('clock-urgent', state.stageTimer <= 12);
  }
  pill.classList.toggle('clock-paused', Boolean(state.paused && state.stage !== 'MENU' && state.stage !== 'STAGE5'));
  syncPauseUI();
}

let lastTelemetryHtml = '';
export function updateBottomHUD() {
  document.getElementById('score-display').textContent = state.score;
  updateLaunchButtonState();
  const strip = document.getElementById('telemetry-strip');
  if (!strip) return;

  const obj = getSelectedObjective();
  const reqList = obj?.requiredModules || [];
  const reqDone = reqList.filter(id => (state.shippedModules?.[id] || 0) > 0).length;
  const reqTotal = reqList.length || 2;
  const cmlLabel = getCmlLevel();
  const cmlShort = cmlLabel.split(' ').slice(0, 2).join(' ');
  const goalBadgeHtml = `<div class="t-stat t-goal ${reqDone >= reqTotal ? 'cml-ready' : ''}" title="${obj?.title || 'Science Goal'} (${reqDone}/${reqTotal} REQ)">🔬 <b>${cmlShort}</b> • ${obj?.targetLocation || 'Lunar Site'} (${reqDone}/${reqTotal})</div>`;

  let nextHtml = '';

  if (state.stage === 'STAGE1B') {
    const inThrustBand = Math.abs(state.ascent.thrust - state.ascent.targetThrust) <= 0.14;
    const inPitchBand = Math.abs(state.ascent.tilt) <= 0.2;
    const intPct = Math.round(state.ascent.integrity ?? 100);
    const thrustPct = Math.round((state.ascent.thrust ?? 0.5) * 100);
    const intColor = intPct > 60 ? '#4ade80' : intPct > 30 ? '#fbbf24' : '#f87171';
    const thrustColor = inThrustBand ? '#4ade80' : '#fbbf24';
    nextHtml = `
      <div class="t-stat">🛡️ Integrity: <b style="color:${intColor}">${intPct}%</b>${miniBarHtml(intPct, intColor)}</div>
      <div class="t-stat">🔥 Thrust: <b style="color:${thrustColor}">${thrustPct}%</b>${miniBarHtml(thrustPct, thrustColor)}</div>
      <div class="t-stat">🧭 Trim: <b style="color:${inPitchBand ? '#4ade80' : '#f87171'}">${inPitchBand ? 'LOCKED' : 'DRIFTING'}</b></div>
      <div class="t-stat">🚀 Sep: <b>${state.ascent.separated ? 'DECOUPLED ✅' : state.ascent.sepWindowOpen ? 'READY [SPACE]!' : 'ARMING...'}</b></div>
    `;
  } else if (state.stage === 'STAGE2') {
    const activeAlerts = state.consoles.filter(c => c.alert).length;
    const hullPct = Math.round(state.orbitState.shipIntegrity ?? 100);
    const battPct = Math.round(state.orbitState.battery ?? 0);
    const minQuota = state.orbitState.minTasksRequired || 4;
    const tasksDone = state.orbitState.tasksCompleted || 0;
    const hullColor = hullPct < 45 ? '#f87171' : '#4ade80';
    const battColor = battPct < 30 ? '#f87171' : battPct < 55 ? '#fbbf24' : '#4ade80';
    const quotaColor = tasksDone >= minQuota ? '#4ade80' : '#fbbf24';
    nextHtml = `
      <div class="t-stat">🛡️ Hull: <b style="color:${hullColor}">${hullPct}%</b>${miniBarHtml(hullPct, hullColor)}</div>
      <div class="t-stat">🔋 Battery: <b style="color:${battColor}">${battPct}%</b>${miniBarHtml(battPct, battColor)}</div>
      <div class="t-stat">📋 Quota: <b style="color:${quotaColor}">${tasksDone}/${minQuota}</b>${miniBarHtml(clampPct(tasksDone, minQuota), quotaColor)}</div>
      <div class="t-stat">⚠️ Alerts: <b style="color:${activeAlerts > 0 ? '#f87171' : '#4ade80'}">${activeAlerts}</b></div>
      <div class="t-stat">🔬 Science: <b>${state.telemetry.science} pts</b></div>
    `;
  } else if (state.stage === 'STAGE3A') {
    const vSpd = Math.abs(state.lander.vz * 0.24).toFixed(1);
    const alt = Math.max(0, Math.round(state.lander.z * 0.45));
    const fuelPct = Math.round(state.lander.fuel ?? 0);
    const fuelColor = fuelPct < 20 ? '#f87171' : '#38bdf8';
    const padDist = Math.round(Math.hypot(state.lander.x - state.lander.padX, (state.lander.y - state.lander.padY) * 1.4));
    nextHtml = `
      <div class="t-stat">📏 Alt: <b>${alt} m</b></div>
      <div class="t-stat">⬇️ Descent: <b style="color:${Number(vSpd) > 5.0 ? '#f87171' : '#4ade80'}">${vSpd} m/s</b></div>
      <div class="t-stat">⛽ Fuel: <b style="color:${fuelColor}">${fuelPct}%</b>${miniBarHtml(fuelPct, fuelColor)}</div>
      <div class="t-stat">🎯 Pad: <b style="color:${padDist <= 76 ? '#4ade80' : '#fbbf24'}">${padDist} m</b></div>
      <div class="t-stat">👥 Trim: <b style="color:#38bdf8">${state.lander.p2AssistActive ? 'P2 AUTO' : '4P ACTIVE'}</b></div>
    `;
  } else if (state.stage === 'STAGE3B') {
    const doneTasks = (state.evaTasks || []).filter(t => t.done).length;
    const totalTasks = (state.evaTasks || []).length || 3;
    const anySample = state.rover.hasSample || state.rover2.hasSample;
    const objText = anySample ? 'Return to Point A!' : 'EVA + Drill Point B!';
    const batt = Math.round(state.rover.battery ?? 0);
    const battColor = batt < 25 ? '#f87171' : batt < 50 ? '#fbbf24' : '#4ade80';
    nextHtml = `
      <div class="t-stat">🚙 Goal: <b style="color:#4ade80">${objText}</b></div>
      <div class="t-stat">🛠️ EVA: <b>${doneTasks}/${totalTasks}</b>${miniBarHtml(clampPct(doneTasks, totalTasks), '#38bdf8')}</div>
      <div class="t-stat">🧪 Cores: <b>${(state.rover.hasSample ? 1 : 0) + (state.rover2.hasSample ? 1 : 0)}/2</b></div>
      <div class="t-stat">🔋 LTV-1: <b style="color:${battColor}">${batt}Wh</b>${miniBarHtml(clampPct(batt, 100), battColor)}</div>
      <div class="t-stat">🔬 Sci: <b>${state.telemetry.science}</b></div>
    `;
  } else if (state.stage === 'STAGE3C') {
    const inTeiWin = state.moonLaunch.progress >= 0.36 && state.moonLaunch.progress <= 0.68;
    const fuelPct = Math.round(state.telemetry.fuel ?? 0);
    nextHtml = `
      <div class="t-stat">🌕 Phase: <b style="color:#38bdf8">${state.moonLaunch.phase === 'LIFTOFF' ? 'LUNAR ASCENT' : 'CISLUNAR TRANSFER'}</b></div>
      <div class="t-stat">🧭 Course: <b style="color:${Math.abs(state.moonLaunch.tilt) < 0.25 ? '#4ade80' : '#fbbf24'}">${Math.abs(state.moonLaunch.tilt) < 0.25 ? 'NOMINAL' : 'CORRECT [A/D]'}</b></div>
      <div class="t-stat">🔥 TEI: <b style="color:${state.moonLaunch.teiBurnDone ? '#4ade80' : inTeiWin ? '#fde047' : '#94a3b8'}">${state.moonLaunch.teiBurnDone ? `${state.moonLaunch.teiQuality || 'LOCKED'} ✅` : inTeiWin ? 'GREEN WINDOW [SPACE]!' : 'WAIT FOR GREEN'}</b></div>
      <div class="t-stat">⛽ Fuel: <b>${fuelPct}%</b>${miniBarHtml(fuelPct, '#38bdf8')}</div>
    `;
  } else if (state.stage === 'STAGE4') {
    const inCorr = Math.abs(state.reentry.pitchAngle) <= state.reentry.corridorHalfWidth;
    const shipOffset = Math.round(state.reentry.capsuleX - state.reentry.shipX);
    const heatPct = Math.round(state.reentry.heat ?? 0);
    const heatColor = heatPct > 75 ? '#f87171' : heatPct > 50 ? '#fbbf24' : '#38bdf8';
    nextHtml = `
      <div class="t-stat">🌍 Alt: <b>${Math.max(0, state.reentry.altitude).toFixed(1)} km</b></div>
      <div class="t-stat">🔥 Shield: <b style="color:${heatColor}">${heatPct}%</b>${miniBarHtml(heatPct, heatColor)}</div>
      <div class="t-stat">🎯 ${state.reentry.phase === 'PLASMA' ? 'Corridor' : 'Carrier'}: <b style="color:${(state.reentry.phase === 'PLASMA' ? inCorr : Math.abs(shipOffset) <= 80) ? '#4ade80' : '#fbbf24'}">${state.reentry.phase === 'PLASMA' ? (inCorr ? 'OPTIMAL' : 'OFF-ANGLE') : (shipOffset + ' m')}</b></div>
      <div class="t-stat">🪂 Chutes: <b>${state.reentry.chutesDeployed ? 'MAIN OPEN ✅' : state.reentry.drogueDeployed ? 'DROGUE ✅' : 'STANDBY'}</b></div>
    `;
  } else {
    const scen = getScenario();
    const veh = getVehicle();
    const startBudget = Math.max(20, (scen?.budget || 240) - (veh?.cost || 40));
    const overMass = state.telemetry.mass > state.telemetry.maxMass;
    const nearMass = state.telemetry.mass > state.telemetry.maxMass * 0.85;
    const lowBudget = state.telemetry.budget < 30;
    const uniqueCore = Object.values(state.shippedModules || {}).filter(v => v > 0).length;
    const massPct = clampPct(state.telemetry.mass, state.telemetry.maxMass);
    const massColor = overMass ? '#f87171' : nearMass ? '#fbbf24' : '#38bdf8';
    const budgetPct = clampPct(state.telemetry.budget, startBudget);
    const budgetColor = lowBudget ? '#fbbf24' : '#4ade80';
    const fuelPct = clampPct(state.telemetry.fuel, 100);
    const fuelColor = fuelPct < 35 ? '#fbbf24' : '#38bdf8';
    nextHtml = `
      <div class="t-stat">🚀 Core: <b style="color:${uniqueCore === 4 ? '#4ade80' : '#fde047'}">${uniqueCore}/4</b></div>
      <div class="t-stat ${overMass ? 'danger' : nearMass ? 'warn' : ''}">⚖️ Mass: <b style="color:${massColor}">${state.telemetry.mass}/${state.telemetry.maxMass}kg</b>${miniBarHtml(massPct, massColor)}</div>
      <div class="t-stat ${lowBudget ? 'warn' : ''}">💰 Budget: <b style="color:${budgetColor}">$${state.telemetry.budget}M</b>${miniBarHtml(budgetPct, budgetColor)}</div>
      <div class="t-stat">⚡ Power: <b style="color:${state.telemetry.power < 0 ? '#f87171' : '#4ade80'}">${state.telemetry.power >= 0 ? '+' : ''}${state.telemetry.power}W</b></div>
      <div class="t-stat">⛽ Fuel: <b style="color:${fuelColor}">${Math.round(state.telemetry.fuel)}%</b>${miniBarHtml(fuelPct, fuelColor)}</div>
      ${goalBadgeHtml}
    `;
  }

  if (nextHtml !== lastTelemetryHtml) {
    lastTelemetryHtml = nextHtml;
    strip.innerHTML = iconize(nextHtml);
  }
}

export function showMenuModal(onStartGame) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  const scen = getScenario();
  const veh = getVehicle();
  const startBudget = Math.max(20, scen.budget - veh.cost);
  const objectives = Object.values(SCIENCE_OBJECTIVES || {});
  const obj = getSelectedObjective();
  if (obj && !state.selectedObjective) {
    state.selectedObjective = obj.id;
  }

  const objButtons = objectives.map(o => {
    const reqNames = (o.requiredModules || []).map(getModuleShortName).join(' + ');
    const isSelected = (state.selectedObjective || obj?.id) === o.id;
    return `
      <button type="button" class="opt-btn science-opt-btn ${isSelected ? 'selected' : ''}" data-objective="${o.id}" title="${o.summary || o.description || ''}">
        <b>${o.title}</b>
        <small class="sci-loc">${o.targetLocation}</small>
        <small class="sci-req">Req: ${reqNames}</small>
      </button>
    `;
  }).join('');

  const scenButtons = Object.values(SCENARIOS).map(sc => `
    <button type="button" class="opt-btn ${state.selectedScenario === sc.id ? 'selected' : ''}" data-scen="${sc.id}">
      <b>${sc.name.split(' ')[0]} <span style="color:#38bdf8">[${sc.badge}]</span></b>
      <small>$${sc.budget}M budget • ${sc.eclipseDrainMul > 1 ? 'Heavy eclipse' : sc.eclipseDrainMul < 1 ? 'Mild eclipse' : 'Standard eclipse'}</small>
    </button>
  `).join('');

  const vehButtons = Object.values(LAUNCH_VEHICLES).map(vh => `
    <button type="button" class="opt-btn ${state.selectedVehicle === vh.id ? 'selected' : ''}" data-veh="${vh.id}">
      <b>${vh.name}</b>
      <small>${vh.maxMass} kg cap • $${vh.cost}M</small>
    </button>
  `).join('');

  const objReqPreview = obj ? (obj.requiredModules || []).map(getModuleShortName).join(' + ') : '';

  content.innerHTML = `
    <h1>Orbital Kitchen</h1>
    <p class="sub">Define your science goal, mission site, and rocket, then build modules in the Hangar.</p>

    <div class="md-section">
      <div class="md-section-label">1. Science Goal</div>
      <div class="opt-group science-opt-group">${objButtons}</div>
    </div>

    <div class="md-section">
      <div class="md-section-label">2. Mission Site</div>
      <div class="opt-group">${scenButtons}</div>
    </div>

    <div class="md-section">
      <div class="md-section-label">3. Launch Rocket</div>
      <div class="opt-group">${vehButtons}</div>
    </div>

    <div class="trade-preview">
      <div class="trade-chip">Mass Limit <b>${veh.maxMass} kg</b></div>
      <div class="trade-chip">Budget <b>$${startBudget}M</b></div>
      <div class="trade-chip">Power <b>+${scen.startPower}W</b></div>
      <div class="trade-chip">Fuel <b>${scen.startFuel}%</b></div>
      ${obj ? `<div class="trade-chip trade-chip-science">Science Goal <b>${obj.targetLocation}</b> (${objReqPreview})</div>` : ''}
    </div>

    <div class="modal-actions">
      <button id="btn-open-guide-modal" class="btn-secondary" type="button">How to Play</button>
      <button id="btn-start-mission" class="btn-play" type="button">Start Mission</button>
    </div>
  `;

  content.querySelectorAll('[data-objective]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedObjective = btn.dataset.objective;
      state.currentCML = 2;
      showMenuModal(onStartGame);
    });
  });

  content.querySelectorAll('[data-scen]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedScenario = btn.dataset.scen;
      showMenuModal(onStartGame);
    });
  });

  content.querySelectorAll('[data-veh]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedVehicle = btn.dataset.veh;
      showMenuModal(onStartGame);
    });
  });

  document.getElementById('btn-start-mission').addEventListener('click', onStartGame);
  document.getElementById('btn-open-guide-modal').addEventListener('click', () => {
    document.getElementById('guide-modal').classList.remove('hidden');
  });

  modal.classList.remove('hidden');
}

/* ============================================================
   CORNER UI SPOTLIGHT TOUR (5 STOPS)
   ============================================================ */
const UI_TOUR_STOPS = [
  {
    id: 'tickets',
    corner: 'TOP-LEFT DOCK',
    title: 'Order Tickets & Science REQ',
    desc: 'Click any ticket to pin it as your build target. Gold REQ badges mark payloads required by your Science Goal, and the top bar tracks the speed bonus.',
    placement: 'below-left',
    getRect: () => {
      const target = document.querySelector('#tickets-bar .ticket.target-ticket')
        || document.querySelector('#tickets-bar .ticket')
        || document.getElementById('tickets-bar');
      return target ? target.getBoundingClientRect() : null;
    }
  },
  {
    id: 'squad',
    corner: 'TOP-RIGHT DOCK',
    title: '4-Segment Crew & Co-op Mode',
    desc: 'Switch between P1 Launch, P2 Space, P3 Science, and P4 Ground with keys 1–4 (or click), and toggle 4P AI, Local 2P, Multi-Tab 4P, or Solo.',
    placement: 'below-right',
    getRect: () => getUnionRect([
      document.getElementById('squad-bar'),
      document.getElementById('btn-coop')
    ])
  },
  {
    id: 'launch',
    corner: 'TOP-RIGHT COMMAND',
    title: 'Launch Readiness, Score & Pause',
    desc: 'Track your star score and mission clock here. In Stage 1, build at least 2 modules (and your Science REQ payloads) until LAUNCH READY lights up.',
    placement: 'below-right',
    getRect: () => getUnionRect([
      document.getElementById('btn-skip'),
      document.getElementById('score-display')?.closest('.pill-box')
    ])
  },
  {
    id: 'telemetry',
    corner: 'BOTTOM-LEFT STRIP',
    title: 'Live Telemetry & Science Goal',
    desc: 'Watch your rocket Mass cap, Ops Budget, Power, Fuel, and CML Science Goal update live as you assemble modules in the hangar.',
    placement: 'above-left',
    getRect: () => {
      const strip = document.getElementById('telemetry-strip');
      if (!strip) return null;
      const children = Array.from(strip.querySelectorAll('.t-stat')).slice(0, 5);
      return children.length ? getUnionRect(children) : strip.getBoundingClientRect();
    }
  },
  {
    id: 'controls',
    corner: 'BOTTOM-RIGHT PILL',
    title: 'Active Stage Keybindings',
    desc: 'Check this hint pill anytime—it updates dynamically for every mission stage with movement, interact, override, rover, and reentry keys.',
    placement: 'above-right',
    getRect: () => {
      const el = document.getElementById('controls-hint');
      return el ? el.getBoundingClientRect() : null;
    }
  }
];

function getUnionRect(elements) {
  const rects = (elements || [])
    .filter(Boolean)
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    if (r.left < left) left = r.left;
    if (r.top < top) top = r.top;
    if (r.right > right) right = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

let uiTourActive = false;
let uiTourStep = 0;
let uiTourOnComplete = null;
let uiTourEventsBound = false;

function bindUiTourEvents() {
  if (uiTourEventsBound) return;
  uiTourEventsBound = true;
  document.getElementById('btn-tour-back')?.addEventListener('click', () => prevUiTour());
  document.getElementById('btn-tour-next')?.addEventListener('click', () => advanceUiTour());
  document.getElementById('btn-tour-skip')?.addEventListener('click', () => skipUiTour());
}

function handleUiTourResize() {
  if (uiTourActive) positionUiTour();
}

export function isUiTourActive() {
  return Boolean(uiTourActive);
}

export function positionUiTour() {
  if (!uiTourActive) return;
  const overlay = document.getElementById('ui-tour-overlay');
  const svg = document.getElementById('ui-tour-svg');
  const path = document.getElementById('ui-tour-mask-path');
  const ring = document.getElementById('ui-tour-ring');
  const card = document.getElementById('ui-tour-card');
  if (!overlay || !svg || !path || !ring || !card) return;

  const stop = UI_TOUR_STOPS[uiTourStep] || UI_TOUR_STOPS[0];
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;

  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);

  // Rectangular pixel spotlight snapped to the 2px UI grid.
  const rect = stop.getRect();
  const spotPad = 10;
  let left = vw / 2 - 84;
  let top = vh / 2 - 54;
  let right = vw / 2 + 84;
  let bottom = vh / 2 + 54;
  if (rect && rect.width > 0 && rect.height > 0) {
    left = rect.left - spotPad;
    top = rect.top - spotPad;
    right = rect.right + spotPad;
    bottom = rect.bottom + spotPad;
  }
  const snap = (v) => Math.round(v / 2) * 2;
  left = snap(Math.max(8, left));
  top = snap(Math.max(8, top));
  right = snap(Math.min(vw - 8, right));
  bottom = snap(Math.min(vh - 8, bottom));
  const cx = (left + right) / 2;

  const d = [
    `M 0 0 H ${vw} V ${vh} H 0 Z`,
    `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`
  ].join(' ');
  path.setAttribute('d', d);

  ring.style.left = `${left}px`;
  ring.style.top = `${top}px`;
  ring.style.width = `${right - left}px`;
  ring.style.height = `${bottom - top}px`;

  const badge = document.getElementById('ui-tour-step-badge');
  const cornerTag = document.getElementById('ui-tour-corner-tag');
  const titleEl = document.getElementById('ui-tour-title');
  const descEl = document.getElementById('ui-tour-desc');
  const backBtn = document.getElementById('btn-tour-back');
  const nextBtn = document.getElementById('btn-tour-next');

  if (badge) badge.textContent = `UI TOUR ${uiTourStep + 1} / ${UI_TOUR_STOPS.length}`;
  if (cornerTag) cornerTag.textContent = stop.corner;
  if (titleEl) titleEl.textContent = stop.title;
  if (descEl) descEl.textContent = stop.desc;
  if (backBtn) backBtn.disabled = uiTourStep === 0;
  if (nextBtn) nextBtn.textContent = uiTourStep === UI_TOUR_STOPS.length - 1 ? 'Start Hangar Tour' : 'Continue';

  const cardRect = card.getBoundingClientRect();
  const cardW = cardRect.width || Math.min(420, vw - 28);
  const cardH = cardRect.height || 156;
  const pad = 16;

  let cardX = pad;
  let cardY = pad;
  if (stop.placement === 'below-left') {
    cardX = Math.max(pad, Math.min(vw - cardW - pad, cx - cardW * 0.35));
    cardY = Math.min(vh - cardH - pad, bottom + 18);
  } else if (stop.placement === 'below-right') {
    cardX = Math.max(pad, vw - cardW - 20);
    cardY = Math.min(vh - cardH - pad, bottom + 18);
  } else if (stop.placement === 'above-left') {
    cardX = pad;
    cardY = Math.max(pad, top - cardH - 18);
  } else if (stop.placement === 'above-right') {
    cardX = Math.max(pad, vw - cardW - 20);
    cardY = Math.max(pad, top - cardH - 18);
  }

  card.style.left = `${Math.round(cardX)}px`;
  card.style.top = `${Math.round(cardY)}px`;
}

function finishUiTour(skipped = false) {
  uiTourActive = false;
  state.uiTour = { active: false, step: uiTourStep, skipped };
  window.removeEventListener('resize', handleUiTourResize);
  const overlay = document.getElementById('ui-tour-overlay');
  if (overlay) overlay.classList.add('hidden');
  const cb = uiTourOnComplete;
  uiTourOnComplete = null;
  if (typeof cb === 'function') {
    cb({ skipped });
  }
}

export function startUiTour(onComplete = null) {
  bindUiTourEvents();
  updateBottomHUD();
  const overlay = document.getElementById('ui-tour-overlay');
  if (!overlay) {
    if (typeof onComplete === 'function') onComplete({ skipped: false });
    return;
  }
  uiTourOnComplete = typeof onComplete === 'function' ? onComplete : null;
  uiTourActive = true;
  uiTourStep = 0;
  state.uiTour = { active: true, step: 0, skipped: false };
  overlay.classList.remove('hidden');
  window.removeEventListener('resize', handleUiTourResize);
  window.addEventListener('resize', handleUiTourResize);
  positionUiTour();
  requestAnimationFrame(() => positionUiTour());
}

export function advanceUiTour() {
  if (!uiTourActive) return false;
  if (uiTourStep < UI_TOUR_STOPS.length - 1) {
    uiTourStep += 1;
    state.uiTour = { active: true, step: uiTourStep, skipped: false };
    positionUiTour();
    return true;
  }
  finishUiTour(false);
  return true;
}

export function prevUiTour() {
  if (!uiTourActive || uiTourStep <= 0) return false;
  uiTourStep -= 1;
  state.uiTour = { active: true, step: uiTourStep, skipped: false };
  positionUiTour();
  return true;
}

export function skipUiTour() {
  if (!uiTourActive) return false;
  finishUiTour(true);
  return true;
}
