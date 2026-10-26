// Night City massing additions for the district (restyle step 2; ?mass=legacy turns all of it off):
//   buildPods        bolt-on boxes on upper floors of fronts, exposed sides and towers
//   buildStairs      zig-zag exterior steel fire stairs with platforms on exposed side walls
//   buildSkybridges  enclosed bridges across the avenue and the cross streets
// (the recessed service floors that split tall volumes into modules live in architecture.js)
// Wall areas covered by pods and bridge ends are recorded in lot.blocks (world coordinates) and handed to signage
// through the facade API, so signs never cut through them. Pods sit 1.5 m+ off the wall, so the AC units and
// balconies that props.js hangs on the same wall end up hidden inside them.
import { mulberry32 } from './rng.js';
import { sideFrame, trimAttr, FACADE_ATTRS, DETAIL_ATTRS, SIDES } from './architecture.js';
import { MASS } from './plan.js';

const D = (col, em = 0, rough = 0.6, metal = 0, grime = 0.5) => ({ aCol: [col[0], col[1], col[2], em], aPbr: [rough, metal, 0, grime] });
const STEEL_DARK = [0.11, 0.11, 0.12], STEEL_RUST = [0.24, 0.14, 0.09];
// S2 accents: red and cyan first, then white and amber
const ACCENTS = [[1.0, 0.15, 0.12], [1.0, 0.15, 0.12], [0.1, 0.8, 1.0], [0.1, 0.8, 1.0], [0.9, 0.92, 1.0], [1.0, 0.55, 0.12]];
// pod bodies: flat panel colours of the S2 palette (off-white, dark grey, slate, rust red, teal grey)
const POD_COLS = [[0.62, 0.62, 0.6], [0.62, 0.62, 0.6], [0.075, 0.08, 0.085], [0.075, 0.08, 0.085], [0.2, 0.24, 0.28], [0.36, 0.09, 0.07], [0.14, 0.23, 0.24]];
const WIN_COLS = [[1.0, 0.78, 0.5], [1.0, 0.92, 0.8], [0.75, 0.88, 1.0]];

const P = (fr, s, y, off) => [fr.origin[0] + fr.right[0] * s + fr.normal[0] * off, y, fr.origin[2] + fr.right[2] * s + fr.normal[2] * off];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// quad with the winding fixed to face n; uv in metres along (t, the other in-plane axis)
function quadN(bk, p0, p1, p2, p3, n, a) {
  let q = [p0, p1, p2, p3];
  if (dot(cross(sub(p1, p0), sub(p3, p0)), n) < 0) q = [p0, p3, p2, p1];
  const t = sub(q[1], q[0]); const tl = Math.hypot(...t) || 1; const tn = [t[0] / tl, t[1] / tl, t[2] / tl];
  const bt = cross(n, tn);
  const uv = (p) => [dot(sub(p, q[0]), tn), dot(sub(p, q[0]), bt)];
  bk.quad(q[0], q[1], q[2], q[3], uv(q[0]), uv(q[1]), uv(q[2]), uv(q[3]), a, n, tn);
}

function addBlock(lot, side, fr, s0, s1, y0, y1) {
  (lot.blocks ||= []).push({ side, p0: P(fr, s0, 0, 0), p1: P(fr, s1, 0, 0), y0, y1 });
}

