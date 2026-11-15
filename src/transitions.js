import { LOGICAL_W, LOGICAL_H } from './config.js';
import { state } from './state.js';
import { playTone } from './audio.js';
import { setStageBanner } from './hud.js';
import { createStarfield, drawStarfield } from './sprites.js';

const TRANSITION_STARS = createStarfield(110, LOGICAL_W, LOGICAL_H, 42199);

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
    const p0 = { x: 110, y: 455 }, p1 = { x: 340, y: 270 }, p2 = { x: 680, y: 205 }, p3 = { x: 965, y: 255 };
    const pos = cubicBezierPt(p0, p1, p2, p3, ease);
    const ang = cubicBezierTan(p0, p1, p2, p3, ease);
    const ex = pos.x - Math.cos(ang) * 28;
    const ey = pos.y - Math.sin(ang) * 28;
    if (tr.particles.length < 70) {
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

function drawDetailedTransitionOrion(ctx, scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);

  // Solar array wings extending top and bottom with titanium truss struts
  for (const dir of [-1, 1]) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, dir * 11);
    ctx.lineTo(-10, dir * 40);
    ctx.stroke();

    ctx.save();
    ctx.translate(-10, dir * 28);
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-9, dir < 0 ? -16 : -8, 18, 24, 2);
    ctx.fill();
    ctx.stroke();

    // Photovoltaic cell grid lines
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
    ctx.lineWidth = 1;
    for (let gx = -4; gx <= 4; gx += 4) {
      ctx.beginPath();
      ctx.moveTo(gx, dir < 0 ? -15 : -7);
      ctx.lineTo(gx, dir < 0 ? 7 : 15);
      ctx.stroke();
    }
    ctx.restore();
  }

  // European Service Module AJ10 engine bell (left / rear)
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, -7);
  ctx.lineTo(-33, -11);
  ctx.lineTo(-33, 11);
  ctx.lineTo(-22, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Service Module cylindrical titanium bus with gold thermal band
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect(-22, -12, 26, 24, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eab308';
  ctx.fillRect(-16, -11.5, 6, 23);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();

  // Orion Crew Module conical heat-shielded cabin
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(4, -13);
  ctx.lineTo(25, -7);
  ctx.lineTo(25, 7);
  ctx.lineTo(4, 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Blue NASA stripe + forward cockpit window
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(6, -11, 3, 22);
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.roundRect(14, -5, 6, 4, 1.5);
  ctx.roundRect(14, 1, 6, 4, 1.5);
  ctx.fill();

  // Docking adapter ring (nose tip)
  ctx.fillStyle = '#475569';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.fillRect(25, -5, 5, 10);
  ctx.strokeRect(25, -5, 5, 10);
  ctx.restore();
}

function drawDetailedTransitionLander(ctx, options = {}) {
  const scale = options.scale ?? 1;
  const drawPlume = !!options.drawPlume;
  const nowSec = options.nowSec ?? 0;
  const rampOpen = options.rampOpen ?? 0;

  // Origin (0, 0) rests cleanly at the bottom plane of the landing footpads
  ctx.save();
  ctx.scale(scale, scale);

  if (drawPlume) {
    ctx.save();
    ctx.translate(0, -12);
    ctx.rotate(-Math.PI / 2);
    drawLayeredPlume(ctx, 10, 6, nowSec, '#38bdf8', '#e0f2fe');
    ctx.restore();
  }

  // Articulated 4-strut landing gear legs with cross-bracing
  const legDefs = [
    { topX: -28, topY: -44, footX: -58, braceX: -36 },
    { topX: 28, topY: -44, footX: 58, braceX: 36 },
    { topX: -12, topY: -40, footX: -22, braceX: -14 },
    { topX: 12, topY: -40, footX: 22, braceX: 14 }
  ];
  for (const leg of legDefs) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leg.topX, leg.topY);
    ctx.lineTo(leg.footX, -3);
    ctx.stroke();

    // Diagonal damper strut
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(leg.topX * 0.65, -26);
    ctx.lineTo(leg.footX * 0.85, -8);
    ctx.stroke();
  }

  // Descent Engine Bell between inner legs
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -32);
  ctx.lineTo(-14, -12);
  ctx.lineTo(14, -12);
  ctx.lineTo(8, -32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wide amber/gold lunar dish footpads flush with ground (y = 0)
  for (const fx of [-58, -22, 22, 58]) {
    const padRx = Math.abs(fx) > 30 ? 12 : 9;
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(fx, -2, padRx, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Octagonal Gold Kapton Foil Descent Stage
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-42, -74);
  ctx.lineTo(42, -74);
  ctx.lineTo(50, -56);
  ctx.lineTo(44, -32);
  ctx.lineTo(-44, -32);
  ctx.lineTo(-50, -56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shaded side facets & foil crinkle panels
  ctx.fillStyle = 'rgba(180, 83, 9, 0.38)';
  ctx.beginPath();
  ctx.moveTo(-42, -74);
  ctx.lineTo(-24, -74);
  ctx.lineTo(-28, -32);
  ctx.lineTo(-44, -32);
  ctx.lineTo(-50, -56);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
  ctx.fillRect(-20, -70, 40, 34);

  // Dark equipment bay panel + crew boarding ladder on front-right deck
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.fillRect(-16, -65, 22, 22);
  ctx.strokeRect(-16, -65, 22, 22);

  // Boarding ladder on front-right descent bay
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(22, -72);
  ctx.lineTo(29, -32);
  ctx.moveTo(31, -72);
  ctx.lineTo(38, -32);
  for (let r = 0; r < 5; r++) {
    const ry = -66 + r * 7.5;
    const rx = 23 + r * 1.4;
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + 9, ry);
  }
  ctx.stroke();

  // Carbon-composite Interstage Adapter Ring
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-31, -81, 62, 8, 2);
  ctx.fill();
  ctx.stroke();

  // White Pressurized Ascent Crew Cabin
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-26, -134);
  ctx.lineTo(26, -134);
  ctx.lineTo(33, -110);
  ctx.lineTo(31, -81);
  ctx.lineTo(-31, -81);
  ctx.lineTo(-33, -110);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // NASA blue accent band & side panel shading
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(-30, -96, 60, 6);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.fillRect(-28, -132, 11, 50);

  // Dual angled cockpit viewports with cyan reflection
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(-19, -124);
  ctx.lineTo(-4, -124);
  ctx.lineTo(-6, -110);
  ctx.lineTo(-22, -110);
  ctx.closePath();
  ctx.moveTo(4, -124);
  ctx.lineTo(19, -124);
  ctx.lineTo(22, -110);
  ctx.lineTo(6, -110);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(-16, -121, 9, 4);
  ctx.fillRect(7, -121, 9, 4);

  // Side RCS thruster quads
  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(dir * 32 - 3, -116, 6, 10, 2);
    ctx.fill();
    ctx.stroke();
  }

  // Top Docking Tunnel Collar & High-Gain Dish Antenna
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.fillRect(-13, -142, 26, 8);
  ctx.strokeRect(-13, -142, 26, 8);

  // Dish mast right of docking collar
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, -134);
  ctx.lineTo(22, -150);
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(24, -152, 6, Math.PI * 0.75, Math.PI * 1.75);
  ctx.fill();
  ctx.stroke();

  // Articulated rover deployment ramp extending from right descent deck down to ground (y = 0)
  if (rampOpen > 0) {
    const startX = 43;
    const startY = -36;
    const endX = startX + rampOpen * 72;
    const endY = startY + rampOpen * 36;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + 2, startY - 2);
    ctx.lineTo(endX + 2, endY - 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDetailedTransitionRover(ctx, bodyColor, rollAngle) {
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

  // Two seated NASA EVA astronauts in helmets & gold visors
  for (const ax of [-6, 10]) {
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(ax - 5, -28, 10, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, -32, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(ax - 1, -34, 5, 4, 1.5);
    ctx.fill();
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

    const rx = 240 + ease * 320;
    // Pad tower silhouette
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(590, padY - 220, 36, 220);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(594, padY - 190, 28, 5);

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

    // Crawler transporter & rocket stack
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(rx - 52, padY - 24, 104, 24, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(rx - 22, padY - 142, 44, 118, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(rx - 20, padY - 110, 40, 8);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(rx - 22, padY - 142); ctx.lineTo(rx, padY - 186); ctx.lineTo(rx + 22, padY - 142); ctx.closePath(); ctx.fill(); ctx.stroke();

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
    const p0 = { x: 110, y: 455 }, p1 = { x: 340, y: 270 }, p2 = { x: 680, y: 205 }, p3 = { x: 965, y: 255 };

    // Shaded Earth limb + atmospheric halo bottom-left
    ctx.save();
    const earthGrad = ctx.createRadialGradient(130, 560, 40, 140, 690, 370);
    earthGrad.addColorStop(0, '#3b82f6');
    earthGrad.addColorStop(0.65, '#1d4ed8');
    earthGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = earthGrad;
    ctx.beginPath(); ctx.arc(140, 690, 350, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();

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

    // Sculpted fairing shells peeling smoothly after orbital staging
    const sep = Math.max(0, (ease - 0.14) / 0.86);
    if (sep > 0) {
      const sepEase = smootherstep(sep);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const backX = -Math.cos(ang);
      const backY = -Math.sin(ang);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - sep * 0.55);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(
          pos.x + nx * side * (16 + sepEase * 68) + backX * (10 + sepEase * 44),
          pos.y + ny * side * (16 + sepEase * 68) + backY * (10 + sepEase * 44)
        );
        ctx.rotate(ang + side * sepEase * 0.85);
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-16, side > 0 ? 0 : -11);
        ctx.quadraticCurveTo(10, side > 0 ? 12 : -12, 22, 0);
        ctx.lineTo(-16, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Orion Spacecraft + Service Module oriented cleanly along trajectory tangent
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    drawLayeredPlume(ctx, 56, 8, nowSec);
    // Solar array wings
    ctx.fillStyle = '#1d4ed8';
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-16, -30, 10, 16);
    ctx.strokeRect(-16, -30, 10, 16);
    ctx.fillRect(-16, 14, 10, 16);
    ctx.strokeRect(-16, 14, 10, 16);
    // Service module
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-24, -12, 30, 24, 5); ctx.fill(); ctx.stroke();
    // Orion crew capsule
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.moveTo(6, -13); ctx.lineTo(34, 0); ctx.lineTo(6, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(16, 0, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (tr.kind === 'LUNAR_UNDOCK') {
    // Shaded Moon surface rising below
    const moonGrad = ctx.createRadialGradient(LOGICAL_W * 0.45, 760, 120, LOGICAL_W / 2, 920, 520);
    moonGrad.addColorStop(0, '#64748b');
    moonGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = moonGrad;
    ctx.beginPath(); ctx.arc(LOGICAL_W / 2, 920, 480, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Command module gliding upper-left
    const cmPos = cubicBezierPt({ x: 520, y: 235 }, { x: 450, y: 218 }, { x: 375, y: 205 }, { x: 300, y: 198 }, ease);
    ctx.save();
    ctx.translate(cmPos.x, cmPos.y);
    ctx.rotate(-0.08 * ease);
    drawDetailedTransitionOrion(ctx, 1.08);
    ctx.restore();

    // Realistic Gold/White HLS Descent Lander arcing down toward Shackleton rim
    const l0 = { x: 540, y: 270 }, l1 = { x: 590, y: 298 }, l2 = { x: 645, y: 350 }, l3 = { x: 675, y: 416 };
    const lPos = cubicBezierPt(l0, l1, l2, l3, ease);
    ctx.save();
    ctx.translate(lPos.x, lPos.y);
    ctx.rotate(0.14 * (1 - ease));
    drawDetailedTransitionLander(ctx, { scale: 0.62, drawPlume: true, nowSec });
    ctx.restore();
  } else if (tr.kind === 'ROVER_DEPLOY') {
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

    // Realistic HLS Lander planted squarely on lunar surface (footpads flush on groundY)
    const landerX = 215;
    const rampOpen = smootherstep(Math.min(1, t / 0.3));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(landerX, groundY + 2, 78, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(landerX, groundY);
    drawDetailedTransitionLander(ctx, { scale: 1.0, rampOpen });
    ctx.restore();

    // Dual crewed 6-wheel LTV Rovers driving off the lowered ramp onto lunar dust
    const rollT = smootherstep(Math.max(0, (t - 0.18) / 0.82));
    const r1x = 328 + rollT * 360;
    const r2x = 278 + rollT * 245;
    for (const [rx, col] of [[r1x, '#f59e0b'], [r2x, '#38bdf8']]) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(rx, groundY + 2, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(rx, groundY);
      drawDetailedTransitionRover(ctx, col, rollT * 14);
      ctx.restore();
    }
  } else if (tr.kind === 'ENTRY_INTERFACE') {
    // Shaded Earth limb below with continents, drifting clouds, and glowing atmosphere
    const earthCx = LOGICAL_W / 2;
    const earthCy = 1120;
    const earthRadius = 680;

    // Outer thermosphere atmospheric scatter aura
    const atmoGlow = ctx.createRadialGradient(earthCx, earthCy, earthRadius - 10, earthCx, earthCy, earthRadius + 55);
    atmoGlow.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
    atmoGlow.addColorStop(0.55, 'rgba(251, 146, 60, 0.25)');
    atmoGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = atmoGlow;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 55, Math.PI * 1.12, Math.PI * 1.88);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius, Math.PI * 1.14, Math.PI * 1.86);
    const oceanGrad = ctx.createRadialGradient(earthCx - 120, 460, 40, earthCx, 760, 560);
    oceanGrad.addColorStop(0, '#38bdf8');
    oceanGrad.addColorStop(0.42, '#0284c7');
    oceanGrad.addColorStop(0.82, '#1e3a8a');
    oceanGrad.addColorStop(1, '#091124');
    ctx.fillStyle = oceanGrad;
    ctx.fill();
    ctx.clip();

    // Sculpted Pacific coast & island arch landmasses along the curved Earth limb
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(180, 560);
    ctx.bezierCurveTo(260, 470, 390, 455, 475, 515);
    ctx.bezierCurveTo(510, 540, 440, 610, 355, 620);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(710, 540);
    ctx.bezierCurveTo(790, 480, 920, 485, 990, 565);
    ctx.bezierCurveTo(950, 625, 795, 635, 710, 540);
    ctx.closePath();
    ctx.fill();

    // Subtle wispy clouds curving over horizon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.beginPath();
    ctx.ellipse(380 - ease * 35, 495, 115, 16, -0.14, 0, Math.PI * 2);
    ctx.ellipse(690 - ease * 25, 478, 130, 18, 0.08, 0, Math.PI * 2);
    ctx.ellipse(540 - ease * 40, 542, 150, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Glowing ionized atmospheric entry boundary arc
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 1, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.55)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(earthCx, earthCy, earthRadius + 14, Math.PI * 1.17, Math.PI * 1.83);
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

    // Detailed Jettisoned Service Module tumbling cleanly behind along tangent
    ctx.save();
    ctx.translate(pos.x - 95 - ease * 115, pos.y - 34 - ease * 42);
    ctx.rotate(-ease * 2.1);
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-10, -34, 14, 18);
    ctx.strokeRect(-10, -34, 14, 18);
    ctx.fillRect(-10, 16, 14, 18);
    ctx.strokeRect(-10, 16, 14, 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20, -14, 34, 28, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-8, -13, 6, 26);
    ctx.restore();

    // Detailed Orion Crew Module oriented heatshield-first along entry glide
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang + Math.PI / 2 - 0.15);

    // Multi-layered ionization bow shock halo around heatshield
    const plasmaGlow = ctx.createRadialGradient(0, 18, 6, 0, 18, 68);
    plasmaGlow.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
    plasmaGlow.addColorStop(0.45, 'rgba(251, 146, 60, 0.65)');
    plasmaGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = plasmaGlow;
    ctx.beginPath();
    ctx.arc(0, 18, 68, 0, Math.PI * 2);
    ctx.fill();

    // Bow shock wave arc leading the blunt shield
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.88)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -4, 42, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    // Orion Titanium/White Back-Shell Capsule
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-14, -28);
    ctx.lineTo(14, -28);
    ctx.lineTo(34, 12);
    ctx.lineTo(-34, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blue NASA accent band, cockpit windows & forward parachute cover cap
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-13, -33, 26, 6);
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.moveTo(-28, 3);
    ctx.lineTo(28, 3);
    ctx.lineTo(31, 8);
    ctx.lineTo(-31, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-14, -14, 10, 6, 2);
    ctx.roundRect(4, -14, 10, 6, 2);
    ctx.fill();

    // Glowing superheated PICA-X ablative heatshield base
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 14, 35, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.ellipse(0, 15, 22, 4, 0, 0, Math.PI * 2);
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
