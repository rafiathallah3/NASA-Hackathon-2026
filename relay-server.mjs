// Zero-dependency Node.js HTTP + WebSocket server for Orbital Kitchen.
// - Serves static game files (index.html, styles.css, src/*, Assets/*) over HTTP.
// - Hosts the 4-player WebSocket room relay on the same port (process.env.PORT || 8787).
// - Uses only Node's built-in modules (node:http, node:fs, node:path, node:crypto).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 8787;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ============================================================================
// MINIMAL RFC 6455 WEBSOCKET FRAME PARSER & WRITER (Zero npm dependencies)
// ============================================================================

function encodeWsTextFrame(obj) {
  const payload = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeWsControlFrame(opcode, payload = Buffer.alloc(0)) {
  const clipped = payload.subarray(0, 125);
  const header = Buffer.from([0x80 | (opcode & 0x0f), clipped.length]);
  return Buffer.concat([header, clipped]);
}

class WsClient {
  constructor(socket) {
    this.socket = socket;
    this.id = crypto.randomBytes(6).toString('hex');
    this.roomCode = '';
    this.slot = -1;
    this.name = 'Crew';
    this.look = null;
    this.ready = false;
    this.buffer = Buffer.alloc(0);
    this.closed = false;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
    socket.on('end', () => this._onClose());
    socket.on('error', () => this._onClose());
  }

  send(obj) {
    if (this.closed || !this.socket.writable) return;
    try {
      this.socket.write(encodeWsTextFrame(obj));
    } catch {
      this._onClose();
    }
  }

  _onData(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        const bigLen = this.buffer.readBigUInt64BE(2);
        if (bigLen > BigInt(2 * 1024 * 1024)) {
          this.close();
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const maskLen = isMasked ? 4 : 0;
      const totalFrameLen = offset + maskLen + payloadLen;
      if (this.buffer.length < totalFrameLen) return;

      let payload = this.buffer.subarray(offset + maskLen, totalFrameLen);
      if (isMasked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ mask[i & 3];
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.subarray(totalFrameLen);

      if (opcode === 0x8) {
        // Close frame
        this.close();
        return;
      } else if (opcode === 0x9) {
        // Ping -> Pong
        if (!this.closed && this.socket.writable) {
          this.socket.write(encodeWsControlFrame(0xA, payload));
        }
      } else if (opcode === 0x1) {
        // Text frame
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          handleClientMessage(this, msg);
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  }

  close() {
    if (this.closed) return;
    try {
      if (this.socket.writable) {
        this.socket.write(encodeWsControlFrame(0x8));
      }
      this.socket.destroy();
    } catch {
      // ignore
    }
    this._onClose();
  }

  _onClose() {
    if (this.closed) return;
    this.closed = true;
    removeClientFromRoom(this);
  }
}

// ============================================================================
// 4-PLAYER ROOM STATE & RELAY LOGIC
// ============================================================================

const rooms = new Map(); // roomCode -> Room

function generateRoomCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return 'ORBIT1';
}

function cleanRoomCode(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length >= 4 ? s : '';
}

function createRoom(code, hostClient, missionConfig, botSlots) {
  const slots = [null, null, null, null];
  const bots = Array.isArray(botSlots) ? botSlots.map(Boolean) : [false, true, true, true];
  return {
    code,
    hostId: hostClient.id,
    clients: new Set([hostClient]),
    slots,
    bots: [Boolean(bots[0]), Boolean(bots[1]), Boolean(bots[2]), Boolean(bots[3])],
    missionConfig: missionConfig || {
      selectedObjective: 'polar_volatiles',
      selectedScenario: 'artemis_baseline',
      selectedVehicle: 'heavy_block1b'
    }
  };
}

function serializeRoomState(room) {
  const slotsOut = [0, 1, 2, 3].map((idx) => {
    const client = room.slots[idx];
    if (client) {
      return {
        slot: idx,
        occupied: true,
        isBot: false,
        clientId: client.id,
        name: client.name,
        look: client.look,
        ready: client.id === room.hostId ? true : Boolean(client.ready),
        isHost: client.id === room.hostId
      };
    }
    return {
      slot: idx,
      occupied: false,
      isBot: Boolean(room.bots[idx]),
      clientId: null,
      name: '',
      look: null,
      ready: true,
      isHost: false
    };
  });

  return {
    type: 'ROOM_STATE',
    roomCode: room.code,
    hostId: room.hostId,
    slots: slotsOut,
    missionConfig: room.missionConfig
  };
}

function broadcastRoomState(room) {
  const packet = serializeRoomState(room);
  for (const c of room.clients) {
    c.send(packet);
  }
}

function findAvailableSlot(room, preferred = -1) {
  if (preferred >= 0 && preferred < 4 && !room.slots[preferred]) {
    return preferred;
  }
  // Prefer open non-bot slots first, then bot slots
  for (let i = 0; i < 4; i++) {
    if (!room.slots[i] && !room.bots[i]) return i;
  }
  for (let i = 0; i < 4; i++) {
    if (!room.slots[i]) return i;
  }
  return -1;
}

function removeClientFromRoom(client, notifySelf = false) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  const oldSlot = client.slot;
  client.roomCode = '';
  client.slot = -1;
  client.ready = false;

  if (notifySelf) {
    client.send({ type: 'ROOM_LEFT' });
  }

  if (!room) return;
  room.clients.delete(client);
  if (oldSlot >= 0 && oldSlot < 4 && room.slots[oldSlot] === client) {
    room.slots[oldSlot] = null;
    room.bots[oldSlot] = true; // Refill vacated seat with a bot so crew stays 4/4
  }

  if (room.clients.size === 0) {
    rooms.delete(room.code);
    return;
  }

  // Migrate host if the previous host left
  if (room.hostId === client.id) {
    const nextHost = room.slots.find(Boolean) || room.clients.values().next().value;
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.ready = true;
    }
  }

  for (const peer of room.clients) {
    peer.send({ type: 'PEER_LEFT', clientId: client.id, slot: oldSlot });
  }
  broadcastRoomState(room);
}

function handleClientMessage(client, msg) {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'PING') {
    client.send({ type: 'PONG', clientTs: msg.clientTs, serverTs: Date.now() });
    return;
  }

  if (msg.type === 'CREATE_ROOM') {
    removeClientFromRoom(client, false);
    const requested = cleanRoomCode(msg.roomCode);
    const code = (requested && !rooms.has(requested)) ? requested : generateRoomCode();
    const room = createRoom(code, client, msg.missionConfig, msg.botSlots);

    const slot = findAvailableSlot(room, Number.isInteger(msg.preferredSlot) ? msg.preferredSlot : 0);
    client.name = String(msg.playerName || 'Commander').trim().slice(0, 18) || 'Commander';
    client.look = msg.look || null;
    client.ready = true;
    client.roomCode = code;
    client.slot = slot;
    room.slots[slot] = client;
    room.bots[slot] = false;
    rooms.set(code, room);

    client.send({
      type: 'ROOM_JOINED',
      roomCode: code,
      clientId: client.id,
      slot,
      isHost: true
    });
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'JOIN_ROOM') {
    removeClientFromRoom(client, false);
    const code = cleanRoomCode(msg.roomCode);
    const room = rooms.get(code);
    if (!room) {
      client.send({ type: 'ERROR', message: `Room "${code || msg.roomCode}" was not found. Ask the Host to click Host Online first.` });
      return;
    }

    const slot = findAvailableSlot(room, Number.isInteger(msg.preferredSlot) ? msg.preferredSlot : -1);
    if (slot === -1) {
      client.send({ type: 'ERROR', message: `Room ${code} is full (4/4 human players).` });
      return;
    }

    client.name = String(msg.playerName || 'Crew').trim().slice(0, 18) || 'Crew';
    client.look = msg.look || null;
    client.ready = false;
    client.roomCode = code;
    client.slot = slot;
    room.clients.add(client);
    room.slots[slot] = client;
    room.bots[slot] = false;

    client.send({
      type: 'ROOM_JOINED',
      roomCode: code,
      clientId: client.id,
      slot,
      isHost: room.hostId === client.id
    });
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'LEAVE_ROOM') {
    removeClientFromRoom(client, true);
    return;
  }

  const room = client.roomCode ? rooms.get(client.roomCode) : null;
  if (!room) return;

  if (msg.type === 'CLAIM_SLOT') {
    const target = Number(msg.slot);
    if (!Number.isInteger(target) || target < 0 || target > 3) return;
    if (room.slots[target] && room.slots[target] !== client) return; // Occupied by another human

    const prevSlot = client.slot;
    if (prevSlot >= 0 && prevSlot < 4 && room.slots[prevSlot] === client) {
      room.slots[prevSlot] = null;
      room.bots[prevSlot] = true;
    }
    room.slots[target] = client;
    room.bots[target] = false;
    client.slot = target;

    client.send({ type: 'SLOT_ASSIGNED', slot: target });
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'UPDATE_PROFILE') {
    if (typeof msg.playerName === 'string') {
      const clean = msg.playerName.trim().slice(0, 18);
      if (clean) client.name = clean;
    }
    if (msg.look && typeof msg.look === 'object') {
      client.look = msg.look;
    }
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'SET_READY') {
    client.ready = client.id === room.hostId ? true : Boolean(msg.ready);
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'SET_BOT_SLOT') {
    if (room.hostId !== client.id) return;
    const idx = Number(msg.slot);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;
    if (room.slots[idx]) return; // Cannot overwrite human slot
    room.bots[idx] = Boolean(msg.enabled);
    broadcastRoomState(room);
    return;
  }

  if (msg.type === 'UPDATE_CONFIG') {
    if (room.hostId !== client.id) return;
    room.missionConfig = {
      selectedObjective: msg.selectedObjective || room.missionConfig.selectedObjective,
      selectedScenario: msg.selectedScenario || room.missionConfig.selectedScenario,
      selectedVehicle: msg.selectedVehicle || room.missionConfig.selectedVehicle
    };
    broadcastRoomState(room);
    return;
  }

  // Forward Guest -> Host messages
  if (msg.type === 'GUEST_INPUT' || msg.type === 'GUEST_ACTION') {
    for (const peer of room.clients) {
      if (peer.id === room.hostId && peer !== client) {
        peer.send({
          ...msg,
          slot: client.slot,
          clientId: client.id
        });
      }
    }
    return;
  }

  // Broadcast Host -> All Guests messages
  if (msg.type === 'HOST_SNAPSHOT' || msg.type === 'HOST_EVENT') {
    if (room.hostId !== client.id) return;
    for (const peer of room.clients) {
      if (peer !== client) {
        peer.send(msg);
      }
    }
  }
}

// ============================================================================
// STATIC HTTP SERVER + WEBSOCKET UPGRADE
// ============================================================================

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  let relPath = decodeURIComponent(parsedUrl.pathname);
  if (relPath === '/' || relPath === '') relPath = '/index.html';

  const safePath = path.normalize(path.join(ROOT_DIR, relPath));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || typeof key !== 'string') {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + WS_MAGIC)
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ].join('\r\n');

  socket.write(responseHeaders);
  new WsClient(socket);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Orbital Kitchen HTTP + WebSocket Relay listening on http://localhost:${PORT}`);
});