// ------------------------------------------------------------------------------------------------ collisions
// boxes added by this module must not cut into neighbouring buildings, each other, or the rail / expressway decks
export function makeIndex(lots, L) {
  const G = 24, grid = new Map(), extra = [];
  const key = (i, j) => i * 100003 + j;
  const put = (o, x0, x1, z0, z1) => {
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) {
      const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
    }
  };
  for (const l of lots) put({ lot: l, x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, y0: 0, y1: l.h + 1.5 }, l.x0, l.x1, l.z0, l.z1);
  for (const deck of [L.elevatedRail, L.expressway]) {
    extra.push({ x0: -1e4, x1: 1e4, z0: deck.z - deck.width / 2 - 1, z1: deck.z + deck.width / 2 + 1, y0: deck.height - 3, y1: deck.height + 3 });
  }
  return {
    // box = {x0,x1,y0,y1,z0,z1}; `self` lot is ignored (the wall the box hangs on)
    hits(b, self) {
      for (const o of extra) if (b.x1 > o.x0 && b.x0 < o.x1 && b.z1 > o.z0 && b.z0 < o.z1 && b.y1 > o.y0 && b.y0 < o.y1) return true;
      const seen = new Set();
      for (let i = Math.floor(b.x0 / G); i <= Math.floor(b.x1 / G); i++) for (let j = Math.floor(b.z0 / G); j <= Math.floor(b.z1 / G); j++) {
        for (const o of grid.get(key(i, j)) || []) {
          if (seen.has(o) || o.lot === self) continue;
          seen.add(o);
          if (b.x1 > o.x0 + 0.02 && b.x0 < o.x1 - 0.02 && b.z1 > o.z0 + 0.02 && b.z0 < o.z1 - 0.02 && b.y1 > o.y0 && b.y0 < o.y1) return true;
        }
      }
      return false;
    },
    add(b) { put(b, b.x0, b.x1, b.z0, b.z1); },
  };
}
// world AABB of a wall-hung box (s0..s1 along the wall, off0..off1 out from it)
const wallAABB = (fr, s0, s1, y0, y1, off0, off1) => {
  const a = P(fr, s0, y0, off0), b = P(fr, s1, y1, off1);
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0, y1, z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) };
};

// bolt-on pod: flat-colour panel box (detail material) with a horizontal window band per floor on the front and a
// small window on the ends, roof cap, accent strip under it, steel brackets
function podBox(det, fr, s0, s1, y0, floors, fh, dp, col, rng, opts = {}) {
  const n = fr.normal, r = fr.right, w = s1 - s0, h = floors * fh, along = Math.abs(r[0]) > 0.5;
  const body = D(col, 0, 0.55, 0.25, 0.55);
  const c = P(fr, (s0 + s1) / 2, y0 + h / 2, dp / 2);
  det.box(c[0], c[1], c[2], along ? w : dp, h, along ? dp : w, body);
  // panel seams: thin darker ribs every ~1.2 m on the front
  const seam = D([col[0] * 0.55, col[1] * 0.55, col[2] * 0.55], 0, 0.6, 0.3);
  for (let s = s0 + 1.2; s < s1 - 0.3; s += 1.2) { const p = P(fr, s, y0 + h / 2, dp + 0.012); det.box(p[0], p[1], p[2], along ? 0.04 : 0.02, h, along ? 0.02 : 0.04, seam); }
  for (let f = 0; f < floors; f++) {
    const yb = y0 + f * fh + fh * 0.38, yt = y0 + f * fh + fh * 0.78;
    const lit = rng() < 0.55;
    const wc = WIN_COLS[Math.floor(rng() * WIN_COLS.length)];
    const wa = lit ? D(wc, 0.55 + rng() * 0.45, 0.3) : D([0.03, 0.035, 0.045], 0, 0.15, 0.5);
    quadN(det, P(fr, s0 + 0.35, yb, dp + 0.02), P(fr, s1 - 0.35, yb, dp + 0.02), P(fr, s1 - 0.35, yt, dp + 0.02), P(fr, s0 + 0.35, yt, dp + 0.02), n, wa);
    // window frame sill
    const sp = P(fr, (s0 + s1) / 2, yb - 0.04, dp + 0.05);
    det.box(sp[0], sp[1], sp[2], along ? w - 0.5 : 0.08, 0.06, along ? 0.08 : w - 0.5, seam);
    if (dp > 1.4) { // small end window
      for (const [ss, nn] of [[s0, [-r[0], 0, -r[2]]], [s1, r]]) {
        const sgn = ss === s0 ? -0.02 : 0.02;
        quadN(det, P(fr, ss + sgn, yb, 0.35), P(fr, ss + sgn, yb, dp - 0.35), P(fr, ss + sgn, yt, dp - 0.35), P(fr, ss + sgn, yt, 0.35), nn, wa);
      }
    }
  }
  const cap = P(fr, (s0 + s1) / 2, y0 + h + 0.07, dp / 2 + 0.03);
  det.box(cap[0], cap[1], cap[2], along ? w + 0.12 : dp + 0.1, 0.14, along ? dp + 0.1 : w + 0.12, seam);
  if (opts.accent) {
    const ac = P(fr, (s0 + s1) / 2, y0 + 0.06, dp + 0.03);
    det.box(ac[0], ac[1], ac[2], along ? w * 0.92 : 0.05, 0.07, along ? 0.05 : w * 0.92, D(opts.accent, 2.4, 0.5));
  }
  if (opts.brackets) {
    // knee braces from the wall up to the pod's outer edge, a bearer under the floor, and a wall plate
    const nb = w > 5.5 ? 3 : 2;
    for (let i = 0; i < nb; i++) {
      const s = s0 + 0.35 + (w - 0.7) * (i / (nb - 1));
      det.beam(P(fr, s, y0 - Math.min(1.8, dp * 0.8), 0.04), P(fr, s, y0 - 0.03, dp - 0.12), 0.1, D(STEEL_DARK, 0, 0.5, 0.7));
      det.beam(P(fr, s, y0 - 0.06, 0.02), P(fr, s, y0 - 0.06, dp - 0.1), 0.09, D(STEEL_DARK, 0, 0.5, 0.7));
      const wp = P(fr, s, y0 - Math.min(1.8, dp * 0.8), 0.03);
      det.box(wp[0], wp[1], wp[2], along ? 0.25 : 0.05, 0.3, along ? 0.05 : 0.25, D(STEEL_DARK, 0, 0.5, 0.7));
    }
  }
}

