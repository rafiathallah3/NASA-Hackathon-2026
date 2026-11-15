import { state } from './state.js';

let audioCtx = null;
let bgMusic = null;
let musicDucked = false;
let musicStarted = false;

const MUSIC_VOL_NORMAL = 0.24;
const MUSIC_VOL_DUCKED = 0.1;

function applyMusicState() {
  if (!bgMusic) return;
  bgMusic.muted = Boolean(state.muted);
  bgMusic.volume = musicDucked ? MUSIC_VOL_DUCKED : MUSIC_VOL_NORMAL;
}

function ensureBackgroundMusic() {
  if (bgMusic || typeof document === 'undefined') return bgMusic;
  const audio = document.createElement('audio');
  audio.loop = true;
  audio.preload = 'auto';

  const ogg = document.createElement('source');
  ogg.src = 'Assets/music/exports/space-asteroids.ogg';
  ogg.type = 'audio/ogg';

  const mp3 = document.createElement('source');
  mp3.src = 'Assets/music/exports/space-asteroids.mp3';
  mp3.type = 'audio/mpeg';

  audio.appendChild(ogg);
  audio.appendChild(mp3);
  bgMusic = audio;
  applyMusicState();
  return bgMusic;
}

export function startBackgroundMusic() {
  const audio = ensureBackgroundMusic();
  if (!audio) return;
  musicStarted = true;
  applyMusicState();
  if (audio.paused) {
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Autoplay blocked until next user gesture
    }
  }
}

export function syncMusicMute() {
  const audio = ensureBackgroundMusic();
  if (!audio) return;
  applyMusicState();
  if (!state.muted && musicStarted && audio.paused) {
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Ignore playback error if gesture required
    }
  }
}

export function setMusicDuck(ducked) {
  musicDucked = Boolean(ducked);
  applyMusicState();
}

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
