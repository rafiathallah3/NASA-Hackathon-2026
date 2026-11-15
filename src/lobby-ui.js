// Pre-game crew lobby screen (pre-game step 2, between the title and Mission Setup).
// Renders into the shared #modal / #modal-content and tags it with .lobby-card so every other
// modal keeps its look. Presentation only: see src/lobby.js for the (network-free) model.

import { state } from './state.js';
import { CREW_ROSTER } from './config.js';
import { iconHtml } from './icons.js';
import { playTone } from './audio.js';
import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, BADGES, PREVIEW_FACINGS, NAME_MAX,
  sanitizeLook, sanitizeName, randomLook, randomCallsign
} from './avatar-data.js';
import {
  paintAvatar, paintHairTile, paintFlagTile, whenAvatarAssetsReady, prewarmCrewSheets
} from './avatar.js';
import {
  createLobby, regenerateCode, setHostProfile, addBot, removeBot, joinGuest, leaveSlot, setReady,
  lobbyStatus, statusMessage, resolveCrew, loadProfile, saveProfile, defaultProfile
} from './lobby.js';

// Live screen context, or null while another screen owns #modal.
let ui = null;

const esc = (s) => String(s).replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

export function isLobbyScreenActive() {
  if (!ui) return false;
  const modal = document.getElementById('modal');
  return Boolean(modal) && !modal.classList.contains('hidden');
}

// Drops the lobby styling + timers. Safe to call from anywhere (next pre-game step, startGame).
export function hideLobbyScreen() {
  if (ui?.copyTimer) clearTimeout(ui.copyTimer);
  ui = null;
  document.getElementById('modal-content')?.classList.remove('lobby-card');
}

/* ------------------------------------------------------------------ markup */