// ------------------------------------------------------------------------------------------------ pods
export function buildPods(lots, B, IX) {
  let count = 0;
  for (const lot of lots) {
    if (!lot.volumes || lot.overlook || lot.h < 14 || lot.detail === 'lo') continue;
    if (lot.fronts.some((f) => f.district === 'alley')) continue;
    const rng = mulberry32((lot.id * 40503 + 77) >>> 0);
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    const fac = B.get(cx, cz, 'facade', FACADE_ATTRS), det = B.get(cx, cz, 'detail', DETAIL_ATTRS);
    const fronts = new Map(lot.fronts.map((f) => [f.side, f]));
    const bodies = lot.volumes.filter((v) => !v.isGap);
    for (const side of SIDES) {
      const f = fronts.get(side);
      const exposed = (lot.cover?.[side] ?? 1) < 0.45;
      if (!f && !exposed) continue;
      const avenue = f && f.district === 'avenue';
      const p = avenue ? 0.3 : f && !f.lane ? 0.35 : 0.45;
      if (rng() > p) continue;
      // pods stay above the shop / sign band of street fronts and above the utility cables (up to ~13.7 m)
      const minY = f ? Math.max(14.5, lot.groundH + lot.floorH * (avenue ? 3 : 2)) : lot.groundH + lot.floorH;
      const used = [];
      const nPods = 1 + (rng() < 0.4 ? 1 : 0) + (rng() < 0.15 ? 1 : 0);
      for (let k = 0; k < nPods; k++) {
        // a body chunk tall enough on this side
        const v = bodies[Math.floor(rng() * bodies.length)];
        const fr = sideFrame(v, side, v.y0);
        if (fr.width < 6) continue;
        const floors = 1 + Math.floor(rng() * 3);
        const h = floors * lot.floorH;
        const yLo = Math.max(minY, v.y0 + 0.3), yHi = v.y1 - lot.floorH * 0.8 - h;
        if (yHi < yLo) continue;
        const fl = Math.floor((yLo - lot.groundH) / lot.floorH) + Math.floor(rng() * (Math.floor((yHi - yLo) / lot.floorH) + 1));
        const y0 = lot.groundH + Math.max(0, fl) * lot.floorH;
        if (y0 < yLo - 0.01 || y0 + h > v.y1 - lot.floorH * 0.8 + 0.01) continue;
        const w = Math.min(fr.width - 1.2, 3.5 + rng() * 5);
        const s0 = 0.6 + rng() * (fr.width - 1.2 - w), s1 = s0 + w;
        if (used.some((u) => s1 > u[0] - 0.8 && s0 < u[1] + 0.8 && y0 + h > u[2] - 0.5 && y0 < u[3] + 0.5)) continue;
        const dp = avenue ? 1.8 + rng() * 0.5 : 2.0 + rng() * 1.0;
        const bb = wallAABB(fr, s0 - 0.3, s1 + 0.3, y0 - 1.7, y0 + h + 0.3, 0.05, dp + 0.4);
        if (IX.hits(bb, lot)) continue;
        IX.add(bb);
        used.push([s0, s1, y0, y0 + h]);
        podBox(det, fr, s0, s1, y0, floors, lot.floorH, dp, POD_COLS[Math.floor(rng() * POD_COLS.length)], rng, {
          accent: rng() < 0.45 ? ACCENTS[Math.floor(rng() * ACCENTS.length)] : null,
          brackets: true,
        });
        addBlock(lot, side, fr, s0 - 0.2, s1 + 0.2, y0 - 1.7, y0 + h + 0.3);
        count++;
      }
    }
  }
  return count;
}

