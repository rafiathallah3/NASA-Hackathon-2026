import { RAW_ITEMS, PROC_META } from './config.js';
import { state } from './state.js';

export function addFloatText(x, y, text, color = '#fff') {
  state.floatingTexts.push({ x, y, text, color, life: 1.25 });
}

export function getHardwareSVG(shape, processed = false) {
  const glow = processed ? '#4ade80' : '#94a3b8';
  if (shape === 'optics') {
    return `<svg viewBox="0 0 36 36"><rect x="6" y="10" width="16" height="16" rx="4" fill="#334155" stroke="#0f172a" stroke-width="2"/><polygon points="22,12 31,7 31,29 22,24" fill="${processed ? '#38bdf8' : '#64748b'}" stroke="#0f172a" stroke-width="2"/><circle cx="28" cy="18" r="4" fill="${processed ? '#e0f2fe' : '#cbd5e1'}"/><circle cx="12" cy="15" r="2" fill="#94a3b8"/></svg>`;
  }
  if (shape === 'circuit') {
    return `<svg viewBox="0 0 36 36"><rect x="6" y="7" width="24" height="22" rx="4" fill="${processed ? '#15803d' : '#475569'}" stroke="#0f172a" stroke-width="2"/><rect x="12" y="13" width="12" height="10" rx="2" fill="#1e293b"/><circle cx="10" cy="11" r="2" fill="${processed ? '#fde047' : '#94a3b8'}"/><circle cx="26" cy="25" r="2" fill="${processed ? '#38bdf8' : '#94a3b8'}"/><line x1="10" y1="25" x2="14" y2="25" stroke="${glow}" stroke-width="1.5"/></svg>`;
  }
  if (shape === 'battery') {
    return `<svg viewBox="0 0 36 36"><rect x="10" y="8" width="16" height="22" rx="3" fill="#334155" stroke="#0f172a" stroke-width="2"/><rect x="14" y="4" width="8" height="4" rx="1" fill="#94a3b8"/><rect x="13" y="${processed ? '11' : '22'}" width="10" height="${processed ? '16' : '5'}" rx="1" fill="${processed ? '#4ade80' : '#ef4444'}"/></svg>`;
  }
  if (shape === 'solar') {
    return `<svg viewBox="0 0 36 36"><rect x="5" y="10" width="26" height="16" rx="2" fill="${processed ? '#1d4ed8' : '#475569'}" stroke="#0f172a" stroke-width="2"/><line x1="14" y1="10" x2="14" y2="26" stroke="${glow}" stroke-width="1.5"/><line x1="22" y1="10" x2="22" y2="26" stroke="${glow}" stroke-width="1.5"/><line x1="5" y1="18" x2="31" y2="18" stroke="${glow}" stroke-width="1.5"/></svg>`;
  }
  if (shape === 'dish') {
    return `<svg viewBox="0 0 36 36"><path d="M8,12 Q18,28 28,12" fill="${processed ? '#a78bfa' : '#64748b'}" stroke="#0f172a" stroke-width="2"/><line x1="18" y1="20" x2="18" y2="9" stroke="#0f172a" stroke-width="2"/><circle cx="18" cy="8" r="3" fill="${processed ? '#fde047' : '#cbd5e1'}"/><rect x="13" y="25" width="10" height="5" rx="2" fill="#334155"/></svg>`;
  }
  return `<svg viewBox="0 0 36 36"><rect x="10" y="6" width="16" height="24" rx="7" fill="${processed ? '#f97316' : '#64748b'}" stroke="#0f172a" stroke-width="2"/><line x1="10" y1="14" x2="26" y2="14" stroke="#0f172a" stroke-width="2"/><line x1="10" y1="22" x2="26" y2="22" stroke="#0f172a" stroke-width="2"/><circle cx="18" cy="18" r="2.5" fill="${processed ? '#fde047' : '#cbd5e1'}"/></svg>`;
}

