import { MULTIPLAYER_CONFIG, CREW_ROSTER } from './config.js';
import { state } from './state.js';
import { sanitizeLook, sanitizeName } from './avatar-data.js';
import { makeBotProfile, loadProfile, resolveCrew } from './lobby.js';

const CLIENT_ID = Math.random().toString(36).slice(2);
const WS_URL_STORAGE_KEY = 'orbital_kitchen_ws_url';
const PLAYER_NAME_STORAGE_KEY = 'orbital_kitchen_player_name';

const netChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('orbital_kitchen_4p_sync') : null;
export const remotePeers = new Map(); // slot -> { clientId, lastSeen }

let onRemoteStageCommand = null;

export function registerNetStageHandler(handler) {
  onRemoteStageCommand = handler;
}

export function broadcastNet(payload) {
  if (netChannel) {
    netChannel.postMessage({ ...payload, sender: CLIENT_ID, ts: Date.now() });
  }
}

export function claimCrewSlot(slot) {
  if (isWsMultiplayer()) {
    claimWsSlot(slot);
    return;
  }
  broadcastNet({ type: 'CLAIM_SLOT', slot });
}

if (netChannel) {
  netChannel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.sender === CLIENT_ID) return;
    if (isWsMultiplayer()) return;

    if (msg.type === 'CLAIM_SLOT' && typeof msg.slot === 'number') {
      remotePeers.set(msg.slot, { clientId: msg.sender, lastSeen: Date.now() });
      const chip = document.getElementById(`pchip-${msg.slot}`);
      if (chip) chip.classList.add('remote-claimed');
    } else if (msg.type === 'CREW_INPUT') {
      remotePeers.set(msg.slot, { clientId: msg.sender, lastSeen: Date.now() });
      if (state.stage === 'STAGE1' && state.players[msg.slot]) {
        const p = state.players[msg.slot];
        p.x = msg.x; p.y = msg.y; p.angle = msg.angle; p.walk += 0.2;
      } else if (state.stage === 'STAGE2' && state.ctrlPlayers[msg.slot]) {
        const p = state.ctrlPlayers[msg.slot];
        p.x = msg.x; p.y = msg.y; p.angle = msg.angle; p.walk += 0.2;
      }
    } else if (msg.type === 'ROVER2_SYNC' && state.stage === 'STAGE3B' && state.rover2) {
      state.rover2.x = msg.x; state.rover2.y = msg.y; state.rover2.z = msg.z;
      state.rover2.facingX = msg.facingX ?? state.rover2.facingX;
      state.rover2.facingY = msg.facingY ?? state.rover2.facingY;
    } else if (msg.type === 'SHIP_SYNC' && state.stage === 'STAGE4' && state.reentry) {
      state.reentry.shipX = msg.shipX;
    } else if (msg.type === 'STAGE_SYNC' && onRemoteStageCommand) {
      onRemoteStageCommand(msg);
    }
  };
}

// Periodically prune stale remote slot indicators in BroadcastChannel mode
setInterval(() => {
  if (isWsMultiplayer()) return;
  const now = Date.now();
  for (const [slot, info] of remotePeers.entries()) {
    if (now - info.lastSeen > 6000) {
      remotePeers.delete(slot);
      const chip = document.getElementById(`pchip-${slot}`);
      if (chip) chip.classList.remove('remote-claimed');
    }
  }
}, 2500);

// ============================================================================
// WEBSOCKET ONLINE 4P MULTIPLAYER TRANSPORT
// ============================================================================
function safeStorageGet(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function safeStorageSet(key, val) {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function getInitialUrlParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const room = (params.get('room') || '').trim().toUpperCase();
    const ws = (params.get('ws') || '').trim();
    if (ws) safeStorageSet(WS_URL_STORAGE_KEY, ws);
    return { room, ws };
  } catch {
    return { room: '', ws: '' };
  }
}