// ------------------------------------------------------------------------------------------------ stairs
export function buildStairs(lots, B, IX) {
  let count = 0;
  const steelA = D(STEEL_DARK, 0, 0.5, 0.75, 0.6), rustA = D(STEEL_RUST, 0, 0.7, 0.4, 0.8);
  for (const lot of lots) {
    if (!lot.volumes || lot.tower || lot.overlook || lot.detail === 'lo' || lot.h < 10 || lot.h > 55) continue;
    const rng = mulberry32((lot.id * 69069 + 5) >>> 0);
    if (rng() > 0.4) continue;
    const fronts = new Set(lot.fronts.map((f) => f.side));
    const cands = SIDES.filter((s) => !fronts.has(s) && (lot.cover?.[s] ?? 1) < 0.45);
    if (!cands.length) continue;
    const side = cands[Math.floor(rng() * cands.length)];
    const v = lot.volumes[0];
    const fr = sideFrame(v, side, 0);
    const fh = lot.floorH, run = Math.min(5.2, Math.max(3.6, fh * 1.35)), land = 1.1, wd = 1.05;
    if (fr.width < run + 2 * land + 1.2) continue;
    // top: the wall must run unbroken from the ground (stop at the first recessed service floor or setback, where
    // the platforms' wall braces would hang in the air)
    const sA = land + 0.6 + rng() * (fr.width - run - 2 * land - 1.2), sB = sA + run;
    const e0 = P(fr, sA - land - 0.2, 0, 0), e1 = P(fr, sB + land + 0.2, 0, 0);
    const covers = (u) => Math.min(e0[0], e1[0]) >= u.x0 - 0.05 && Math.max(e0[0], e1[0]) <= u.x1 + 0.05 && Math.min(e0[2], e1[2]) >= u.z0 - 0.05 && Math.max(e0[2], e1[2]) <= u.z1 + 0.05;
    const plane = (u) => (side === 'nx' ? u.x0 : side === 'px' ? u.x1 : side === 'nz' ? u.z0 : u.z1);
    const flushU = (u) => !u.isGap && Math.abs(plane(u) - plane(v)) < 0.01 && covers(u);
    let top = v.y1;
    for (let grew = true; grew;) {
      grew = false;
      for (const u of lot.volumes) if (flushU(u) && Math.abs(u.y0 - top) < 0.01 && u.y1 > top) { top = u.y1; grew = true; }
    }
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    const det = B.get(cx, cz, 'detail', DETAIL_ATTRS);
    const col = rng() < 0.7 ? steelA : rustA;
    const along = Math.abs(fr.right[0]) > 0.5;
    const o0 = 0.03, o1 = o0 + wd, om = (o0 + o1) / 2;
    const levels = [];
    for (let y = lot.groundH; y < top - 1.0; y += fh) levels.push(y);
    if (levels.length < 2) continue;
    const bb = wallAABB(fr, sA - land - 0.2, sB + land + 0.2, 2.0, levels[levels.length - 1] + 1.2, 0.05, o1 + 0.3);
    if (IX.hits(bb, lot)) continue;
    IX.add(bb);
    levels.forEach((y, k) => {
      // platform (grating slab + outer railing)
      const pc = P(fr, (sA + sB) / 2, y - 0.06, om);
      det.box(pc[0], pc[1], pc[2], along ? run + 2 * land : wd, 0.1, along ? wd : run + 2 * land, col);
      for (const hy of [1.0, 0.5]) det.beam(P(fr, sA - land, y + hy, o1 - 0.03), P(fr, sB + land, y + hy, o1 - 0.03), 0.04, col);
      for (const ss of [sA - land, sB + land]) det.beam(P(fr, ss, y + 1.0, o0), P(fr, ss, y + 1.0, o1), 0.04, col);
      // wall anchors: diagonal braces from the wall up to the platform's outer edge
      for (const ss of [sA - land + 0.3, (sA + sB) / 2, sB + land - 0.3]) det.beam(P(fr, ss, y - 0.9, 0.02), P(fr, ss, y - 0.1, o1 - 0.05), 0.05, col);
      // flight up to the next platform, alternating direction
      if (k < levels.length - 1) {
        const [a, b] = k % 2 ? [sB, sA] : [sA, sB];
        const y1 = levels[k + 1];
        const pa = P(fr, a, y, om), pb = P(fr, b, y1, om);
        if (along) det.beam(pa, pb, 0.08, col, wd * 0.9); else det.beam(pa, pb, wd * 0.9, col, 0.08);
        det.beam(P(fr, a, y + 0.9, o1 - 0.05), P(fr, b, y1 + 0.9, o1 - 0.05), 0.035, col);
        // tread nosings (a few, enough to read as steps from the street)
        for (let t = 1; t < 6; t++) {
          const tt = t / 6, ss = a + (b - a) * tt, yy = y + (y1 - y) * tt + 0.05;
          det.beam(P(fr, ss, yy, o0 + 0.05), P(fr, ss, yy, o1 - 0.05), 0.035, col);
        }
      }
    });
    // corner posts down to the first platform, hanger rods to the wall
    const yTop = levels[levels.length - 1] + 1.0;
    for (const ss of [sA - land, sB + land]) {
      det.beam(P(fr, ss, levels[0] - 0.1, o1 - 0.03), P(fr, ss, yTop, o1 - 0.03), 0.06, col);
    }
    // drop ladder below the first platform
    det.beam(P(fr, sA - land + 0.25, 2.2, o1 - 0.2), P(fr, sA - land + 0.25, levels[0], o1 - 0.2), 0.035, col);
    det.beam(P(fr, sA - land + 0.7, 2.2, o1 - 0.2), P(fr, sA - land + 0.7, levels[0], o1 - 0.2), 0.035, col);
    for (let y = 2.5; y < levels[0] - 0.1; y += 0.32) det.beam(P(fr, sA - land + 0.25, y, o1 - 0.2), P(fr, sA - land + 0.7, y, o1 - 0.2), 0.025, col);
    count++;
  }
  return count;
}

