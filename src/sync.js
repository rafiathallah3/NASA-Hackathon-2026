import { RECIPES, MULTIPLAYER_CONFIG } from './config.js';
import { state } from './state.js';
import { lookKey, sanitizeLook } from './avatar-data.js';
import { prewarmCrewSheets } from './avatar.js';
import {
  netState,
  isWsMultiplayer,
  isWsHost,
  isWsGuest,
  isHumanSlotInWs,
  getMyWsSlot,
  sendGuestKeys,
  broadcastHostSnapshot,
  broadcastHostEvent
} from './net.js';

const TRACKED_KEY_CODES = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyE', 'KeyF', 'KeyQ',
  'ShiftLeft', 'ShiftRight',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'Enter'
];

const guestInputs = [{}, {}, {}, {}];
let lastSnapshotSentAt = 0;
let lastInputSentAt = 0;
let lastSentKeySig = '';
let lastBlackBoxSentCount = 0;

export function setGuestKeys(slot, keysObj) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return;
  guestInputs[slot] = keysObj && typeof keysObj === 'object' ? { ...keysObj } : {};
}

export function clearGuestInputs(slot = null) {
  if (typeof slot === 'number' && slot >= 0 && slot <= 3) {
    guestInputs[slot] = {};
    return;
  }
  for (let i = 0; i < 4; i++) guestInputs[i] = {};
}

export function resetSyncTracking() {
  clearGuestInputs();
  lastSnapshotSentAt = 0;
  lastInputSentAt = 0;
  lastSentKeySig = '';
  lastBlackBoxSentCount = 0;
}

export function getSlotKeys(slot) {
  if (!isWsMultiplayer()) return state.keys;
  if (slot === getMyWsSlot()) return state.keys;
  if (isHumanSlotInWs(slot)) return guestInputs[slot] || {};
  return {};
}

export function isAnyHumanKey(code) {
  if (state.keys[code]) return true;
  if (!isWsMultiplayer()) return false;
  for (let s = 0; s < 4; s++) {
    if (s === getMyWsSlot()) continue;
    if (isHumanSlotInWs(s) && guestInputs[s]?.[code]) return true;
  }
  return false;
}

export function isAnyGroupKey(slots, code) {
  if (!isWsMultiplayer()) return Boolean(state.keys[code]);
  const mySlot = getMyWsSlot();
  if (slots.includes(mySlot) && state.keys[code]) return true;
  for (const s of slots) {
    if (s === mySlot) continue;
    if (isHumanSlotInWs(s) && guestInputs[s]?.[code]) return true;
  }
  return false;
}

export function hasHumanInSlots(slots) {
  if (!isWsMultiplayer()) return false;
  return slots.some(s => isHumanSlotInWs(s));
}

export function captureTrackedKeys() {
  const out = {};
  for (const code of TRACKED_KEY_CODES) {
    if (state.keys[code]) out[code] = true;
  }
  return out;
}

export function maybeSendGuestInputs(nowMs = performance.now()) {
  if (!isWsGuest()) return;
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return;
  const captured = captureTrackedKeys();
  const sig = TRACKED_KEY_CODES.map(c => (captured[c] ? '1' : '0')).join('');
  const minInterval = 1000 / (MULTIPLAYER_CONFIG?.inputHz || 25);
  if (sig !== lastSentKeySig || nowMs - lastInputSentAt >= minInterval) {
    lastSentKeySig = sig;
    lastInputSentAt = nowMs;
    sendGuestKeys(captured);
  }
}

