// City buses of the restyle map (DUSKLINE transit, line 42): one low-floor bus per direction on the kerb lane of the
// boulevard. They run inside the IDM traffic (Traffic.addBuses: the bus is a leader the cars queue behind), pull up at
// the bus shelters (LAYOUT.busShelters), kneel, open their doors for a few seconds and go on. Procedural model: no
// asset, a few merged meshes per bus - graphite body, white roof, red belt, lit window band with passengers, amber
// dot-matrix destination signs, sliding doors on the kerb side. Model space: front at -Z, ground at y = 0.
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, texture, sin, fract, floor, step, smoothstep, mix, length, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BUS = { len: 12, w: 2.55, h: 3.1, wheelR: 0.5, axles: [-3.7, 3.5], doors: [-4.95, 0.6], dwell: 7.5 };

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

function signTexture(text, w = 512, h = 64, font = 44) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.font = `700 ${font}px "DIN Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  const [route, dest] = text.split('|');
  g.textAlign = 'left'; g.fillText(route, 14, h / 2 + 2);
  if (dest) { g.textAlign = 'right'; g.fillText(dest, w - 14, h / 2 + 2); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

function adTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, '#c81e2c'); gr.addColorStop(0.62, '#7a1020'); gr.addColorStop(1, '#14151a');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = '900 italic 84px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif';
  g.fillText('RIDE LATE.', 34, 84);
  g.font = '700 30px "DIN Condensed", "Avenir Next Condensed", sans-serif';
  g.fillStyle = '#ffd08a'; g.fillText('DUSKLINE TRANSIT · 42 · ALL NIGHT', 500, 64);
  g.fillStyle = '#ffffff'; g.fillText('SOLANO HEIGHTS ⇄ CANAL ⇄ CROSSTOWN', 500, 104);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function materials() {
  const std = (color, rough = 0.45, metal = 0.25) => new THREE.MeshStandardNodeMaterial({ color, roughness: rough, metalness: metal });
  const M = {
    body: std(0x1b1c21, 0.42, 0.35),
    roof: std(0xd9d6cf, 0.5, 0.1),
    red: std(0xc81e2c, 0.4, 0.2),
    dark: std(0x0b0b0d, 0.7, 0.2),
    tyre: std(0x0a0a0b, 0.85, 0.0),
    hub: std(0x8c8e93, 0.35, 0.9),
    glass: std(0x0d1218, 0.08, 0.6),
  };
  M.body.animeRim = 1; M.roof.animeRim = 1; M.red.animeRim = 1;
  // window band: warm interior light, dark pillars every 1.45 m, seated / standing passengers as dark shapes
  const win = new THREE.MeshBasicNodeMaterial();
  const u = uv(), cellX = u.x.mul(8), cx = fract(cellX), ci = floor(cellX);
  const pillar = step(0.1, cx).mul(step(cx, 0.94));
  const h1 = fract(sin(ci.mul(12.9898).add(3.1)).mul(43758.5453)), h2 = fract(sin(ci.mul(78.233).add(1.7)).mul(43758.5453));
  // a head + shoulders blob at a random x in the cell; some cells empty, some with a standing rider (taller)
  const px = h1.mul(0.5).add(0.25), tall = step(0.7, h2);
  const head = smoothstep(0.16, 0.12, length(vec2(cx.sub(px).mul(1.3), u.y.sub(mix(float(0.52), float(0.74), tall)))));
  const torso = step(cx.sub(px).abs(), float(0.2)).mul(step(u.y, mix(float(0.42), float(0.62), tall)));
  const rider = head.max(torso).mul(step(0.3, h2));
  // ceiling strip light at the top, darker lower half (seat backs)
  const light = vec3(1.0, 0.84, 0.6).mul(mix(float(0.35), float(0.9), u.y).add(step(0.86, u.y).mul(0.8))).mul(float(1).sub(rider.mul(0.9)));
  win.colorNode = light.mul(pillar).mul(0.85).add(vec3(0.02, 0.025, 0.03).mul(float(1).sub(pillar)));
  win.lineMask = 1;
  M.win = win;
  // windscreen: dark glass with a diagonal sheen, the lit cabin ceiling showing at the top
  const ws = new THREE.MeshBasicNodeMaterial();
  const wu = uv();
  const sheen = smoothstep(0.06, 0.0, wu.x.mul(0.8).add(wu.y.mul(0.6)).sub(0.72).abs()).mul(0.18);
  const cabin = vec3(1.0, 0.84, 0.6).mul(smoothstep(0.72, 1.0, wu.y).mul(0.22));
  ws.colorNode = vec3(0.02, 0.026, 0.036).add(cabin).add(vec3(0.75, 0.8, 0.9).mul(sheen));
  ws.lineMask = 1;
  M.windscreen = ws;
  // amber dot-matrix destination sign
  M.sign = (tex, cols, rows) => {
    const m = new THREE.MeshBasicNodeMaterial();
    const su = uv();
    const dot = smoothstep(0.42, 0.28, length(fract(su.mul(vec2(cols, rows))).sub(0.5)));
    const q = vec2(floor(su.x.mul(cols)).add(0.5).div(cols), floor(su.y.mul(rows)).add(0.5).div(rows));
    const on = step(0.45, texture(tex, q).r);
    m.colorNode = vec3(1.0, 0.62, 0.12).mul(on.mul(dot).mul(3.2)).add(vec3(0.05, 0.03, 0.01).mul(dot));
    m.lineMask = 1;
    return m;
  };
  const glow = (c, i) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(i); m.lineMask = 1; return m; };
  M.head = glow([0.9, 0.95, 1.0], 3.0);
  M.tail = (brake) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(1.0, 0.08, 0.06).mul(brake.mul(4.5).add(1.2)); m.lineMask = 1; return m; };
  M.doorEdge = (open) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(1.0, 0.7, 0.3).mul(open.mul(3.0).add(0.15)); m.lineMask = 1; return m; };
  const ad = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.1 });
  ad.colorNode = texture(adTexture()).rgb; ad.emissiveNode = texture(adTexture()).rgb.mul(0.18);
  M.ad = ad;
  // door aperture behind the leaves: lit step well, warm interior, a yellow grab pole (seen when the doors part)
  const ap = new THREE.MeshBasicNodeMaterial();
  const au = uv();
  const pole = smoothstep(0.035, 0.02, au.x.sub(0.5).abs()).mul(step(0.12, au.y));
  const inner = vec3(1.0, 0.82, 0.58).mul(mix(float(0.12), float(0.7), smoothstep(0.1, 0.9, au.y))).add(vec3(1.0, 0.7, 0.3).mul(step(au.y, 0.06).mul(1.4)));
  ap.colorNode = mix(inner, vec3(1.0, 0.75, 0.1).mul(1.6), pole);
  ap.lineMask = 1;
  M.aperture = ap;
  return M;
}

function busMeshes(M, id) {
  const { len, w } = BUS, hw = w / 2, hl = len / 2;
  const g = new THREE.Group(), body = new THREE.Group(); // body kneels at the stops; wheels stay on the road
  g.add(body);
  // shell
  body.add(new THREE.Mesh(merge([
    box(w, 0.95, len - 0.3, 0, 0.78, 0),            // lower body
    box(w, 0.12, len - 0.1, 0, 2.5, 0),             // cant rail above the windows
    box(w * 0.98, 0.35, 0.5, 0, 0.55, -hl + 0.2),   // front bumper
    box(w * 0.98, 0.35, 0.45, 0, 0.55, hl - 0.2),   // rear bumper
    box(w, 1.05, 0.35, 0, 2.0, hl - 0.15),          // rear wall around the back window
  ]), M.body));
  body.add(new THREE.Mesh(merge([box(w, 0.5, len - 0.2, 0, 2.8, 0), box(w * 0.82, 0.28, 2.8, 0, 3.17, 1.4), box(w * 0.7, 0.2, 1.6, 0, 3.12, -3.2)]), M.roof));
  body.add(new THREE.Mesh(merge([box(w + 0.02, 0.1, len - 0.5, 0, 1.3, 0), box(w * 0.98, 0.1, 0.04, 0, 0.95, -hl - 0.02)]), M.red));
  // window bands (both sides) + rear window
  const band = new THREE.PlaneGeometry(len - 1.6, 1.12);
  const wr = new THREE.Mesh(band, M.win); wr.rotation.y = Math.PI / 2; wr.position.set(hw + 0.006, 1.9, 0.5); body.add(wr);
  const wl = new THREE.Mesh(band, M.win); wl.rotation.y = -Math.PI / 2; wl.position.set(-hw - 0.006, 1.9, 0.5); body.add(wl);
  // windscreen + front mask
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 1.55), M.windscreen); ws.position.set(0, 1.78, -hl - 0.01); ws.rotation.set(-0.06, Math.PI, 0); body.add(ws);
  const frontMask = new THREE.Mesh(merge([box(w, 0.5, 0.06, 0, 0.82, -hl + 0.02)]), M.dark); body.add(frontMask);
  // destination signs: front (route + destination), rear (route), kerb side above the front door
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, 0.3), M.sign(signTexture('42|SOLANO HTS'), 128, 16));
  front.rotation.y = Math.PI; front.position.set(0, 2.72, -hl - 0.02); body.add(front);
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), M.sign(signTexture('42', 128, 64, 52), 32, 16));
  rear.position.set(0, 2.72, hl + 0.01); body.add(rear);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.26), M.sign(signTexture('42|SOLANO HTS'), 112, 14));
  side.rotation.y = Math.PI / 2; side.position.set(hw + 0.012, 2.42, -2.6); body.add(side);
  // side ads between the axles (each side its own plane so the text reads left-to-right)
  const adGeo = new THREE.PlaneGeometry(5.4, 0.78);
  const ar = new THREE.Mesh(adGeo, M.ad); ar.rotation.y = Math.PI / 2; ar.position.set(hw + 0.008, 0.8, 0.9); body.add(ar);
  const al = new THREE.Mesh(adGeo, M.ad); al.rotation.y = -Math.PI / 2; al.position.set(-hw - 0.008, 0.8, -0.2); body.add(al);
  // lamps
  const brake = uniform(0), open = uniform(0);
  body.add(new THREE.Mesh(merge([box(0.42, 0.14, 0.04, -hw + 0.4, 0.82, -hl - 0.03), box(0.42, 0.14, 0.04, hw - 0.4, 0.82, -hl - 0.03)]), M.head));
  body.add(new THREE.Mesh(merge([box(0.14, 0.9, 0.04, -hw + 0.12, 1.15, hl + 0.02), box(0.14, 0.9, 0.04, hw - 0.12, 1.15, hl + 0.02)]), M.tail(brake)));
  // doors (kerb side = +x): two leaves each, sliding apart along the body when open
  const leafGeo = merge([box(0.05, 2.05, 0.58, 0, 1.38, 0)]);
  const leafGlass = new THREE.PlaneGeometry(0.46, 1.5);
  const leaves = [];
  for (const dz of BUS.doors) {
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.add(new THREE.Mesh(leafGeo, M.dark));
      const gl = new THREE.Mesh(leafGlass, M.win); gl.rotation.y = Math.PI / 2; gl.position.set(0.03, 1.55, 0); leaf.add(gl);
      leaf.position.set(hw + 0.02, 0, dz + s * 0.3);
      leaf.userData = { z0: dz + s * 0.3, s };
      body.add(leaf); leaves.push(leaf);
    }
    const apm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.05), M.aperture);
    apm.rotation.y = Math.PI / 2; apm.position.set(hw + 0.012, 1.38, dz); body.add(apm); // (inside the closed leaves)
    // lit door frame
    const fr = new THREE.Mesh(merge([box(0.03, 2.1, 0.05, hw + 0.03, 1.38, dz - 0.62), box(0.03, 2.1, 0.05, hw + 0.03, 1.38, dz + 0.62), box(0.03, 0.05, 1.29, hw + 0.03, 2.43, dz)]), M.doorEdge(open));
    body.add(fr);
  }
  // wheels: tyre + hub, arches dark
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(BUS.wheelR, BUS.wheelR, 0.34, 18).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 8).rotateZ(Math.PI / 2);
  for (const az of BUS.axles) {
    for (const s of [-1, 1]) {
      const wg = new THREE.Group();
      wg.add(new THREE.Mesh(tyre, M.tyre), new THREE.Mesh(hub, M.hub));
      wg.position.set(s * (hw - 0.22), BUS.wheelR, az);
      g.add(wg); wheels.push(wg);
    }
    g.add(new THREE.Mesh(box(w + 0.01, 0.62, 1.32, 0, 0.62, az), M.dark));
  }
  g.name = `bus_${id}`;
  return { g, body, wheels, leaves, brake, open };
}

export function buildBuses(scene, records) {
  if (!records?.length) return null;
  const M = materials();
  const group = new THREE.Group(); group.name = 'buses';
  const items = records.map((rec, i) => { const b = busMeshes(M, i); group.add(b.g); return { rec, ...b, door: 0, kneel: 0 }; });
  scene.add(group);
  console.log(`[vehicles] buses: ${items.length}`);
  return {
    update(dt) {
      for (const b of items) {
        const r = b.rec;
        b.g.position.copy(r.pos); b.g.quaternion.copy(r.quat);
        // doors: open after the bus kneels, close before it moves off
        b.door += ((r.doorOpen ? 1 : 0) - b.door) * Math.min(1, dt * 3.2);
        b.kneel += ((r.dwell > 0 ? 1 : 0) - b.kneel) * Math.min(1, dt * 2.0);
        b.body.position.y = -0.08 * b.kneel;
        for (const l of b.leaves) l.position.z = l.userData.z0 + l.userData.s * 0.56 * b.door;
        for (const w of b.wheels) w.rotation.x = r.spin;
        b.brake.value = r.light.z; b.open.value = b.door;
      }
    },
  };
}
