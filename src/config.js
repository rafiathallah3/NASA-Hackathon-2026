export const LOGICAL_W = 1120;
export const LOGICAL_H = 620;

export const SHIP_W = 1880;
export const SHIP_H = 980;
export const LUNAR_W = 2400;
export const LUNAR_H = 1350;

export const COLS = 18;
export const ROWS = 8;
export const TILE = 56;
export const GRID_X = (LOGICAL_W - COLS * TILE) / 2;
export const GRID_Y = 160;

export const CREW_ROSTER = [
  { id: 'P1', role: 'Launch',  color: '#3b82f6', visor: '#93c5fd', segment: 'Launch Segment' },
  { id: 'P2', role: 'Space',   color: '#f97316', visor: '#fed7aa', segment: 'Space Segment' },
  { id: 'P3', role: 'Science', color: '#a855f7', visor: '#e9d5ff', segment: 'User/Science Segment' },
  { id: 'P4', role: 'Ground',  color: '#10b981', visor: '#a7f3d0', segment: 'Ground Segment' }
];

export const SCIENCE_OBJECTIVES = {
  polar_volatiles: {
    id: 'polar_volatiles',
    title: 'South Pole Volatiles & Cryo-Ice',
    targetLocation: 'Shackleton Crater Rim',
    scienceDomain: 'Planetary Volatiles & ISRU',
    summary: 'Prospect hydrogen deposits and cryo-core water ice in shadowed polar craters.',
    description: 'Map hydrogen deposits and drill subsurface cryo-ice samples in permanently shadowed regions near Shackleton Crater Rim.',
    requiredModules: ['sensor_pod', 'power_pack'],
    minCryoSamples: 1,
    dualSampleBonus: 60,
    baselineBonus: { scienceMultiplier: 1.5, label: 'ppm H2O Eq.' },
    failurePenalty: 'Missing Spectrometer or Solar-Battery (-35% science)'
  },
  mantle_geochem: {
    id: 'mantle_geochem',
    title: 'Procellarum Basalt & Mantle Geochem',
    targetLocation: 'Mare Tranquillitatis',
    scienceDomain: 'Lunar Petrology & Volcanism',
    summary: 'Drill high-titanium basalt cores to trace ancient lunar mantle evolution.',
    description: 'Collect high-titanium basalt samples at Mare Tranquillitatis to reconstruct lunar thermal history and volcanic stratigraphy.',
    requiredModules: ['sensor_pod', 'comms_relay'],
    minCryoSamples: 1,
    dualSampleBonus: 60,
    baselineBonus: { scienceMultiplier: 1.35, label: 'Ti/Fe Basalt %' },
    failurePenalty: 'Missing Spectrometer or Ka-Relay (-30% science)'
  },
  heliophysics_space_weather: {
    id: 'heliophysics_space_weather',
    title: 'Cislunar Space Weather & Plasma',
    targetLocation: 'Highland Transit Ridge',
    scienceDomain: 'Heliophysics & Solar Wind',
    summary: 'Measure solar energetic particle fluxes and regolith plasma telemetry.',
    description: 'Monitor real-time solar energetic particle (SEP) fluxes and cislunar plasma conditions from Highland Transit Ridge.',
    requiredModules: ['comms_relay', 'power_pack'],
    minCryoSamples: 1,
    dualSampleBonus: 50,
    baselineBonus: { scienceMultiplier: 1.4, label: 'SEP/Plasma Flux' },
    failurePenalty: 'Missing Ka-Relay or Solar-Battery (-30% science)'
  }
};

export const CML_LEVELS = {
  1: { level: 1, name: 'Cocktail Napkin', label: 'Initial Concept', minRequirementsMet: false },
  2: { level: 2, name: 'Initial Feasibility', label: 'Science Need Identified', minRequirementsMet: false },
  3: { level: 3, name: 'Trade Space', label: 'Architecture & Vehicle Selected', minRequirementsMet: false },
  4: { level: 4, name: 'Point Design', label: 'Baseline Requirements Verified', minRequirementsMet: true }
};

