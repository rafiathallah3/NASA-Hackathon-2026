import { LOGICAL_W, LOGICAL_H, RECIPES, SCIENCE_OBJECTIVES } from './config.js';
import { state, resetRunState, auditScienceBaselineRequirements, logBlackBox } from './state.js';
import { preloadAllAssets } from './assets.js';
import { playTone, startBackgroundMusic, syncMusicMute, setMusicDuck } from './audio.js';
import {
  broadcastNet,
  registerNetStageHandler,
  onNetEvent,
  isWsMultiplayer,
  isWsHost,
  isWsGuest,
  getMyWsSlot,
  sendGuestAction,
  broadcastHostEvent,
  syncSquadBarRemoteIndicators,
  netState,
  leaveRoom
} from './net.js';
import {
  setGuestKeys,
  clearGuestInputs,
  resetSyncTracking,
  maybeSendGuestInputs,
  maybeBroadcastHostSnapshot,
  applyHostSnapshot
} from './sync.js';
import {
  selectActiveCrew, cycleCoopMode, showMenuModal, renderTicketsHUD, updateTicketBarsOnly,
  updateBottomHUD, updateClockHUD, syncPauseUI, syncCoopButtonHUD, refreshMenuLobbyIfOpen,
  showMissionToast, hideMissionToast,
  startUiTour, advanceUiTour, skipUiTour, isUiTourActive,
  isBlueprintOpen, toggleBlueprint, closeBlueprint
} from './hud.js';
import { startTransition, skipTransition, updateTransition, drawTransition } from './transitions.js';
import { initStage1, buildStage1Map, handleStage1Interact, handleStage1Dash, handleStage1Throw, handleStage1CanvasClick, skipStage1Tutorial, updateStage1GuestLocal, updateStage1, drawStage1 } from './stages/stage1.js';
import { startStage1B, handleStage1BSeparation, updateStage1B, drawStage1B } from './stages/stage1b.js';
import { startStage2, handleStage2Interact, handleStage2CanvasClick, toggleBreaker, completeRemoteConsoleTask, updateStage2GuestLocal, updateStage2, drawStage2 } from './stages/stage2.js';
import {
  startStage3A, handleStage3AContinue, updateStage3A, drawStage3A,
  startStage3B, handleStage3BInteract, getRoverForSlot, updateStage3BCameraLocal, updateStage3BGuestLocal, updateStage3B, drawStage3B,
  startStage3CMoonLaunch, handleStage3CTEIBurn, updateStage3C, drawStage3C
} from './stages/stage3.js';
import { startStage4EarthReturn, handleStage4DeployChutes, handleStage4CoolantPurge, updateStage4, drawStage4 } from './stages/stage4.js';
import { startStage5Debrief } from './stages/stage5.js';
import { createPixelRenderer } from './pixel.js';
import { hydrateIcons, iconHtml, iconize } from './icons.js';

const canvas = document.getElementById('game');
// All stage drawing goes through the pixel renderer: `ctx` is its 560x310 buffer
// addressed in logical 1120x620 units (see src/pixel.js).
const pixelRenderer = createPixelRenderer(canvas);
const ctx = pixelRenderer.ctx;
window.__orbitalPixelStats = pixelRenderer.stats;
let booted = false;

function resizeCanvas() {
  const wrap = document.getElementById('game-wrap');
  // Leave room for the pixel bezel drawn around the canvas.
  const maxW = wrap.clientWidth - 28;
  const maxH = wrap.clientHeight - 22;
  const scale = Math.max(0.3, Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H));
  const w = Math.floor(LOGICAL_W * scale);
  const h = Math.floor(LOGICAL_H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  // Backing store matches the on-screen size so the 2x pixel blit lands on device pixels.
  pixelRenderer.resize(w * dpr, h * dpr);
  if (booted && (state.stage === 'MENU' || state.stage === 'STAGE5' || state.paused)) draw();
}

new ResizeObserver(resizeCanvas).observe(document.getElementById('game-wrap'));
window.addEventListener('resize', resizeCanvas);

let rafRunning = false;
function ensureLoopRunning() {
  state.lastTime = performance.now();
  if (!rafRunning) {
    rafRunning = true;
    requestAnimationFrame(loop);
  }
}

export function setPaused(paused, fromNet = false) {
  if (!fromNet && isWsGuest()) {
    showMissionToast('Host Controls Pause', 'Only the Room Host can pause an online co-op session.');
    return;
  }
  const canPause = state.stage !== 'MENU' && state.stage !== 'STAGE5';
  const target = Boolean(paused) && canPause;
  state.paused = target;
  if (target) {
    for (const k of Object.keys(state.keys)) state.keys[k] = false;
  }
  syncPauseUI();
  updateClockHUD();
  if (!fromNet && isWsHost()) {
    maybeBroadcastHostSnapshot(performance.now(), true);
  }
}

export function togglePause() {
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return false;
  if (isWsGuest()) {
    showMissionToast('Host Controls Pause', 'Only the Room Host can pause an online co-op session.');
    return false;
  }
  const mainModal = document.getElementById('modal');
  if (!state.paused && ((mainModal && !mainModal.classList.contains('hidden')) || state.dilemma)) {
    return false;
  }
  setPaused(!state.paused);
  return state.paused;
}

function goToDebrief(fromNet = false) {
  setPaused(false, true);
  closeBlueprint();
  hideMissionToast();
  if (!fromNet && isWsHost()) {
    broadcastHostEvent('STAGE5_DEBRIEF', {
      score: state.score,
      shippedCount: state.shippedCount,
      shippedModules: state.shippedModules,
      currentCML: state.currentCML,
      scienceAuditPassed: state.scienceAuditPassed,
      sampleCollected: state.sampleCollected,
      samplesCollectedCount: state.samplesCollectedCount,
      sampleYieldText: state.sampleYieldText,
      landingGrade: state.landingGrade,
      telemetry: state.telemetry,
      missionChoices: state.missionChoices,
      blackBoxEvents: state.blackBoxEvents
    });
  }
  startStage5Debrief(() => startGame(false), openMenu);
  draw();
}

function toStage1B() {
  hideMissionToast();
  startTransition({
    kind: 'HANGAR_ROLLOUT',
    badge: 'LAUNCH COMPLEX 39B',
    title: 'PAYLOAD FAIRING SEALED & PAD ROLLOUT',
    subtitle: 'Transferring spacecraft telemetry to launch control...',
    nextStage: 'STAGE 1B: ROCKET LIFTOFF',
    duration: 4.8,
    onComplete: startStage1B
  });
}

