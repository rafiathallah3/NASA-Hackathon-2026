// Pixel icon set: replaces emoji in both DOM templates and canvas text.
// Each icon is a tiny grid; '.' is transparent, other letters map to colors.
// A color of null inherits the surrounding text color (currentColor / fillStyle).
// Every icon gets a 1-cell dark drop shadow so it reads on any background.

const Y = '#ffd23f';
const W = '#eef1f8';
const G = '#5fe07c';
const R = '#ff5d5d';
const O = '#ff8a3d';
const C = '#4fd6f0';
const B = '#5b8cff';
const P = '#b48cff';
const S = '#b8c2d6';
const SD = '#6b7895';
const K = '#1a2033';
const BR = '#c98a4a';
const SHADOW = 'rgba(0,0,0,0.55)';

const RAW_ICONS = {
  star: { c: { a: Y, b: W }, g: ['...a...', '..aba..', 'aaaaaaa', '.aaaaa.', '..aaa..', '.aa.aa.', '.a...a.'] },
  check: { c: { a: G }, g: ['......a', '.....aa', 'a...aa.', 'aa.aa..', '.aaa...', '..a....'] },
  checkbox: { c: { a: G, w: W }, g: ['aaaaaaa', 'aaaaawa', 'aaaawwa', 'awawwaa', 'awwwaaa', 'aawaaaa', 'aaaaaaa'] },
  square: { c: { a: S }, g: ['aaaaaaa', 'a.....a', 'a.....a', 'a.....a', 'a.....a', 'a.....a', 'aaaaaaa'] },
  cross: { c: { a: R }, g: ['a.....a', 'aa...aa', '.aa.aa.', '..aaa..', '.aa.aa.', 'aa...aa', 'a.....a'] },
  warn: { c: { a: Y, k: K }, g: ['...a...', '..aaa..', '..aka..', '.aakaa.', '.aakaa.', 'aaaaaaa', 'aaakaaa', 'aaaaaaa'] },
  rocket: { c: { a: W, r: R, c: C, o: O }, g: ['...r...', '..rrr..', '..aaa..', '..aca..', '..aaa..', '.raaar.', '.r.o.r.', '...o...'] },
  target: { c: { a: R, w: W }, g: ['..aaa..', '.awwwa.', 'awwawwa', 'awaaawa', 'awwawwa', '.awwwa.', '..aaa..'] },
  wrench: { c: { a: S }, g: ['....a.a', '....aaa', '...aaa.', '..aaa..', '.aaa...', 'aaa....', '.a.....'] },
  flask: { c: { a: '#dfe7f5', b: P }, g: ['.aaaaa.', '..a.a..', '..a.a..', '.a...a.', 'abbbbba', 'abbbbba', '.aaaaa.'] },
  core: { c: { a: '#dfe7f5', b: C }, g: ['aaaa', 'a..a', 'a..a', 'abba', 'abba', 'abba', '.bb.'] },
  play: { c: { a: null }, g: ['a....', 'aaa..', 'aaaaa', 'aaa..', 'a....'] },
  pause: { c: { a: null }, g: ['aa.aa', 'aa.aa', 'aa.aa', 'aa.aa', 'aa.aa'] },
  bolt: { c: { a: Y }, g: ['..aaa', '.aaa.', '.aa..', 'aaaaa', '..aa.', '.aa..', 'aa...'] },
  fire: { c: { a: O, b: Y }, g: ['...a...', '..aa...', '.aaa..a', '.aabaaa', 'aabbbaa', 'aabbbaa', '.aaaaa.'] },
  down: { c: { a: null }, g: ['..aaa..', '..aaa..', '..aaa..', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'] },
  tri_up: { c: { a: null }, g: ['...a...', '..aaa..', '.aaaaa.', 'aaaaaaa'] },
  dish: { c: { a: S, b: C }, g: ['a..b..a', 'a..b..a', '.a...a.', '..aaa..', '...a...', '..aaa..', '.aaaaa.'] },
  fuel: { c: { a: R, w: W }, g: ['aaaaa..', 'awwwa..', 'awwwa.a', 'aaaaa.a', 'aaaaa.a', 'aaaaaa.', 'aaaaa..'] },
  dot: { c: { a: G }, g: ['.aaa.', 'aaaaa', 'aaaaa', 'aaaaa', '.aaa.'] },
  snow: { c: { a: C }, g: ['...a...', '.a.a.a.', '..aaa..', 'aaaaaaa', '..aaa..', '.a.a.a.', '...a...'] },
  shield: { c: { a: B, w: '#a9c4ff' }, g: ['aaaaaaa', 'awaaaaa', 'awaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'] },
  battery: { c: { a: '#dfe7f5', b: G }, g: ['aaaaaaa.', 'abbb..aa', 'abbb..aa', 'abbb..aa', 'aaaaaaa.'] },
  sun: { c: { a: Y }, g: ['...a...', '.a...a.', '..aaa..', 'a.aaa.a', '..aaa..', '.a...a.', '...a...'] },
  sound: { c: { a: null }, g: ['..a....', '.aa..a.', 'aaa.a.a', 'aaa.a.a', 'aaa.a.a', '.aa..a.', '..a....'] },
  mute: { c: { a: null, r: R }, g: ['..a....', '.aa....', 'aaa.r.r', 'aaa..r.', 'aaa.r.r', '.aa....', '..a....'] },
  scale: { c: { a: Y }, g: ['...a...', 'aaaaaaa', 'a..a..a', 'aa.a.aa', '...a...', '...a...', '.aaaaa.'] },
  money: { c: { a: '#e2b04a', k: '#7a5a10' }, g: ['.aaaaa.', 'aakkkaa', 'aakaaaa', 'aakkkaa', 'aaaakaa', 'aakkkaa', '.aaaaa.'] },
  compass: { c: { a: S, r: R }, g: ['..aaa..', '.a...a.', 'a...r.a', 'a..r..a', 'a.r...a', '.a...a.', '..aaa..'] },
  team: { c: { a: W }, g: ['.aa..aa.', '.aa..aa.', '........', 'aaaaaaaa', 'aaaaaaaa'] },
  wind: { c: { a: '#bfe9ff' }, g: ['....aa.', 'aaaaa.a', '.......', 'aaaaaaa', '......a', '.aaaaa.'] },
  lock: { c: { a: Y, k: K }, g: ['..aaa..', '.a...a.', '.a...a.', 'aaaaaaa', 'aaakaaa', 'aaakaaa', 'aaaaaaa'] },
  unlock: { c: { a: Y, k: K }, g: ['..aaa..', '.a...a.', '.a.....', 'aaaaaaa', 'aaakaaa', 'aaakaaa', 'aaaaaaa'] },
  moon: { c: { a: '#d9dce6', b: '#9aa1b4' }, g: ['..aaa..', '.aabaa.', 'aaaaaba', 'aabaaaa', 'aaaaaaa', '.aaaba.', '..aaa..'] },
  moon_dark: { c: { a: '#5a6378', b: '#3c4356' }, g: ['..aaa..', '.aabaa.', 'aaaaaba', 'aabaaaa', 'aaaaaaa', '.aaaba.', '..aaa..'] },
  crescent: { c: { a: '#ffe48a' }, g: ['..aaa..', '.aa....', 'aa.....', 'aa.....', 'aa.....', '.aa....', '..aaa..'] },
  earth: { c: { a: '#3a7bd5', b: '#5ec46a' }, g: ['..aaa..', '.abbaa.', 'abbbaaa', 'aabbbba', 'aaabbba', '.aaabb.', '..aaa..'] },
  box: { c: { a: BR, b: '#7a4f22' }, g: ['aaaaaaa', 'aaabaaa', 'bbbbbbb', 'aaabaaa', 'aaabaaa', 'aaabaaa', 'aaaaaaa'] },
  clipboard: { c: { a: '#b07a40', w: W, k: SD }, g: ['..kkk..', 'aaakaaa', 'awwwwwa', 'awkkkwa', 'awwwwwa', 'awkkwwa', 'aaaaaaa'] },
  ruler: { c: { a: Y, k: K }, g: ['aaaa', 'akaa', 'aaaa', 'akka', 'aaaa', 'akaa', 'aaaa'] },
  blueprint: { c: { a: '#1b5399', b: C, w: W }, g: ['bbbbbbb', 'baaabwb', 'bawwwab', 'bawwaab', 'baaabab', 'baaaawb', 'bbbbbbb'] },
  rover: { c: { a: '#dfe7f5', w: C, k: K }, g: ['..aaaa..', '.awwwwa.', 'aaaaaaaa', 'aaaaaaaa', '.kk..kk.'] },
  chute: { c: { a: O, w: W }, g: ['.aawaa.', 'awwawwa', 'aaaaaaa', 'a..a..a', '.a.a.a.', '..aaa..', '..aaa..'] },
  comet: { c: { a: C, w: W }, g: ['.....ww', '....aww', '...aa..', '..aa...', '.a.....', 'a......'] },
  hourglass: { c: { a: S, b: Y }, g: ['aaaaaaa', '.abbba.', '..aba..', '...a...', '..a.a..', '.abbba.', 'aaaaaaa'] },
  ufo: { c: { a: S, w: C, k: Y }, g: ['..www..', '.awwwa.', 'aaaaaaa', '.k.k.k.'] },
  copy: { c: { a: SD, b: W, k: K }, g: ['aaaaa..', 'a...a..', 'a.bbbbb', 'a.bkkkb', 'aabkkkb', '..bkkkb', '..bbbbb'] },
  dice: { c: { a: SD, w: W, k: K }, g: ['aaaaaaa', 'awwwwwa', 'awkwkwa', 'awwkwwa', 'awkwkwa', 'awwwwwa', 'aaaaaaa'] },
  bot: { c: { a: S, y: Y, c: C, k: K }, g: ['...y...', '...a...', '.aaaaa.', 'aacacaa', 'aaaaaaa', 'aakkkaa', '.aaaaa.'] },
  crown: { c: { a: Y, b: '#a8741a' }, g: ['a..a..a', 'aa.a.aa', 'aaaaaaa', 'abababa', 'bbbbbbb'] },
  helmet: { c: { a: W, k: '#4a5278' }, g: ['..aaa..', '.aaaaa.', 'akkkkka', 'akkkkka', 'aakkkaa', '.aaaaa.', '..aaa..'] }
};

function rotateCW(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const out = [];
  for (let r = 0; r < w; r++) {
    let line = '';
    for (let c = 0; c < h; c++) line += rows[h - 1 - c][r];
    out.push(line);
  }
  return out;
}

RAW_ICONS.left = { c: RAW_ICONS.down.c, g: rotateCW(RAW_ICONS.down.g) };
RAW_ICONS.up = { c: RAW_ICONS.down.c, g: rotateCW(RAW_ICONS.left.g) };
RAW_ICONS.right = { c: RAW_ICONS.down.c, g: rotateCW(RAW_ICONS.up.g) };
RAW_ICONS.tri_down = { c: RAW_ICONS.tri_up.c, g: RAW_ICONS.tri_up.g.slice().reverse() };

// Pre-compute horizontal runs per row so both SVG and canvas emit few rects.
export const ICONS = {};
for (const [name, def] of Object.entries(RAW_ICONS)) {
  const runs = [];
  def.g.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      let len = 1;
      while (x + len < row.length && row[x + len] === ch) len++;
      runs.push({ x, y, len, color: def.c[ch] ?? null });
      x += len;
    }
  });
  ICONS[name] = { w: def.g[0].length, h: def.g.length, runs };
}