export const SCENARIOS = {
  standard: {
    id: 'standard',
    name: 'Artemis Tranquility',
    badge: 'STANDARD',
    desc: 'Free-build hangar and standard lunar return.',
    budget: 240,
    startFuel: 78,
    startPower: 55,
    startComms: 45,
    orderDrainMul: 0.75,
    eclipseDrainMul: 1.0
  },
  south_pole: {
    id: 'south_pole',
    name: 'South Pole Ice',
    badge: 'HARD',
    desc: '$190M budget, heavy eclipses, tighter landing pad.',
    budget: 190,
    startFuel: 68,
    startPower: 35,
    startComms: 35,
    orderDrainMul: 1.0,
    eclipseDrainMul: 1.45
  },
  sandbox: {
    id: 'sandbox',
    name: 'Open Sandbox',
    badge: 'SANDBOX',
    desc: '$400M budget and mild eclipses for testing builds.',
    budget: 400,
    startFuel: 92,
    startPower: 85,
    startComms: 65,
    orderDrainMul: 0.45,
    eclipseDrainMul: 0.65
  }
};

export const LAUNCH_VEHICLES = {
  sls: {
    id: 'sls',
    name: 'Heavy Block 1B',
    maxMass: 1050,
    cost: 65,
    stabilityBonus: 0.14,
    desc: '1050 kg cap, $65M cost, high ascent stability'
  },
  commercial: {
    id: 'commercial',
    name: 'Commercial Heavy',
    maxMass: 850,
    cost: 40,
    stabilityBonus: 0.04,
    desc: '850 kg cap, $40M cost, balanced mass'
  },
  compact: {
    id: 'compact',
    name: 'Compact Reusable',
    maxMass: 680,
    cost: 22,
    stabilityBonus: -0.08,
    desc: '680 kg cap, $22M cost, low mass limit'
  }
};

export const RAW_ITEMS = {
  optics:  { id: 'optics',  name: 'Optics',    shape: 'optics',  procType: 'calibrate', result: 'cal_optics' },
  circuit: { id: 'circuit', name: 'Circuit',   shape: 'circuit', procType: 'weld',      result: 'weld_circuit' },
  battery: { id: 'battery', name: 'Battery',   shape: 'battery', procType: 'charge',    result: 'chg_battery' },
  solar:   { id: 'solar',   name: 'Solar',     shape: 'solar',   procType: 'weld',      result: 'weld_solar' },
  dish:    { id: 'dish',    name: 'Dish',      shape: 'dish',    procType: 'calibrate', result: 'cal_dish' },
  tank:    { id: 'tank',    name: 'Fuel Tank', shape: 'tank',    procType: 'charge',    result: 'chg_tank' }
};

export const PROC_META = {
  cal_optics:   { rawId: 'optics',  rawName: 'Optics',    name: 'Cal. Optics',  shape: 'optics',  verb: 'Calibrate', verbColor: '#a78bfa' },
  weld_circuit: { rawId: 'circuit', rawName: 'Circuit',   name: 'Solder PCB',   shape: 'circuit', verb: 'Weld',      verbColor: '#38bdf8' },
  chg_battery:  { rawId: 'battery', rawName: 'Battery',   name: 'Li-Ion Cell',  shape: 'battery', verb: 'Charge',    verbColor: '#4ade80' },
  weld_solar:   { rawId: 'solar',   rawName: 'Solar',     name: 'Solar Wing',   shape: 'solar',   verb: 'Weld',      verbColor: '#38bdf8' },
  cal_dish:     { rawId: 'dish',    rawName: 'Dish',      name: 'Ka-Band Dish', shape: 'dish',    verb: 'Calibrate', verbColor: '#a78bfa' },
  chg_tank:     { rawId: 'tank',    rawName: 'Fuel Tank', name: 'Cryo Core',    shape: 'tank',    verb: 'Charge',    verbColor: '#4ade80' },
  burned:       { rawId: null,      rawName: 'Scrap',     name: 'Burned Scrap', shape: 'tank',    verb: 'Scrap',     verbColor: '#ef4444' }
};