export function drawHardwareCanvas(c, x, y, shape, processed = false, scale = 1) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.lineWidth = 2;
  c.strokeStyle = '#0f172a';
  if (shape === 'optics') {
    c.fillStyle = '#334155';
    c.beginPath(); c.roundRect(-12, -7, 14, 14, 3); c.fill(); c.stroke();
    c.fillStyle = processed ? '#38bdf8' : '#64748b';
    c.beginPath(); c.moveTo(2, -5); c.lineTo(12, -9); c.lineTo(12, 9); c.lineTo(2, 5); c.closePath(); c.fill(); c.stroke();
    // Lens glint
    c.fillStyle = processed ? '#e0f2fe' : '#cbd5e1';
    c.beginPath(); c.arc(9, -3, 2.2, 0, Math.PI * 2); c.fill();
  } else if (shape === 'circuit') {
    c.fillStyle = processed ? '#16a34a' : '#475569';
    c.beginPath(); c.roundRect(-11, -9, 22, 18, 3); c.fill(); c.stroke();
    c.fillStyle = '#0f172a';
    c.fillRect(-5, -4, 10, 8);
    c.strokeStyle = processed ? '#86efac' : '#94a3b8';
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-9, -4); c.lineTo(-5, -4); c.moveTo(5, 4); c.lineTo(9, 4); c.stroke();
    if (processed) {
      c.fillStyle = '#fde047';
      c.beginPath(); c.arc(-7, -5, 1.8, 0, Math.PI * 2); c.arc(7, 5, 1.8, 0, Math.PI * 2); c.fill();
    }
  } else if (shape === 'battery') {
    c.fillStyle = '#1e293b';
    c.beginPath(); c.roundRect(-8, -9, 16, 20, 3); c.fill(); c.stroke();
    c.fillStyle = '#cbd5e1';
    c.fillRect(-4, -12, 8, 3);
    c.fillStyle = processed ? '#4ade80' : '#ef4444';
    c.fillRect(-5, processed ? -6 : 4, 10, processed ? 14 : 4);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(-5, -7, 3, 15);
  } else if (shape === 'solar') {
    c.fillStyle = processed ? '#1d4ed8' : '#475569';
    c.beginPath(); c.roundRect(-12, -7, 24, 14, 2); c.fill(); c.stroke();
    c.strokeStyle = processed ? '#93c5fd' : '#94a3b8';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-4, -7); c.lineTo(-4, 7); c.moveTo(4, -7); c.lineTo(4, 7); c.moveTo(-12, 0); c.lineTo(12, 0); c.stroke();
    if (processed) {
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.fillRect(-10, -5, 20, 3);
    }
  } else if (shape === 'dish') {
    c.fillStyle = processed ? '#a78bfa' : '#64748b';
    c.beginPath(); c.arc(0, -6, 11, 0.15 * Math.PI, 0.85 * Math.PI); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 4); c.lineTo(0, -8); c.stroke();
    c.fillStyle = processed ? '#fde047' : '#cbd5e1';
    c.beginPath(); c.arc(0, -9, 2.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#334155'; c.fillRect(-5, 5, 10, 5);
  } else {
    c.fillStyle = processed ? '#f97316' : '#64748b';
    c.beginPath(); c.roundRect(-8, -11, 16, 22, 6); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-8, -4); c.lineTo(8, -4); c.moveTo(-8, 4); c.lineTo(8, 4); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(-5, -8, 3, 16);
  }
  c.restore();
}

