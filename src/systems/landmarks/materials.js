import * as THREE from 'three/webgpu';
import {
  texture, uv, positionWorld, normalWorld, mx_noise_float, vec2, vec3, vec4, float, mix, smoothstep, uniform,
  normalMap, color, clamp, max, min, abs, fract, floor, sin, hash, time, step, dot, normalize, Fn,
} from 'three/tsl';
import { artPath } from '../restyleArt.js';

// Shared uniforms for landmark materials (updated from ctx.weather each frame)
export const U = {
  wet: uniform(1.0),
  lightning: uniform(0.0),
};

const T = 'textures/landmarks/';

export async function loadTextures(ctx) {
  const a = ctx.assets;
  const names = ['concrete', 'stonewall', 'bark'];
  const out = {};
  await Promise.all(names.flatMap((n) => [
    a.texture(T + n + '.png', { srgb: true }).then((t) => (out[n] = t)),
    a.texture(T + n + '_n.png', { srgb: false }).then((t) => (out[n + '_n'] = t)),
    a.texture(T + n + '_r.png', { srgb: false }).then((t) => (out[n + '_r'] = t)),
  ]).concat([
    a.texture(T + 'blossom_cards_a.png', { srgb: true }).then((t) => (out.blossom = t)),
    a.texture(artPath(T + 'holo_ads.png'), { srgb: true }).then((t) => (out.ads = t)),
    a.texture(artPath(T + 'holo_ads2.png'), { srgb: true }).then((t) => (out.ads2 = t)),
    a.texture(artPath(T + 'holo_ads3.png'), { srgb: true }).then((t) => (out.ads3 = t)),
    a.texture(T + 'petals_a.png', { srgb: true }).then((t) => (out.petals = t)),
    a.texture(T + 'wood_slats.png', { srgb: true }).then((t) => (out.wood = t)),
    a.texture(T + 'wood_slats_n.png', { srgb: false }).then((t) => (out.wood_slats_n = t)),
    a.texture(T + 'wood_slats_r.png', { srgb: false }).then((t) => (out.wood_slats_r = t)),
  ]));
  for (const k of ['blossom', 'ads', 'ads2', 'ads3', 'petals']) if (out[k]) { out[k].wrapS = out[k].wrapT = THREE.ClampToEdgeWrapping; }
  return out;
}

// Generic wet PBR surface using world-projected UVs (geometry uv in meters / uvScale).
// opts: map,nmap,rmap textures; tint [r,g,b]; uvScale (multiplier on uv); normalScale; macro (0..1 strength);
// streaks (vertical rain stains); roughMul; wetRough (roughness when soaked, upward faces)
export function surface(tex, opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial();
  const s = opts.uvScale ?? 1;
  const uvn = uv().mul(s);
  const tint = vec3(...(opts.tint || [1, 1, 1]));
  const pw = positionWorld;
  const macro = mx_noise_float(pw.mul(opts.macroFreq ?? 0.045)).mul(0.5).add(0.5);
  const macro2 = mx_noise_float(pw.mul(0.21).add(13.1)).mul(0.5).add(0.5);
  let alb = tex.map ? texture(tex.map, uvn).rgb : vec3(0.5);
  // second decorrelated sample at different scale breaks tiling
  if (tex.map && opts.detail !== false) {
    const alb2 = texture(tex.map, uvn.mul(0.37).add(vec2(0.31, 0.77))).rgb;
    alb = mix(alb, alb2, smoothstep(0.35, 0.65, macro2).mul(0.5));
  }
  const macroAmt = float(opts.macro ?? 0.5);
  let col = alb.mul(tint).mul(mix(float(1), mix(0.55, 1.25, macro), macroAmt));
  // vertical rain streaks / grime on vertical faces
  const vert = float(1).sub(abs(normalWorld.y));
  if (opts.streaks !== false) {
    const sk = mx_noise_float(vec3(pw.x.add(pw.z).mul(2.3), pw.y.mul(0.12), 1.7)).mul(0.5).add(0.5);
    col = col.mul(mix(float(1), mix(0.55, 1.05, sk), vert.mul(opts.streaks ?? 0.7)));
  }
  const wet = U.wet;
  const up = clamp(normalWorld.y, 0, 1);
  // wet darkening
  col = col.mul(mix(float(1), float(opts.wetDark ?? 0.62), wet));
  m.colorNode = col;
  const baseR = tex.rmap ? texture(tex.rmap, uvn).r.mul(opts.roughMul ?? 1) : float(opts.rough ?? 0.8);
  const soak = wet.mul(mix(float(opts.wetVert ?? 0.45), float(1), up)).mul(mix(0.6, 1.0, macro2));
  m.roughnessNode = clamp(mix(baseR, baseR.mul(0.3).add(opts.wetRough ?? 0.06), soak), 0.03, 1);
  m.metalnessNode = float(opts.metal ?? 0);
  if (tex.nmap) {
    m.normalNode = normalMap(texture(tex.nmap, uvn), vec2(opts.normalScale ?? 1, opts.normalScale ?? 1));
  }
  if (opts.emissive) m.emissiveNode = opts.emissive;
  return m;
}

// Painted / bare metal without textures, with procedural grime
export function metal(opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial();
  const pw = positionWorld;
  const n = mx_noise_float(pw.mul(opts.freq ?? 0.8)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(pw.mul(6.0)).mul(0.5).add(0.5);
  const c = vec3(...(opts.color || [0.2, 0.2, 0.22]));
  m.colorNode = c.mul(mix(0.6, 1.15, n)).mul(mix(0.85, 1.05, n2)).mul(mix(float(1), 0.75, U.wet));
  const r = opts.rough ?? 0.45;
  m.roughnessNode = clamp(mix(float(r), float(r * 0.45), U.wet).add(n2.sub(0.5).mul(0.2)), 0.05, 1);
  m.metalnessNode = float(opts.metal ?? 0.85);
  return m;
}

export function emissiveMat(rgb, intensity = 3) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = vec3(0.02);
  m.roughnessNode = float(0.4);
  m.metalnessNode = float(0);
  m.emissiveNode = vec3(...rgb).mul(intensity);
  return m;
}

export function basicEmissive(rgb, intensity = 3) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = vec3(...rgb).mul(intensity);
  return m;
}
