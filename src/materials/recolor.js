// Per-instance colour variants shared by the crowd and the cars: rotate the hue of saturated, non-skin texels
// (YIQ in sRGB space). Skin lies near the +I axis with a low chroma/luma ratio; an orange jacket shares the hue but is
// far more saturated, so it still varies. hue in radians; 0 keeps the designed colours.
import { float, vec3, mix, dot, sqrt, atan, abs, max, smoothstep, step, pow, cos, sin } from 'three/tsl';

export function recolorNode(lin, hue, { keepSkin = true, keepRed = false } = {}) {
  const c = pow(max(lin, vec3(0)), vec3(1 / 2.2));
  const Y = dot(c, vec3(0.299, 0.587, 0.114));
  const I = dot(c, vec3(0.596, -0.274, -0.322));
  const Q = dot(c, vec3(0.211, -0.523, 0.312));
  const chroma = sqrt(I.mul(I).add(Q.mul(Q)));
  const ratio = chroma.div(max(Y, 0.02));
  const skin = step(0, I).mul(smoothstep(0.75, 0.45, abs(atan(Q, I)))).mul(smoothstep(0.5, 0.38, ratio));
  let mask = keepSkin ? smoothstep(0.03, 0.08, chroma).mul(float(1).sub(skin)) : smoothstep(0.03, 0.08, chroma);
  // keepRed: lamp red stays red (YIQ angle of pure red ~0.34 rad); pink/magenta neon (~0.7 rad) still rotates
  if (keepRed) mask = mask.mul(smoothstep(0.12, 0.22, abs(atan(Q, I).sub(0.34))));
  const ch = cos(hue), sh = sin(hue);
  const I2 = I.mul(ch).sub(Q.mul(sh)), Q2 = I.mul(sh).add(Q.mul(ch));
  const rgb = vec3(Y.add(I2.mul(0.956)).add(Q2.mul(0.621)), Y.sub(I2.mul(0.272)).sub(Q2.mul(0.647)), Y.sub(I2.mul(1.106)).add(Q2.mul(1.703)));
  return mix(lin, pow(max(rgb, vec3(0)), vec3(2.2)), mask);
}