export function drawItemBadge(ctx, x, y, item) {
  if (!item) return;
  ctx.save();
  if (item.kind === 'extinguisher') {
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 12, 16, 24, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x - 4, y - 16, 8, 4);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 7px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CO2', x, y + 3);
  } else if (item.kind === 'tray') {
    // Fairing tray rim & inner metallic recess
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 25, 14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    if (item.parts.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 9px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TRAY', x, y + 6);
    } else if (item.parts.length === 1) {
      drawHardwareCanvas(ctx, x, y + 1, PROC_META[item.parts[0]].shape, true, 0.72);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.roundRect(x + 8, y - 14, 22, 13, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('1/2', x + 19, y - 4);
    } else {
      drawHardwareCanvas(ctx, x - 9, y + 1, PROC_META[item.parts[0]].shape, true, 0.65);
      drawHardwareCanvas(ctx, x + 9, y + 1, PROC_META[item.parts[1]].shape, true, 0.65);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath(); ctx.roundRect(x - 19, y - 19, 38, 13, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('READY!', x, y - 10);
    }
  } else {
    const isRaw = item.kind === 'raw';
    const meta = isRaw ? RAW_ITEMS[item.id] : PROC_META[item.id];
    ctx.fillStyle = item.id === 'burned' ? '#334155' : (isRaw ? '#fef3c7' : '#dcfce7');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    drawHardwareCanvas(ctx, x, y, meta.shape, !isRaw && item.id !== 'burned', 0.78);
  }
  ctx.restore();
}

export function drawChibiEngineer(ctx, p, isLead = false) {
  const bob = Math.sin(p.walk) * 3;
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, 17, 8, 0, 0, Math.PI * 2); ctx.fill();

  if (isLead) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, 22, 10.5, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // PLSS Life-Support Backpack (behind body when facing front/side)
  const backOffX = -Math.cos(p.angle) * 9;
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(p.x + backOffX - 10, p.y - 11 + bob, 20, 21, 5);
  ctx.fill(); ctx.stroke();

  // Suit Torso
  ctx.fillStyle = p.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.roundRect(p.x - 14, p.y - 13 + bob, 28, 26, 11); ctx.fill(); ctx.stroke();

  // NASA Chest Stripe / Tool Belt
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(p.x - 10, p.y + 3 + bob, 20, 3.5);

  // Helmet
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(p.x, p.y - 21 + bob, 14.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Gold/Tinted Visor + Specular Highlight
  const vx = Math.cos(p.angle) * 5, vy = Math.sin(p.angle) * 3;
  ctx.fillStyle = p.visor;
  ctx.beginPath(); ctx.roundRect(p.x - 9 + vx, p.y - 26 + bob + vy, 18, 9.5, 4.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.roundRect(p.x - 6 + vx, p.y - 24.5 + bob + vy, 7, 2.5, 1); ctx.fill();

  // Role Callout Pill
  ctx.fillStyle = isLead ? '#fde047' : '#e2e8f0';
  ctx.font = 'bold 10px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, p.x, p.y - 40 + bob);

  if (p.holding) {
    drawItemBadge(ctx, p.x + Math.cos(p.angle) * 23, p.y - 6 + Math.sin(p.angle) * 13 + bob, p.holding);
  }
  if (p.hasWrench) {
    ctx.font = '18px Fredoka, sans-serif';
    ctx.fillText('🔧', p.x + Math.cos(p.angle) * 22, p.y - 4 + bob);
  }
}


export function drawCanvasControlBar(ctx, logicalW, items, y = 584) {
  ctx.save();
  ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
  let totalW = 18;
  const measured = items.map(it => {
    const kw = Math.max(26, ctx.measureText(it.key).width + 14);
    const lw = ctx.measureText(it.label).width + 10;
    totalW += kw + lw + 12;
    return { ...it, kw, lw };
  });
  totalW -= 6;
  const bx = (logicalW - totalW) / 2;
  const by = y - 16;

  ctx.fillStyle = 'rgba(19, 27, 44, 0.9)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(bx, by, totalW, 32, 16);
  ctx.fill();
  ctx.stroke();

  let cx = bx + 12;
  for (const m of measured) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.roundRect(cx, by + 5, m.kw, 22, 8);
    ctx.fill();
    ctx.fillStyle = '#0b111e';
    ctx.textAlign = 'center';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(m.key, cx + m.kw / 2, by + 20);

    cx += m.kw + 7;
    ctx.fillStyle = '#eef2f8';
    ctx.textAlign = 'left';
    ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(m.label, cx, by + 20);
    cx += m.lw + 10;
  }
  ctx.restore();
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStarfield(count = 90, width = 1120, height = 620, seed = 20261115) {
  const rand = mulberry32(seed);
  const tints = ['#f8fafc', '#e0f2fe', '#fef3c7', '#cbd5e1'];
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * width,
      y: rand() * height,
      size: 0.9 + Math.pow(rand(), 2) * 1.9,
      depth: 0.15 + rand() * 0.85,
      baseAlpha: 0.35 + rand() * 0.6,
      twinkleSpeed: 1.2 + rand() * 2.8,
      twinklePhase: rand() * Math.PI * 2,
      color: tints[Math.floor(rand() * tints.length)]
    });
  }
  return stars;
}

export function drawStarfield(
  ctx,
  stars,
  width = 1120,
  height = 620,
  { offsetX = 0, offsetY = 0, maxY = height, alphaMul = 1, nowSec = 0 } = {}
) {
  if (!stars || stars.length === 0 || maxY <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, maxY);
  ctx.clip();

  for (const s of stars) {
    let sx = (s.x - offsetX * s.depth) % width;
    if (sx < 0) sx += width;
    let sy = (s.y + offsetY * s.depth) % height;
    if (sy < 0) sy += height;
    if (sy > maxY) continue;

    const tw = nowSec > 0 ? 0.78 + 0.22 * Math.sin(nowSec * s.twinkleSpeed + s.twinklePhase) : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.baseAlpha * tw * alphaMul));
    ctx.fillStyle = s.color;
    if (s.size > 1.8) {
      ctx.beginPath();
      ctx.arc(sx, sy, s.size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(sx, sy, s.size, s.size);
    }
  }
  ctx.restore();
}
