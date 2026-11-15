import { LOGICAL_W, LOGICAL_H } from '../config.js';
import { state, logBlackBox } from '../state.js';
import { playTone, playSuccessChord } from '../audio.js';
import { broadcastNet } from '../net.js';
import { getAsset } from '../assets.js';
import { addFloatText, drawCanvasControlBar, createStarfield, drawStarfield, drawExplosionSprite } from '../sprites.js';
import { setStageBanner, updateBottomHUD, showMissionToast } from '../hud.js';
import { triggerDilemma } from '../dilemmas.js';

const REENTRY_STARS = createStarfield(65, LOGICAL_W, 280, 40415);

export function startStage4EarthReturn() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('hidden');
  state.stage = 'STAGE4';
  state.stageTimer = 42;
  state.lunarParticles = [];
  state.floatingTexts = [];

  const corridorBonus = Math.min(0.12, (state.shippedModules.comms_relay + state.shippedModules.power_pack) * 0.03);
  const teiBonus = state.missionChoices?.teiQuality === 'PRECISION' ? 0.06 : state.missionChoices?.teiQuality === 'LATE' ? -0.04 : 0;
  const overMass = (state.telemetry?.mass || 0) > (state.telemetry?.maxMass || Infinity);
  const massHeatMul = overMass ? 1.15 : 1.0;
  const mccOffNominal = Boolean(state.mccResult && !state.mccResult.nominalCapture && state.mccResult.bPlaneMissKm > 25);
  const mccCorridorPenalty = mccOffNominal ? -0.025 : 0;
  const baseCorridorHalfWidth = Math.max(0.18, 0.25 + corridorBonus + teiBonus);
  const corridorHalfWidth = mccOffNominal
    ? Math.max(0.16, baseCorridorHalfWidth + mccCorridorPenalty)
    : baseCorridorHalfWidth;

  state.reentry = {
    phase: 'PLASMA', // 'PLASMA' -> 'CHUTES' -> 'SPLASHED'
    altitude: 120,
    pitchAngle: 0,
    rollBank: 0,
    corridorHalfWidth,
    heat: 20,
    peakHeat: 20,
    coolantCharge: 1.0,
    aiVentsLeft: 1,
    drogueDeployed: false,
    chutesDeployed: false,
    chuteTimingBonus: false,
    chuteScale: 0,
    capsuleX: 520,
    capsuleY: 135,
    shipX: 660,
    shipDir: 1,
    heliX: 900,
    heliY: 220,
    splashTimer: 0,
    collarScale: 0,
    wavePhase: 0,
    windForce: 0,
    aborted: false,
    abortAtMs: 0,
    abortReason: '',
    inputTouched: false,
    heatRateMul: 1.0 * massHeatMul,
    massHeatMul,
    sampleVaultTempC: -80.0,
    peakVaultTempC: -80.0,
    samplePurity: 100,
    gLoad: 1.0,
    peakG: 1.0,
    mach: 32.0,
    blackoutActive: false,
    vaultThawWarned: false,
    plasmaElapsed: 0,
    grade: 'Nominal'
  };

  if (overMass) {
    logBlackBox('STAGE 4', `Over-mass spacecraft (${state.telemetry.mass}/${state.telemetry.maxMass} kg) increased baseline entry heating by +15%.`, 'warn');
  }
  if (mccOffNominal) {
    logBlackBox('STAGE 4', `Off-nominal MCC-1 (${Math.round(state.mccResult.bPlaneMissKm)} km B-plane miss) narrowed Earth entry corridor.`, 'warn');
  }

  setStageBanner(
    'STAGE 4: EARTH RETURN',
    'Step 1: Atmospheric Entry • Step 2: Triple Chutes • Step 3: Carrier Recovery',
    'Phase 1: [W/S] Keep needle in green, [A/D] roll cool, [SPACE] vent cryo | Phase 2: [SPACE] chutes, [J/L] move carrier',
    `<kbd>W</kbd>/<kbd>S</kbd> Entry Angle &nbsp;•&nbsp; <kbd>A</kbd>/<kbd>D</kbd> Roll/Steer &nbsp;•&nbsp; <kbd>SPACE</kbd> Cryo Vent / Chutes &nbsp;•&nbsp; <kbd>J</kbd>/<kbd>L</kbd> Carrier`,
    { showTickets: false, showSkip: false, showNext: true }
  );
  playTone(260, 'triangle', 0.3, 0.12);
  updateBottomHUD();

  triggerDilemma({
    id: 'REENTRY_PROFILE',
    badge: 'Stage 4 • Atmospheric Entry Flight Rule',
    title: 'Select Earth Entry Interface Angle',
    stageTag: 'STAGE 4',
    prompt: 'Orion is approaching atmospheric entry interface at Mach 32. Choose the flight trajectory:',
    options: [
      {
        label: 'Shallow Skip-Entry (Low Thermal Load)',
        accent: '#4ade80',
        trade: 'Uses atmospheric lift bounce to reduce heatshield heating rate by 25% (0.75x heat), with longer vault heat soak.',
        lesson: 'Skip-entry splits deceleration across two atmospheric dips to lower peak heat and G-load, but lengthens thermal soak.'
      },
      {
        label: 'Steep Ballistic Entry (Fast Direct)',
        accent: '#fde047',
        trade: '+120⭐ Speed bonus, +35% Plasma heat rate & higher G-load, shorter soak. Watch Cryo Vent!',
        lesson: 'Steeper flight path angles spike deceleration G-loads and shockwave heating with shorter atmospheric dwell time.'
      }
    ]
  }, (idx) => {
    const baseMassMul = state.reentry.massHeatMul || 1.0;
    if (idx === 0) {
      state.reentry.heatRateMul = 0.75 * baseMassMul;
      state.missionChoices.reentry = 'Shallow Skip';
      showMissionToast('Shallow Skip Selected', 'Plasma heating rate reduced by 25%. Watch vault soak!');
    } else {
      state.score += 120;
      state.reentry.heatRateMul = 1.35 * baseMassMul;
      state.missionChoices.reentry = 'Direct Ballistic';
      showMissionToast('Ballistic Entry (+120⭐)', 'Peak heating & G-load are higher. Watch Cryo Vent!');
    }
  });
}