export function resolveDefaultWsUrl() {
  const { ws } = getInitialUrlParams();
  if (ws) return ws;
  if (typeof window !== 'undefined' && window.__ORBITAL_WS_URL) {
    return String(window.__ORBITAL_WS_URL).trim();
  }
  const saved = safeStorageGet(WS_URL_STORAGE_KEY);
  if (saved) return saved;
  if (MULTIPLAYER_CONFIG?.defaultWsUrl) {
    return String(MULTIPLAYER_CONFIG.defaultWsUrl).trim();
  }
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const proto = typeof location !== 'undefined' ? location.protocol : 'http:';
  if (host === 'localhost' || host === '127.0.0.1' || /^192\.168\.|^10\.|^172\./.test(host) || proto === 'http:') {
    const scheme = proto === 'https:' ? 'wss:' : 'ws:';
    const port = MULTIPLAYER_CONFIG?.defaultLocalPort || 8787;
    return `${scheme}//${host || 'localhost'}:${port}`;
  }
  return '';
}

export function getSavedPlayerName() {
  return safeStorageGet(PLAYER_NAME_STORAGE_KEY) || 'Commander';
}

export function savePlayerName(name) {
  const clean = String(name || '').trim().slice(0, 18);
  if (clean) safeStorageSet(PLAYER_NAME_STORAGE_KEY, clean);
}

export function saveWsUrl(url) {
  safeStorageSet(WS_URL_STORAGE_KEY, String(url || '').trim());
}

export const netState = {
  mode: 'OFFLINE', // 'OFFLINE' | 'WS_HOST' | 'WS_GUEST'
  status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
  wsUrl: resolveDefaultWsUrl(),
  roomCode: '',
  clientId: '',
  playerName: getSavedPlayerName(),
  mySlot: 0,
  hostId: '',
  slots: [null, null, null, null],
  missionConfig: null,
  error: '',
  latencyMs: null
};

let ws = null;
let pingTimer = null;
let pendingConnectAction = null;

const listeners = {
  roomUpdate: new Set(),
  snapshot: new Set(),
  hostEvent: new Set(),
  guestInput: new Set(),
  guestAction: new Set(),
  peerLeft: new Set()
};

function emit(eventName, data) {
  const set = listeners[eventName];
  if (!set) return;
  for (const cb of set) {
    try { cb(data); } catch (err) { console.error(`[net:${eventName}]`, err); }
  }
}

export function onNetEvent(eventName, cb) {
  const set = listeners[eventName];
  if (!set || typeof cb !== 'function') return () => {};
  set.add(cb);
  return () => set.delete(cb);
}

export function isWsMultiplayer() {
  return netState.mode === 'WS_HOST' || netState.mode === 'WS_GUEST';
}

export function isWsHost() {
  return netState.mode === 'WS_HOST';
}

export function isWsGuest() {
  return netState.mode === 'WS_GUEST';
}

export function getMyWsSlot() {
  return isWsMultiplayer() ? netState.mySlot : state.activeCrewIndex;
}

export function isHumanSlotInWs(slot) {
  return isWsMultiplayer() && Boolean(netState.slots[slot]?.occupied);
}

export function syncSquadBarRemoteIndicators() {
  for (let i = 0; i < 4; i++) {
    const chip = document.getElementById(`pchip-${i}`);
    if (!chip) continue;
    if (!isWsMultiplayer()) {
      chip.classList.toggle('remote-claimed', remotePeers.has(i));
      chip.title = `P${i + 1}`;
      continue;
    }
    const info = netState.slots[i];
    const isMine = i === netState.mySlot;
    const isRemoteHuman = Boolean(info?.occupied) && !isMine;
    chip.classList.toggle('remote-claimed', isRemoteHuman);
    chip.classList.toggle('active', isMine);
    if (info?.occupied) {
      chip.title = `P${i + 1}: ${info.name}${info.isHost ? ' (Host)' : ''}${isMine ? ' (You)' : ''}`;
    } else {
      chip.title = `P${i + 1}: AI Bot (Click to switch slot)`;
    }
  }
}

