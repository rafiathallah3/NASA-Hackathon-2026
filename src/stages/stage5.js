import { state, getScenario, getVehicle } from '../state.js';

const STORAGE_KEY = 'orbital_kitchen_mission_history_v1';

function loadMissionHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMissionRecord(record) {
  try {
    const list = loadMissionHistory();
    list.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 6)));
    return list.slice(0, 6);
  } catch {
    return [record];
  }
}

export function startStage5Debrief(onRestart, onBackToMenu) {
  state.stage = 'STAGE5';
  document.getElementById('btn-next').style.display = 'none';
  document.getElementById('btn-skip').style.display = 'none';

  const scen = getScenario();
  const veh = getVehicle();
  const stars = state.score >= 1200 ? '⭐⭐⭐' : state.score >= 750 ? '⭐⭐' : '⭐';

  const record = {
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    scenario: scen.name,
    vehicle: veh.name,
    score: state.score,
    science: Math.round(state.telemetry.science),
    mass: `${state.telemetry.mass}/${state.telemetry.maxMass}kg`,
    samples: (state.rover?.hasSample ? 1 : 0) + (state.rover2?.hasSample ? 1 : 0)
  };
  const history = saveMissionRecord(record);

  const timelineRows = state.blackBoxEvents.slice(-8).map(ev => `
    <div class="timeline-item">
      <span><b style="color:${ev.kind === 'good' ? '#4ade80' : ev.kind === 'warn' ? '#fbbf24' : '#38bdf8'}">${ev.stage}</b> &middot; ${ev.text}</span>
    </div>
  `).join('');

  const historyRows = history.map((h, i) => `
    <div class="timeline-item">
      <span>#${i + 1} ${h.scenario}</span>
      <span><b>${h.score}⭐</b> &middot; ${h.science} sci</span>
    </div>
  `).join('');

  const modal = document.getElementById('modal');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h1>${stars} Mission Complete</h1>
    <p class="sub">${scen.name} &middot; ${veh.name} &middot; Touchdown: <b>${state.landingGrade}</b> &middot; Recovery: <b>${state.reentry.grade}</b></p>

    <div class="debrief-kpis">
      <div class="kpi-card"><small>Score</small><b>${state.score}⭐</b></div>
      <div class="kpi-card"><small>Science</small><b>${Math.round(state.telemetry.science)} pts</b></div>
      <div class="kpi-card"><small>Mass</small><b>${state.telemetry.mass}/${state.telemetry.maxMass}kg</b></div>
      <div class="kpi-card"><small>Budget Left</small><b>$${state.telemetry.budget}M</b></div>
      <div class="kpi-card"><small>Samples</small><b>${record.samples}/2</b></div>
    </div>

    <div class="config-row">
      <div class="config-panel">
        <h3>Black Box Flight Log</h3>
        <div class="timeline-list">${timelineRows || '<div class="timeline-item">No events logged.</div>'}</div>
      </div>
      <div class="config-panel">
        <h3>Saved Runs</h3>
        <div class="timeline-list">${historyRows}</div>
      </div>
    </div>

    <div class="modal-actions">
      <button id="btn-export-report" class="btn-secondary" type="button">Export JSON</button>
      <button id="btn-change-design" class="btn-secondary" type="button">Change Setup</button>
      <button id="btn-fly-again" class="btn-play" type="button">Fly New Mission</button>
    </div>
  `;

  document.getElementById('btn-fly-again').addEventListener('click', onRestart);
  document.getElementById('btn-change-design').addEventListener('click', onBackToMenu);
  document.getElementById('btn-export-report').addEventListener('click', () => {
    const report = {
      mission: scen.name,
      launchVehicle: veh.name,
      score: state.score,
      telemetry: state.telemetry,
      shippedModules: state.shippedModules,
      landingGrade: state.landingGrade,
      reentryGrade: state.reentry.grade,
      blackBoxEvents: state.blackBoxEvents
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbital-kitchen-mission-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  modal.classList.remove('hidden');
}