function toStage2() {
  hideMissionToast();
  startTransition({
    kind: 'ORBITAL_INSERTION',
    badge: 'ORBITAL INSERTION BURN',
    title: 'ENTERING TRANSLUNAR CRUISE DECK',
    subtitle: 'Pressurizing Orion / Gateway mission control consoles...',
    nextStage: 'STAGE 2: ORBITAL MISSION CONTROL',
    duration: 4.8,
    onComplete: startStage2
  });
}

function toStage3A() {
  hideMissionToast();
  const objLoc = (SCIENCE_OBJECTIVES?.[state.selectedObjective]?.targetLocation || 'SHACKLETON RIM').toUpperCase();
  startTransition({
    kind: 'LUNAR_UNDOCK',
    badge: 'LUNAR ORBIT RENDEZVOUS',
    title: `HLS LANDER UNDOCKING OVER ${objLoc}`,
    subtitle: 'Igniting descent engines for Point A landing pad approach...',
    nextStage: 'STAGE 3A: LUNAR DESCENT LANDING',
    duration: 4.8,
    onComplete: startStage3A
  });
}

function toStage3B() {
  hideMissionToast();
  startTransition({
    kind: 'ROVER_DEPLOY',
    badge: 'SURFACE OPERATIONS',
    title: 'DEPLOYING DUAL LTV LUNAR ROVERS',
    subtitle: 'Point A secured. Drive to Point B Crater, Seismic Array, and Relay Dish.',
    nextStage: 'STAGE 3B: MOON ROVER EVA',
    duration: 4.8,
    onComplete: startStage3B
  });
}

function toStage3C() {
  hideMissionToast();
  startTransition({
    kind: 'LUNAR_UNDOCK',
    badge: 'LUNAR LIFTOFF PREP',
    title: 'SAMPLES STOWED IN ASCENT CAPSULE',
    subtitle: 'Separating from descent base for orbital return burn...',
    nextStage: 'STAGE 3C: LUNAR ASCENT & TEI',
    duration: 4.5,
    onComplete: startStage3CMoonLaunch
  });
}

function toStage4() {
  hideMissionToast();
  startTransition({
    kind: 'ENTRY_INTERFACE',
    badge: 'EARTH ENTRY INTERFACE',
    title: 'SKIP-REENTRY CORRIDOR OVER PACIFIC OCEAN',
    subtitle: 'Roll capsule to cool heatshield & align with Carrier USS Midway!',
    nextStage: 'STAGE 4: EARTH REENTRY & SPLASHDOWN',
    duration: 5.0,
    onComplete: startStage4EarthReturn
  });
}

function openScienceAuditModal(audit) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) {
    toStage1B();
    return;
  }

  const obj = SCIENCE_OBJECTIVES?.[state.selectedObjective] || {};
  const missingTitles = (audit.missing || []).map(id => {
    const rec = RECIPES.find(r => r.id === id);
    return rec ? rec.title : id;
  });

  content.innerHTML = `
    <div class="cml-review-header">
      <span class="cml-warn-badge">NASA SYSTEMS REVIEW: CML-3 TRADE STUDY</span>
    </div>
    <h1>Baseline Science Requirements Incomplete</h1>
    <p class="sub">
      Selected goal <b>${obj.title || 'Lunar Science'}</b> requires all baseline payload modules for CML-4 Point Design sign-off.
    </p>
    <div class="config-panel" style="margin-bottom:16px;">
      <h3>Missing Mandatory Module${missingTitles.length === 1 ? '' : 's'}</h3>
      <ul class="audit-missing-list">
        ${missingTitles.map(title => `<li>${title}</li>`).join('')}
      </ul>
      ${obj.failurePenalty ? `<p class="audit-penalty-note">${obj.failurePenalty}</p>` : ''}
    </div>
    <div class="modal-actions">
      <button id="btn-audit-return" class="btn-secondary" type="button">Return to Hangar</button>
      <button id="btn-audit-proceed" class="btn-play" type="button">Launch with Science Penalty</button>
    </div>
  `;

  document.getElementById('btn-audit-return').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  document.getElementById('btn-audit-proceed').addEventListener('click', () => {
    logBlackBox(
      'STAGE 1A',
      `CML-3 Systems Review override for ${obj.title || state.selectedObjective}: launched without ${missingTitles.join(', ')}.`,
      'warn'
    );
    modal.classList.add('hidden');
    if (state.coopMode === 'NET_4P') {
      broadcastNet({ type: 'STAGE_SYNC', action: 'ADVANCE', fromStage: state.stage });
    }
    toStage1B();
    if (isWsHost()) {
      maybeBroadcastHostSnapshot(performance.now(), true);
    }
  });

  modal.classList.remove('hidden');
}

function openMinBuildModal(builtCount) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  const remaining = Math.max(1, 2 - builtCount);
  const obj = SCIENCE_OBJECTIVES?.[state.selectedObjective] || {};
  const reqTitles = (obj.requiredModules || []).map(id => {
    const rec = RECIPES.find(r => r.id === id);
    const done = (state.shippedModules?.[id] || 0) > 0;
    return `<li>${iconHtml(done ? 'checkbox' : 'square')} ${rec ? rec.title : id}</li>`;
  });

  content.innerHTML = `
    <div class="cml-review-header">
      <span class="cml-warn-badge">HANGAR INTEGRATION GATE: ${builtCount}/2 BUILT</span>
    </div>
    <h1>Build at Least 2 Rocket Modules</h1>
    <p class="sub">
      Fairing integration requires <b>${remaining} more completed module${remaining === 1 ? '' : 's'}</b> before Stage 1B liftoff.
      Aim for your Science Goal <b>REQ</b> payloads to unlock <b>LAUNCH READY</b>!
    </p>
    <div class="config-panel" style="margin-bottom:16px;">
      <h3>${obj.title || 'Science Goal'} Payloads</h3>
      <ul class="audit-missing-list">
        ${reqTitles.join('')}
      </ul>
    </div>
    <div class="modal-actions">
      <button id="btn-minbuild-return" class="btn-play" type="button">Return to Hangar</button>
    </div>
  `;

  const retBtn = document.getElementById('btn-minbuild-return');
  retBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.classList.remove('hidden');
  retBtn?.focus();
}