function sendWs(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function clearSocketTimers() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function resetWsState(keepError = '') {
  clearSocketTimers();
  pendingConnectAction = null;
  netState.mode = 'OFFLINE';
  netState.status = keepError ? 'error' : 'disconnected';
  netState.roomCode = '';
  netState.clientId = '';
  netState.hostId = '';
  netState.slots = [null, null, null, null];
  netState.missionConfig = null;
  netState.latencyMs = null;
  netState.error = keepError;
  if (state.coopMode === 'WS_4P') {
    state.coopMode = '4P_AI';
  }
  syncSquadBarRemoteIndicators();
  emit('roomUpdate', { ...netState });
}

function normalizeWsUrl(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return '';
  if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
  else if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
  else if (!u.startsWith('ws://') && !u.startsWith('wss://')) {
    const isLocal = /^localhost(?::|$)|^127\.0\.0\.1(?::|$)/.test(u);
    u = `${isLocal ? 'ws' : 'wss'}://${u}`;
  }
  return u;
}

function openSocketAndRun(wsUrl, onOpenAction) {
  const cleanUrl = normalizeWsUrl(wsUrl);
  if (!cleanUrl) {
    netState.status = 'error';
    netState.error = 'Enter a WebSocket relay URL (e.g. wss://your-relay.onrender.com or ws://localhost:8787).';
    emit('roomUpdate', { ...netState });
    return;
  }
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && cleanUrl.startsWith('ws://')) {
    netState.status = 'error';
    netState.error = 'HTTPS pages (like Vercel) require a secure wss:// WebSocket relay URL.';
    emit('roomUpdate', { ...netState });
    return;
  }

  saveWsUrl(cleanUrl);
  netState.wsUrl = cleanUrl;
  netState.error = '';

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(); } catch { /* ignore */ }
  }

  clearSocketTimers();
  netState.status = 'connecting';
  pendingConnectAction = onOpenAction;
  emit('roomUpdate', { ...netState });

  try {
    ws = new WebSocket(cleanUrl);
  } catch (err) {
    resetWsState(`Invalid WebSocket URL: ${err?.message || err}`);
    return;
  }

  const socketRef = ws;

  socketRef.onopen = () => {
    if (ws !== socketRef) return;
    netState.status = 'connected';
    pingTimer = setInterval(() => {
      sendWs({ type: 'PING', clientTs: Date.now() });
    }, 4000);
    sendWs({ type: 'PING', clientTs: Date.now() });
    if (pendingConnectAction) {
      const fn = pendingConnectAction;
      pendingConnectAction = null;
      fn();
    }
  };

  socketRef.onmessage = (ev) => {
    if (ws !== socketRef) return;
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'PONG') {
      if (typeof msg.clientTs === 'number') {
        netState.latencyMs = Math.max(1, Date.now() - msg.clientTs);
        emit('roomUpdate', { ...netState });
      }
      return;
    }

    if (msg.type === 'ERROR') {
      netState.error = msg.message || 'Multiplayer error.';
      emit('roomUpdate', { ...netState });
      return;
    }

    if (msg.type === 'ROOM_JOINED') {
      netState.clientId = msg.clientId;
      netState.roomCode = msg.roomCode;
      netState.mySlot = msg.slot;
      netState.mode = msg.isHost ? 'WS_HOST' : 'WS_GUEST';
      netState.error = '';
      state.coopMode = 'WS_4P';
      state.activeCrewIndex = msg.slot;
      emit('roomUpdate', { ...netState });
      return;
    }

    if (msg.type === 'SLOT_ASSIGNED') {
      netState.mySlot = msg.slot;
      state.activeCrewIndex = msg.slot;
      syncSquadBarRemoteIndicators();
      emit('roomUpdate', { ...netState });
      return;
    }

    if (msg.type === 'ROOM_STATE') {
      const wasHost = netState.mode === 'WS_HOST';
      netState.roomCode = msg.roomCode;
      netState.hostId = msg.hostId;
      netState.slots = Array.isArray(msg.slots) ? msg.slots : [null, null, null, null];
      netState.missionConfig = msg.missionConfig || null;
      if (netState.clientId && msg.hostId === netState.clientId) {
        netState.mode = 'WS_HOST';
      } else if (netState.clientId) {
        netState.mode = 'WS_GUEST';
      }
      const myInfo = netState.slots.find(s => s && s.clientId === netState.clientId);
      if (myInfo) {
        netState.mySlot = myInfo.slot;
        state.activeCrewIndex = myInfo.slot;
      }
      if (!wasHost && netState.mode === 'WS_HOST' && msg.missionConfig) {
        state.selectedObjective = msg.missionConfig.selectedObjective || state.selectedObjective;
        state.selectedScenario = msg.missionConfig.selectedScenario || state.selectedScenario;
        state.selectedVehicle = msg.missionConfig.selectedVehicle || state.selectedVehicle;
      }
      syncSquadBarRemoteIndicators();
      emit('roomUpdate', { ...netState });
      return;
    }

    if (msg.type === 'ROOM_LEFT') {
      resetWsState('');
      return;
    }

    if (msg.type === 'PEER_LEFT') {
      emit('peerLeft', msg);
      return;
    }

    if (msg.type === 'GUEST_INPUT') {
      emit('guestInput', msg);
      return;
    }

    if (msg.type === 'GUEST_ACTION') {
      emit('guestAction', msg);
      return;
    }

    if (msg.type === 'HOST_SNAPSHOT') {
      emit('snapshot', msg);
      return;
    }

    if (msg.type === 'HOST_EVENT') {
      emit('hostEvent', msg);
    }
  };

  socketRef.onerror = () => {
    if (ws !== socketRef) return;
    resetWsState(`Could not connect to WebSocket relay at ${cleanUrl}. Make sure the relay server is running.`);
  };

  socketRef.onclose = () => {
    if (ws !== socketRef) return;
    const hadRoom = isWsMultiplayer();
    ws = null;
    resetWsState(hadRoom ? 'Disconnected from WebSocket relay.' : netState.error || 'WebSocket connection closed.');
  };
}

