// Pre-game crew lobby: data model only (no DOM). The screen lives in src/lobby-ui.js.
//
// IMPORTANT: this is the *presentation* layer of a lobby. There is no networking here yet.
// `joinGuest` / `leaveSlot` / `setReady` are the integration points a future network layer
// would call when remote players connect; today only the host and local BOTs exist.

import { CREW_ROSTER } from './config.js';
import {
  DEFAULT_LOOK, NAME_MAX, makeRng, randomLook, randomCallsign, sanitizeLook, sanitizeName
} from './avatar-data.js';

export const MAX_CREW = CREW_ROSTER.length; // 4 seats: P1 Launch, P2 Space, P3 Science, P4 Ground
export const ROOM_CODE_LENGTH = 6;
// No I / O / 0 / 1 / L so a code read aloud or typed back is never ambiguous.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(rng() * ROOM_CODE_ALPHABET.length))];
  }
  return code;
}

/* ----------------------------------------------------------------- profile */

const PROFILE_KEY = 'orbital_kitchen_profile_v1';

export function makeProfile(name, look) {
  return { name: sanitizeName(name), look: sanitizeLook(look) };
}

// The local player's saved name + look (null when nothing valid is stored).
export function loadProfile() {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return makeProfile(data?.name, data?.look);
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(makeProfile(profile?.name, profile?.look)));
    }
  } catch {
    // Private mode / blocked storage: the profile just will not persist.
  }
}

export function defaultProfile(rng = Math.random) {
  return makeProfile(randomCallsign(rng), DEFAULT_LOOK);
}

/* ------------------------------------------------------------------- lobby */

// kinds: 'host' (always ready) | 'guest' (remote human, has a ready flag) | 'bot' | 'open'
const openSlot = (index) => ({ index, role: CREW_ROSTER[index].role, kind: 'open' });

export function createLobby({ profile, rng = Math.random, code } = {}) {
  const host = makeProfile(profile?.name || randomCallsign(rng), profile?.look);
  const roomCode = code || generateRoomCode(rng);
  return {
    code: roomCode,
    slots: Array.from({ length: MAX_CREW }, (_, i) => (
      i === 0
        ? { index: 0, role: CREW_ROSTER[0].role, kind: 'host', name: host.name, look: host.look, ready: true }
        : openSlot(i)
    ))
  };
}

export function regenerateCode(lobby, rng = Math.random) {
  let code = generateRoomCode(rng);
  while (code === lobby.code) code = generateRoomCode(rng);
  lobby.code = code;
  return code;
}

export function setSlotProfile(lobby, index, profile) {
  const target = lobby?.slots?.[index];
  if (!target || (target.kind !== 'host' && target.kind !== 'guest')) return;
  target.name = sanitizeName(profile?.name) || target.name;
  target.look = sanitizeLook(profile?.look);
}

export function setHostProfile(lobby, profile) {
  setSlotProfile(lobby, 0, profile);
}

const takenNames = (lobby) => lobby.slots.filter(s => s.kind !== 'open').map(s => s.name);

// Bots are deterministic per room code + seat, so the same lobby always shows the same crew.
export function makeBotProfile(lobby, index, taken = takenNames(lobby)) {
  const rng = makeRng(`${lobby.code}:${index}`);
  return { name: randomCallsign(rng, taken), look: randomLook(rng) };
}

export function addBot(lobby, index) {
  const slot = lobby.slots[index];
  if (!slot || slot.kind !== 'open') return false;
  const bot = makeBotProfile(lobby, index);
  Object.assign(slot, { kind: 'bot', name: bot.name, look: bot.look, ready: true });
  return true;
}

export function removeBot(lobby, index) {
  const slot = lobby.slots[index];
  if (!slot || slot.kind !== 'bot') return false;
  lobby.slots[index] = openSlot(index);
  return true;
}

// Network hook: seat a remote player in the first open seat (or `index`). Returns the seat or -1.
export function joinGuest(lobby, profile, index) {
  const target = Number.isInteger(index)
    ? lobby.slots[index]
    : lobby.slots.find(s => s.kind === 'open');
  if (!target || target.kind !== 'open') return -1;
  const p = makeProfile(profile?.name || randomCallsign(Math.random, takenNames(lobby)), profile?.look);
  Object.assign(target, { kind: 'guest', name: p.name, look: p.look, ready: false });
  return target.index;
}

