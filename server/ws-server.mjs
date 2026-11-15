#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB cap per message

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon'
};

/** @type {Map<string, { code: string, hostId: string, slots: Array<object|null>, clients: Map<string, object>, missionConfig: object, createdAt: number }>} */
const rooms = new Map();
/** @type {Set<object>} */
const allClients = new Set();

function makeId(len = 8) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function makeRoomCode() {
  for (let attempt = 0; attempt < 24; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[crypto.randomInt(0, ROOM_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return makeId(4).toUpperCase();
}

function encodeWsFrame(opcode, payloadBuf) {
  const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function sendWsJson(client, obj) {
  if (!client || client.closed || !client.socket || client.socket.destroyed) return;
  try {
    const json = JSON.stringify(obj);
    client.socket.write(encodeWsFrame(0x1, Buffer.from(json, 'utf8')));
  } catch {
    // Ignore write failures on closing sockets
  }
}

function sendWsControl(client, opcode, payload = Buffer.alloc(0)) {
  if (!client || client.closed || !client.socket || client.socket.destroyed) return;
  try {
    client.socket.write(encodeWsFrame(opcode, payload));
  } catch {
    // Ignore write failures
  }
}

function serializeRoomState(room) {
  return {
    type: 'ROOM_STATE',
    roomCode: room.code,
    hostId: room.hostId,
    missionConfig: room.missionConfig,
    slots: room.slots.map((slotClient, idx) => {
      if (!slotClient) {
        return { slot: idx, occupied: false, clientId: null, name: null, isHost: false };
      }
      return {
        slot: idx,
        occupied: true,
        clientId: slotClient.id,
        name: slotClient.name,
        isHost: slotClient.id === room.hostId
      };
    })
  };
}

function broadcastRoom(room, obj, excludeClientId = null) {
  for (const client of room.clients.values()) {
    if (excludeClientId && client.id === excludeClientId) continue;
    sendWsJson(client, obj);
  }
}

function leaveCurrentRoom(client, reason = 'left') {
  if (!client || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  const prevSlot = client.slot;
  client.roomCode = null;
  client.slot = -1;
  if (!room) return;

  room.clients.delete(client.id);
  if (prevSlot >= 0 && prevSlot < 4 && room.slots[prevSlot]?.id === client.id) {
    room.slots[prevSlot] = null;
  }

  if (room.clients.size === 0) {
    rooms.delete(room.code);
    return;
  }

  let migrated = false;
  if (room.hostId === client.id) {
    const nextHost = room.slots.find(Boolean) || Array.from(room.clients.values())[0];
    if (nextHost) {
      room.hostId = nextHost.id;
      migrated = true;
    }
  }

  broadcastRoom(room, {
    type: 'PEER_LEFT',
    clientId: client.id,
    slot: prevSlot,
    name: client.name,
    reason,
    newHostId: room.hostId,
    migrated
  });
  broadcastRoom(room, serializeRoomState(room));
}

function handleClientMessage(client, msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'PING') {
    sendWsJson(client, { type: 'PONG', clientTs: msg.clientTs || Date.now(), serverTs: Date.now() });
    return;
  }

  if (msg.type === 'CREATE_ROOM') {
    leaveCurrentRoom(client, 'switched');
    const code = makeRoomCode();
    const cleanName = String(msg.playerName || 'Commander').trim().slice(0, 18) || 'Commander';
    const prefSlot = Number.isInteger(msg.preferredSlot) && msg.preferredSlot >= 0 && msg.preferredSlot < 4 ? msg.preferredSlot : 0;

    client.name = cleanName;
    client.roomCode = code;
    client.slot = prefSlot;

    const room = {
      code,
      hostId: client.id,
      slots: [null, null, null, null],
      clients: new Map([[client.id, client]]),
      missionConfig: {
        selectedObjective: msg.missionConfig?.selectedObjective || 'polar_volatiles',
        selectedScenario: msg.missionConfig?.selectedScenario || 'standard',
        selectedVehicle: msg.missionConfig?.selectedVehicle || 'sls'
      },
      createdAt: Date.now()
    };
    room.slots[prefSlot] = client;
    rooms.set(code, room);

    sendWsJson(client, {
      type: 'ROOM_JOINED',
      clientId: client.id,
      roomCode: code,
      slot: prefSlot,
      isHost: true
    });
    broadcastRoom(room, serializeRoomState(room));
    return;
  }

  if (msg.type === 'JOIN_ROOM') {
    const code = String(msg.roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      sendWsJson(client, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: `Room "${code}" not found.` });
      return;
    }
    leaveCurrentRoom(client, 'switched');

    let assignedSlot = -1;
    const prefSlot = Number.isInteger(msg.preferredSlot) && msg.preferredSlot >= 0 && msg.preferredSlot < 4 ? msg.preferredSlot : -1;
    if (prefSlot !== -1 && !room.slots[prefSlot]) {
      assignedSlot = prefSlot;
    } else {
      assignedSlot = room.slots.findIndex(s => s === null);
    }

    if (assignedSlot === -1) {
      sendWsJson(client, { type: 'ERROR', code: 'ROOM_FULL', message: `Room ${code} is already full (4/4 crew).` });
      return;
    }

    const cleanName = String(msg.playerName || `Crew-${assignedSlot + 1}`).trim().slice(0, 18) || `Crew-${assignedSlot + 1}`;
    client.name = cleanName;
    client.roomCode = code;
    client.slot = assignedSlot;
    room.slots[assignedSlot] = client;
    room.clients.set(client.id, client);

    sendWsJson(client, {
      type: 'ROOM_JOINED',
      clientId: client.id,
      roomCode: code,
      slot: assignedSlot,
      isHost: false
    });
    broadcastRoom(room, serializeRoomState(room));
    return;
  }

  if (msg.type === 'LEAVE_ROOM') {
    leaveCurrentRoom(client, 'left');
    sendWsJson(client, { type: 'ROOM_LEFT' });
    return;
  }

  const room = client.roomCode ? rooms.get(client.roomCode) : null;
  if (!room) {
    sendWsJson(client, { type: 'ERROR', code: 'NOT_IN_ROOM', message: 'Join or create a room first.' });
    return;
  }

  if (msg.type === 'CLAIM_SLOT') {
    const targetSlot = Number(msg.slot);
    if (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot > 3) return;
    const occupant = room.slots[targetSlot];
    if (occupant && occupant.id !== client.id) {
      sendWsJson(client, { type: 'ERROR', code: 'SLOT_TAKEN', message: `P${targetSlot + 1} is already claimed by ${occupant.name}.` });
      return;
    }
    if (client.slot >= 0 && client.slot < 4 && room.slots[client.slot]?.id === client.id) {
      room.slots[client.slot] = null;
    }
    room.slots[targetSlot] = client;
    client.slot = targetSlot;
    sendWsJson(client, { type: 'SLOT_ASSIGNED', slot: targetSlot });
    broadcastRoom(room, serializeRoomState(room));
    return;
  }

  if (msg.type === 'UPDATE_CONFIG') {
    if (client.id !== room.hostId) return;
    const cfg = msg.missionConfig || msg;
    room.missionConfig = {
      selectedObjective: cfg.selectedObjective || room.missionConfig.selectedObjective,
      selectedScenario: cfg.selectedScenario || room.missionConfig.selectedScenario,
      selectedVehicle: cfg.selectedVehicle || room.missionConfig.selectedVehicle
    };
    broadcastRoom(room, serializeRoomState(room));
    return;
  }

  if (msg.type === 'GUEST_INPUT' || msg.type === 'GUEST_ACTION') {
    const hostClient = room.clients.get(room.hostId);
    if (!hostClient || hostClient.id === client.id) return;
    sendWsJson(hostClient, {
      ...msg,
      fromClientId: client.id,
      slot: client.slot
    });
    return;
  }

  if (msg.type === 'HOST_SNAPSHOT' || msg.type === 'HOST_EVENT') {
    if (client.id !== room.hostId) return;
    broadcastRoom(room, {
      ...msg,
      fromClientId: client.id
    }, client.id);
  }
}

function attachSocketHandlers(socket) {
  const client = {
    id: makeId(6),
    name: 'Crew',
    roomCode: null,
    slot: -1,
    socket,
    closed: false,
    alive: true,
    buffer: Buffer.alloc(0),
    fragOpcode: 0,
    fragChunks: []
  };
  allClients.add(client);

  const cleanup = (reason = 'disconnect') => {
    if (client.closed) return;
    client.closed = true;
    allClients.delete(client);
    leaveCurrentRoom(client, reason);
    if (!socket.destroyed) socket.destroy();
  };

  socket.on('data', (chunk) => {
    client.alive = true;
    client.buffer = Buffer.concat([client.buffer, chunk]);
    if (client.buffer.length > MAX_PAYLOAD_BYTES * 2) {
      cleanup('buffer_overflow');
      return;
    }

    while (client.buffer.length >= 2) {
      const b0 = client.buffer[0];
      const b1 = client.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (client.buffer.length < 4) break;
        payloadLen = client.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (client.buffer.length < 10) break;
        const bigLen = client.buffer.readBigUInt64BE(2);
        if (bigLen > BigInt(MAX_PAYLOAD_BYTES)) {
          cleanup('payload_too_large');
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      if (payloadLen > MAX_PAYLOAD_BYTES) {
        cleanup('payload_too_large');
        return;
      }

      const maskLen = masked ? 4 : 0;
      if (client.buffer.length < offset + maskLen + payloadLen) break;

      const maskKey = masked ? client.buffer.subarray(offset, offset + 4) : null;
      offset += maskLen;
      const rawPayload = client.buffer.subarray(offset, offset + payloadLen);
      client.buffer = client.buffer.subarray(offset + payloadLen);

      const payload = Buffer.allocUnsafe(payloadLen);
      if (masked && maskKey) {
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i & 3];
        }
      } else {
        rawPayload.copy(payload);
      }

      if (opcode === 0x8) {
        sendWsControl(client, 0x8);
        cleanup('closed');
        return;
      }
      if (opcode === 0x9) {
        sendWsControl(client, 0xa, payload);
        continue;
      }
      if (opcode === 0xa) {
        client.alive = true;
        continue;
      }

      if (opcode === 0x0) {
        client.fragChunks.push(payload);
        if (fin) {
          const full = Buffer.concat(client.fragChunks);
          const textOp = client.fragOpcode;
          client.fragChunks = [];
          client.fragOpcode = 0;
          if (textOp === 0x1) {
            try {
              handleClientMessage(client, JSON.parse(full.toString('utf8')));
            } catch {
              // Ignore malformed JSON frames
            }
          }
        }
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (!fin) {
          client.fragOpcode = opcode;
          client.fragChunks = [payload];
        } else if (opcode === 0x1) {
          try {
            handleClientMessage(client, JSON.parse(payload.toString('utf8')));
          } catch {
            // Ignore malformed JSON frames
          }
        }
      }
    }
  });

  socket.on('error', () => cleanup('socket_error'));
  socket.on('close', () => cleanup('socket_close'));
  socket.on('end', () => cleanup('socket_end'));

  sendWsJson(client, { type: 'HELLO', clientId: client.id });
}

function serveStaticFile(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      clients: allClients.size,
      uptimeSec: Math.round(process.uptime())
    }));
    return;
  }

  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const safePath = path.resolve(ROOT_DIR, relPath);
  if (!safePath.startsWith(ROOT_DIR + path.sep) && safePath !== ROOT_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Block direct access to server internals over static HTTP
  if (relPath.startsWith('server/') || relPath.startsWith('.git')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

const server = http.createServer(serveStaticFile);

server.on('upgrade', (req, socket) => {
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  const wsKey = req.headers['sec-websocket-key'];
  if (upgrade !== 'websocket' || !wsKey) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(String(wsKey).trim() + WS_MAGIC_GUID)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));

  socket.setNoDelay(true);
  attachSocketHandlers(socket);
});

const heartbeatTimer = setInterval(() => {
  for (const client of allClients) {
    if (!client.alive) {
      client.socket.destroy();
      continue;
    }
    client.alive = false;
    sendWsControl(client, 0x9);
  }
}, 25000);
heartbeatTimer.unref?.();

server.listen(PORT, HOST, () => {
  console.log(`[Orbital Kitchen WS Relay] Listening on http://${HOST}:${PORT} (ws://localhost:${PORT})`);
});