export const RECIPES = [
  {
    id: 'sensor_pod',
    title: 'Lunar Spectrometer',
    segment: 'P3 SCIENCE',
    segColor: '#0284c7',
    summary: '+45 Science, 95kg',
    reqs: ['cal_optics', 'weld_circuit'],
    points: 120,
    timeLimit: 80,
    massKg: 95,
    costM: 28,
    telemetry: { power: -35, comms: -15, science: 45, fuel: 0 },
    lesson: 'Adds 45 science and 95 kg mass, uses 35W power.'
  },
  {
    id: 'power_pack',
    title: 'Rover Solar-Battery',
    segment: 'P2 SPACE',
    segColor: '#d97706',
    summary: '+130W Power, 110kg',
    reqs: ['chg_battery', 'weld_solar'],
    points: 115,
    timeLimit: 80,
    massKg: 110,
    costM: 24,
    telemetry: { power: 130, comms: 0, science: 0, fuel: 0 },
    lesson: 'Adds 130W power for Stage 2 eclipses and Stage 3 rovers.'
  },
  {
    id: 'comms_relay',
    title: 'Deep-Space Ka-Relay',
    segment: 'P4 GROUND',
    segColor: '#7c3aed',
    summary: '+110 Comms, 75kg',
    reqs: ['cal_dish', 'weld_circuit'],
    points: 120,
    timeLimit: 80,
    massKg: 75,
    costM: 22,
    telemetry: { power: -25, comms: 110, science: 10, fuel: 0 },
    lesson: 'Adds 110 Mb/d comms and widens Stage 4 entry corridor.'
  },
  {
    id: 'booster_core',
    title: 'Descent Cryo-Stage',
    segment: 'P1 LAUNCH',
    segColor: '#dc2626',
    summary: '+25% Fuel, 135kg',
    reqs: ['chg_tank', 'weld_solar'],
    points: 130,
    timeLimit: 85,
    massKg: 135,
    costM: 32,
    telemetry: { power: 0, comms: 0, science: 0, fuel: 25 },
    lesson: 'Adds 25% descent propellant and steadies Stage 1B liftoff.'
  }
];

