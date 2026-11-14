import { state } from './state.js';

let audioCtx = null;

export function playTone(freq, type = 'sine', dur = 0.11, vol = 0.1) {
  if (state.muted) return;
  try {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    // AudioContext blocked or unavailable
  }
}

export function playSuccessChord() {
  playTone(587, 'triangle', 0.13, 0.13);
  setTimeout(() => playTone(880, 'triangle', 0.22, 0.13), 110);
}