const SKELETON = () => `
  <header class="lobby-head">
    <div class="lobby-head-copy">
      <h1>Crew Lobby</h1>
      <p class="lobby-sub">Share the room code with your crew. The host launches once every player is ready; empty seats are flown by BOTs.</p>
    </div>
    <div class="lobby-code-box">
      <span class="lobby-code-label">Room code</span>
      <div id="lobby-code" class="lobby-code"></div>
      <div class="lobby-code-actions">
        <button id="btn-lobby-copy" class="lobby-mini-btn" type="button" title="Copy room code">${iconHtml('copy')}<span id="lobby-copy-label">Copy</span></button>
        <button id="btn-lobby-newcode" class="lobby-mini-btn" type="button" title="Generate a new room code">${iconHtml('dice')}<span>New</span></button>
      </div>
    </div>
  </header>

  <div class="lobby-body">
    <section class="lobby-panel lobby-crew" aria-label="Crew list">
      <h2 class="lobby-panel-title"><span>${iconHtml('team')} Crew</span><span id="lobby-count" class="lobby-count"></span></h2>
      <ul id="lobby-slots" class="lobby-slots"></ul>
    </section>

    <section class="lobby-panel lobby-custom" aria-label="Customize your astronaut">
      <h2 class="lobby-panel-title"><span>${iconHtml('helmet')} Your Astronaut</span></h2>
      <div class="lobby-custom-grid">
        <div class="lobby-preview">
          <div class="lobby-preview-stage"><canvas id="lobby-preview" class="lobby-preview-canvas" width="143" height="225" aria-label="Astronaut preview"></canvas></div>
          <div class="lobby-turn">
            <button id="btn-turn-left" class="lobby-mini-btn" type="button" title="Turn left" aria-label="Turn left">${iconHtml('left')}</button>
            <button id="btn-turn-right" class="lobby-mini-btn" type="button" title="Turn right" aria-label="Turn right">${iconHtml('right')}</button>
          </div>
          <button id="btn-look-random" class="lobby-mini-btn lobby-random" type="button" title="Randomize your look">${iconHtml('dice')}<span>Random look</span></button>
        </div>

        <div id="lobby-fields" class="lobby-fields">
          <div class="lobby-field">
            <label class="lobby-field-label" for="lobby-name">Callsign</label>
            <div class="lobby-name-row">
              <input id="lobby-name" class="lobby-input" type="text" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" />
              <button id="btn-name-random" class="lobby-mini-btn" type="button" title="Random callsign" aria-label="Random callsign">${iconHtml('dice')}</button>
            </div>
          </div>
          <div class="lobby-field">
            <span class="lobby-field-label">Skin <em id="lbl-skin"></em></span>
            <div id="opt-skin" class="swatch-row">${SKIN_TONES.map((t, i) => `
              <button type="button" class="swatch" data-skin="${i}" style="--sw:rgb(${t.rgb.join(',')})" title="${t.name}" aria-label="Skin: ${t.name}" aria-pressed="false"></button>`).join('')}
            </div>
          </div>
          <div id="field-hair" class="lobby-field">
            <span class="lobby-field-label">Hair <em id="lbl-hair"></em></span>
            <div id="opt-hair" class="tile-row">
              <button type="button" class="tile tile-text" data-hair="-1" title="Bald" aria-label="Hair: Bald" aria-pressed="false">Bald</button>${HAIR_STYLES.map((h, i) => `
              <button type="button" class="tile" data-hair="${i}" title="${h.name}" aria-label="Hair: ${h.name}" aria-pressed="false"><canvas data-hair-tile="${i}" width="34" height="30"></canvas></button>`).join('')}
            </div>
          </div>
          <div id="field-haircolor" class="lobby-field">
            <span class="lobby-field-label">Hair color <em id="lbl-haircolor"></em></span>
            <div id="opt-haircolor" class="swatch-row">${HAIR_COLORS.map((c, i) => `
              <button type="button" class="swatch" data-haircolor="${i}" style="--sw:rgb(${c.rgb.join(',')})" title="${c.name}" aria-label="Hair color: ${c.name}" aria-pressed="false"></button>`).join('')}
            </div>
          </div>
          <div class="lobby-field">
            <span class="lobby-field-label">Arm badge <em id="lbl-badge"></em></span>
            <div id="opt-badge" class="tile-row">${BADGES.map((b, i) => `
              <button type="button" class="tile tile-flag" data-badge="${i}" title="${b.name}" aria-label="Arm badge: ${b.name}" aria-pressed="false"><canvas data-flag-tile="${i}" width="46" height="32"></canvas></button>`).join('')}
            </div>
          </div>
          <div class="lobby-field lobby-field-inline">
            <span class="lobby-field-label">Helmet</span>
            <button id="opt-helmet" class="lobby-toggle" type="button" role="switch" aria-checked="false"></button>
            <em class="lobby-hint">Wearing it hides your hair</em>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="lobby-foot">
    <p id="lobby-status" class="lobby-status" role="status"></p>
    <div class="lobby-foot-actions">
      <button id="btn-lobby-leave" class="btn-secondary" type="button">Leave</button>
      <button id="btn-lobby-start" class="btn-play" type="button">${iconHtml('rocket')}<span>Start Mission</span></button>
    </div>
  </footer>
`;

