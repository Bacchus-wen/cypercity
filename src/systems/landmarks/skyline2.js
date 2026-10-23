// Restyled distant skyline (Night City direction; ?skyline=legacy restores skyline.js).
// Tower kinds, all instanced (footprint 1x1, y 0..1, scaled per tower):
//   mega     stacked megablock modules separated by recessed dark floors, painted supergraphics (diagonal bands,
//            frames, blocks in two colours) and a big two-digit block number on the top module
//   slab     brutalist slab split by a deep vertical slot; vertical fins, sparse slit windows, orange vents
//   band     corporate glass tower with chamfered corners and lighter horizontal bands every few floors
//   ring     cylinder core wrapped by rings of ad screens (the wide banner art scrolls around them)
//   terrace  asymmetric stepped terraces on one side
//   needle   slender chamfered spire tower (kept from the old set as 'taper' for the far ring)
// Plus sky bridges between neighbouring towers and the holographic ads of skyline.js. Flat anime look: albedo
// blocks lit by the scene (sun at dusk, neon/haze at night), windows/screens emissive, ink lines from the post pass.
import * as THREE from 'three/webgpu';
import {
  positionWorld, normalWorld, vec2, vec3, float, mix, smoothstep, step, abs, fract, floor, hash, max, min, clamp,
  sin, time, cameraPosition, attribute, normalize, dot, texture, uv,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';
import { buildHolos } from './skyline.js';
import { TOD } from '../../engine/timeOfDay.js';

// ---------------------------------------------------------------------------------------------- geometry
// one packed vertex attribute 'geo' = (around u, around v, edge, part): edge 0..1 across a facade (0.5 on caps),
// part 0 body, 1 ad ring, 2 recess / dark gap. (WebGPU allows 8 vertex buffers: position, normal, geo + 4 instanced)
function prep(g, part = 0, mult = 1) {
  g = g.index ? g.toNonIndexed() : g;
  g.computeVertexNormals();
  const uvA = g.attributes.uv, n = g.attributes.normal, cnt = uvA.count;
  const out = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i += 3) {
    const base = Math.floor(Math.min(uvA.getX(i), uvA.getX(i + 1), uvA.getX(i + 2)) * mult + 1e-4);
    for (let k = i; k < i + 3; k++) {
      out[k * 4] = uvA.getX(k); out[k * 4 + 1] = uvA.getY(k);
      out[k * 4 + 2] = Math.abs(n.getY(k)) > 0.7 ? 0.5 : uvA.getX(k) * mult - base;
      out[k * 4 + 3] = part;
    }
  }
  g.setAttribute('geo', new THREE.BufferAttribute(out, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'geo'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (w, h, d, y0, x = 0, z = 0, part = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y0 + h / 2, z); return prep(g, part); };
const prism = (rTop, rBot, h, y0, sides, rot, part = 0, mult = 1, open = false) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, sides, 1, open); g.rotateY(rot); g.translate(0, y0 + h / 2, 0); return prep(g, part, mult);
};

// megablock module layout (normalised height): modules separated by recessed gaps of MOD_GAP
const MODS = 4, MOD_GAP = 0.028, MEGA3_TOP = 0.8;
function towerGeos() {
  const G = {};
  // megablocks: 4 equal modules, or 3 modules with the top one set back (MEGA3_TOP of the footprint)
  const mega = (M, topScale) => {
    const parts = [], mh = 1 / M - MOD_GAP;
    for (let i = 0; i < M; i++) {
      const y = i / M, sc = i === M - 1 ? topScale : 1;
      parts.push(box(sc, mh, sc, y));
      parts.push(box(sc * 0.9, MOD_GAP, sc * 0.9, y + mh, 0, 0, 2));
    }
    parts.push(box(0.6 * topScale, 0.03, 0.5 * topScale, 1 - 0.002, 0.1 * topScale, 0.12 * topScale));
    return mergeGeometries(parts);
  };
  G.mega = mega(4, 1);
  G.mega3 = mega(3, MEGA3_TOP);
  // slab: two wings split by a deep slot (visible from north / south) with a recessed core
  G.slab = mergeGeometries([box(0.44, 1, 1, 0, -0.28), box(0.44, 0.92, 1, 0, 0.28), box(0.14, 0.97, 0.7, 0, 0, 0, 2)]);
  // corporate band tower, chamfered octagon (axis-aligned main faces)
  G.band = mergeGeometries([prism(0.62, 0.66, 0.93, 0, 8, Math.PI / 8, 0, 8), prism(0.45, 0.62, 0.07, 0.93, 8, Math.PI / 8, 0, 8)]);
  // ring towers: cylinder core + rings of ad screens with dark lips (5 thin rings, or 3 taller ones)
  const ring = (n, y0, dy, rh) => {
    const parts = [prism(0.42, 0.42, 1, 0, 24, 0, 0, 6)];
    for (let i = 0; i < n; i++) {
      const y = y0 + i * dy;
      parts.push(prism(0.56, 0.56, rh, y, 32, 0, 1, 1, true));
      parts.push(prism(0.57, 0.57, 0.008, y - 0.008, 32, 0, 2), prism(0.57, 0.57, 0.008, y + rh, 32, 0, 2));
    }
    return mergeGeometries(parts);
  };
  G.ring = ring(5, 0.18, 0.15, 0.065);
  G.ring3 = ring(3, 0.3, 0.22, 0.09);
  G.terrace = mergeGeometries([box(1, 0.45, 1, 0), box(0.78, 0.25, 0.85, 0.45, -0.11, -0.07), box(0.55, 0.2, 0.7, 0.7, -0.22, -0.15), box(0.34, 0.1, 0.5, 0.9, -0.33, -0.2)]);
  G.needle = mergeGeometries([prism(0.3, 0.7071, 0.94, 0, 4, Math.PI / 4, 0, 4), prism(0.05, 0.3, 0.06, 0.94, 4, Math.PI / 4, 0, 4)]);
  return G;
}

