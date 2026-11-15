import { state, logBlackBox } from './state.js';
import { playTone } from './audio.js';
import { updateBottomHUD } from './hud.js';
import { iconize } from './icons.js';

export function triggerDilemma(config, onChoose) {
  state.dilemma = config.id;
  const modal = document.getElementById('modal');
  const mc = document.getElementById('modal-content');
  if (!modal || !mc) {
    state.dilemma = null;
    if (onChoose) onChoose(0);
    return;
  }

  modal.classList.remove('hidden');
  mc.innerHTML = iconize(`
    <div class="dilemma-badge">${config.badge}</div>
    <h2 style="margin:0 0 8px;">${config.title}</h2>
    <p class="sub" style="margin-bottom:16px;">${config.prompt}</p>
    <div class="config-row" style="margin-bottom:14px;">
      ${config.options.map((opt, idx) => `
        <button type="button" class="opt-btn dilemma-opt" data-idx="${idx}">
          <b style="color:${opt.accent || '#eef1f8'};">${opt.label}</b>
          <div class="dilemma-trade">${opt.trade}</div>
          <small class="dilemma-lesson">Lesson: ${opt.lesson}</small>
        </button>
      `).join('')}
    </div>
  `);

  mc.querySelectorAll('.dilemma-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const picked = config.options[idx];
      modal.classList.add('hidden');
      state.dilemma = null;
      playTone(540 + idx * 90, 'triangle', 0.14, 0.11);
      logBlackBox(config.stageTag, `Decision: ${picked.label}: ${picked.trade}`, idx === 0 ? 'info' : 'good');
      if (onChoose) onChoose(idx);
      updateBottomHUD();
    });
  });
}