// ------------------------------------------------------------------------------------------------ sky bridges
export function buildSkybridges(lots, B, L, IX) {
  const rng = mulberry32(0xB21D);
  const fr0 = L.blocks.frontageOffset;
  const made = [];
  // body: dark metal with a ribbon of lit windows on both long sides, accent strip on some
  const make = (fac, det, a, b, axis, c, y0, bw, bh, seed) => {
    // a..b along `axis` ('x' crosses the avenue, 'z' crosses a cross street), c = centre on the other axis
    const fr = axis === 'x'
      ? { origin: [a, 0, c - bw / 2], right: [1, 0, 0], normal: [0, 0, -1], width: b - a }
      : { origin: [c + bw / 2, 0, a], right: [0, 0, 1], normal: [1, 0, 0], width: b - a };
    // (tint -1: neutral structure, never painted by the restyled facade shader)
    const layer = rng() < 0.6 ? 4 : 1, tint = (rng(), -1); // (draw kept so the bridge layout stays the same)
    const win = { aWin: [seed, bh, 1.4, y0 + 0.2], aWin2: [1, 0.55, 0.75, 1], aWin3: [y0 + bh - 0.35, layer, 3, tint] };
    const plain = trimAttr(layer, 3, tint, seed);
    const n = fr.normal, r = fr.right;
    // long sides: plane at offset 0 facing `normal`, plane at offset bw facing away from it
    fac.vrect([fr.origin[0] + r[0] * fr.width, y0, fr.origin[2] + r[2] * fr.width], [-r[0], 0, -r[2]], fr.width, bh, win, 0, y0);
    const o2 = [fr.origin[0] - n[0] * bw, y0, fr.origin[2] - n[2] * bw];
    fac.vrect(o2, r, fr.width, bh, win, 0, y0);
    const q = (s, y, off) => [fr.origin[0] + r[0] * s - n[0] * off, y, fr.origin[2] + r[2] * s - n[2] * off];
    quadN(fac, q(0, y0 + bh, 0), q(fr.width, y0 + bh, 0), q(fr.width, y0 + bh, bw), q(0, y0 + bh, bw), [0, 1, 0], plain);
    quadN(fac, q(0, y0, 0), q(fr.width, y0, 0), q(fr.width, y0, bw), q(0, y0, bw), [0, -1, 0], plain);
    // roof edge copings and an under-strip light on some bridges
    for (const off of [0.05, bw - 0.05]) {
      const p0 = q(0, y0 + bh + 0.08, off), p1 = q(fr.width, y0 + bh + 0.08, off);
      fac.box((p0[0] + p1[0]) / 2, p0[1], (p0[2] + p1[2]) / 2, axis === 'x' ? fr.width : 0.16, 0.16, axis === 'x' ? 0.16 : fr.width, plain);
    }
    if (rng() < 0.6) {
      const col = ACCENTS[Math.floor(rng() * ACCENTS.length)];
      for (const off of [0.15, bw - 0.15]) {
        const p0 = q(0, y0 + 0.04, off), p1 = q(fr.width, y0 + 0.04, off);
        det.box((p0[0] + p1[0]) / 2, p0[1], (p0[2] + p1[2]) / 2, axis === 'x' ? fr.width : 0.06, 0.06, axis === 'x' ? 0.06 : fr.width, D(col, 2.4, 0.5));
      }
    }
  };
  // the end walls must reach the street plane over the whole bridge height: walls flush with the lot edge or
  // protruding (overhangs: the bridge end just sinks into them), never set back or recessed
  const reaches = (u, lot, side) => (side === 'nx' ? u.x0 <= lot.x0 + 0.01 : side === 'px' ? u.x1 >= lot.x1 - 0.01 : side === 'nz' ? u.z0 <= lot.z0 + 0.01 : u.z1 >= lot.z1 - 0.01);
  const flush = (lot, side, y0, y1) => lot.volumes.some((u) => !u.isGap && u.y0 <= y0 && u.y1 >= y1 && reaches(u, lot, side));
  // facing lot pairs across a street: A on `sideA` wall plane `planeA`, B on `sideB` plane `planeB`; overlap along
  // the street axis must fit the bridge. Returns [{A, B, c (bridge centre along the street), lo, hi}]
  const facing = (side, plane) => lots.filter((l) => l.volumes && !l.overlook && l.fronts.some((f) => f.side === side)
    && (side === 'nx' ? Math.abs(l.x0 - plane) < 0.1 : side === 'px' ? Math.abs(l.x1 - plane) < 0.1 : side === 'nz' ? Math.abs(l.z0 - plane) < 0.1 : Math.abs(l.z1 - plane) < 0.1));
  const pairs = (sideA, planeA, sideB, planeB, alongX) => {
    const out = [];
    const As = facing(sideA, planeA), Bs = facing(sideB, planeB);
    for (const A of As) for (const Bl of Bs) {
      const lo = alongX ? Math.max(A.x0, Bl.x0) : Math.max(A.z0, Bl.z0), hi = alongX ? Math.min(A.x1, Bl.x1) : Math.min(A.z1, Bl.z1);
      if (hi - lo < 6.4 || Math.min(A.h, Bl.h) < 21) continue;
      out.push({ A: { lot: A, side: sideA }, B: { lot: Bl, side: sideB }, lo, hi });
    }
    return out;
  };
  const place = (cand, target, yMin, box, put) => {
    // closest candidate pair to the target position that fits a bridge at a flush height
    const sorted = cand.map((c) => ({ ...c, d: Math.abs(Math.min(Math.max(target, c.lo + 3.4), c.hi - 3.4) - target) })).filter((c) => c.d < 30).sort((a, b) => a.d - b.d);
    for (const c of sorted) {
      const bw = Math.min(3.6 + rng() * 1.6, c.hi - c.lo - 1.2), bh = 3.0 + rng() * 0.6;
      const mid = Math.min(Math.max(target, c.lo + bw / 2 + 0.6), c.hi - bw / 2 - 0.6);
      const yMax = Math.min(c.A.lot.h, c.B.lot.h) - bh - 3;
      if (yMax < yMin) continue;
      // every height (1 m steps) where both end walls are flush and nothing is in the way; pick one at random
      const ok = [];
      for (let y0 = yMin; y0 <= Math.min(yMax, yMin + 22); y0 += 1) {
        if (!flush(c.A.lot, c.A.side, y0 - 0.5, y0 + bh + 0.5) || !flush(c.B.lot, c.B.side, y0 - 0.5, y0 + bh + 0.5)) continue;
        if (IX.hits(box(mid, y0, bw, bh), null)) continue;
        ok.push(y0);
      }
      if (ok.length) {
        const y0 = ok[Math.floor(rng() * ok.length)];
        const bb = box(mid, y0, bw, bh);
        IX.add(bb);
        put(c, mid, y0, bw, bh);
        return true;
      }
    }
    return false;
  };
  const endBlocks = (c, mid, y0, bw, bh, alongX) => {
    for (const e of [c.A, c.B]) {
      const fr = sideFrame(e.lot.volumes[0], e.side, 0);
      const sC = alongX ? (mid - fr.origin[0]) / fr.right[0] : (mid - fr.origin[2]) / fr.right[2];
      addBlock(e.lot, e.side, fr, sC - bw / 2 - 0.3, sC + bw / 2 + 0.3, y0 - 0.5, y0 + bh + 0.5);
    }
  };
  // across the avenue (bridge along x between x = -fr0 and +fr0, centred at z = mid)
  const avPairs = pairs('px', -fr0, 'nx', fr0, false);
  // (the bridge nearest the street camera stays high so it frames the view instead of blocking it)
  // (bridge target positions: the restyle map derives its own; the original map keeps the hand-picked list)
  const avTargets = L.plaza ? [-35, -110, -185, -250, -342, -415] : [-40, -96, -206, -272, -345, -392];
  for (const zt of avTargets) {
    // (min 15 m: the facade-to-facade cables of cables.js cross the avenue up to ~13.7 m incl. fittings)
    place(avPairs, zt, zt > -50 ? 17 : 15,
      (mid, y, bw, bh) => ({ x0: -fr0 + 0.05, x1: fr0 - 0.05, y0: y, y1: y + bh, z0: mid - bw / 2, z1: mid + bw / 2 }),
      (c, mid, y0, bw, bh) => {
        make(B.get(0, mid, 'facade', FACADE_ATTRS), B.get(0, mid, 'detail', DETAIL_ATTRS), -fr0, fr0, 'x', mid, y0, bw, bh, c.A.lot.seed);
        endBlocks(c, mid, y0, bw, bh, false);
        made.push({ axis: 'x', c: mid, y0 });
      });
  }
  // across cross streets (bridge along z between the facing walls), near the avenue but clear of the overlook
  const cs = L.crossStreets, half = cs.roadHalfWidth + cs.sidewalkWidth;
  const zsC = L.crossStreets.zs, xm = fr0 + 14;
  const crTargets = L.plaza ? [[zsC[1], xm], [zsC[1], -xm], [zsC[2], -xm], [zsC[2], xm], [zsC[0], -xm]] : [[-180, 24], [-180, -24], [-300, -24], [-300, 26], [-60, -26]];
  for (const [zc, xt] of crTargets) {
    const cp = pairs('pz', zc - half, 'nz', zc + half, true);
    place(cp, xt, 14,
      (mid, y, bw, bh) => ({ x0: mid - bw / 2, x1: mid + bw / 2, y0: y, y1: y + bh, z0: zc - half + 0.05, z1: zc + half - 0.05 }),
      (c, mid, y0, bw, bh) => {
        make(B.get(mid, zc, 'facade', FACADE_ATTRS), B.get(mid, zc, 'detail', DETAIL_ATTRS), zc - half, zc + half, 'z', mid, y0, bw, bh, c.A.lot.seed);
        endBlocks(c, mid, y0, bw, bh, true);
        made.push({ axis: 'z', c: mid, z: zc, y0 });
      });
  }
  return made;
}

