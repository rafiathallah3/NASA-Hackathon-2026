import { PROC_META, RECIPES, SCENARIOS, LAUNCH_VEHICLES, SCIENCE_OBJECTIVES, CML_LEVELS } from './config.js';
import { state, getScenario, getVehicle } from './state.js';
import { getHardwareSVG } from './sprites.js';
import { claimCrewSlot } from './net.js';

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

let toastTimer = null;
export function showMissionToast(tag, text, ms = 4400) {
  const el = document.getElementById('mission-toast');
  if (!el) return;
  el.innerHTML = `<span class="toast-tag">${tag}</span><span>${text}</span>`;
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
  document.getElementById('btn-skip').style.display = showSkip ? 'inline-block' : 'none';
  document.getElementById('btn-next').style.display = showNext ? 'inline-block' : 'none';

  const sb = document.getElementById('stage-banner');
  if (showTickets) {
    sb.style.display = 'none';
  } else {
    sb.style.display = 'flex';
    document.getElementById('sb-badge').textContent = badge;
    document.getElementById('sb-title').textContent = title;
    document.getElementById('sb-desc').textContent = desc;
  }
  document.getElementById('controls-hint').innerHTML = controlsHtml;
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

  bar.innerHTML = state.orders.map(o => {
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
              ${getHardwareSVG(m1.shape, true)}
              <span class="pname">${r1Ready ? '✓ ' : ''}${r1Raw}</span>
              <small style="color:${m1.verbColor}">${m1.verb}</small>
            </div>
            <div class="req-chip ${r2Ready ? 'chip-ready' : ''}" id="tk-c2-${o.uid}">
              ${getHardwareSVG(m2.shape, true)}
              <span class="pname">${r2Ready ? '✓ ' : ''}${r2Raw}</span>
              <small style="color:${m2.verbColor}">${m2.verb}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

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
    pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
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

export function updateBottomHUD() {
  document.getElementById('score-display').textContent = state.score;
  const strip = document.getElementById('telemetry-strip');

  if (state.stage === 'STAGE1B') {
    const inThrustBand = Math.abs(state.ascent.thrust - state.ascent.targetThrust) <= 0.14;
    const inPitchBand = Math.abs(state.ascent.tilt) <= 0.2;
    const intPct = Math.round(state.ascent.integrity ?? 100);
    strip.innerHTML = `
      <div class="t-stat">🛡️ Ascent Integrity: <b style="color:${intPct > 60 ? '#4ade80' : intPct > 30 ? '#fbbf24' : '#f87171'}">${intPct}%</b></div>
      <div class="t-stat">🔥 Vertical Thrust: <b style="color:${inThrustBand ? '#4ade80' : '#fbbf24'}">${Math.round(state.ascent.thrust * 100)}%</b></div>
      <div class="t-stat">🧭 Stabilizer Trim: <b style="color:${inPitchBand ? '#4ade80' : '#f87171'}">${inPitchBand ? 'LOCKED' : 'DRIFTING'}</b></div>
      <div class="t-stat">🚀 Stage Sep: <b>${state.ascent.separated ? 'DECOUPLED ✅' : state.ascent.sepWindowOpen ? 'READY [SPACE]!' : 'ARMING...'}</b></div>
    `;
  } else if (state.stage === 'STAGE2') {
    const activeAlerts = state.consoles.filter(c => c.alert).length;
    const hullPct = Math.round(state.orbitState.shipIntegrity ?? 100);
    const minQuota = state.orbitState.minTasksRequired || 3;
    strip.innerHTML = `
      <div class="t-stat">🛡️ Hull: <b style="color:${hullPct < 45 ? '#f87171' : '#4ade80'}">${hullPct}%</b></div>
      <div class="t-stat">🔋 Battery: <b style="color:${state.orbitState.battery < 30 ? '#f87171' : '#4ade80'}">${Math.round(state.orbitState.battery)}%</b></div>
      <div class="t-stat">📋 Task Quota: <b style="color:${state.orbitState.tasksCompleted >= minQuota ? '#4ade80' : '#fbbf24'}">${state.orbitState.tasksCompleted}/${minQuota}</b></div>
      <div class="t-stat">⚠️ Active Alerts: <b style="color:${activeAlerts > 0 ? '#f87171' : '#4ade80'}">${activeAlerts}</b></div>
      <div class="t-stat">🔬 Science: <b>${state.telemetry.science} pts</b></div>
    `;
  } else if (state.stage === 'STAGE3A') {
    const vSpd = Math.abs(state.lander.vz * 0.24).toFixed(1);
    const alt = Math.max(0, Math.round(state.lander.z * 0.45));
    const padDist = Math.round(Math.hypot(state.lander.x - state.lander.padX, (state.lander.y - state.lander.padY) * 1.4));
    strip.innerHTML = `
      <div class="t-stat">📏 Altitude: <b>${alt} m</b></div>
      <div class="t-stat">⬇️ Descent: <b style="color:${Number(vSpd) > 5.0 ? '#f87171' : '#4ade80'}">${vSpd} m/s</b></div>
      <div class="t-stat">⛽ Fuel: <b style="color:${state.lander.fuel < 20 ? '#f87171' : '#38bdf8'}">${Math.round(state.lander.fuel)}%</b></div>
      <div class="t-stat">🎯 Pad Offset: <b style="color:${padDist <= 76 ? '#4ade80' : '#fbbf24'}">${padDist} m</b></div>
      <div class="t-stat">👥 Crew Trim: <b style="color:#38bdf8">${state.lander.p2AssistActive ? 'P2 AUTO-TRIM' : '4P ACTIVE'}</b></div>
    `;
  } else if (state.stage === 'STAGE3B') {
    const doneTasks = (state.evaTasks || []).filter(t => t.done).length;
    const totalTasks = (state.evaTasks || []).length;
    const anySample = state.rover.hasSample || state.rover2.hasSample;
    const obj = anySample ? 'Return Sample to Point A Rocket!' : 'Complete EVA Tasks & Drill Point B Crater!';
    strip.innerHTML = `
      <div class="t-stat">🚙 4P Objective: <b style="color:#4ade80">${obj}</b></div>
      <div class="t-stat">🛠️ EVA Tasks: <b>${doneTasks}/${totalTasks}</b></div>
      <div class="t-stat">🧪 Cores: <b>${(state.rover.hasSample ? 1 : 0) + (state.rover2.hasSample ? 1 : 0)}/2</b></div>
      <div class="t-stat">🔋 LTV-1: <b>${Math.round(state.rover.battery)}Wh</b></div>
      <div class="t-stat">🔬 Science: <b>${state.telemetry.science} pts</b></div>
    `;
  } else if (state.stage === 'STAGE3C') {
    const inTeiWin = state.moonLaunch.progress >= 0.36 && state.moonLaunch.progress <= 0.68;
    strip.innerHTML = `
      <div class="t-stat">🌕 Phase: <b style="color:#38bdf8">${state.moonLaunch.phase === 'LIFTOFF' ? 'LUNAR ASCENT' : 'CISLUNAR TRANSFER'}</b></div>
      <div class="t-stat">🧭 Trajectory: <b style="color:${Math.abs(state.moonLaunch.tilt) < 0.25 ? '#4ade80' : '#fbbf24'}">${Math.abs(state.moonLaunch.tilt) < 0.25 ? 'ON COURSE' : 'CORRECT [A/D]'}</b></div>
      <div class="t-stat">🔥 TEI Burn: <b style="color:${state.moonLaunch.teiBurnDone ? '#4ade80' : inTeiWin ? '#fde047' : '#94a3b8'}">${state.moonLaunch.teiBurnDone ? `${state.moonLaunch.teiQuality || 'LOCKED'} ✅` : inTeiWin ? 'GREEN WINDOW [SPACE]!' : 'WAIT FOR GREEN WINDOW'}</b></div>
    `;
  } else if (state.stage === 'STAGE4') {
    const inCorr = Math.abs(state.reentry.pitchAngle) <= state.reentry.corridorHalfWidth;
    const shipOffset = Math.round(state.reentry.capsuleX - state.reentry.shipX);
    strip.innerHTML = `
      <div class="t-stat">🌍 Alt: <b>${Math.max(0, state.reentry.altitude).toFixed(1)} km</b></div>
      <div class="t-stat">🔥 Shield: <b style="color:${state.reentry.heat > 75 ? '#f87171' : '#38bdf8'}">${Math.round(state.reentry.heat)}%</b></div>
      <div class="t-stat">🎯 ${state.reentry.phase === 'PLASMA' ? 'Corridor' : 'Carrier Offset'}: <b style="color:${(state.reentry.phase === 'PLASMA' ? inCorr : Math.abs(shipOffset) <= 80) ? '#4ade80' : '#fbbf24'}">${state.reentry.phase === 'PLASMA' ? (inCorr ? 'OPTIMAL' : 'OFF-ANGLE') : (shipOffset + ' m')}</b></div>
      <div class="t-stat">🪂 Chutes: <b>${state.reentry.chutesDeployed ? 'MAIN OPEN ✅' : state.reentry.drogueDeployed ? 'DROGUE ✅' : 'STANDBY'}</b></div>
    `;
  } else {
    const overMass = state.telemetry.mass > state.telemetry.maxMass;
    const nearMass = state.telemetry.mass > state.telemetry.maxMass * 0.85;
    const lowBudget = state.telemetry.budget < 30;
    const uniqueCore = Object.values(state.shippedModules || {}).filter(v => v > 0).length;
    strip.innerHTML = `
      <div class="t-stat">🚀 Core Bay: <b style="color:${uniqueCore === 4 ? '#4ade80' : '#fde047'}">${uniqueCore}/4</b></div>
      <div class="t-stat ${overMass ? 'danger' : nearMass ? 'warn' : ''}">⚖️ Mass: <b style="color:${overMass ? '#f87171' : nearMass ? '#fbbf24' : '#38bdf8'}">${state.telemetry.mass}/${state.telemetry.maxMass}kg</b></div>
      <div class="t-stat ${lowBudget ? 'warn' : ''}">💰 Budget: <b style="color:${lowBudget ? '#fbbf24' : '#4ade80'}">$${state.telemetry.budget}M</b></div>
      <div class="t-stat">⚡ Power: <b style="color:${state.telemetry.power < 0 ? '#f87171' : '#4ade80'}">${state.telemetry.power >= 0 ? '+' : ''}${state.telemetry.power}W</b></div>
      <div class="t-stat">⛽ Fuel: <b>${Math.round(state.telemetry.fuel)}%</b></div>
    `;
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