export function getMyWsInfo() {
  if (!isWsMultiplayer()) return null;
  return netState.slots.find(
    s => s && ((netState.clientId && s.clientId === netState.clientId) || s.slot === netState.mySlot)
  ) || null;
}

export function syncCrewFromNet(lobbyFallback = state.lobby) {
  if (!isWsMultiplayer()) {
    if (lobbyFallback) {
      state.crew = resolveCrew(lobbyFallback);
    }
    return state.crew;
  }
  const saved = loadProfile();
  const taken = (netState.slots || [])
    .filter(s => s && s.occupied && s.name)
    .map(s => sanitizeName(s.name) || s.name);
  const seedLobby = { code: netState.roomCode || lobbyFallback?.code || 'ORBIT1' };
  const crew = CREW_ROSTER.map((member, idx) => {
    const netSlot = netState.slots?.[idx];
    if (netSlot?.occupied) {
      const isMine = (netState.clientId && netSlot.clientId === netState.clientId) || idx === netState.mySlot;
      const isHost = Boolean(netSlot.isHost);
      const rawName = (isMine && saved?.name) ? saved.name : netSlot.name;
      const callsign = sanitizeName(rawName) || `P${idx + 1}`;
      const rawLook = (isMine && saved?.look) ? saved.look : netSlot.look;
      return {
        index: idx,
        role: member.role,
        kind: isHost ? 'host' : 'guest',
        callsign,
        look: sanitizeLook(rawLook)
      };
    }
    const bot = makeBotProfile(seedLobby, idx, taken);
    taken.push(bot.name);
    return {
      index: idx,
      role: member.role,
      kind: 'bot',
      callsign: bot.name,
      look: bot.look
    };
  });
  state.crew = crew;
  return crew;
}

export function connectAndCreateRoom({ wsUrl, playerName, preferredSlot = 0, missionConfig, look, roomCode, botSlots } = {}) {
  const cleanName = String(playerName || getSavedPlayerName()).trim().slice(0, 18) || 'Commander';
  savePlayerName(cleanName);
  netState.playerName = cleanName;
  const saved = loadProfile();
  const resolvedLook = sanitizeLook(look || saved?.look);
  openSocketAndRun(wsUrl || netState.wsUrl || resolveDefaultWsUrl(), () => {
    sendWs({
      type: 'CREATE_ROOM',
      playerName: cleanName,
      preferredSlot,
      look: resolvedLook,
      roomCode: roomCode ? String(roomCode).trim().toUpperCase() : undefined,
      botSlots: Array.isArray(botSlots) ? botSlots : undefined,
      missionConfig: missionConfig || {
        selectedObjective: state.selectedObjective,
        selectedScenario: state.selectedScenario,
        selectedVehicle: state.selectedVehicle
      }
    });
  });
}

