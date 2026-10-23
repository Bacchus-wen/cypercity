import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, texture, mix, smoothstep, exp, max, min, abs, cos, atan, dot, length,
  normalize, select, positionWorld, cameraPosition, output, normalWorldGeometry, floor, fract, sin, time, step, pow,
} from 'three/tsl';
import { createNoiseTexture } from './noiseTex.js';

// Shared atmosphere uniforms + TSL functions (sky, haze color, height fog).
// All colors are LINEAR HDR (pre-exposure, pre-AgX).
const v3 = (r, g, b) => uniform(new THREE.Vector3(r, g, b));

export const U = {
  // Horizon haze color = the color everything fades into (exposed as ctx.api.atmosphere.fogColor)
  fogColor: v3(0.085, 0.058, 0.16),
  midColor: v3(0.045, 0.034, 0.10),
  zenithColor: v3(0.010, 0.011, 0.030),
  glowMagenta: v3(0.12, 0.025, 0.10),
  glowOrange: v3(0.13, 0.05, 0.018),
  glowBlue: v3(0.015, 0.04, 0.12),
  groundHaze: v3(0.07, 0.045, 0.12),
  skyBrightness: uniform(1.0),
  // Fog
  fogDensity: uniform(0.0022), // density at fogBase height (exposed as ctx.api.atmosphere.fogDensity)
  fogFalloff: uniform(0.028),  // exponential height falloff (1/m)
  fogBase: uniform(0.0),
  fogStart: uniform(14.0),    // metres of clear air in front of the camera
  hazeDensity: uniform(0.0002), // height-independent distance haze
  fogMax: uniform(0.985),
  groundGlow: uniform(0.18),   // street-level inscatter boost (neon lit mist)
  rain: uniform(1.0),
  // Clouds / weather
  cloudOffset: uniform(new THREE.Vector2(0, 0)),
  cloudCover: uniform(0.5),
  lightning: uniform(0.0),
  lightningDir: uniform(new THREE.Vector3(0.3, 0.35, -0.9).normalize()),
};

export const noiseTex = createNoiseTexture(256, 4242);

// Haze / light-pollution color in a given world direction (no clouds). Used by sky (horizon) AND fog so
// distant geometry dissolves seamlessly into the sky glow.
export const hazeColor = Fn(([dir]) => {
  const e = dir.y;
  const h = max(e, 0.0);
  const az = atan(dir.x, dir.z.negate()); // 0 = north (-Z), +PI/2 = east (+X)
  const c = mix(U.fogColor, U.midColor, smoothstep(0.0, 0.2, h)).toVar();
  c.assign(mix(c, U.zenithColor, smoothstep(0.1, 0.7, h)));
  const band = exp(h.mul(-7.0));
  const mag = cos(az.sub(0.3)).mul(0.5).add(0.5).pow(2.0);
  const or1 = cos(az.add(1.9)).mul(0.5).add(0.5).pow(3.0);
  const or2 = cos(az.add(0.6)).mul(0.5).add(0.5).pow(10.0);
  const blu = cos(az.sub(1.05)).mul(0.5).add(0.5).pow(8.0).add(cos(az.add(2.4)).mul(0.5).add(0.5).pow(4.0));
  c.addAssign(U.glowMagenta.mul(band).mul(mag.mul(0.75).add(0.25)));
  c.addAssign(U.glowOrange.mul(exp(h.mul(-13.0))).mul(or1.add(or2.mul(0.9))));
  c.addAssign(U.glowBlue.mul(exp(h.mul(-5.0))).mul(blu));
  // below the horizon: glowing ground haze of the city
  c.assign(mix(c, U.groundHaze.add(c.mul(0.5)), float(1).sub(smoothstep(-0.3, 0.0, e))));
  return c.mul(U.skyBrightness);
});

const lightningColor = vec3(0.55, 0.62, 1.0);