function advanceStageManual(fromNet = false) {
  if (isUiTourActive()) return;
  if (!fromNet && isWsGuest()) {
    showMissionToast('Host Controls Stage', 'Only the Room Host can advance stages in online co-op.');
    return;
  }
  setPaused(false, fromNet);
  if (state.stage === 'STAGE1') {
    const built = state.shippedCount || 0;
    if (!fromNet && built < 2) {
      const rem = 2 - built;
      showMissionToast(
        `Need ${rem} More Module${rem === 1 ? '' : 's'}`,
        `Build at least 2 modules in the Hangar before liftoff (${built}/2 built).`
      );
      openMinBuildModal(built);
      return;
    }
    const audit = auditScienceBaselineRequirements();
    if (!fromNet && !audit.passed) {
      openScienceAuditModal(audit);
      return;
    }
    if (audit.passed) {
      logBlackBox('STAGE 1A', audit.auditText || 'CML-4 Point Design verified for baseline science requirements.', 'good');
    }
  }
  if (state.dilemma) {
    state.dilemma = null;
    state.dilemmaMeta = null;
    if (isWsHost()) broadcastHostEvent('DILEMMA_RESOLVED', {});
  }
  const modalEl = document.getElementById('modal');
  if (modalEl && !modalEl.classList.contains('hidden')) {
    modalEl.classList.add('hidden');
  }
  if (!fromNet && state.coopMode === 'NET_4P') {
    broadcastNet({ type: 'STAGE_SYNC', action: 'ADVANCE', fromStage: state.stage });
  }
  if (state.stage === 'TRANSITION') skipTransition();
  else if (state.stage === 'STAGE1') toStage1B();
  else if (state.stage === 'STAGE1B') toStage2();
  else if (state.stage === 'STAGE2') toStage3A();
  else if (state.stage === 'STAGE3A') toStage3B();
  else if (state.stage === 'STAGE3B') toStage3C();
  else if (state.stage === 'STAGE3C') toStage4();
  else if (state.stage === 'STAGE4') goToDebrief(fromNet);
  if (!fromNet && isWsHost()) {
    maybeBroadcastHostSnapshot(performance.now(), true);
  }
}

function syncMusicDuckState() {
  const modalOpen = !document.getElementById('modal')?.classList.contains('hidden');
  const guideOpen = !document.getElementById('guide-modal')?.classList.contains('hidden');
  const tutPaused = state.stage === 'STAGE1' && Boolean(state.tutorial?.active && state.tutorial?.paused);
  setMusicDuck(Boolean(state.paused || modalOpen || guideOpen || isUiTourActive() || tutPaused || state.dilemma));
}

function runStage1GuidedTour() {
  for (const k of Object.keys(state.keys)) state.keys[k] = false;
  draw();
  startUiTour(({ skipped } = {}) => {
    state.tutorial = {
      active: true,
      step: 0,
      paused: !skipped,
      skipped: false,
      startShipped: state.shippedCount || 0
    };
    playTone(580, 'sine', 0.08, 0.07);
  });
}

function startGame(fromNet = false) {
  if (!fromNet && isWsGuest()) {
    showMissionToast('Waiting for Host', 'The Room Host starts and restarts missions in online co-op.');
    return;
  }
  hideMissionToast();
  closeBlueprint();
  document.getElementById('modal').classList.add('hidden');
  startBackgroundMusic();
  resetSyncTracking();
  clearGuestInputs();
  resetRunState();

  if (isWsMultiplayer()) {
    state.coopMode = 'WS_4P';
    const mySlot = getMyWsSlot();
    if (typeof mySlot === 'number' && mySlot >= 0 && mySlot < 4) {
      state.activeCrewIndex = mySlot;
    }
    state.tutorial = {
      active: false,
      step: 5,
      paused: false,
      skipped: true,
      startShipped: 0
    };
  }

  initStage1();
  syncPauseUI();
  syncCoopButtonHUD();
  syncSquadBarRemoteIndicators();

  if (!fromNet && state.coopMode === 'NET_4P') {
    broadcastNet({
      type: 'STAGE_SYNC',
      action: 'START',
      scenario: state.selectedScenario,
      vehicle: state.selectedVehicle,
      objective: state.selectedObjective
    });
  }
  if (!fromNet && isWsHost()) {
    broadcastHostEvent('START_MISSION', {
      scenario: state.selectedScenario,
      vehicle: state.selectedVehicle,
      objective: state.selectedObjective
    });
    maybeBroadcastHostSnapshot(performance.now(), true);
  }
  if (!fromNet && !isWsMultiplayer() && !state.tutorial?.skipped) {
    runStage1GuidedTour();
  }
  ensureLoopRunning();
}

function openMenu() {
  state.stage = 'MENU';
  setPaused(false, true);
  closeBlueprint();
  buildStage1Map();
  updateClockHUD();
  syncCoopButtonHUD();
  syncSquadBarRemoteIndicators();
  draw();
  showMenuModal(() => startGame(false));
}

function showGuestWaitingModal(badge, title, bodyHtml) {
  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (!modal || !mc) return;
  mc.innerHTML = iconize(`
    <div class="dilemma-badge">${badge}</div>
    <h2 style="margin:0 0 8px;">${title}</h2>
    <p class="sub" style="margin-bottom:16px;">${bodyHtml}</p>
    <div class="modal-actions">
      <button id="btn-guest-leave-wait" class="btn-secondary" type="button">Leave Room</button>
    </div>
  `);
  modal.classList.remove('hidden');
  document.getElementById('btn-guest-leave-wait')?.addEventListener('click', () => {
    leaveRoom();
    modal.classList.add('hidden');
    resetRunState();
    openMenu();
  });
}

