// SOLANO SPRAY (restyle map + DUSKLINE interface): a drive-in respray bay on Crosstown - something to spend the CR on.
// Pull any car onto the striped pad under the canopy and stop: G resprays it (500 CR), cycling the paint through the
// hue variants the fleet's textured cars support (fleet.js carHue). A magenta mist puffs around the car.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, time, sin, fract, step, mix, texture, abs } from 'three/tsl';

export const SPRAY_PRICE = 500;
// the bay exists only with its gameplay: restyle map + DUSKLINE interface (?ui=legacy: no booth, original parking)
export const sprayEnabled = (L) => !!L?.spray && (typeof location === 'undefined' || new URLSearchParams(location.search).get('ui') !== 'legacy');
const HUES = [0, 2.1, -2.1, 1.05, -1.05, 3.14, 0.55, -0.55];
const HUE_NAMES = ['FACTORY', 'TEAL', 'GRAPE', 'LIME', 'ROSE', 'COBALT', 'TANGERINE', 'BLUSH'];
// (untextured / fallback models use the paint colour instead of the hue)
const PAINTS = [null, 0x0fa3a3, 0x5b2a86, 0x7ac142, 0xd6336c, 0x1f4fbf, 0xf08a24, 0xe8a0b4];

function signTex() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0b10'; g.fillRect(0, 0, 1024, 160);
  g.font = '900 italic 104px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = '#ff3d9a'; g.fillText('SOLANO', 30, 84);
  g.fillStyle = '#3be8ff'; g.fillText('SPRAY', 420, 84);
  g.font = '700 34px "DIN Condensed", "Avenir Next Condensed", sans-serif'; g.fillStyle = '#f2ede4';
  g.fillText('DRIVE IN · 500 CR · ANY RIDE', 700, 60); g.fillText('OPEN ALL NIGHT', 700, 108);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// the booth itself is street furniture: built by the landmarks system (also in screenshot mode)
export function buildSprayBooth(ctx, root) {
  const S = ctx.layout.spray;
  if (!sprayEnabled(ctx.layout)) return null;
  const booth = {};
  const g = new THREE.Group(); g.name = 'solano_spray';
    const kerbZ = S.kerbZ, x0 = S.x - S.len / 2, x1 = S.x + S.len / 2;
    // pad: magenta / cyan chevrons scrolling toward the canopy, bright border
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const u = uv();
    const chev = step(0.55, fract(u.x.mul(6).add(abs(u.y.sub(0.5)).mul(1.6)).sub(time.mul(0.8))));
    const border = step(0.94, abs(u.x.sub(0.5)).mul(2)).max(step(0.88, abs(u.y.sub(0.5)).mul(2)));
    pm.colorNode = mix(vec3(1.0, 0.24, 0.6).mul(chev.mul(0.9).add(0.15)), vec3(0.23, 0.9, 1.0).mul(2.2), border);
    pm.opacityNode = border.max(chev.mul(0.55)).max(0.12);
    pm.lineMask = 1;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(S.len, S.w).rotateX(-Math.PI / 2), pm);
    pad.position.set(S.x, 0.03, S.z); pad.renderOrder = 2; g.add(pad);
    // canopy cantilevered from two sidewalk posts over the pad (no posts on the road side: traffic passes)
    const steel = new THREE.MeshStandardNodeMaterial({ color: 0x1c1d22, roughness: 0.45, metalness: 0.7 });
    const zPost = kerbZ + 0.6, zEdge = S.z - S.w / 2 + 0.2, cz = (zPost + zEdge) / 2, depth = Math.abs(zPost - zEdge) + 0.4, H = 3.8;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    for (const px of [x0 + 0.4, x1 - 0.4]) add(new THREE.BoxGeometry(0.22, H, 0.22), steel, px, H / 2, zPost);
    add(new THREE.BoxGeometry(S.len + 0.6, 0.28, depth), steel, S.x, H, cz);
    // sign fascia along the road edge (facing the street) + both ends
    const sm = new THREE.MeshBasicNodeMaterial(); sm.colorNode = texture(signTex()).rgb.mul(sin(time.mul(2.3)).mul(0.06).add(1.5)); sm.lineMask = 1;
    const fas = add(new THREE.PlaneGeometry(S.len + 0.6, (S.len + 0.6) * 160 / 1024), sm, S.x, H + 0.55, zEdge - 0.21);
    fas.rotation.y = Math.PI; // (faces -z, the street side)
    add(new THREE.BoxGeometry(S.len + 0.7, (S.len + 0.6) * 160 / 1024 + 0.1, 0.12), steel, S.x, H + 0.55, zEdge - 0.13);
    // LED edge + spray nozzles under the canopy
    const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };
    add(new THREE.BoxGeometry(S.len + 0.6, 0.06, 0.06), glow([1.0, 0.24, 0.6], 3.5), S.x, H - 0.16, zEdge);
    const nz = [];
    for (let k = 0; k < 5; k++) nz.push(new THREE.CylinderGeometry(0.06, 0.1, 0.22, 8).translate(x0 + 0.9 + k * (S.len - 1.8) / 4, H - 0.25, S.z));
    // mist puff (shown for ~1.4 s after a respray)
    const mm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mu = uv();
    const n = fract(sin(vec2(mu.x.mul(40).floor(), mu.y.mul(20).floor().add(time.mul(9).floor())).dot(vec2(12.9898, 78.233))).mul(43758.5));
    mm.colorNode = vec3(1.0, 0.3, 0.75).mul(n.mul(0.5).add(0.3));
    mm.opacity = 0; mm.lineMask = 1;
    const mist = add(new THREE.BoxGeometry(S.len * 0.9, 2.2, S.w * 0.95), mm, S.x, 1.1, S.z);
    mist.visible = false; let mistT = 0;
    for (const geo of nz) add(geo, glow([0.9, 0.95, 1.0], 2.0), 0, 0, 0);
    root.add(g);
    // posts are solid
    const { RAPIER, world } = ctx.physics;
    for (const px of [x0 + 0.4, x1 - 0.4]) world.createCollider(RAPIER.ColliderDesc.cuboid(0.11, H / 2, 0.11).setTranslation(px, H / 2, zPost));
    booth.puff = () => { mist.visible = true; mistT = 0; };
    booth.update = (dt) => {
      if (!mist.visible) return;
      mistT += dt;
      const k = mistT < 0.25 ? mistT / 0.25 : Math.max(0, 1 - (mistT - 0.25) / 1.2);
      mm.opacity = 0.38 * k;
      mist.scale.setScalar(1 + mistT * 0.15);
      if (mistT > 1.5) mist.visible = false;
    };
    console.log('[landmarks] SOLANO SPRAY booth');
    return booth;
}

