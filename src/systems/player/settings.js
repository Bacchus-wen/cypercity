// Persistent user settings (localStorage). Quality preset is consumed by the engine via ?q=<preset>.
const KEY = 'nk.settings.v1';
export const QUALITY_PRESETS = ['low', 'medium', 'high', 'ultra'];

const DEFAULTS = {
  quality: 'ultra',
  fov: 70,
  sensitivity: 1.0,
  invertY: false,
  headBob: true,
  cameraSway: true,
  minimapRotate: true,
  hud: true,
  tod: 'dusk', // restyle time of day (dusk | night), applied by a reload (index.html reads duskline.tod)
};

export class Settings extends EventTarget {
  constructor(engineQuality) {
    super();
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
    this.values = { ...DEFAULTS, ...stored };
    // The engine already booted with ?q= (or its default); reflect the active preset.
    this.activeQuality = engineQuality || 'ultra';
    if (!new URLSearchParams(location.search).get('q') && !stored.quality) this.values.quality = this.activeQuality;
    this.activeTod = new URLSearchParams(location.search).get('tod') || 'dusk';
    this.values.tod = this.activeTod === 'night' ? 'night' : 'dusk';
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* private mode */ }
    try { localStorage.setItem('nk.quality', this.values.quality); } catch { /* ignore */ }
    this.dispatchEvent(new CustomEvent('change', { detail: { key: k, value: v } }));
  }
  get qualityPending() { return this.values.quality !== this.activeQuality; }
  get todPending() { return this.values.tod !== this.activeTod; }
  applyTodReload() {
    try { localStorage.setItem('duskline.tod', this.values.tod); } catch { /* ignore */ }
    const u = new URL(location.href);
    u.searchParams.set('tod', this.values.tod);
    location.replace(u.toString());
  }
  applyQualityReload() {
    const u = new URL(location.href);
    u.searchParams.set('q', this.values.quality);
    location.replace(u.toString());
  }
}
