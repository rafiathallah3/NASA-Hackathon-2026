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
    elapsed: 0,
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

  a.elapsed = (a.elapsed || 0) + dt;
  const climbRamp = Math.min(1, a.elapsed / 3.2);
  const padEase = 0.14 + 0.86 * (climbRamp * climbRamp * (3 - 2 * climbRamp));
  const rocketEase = 0.35 + 0.65 * Math.min(1, a.elapsed / 2.2);

  const thrustMatch = Math.abs(a.thrust - a.targetThrust) <= 0.14;
  a.rocketY -= (14 + a.thrust * 32) * rocketEase * dt;
  if (a.rocketY < 185) a.rocketY = 185;
  a.padScroll += (26 + a.thrust * 138) * padEase * dt;

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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutQuad(t) {
  const c = clamp01(t);
  return 1 - (1 - c) * (1 - c);
}

function lerpRgb(c1, c2, t) {
  const k = clamp01(t);
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * k);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * k);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawLaunchSkyAndSpace(ctx, a, altRatio, nowMs) {
  // Multi-band sky palette: coastal KSC daytime sky -> upper stratosphere -> orbital night
  const k1 = clamp01(altRatio / 0.45);
  const k2 = clamp01((altRatio - 0.45) / 0.55);

  const topCol = altRatio < 0.45
    ? lerpRgb([30, 58, 138], [9, 17, 40], k1)
    : lerpRgb([9, 17, 40], [4, 7, 17], k2);
  const midCol = altRatio < 0.45
    ? lerpRgb([56, 189, 248], [23, 37, 84], k1)
    : lerpRgb([23, 37, 84], [15, 23, 42], k2);
  const lowCol = altRatio < 0.45
    ? lerpRgb([186, 230, 253], [59, 130, 246], k1)
    : lerpRgb([59, 130, 246], [30, 41, 59], k2);
  const horCol = altRatio < 0.45
    ? lerpRgb([254, 240, 199], [96, 165, 250], k1)
    : lerpRgb([96, 165, 250], [30, 41, 59], k2);

  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  grad.addColorStop(0, topCol);
  grad.addColorStop(0.45, midCol);
  grad.addColorStop(0.8, lowCol);
  grad.addColorStop(1, horCol);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Warm coastal Florida morning/golden sun haze on right horizon near ground altitude
  if (altRatio < 0.42) {
    const sunAlpha = (1 - altRatio / 0.42) * 0.45;
    const sunY = Math.min(LOGICAL_H + 120, 460 + a.padScroll * 0.55);
    const sunGlow = ctx.createRadialGradient(910, sunY, 12, 910, sunY, 260);
    sunGlow.addColorStop(0, `rgba(254, 249, 195, ${sunAlpha})`);
    sunGlow.addColorStop(0.4, `rgba(253, 224, 71, ${sunAlpha * 0.45})`);
    sunGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  // Layered space sky fading in smoothly as the rocket climbs out of the lower atmosphere
  const spaceAlpha = clamp01((altRatio - 0.2) / 0.65);
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
      const pAlpha = clamp01((altRatio - 0.35) / 0.65) * 0.75;
      if (pAlpha > 0.01) {
        ctx.globalAlpha = pAlpha;
        const pH = LOGICAL_H * 0.85;
        ctx.drawImage(spacePlanet, 0, LOGICAL_H - pH + 90 * (1 - altRatio), LOGICAL_W, pH);
      }
    }
    ctx.restore();
  }

  // Ascending organic starfield (emerges naturally as sky darkens above troposphere)
  const starAlpha = clamp01((altRatio - 0.16) / 0.62);
  if (starAlpha > 0.01) {
    drawStarfield(ctx, ASCENT_STARS, LOGICAL_W, LOGICAL_H, {
      offsetY: a.padScroll * 0.45,
      alphaMul: starAlpha,
      nowSec: nowMs * 0.001
    });
  }

  // Soft coastal cumulus clouds drifting across the lower daytime atmosphere
  if (altRatio < 0.56) {
    const cloudAlpha = (1 - altRatio / 0.56) * 0.75;
    const clouds = [
      { bx: 245, by: 235, s: 1.05, spd: 5.5 },
      { bx: 785, by: 195, s: 1.15, spd: 4.2 },
      { bx: 985, by: 305, s: 0.9, spd: 6.1 },
      { bx: 65, by: 365, s: 0.85, spd: 4.8 },
      { bx: 690, by: 380, s: 0.78, spd: 3.6 }
    ];
    ctx.save();
    for (const cl of clouds) {
      const cx = ((cl.bx + (nowMs * 0.001) * cl.spd) % (LOGICAL_W + 180)) - 90;
      const cy = cl.by + a.padScroll * 0.36;
      if (cy > LOGICAL_H + 60) continue;
      ctx.globalAlpha = cloudAlpha;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(cx, cy, 22 * cl.s, 0, Math.PI * 2);
      ctx.arc(cx + 22 * cl.s, cy - 8 * cl.s, 26 * cl.s, 0, Math.PI * 2);
      ctx.arc(cx + 46 * cl.s, cy, 20 * cl.s, 0, Math.PI * 2);
      ctx.arc(cx - 20 * cl.s, cy + 4 * cl.s, 17 * cl.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
      ctx.beginPath();
      ctx.ellipse(cx + 12 * cl.s, cy + 12 * cl.s, 42 * cl.s, 9 * cl.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawHazardCurb(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#facc15';
  const step = 14;
  for (let sx = x - h; sx < x + w + h; sx += step) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + step * 0.5, y + h);
    ctx.lineTo(sx + step * 0.5 + h, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTreelineCluster(ctx, startX, endX, baseY, flipDir = 1) {
  ctx.save();
  // Back darker coastal pines/shrubs
  ctx.fillStyle = '#14532d';
  ctx.beginPath();
  ctx.moveTo(startX, baseY + 18);
  const span = Math.abs(endX - startX);
  const count = Math.max(5, Math.floor(span / 26));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = startX + (endX - startX) * t;
    const h = 16 + Math.sin(i * 2.1 + flipDir) * 8 + (i % 3 === 0 ? 9 : 0);
    ctx.arc(x, baseY - h * 0.45, 16 + (i % 2) * 5, Math.PI, 0, flipDir < 0);
  }
  ctx.lineTo(endX, baseY + 18);
  ctx.closePath();
  ctx.fill();

  // Mid sunlit coastal foliage canopy
  ctx.fillStyle = '#15803d';
  for (let i = 0; i < count; i++) {
    const t = (i + 0.45) / count;
    const x = startX + (endX - startX) * t;
    const r = 11 + (i % 3) * 4;
    ctx.beginPath();
    ctx.arc(x, baseY - 4 - (i % 2) * 5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(x - 2, baseY - 7 - (i % 2) * 5, r * 0.55, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
    ctx.fillStyle = '#15803d';
  }
  ctx.restore();
}

function drawCoastalLaunchpadGround(ctx, towerY, a, nowMs) {
  const cx = LOGICAL_W / 2;
  const horizonY = towerY - 36;

  // 1. Distant Atlantic Ocean Horizon Strip
  const oceanGrad = ctx.createLinearGradient(0, horizonY, 0, towerY + 16);
  oceanGrad.addColorStop(0, '#7dd3fc');
  oceanGrad.addColorStop(0.28, '#0284c7');
  oceanGrad.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, horizonY, LOGICAL_W, 54);

  // Subtle horizon shimmer line
  ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
  ctx.fillRect(0, horizonY, LOGICAL_W, 1.5);

  // Distant KSC VAB & Lightning Towers silhouette on far left Atlantic shoreline
  ctx.save();
  ctx.fillStyle = 'rgba(30, 58, 138, 0.42)';
  ctx.fillRect(184, horizonY - 14, 24, 15);
  ctx.fillRect(172, horizonY - 8, 12, 9);
  ctx.strokeStyle = 'rgba(30, 58, 138, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(230, horizonY); ctx.lineTo(232, horizonY - 19);
  ctx.moveTo(248, horizonY); ctx.lineTo(250, horizonY - 17);
  ctx.stroke();
  ctx.restore();

  // Animated sunlit ocean wave glints
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const wx = ((i * 68 + Math.sin(nowMs * 0.001 + i) * 10) % (LOGICAL_W - 40)) + 20;
    if (wx > cx - 260 && wx < cx + 260) continue;
    const wy = horizonY + 8 + (i % 4) * 6;
    const wLen = 10 + (i % 3) * 8 + Math.sin(nowMs * 0.003 + i * 1.7) * 4;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(254, 249, 195, 0.5)' : 'rgba(186, 230, 253, 0.35)';
    ctx.fillRect(wx, wy, Math.max(4, wLen), 1.6);
  }
  ctx.restore();

  // 2. Coastal Sand Dunes Ridge flanking left & right
  ctx.fillStyle = '#d6c79c';
  ctx.beginPath();
  ctx.moveTo(0, towerY + 20);
  ctx.lineTo(0, towerY - 16);
  ctx.quadraticCurveTo(110, towerY - 26, 235, towerY - 14);
  ctx.quadraticCurveTo(330, towerY - 8, 420, towerY - 12);
  ctx.lineTo(700, towerY - 12);
  ctx.quadraticCurveTo(800, towerY - 8, 910, towerY - 20);
  ctx.quadraticCurveTo(1030, towerY - 28, LOGICAL_W, towerY - 15);
  ctx.lineTo(LOGICAL_W, towerY + 20);
  ctx.closePath();
  ctx.fill();

  // Shaded dune face
  ctx.fillStyle = '#b8a478';
  ctx.fillRect(0, towerY - 10, LOGICAL_W, 12);

  // 3. Lush Green Cape Canaveral Coastal Grass & Scrub Terrain
  const grassGrad = ctx.createLinearGradient(0, towerY - 8, 0, towerY + 135);
  grassGrad.addColorStop(0, '#16a34a');
  grassGrad.addColorStop(0.28, '#15803d');
  grassGrad.addColorStop(0.75, '#166534');
  grassGrad.addColorStop(1, '#14532d');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, towerY - 8, LOGICAL_W, 180);

  // Dune grass / sea-oats tufts & scrub highlights
  ctx.fillStyle = '#4ade80';
  for (let gx = 16; gx < LOGICAL_W; gx += 38) {
    if (gx > cx - 265 && gx < cx + 265) continue;
    const gy = towerY - 5 + ((gx * 7) % 10);
    ctx.fillRect(gx, gy, 3, 5);
    ctx.fillRect(gx + 5, gy - 2, 2, 6);
  }

  // Cape Canaveral Treeline / Shrub Silhouettes flanking left and right of the pad
  drawTreelineCluster(ctx, -10, cx - 245, towerY - 7, 1);
  drawTreelineCluster(ctx, cx + 245, LOGICAL_W + 10, towerY - 7, -1);

  // 4. Sloped Concrete Launch Pad 39B Apron & Crawlerway Ramp
  // Embankment slope
  const padGrad = ctx.createLinearGradient(0, towerY - 6, 0, towerY + 95);
  padGrad.addColorStop(0, '#94a3b8');
  padGrad.addColorStop(0.25, '#64748b');
  padGrad.addColorStop(1, '#334155');
  ctx.fillStyle = padGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 242, towerY - 6);
  ctx.lineTo(cx + 242, towerY - 6);
  ctx.lineTo(cx + 318, towerY + 96);
  ctx.lineTo(cx - 318, towerY + 96);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Concrete apron top deck & expansion seams
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(cx - 242, towerY - 6, 484, 14);
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
  ctx.lineWidth = 1.5;
  for (let sx = cx - 200; sx <= cx + 200; sx += 50) {
    ctx.beginPath();
    ctx.moveTo(sx, towerY - 6);
    ctx.lineTo(sx + (sx - cx) * 0.24, towerY + 92);
    ctx.stroke();
  }

  // Sloped Crawlerway Ramp (crushed river-rock bed + twin crawler tread tracks leading off to the right)
  ctx.save();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.moveTo(cx + 150, towerY + 4);
  ctx.lineTo(cx + 245, towerY + 4);
  ctx.lineTo(cx + 435, towerY + 100);
  ctx.lineTo(cx + 295, towerY + 100);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#57534e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Twin Crawler-Transporter Tread Tracks
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.moveTo(cx + 168, towerY + 6);
  ctx.lineTo(cx + 186, towerY + 6);
  ctx.lineTo(cx + 345, towerY + 100);
  ctx.lineTo(cx + 318, towerY + 100);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 206, towerY + 6);
  ctx.lineTo(cx + 224, towerY + 6);
  ctx.lineTo(cx + 402, towerY + 100);
  ctx.lineTo(cx + 375, towerY + 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. Black/Yellow Hazard Safety Curbing along Pad Deck Rim
  drawHazardCurb(ctx, cx - 242, towerY - 6, 178, 7);
  drawHazardCurb(ctx, cx + 64, towerY - 6, 178, 7);

  // 6. Recessed Concrete Flame Trench & Angled Flame Deflector directly under nozzle
  const trenchW = 128;
  const trenchX = cx - trenchW / 2;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(trenchX, towerY - 4, trenchW, 56);
  // Concrete trench side retaining walls
  ctx.fillStyle = '#475569';
  ctx.fillRect(trenchX - 10, towerY - 6, 10, 58);
  ctx.fillRect(trenchX + trenchW, towerY - 6, 10, 58);
  // Inner trench shadow & blast shield
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(trenchX + 4, towerY + 2, trenchW - 8, 46);

  // Mobile Launcher Platform (MLP) Steel Deck flanking the exhaust aperture
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.fillRect(cx - 134, towerY - 13, 88, 12);
  ctx.strokeRect(cx - 134, towerY - 13, 88, 12);
  ctx.fillRect(cx + 46, towerY - 13, 46, 12);
  ctx.strokeRect(cx + 46, towerY - 13, 46, 12);
  drawHazardCurb(ctx, cx - 134, towerY - 13, 88, 4);
  drawHazardCurb(ctx, cx + 46, towerY - 13, 46, 4);

  // Angled Steel Flame Deflector Wedge centered under rocket exhaust
  const heatAlpha = a.padScroll < 260 ? (1 - a.padScroll / 260) * clamp01(a.thrust + 0.25) : 0;
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(cx, towerY + 6);
  ctx.lineTo(cx - 48, towerY + 48);
  ctx.lineTo(cx + 48, towerY + 48);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (heatAlpha > 0.02) {
    const defGlow = ctx.createRadialGradient(cx, towerY + 12, 2, cx, towerY + 18, 48);
    defGlow.addColorStop(0, `rgba(254, 240, 138, ${heatAlpha * 0.95})`);
    defGlow.addColorStop(0.45, `rgba(249, 115, 22, ${heatAlpha * 0.78})`);
    defGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = defGlow;
    ctx.beginPath();
    ctx.moveTo(cx, towerY + 5);
    ctx.lineTo(cx - 56, towerY + 48);
    ctx.lineTo(cx + 56, towerY + 48);
    ctx.closePath();
    ctx.fill();
  }
}

function drawUmbilicalTower(ctx, towerY, a, nowMs) {
  const cx = LOGICAL_W / 2;
  const tx = cx - 124; // 436
  const tw = 54;       // right edge at 490, clean 36px clearance to left SRB
  const baseTop = towerY - 13;
  const bays = 5;
  const bayH = 36;
  const towerH = bays * bayH; // 180px
  const topY = baseTop - towerH; // 347 at T=0

  ctx.save();

  // Concrete & steel tower pedestal base
  ctx.fillStyle = '#475569';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.fillRect(tx - 6, baseTop - 6, tw + 12, 8);
  ctx.strokeRect(tx - 6, baseTop - 6, tw + 12, 8);

  // Central Elevator Core Shaft (inside FSS)
  const elevX = tx + 16;
  const elevW = 20;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(elevX, topY, elevW, towerH);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(elevX, topY, elevW, towerH);
  // Elevator guide rails & parked yellow-lit service cab
  ctx.strokeStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(elevX + 5, topY); ctx.lineTo(elevX + 5, baseTop);
  ctx.moveTo(elevX + elevW - 5, topY); ctx.lineTo(elevX + elevW - 5, baseTop);
  ctx.stroke();
  const cabY = topY + bayH * 2.2;
  ctx.fillStyle = '#facc15';
  ctx.fillRect(elevX + 4, cabY, elevW - 8, 16);
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(elevX + 6, cabY + 3, elevW - 12, 6);

  // Multi-level X-Braced Steel Truss Bays (orange/red RSS/FSS heritage steel + slate struts)
  for (let b = 0; b < bays; b++) {
    const y0 = baseTop - (b + 1) * bayH;
    const y1 = y0 + bayH;

    // X-bracing diagonals with crisp dark outline for contrast against sky & space
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(tx + 3, y0 + 2); ctx.lineTo(tx + tw - 3, y1 - 2);
    ctx.moveTo(tx + tw - 3, y0 + 2); ctx.lineTo(tx + 3, y1 - 2);
    ctx.stroke();

    ctx.strokeStyle = b % 2 === 0 ? '#ea580c' : '#94a3b8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tx + 3, y0 + 2); ctx.lineTo(tx + tw - 3, y1 - 2);
    ctx.moveTo(tx + tw - 3, y0 + 2); ctx.lineTo(tx + 3, y1 - 2);
    ctx.stroke();

    // Grated service deck & safety handrail at top of each bay
    ctx.fillStyle = '#334155';
    ctx.fillRect(tx - 5, y0 - 2, tw + 10, 5);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tx - 5, y0 - 2, tw + 10, 5);

    // Handrail posts & safety yellow top rail
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let rx = tx - 3; rx <= tx + tw + 3; rx += 12) {
      ctx.moveTo(rx, y0 - 2);
      ctx.lineTo(rx, y0 - 9);
    }
    ctx.stroke();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 5, y0 - 9);
    ctx.lineTo(tx + tw + 5, y0 - 9);
    ctx.stroke();

    // Subtle amber bay work floodlight
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(tx + tw - 2, y0 + 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Main Vertical Steel Corner Columns (drawn over bay edges)
  for (const colX of [tx, tx + tw - 5]) {
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(colX, topY, 5, towerH);
    ctx.strokeRect(colX, topY, 5, towerH);
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(colX + 1, topY, 1.5, towerH);
  }

  // Roof Hammerhead Crane & Elevated Water Deluge Storage Tank
  // Crane boom on left side of roof
  ctx.fillStyle = '#c2410c';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(tx - 24, topY - 14, 58, 7);
  ctx.strokeRect(tx - 24, topY - 14, 58, 7);
  ctx.fillRect(tx + 4, topY - 22, 10, 20);
  ctx.strokeRect(tx + 4, topY - 22, 10, 20);

  // Water Deluge Tank on right roof struts
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx + 28, topY - 2); ctx.lineTo(tx + 32, topY - 14);
  ctx.moveTo(tx + 48, topY - 2); ctx.lineTo(tx + 44, topY - 14);
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(tx + 25, topY - 28, 26, 15, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(tx + 26, topY - 22, 24, 3);

  // Lightning Arrestor Mast & Blinking Red Aviation Beacon
  const mastX = tx + tw / 2;
  const mastTopY = topY - 72;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mastX - 6, topY - 12); ctx.lineTo(mastX, mastTopY);
  ctx.moveTo(mastX + 6, topY - 12); ctx.lineTo(mastX, mastTopY);
  ctx.stroke();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(mastX, topY - 12); ctx.lineTo(mastX, mastTopY - 12);
  ctx.stroke();

  const beaconOn = Math.sin(nowMs * 0.0065) > 0;
  if (beaconOn) {
    const bGlow = ctx.createRadialGradient(mastX, mastTopY - 12, 1, mastX, mastTopY - 12, 14);
    bGlow.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
    bGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = bGlow;
    ctx.beginPath();
    ctx.arc(mastX, mastTopY - 12, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = beaconOn ? '#ef4444' : '#7f1d1d';
  ctx.beginPath();
  ctx.arc(mastX, mastTopY - 12, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Articulated Swing Arms (dynamically retract smoothly as liftoff begins: a.padScroll > 0)
  const hingeX = tx + tw - 2;
  const crewProg = easeOutQuad(a.padScroll / 64);
  const umbProg = easeOutQuad(a.padScroll / 44);

  // 1) Crew Access Arm (at upper stage / capsule collar y = towerY - 118)
  const crewY = towerY - 118;
  const crewAngle = -crewProg * 1.28; // swings up/back flush against tower
  ctx.save();
  ctx.translate(hingeX, crewY);
  ctx.rotate(crewAngle);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.fillRect(0, -6, 50, 11);
  ctx.strokeRect(0, -6, 50, 11);
  // NASA blue stripe & White Room end-collar
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(3, -1, 36, 2.5);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(42, -7, 9, 13);
  ctx.strokeRect(42, -7, 9, 13);
  ctx.restore();

  // 2) Upper & Core Propellant Umbilical Swing Arms (towerY - 84 & towerY - 62)
  const umbArms = [
    { y: towerY - 84, len: 50, ang: -1.18 },
    { y: towerY - 62, len: 48, ang: -1.12 }
  ];
  for (const arm of umbArms) {
    ctx.save();
    ctx.translate(hingeX, arm.y);
    ctx.rotate(umbProg * arm.ang);
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, -3.5, arm.len, 7);
    ctx.strokeRect(0, -3.5, arm.len, 7);
    // Truss diagonal & quick-disconnect cryo plate
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(4, -2); ctx.lineTo(18, 2); ctx.lineTo(32, -2);
    ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.fillRect(arm.len - 4, -5, 5, 10);
    ctx.restore();

    // Subtle cryogenic LOX vent wisp when connected or just detaching
    if (umbProg < 0.45) {
      const ventAlpha = (1 - umbProg / 0.45) * 0.45;
      const drift = ((nowMs * 0.025) % 18);
      ctx.fillStyle = `rgba(224, 242, 254, ${ventAlpha})`;
      ctx.beginPath();
      ctx.arc(hingeX + arm.len - 4 - drift * 0.4, arm.y - drift * 0.6, 3.5 + drift * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3) Lower Tail Service Mast (MLP deck umbilical at towerY - 28)
  ctx.save();
  ctx.translate(cx - 56, towerY - 13);
  ctx.rotate(-umbProg * 0.85);
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-4, -20, 8, 20);
  ctx.strokeRect(-4, -20, 8, 20);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(2, -19, 14, 4);
  ctx.restore();

  ctx.restore();
}

function drawHoldDownClamps(ctx, towerY, a) {
  const cx = LOGICAL_W / 2;
  const clampProg = easeOutQuad(a.padScroll / 16);
  const deckY = towerY - 13;

  ctx.save();
  for (const side of [-1, 1]) {
    const hingeX = cx + side * 42;
    ctx.save();
    ctx.translate(hingeX, deckY);
    ctx.rotate(side * clampProg * 0.92);
    // Hydraulic clamp arm reaching inward toward SRB skirt
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-side * 12, -14);
    ctx.lineTo(-side * 6, -18);
    ctx.lineTo(side * 5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Base pivot housing
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawPadDelugeSteam(ctx, towerY, a, nowMs, layer) {
  if (a.padScroll > 410) return;
  const fade = a.padScroll < 210 ? 1 : clamp01(1 - (a.padScroll - 210) / 200);
  const power = (0.55 + a.thrust * 0.65) * fade;
  if (power <= 0.02) return;

  const cx = LOGICAL_W / 2;
  const t = nowMs * 0.001;
  ctx.save();

  if (layer === 'back') {
    // High-pressure water deluge mist jets spraying into the flame trench
    ctx.strokeStyle = `rgba(224, 242, 254, ${0.48 * power})`;
    ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 54, towerY - 10);
      ctx.quadraticCurveTo(cx + side * 30, towerY - 20, cx + side * 8, towerY + 6);
      ctx.stroke();
    }

    // Billowing lateral trench steam clouds surging outward left & right
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const phase = ((t * 0.95 + i * 0.14) % 1);
        const dist = 28 + phase * 245;
        const px = cx + side * dist;
        const py = towerY + 18 - Math.sin(phase * Math.PI) * (16 + i * 2.5) + Math.sin(t * 3 + i) * 3;
        const rad = (14 + phase * 30) * (0.8 + a.thrust * 0.35);
        const alpha = (1 - phase * 0.85) * 0.72 * power;
        ctx.fillStyle = i % 3 === 0
          ? `rgba(255, 255, 255, ${alpha})`
          : i % 3 === 1
            ? `rgba(241, 245, 249, ${alpha * 0.92})`
            : `rgba(226, 232, 240, ${alpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Foreground warm fire-lit core + crisp steam billows hugging the trench lip
    const coreGlow = ctx.createRadialGradient(cx, towerY + 6, 4, cx, towerY + 10, 68);
    coreGlow.addColorStop(0, `rgba(254, 240, 138, ${0.75 * power})`);
    coreGlow.addColorStop(0.45, `rgba(251, 146, 60, ${0.48 * power})`);
    coreGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, towerY + 10, 68, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const phase = ((t * 1.15 + i * 0.19) % 1);
        const dist = 20 + phase * 185;
        const px = cx + side * dist;
        const py = towerY + 24 - phase * 14 + Math.cos(t * 3.5 + i) * 3;
        const rad = 11 + phase * 22;
        const alpha = (1 - phase) * 0.62 * power;
        ctx.fillStyle = phase < 0.28
          ? `rgba(254, 215, 170, ${alpha})`
          : `rgba(248, 250, 252, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

export function drawStage1B(ctx) {
  const a = state.ascent;
  const nowMs = performance.now();
  const altRatio = Math.min(1, a.padScroll / 1100);

  drawLaunchSkyAndSpace(ctx, a, altRatio, nowMs);

  // Pad 39B Coastal Ground & Umbilical Launch Tower falling away smoothly below
  const towerY = 540 + a.padScroll;
  const padVisible = towerY < LOGICAL_H + 340;
  if (padVisible) {
    drawCoastalLaunchpadGround(ctx, towerY, a, nowMs);
    drawUmbilicalTower(ctx, towerY, a, nowMs);
    drawPadDelugeSteam(ctx, towerY, a, nowMs, 'back');
  }

  // Smoke particles
  for (const pt of state.lunarParticles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.2);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Stage Separation Prompt Banner (behind rocket nose if rocket reaches top)
  if (a.sepWindowOpen && !a.separated) {
    const winProg = Math.max(0, Math.min(1, (5.5 - state.stageTimer) / 4.0));
    const inSweetSpot = Math.abs(state.stageTimer - 3.5) <= 1.1;
    ctx.fillStyle = inSweetSpot ? '#16a34a' : '#f97316';
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 190, 90, 380, 54, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(inSweetSpot ? '⚡ PERFECT MAX-Q WINDOW: PRESS [SPACE]!' : 'PRESS [SPACE] FOR STAGE SEPARATION!', LOGICAL_W / 2, 113);
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

  // Upper Stage Second-Stage Engine Nozzle Bell
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

  // Foreground Pad Elements: Hold-Down Clamps + Trench Steam Billows
  if (padVisible) {
    drawHoldDownClamps(ctx, towerY, a);
    drawPadDelugeSteam(ctx, towerY, a, nowMs, 'front');
  }

  if (a.aborted && a.abortAtMs > 0) {
    const elapsedSec = (nowMs - a.abortAtMs) / 1000;
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

  // HUD Overlays (drawn on top so launchpad ground, tower & steam never obscure gauges/cards)
  // Thrust gauge (Left)
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

  // Stabilizer bar (Top-Center)
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
    const tShift = (nowMs * 0.42 * a.windDir + LOGICAL_W * 4) % LOGICAL_W;
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
    const warnPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.014);
    ctx.save();
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

  drawCanvasControlBar(ctx, LOGICAL_W, [
    { key: 'W / S', label: 'Green Thrust Band' },
    { key: 'A / D', label: 'Center Stabilizer' },
    { key: 'SPACE', label: 'Separate Booster' }
  ]);
}