// ---------------------------------------------------------------------------------------------- materials
// per-tower palette (albedo, linear), Edgerunners S2 direction: concrete greys, slate / navy glass, teal, off-white,
// rust; paint colours for megablock supergraphics; neon accents
// (megablocks draw from weighted lists so the city reads red / black / white with teal and yellow as rarer accents)
const BASES = [[0.3, 0.31, 0.33], [0.13, 0.18, 0.27], [0.12, 0.24, 0.26], [0.5, 0.5, 0.48], [0.26, 0.2, 0.18], [0.07, 0.08, 0.11]];
const PAINTS = [[0.55, 0.07, 0.06], [0.8, 0.8, 0.76], [0.05, 0.05, 0.06], [0.08, 0.36, 0.36], [0.7, 0.56, 0.08], [0.5, 0.2, 0.07]];
const NEON = [[1.0, 0.15, 0.12], [0.1, 0.8, 1.0], [1.0, 0.55, 0.12], [0.9, 0.92, 1.0], [1.0, 0.12, 0.45], [0.95, 0.85, 0.2]];
const MEGA_BASES = [0, 0, 3, 3, 5, 5, 4, 1];
const MEGA_PAINTS = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5];
const NEON_PICK = [0, 0, 1, 1, 2, 3, 3, 4, 5];
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
// kind: integer = facade family, fraction = geometry variant (mega3 / ring3)
const KIND = { mega: 0, mega3: 0.3, slab: 1, band: 2, ring: 3, ring3: 3.3, terrace: 4, needle: 2 };
const family = (type) => type.replace(/\d$/, '');

function digitTexture() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = '900 120px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) g.fillText(String(d), d * 64 + 32, 70, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