export function handleStage4DeployChutes() {
  const r = state.reentry;
  if (r.aborted) return;
  r.inputTouched = true;
  if (r.phase === 'PLASMA') {
    handleStage4CoolantPurge();
    return;
  }
  if (r.phase === 'CHUTES' && !r.chutesDeployed) {
    r.chutesDeployed = true;
    state.screenShake = 0.18;
    if (r.altitude >= 8 && r.altitude <= 18) {
      r.chuteTimingBonus = true;
      state.score += 135;
      addFloatText(r.capsuleX, r.capsuleY - 55, '🎯 TEXTBOOK ALTITUDE CHUTES (8-18km)! +135⭐', '#4ade80');
      logBlackBox('STAGE 4', 'Triple main parachutes deployed inside optimal 8-18 km altitude window (+135⭐, stabilized drift).', 'good');
      playSuccessChord();
    } else {
      state.score += 85;
      addFloatText(r.capsuleX, r.capsuleY - 55, 'TRIPLE MAIN CHUTES DEPLOYED! +85⭐', '#38bdf8');
      logBlackBox('STAGE 4', 'Triple NASA main parachutes deployed cleanly.', 'good');
      playTone(520, 'triangle', 0.2, 0.14);
    }
  }
}

export function handleStage4CoolantPurge() {
  const r = state.reentry;
  if (r.aborted) return;
  r.inputTouched = true;
  if (r.phase === 'PLASMA') {
    if (r.coolantCharge >= 0.99) {
      r.coolantCharge = 0;
      r.heat = Math.max(10, r.heat - 22);
      r.sampleVaultTempC = Math.max(-80, (r.sampleVaultTempC ?? -80) - 14);
      state.score += 20;
      addFloatText(r.capsuleX, 205, '❄️ CRYO VENTED! (-22% HEAT, -14°C VAULT)', '#38bdf8');
      playTone(560, 'sine', 0.12, 0.11);
    } else {
      addFloatText(r.capsuleX, 205, `Cryo Charging ${Math.round(r.coolantCharge * 100)}%...`, '#94a3b8');
    }
  }
}