const EMOJI_TO_ICON = {
  '⭐': 'star', '🔧': 'wrench', '🛠': 'wrench', '🚀': 'rocket', '⚠': 'warn',
  '✅': 'checkbox', '✓': 'check', '🎯': 'target', '🔬': 'flask', '🧪': 'core',
  '▶': 'play', '⏸': 'pause', '⚡': 'bolt', '🔥': 'fire',
  '⬇': 'down', '⬆': 'up', '➡': 'right', '➔': 'right', '→': 'right', '⬅': 'left',
  '▲': 'tri_up', '▼': 'tri_down', '📡': 'dish', '⛽': 'fuel', '🟢': 'dot',
  '❄': 'snow', '🛡': 'shield', '🔋': 'battery', '☀': 'sun', '🔊': 'sound', '🔇': 'mute',
  '⚖': 'scale', '💰': 'money', '🧭': 'compass', '🤝': 'team', '🙌': 'team', '👥': 'team',
  '🌬': 'wind', '🔓': 'unlock', '🔒': 'lock', '🌑': 'moon_dark', '🌕': 'moon', '🌙': 'crescent',
  '🌍': 'earth', '📦': 'box', '📋': 'clipboard', '📏': 'ruler', '🚙': 'rover', '🚐': 'rover',
  '🪂': 'chute', '⬜': 'square', '☄': 'comet', '⏳': 'hourglass', '✕': 'cross', '🛸': 'ufo', '📐': 'blueprint'
};

