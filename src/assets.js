const ASSET_PATHS = {
  // Stage 1 Hangar & Sheets
  stage1Bg: 'Assets/Stage 1/Background Enironment_Stage 1.png',
  cratesSheet: 'Assets/Stage 1/Resource Crates_Stage 1.png',
  tablesSheet: 'Assets/Stage 1/Tables_Stage 1.png',
  logisticsSheet: 'Assets/Stage 1/Logistics & Safety_Stage 1.png',
  stationsSheet: 'Assets/Stage 1/Processing Stations_Stage 1.png',

  // Crew astronaut sheets: 8 cols x 2 rows of 792x1344 frames (see sprites.js CREW_ANIM)
  charIdle: 'Assets/Character/Character_Idle.png',
  charCarry: 'Assets/Character/Character_Carry.png',

  // Space & FX Layers (Stages 1B, 2, 4)
  spaceBack: 'Assets/background/layered/bg-back.png',
  spacePlanet: 'Assets/background/layered/bg-planet.png',
  spaceStars: 'Assets/background/layered/bg-stars.png',
  asteroidLg: 'Assets/asteroids/asteroid.png',
  asteroidSm: 'Assets/asteroids/asteroid-small.png'
};

const ITEM_PATHS = {
  optics: 'Assets/Stage 1/Carried and Crafted Items/optics.png.png',
  cal_optics: 'Assets/Stage 1/Carried and Crafted Items/cal_optics.png.png',
  circuit: 'Assets/Stage 1/Carried and Crafted Items/circuit.png.png',
  weld_circuit: 'Assets/Stage 1/Carried and Crafted Items/weld_circuit.png.png',
  battery: 'Assets/Stage 1/Carried and Crafted Items/battery.png.png',
  chg_battery: 'Assets/Stage 1/Carried and Crafted Items/chg_battery.png.png',
  solar: 'Assets/Stage 1/Carried and Crafted Items/solar.png.png',
  weld_solar: 'Assets/Stage 1/Carried and Crafted Items/weld_solar.png.png',
  dish: 'Assets/Stage 1/Carried and Crafted Items/dish.png.png',
  cal_dish: 'Assets/Stage 1/Carried and Crafted Items/cal_dish.png.png',
  tank: 'Assets/Stage 1/Carried and Crafted Items/tank.png.png',
  chg_tank: 'Assets/Stage 1/Carried and Crafted Items/chg_tank.png.png',
  burned: 'Assets/Stage 1/Carried and Crafted Items/burned.png.png',
  tray: 'Assets/Stage 1/Carried and Crafted Items/tray.png.png',
  extinguisher: 'Assets/Stage 1/Carried and Crafted Items/extinguisher.png.png'
};

// Exact non-transparent pixel bounding boxes measured from Assets/Stage 1/Carried and Crafted Items/*.png.png
export const ITEM_BOUNDS = {
  optics:       { x: 75,  y: 109, w: 361, h: 336 },
  cal_optics:   { x: 73,  y: 91,  w: 363, h: 332 },
  circuit:      { x: 4,   y: 143, w: 395, h: 274 },
  weld_circuit: { x: 14,  y: 85,  w: 379, h: 342 },
  battery:      { x: 78,  y: 104, w: 341, h: 347 },
  chg_battery:  { x: 152, y: 71,  w: 205, h: 373 },
  solar:        { x: 39,  y: 87,  w: 392, h: 388 },
  weld_solar:   { x: 39,  y: 63,  w: 392, h: 394 },
  dish:         { x: 61,  y: 75,  w: 328, h: 388 },
  cal_dish:     { x: 67,  y: 70,  w: 322, h: 384 },
  tank:         { x: 18,  y: 110, w: 385, h: 341 },
  chg_tank:     { x: 16,  y: 80,  w: 387, h: 353 },
  burned:       { x: 70,  y: 49,  w: 371, h: 359 },
  tray:         { x: 36,  y: 38,  w: 418, h: 375 },
  extinguisher: { x: 153, y: 25,  w: 204, h: 411 }
};

