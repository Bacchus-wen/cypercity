// Audio workstream: fully procedural soundscape (no samples). Buffers are synthesized at load time in a Web Worker
// (synth.js recipes), the AudioContext starts on the first user gesture, and the soundscape follows the camera.
// Inert and silent in shot mode. Exposes ctx.api.audio = { setVolume, getVolume, mute, unmute, toggleMute,
// setMusic, toggleMusic, isMuted, musicOn, started, context }.
import { AudioCore } from './core.js';
import { Soundscape } from './soundscape.js';

const PREF_KEY = 'nk.audio.v1';
const MUSIC_LEVEL = 0.2;

const S = {};

function loadPrefs() {
  try { return { volume: 0.8, muted: false, music: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { volume: 0.8, muted: false, music: true }; }
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs)); } catch { /* private mode */ } }

function noopApi() {
  const f = () => {};
  return { setVolume: f, getVolume: () => 0, mute: f, unmute: f, toggleMute: f, setMusic: f, toggleMusic: f, isMuted: true, musicOn: false, started: false, context: null, play: f };
}

function applyLevels(fade = 0.15) {
  const c = S.core;
  if (!c?.ac) return;
  c.set(c.master.gain, S.prefs.volume, fade);
  c.set(c.out.gain, S.prefs.muted ? 0 : 1, 0.05);
  c.set(c.music.gain, S.prefs.music ? MUSIC_LEVEL : 0, 1.5);
}

function startGeneration() {
  const onMsg = (d) => {
    if (d.type === 'buffer') S.core.addRaw(d.name, { channels: d.channels, sampleRate: d.sampleRate, loop: d.loop });
    else if (d.type === 'error') console.warn('[audio] synth failed:', d.name, d.message);
    else if (d.type === 'done') { S.genDone = true; S.worker?.terminate(); S.worker = null; }
  };
  try {
    S.worker = new Worker(new URL('./synth.worker.js', import.meta.url), { type: 'module' });
    S.worker.onmessage = (e) => onMsg(e.data);
    S.worker.onerror = (e) => { e.preventDefault?.(); console.warn('[audio] worker error, falling back to main thread', e.message); S.worker = null; mainThreadGeneration(onMsg); };
    S.worker.postMessage({});
  } catch (e) {
    mainThreadGeneration(onMsg);
  }
}

// Fallback: synthesize on the main thread, one recipe per idle slot
async function mainThreadGeneration(onMsg) {
  try {
    const { generate, ORDER } = await import('./synth.js');
    let i = 0;
    const next = () => {
      if (i >= ORDER.length) { onMsg({ type: 'done' }); return; }
      const name = ORDER[i++];
      try { const r = generate(name); onMsg({ type: 'buffer', name, ...r }); } catch (e) { onMsg({ type: 'error', name, message: String(e) }); }
      (window.requestIdleCallback || setTimeout)(next, { timeout: 500 });
    };
    next();
  } catch (e) { console.warn('[audio] synthesis unavailable', e); }
}

function unlock() {
  try {
    const c = S.core;
    if (!c.ac) {
      const ac = c.start();
      if (!ac) return;
      c.master.gain.value = 0;
      S.scape = new Soundscape(c, S.ctx);
      applyLevels(0.6); // fade in
      ac.addEventListener?.('statechange', () => { S.api.started = ac.state === 'running'; });
    }
    if (c.ac.state === 'suspended' && !document.hidden) c.ac.resume().catch(() => {});
  } catch (e) { console.warn('[audio] start failed', e); }
}

export default {
  async init(ctx) {
    if (ctx.isShot) { ctx.api.audio = noopApi(); return; } // screenshot capture: completely inert
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { ctx.api.audio = noopApi(); return; }
    S.ctx = ctx;
    S.core = new AudioCore();
    S.prefs = loadPrefs();
    S._v = new ctx.THREE.Vector3(); S._q = new ctx.THREE.Quaternion(); S._f = new ctx.THREE.Vector3(); S._u = new ctx.THREE.Vector3();

    const api = {
      setVolume(v) { S.prefs.volume = Math.max(0, Math.min(1, +v || 0)); savePrefs(); applyLevels(); },
      getVolume() { return S.prefs.volume; },
      mute(on = true) { S.prefs.muted = !!on; api.isMuted = S.prefs.muted; savePrefs(); applyLevels(); },
      unmute() { api.mute(false); },
      toggleMute() { api.mute(!S.prefs.muted); },
      setMusic(on) { S.prefs.music = !!on; api.musicOn = S.prefs.music; savePrefs(); applyLevels(); },
      toggleMusic() { api.setMusic(!S.prefs.music); },
      isMuted: S.prefs.muted,
      musicOn: S.prefs.music,
      started: false,
      get context() { return S.core.ac; },
      // generic one-shot hook for other systems: play('horn0', { position: {x,y,z}, gain })
      play(name, { position, gain = 1 } = {}) {
        try {
          const c = S.core; if (!c.ac) return;
          let dest = c.exterior;
          if (position) { const p = c.panner(c.exterior, { hrtf: false, ref: 4 }); c.setPos(p, position.x, position.y, position.z); dest = p; }
          c.oneShot(name, dest, { gain });
        } catch { /* never throw into callers */ }
      },
      _debug: { get core() { return S.core; }, get scape() { return S.scape; }, unlock, record: (sec) => S.core.record(sec), get ready() { return S.genDone; } },
    };
    ctx.api.audio = api;
    S.api = api;

    startGeneration();

    const gesture = () => unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) addEventListener(ev, gesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      const ac = S.core.ac; if (!ac) return;
      if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {});
    });
  },

  update(dt, t, ctx) {
    if (!S.core?.ac || !S.scape) return;
    try {
      if (ctx.input?.justPressed?.('KeyM')) S.api.toggleMusic();
      S.scape.update(dt, ctx);
    } catch (e) {
      if (!S.warned) { S.warned = true; console.warn('[audio] update', e); }
    }
  },

  // Listener follows the camera (after player/vehicle systems moved it this frame)
  postUpdate(dt, t, ctx) {
    const c = S.core;
    if (!c?.ac || !S.scape) return;
    try {
      const cam = ctx.camera;
      cam.getWorldPosition(S._v); cam.getWorldQuaternion(S._q);
      S._f.set(0, 0, -1).applyQuaternion(S._q); S._u.set(0, 1, 0).applyQuaternion(S._q);
      const L = c.ac.listener;
      if (L.positionX) {
        L.positionX.value = S._v.x; L.positionY.value = S._v.y; L.positionZ.value = S._v.z;
        L.forwardX.value = S._f.x; L.forwardY.value = S._f.y; L.forwardZ.value = S._f.z;
        L.upX.value = S._u.x; L.upY.value = S._u.y; L.upZ.value = S._u.z;
      } else { L.setPosition(S._v.x, S._v.y, S._v.z); L.setOrientation(S._f.x, S._f.y, S._f.z, S._u.x, S._u.y, S._u.z); }
      S.scape.setListener(S._v);
    } catch (e) {
      if (!S.warnedL) { S.warnedL = true; console.warn('[audio] listener', e); }
    }
  },
};