// All six raw-material crates form one tight column against the left wall (rows 2-7),
// ordered top-to-bottom to match the machines they feed (Weld -> Calibrate -> Charge).
// Each crate sprite is fitted to exactly one tile in drawStage1 so neighbours never cover
// each other's name label. The locker/welder gap at (0,4) is a solid blocker.
export const MAP_LAYOUT = [
  ['L',         'L', 'L', 'L', 'L', 'W', 'W', 'A', 'A', 'P', 'P', 'T', '.', '.', 'F', '.', '>', 'L'],
  ['.',         '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '>', 'L'],
  ['C:circuit', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['C:solar',   '.', '.', '.', '#', '#', '#', '#', '.', '.', '#', '#', '#', '#', '.', '#', '#', '#'],
  ['C:optics',  '.', '.', '.', '#', '.', '.', '#', '.', '.', '#', '.', '.', '#', '.', '.', '.', '#'],
  ['C:dish',    '.', '.', '.', '#', 'G', 'G', '#', '.', '.', '#', '.', '#', '#', '.', '.', '.', 'X'],
  ['C:battery', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', 'L', 'L'],
  ['C:tank',    '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', 'L', 'L']
];

// Pixel-aligned Stage 1 Hangar coordinates mapped from 2752x1536 art to 1120x620 logical canvas
export const STAGE1_LAYOUT = {
  floor: {
    topY: 202,
    bottomY: 604,
    leftWallTopX: 68,
    leftWallTopY: 236,
    leftWallBottomX: 8,
    leftWallBottomY: 620,
    rightWallTopX: 1074,
    rightWallTopY: 200,
    rightWallBottomX: 1112,
    rightWallBottomY: 620
  },
  obstacles: [
    { id: 'lockers',  x: 64,  y: 104, w: 250, h: 134 },
    { id: 'elevator', x: 936, y: 474, w: 184, h: 146 }
  ],
  tables: {
    left_u:   { dx: 258, dy: 306, dw: 258, dh: 193, splitY: 446 },
    center_u: { dx: 598, dy: 306, dw: 256, dh: 193, splitY: 444 },
    right_l:  { dx: 926, dy: 302, dw: 168, dh: 124 },
    props: {
      beacon:  { x: 266, y: 286, w: 22, h: 28 },
      arm:     { x: 332, y: 268, w: 46, h: 48 },
      monitor: { x: 794, y: 278, w: 36, h: 40 }
    }
  },
  stations: [
    // Left-wall crates (hugging left wall outside the diagonal yellow floor hazard stripe)
    { id: 'crate_optics',  type: 'CRATE', crateItem: 'optics',  vx: 68,  vy: 218, vw: 70, vh: 73, x: 72,  y: 230, w: 64, h: 58, r: 2, c: 0, label: 'Optics' },
    { id: 'crate_battery', type: 'CRATE', crateItem: 'battery', vx: 58,  vy: 286, vw: 72, vh: 75, x: 62,  y: 298, w: 66, h: 60, r: 3, c: 0, label: 'Battery' },
    { id: 'crate_solar',   type: 'CRATE', crateItem: 'solar',   vx: 48,  vy: 358, vw: 73, vh: 77, x: 52,  y: 370, w: 67, h: 62, r: 4, c: 0, label: 'Solar' },
    { id: 'crate_dish',    type: 'CRATE', crateItem: 'dish',    vx: 38,  vy: 432, vw: 74, vh: 77, x: 42,  y: 444, w: 68, h: 62, r: 5, c: 0, label: 'Dish' },
    { id: 'crate_tank',    type: 'CRATE', crateItem: 'tank',    vx: 28,  vy: 508, vw: 76, vh: 79, x: 32,  y: 520, w: 70, h: 64, r: 6, c: 0, label: 'Fuel Tank' },

    // Circuit crate tucked beside white cabinet
    { id: 'crate_circuit', type: 'CRATE', crateItem: 'circuit', vx: 316, vy: 186, vw: 50, vh: 52, x: 316, y: 192, w: 50, h: 46, r: 0, c: 4, label: 'Circuit' },

    // Back-wall stations (flush against back wall above top yellow hazard stripe)
    { id: 'weld_1',  type: 'W', vx: 368, vy: 172, vw: 82, vh: 68, x: 372, y: 186, w: 76, h: 54, itemX: 409, itemY: 204, r: 0, c: 5,  label: 'WELD' },
    { id: 'weld_2',  type: 'W', vx: 452, vy: 172, vw: 82, vh: 68, x: 456, y: 186, w: 76, h: 54, itemX: 493, itemY: 204, r: 0, c: 6,  label: 'WELD' },
    { id: 'cal_1',   type: 'A', vx: 538, vy: 160, vw: 55, vh: 80, x: 540, y: 184, w: 51, h: 56, itemX: 565, itemY: 210, r: 0, c: 7,  label: 'CAL' },
    { id: 'cal_2',   type: 'A', vx: 593, vy: 160, vw: 55, vh: 80, x: 595, y: 184, w: 51, h: 56, itemX: 620, itemY: 210, r: 0, c: 8,  label: 'CAL' },
    { id: 'chg_1',   type: 'P', vx: 652, vy: 156, vw: 50, vh: 84, x: 654, y: 184, w: 46, h: 56, itemX: 677, itemY: 204, r: 0, c: 9,  label: 'CHARGE' },
    { id: 'chg_2',   type: 'P', vx: 704, vy: 156, vw: 50, vh: 84, x: 706, y: 184, w: 46, h: 56, itemX: 729, itemY: 204, r: 0, c: 10, label: 'CHARGE' },
    { id: 'trays',   type: 'T', vx: 760, vy: 156, vw: 56, vh: 84, x: 762, y: 184, w: 52, h: 56, itemX: 788, itemY: 204, r: 0, c: 11, label: 'TRAYS' },
    { id: 'co2',     type: 'F', vx: 820, vy: 176, vw: 33, vh: 64, x: 820, y: 186, w: 34, h: 54, itemX: 837, itemY: 206, r: 0, c: 14, label: 'CO2' },

    // Upper-right submit conveyors
    { id: 'conv_1',  type: '>', vx: 900, vy: 132, vw: 152, vh: 86, x: 902, y: 170, w: 148, h: 48, itemX: 964, itemY: 184, r: 0, c: 16, label: 'SUBMIT' },
    { id: 'conv_2',  type: '>', vx: 924, vy: 182, vw: 156, vh: 86, x: 926, y: 222, w: 152, h: 46, itemX: 988, itemY: 236, r: 1, c: 16, label: 'SUBMIT' },

    // Left U-Table counters & walkable Swing Gate ('G')
    { id: 'lu_tl', type: '#', x: 258, y: 306, w: 86, h: 46,  itemX: 301, itemY: 320, r: 3, c: 4 },
    { id: 'lu_tm', type: '#', x: 344, y: 306, w: 86, h: 46,  itemX: 387, itemY: 320, r: 3, c: 5 },
    { id: 'lu_tr', type: '#', x: 430, y: 306, w: 86, h: 46,  itemX: 473, itemY: 320, r: 3, c: 7, defaultTray: true },
    { id: 'lu_lm', type: '#', x: 258, y: 352, w: 56, h: 100, itemX: 286, itemY: 394, r: 4, c: 4 },
    { id: 'lu_rm', type: '#', x: 470, y: 352, w: 46, h: 100, itemX: 493, itemY: 394, r: 4, c: 7 },
    { id: 'lu_bl', type: '#', x: 258, y: 452, w: 96, h: 47,  itemX: 306, itemY: 466, r: 5, c: 4 },
    { id: 'lu_br', type: '#', x: 432, y: 452, w: 84, h: 47,  itemX: 474, itemY: 466, r: 5, c: 7 },
    { id: 'lu_g',  type: 'G', x: 354, y: 462, w: 78, h: 37,  r: 5, c: 5 },

    // Center U-Table counters
    { id: 'cu_tl', type: '#', x: 598, y: 306, w: 85,  h: 46, itemX: 640, itemY: 320, r: 3, c: 10, defaultTray: true },
    { id: 'cu_tm', type: '#', x: 683, y: 306, w: 85,  h: 46, itemX: 725, itemY: 320, r: 3, c: 11 },
    { id: 'cu_tr', type: '#', x: 768, y: 306, w: 86,  h: 46, itemX: 811, itemY: 320, r: 3, c: 13 },
    { id: 'cu_lm', type: '#', x: 598, y: 352, w: 52,  h: 98, itemX: 624, itemY: 394, r: 4, c: 10 },
    { id: 'cu_lb', type: '#', x: 598, y: 450, w: 52,  h: 49, itemX: 624, itemY: 466, r: 5, c: 10 },
    { id: 'cu_rm', type: '#', x: 804, y: 352, w: 50,  h: 98, itemX: 829, itemY: 394, r: 4, c: 13 },
    { id: 'cu_br', type: '#', x: 744, y: 450, w: 110, h: 49, itemX: 799, itemY: 466, r: 5, c: 12 },

    // Right L-Table counters
    { id: 'rl_tl', type: '#', x: 926,  y: 302, w: 62, h: 60,  itemX: 957,  itemY: 320, r: 3, c: 15 },
    { id: 'rl_tr', type: '#', x: 988,  y: 302, w: 58, h: 60,  itemX: 1017, itemY: 320, r: 3, c: 16 },
    { id: 'rl_r',  type: '#', x: 1046, y: 302, w: 48, h: 124, itemX: 1070, itemY: 342, r: 4, c: 17 },

    // Scrap Bin tucked below right_l's right leg above the elevator stairs
    { id: 'scrap', type: 'X', vx: 1052, vy: 400, vw: 42, vh: 66, x: 1054, y: 428, w: 40, h: 38, itemX: 1074, itemY: 440, r: 5, c: 17, label: 'SCRAP' }
  ]
};
