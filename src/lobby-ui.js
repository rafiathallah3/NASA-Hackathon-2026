// Pre-game crew lobby screen (pre-game step 2, between the title and Mission Setup).
// Renders into the shared #modal / #modal-content and tags it with .lobby-card so every other
// modal keeps its look. Supports both local/bot setup and live 4P WebSocket co-op rooms.

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
  createLobby, regenerateCode, setSlotProfile, addBot, removeBot, joinGuest, leaveSlot, setReady,
  lobbyStatus, statusMessage, resolveCrew, loadProfile, saveProfile, defaultProfile,
  syncLobbyWithNetState
} from './lobby.js';
import {
  netState, isWsMultiplayer, isWsHost, isWsGuest, getMyWsSlot,
  resolveDefaultWsUrl, saveWsUrl, connectAndCreateRoom, connectAndJoinRoom,
  leaveRoom, claimWsSlot, sendProfileUpdate, sendReadyState, sendBotSlotUpdate,
  buildInviteUrl, syncCrewFromNet
} from './net.js';

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
  if (ui?.inviteTimer) clearTimeout(ui.inviteTimer);
  if (ui?.nameSyncTimer) clearTimeout(ui.nameSyncTimer);
  ui = null;
  document.getElementById('modal-content')?.classList.remove('lobby-card');
}

export function refreshLobbyScreenIfOpen() {
  if (!isLobbyScreenActive()) return false;
  refresh();
  return true;
}

/* ------------------------------------------------------------------ markup */

const SKELETON = () => `
  <header class="lobby-head">
    <div class="lobby-head-copy">
      <h1>Crew Lobby</h1>
      <p class="lobby-sub">Customize your astronaut and launch solo with BOTs, or host / join an online 4P WebSocket crew.</p>
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

  <div id="lobby-net-bar" class="lobby-net-bar" aria-label="Online 4P co-op connection"></div>

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
      <button id="btn-lobby-view-setup" class="btn-secondary hidden" type="button">${iconHtml('clipboard')}<span>View Setup</span></button>
      <button id="btn-lobby-ready" class="btn-play hidden" type="button">${iconHtml('check')}<span id="lobby-ready-label">Ready Up</span></button>
      <button id="btn-lobby-start" class="btn-play" type="button">${iconHtml('rocket')}<span>Next: Mission Setup</span></button>
    </div>
  </footer>
`;

function slotHtml(slot) {
  const roster = CREW_ROSTER[slot.index];
  const wsOn = isWsMultiplayer();
  const amHost = !wsOn || isWsHost();
  const isYou = wsOn ? Boolean(slot.isYou) : slot.kind === 'host';
  const seat = `<span class="slot-seat"><b>P${slot.index + 1}</b><small>${roster.role}</small></span>`;
  const open = slot.kind === 'open';
  const portrait = open
    ? '<span class="slot-portrait is-empty"><span class="slot-q">?</span></span>'
    : `<span class="slot-portrait"><canvas data-portrait="${slot.index}" width="56" height="56"></canvas></span>`;

  let info;
  let side;
  const youTag = isYou ? '<span class="slot-tag tag-you">You</span>' : '';
  if (slot.kind === 'host') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag tag-host">${iconHtml('crown')} Host</span>${youTag}</span>`;
    side = `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>`;
  } else if (slot.kind === 'guest') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag">Player</span>${youTag}</span>`;
    side = slot.ready
      ? `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>`
      : `<span class="slot-state is-wait">${iconHtml('hourglass')} Not ready</span>`;
  } else if (slot.kind === 'bot') {
    info = `<b class="slot-name">${esc(slot.name)}</b><span class="slot-tags"><span class="slot-tag tag-bot">${iconHtml('bot')} Bot</span></span>`;
    const claimBtn = wsOn
      ? `<button type="button" class="slot-btn slot-btn-claim" data-claim-slot="${slot.index}" title="Claim seat P${slot.index + 1}">Claim</button>`
      : '';
    const rmBtn = amHost
      ? `<button type="button" class="slot-btn" data-remove-bot="${slot.index}" title="Remove BOT" aria-label="Remove BOT from seat P${slot.index + 1}">${iconHtml('cross')}</button>`
      : '';
    side = `<span class="slot-state is-ready">${iconHtml('check')} Ready</span>${claimBtn}${rmBtn}`;
  } else {
    info = '<b class="slot-name slot-waiting">Waiting</b><span class="slot-tags"><span class="slot-hint">Player or BOT at launch</span></span>';
    const claimBtn = wsOn
      ? `<button type="button" class="slot-btn slot-btn-claim" data-claim-slot="${slot.index}" title="Claim seat P${slot.index + 1}">Claim</button>`
      : '';
    const addBtn = amHost
      ? `<button type="button" class="slot-btn" data-add-bot="${slot.index}" title="Fill this seat with a BOT now">${iconHtml('bot')} + Bot</button>`
      : '';
    side = `${claimBtn}${addBtn}`;
  }

  return `
    <li class="lobby-slot is-${slot.kind}${isYou ? ' is-you' : ''}" style="--role:${roster.color}" data-slot="${slot.index}">
      ${seat}${portrait}
      <span class="slot-info">${info}</span>
      <span class="slot-side">${side}</span>
    </li>`;
}

