import { LOGICAL_W, LOGICAL_H } from './config.js';
import { state } from './state.js';
import { playTone } from './audio.js';
import { setStageBanner } from './hud.js';
import { createStarfield, drawStarfield, drawSpinningEarth, drawPixelMoon, drawRoverMountedCrew } from './sprites.js';
import { drawCraft, craftBox, drawLaunchPad, CRAFT_GEO, PAD_GEO } from './spacecraft.js';

const TRANSITION_STARS = createStarfield(110, LOGICAL_W, LOGICAL_H, 42199);

const snapEven = (v) => Math.round(v / 2) * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function smootherstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function cubicBezierPt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
}

function cubicBezierTan(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return Math.atan2(dy, dx);
}

function drawLayeredPlume(ctx, length, width, nowSec, primary = '#f97316', core = '#fef9c3') {
  const breathe = 1 + Math.sin(nowSec * 18) * 0.06 + Math.cos(nowSec * 29) * 0.04;
  const L = length * breathe;

  const halo = ctx.createRadialGradient(-8, 0, 2, -L * 0.35, 0, L * 0.85);
  halo.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
  halo.addColorStop(0.5, 'rgba(249, 115, 22, 0.2)');
  halo.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(-L * 0.3, 0, L * 0.72, width * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();

  const outerGrad = ctx.createLinearGradient(0, 0, -L, 0);
  outerGrad.addColorStop(0, primary);
  outerGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.moveTo(0, -width);
  ctx.quadraticCurveTo(-L * 0.55, -width * 0.65, -L, 0);
  ctx.quadraticCurveTo(-L * 0.55, width * 0.65, 0, width);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.moveTo(0, -width * 0.48);
  ctx.quadraticCurveTo(-L * 0.32, -width * 0.22, -L * 0.56, 0);
  ctx.quadraticCurveTo(-L * 0.32, width * 0.22, 0, width * 0.48);
  ctx.closePath();
  ctx.fill();
}

export function startTransition({ kind, badge, title, subtitle, nextStage, duration = 4.8, onComplete }) {
  const destLabel = nextStage || badge || title;
  state.stage = 'TRANSITION';
  state.transition = {
    kind,
    badge,
    title,
    subtitle,
    nextStage: destLabel,
    elapsed: 0,
    duration,
    particles: [],
    onComplete
  };
  setStageBanner(
    badge,
    title,
    subtitle,
    `Next: ${destLabel} &nbsp;&bull;&nbsp; <kbd>SPACE</kbd> or Click to Start Next Stage`,
    { showTickets: false, showSkip: false, showNext: false }
  );
  playTone(330, 'triangle', 0.16, 0.09);
  setTimeout(() => playTone(494, 'triangle', 0.22, 0.09), 110);
}

export function skipTransition() {
  if (state.stage !== 'TRANSITION' || !state.transition) return;
  const cb = state.transition.onComplete;
  state.transition = null;
  playTone(660, 'triangle', 0.14, 0.08);
  if (cb) cb();
}

export function updateTransition(dt) {
  const tr = state.transition;
  if (!tr) return;
  tr.elapsed += dt;

  // Update smooth transition particles
  for (let i = tr.particles.length - 1; i >= 0; i--) {
    const pt = tr.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.size += (pt.grow || 0) * dt;
    pt.life -= dt;
    if (pt.life <= 0) tr.particles.splice(i, 1);
  }

  const t = Math.min(1, tr.elapsed / tr.duration);
  const ease = smootherstep(t);

  if (tr.kind === 'ORBITAL_INSERTION') {
    // Emit TLI main-engine exhaust only while the S-IVB / SLA stack is burning (ease < 0.26)
    if (ease < 0.26 && tr.particles.length < 70) {
      const p0 = { x: 140, y: 430 }, p1 = { x: 350, y: 255 }, p2 = { x: 670, y: 195 }, p3 = { x: 920, y: 240 };
      const pos = cubicBezierPt(p0, p1, p2, p3, ease);
      const ang = cubicBezierTan(p0, p1, p2, p3, ease);
      const ex = pos.x - Math.cos(ang) * 46;
      const ey = pos.y - Math.sin(ang) * 46;
      tr.particles.push({
        x: ex + (Math.random() - 0.5) * 4,
        y: ey + (Math.random() - 0.5) * 4,
        vx: -Math.cos(ang) * (85 + Math.random() * 45) + (Math.random() - 0.5) * 18,
        vy: -Math.sin(ang) * (85 + Math.random() * 45) + (Math.random() - 0.5) * 18,
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.8,
        size: 3 + Math.random() * 3,
        grow: 4,
        color: Math.random() < 0.45 ? '#fde047' : '#f97316'
      });
    }
  } else if (tr.kind === 'HANGAR_ROLLOUT' && tr.particles.length < 45) {
    const rx = 240 + ease * 320;
    tr.particles.push({
      x: rx + (Math.random() - 0.5) * 34,
      y: 462,
      vx: (Math.random() - 0.5) * 45,
      vy: -20 - Math.random() * 28,
      life: 0.7,
      maxLife: 0.7,
      size: 6 + Math.random() * 6,
      grow: 10,
      color: 'rgba(226, 232, 240, 0.45)'
    });
  } else if (tr.kind === 'LUNAR_LIFTOFF_PREP' && t >= 0.32 && tr.particles.length < 55) {
    const liftT = smootherstep((t - 0.32) / 0.68);
    const liftY = liftT * 250;
    const landerX = 380;
    const groundY = 455;
    const seamY = groundY - Math.round(CRAFT_GEO.landerSeamY * 0.62) - liftY;
    tr.particles.push({
      x: landerX + (Math.random() - 0.5) * 20,
      y: seamY + 8,
      vx: (Math.random() - 0.5) * 75,
      vy: 55 + Math.random() * 65,
      life: 0.5 + Math.random() * 0.25,
      maxLife: 0.75,
      size: 3.5 + Math.random() * 3.5,
      grow: 5,
      color: Math.random() < 0.45 ? '#fde047' : (Math.random() < 0.6 ? '#fb923c' : 'rgba(226, 232, 240, 0.65)')
    });
  } else if (tr.kind === 'ENTRY_INTERFACE') {
    const p0 = { x: 185, y: 225 }, p1 = { x: 410, y: 255 }, p2 = { x: 645, y: 315 }, p3 = { x: 875, y: 390 };
    const pos = cubicBezierPt(p0, p1, p2, p3, ease);
    const ang = cubicBezierTan(p0, p1, p2, p3, ease);
    if (tr.particles.length < 65) {
      tr.particles.push({
        x: pos.x + Math.cos(ang) * 12 + (Math.random() - 0.5) * 12,
        y: pos.y + Math.sin(ang) * 12 + (Math.random() - 0.5) * 12,
        vx: -Math.cos(ang) * (105 + Math.random() * 55),
        vy: -Math.sin(ang) * (105 + Math.random() * 55) - 18,
        life: 0.45,
        maxLife: 0.45,
        size: 2.5 + Math.random() * 3,
        grow: 2,
        color: Math.random() < 0.4 ? '#fde047' : '#fb923c'
      });
    }
  }

  if (tr.elapsed >= tr.duration) {
    skipTransition();
  }
}

// Centre of a craft crop relative to its anchor, so a sprite can be rotated about its own middle.
function craftCentre(id, opts) {
  const b = craftBox(id, opts);
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, box: b };
}