function syncGuestStageFromSnapshot(targetStage, snap) {
  const modal = document.getElementById('modal');
  if (modal && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
  closeBlueprint();
  hideMissionToast();
  if (targetStage === 'TRANSITION') {
    startTransition({
      kind: snap?.transition?.kind || 'HANGAR_ROLLOUT',
      badge: snap?.transition?.badge || 'STAGE TRANSITION',
      title: snap?.transition?.title || 'TRANSFERRING TELEMETRY',
      subtitle: snap?.transition?.subtitle || 'Synchronizing with Host...',
      nextStage: snap?.transition?.nextStage || '',
      duration: snap?.transition?.duration || 4.8,
      onComplete: () => {}
    });
  } else if (targetStage === 'STAGE1') {
    if (!state.stations || state.stations.length === 0) buildStage1Map();
    initStage1();
  } else if (targetStage === 'STAGE1B') {
    startStage1B();
  } else if (targetStage === 'STAGE2') {
    startStage2();
  } else if (targetStage === 'STAGE3A') {
    startStage3A();
  } else if (targetStage === 'STAGE3B') {
    startStage3B();
  } else if (targetStage === 'STAGE3C') {
    startStage3CMoonLaunch();
  } else if (targetStage === 'STAGE4') {
    startStage4EarthReturn();
  }
  ensureLoopRunning();
}

onNetEvent('roomUpdate', () => {
  if (isWsMultiplayer()) {
    state.coopMode = 'WS_4P';
    const mySlot = getMyWsSlot();
    if (typeof mySlot === 'number' && mySlot >= 0 && mySlot < 4) {
      state.activeCrewIndex = mySlot;
    }
  } else if (state.coopMode === 'WS_4P') {
    state.coopMode = '4P_AI';
    if (state.stage !== 'MENU' && state.stage !== 'STAGE5') {
      showMissionToast('Relay Disconnected', 'Switched to local 4P AI bots so your run can continue.');
    }
  }
  syncCoopButtonHUD();
  syncSquadBarRemoteIndicators();
  refreshMenuLobbyIfOpen();
});

onNetEvent('peerLeft', (msg) => {
  if (!msg) return;
  if (typeof msg.slot === 'number') {
    clearGuestInputs(msg.slot);
  }
  if (state.stage !== 'MENU' && state.stage !== 'STAGE5' && typeof msg.slot === 'number') {
    showMissionToast('Crew Left Room', `${msg.name || 'Crewmate'} left — AI squadmate took over P${msg.slot + 1}.`);
  }
  if (msg.migrated && isWsHost()) {
    resetSyncTracking();
    showMissionToast('You Are Now Host', 'Previous Host disconnected. Authoritative simulation migrated to you.');
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden') && state.stage !== 'MENU') {
      modal.classList.add('hidden');
      state.dilemma = null;
    }
    if (state.stage !== 'MENU' && state.stage !== 'STAGE5') {
      maybeBroadcastHostSnapshot(performance.now(), true);
    }
  }
});

onNetEvent('guestInput', (msg) => {
  if (!isWsHost() || !msg) return;
  setGuestKeys(msg.slot, msg.keys);
});