export function buildHostSnapshot() {
  const snap = {
    stage: state.stage,
    stageTimer: state.stageTimer,
    elapsedStage1: state.elapsedStage1,
    score: state.score,
    shippedCount: state.shippedCount,
    shippedModules: { ...state.shippedModules },
    selectedObjective: state.selectedObjective,
    selectedScenario: state.selectedScenario,
    selectedVehicle: state.selectedVehicle,
    currentCML: state.currentCML,
    scienceAuditPassed: state.scienceAuditPassed,
    paused: state.paused,
    dilemma: state.dilemma,
    dilemmaMeta: state.dilemma && state.dilemmaMeta ? { ...state.dilemmaMeta } : null,
    missionChoices: { ...state.missionChoices },
    telemetry: { ...state.telemetry },
    landingGrade: state.landingGrade,
    sampleCollected: state.sampleCollected,
    samplesCollectedCount: state.samplesCollectedCount,
    sampleYieldText: state.sampleYieldText,
    crew: Array.isArray(state.crew) ? state.crew : null
  };

  if (state.blackBoxEvents.length > lastBlackBoxSentCount) {
    snap.blackBoxDelta = state.blackBoxEvents.slice(lastBlackBoxSentCount);
    snap.blackBoxStartIdx = lastBlackBoxSentCount;
    lastBlackBoxSentCount = state.blackBoxEvents.length;
  }

  if (state.stage === 'TRANSITION' && state.transition) {
    snap.transition = {
      kind: state.transition.kind,
      badge: state.transition.badge,
      title: state.transition.title,
      subtitle: state.transition.subtitle,
      nextStage: state.transition.nextStage,
      elapsed: state.transition.elapsed,
      duration: state.transition.duration
    };
  } else if (state.stage === 'STAGE1') {
    snap.stage1 = {
      players: state.players.map(p => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        angle: Math.round(p.angle * 100) / 100,
        holding: p.holding ? { ...p.holding, parts: p.holding.parts ? [...p.holding.parts] : undefined, touchedBy: p.holding.touchedBy ? [...p.holding.touchedBy] : undefined } : null,
        walk: Math.round((p.walk || 0) * 10) / 10,
        dashTimer: p.dashTimer || 0
      })),
      stations: state.stations.map(s => ({
        id: s.id,
        item: s.item ? { ...s.item, parts: s.item.parts ? [...s.item.parts] : undefined, touchedBy: s.item.touchedBy ? [...s.item.touchedBy] : undefined } : null,
        progress: Math.round((s.progress || 0) * 1000) / 1000,
        onFire: Boolean(s.onFire),
        fireProg: Math.round((s.fireProg || 0) * 100) / 100,
        traysCount: s.traysCount || 0,
        hasExtinguisher: Boolean(s.hasExtinguisher)
      })),
      orders: state.orders.map(o => ({
        uid: o.uid,
        recipeId: o.recipe?.id,
        remaining: Math.round((o.remaining || 0) * 10) / 10,
        maxTime: o.maxTime || 80
      })),
      thrownItems: state.thrownItems,
      floorItems: state.floorItems,
      flyingDeliveries: state.flyingDeliveries,
      pinnedRecipeId: state.pinnedRecipeId || null,
      stage1Combo: state.stage1Combo || 0,
      stage1ComboTimer: state.stage1ComboTimer || 0,
      tutorial: state.tutorial ? { ...state.tutorial } : null
    };
  } else if (state.stage === 'STAGE1B') {
    snap.ascent = { ...state.ascent };
  } else if (state.stage === 'STAGE2') {
    const os = state.orbitState || {};
    snap.stage2 = {
      ctrlPlayers: state.ctrlPlayers.map(p => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        angle: Math.round(p.angle * 100) / 100,
        walk: Math.round((p.walk || 0) * 10) / 10,
        hasWrench: Boolean(p.hasWrench)
      })),
      consoles: state.consoles.map(c => ({
        id: c.id,
        alert: Boolean(c.alert),
        botProg: Math.round((c.botProg || 0) * 100) / 100
      })),
      doors: (state.stage2Doors || []).map(d => ({
        id: d.id,
        locked: Boolean(d.locked),
        lockTimer: Math.round((d.lockTimer || 0) * 10) / 10,
        overrideProg: Math.round((d.overrideProg || 0) * 100) / 100,
        overriding: Boolean(d.overriding)
      })),
      wrenchAvailable: Boolean(state.wrenchRack?.available),
      orbitState: {
        progress: os.progress || 0,
        stageDuration: os.stageDuration || 64,
        battery: os.battery ?? 60,
        shipIntegrity: os.shipIntegrity ?? 100,
        dataBuffer: os.dataBuffer ?? 30,
        inEclipse: Boolean(os.inEclipse),
        inGroundCone: Boolean(os.inGroundCone),
        inScanZone: Boolean(os.inScanZone),
        tasksCompleted: os.tasksCompleted || 0,
        minTasksRequired: os.minTasksRequired || 4,
        overtimeHold: os.overtimeHold || 0,
        arrivalReady: Boolean(os.arrivalReady),
        arrivalHold: os.arrivalHold || 0,
        surgeFlashTimer: os.surgeFlashTimer || 0,
        interferenceTimer: os.interferenceTimer || 0,
        impacts: os.impacts || []
      },
      mccResult: { ...state.mccResult }
    };
  } else if (state.stage === 'STAGE3A') {
    snap.lander = { ...state.lander };
  } else if (state.stage === 'STAGE3B') {
    snap.stage3b = {
      rover: { ...state.rover },
      rover2: { ...state.rover2 },
      landerPad: {
        padX: state.lander.padX,
        padY: state.lander.padY,
        hardLandingPenalty: Boolean(state.lander.hardLandingPenalty),
        shockRepaired: Boolean(state.lander.shockRepaired)
      },
      scienceNodes: state.scienceNodes.map(sn => ({ id: sn.id, scanned: Boolean(sn.scanned) })),
      evaTasks: state.evaTasks.map(ev => ({ id: ev.id, progress: ev.progress || 0, done: Boolean(ev.done) })),
      stage3BLaunch: state.stage3BLaunch ? { ...state.stage3BLaunch } : { countdown: 0, launching: false }
    };
  } else if (state.stage === 'STAGE3C') {
    snap.stage3c = {
      moonLaunch: { ...state.moonLaunch },
      padX: state.lander?.padX || 430,
      padY: state.lander?.padY || 730
    };
  } else if (state.stage === 'STAGE4') {
    snap.reentry = { ...state.reentry };
  }

  return snap;
}