const ANIM_PATHS = {
  weldFrames: [
    'Assets/Stage 1/Processing Machine Animation/Blue Welding Workbench (1).png',
    'Assets/Stage 1/Processing Machine Animation/Blue Welding Workbench (2).png',
    'Assets/Stage 1/Processing Machine Animation/Blue Welding Workbench (3).png'
  ],
  calFrames: [
    'Assets/Stage 1/Processing Machine Animation/Purple Calibration Rig (1).png',
    'Assets/Stage 1/Processing Machine Animation/Purple Calibration Rig (2).png',
    'Assets/Stage 1/Processing Machine Animation/Purple Calibration Rig (3).png'
  ],
  chgFrames: [
    'Assets/Stage 1/Processing Machine Animation/Green Battery Charge Tower.png',
    'Assets/Stage 1/Processing Machine Animation/Gemini_Generated_Image_7p2opg7p2opg7p2o_0008.png',
    'Assets/Stage 1/Processing Machine Animation/Gemini_Generated_Image_7p2opg7p2opg7p2o_0009.png'
  ],
  conveyorFrames: [
    'Assets/Stage 1/Conveyor/Conveyor (1).png',
    'Assets/Stage 1/Conveyor/Conveyor (2).png',
    'Assets/Stage 1/Conveyor/Conveyor (3).png',
    'Assets/Stage 1/Conveyor/Conveyor (4).png'
  ],
  tableProps: [
    'Assets/Stage 1/Table Props/Table Props (1).png', // 0: amber warning beacon
    'Assets/Stage 1/Table Props/Table Props (2).png', // 1: robotic arm
    'Assets/Stage 1/Table Props/Table Props (3).png'  // 2: telemetry monitor & keyboard
  ],
  fireSmokeFrames: Array.from({ length: 16 }, (_, i) => {
    const num = String(i + 1).padStart(4, '0');
    return `Assets/Stage 1/Smoke and Fire/Smoke &amp; Fire_${num}.png`;
  }),
  explosionFrames: [
    'Assets/explosion/sprites/explosion1.png',
    'Assets/explosion/sprites/explosion2.png',
    'Assets/explosion/sprites/explosion3.png',
    'Assets/explosion/sprites/explosion4.png',
    'Assets/explosion/sprites/explosion5.png'
  ]
};

// Exact non-transparent bounds for animation frames & props
export const ANIM_BOUNDS = {
  weldFrames: { x: 21, y: 109, w: 648, h: 533 },
  calFrames:  { x: 160, y: 18, w: 430, h: 620 },
  chgFrames:  { x: 144, y: 8,  w: 395, h: 662 },
  conveyorFrames: { x: 23, y: 103, w: 472, h: 331 },
  tableProps: [
    { x: 139, y: 333, w: 84,  h: 115 }, // beacon
    { x: 121, y: 268, w: 180, h: 189 }, // robotic arm
    { x: 125, y: 278, w: 169, h: 204 }  // monitor
  ]
};

// Exact pixel slice rects measured from the sprite sheets
export const SHEET_SLICES = {
  cratesSheet: {
    optics:  { x: 43,   y: 40,  w: 415, h: 436 },
    battery: { x: 555,  y: 42,  w: 419, h: 435 },
    solar:   { x: 1068, y: 41,  w: 419, h: 442 },
    dish:    { x: 42,   y: 531, w: 417, h: 435 },
    tank:    { x: 553,  y: 532, w: 424, h: 434 },
    circuit: { x: 1069, y: 536, w: 424, h: 435 }
  },
  tablesSheet: {
    u_closed: { x: 40,   y: 211, w: 417, h: 312 },
    left_u:   { x: 40,   y: 211, w: 417, h: 312 },
    u_open:   { x: 538,  y: 213, w: 424, h: 319 },
    center_u: { x: 538,  y: 213, w: 424, h: 319 },
    l_right:  { x: 1047, y: 214, w: 286, h: 214 },
    right_l:  { x: 1047, y: 214, w: 286, h: 214 }
  },
  logisticsSheet: {
    tray_stack:   { x: 122,  y: 299, w: 593, h: 886 },
    tray:         { x: 122,  y: 299, w: 593, h: 886 },
    conveyor:     { x: 821,  y: 477, w: 926, h: 594 },
    scrap_bin:    { x: 1853, y: 528, w: 359, h: 561 },
    scrap:        { x: 1853, y: 528, w: 359, h: 561 },
    extinguisher: { x: 2329, y: 540, w: 291, h: 566 },
    co2:          { x: 2329, y: 540, w: 291, h: 566 }
  },
  stationsSheet: {
    welder:     { x: 210,  y: 389, w: 827, h: 707 },
    weld:       { x: 210,  y: 389, w: 827, h: 707 },
    calibrator: { x: 1300, y: 361, w: 477, h: 735 },
    calibrate:  { x: 1300, y: 361, w: 477, h: 735 },
    charger:    { x: 2062, y: 314, w: 472, h: 787 },
    charge:     { x: 2062, y: 314, w: 472, h: 787 }
  }
};

