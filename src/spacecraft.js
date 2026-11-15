// Spacecraft sprite library for the frames in Assets/rocket.
//
// The frames are 327x554 exports of single pieces of an Apollo-style stack, each drawn at its own
// scale, so nothing can be placed by raw image size. CRAFT therefore holds, per sprite:
//   a        asset key (assets.js)
//   x,y,w,h  tight crop inside the frame (alpha >= 40), frame pixels
//   ax,ay    frame-absolute anchor point, shared by EVERY crop of the same frame. Drawing two crops of
//            one frame at the same (x, y) reassembles the frame, which is how flames are split from
//            bodies and the lander into its ascent / descent halves. For rockets the anchor is the
//            nose tip; for the lander it is the footpad line; for the parachutes it is the cable ring.
//   k        scale relative to the reference stack (Apollo Rocket_0001), from matching body widths:
//            upper stage 67px vs 54px in 0003/0006 -> 1.24, first stage 77.5px vs 64px in 0007 and
//            69px in 0005 -> 1.21 / 1.123, 0002 vs 0001 -> 1.013. Pairs that swap on/off (0001/0002,
//            0003/0006, 0010/0013) share an anchor measured by mask cross-correlation, so engines can
//            light and die without the sprite jumping.
//
// All geometry is snapped to the 2px art-pixel grid (see pixel.js) relative to the snapped anchor, so
// sprites never shimmer while they move and crops sharing an edge never open a seam.

import { getAsset, isImageReady } from './assets.js';

const SNAP = 2;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const CRAFT = {
  // Launch stack (nose-tip anchored)
  stackIdle:     { a: 'craftStackIdle',    x: 110, y: 26,  w: 107, h: 501, ax: 163,   ay: 26,  k: 1.0 },
  stackBody:     { a: 'craftStackBurn',    x: 112, y: 0,   w: 103, h: 459, ax: 162,   ay: 1,   k: 1.013 },
  stackFlame:    { a: 'craftStackBurn',    x: 99,  y: 459, w: 129, h: 95,  ax: 162,   ay: 1,   k: 1.013 },
  upperIdle:     { a: 'craftUpperIdle',    x: 136, y: 152, w: 55,  h: 249, ax: 162.5, ay: 152, k: 1.24 },
  upperBody:     { a: 'craftUpperBurn',    x: 135, y: 130, w: 56,  h: 226, ax: 162.5, ay: 130, k: 1.24 },
  upperFlame:    { a: 'craftUpperBurn',    x: 135, y: 356, w: 56,  h: 68,  ax: 162.5, ay: 130, k: 1.24 },
  boosterBurn:   { a: 'craftBoosterBurn',  x: 120, y: 138, w: 87,  h: 277, ax: 163,   ay: 138, k: 1.123 },
  boosterSpent:  { a: 'craftBoosterSpent', x: 124, y: 183, w: 78,  h: 187, ax: 162.5, ay: 183, k: 1.21 },
  // Orbital craft
  csmSla:        { a: 'craftCsmSla',       x: 119, y: 98,  w: 89,  h: 357, ax: 163,   ay: 98,  k: 1.0 },
  csmSlaOpen:    { a: 'craftCsmSlaOpen',   x: 62,  y: 98,  w: 203, h: 357, ax: 163,   ay: 98,  k: 1.0 },
  slaPetalL:     { a: 'craftCsmSlaOpen',   x: 62,  y: 226, w: 58,  h: 75,  ax: 163,   ay: 98,  k: 1.0 },
  slaPetalR:     { a: 'craftCsmSlaOpen',   x: 208, y: 226, w: 57,  h: 75,  ax: 163,   ay: 98,  k: 1.0 },
  serviceModule: { a: 'craftCsmSla',       x: 119, y: 335, w: 89,  h: 120, ax: 163,   ay: 98,  k: 1.0 },
  command:       { a: 'craftCommand',      x: 110, y: 186, w: 107, h: 116, ax: 163,   ay: 186, k: 1.0 },
  commandBody:   { a: 'craftCommandBurn',  x: 112, y: 182, w: 103, h: 131, ax: 163,   ay: 180, k: 1.0 },
  commandFlame:  { a: 'craftCommandBurn',  x: 138, y: 313, w: 51,  h: 59,  ax: 163,   ay: 180, k: 1.0 },
  docked:        { a: 'craftDocked',       x: 26,  y: 109, w: 275, h: 336, ax: 162,   ay: 109, k: 1.0 },
  // Lunar lander (footpad-line anchored; ascent + descent crops reassemble the frame)
  lander:        { a: 'craftLanderA',      x: 30,  y: 185, w: 266, h: 183, ax: 162.5, ay: 364, k: 1.0 },
  landerAscent:  { a: 'craftLanderA',      x: 99,  y: 185, w: 134, h: 84,  ax: 162.5, ay: 364, k: 1.0 },
  landerDescent: { a: 'craftLanderA',      x: 30,  y: 269, w: 266, h: 99,  ax: 162.5, ay: 364, k: 1.0 },
  // Triple main chutes (cable-ring anchored): canopies above, capsule below
  chutes:        { a: 'craftChutes',       x: 45,  y: 41,  w: 1154, h: 927, ax: 627,  ay: 968, k: 1.0 },
  chuteCapsule:  { a: 'craftChutes',       x: 514, y: 968, w: 225, h: 232, ax: 627,   ay: 968, k: 1.0 }
};

