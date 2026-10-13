// Small deterministic helpers for the signage system.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  f.weighted = (items) => { // [[value, weight], ...]
    let s = 0; for (const [, w] of items) s += w;
    let r = f() * s;
    for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
    return items[items.length - 1][0];
  };
  return f;
}

// Neon palette (linear-ish RGB, saturated). Values are multiplied by intensity in the shader.
export const NEON = {
  magenta: [1.0, 0.08, 0.55],
  pink: [1.0, 0.25, 0.6],
  hotpink: [1.0, 0.05, 0.35],
  cyan: [0.05, 0.85, 1.0],
  ice: [0.45, 0.85, 1.0],
  blue: [0.12, 0.35, 1.0],
  violet: [0.55, 0.15, 1.0],
  purple: [0.75, 0.1, 1.0],
  red: [1.0, 0.06, 0.04],
  amber: [1.0, 0.45, 0.08],
  orange: [1.0, 0.3, 0.03],
  warm: [1.0, 0.7, 0.35],
  yellow: [1.0, 0.8, 0.15],
  lime: [0.45, 1.0, 0.12],
  green: [0.1, 1.0, 0.45],
  white: [0.95, 0.95, 1.0],
};

// Weighted palette for random neon picks (lime sparingly).
export const NEON_WEIGHTS = [
  ['magenta', 5], ['pink', 3], ['hotpink', 2], ['cyan', 5], ['ice', 2], ['blue', 2], ['violet', 3], ['purple', 2],
  ['red', 4], ['amber', 3], ['orange', 2], ['warm', 2], ['yellow', 1], ['lime', 0.6], ['green', 0.6], ['white', 1],
];

export const css = (c, k = 1) => `rgb(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)})`;
