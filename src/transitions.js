import { LOGICAL_W, LOGICAL_H } from './config.js';
import { state } from './state.js';
import { playTone } from './audio.js';
import { setStageBanner } from './hud.js';

export function startTransition({ kind, badge, title, subtitle, duration = 2.2, onComplete }) {
  state.stage = 'TRANSITION';
  state.transition = {
    kind,
    badge,
    title,
    subtitle,
    elapsed: 0,
    duration,
    onComplete
  };
  setStageBanner(
    badge,
    title,
    subtitle,
    `<kbd>SPACE</kbd> or Click to Continue Immediately`,
    { showTickets: false, showSkip: false, showNext: false }
  );
  playTone(330, 'triangle', 0.16, 0.09);
  setTimeout(() => playTone(494, 'triangle', 0.22, 0.09), 110);
}

export function skipTransition() {
  if (state.stage !== 'TRANSITION' || !state.transition) return;
  const cb = state.transition.onComplete;
  state.transition = null;
  if (cb) cb();
}

export function updateTransition(dt) {
  if (!state.transition) return;
  state.transition.elapsed += dt;
  if (state.transition.elapsed >= state.transition.duration) {
    skipTransition();
  }
}

export function drawTransition(ctx) {
  const tr = state.transition;
  if (!tr) return;
  const t = Math.min(1, tr.elapsed / tr.duration);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Deep aerospace backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  bg.addColorStop(0, '#050814');
  bg.addColorStop(0.6, '#0f172a');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Parallax starfield
  ctx.fillStyle = '#e2e8f0';
  for (let i = 0; i < 75; i++) {
    const sx = ((i * 173) - t * (30 + (i % 4) * 25) + LOGICAL_W * 2) % LOGICAL_W;
    const sy = (i * 89) % LOGICAL_H;
    const sz = (i % 3 === 0) ? 2.5 : 1.5;
    ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.globalAlpha = 1;

  // Scene-specific vector animation
  if (tr.kind === 'HANGAR_ROLLOUT') {
    // Hangar doors parting & rocket rolling onto Pad 39B
    const padY = 470;
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, padY, LOGICAL_W, LOGICAL_H - padY);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, padY, LOGICAL_W, 8);

    const rx = 260 + ease * 300;
    // Crawler transporter
    ctx.fillStyle = '#475569'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(rx - 52, padY - 24, 104, 24, 6); ctx.fill(); ctx.stroke();
    // Rocket stack
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(rx - 22, padY - 140, 44, 116, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(rx - 22, padY - 140); ctx.lineTo(rx, padY - 182); ctx.lineTo(rx + 22, padY - 140); ctx.closePath(); ctx.fill(); ctx.stroke();

    // Sliding hangar blast doors
    const doorSlide = ease * 360;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-doorSlide, 0, 320, padY);
    ctx.fillRect(LOGICAL_W - 320 + doorSlide, 0, 320, padY);

    const countdown = t < 0.33 ? 'T-3' : t < 0.66 ? 'T-2' : t < 0.9 ? 'T-1' : 'IGNITION!';
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 42px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(countdown, LOGICAL_W / 2, 165);
  } else if (tr.kind === 'ORBITAL_INSERTION') {
    // Fairing jettison & Translunar burn
    const cx = 180 + ease * 720;
    const cy = 340 - Math.sin(ease * Math.PI) * 90;
    // Earth curve bottom left
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath(); ctx.arc(140, 680, 340, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 8; ctx.stroke();

    // Fairing halves separating
    ctx.save();
    ctx.translate(cx - 25, cy - 30 - ease * 60);
    ctx.rotate(-ease * 0.7);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-16, -10, 32, 12);
    ctx.restore();
    ctx.save();
    ctx.translate(cx - 25, cy + 30 + ease * 60);
    ctx.rotate(ease * 0.7);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-16, -2, 32, 12);
    ctx.restore();

    // Orion + Service Module
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(-68 - Math.random() * 20, 0); ctx.lineTo(-26, 8); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-26, -14, 34, 28, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(36, 0); ctx.lineTo(8, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (tr.kind === 'LUNAR_UNDOCK') {
    // Moon surface approaching + Lander separating from Command Module
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.arc(LOGICAL_W / 2, 920, 480, 0, Math.PI * 2); ctx.fill();
    // Command module drifting top-left
    const cmX = 560 - ease * 210;
    const cmY = 230 - ease * 45;
    ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(cmX - 28, cmY - 14, 56, 28, 8); ctx.fill(); ctx.stroke();
    // Descent Lander dropping down
    const lx = 560 + ease * 90;
    const ly = 240 + ease * 150;
    ctx.fillStyle = '#eab308';
    ctx.beginPath(); ctx.roundRect(lx - 30, ly - 16, 60, 24, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(lx - 22, ly - 44, 44, 28, 9); ctx.fill(); ctx.stroke();
  } else if (tr.kind === 'ROVER_DEPLOY') {
    // Ramp lowering & dual rovers rolling out
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 440, LOGICAL_W, 180);
    // Big lander side silhouette
    ctx.fillStyle = '#eab308'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(160, 355, 110, 50, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(175, 290, 80, 65, 14); ctx.fill(); ctx.stroke();
    // Ramp
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(270, 398); ctx.lineTo(355, 440); ctx.stroke();
    // LTV-1 and LTV-2 driving forward
    const r1x = 340 + ease * 260;
    const r2x = 290 + ease * 180;
    for (const [rx, col] of [[r1x, '#f59e0b'], [r2x, '#38bdf8']]) {
      ctx.fillStyle = col; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(rx - 28, 412, 56, 18, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(rx - 18, 434, 8, 0, Math.PI * 2); ctx.arc(rx, 434, 8, 0, Math.PI * 2); ctx.arc(rx + 18, 434, 8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (tr.kind === 'ENTRY_INTERFACE') {
    // Service module jettison & plasma horizon glow
    ctx.fillStyle = '#0284c7';
    ctx.beginPath(); ctx.arc(LOGICAL_W / 2, 1120, 680, Math.PI * 1.15, Math.PI * 1.85); ctx.fill();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.75)'; ctx.lineWidth = 14; ctx.stroke();

    const capX = 320 + ease * 340;
    const capY = 250 + ease * 95;
    // Detached service module tumbling away
    ctx.save();
    ctx.translate(capX - 90 - ease * 120, capY - 40 - ease * 50);
    ctx.rotate(-ease * 2.2);
    ctx.fillStyle = '#64748b'; ctx.fillRect(-20, -14, 40, 28);
    ctx.restore();
    // Orion Capsule
    ctx.save();
    ctx.translate(capX, capY);
    ctx.rotate(0.42);
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, -26); ctx.lineTo(18, -26); ctx.lineTo(34, 14); ctx.lineTo(-34, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath(); ctx.ellipse(0, 16, 35, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    // Generic orbital pulse ring
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(LOGICAL_W / 2, 310, 45 + ease * 90, 0, Math.PI * 2); ctx.stroke();
  }

  // Cinematic title card banner
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(LOGICAL_W / 2 - 330, 48, 660, 96, 18); ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(tr.badge, LOGICAL_W / 2, 74);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Fredoka, sans-serif';
  ctx.fillText(tr.title, LOGICAL_W / 2, 104);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px Fredoka, sans-serif';
  ctx.fillText(tr.subtitle, LOGICAL_W / 2, 128);

  // Progress bar at bottom
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(LOGICAL_W / 2 - 220, LOGICAL_H - 36, 440, 8);
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(LOGICAL_W / 2 - 220, LOGICAL_H - 36, 440 * t, 8);
}