const TOKEN_RE = new RegExp(
  `(${Object.keys(EMOJI_TO_ICON).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?`,
  'gu'
);
const VS16_RE = /️/g;

export function hasIconToken(text) {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

// Split text into [{ text }, { icon }] runs; returns null when there is nothing to swap.
export function tokenizeIcons(text) {
  const s = String(text);
  TOKEN_RE.lastIndex = 0;
  if (!TOKEN_RE.test(s)) return null;
  TOKEN_RE.lastIndex = 0;
  const out = [];
  let last = 0;
  let m;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index).replace(VS16_RE, '') });
    out.push({ icon: EMOJI_TO_ICON[m[1]] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last).replace(VS16_RE, '') });
  return out.filter(t => t.icon || t.text);
}

export function stripVariationSelectors(text) {
  return String(text).replace(VS16_RE, '');
}

// Advance width of an icon in "cells" (icon + shadow + 1 cell gap).
export function iconAdvanceCells(name) {
  const ic = ICONS[name];
  return ic ? ic.w + 2 : 8;
}

export function iconHeightCells(name) {
  const ic = ICONS[name];
  return ic ? ic.h + 1 : 8;
}

// Draw an icon with its top-left at (x, y) using square cells of `cell` units.
export function drawIcon(ctx, name, x, y, cell, inheritColor = '#eef1f8') {
  const ic = ICONS[name];
  if (!ic) return;
  const prev = ctx.fillStyle;
  ctx.fillStyle = SHADOW;
  for (const r of ic.runs) ctx.fillRect(x + (r.x + 1) * cell, y + (r.y + 1) * cell, r.len * cell, cell);
  for (const r of ic.runs) {
    ctx.fillStyle = r.color || inheritColor;
    ctx.fillRect(x + r.x * cell, y + r.y * cell, r.len * cell, cell);
  }
  ctx.fillStyle = prev;
}