function towerMaterial(adsTex, digits) {
  const m = new THREE.MeshStandardNodeMaterial();
  const a = attribute('aInfo', 'vec4');   // seed, height, kind, block number (1..99)
  const b = attribute('aInfo2', 'vec4');  // base rgb, pattern (0..2) + 10 * crown
  const c = attribute('aInfo3', 'vec4');  // paint rgb, brightness
  const d = attribute('aInfo4', 'vec4');  // centre x, z, face half-width (core radius for rings), neon index
  const geo = attribute('geo', 'vec4');
  const seed = a.x, hgt = a.y, kind = a.z;
  const edge = geo.z, part = geo.w;
  const pw = positionWorld;
  const nW = normalize(normalWorld);
  const roof = smoothstep(0.6, 0.8, abs(nW.y)), wall = roof.oneMinus();
  const v = pw.y, vn = v.div(hgt);
  const h1 = hash(seed.add(1.3)), h2 = hash(seed.add(7.1)), h3 = hash(seed.add(13.7));
  const isMega = step(kind, 0.5), isSlab = step(0.5, kind).mul(step(kind, 1.5)), isBand = step(1.5, kind).mul(step(kind, 2.5));
  const isRing = step(2.5, kind).mul(step(kind, 3.5)), isTer = step(3.5, kind);
  const byKind = (mg, sl, bd, rg, tr) => isMega.mul(mg).add(isSlab.mul(sl)).add(isBand.mul(bd)).add(isRing.mul(rg)).add(isTer.mul(tr));
  const isAd = step(0.5, part).mul(step(part, 1.5)), isGap = step(1.5, part), isBody = step(part, 0.5);
  const crown = step(5, b.w), pat = b.w.sub(crown.mul(10));
  const isMega3 = step(0.15, kind).mul(isMega);
  const megaM = float(MODS).sub(isMega3);                 // modules of this megablock
  const modH = float(1).div(megaM).sub(MOD_GAP);         // normalised module body height
  const baseC = vec3(b.x, b.y, b.z), paintC = vec3(c.x, c.y, c.z);
  // (no select() anywhere in this material: TSL emits it as if/else into a temp variable, and when that is first
  // generated inside the clustered light loop of the lit path, pixels whose cluster has no light never assign it ->
  // whole towers rendered black. Selections are arithmetic masks instead.)
  let neonC = vec3(0);
  for (let i = 0; i < NEON.length; i++) neonC = neonC.add(vec3(...NEON[i]).mul(step(i - 0.5, d.w).mul(step(d.w, i + 0.5))));
  const camD = pw.sub(cameraPosition).length();
  const farDim = mix(float(1), float(0.3), smoothstep(300, 1500, camD));

  // facade coordinate u: metres along the face, increasing to the right seen from outside (angle * radius on rings)
  const tdir = normalize(vec3(nW.z, 0.0, nW.x.negate()).add(vec3(1e-4, 0, 0)));
  const rel = pw.xz.sub(d.xy);
  const u = mix(dot(rel, tdir.xz), rel.y.atan(rel.x).mul(d.z), isRing);

  // ---- window grid (mega: dense punched; slab: slits; band: ribbon glazing by room; ring: punched; terrace: residential)
  // (ring columns: an integer count around the core so the atan seam lands on a column edge)
  const ringCols = floor(d.z.mul(Math.PI * 2 / 1.8).add(0.5)).max(1.0);
  const cw = byKind(1.6, 1.2, 2.2, d.z.mul(Math.PI * 2).div(ringCols), 1.7), fh = byKind(3.0, 3.6, 3.9, 3.6, 3.1);
  const gc = vec2(u.div(cw), v.div(fh));
  const cell = floor(gc), f = fract(gc);
  // cells per pixel without derivatives: the anime lighting model can evaluate the material colour inside the
  // clustered light loop (non-uniform control flow), where fwidth / implicit-LOD sampling are undefined (black towers).
  // ~0.0009 rad per pixel at 1200 px / 55 deg; grazing faces shrink cells by 1 / |n.v|
  const viewV = cameraPosition.sub(pw).normalize();
  const graze = abs(dot(nW, viewV)).max(0.2);
  const pxM = camD.mul(0.0009);
  const fw = vec2(pxM.div(cw.mul(graze)), pxM.div(fh.mul(abs(nW.y).oneMinus().max(0.2)).mul(graze.max(0.5))));
  // distance LOD of the grid: cells under ~6 px fade to rows of light per floor, floors under ~1.5 px to a flat mean
  const aa = smoothstep(0.15, 0.35, max(fw.x, fw.y));
  const aaRow = smoothstep(0.45, 0.85, fw.y);
  const wx = byKind(0.2, 0.38, 0.02, 0.24, 0.16), wy0 = byKind(0.3, 0.34, 0.3, 0.3, 0.34), wy1 = byKind(0.22, 0.26, 0.2, 0.24, 0.16);
  const winSharp = smoothstep(wx, wx.add(0.04), f.x).mul(smoothstep(wx, wx.add(0.04), f.x.oneMinus()))
    .mul(smoothstep(wy0, wy0.add(0.04), f.y)).mul(smoothstep(wy1, wy1.add(0.04), f.y.oneMinus()));
  let win = mix(mix(winSharp, float(0.5), aa), float(0.42), aaRow).mul(isBody).mul(wall);
  // lit rooms are grouped (several cells wide), whole floors are sometimes lit or dark, and occupancy varies in
  // zones of floors, so the distant grid reads as calm rows of light instead of per-window noise
  const roomN = byKind(2, 1, 4, 2, 2);
  const hc = hash(floor(cell.x.div(roomN)).mul(17.31).add(cell.y.mul(113.7)).add(seed.mul(3.17)));
  const hf = hash(cell.y.mul(7.77).add(seed.mul(1.91)));
  const zone = hash(floor(cell.y.div(6.0)).mul(3.3).add(seed.mul(0.71)));
  const occ = mix(float(0.55), float(0.85), h2).add(isSlab.mul(0.1)).add(isBand.mul(0.2)).add(zone.sub(0.5).mul(0.35));
  const litNear = max(step(occ, hc).mul(step(hf, 0.72)), step(0.93, hf));
  const hcRow = hash(floor(cell.x.div(12.0)).mul(17.31).add(cell.y.mul(113.7)).add(seed.mul(3.17)));
  const litRow = max(step(occ, hcRow).mul(step(hf, 0.72)), step(0.93, hf));
  const lit = mix(mix(litNear, litRow, aa), float(0.38), aaRow);
  const warm = vec3(1.0, 0.72, 0.42), cool = vec3(0.7, 0.86, 1.0), white = vec3(1.0, 0.93, 0.84);
  const coolT = max(isBand, isRing);
  const wcolNear = mix(mix(warm, white, step(0.7, hc)), mix(cool, white, step(0.6, hc)), coolT);
  const wcolFar = mix(mix(warm, white, 0.3), mix(cool, white, 0.4), coolT);
  const wcol = mix(wcolNear, wcolFar, aa);
  const wBright = mix(mix(float(0.75), float(1.05), hf), float(0.9), aaRow).mul(mix(float(1), float(0.6), isBand));
  let emis = wcol.mul(lit).mul(wBright).mul(TOD.windows); // (times win, below)

  // ---- albedo
  let alb = baseC;
  // megablock supergraphics per module, in metres so they do not stretch with the facade proportions:
  // u across the face (-halfF..halfF), yl up the module body (0..modHm)
  const tm = fract(vn.mul(megaM));
  const modI = floor(vn.mul(megaM));
  const Y = clamp(tm.div(modH.mul(megaM)), 0, 1);
  const topMod = step(megaM.sub(1.5), modI);
  const halfF = d.z.mul(mix(float(1), float(MEGA3_TOP), isMega3.mul(topMod)));
  const modHm = hgt.mul(modH), yl = Y.mul(modHm);
  const off = hash(modI.add(seed));
  const diag = step(fract(u.add(yl.mul(0.9)).div(halfF.mul(1.1)).add(off)), 0.22);
  const mg = halfF.mul(0.14), th = halfF.mul(0.16);
  const inner = step(abs(u), halfF.sub(mg)).mul(step(mg, yl)).mul(step(yl, modHm.sub(mg)));
  const frame = inner.mul(max(step(halfF.sub(mg).sub(th), abs(u)), max(step(yl, mg.add(th)), step(modHm.sub(mg).sub(th), yl))));
  const bs = halfF.mul(0.45);
  const blocks = step(0.74, hash(floor(u.div(bs)).add(floor(yl.div(bs)).mul(7.0)).add(modI.mul(13.0)).add(seed)));
  const sg = mix(mix(blocks, max(frame, diag.mul(step(Y, 0.45))), step(pat, 1.5)), diag, step(pat, 0.5));
  // block number box on the top module (upper right of every face) with a clean dark plate behind it
  const Hd = min(halfF.mul(1.0), hgt.mul(0.11)), Wd = Hd.mul(0.5);
  const right = halfF.mul(0.86), left = right.sub(Wd.mul(2));
  const top = hgt.mul(1 - MOD_GAP).sub(Hd.mul(0.3));
  const nx = u.sub(left).div(Wd.mul(2)), ny = v.sub(top.sub(Hd)).div(Hd);
  const inBox = step(0.0, nx).mul(step(nx, 1.0)).mul(step(0.0, ny)).mul(step(ny, 1.0));
  const plate = step(-0.12, nx).mul(step(nx, 1.12)).mul(step(-0.12, ny)).mul(step(ny, 1.1)).mul(topMod).mul(isMega).mul(isBody).mul(wall);
  const paintM = sg.mul(isMega).mul(isBody).mul(wall).mul(plate.oneMinus());
  alb = mix(alb, paintC, paintM);
  win = win.mul(paintM.oneMinus()).mul(plate.oneMinus()); // painted panels are windowless so they read from far away
  alb = mix(alb, vec3(0.03, 0.032, 0.036), plate);
  // terrace: pale balcony slab lines; slab: dark vertical fins; band: lighter spandrel bands every few floors
  const balc = step(f.y, 0.12).mul(isTer).mul(isBody).mul(wall);
  alb = mix(alb, vec3(0.62, 0.6, 0.56), balc.mul(0.7));
  const fin = step(fract(u.div(1.2)), 0.18).mul(isSlab).mul(wall);
  alb = mix(alb, alb.mul(0.5), fin);
  // band towers: continuous glass with a sky reflection gradient and diagonal anime reflection streaks, plus thin
  // lighter spandrel bands every few floors
  const glassT = isBand.mul(wall).mul(isBody);
  const skyRefl = mix(vec3(0.1, 0.15, 0.24), vec3(0.3, 0.42, 0.52), smoothstep(0.15, 1.0, vn));
  alb = mix(alb, mix(alb, skyRefl, 0.55), glassT);
  const streak = step(fract(u.add(v.mul(0.55)).div(d.z.mul(2.4)).add(h1)), 0.14).add(step(fract(u.add(v.mul(0.55)).div(d.z.mul(2.4)).add(h1).add(0.2)), 0.04));
  const streakSeg = step(0.45, hash(floor(v.div(d.z.mul(2.5))).add(seed.mul(1.7))));
  alb = mix(alb, vec3(0.5, 0.62, 0.7), clamp(streak, 0, 1).mul(streakSeg).mul(glassT).mul(0.45));
  const bandY = step(fract(v.div(fh.mul(mix(float(6), float(10), h1)))), 0.1).mul(glassT);
  alb = mix(alb, vec3(0.36, 0.44, 0.5), bandY.mul(0.5));
  // unlit glass is dark (punched windows read as a grid in daylight too)
  emis = emis.mul(win);
  alb = mix(alb, alb.mul(0.4).add(vec3(0.01, 0.012, 0.018)), win.mul(lit.oneMinus()).mul(byKind(0.85, 0.85, 0.35, 0.8, 0.8)));
  alb = mix(alb, alb.add(vec3(0.15, 0.13, 0.1)).mul(1.2), win.mul(lit)); // lit room albedo (so dusk windows read warm)
  // block number glyphs
  const tens = floor(a.w.div(10));
  const digit = mix(a.w.sub(tens.mul(10)), tens, step(nx, 0.5));
  const glyph = texture(digits, vec2(digit.add(clamp(fract(nx.mul(2.0)), 0.02, 0.98)).div(10), clamp(ny, 0.0, 1.0))).level(camD.div(300).clamp(0, 4)).r
    .mul(inBox).mul(plate);
  alb = mix(alb, vec3(0.86, 0.85, 0.8), glyph);
  emis = emis.mul(glyph.oneMinus()).add(vec3(0.9, 0.92, 0.95).mul(glyph).mul(0.55).mul(TOD.neon));
  // floodlights on the module ledges wash each megablock module upward (keeps the supergraphics readable at night)
  const wash = Y.oneMinus().pow(3.0).mul(isMega).mul(isBody).mul(wall).mul(paintM.mul(0.7).add(0.3));
  emis = emis.add(alb.mul(wash).mul(0.55).mul(TOD.neon));
  // slab: orange vents
  const vu = fract(u.div(2.4)), vv = fract(v.div(7.0));
  const vent = step(0.93, hash(floor(u.div(2.4)).add(floor(v.div(7.0)).mul(31.0)).add(seed)))
    .mul(step(0.3, vu)).mul(step(vu, 0.8)).mul(step(0.25, vv)).mul(step(vv, 0.55)).mul(isSlab).mul(isBody).mul(wall);
  emis = emis.add(vec3(1.0, 0.42, 0.08).mul(vent).mul(0.9).mul(TOD.windows.mul(0.5).add(0.5)));
  // recesses: deep shadow, a thin neon line at mid-height on half the megablocks
  alb = mix(alb, vec3(0.02, 0.022, 0.028), isGap);
  const gapMid = float(1).sub(megaM.mul(MOD_GAP * 0.5));
  const gline = smoothstep(0.014, 0.004, abs(tm.sub(gapMid))).mul(isMega).mul(step(0.6, h3));
  emis = emis.mul(isGap.oneMinus()).add(neonC.mul(isGap).mul(gline).mul(wall).mul(1.4).mul(TOD.neon));
  // ad rings: banner art (top / bottom half of the wide atlas per ring) scrolling slowly around the tower
  const ringRow = floor(vn.mul(10.0));
  const adUV = vec2(fract(geo.x.mul(3.0).add(time.mul(0.008)).add(h1)), geo.y.mul(0.5).add(step(0.5, hash(seed.add(ringRow))).mul(0.5)));
  const ad = texture(adsTex, adUV).level(camD.div(220).add(0.5).clamp(0, 5)).rgb;
  emis = mix(emis, ad.mul(1.4).mul(TOD.neon), isAd);
  alb = mix(alb, vec3(0.02), isAd);
  // vertical neon edges on some band / ring towers (upper two thirds) and a crown light band
  const edgeD = min(edge, edge.oneMinus());
  const hasNeon = max(isBand, isRing).mul(step(0.75, h3)).mul(wall).mul(isBody);
  const strip = smoothstep(0.02, 0.008, edgeD).mul(hasNeon).mul(smoothstep(0.35, 0.37, vn));
  emis = emis.add(neonC.mul(strip).mul(2.0).mul(TOD.neon));
  const crownB = smoothstep(hgt.sub(6.0), hgt.sub(5.0), v).mul(smoothstep(hgt.sub(1.5), hgt.sub(2.5), v)).mul(crown).mul(wall).mul(isBody);
  emis = emis.add(neonC.mul(crownB).mul(2.4).mul(TOD.neon));
  emis = emis.mul(farDim).mul(c.w);
  // roofs: dark
  alb = mix(alb, vec3(0.06, 0.06, 0.065), roof.mul(isGap.oneMinus()));
  m.colorNode = alb;
  m.roughnessNode = mix(float(0.6), float(0.25), isBand);
  m.metalnessNode = mix(float(0.05), float(0.35), isBand);
  m.emissiveNode = emis;
  m.animeFloor = 0.05; m.animeSpecTh = 1.5;
  return m;
}

