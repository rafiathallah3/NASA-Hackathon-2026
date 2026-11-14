import { LOGICAL_W, LOGICAL_H } from './config.js';
import { state, resetRunState } from './state.js';
import { broadcastNet, registerNetStageHandler } from './net.js';
import { selectActiveCrew, cycleCoopMode, showMenuModal, updateBottomHUD, updateClockHUD, showMissionToast, hideMissionToast } from './hud.js';
import { startTransition, skipTransition, updateTransition, drawTransition } from './transitions.js';
import { initStage1, buildStage1Map, handleStage1Interact, handleStage1Dash, handleStage1Throw, handleStage1CanvasClick, skipStage1Tutorial, updateStage1, drawStage1 } from './stages/stage1.js';
import { startStage1B, handleStage1BSeparation, updateStage1B, drawStage1B } from './stages/stage1b.js';
import { startStage2, handleStage2Interact, handleStage2CanvasClick, toggleBreaker, updateStage2, drawStage2 } from './stages/stage2.js';
import {
  startStage3A, updateStage3A, drawStage3A,
  startStage3B, handleStage3BInteract, updateStage3B, drawStage3B,
  startStage3CMoonLaunch, handleStage3CTEIBurn, updateStage3C, drawStage3C
} from './stages/stage3.js';
import { startStage4EarthReturn, handleStage4DeployChutes, handleStage4CoolantPurge, updateStage4, drawStage4 } from './stages/stage4.js';
import { startStage5Debrief } from './stages/stage5.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = document.getElementById('game-wrap');
  const maxW = wrap.clientWidth - 16;
  const maxH = wrap.clientHeight - 10;
  const scale = Math.max(0.3, Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H));
  const w = Math.floor(LOGICAL_W * scale);
  const h = Math.floor(LOGICAL_H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.floor(LOGICAL_W * dpr);
  canvas.height = Math.floor(LOGICAL_H * dpr);
  ctx.setTransform(dpr * (LOGICAL_W / LOGICAL_W), 0, 0, dpr * (LOGICAL_H / LOGICAL_H), 0, 0);
}

new ResizeObserver(resizeCanvas).observe(document.getElementById('game-wrap'));
window.addEventListener('resize', resizeCanvas);

function goToDebrief() {
  hideMissionToast();
  startStage5Debrief(startGame, openMenu);
}

function toStage1B() {
  hideMissionToast();
  startTransition({
    kind: 'HANGAR_ROLLOUT',
    badge: 'LAUNCH COMPLEX 39B',
    title: 'PAYLOAD FAIRING SEALED & PAD ROLLOUT',
    subtitle: 'Transferring spacecraft telemetry to launch control...',
    duration: 2.2,
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
    duration: 2.2,
    onComplete: startStage2
  });
}

function toStage3A() {
  hideMissionToast();
  startTransition({
    kind: 'LUNAR_UNDOCK',
    badge: 'LUNAR ORBIT RENDEZVOUS',
    title: 'HLS LANDER UNDOCKING OVER SHACKLETON RIM',
    subtitle: 'Igniting descent engines for Point A landing pad approach...',
    duration: 2.2,
    onComplete: startStage3A
  });
}

function toStage3B() {
  hideMissionToast();
  startTransition({
    kind: 'ROVER_DEPLOY',
    badge: 'SURFACE OPERATIONS',
    title: 'DEPLOYING DUAL LTV LUNAR ROVERS',
    subtitle: 'Point A secured — drive to Point B Crater, Seismic Array & Relay Dish!',
    duration: 2.2,
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
    duration: 2.0,
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
    duration: 2.4,
    onComplete: startStage4EarthReturn
  });
}

function advanceStageManual(fromNet = false) {
  if (!fromNet && state.stage === 'STAGE1' && state.shippedCount === 0 && !state._warnedEmptyLaunch) {
    state._warnedEmptyLaunch = true;
    showMissionToast('No Modules Built', 'Build at least 1 NASA module or click Launch Mission again to fly bare!');
    return;
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

function startGame(fromNet = false) {
  hideMissionToast();
  document.getElementById('modal').classList.add('hidden');
  resetRunState();
  initStage1();
  if (!fromNet && state.coopMode === 'NET_4P') {
    broadcastNet({ type: 'STAGE_SYNC', action: 'START', scenario: state.selectedScenario, vehicle: state.selectedVehicle });
  }
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function openMenu() {
  state.stage = 'MENU';
  buildStage1Map();
  updateClockHUD();
  draw();
  showMenuModal(() => startGame(false));
}

registerNetStageHandler((msg) => {
  if (state.coopMode !== 'NET_4P') return;
  if (msg.action === 'START') {
    if (msg.scenario) state.selectedScenario = msg.scenario;
    if (msg.vehicle) state.selectedVehicle = msg.vehicle;
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

document.getElementById('btn-guide').addEventListener('click', () => {
  document.getElementById('guide-modal').classList.remove('hidden');
});
document.getElementById('btn-close-guide').addEventListener('click', () => {
  document.getElementById('guide-modal').classList.add('hidden');
});

document.getElementById('btn-mute').addEventListener('click', (e) => {
  state.muted = !state.muted;
  e.currentTarget.textContent = state.muted ? '🔇' : '🔊';
});

canvas.addEventListener('click', (e) => {
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
  }
});

// Keyboard Controls
window.addEventListener('keydown', (e) => {
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

  if (e.code === 'Escape') {
    const guideModal = document.getElementById('guide-modal');
    if (!guideModal.classList.contains('hidden')) {
      guideModal.classList.add('hidden');
    } else if (state.stage === 'STAGE2' && state.activeMiniGame) {
      state.activeMiniGame = null;
    }
  }
});

window.addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
});

function update(dt) {
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return;
  if (!document.getElementById('guide-modal').classList.contains('hidden')) return;
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
  else if (state.stage === 'STAGE3A') updateStage3A(dt, toStage3B);
  else if (state.stage === 'STAGE3B') updateStage3B(dt, toStage3C);
  else if (state.stage === 'STAGE3C') updateStage3C(dt, toStage4);
  else if (state.stage === 'STAGE4') updateStage4(dt, goToDebrief, () => {
    resetRunState();
    state.stage = 'MENU';
    showMenuModal(startGame);
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
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

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

resizeCanvas();
openMenu();
updateBottomHUD();
