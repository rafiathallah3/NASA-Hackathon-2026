// Pixel renderer.
//
// Stage code keeps drawing in the logical 1120x620 coordinate space, but into a
// 560x310 offscreen buffer (1 art pixel = 2 logical px). The buffer is blitted to
// the visible canvas with nearest-neighbour scaling, so every shape, sprite and
// gradient lands on the same chunky pixel grid.
//
// Text is the exception: 5px glyphs are unreadable, so fillText/strokeText are
// rendered at full resolution in the pixel font. To keep draw order intact, the
// low-res buffer is flushed to the screen right before any text that follows
// non-text drawing.
//
// The returned `ctx` is a real CanvasRenderingContext2D with a few methods and
// setters shadowed on the instance:
//   - fillText/strokeText/measureText: hi-res pixel-font text, emoji -> pixel icons
//   - drawImage: large sources are pre-downscaled (cached) and alpha-hardened
//   - create*Gradient: gradients are posterised into hard colour bands
//   - font: every family is remapped to the pixel font
//   - lineWidth: snapped to whole art pixels
//   - roundRect: radii clamped so corners read as pixel notches
//   - imageSmoothingEnabled: always false
//   - set/reset/getTransform: expressed in logical units like the rest of the code

import { LOGICAL_W, LOGICAL_H } from './config.js';
import { tokenizeIcons, stripVariationSelectors, drawIcon, iconAdvanceCells, iconHeightCells } from './icons.js';

export const PIXEL_SCALE = 2;
export const LOW_W = Math.round(LOGICAL_W / PIXEL_SCALE);
export const LOW_H = Math.round(LOGICAL_H / PIXEL_SCALE);
export const PIXEL_FONT_STACK = '"Jersey 10", "Courier New", monospace';
// Jersey 10 is condensed with a small cap height: 1.3x brings it to the same cap
// height / line width as the sans-serif sizes the stage code was laid out with.
const PIXEL_FONT_SCALE = 1.3;

const P = CanvasRenderingContext2D.prototype;
const native = {
  setTransform: P.setTransform,
  getTransform: P.getTransform,
  save: P.save,
  restore: P.restore,
  clip: P.clip,
  fill: P.fill,
  stroke: P.stroke,
  fillRect: P.fillRect,
  strokeRect: P.strokeRect,
  clearRect: P.clearRect,
  drawImage: P.drawImage,
  putImageData: P.putImageData,
  fillText: P.fillText,
  strokeText: P.strokeText,
  measureText: P.measureText,
  roundRect: P.roundRect,
  createLinearGradient: P.createLinearGradient,
  createRadialGradient: P.createRadialGradient,
  createConicGradient: P.createConicGradient
};
const prop = (name) => Object.getOwnPropertyDescriptor(P, name);
const fillStyleDesc = prop('fillStyle');
const strokeStyleDesc = prop('strokeStyle');
const fontDesc = prop('font');
const lineWidthDesc = prop('lineWidth');
const smoothingDesc = prop('imageSmoothingEnabled');

/* ---------------------------------------------------------------- fonts */

const fontCache = new Map();
export function toPixelFont(font) {
  if (typeof font !== 'string') return font;
  let mapped = fontCache.get(font);
  if (mapped) return mapped;
  const m = font.match(/^(.*?)(\d*\.?\d+)px(\/\S+)?\s+(.+)$/);
  if (!m) {
    mapped = font;
  } else {
    // Single-weight pixel font: drop weights so the browser never fakes a blurry bold.
    const pre = m[1].replace(/\b(bold|bolder|lighter|normal|[1-9]00)\b/g, '').replace(/\s+/g, ' ').trimStart();
    const size = Math.round(parseFloat(m[2]) * PIXEL_FONT_SCALE);
    mapped = `${pre}${size}px ${PIXEL_FONT_STACK}`;
  }
  fontCache.set(font, mapped);
  return mapped;
}

function fontPx(font) {
  const m = /(\d*\.?\d+)px/.exec(font);
  return m ? parseFloat(m[1]) : 10;
}

/* ------------------------------------------------------------ gradients */

const colorCtx = document.createElement('canvas').getContext('2d');
const colorCache = new Map();
function parseColor(c) {
  const key = String(c);
  let v = colorCache.get(key);
  if (v) return v;
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = key;
  const s = colorCtx.fillStyle;
  if (typeof s === 'string' && s[0] === '#') {
    v = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  } else {
    const n = String(s).match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 1];
    v = [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
  }
  colorCache.set(key, v);
  return v;
}

