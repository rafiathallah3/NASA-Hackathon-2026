import { LOGICAL_W, LOGICAL_H } from '../config.js';
import { state, getVehicle, logBlackBox } from '../state.js';
import { playTone } from '../audio.js';
import { getAsset } from '../assets.js';
import { addFloatText, drawCanvasControlBar, createStarfield, drawStarfield, drawExplosionSprite } from '../sprites.js';
import { setStageBanner, updateBottomHUD } from '../hud.js';

const ASCENT_STARS = createStarfield(75, LOGICAL_W, LOGICAL_H, 11815);

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
    srbSpreadX: 0,
    srbRot: 0,
    windDir: Math.random() < 0.5 ? -1 : 1,
    windTimer: 2.8,
    windActive: false,
    padScroll: 0,
    integrity: 100,
    aborted: false,
    abortAtMs: 0,
    abortReason: '',
    warningMsg: '',
    inputTouched: false
  };
  state.floatingTexts = [];

  setStageBanner(
    'STAGE 1B: LIFTOFF',
    'Rocket Liftoff & Stage Separation',
    'Hold W/S for thrust, steer A/D into the green zone, and hit SPACE when the staging window opens.',
    `<kbd>W</kbd>/<kbd>S</kbd> Thrust &nbsp;•&nbsp; <kbd>A</kbd>/<kbd>D</kbd> Stabilizer &nbsp;•&nbsp; <kbd>SPACE</kbd> Stage Separation`,
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
    state.screenShake = 0.24;
    const isPerfect = Math.abs(state.stageTimer - 3.5) <= 1.1;
    const pts = isPerfect ? 130 : 90;
    const fuelGain = isPerfect ? 18 : 12;
    state.score += pts;
    state.telemetry.fuel = Math.min(125, state.telemetry.fuel + fuelGain);
    addFloatText(
      LOGICAL_W / 2,
      250,
      isPerfect ? `⚡ PERFECT MAX-Q STAGING! +${pts}⭐ (+${fuelGain}% FUEL)` : `STAGE SEPARATION NOMINAL! +${pts}⭐`,
      isPerfect ? '#fde047' : '#4ade80'
    );
    logBlackBox('STAGE 1B', `${isPerfect ? 'Precision Max-Q' : 'Nominal'} booster stage separation added +${fuelGain}% propellant reserve.`, 'good');
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      state.lunarParticles.push({
        x: LOGICAL_W / 2 + Math.cos(ang) * 24,
        y: state.ascent.rocketY + 6,
        vx: Math.cos(ang) * (95 + Math.random() * 65),
        vy: Math.sin(ang) * 45 + 30,
        life: 0.55,
        size: 3.5 + Math.random() * 3,
        color: i % 2 === 0 ? '#fde047' : '#38bdf8'
      });
    }
    playTone(isPerfect ? 780 : 660, 'triangle', 0.22, 0.14);
  }
}

