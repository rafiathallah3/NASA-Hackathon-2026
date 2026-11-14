import { LOGICAL_W, LOGICAL_H } from '../config.js';
import { state, getVehicle, logBlackBox } from '../state.js';
import { playTone } from '../audio.js';
import { addFloatText, drawCanvasControlBar } from '../sprites.js';
import { setStageBanner, updateBottomHUD } from '../hud.js';

export function startStage1B() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('hidden');
  state.stage = 'STAGE1B';
  state.stageTimer = 14;
  state.lunarParticles = [];
  state.ascent = {
    rocketY: 475,
    thrust: 0.55,
    targetThrust: 0.6,
    tilt: 0,
    velTilt: (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.14),
    separated: false,
    sepWindowOpen: false,
    boosterDropY: 0,
    padScroll: 0,
    integrity: 100,
    aborted: false,
    abortReason: '',
    warningMsg: '',
    inputTouched: false
  };
  state.floatingTexts = [];

  setStageBanner(
    'STAGE 1B — LIFTOFF',
    '4P Rocket Liftoff & Stage Separation',
    'P1 holds W/S Vertical Thrust & A/D Stabilizer; P2-P4 assist RCS trim & decouple at T+9s!',
    `<kbd>W</kbd>/<kbd>S</kbd> Vertical Thrust &nbsp;•&nbsp; <kbd>A</kbd>/<kbd>D</kbd> Stabilizer &nbsp;•&nbsp; <kbd>SPACE</kbd> Stage Separation`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  playTone(220, 'sawtooth', 0.4, 0.14);
  updateBottomHUD();
}

export function handleStage1BSeparation() {
  if (state.ascent.aborted) return;
  state.ascent.inputTouched = true;
  if (state.ascent.sepWindowOpen && !state.ascent.separated) {
    state.ascent.separated = true;
    state.screenShake = 0.2;
    state.score += 90;
    state.telemetry.fuel = Math.min(125, state.telemetry.fuel + 15);
    addFloatText(LOGICAL_W / 2, 260, 'STAGE SEPARATION NOMINAL! +90⭐', '#4ade80');
    logBlackBox('STAGE 1B', 'Clean booster stage separation added +15% propellant reserve.', 'good');
    playTone(660, 'triangle', 0.2, 0.14);
  }
}