// Full sky: overcast low deck lit from below by the city.
export const skyColor = Fn(([dirIn]) => {
  const dir = normalize(dirIn);
  const e = dir.y;
  const h = max(e, 0.0);
  const p = dir.xz.div(h.add(0.07)).mul(0.22).add(U.cloudOffset);
  const n1 = texture(noiseTex, p).r;
  const n2 = texture(noiseTex, p.mul(2.3).add(U.cloudOffset.mul(0.6)).add(vec2(0.31, 0.77))).g;
  const n3 = texture(noiseTex, p.mul(6.1).add(vec2(0.53, 0.19))).b;
  const n = n1.mul(0.6).add(n2.mul(0.3)).add(n3.mul(0.1));
  const dens = smoothstep(U.cloudCover.sub(0.22), U.cloudCover.add(0.25), n);
  const haze = hazeColor(dir);
  // dense cloud = brighter underside (reflects city glow); thin areas show the darker deck above
  const billow = texture(noiseTex, p.mul(3.7).add(vec2(0.11, 0.42))).a;
  const lit = haze.mul(mix(0.35, 1.5, dens)).mul(billow.mul(0.35).add(0.82));
  const fade = smoothstep(0.0, 0.2, h);
  const c = mix(haze, lit, fade).toVar();
  // lightning: lights the cloud deck around the strike direction
  const ld = max(dot(dir, U.lightningDir), 0.0).pow(5.0);
  c.addAssign(lightningColor.mul(U.lightning).mul(ld.mul(2.5).add(0.25)).mul(dens.mul(0.8).add(0.3)));
  return c;
});

// Height + distance fog with neon-tinted inscatter. Assigned to scene.fogNode.
export const fogNodeFn = Fn(() => {
  const P = positionWorld;
  const cam = cameraPosition;
  const V = P.sub(cam);
  const dist = length(V).max(1e-3);
  const dir = V.div(dist);
  const fb = U.fogFalloff;
  const x = fb.mul(V.y);
  const fx = select(abs(x).greaterThan(0.0005), float(1).sub(exp(x.negate())).div(x), float(1).sub(x.mul(0.5)));
  const rainBoost = U.rain.mul(0.35).add(0.75);
  const gd = U.fogDensity.mul(exp(fb.mul(cam.y.sub(U.fogBase)).negate().min(8.0))).mul(rainBoost);
  // patchy drifting mist / rain sheets
  const nP = P.xz.mul(0.0035).add(U.cloudOffset.mul(4.0));
  const patch = texture(noiseTex, nP).r.mul(0.9).add(0.55);
  const fd = max(dist.sub(U.fogStart), 0.0);
  const optical = gd.mul(fd).mul(fx).mul(patch).add(U.hazeDensity.mul(rainBoost).mul(fd));
  const f = float(1).sub(exp(optical.negate())).min(U.fogMax);
  const fdir = normalize(vec3(dir.x, dir.y.mul(0.5), dir.z));
  const col = hazeColor(fdir).toVar();
  col.mulAssign(float(1).add(exp(max(P.y, 0.0).mul(-1 / 35)).mul(U.groundGlow)));
  const ld = max(dot(fdir, U.lightningDir), 0.0).pow(3.0);
  col.addAssign(lightningColor.mul(U.lightning).mul(ld.add(0.15)).mul(0.6));
  return vec4(mix(output.rgb, col, f), output.a);
});

// Background mesh: its normalWorldGeometry is the view direction (unit sphere around the camera).
export const backgroundNode = () => skyColor(normalWorldGeometry);

// ------------------------------------------------------------------------------------------------ painted sky
// Anime / poster sky for the restyle (timeOfDay.js presets): flat graded bands from the horizon haze (U.fogColor,
// so distant geometry still dissolves into it) to the zenith, a field of stars, a moon or sun disc with a soft halo,
// and graphic cloud masses in three flat tones (shadow / body / lit side towards the moon or sun) outlined with a
// thin glowing contour plus a weaker inner contour - the drawn-cloud look of the reference fan art.
export const SKY = {
  cloudShadow: v3(0.006, 0.01, 0.019), cloudBody: v3(0.016, 0.026, 0.044), cloudLight: v3(0.05, 0.075, 0.1),
  outline: v3(0.26, 0.42, 0.5), outlineInner: v3(0.06, 0.1, 0.13), stars: uniform(1.0),
  bodyDir: uniform(new THREE.Vector3(0.3, 0.45, -0.85).normalize()), bodyColor: v3(1.5, 1.55, 1.6), bodySize: uniform(0.045),
  bodyGlow: v3(0.05, 0.07, 0.09), bodyIsSun: uniform(0),
};

const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

