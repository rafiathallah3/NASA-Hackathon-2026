// Astronaut compositor: turns a "look" (see avatar-data.js) into pixel-art frames by
// recolouring the stock bald crew sheet and layering hair / helmet / country badge on top.
// Used by the lobby (preview, portraits, option tiles) and by drawChibiEngineer in-game.

import { getAsset, isImageReady, preloadAllAssets } from './assets.js';
import {
  CREW_FRAME_W, CREW_CROP_TOP, CREW_CROP_H, CREW_FRAME_H, AVATAR_SRC_TOP, AVATAR_SRC_H,
  CREW_ANIM, SHEET_KEYS, HAIR_RECTS, BADGE_RECTS, HELMET_RECTS, HAIR_COLORS, SKIN_TONES, BUST_RECT,
  sanitizeLook, lookKey, recolorSkinPixels, recolorHairPixels, computeOverlays
} from './avatar-data.js';

const ASSET_KEYS = ['charIdle', 'charCarry', 'hairSheet', 'badgeSheet', 'helmetSheet'];

// Frames used by the lobby preview vs the in-game sheets (frame is ~1/5.5 or 1/8 of source).
export const PREVIEW_SCALE = 0.18;
export const GAME_SCALE = 0.125;

export function avatarAssetsReady() {
  return ASSET_KEYS.every(key => isImageReady(getAsset(key)));
}

// Resolves once every sprite sheet has loaded (also when called before they start).
export function whenAvatarAssetsReady() {
  return preloadAllAssets().then(() => avatarAssetsReady());
}

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/* ------------------------------------------------------------ small LRU map */

function createLru(max) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (hit !== undefined) {
        map.delete(key);
        map.set(key, hit);
      }
      return hit;
    },
    set(key, value) {
      map.set(key, value);
      while (map.size > max) map.delete(map.keys().next().value);
      return value;
    }
  };
}

/* ----------------------------------------------------------- overlay sprites */

const spriteCache = createLru(160);

function cropSprite(sheetKey, rect, cacheKey, recolor) {
  const hit = spriteCache.get(cacheKey);
  if (hit) return hit;
  const img = getAsset(sheetKey);
  if (!isImageReady(img)) return null;
  const [x, y, w, h] = rect;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: Boolean(recolor) });
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  if (recolor) {
    const px = g.getImageData(0, 0, w, h);
    recolor(px.data);
    g.putImageData(px, 0, 0);
  }
  return spriteCache.set(cacheKey, c);
}

export function getHairSprite(style, view, colorIdx) {
  const rgb = HAIR_COLORS[colorIdx]?.rgb;
  if (!HAIR_RECTS[style] || !rgb) return null;
  return cropSprite('hairSheet', HAIR_RECTS[style][view], `hair:${style}:${view}:${colorIdx}`, d => recolorHairPixels(d, rgb));
}

export function getBadgeSprite(badge) {
  if (!BADGE_RECTS[badge]) return null;
  return cropSprite('badgeSheet', BADGE_RECTS[badge], `badge:${badge}`);
}

export function getHelmetSprite(view) {
  if (!HELMET_RECTS[view]) return null;
  return cropSprite('helmetSheet', HELMET_RECTS[view], `helmet:${view}`);
}

/* ------------------------------------------------------------ frame compositor */

function drawOverlay(g, sprite, o, sx, sy) {
  if (!sprite || !o) return;
  const dx = o.left * sx;
  const dy = (o.top - AVATAR_SRC_TOP) * sy;
  const dw = o.w * sx;
  const dh = o.h * sy;
  if (o.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(sprite, 0, 0, dw, dh);
    g.restore();
  } else {
    g.drawImage(sprite, dx, dy, dw, dh);
  }
}

// One customised frame. The canvas covers frame-cell y in [AVATAR_SRC_TOP, CREW_CROP_TOP + CREW_CROP_H]
// so hair can rise above the stock crop. Returns null while the sheets are still loading.
function buildFrame(look, sheetKey, row, col, scale) {
  const sheet = getAsset(sheetKey);
  if (!isImageReady(sheet) || !avatarAssetsReady()) return null;
  const l = sanitizeLook(look);
  const cw = Math.max(1, Math.round(CREW_FRAME_W * scale));
  const ch = Math.max(1, Math.round(AVATAR_SRC_H * scale));
  const sx = cw / CREW_FRAME_W;
  const sy = ch / AVATAR_SRC_H;
  const canvas = makeCanvas(cw, ch);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  const srcH = CREW_CROP_TOP + CREW_CROP_H;
  g.drawImage(
    sheet,
    col * CREW_FRAME_W, row * CREW_FRAME_H, CREW_FRAME_W, srcH,
    0, -AVATAR_SRC_TOP * sy, CREW_FRAME_W * sx, srcH * sy
  );
  const px = g.getImageData(0, 0, cw, ch);
  recolorSkinPixels(px.data, SKIN_TONES[l.skin].rgb);
  g.putImageData(px, 0, 0);

  const ov = computeOverlays(sheetKey, row, col, l);
  if (!ov) return canvas;
  if (ov.helmet) drawOverlay(g, getHelmetSprite(ov.view), ov.helmet, sx, sy);
  else if (ov.hair) drawOverlay(g, getHairSprite(ov.hair.style, ov.view, l.hairColor), ov.hair, sx, sy);
  drawOverlay(g, getBadgeSprite(ov.badge.badge), ov.badge, sx, sy);
  return canvas;
}