const assetMap = new Map();
const itemMap = new Map();
const animMap = new Map();
let preloadPromise = null;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = encodeURI(src);
  });
}

function registerSyncImages() {
  if (assetMap.size > 0) return [];
  const tasks = [];

  for (const [key, path] of Object.entries(ASSET_PATHS)) {
    const img = new Image();
    img.decoding = 'async';
    tasks.push(new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = encodeURI(path);
    }));
    assetMap.set(key, img);
  }

  for (const [itemId, path] of Object.entries(ITEM_PATHS)) {
    const img = new Image();
    img.decoding = 'async';
    tasks.push(new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = encodeURI(path);
    }));
    itemMap.set(itemId, img);
  }

  for (const [groupKey, paths] of Object.entries(ANIM_PATHS)) {
    const frames = paths.map((path) => {
      const img = new Image();
      img.decoding = 'async';
      tasks.push(new Promise((resolve) => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = encodeURI(path);
      }));
      return img;
    });
    animMap.set(groupKey, frames);
  }

  return tasks;
}

export function preloadAllAssets() {
  if (preloadPromise) return preloadPromise;
  const tasks = registerSyncImages();
  preloadPromise = Promise.all(tasks).then(() => true);
  return preloadPromise;
}

// Kick off lightweight background preload immediately on module import
if (typeof Image !== 'undefined') {
  preloadAllAssets();
}

export function isImageReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

export function isAssetReady(key) {
  return isImageReady(assetMap.get(key));
}

export function getAsset(key) {
  if (assetMap.size === 0 && typeof Image !== 'undefined') {
    preloadAllAssets();
  }
  return assetMap.get(key) || null;
}

export function getItemSprite(itemId) {
  if (itemMap.size === 0 && typeof Image !== 'undefined') {
    preloadAllAssets();
  }
  return itemMap.get(itemId) || null;
}

export function getItemBounds(itemId) {
  return ITEM_BOUNDS[itemId] || null;
}

export function getAnimFrame(groupKey, idx = 0) {
  if (animMap.size === 0 && typeof Image !== 'undefined') {
    preloadAllAssets();
  }
  const frames = animMap.get(groupKey);
  if (!frames || frames.length === 0) return null;
  const safeIdx = ((Math.floor(idx) % frames.length) + frames.length) % frames.length;
  return frames[safeIdx];
}

export function getAnimFrameBounds(groupKey, idx = 0) {
  const entry = ANIM_BOUNDS[groupKey];
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const safeIdx = ((Math.floor(idx) % entry.length) + entry.length) % entry.length;
    return entry[safeIdx];
  }
  return entry;
}

export function getSheetSlice(sheetKey, sliceKey) {
  const sheet = SHEET_SLICES[sheetKey];
  if (!sheet) return null;
  const rect = sheet[sliceKey];
  if (!rect) return null;
  const img = getAsset(sheetKey);
  return {
    img,
    ready: isImageReady(img),
    sx: rect.x,
    sy: rect.y,
    sw: rect.w,
    sh: rect.h,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h
  };
}

export { loadImage };