// ------------------------------------------------------------------------------------------------ ducts
// exterior ventilation ducts on exposed side walls of taller buildings (restyle step 4): a vertical rectangular duct
// on a bay boundary from 2.5 m up past the roof, brackets every ~3 m, a hood on top. Positions are recorded in
// lot.ducts so props.js keeps its AC units clear.
export function buildDucts(lots, B, IX) {
  let count = 0;
  const galv = D([0.48, 0.5, 0.51], 0, 0.45, 0.6, 0.6), dark = D([0.12, 0.12, 0.13], 0, 0.5, 0.6, 0.6);
  for (const lot of lots) {
    if (!lot.volumes || lot.overlook || lot.detail === 'lo' || lot.h < 25) continue;
    const rng = mulberry32((lot.id * 83492791 + 17) >>> 0);
    if (rng() > 0.45) continue;
    const fronts = new Set(lot.fronts.map((f) => f.side));
    const cands = SIDES.filter((s) => !fronts.has(s) && (lot.cover?.[s] ?? 1) < 0.45 && lot.sides?.[`0:${s}`]);
    if (!cands.length) continue;
    const side = cands[Math.floor(rng() * cands.length)];
    const v = lot.volumes[0], sd = lot.sides[`0:${side}`];
    const fr = sideFrame(v, side, 0);
    const plane = (u) => (side === 'nx' ? u.x0 : side === 'px' ? u.x1 : side === 'nz' ? u.z0 : u.z1);
    const nD = 1 + (rng() < 0.35 ? 1 : 0);
    const col = rng() < 0.6 ? galv : dark;
    for (let k = 0; k < nD; k++) {
      const nb = Math.max(2, Math.round(fr.width / sd.bayW));
      const s = sd.bayW * (1 + Math.floor(rng() * (nb - 1)));
      if (s < 0.8 || s > fr.width - 0.8) continue;
      // the wall must run unbroken from the ground at this position (stop below a service floor / setback)
      const e = P(fr, s, 0, 0);
      const covers = (u) => e[0] >= u.x0 - 0.05 && e[0] <= u.x1 + 0.05 && e[2] >= u.z0 - 0.05 && e[2] <= u.z1 + 0.05;
      let top = v.y1;
      for (let grew = true; grew;) {
        grew = false;
        for (const u of lot.volumes) if (!u.isGap && Math.abs(plane(u) - plane(v)) < 0.01 && covers(u) && Math.abs(u.y0 - top) < 0.01 && u.y1 > top) { top = u.y1; grew = true; }
      }
      const capped = top >= lot.h - 0.01; // reaches the roof: run up past the parapet with a hood
      const yTop = capped ? top + 1.4 : top - 0.3;
      if (yTop - 2.5 < 8) continue;
      const bb = wallAABB(fr, s - 0.55, s + 0.55, 2.4, yTop + 0.4, 0.03, 0.75);
      if (IX.hits(bb, lot)) continue;
      IX.add(bb);
      const along = Math.abs(fr.right[0]) > 0.5;
      const c = P(fr, s, (2.5 + yTop) / 2, 0.36);
      det(B, lot).box(c[0], c[1], c[2], along ? 0.7 : 0.5, yTop - 2.5, along ? 0.5 : 0.7, col);
      for (let y = 4; y < yTop - 0.5; y += 3) {
        const bp = P(fr, s, y, 0.31); // (0..0.62 from the wall: the band holds the duct against it)
        det(B, lot).box(bp[0], bp[1], bp[2], along ? 0.86 : 0.62, 0.08, along ? 0.62 : 0.86, dark);
      }
      if (capped) {
        const hp = P(fr, s, yTop + 0.15, 0.36);
        det(B, lot).box(hp[0], hp[1], hp[2], along ? 1.0 : 0.8, 0.3, along ? 0.8 : 1.0, dark);
      }
      (lot.ducts ||= []).push({ x: P(fr, s, 0, 0.3)[0], z: P(fr, s, 0, 0.3)[2] });
      count++;
    }
  }
  return count;
}
const det = (B, lot) => B.get((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 'detail', DETAIL_ATTRS);

// facade API helper: lot.blocks (world) -> [{a0,a1,y0,y1}] relative to the facade centre along `right`
export function facadeBlocks(lot, side, fr) {
  const out = [];
  // recessed service floors and set-back levels: a sign mounted on the street plane there would float in the air
  if (MASS && lot.volumes) {
    const pl = (u) => (side === 'nx' ? u.x0 : side === 'px' ? u.x1 : side === 'nz' ? u.z0 : u.z1);
    const ref = side === 'nx' || side === 'px' ? fr.origin[0] : fr.origin[2];
    for (const u of lot.volumes) {
      if (u.isGap || Math.abs(pl(u) - ref) > 0.3) out.push({ a0: -fr.width / 2 - 1, a1: fr.width / 2 + 1, y0: u.y0 - 0.3, y1: u.y1 + 0.3 });
    }
  }
  for (const b of lot.blocks || []) {
    if (b.side !== side) continue;
    const s0 = dot(sub(b.p0, fr.origin), fr.right), s1 = dot(sub(b.p1, fr.origin), fr.right);
    out.push({ a0: Math.min(s0, s1) - fr.width / 2, a1: Math.max(s0, s1) - fr.width / 2, y0: b.y0, y1: b.y1 });
  }
  return out.length ? out : null;
}
