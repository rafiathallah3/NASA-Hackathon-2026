import { PROC_META, RECIPES, SCENARIOS, LAUNCH_VEHICLES } from './config.js';
import { state, getScenario, getVehicle } from './state.js';
import { getHardwareSVG } from './sprites.js';
import { claimCrewSlot } from './net.js';

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
    btn.textContent = '🎮 Local 2P + 2 Bots';
    btn.className = 'btn-hud btn-bot local2p';
  } else if (state.coopMode === 'LOCAL_2P') {
    state.coopMode = 'NET_4P';
    btn.textContent = '🌐 Multi-Tab 4P Sync';
    btn.className = 'btn-hud btn-bot net4p';
    claimCrewSlot(state.activeCrewIndex);
  } else if (state.coopMode === 'NET_4P') {
    state.coopMode = 'SOLO';
    btn.textContent = '👤 Solo (1P)';
    btn.className = 'btn-hud btn-bot off';
  } else {
    state.coopMode = '4P_AI';
    btn.textContent = '👥 4P Squad (AI)';
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

export function renderTicketsHUD() {
  const bar = document.getElementById('tickets-bar');
  bar.innerHTML = state.orders.map(o => {
    const m1 = PROC_META[o.recipe.reqs[0]];
    const m2 = PROC_META[o.recipe.reqs[1]];
    const pct = Math.max(0, (o.remaining / o.maxTime) * 100);
    const hasBonus = o.remaining > 0;
    const builtCount = state.shippedModules[o.recipe.id] || 0;
    return `
      <div class="ticket" id="tk-${o.uid}">
        <div class="ticket-header" style="background:${o.recipe.segColor}">
          <span>${o.recipe.segment}</span>
          <span>${builtCount > 0 ? `✓ x${builtCount}` : `+${o.recipe.points}⭐`}</span>
        </div>
        <div class="ticket-timer-bg">
          <div class="ticket-timer-fill" id="tk-bar-${o.uid}" style="width:${hasBonus ? pct : 100}%;background:${hasBonus ? '#22c55e' : '#38bdf8'}"></div>
        </div>
        <div class="ticket-bonus-label" id="tk-lbl-${o.uid}">
          <span>${hasBonus ? '⚡ Priority Bonus' : '✅ Ready Anytime'}</span>
          <span>${o.recipe.massKg}kg • $${o.recipe.costM}M</span>
        </div>
        <div class="ticket-body">
          <div class="ticket-title">${o.recipe.title}</div>
          <div class="ticket-reqs">
            <div class="req-chip">
              ${getHardwareSVG(m1.shape, true)}
              <span class="pname">${m1.name}</span>
              <small style="color:${m1.verbColor}">${m1.verb}</small>
            </div>
            <div class="req-chip">
              ${getHardwareSVG(m2.shape, true)}
              <span class="pname">${m2.name}</span>
              <small style="color:${m2.verbColor}">${m2.verb}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function updateTicketBarsOnly() {
  for (const o of state.orders) {
    const el = document.getElementById(`tk-bar-${o.uid}`);
    const lbl = document.getElementById(`tk-lbl-${o.uid}`);
    if (el) {
      if (o.remaining > 0) {
        const pct = Math.max(0, (o.remaining / o.maxTime) * 100);
        el.style.width = pct + '%';
        el.style.backgroundColor = pct > 50 ? '#22c55e' : '#f59e0b';
      } else {
        el.style.width = '100%';
        el.style.backgroundColor = '#38bdf8';
        if (lbl && lbl.firstElementChild) lbl.firstElementChild.textContent = '✅ Ready Anytime';
      }
    }
  }
}

export function getCmlLevel(shippedCount) {
  if (shippedCount >= 6) return 'CML-4 Flight Ready';
  if (shippedCount >= 4) return 'CML-3 Point Design';
  if (shippedCount >= 2) return 'CML-2 Trade Study';
  return 'CML-1 Concept';
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
    strip.innerHTML = `
      <div class="t-stat">🔋 Bus Battery: <b style="color:${state.orbitState.battery < 30 ? '#f87171' : '#4ade80'}">${Math.round(state.orbitState.battery)}%</b></div>
      <div class="t-stat">💾 Data Buffer: <b style="color:${state.orbitState.dataBuffer > 80 ? '#f87171' : '#38bdf8'}">${Math.round(state.orbitState.dataBuffer)}%</b></div>
      <div class="t-stat">⚠️ Active Alerts: <b style="color:${activeAlerts > 0 ? '#fbbf24' : '#4ade80'}">${activeAlerts}</b></div>
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
    strip.innerHTML = `
      <div class="t-stat">🌕 Phase: <b style="color:#38bdf8">${state.moonLaunch.phase === 'LIFTOFF' ? 'LUNAR ASCENT' : 'CISLUNAR TRANSFER'}</b></div>
      <div class="t-stat">🧭 Trajectory: <b style="color:${Math.abs(state.moonLaunch.tilt) < 0.25 ? '#4ade80' : '#fbbf24'}">${Math.abs(state.moonLaunch.tilt) < 0.25 ? 'ON COURSE' : 'CORRECT [A/D]'}</b></div>
      <div class="t-stat">🔥 TEI Burn: <b>${state.moonLaunch.teiBurnDone ? 'LOCKED ✅' : 'STANDBY'}</b></div>
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
    strip.innerHTML = `
      <div class="t-stat">📦 ${getCmlLevel(state.shippedCount)} (<b>${state.shippedCount}</b>)</div>
      <div class="t-stat ${overMass ? 'danger' : nearMass ? 'warn' : ''}">⚖️ Mass: <b style="color:${overMass ? '#f87171' : nearMass ? '#fbbf24' : '#38bdf8'}">${state.telemetry.mass}/${state.telemetry.maxMass}kg</b></div>
      <div class="t-stat ${lowBudget ? 'warn' : ''}">💰 Budget: <b style="color:${lowBudget ? '#fbbf24' : '#4ade80'}">$${state.telemetry.budget}M</b></div>
      <div class="t-stat">⚡ Power: <b style="color:${state.telemetry.power < 0 ? '#f87171' : '#4ade80'}">${state.telemetry.power >= 0 ? '+' : ''}${state.telemetry.power}W</b></div>
      <div class="t-stat">📡 Comms: <b>${state.telemetry.comms} Mb/d</b></div>
      <div class="t-stat">🔬 Science: <b>${state.telemetry.science} pts</b></div>
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

  content.innerHTML = `
    <h1>Orbital Kitchen</h1>
    <p class="sub">Configure your 4P Lunar Sample Return mission, then build at your own pace in the Hangar.</p>

    <div class="md-section">
      <div class="md-section-label">1. Mission Scenario</div>
      <div class="opt-group">${scenButtons}</div>
    </div>

    <div class="md-section">
      <div class="md-section-label">2. Launch Vehicle</div>
      <div class="opt-group">${vehButtons}</div>
    </div>

    <div class="trade-preview">
      <div class="trade-chip">Payload Cap <b>${veh.maxMass} kg</b></div>
      <div class="trade-chip">Ops Budget <b>$${startBudget}M</b></div>
      <div class="trade-chip">Base Power <b>+${scen.startPower}W</b></div>
      <div class="trade-chip">Base Fuel <b>${scen.startFuel}%</b></div>
    </div>

    <div class="modal-actions">
      <button id="btn-open-guide-modal" class="btn-secondary" type="button">Field Guide</button>
      <button id="btn-start-mission" class="btn-play" type="button">Start Mission</button>
    </div>
  `;

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