export function maybeBroadcastHostSnapshot(nowMs = performance.now(), force = false) {
  if (!isWsHost()) return;
  if (state.stage === 'MENU' || state.stage === 'STAGE5') return;
  const minInterval = 1000 / (MULTIPLAYER_CONFIG?.snapshotHz || 18);
  if (!force && nowMs - lastSnapshotSentAt < minInterval) return;
  lastSnapshotSentAt = nowMs;
  broadcastHostSnapshot(buildHostSnapshot());
}

export function emitHostEffect(effectName, payload = {}) {
  if (!isWsHost()) return;
  broadcastHostEvent(effectName, payload);
}

export function applyHostSnapshot(snap, hooks = {}) {
  if (!snap || !isWsGuest()) return;

  if (snap.selectedObjective) state.selectedObjective = snap.selectedObjective;
  if (snap.selectedScenario) state.selectedScenario = snap.selectedScenario;
  if (snap.selectedVehicle) state.selectedVehicle = snap.selectedVehicle;

  if (Array.isArray(snap.crew) && snap.crew.length === 4) {
    const nextCrew = snap.crew.map((c, idx) => ({
      index: idx,
      role: c.role,
      kind: c.kind,
      callsign: c.callsign,
      look: sanitizeLook(c.look)
    }));
    const nextSig = nextCrew.map(c => `${c.callsign}:${lookKey(c.look)}`).join('|');
    const curSig = Array.isArray(state.crew) && state.crew.length === 4
      ? state.crew.map(c => `${c.callsign}:${lookKey(c.look)}`).join('|')
      : '';
    if (nextSig !== curSig) {
      state.crew = nextCrew;
      prewarmCrewSheets(state.crew);
    }
    state.crew.forEach((c, idx) => {
      if (state.players[idx]) {
        state.players[idx].callsign = c.callsign;
        state.players[idx].look = c.look;
      }
      if (state.ctrlPlayers[idx]) {
        state.ctrlPlayers[idx].callsign = c.callsign;
        state.ctrlPlayers[idx].look = c.look;
      }
    });
  }

  const mySlot = getMyWsSlot();
  let stageJustChanged = false;
  // Ensure Guest initializes local stage structures before applying snapshot
  if (snap.stage && snap.stage !== state.stage) {
    stageJustChanged = true;
    if (typeof hooks.onStageMismatch === 'function') {
      hooks.onStageMismatch(snap.stage, snap);
    }
  }

  if (typeof snap.stageTimer === 'number') {
    if (stageJustChanged || Math.abs(snap.stageTimer - (state.stageTimer || 0)) > 0.35) {
      state.stageTimer = snap.stageTimer;
    }
  }
  state.elapsedStage1 = snap.elapsedStage1 ?? state.elapsedStage1;
  state.score = snap.score ?? state.score;
  state.shippedCount = snap.shippedCount ?? state.shippedCount;
  if (snap.shippedModules) state.shippedModules = { ...snap.shippedModules };
  state.currentCML = snap.currentCML ?? state.currentCML;
  state.scienceAuditPassed = snap.scienceAuditPassed ?? state.scienceAuditPassed;
  state.paused = Boolean(snap.paused);
  state.dilemma = snap.dilemma ?? null;
  state.dilemmaMeta = snap.dilemma && snap.dilemmaMeta ? { ...snap.dilemmaMeta } : null;
  if (snap.missionChoices) state.missionChoices = { ...snap.missionChoices };
  if (snap.telemetry) state.telemetry = { ...snap.telemetry };
  if (snap.landingGrade) state.landingGrade = snap.landingGrade;
  if (typeof snap.sampleCollected === 'boolean') state.sampleCollected = snap.sampleCollected;
  if (typeof snap.samplesCollectedCount === 'number') state.samplesCollectedCount = snap.samplesCollectedCount;
  if (typeof snap.sampleYieldText === 'string') state.sampleYieldText = snap.sampleYieldText;

  if (Array.isArray(snap.blackBoxDelta) && typeof snap.blackBoxStartIdx === 'number') {
    for (let i = 0; i < snap.blackBoxDelta.length; i++) {
      const targetIdx = snap.blackBoxStartIdx + i;
      if (targetIdx < state.blackBoxEvents.length) {
        state.blackBoxEvents[targetIdx] = snap.blackBoxDelta[i];
      } else if (targetIdx === state.blackBoxEvents.length) {
        state.blackBoxEvents.push(snap.blackBoxDelta[i]);
      }
    }
  }

  if (snap.stage === 'TRANSITION' && snap.transition) {
    if (!state.transition) {
      state.transition = { ...snap.transition, particles: [], onComplete: null };
    } else {
      state.transition.kind = snap.transition.kind;
      state.transition.badge = snap.transition.badge;
      state.transition.title = snap.transition.title;
      state.transition.subtitle = snap.transition.subtitle;
      state.transition.nextStage = snap.transition.nextStage;
      state.transition.duration = snap.transition.duration;
      if (stageJustChanged || Math.abs((snap.transition.elapsed || 0) - (state.transition.elapsed || 0)) > 0.35) {
        state.transition.elapsed = snap.transition.elapsed;
      }
    }
  } else if (snap.stage === 'STAGE1' && snap.stage1) {
    const s1 = snap.stage1;
    if (Array.isArray(s1.players)) {
      s1.players.forEach((sp, i) => {
        const pl = state.players[i];
        if (!pl) return;
        const firstSync = typeof pl.netTx !== 'number';
        pl.netTx = sp.x;
        pl.netTy = sp.y;
        pl.netAngle = sp.angle;
        pl.holding = sp.holding;
        if (i !== mySlot) {
          pl.facingX = sp.facingX;
          pl.facingY = sp.facingY;
          pl.dashTimer = sp.dashTimer;
        }
        const snapThresh = i === mySlot ? 90 : 160;
        if (firstSync || stageJustChanged || Math.hypot(sp.x - pl.x, sp.y - pl.y) > snapThresh) {
          pl.x = sp.x;
          pl.y = sp.y;
          pl.angle = sp.angle;
        }
      });
    }
    if (Array.isArray(s1.stations)) {
      s1.stations.forEach((ss, i) => {
        const st = state.stations[i];
        if (st) {
          st.item = ss.item;
          st.progress = ss.progress;
          st.onFire = ss.onFire;
          st.fireProg = ss.fireProg;
          st.traysCount = ss.traysCount;
          st.hasExtinguisher = ss.hasExtinguisher;
        }
      });
    }
    if (Array.isArray(s1.orders)) {
      const prevSig = state.orders.map(o => `${o.uid}:${o.recipe?.id}`).join('|');
      state.orders = s1.orders.map(o => ({
        uid: o.uid,
        recipe: RECIPES.find(r => r.id === o.recipeId) || RECIPES[0],
        remaining: o.remaining,
        maxTime: o.maxTime
      }));
      const nextSig = state.orders.map(o => `${o.uid}:${o.recipe?.id}`).join('|');
      if (prevSig !== nextSig && typeof hooks.onOrdersChanged === 'function') {
        hooks.onOrdersChanged();
      } else if (typeof hooks.onOrdersTick === 'function') {
        hooks.onOrdersTick();
      }
    }
    if (Array.isArray(s1.thrownItems)) state.thrownItems = s1.thrownItems;
    if (Array.isArray(s1.floorItems)) state.floorItems = s1.floorItems;
    if (Array.isArray(s1.flyingDeliveries)) state.flyingDeliveries = s1.flyingDeliveries;
    state.pinnedRecipeId = s1.pinnedRecipeId ?? null;
    state.stage1Combo = s1.stage1Combo ?? 0;
    state.stage1ComboTimer = s1.stage1ComboTimer ?? 0;
    if (s1.tutorial) state.tutorial = { ...s1.tutorial };
  } else if (snap.stage === 'STAGE1B' && snap.ascent) {
    if (!state.ascent) {
      state.ascent = { ...snap.ascent };
    } else {
      const a = state.ascent;
      const sa = snap.ascent;
      const firstSync = typeof a.netRocketY !== 'number';
      const curRocketY = a.rocketY;
      const curPadScroll = a.padScroll;
      const curTilt = a.tilt;
      const curThrust = a.thrust;
      const curTargetThrust = a.targetThrust;
      Object.assign(a, sa);
      a.netRocketY = sa.rocketY;
      a.netPadScroll = sa.padScroll;
      a.netTilt = sa.tilt;
      a.netThrust = sa.thrust;
      a.netTargetThrust = sa.targetThrust;
      if (!firstSync && !stageJustChanged) {
        a.rocketY = curRocketY;
        a.padScroll = curPadScroll;
        a.tilt = curTilt;
        a.thrust = curThrust;
        a.targetThrust = curTargetThrust;
      }
    }
  } else if (snap.stage === 'STAGE2' && snap.stage2) {
    const s2 = snap.stage2;
    if (Array.isArray(s2.ctrlPlayers)) {
      s2.ctrlPlayers.forEach((sp, i) => {
        const pl = state.ctrlPlayers[i];
        if (!pl) return;
        const firstSync = typeof pl.netTx !== 'number';
        pl.netTx = sp.x;
        pl.netTy = sp.y;
        pl.netAngle = sp.angle;
        pl.hasWrench = sp.hasWrench;
        const snapThresh = i === mySlot ? 90 : 160;
        if (firstSync || stageJustChanged || Math.hypot(sp.x - pl.x, sp.y - pl.y) > snapThresh) {
          pl.x = sp.x;
          pl.y = sp.y;
          pl.angle = sp.angle;
        }
      });
    }
    if (Array.isArray(s2.consoles)) {
      s2.consoles.forEach(sc => {
        const c = state.consoles.find(item => item.id === sc.id);
        if (c) {
          c.alert = sc.alert;
          c.botProg = sc.botProg;
          if (!c.alert && state.activeMiniGame?.console?.id === c.id) {
            state.activeMiniGame = null;
          }
        }
      });
    }
    if (Array.isArray(s2.doors) && Array.isArray(state.stage2Doors)) {
      s2.doors.forEach(sd => {
        const d = state.stage2Doors.find(item => item.id === sd.id);
        if (d) Object.assign(d, sd);
      });
    }
    if (state.wrenchRack && typeof s2.wrenchAvailable === 'boolean') {
      state.wrenchRack.available = s2.wrenchAvailable;
    }
    if (s2.orbitState) {
      state.orbitState = { ...state.orbitState, ...s2.orbitState };
    }
    if (s2.mccResult) {
      state.mccResult = { ...s2.mccResult };
    }
  } else if (snap.stage === 'STAGE3A' && snap.lander) {
    if (!state.lander) {
      state.lander = { ...snap.lander };
    } else {
      const l = state.lander;
      const sl = snap.lander;
      const firstSync = typeof l.netX !== 'number';
      const curX = l.x;
      const curY = l.y;
      const curZ = l.z;
      const curBtn = l.continueBtnRect;
      Object.assign(l, sl);
      if (curBtn && !sl.continueBtnRect) l.continueBtnRect = curBtn;
      l.netX = sl.x;
      l.netY = sl.y;
      l.netZ = sl.z;
      if (!firstSync && !stageJustChanged && Math.hypot(sl.x - curX, sl.y - curY) <= 120) {
        l.x = curX;
        l.y = curY;
        l.z = curZ;
      }
    }
  } else if (snap.stage === 'STAGE3B' && snap.stage3b) {
    const s3b = snap.stage3b;
    const syncRoverObj = (rv, sr, isMine) => {
      if (!rv || !sr) return;
      const firstSync = typeof rv.netTx !== 'number';
      rv.netTx = sr.x;
      rv.netTy = sr.y;
      rv.netTz = sr.z;
      rv.vx = sr.vx;
      rv.vy = sr.vy;
      rv.vz = sr.vz;
      if (!isMine) {
        rv.facingX = sr.facingX;
        rv.facingY = sr.facingY;
      }
      rv.battery = sr.battery;
      rv.maxBattery = sr.maxBattery;
      rv.hasSample = sr.hasSample;
      rv.sampleStowed = sr.sampleStowed;
      rv.boarded = sr.boarded;
      rv.drilling = sr.drilling;
      rv.drillProgress = sr.drillProgress;
      rv.groundElev = sr.groundElev;
      const snapThresh = isMine ? 110 : 150;
      if (firstSync || stageJustChanged || Math.hypot(sr.x - rv.x, sr.y - rv.y) > snapThresh) {
        rv.x = sr.x;
        rv.y = sr.y;
        rv.z = sr.z;
        rv.facingX = sr.facingX;
        rv.facingY = sr.facingY;
      }
    };
    const myControlsRover2 = (mySlot === 1 || mySlot === 3);
    if (s3b.rover) syncRoverObj(state.rover, s3b.rover, !myControlsRover2);
    if (s3b.rover2) syncRoverObj(state.rover2, s3b.rover2, myControlsRover2);
    if (s3b.landerPad && state.lander) Object.assign(state.lander, s3b.landerPad);
    if (Array.isArray(s3b.scienceNodes)) {
      s3b.scienceNodes.forEach(sn => {
        const target = state.scienceNodes.find(item => item.id === sn.id);
        if (target) target.scanned = sn.scanned;
      });
    }
    if (Array.isArray(s3b.evaTasks)) {
      s3b.evaTasks.forEach(ev => {
        const target = state.evaTasks.find(item => item.id === ev.id);
        if (target) {
          target.progress = ev.progress;
          target.done = ev.done;
        }
      });
    }
    if (s3b.stage3BLaunch) state.stage3BLaunch = { ...s3b.stage3BLaunch };
  } else if (snap.stage === 'STAGE3C' && snap.stage3c) {
    if (snap.stage3c.moonLaunch) {
      if (!state.moonLaunch) {
        state.moonLaunch = { ...snap.stage3c.moonLaunch };
      } else {
        const ml = state.moonLaunch;
        const sml = snap.stage3c.moonLaunch;
        const firstSync = typeof ml.netCapsuleY !== 'number';
        const curCapsuleY = ml.capsuleY;
        const curTilt = ml.tilt;
        const curProgress = ml.progress;
        Object.assign(ml, sml);
        ml.netCapsuleY = sml.capsuleY;
        ml.netTilt = sml.tilt;
        ml.netProgress = sml.progress;
        if (!firstSync && !stageJustChanged) {
          ml.capsuleY = curCapsuleY;
          ml.tilt = curTilt;
          ml.progress = curProgress;
        }
      }
    }
    if (state.lander) {
      state.lander.padX = snap.stage3c.padX;
      state.lander.padY = snap.stage3c.padY;
    }
  } else if (snap.stage === 'STAGE4' && snap.reentry) {
    if (!state.reentry) {
      state.reentry = { ...snap.reentry };
    } else {
      const r = state.reentry;
      const sr = snap.reentry;
      const firstSync = typeof r.netAltitude !== 'number';
      const curAltitude = r.altitude;
      const curPitchAngle = r.pitchAngle;
      const curRollBank = r.rollBank;
      const curHeat = r.heat;
      const curGLoad = r.gLoad;
      const curCapsuleX = r.capsuleX;
      const curCapsuleY = r.capsuleY;
      const curShipX = r.shipX;
      const curHeliX = r.heliX;
      const curHeliY = r.heliY;
      Object.assign(r, sr);
      r.netAltitude = sr.altitude;
      r.netPitchAngle = sr.pitchAngle;
      r.netRollBank = sr.rollBank;
      r.netHeat = sr.heat;
      r.netGLoad = sr.gLoad;
      r.netCapsuleX = sr.capsuleX;
      r.netCapsuleY = sr.capsuleY;
      r.netShipX = sr.shipX;
      r.netHeliX = sr.heliX;
      r.netHeliY = sr.heliY;
      if (!firstSync && !stageJustChanged) {
        r.altitude = curAltitude;
        r.pitchAngle = curPitchAngle;
        r.rollBank = curRollBank;
        r.heat = curHeat;
        r.gLoad = curGLoad;
        r.capsuleX = curCapsuleX;
        r.capsuleY = curCapsuleY;
        r.shipX = curShipX;
        r.heliX = curHeliX;
        r.heliY = curHeliY;
      }
    }
  }

  // Keep Guest's activeCrewIndex aligned with their assigned WS slot
  if (typeof mySlot === 'number' && mySlot >= 0 && mySlot < 4) {
    state.activeCrewIndex = mySlot;
  }

  if (typeof hooks.onAfterApply === 'function') {
    hooks.onAfterApply();
  }
}