function slotHtml(slot) {
  const roster = CREW_ROSTER[slot.index];
  const seat = `<span class="slot-seat"><b>P${slot.index + 1}</b><small>${roster.role}</small></span>`;
  const open = slot.kind === 'open';
  const portrait = open
    ? '<span class="slot-portrait is-empty"><span class="slot-q">?</span></span>'
    : `<span class="slot-portrait"><canvas data-portrait="${slot.index}" width="56" height="56"></canvas></span>`;

  let info;
  let side;
  if (slot.kind === 'host') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag tag-host">${iconHtml('crown')} Host</span><span class="slot-tag tag-you">You</span></span>`;
    side = `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>`;
  } else if (slot.kind === 'guest') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag">Player</span></span>`;
    side = slot.ready
      ? `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>`
      : `<span class="slot-state is-wait">${iconHtml('hourglass')} Not ready</span>`;
  } else if (slot.kind === 'bot') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag tag-bot">${iconHtml('bot')} Bot</span></span>`;
    side = `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>`
      + `<button type="button" class="slot-btn" data-remove-bot="${slot.index}" title="Remove BOT" aria-label="Remove BOT from seat P${slot.index + 1}">${iconHtml('cross')}</button>`;
  } else {
    info = '<b class="slot-name slot-waiting">Waiting</b><span class="slot-tags"><span class="slot-hint">Player or BOT at launch</span></span>';
    side = `<button type="button" class="slot-btn" data-add-bot="${slot.index}" title="Fill this seat with a BOT now">${iconHtml('bot')} + Bot</button>`;
  }

  return `
    <li class="lobby-slot is-${slot.kind}${slot.kind === 'host' ? ' is-you' : ''}" style="--role:${roster.color}" data-slot="${slot.index}">
      ${seat}${portrait}
      <span class="slot-info">${info}</span>
      <span class="slot-side">${side}</span>
    </li>`;
}

/* ---------------------------------------------------------------- rendering */

const $ = (id) => document.getElementById(id);

function renderCode() {
  const code = state.lobby.code;
  const el = $('lobby-code');
  el.setAttribute('aria-label', `Room code ${code.split('').join(' ')}`);
  el.innerHTML = code.split('').map(ch => `<span>${esc(ch)}</span>`).join('');
}

function renderSlots() {
  const lobby = state.lobby;
  const list = $('lobby-slots');
  list.innerHTML = lobby.slots.map(slotHtml).join('');
  list.querySelectorAll('canvas[data-portrait]').forEach((canvas) => {
    const slot = lobby.slots[Number(canvas.dataset.portrait)];
    paintAvatar(canvas, slot.look, { mode: 'bust', width: 56, height: 56 });
  });
  $('lobby-count').textContent = `${lobby.slots.filter(s => s.kind !== 'open').length}/${lobby.slots.length}`;
}

function renderStatus() {
  const status = lobbyStatus(state.lobby);
  const el = $('lobby-status');
  el.classList.toggle('is-wait', !status.canStart);
  el.innerHTML = `${iconHtml(status.canStart ? 'check' : 'hourglass')}<span>${esc(statusMessage(status))}</span>`;
  $('btn-lobby-start').disabled = !status.canStart;
}

function renderPreview() {
  paintAvatar($('lobby-preview'), state.profile.look, { facing: ui.facing });
}