// Network hook: a guest disconnected. The host cannot leave through here.
export function leaveSlot(lobby, index) {
  const slot = lobby.slots[index];
  if (!slot || slot.kind !== 'guest') return false;
  lobby.slots[index] = openSlot(index);
  return true;
}

// Network hook: a guest toggled ready. Only guests have a ready flag the host waits on.
export function setReady(lobby, index, ready) {
  const slot = lobby.slots[index];
  if (!slot || slot.kind !== 'guest') return false;
  slot.ready = Boolean(ready);
  return true;
}

export function lobbyStatus(lobby) {
  const count = (kind) => lobby.slots.filter(s => s.kind === kind).length;
  const guests = lobby.slots.filter(s => s.kind === 'guest');
  const hosts = count('host');
  const waitingOn = guests.filter(s => !s.ready);
  return {
    humans: hosts + guests.length,
    bots: count('bot'),
    open: count('open'),
    waitingOn,
    canStart: waitingOn.length === 0
  };
}

// Synchronize the presentation lobby model from live WebSocket room state.
export function syncLobbyWithNetState(lobby, net, localProfile = null) {
  if (!lobby || !net || (net.mode !== 'WS_HOST' && net.mode !== 'WS_GUEST')) return false;
  if (net.roomCode) lobby.code = net.roomCode;
  const slots = Array.isArray(net.slots) ? net.slots : [];
  const taken = slots
    .filter(s => s && s.occupied && s.name)
    .map(s => sanitizeName(s.name) || s.name);

  for (let i = 0; i < MAX_CREW; i++) {
    const ns = slots[i];
    if (ns && ns.occupied) {
      const isYou = Boolean(net.clientId && ns.clientId === net.clientId) || i === net.mySlot;
      const isHost = Boolean(ns.isHost);
      const rawName = (isYou && localProfile?.name) ? localProfile.name : ns.name;
      const name = sanitizeName(rawName) || `Crew-${i + 1}`;
      const rawLook = (isYou && localProfile?.look) ? localProfile.look : ns.look;
      const look = sanitizeLook(rawLook);
      lobby.slots[i] = {
        index: i,
        role: CREW_ROSTER[i].role,
        kind: isHost ? 'host' : 'guest',
        name,
        look,
        ready: isHost ? true : Boolean(ns.ready),
        isYou,
        clientId: ns.clientId || null
      };
    } else if (ns && ns.isBot) {
      const bot = makeBotProfile(lobby, i, taken);
      taken.push(bot.name);
      lobby.slots[i] = {
        index: i,
        role: CREW_ROSTER[i].role,
        kind: 'bot',
        name: bot.name,
        look: bot.look,
        ready: true,
        isYou: false
      };
    } else {
      lobby.slots[i] = openSlot(i);
    }
  }
  return true;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One line for the lobby footer.
export function statusMessage(status) {
  if (!status.canStart) {
    const names = status.waitingOn.map(s => s.name).join(', ');
    return `Waiting for ${names} to ready up...`;
  }
  if (status.open > 0) {
    const lead = status.humans > 1 ? 'All players ready.' : 'Solo launch.';
    return `${lead} ${plural(status.open, 'BOT')} will fill the empty ${status.open === 1 ? 'seat' : 'seats'}.`;
  }
  return 'All seats filled. Ready for launch.';
}

// The 4-member crew the mission flies with: open seats are auto-filled with BOTs.
export function resolveCrew(lobby) {
  const taken = takenNames(lobby);
  return lobby.slots.map((slot) => {
    if (slot.kind !== 'open') {
      return { index: slot.index, role: slot.role, kind: slot.kind, callsign: slot.name, look: slot.look };
    }
    const bot = makeBotProfile(lobby, slot.index, taken);
    taken.push(bot.name);
    return { index: slot.index, role: slot.role, kind: 'bot', callsign: bot.name, look: bot.look };
  });
}

export { NAME_MAX };
