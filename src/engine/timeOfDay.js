// Time-of-day / palette presets of the restyle (anime look only).
//   ?tod=night (default)  rainy night in the Edgerunners S2 palette: neutral slate/navy base, black-white-red bones,
//                         neon as accents instead of a violet wash (the original game is violet-pink)
//   ?tod=dusk             clear dusk after rain: low warm sun in the north-west, damp streets, neon half on
//   ?tod=legacy           the previous violet night (kept for comparison)
// A preset drives the atmosphere (sky / haze / fog / ambient / sun), the anime lighting model (shade, rim, key,
// ink colours), the colour grade, global emissive scales (signs, windows, sign lights) and the initial weather.
// Colours are linear HDR (pre-exposure, pre-AgX). The painted sky (atmo.js paintedSky) follows `sky`.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

const v = (r, g, b) => new THREE.Vector3(r, g, b);
const dirFrom = (azDeg, elDeg) => { // az: 0 = north (-Z), 90 = east (+X)
  const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};

export const PRESETS = {
  night: {
    atmo: {
      fogColor: v(0.034, 0.042, 0.052), midColor: v(0.013, 0.02, 0.034), zenithColor: v(0.003, 0.005, 0.011),
      glowMagenta: v(0.018, 0.006, 0.012), glowOrange: v(0.075, 0.034, 0.012), glowBlue: v(0.008, 0.022, 0.045),
      groundHaze: v(0.03, 0.032, 0.04), fogDensityMul: 0.5, cloudCover: 0.52,
    },
    sky: {
      cloudShadow: v(0.006, 0.01, 0.019), cloudBody: v(0.016, 0.026, 0.044), cloudLight: v(0.05, 0.075, 0.1),
      outline: v(0.26, 0.42, 0.5), outlineInner: v(0.06, 0.1, 0.13), stars: 1.0,
      body: { dir: dirFrom(20, 27), color: v(1.5, 1.55, 1.6), size: 0.045, glow: v(0.05, 0.07, 0.09), kind: 'moon' },
    },
    hemi: { sky: 0x5a6a80, ground: 0x1c1816, intensity: 0.155 }, // (a touch more ambient: the riverside read murky)
    env: 0.3,
    sun: null,
    anime: {
      shadeTint: v(0.9, 0.94, 1.05), rimColor: v(0.68, 0.84, 1.0), keyColor: v(0.82, 0.86, 1.0), inkColor: v(0.008, 0.008, 0.011),
      rimIntensity: 1.25, keyIntensity: 0.45,
    },
    grade: {
      saturation: 1.12, contrast: 0.6, shadowTint: v(0.0, 0.0, 0.012), highlightTint: v(1.0, 0.99, 0.98), lift: v(0.002, 0.003, 0.004),
    },
    emissive: { neon: 1.0, windows: 1.0, lights: 1.0, fill: 1.0 },
    weather: { rain: 1.0, wetness: 1.0 },
  },
  dusk: {
    atmo: {
      fogColor: v(0.62, 0.36, 0.22), midColor: v(0.3, 0.2, 0.27), zenithColor: v(0.05, 0.08, 0.19),
      glowMagenta: v(0.08, 0.02, 0.05), glowOrange: v(0.55, 0.22, 0.06), glowBlue: v(0.02, 0.04, 0.08),
      groundHaze: v(0.22, 0.15, 0.13), fogDensityMul: 0.42, cloudCover: 0.5,
    },
    sky: {
      cloudShadow: v(0.09, 0.07, 0.12), cloudBody: v(0.2, 0.13, 0.18), cloudLight: v(1.05, 0.52, 0.26),
      outline: v(1.6, 0.95, 0.5), outlineInner: v(0.5, 0.28, 0.18), stars: 0.0,
      body: { dir: dirFrom(-35, 5), color: v(9.0, 5.2, 2.4), size: 0.06, glow: v(1.2, 0.55, 0.2), kind: 'sun' },
    },
    hemi: { sky: 0x7f88a4, ground: 0x5a3a28, intensity: 0.55 },
    env: 0.6,
    sun: { dir: dirFrom(-35, 9), color: new THREE.Color(1.0, 0.6, 0.36), intensity: 1.9 },
    anime: {
      shadeTint: v(0.82, 0.8, 1.02), rimColor: v(1.0, 0.68, 0.42), keyColor: v(1.0, 0.76, 0.56), inkColor: v(0.02, 0.01, 0.018),
      rimIntensity: 1.3, keyIntensity: 0.55,
    },
    grade: {
      saturation: 1.15, contrast: 0.58, shadowTint: v(0.0, -0.008, 0.02), highlightTint: v(1.03, 0.98, 0.94), lift: v(0.004, 0.002, 0.004),
    },
    emissive: { neon: 0.55, windows: 0.35, lights: 0.12, fill: 0.2 },
    weather: { rain: 0.0, wetness: 0.5 },
  },
};

// (ANIME is re-derived here instead of imported: AnimeLook.js imports this module)
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const ANIME = qs.get('look') === 'anime';
const requested = qs.get('tod');
export const TOD_NAME = !ANIME ? 'legacy' : requested === 'legacy' ? 'legacy' : PRESETS[requested] ? requested : 'night';
export const TOD_PRESET = PRESETS[TOD_NAME] || null;

// global emissive scales read by the sign, facade and sign-light code (1 = unchanged)
export const TOD = {
  neon: uniform(TOD_PRESET?.emissive.neon ?? 1),
  windows: uniform(TOD_PRESET?.emissive.windows ?? 1),
  lights: TOD_PRESET?.emissive.lights ?? 1,
  fill: uniform(TOD_PRESET?.emissive.fill ?? 0), // restyled facades: cool night wash (buildings/materials.js)
};
