import { state, logBlackBox } from './state.js';
import { playTone } from './audio.js';
import { updateBottomHUD } from './hud.js';

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
  mc.innerHTML = `
    <div style="margin-bottom:6px;font-size:11px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:#38bdf8;">
      ${config.badge}
    </div>
    <h2 style="margin:0 0 6px;">${config.title}</h2>
    <p class="sub" style="margin-bottom:16px;">${config.prompt}</p>
    <div class="config-row" style="margin-bottom:14px;">
      ${config.options.map((opt, idx) => `
        <button type="button" class="opt-btn dilemma-opt" data-idx="${idx}" style="padding:14px 16px;">
          <b style="font-size:14px;color:${opt.accent || '#eef2f8'};">${opt.label}</b>
          <div style="font-size:12px;color:#cbd5e1;margin-top:6px;line-height:1.4;">${opt.trade}</div>
          <small style="margin-top:8px;color:#94a3b8;">Lesson: ${opt.lesson}</small>
        </button>
      `).join('')}
    </div>
  `;

  mc.querySelectorAll('.dilemma-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const picked = config.options[idx];
      modal.classList.add('hidden');
      state.dilemma = null;
      playTone(540 + idx * 90, 'triangle', 0.14, 0.11);
      logBlackBox(config.stageTag, `Decision: ${picked.label} — ${picked.trade}`, idx === 0 ? 'info' : 'good');
      if (onChoose) onChoose(idx);
      updateBottomHUD();
    });
  });
}