onNetEvent('guestAction', (msg) => {
  if (!isWsHost() || !msg) return;
  const slot = Number(msg.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return;
  if (state.paused || state.dilemma) return;

  switch (msg.action) {
    case 'STAGE1_INTERACT':
      if (state.stage === 'STAGE1' && state.players[slot]) handleStage1Interact(state.players[slot]);
      break;
    case 'STAGE1_DASH':
      if (state.stage === 'STAGE1' && state.players[slot]) handleStage1Dash(state.players[slot]);
      break;
    case 'STAGE1_THROW':
      if (state.stage === 'STAGE1' && state.players[slot]) handleStage1Throw(state.players[slot]);
      break;
    case 'STAGE1B_SEPARATE':
      if (state.stage === 'STAGE1B') handleStage1BSeparation();
      break;
    case 'STAGE2_INTERACT':
      if (state.stage === 'STAGE2' && state.ctrlPlayers[slot]) handleStage2Interact(state.ctrlPlayers[slot], true);
      break;
    case 'STAGE2_COMPLETE_CONSOLE':
      if (state.stage === 'STAGE2') completeRemoteConsoleTask(slot, msg.payload || msg);
      break;
    case 'STAGE3A_CONTINUE':
      if (state.stage === 'STAGE3A' && state.lander?.landed && !state.lander?.crashed) handleStage3AContinue(toStage3B);
      break;
    case 'STAGE3B_INTERACT':
      if (state.stage === 'STAGE3B') handleStage3BInteract(getRoverForSlot(slot), toStage3C);
      break;
    case 'STAGE3C_TEI':
      if (state.stage === 'STAGE3C') handleStage3CTEIBurn();
      break;
    case 'STAGE4_CHUTES':
      if (state.stage === 'STAGE4') handleStage4DeployChutes();
      break;
    case 'STAGE4_COOLANT':
      if (state.stage === 'STAGE4') handleStage4CoolantPurge();
      break;
    default:
      break;
  }
});

onNetEvent('hostEvent', (msg) => {
  if (!isWsGuest() || !msg) return;
  const p = msg.payload || msg;
  if (msg.event === 'START_MISSION') {
    if (p.scenario) state.selectedScenario = p.scenario;
    if (p.vehicle) state.selectedVehicle = p.vehicle;
    if (p.objective) state.selectedObjective = p.objective;
    startGame(true);
  } else if (msg.event === 'STAGE5_DEBRIEF') {
    if (typeof p.score === 'number') state.score = p.score;
    if (typeof p.shippedCount === 'number') state.shippedCount = p.shippedCount;
    if (p.shippedModules) state.shippedModules = { ...p.shippedModules };
    if (p.currentCML) state.currentCML = p.currentCML;
    if (typeof p.scienceAuditPassed === 'boolean') state.scienceAuditPassed = p.scienceAuditPassed;
    if (typeof p.sampleCollected === 'boolean') state.sampleCollected = p.sampleCollected;
    if (typeof p.samplesCollectedCount === 'number') state.samplesCollectedCount = p.samplesCollectedCount;
    if (typeof p.sampleYieldText === 'string') state.sampleYieldText = p.sampleYieldText;
    if (p.landingGrade) state.landingGrade = p.landingGrade;
    if (p.telemetry) state.telemetry = { ...p.telemetry };
    if (p.missionChoices) state.missionChoices = { ...p.missionChoices };
    if (Array.isArray(p.blackBoxEvents)) state.blackBoxEvents = [...p.blackBoxEvents];
    goToDebrief(true);
  } else if (msg.event === 'DILEMMA_OPEN') {
    showGuestWaitingModal(
      p.badge || 'SYSTEMS DECISION',
      p.title || 'Host Evaluating Mission Tradeoff',
      `${p.prompt || 'Mission director is resolving a contingency dilemma.'}<br><br>Waiting for Host (${netState.slots[0]?.name || 'Commander'}) to lock choice...`
    );
  } else if (msg.event === 'DILEMMA_RESOLVED') {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    state.dilemma = null;
    if (p.label) showMissionToast('Decision Locked', p.label);
  } else if (msg.event === 'STAGE_ABORT') {
    showGuestWaitingModal(
      `${p.stage || 'MISSION'} ABORT`,
      p.title || 'Mission Abort Triggered',
      `${p.reason || 'Anomaly exceeded safety limits.'}<br><br>Waiting for Room Host to retry or return to hangar...`
    );
  }
});

onNetEvent('snapshot', (msg) => {
  if (!isWsGuest() || !msg?.snapshot) return;
  let prevShipped = state.shippedCount;
  applyHostSnapshot(msg.snapshot, {
    onStageMismatch: syncGuestStageFromSnapshot,
    onOrdersChanged: () => {
      if (state.stage === 'STAGE1') renderTicketsHUD();
    },
    onOrdersTick: () => {
      if (state.stage === 'STAGE1') updateTicketBarsOnly();
    },
    onAfterApply: () => {
      if (state.stage === 'STAGE1' && state.shippedCount !== prevShipped) {
        renderTicketsHUD();
      }
      const modal = document.getElementById('modal');
      if (state.dilemma && modal && modal.classList.contains('hidden')) {
        const dm = state.dilemmaMeta || {};
        showGuestWaitingModal(
          dm.badge || 'SYSTEMS DECISION',
          dm.title || 'Host Evaluating Mission Tradeoff',
          `${dm.prompt || 'Mission director is resolving a contingency dilemma.'}<br><br>Waiting for Host (${netState.slots[0]?.name || 'Commander'}) to lock choice...`
        );
      } else if (!state.dilemma && state.stage !== 'MENU' && state.stage !== 'STAGE5') {
        const isWaitingModal = Boolean(document.getElementById('btn-guest-leave-wait'));
        const isAborted =
          (state.stage === 'STAGE1B' && state.ascent?.aborted) ||
          (state.stage === 'STAGE3A' && state.lander?.crashed) ||
          (state.stage === 'STAGE4' && state.reentry?.aborted);
        if (modal && !modal.classList.contains('hidden') && isWaitingModal && !isAborted) {
          modal.classList.add('hidden');
        }
      }
      syncPauseUI();
      updateClockHUD();
      updateBottomHUD();
    }
  });
});

registerNetStageHandler((msg) => {
  if (state.coopMode !== 'NET_4P') return;
  if (msg.action === 'START') {
    if (msg.scenario) state.selectedScenario = msg.scenario;
    if (msg.vehicle) state.selectedVehicle = msg.vehicle;
    if (msg.objective) state.selectedObjective = msg.objective;
    startGame(true);
  } else if (msg.action === 'ADVANCE' && msg.fromStage === state.stage) {
    advanceStageManual(true);
  }
});

// HUD & Modal Button Listeners
document.querySelectorAll('.p-chip').forEach(chip => {
  chip.addEventListener('click', () => selectActiveCrew(Number(chip.dataset.slot)));
});

document.getElementById('btn-coop').addEventListener('click', cycleCoopMode);
document.getElementById('btn-skip').addEventListener('click', () => advanceStageManual(false));
document.getElementById('btn-next').addEventListener('click', () => advanceStageManual(false));

document.getElementById('btn-blueprint')?.addEventListener('click', () => {
  const opened = toggleBlueprint();
  playTone(opened ? 620 : 440, 'sine', 0.05, 0.05);
});
document.getElementById('btn-close-blueprint')?.addEventListener('click', () => {
  closeBlueprint();
  playTone(440, 'sine', 0.05, 0.05);
});

document.getElementById('btn-guide').addEventListener('click', () => {
  document.getElementById('guide-modal').classList.remove('hidden');
});
document.getElementById('btn-close-guide').addEventListener('click', () => {
  document.getElementById('guide-modal').classList.add('hidden');
});
const replayGuideBtn = document.getElementById('btn-replay-guide');
if (replayGuideBtn) {
  replayGuideBtn.addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('hidden');
    document.getElementById('modal')?.classList.add('hidden');
    closeBlueprint();
    startBackgroundMusic();
    if (state.stage === 'STAGE1') {
      setPaused(false);
      state.pinnedRecipeId = 'sensor_pod';
      state.tutorial = { active: true, step: 0, paused: true, skipped: false, startShipped: state.shippedCount || 0 };
      renderTicketsHUD();
      runStage1GuidedTour();
    } else {
      const wasStopped = state.stage === 'MENU' || state.stage === 'STAGE5';
      resetRunState();
      state.pinnedRecipeId = 'sensor_pod';
      initStage1();
      setPaused(false);
      state.tutorial = { active: true, step: 0, paused: true, skipped: false, startShipped: 0 };
      renderTicketsHUD();
      runStage1GuidedTour();
      if (wasStopped) {
        state.lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    }
  });
}

document.getElementById('btn-mute').addEventListener('click', (e) => {
  state.muted = !state.muted;
  e.currentTarget.innerHTML = iconHtml(state.muted ? 'mute' : 'sound');
  syncMusicMute();
});

document.getElementById('btn-pause')?.addEventListener('click', () => {
  togglePause();
});
document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
  setPaused(false);
});
document.getElementById('btn-pause-guide')?.addEventListener('click', () => {
  document.getElementById('guide-modal')?.classList.remove('hidden');
});
document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
  setPaused(false, true);
  hideMissionToast();
  if (isWsMultiplayer()) leaveRoom();
  resetRunState();
  openMenu();
});