/* ---------------------------------------------------------------- rendering */

const $ = (id) => document.getElementById(id);

function renderCode() {
  if (!state.lobby) return;
  const code = state.lobby.code;
  const el = $('lobby-code');
  if (!el) return;
  el.setAttribute('aria-label', `Room code ${code.split('').join(' ')}`);
  el.innerHTML = code.split('').map(ch => `<span>${esc(ch)}</span>`).join('');
  const newBtn = $('btn-lobby-newcode');
  if (newBtn) newBtn.classList.toggle('hidden', isWsMultiplayer());
}

function renderNetBar() {
  const bar = $('lobby-net-bar');
  if (!bar || !ui) return;

  const activeId = document.activeElement?.id || '';
  if (activeId === 'lobby-ws-url') ui.draftWsUrl = document.activeElement.value;
  if (activeId === 'lobby-join-code') ui.draftJoinCode = document.activeElement.value;

  const wsOn = isWsMultiplayer();
  const isConn = netState.status === 'connecting';
  const netKey = `${netState.mode}|${netState.status}|${netState.roomCode}|${netState.error}|${netState.latencyMs ?? ''}`;
  // Never stomp active typing in the offline URL / Join Code inputs unless connection mode/error changed.
  if (!wsOn && (activeId === 'lobby-ws-url' || activeId === 'lobby-join-code') && netKey === ui.lastNetBarKey) {
    return;
  }
  if (!wsOn && isConn && (activeId === 'lobby-ws-url' || activeId === 'lobby-join-code')) {
    return;
  }
  ui.lastNetBarKey = netKey;

  const errHtml = netState.error
    ? `<p id="lobby-ws-err" class="lobby-net-err" role="alert">${iconHtml('warn')}<span>${esc(netState.error)}</span></p>`
    : '';

  if (wsOn) {
    const amHost = isWsHost();
    const pingText = netState.latencyMs != null ? `${netState.latencyMs}ms` : 'Online';
    bar.innerHTML = `
      <div class="lobby-net-row is-online">
        <span class="lobby-net-pill ${amHost ? 'is-host' : 'is-guest'}">${amHost ? `${iconHtml('crown')} HOST ONLINE` : `${iconHtml('dish')} GUEST ONLINE`}</span>
        <span class="lobby-net-meta">${iconHtml('bolt')} Room <b>${esc(netState.roomCode)}</b> · ${esc(pingText)}</span>
        <div class="lobby-net-actions">
          <button id="btn-lobby-invite" class="lobby-mini-btn" type="button" title="Copy direct invite URL">${iconHtml('copy')}<span id="lobby-invite-label">Copy Invite Link</span></button>
          <button id="btn-lobby-ws-leave" class="lobby-mini-btn lobby-btn-danger" type="button" title="Disconnect from online room">${iconHtml('cross')}<span>Leave Online</span></button>
        </div>
      </div>${errHtml}`;
    return;
  }

  const wsVal = ui.draftWsUrl ?? netState.wsUrl ?? resolveDefaultWsUrl();
  const joinVal = ui.draftJoinCode ?? '';
  bar.innerHTML = `
    <div class="lobby-net-row">
      <span class="lobby-net-pill">LOCAL CREW</span>
      <input id="lobby-ws-url" class="lobby-input lobby-net-url" type="text" value="${esc(wsVal)}" placeholder="ws://localhost:8787/ws" aria-label="WebSocket relay URL" spellcheck="false" />
      <button id="btn-lobby-ws-host" class="lobby-mini-btn lobby-btn-accent" type="button" ${isConn ? 'disabled' : ''}>${iconHtml('dish')}<span>${isConn ? 'Connecting...' : 'Host Online'}</span></button>
      <input id="lobby-join-code" class="lobby-input lobby-net-code" type="text" maxlength="6" value="${esc(joinVal)}" placeholder="CODE" aria-label="Room code to join" spellcheck="false" />
      <button id="btn-lobby-ws-join" class="lobby-mini-btn" type="button" ${isConn ? 'disabled' : ''}>${iconHtml('play')}<span>Join Room</span></button>
    </div>${errHtml}`;
}

