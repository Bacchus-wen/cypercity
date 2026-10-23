// Atmosphere system: night sky (overcast deck lit by city glow), height/distance fog with neon inscatter,
// procedural neon-city PMREM environment, weak cool ambient, lightning response, light-shaft helper.
// Post-processing lives in src/engine/PostFX.js (also owned by this workstream).
import * as THREE from 'three/webgpu';
import { U, SKY, backgroundNode, paintedBackgroundNode, fogNodeFn, hazeColor } from './atmo.js';
import { TOD_PRESET } from '../../engine/timeOfDay.js';
import { ANIME } from '../../engine/AnimeLook.js';
import { buildEnvironment } from './environment.js';
import { createLightShaft } from './lightShaft.js';

const BASE = {
  envIntensity: 0.3,
  hemi: 0.12,
};

export default {
  async init(ctx) {
    const { scene, renderer } = ctx;

    // time-of-day preset (restyle): haze / sky colours, painted sky, ambient, sun - applied before the PMREM
    // environment is rendered, which samples the same haze function
    const T = TOD_PRESET;
    if (T) {
      for (const [k, val] of Object.entries(T.atmo)) if (U[k] && val?.isVector3) U[k].value.copy(val);
      U.cloudCover.value = T.atmo.cloudCover;
      const S = T.sky;
      for (const k of ['cloudShadow', 'cloudBody', 'cloudLight', 'outline', 'outlineInner']) SKY[k].value.copy(S[k]);
      SKY.stars.value = S.stars;
      SKY.bodyDir.value.copy(S.body.dir).normalize(); SKY.bodyColor.value.copy(S.body.color); SKY.bodySize.value = S.body.size;
      SKY.bodyGlow.value.copy(S.body.glow); SKY.bodyIsSun.value = S.body.kind === 'sun' ? 1 : 0;
    }
    scene.background = null;
    scene.backgroundNode = T ? paintedBackgroundNode() : backgroundNode();
    scene.fogNode = fogNodeFn();
    if (ANIME) U.fogDensity.value *= T ? T.atmo.fogDensityMul : 0.55; // anime look: less veil over the distance
    BASE.envIntensity = T ? T.env : BASE.envIntensity;
    BASE.hemi = T ? T.hemi.intensity : BASE.hemi;

    try {
      scene.environment = buildEnvironment(renderer);
      scene.environmentIntensity = BASE.envIntensity;
    } catch (e) {
      console.warn('[atmosphere] environment PMREM failed', e);
    }

    // weak cool sky / dark warm ground ambient
    this.hemi = new THREE.HemisphereLight(T ? T.hemi.sky : 0x4a5a9a, T ? T.hemi.ground : 0x1a1020, BASE.hemi);
    this.hemi.name = 'atmo.hemi';
    scene.add(this.hemi);
    // low sun (dusk preset): no shadow map, the cel terminator gives the lit / unlit split
    if (T?.sun) {
      this.sun = new THREE.DirectionalLight(T.sun.color, T.sun.intensity);
      this.sun.name = 'atmo.sun';
      this.sun.position.copy(T.sun.dir).multiplyScalar(500);
      this.sun.target.position.set(0, 0, 0);
      scene.add(this.sun, this.sun.target);
    }

    this.ctx = ctx;
    // debug: ?atmoflash=0.8 forces a lightning flash level (for tuning screenshots)
    this.forceFlash = parseFloat(new URLSearchParams(location.search).get('atmoflash') || '0');
    this.flash = 0;
    ctx.api.atmosphere = {
      fogColor: U.fogColor,
      fogDensity: U.fogDensity,
      uniforms: U,
      hazeColor,
      lightning: 0,
      createLightShaft: (opts) => createLightShaft(opts),
    };

    if (typeof location !== 'undefined' && location.search.includes('atmotest')) {
      const { buildTestScene } = await import('./testScene.js');
      buildTestScene(ctx);
      console.log('[atmosphere] atmotest scene enabled');
    }
  },

  update(dt, t, ctx) {
    const w = ctx.weather || {};
    // cloud drift with wind
    const wind = w.wind || { x: 0.6, y: -0.25 };
    U.cloudOffset.value.x += wind.x * dt * 0.0018;
    U.cloudOffset.value.y += wind.y * dt * 0.0018;
    U.rain.value = w.rain ?? 1;

    // lightning: weather system sets w.lightning (0..1). Fast attack, short decay, flickery.
    const target = this.forceFlash ? this.forceFlash : (w.lightning || 0);
    this.flash = target > this.flash ? target : Math.max(target, this.flash - dt * 6);
    const f = this.flash;
    U.lightning.value = f * 1.6;
    ctx.api.atmosphere.lightning = f;
    ctx.scene.environmentIntensity = BASE.envIntensity * (1 + f * 3);
    if (this.hemi) {
      this.hemi.intensity = BASE.hemi * (1 + f * 8);
    }
  },
};