canvas.addEventListener('click', (e) => {
  if (state.paused || isUiTourActive()) return;
  if (state.stage === 'TRANSITION') {
    if (isWsGuest()) return;
    skipTransition();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const lx = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
  const ly = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;
  if (state.stage === 'STAGE1') {
    if (isWsGuest()) return;
    handleStage1CanvasClick(lx, ly);
    return;
  }
  if (state.stage === 'STAGE2') {
    handleStage2CanvasClick(lx, ly);
    return;
  }
  if (state.stage === 'STAGE3A') {
    if (isWsGuest()) {
      if (state.lander?.landed && !state.lander?.crashed) sendGuestAction('STAGE3A_CONTINUE');
      return;
    }
    handleStage3AContinue(toStage3B);
  }
});

window.addEventListener('blur', () => {
  for (const k of Object.keys(state.keys)) state.keys[k] = false;
});

// Keyboard Controls
window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(e.target?.isContentEditable);
  if (isTyping) {
    if (e.code === 'Escape') e.target.blur?.();
    return;
  }

  if (state.stage !== 'MENU') {
    startBackgroundMusic();
  }

  // Corner UI Spotlight Tour intercepts keys cleanly (movement keys blocked)
  if (isUiTourActive()) {
    if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === 'Space' || e.code === 'Enter') {
        advanceUiTour();
        playTone(540, 'sine', 0.06, 0.06);
      } else if (e.code === 'Tab' || e.code === 'Escape') {
        skipUiTour();
      }
    }
    return;
  }

  if (e.code === 'Escape') {
    if (!e.repeat) {
      const guideModal = document.getElementById('guide-modal');
      const mainModal = document.getElementById('modal');
      if (guideModal && !guideModal.classList.contains('hidden')) {
        guideModal.classList.add('hidden');
      } else if (state.paused) {
        setPaused(false);
      } else if (state.stage === 'STAGE1' && mainModal && !mainModal.classList.contains('hidden')) {
        mainModal.classList.add('hidden');
      } else if (isBlueprintOpen()) {
        closeBlueprint();
      } else if (state.stage === 'STAGE2' && state.activeMiniGame) {
        state.activeMiniGame = null;
      } else {
        togglePause();
      }
    }
    return;
  }

  if (state.paused) return;

  if (e.code === 'KeyB' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const guideOpen = !document.getElementById('guide-modal')?.classList.contains('hidden');
    const modalOpen = !document.getElementById('modal')?.classList.contains('hidden');
    if (!guideOpen && !modalOpen && !state.dilemma && state.stage !== 'MENU' && state.stage !== 'STAGE5') {
      e.preventDefault();
      const opened = toggleBlueprint();
      playTone(opened ? 620 : 440, 'sine', 0.05, 0.05);
    }
    return;
  }

  // Gameplay Tutorial paused gate: ONLY Space (unpauses to act), Enter (advances/unpauses), or Tab (skips)
  if (!isWsGuest() && state.stage === 'STAGE1' && state.tutorial?.active && state.tutorial?.paused) {
    if (['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === 'Space') {
        state.tutorial.paused = false;
        playTone(540, 'sine', 0.06, 0.06);
      } else if (e.code === 'Enter') {
        if ((state.tutorial.step || 0) < 4) {
          state.tutorial.step = (state.tutorial.step || 0) + 1;
          playTone(620 + state.tutorial.step * 45, 'sine', 0.08, 0.07);
        } else {
          state.tutorial.paused = false;
          playTone(540, 'sine', 0.06, 0.06);
        }
      } else if (e.code === 'Tab') {
        skipStage1Tutorial();
      }
    }
    return;
  }

  state.keys[e.code] = true;

  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && state.stage !== 'MENU' && state.stage !== 'STAGE5') {
    e.preventDefault();
  }

  const inWireMiniGame = state.stage === 'STAGE2' && state.activeMiniGame && state.activeMiniGame.type === 'WIRES';
  if (!e.repeat) {
    if (inWireMiniGame) {
      if (e.code === 'Digit1') toggleBreaker(0);
      if (e.code === 'Digit2') toggleBreaker(1);
      if (e.code === 'Digit3') toggleBreaker(2);
      if (e.code === 'Digit4') toggleBreaker(3);
    } else {
      if (e.code === 'Digit1') selectActiveCrew(0);
      if (e.code === 'Digit2') selectActiveCrew(1);
      if (e.code === 'Digit3') selectActiveCrew(2);
      if (e.code === 'Digit4') selectActiveCrew(3);
    }
  }

  const wsGuest = isWsGuest();
  const wsLive = isWsMultiplayer();

  if (e.code === 'ShiftLeft' && !e.repeat && state.stage === 'STAGE1') {
    handleStage1Dash(state.players[state.activeCrewIndex] || state.players[0]);
    if (wsGuest) sendGuestAction('STAGE1_DASH');
  }
  if ((e.code === 'KeyF' || e.code === 'KeyQ') && !e.repeat && state.stage === 'STAGE1') {
    if (wsGuest) sendGuestAction('STAGE1_THROW');
    else handleStage1Throw(state.players[state.activeCrewIndex] || state.players[0]);
  }
  if (e.code === 'KeyU' && !e.repeat && state.stage === 'STAGE1' && !wsLive && state.coopMode === 'LOCAL_2P') {
    handleStage1Throw(state.players[1]);
  }

  if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
    if (state.stage === 'TRANSITION') {
      if (!wsGuest) skipTransition();
    } else if (state.stage === 'STAGE1') {
      if (wsGuest) sendGuestAction('STAGE1_INTERACT');
      else handleStage1Interact(state.players[state.activeCrewIndex] || state.players[0]);
    } else if (state.stage === 'STAGE1B') {
      if (wsGuest) sendGuestAction('STAGE1B_SEPARATE');
      else handleStage1BSeparation();
    } else if (state.stage === 'STAGE2') {
      handleStage2Interact();
    } else if (state.stage === 'STAGE3A' && state.lander?.landed && !state.lander?.crashed) {
      if (wsGuest) sendGuestAction('STAGE3A_CONTINUE');
      else handleStage3AContinue(toStage3B);
    } else if (state.stage === 'STAGE3B') {
      if (wsGuest) sendGuestAction('STAGE3B_INTERACT');
      else handleStage3BInteract(wsLive ? getRoverForSlot() : state.rover, toStage3C);
    } else if (state.stage === 'STAGE3C') {
      if (wsGuest) sendGuestAction('STAGE3C_TEI');
      else handleStage3CTEIBurn();
    } else if (state.stage === 'STAGE4') {
      if (wsGuest) sendGuestAction('STAGE4_CHUTES');
      else handleStage4DeployChutes();
    }
  }

  if (e.code === 'Enter' && !e.repeat) {
    if (state.stage === 'TRANSITION') {
      if (!wsGuest) skipTransition();
    } else if (state.stage === 'STAGE1' && !wsLive) {
      handleStage1Interact(state.players[1]);
    } else if (state.stage === 'STAGE3A' && state.lander?.landed && !state.lander?.crashed) {
      if (wsGuest) sendGuestAction('STAGE3A_CONTINUE');
      else handleStage3AContinue(toStage3B);
    } else if (state.stage === 'STAGE3B') {
      if (wsGuest) sendGuestAction('STAGE3B_INTERACT');
      else if (!wsLive) handleStage3BInteract(state.rover2, toStage3C);
      else handleStage3BInteract(getRoverForSlot(), toStage3C);
    } else if (state.stage === 'STAGE4') {
      if (wsGuest) sendGuestAction('STAGE4_COOLANT');
      else handleStage4CoolantPurge();
    }
  }
  if (e.code === 'ShiftRight' && !e.repeat && state.stage === 'STAGE1' && !wsLive) {
    handleStage1Dash(state.players[1]);
  }

  if (!wsGuest && e.code === 'Tab' && state.stage === 'STAGE1' && state.tutorial?.active) {
    e.preventDefault();
    skipStage1Tutorial();
    return;
  }

  if (wsGuest) {
    maybeSendGuestInputs(performance.now());
  }
});