function renderSlots() {
  const lobby = state.lobby;
  const list = $('lobby-slots');
  if (!lobby || !list) return;
  list.innerHTML = lobby.slots.map(slotHtml).join('');
  list.querySelectorAll('canvas[data-portrait]').forEach((canvas) => {
    const slot = lobby.slots[Number(canvas.dataset.portrait)];
    paintAvatar(canvas, slot.look, { mode: 'bust', width: 56, height: 56 });
  });
  const countEl = $('lobby-count');
  if (countEl) countEl.textContent = `${lobby.slots.filter(s => s.kind !== 'open').length}/${lobby.slots.length}`;
}

function renderStatus() {
  const lobby = state.lobby;
  const el = $('lobby-status');
  if (!lobby || !el) return;
  const status = lobbyStatus(lobby);
  const guestMode = isWsGuest();
  const startBtn = $('btn-lobby-start');
  const readyBtn = $('btn-lobby-ready');
  const setupBtn = $('btn-lobby-view-setup');

  if (guestMode) {
    const mySlot = lobby.slots.find(s => s.isYou);
    const myReady = Boolean(mySlot?.ready);
    if (startBtn) startBtn.classList.add('hidden');
    if (readyBtn) {
      readyBtn.classList.remove('hidden');
      readyBtn.classList.toggle('is-ready-active', myReady);
      readyBtn.setAttribute('aria-pressed', myReady ? 'true' : 'false');
      const lbl = $('lobby-ready-label');
      if (lbl) lbl.textContent = myReady ? 'Not Ready' : 'Ready Up';
    }
    if (setupBtn) setupBtn.classList.remove('hidden');

    if (!myReady) {
      el.classList.add('is-wait');
      el.innerHTML = `${iconHtml('hourglass')}<span>Customize your astronaut, pick a seat, and click Ready Up.</span>`;
    } else if (!status.canStart) {
      el.classList.add('is-wait');
      el.innerHTML = `${iconHtml('hourglass')}<span>${esc(statusMessage(status))}</span>`;
    } else {
      el.classList.remove('is-wait');
      el.innerHTML = `${iconHtml('check')}<span>Ready! Waiting for Host to launch the mission...</span>`;
    }
    return;
  }

  if (readyBtn) readyBtn.classList.add('hidden');
  if (setupBtn) setupBtn.classList.add('hidden');
  if (startBtn) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !status.canStart;
  }
  el.classList.toggle('is-wait', !status.canStart);
  el.innerHTML = `${iconHtml(status.canStart ? 'check' : 'hourglass')}<span>${esc(statusMessage(status))}</span>`;
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

