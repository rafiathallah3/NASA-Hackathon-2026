import { RAW_ITEMS, PROC_META } from './config.js';
import { state } from './state.js';
import { getAsset, getItemSprite, getItemBounds, getAnimFrame, getAnimFrameBounds, getSheetSlice, isImageReady } from './assets.js';
import {
  CREW_FRAME_W, CREW_FRAME_H, CREW_CROP_TOP, CREW_CROP_H, CREW_ANIM, AVATAR_HEADROOM
} from './avatar-data.js';
import { getCrewSheet } from './avatar.js';

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

export function drawSpriteItem(ctx, itemId, x, y, boxSize = 28) {
  const img = getItemSprite(itemId);
  if (!isImageReady(img)) return false;
  const bounds = getItemBounds(itemId);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (bounds) {
    const scale = boxSize / Math.max(bounds.w, bounds.h);
    const dw = bounds.w * scale;
    const dh = bounds.h * scale;
    ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h, x - dw / 2, y - dh / 2, dw, dh);
  } else {
    const scale = boxSize / Math.max(img.naturalWidth, img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  }
  ctx.restore();
  return true;
}

export function drawSpriteSheetTile(ctx, sheetKey, sliceKey, dx, dy, dw, dh, { pixelated = true, alpha = 1 } = {}) {
  const slice = getSheetSlice(sheetKey, sliceKey);
  if (!slice || !slice.ready) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = !pixelated;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(slice.img, slice.sx, slice.sy, slice.sw, slice.sh, dx, dy, dw, dh);
  ctx.restore();
  return true;
}