window.addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
  if (isWsGuest()) {
    maybeSendGuestInputs(performance.now());
  }
});

let guestHudAccum = 0;

function updateGuestLocal(dt) {
  if (state.stage === 'TRANSITION') {
    if (state.transition) state.transition.onComplete = null;
    updateTransition(dt);
    updateClockHUD();
    return;
  }

  const pausedAbort =
    (state.stage === 'STAGE1B' && state.ascent?.aborted) ||
    (state.stage === 'STAGE3A' && (state.lander?.landed || state.lander?.crashed)) ||
    (state.stage === 'STAGE4' && state.reentry?.aborted);
  if (state.stage !== 'STAGE1' && !pausedAbort) {
    state.stageTimer = Math.max(0, (state.stageTimer || 0) - dt);
  }
  updateClockHUD();

  if (state.stage === 'STAGE1') {
    updateStage1GuestLocal(dt);
  } else if (state.stage === 'STAGE1B' && state.ascent) {
    const a = state.ascent;
    const blend = Math.min(1, dt * 16);
    if (typeof a.netRocketY === 'number') {
      a.rocketY += (a.vy || 0) * dt * 0.25;
      a.rocketY += (a.netRocketY - a.rocketY) * blend;
    }
    if (typeof a.netTilt === 'number') a.tilt += (a.netTilt - a.tilt) * blend;
    if (typeof a.netThrust === 'number') a.thrust += (a.netThrust - a.thrust) * blend;
    if (typeof a.netTargetThrust === 'number') a.targetThrust += (a.netTargetThrust - a.targetThrust) * blend;
    if (typeof a.netProgress === 'number') a.progress += (a.netProgress - a.progress) * blend;
    if (typeof a.netAltitudeKm === 'number') a.altitudeKm += (a.netAltitudeKm - a.altitudeKm) * blend;
    if (typeof a.netVelKmh === 'number') a.velKmh += (a.netVelKmh - a.velKmh) * blend;
  } else if (state.stage === 'STAGE2') {
    updateStage2GuestLocal(dt);
  } else if (state.stage === 'STAGE3A' && state.lander) {
    const l = state.lander;
    if (!l.landed && !l.crashed) {
      l.x += (l.vx || 0) * dt * 0.35;
      l.y += (l.vy || 0) * dt * 0.35;
      l.z = Math.max(0, (l.z || 0) + (l.vz || 0) * dt * 0.35);
    }
    const blend = Math.min(1, dt * 16);
    if (typeof l.netX === 'number') l.x += (l.netX - l.x) * blend;
    if (typeof l.netY === 'number') l.y += (l.netY - l.y) * blend;
    if (typeof l.netZ === 'number') l.z += (l.netZ - l.z) * blend;
    const camTargetX = Math.max(0, Math.min(1800 - LOGICAL_W, l.x - LOGICAL_W / 2));
    const camTargetY = Math.max(0, Math.min(1200 - LOGICAL_H, l.y - LOGICAL_H / 2 - 40));
    state.lunarCam.x += (camTargetX - state.lunarCam.x) * Math.min(1, dt * 6);
    state.lunarCam.y += (camTargetY - state.lunarCam.y) * Math.min(1, dt * 6);
  } else if (state.stage === 'STAGE3B') {
    updateStage3BGuestLocal(dt);
  } else if (state.stage === 'STAGE3C' && state.moonLaunch) {
    const ml = state.moonLaunch;
    const blend = Math.min(1, dt * 16);
    ml.altitude += (ml.vy || 0) * dt * 0.3;
    ml.lateralX += (ml.vx || 0) * dt * 0.3;
    if (typeof ml.netAltitude === 'number') ml.altitude += (ml.netAltitude - ml.altitude) * blend;
    if (typeof ml.netLateralX === 'number') ml.lateralX += (ml.netLateralX - ml.lateralX) * blend;
    if (typeof ml.netTilt === 'number') ml.tilt += (ml.netTilt - ml.tilt) * blend;
    if (typeof ml.netProgress === 'number') ml.progress += (ml.netProgress - ml.progress) * blend;
  } else if (state.stage === 'STAGE4' && state.reentry) {
    const r = state.reentry;
    const blend = Math.min(1, dt * 16);
    r.wavePhase = (r.wavePhase || 0) + dt * 2.4;
    r.capsuleX += (r.capsuleVx || 0) * dt * 0.3;
    r.capsuleY += (r.capsuleVy || 0) * dt * 0.3;
    r.shipX += (r.shipVx || 0) * dt * 0.3;
    if (typeof r.netAltitudeKm === 'number') r.altitudeKm += (r.netAltitudeKm - r.altitudeKm) * blend;
    if (typeof r.netProgress === 'number') r.progress += (r.netProgress - r.progress) * blend;
    if (typeof r.netPitchAngle === 'number') r.pitchAngle += (r.netPitchAngle - r.pitchAngle) * blend;
    if (typeof r.netTargetAngle === 'number') r.targetAngle += (r.netTargetAngle - r.targetAngle) * blend;
    if (typeof r.netBandHalfWidth === 'number') r.bandHalfWidth += (r.netBandHalfWidth - r.bandHalfWidth) * blend;
    if (typeof r.netRollBank === 'number') r.rollBank += (r.netRollBank - r.rollBank) * blend;
    if (typeof r.netHeatShield === 'number') r.heatShield += (r.netHeatShield - r.heatShield) * blend;
    if (typeof r.netHeatFlux === 'number') r.heatFlux += (r.netHeatFlux - r.heatFlux) * blend;
    if (typeof r.netGLoad === 'number') r.gLoad += (r.netGLoad - r.gLoad) * blend;
    if (typeof r.netCapsuleX === 'number') r.capsuleX += (r.netCapsuleX - r.capsuleX) * blend;
    if (typeof r.netCapsuleY === 'number') r.capsuleY += (r.netCapsuleY - r.capsuleY) * blend;
    if (typeof r.netShipX === 'number') r.shipX += (r.netShipX - r.shipX) * blend;
  }

  for (let i = state.lunarParticles.length - 1; i >= 0; i--) {
    const pt = state.lunarParticles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.lunarParticles.splice(i, 1);
  }
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    state.floatingTexts[i].y -= dt * 30;
    state.floatingTexts[i].life -= dt;
    if (state.floatingTexts[i].life <= 0) state.floatingTexts.splice(i, 1);
  }
  guestHudAccum += dt;
  if (guestHudAccum >= 0.1) {
    guestHudAccum = 0;
    updateBottomHUD();
  }
}

