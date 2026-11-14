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

export const SCENARIOS = {
  standard: {
    id: 'standard',
    name: 'Artemis Mare Tranquillitatis',
    badge: 'STANDARD',
    desc: 'Relaxed untimed hangar build & nominal lunar sample return.',
    budget: 240,
    startFuel: 78,
    startPower: 55,
    startComms: 45,
    orderDrainMul: 0.75,
    eclipseDrainMul: 1.0
  },
  south_pole: {
    id: 'south_pole',
    name: 'South Pole Ice Prospecting',
    badge: 'HARD',
    desc: 'Tighter $190M budget, harsher eclipses, high science demand.',
    budget: 190,
    startFuel: 68,
    startPower: 35,
    startComms: 35,
    orderDrainMul: 1.0,
    eclipseDrainMul: 1.45
  },
  sandbox: {
    id: 'sandbox',
    name: 'MDL Sandbox Trade Lab',
    badge: 'SANDBOX',
    desc: 'Generous $400M budget & mild eclipses for free experimentation.',
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
    name: 'SLS Block 1B Heavy',
    maxMass: 1050,
    cost: 65,
    stabilityBonus: 0.14,
    desc: '1050 kg cap • $65M • High ascent stability'
  },
  commercial: {
    id: 'commercial',
    name: 'Commercial Heavy',
    maxMass: 850,
    cost: 40,
    stabilityBonus: 0.04,
    desc: '850 kg cap • $40M • Balanced cost/payload'
  },
  compact: {
    id: 'compact',
    name: 'Compact Reusable',
    maxMass: 680,
    cost: 22,
    stabilityBonus: -0.08,
    desc: '680 kg cap • $22M • Tight mass margin'
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
  cal_optics:   { name: 'Cal. Optics',  shape: 'optics',  verb: 'Calibrate',  verbColor: '#7c3aed' },
  weld_circuit: { name: 'Solder PCB',   shape: 'circuit', verb: 'Weld',       verbColor: '#0284c7' },
  chg_battery:  { name: 'Li-Ion Cell',  shape: 'battery', verb: 'Charge',     verbColor: '#16a34a' },
  weld_solar:   { name: 'Solar Wing',   shape: 'solar',   verb: 'Weld',       verbColor: '#0284c7' },
  cal_dish:     { name: 'Ka-Band Dish', shape: 'dish',    verb: 'Calibrate',  verbColor: '#7c3aed' },
  chg_tank:     { name: 'Cryo Core',    shape: 'tank',    verb: 'Pressurize', verbColor: '#16a34a' },
  burned:       { name: 'Burned Scrap', shape: 'tank',    verb: 'Scrap',      verbColor: '#ef4444' }
};

export const RECIPES = [
  {
    id: 'sensor_pod',
    title: 'Lunar Spectrometer',
    segment: 'USER SEGMENT',
    segColor: '#0284c7',
    reqs: ['cal_optics', 'weld_circuit'],
    points: 120,
    timeLimit: 55,
    massKg: 95,
    costM: 28,
    telemetry: { power: -35, comms: -15, science: 45, fuel: 0 },
    lesson: 'High science yield (+45) & data draw; costs -35W power & +95 kg.'
  },
  {
    id: 'power_pack',
    title: 'Rover Solar-Battery',
    segment: 'SPACE SEGMENT',
    segColor: '#d97706',
    reqs: ['chg_battery', 'weld_solar'],
    points: 115,
    timeLimit: 55,
    massKg: 110,
    costM: 24,
    telemetry: { power: 130, comms: 0, science: 0, fuel: 0 },
    lesson: 'Supplies +130W bus margin for eclipses & dual rover Wh (+110 kg).'
  },
  {
    id: 'comms_relay',
    title: 'Deep-Space Ka-Relay',
    segment: 'GROUND SEGMENT',
    segColor: '#7c3aed',
    reqs: ['cal_dish', 'weld_circuit'],
    points: 120,
    timeLimit: 55,
    massKg: 75,
    costM: 22,
    telemetry: { power: -25, comms: 110, science: 10, fuel: 0 },
    lesson: 'Boosts +110 Mb/d Ka-band downlink & widens Earth entry corridor.'
  },
  {
    id: 'booster_core',
    title: 'Descent Cryo-Stage',
    segment: 'LAUNCH SEGMENT',
    segColor: '#dc2626',
    reqs: ['chg_tank', 'weld_solar'],
    points: 130,
    timeLimit: 60,
    massKg: 135,
    costM: 32,
    telemetry: { power: 0, comms: 0, science: 0, fuel: 25 },
    lesson: 'Adds +25% lunar descent propellant & stabilizes heavy liftoff.'
  }
];

export const MAP_LAYOUT = [
  ['C:optics', 'C:circuit', '#', 'W', 'W', '.', 'T', '#', 'A', 'A', '#', 'P', 'P', '>'],
  ['C:battery','.',         '.', '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', '>'],
  ['C:solar',  '.',         '.', '#', '.', '.', '.', '#', '.', '.', '#', '#', '.', '>'],
  ['C:dish',   '.',         '.', '#', '.', '.', '.', '.', '.', '.', '.', '.', '.', '#'],
  ['C:tank',   '.',         '.', '.', '.', '.', '.', '#', '.', '.', '.', '.', '.', '#'],
  ['#',        '.',         '.', '#', '#', '.', '.', '#', '#', '.', '.', '.', '.', 'X'],
  ['#',        'F',         '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '#'],
  ['#',        '#',         '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#', '#']
];