export const paintedSky = Fn(([dirIn]) => {
  const dir = normalize(dirIn);
  const e = dir.y;
  const h = max(e, 0.0);
  // graded bands (haze -> mid -> zenith) with a touch of posterisation so the gradient reads as painted steps
  const g1 = smoothstep(0.0, 0.16, h), g2 = smoothstep(0.1, 0.65, h);
  const q1 = floor(g1.mul(5.0)).div(5.0).mul(0.35).add(g1.mul(0.65));
  const q2 = floor(g2.mul(4.0)).div(4.0).mul(0.35).add(g2.mul(0.65));
  const col = mix(mix(U.fogColor, U.midColor, q1), U.zenithColor, q2).toVar();
  col.addAssign(hazeColor(dir).sub(mix(U.fogColor, U.midColor, smoothstep(0.0, 0.2, h))).max(0.0).mul(0.6)); // city glow / sunset band
  // stars (fade near the horizon and behind clouds below)
  const sp = dir.xz.div(h.add(0.35)).mul(160.0);
  const cell = floor(sp);
  const rnd = hash2(cell);
  const off = vec2(hash2(cell.add(7.1)), hash2(cell.add(3.3))).sub(0.5).mul(0.7);
  const dst = length(fract(sp).sub(0.5).sub(off));
  const tw = sin(time.mul(rnd.mul(3.0).add(1.0)).add(rnd.mul(40.0))).mul(0.3).add(0.7);
  const star = step(0.985, rnd).mul(smoothstep(0.12, 0.0, dst)).mul(tw).mul(smoothstep(0.08, 0.35, h)).mul(SKY.stars);
  col.addAssign(vec3(0.55, 0.62, 0.7).mul(star));
  // moon / sun disc + halo
  const cd = dot(dir, SKY.bodyDir);
  const ang = float(1).sub(cd).max(0.0).mul(2.0).sqrt(); // ~ angle in radians
  const disc = smoothstep(SKY.bodySize, SKY.bodySize.mul(0.92), ang);
  const crater = texture(noiseTex, dir.xy.mul(9.0)).r;
  const moonFace = mix(float(1.0), crater.mul(0.45).add(0.6), float(1).sub(SKY.bodyIsSun));
  col.assign(mix(col, SKY.bodyColor.mul(moonFace), disc));
  col.addAssign(SKY.bodyGlow.mul(exp(ang.div(SKY.bodySize).mul(-0.9))).mul(float(1).sub(disc)));
  // clouds on a plane above the city
  // big cumulus masses: low frequency dominates, a little mid frequency for lumpy edges, no fine noise
  const p = dir.xz.div(h.add(0.12)).mul(0.075).add(U.cloudOffset.mul(0.4));
  const nAt = (pp) => texture(noiseTex, pp).r.mul(0.72).add(texture(noiseTex, pp.mul(2.1).add(vec2(0.31, 0.77))).g.mul(0.24))
    .add(texture(noiseTex, pp.mul(4.3).add(vec2(0.53, 0.19))).b.mul(0.04));
  const n = nAt(p);
  const lightXZ = normalize(SKY.bodyDir.xz.add(vec2(0.0001, 0.0)));
  const nL = nAt(p.add(lightXZ.mul(0.012)));
  const c0 = U.cloudCover.add(0.04);
  const inside = smoothstep(c0, c0.add(0.012), n);
  const litSide = smoothstep(0.004, 0.02, nL.sub(n).negate()); // denser towards the light -> this side faces it
  const core = smoothstep(c0.add(0.1), c0.add(0.14), n);
  const tone = mix(mix(SKY.cloudBody, SKY.cloudLight, litSide), SKY.cloudShadow, core.mul(float(1).sub(litSide)).mul(0.8));
  const edge = smoothstep(0.012, 0.0, abs(n.sub(c0))).mul(smoothstep(0.02, 0.12, h));
  const inner = smoothstep(0.008, 0.0, abs(n.sub(c0.add(0.085)))).mul(smoothstep(0.03, 0.15, h));
  const cloudFade = smoothstep(0.015, 0.09, h);
  col.assign(mix(col, tone, inside.mul(cloudFade)));
  col.addAssign(SKY.outline.mul(edge).add(SKY.outlineInner.mul(inner).mul(inside)));
  // below the horizon: the same ground haze as the haze function
  col.assign(mix(col, U.groundHaze.add(col.mul(0.5)), float(1).sub(smoothstep(-0.3, 0.0, e))));
  // lightning still lights the deck
  const ld = max(dot(dir, U.lightningDir), 0.0).pow(5.0);
  col.addAssign(lightningColor.mul(U.lightning).mul(ld.mul(2.5).add(0.25)).mul(inside.mul(0.8).add(0.3)));
  return col;
});

export const paintedBackgroundNode = () => paintedSky(normalWorldGeometry);
