import { SCENARIOS, LAUNCH_VEHICLES } from './config.js';

export const state = {
  stage: 'MENU', // MENU, TRANSITION, STAGE1, STAGE1B, STAGE2, STAGE3A, STAGE3B, STAGE3C, STAGE4, STAGE5
  stageTimer: 0,
  elapsedStage1: 0,
  score: 0,
  shippedCount: 0,
  shippedModules: { sensor_pod: 0, power_pack: 0, comms_relay: 0, booster_core: 0 },

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
  tutorial: { active: true, step: 0, skipped: false },
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

export function logBlackBox(stageTag, text, kind = 'info') {
  state.blackBoxEvents.push({ stage: stageTag, text, kind });
}

export function resetRunState() {
  const scen = getScenario();
  const veh = getVehicle();

  state.score = 0;
  state.shippedCount = 0;
  state.shippedModules = { sensor_pod: 0, power_pack: 0, comms_relay: 0, booster_core: 0 };
  state.overheatedParts = 0;
  state.blackBoxEvents = [];
  state.transition = null;
  state.dilemma = null;
  state.screenShake = 0;
  state.missionChoices = {};
  state.tutorial = { active: !state.tutorial?.skipped, step: 0, skipped: Boolean(state.tutorial?.skipped) };

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
  state.lunarCam = { x: 0, y: 0 };
  state.landingGrade = 'Nominal';
  state.sampleCollected = false;

  logBlackBox('PRE-LAUNCH', `${scen.name} • ${veh.name} (${veh.maxMass} kg cap, $${state.telemetry.budget}M ops budget)`, 'info');
}