function triggerStage4GameOver(title, reason, onBackToMenu) {
  const r = state.reentry;
  r.aborted = true;
  r.abortAtMs = performance.now();
  r.abortReason = reason;
  state.screenShake = 0.35;
  const burstY = r.phase === 'PLASMA' ? 265 : r.capsuleY;
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2;
    const spd = 70 + Math.random() * 140;
    state.lunarParticles.push({
      x: r.capsuleX + Math.cos(ang) * 12,
      y: burstY + Math.sin(ang) * 12,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.75,
      size: 4 + Math.random() * 4.5,
      color: i % 2 === 0 ? '#ef4444' : '#fde047'
    });
  }
  logBlackBox('STAGE 4', `REENTRY FAILURE: ${reason}`, 'warn');
  playTone(110, 'sawtooth', 0.45, 0.16);
  updateBottomHUD();

  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (modal && mc) {
    modal.classList.remove('hidden');
    mc.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#f87171;margin:0 0 8px;">${title}</h2>
        <p class="sub" style="margin-bottom:16px;">${reason}</p>
        <div class="config-panel" style="text-align:left;margin-bottom:20px;">
          <div><b style="color:#fde047;">[W / S]</b> Keep the pitch needle inside the <b style="color:#4ade80;">GREEN</b> corridor</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[SPACE]</b> Vent Cryo Heatshield in Phase 1 &amp; deploy Main Chutes in Phase 2</div>
          <div style="margin-top:6px;"><b style="color:#fde047;">[A / D]</b> Roll-cool during Plasma &amp; steer capsule toward the carrier beam</div>
        </div>
        <div class="modal-actions" style="justify-content:center;">
          <button id="btn-menu-stage4" class="btn-secondary" type="button">Mission Setup</button>
          <button id="btn-retry-stage4" class="btn-primary" style="background:#f87171;color:#0b111e;" type="button">Retry Earth Return</button>
        </div>
      </div>
    `;
    const retryBtn = document.getElementById('btn-retry-stage4');
    const menuBtn = document.getElementById('btn-menu-stage4');
    if (retryBtn) {
      retryBtn.onclick = () => {
        modal.classList.add('hidden');
        startStage4EarthReturn();
      };
    }
    if (menuBtn) {
      menuBtn.onclick = () => {
        modal.classList.add('hidden');
        if (onBackToMenu) onBackToMenu();
      };
    }
  }
}

export function updateStage4(dt, onNextStage, onBackToMenu) {
  const r = state.reentry;
  if (r.aborted) return;
  r.wavePhase += dt * 3.0;

  if (r.phase === 'SPLASHED') {
    r.splashTimer += dt;
    r.collarScale = Math.min(1, r.collarScale + dt * 2.4);
    r.capsuleY = 514 + Math.sin(r.wavePhase) * 3.5;
    // Rescue helicopter flies over the splashed capsule & lowers hoist
    const targetHeliX = r.capsuleX;
    const targetHeliY = 390;
    r.heliX += (targetHeliX - r.heliX) * Math.min(1, dt * 2.2);
    r.heliY += (targetHeliY - r.heliY) * Math.min(1, dt * 2.2);
    if (r.splashTimer >= 2.3) {
      onNextStage();
    }
    return;
  }

  if (r.phase === 'PLASMA') {
    if (
      state.keys['KeyW'] || state.keys['ArrowUp'] ||
      state.keys['KeyS'] || state.keys['ArrowDown'] ||
      state.keys['KeyA'] || state.keys['ArrowLeft'] ||
      state.keys['KeyD'] || state.keys['ArrowRight']
    ) {
      r.inputTouched = true;
    }

    const drift = Math.sin(performance.now() * 0.0022) * 0.34 - 0.16;
    r.pitchAngle += drift * dt;
    if (state.keys['KeyW'] || state.keys['ArrowUp']) r.pitchAngle += 0.95 * dt;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) r.pitchAngle -= 0.95 * dt;
    r.pitchAngle = Math.max(-0.8, Math.min(0.8, r.pitchAngle));

    // Active Roll Bank shedding heat
    let rollInput = 0;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) rollInput -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) rollInput += 1;
    r.rollBank += (rollInput * 0.45 - r.rollBank) * Math.min(1, dt * 6);
    const rollCooling = Math.abs(rollInput) > 0 ? 2.5 : 0;

    // Smooth descent pace (Shallow Skip lingers longer; Direct Ballistic plunges faster)
    const paceMul = state.stageTimer < 22 ? 1.55 : 1.0;
    const isBallistic = state.missionChoices?.reentry === 'Direct Ballistic';
    const isSkip = state.missionChoices?.reentry === 'Shallow Skip';
    const profileDescentMul = isBallistic ? 1.25 : isSkip ? 0.78 : 1.0;
    const heatMul = r.heatRateMul || 1.0;
    const inCorridor = Math.abs(r.pitchAngle) <= r.corridorHalfWidth;
    if (inCorridor) {
      r.altitude -= 6.6 * paceMul * profileDescentMul * dt;
      r.heat = Math.max(15, Math.min(82, r.heat + (2.5 * heatMul - rollCooling) * dt));
      state.score += Math.round(dt * 22);
    } else if (r.pitchAngle < -r.corridorHalfWidth) {
      r.altitude -= 8.4 * paceMul * profileDescentMul * dt;
      r.heat = Math.min(100, r.heat + (16.5 * heatMul - rollCooling) * dt);
    } else {
      r.altitude -= 3.8 * paceMul * profileDescentMul * dt;
      r.heat = Math.max(10, r.heat - (2.8 + rollCooling) * dt);
    }
    r.peakHeat = Math.max(r.peakHeat, r.heat);

    // Aerothermodynamic Mach, dynamic G-load, and DSN ionization blackout
    const altClamped = Math.max(24, Math.min(120, r.altitude));
    const altFrac = (altClamped - 24) / 96;
    r.mach = 1.5 + altFrac * 30.5;
    r.blackoutActive = r.altitude >= 35 && r.altitude <= 85;

    const reentryProgress = 1 - altFrac;
    const decelCurve = Math.sin(Math.pow(reentryProgress, 0.85) * Math.PI);
    const profilePeakG = isBallistic ? 6.6 : isSkip ? 3.1 : 4.4;
    let pitchGAdj = 1.0;
    let steepSpikeG = 0;
    if (r.pitchAngle < -r.corridorHalfWidth) {
      const excess = Math.min(1, (-r.corridorHalfWidth - r.pitchAngle) / 0.45);
      pitchGAdj = 1.25;
      steepSpikeG = 1.6 + excess * 2.4;
    } else if (r.pitchAngle > r.corridorHalfWidth) {
      pitchGAdj = 0.65;
    }
    const targetG = 1.0 + decelCurve * (profilePeakG * pitchGAdj + Math.max(0, r.heat - 50) * 0.025) + steepSpikeG * (0.35 + 0.65 * decelCurve);
    r.gLoad += (targetG - r.gLoad) * Math.min(1, dt * 4.5);
    r.peakG = Math.max(r.peakG, r.gLoad);

    // Sample Vault thermal soak: rises faster at high shield heat and longer dwell time
    r.plasmaElapsed = (r.plasmaElapsed || 0) + dt;
    const dwellFactor = 1 + r.plasmaElapsed * 0.045;
    const vaultHeatRate = (1.5 + Math.max(0, r.heat - 15) * 0.068) * dwellFactor;
    r.sampleVaultTempC = Math.min(60, r.sampleVaultTempC + vaultHeatRate * dt);
    r.peakVaultTempC = Math.max(r.peakVaultTempC, r.sampleVaultTempC);

    // Non-lethal Sample Vault thawing rule
    if (state.sampleCollected) {
      if (r.sampleVaultTempC >= 0) {
        r.samplePurity = Math.min(r.samplePurity, 45);
        if (!r.vaultThawWarned) {
          r.vaultThawWarned = true;
          showMissionToast('Sample Vault Thawing', 'Sample Vault Thawing: Cryo sample purity reduced!');
          logBlackBox('STAGE 4', 'Sample Vault reached >= 0C during reentry: cryo sample purity reduced to 45%.', 'warn');
          playTone(220, 'sawtooth', 0.22, 0.11);
        }
      } else if (r.sampleVaultTempC >= -20) {
        r.samplePurity = Math.min(r.samplePurity, 75);
      }
    }

    // Coolant recharge; limited 1-time P2 emergency assist if actively flown
    r.coolantCharge = Math.min(1.0, r.coolantCharge + dt * 0.24);
    if ((state.coopMode === '4P_AI' || state.coopMode === 'NET_4P') && r.inputTouched && r.aiVentsLeft > 0 && r.heat > 84 && r.coolantCharge >= 0.99) {
      r.aiVentsLeft--;
      r.coolantCharge = 0;
      r.heat = Math.max(12, r.heat - 20);
      r.sampleVaultTempC = Math.max(-80, r.sampleVaultTempC - 14);
      addFloatText(r.capsuleX, 205, '❄️ P2 EMERGENCY CRYO VENT!', '#38bdf8');
      playTone(540, 'sine', 0.1, 0.08);
    }

    if (r.heat >= 100) {
      r.heat = 100;
      triggerStage4GameOver(
        'Heatshield Burnup: Game Over',
        'Thermal shield hit 100% during reentry. Hold [W/S] inside the green corridor and press [SPACE] to vent cryo.',
        onBackToMenu
      );
      return;
    }

    // Ionized plasma wake streaks
    for (let i = 0; i < 4; i++) {
      state.lunarParticles.push({
        x: r.capsuleX + (Math.random() - 0.5) * 56,
        y: 256 + Math.random() * 24,
        vx: -115 - Math.random() * 140,
        vy: -160 - Math.random() * 150,
        life: 0.4,
        size: 3 + Math.random() * 3.5,
        color: r.heat > 75 ? '#ef4444' : Math.random() < 0.4 ? '#fde047' : '#f97316'
      });
    }

    if (r.altitude <= 24) {
      r.phase = 'CHUTES';
      r.drogueDeployed = true;
      r.altitude = 24;
      r.mach = 1.5;
      r.blackoutActive = false;
      r.capsuleX = 430;
      r.capsuleY = 120;
      addFloatText(LOGICAL_W / 2, 175, 'DROGUE CHUTES OPEN! PRESS [SPACE] FOR MAIN CHUTES!', '#38bdf8');
      playTone(580, 'triangle', 0.16, 0.12);
    }
  } else if (r.phase === 'CHUTES') {
    // Allow J/L anytime OR switching to P4 [4] + A/D to steer the Recovery Carrier Ship!
    const p4Steer = state.activeCrewIndex === 3;
    let shipSteered = false;
    if (state.keys['KeyJ']) { r.shipX -= 180 * dt; shipSteered = true; }
    if (state.keys['KeyL']) { r.shipX += 180 * dt; shipSteered = true; }
    if (p4Steer && (state.keys['KeyA'] || state.keys['ArrowLeft'])) { r.shipX -= 180 * dt; shipSteered = true; }
    if (p4Steer && (state.keys['KeyD'] || state.keys['ArrowRight'])) { r.shipX += 180 * dt; shipSteered = true; }
    if (shipSteered) {
      r.shipX = Math.max(200, Math.min(920, r.shipX));
      broadcastNet({ type: 'SHIP_SYNC', shipX: r.shipX });
    } else if (state.coopMode === '4P_AI' || state.coopMode === 'LOCAL_2P') {
      const diff = r.capsuleX - r.shipX;
      r.shipX += Math.sign(diff) * Math.min(Math.abs(diff), 64 * dt);
    } else {
      r.shipX += r.shipDir * 60 * dt;
      if (r.shipX > 890) r.shipDir = -1;
      if (r.shipX < 340) r.shipDir = 1;
    }

    // Rescue helicopter circles above the recovery carrier
    r.heliX = r.shipX + Math.sin(r.wavePhase * 0.4) * 120;
    r.heliY = 395 + Math.cos(r.wavePhase * 0.7) * 12;

    if (r.chutesDeployed) {
      r.chuteScale = Math.min(1, r.chuteScale + dt * 2.5);
      r.altitude -= 1.65 * dt;
    } else {
      r.altitude -= 3.2 * dt;
    }

    const windAmp = r.chuteTimingBonus ? 26 : 44;
    r.windForce = Math.sin(performance.now() * 0.0017) * windAmp;
    r.capsuleX += r.windForce * dt;
    if (!p4Steer) {
      if (state.keys['KeyA'] || state.keys['ArrowLeft']) r.capsuleX -= 185 * dt;
      if (state.keys['KeyD'] || state.keys['ArrowRight']) r.capsuleX += 185 * dt;
    }
    r.capsuleX = Math.max(140, Math.min(LOGICAL_W - 140, r.capsuleX));

    r.capsuleY = 120 + ((24 - Math.max(0, r.altitude)) / 24) * 392;

    if (r.altitude <= 0) {
      r.altitude = 0;
      if (!r.chutesDeployed) {
        triggerStage4GameOver(
          'Hard Splashdown: Game Over',
          'Main parachutes were not opened before splashdown. Press [SPACE] during descent to open Triple Main Chutes.',
          onBackToMenu
        );
        return;
      }
      r.phase = 'SPLASHED';
      r.splashTimer = 0;
      state.screenShake = 0.25;
      const distToShip = Math.abs(r.capsuleX - r.shipX);

      const perfSummary = `peak ${(r.peakG ?? 1).toFixed(1)}G, peak heat ${Math.round(r.peakHeat)}%, vault ${(r.peakVaultTempC ?? -80).toFixed(1)}°C, purity ${r.samplePurity ?? 100}%`;
      if (distToShip <= 85) {
        r.grade = 'BULLSEYE 4P CARRIER RECOVERY (+250⭐)';
        state.score += 250;
        addFloatText(r.capsuleX, 455, 'BULLSEYE CARRIER SPLASHDOWN! +250⭐', '#4ade80');
        logBlackBox('STAGE 4', `Bullseye carrier splashdown (${Math.round(distToShip)}m offset, ${perfSummary}).`, 'good');
      } else if (distToShip <= 175) {
        r.grade = 'SAFE OCEAN SPLASHDOWN (+160⭐)';
        state.score += 160;
        addFloatText(r.capsuleX, 455, 'SAFE OCEAN SPLASHDOWN! +160⭐', '#38bdf8');
        logBlackBox('STAGE 4', `Safe ocean splashdown (${Math.round(distToShip)}m from carrier, ${perfSummary}).`, 'good');
      } else {
        r.grade = 'DISTANT SPLASHDOWN: HELO RECOVERY (+90⭐)';
        state.score += 90;
        addFloatText(r.capsuleX, 455, 'SPLASHDOWN: RESCUE HELO INBOUND! +90⭐', '#fbbf24');
        logBlackBox('STAGE 4', `Distant splashdown (${Math.round(distToShip)}m from carrier, ${perfSummary}).`, 'warn');
      }
      showMissionToast('Splashdown Complete', r.grade);

      for (let i = 0; i < 26; i++) {
        state.lunarParticles.push({
          x: r.capsuleX + (Math.random() - 0.5) * 40,
          y: 516,
          vx: (Math.random() - 0.5) * 210,
          vy: -70 - Math.random() * 120,
          life: 0.85,
          size: 4 + Math.random() * 4,
          color: '#e0f2fe'
        });
      }
      playSuccessChord();
    }
  }

  updateBottomHUD();
}

function drawHelicopter(ctx, x, y, hoistLen = 0, capX = x, capY = y) {
  ctx.save();
  ctx.translate(x, y);
  // Hoist cable when recovering splashed capsule
  if (hoistLen > 0) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo((capX - x) * hoistLen, (capY - y - 18) * hoistLen);
    ctx.stroke();
  }
  // Tail boom & rotor
  ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-24, -10, 48, 20, 9); ctx.fill(); ctx.stroke();
  ctx.fillRect(20, -5, 24, 6);
  ctx.fillStyle = '#f97316'; ctx.fillRect(-12, -3, 24, 6);
  ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.roundRect(-20, -7, 14, 10, 4); ctx.fill();
  // Spinning top rotor blur
  const bladeW = 36 + Math.sin(performance.now() * 0.08) * 18;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-bladeW, -15); ctx.lineTo(bladeW, -15); ctx.stroke();
  ctx.restore();
}

export function drawStage4(ctx) {
  const r = state.reentry;
  if (r.phase === 'PLASMA') {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    skyGrad.addColorStop(0, '#040712');
    skyGrad.addColorStop(0.55, '#1e1b4b');
    skyGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Layered deep-space backdrop & stars above Earth's upper atmosphere
    const spaceBack = getAsset('spaceBack');
    const spaceStars = getAsset('spaceStars');
    const spacePlanet = getAsset('spacePlanet');
    const skyShift = (performance.now() * 0.018) % LOGICAL_W;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (spaceBack && spaceBack.complete && spaceBack.naturalWidth > 0) {
      ctx.globalAlpha = 0.65;
      ctx.drawImage(spaceBack, -skyShift, 0, LOGICAL_W, LOGICAL_H * 0.78);
      ctx.drawImage(spaceBack, LOGICAL_W - skyShift, 0, LOGICAL_W, LOGICAL_H * 0.78);
    }
    if (spaceStars && spaceStars.complete && spaceStars.naturalWidth > 0) {
      const starShift = (performance.now() * 0.032) % LOGICAL_W;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(spaceStars, -starShift, 0, LOGICAL_W, 340);
      ctx.drawImage(spaceStars, LOGICAL_W - starShift, 0, LOGICAL_W, 340);
    }
    if (spacePlanet && spacePlanet.complete && spacePlanet.naturalWidth > 0) {
      ctx.globalAlpha = 0.42;
      ctx.drawImage(spacePlanet, 0, LOGICAL_H - 420, LOGICAL_W, 420);
    }
    ctx.restore();

    // Stars above ionosphere (seeded organic distribution)
    drawStarfield(ctx, REENTRY_STARS, LOGICAL_W, 280, {
      maxY: 250,
      alphaMul: 0.85,
      nowSec: performance.now() * 0.001
    });

    // Glowing Earth limb + Aurora band
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.arc(LOGICAL_W / 2, 1360, 880, Math.PI * 1.25, Math.PI * 1.75);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 14;
    ctx.stroke();

    // Entry Angle Corridor Gauge
    const gx = 120, gy = 120, gw = 38, gh = 340;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 10); ctx.fill(); ctx.stroke();

    const midY = gy + gh / 2;
    const halfH = (gh / 2) * (r.corridorHalfWidth / 0.8);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
    ctx.fillRect(gx + 3, gy + 3, gw - 6, midY - halfH - gy - 3);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.42)';
    ctx.fillRect(gx + 3, midY - halfH, gw - 6, halfH * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(gx + 3, midY + halfH, gw - 6, gy + gh - (midY + halfH) - 3);

    const needleY = midY - (r.pitchAngle / 0.8) * (gh / 2);
    ctx.fillStyle = Math.abs(r.pitchAngle) <= r.corridorHalfWidth ? '#4ade80' : '#ef4444';
    ctx.fillRect(gx - 7, needleY - 5, gw + 14, 10);

    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ENTRY ANGLE', gx + gw / 2, gy - 14);
    ctx.fillStyle = '#fde047'; ctx.font = '10px Fredoka, sans-serif';
    ctx.fillText('SHALLOW [W]', gx + gw / 2, gy + 16);
    ctx.fillStyle = '#f87171';
    ctx.fillText('STEEP [S]', gx + gw / 2, gy + gh - 8);

    // Heatshield Thermometer Bar on Right
    const hx = LOGICAL_W - 158, hy = 120, hw = 32, hh = 340;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 10); ctx.fill(); ctx.stroke();
    const heatH = (r.heat / 100) * (hh - 8);
    ctx.fillStyle = r.heat > 75 ? '#ef4444' : r.heat > 50 ? '#f97316' : '#38bdf8';
    ctx.fillRect(hx + 4, hy + hh - 4 - heatH, hw - 8, heatH);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Fredoka, sans-serif';
    ctx.fillText('HEATSHIELD', hx + hw / 2, hy - 14);
    ctx.fillStyle = '#bae6fd'; ctx.font = '10px Fredoka, sans-serif';
    ctx.fillText('[A/D] Roll Cool', hx + hw / 2, hy + hh + 18);

    // Orion Capsule + Dynamic Bow-Shock Plasma Shell
    const cx = r.capsuleX, cy = 265;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.45 - r.pitchAngle * 0.6 + r.rollBank * 0.4);

    // Bow shock wave arc
    ctx.strokeStyle = r.heat > 75 ? 'rgba(239, 68, 68, 0.95)' : 'rgba(251, 146, 60, 0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 8, 48, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    const plasmaGrad = ctx.createRadialGradient(0, 18, 12, 0, 18, 86);
    plasmaGrad.addColorStop(0, r.heat > 75 ? 'rgba(239, 68, 68, 0.95)' : 'rgba(249, 115, 22, 0.88)');
    plasmaGrad.addColorStop(0.55, 'rgba(251, 191, 36, 0.4)');
    plasmaGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = plasmaGrad;
    ctx.beginPath(); ctx.arc(0, 18, 86, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -28); ctx.lineTo(18, -28); ctx.lineTo(35, 14); ctx.lineTo(-35, 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Heatshield glowing rim
    ctx.fillStyle = r.heat > 75 ? '#ef4444' : '#ea580c';
    ctx.beginPath(); ctx.ellipse(0, 16, 36, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (state.sampleCollected) {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Clear Step-by-Step Phase 1 HUD Guide + Cryo Vent Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 250, 14, 500, 56, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PHASE 1: SKIP-REENTRY (KEEP NEEDLE IN GREEN CORRIDOR)', LOGICAL_W / 2, 34);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '11.5px Fredoka, sans-serif';
    ctx.fillText('[W/S] Pitch Angle • [A/D] Roll to Cool Heatshield • [SPACE] Cryo Vent', LOGICAL_W / 2, 54);

    // Cryo Vent Charge Bar next to Heatshield
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(hx - 145, hy + hh - 36, 130, 34, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = r.coolantCharge >= 0.99 ? '#38bdf8' : '#64748b';
    ctx.fillRect(hx - 141, hy + hh - 13, 122 * r.coolantCharge, 7);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10.5px Fredoka, sans-serif';
    ctx.fillText(r.coolantCharge >= 0.99 ? '❄️ [SPACE] VENT READY' : `❄️ CRYO ${Math.round(r.coolantCharge * 100)}%`, hx - 80, hy + hh - 20);

    // Compact Aerothermodynamic & Sample Vault Readout Card (clear of gauges & capsule)
    const vaultTemp = r.sampleVaultTempC ?? -80.0;
    const vaultColor = vaultTemp >= 0 ? '#ef4444' : vaultTemp >= -20 ? '#fbbf24' : '#38bdf8';
    const cardX = 180, cardY = 124, cardW = 196, cardH = state.sampleCollected ? 114 : 94;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 10); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 10px Fredoka, sans-serif';
    ctx.fillText('AEROTHERM TELEMETRY', cardX + 12, cardY + 18);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 12px Fredoka, sans-serif';
    ctx.fillText(`Mach ${(r.mach ?? 32.0).toFixed(1)}`, cardX + 12, cardY + 38);
    const gColor = (r.gLoad ?? 1.0) >= 7.5 ? '#ef4444' : (r.gLoad ?? 1.0) >= 5.0 ? '#fbbf24' : '#4ade80';
    ctx.fillStyle = gColor;
    ctx.textAlign = 'right';
    ctx.fillText(`${(r.gLoad ?? 1.0).toFixed(1)} G (Pk ${(r.peakG ?? 1.0).toFixed(1)})`, cardX + cardW - 12, cardY + 38);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1'; ctx.font = 'bold 11px Fredoka, sans-serif';
    ctx.fillText('Sample Vault', cardX + 12, cardY + 60);
    ctx.fillStyle = vaultColor; ctx.font = 'bold 12.5px Fredoka, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${vaultTemp.toFixed(1)}°C`, cardX + cardW - 12, cardY + 60);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8'; ctx.font = '10.5px Fredoka, sans-serif';
    const profileLabel = state.missionChoices?.reentry || 'Standard Entry';
    ctx.fillText(`Profile: ${profileLabel}`, cardX + 12, cardY + 80);

    if (state.sampleCollected) {
      const purity = r.samplePurity ?? 100;
      ctx.fillStyle = purity >= 100 ? '#4ade80' : purity >= 75 ? '#fbbf24' : '#ef4444';
      ctx.font = 'bold 11px Fredoka, sans-serif';
      ctx.fillText(`Cryo Sample Purity: ${purity}%`, cardX + 12, cardY + 100);
    }
    ctx.restore();

    // Subtle pulsing DSN Ionization Blackout badge (35-85 km altitude)
    if (r.blackoutActive) {
      ctx.save();
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.008);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(127, 29, 29, 0.88)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 126, 414, 252, 28, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fecaca'; ctx.font = 'bold 11.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('📡 DSN IONIZATION BLACKOUT', LOGICAL_W / 2, 432);
      ctx.restore();
    }

    if (Math.abs(r.pitchAngle) > r.corridorHalfWidth) {
      ctx.fillStyle = r.pitchAngle < 0 ? '#dc2626' : '#d97706';
      ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 190, 78, 380, 36, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(r.pitchAngle < 0 ? '⚠️ TOO STEEP: PRESS [W]!' : '⚠️ TOO SHALLOW: PRESS [S]!', LOGICAL_W / 2, 101);
    }
  } else {
    // Daylight Ocean Recovery Sky
    const daySky = ctx.createLinearGradient(0, 0, 0, 515);
    daySky.addColorStop(0, '#0369a1');
    daySky.addColorStop(0.6, '#38bdf8');
    daySky.addColorStop(1, '#e0f2fe');
    ctx.fillStyle = daySky;
    ctx.fillRect(0, 0, LOGICAL_W, 515);

    // Sweeping Recovery Carrier Spotlights
    ctx.fillStyle = 'rgba(253, 224, 71, 0.12)';
    const beamSweep = Math.sin(r.wavePhase * 0.6) * 45;
    ctx.beginPath();
    ctx.moveTo(r.shipX - 35, 505); ctx.lineTo(r.shipX - 140 + beamSweep, 0); ctx.lineTo(r.shipX - 30 + beamSweep, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r.shipX + 35, 505); ctx.lineTo(r.shipX + 30 - beamSweep, 0); ctx.lineTo(r.shipX + 140 - beamSweep, 0);
    ctx.closePath(); ctx.fill();

    // Fluffy clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(240, 150, 32, 0, Math.PI * 2); ctx.arc(275, 145, 42, 0, Math.PI * 2); ctx.arc(315, 152, 30, 0, Math.PI * 2);
    ctx.arc(780, 190, 28, 0, Math.PI * 2); ctx.arc(815, 185, 38, 0, Math.PI * 2); ctx.arc(850, 192, 26, 0, Math.PI * 2);
    ctx.fill();

    // Animated Ocean Waves
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(0, 510, LOGICAL_W, LOGICAL_H - 510);

    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= LOGICAL_W; x += 20) {
      const wy = 514 + Math.sin(x * 0.03 + r.wavePhase) * 4;
      if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();

    // NASA Recovery Carrier Ship & Visual Landing Zone Beacon
    const sx = r.shipX, sy = 516 + Math.sin(r.wavePhase * 0.8) * 3;
    const distToShip = Math.abs(r.capsuleX - sx);
    const inBullseye = distToShip <= 85;

    // Carrier Landing Zone Beacon on the Ocean Surface
    ctx.save();
    ctx.strokeStyle = inBullseye ? 'rgba(74, 222, 128, 0.9)' : 'rgba(56, 189, 248, 0.7)';
    ctx.fillStyle = inBullseye ? 'rgba(34, 197, 94, 0.18)' : 'rgba(56, 189, 248, 0.1)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(sx, 514, 85, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Vertical Recovery Corridor Guide Lines
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = inBullseye ? 'rgba(74, 222, 128, 0.55)' : 'rgba(253, 224, 71, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 85, 510); ctx.lineTo(sx - 85, 220);
    ctx.moveTo(sx + 85, 510); ctx.lineTo(sx + 85, 220);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live Horizontal Offset Badge above Carrier
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = inBullseye ? '#4ade80' : '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(sx - 78, 456, 156, 22, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = inBullseye ? '#4ade80' : '#fde047';
    ctx.font = 'bold 10px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(inBullseye ? `🎯 BULLSEYE LOCK (${Math.round(distToShip)}m)` : `📡 CARRIER OFFSET: ${Math.round(distToShip)}m`, sx, 471);
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-92, -10); ctx.lineTo(92, -10); ctx.lineTo(74, 15); ctx.lineTo(-74, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-62, -15, 96, 5);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(32, -38, 28, 28);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(36, -32, 16, 7);
    ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P4 NASA RECOVERY CARRIER', 0, 34);
    ctx.restore();

    // Left-side Parachute Altitude & Deployment Window Gauge (24km -> 0km)
    const ax = 76, ay = 120, aw = 34, ah = 340;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(ax, ay, aw, ah, 9); ctx.fill(); ctx.stroke();

    // Optimal Main Chute Deployment Band (18 km down to 8 km out of 24 km)
    const optTopY = ay + ((24 - 18) / 24) * ah;
    const optBotY = ay + ((24 - 8) / 24) * ah;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.36)';
    ctx.fillRect(ax + 3, optTopY, aw - 6, optBotY - optTopY);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ax + 3, optTopY, aw - 6, optBotY - optTopY);

    const altMarkerY = ay + ((24 - Math.max(0, Math.min(24, r.altitude))) / 24) * ah;
    ctx.fillStyle = (r.altitude >= 8 && r.altitude <= 18) ? '#4ade80' : '#fde047';
    ctx.fillRect(ax - 6, altMarkerY - 4, aw + 12, 8);

    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CHUTE ALT', ax + aw / 2, ay - 10);
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 9.5px Fredoka, sans-serif';
    ctx.fillText('8-18km OPT', ax + aw / 2, ay + ah + 15);

    const cx = r.capsuleX, cy = r.capsuleY;
    // Drogue / Triple Main Parachutes (visible during descent)
    if (r.phase === 'CHUTES') {
      if (r.chutesDeployed) {
        const sc = r.chuteScale;
        const sway = Math.sin(r.wavePhase * 0.7) * 6;
        const offsets = [-42 * sc, 0, 42 * sc];
        for (const ox of offsets) {
          ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + ox + sway, cy - 78 * sc); ctx.stroke();
          ctx.fillStyle = ox === 0 ? '#f97316' : '#f8fafc';
          ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(cx + ox + sway, cy - 78 * sc, 24 * sc, Math.PI, 0);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else {
        // Drogue chute deployed until Main Chutes open
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 48); ctx.stroke();
        ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy - 48, 13, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 205, 58, 410, 42, 14); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 17px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('PRESS [SPACE] FOR TRIPLE MAIN CHUTES!', LOGICAL_W / 2, 85);
      }
    }

    // Splashed Foam Ring + Orange Flotation Collar
    if (r.phase === 'SPLASHED') {
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, 520, 32 + r.splashTimer * 28, 7 + r.splashTimer * 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Inflating orange flotation collar
      const cs = r.collarScale;
      ctx.fillStyle = '#f97316'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx - 26, cy + 4, 11 * cs, 8 * cs, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + 26, cy + 4, 11 * cs, 8 * cs, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Phase 2 Intuitive Guidance Pill + Wind Direction Indicator
    if (r.phase === 'CHUTES') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 260, 12, 520, 38, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center';
      const windDir = r.windForce >= 0 ? 'WIND ➡️' : '⬅️ WIND';
      ctx.fillText(`PHASE 2: ${windDir} | [A/D] Steer Capsule to Ship Beam • [J/L] Steer P4 Carrier`, LOGICAL_W / 2, 35);
    }

    // Orion Capsule
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-14, -20); ctx.lineTo(14, -20); ctx.lineTo(27, 12); ctx.lineTo(-27, 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillRect(-27, 12, 54, 5);
    ctx.restore();

    // Rescue Helicopter hovering & lowering hoist during SPLASHED
    const hoistProg = r.phase === 'SPLASHED' ? Math.min(1, r.splashTimer / 1.4) : 0;
    drawHelicopter(ctx, r.heliX, r.heliY, hoistProg, cx, cy);
  }

  for (const pt of state.lunarParticles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.6);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (r.aborted && r.abortAtMs > 0) {
    const expY = r.phase === 'PLASMA' ? 265 : r.capsuleY;
    const elapsedSec = (performance.now() - r.abortAtMs) / 1000;
    const bursts = [
      { dx: 0, dy: 0, delay: 0, dur: 0.85, size: 152 },
      { dx: 24, dy: -16, delay: 0.16, dur: 0.75, size: 112 }
    ];
    for (const b of bursts) {
      const p = (elapsedSec - b.delay) / b.dur;
      if (p >= 0 && p <= 1) {
        drawExplosionSprite(ctx, r.capsuleX + b.dx, expY + b.dy, p, b.size);
      }
    }
  }

  drawCanvasControlBar(
    ctx,
    LOGICAL_W,
    r.phase === 'PLASMA'
      ? [
          { key: 'W / S', label: 'Green Entry Corridor' },
          { key: 'SPACE', label: 'Cryo Heat Vent' },
          { key: 'I / K', label: 'P2 Heatshield' }
        ]
      : [
          { key: 'SPACE', label: 'Deploy 3 Chutes' },
          { key: 'A / D', label: 'Steer Capsule' },
          { key: 'J / L', label: 'Move Recovery Ship' }
        ]
  );
}
