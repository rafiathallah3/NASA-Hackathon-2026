import { LOGICAL_W, LOGICAL_H, RECIPES, SCIENCE_OBJECTIVES } from './config.js';
import { state, resetRunState, auditScienceBaselineRequirements, logBlackBox } from './state.js';
import { preloadAllAssets } from './assets.js';
import { playTone, startBackgroundMusic, syncMusicMute, setMusicDuck } from './audio.js';
import { broadcastNet, registerNetStageHandler } from './net.js';
import {
  selectActiveCrew, cycleCoopMode, showMenuModal, showTitleScreen, hideTitleScreen,
  isTitleScreenActive, activateTitlePlay, renderTicketsHUD,
  updateBottomHUD, updateClockHUD, syncPauseUI, showMissionToast, hideMissionToast,
  startUiTour, advanceUiTour, skipUiTour, isUiTourActive,
  isBlueprintOpen, toggleBlueprint, closeBlueprint
} from './hud.js';
import { showLobbyScreen, hideLobbyScreen, isLobbyScreenActive } from './lobby-ui.js';
import { startTransition, skipTransition, updateTransition, drawTransition } from './transitions.js';
import { initStage1, buildStage1Map, handleStage1Interact, handleStage1Dash, handleStage1Throw, handleStage1CanvasClick, skipStage1Tutorial, updateStage1, drawStage1 } from './stages/stage1.js';
import { startStage1B, handleStage1BSeparation, updateStage1B, drawStage1B } from './stages/stage1b.js';
import { startStage2, handleStage2Interact, handleStage2CanvasClick, toggleBreaker, updateStage2, drawStage2 } from './stages/stage2.js';
import {
  startStage3A, handleStage3AContinue, updateStage3A, drawStage3A,
  startStage3B, handleStage3BInteract, updateStage3B, drawStage3B,
  startStage3CMoonLaunch, handleStage3CTEIBurn, updateStage3C, drawStage3C
} from './stages/stage3.js';
import { startStage4EarthReturn, handleStage4DeployChutes, handleStage4CoolantPurge, updateStage4, drawStage4 } from './stages/stage4.js';
import { startStage5Debrief } from './stages/stage5.js';
import { createPixelRenderer } from './pixel.js';
import { hydrateIcons, iconHtml } from './icons.js';

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

export function setPaused(paused) {
  const canPause = state.stage !== 'MENU' && state.stage !== 'STAGE5';
  const target = Boolean(paused) && canPause;
  state.paused = target;
  if (target) {
    for (const k of Object.keys(state.keys)) state.keys[k] = false;
  }
  syncPauseUI();
  updateClockHUD();
}

export function togglePause() {
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return false;
  const mainModal = document.getElementById('modal');
  if (!state.paused && ((mainModal && !mainModal.classList.contains('hidden')) || state.dilemma)) {
    return false;
  }
  setPaused(!state.paused);
  return state.paused;
}

function goToDebrief() {
  setPaused(false);
  closeBlueprint();
  hideMissionToast();
  startStage5Debrief(startGame, () => openMenu());
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
  setPaused(false);
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
  else if (state.stage === 'STAGE4') goToDebrief();
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
  hideMissionToast();
  closeBlueprint();
  clearPreGameScreens();
  document.getElementById('modal').classList.add('hidden');
  startBackgroundMusic();
  resetRunState();
  initStage1();
  syncPauseUI();
  if (!fromNet && state.coopMode === 'NET_4P') {
    broadcastNet({
      type: 'STAGE_SYNC',
      action: 'START',
      scenario: state.selectedScenario,
      vehicle: state.selectedVehicle,
      objective: state.selectedObjective
    });
  }
  if (!fromNet && !state.tutorial?.skipped) {
    runStage1GuidedTour();
  }
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

// Pre-game screen sequence. Each step shows one screen and calls `next()` to advance
// (`goTo(id)` jumps to another step, e.g. Leave -> title); running off the end launches the
// mission. Add future wireframe screens as new entries: no other code needs to change.
function playUiConfirmChime() {
  playTone(660, 'triangle', 0.07, 0.08);
  setTimeout(() => playTone(990, 'triangle', 0.12, 0.08), 70);
}

const PRE_GAME_STEPS = [
  {
    id: 'title',
    show: (next) => showTitleScreen(() => {
      // Runs inside the Play click / Enter / Space gesture, so audio unlocks cleanly.
      startBackgroundMusic();
      playUiConfirmChime();
      next();
    })
  },
  // Crew lobby: room code, crew list, astronaut customizer. Start commits `state.crew`.
  { id: 'lobby', show: (next, goTo) => showLobbyScreen({ onStart: next, onLeave: () => goTo('title') }) },
  { id: 'setup', show: (next) => showMenuModal(next) }
];

// Each screen tags #modal-content with its own class; drop them all before the next one renders.
function clearPreGameScreens() {
  hideTitleScreen();
  hideLobbyScreen();
}

function runPreGameFlow(fromId = PRE_GAME_STEPS[0].id) {
  const idx = Math.max(0, PRE_GAME_STEPS.findIndex(step => step.id === fromId));
  const following = PRE_GAME_STEPS[idx + 1];
  clearPreGameScreens();
  PRE_GAME_STEPS[idx].show(
    () => (following ? runPreGameFlow(following.id) : startGame(false)),
    (id) => runPreGameFlow(id)
  );
}

// `title: true` only on first boot; Pause / abort / Stage 5 menus jump straight to Mission Setup.
function openMenu({ title = false } = {}) {
  state.stage = 'MENU';
  setPaused(false);
  closeBlueprint();
  buildStage1Map();
  updateClockHUD();
  draw();
  runPreGameFlow(title ? 'title' : 'setup');
}

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
  setPaused(false);
  hideMissionToast();
  resetRunState();
  openMenu();
});