function localSeatIndex() {
  return isWsMultiplayer() ? Math.max(0, getMyWsSlot()) : 0;
}

function syncSelf(sendNet = true) {
  if (!state.lobby) return;
  setSlotProfile(state.lobby, localSeatIndex(), state.profile);
  saveProfile(state.profile);
  if (sendNet && isWsMultiplayer()) {
    sendProfileUpdate({ name: state.profile.name, look: state.profile.look });
  }
}

function afterLookChange() {
  syncSelf(true);
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
  const mine = localSeatIndex();
  return state.lobby.slots.filter(s => s.kind !== 'open' && s.index !== mine).map(s => s.name);
}

// An empty callsign is replaced by a random one so a seat never shows a blank name.
function commitName() {
  const input = ui && $('lobby-name');
  if (!input) return; // the lobby is gone (a blur can fire while its DOM is being replaced)
  if (ui.nameSyncTimer) {
    clearTimeout(ui.nameSyncTimer);
    ui.nameSyncTimer = 0;
  }
  const name = sanitizeName(input.value) || randomCallsign(Math.random, otherNames());
  state.profile.name = name;
  input.value = name;
  syncSelf(true);
  renderSlots();
}

function onNameInput() {
  const input = ui && $('lobby-name');
  if (!input) return;
  const cleaned = input.value.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, NAME_MAX);
  if (cleaned !== input.value) input.value = cleaned;
  state.profile.name = sanitizeName(cleaned);
  if (state.profile.name) {
    syncSelf(false);
    renderSlots();
    if (isWsMultiplayer()) {
      clearTimeout(ui.nameSyncTimer);
      ui.nameSyncTimer = setTimeout(() => {
        if (!ui) return;
        sendProfileUpdate({ name: state.profile.name, look: state.profile.look });
      }, 150);
    }
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

async function copyTextWithFeedback(text, labelElId, idleText, okText, timerKey) {
  if (!ui) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = legacyCopy(text);
  }
  if (!ui) return;
  const label = $(labelElId);
  if (label) label.textContent = ok ? okText : 'Copy';
  playTone(ok ? 760 : 300, 'triangle', 0.07, 0.06);
  clearTimeout(ui[timerKey]);
  ui[timerKey] = setTimeout(() => {
    const el = $(labelElId);
    if (el) el.textContent = idleText;
  }, 1400);
}

function copyCode() {
  if (!ui || !state.lobby) return;
  copyTextWithFeedback(state.lobby.code, 'lobby-copy-label', 'Copy', 'Copied!', 'copyTimer');
}

function copyInvite() {
  if (!ui) return;
  const url = buildInviteUrl();
  if (!url) return;
  copyTextWithFeedback(url, 'lobby-invite-label', 'Copy Invite Link', 'Copied URL!', 'inviteTimer');
}

function handleStart() {
  if (!ui || isWsGuest() || !lobbyStatus(state.lobby).canStart) return;
  commitName();
  syncCrewFromNet(state.lobby);
  prewarmCrewSheets(state.crew);
  const { onStart } = ui;
  hideLobbyScreen();
  onStart?.();
}

function handleViewSetup() {
  if (!ui) return;
  commitName();
  syncCrewFromNet(state.lobby);
  prewarmCrewSheets(state.crew);
  const { onStart } = ui;
  hideLobbyScreen();
  onStart?.();
}

function handleLeave() {
  if (!ui) return;
  saveProfile(state.profile);
  if (isWsMultiplayer()) leaveRoom();
  const { onLeave } = ui;
  state.lobby = null;
  hideLobbyScreen();
  onLeave?.();
}