export function connectAndJoinRoom({ wsUrl, roomCode, playerName, preferredSlot = -1, look } = {}) {
  const code = String(roomCode || '').trim().toUpperCase();
  if (!code || code.length < 3) {
    netState.status = 'error';
    netState.error = 'Enter a 4–6 character room code to join.';
    emit('roomUpdate', { ...netState });
    return;
  }
  const cleanName = String(playerName || getSavedPlayerName()).trim().slice(0, 18) || 'Crew';
  savePlayerName(cleanName);
  netState.playerName = cleanName;
  const saved = loadProfile();
  const resolvedLook = sanitizeLook(look || saved?.look);
  openSocketAndRun(wsUrl || netState.wsUrl || resolveDefaultWsUrl(), () => {
    sendWs({
      type: 'JOIN_ROOM',
      roomCode: code,
      playerName: cleanName,
      preferredSlot,
      look: resolvedLook
    });
  });
}

export function leaveRoom() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendWs({ type: 'LEAVE_ROOM' });
    try { ws.close(); } catch { /* ignore */ }
  }
  ws = null;
  resetWsState('');
}

export function claimWsSlot(slot) {
  if (!isWsMultiplayer()) return;
  sendWs({ type: 'CLAIM_SLOT', slot });
}

export function sendProfileUpdate({ name, look } = {}) {
  if (!isWsMultiplayer()) return false;
  return sendWs({
    type: 'UPDATE_PROFILE',
    playerName: name !== undefined ? (sanitizeName(name) || 'Crew') : undefined,
    look: look ? sanitizeLook(look) : undefined
  });
}

export function sendReadyState(ready) {
  if (!isWsMultiplayer()) return false;
  return sendWs({
    type: 'SET_READY',
    ready: Boolean(ready)
  });
}

export function sendBotSlotUpdate(slot, enabled) {
  if (!isWsHost()) return false;
  return sendWs({
    type: 'SET_BOT_SLOT',
    slot,
    enabled: Boolean(enabled)
  });
}

export function sendLobbyConfig(cfg) {
  if (!isWsHost()) return;
  sendWs({
    type: 'UPDATE_CONFIG',
    selectedObjective: cfg?.selectedObjective ?? state.selectedObjective,
    selectedScenario: cfg?.selectedScenario ?? state.selectedScenario,
    selectedVehicle: cfg?.selectedVehicle ?? state.selectedVehicle
  });
}

export function sendGuestKeys(keysSnapshot) {
  if (!isWsGuest()) return false;
  return sendWs({
    type: 'GUEST_INPUT',
    keys: keysSnapshot,
    ts: Date.now()
  });
}

export function sendGuestAction(action, data = {}) {
  if (!isWsGuest()) return false;
  return sendWs({
    type: 'GUEST_ACTION',
    action,
    ...data,
    ts: Date.now()
  });
}

export function broadcastHostSnapshot(snapshot) {
  if (!isWsHost()) return false;
  return sendWs({
    type: 'HOST_SNAPSHOT',
    snapshot,
    ts: Date.now()
  });
}

export function broadcastHostEvent(event, data = {}) {
  if (!isWsHost()) return false;
  return sendWs({
    type: 'HOST_EVENT',
    event,
    ...data,
    ts: Date.now()
  });
}

export function buildInviteUrl() {
  if (!netState.roomCode || typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set('room', netState.roomCode);
  if (netState.wsUrl) {
    url.searchParams.set('ws', netState.wsUrl);
  }
  return url.toString();
}

window.ORBITAL_NET = {
  clientId: CLIENT_ID,
  netState,
  exportState: () => ({
    stage: state.stage,
    stageTimer: state.stageTimer,
    score: state.score,
    telemetry: { ...state.telemetry },
    shippedModules: { ...state.shippedModules },
    activeCrewIndex: state.activeCrewIndex,
    coopMode: state.coopMode,
    wsMode: netState.mode,
    wsRoom: netState.roomCode,
    wsSlot: netState.mySlot,
    remoteSlots: isWsMultiplayer()
      ? netState.slots.filter(s => s?.occupied).map(s => s.slot)
      : Array.from(remotePeers.keys())
  }),
  broadcast: broadcastNet
};