canvas.addEventListener('click', (e) => {
  if (state.paused || isUiTourActive()) return;
  if (state.stage === 'TRANSITION') {
    skipTransition();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const lx = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
  const ly = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;
  if (state.stage === 'STAGE1') {
    handleStage1CanvasClick(lx, ly);
    return;
  }
  if (state.stage === 'STAGE2') {
    handleStage2CanvasClick(lx, ly);
    return;
  }
  if (state.stage === 'STAGE3A') {
    handleStage3AContinue(toStage3B);
  }
});

// Keyboard Controls
window.addEventListener('keydown', (e) => {
  // Title screen owns the keyboard: Enter / Space = Play, everything else is ignored so the
  // same keypress can never reach gameplay handlers or the Mission Setup modal that follows.
  if (state.stage === 'MENU' && isTitleScreenActive()) {
    const guideOpen = !document.getElementById('guide-modal')?.classList.contains('hidden');
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !guideOpen && !isUiTourActive()) activateTitlePlay();
    }
    return;
  }

  // Lobby: typing / button focus keep their native behaviour. Nothing reaches gameplay, and a
  // held Enter / Space (auto-repeat from the title screen) cannot re-click a focused button.
  if (state.stage === 'MENU' && isLobbyScreenActive()) {
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space') && e.target?.tagName === 'BUTTON') {
      e.preventDefault();
    }
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
    const tag = e.target?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(e.target?.isContentEditable);
    const guideOpen = !document.getElementById('guide-modal')?.classList.contains('hidden');
    const modalOpen = !document.getElementById('modal')?.classList.contains('hidden');
    if (!isTyping && !guideOpen && !modalOpen && !state.dilemma && state.stage !== 'MENU' && state.stage !== 'STAGE5') {
      e.preventDefault();
      const opened = toggleBlueprint();
      playTone(opened ? 620 : 440, 'sine', 0.05, 0.05);
    }
    return;
  }

  // Gameplay Tutorial paused gate: ONLY Space (unpauses to act), Enter (advances/unpauses), or Tab (skips)
  if (state.stage === 'STAGE1' && state.tutorial?.active && state.tutorial?.paused) {
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

  if (e.code === 'ShiftLeft' && !e.repeat && state.stage === 'STAGE1') {
    handleStage1Dash(state.players[state.activeCrewIndex] || state.players[0]);
  }
  if ((e.code === 'KeyF' || e.code === 'KeyQ') && !e.repeat && state.stage === 'STAGE1') {
    handleStage1Throw(state.players[state.activeCrewIndex] || state.players[0]);
  }
  if (e.code === 'KeyU' && !e.repeat && state.stage === 'STAGE1' && state.coopMode === 'LOCAL_2P') {
    handleStage1Throw(state.players[1]);
  }

  if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
    if (state.stage === 'TRANSITION') {
      skipTransition();
    } else if (state.stage === 'STAGE1') {
      handleStage1Interact(state.players[state.activeCrewIndex] || state.players[0]);
    } else if (state.stage === 'STAGE1B') {
      handleStage1BSeparation();
    } else if (state.stage === 'STAGE2') {
      handleStage2Interact();
    } else if (state.stage === 'STAGE3A' && state.lander?.landed && !state.lander?.crashed) {
      handleStage3AContinue(toStage3B);
    } else if (state.stage === 'STAGE3B') {
      handleStage3BInteract(state.rover, toStage3C);
    } else if (state.stage === 'STAGE3C') {
      handleStage3CTEIBurn();
    } else if (state.stage === 'STAGE4') {
      handleStage4DeployChutes();
    }
  }

  if (e.code === 'Enter' && !e.repeat) {
    if (state.stage === 'TRANSITION') skipTransition();
    else if (state.stage === 'STAGE1') handleStage1Interact(state.players[1]);
    else if (state.stage === 'STAGE3A' && state.lander?.landed && !state.lander?.crashed) handleStage3AContinue(toStage3B);
    else if (state.stage === 'STAGE3B') handleStage3BInteract(state.rover2, toStage3C);
    else if (state.stage === 'STAGE4') handleStage4CoolantPurge();
  }
  if (e.code === 'ShiftRight' && !e.repeat && state.stage === 'STAGE1') {
    handleStage1Dash(state.players[1]);
  }

  if (e.code === 'Tab' && state.stage === 'STAGE1' && state.tutorial?.active) {
    e.preventDefault();
    skipStage1Tutorial();
    return;
  }
});

window.addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
});

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
    initStage1();
  });
  else if (state.stage === 'STAGE2') updateStage2(dt, toStage3A);
  else if (state.stage === 'STAGE3A') updateStage3A(dt, toStage3B, () => {
    resetRunState();
    state.stage = 'MENU';
    runPreGameFlow('setup');
  });
  else if (state.stage === 'STAGE3B') updateStage3B(dt, toStage3C);
  else if (state.stage === 'STAGE3C') updateStage3C(dt, toStage4);
  else if (state.stage === 'STAGE4') updateStage4(dt, goToDebrief, () => {
    resetRunState();
    state.stage = 'MENU';
    runPreGameFlow('setup');
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
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  update(dt);
  draw();
  if (state.stage !== 'MENU' && state.stage !== 'STAGE5') {
    requestAnimationFrame(loop);
  }
}

try {
  // Ticket thumbnails are cut from item sprites, so redraw tickets once those load.
  preloadAllAssets().then(() => {
    if (state.stage === 'STAGE1') renderTicketsHUD();
  });
  hydrateIcons();
  resizeCanvas();
  openMenu({ title: true });
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