// gameplay: prompt + respray while a car stands on the pad (DUSKLINE interface only)
export class Spray {
  constructor(ctx, hud) {
    this.ctx = ctx; this.hud = hud; this.S = ctx.layout.spray;
  }

  // the car is on the pad, nearly stopped
  onPad(car) {
    if (!car?.pos) return false;
    const S = this.S, p = car.pos;
    return Math.abs(p.x - S.x) < S.len / 2 && Math.abs(p.z - S.z) < S.w / 2 + 0.4 && Math.abs(car.speed ?? 0) < 2.5;
  }

  prompt(car, credits) {
    if (!this.onPad(car)) return null;
    return credits >= SPRAY_PRICE ? { key: 'G', text: `RESPRAY · ${SPRAY_PRICE} CR`, sub: 'SOLANO SPRAY' } : { key: 'G', text: `NEED ${SPRAY_PRICE} CR`, sub: 'SOLANO SPRAY' };
  }

  // returns the CR spent (0 if refused)
  apply(car, credits) {
    if (!this.onPad(car)) return 0;
    if (credits < SPRAY_PRICE) { this.hud.toast({ k: 'SOLANO SPRAY', h: 'NOT ENOUGH CR', body: `<span><b>${SPRAY_PRICE}</b>CR A COAT</span>` }, 2600); return 0; }
    const cur = HUES.findIndex((h) => Math.abs(h - (car.hue ?? 0)) < 0.01);
    const next = cur < 0 ? 1 : (cur + 1) % HUES.length; // (a car on an off-list hue always gets a visible new coat)
    car.hue = HUES[next];
    if (car.paint?.isColor) { if (!car._paint0) car._paint0 = car.paint.clone(); car.paint.copy(PAINTS[next] == null ? car._paint0 : new THREE.Color(PAINTS[next])); }
    this.ctx.api.landmarks?.sprayBooth?.puff();
    this.hud.toast({ k: 'SOLANO SPRAY · FRESH COAT', h: HUE_NAMES[next], body: `<span><b>−${SPRAY_PRICE}</b>CR</span>` }, 3200);
    return SPRAY_PRICE;
  }

  pois() { return [{ x: this.S.x, z: this.S.z, color: '#ff3d9a' }]; }
}
