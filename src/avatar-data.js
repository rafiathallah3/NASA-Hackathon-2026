// Astronaut customization data + pure helpers (no DOM, no canvas).
//
// A "look" is a small plain object so it can be saved to localStorage and, later,
// sent over the network:
//   { skin: 0..7, hair: -1..7 (-1 = bald), hairColor: 0..11, badge: 0..5, helmet: boolean }
//
// All pixel coordinates below were measured from the art in Assets/:
//   Character/Character_{Idle,Carry}.png   8 cols x 2 rows of 792x1344 frames
//   Hair/Pixel Art Hairstyle Customization Sheet.png   8 styles x (front, back, side)
//   Badges/Badge.png                        6 country flags
//   Helmet/Helmet_Character.png             front, back, side
// src/avatar.js composites them at runtime; nothing here touches the DOM.

/* ------------------------------------------------------------------ frames */

export const CREW_FRAME_W = 792;
export const CREW_FRAME_H = 1344;
export const CREW_CROP_TOP = 90;
export const CREW_CROP_H = 1180;
// Customised frames keep extra room above the stock crop so tall hair is not clipped.
export const AVATAR_HEADROOM = 70; // hair tops out ~45px above the stock crop
export const AVATAR_SRC_TOP = CREW_CROP_TOP - AVATAR_HEADROOM; // frame-cell y of the canvas top
export const AVATAR_SRC_H = CREW_CROP_H + AVATAR_HEADROOM;