// Reference geometry (frame pixels, before `scale`/`k`) other modules need for placement.
export const CRAFT_GEO = {
  // Stack: nose tip -> bottom edge of the body crop (engine skirt); the flame starts right below.
  stackBaseY: (459 - 1) * 1.013,
  // Engines-off stack (frame 0001): nose tip -> engine skirt (fin bottoms); the bells hang below it.
  stackIdleBaseY: 484 - 26,
  // Where the first stage joins the upper stages, measured from the nose tip (frame 0002 width step).
  stageJoinY: 255,
  // Upper stage: nose tip -> bottom edge of the body crop.
  upperBaseY: (356 - 130) * 1.24,
  // Lander: footpad line -> top of the ascent stage / the ascent|descent seam, and bell bottom.
  landerTopY: 364 - 185,
  landerSeamY: 364 - 269,
  landerBellY: 367 - 364,
  landerHalfW: 133
};

export function craftReady(id) {
  const s = CRAFT[id];
  return Boolean(s && isImageReady(getAsset(s.a)));
}

// Relative (to the anchor) snapped edges a craft would occupy at these options, in logical px.
export function craftBox(id, opts = {}) {
  const s = CRAFT[id];
  if (!s) return null;
  const sk = (opts.scale ?? 1) * s.k;
  const sx = opts.sx ?? 1;
  const sy = opts.sy ?? 1;
  const l = snap((s.x - s.ax) * sk * sx);
  const r = Math.max(l + SNAP, snap((s.x + s.w - s.ax) * sk * sx));
  const t = snap((s.y - s.ay) * sk);
  const b = t + Math.max(SNAP, snap(s.h * sk * sy));
  return { l, t, r, b, w: r - l, h: b - t };
}

/**
 * Draw one crop with its anchor at (x, y).
 * opts.scale  logical px per reference frame pixel (multiplied by the sprite's own k)
 * opts.sx     horizontal stretch about the anchor column (flames)
 * opts.sy     vertical stretch of the crop height, top edge fixed (flames hang from their nozzle)
 * opts.alpha  extra opacity, opts.flip mirrors around the anchor column
 * Returns false (and draws nothing) while the frame is still loading.
 */
export function drawCraft(ctx, id, x, y, opts = {}) {
  const s = CRAFT[id];
  if (!s) return false;
  const img = getAsset(s.a);
  if (!isImageReady(img)) return false;
  const box = craftBox(id, opts);
  const ox = snap(x);
  const oy = snap(y);
  const alpha = opts.alpha ?? 1;
  const prevAlpha = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;
  if (opts.flip) {
    ctx.save();
    ctx.translate(ox, 0);
    ctx.scale(-1, 1);
    ctx.translate(-ox, 0);
  }
  ctx.drawImage(img, s.x, s.y, s.w, s.h, ox + box.l, oy + box.t, box.w, box.h);
  if (opts.flip) ctx.restore();
  if (alpha !== 1) ctx.globalAlpha = prevAlpha;
  return true;
}

/* ------------------------------------------------------------ launch pad */

// Mobile launcher (Launch Pad.png, 1122x1402). The art is anchored at the rocket's stand point on the
// deck. Its four swing arms are separate crops so they can fold back at liftoff: the base layer is a
// copy of the image with the arm bands wiped, rebuilt once when the image has loaded.
const PAD = { x: 142, y: 5, w: 838, h: 1352, ax: 765, ay: 1140 };
const PAD_ARM_X0 = 484;
const PAD_ARM_X1 = 702;
const PAD_ARMS = [
  { y0: 267, y1: 348 }, // top
  { y0: 454, y1: 528 },
  { y0: 640, y1: 714 },
  { y0: 820, y1: 893 }  // lowest
];
export const PAD_ARM_COUNT = PAD_ARMS.length;
// Pad geometry other modules need, in pad frame pixels: rocket stand point, deck top, track bottom.
export const PAD_GEO = { standX: PAD.ax, deckY: PAD.ay, groundY: PAD.y + PAD.h, topY: PAD.y };

let padBase = null;
function getPadBase() {
  if (padBase) return padBase;
  const img = getAsset('launchPad');
  if (!isImageReady(img)) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  for (const arm of PAD_ARMS) {
    g.clearRect(PAD_ARM_X0, arm.y0, PAD_ARM_X1 - PAD_ARM_X0, arm.y1 - arm.y0 + 1);
  }
  padBase = c;
  return padBase;
}

/**
 * Draw the mobile launcher with the rocket stand point at (x, y).
 * opts.scale    logical px per pad pixel
 * opts.retract  per-arm fold amount 0..1 (index 0 = top arm); arms fold toward the tower
 */
export function drawLaunchPad(ctx, x, y, opts = {}) {
  const base = getPadBase();
  if (!base) return false;
  const img = getAsset('launchPad');
  const scale = opts.scale ?? 0.25;
  const retract = opts.retract || [];
  const ox = snap(x);
  const oy = snap(y);
  const relX = (v) => snap((v - PAD.ax) * scale);
  const relY = (v) => snap((v - PAD.ay) * scale);

  const l = ox + relX(PAD.x);
  const t = oy + relY(PAD.y);
  ctx.drawImage(base, PAD.x, PAD.y, PAD.w, PAD.h, l, t, ox + relX(PAD.x + PAD.w) - l, oy + relY(PAD.y + PAD.h) - t);

  const fullW = relX(PAD_ARM_X1) - relX(PAD_ARM_X0);
  for (let i = 0; i < PAD_ARMS.length; i++) {
    const arm = PAD_ARMS[i];
    const fold = clamp01(retract[i] || 0);
    const w = Math.max(SNAP, snap(fullW * (1 - 0.93 * fold)));
    const top = oy + relY(arm.y0);
    ctx.drawImage(
      img,
      PAD_ARM_X0, arm.y0, PAD_ARM_X1 - PAD_ARM_X0, arm.y1 - arm.y0 + 1,
      ox + relX(PAD_ARM_X0), top, w, oy + relY(arm.y1 + 1) - top
    );
  }
  return true;
}