function markSelected(containerId, attr, value) {
  $(containerId).querySelectorAll(`[${attr}]`).forEach((el) => {
    const on = Number(el.getAttribute(attr)) === value;
    el.classList.toggle('selected', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function renderSelections() {
  const look = state.profile.look;
  markSelected('opt-skin', 'data-skin', look.skin);
  markSelected('opt-hair', 'data-hair', look.hair);
  markSelected('opt-haircolor', 'data-haircolor', look.hairColor);
  markSelected('opt-badge', 'data-badge', look.badge);
  $('lbl-skin').textContent = SKIN_TONES[look.skin].name;
  $('lbl-hair').textContent = look.hair < 0 ? 'Bald' : HAIR_STYLES[look.hair].name;
  $('lbl-haircolor').textContent = HAIR_COLORS[look.hairColor].name;
  $('lbl-badge').textContent = BADGES[look.badge].name;

  const helmet = $('opt-helmet');
  helmet.setAttribute('aria-checked', look.helmet ? 'true' : 'false');
  helmet.innerHTML = `${iconHtml('helmet')}<span>${look.helmet ? 'On' : 'Off'}</span>`;
  $('field-hair').classList.toggle('is-dim', look.helmet);
  $('field-haircolor').classList.toggle('is-dim', look.helmet);
}

function paintHairTiles() {
  const colorIdx = state.profile.look.hairColor;
  $('opt-hair').querySelectorAll('canvas[data-hair-tile]').forEach((canvas) => {
    paintHairTile(canvas, Number(canvas.dataset.hairTile), colorIdx);
  });
}

function paintFlagTiles() {
  $('opt-badge').querySelectorAll('canvas[data-flag-tile]').forEach((canvas) => {
    paintFlagTile(canvas, Number(canvas.dataset.flagTile));
  });
}

function repaintArt() {
  paintHairTiles();
  paintFlagTiles();
  renderPreview();
  renderSlots();
}

/* ------------------------------------------------------------------ actions */

function syncHost() {
  setHostProfile(state.lobby, state.profile);
  saveProfile(state.profile);
}

function afterLookChange() {
  syncHost();
  renderSelections();
  renderPreview();
  paintHairTiles();
  renderSlots();
}

function applyLook(next) {
  state.profile.look = sanitizeLook(next);
  afterLookChange();
  playTone(560, 'square', 0.04, 0.04);
}

function otherNames() {
  return state.lobby.slots.filter(s => s.kind !== 'open' && s.index !== 0).map(s => s.name);
}

// An empty callsign is replaced by a random one so a seat never shows a blank name.
function commitName() {
  const input = ui && $('lobby-name');
  if (!input) return; // the lobby is gone (a blur can fire while its DOM is being replaced)
  const name = sanitizeName(input.value) || randomCallsign(Math.random, otherNames());
  state.profile.name = name;
  input.value = name;
  syncHost();
  renderSlots();
}

function onNameInput() {
  const input = ui && $('lobby-name');
  if (!input) return;
  const cleaned = input.value.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, NAME_MAX);
  if (cleaned !== input.value) input.value = cleaned;
  state.profile.name = sanitizeName(cleaned);
  if (state.profile.name) {
    syncHost();
    renderSlots();
  }
}

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;user-select:text';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

async function copyCode() {
  if (!ui) return;
  const code = state.lobby.code;
  let ok = false;
  try {
    await navigator.clipboard.writeText(code);
    ok = true;
  } catch {
    ok = legacyCopy(code);
  }
  if (!ui) return;
  const label = $('lobby-copy-label');
  label.textContent = ok ? 'Copied!' : 'Select code';
  playTone(ok ? 760 : 300, 'triangle', 0.07, 0.06);
  clearTimeout(ui.copyTimer);
  ui.copyTimer = setTimeout(() => { label.textContent = 'Copy'; }, 1400);
}

function handleStart() {
  if (!ui || !lobbyStatus(state.lobby).canStart) return;
  commitName();
  state.crew = resolveCrew(state.lobby);
  prewarmCrewSheets(state.crew);
  const { onStart } = ui;
  hideLobbyScreen();
  onStart?.();
}

function handleLeave() {
  if (!ui) return;
  saveProfile(state.profile);
  const { onLeave } = ui;
  state.lobby = null;
  hideLobbyScreen();
  onLeave?.();
}

function refresh() {
  if (!ui) return;
  renderSlots();
  renderStatus();
}

// Hooks a future network layer (or you, from the console) can use to see the waiting flow:
//   __orbitalLobby.join({ name: 'Zed' })  -> seats a guest who is NOT ready yet
//   __orbitalLobby.setReady(1, true)      -> guest in seat index 1 readies up
function exposeDevApi() {
  if (typeof window === 'undefined' || window.__orbitalLobby) return;
  window.__orbitalLobby = {
    get lobby() { return state.lobby; },
    join(profile, index) {
      const seat = state.lobby ? joinGuest(state.lobby, profile, index) : -1;
      refresh();
      return seat;
    },
    setReady(index, ready = true) {
      const ok = state.lobby ? setReady(state.lobby, index, ready) : false;
      refresh();
      return ok;
    },
    leave(index) {
      const ok = state.lobby ? leaveSlot(state.lobby, index) : false;
      refresh();
      return ok;
    },
    refresh
  };
}

/* -------------------------------------------------------------------- entry */

export function showLobbyScreen({ onStart, onLeave } = {}) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) {
    onStart?.();
    return;
  }
  hideLobbyScreen();

  if (!state.profile) state.profile = loadProfile() || defaultProfile();
  if (!state.profile.name) state.profile.name = randomCallsign();
  state.profile.look = sanitizeLook(state.profile.look);
  saveProfile(state.profile); // keeps a first-time random callsign stable across reloads
  if (!state.lobby) state.lobby = createLobby({ profile: state.profile });
  else setHostProfile(state.lobby, state.profile);

  ui = { onStart, onLeave, facing: 'down', copyTimer: 0 };
  content.classList.add('lobby-card');
  content.innerHTML = SKELETON();
  $('lobby-name').value = state.profile.name;

  // Options (delegated: one listener per group)
  $('lobby-fields').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !ui) return;
    const look = { ...state.profile.look };
    if (btn.dataset.skin !== undefined) look.skin = Number(btn.dataset.skin);
    else if (btn.dataset.hair !== undefined) look.hair = Number(btn.dataset.hair);
    else if (btn.dataset.haircolor !== undefined) look.hairColor = Number(btn.dataset.haircolor);
    else if (btn.dataset.badge !== undefined) look.badge = Number(btn.dataset.badge);
    else if (btn.id === 'opt-helmet') look.helmet = !look.helmet;
    else if (btn.id === 'btn-name-random') {
      state.profile.name = randomCallsign(Math.random, otherNames());
      $('lobby-name').value = state.profile.name;
      syncHost();
      renderSlots();
      playTone(560, 'square', 0.04, 0.04);
      return;
    } else return;
    applyLook(look);
  });

  const nameInput = $('lobby-name');
  nameInput.addEventListener('input', onNameInput);
  nameInput.addEventListener('blur', commitName);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
  });

  // Preview controls
  const turn = (dir) => {
    const i = PREVIEW_FACINGS.indexOf(ui.facing);
    ui.facing = PREVIEW_FACINGS[(i + dir + PREVIEW_FACINGS.length) % PREVIEW_FACINGS.length];
    renderPreview();
    playTone(480, 'square', 0.03, 0.035);
  };
  $('btn-turn-left').addEventListener('click', () => turn(-1));
  $('btn-turn-right').addEventListener('click', () => turn(1));
  $('btn-look-random').addEventListener('click', () => {
    applyLook({ ...randomLook(), helmet: state.profile.look.helmet });
  });

  // Room code
  $('btn-lobby-copy').addEventListener('click', copyCode);
  $('btn-lobby-newcode').addEventListener('click', () => {
    regenerateCode(state.lobby);
    renderCode();
    playTone(620, 'triangle', 0.05, 0.05);
  });

  // Crew list: add / remove BOTs
  $('lobby-slots').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !ui) return;
    if (btn.dataset.addBot !== undefined) addBot(state.lobby, Number(btn.dataset.addBot));
    else if (btn.dataset.removeBot !== undefined) removeBot(state.lobby, Number(btn.dataset.removeBot));
    else return;
    playTone(520, 'square', 0.04, 0.04);
    refresh();
  });

  $('btn-lobby-start').addEventListener('click', handleStart);
  $('btn-lobby-leave').addEventListener('click', handleLeave);

  exposeDevApi();
  renderCode();
  renderSelections();
  repaintArt();
  renderStatus();
  modal.classList.remove('hidden');

  // Sprite sheets are big: if they are still loading, paint everything once they land.
  whenAvatarAssetsReady().then((ready) => {
    if (ready && ui) repaintArt();
  });

  // Keep keyboard focus off the buttons so a held Enter / Space from the title screen can
  // never click one; the card itself takes focus.
  content.setAttribute('tabindex', '-1');
  content.focus({ preventScroll: true });
}