const frameCache = createLru(48);

// Cached single frame (lobby preview / portraits).
export function renderFrame(look, sheetKey, row, col, scale = PREVIEW_SCALE) {
  const key = `${lookKey(look)}|${sheetKey}|${row}|${col}|${scale}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const frame = buildFrame(look, sheetKey, row, col, scale);
  return frame ? frameCache.set(key, frame) : null;
}

/* ------------------------------------------------------------- DOM painters */

// Paints the idle pose of `look` into a <canvas>. mode 'full' sizes the canvas to the frame;
// mode 'bust' crops head + shoulders into the canvas' current (or given) size.
export function paintAvatar(canvas, look, { facing = 'down', mode = 'full', width, height, scale = PREVIEW_SCALE } = {}) {
  const [row, col] = (CREW_ANIM.charIdle[facing] || CREW_ANIM.charIdle.down).idle;
  const frame = renderFrame(look, 'charIdle', row, col, scale);
  if (mode === 'bust') {
    if (width) canvas.width = width;
    if (height) canvas.height = height;
  } else if (frame) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return false;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (mode === 'bust') {
    const sy = frame.height / AVATAR_SRC_H;
    const sx = frame.width / CREW_FRAME_W;
    const [bx, by, bw, bh] = BUST_RECT;
    g.drawImage(frame, bx * sx, (by - AVATAR_SRC_TOP) * sy, bw * sx, bh * sy, 0, 0, canvas.width, canvas.height);
  } else {
    g.drawImage(frame, 0, 0);
  }
  return true;
}

function paintContained(canvas, sprite) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!sprite) return false;
  const pad = 2;
  const k = Math.min((canvas.width - pad * 2) / sprite.width, (canvas.height - pad * 2) / sprite.height);
  const w = sprite.width * k;
  const h = sprite.height * k;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(sprite, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return true;
}

// Front view of a hair style in `colorIdx`, for the option grid (style -1 = bald: blank tile).
export function paintHairTile(canvas, style, colorIdx) {
  if (style < 0) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return true;
  }
  return paintContained(canvas, getHairSprite(style, 0, colorIdx));
}

export function paintFlagTile(canvas, badge) {
  return paintContained(canvas, getBadgeSprite(badge));
}

/* ------------------------------------------------------------- in-game sheets */

const sheetCache = createLru(16);

// Full 8x2 customised sheet for in-game drawing (same row/col layout as the stock sheet).
// Draw frame [row, col] from `canvas` at (col * frameW, row * frameH, frameW, frameH); the frame
// extends AVATAR_HEADROOM source px above the stock crop. Null while assets load.
export function getCrewSheet(look, sheetKey) {
  if (!SHEET_KEYS.includes(sheetKey)) return null;
  const key = `${lookKey(look)}|${sheetKey}`;
  const hit = sheetCache.get(key);
  if (hit) return hit;
  if (!avatarAssetsReady()) return null;

  const frameW = Math.max(1, Math.round(CREW_FRAME_W * GAME_SCALE));
  const frameH = Math.max(1, Math.round(AVATAR_SRC_H * GAME_SCALE));
  const canvas = makeCanvas(frameW * 8, frameH * 2);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const frame = buildFrame(look, sheetKey, row, col, GAME_SCALE);
      if (frame) g.drawImage(frame, col * frameW, row * frameH);
    }
  }
  return sheetCache.set(key, { canvas, frameW, frameH });
}

// Build the in-game sheets for a crew one per tick, so starting a mission never janks.
export function prewarmCrewSheets(crew) {
  const jobs = [];
  const seen = new Set();
  for (const member of crew || []) {
    for (const sheetKey of SHEET_KEYS) {
      const key = `${lookKey(member.look)}|${sheetKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push([member.look, sheetKey]);
    }
  }
  const step = () => {
    const job = jobs.shift();
    if (!job) return;
    getCrewSheet(job[0], job[1]);
    setTimeout(step, 0);
  };
  whenAvatarAssetsReady().then(step);
}
