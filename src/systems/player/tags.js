// Neon tags: a collectible layer of the restyle map (DUSKLINE interface only). Twelve floating holographic graffiti
// tags hidden around Solano Heights - on the plaza deck, the back stairs, the skydeck, under the rail, the canal
// bridge... Walk into one to collect it: toast, +200 CR, HUD counter; nearby tags show on the round map.
// Progress lasts for the session, like the gigs and the credits.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, time, sin, fract, step, mix, clamp } from 'three/tsl';

const NAMES = ['VEX', 'SOL', 'K9', 'NOVA', 'JET', 'ZIP', 'RAE', 'OKO', 'LUX', 'MAU', 'TIK', 'DX'];
const COLS = ['#ff3d9a', '#3be8ff', '#ffb547', '#b06bff'];
export const TAG_REWARD = 200;

// spots derived from the restyle layout: [x, y (tag centre), z, where]
function spots(L) {
  const A = L.avenue, P = L.plaza, AL = L.alley, R = L.river, PR = L.promenade, ov = L.overlook.position, C = L.crossStreets;
  const cx = (P.x0 + P.x1) / 2 + 4, cz = (P.z0 + P.z1) / 2, side = A.roadHalfWidth + A.sidewalkWidth / 2 + 0.2, cs = C.roadHalfWidth + C.sidewalkWidth / 2;
  return [
    [P.x0 + 6, P.deckY + 1.4, cz - 14, 'PLAZA DECK'],
    [AL.stairs.xEnd - 4, AL.stairs.rise + 1.4, AL.z, 'TOP OF THE BACK STAIRS'],
    [ov[0] - 5, ov[1] - 0.3, ov[2] + 2.6, 'SKYDECK'],
    [PR.xMin + 3, 1.4, L.bridges[0].z + 1, 'UNDER THE CANAL BRIDGE'],
    [side, A.curbHeight + 1.4, L.elevatedRail.z, 'UNDER THE RAIL'],
    [-side, A.curbHeight + 1.4, L.expressway.z, 'UNDER THE EXPRESSWAY'],
    [cx, 1.6, cz + 5.9, 'MONUMENT POOL'],
    [side, A.curbHeight + 1.4, A.zStart + 3, 'FOOT OF THE SKYDECK TOWER'],
    [-40, A.curbHeight + 1.4, C.zs[1] - cs, 'CROSSTOWN, WEST'],
    [62, A.curbHeight + 1.4, C.zs[2] + cs, 'CROSSTOWN, EAST'],
    [AL.xStart - 6, 1.6, AL.z, 'UNDER THE ALLEY CANOPY'],
    [P.x1 - 2, A.curbHeight + 1.4, P.z0 + 6, 'BY THE NOODLE KIOSK'],
  ];
}

function tagAtlas() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 768;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 768);
  NAMES.forEach((n, i) => {
    const x = (i % 4) * 256 + 128, y = Math.floor(i / 4) * 256 + 128, col = COLS[i % COLS.length];
    g.save(); g.translate(x, y); g.rotate(-0.12 + (i % 3) * 0.08);
    g.font = '900 italic 108px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#ffffff'; g.strokeText(n, 0, 0);
    g.lineWidth = 12; g.strokeStyle = col; g.strokeText(n, 0, 0);
    g.fillStyle = '#0d0b10'; g.fillText(n, 0, 0);
    // drips + crown flourish
    g.fillStyle = col;
    for (let k = 0; k < 4; k++) { const dx = -70 + k * 45 + (i * 13 % 20); g.fillRect(dx, 34, 7, 18 + ((i + k) * 17) % 40); }
    g.beginPath(); g.moveTo(-40, -70); g.lineTo(-20, -96); g.lineTo(0, -74); g.lineTo(20, -96); g.lineTo(40, -70); g.lineWidth = 8; g.strokeStyle = col; g.stroke();
    g.restore();
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tags {
  constructor(ctx, hud) {
    this.ctx = ctx; this.hud = hud;
    const L = ctx.layout;
    this.list = spots(L).map(([x, y, z, where], i) => ({ i, name: NAMES[i], where, pos: new THREE.Vector3(x, y, z), got: false }));
    // (session-only, like the gigs and the credits: nothing else in the game persists between visits)
    this.total = this.list.length;
    this.count = this.list.filter((t) => t.got).length;

    const atlas = tagAtlas();
    this.group = new THREE.Group(); this.group.name = 'neon_tags';
    const ringGeo = new THREE.RingGeometry(0.75, 0.9, 40).rotateX(-Math.PI / 2);
    for (const t of this.list) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const u = uv();
      const c = texture(atlas, vec2(float((t.i % 4) * 0.25).add(u.x.mul(0.25)), float(1 - Math.floor(t.i / 4) / 3 - 1 / 3).add(u.y.div(3))));
      const flick = mix(float(1), step(0.08, fract(sin(time.mul(7).floor().add(t.i)).mul(43758.5))), 0.35);
      m.colorNode = c.rgb.mul(1.8).mul(flick);
      m.opacityNode = clamp(c.a.mul(1.2), 0, 1);
      m.lineMask = 1;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), m);
      plane.renderOrder = 7;
      const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const col = new THREE.Color(COLS[t.i % COLS.length]);
      rm.colorNode = vec3(col.r, col.g, col.b).mul(sin(time.mul(3).add(t.i)).mul(0.4).add(1.4));
      rm.lineMask = 1;
      const ring = new THREE.Mesh(ringGeo, rm);
      ring.position.set(0, -1.25, 0);
      const holder = new THREE.Group(); holder.position.copy(t.pos); holder.add(plane, ring);
      holder.visible = !t.got;
      this.group.add(holder);
      t.obj = holder; t.plane = plane;
    }
    ctx.scene.add(this.group);
    this.hud.setTags?.(this.count, this.total);
    this.t = 0;
  }

  update(dt, feet) {
    this.t += dt;
    for (const t of this.list) {
      if (t.got) continue;
      t.plane.rotation.y += dt * 1.2;
      t.plane.position.y = Math.sin(this.t * 1.6 + t.i) * 0.12;
      const dx = feet.x - t.pos.x, dz = feet.z - t.pos.z, dy = feet.y + 1.2 - t.pos.y;
      if (dx * dx + dz * dz < 2.0 * 2.0 && Math.abs(dy) < 2.4) this.collect(t);
    }
  }

  collect(t) {
    t.got = true; t.obj.visible = false;
    this.count++;
    const all = this.count === this.total;
    this.onReward?.(TAG_REWARD + (all ? 2000 : 0));
    this.hud.setTags?.(this.count, this.total);
    this.hud.toast({ k: `NEON TAG ${this.count}/${this.total} · ${t.where}`, h: all ? 'ALL TAGS FOUND' : `“${t.name}”`, body: `<span><b>+${TAG_REWARD + (all ? 2000 : 0)}</b>CR</span>` }, 3800);
  }

  // uncollected tags near the player, for the round map
  pois(p, r = 90) {
    const out = [];
    for (const t of this.list) if (!t.got && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < r) out.push({ x: t.pos.x, z: t.pos.z, color: COLS[t.i % COLS.length] });
    return out;
  }
}
