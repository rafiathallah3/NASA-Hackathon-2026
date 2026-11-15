export const LOGICAL_W = 1120;
export const LOGICAL_H = 620;

export const SHIP_W = 1880;
export const SHIP_H = 980;
export const LUNAR_W = 2400;
export const LUNAR_H = 1350;

export const COLS = 14;
export const ROWS = 8;
export const TILE = 68;
export const GRID_X = (LOGICAL_W - COLS * TILE) / 2;
export const GRID_Y = 58;

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
    timeLimit: 55,
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
    timeLimit: 55,
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
    timeLimit: 55,
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
    timeLimit: 60,
    massKg: 135,
    costM: 32,
    telemetry: { power: 0, comms: 0, science: 0, fuel: 25 },
    lesson: 'Adds 25% descent propellant and steadies Stage 1B liftoff.'
  }
];

export const MAP_LAYOUT = [
  ['#',         'C:optics', 'C:circuit', 'W', 'W', '#', 'T', '#', 'A', 'A', '#', 'P', 'P', '>'],
  ['C:battery', '.',        '.',         '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', '>'],
  ['C:solar',   '.',        '.',         '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', '>'],
  ['C:dish',    '.',        '.',         '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '#'],
  ['C:tank',    '.',        '.',         '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', '#'],
  ['F',         '.',        '.',         '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', 'X'],
  ['#',         '.',        '.',         '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '#'],
  ['#',         '#',        '#',         '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#']
];