function drawDetailedTransitionRover(ctx, bodyColor, rollAngle, crewIdxA = 0, crewIdxB = 2) {
  ctx.save();

  // Headlight beam casting forward
  const beam = ctx.createLinearGradient(22, -14, 84, -4);
  beam.addColorStop(0, 'rgba(253, 224, 71, 0.34)');
  beam.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(22, -16);
  ctx.lineTo(84, -22);
  ctx.lineTo(84, 0);
  ctx.lineTo(22, -10);
  ctx.closePath();
  ctx.fill();

  // Ka-band dish mast & gold RTG rear pack
  ctx.fillStyle = '#ca8a04';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.fillRect(-29, -24, 9, 11);
  ctx.strokeRect(-29, -24, 9, 11);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-18, -22);
  ctx.lineTo(-22, -35);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(-22, -37, 5, Math.PI * 0.25, Math.PI * 1.25);
  ctx.fill();

  // Standing customized EVA crew characters on top of the rover chassis (facing right = 0 rad)
  if (crewIdxB >= 0) {
    drawRoverMountedCrew(ctx, crewIdxB, -9, -19, 0, 0.68);
  }
  if (crewIdxA >= 0) {
    drawRoverMountedCrew(ctx, crewIdxA, 9, -19, 0, 0.68);
  }

  // Rocker-bogie suspension frame & main rover chassis
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(-26, -21, 52, 13, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fde047';
  ctx.fillRect(22, -17, 4, 5);

  // Three lunar mesh wheels resting cleanly at y = 0
  for (const wx of [-18, 0, 18]) {
    ctx.save();
    ctx.translate(wx, -7.5);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(rollAngle);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(4.5, 0);
    ctx.moveTo(0, -4.5);
    ctx.lineTo(0, 4.5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawTransition(ctx) {
  const tr = state.transition;
  if (!tr) return;
  const t = Math.min(1, tr.elapsed / tr.duration);
  const ease = smootherstep(t);
  const nowSec = tr.elapsed;

  // Deep aerospace backdrop + subtle nebula glow
  const bg = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  bg.addColorStop(0, '#040816');
  bg.addColorStop(0.55, '#0b152a');
  bg.addColorStop(1, '#162238');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  const neb = ctx.createRadialGradient(LOGICAL_W * 0.72, 220, 20, LOGICAL_W * 0.72, 220, 440);
  neb.addColorStop(0, 'rgba(56, 189, 248, 0.11)');
  neb.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Smooth organic parallax starfield (zero lattice diagonals)
  drawStarfield(ctx, TRANSITION_STARS, LOGICAL_W, LOGICAL_H, {
    offsetX: tr.elapsed * 16,
    nowSec
  });

  // Scene-specific smooth animations
  if (tr.kind === 'HANGAR_ROLLOUT') {
    const padY = 472;
    const skyGlow = ctx.createLinearGradient(0, 220, 0, padY);
    skyGlow.addColorStop(0, 'rgba(249, 115, 22, 0)');
    skyGlow.addColorStop(1, 'rgba(249, 115, 22, 0.14)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 220, LOGICAL_W, padY - 220);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, padY, LOGICAL_W, LOGICAL_H - padY);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, padY, LOGICAL_W, 5);

    const rx = snapEven(240 + ease * 320);
    const RS = 0.38;  // rocket art scale
    const PS = 0.19;  // launcher art scale (launcher = rocket / 2, same ratio as Stage 1B)
    const deckY = padY - snapEven((PAD_GEO.groundY - PAD_GEO.deckY) * PS); // crawler tracks sit on the pad line
    const tipY = deckY - snapEven(CRAFT_GEO.stackIdleBaseY * RS);
    const lit = t >= 0.8;

    // Main engine pre-ignition glow at end of pad rollout
    if (t >= 0.72) {
      const igPulse = Math.min(1, (t - 0.72) / 0.2);
      ctx.save();
      ctx.fillStyle = `rgba(251, 146, 60, ${0.42 * igPulse})`;
      ctx.beginPath();
      ctx.ellipse(rx, padY - 20, 44 + igPulse * 28, 12 + igPulse * 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Crawler-transporter carries the mobile launcher + stack: the deck hides the engine bells
    drawCraft(ctx, lit ? 'stackBody' : 'stackIdle', rx, tipY, { scale: RS });
    drawLaunchPad(ctx, rx, deckY, { scale: PS });
    if (lit) {
      const step = Math.floor(nowSec * 14) % 3;
      drawCraft(ctx, 'stackFlame', rx, tipY, { scale: RS, sy: 0.35 + clamp01((t - 0.8) / 0.12) * 0.5 + step * 0.06 });
    }

    // Sliding hangar blast doors
    const doorSlide = ease * 380;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-doorSlide, 0, 310, padY);
    ctx.fillRect(LOGICAL_W - 310 + doorSlide, 0, 310, padY);

    const countdown = t < 0.25 ? 'T-3' : t < 0.5 ? 'T-2' : t < 0.75 ? 'T-1' : 'IGNITION';
    ctx.fillStyle = t >= 0.75 ? '#4ade80' : '#fde047';
    ctx.font = 'bold 38px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(countdown, LOGICAL_W / 2, 200);
  } else if (tr.kind === 'ORBITAL_INSERTION') {
    const p0 = { x: 140, y: 430 }, p1 = { x: 350, y: 255 }, p2 = { x: 670, y: 195 }, p3 = { x: 920, y: 240 };

    // Departing animated spinning Earth on the bottom-left & destination Pixel Moon on the right
    drawSpinningEarth(ctx, 130, 470, 96, nowSec, { halo: true });
    drawPixelMoon(ctx, 985, 235, 58, { halo: true });

    // Planned orbital dashed path + illuminated flown trail
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let s = 0.04; s <= ease; s += 0.04) {
      const pt = cubicBezierPt(p0, p1, p2, p3, s);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();

    const pos = cubicBezierPt(p0, p1, p2, p3, ease);
    const ang = cubicBezierTan(p0, p1, p2, p3, ease);

    // Full Apollo Transposition, Docking & Extraction sequence:
    // 1) 0008 csmSla (TLI burn with tail plume)
    // 2) 0009 csmSlaOpen (engine cutoff, SLA petals crack open)
    // 3) 0010 command + 0011 lander (CSM separates, flips 180 deg, and docks with LM while SLA petals drift back)
    // 4) 0012 docked (CSM + LM coasting cleanly toward the Moon — no plume on lander legs)
    const SC = 0.36;
    ctx.save();
    ctx.translate(snapEven(pos.x), snapEven(pos.y));
    ctx.rotate(ang); // +x = direction of flight

    if (ease < 0.26) {
      const body = craftCentre('csmSla', { scale: SC });
      ctx.save();
      ctx.translate(-body.box.h / 2, 0);
      drawLayeredPlume(ctx, 54, 9, nowSec);
      ctx.restore();

      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.translate(-body.x, -body.y);
      drawCraft(ctx, 'csmSla', 0, 0, { scale: SC });
      ctx.restore();
    } else if (ease < 0.44) {
      const openT = clamp01((ease - 0.26) / 0.18);
      const body = craftCentre('csmSlaOpen', { scale: SC });
      if (openT < 0.45) {
        ctx.fillStyle = `rgba(241, 245, 249, ${0.5 * (1 - openT / 0.45)})`;
        ctx.beginPath(); ctx.arc(0, 0, 14 + openT * 42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.translate(-body.x, -body.y);
      drawCraft(ctx, 'csmSlaOpen', 0, 0, { scale: SC });
      ctx.restore();
    } else if (ease < 0.74) {
      const tdT = clamp01((ease - 0.44) / 0.30);
      const tdEase = smootherstep(tdT);
      const lm = craftCentre('lander', { scale: SC });
      const cm = craftCentre('command', { scale: SC });

      // Peeling SLA petals drifting behind as the CSM turns around to dock
      ctx.save();
      ctx.rotate(Math.PI / 2);
      for (const [id, side] of [['slaPetalL', -1], ['slaPetalR', 1]]) {
        const pc = craftCentre(id, { scale: SC });
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - tdT * 0.95);
        ctx.translate( side * (16 + tdEase * 48), 18 + tdEase * 44);
        ctx.rotate(side * (0.25 + tdEase * 0.95));
        drawCraft(ctx, id, -pc.x, -pc.y, { scale: SC });
        ctx.restore();
      }
      ctx.restore();

      // Lunar Lander (0011) waiting in adapter attitude (ascent stage facing +x toward CSM)
      const lmShiftX = -18 + tdEase * 10;
      ctx.save();
      ctx.translate(snapEven(lmShiftX), 0);
      ctx.rotate(Math.PI / 2);
      drawCraft(ctx, 'lander', -lm.x, -lm.y, { scale: SC });
      ctx.restore();

      // Command Module (0010) pulls forward, pitches 180 deg, and backs into docking capture
      const flipT = clamp01(tdT / 0.65);
      const dockT = clamp01((tdT - 0.55) / 0.45);
      const cmShiftX = 42 - smootherstep(dockT) * 14;
      const cmRot = Math.PI / 2 + smootherstep(flipT) * Math.PI;
      ctx.save();
      ctx.translate(snapEven(cmShiftX), 0);
      ctx.rotate(cmRot);
      drawCraft(ctx, 'command', -cm.x, -cm.y, { scale: SC });
      ctx.restore();
    } else {
      const dockFlash = clamp01(1 - (ease - 0.74) / 0.10);
      if (dockFlash > 0) {
        ctx.fillStyle = `rgba(186, 230, 253, ${0.55 * dockFlash})`;
        ctx.beginPath(); ctx.arc(4, 0, 14 + (1 - dockFlash) * 28, 0, Math.PI * 2); ctx.fill();
      }
      // Docked stack (0012): rotated -PI/2 so the CSM Service Module is at the rear (-x) and Lander leads (+x),
      // ensuring no engine plume ever fires out of the Lander's legs.
      const docked = craftCentre('docked', { scale: SC });
      ctx.save();
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-docked.x, -docked.y);
      drawCraft(ctx, 'docked', 0, 0, { scale: SC });
      ctx.restore();
    }
    ctx.restore();
  } else if (tr.kind === 'LUNAR_UNDOCK') {
    // Pixel Moon rising below the orbital undocking trajectory
    drawPixelMoon(ctx, LOGICAL_W / 2, 760, 360, { halo: true });

    const S = 0.44;
    if (ease < 0.22) {
      // Phase 1: Docked CSM + Lander (0012) in low lunar orbit before undocking release
      const dockPos = { x: 525, y: 252 };
      const dc = craftCentre('docked', { scale: S });
      ctx.save();
      ctx.translate(snapEven(dockPos.x), snapEven(dockPos.y));
      ctx.rotate(-Math.PI / 2 + 0.08);
      drawCraft(ctx, 'docked', -dc.x, -dc.y, { scale: S });
      ctx.restore();

      if (ease >= 0.16) {
        const puff = (ease - 0.16) / 0.06;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.55 * (1 - puff * 0.5)})`;
        ctx.beginPath();
        ctx.arc(525, 252, 10 + puff * 18, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Phase 2: Clean separation from 0012 (docked) -> 0013 (Command Module burn) + 0014/0011 (Lunar Lander)
      const sepT = clamp01((ease - 0.22) / 0.78);
      const sepEase = smootherstep(sepT);

      // Command Module (0013 burn -> 0010 coast) pulls away upper-left
      const cmPos = cubicBezierPt(
        { x: 500, y: 246 },
        { x: 438, y: 224 },
        { x: 368, y: 206 },
        { x: 295, y: 196 },
        sepEase
      );
      const cm = craftCentre('command', { scale: S });
      ctx.save();
      ctx.translate(snapEven(cmPos.x), snapEven(cmPos.y));
      ctx.rotate(-Math.PI / 2 - 0.08 * sepEase);
      if (sepT < 0.68) {
        drawCraft(ctx, 'commandFlame', -cm.x, -cm.y, { scale: S, sy: 0.9 + (Math.floor(nowSec * 14) % 3) * 0.15 });
        drawCraft(ctx, 'commandBody', -cm.x, -cm.y, { scale: S });
      } else {
        drawCraft(ctx, 'command', -cm.x, -cm.y, { scale: S });
      }
      ctx.restore();

      // Lunar Lander (0014 landerUndock -> 0011 lander with powered descent burn) arcs down toward the Moon
      const l0 = { x: 548, y: 266 }, l1 = { x: 596, y: 298 }, l2 = { x: 646, y: 348 }, l3 = { x: 678, y: 414 };
      const lPos = cubicBezierPt(l0, l1, l2, l3, sepEase);
      const plume = { scale: S, sx: 0.8, sy: 0.95 + (Math.floor(nowSec * 14) % 3) * 0.15 };
      ctx.save();
      ctx.translate(snapEven(lPos.x), snapEven(lPos.y));
      ctx.rotate(0.16 * (1 - sepEase));
      if (sepT >= 0.28) {
        drawCraft(ctx, 'commandFlame', 0, snapEven(CRAFT_GEO.landerBellY * S) - craftBox('commandFlame', plume).t, plume);
      }
      drawCraft(ctx, sepT < 0.35 ? 'landerUndock' : 'lander', 0, 0, { scale: S });
      ctx.restore();
    }
  } else if (tr.kind === 'ROVER_DEPLOY') {
    // Spinning Earth hanging in the lunar sky
    drawSpinningEarth(ctx, 920, 115, 34, nowSec, { halo: true });

    const groundY = 445;
    const surfaceGrad = ctx.createLinearGradient(0, groundY, 0, LOGICAL_H);
    surfaceGrad.addColorStop(0, '#475569');
    surfaceGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = surfaceGrad;
    ctx.fillRect(0, groundY, LOGICAL_W, LOGICAL_H - groundY);

    // Subtle horizon rim line & regolith pebbles
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(LOGICAL_W, groundY);
    ctx.stroke();

    // Lunar lander planted squarely on the surface (footpads flush on groundY)
    const landerX = 215;
    const rampOpen = smootherstep(Math.min(1, t / 0.3));
    const LM_T = 0.62;
    const halfW = Math.round(CRAFT_GEO.landerHalfW * LM_T);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(landerX, groundY + 2, halfW - 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCraft(ctx, 'lander', landerX, groundY, { scale: LM_T });

    // Egress ramp lowering from the descent stage
    const rampX0 = landerX + Math.round(halfW * 0.66);
    const rampX1 = rampX0 + 70 * rampOpen;
    const rampY1 = groundY - 26 * (1 - rampOpen);
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(rampX0, groundY - 26); ctx.lineTo(rampX1, rampY1); ctx.stroke();
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(rampX0, groundY - 26); ctx.lineTo(rampX1, rampY1); ctx.stroke();

    // Dual crewed 6-wheel LTV Rovers driving off the lowered ramp onto lunar dust
    const rollT = smootherstep(Math.max(0, (t - 0.18) / 0.82));
    const r1x = 328 + rollT * 360;
    const r2x = 278 + rollT * 245;
    for (const [rx, col, cA, cB] of [[r1x, '#f59e0b', 0, 2], [r2x, '#38bdf8', 1, 3]]) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(rx, groundY + 2, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(rx, groundY);
      drawDetailedTransitionRover(ctx, col, rollT * 14, cA, cB);
      ctx.restore();
    }
  } else if (tr.kind === 'LUNAR_LIFTOFF_PREP') {
    // Cutscene 4 (Stage 3B -> 3C): Lunar Surface Liftoff Prep — Ascent stage blasts off from Descent stage on pad
    drawSpinningEarth(ctx, 920, 115, 34, nowSec, { halo: true });

    const groundY = 455;
    const surfaceGrad = ctx.createLinearGradient(0, groundY, 0, LOGICAL_H);
    surfaceGrad.addColorStop(0, '#475569');
    surfaceGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = surfaceGrad;
    ctx.fillRect(0, groundY, LOGICAL_W, LOGICAL_H - groundY);

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(LOGICAL_W, groundY);
    ctx.stroke();

    // Parked empty LTV-1 & LTV-2 rovers watching liftoff from Point A perimeter
    for (const [rx, col] of [[650, '#f59e0b'], [745, '#38bdf8']]) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(rx, groundY + 2, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(rx, groundY);
      drawDetailedTransitionRover(ctx, col, 0, -1, -1);
      ctx.restore();
    }

    const landerX = 380;
    const LM_T = 0.62;
    const halfW = Math.round(CRAFT_GEO.landerHalfW * LM_T);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(landerX, groundY + 2, halfW - 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    if (t < 0.32) {
      drawCraft(ctx, 'lander', landerX, groundY, { scale: LM_T });
    } else {
      const liftT = smootherstep((t - 0.32) / 0.68);
      const liftY = snapEven(liftT * 250);

      // Pyrotechnic separation flash on the descent stage deck
      if (t < 0.46) {
        const flashA = 1 - (t - 0.32) / 0.14;
        const seamY = groundY - snapEven(CRAFT_GEO.landerSeamY * LM_T);
        ctx.fillStyle = `rgba(254, 240, 138, ${0.75 * flashA})`;
        ctx.beginPath();
        ctx.ellipse(landerX, seamY, 44 + (1 - flashA) * 32, 12 + (1 - flashA) * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Descent stage remains on the lunar pad
      drawCraft(ctx, 'landerDescent', landerX, groundY, { scale: LM_T });

      // Ascent stage climbs vertically with its ascent engine firing underneath
      const seamAscY = groundY - liftY - snapEven(CRAFT_GEO.landerSeamY * LM_T);
      const plume = { scale: 0.48, sx: 0.75, sy: 0.85 + (Math.floor(nowSec * 16) % 3) * 0.16 };
      drawCraft(ctx, 'commandFlame', landerX, seamAscY - craftBox('commandFlame', plume).t, plume);
      drawCraft(ctx, 'landerAscent', landerX, groundY - liftY, { scale: LM_T });
    }
  } else if (tr.kind === 'ENTRY_INTERFACE') {
    // Animated spinning Earth limb below with glowing ionized atmospheric entry boundary
    const earthCx = LOGICAL_W / 2;
    const earthCy = 890;
    const earthRadius = 460;

    // Outer thermosphere atmospheric scatter aura
    const atmoGlow = ctx.createRadialGradient(earthCx, earthCy, earthRadius - 12, earthCx, earthCy, earthRadius + 52);
    atmoGlow.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
    atmoGlow.addColorStop(0.55, 'rgba(251, 146, 60, 0.25)');
    atmoGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = atmoGlow;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 52, Math.PI * 1.08, Math.PI * 1.92);
    ctx.fill();

    drawSpinningEarth(ctx, earthCx, earthCy, earthRadius, nowSec, { halo: false });

    // Glowing ionized atmospheric entry boundary arc
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 2, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.55)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 14, Math.PI * 1.14, Math.PI * 1.86);
    ctx.stroke();

    const p0 = { x: 185, y: 225 }, p1 = { x: 410, y: 255 }, p2 = { x: 645, y: 315 }, p3 = { x: 875, y: 390 };
    const pos = cubicBezierPt(p0, p1, p2, p3, ease);
    const ang = cubicBezierTan(p0, p1, p2, p3, ease);

    // Planned entry trajectory arc with illuminated flow trail
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Jettisoned service module (matched scale 0.46) separating and tumbling behind along the entry tangent
    const SM_S = 0.46;
    const sm = craftCentre('serviceModule', { scale: SM_S });
    const sepDist = 64 + ease * 135;
    ctx.save();
    ctx.translate(
      snapEven(pos.x - Math.cos(ang) * sepDist - 12),
      snapEven(pos.y - Math.sin(ang) * sepDist + 14 * ease)
    );
    ctx.rotate(ang - Math.PI / 2 - ease * 1.8);
    drawCraft(ctx, 'serviceModule', -sm.x, -sm.y, { scale: SM_S });
    ctx.restore();

    // Command Module (0010 at matched 0.46 scale) oriented blunt-heatshield-first (+y local -> +ang flight vector)
    const CM_S = 0.46;
    const cap = craftCentre('command', { scale: CM_S });
    const capH = cap.box.h / 2;
    ctx.save();
    ctx.translate(snapEven(pos.x), snapEven(pos.y));
    ctx.rotate(ang - Math.PI / 2);

    // Multi-layered ionization bow shock halo around the heatshield
    const plasmaGlow = ctx.createRadialGradient(0, capH, 6, 0, capH, 68);
    plasmaGlow.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
    plasmaGlow.addColorStop(0.45, 'rgba(251, 146, 60, 0.65)');
    plasmaGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = plasmaGlow;
    ctx.beginPath();
    ctx.arc(0, capH, 68, 0, Math.PI * 2);
    ctx.fill();

    // Bow shock wave arc leading the blunt shield
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.88)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, capH - 20, 42, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    drawCraft(ctx, 'command', -cap.x, -cap.y, { scale: CM_S });

    // Glowing superheated ablative heatshield base
    ctx.fillStyle = 'rgba(234, 88, 12, 0.72)';
    ctx.beginPath();
    ctx.ellipse(0, capH - 2, cap.box.w * 0.46, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(LOGICAL_W / 2, 310, 45 + ease * 90, 0, Math.PI * 2); ctx.stroke();
  }

  // Smooth transition particles rendered over trajectory
  for (const pt of tr.particles) {
    const a = Math.max(0, Math.min(1, pt.life / (pt.maxLife || 0.7)));
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Cinematic title card banner dynamically sized to prevent long-title overflow
  const measureSafe = (text, px) => {
    if (typeof ctx.measureText === 'function') {
      const m = ctx.measureText(text);
      if (m && Number.isFinite(m.width)) return m.width;
    }
    return String(text || '').length * px * 0.6;
  };
  ctx.save();
  ctx.font = 'bold 12px JetBrains Mono, monospace';
  const badgeW = measureSafe(tr.badge, 12);
  let titleSize = 24;
  ctx.font = `bold ${titleSize}px Fredoka, sans-serif`;
  let titleW = measureSafe(tr.title, titleSize);
  if (titleW > 880) {
    titleSize = 20;
    ctx.font = `bold ${titleSize}px Fredoka, sans-serif`;
    titleW = measureSafe(tr.title, titleSize);
  }
  ctx.font = '13px Fredoka, sans-serif';
  const subW = measureSafe(tr.subtitle, 13);
  const bannerW = Math.max(660, Math.min(LOGICAL_W - 60, Math.ceil(Math.max(badgeW, titleW, subW)) + 76));
  const bannerX = Math.round(LOGICAL_W / 2 - bannerW / 2);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(bannerX, 48, bannerW, 96, 18); ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(tr.badge, LOGICAL_W / 2, 74);

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${titleSize}px Fredoka, sans-serif`;
  ctx.fillText(tr.title, LOGICAL_W / 2, 104);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px Fredoka, sans-serif';
  ctx.fillText(tr.subtitle, LOGICAL_W / 2, 128);
  ctx.restore();

  // Next Stage Launch Card & Clear Start Indication
  const secsLeft = Math.max(1, Math.ceil(tr.duration - tr.elapsed));
  const launchingNow = t >= 0.84;
  const pulseGlow = 0.55 + 0.45 * Math.sin(nowSec * 5.2);
  const nextLabel = tr.nextStage || tr.badge || 'NEXT STAGE';

  const cardW = 620, cardH = 82;
  const cardX = LOGICAL_W / 2 - cardW / 2;
  const cardY = LOGICAL_H - 96;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = launchingNow
    ? `rgba(74, 222, 128, ${0.7 + pulseGlow * 0.3})`
    : 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 16); ctx.fill(); ctx.stroke();

  ctx.font = 'bold 12px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`NEXT STAGE: ${nextLabel}`, cardX + 20, cardY + 24);

  ctx.textAlign = 'right';
  ctx.fillStyle = launchingNow ? '#4ade80' : '#fde047';
  ctx.fillText(launchingNow ? '▶ STARTING NEXT STAGE NOW!' : `STARTING IN ${secsLeft}s`, cardX + cardW - 20, cardY + 24);

  // Smooth rounded progress bar inside card
  const barX = cardX + 20, barY = cardY + 34, barW = cardW - 40, barH = 10;
  ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5); ctx.fill();
  if (t > 0.01) {
    const progGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    progGrad.addColorStop(0, '#38bdf8');
    progGrad.addColorStop(1, '#4ade80');
    ctx.fillStyle = progGrad;
    ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(10, barW * ease), barH, 5); ctx.fill();
  }

  // Interactive Start Cue Badge
  ctx.textAlign = 'center';
  ctx.font = 'bold 12.5px Fredoka, sans-serif';
  ctx.fillStyle = launchingNow
    ? '#86efac'
    : `rgba(248, 250, 252, ${0.72 + pulseGlow * 0.28})`;
  ctx.fillText('PRESS [SPACE] OR CLICK ANYWHERE TO START NEXT STAGE IMMEDIATELY ▶', LOGICAL_W / 2, cardY + 67);
  ctx.restore();

  // Soft fade-in and fade-out veil so stage entry/exit never pops abruptly
  const edgeFade = t < 0.07 ? (1 - t / 0.07) : t > 0.93 ? ((t - 0.93) / 0.07) : 0;
  if (edgeFade > 0.01) {
    ctx.fillStyle = `rgba(4, 8, 22, ${edgeFade * 0.55})`;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }
}