export function drawAnimSpriteFrame(ctx, groupKey, frameIdx, dx, dy, dw, dh, { pixelated = true, alpha = 1, crop = false } = {}) {
  const img = getAnimFrame(groupKey, frameIdx);
  if (!isImageReady(img)) return false;
  const bounds = crop ? getAnimFrameBounds(groupKey, frameIdx) : null;
  ctx.save();
  ctx.imageSmoothingEnabled = !pixelated;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (bounds) {
    ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
  return true;
}

export function drawExplosionSprite(ctx, x, y, progress, size = 96) {
  const p = Math.max(0, Math.min(1, progress));
  const frameIdx = Math.min(4, Math.floor(p * 5));
  const img = getAnimFrame('explosionFrames', frameIdx);
  ctx.save();
  const alpha = p > 0.8 ? (1 - p) / 0.2 : 1;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (isImageReady(img)) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  } else {
    const r = size * 0.44 * (0.35 + 0.65 * Math.sin(p * Math.PI * 0.7));
    const grad = ctx.createRadialGradient(x, y, r * 0.12, x, y, Math.max(4, r));
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.55, '#f97316');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(4, r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawItemBadge(ctx, x, y, item) {
  if (!item) return;
  ctx.save();
  if (item.kind === 'extinguisher') {
    if (!drawSpriteItem(ctx, 'extinguisher', x, y - 2, 38)) {
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
    }
  } else if (item.kind === 'tray') {
    const drewTraySprite = drawSpriteItem(ctx, 'tray', x, y + 3, 52);
    if (!drewTraySprite) {
      // Fairing tray rim & inner metallic recess fallback
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
    }

    if (item.parts.length === 0) {
      if (!drewTraySprite) {
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 9px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TRAY', x, y + 6);
      }
    } else if (item.parts.length === 1) {
      const partId = item.parts[0];
      if (!drawSpriteItem(ctx, partId, x, y, 28)) {
        drawHardwareCanvas(ctx, x, y + 1, PROC_META[partId]?.shape || 'tank', true, 0.72);
      }
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.roundRect(x + 8, y - 14, 22, 13, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('1/2', x + 19, y - 4);
    } else {
      const p0 = item.parts[0];
      const p1 = item.parts[1];
      if (!drawSpriteItem(ctx, p0, x - 10, y, 24)) {
        drawHardwareCanvas(ctx, x - 9, y + 1, PROC_META[p0]?.shape || 'tank', true, 0.65);
      }
      if (!drawSpriteItem(ctx, p1, x + 10, y, 24)) {
        drawHardwareCanvas(ctx, x + 9, y + 1, PROC_META[p1]?.shape || 'tank', true, 0.65);
      }
      ctx.fillStyle = '#16a34a';
      ctx.beginPath(); ctx.roundRect(x - 19, y - 19, 38, 13, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('READY!', x, y - 10);
    }
  } else {
    const isRaw = item.kind === 'raw';
    const meta = isRaw ? RAW_ITEMS[item.id] : PROC_META[item.id];
    // Items are drawn bare (no backing circle/outline) so the sprite art reads on its own.
    if (!drawSpriteItem(ctx, item.id, x, y, 27)) {
      drawHardwareCanvas(ctx, x, y, meta?.shape || 'tank', !isRaw && item.id !== 'burned', 0.78);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------
   CREW ASTRONAUT SPRITES (Assets/Character/Character_*.png)
   Each sheet is 8 cols x 2 rows of 792x1344 frames. Columns hold one
   facing per pair; the two rows hold the stride / passing poses.
   Frames are [row, col]; walk cycles go stride -> pass -> stride -> pass.
   The Carry sheet swaps the front/back column pairs vs the Idle sheet.
   ------------------------------------------------------------------ */
// (Frame geometry + CREW_ANIM live in avatar-data.js so the lobby and the customised
// sheets in avatar.js share them.)
const CREW_SPRITE_H = 56;
const CREW_SPRITE_W = CREW_SPRITE_H * (CREW_FRAME_W / CREW_CROP_H);
const crewMotion = new WeakMap();

function crewFacing(angle = Math.PI / 2) {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  if (Math.abs(cx) > Math.abs(cy) * 0.9) return cx >= 0 ? 'right' : 'left';
  return cy >= 0 ? 'down' : 'up';
}

function crewIsMoving(p) {
  const now = performance.now();
  const m = crewMotion.get(p);
  if (!m || m.walk !== p.walk) {
    crewMotion.set(p, { walk: p.walk, changedAt: m ? now : 0 });
    return Boolean(m);
  }
  return now - m.changedAt < 140;
}

const snap2 = (v) => Math.round(v / 2) * 2;

function drawCrewTag(ctx, p, x, y, isLead) {
  ctx.save();
  ctx.font = 'bold 11px "Jersey 10", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = p.callsign || p.name; // p.name (P1..P4) is the game's identity key; callsign is the lobby name
  const tw = Math.ceil(ctx.measureText(label).width);
  const w = snap2(tw + 10);
  const h = 14;
  const tx = snap2(x - w / 2);
  const ty = snap2(y - h);
  ctx.fillStyle = '#06080f';
  ctx.fillRect(tx - 2, ty, w + 4, h);
  ctx.fillRect(tx, ty - 2, w, h + 4);
  ctx.fillStyle = p.color || '#94a3b8';
  ctx.fillRect(tx, ty, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(tx, ty, w, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, tx + w / 2, ty + h / 2 + 1);
  if (isLead) {
    // Bobbing yellow marker over the controlled crewmate.
    const bob = Math.floor(performance.now() / 260) % 2 ? 2 : 0;
    ctx.font = 'bold 16px "Jersey 10", monospace';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('▼', tx + w / 2, ty - 10 + bob);
  }
  ctx.restore();
}

// Where a held item sits relative to the carry pose (kept below the face).
function crewItemAnchor(p, facing) {
  if (facing === 'right') return { x: p.x + 14, y: p.y - 6 };
  if (facing === 'left') return { x: p.x - 14, y: p.y - 6 };
  if (facing === 'up') return { x: p.x, y: p.y - 14 };
  return { x: p.x, y: p.y + 2 };
}

// Crew astronaut (Stage 1 hangar & Stage 2 deck). Name kept for existing call sites.
export function drawChibiEngineer(ctx, p, isLead = false) {
  const facing = crewFacing(p.angle);
  const moving = crewIsMoving(p);
  const sheetKey = p.holding ? 'charCarry' : 'charIdle';
  const anim = CREW_ANIM[sheetKey][facing];
  const [row, col] = moving ? anim.walk[Math.floor((p.walk || 0) / 1.1) % 4] : anim.idle;
  const img = getAsset(sheetKey);
  const footY = p.y + 15;

  // Ground shadow + role ring
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(p.x, footY, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isLead ? '#ffd23f' : (p.color || '#94a3b8');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(p.x, footY, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();

  const item = p.holding ? crewItemAnchor(p, facing) : null;
  if (item && facing === 'up') drawItemBadge(ctx, item.x, item.y, p.holding);

  const dx = snap2(p.x - CREW_SPRITE_W / 2);
  const dy = snap2(footY - CREW_SPRITE_H + 2);
  // Lobby-customised crew (skin / hair / helmet / arm badge); null until its sheet is built.
  const custom = p.look ? getCrewSheet(p.look, sheetKey) : null;
  if (custom) {
    // Customised frames reach AVATAR_HEADROOM source px above the stock crop (tall hair), so
    // the destination grows upward by the same fraction and the feet stay put.
    const headroom = (CREW_SPRITE_H * AVATAR_HEADROOM) / CREW_CROP_H;
    ctx.drawImage(
      custom.canvas,
      col * custom.frameW, row * custom.frameH, custom.frameW, custom.frameH,
      dx, dy - headroom, CREW_SPRITE_W, CREW_SPRITE_H + headroom
    );
  } else if (isImageReady(img)) {
    ctx.drawImage(
      img,
      col * CREW_FRAME_W, row * CREW_FRAME_H + CREW_CROP_TOP, CREW_FRAME_W, CREW_CROP_H,
      dx, dy, CREW_SPRITE_W, CREW_SPRITE_H
    );
  } else {
    // Sheet still loading: simple suit silhouette in the role colour.
    ctx.fillStyle = p.color || '#94a3b8';
    ctx.fillRect(snap2(p.x - 10), snap2(p.y - 14), 20, 26);
    ctx.fillStyle = '#f2a36b';
    ctx.fillRect(snap2(p.x - 9), snap2(p.y - 32), 18, 18);
  }

  if (item && facing !== 'up') drawItemBadge(ctx, item.x, item.y, p.holding);
  if (p.hasWrench) {
    ctx.save();
    ctx.font = '18px "Jersey 10", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🔧', p.x + (facing === 'left' ? -16 : 16), p.y - 2);
    ctx.restore();
  }

  drawCrewTag(ctx, p, p.x, dy - 2, isLead);
}

// Standing idle crew character mounted on a lunar rover (Stage 3B & Rover Deploy transition).
// Uses the crew member's customised look with EVA helmet enabled, scaled to fit the rover deck.
export function drawRoverMountedCrew(ctx, crewIndex, x, y, facingAngle = 0, scale = 0.68, fallbackColor = '#f8fafc') {
  const facing = crewFacing(facingAngle);
  const [row, col] = (CREW_ANIM.charIdle[facing] || CREW_ANIM.charIdle.right).idle;
  const img = getAsset('charIdle');
  const spriteH = CREW_SPRITE_H * scale;
  const spriteW = CREW_SPRITE_W * scale;
  const dx = snap2(x - spriteW / 2);
  const dy = snap2(y - spriteH);

  const member = state.crew?.[crewIndex] || state.players?.[crewIndex];
  const baseLook = member?.look || { skin: crewIndex % 4, hair: crewIndex % 6, hairColor: crewIndex % 6, badge: crewIndex % 8, helmet: true };
  const evaLook = baseLook.helmet ? baseLook : { ...baseLook, helmet: true };
  const custom = getCrewSheet(evaLook, 'charIdle') || (member?.look ? getCrewSheet(member.look, 'charIdle') : null);

  if (custom) {
    const headroom = (spriteH * AVATAR_HEADROOM) / CREW_CROP_H;
    ctx.drawImage(
      custom.canvas,
      col * custom.frameW, row * custom.frameH, custom.frameW, custom.frameH,
      dx, dy - headroom, spriteW, spriteH + headroom
    );
  } else if (isImageReady(img)) {
    ctx.drawImage(
      img,
      col * CREW_FRAME_W, row * CREW_FRAME_H + CREW_CROP_TOP, CREW_FRAME_W, CREW_CROP_H,
      dx, dy, spriteW, spriteH
    );
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(snap2(x - 6), snap2(y - 22), 12, 20);
  }
}

const EARTH_SPIN_COLS = 10;
const EARTH_SPIN_FRAMES = 94;
const EARTH_SPIN_CELL = 48;

// Animated rotating pixel-art Earth from Assets/Planet/earthspin-sheet.png (10x10 grid, 94 frames of 48x48).
export function drawSpinningEarth(ctx, cx, cy, radius, nowSec = performance.now() * 0.001, opts = {}) {
  const r = Math.max(4, Math.round(radius));
  const ox = snap2(cx);
  const oy = snap2(cy);
  const size = snap2(r * 2);

  if (opts.halo !== false) {
    ctx.save();
    const haloR = snap2(r * (opts.haloScale ?? 1.28));
    const halo = ctx.createRadialGradient(ox, oy, r * 0.82, ox, oy, haloR);
    halo.addColorStop(0, opts.haloInner || 'rgba(56, 189, 248, 0.34)');
    halo.addColorStop(0.55, 'rgba(56, 189, 248, 0.12)');
    halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ox, oy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const sheet = getAsset('earthSpinSheet');
  if (isImageReady(sheet)) {
    const fps = opts.fps ?? 12;
    const frame = ((Math.floor(nowSec * fps) % EARTH_SPIN_FRAMES) + EARTH_SPIN_FRAMES) % EARTH_SPIN_FRAMES;
    const col = frame % EARTH_SPIN_COLS;
    const row = Math.floor(frame / EARTH_SPIN_COLS);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet,
      col * EARTH_SPIN_CELL,
      row * EARTH_SPIN_CELL,
      EARTH_SPIN_CELL,
      EARTH_SPIN_CELL,
      ox - size / 2,
      oy - size / 2,
      size,
      size
    );
    ctx.restore();
    return true;
  }

  ctx.save();
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return false;
}

// Pixel-art Moon from Assets/Planet/pixel_moon.png (330x330).
export function drawPixelMoon(ctx, cx, cy, radius, opts = {}) {
  const r = Math.max(4, Math.round(radius));
  const ox = snap2(cx);
  const oy = snap2(cy);
  const size = snap2(r * 2);

  if (opts.halo) {
    ctx.save();
    const haloR = snap2(r * 1.22);
    const halo = ctx.createRadialGradient(ox, oy, r * 0.85, ox, oy, haloR);
    halo.addColorStop(0, 'rgba(203, 213, 225, 0.24)');
    halo.addColorStop(1, 'rgba(203, 213, 225, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ox, oy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const img = getAsset('pixelMoon');
  if (isImageReady(img)) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, ox - size / 2, oy - size / 2, size, size);
    ctx.restore();
    return true;
  }

  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return false;
}


// Notched pixel panel (matches the DOM .px frames): 2px ink outline with open
// corners, flat body, 2px top highlight and bottom shade. Coordinates snap to
// the 2px art grid.
export function drawPixelPanel(ctx, x, y, w, h, { fill = '#161f37', hi = '#3b4c78', lo = '#0d1428', ink = '#06080f' } = {}) {
  const X = snap2(x);
  const Y = snap2(y);
  const W = snap2(w);
  const H = snap2(h);
  ctx.fillStyle = ink;
  ctx.fillRect(X, Y - 2, W, H + 4);
  ctx.fillRect(X - 2, Y, W + 4, H);
  ctx.fillStyle = fill;
  ctx.fillRect(X, Y, W, H);
  ctx.fillStyle = hi;
  ctx.fillRect(X, Y, W, 2);
  ctx.fillStyle = lo;
  ctx.fillRect(X, Y + H - 2, W, 2);
}

export function drawCanvasControlBar(ctx, logicalW, items, y = 584) {
  ctx.save();
  ctx.font = '600 13px "Jersey 10", monospace';
  let totalW = 16;
  const measured = items.map(it => {
    ctx.font = '700 12px "Jersey 10", monospace';
    const kw = snap2(Math.max(24, ctx.measureText(it.key).width + 12));
    ctx.font = '600 13px "Jersey 10", monospace';
    const lw = snap2(ctx.measureText(it.label).width + 8);
    totalW += kw + lw + 14;
    return { ...it, kw, lw };
  });
  totalW -= 6;
  const bx = snap2((logicalW - totalW) / 2);
  const by = snap2(y - 16);

  drawPixelPanel(ctx, bx, by, totalW, 30, { fill: 'rgba(22, 31, 55, 0.94)' });

  let cx = bx + 10;
  for (const m of measured) {
    // Keycap: hazard yellow with a darker lip and ink outline
    ctx.fillStyle = '#06080f';
    ctx.fillRect(cx - 2, by + 4, m.kw + 4, 22);
    ctx.fillStyle = '#f6c445';
    ctx.fillRect(cx, by + 6, m.kw, 18);
    ctx.fillStyle = '#a8741a';
    ctx.fillRect(cx, by + 22, m.kw, 2);
    ctx.fillStyle = '#06080f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px "Jersey 10", monospace';
    ctx.fillText(m.key, cx + m.kw / 2, by + 15);

    cx += m.kw + 8;
    ctx.fillStyle = '#eef1f8';
    ctx.textAlign = 'left';
    ctx.font = '600 13px "Jersey 10", monospace';
    ctx.fillText(m.label, cx, by + 15);
    cx += m.lw + 8;
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
    // Stars sit on the 2px art grid: single pixels, bright ones as a "+" sparkle.
    const gx = Math.floor(sx / 2) * 2;
    const gy = Math.floor(sy / 2) * 2;
    ctx.fillRect(gx, gy, 2, 2);
    if (s.size > 2.2) {
      ctx.fillRect(gx - 2, gy, 2, 2);
      ctx.fillRect(gx + 2, gy, 2, 2);
      ctx.fillRect(gx, gy - 2, 2, 2);
      ctx.fillRect(gx, gy + 2, 2, 2);
    }
  }
  ctx.restore();
}