function triggerStage1BAbort(reason, onAbortToHangar) {
  const a = state.ascent;
  a.aborted = true;
  a.abortReason = reason;
  state.screenShake = 0.3;
  logBlackBox('STAGE 1B', `LAUNCH ABORT: ${reason}`, 'warn');
  playTone(110, 'sawtooth', 0.45, 0.16);
  updateBottomHUD();

  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (modal && mc) {
    modal.classList.remove('hidden');
    mc.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#f87171;margin:0 0 8px;">Launch Abort — Game Over</h2>
        <p class="sub" style="margin-bottom:16px;">${reason}</p>
        <div class="config-panel" style="text-align:left;margin-bottom:20px;">
          <div><b style="color:#fde047;">[W / S]</b> Keep the orange Thrust bar inside the <b style="color:#4ade80;">GREEN</b> vertical band.</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[A / D]</b> Keep the Stabilizer dot inside the <b style="color:#4ade80;">GREEN</b> center zone.</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[SPACE]</b> Trigger Stage Separation when the orange banner appears.</div>
        </div>
        <div class="modal-actions" style="justify-content:center;">
          <button id="btn-back-hangar" class="btn-secondary" type="button">Back to Hangar</button>
          <button id="btn-retry-liftoff" class="btn-primary" style="background:#f87171;color:#0b111e;" type="button">Retry Liftoff</button>
        </div>
      </div>
    `;
    const retryBtn = document.getElementById('btn-retry-liftoff');
    const hangarBtn = document.getElementById('btn-back-hangar');
    if (retryBtn) {
      retryBtn.onclick = () => {
        modal.classList.add('hidden');
        startStage1B();
      };
    }
    if (hangarBtn) {
      hangarBtn.onclick = () => {
        modal.classList.add('hidden');
        if (onAbortToHangar) onAbortToHangar();
      };
    }
  }
}

export function updateStage1B(dt, onNextStage, onAbortToHangar) {
  const a = state.ascent;
  if (a.aborted) return;

  if (
    state.keys['KeyW'] || state.keys['ArrowUp'] ||
    state.keys['KeyS'] || state.keys['ArrowDown'] ||
    state.keys['KeyA'] || state.keys['ArrowLeft'] ||
    state.keys['KeyD'] || state.keys['ArrowRight']
  ) {
    a.inputTouched = true;
  }

  const veh = getVehicle();
  const massRatio = state.telemetry.mass / state.telemetry.maxMass;
  const overloadPenalty = massRatio > 1 ? (massRatio - 1) * 0.45 : 0;

  a.targetThrust = 0.58 + Math.sin(performance.now() * 0.0018) * 0.16;
  if (state.keys['KeyW'] || state.keys['ArrowUp']) a.thrust = Math.min(1, a.thrust + 0.68 * dt);
  else if (state.keys['KeyS'] || state.keys['ArrowDown']) a.thrust = Math.max(0, a.thrust - 0.68 * dt);
  else a.thrust = Math.max(0, a.thrust - 0.26 * dt);

  const thrustMatch = Math.abs(a.thrust - a.targetThrust) <= 0.14;
  a.rocketY -= (14 + a.thrust * 32) * dt;
  if (a.rocketY < 185) a.rocketY = 185;
  a.padScroll += (35 + a.thrust * 120) * dt;

  const instability = Math.max(0.28, 0.85 - state.shippedModules.booster_core * 0.14 - veh.stabilityBonus + overloadPenalty);
  a.velTilt += (Math.sin(performance.now() * 0.0032) * instability + 0.16 * Math.cos(performance.now() * 0.0017)) * dt;
  if (state.keys['KeyA'] || state.keys['ArrowLeft']) a.velTilt -= 1.85 * dt;
  if (state.keys['KeyD'] || state.keys['ArrowRight']) a.velTilt += 1.85 * dt;
  if (state.coopMode === '4P_AI' || state.coopMode === 'NET_4P') a.velTilt -= a.tilt * 0.18 * dt;
  a.tilt = Math.max(-0.55, Math.min(0.55, a.tilt + a.velTilt * dt));
  a.velTilt *= 0.95;

  // Launch failure / structural integrity checks
  let warn = '';
  if (a.thrust < 0.25) {
    a.integrity -= 28 * dt;
    warn = '⚠️ ENGINE STALL! HOLD [W] THRUST!';
  } else if (a.thrust > 0.93) {
    a.integrity -= 16 * dt;
    warn = '⚠️ MAX-Q OVER-THRUST! TAP [S]!';
  }
  if (Math.abs(a.tilt) > 0.34) {
    a.integrity -= 26 * dt;
    warn = warn ? '⚠️ STALL & PITCH OVER! [W/S] + [A/D]' : '⚠️ PITCH OVER! STEER [A / D]!';
  }
  a.warningMsg = warn;
  a.integrity = Math.max(0, a.integrity);

  if (a.integrity <= 0) {
    const reason = a.thrust < 0.25
      ? 'Engine thrust dropped below minimum liftoff velocity — launch vehicle stalled!'
      : Math.abs(a.tilt) > 0.34
        ? 'Vehicle pitched violently off the ascent corridor (Max-Q Structural Breakup)!'
        : 'Excessive Max-Q aerodynamic structural overload!';
    triggerStage1BAbort(reason, onAbortToHangar);
    return;
  }

  if (state.stageTimer <= 0) {
    if (!a.inputTouched || a.thrust < 0.28 || Math.abs(a.tilt) > 0.38) {
      triggerStage1BAbort(
        'Flight crew failed to actively steer or maintain liftoff thrust during ascent!',
        onAbortToHangar
      );
      return;
    }
    if (!a.separated) {
      logBlackBox('STAGE 1B', 'Missed clean stage separation window (higher dry mass penalty).', 'warn');
    }
    onNextStage();
    return;
  }

  const pitchMatch = Math.abs(a.tilt) <= 0.2;
  if (thrustMatch && pitchMatch) state.score += Math.round(dt * 24);
  else if (thrustMatch || pitchMatch) state.score += Math.round(dt * 10);

  a.sepWindowOpen = (state.stageTimer <= 5.5 && state.stageTimer >= 1.5);
  if (a.separated) a.boosterDropY += dt * 120;

  // Exhaust smoke puffs
  if (Math.random() < 0.7) {
    state.lunarParticles.push({
      x: LOGICAL_W / 2 - Math.sin(a.tilt) * 45 + (Math.random() - 0.5) * 20,
      y: a.rocketY + 46,
      vx: (Math.random() - 0.5) * 90,
      vy: 140 + a.thrust * 120,
      life: 0.65,
      size: 6 + Math.random() * 8,
      color: Math.random() < 0.35 ? '#fbbf24' : 'rgba(226, 232, 240, 0.8)'
    });
  }

  updateBottomHUD();
}

export function drawStage1B(ctx) {
  const a = state.ascent;
  const altRatio = Math.min(1, a.padScroll / 1100);
  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  grad.addColorStop(0, '#040711');
  grad.addColorStop(0.55, altRatio > 0.6 ? '#0f172a' : '#172554');
  grad.addColorStop(1, altRatio > 0.7 ? '#1e293b' : '#2563eb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Ascending stars
  ctx.fillStyle = '#e2e8f0';
  for (let i = 0; i < 55; i++) {
    ctx.globalAlpha = Math.min(1, altRatio + 0.2);
    const sy = ((i * 73) + a.padScroll * (0.4 + (i % 3) * 0.2)) % LOGICAL_H;
    ctx.fillRect((i * 199) % LOGICAL_W, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Pad 39B Launch Tower falling away at bottom
  const towerY = 540 + a.padScroll;
  if (towerY < LOGICAL_H + 340) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, towerY, LOGICAL_W, 120);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4;
    ctx.strokeRect(LOGICAL_W / 2 - 110, towerY - 260, 42, 260);
    // Retracted umbilical arm
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(LOGICAL_W / 2 - 68, towerY - 190, 28, 8);
  }

  // Smoke particles
  for (const pt of state.lunarParticles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.2);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Thrust gauge
  const tx = 130, ty = 130, tw = 34, th = 320;
  ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 10); ctx.fill(); ctx.stroke();

  const bandY = ty + th * (1 - a.targetThrust - 0.14);
  const bandH = th * 0.28;
  ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
  ctx.fillRect(tx + 3, bandY, tw - 6, bandH);

  const curY = ty + th * (1 - a.thrust);
  ctx.fillStyle = Math.abs(a.thrust - a.targetThrust) <= 0.14 ? '#4ade80' : '#f97316';
  ctx.fillRect(tx - 6, curY - 5, tw + 12, 10);

  ctx.fillStyle = '#fde047'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('THRUST', tx + tw / 2, ty - 14);
  ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.fillText('[W] UP', tx + tw / 2, ty + th + 20);
  ctx.fillText('[S] DOWN', tx + tw / 2, ty + th + 37);

  // Ascent Structural Integrity Gauge (Top-Left)
  const intPct = Math.round(a.integrity ?? 100);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = intPct < 40 ? '#ef4444' : '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(18, 18, 224, 54, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`ASCENT INTEGRITY: ${intPct}%`, 30, 38);
  ctx.fillStyle = '#1e293b'; ctx.fillRect(30, 47, 200, 12);
  ctx.fillStyle = intPct > 60 ? '#4ade80' : intPct > 30 ? '#fbbf24' : '#ef4444';
  ctx.fillRect(30, 47, (200 * intPct) / 100, 12);

  // Stabilizer bar
  const barW = 380, bx = (LOGICAL_W - barW) / 2, by = 52;
  ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(bx, by, barW, 24, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
  ctx.fillRect(bx + barW * 0.34, by + 2, barW * 0.32, 20);
  const markerX = bx + barW / 2 + a.tilt * 300;
  ctx.fillStyle = Math.abs(a.tilt) <= 0.2 ? '#4ade80' : '#f87171';
  ctx.beginPath(); ctx.arc(markerX, by + 12, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fde047'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('STABILIZER TRIM: [A] LEFT  •  [D] RIGHT', LOGICAL_W / 2, by - 10);

  if (a.warningMsg) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 205, 146, 410, 36, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Fredoka, sans-serif';
    ctx.fillText(a.warningMsg, LOGICAL_W / 2, 169);
  }

  if (a.sepWindowOpen && !a.separated) {
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 175, 96, 350, 42, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px Fredoka, sans-serif';
    ctx.fillText('PRESS [SPACE] FOR STAGE SEPARATION!', LOGICAL_W / 2, 123);
  }

  // Detailed Multi-Stage Rocket
  ctx.save();
  ctx.translate(LOGICAL_W / 2, a.rocketY);
  ctx.rotate(a.tilt);

  const flameLen = 40 + a.thrust * 72 + Math.random() * 18;
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.moveTo(-18, 42); ctx.lineTo(0, 42 + flameLen); ctx.lineTo(18, 42); ctx.fill();
  ctx.fillStyle = '#fef08a';
  ctx.beginPath(); ctx.moveTo(-9, 42); ctx.lineTo(0, 42 + flameLen * 0.65); ctx.lineTo(9, 42); ctx.fill();

  // Upper Stage + Fairing
  ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-21, -50, 42, 56, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(-19, -24, 38, 7);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.moveTo(-21, -50); ctx.lineTo(0, -86); ctx.lineTo(21, -50); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Side SRBs & Core Booster
  const bOff = a.separated ? a.boosterDropY : 0;
  ctx.fillStyle = a.separated ? '#94a3b8' : '#e2e8f0';
  ctx.beginPath(); ctx.roundRect(-23, 6 + bOff, 46, 40, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.roundRect(-34, 12 + bOff, 11, 34, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(23, 12 + bOff, 11, 34, 4); ctx.fill(); ctx.stroke();

  ctx.restore();

  drawCanvasControlBar(ctx, LOGICAL_W, [
    { key: 'W / S', label: 'Green Thrust Band' },
    { key: 'A / D', label: 'Center Stabilizer' },
    { key: 'SPACE', label: 'Separate Booster' }
  ]);
}