// ---------------------------------------------------------------------------------------------- build
export function buildSkyline2(ctx, tex, root) {
  const S = ctx.layout.skyline;
  const R = ctx.layout.river;
  const rng = mulberry32(90210);
  const towers = [];
  const pick = () => {
    const r = rng();
    return r < 0.17 ? 'mega' : r < 0.3 ? 'mega3' : r < 0.48 ? 'band' : r < 0.63 ? 'slab' : r < 0.69 ? 'ring' : r < 0.75 ? 'ring3' : r < 0.9 ? 'terrace' : 'needle';
  };
  // per-type proportions: megablocks are wide and squat (megastructures, not pencil towers)
  const shape = (type, w, d, h) => {
    if (family(type) === 'mega') { w *= 1.45; d *= 1.3; const m = Math.max(w, d); h = THREE.MathUtils.clamp(h * 0.75, 1.4 * m, 3.2 * m); }
    else if (type === 'needle') h *= 1.15;
    else if (type === 'terrace') h = Math.min(h, 3 * Math.max(w, d));
    return [w, d, h];
  };
  const tryAdd = (x, z, w, d, h) => {
    const type = pick();
    const [w2, d2, h2] = shape(type, w, d, h);
    if (blocked(x, z, Math.max(w2, d2) * 0.6)) return false;
    add(x, z, w2, d2, h2, type);
    return true;
  };
  const rail = ctx.layout.elevatedRail, exw = ctx.layout.expressway;
  const blocked = (x, z, r) => {
    if (x > -215 - r && x < 148 + r && z > -440 - r && z < 75 + r) return true;
    if (x > R.xCenter - R.halfWidth - 8 - r && x < R.xCenter + R.halfWidth + 10 + r) return true;
    if (Math.abs(z - rail.z) < 10 + r) return true;
    if (Math.abs(z - exw.z) < 14 + r) return true;
    if (Math.abs(z - ctx.layout.bridges[0].z) < 14 + r && x < 270) return true;
    for (const t of towers) { const dx = t.x - x, dz = t.z - z; if (dx * dx + dz * dz < (t.r + r + 6) ** 2) return true; }
    return false;
  };
  const add = (x, z, w, d, h, type, opts = {}) => {
    const t = {
      x, z, w, d, h, type, r: Math.max(w, d) * 0.6, rot: opts.rot ?? (rng() < 0.75 ? 0 : rng() * Math.PI),
      neon: opts.neon ?? NEON_PICK[Math.floor(rng() * NEON_PICK.length)], crown: opts.crown ?? (rng() < 0.15 ? 1 : 0), spire: opts.spire ?? (type === 'needle' || rng() < 0.15),
      seed: rng() * 100, bright: opts.bright ?? (0.4 + rng() * 0.7), base: Math.floor(rng() * BASES.length), paint: Math.floor(rng() * PAINTS.length),
      pattern: rng(), number: 1 + Math.floor(rng() * 98), // (08 is skipped below: it is the 2077 megabuilding's number)
    };
    if (t.number === 8) t.number = 18;
    if (type === 'band') t.base = rng() < 0.6 ? 1 : 5; // blue glass or dark glass
    if (family(type) === 'mega') {
      t.base = MEGA_BASES[Math.floor(rng() * MEGA_BASES.length)];
      t.paint = MEGA_PAINTS[Math.floor(rng() * MEGA_PAINTS.length)];
      if (Math.abs(lum(BASES[t.base]) - lum(PAINTS[t.paint])) < 0.1) t.paint = lum(BASES[t.base]) > 0.25 ? 0 : 1; // keep contrast
    }
    // holo ad candidates of skyline.js: big flat-faced unrotated towers
    t.holoOK = t.rot === 0 && (type === 'mega' || type === 'slab' || type === 'terrace');
    towers.push(t);
    return t;
  };
  // hero towers keep the footprints the hand-placed holograms of skyline.js are aligned to
  // (types chosen so the facade each hologram sits on is flat and just behind it)
  // (the facade each hologram sits on is flat and 0.8-1.5 m behind it: x/z extents below are fixed by that)
  add(268, -330, 46, 70, 230, 'mega', { rot: 0, neon: 0, crown: 1, spire: true });       // west face x 245 (holo 244.2)
  add(330, -470, 70, 40, 280, 'mega', { rot: 0, neon: 1, crown: 1, spire: true });       // south face z -450 (holo -449)
  add(255, -120, 33, 30, 170, 'slab', { rot: 0, neon: 3 });                               // west face x 238.5 (holo 237.6)
  add(300, -40, 36, 32, 210, 'slab', { rot: 0, neon: 2, crown: 1, spire: true });        // west face x 282 (holo 280.5)
  add(250, 40, 40, 44, 120, 'mega3', { rot: 0, neon: 3 });
  add(380, -250, 44, 44, 420, 'band', { rot: 0.4, neon: 1, crown: 1, spire: true });
  add(60, -620, 84, 46, 340, 'mega', { rot: 0, neon: 0, crown: 1, spire: true });        // south face z -597 (holo -596)
  add(-120, -560, 64, 38, 280, 'mega', { rot: 0.3, neon: 1, crown: 1, spire: true });    // rotated south face 1 m behind holo
  add(180, -760, 44, 41, 440, 'slab', { rot: 0, neon: 5, crown: 1, spire: true });       // south face z -739.5 (holo -738)
  add(420, -60, 46, 46, 260, 'ring', { rot: 0, neon: 1, crown: 1 });
  for (let i = 0; i < 400 && towers.length < 70; i++) {
    const x = 240 + rng() * 220, z = 120 - rng() * 920;
    const w = 20 + rng() * 26, d = 20 + rng() * 22;
    tryAdd(x, z, w, d, x < 300 ? 50 + rng() * 120 : 80 + rng() * 220);
  }
  for (let i = 0; i < 600 && towers.length < 130; i++) {
    const x = -450 + rng() * 900, z = -440 - rng() * 500;
    const w = 24 + rng() * 32, d = 24 + rng() * 32;
    tryAdd(x, z, w * 0.85, d * 0.85, 40 + rng() * Math.min(300, 40 + (-z - 440) * 0.6));
  }
  for (let i = 0; i < 400 && towers.length < 185; i++) {
    const x = -230 - rng() * 250, z = 150 - rng() * 600;
    const w = 22 + rng() * 28, d = 22 + rng() * 28;
    tryAdd(x, z, w, d, 50 + rng() * 170);
  }
  let placed = 0;
  for (let i = 0; i < 3000 && placed < S.count; i++) {
    let ang = rng() * Math.PI * 2;
    if (rng() < 0.55) ang = -Math.PI * 0.5 + (rng() - 0.5) * Math.PI * 1.1;
    const rad = S.innerRadius + Math.pow(rng(), 0.8) * (S.outerRadius - S.innerRadius);
    const x = Math.cos(ang) * rad + 100, z = Math.sin(ang) * rad - 150;
    const w = 34 + rng() * 56, d = 34 + rng() * 56;
    const hh = S.megaTowerHeight[0] + Math.pow(rng(), 1.5) * (S.megaTowerHeight[1] - S.megaTowerHeight[0]);
    if (tryAdd(x, z, w, d, hh)) placed++;
  }

  // ---- instanced towers
  const geos = towerGeos();
  const digits = digitTexture();
  const mat = towerMaterial(tex.ads2 || tex.ads, digits);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  for (const name of Object.keys(geos)) {
    const list = towers.filter((t) => t.type === name);
    if (!list.length) continue;
    const g = geos[name].clone();
    const A = new Float32Array(list.length * 4), B = new Float32Array(list.length * 4), C = new Float32Array(list.length * 4), D = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, t.rot); p.set(t.x, 0, t.z); s.set(t.w, t.h, t.d);
      m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
      const bc = BASES[t.base], pc = PAINTS[t.paint];
      const half = family(t.type) === 'ring' ? 0.42 * t.w : 0.5 * Math.min(t.w, t.d);
      A.set([t.seed, t.h, KIND[t.type], t.number], i * 4);
      B.set([bc[0], bc[1], bc[2], Math.floor(t.pattern * 3) + 10 * t.crown], i * 4);
      C.set([pc[0], pc[1], pc[2], t.bright], i * 4);
      D.set([t.x, t.z, half, t.neon], i * 4);
    });
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(A, 4));
    g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(B, 4));
    g.setAttribute('aInfo3', new THREE.InstancedBufferAttribute(C, 4));
    g.setAttribute('aInfo4', new THREE.InstancedBufferAttribute(D, 4));
    mesh.computeBoundingSphere();
    mesh.name = 'skyline2_' + name;
    root.add(mesh);
  }

  // ---- sky bridges between close neighbours of similar height (lit strip windows, dark body)
  const bridges = [];
  for (let i = 0; i < towers.length; i++) {
    const a0 = towers[i];
    if (a0.type === 'needle' || family(a0.type) === 'ring') continue;
    for (let j = i + 1; j < towers.length && bridges.length < 70; j++) {
      const b0 = towers[j];
      if (b0.type === 'needle' || family(b0.type) === 'ring') continue;
      const dx = b0.x - a0.x, dz = b0.z - a0.z, dist = Math.hypot(dx, dz);
      const gapLen = dist - (a0.r + b0.r) * 0.8;
      if (gapLen < 8 || gapLen > 70) continue;
      const hMax = Math.min(a0.h, b0.h) * 0.85;
      if (hMax < 50) continue;
      const n = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const br = { ax: a0.x, az: a0.z, bx: b0.x, bz: b0.z, y: hMax * (0.35 + rng() * 0.55), w: 5 + rng() * 4, h: 4 + rng() * 3 };
        // reject spans that would pass through a third tower taller than the bridge
        const hit = towers.some((t) => {
          if (t === a0 || t === b0 || t.h < br.y) return false;
          const L2 = dx * dx + dz * dz, k2 = Math.max(0, Math.min(1, ((t.x - a0.x) * dx + (t.z - a0.z) * dz) / L2));
          return Math.hypot(a0.x + dx * k2 - t.x, a0.z + dz * k2 - t.z) < Math.hypot(t.w, t.d) * 0.5 + br.w;
        });
        if (!hit) bridges.push(br);
      }
    }
  }
  if (bridges.length) {
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const bm = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.3 });
    const side = smoothstep(0.7, 0.6, abs(normalize(normalWorld).y));
    const strip = smoothstep(0.42, 0.46, uv().y).mul(smoothstep(0.78, 0.74, uv().y)).mul(step(0.3, fract(positionWorld.x.add(positionWorld.z).div(3.0)))).mul(side);
    bm.colorNode = vec3(0.08, 0.09, 0.11);
    bm.emissiveNode = vec3(1.0, 0.88, 0.7).mul(strip).mul(0.9).mul(TOD.windows);
    bm.animeFloor = 0.05;
    const bmesh = new THREE.InstancedMesh(bg, bm, bridges.length);
    bridges.forEach((br, i) => {
      const dx = br.bx - br.ax, dz = br.bz - br.az, L = Math.hypot(dx, dz);
      q.setFromAxisAngle(yAxis, Math.atan2(dx, dz)); p.set((br.ax + br.bx) / 2, br.y, (br.az + br.bz) / 2); s.set(br.w, br.h, L);
      m4.compose(p, q, s); bmesh.setMatrixAt(i, m4);
    });
    bmesh.computeBoundingSphere(); bmesh.name = 'skyline2_bridges';
    root.add(bmesh);
  }

  // ---- spires + aircraft warning lights
  const spireTowers = towers.filter((t) => t.spire);
  const spireGeo = new THREE.CylinderGeometry(0.25, 1.2, 1, 6); spireGeo.translate(0, 0.5, 0);
  const spireMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.8 });
  const spires = new THREE.InstancedMesh(spireGeo, spireMat, Math.max(1, spireTowers.length));
  const beacons = [];
  spireTowers.forEach((t, i) => {
    const sh = 20 + (t.seed % 1) * 50 + t.h * 0.08;
    p.set(t.x, t.h, t.z); s.set(1, sh, 1); q.identity(); m4.compose(p, q, s); spires.setMatrixAt(i, m4);
    beacons.push([t.x, t.h + sh, t.z, t.seed]);
  });
  root.add(spires);
  if (beacons.length) {
    const bGeo = new THREE.OctahedronGeometry(1, 0);
    const bPhase = new Float32Array(beacons.length);
    const bMesh = new THREE.InstancedMesh(bGeo, null, beacons.length);
    beacons.forEach((bb, i) => {
      const sc = 0.5 + Math.hypot(bb[0], bb[2]) / 1100;
      p.set(bb[0], bb[1], bb[2]); s.set(sc, sc, sc); q.identity(); m4.compose(p, q, s); bMesh.setMatrixAt(i, m4);
      bPhase[i] = (bb[3] * 0.37) % 1;
    });
    bGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(bPhase, 1));
    const bMat = new THREE.MeshBasicNodeMaterial();
    const ph = attribute('aPhase', 'float');
    const blink = smoothstep(0.55, 0.6, fract(time.mul(0.75).add(ph))).mul(smoothstep(1.0, 0.9, fract(time.mul(0.75).add(ph))));
    bMat.colorNode = vec3(1.0, 0.02, 0.01).mul(mix(float(0.6), float(30), blink));
    bMat.fog = false;
    bMesh.material = bMat;
    root.add(bMesh);
  }

  buildHolos(ctx, tex, root, towers);
  return { towers };
}