function triggerStage1BAbort(reason, onAbortToHangar) {
  const a = state.ascent;
  a.aborted = true;
  a.abortAtMs = performance.now();
  a.abortReason = reason;
  state.screenShake = 0.35;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const spd = 65 + Math.random() * 145;
    state.lunarParticles.push({
      x: LOGICAL_W / 2 + Math.cos(ang) * 14,
      y: a.rocketY + Math.sin(ang) * 18,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.8,
      size: 4 + Math.random() * 5,
      color: i % 2 === 0 ? '#f97316' : '#fde047'
    });
  }
  logBlackBox('STAGE 1B', `LAUNCH ABORT: ${reason}`, 'warn');
  playTone(110, 'sawtooth', 0.45, 0.16);
  updateBottomHUD();

  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (modal && mc) {
    modal.classList.remove('hidden');
    mc.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#f87171;margin:0 0 8px;">Launch Abort: Game Over</h2>
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
  a.windTimer -= dt;
  if (a.windTimer <= 0) {
    a.windActive = !a.windActive;
    a.windDir = Math.random() < 0.5 ? -1 : 1;
    a.windTimer = a.windActive ? 2.4 : 2.1;
  }
  const windTorque = a.windActive ? a.windDir * 0.42 * instability : 0;
  a.velTilt += (Math.sin(performance.now() * 0.0032) * instability + 0.16 * Math.cos(performance.now() * 0.0017) + windTorque) * dt;
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
      ? 'Engine thrust dropped below minimum liftoff speed. The launch vehicle stalled.'
      : Math.abs(a.tilt) > 0.34
        ? 'Vehicle pitched off the ascent corridor (Max-Q Structural Breakup).'
        : 'Excessive Max-Q aerodynamic overload.';
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
  if (a.separated) {
    a.boosterDropY += dt * 120;
    a.srbSpreadX += dt * 55;
    a.srbRot += dt * 0.65;
  }

  // Exhaust smoke puffs + engine stall/damage fire sparks anchored to active nozzle
  const isStall = a.thrust < 0.25;
  const engineBurning = a.integrity < 55 || a.thrust > 0.93;
  const sinT = Math.sin(a.tilt);
  const cosT = Math.cos(a.tilt);
  const nozDist = a.separated ? 14 : 52;
  if (Math.random() < (isStall ? 0.55 : 0.78)) {
    const nozX = LOGICAL_W / 2 - sinT * nozDist + (Math.random() - 0.5) * 14;
    const nozY = a.rocketY + cosT * nozDist;
    const exhSpeed = isStall ? (55 + Math.random() * 55) : (145 + a.thrust * 135);
    state.lunarParticles.push({
      x: nozX,
      y: nozY,
      vx: -sinT * exhSpeed + (Math.random() - 0.5) * (isStall ? 115 : 80),
      vy: cosT * exhSpeed,
      life: isStall ? 0.85 : 0.65,
      size: isStall ? (8 + Math.random() * 8) : (5 + Math.random() * 7),
      color: isStall
        ? 'rgba(100, 116, 139, 0.75)'
        : engineBurning && Math.random() < 0.55
          ? (Math.random() < 0.5 ? '#ef4444' : '#f97316')
          : (Math.random() < 0.35 ? '#fbbf24' : 'rgba(226, 232, 240, 0.82)')
    });
  }
  if (engineBurning && Math.random() < 0.5) {
    const fireDist = a.separated ? 2 : 38;
    state.lunarParticles.push({
      x: LOGICAL_W / 2 - sinT * fireDist + (Math.random() - 0.5) * 32,
      y: a.rocketY + cosT * fireDist + (Math.random() - 0.5) * 10,
      vx: -sinT * 50 + (Math.random() - 0.5) * 90,
      vy: cosT * (40 + Math.random() * 70),
      life: 0.48,
      size: 4 + Math.random() * 4,
      color: Math.random() < 0.4 ? '#fde047' : '#ef4444'
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

  // Layered space sky fading in smoothly as the rocket climbs above the troposphere
  const spaceAlpha = Math.max(0, Math.min(1, (altRatio - 0.12) / 0.72));
  if (spaceAlpha > 0.01) {
    const spaceBack = getAsset('spaceBack');
    const spaceStars = getAsset('spaceStars');
    const spacePlanet = getAsset('spacePlanet');
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (spaceBack && spaceBack.complete && spaceBack.naturalWidth > 0) {
      const yShift = (a.padScroll * 0.12) % LOGICAL_H;
      ctx.globalAlpha = spaceAlpha * 0.78;
      ctx.drawImage(spaceBack, 0, yShift - LOGICAL_H, LOGICAL_W, LOGICAL_H);
      ctx.drawImage(spaceBack, 0, yShift, LOGICAL_W, LOGICAL_H);
    }
    if (spaceStars && spaceStars.complete && spaceStars.naturalWidth > 0) {
      const yStarShift = (a.padScroll * 0.28) % LOGICAL_H;
      ctx.globalAlpha = spaceAlpha * 0.9;
      ctx.drawImage(spaceStars, 0, yStarShift - LOGICAL_H, LOGICAL_W, LOGICAL_H);
      ctx.drawImage(spaceStars, 0, yStarShift, LOGICAL_W, LOGICAL_H);
    }
    if (spacePlanet && spacePlanet.complete && spacePlanet.naturalWidth > 0) {
      const pAlpha = Math.max(0, Math.min(1, (altRatio - 0.35) / 0.65)) * 0.75;
      if (pAlpha > 0.01) {
        ctx.globalAlpha = pAlpha;
        const pH = LOGICAL_H * 0.85;
        ctx.drawImage(spacePlanet, 0, LOGICAL_H - pH + 90 * (1 - altRatio), LOGICAL_W, pH);
      }
    }
    ctx.restore();
  }

  // Ascending organic starfield
  drawStarfield(ctx, ASCENT_STARS, LOGICAL_W, LOGICAL_H, {
    offsetY: a.padScroll * 0.45,
    alphaMul: Math.min(1, altRatio + 0.25),
    nowSec: performance.now() * 0.001
  });

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

  // Jet Stream Wind Shear Gusts (Top-Right Indicator + Atmospheric Streak Lines)
  if (a.windActive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
    ctx.lineWidth = 2;
    const tShift = (performance.now() * 0.42 * a.windDir + LOGICAL_W * 4) % LOGICAL_W;
    for (let i = 0; i < 9; i++) {
      const wy = 110 + i * 44;
      const wx = (tShift + i * 137) % LOGICAL_W;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + a.windDir * 68, wy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(LOGICAL_W - 252, 18, 234, 52, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 11.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(a.windDir > 0 ? '🌬️ WIND SHEAR ➡️ (PUSHING RIGHT)' : '⬅️ WIND SHEAR 🌬️ (PUSHING LEFT)', LOGICAL_W - 135, 38);
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px Fredoka, sans-serif';
    ctx.fillText(a.windDir > 0 ? 'Hold [A] to Counter!' : 'Hold [D] to Counter!', LOGICAL_W - 135, 56);
    ctx.restore();
  }

  if (a.warningMsg) {
    const warnPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.014);
    ctx.save();
    // Subtle critical vignette so stall/fire danger is unmistakable without covering the rocket
    const vig = ctx.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, 240, LOGICAL_W / 2, LOGICAL_H / 2, 660);
    vig.addColorStop(0, 'rgba(220, 38, 38, 0)');
    vig.addColorStop(1, `rgba(220, 38, 38, ${0.14 + warnPulse * 0.16})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const wx = LOGICAL_W - 188, wy = 118;
    ctx.fillStyle = 'rgba(153, 27, 27, 0.94)';
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(wx - 166, wy - 20, 332, 40, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(a.warningMsg, wx, wy + 5);
    ctx.restore();
  }

  if (a.sepWindowOpen && !a.separated) {
    const winProg = Math.max(0, Math.min(1, (5.5 - state.stageTimer) / 4.0));
    const inSweetSpot = Math.abs(state.stageTimer - 3.5) <= 1.1;
    ctx.fillStyle = inSweetSpot ? '#16a34a' : '#f97316';
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 190, 90, 380, 54, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif';
    ctx.fillText(inSweetSpot ? '⚡ PERFECT MAX-Q WINDOW: PRESS [SPACE]!' : 'PRESS [SPACE] FOR STAGE SEPARATION!', LOGICAL_W / 2, 113);
    // Timing bar with sweet spot center zone
    const sbx = LOGICAL_W / 2 - 150, sby = 123, sbw = 300, sbh = 11;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(sbx, sby, sbw, sbh);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.55)'; ctx.fillRect(sbx + sbw * 0.23, sby + 1, sbw * 0.54, sbh - 2);
    ctx.fillStyle = '#fde047'; ctx.fillRect(sbx + sbw * winProg - 3, sby - 2, 6, sbh + 4);
  }

  // Detailed Multi-Stage Rocket
  ctx.save();
  ctx.translate(LOGICAL_W / 2, a.rocketY);
  ctx.rotate(a.tilt);

  const bOff = a.separated ? a.boosterDropY : 0;
  const srbX = a.separated ? (a.srbSpreadX || 0) : 0;
  const srbR = a.separated ? (a.srbRot || 0) : 0;
  const isStall = a.thrust < 0.25;
  const engineFire = a.integrity < 55 || a.thrust > 0.93;
  const nowMs = performance.now();
  const pulse = Math.sin(nowMs * 0.025);

  const drawFallingCoreAndSRBs = () => {
    ctx.save();
    if (a.separated) {
      ctx.globalAlpha = Math.max(0.25, 1 - bOff / 260);
    }
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    // Core Booster Engine Nozzle Bell
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(-10, 45 + bOff);
    ctx.lineTo(-14, 52 + bOff);
    ctx.lineTo(14, 52 + bOff);
    ctx.lineTo(10, 45 + bOff);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Core Booster Hull
    ctx.fillStyle = a.separated ? '#94a3b8' : '#e2e8f0';
    ctx.beginPath(); ctx.roundRect(-23, 6 + bOff, 46, 40, 6); ctx.fill(); ctx.stroke();

    // Twin Side SRBs
    ctx.save();
    ctx.translate(-28 - srbX, 28 + bOff * 0.85);
    ctx.rotate(-srbR);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.roundRect(-6, -16, 11, 34, 4); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(28 + srbX, 28 + bOff * 0.85);
    ctx.rotate(srbR);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.roundRect(-5, -16, 11, 34, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
  };

  // When separated, render spent dropping booster behind the active upper-stage plume
  if (a.separated) {
    drawFallingCoreAndSRBs();
  }

  // Thrust-accurate exhaust flame anchored directly to the active stage's nozzle
  const nozzleY = a.separated ? 11 : 51;
  const flameWidth = a.separated ? 14 : 18;
  if (isStall) {
    // Weak sputtering stall cough
    const cough = 6 + (a.thrust / 0.25) * 18 + Math.max(0, pulse) * 8;
    ctx.fillStyle = 'rgba(249, 115, 22, 0.72)';
    ctx.beginPath(); ctx.moveTo(-9, nozzleY); ctx.lineTo(pulse * 3, nozzleY + cough); ctx.lineTo(9, nozzleY); ctx.fill();
  } else {
    const flameLen = (a.separated ? 18 : 24) + a.thrust * 82 + pulse * 8;
    const outerCol = a.thrust > 0.93 ? '#ef4444' : '#f97316';
    ctx.fillStyle = outerCol;
    ctx.beginPath(); ctx.moveTo(-flameWidth, nozzleY); ctx.lineTo(0, nozzleY + flameLen); ctx.lineTo(flameWidth, nozzleY); ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.moveTo(-flameWidth * 0.5, nozzleY); ctx.lineTo(0, nozzleY + flameLen * 0.65); ctx.lineTo(flameWidth * 0.5, nozzleY); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-flameWidth * 0.22, nozzleY); ctx.lineTo(0, nozzleY + flameLen * 0.28); ctx.lineTo(flameWidth * 0.22, nozzleY); ctx.fill();

    // Twin SRB side plumes while still attached
    if (!a.separated) {
      const srbLen = flameLen * 0.56;
      for (const side of [-1, 1]) {
        const sx = side * 28;
        ctx.fillStyle = outerCol;
        ctx.beginPath(); ctx.moveTo(sx - 5, 45); ctx.lineTo(sx, 45 + srbLen); ctx.lineTo(sx + 5, 45); ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.moveTo(sx - 2.5, 45); ctx.lineTo(sx, 45 + srbLen * 0.58); ctx.lineTo(sx + 2.5, 45); ctx.fill();
      }
    }
  }

  // Upper Stage Second-Stage Engine Nozzle Bell (tucked inside interstage until separation)
  ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-8, 5);
  ctx.lineTo(-11, 13);
  ctx.lineTo(11, 13);
  ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Upper Stage + Fairing
  ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-21, -50, 42, 56, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(-19, -24, 38, 7);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.moveTo(-21, -50); ctx.lineTo(0, -86); ctx.lineTo(21, -50); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Before separation, draw attached Core Booster & SRBs cleanly in front of the flame root
  if (!a.separated) {
    drawFallingCoreAndSRBs();
  }

  // Visible engine-bay fire tongues anchored cleanly to the active rocket engine skirt
  if (engineFire) {
    const sway = Math.sin(nowMs * 0.03) * 4;
    const fireBaseY = a.separated ? 6 : 44;
    const skirtX = a.separated ? 17 : 21;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(side * (skirtX - 3), fireBaseY + 2);
      ctx.quadraticCurveTo(side * (skirtX + 10), fireBaseY - 8, side * (skirtX + 4) + sway, fireBaseY - 22);
      ctx.quadraticCurveTo(side * (skirtX - 2), fireBaseY - 10, side * (skirtX - 7), fireBaseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(side * skirtX, fireBaseY - 5, 4.5 + Math.abs(pulse) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  if (a.aborted && a.abortAtMs > 0) {
    const elapsedSec = (performance.now() - a.abortAtMs) / 1000;
    const bursts = [
      { dx: 0, dy: 0, delay: 0, dur: 0.85, size: 156 },
      { dx: -26, dy: 28, delay: 0.14, dur: 0.75, size: 112 },
      { dx: 24, dy: -22, delay: 0.28, dur: 0.75, size: 120 }
    ];
    for (const b of bursts) {
      const p = (elapsedSec - b.delay) / b.dur;
      if (p >= 0 && p <= 1) {
        drawExplosionSprite(ctx, LOGICAL_W / 2 + b.dx, a.rocketY + b.dy, p, b.size);
      }
    }
  }

  drawCanvasControlBar(ctx, LOGICAL_W, [
    { key: 'W / S', label: 'Green Thrust Band' },
    { key: 'A / D', label: 'Center Stabilizer' },
    { key: 'SPACE', label: 'Separate Booster' }
  ]);
}