function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [o1, c1] = stops[i];
    if (t <= o1) {
      const [o0, c0] = stops[i - 1];
      const k = o1 === o0 ? 1 : (t - o0) / (o1 - o0);
      return [0, 1, 2, 3].map(j => c0[j] + (c1[j] - c0[j]) * k);
    }
  }
  return last[1];
}

const rgbaStr = (c) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.round(c[3] * 1000) / 1000})`;

class BandedGradient {
  constructor(kind, args, length) {
    this.kind = kind;
    this.args = args;
    this.bands = Math.max(2, Math.min(10, Math.round(length / 12)));
    this.stops = [];
    this.real = null;
  }

  addColorStop(offset, color) {
    const o = Number(offset);
    if (!Number.isFinite(o)) return;
    this.stops.push([Math.max(0, Math.min(1, o)), color]);
    this.real = null;
  }

  build(ctx) {
    if (this.real) return this.real;
    const make = this.kind === 'linear' ? native.createLinearGradient
      : this.kind === 'radial' ? native.createRadialGradient
        : native.createConicGradient;
    const g = make.apply(ctx, this.args);
    const stops = this.stops
      .slice()
      .sort((a, b) => a[0] - b[0])
      .map(([o, c]) => [o, parseColor(c)]);
    if (stops.length === 1) {
      g.addColorStop(0, rgbaStr(stops[0][1]));
    } else if (stops.length > 1) {
      const n = this.bands;
      for (let i = 0; i < n; i++) {
        // First and last bands use the exact end colours so fades vanish cleanly.
        const col = rgbaStr(sampleStops(stops, i / (n - 1)));
        g.addColorStop(i / n, col);
        g.addColorStop((i + 1) / n, col);
      }
    }
    this.real = g;
    return g;
  }
}

/* --------------------------------------------------- image downscaling */

const imageIds = new WeakMap();
let nextImageId = 1;
const mipChains = new Map();
const scaledCache = new Map();
let scaledArea = 0;
const MAX_SCALED_AREA = 6_000_000;
const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
let alphaHardeningOk = true;

function sourceSize(img) {
  return [
    img.naturalWidth || img.videoWidth || img.width || 0,
    img.naturalHeight || img.videoHeight || img.height || 0
  ];
}

function quantize(v) {
  const n = Math.max(1, Math.round(v));
  if (n <= 64) return n;
  if (n <= 192) return Math.round(n / 2) * 2;
  return Math.round(n / 4) * 4;
}

function getMipLevel(img, id, sx, sy, sw, sh, tw, th) {
  const key = `${id}|${sx}|${sy}|${sw}|${sh}`;
  let chain = mipChains.get(key);
  if (!chain) {
    chain = [{ src: img, x: sx, y: sy, w: sw, h: sh }];
    mipChains.set(key, chain);
  }
  let level = chain[0];
  for (let i = 1; ; i++) {
    const hw = Math.floor(level.w / 2);
    const hh = Math.floor(level.h / 2);
    if (hw < tw || hh < th || hw < 1 || hh < 1) return level;
    if (!chain[i]) {
      const c = document.createElement('canvas');
      c.width = hw;
      c.height = hh;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = 'high';
      native.drawImage.call(cx, level.src, level.x, level.y, level.w, level.h, 0, 0, hw, hh);
      chain[i] = { src: c, x: 0, y: 0, w: hw, h: hh };
    }
    level = chain[i];
  }
}

function hardenAlpha(w, h) {
  if (!alphaHardeningOk) return;
  try {
    const data = workCtx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 3; i < d.length; i += 4) {
      d[i] = d[i] < 110 ? 0 : 255;
    }
    workCtx.putImageData(data, 0, 0);
  } catch (err) {
    // Tainted canvas (e.g. file://): keep the soft edges rather than failing.
    alphaHardeningOk = false;
  }
}

function getScaledBitmap(img, sx, sy, sw, sh, tw, th) {
  const qw = quantize(tw);
  const qh = quantize(th);
  let id = imageIds.get(img);
  if (!id) {
    id = nextImageId++;
    imageIds.set(img, id);
  }
  const key = `${id}|${sx}|${sy}|${sw}|${sh}|${qw}|${qh}`;
  const hit = scaledCache.get(key);
  if (hit) {
    scaledCache.delete(key);
    scaledCache.set(key, hit);
    return hit;
  }

  const level = getMipLevel(img, id, sx, sy, sw, sh, qw, qh);
  workCanvas.width = qw;
  workCanvas.height = qh;
  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = 'high';
  native.drawImage.call(workCtx, level.src, level.x, level.y, level.w, level.h, 0, 0, qw, qh);
  hardenAlpha(qw, qh);

  const out = document.createElement('canvas');
  out.width = qw;
  out.height = qh;
  native.drawImage.call(out.getContext('2d'), workCanvas, 0, 0);

  scaledCache.set(key, out);
  scaledArea += qw * qh;
  while (scaledArea > MAX_SCALED_AREA && scaledCache.size > 1) {
    const oldestKey = scaledCache.keys().next().value;
    const oldest = scaledCache.get(oldestKey);
    scaledCache.delete(oldestKey);
    scaledArea -= oldest.width * oldest.height;
  }
  return out;
}

// Pre-scaled, alpha-hardened copy of an image region at an exact pixel size.
// Used for DOM thumbnails (e.g. HUD ticket part icons) so they share the game's pixel grid.
export function getPixelBitmap(img, sx, sy, sw, sh, tw, th) {
  const [iw, ih] = sourceSize(img);
  if (!iw || !ih) return null;
  return getScaledBitmap(img, sx, sy, sw, sh, tw, th);
}

/* ------------------------------------------------------------ renderer */

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function createPixelRenderer(canvas) {
  const out = canvas.getContext('2d');
  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = LOW_W;
  lowCanvas.height = LOW_H;
  const lo = lowCanvas.getContext('2d');
  const K = 1 / PIXEL_SCALE;

  let outSX = 1;
  let outSY = 1;
  let dirty = false;
  const clipStack = [];
  let clipCount = 0;
  // Debug counters (exposed as window.__orbitalPixelStats): frameMs/flushMs are smoothed averages.
  const stats = { flushes: 0, texts: 0, frameFlushes: 0, frameMs: 0, flushMs: 0 };
  let frameStart = 0;
  let flushAccum = 0;

  smoothingDesc.set.call(lo, false);

  /* --- transform (logical units) --- */
  lo.setTransform = function (a, b, c, d, e, f) {
    if (typeof a === 'object' && a !== null) {
      ({ a, b, c, d, e, f } = a);
    }
    native.setTransform.call(this, a * K, b * K, c * K, d * K, e * K, f * K);
  };
  lo.resetTransform = function () {
    native.setTransform.call(this, K, 0, 0, K, 0, 0);
  };
  lo.getTransform = function () {
    const m = native.getTransform.call(this);
    return new DOMMatrix([m.a * PIXEL_SCALE, m.b * PIXEL_SCALE, m.c * PIXEL_SCALE, m.d * PIXEL_SCALE, m.e * PIXEL_SCALE, m.f * PIXEL_SCALE]);
  };

  /* --- clip tracking: text inside a clip stays in the low-res buffer --- */
  lo.save = function () {
    clipStack.push(false);
    native.save.call(this);
  };
  lo.restore = function () {
    if (clipStack.length && clipStack.pop()) clipCount--;
    native.restore.call(this);
  };
  lo.clip = function (...args) {
    if (clipStack.length && !clipStack[clipStack.length - 1]) {
      clipStack[clipStack.length - 1] = true;
      clipCount++;
    }
    return native.clip.apply(this, args);
  };

  /* --- anything that paints marks the buffer dirty --- */
  for (const name of ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'putImageData']) {
    const fn = native[name];
    lo[name] = function (...args) {
      dirty = true;
      return fn.apply(this, args);
    };
  }

  lo.roundRect = function (x, y, w, h, radii) {
    let r = radii;
    if (typeof r === 'number') r = Math.min(r, 4);
    else if (Array.isArray(r)) r = r.map(v => (typeof v === 'number' ? Math.min(v, 4) : v));
    return native.roundRect.call(this, x, y, w, h, r);
  };

  lo.drawImage = function (img, a1, a2, a3, a4, a5, a6, a7, a8) {
    const [iw, ih] = sourceSize(img);
    if (!iw || !ih) return;
    dirty = true;
    const n = arguments.length;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
    if (n <= 3) { dx = a1; dy = a2; dw = iw; dh = ih; }
    else if (n <= 5) { dx = a1; dy = a2; dw = a3; dh = a4; }
    else { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
    const m = native.getTransform.call(this);
    const tw = Math.abs(dw) * Math.hypot(m.a, m.b);
    const th = Math.abs(dh) * Math.hypot(m.c, m.d);
    if (tw >= 1 && th >= 1 && (sw > tw * 1.2 || sh > th * 1.2)) {
      const bmp = getScaledBitmap(img, sx, sy, sw, sh, tw, th);
      native.drawImage.call(this, bmp, 0, 0, bmp.width, bmp.height, dx, dy, dw, dh);
      return;
    }
    native.drawImage.call(this, img, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  /* --- styles --- */
  lo.createLinearGradient = function (x0, y0, x1, y1) {
    return new BandedGradient('linear', [x0, y0, x1, y1], Math.hypot(x1 - x0, y1 - y0));
  };
  lo.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
    return new BandedGradient('radial', [x0, y0, r0, x1, y1, r1], Math.abs(r1 - r0) + Math.hypot(x1 - x0, y1 - y0));
  };
  if (native.createConicGradient) {
    lo.createConicGradient = function (start, x, y) {
      return new BandedGradient('conic', [start, x, y], 120);
    };
  }

  const resolveStyle = (ctx, v) => (v instanceof BandedGradient ? v.build(ctx) : v);
  Object.defineProperty(lo, 'fillStyle', {
    configurable: true,
    get() { return fillStyleDesc.get.call(this); },
    set(v) { fillStyleDesc.set.call(this, resolveStyle(this, v)); }
  });
  Object.defineProperty(lo, 'strokeStyle', {
    configurable: true,
    get() { return strokeStyleDesc.get.call(this); },
    set(v) { strokeStyleDesc.set.call(this, resolveStyle(this, v)); }
  });
  Object.defineProperty(lo, 'font', {
    configurable: true,
    get() { return fontDesc.get.call(this); },
    set(v) { fontDesc.set.call(this, toPixelFont(v)); }
  });
  Object.defineProperty(lo, 'lineWidth', {
    configurable: true,
    get() { return lineWidthDesc.get.call(this); },
    set(v) {
      const n = Number(v);
      if (!(n > 0)) return;
      lineWidthDesc.set.call(this, Math.max(PIXEL_SCALE, Math.round(n / PIXEL_SCALE) * PIXEL_SCALE));
    }
  });
  Object.defineProperty(lo, 'imageSmoothingEnabled', {
    configurable: true,
    get() { return false; },
    set() {}
  });
  Object.defineProperty(lo, 'imageSmoothingQuality', {
    configurable: true,
    get() { return 'low'; },
    set() {}
  });

  /* --- text --- */
  function flush() {
    if (!dirty) return;
    const t0 = performance.now();
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    out.imageSmoothingEnabled = false;
    native.drawImage.call(out, lowCanvas, 0, 0, LOW_W, LOW_H, 0, 0, canvas.width, canvas.height);
    native.save.call(lo);
    native.setTransform.call(lo, 1, 0, 0, 1, 0, 0);
    native.clearRect.call(lo, 0, 0, LOW_W, LOW_H);
    native.restore.call(lo);
    dirty = false;
    stats.flushes++;
    stats.frameFlushes++;
    flushAccum += performance.now() - t0;
  }

  function syncTextState() {
    const m = native.getTransform.call(lo);
    const S = PIXEL_SCALE;
    out.setTransform(outSX * S * m.a, outSY * S * m.b, outSX * S * m.c, outSY * S * m.d, outSX * S * m.e, outSY * S * m.f);
    out.font = fontDesc.get.call(lo);
    out.fillStyle = fillStyleDesc.get.call(lo);
    out.strokeStyle = strokeStyleDesc.get.call(lo);
    out.lineWidth = lineWidthDesc.get.call(lo);
    out.lineJoin = lo.lineJoin;
    out.textAlign = lo.textAlign;
    out.textBaseline = lo.textBaseline;
    out.globalAlpha = lo.globalAlpha;
    out.direction = lo.direction;
  }

  // Square "pixel" outline: the text stamped at 8 offsets in the stroke colour.
  function pixelOutline(target, text, x, y, maxWidth, hasMax) {
    const o = Math.max(1, target.lineWidth / 2);
    const prevFill = target.fillStyle;
    target.fillStyle = target.strokeStyle;
    for (const [dx, dy] of NEIGHBOURS) {
      if (hasMax) native.fillText.call(target, text, x + dx * o, y + dy * o, maxWidth);
      else native.fillText.call(target, text, x + dx * o, y + dy * o);
    }
    target.fillStyle = prevFill;
  }

  function iconTop(baseline, y, size, iconH) {
    switch (baseline) {
      case 'top':
      case 'hanging':
        return y;
      case 'middle':
        return y - iconH / 2;
      case 'bottom':
        return y - iconH;
      default:
        return y - iconH + size * 0.12;
    }
  }

  function drawPlainOrOutline(target, mode, text, x, y, maxWidth, hasMax) {
    if (mode === 'stroke') {
      pixelOutline(target, text, x, y, maxWidth, hasMax);
    } else if (hasMax) {
      native.fillText.call(target, text, x, y, maxWidth);
    } else {
      native.fillText.call(target, text, x, y);
    }
  }

  function renderText(target, isOut, mode, rawText, x, y, maxWidth, hasMax) {
    const tokens = tokenizeIcons(rawText);
    if (!tokens) {
      drawPlainOrOutline(target, mode, stripVariationSelectors(rawText), x, y, maxWidth, hasMax);
      return;
    }

    const size = fontPx(target.font);
    const cell = size / 8;
    let total = 0;
    for (const t of tokens) {
      t.w = t.icon ? iconAdvanceCells(t.icon) * cell : native.measureText.call(target, t.text).width;
      total += t.w;
    }
    const align = target.textAlign;
    let cx = x;
    if (align === 'center') cx = x - total / 2;
    else if (align === 'right' || align === 'end') cx = x - total;

    const inherit = typeof target.fillStyle === 'string' ? target.fillStyle : '#eef1f8';
    target.textAlign = 'left';
    for (const t of tokens) {
      if (t.text) {
        drawPlainOrOutline(target, mode, t.text, cx, y, undefined, false);
      } else if (mode === 'fill') {
        const top = iconTop(target.textBaseline, y, size, iconHeightCells(t.icon) * cell);
        if (isOut) {
          // Snap icon cells to whole device pixels so they stay razor sharp.
          const m = target.getTransform();
          const devCell = Math.max(1, Math.round(cell * m.a));
          const px = Math.round(m.a * (cx + cell * 0.5) + m.c * top + m.e);
          const py = Math.round(m.b * (cx + cell * 0.5) + m.d * top + m.f);
          target.save();
          target.setTransform(1, 0, 0, 1, 0, 0);
          drawIcon(target, t.icon, px, py, devCell, inherit);
          target.restore();
        } else {
          drawIcon(target, t.icon, cx + cell * 0.5, top, cell, inherit);
        }
      }
      cx += t.w;
    }
    target.textAlign = align;
  }

  function textEntry(mode, args) {
    const text = String(args[0]);
    const x = args[1];
    const y = args[2];
    const hasMax = args.length > 3 && args[3] !== undefined;
    const maxWidth = args[3];
    stats.texts++;
    if (clipCount > 0) {
      dirty = true;
      renderText(lo, false, mode, text, x, y, maxWidth, hasMax);
      return;
    }
    flush();
    syncTextState();
    renderText(out, true, mode, text, x, y, maxWidth, hasMax);
  }

  lo.fillText = function (...args) { textEntry('fill', args); };
  lo.strokeText = function (...args) { textEntry('stroke', args); };
  lo.measureText = function (text) {
    const tokens = tokenizeIcons(text);
    if (!tokens) return native.measureText.call(this, stripVariationSelectors(text));
    const cell = fontPx(fontDesc.get.call(this)) / 8;
    let w = 0;
    for (const t of tokens) {
      w += t.icon ? iconAdvanceCells(t.icon) * cell : native.measureText.call(this, t.text).width;
    }
    const base = native.measureText.call(this, 'M');
    return {
      width: w,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: w,
      actualBoundingBoxAscent: base.actualBoundingBoxAscent,
      actualBoundingBoxDescent: base.actualBoundingBoxDescent,
      fontBoundingBoxAscent: base.fontBoundingBoxAscent,
      fontBoundingBoxDescent: base.fontBoundingBoxDescent
    };
  };

  lo.font = '10px sans-serif';
  native.setTransform.call(lo, K, 0, 0, K, 0, 0);

  return {
    ctx: lo,
    stats,
    resize(backingW, backingH) {
      canvas.width = Math.max(1, Math.round(backingW));
      canvas.height = Math.max(1, Math.round(backingH));
      outSX = canvas.width / LOGICAL_W;
      outSY = canvas.height / LOGICAL_H;
      out.imageSmoothingEnabled = false;
    },
    beginFrame() {
      frameStart = performance.now();
      flushAccum = 0;
      out.setTransform(1, 0, 0, 1, 0, 0);
      out.globalAlpha = 1;
      out.clearRect(0, 0, canvas.width, canvas.height);
      native.setTransform.call(lo, 1, 0, 0, 1, 0, 0);
      native.clearRect.call(lo, 0, 0, LOW_W, LOW_H);
      native.setTransform.call(lo, K, 0, 0, K, 0, 0);
      dirty = false;
      clipStack.length = 0;
      clipCount = 0;
      stats.frameFlushes = 0;
    },
    endFrame() {
      flush();
      stats.frameMs = stats.frameMs * 0.9 + (performance.now() - frameStart) * 0.1;
      stats.flushMs = stats.flushMs * 0.9 + flushAccum * 0.1;
    }
  };
}