function update(dt) {
  syncMusicDuckState();
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return;
  if (state.paused) return;
  if (isUiTourActive()) return;
  if (!document.getElementById('guide-modal').classList.contains('hidden')) return;
  if (!document.getElementById('modal').classList.contains('hidden')) return;
  if (state.dilemma) return;

  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - dt);
  }

  if (isWsGuest()) {
    updateGuestLocal(dt);
    return;
  }

  if (state.stage === 'TRANSITION') {
    updateTransition(dt);
    updateClockHUD();
    return;
  }

  const pausedAbort =
    (state.stage === 'STAGE1B' && state.ascent.aborted) ||
    (state.stage === 'STAGE3A' && (state.lander?.landed || state.lander?.crashed)) ||
    (state.stage === 'STAGE4' && state.reentry.aborted);
  if (state.stage !== 'STAGE1' && !pausedAbort) {
    state.stageTimer = Math.max(0, state.stageTimer - dt);
  }
  updateClockHUD();

  if (state.stage === 'STAGE1') updateStage1(dt);
  else if (state.stage === 'STAGE1B') updateStage1B(dt, toStage2, () => {
    resetRunState();
    if (isWsMultiplayer()) {
      state.coopMode = 'WS_4P';
      const s = getMyWsSlot();
      if (typeof s === 'number' && s >= 0 && s < 4) state.activeCrewIndex = s;
      state.tutorial = { active: false, step: 5, paused: false, skipped: true, startShipped: 0 };
    }
    initStage1();
    if (isWsHost()) {
      resetSyncTracking();
      clearGuestInputs();
      maybeBroadcastHostSnapshot(performance.now(), true);
    }
  });
  else if (state.stage === 'STAGE2') updateStage2(dt, toStage3A);
  else if (state.stage === 'STAGE3A') updateStage3A(dt, toStage3B, () => {
    if (isWsMultiplayer()) leaveRoom();
    resetRunState();
    openMenu();
  });
  else if (state.stage === 'STAGE3B') updateStage3B(dt, toStage3C);
  else if (state.stage === 'STAGE3C') updateStage3C(dt, toStage4);
  else if (state.stage === 'STAGE4') updateStage4(dt, goToDebrief, () => {
    if (isWsMultiplayer()) leaveRoom();
    resetRunState();
    openMenu();
  });

  for (let i = state.lunarParticles.length - 1; i >= 0; i--) {
    const pt = state.lunarParticles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.lunarParticles.splice(i, 1);
  }
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    state.floatingTexts[i].y -= dt * 30;
    state.floatingTexts[i].life -= dt;
    if (state.floatingTexts[i].life <= 0) state.floatingTexts.splice(i, 1);
  }
}

function draw() {
  pixelRenderer.beginFrame();
  drawScene();
  pixelRenderer.endFrame();
}

function drawScene() {
  if (state.stage === 'TRANSITION') {
    drawTransition(ctx);
    return;
  }
  ctx.save();
  if (state.screenShake > 0) {
    const mag = state.screenShake * 18;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }
  if (state.stage === 'MENU' || state.stage === 'STAGE1') drawStage1(ctx);
  else if (state.stage === 'STAGE1B') drawStage1B(ctx);
  else if (state.stage === 'STAGE2') drawStage2(ctx);
  else if (state.stage === 'STAGE3A') drawStage3A(ctx);
  else if (state.stage === 'STAGE3B') drawStage3B(ctx);
  else if (state.stage === 'STAGE3C') drawStage3C(ctx);
  else if (state.stage === 'STAGE4' || state.stage === 'STAGE5') drawStage4(ctx);

  for (const ft of state.floatingTexts) {
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle = ft.color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.font = 'bold 15px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function loop(now) {
  rafRunning = false;
  const elapsed = (now - state.lastTime) / 1000;
  if (elapsed > 0.001) {
    const dt = Math.min(0.05, elapsed);
    state.lastTime = now;
    update(dt);
    if (isWsGuest()) {
      maybeSendGuestInputs(now);
    } else if (isWsHost()) {
      maybeBroadcastHostSnapshot(now);
    }
  }
  draw();
  if (state.stage !== 'MENU' && state.stage !== 'STAGE5') {
    rafRunning = true;
    requestAnimationFrame(loop);
  }
}

// Keep Host simulation & snapshot broadcasts running at 60Hz even when the Host tab
// is unfocused, occluded, or in the background (where browsers throttle requestAnimationFrame).
function runBackgroundHostTick() {
  if (!isWsHost()) return;
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return;
  const now = performance.now();
  const elapsedMs = now - (state.lastTime || now);
  // Only step when requestAnimationFrame hasn't ticked recently (> 24ms)
  if (elapsedMs < 24) return;
  const dt = Math.min(0.05, elapsedMs / 1000);
  state.lastTime = now;
  update(dt);
  maybeBroadcastHostSnapshot(now);
}

function initBackgroundHostTicker() {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const blob = new Blob(
        ['setInterval(function(){postMessage(0);},16);'],
        { type: 'application/javascript' }
      );
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = runBackgroundHostTick;
      return;
    } catch {
      // Fall through to setInterval fallback
    }
  }
  setInterval(runBackgroundHostTick, 16);
}
initBackgroundHostTicker();

try {
  // Ticket thumbnails are cut from item sprites, so redraw tickets once those load.
  preloadAllAssets().then(() => {
    if (state.stage === 'STAGE1') renderTicketsHUD();
  });
  hydrateIcons();
  resizeCanvas();
  openMenu();
  updateBottomHUD();
  booted = true;
  window.__ORBITAL_BOOTED = true;
  // Canvas text only picks up the pixel font once it has loaded; redraw static screens then.
  document.fonts?.load?.('16px "Jersey 10"').then(() => {
    if (state.stage === 'MENU' || state.stage === 'STAGE5') draw();
  }).catch(() => {});
} catch (err) {
  console.error('Orbital Kitchen startup failed:', err);
  if (typeof window.__showOrbitalBootError === 'function') {
    window.__showOrbitalBootError(err?.message || String(err));
  }
}