// Frames are [row, col]; walk cycles go stride -> pass -> stride -> pass.
// The Carry sheet swaps the front/back column pairs vs the Idle sheet.
export const CREW_ANIM = {
  charIdle: {
    down: { idle: [1, 0], walk: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    up: { idle: [1, 2], walk: [[0, 2], [1, 2], [0, 3], [1, 3]] },
    right: { idle: [1, 4], walk: [[0, 4], [1, 4], [0, 5], [1, 5]] },
    left: { idle: [0, 7], walk: [[1, 7], [0, 7], [1, 6], [0, 6]] }
  },
  charCarry: {
    down: { idle: [1, 2], walk: [[0, 2], [1, 2], [0, 3], [1, 3]] },
    up: { idle: [1, 0], walk: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    right: { idle: [1, 4], walk: [[0, 4], [1, 4], [0, 5], [1, 5]] },
    left: { idle: [0, 7], walk: [[1, 7], [0, 7], [1, 6], [0, 6]] }
  }
};

export const SHEET_KEYS = ['charIdle', 'charCarry'];

// Facing of each column pair (index = col).
export const SHEET_FACING = {
  charIdle: ['down', 'down', 'up', 'up', 'right', 'right', 'left', 'left'],
  charCarry: ['up', 'up', 'down', 'down', 'right', 'right', 'left', 'left']
};

// Skin bounding box [x0, x1, y0, y1] of the bald head in each frame (cell pixels),
// index = row * 8 + col. Hair, helmet and badge are placed relative to it.
export const HEAD_BOXES = {
  charIdle: [
    [139, 653, 111, 554], [134, 648, 105, 548], [151, 665, 106, 497], [142, 658, 106, 497],
    [230, 677, 112, 550], [184, 631, 112, 550], [175, 622, 113, 550], [129, 577, 113, 550],
    [136, 650, 105, 548], [136, 649, 102, 545], [152, 666, 106, 497], [121, 637, 106, 497],
    [214, 662, 113, 550], [169, 616, 112, 550], [160, 607, 112, 550], [114, 561, 112, 550]
  ],
  charCarry: [
    [172, 673, 104, 495], [169, 667, 104, 495], [165, 677, 108, 547], [140, 651, 107, 547],
    [218, 663, 105, 542], [158, 603, 106, 543], [218, 663, 105, 543], [159, 603, 106, 543],
    [171, 670, 104, 495], [147, 646, 104, 495], [153, 664, 108, 547], [132, 644, 108, 547],
    [188, 632, 106, 543], [128, 573, 106, 543], [188, 633, 105, 543], [128, 573, 105, 542]
  ]
};

/* ------------------------------------------------------- overlay sprites */

// [x, y, w, h] in the source sheets. Hair: 8 styles x [front, back, side].
// The hair side view is drawn facing LEFT; the helmet side view faces RIGHT.
export const HAIR_RECTS = [
  [[46, 33, 215, 165], [302, 33, 207, 189], [543, 35, 186, 175]],
  [[806, 33, 225, 176], [1065, 33, 204, 189], [1300, 35, 201, 175]],
  [[39, 274, 232, 174], [297, 267, 218, 212], [535, 273, 200, 193]],
  [[811, 281, 220, 180], [1065, 281, 209, 198], [1305, 279, 203, 191]],
  [[45, 526, 221, 232], [308, 523, 206, 236], [543, 521, 198, 232]],
  [[818, 512, 199, 232], [1077, 516, 192, 243], [1305, 523, 211, 205]],
  [[48, 796, 216, 165], [308, 799, 201, 175], [543, 799, 192, 168]],
  [[830, 802, 187, 140], [1083, 804, 180, 170], [1327, 804, 175, 163]]
];
export const BADGE_RECTS = [
  [82, 87, 738, 513], [977, 138, 739, 524], [1873, 201, 740, 524],
  [76, 887, 738, 513], [972, 938, 739, 524], [1867, 1001, 740, 524]
];
export const HELMET_RECTS = [[42, 225, 537, 460], [634, 225, 533, 452], [1264, 225, 468, 460]];

export const VIEW_OF_FACING = { down: 0, up: 1, left: 2, right: 2 };

// Placement per sheet + facing, as fractions of the head box (hw / hh):
//   hair/helmet: kw = sprite width / hw, dx = centre offset / hw, dy = top offset / hh from head top
//   badge:       kw = sprite width / hw, dx = centre offset / hw, dy = centre offset / hh from head bottom
const IDLE_PLACE = {
  down: { hair: { kw: 1.02, dx: 0, dy: -0.10 }, helmet: { kw: 1.12, dx: 0, dy: -0.08 }, badge: { kw: 0.26, dx: 0.50, dy: 0.46 } },
  up: { hair: { kw: 1.02, dx: 0, dy: -0.08 }, helmet: { kw: 1.12, dx: 0, dy: -0.08 }, badge: { kw: 0.26, dx: -0.50, dy: 0.46 } },
  left: { hair: { kw: 1.07, dx: 0.025, dy: -0.10 }, helmet: { kw: 1.22, dx: 0.04, dy: -0.12 }, badge: { kw: 0.24, dx: 0.02, dy: 0.50 } },
  right: { hair: { kw: 1.07, dx: -0.025, dy: -0.10 }, helmet: { kw: 1.22, dx: -0.04, dy: -0.12 }, badge: { kw: 0.24, dx: -0.02, dy: 0.50 } }
};
// Carry pose: arms are raised, so the patch sits higher on the shoulder / upper sleeve.
const CARRY_PLACE = {
  down: { ...IDLE_PLACE.down, badge: { kw: 0.26, dx: 0.50, dy: 0.26 } },
  up: { ...IDLE_PLACE.up, badge: { kw: 0.26, dx: -0.50, dy: 0.26 } },
  left: { ...IDLE_PLACE.left, badge: { kw: 0.24, dx: -0.12, dy: 0.30 } },
  right: { ...IDLE_PLACE.right, badge: { kw: 0.24, dx: 0.12, dy: 0.30 } }
};
export const PLACEMENT = { charIdle: IDLE_PLACE, charCarry: CARRY_PLACE };

// Per hair style + view tweaks [dkw, ddx, ddy] for sprites that do not cover the skull
// with the default fit. Key: `${style}:${view}` (view 0 front, 1 back, 2 side).
export const HAIR_ADJUST = { '5:1': [0.09, 0, -0.07] };

// Idle pose used for portraits and the lobby preview.
export const PREVIEW_FACINGS = ['down', 'right', 'up', 'left'];

// Head + shoulders crop of a frame cell for portraits: [x, y, w, h] in cell pixels.
export const BUST_RECT = [76, 20, 640, 640];

/* ------------------------------------------------------------ option tables */

export const SKIN_TONES = [
  { id: 'porcelain', name: 'Porcelain', rgb: [255, 224, 196] },
  { id: 'fair', name: 'Fair', rgb: [244, 194, 160] },
  { id: 'classic', name: 'Classic', rgb: [248, 168, 112] },
  { id: 'tan', name: 'Tan', rgb: [214, 150, 104] },
  { id: 'caramel', name: 'Caramel', rgb: [178, 114, 76] },
  { id: 'bronze', name: 'Bronze', rgb: [141, 85, 60] },
  { id: 'umber', name: 'Umber', rgb: [106, 64, 44] },
  { id: 'ebony', name: 'Ebony', rgb: [74, 46, 34] }
];

export const HAIR_STYLES = [
  { id: 'tousled', name: 'Tousled' },
  { id: 'sweep', name: 'Side Sweep' },
  { id: 'spiky', name: 'Spiky' },
  { id: 'curly', name: 'Curly' },
  { id: 'long', name: 'Long' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'bowl', name: 'Bowl Cut' },
  { id: 'buzz', name: 'Buzz Cut' }
];

export const HAIR_COLORS = [
  { id: 'black', name: 'Black', rgb: [32, 30, 40] },
  { id: 'espresso', name: 'Espresso', rgb: [62, 38, 30] },
  { id: 'chestnut', name: 'Chestnut', rgb: [112, 68, 44] },
  { id: 'auburn', name: 'Auburn', rgb: [150, 66, 38] },
  { id: 'ginger', name: 'Ginger', rgb: [212, 98, 40] },
  { id: 'blonde', name: 'Blonde', rgb: [228, 186, 92] },
  { id: 'platinum', name: 'Platinum', rgb: [236, 230, 214] },
  { id: 'silver', name: 'Silver', rgb: [160, 166, 180] },
  { id: 'cobalt', name: 'Cobalt', rgb: [52, 102, 206] },
  { id: 'violet', name: 'Violet', rgb: [140, 92, 214] },
  { id: 'pink', name: 'Pink', rgb: [232, 102, 172] },
  { id: 'mint', name: 'Mint', rgb: [88, 204, 152] }
];

// Same order as the flags in Assets/Badges/Badge.png (row by row).
export const BADGES = [
  { id: 'ID', name: 'Indonesia' },
  { id: 'US', name: 'United States' },
  { id: 'AO', name: 'Angola' },
  { id: 'AR', name: 'Argentina' },
  { id: 'JP', name: 'Japan' },
  { id: 'GB', name: 'United Kingdom' }
];

export const DEFAULT_LOOK = Object.freeze({ skin: 3, hair: 0, hairColor: 1, badge: 0, helmet: false });

export const NAME_MAX = 12;
const CALLSIGNS = [
  'Nova', 'Orion', 'Vega', 'Comet', 'Pixel', 'Quasar', 'Lyra', 'Atlas', 'Zenith', 'Cosmo',
  'Luna', 'Rigel', 'Sirius', 'Astra', 'Mira', 'Kepler', 'Halley', 'Ceres', 'Apollo', 'Titan'
];

/* ------------------------------------------------------------- look helpers */

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Always returns a complete, in-range look (unknown / missing fields fall back to defaults).
export function sanitizeLook(look) {
  const src = look && typeof look === 'object' ? look : {};
  return {
    skin: clampInt(src.skin, 0, SKIN_TONES.length - 1, DEFAULT_LOOK.skin),
    hair: clampInt(src.hair, -1, HAIR_STYLES.length - 1, DEFAULT_LOOK.hair),
    hairColor: clampInt(src.hairColor, 0, HAIR_COLORS.length - 1, DEFAULT_LOOK.hairColor),
    badge: clampInt(src.badge, 0, BADGES.length - 1, DEFAULT_LOOK.badge),
    helmet: Boolean(src.helmet)
  };
}

export function lookKey(look) {
  const l = sanitizeLook(look);
  return `${l.skin}.${l.hair}.${l.hairColor}.${l.badge}.${l.helmet ? 1 : 0}`;
}

export function sanitizeName(raw) {
  return String(raw ?? '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/* ---------------------------------------------------------------------- rng */

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 0..1 generator for a string / number seed.
export function makeRng(seed) {
  return mulberry32(xmur3(String(seed))());
}

const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));

export function randomLook(rng = Math.random) {
  return sanitizeLook({
    skin: pickIndex(rng, SKIN_TONES.length),
    hair: pickIndex(rng, HAIR_STYLES.length + 1) - 1,
    hairColor: pickIndex(rng, HAIR_COLORS.length),
    badge: pickIndex(rng, BADGES.length),
    helmet: rng() < 0.12
  });
}

// A callsign that is not in `taken` (case-insensitive); numbered when the list runs out.
export function randomCallsign(rng = Math.random, taken = []) {
  const used = new Set([...taken].map(n => String(n).toLowerCase()));
  const start = pickIndex(rng, CALLSIGNS.length);
  for (let i = 0; i < CALLSIGNS.length; i++) {
    const name = CALLSIGNS[(start + i) % CALLSIGNS.length];
    if (!used.has(name.toLowerCase())) return name;
  }
  for (let n = 2; n < 100; n++) {
    const name = `${CALLSIGNS[start]}${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return CALLSIGNS[start];
}

/* -------------------------------------------------------------- pixel math */
// These operate on RGBA byte arrays (ImageData.data) in place, so they can be unit tested
// without a canvas.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const SKIN_BASE_LUM = lum(248, 168, 112); // the stock orange skin of the Character sheets
const HAIR_BASE_LUM = lum(80, 48, 48); // the stock brown of the hair sheet
const HAIR_OUTLINE_LUM = 26; // near-black outline pixels keep their colour

// Skin = orange hue band (about 5..50 degrees, saturation > 0.25, value > 0.15). Shading is
// preserved by scaling the target tone with each pixel's luminance relative to stock skin.
export function recolorSkinPixels(d, rgb) {
  const tr = rgb[0];
  const tg = rgb[1];
  const tb = rgb[2];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r < g || g < b) continue; // hue must sit between red and yellow
    const span = r - b;
    if (span <= 0 || r <= 38 || span / r <= 0.25) continue;
    const t = (g - b) / span; // hue / 60 while red is the max channel
    if (t <= 5 / 60 || t >= 50 / 60) continue;
    const k = lum(r, g, b) / SKIN_BASE_LUM;
    d[i] = Math.min(255, Math.round(tr * k));
    d[i + 1] = Math.min(255, Math.round(tg * k));
    d[i + 2] = Math.min(255, Math.round(tb * k));
  }
}

// Hair sprites are one brown ramp plus dark outlines: scale the target colour by each
// pixel's luminance, leaving the outline untouched.
export function recolorHairPixels(d, rgb) {
  const tr = rgb[0];
  const tg = rgb[1];
  const tb = rgb[2];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const L = lum(d[i], d[i + 1], d[i + 2]);
    if (L < HAIR_OUTLINE_LUM) continue;
    const k = L / HAIR_BASE_LUM;
    d[i] = Math.min(255, Math.round(tr * k));
    d[i + 1] = Math.min(255, Math.round(tg * k));
    d[i + 2] = Math.min(255, Math.round(tb * k));
  }
}

// Where each overlay lands on a frame, in frame-cell pixels. Pure: shared by the canvas
// compositor and the tests. Returns null for a missing / invalid frame.
export function computeOverlays(sheetKey, row, col, look) {
  const box = HEAD_BOXES[sheetKey]?.[row * 8 + col];
  const facing = SHEET_FACING[sheetKey]?.[col];
  if (!box || !facing) return null;
  const l = sanitizeLook(look);
  const [x0, x1, y0, y1] = box;
  const hw = x1 - x0 + 1;
  const hh = y1 - y0 + 1;
  const cx = (x0 + x1) / 2;
  const place = PLACEMENT[sheetKey][facing];
  const view = VIEW_OF_FACING[facing];
  const out = { facing, view, hair: null, helmet: null, badge: null };

  if (l.helmet) {
    const [, , rw, rh] = HELMET_RECTS[view];
    const w = hw * place.helmet.kw;
    const h = (rh * w) / rw;
    out.helmet = { rect: HELMET_RECTS[view], left: cx + place.helmet.dx * hw - w / 2, top: y0 + place.helmet.dy * hh, w, h, flip: facing === 'left' };
  } else if (l.hair >= 0) {
    const rect = HAIR_RECTS[l.hair][view];
    const adj = HAIR_ADJUST[`${l.hair}:${view}`] || [0, 0, 0];
    const kw = place.hair.kw + adj[0];
    const dx = place.hair.dx + adj[1] * (facing === 'right' ? -1 : 1);
    const dy = place.hair.dy + adj[2];
    const w = hw * kw;
    const h = (rect[3] * w) / rect[2];
    out.hair = { style: l.hair, rect, left: cx + dx * hw - w / 2, top: y0 + dy * hh, w, h, flip: facing === 'right' };
  }

  const rect = BADGE_RECTS[l.badge];
  const bw = hw * place.badge.kw;
  const bh = (rect[3] * bw) / rect[2];
  out.badge = { badge: l.badge, rect, left: cx + place.badge.dx * hw - bw / 2, top: y1 + place.badge.dy * hh - bh / 2, w: bw, h: bh };
  return out;
}