function refresh() {
  if (!ui || !state.lobby) return;
  if (isWsMultiplayer()) {
    syncLobbyWithNetState(state.lobby, netState, state.profile);
  }
  renderCode();
  renderNetBar();
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
  else if (!isWsMultiplayer()) setSlotProfile(state.lobby, 0, state.profile);

  ui = {
    onStart,
    onLeave,
    facing: 'down',
    copyTimer: 0,
    inviteTimer: 0,
    nameSyncTimer: 0,
    draftWsUrl: netState.wsUrl || resolveDefaultWsUrl(),
    draftJoinCode: '',
    lastNetBarKey: ''
  };
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
      syncSelf(true);
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
    if (isWsMultiplayer()) return;
    regenerateCode(state.lobby);
    renderCode();
    playTone(620, 'triangle', 0.05, 0.05);
  });

  // Online 4P WebSocket connection bar
  const netBar = $('lobby-net-bar');
  netBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !ui) return;
    if (btn.id === 'btn-lobby-ws-host') {
      commitName();
      const wsUrl = $('lobby-ws-url')?.value || ui.draftWsUrl || resolveDefaultWsUrl();
      ui.draftWsUrl = wsUrl;
      saveWsUrl(wsUrl);
      connectAndCreateRoom({
        wsUrl,
        playerName: state.profile.name,
        preferredSlot: 0,
        look: state.profile.look,
        roomCode: state.lobby?.code,
        botSlots: state.lobby?.slots?.map(s => s.kind === 'bot')
      });
      renderNetBar();
      return;
    }
    if (btn.id === 'btn-lobby-ws-join') {
      commitName();
      const wsUrl = $('lobby-ws-url')?.value || ui.draftWsUrl || resolveDefaultWsUrl();
      const roomCode = $('lobby-join-code')?.value || ui.draftJoinCode || '';
      ui.draftWsUrl = wsUrl;
      ui.draftJoinCode = roomCode.trim().toUpperCase();
      saveWsUrl(wsUrl);
      connectAndJoinRoom({
        wsUrl,
        roomCode: ui.draftJoinCode,
        playerName: state.profile.name,
        look: state.profile.look
      });
      renderNetBar();
      return;
    }
    if (btn.id === 'btn-lobby-invite') {
      copyInvite();
      return;
    }
    if (btn.id === 'btn-lobby-ws-leave') {
      leaveRoom();
      state.lobby = createLobby({ profile: state.profile });
      refresh();
    }
  });
  netBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.id === 'lobby-join-code') {
      e.preventDefault();
      $('btn-lobby-ws-join')?.click();
    }
  });

  // Crew list: claim online seat / add & remove BOTs
  $('lobby-slots').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !ui) return;
    if (btn.dataset.claimSlot !== undefined) {
      claimWsSlot(Number(btn.dataset.claimSlot));
      playTone(640, 'triangle', 0.05, 0.05);
      return;
    }
    if (btn.dataset.addBot !== undefined) {
      const idx = Number(btn.dataset.addBot);
      if (isWsMultiplayer()) sendBotSlotUpdate(idx, true);
      else addBot(state.lobby, idx);
    } else if (btn.dataset.removeBot !== undefined) {
      const idx = Number(btn.dataset.removeBot);
      if (isWsMultiplayer()) sendBotSlotUpdate(idx, false);
      else removeBot(state.lobby, idx);
    } else return;
    playTone(520, 'square', 0.04, 0.04);
    refresh();
  });

  $('btn-lobby-ready').addEventListener('click', () => {
    if (!ui || !isWsGuest()) return;
    const mySlot = state.lobby?.slots?.find(s => s.isYou);
    const nextReady = !mySlot?.ready;
    sendReadyState(nextReady);
    playTone(nextReady ? 720 : 420, 'triangle', 0.06, 0.05);
  });
  $('btn-lobby-view-setup').addEventListener('click', handleViewSetup);
  $('btn-lobby-start').addEventListener('click', handleStart);
  $('btn-lobby-leave').addEventListener('click', handleLeave);

  exposeDevApi();
  refresh();
  renderSelections();
  repaintArt();
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
