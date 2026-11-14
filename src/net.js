import { state } from './state.js';

const CLIENT_ID = Math.random().toString(36).slice(2);
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
  broadcastNet({ type: 'CLAIM_SLOT', slot });
}

if (netChannel) {
  netChannel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.sender === CLIENT_ID) return;

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

// Periodically prune stale remote slot indicators
setInterval(() => {
  const now = Date.now();
  for (const [slot, info] of remotePeers.entries()) {
    if (now - info.lastSeen > 6000) {
      remotePeers.delete(slot);
      const chip = document.getElementById(`pchip-${slot}`);
      if (chip) chip.classList.remove('remote-claimed');
    }
  }
}, 2500);

window.ORBITAL_NET = {
  clientId: CLIENT_ID,
  exportState: () => ({
    stage: state.stage,
    stageTimer: state.stageTimer,
    score: state.score,
    telemetry: { ...state.telemetry },
    shippedModules: { ...state.shippedModules },
    activeCrewIndex: state.activeCrewIndex,
    coopMode: state.coopMode,
    remoteSlots: Array.from(remotePeers.keys())
  }),
  broadcast: broadcastNet
};