const svgCache = new Map();
// Inline SVG for DOM use. Cells are 2 CSS px by default (matches the UI pixel grid);
// add class "x3" for 3 px cells.
export function iconHtml(name, extraClass = '') {
  const key = `${name}|${extraClass}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const ic = ICONS[name];
  if (!ic) return '';
  let rects = '';
  for (const r of ic.runs) rects += `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.len}" height="1" fill="${SHADOW}"/>`;
  for (const r of ic.runs) rects += `<rect x="${r.x}" y="${r.y}" width="${r.len}" height="1" fill="${r.color || 'currentColor'}"/>`;
  const W1 = ic.w + 1;
  const H1 = ic.h + 1;
  const html = `<svg class="px-ico ${extraClass}" style="--cw:${W1};--ch:${H1}" viewBox="0 0 ${W1} ${H1}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  svgCache.set(key, html);
  return html;
}

// Replace emoji with pixel icons in an HTML string, leaving tags/attributes untouched.
export function iconize(html) {
  const s = String(html);
  if (!hasIconToken(s)) return s.replace(VS16_RE, '');
  return s.split(/(<[^>]*>)/g).map(part => {
    if (part.startsWith('<')) return part;
    return part.replace(TOKEN_RE, (_, ch) => iconHtml(EMOJI_TO_ICON[ch]));
  }).join('');
}

// Fill every element carrying data-icon="name" (static markup in index.html).
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const extra = el.getAttribute('data-icon-class') || '';
    const label = el.getAttribute('data-icon-label');
    el.innerHTML = iconHtml(name, extra) + (label ? `<span>${label}</span>` : '');
  });
}
