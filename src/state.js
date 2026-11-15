import { SCENARIOS, LAUNCH_VEHICLES, SCIENCE_OBJECTIVES, CML_LEVELS, RECIPES } from './config.js';

export const state = {
  stage: 'MENU', // MENU, TRANSITION, STAGE1, STAGE1B, STAGE2, STAGE3A, STAGE3B, STAGE3C, STAGE4, STAGE5
  stageTimer: 0,
  elapsedStage1: 0,
  score: 0,
  shippedCount: 0,
  shippedModules: { sensor_pod: 0, power_pack: 0, comms_relay: 0, booster_core: 0 },

  selectedObjective: 'polar_volatiles',
  currentCML: 2,
  scienceAuditPassed: false,
  scienceAuditLog: [],

  selectedScenario: 'standard',
  selectedVehicle: 'sls',

  telemetry: {
    mass: 380,
    maxMass: 1050,
    budget: 175,
    power: 55,
    comms: 45,
    science: 0,
    fuel: 78
  },

  coopMode: '4P_AI', // '4P_AI' | 'LOCAL_2P' | 'NET_4P' | 'SOLO'
  activeCrewIndex: 0,
  muted: false,
  lastTime: 0,

  // Scene Transition & Decisions
  transition: null,
  tutorial: { active: true, step: 0, paused: true, skipped: false },
  dilemma: null,
  screenShake: 0,
  missionChoices: {},

  // Stage 1A (Untimed Overcooked Assembly Hangar)
  stations: [],
  orders: [],
  players: [],
  flyingDeliveries: [],
  thrownItems: [],
  floorItems: [],
  trayReturnQueue: [],
  floatingTexts: [],
  hangarSparks: [],
  conveyorOffset: 0,
  orderTimer: 0,
  overheatedParts: 0,
  stage1Combo: 0,
  stage1ComboTimer: 0,

  // Stage 1B
  ascent: {},

  // Stage 2 (Multi-Room Cruiser)
  ctrlPlayers: [],
  consoles: [],
  wrenchRack: { x: 420, y: 550, available: true },
  activeMiniGame: null,
  orbitState: {},
  stage2Cam: { x: 0, y: 0 },
  stage2Walls: [],
  stage2Doors: [],
  mccResult: { completed: false, bPlaneMissKm: 120, nominalCapture: false, fuelPenaltyPct: 18, propellantBurnedKg: 0 },

  // Stage 3A / 3B / 3C (Roamable 2.5D Lunar Plain)
  lander: {},
  rover: {},
  rover2: {},
  roverTracks: [],
  lunarParticles: [],
  lunarCraters: [],
  lunarBoulders: [],
  scienceNodes: [],
  evaTasks: [],
  lunarCam: { x: 0, y: 0 },
  landingGrade: 'Nominal',
  sampleCollected: false,
  samplesCollectedCount: 0,
  sampleYieldText: '',
  moonLaunch: {},

  // Stage 4
  reentry: {},

  // Black Box Causal Event Log
  blackBoxEvents: [],
  keys: {}
};

export function getScenario() {
  return SCENARIOS[state.selectedScenario] || SCENARIOS.standard;
}

export function getVehicle() {
  return LAUNCH_VEHICLES[state.selectedVehicle] || LAUNCH_VEHICLES.sls;
}

export function getObjective() {
  return SCIENCE_OBJECTIVES[state.selectedObjective] || SCIENCE_OBJECTIVES.polar_volatiles;
}

export function getCmlLevel(level = state.currentCML) {
  return CML_LEVELS[level] || CML_LEVELS[2];
}

export function auditScienceBaselineRequirements() {
  const objective = getObjective();
  if (!objective) {
    state.scienceAuditPassed = true;
    state.currentCML = 4;
    state.scienceAuditLog = [];
    return { passed: true, missing: [], cml: 4, auditText: 'CML 4 Point Design: Baseline requirements verified.' };
  }

  const missing = objective.requiredModules.filter(
    (req) => !(state.shippedModules?.[req] > 0)
  );
  const passed = missing.length === 0;
  const titleFor = (id) => RECIPES.find((r) => r.id === id)?.title || id;

  state.scienceAuditPassed = passed;
  state.currentCML = passed ? 4 : 3;
  state.scienceAuditLog = passed
    ? [`CML 4 Point Design verified for ${objective.title}: all required payloads built.`]
    : missing.map((mod) => `Missing mandatory payload: ${titleFor(mod)} (${mod}) required for ${objective.title}`);

  const missingLabels = missing.map(titleFor).join(', ');
  const auditText = passed
    ? `CML 4 Point Design: All baseline science requirements met for ${objective.title}!`
    : `CML 3 Trade Warning: Missing ${missingLabels}. ${objective.failurePenalty || 'Mission science yield will be degraded.'}`;

  return {
    passed,
    missing,
    cml: state.currentCML,
    auditText
  };
}

export function logBlackBox(stageTag, text, kind = 'info') {
  state.blackBoxEvents.push({ stage: stageTag, text, kind });
}

export function resetRunState() {
  const scen = getScenario();
  const veh = getVehicle();
  const obj = getObjective();

  state.score = 0;
  state.shippedCount = 0;
  state.shippedModules = { sensor_pod: 0, power_pack: 0, comms_relay: 0, booster_core: 0 };
  state.currentCML = 2;
  state.scienceAuditPassed = false;
  state.scienceAuditLog = [];
  state.overheatedParts = 0;
  state.blackBoxEvents = [];
  state.transition = null;
  state.dilemma = null;
  state.screenShake = 0;
  state.missionChoices = {};
  state.tutorial = {
    active: !state.tutorial?.skipped,
    step: 0,
    paused: !state.tutorial?.skipped,
    skipped: Boolean(state.tutorial?.skipped)
  };

  state.telemetry = {
    mass: 380,
    maxMass: veh.maxMass,
    budget: Math.max(20, scen.budget - veh.cost),
    power: scen.startPower,
    comms: scen.startComms,
    science: 0,
    fuel: scen.startFuel
  };

  state.stageTimer = 0;
  state.elapsedStage1 = 0;
  state.orders = [];
  state.flyingDeliveries = [];
  state.thrownItems = [];
  state.floorItems = [];
  state.trayReturnQueue = [];
  state.floatingTexts = [];
  state.hangarSparks = [];
  state.lunarParticles = [];
  state.roverTracks = [];
  state.orderTimer = 0;
  state.stage1Combo = 0;
  state.stage1ComboTimer = 0;
  state.stage2Cam = { x: 0, y: 0 };
  state.mccResult = {
    completed: false,
    bPlaneMissKm: 120,
    nominalCapture: false,
    fuelPenaltyPct: 18,
    propellantBurnedKg: 0
  };
  state.lunarCam = { x: 0, y: 0 };
  state.landingGrade = 'Nominal';
  state.sampleCollected = false;
  state.samplesCollectedCount = 0;
  state.sampleYieldText = '';

  logBlackBox('PRE-LAUNCH', `${obj.title} (${obj.targetLocation}) • ${scen.name} • ${veh.name} (${veh.maxMass} kg cap, $${state.telemetry.budget}M ops budget)`, 'info');
}
