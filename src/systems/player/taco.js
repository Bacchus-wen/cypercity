// EL FARO taco truck (restyle map + DUSKLINE interface): a step-van food truck parked at the south kerb of the second
// cross street. Serving hatch with a lit kitchen, a menu board, festoon bulbs along the propped awning, a roof
// lightbox and a turning lighthouse lamp (el faro). On foot by the hatch: F buys tacos (40 CR) and tops your vitals
// up to 100. A small queue stands at the kerb (crowd/agents.js; the walker lane pinches past it).
import * as THREE from 'three/webgpu';
import { uv, vec3, time, sin, texture, step, fract, abs, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TACO_PRICE = 40;
export const tacoEnabled = (L) => !!L?.tacoTruck && (typeof location === 'undefined' || new URLSearchParams(location.search).get('ui') !== 'legacy');

// geometry facts shared with the crowd (queue) and the parking / pole skips
export function tacoSpot(L) {
  const T = L.tacoTruck, C = L.crossStreets, c = C.zs[T.street];
  const kerbZ = c + C.roadHalfWidth; // south kerb of that cross street
  return { x: T.x, z: kerbZ - T.w / 2 - 0.05, kerbZ, len: T.len, w: T.w, hatch: [T.x + 0.9, kerbZ + 0.7] }; // (hatch centre: local x 0.9 on the sidewalk side)
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const HEAD = '"Avenir Next Condensed", "DIN Condensed", Impact, sans-serif';

export function buildTacoTruck(ctx, root) {
  const L = ctx.layout;
  if (!tacoEnabled(L)) return null;
  const S = tacoSpot(L), len = S.len, w = S.w, H = 2.75;
  const g = new THREE.Group(); g.name = 'el_faro_truck';
  g.position.set(S.x, 0, S.z); // local: +x = truck rear, -x = cab, +z = sidewalk (hatch side)
  const std = (color, r = 0.5, m = 0.2) => { const mt = new THREE.MeshStandardNodeMaterial({ color, roughness: r, metalness: m }); mt.animeRim = 1; return mt; };
  const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };
  const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
  const boxL = len - 1.5, bx = 0.75; // box body (rear part), cab in front (-x)
  // body: cream box with a red belt, graphite cab and skirt
  add(mergeGeometries([box(boxL, H - 0.55, w, bx, 0.55 + (H - 0.55) / 2, 0)]), std(0xece5d6, 0.55, 0.1));
  add(mergeGeometries([box(1.5, 1.55, w * 0.98, -len / 2 + 0.75, 0.55 + 0.78, 0), box(len, 0.32, w * 0.96, 0, 0.42, 0)]), std(0x1c1d22, 0.45, 0.4));
  add(box(boxL + 0.02, 0.22, w + 0.02, bx, 1.05, 0), std(0xc81e2c, 0.4, 0.2));
  add(box(0.06, 0.7, w * 0.86, -len / 2 - 0.01, 1.62, 0), glow([0.05, 0.07, 0.09], 1)); // windscreen (dark)
  // wheels
  const tyre = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16).rotateX(Math.PI / 2);
  for (const ax of [-len / 2 + 1.0, len / 2 - 1.1]) for (const s of [-1, 1]) { const m = add(tyre, std(0x0b0b0c, 0.85, 0)); m.position.set(ax, 0.38, s * (w / 2 - 0.12)); }
  // serving hatch (sidewalk side): lit kitchen behind a counter, the flap propped up as an awning
  const hw = 2.4, hx = bx + 0.15, hy0 = 1.15, hh = 1.05;
  const km = new THREE.MeshBasicNodeMaterial(); km.lineMask = 1;
  const ku = uv();
  const shelf = step(0.62, ku.y).mul(step(ku.y, 0.66)).add(step(0.3, ku.y).mul(step(ku.y, 0.33)));
  const steam = smoothstep(0.6, 1.0, sin(ku.x.mul(9).add(time.mul(1.3))).mul(0.5).add(0.5)).mul(smoothstep(0.4, 0.9, ku.y)).mul(0.25);
  km.colorNode = vec3(1.0, 0.78, 0.48).mul(ku.y.mul(0.6).add(0.55)).mul(shelf.mul(-0.6).add(1)).add(vec3(1, 1, 1).mul(steam));
  const kitchen = add(new THREE.PlaneGeometry(hw, hh), km); kitchen.position.set(hx, hy0 + hh / 2, w / 2 + 0.005);
  add(box(hw + 0.1, 0.08, 0.32, hx, hy0, w / 2 + 0.14), std(0xb7b9bc, 0.3, 0.9)); // steel counter
  const flap = add(box(hw + 0.1, 0.05, 0.95, 0, 0, 0.47), std(0xc81e2c, 0.45, 0.2));
  flap.position.set(hx, hy0 + hh + 0.02, w / 2); flap.rotation.x = -0.28;
  // festoon bulbs along the flap's edge
  const bulbs = [];
  for (let i = 0; i < 9; i++) bulbs.push(new THREE.SphereGeometry(0.045, 6, 4).translate(hx - hw / 2 + 0.1 + i * (hw - 0.2) / 8, hy0 + hh - 0.24 - Math.sin((i / 8) * Math.PI) * 0.05, w / 2 + 0.93));
  add(mergeGeometries(bulbs), glow([1.0, 0.82, 0.55], 4.5));
  // menu board beside the hatch + EL FARO lightbox on the roof (both faces) + side livery
  const menu = canvasTex(512, 384, (c, W, Hh) => {
    c.fillStyle = '#14151a'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#ffb547'; c.font = `900 italic 64px ${HEAD}`; c.fillText('MENU', 26, 70);
    c.font = `700 40px ${HEAD}`;
    [['TACOS AL PASTOR', TACO_PRICE], ['CARNITAS', TACO_PRICE], ['ELOTE', 25], ['HORCHATA', 15]].forEach(([n, p], i) => {
      c.fillStyle = '#f2ede4'; c.fillText(n, 26, 140 + i * 62); c.fillStyle = '#ff3d5a'; c.textAlign = 'right'; c.fillText(`${p} CR`, W - 24, 140 + i * 62); c.textAlign = 'left';
    });
  });
  const mm = new THREE.MeshBasicNodeMaterial(); mm.colorNode = texture(menu).rgb.mul(1.3); mm.lineMask = 1;
  const mb = add(new THREE.PlaneGeometry(0.9, 0.68), mm); mb.position.set(hx + hw / 2 + 0.62, 1.75, w / 2 + 0.006);
  const logo = canvasTex(1024, 256, (c, W, Hh) => {
    c.fillStyle = '#c81e2c'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#f2ede4'; c.font = `900 italic 170px ${HEAD}`; c.textBaseline = 'middle'; c.fillText('EL FARO', 150, Hh / 2 + 8);
    // little lighthouse with beams
    c.fillStyle = '#ffb547'; c.beginPath(); c.moveTo(60, 220); c.lineTo(78, 70); c.lineTo(102, 70); c.lineTo(120, 220); c.fill();
    c.fillRect(70, 40, 40, 30); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(110, 55); c.lineTo(150, 30); c.lineTo(150, 80); c.fill();
    c.font = `700 40px ${HEAD}`; c.fillStyle = '#ffd08a'; c.fillText('TACOS · ALL NIGHT · SOLANO HTS', 640, Hh - 40);
  });
  const lm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); lm.colorNode = texture(logo).rgb.mul(sin(time.mul(2.1)).mul(0.05).add(1.35)); lm.lineMask = 1;
  const sign = add(new THREE.PlaneGeometry(2.6, 0.65), lm); sign.position.set(bx + 0.2, H + 0.42, 0);
  sign.rotation.y = 0; // (faces +z = the sidewalk; DoubleSide for the street)
  add(box(2.7, 0.08, 0.12, bx + 0.2, H + 0.06, 0), std(0x1c1d22, 0.5, 0.6));
  const sideLogo = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }); sideLogo.colorNode = texture(logo).rgb; sideLogo.emissiveNode = texture(logo).rgb.mul(0.12);
  const sl = add(new THREE.PlaneGeometry(2.6, 0.65), sideLogo); sl.position.set(bx + 0.4, 1.65, -w / 2 - 0.006); sl.rotation.y = Math.PI; // street side
  // the lighthouse lamp: a short mast, a lamp head and a turning beam cone
  add(box(0.12, 0.5, 0.12, -len / 2 + 2.0, H + 0.25, 0), std(0x1c1d22, 0.5, 0.6));
  add(new THREE.SphereGeometry(0.16, 10, 8).translate(-len / 2 + 2.0, H + 0.58, 0), glow([1.0, 0.9, 0.7], 6));
  const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const bu = uv();
  bm.colorNode = vec3(1.0, 0.85, 0.55).mul(smoothstep(0.0, 1.0, bu.y).mul(0.18)).mul(smoothstep(0.5, 0.2, abs(fract(bu.x.mul(2)).sub(0.5))));
  bm.fog = false; bm.lineMask = 1;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4.0, 16, 1, true).rotateZ(Math.PI / 2).translate(2.0, 0, 0), bm);
  beam.position.set(-len / 2 + 2.0, H + 0.58, 0); beam.renderOrder = 6; g.add(beam);
  const pl = new THREE.PointLight(0xffc98a, 14, 7, 1.8); pl.position.set(hx, hy0 + 0.6, w / 2 + 1.0); g.add(pl);
  root.add(g);
  // solid body
  const { RAPIER, world } = ctx.physics;
  world.createCollider(RAPIER.ColliderDesc.cuboid(len / 2, H / 2, w / 2).setTranslation(S.x, H / 2, S.z));
  console.log('[landmarks] EL FARO taco truck');
  return { update(dt) { beam.rotation.y += dt * 1.4; } };
}

// gameplay: F at the hatch buys tacos (DUSKLINE interface only)
export class TacoTruck {
  constructor(ctx, hud) { this.ctx = ctx; this.hud = hud; this.S = tacoSpot(ctx.layout); }
  near(feet) { const [hx, hz] = this.S.hatch; return Math.hypot(feet.x - hx, feet.z - hz) < 2.2 && Math.abs(feet.y) < 1.2; }
  prompt(credits) { return { key: 'F', text: credits >= TACO_PRICE ? `TACOS · ${TACO_PRICE} CR` : `NEED ${TACO_PRICE} CR`, sub: 'EL FARO' }; }
  buy(credits) {
    if (credits < TACO_PRICE) { this.hud.toast({ k: 'EL FARO', h: 'NOT ENOUGH CR', body: `<span><b>${TACO_PRICE}</b>CR A PLATE</span>` }, 2400); return 0; }
    this.hud.toast({ k: 'EL FARO · TACOS AL PASTOR', h: 'VITALS FULL', body: `<span><b>−${TACO_PRICE}</b>CR</span><span>“Extra salsa, on the house.”</span>` }, 3200);
    return TACO_PRICE;
  }
  pois() { return [{ x: this.S.x, z: this.S.z, color: '#ffb547' }]; }
}
