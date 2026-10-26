// Drone light show over Solano Heights (restyle map, LAYOUT.droneShow): a swarm of a few hundred light drones high
// above the district, west of the Spire, cycling through formations - an idle star grid, the DUSKLINE wordmark, a
// flapping manta, a striped dusk sun over waves, the district name and a turning globe. Formations are drawn on a
// small canvas and sampled into points; drones fly between formations in a staggered wave. One InstancedMesh,
// positions + colours rewritten on the CPU each frame (cheap at this count). Original design for this project.
import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';

const CW = 440, CH = 240; // formation canvas (px); 1 px = w / CW metres
const HOLD = 8.0, MOVE = 4.5;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// draw a formation and return n points in metres (x right, y up, centred), sorted for index-wise assignment
function sampleCanvas(draw, n, w, rnd) {
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, CW, CH); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, CW, CH).data;
  let filled = 0;
  for (let i = 0; i < CW * CH; i++) if (d[i * 4] > 127) filled++;
  const step = Math.max(1, Math.sqrt(filled / (n * 1.15)));
  const pts = [];
  for (let y = step / 2; y < CH; y += step) for (let x = step / 2; x < CW; x += step) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (d[(yi * CW + xi) * 4] > 127) pts.push([x, y]);
  }
  // deterministic thinning to n (or padding by jittered repeats)
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  while (pts.length < n) { const p = pts[Math.floor(rnd() * pts.length)]; pts.push([p[0] + (rnd() - 0.5) * step * 0.6, p[1] + (rnd() - 0.5) * step * 0.6]); }
  pts.length = n;
  const k = w / CW;
  return pts.map(([x, y]) => [(x - CW / 2) * k, (CH / 2 - y) * k, 0]);
}

const FONT = (px, style = '900 italic') => `${style} ${px}px "Avenir Next Condensed", "DIN Condensed", Impact, sans-serif`;

function formations(n, w, rnd) {
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const RED = [1.0, 0.14, 0.24], AMBER = [1.0, 0.62, 0.14], CYAN = [0.2, 0.9, 1.0], MAG = [1.0, 0.25, 0.75], WHITE = [1, 0.97, 0.92], GOLD = [1.0, 0.85, 0.35];
  const F = [];
  // 0: idle star grid, slightly bowed
  {
    const cols = Math.ceil(Math.sqrt(n * (CW / CH))), rows = Math.ceil(n / cols), pts = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c / (cols - 1) - 0.5) * w * 0.92, y = (r / (rows - 1) - 0.5) * w * 0.5;
      pts.push([x, y, -0.004 * x * x]);
    }
    F.push({ name: 'grid', pts, col: pts.map(() => WHITE), twinkle: 1 });
  }
  // 1: DUSKLINE wordmark (red -> amber), underline bar
  {
    const pts = sampleCanvas((g) => {
      g.font = FONT(118); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DUSKLINE', CW / 2, CH / 2 - 8);
      g.fillRect(60, CH / 2 + 52, CW - 120, 9);
    }, n, w, rnd);
    F.push({ name: 'wordmark', pts, col: pts.map((p) => lerp3(RED, AMBER, p[0] / w + 0.5)) });
  }
  // 2: manta (wings flap in update)
  {
    const pts = sampleCanvas((g) => {
      const cx = CW / 2, cy = CH / 2 - 10;
      g.beginPath();
      g.moveTo(cx, cy - 62);
      g.bezierCurveTo(cx + 40, cy - 50, cx + 150, cy - 20, cx + 200, cy + 8);
      g.bezierCurveTo(cx + 120, cy + 18, cx + 50, cy + 40, cx + 18, cy + 70);
      g.lineTo(cx - 18, cy + 70);
      g.bezierCurveTo(cx - 50, cy + 40, cx - 120, cy + 18, cx - 200, cy + 8);
      g.bezierCurveTo(cx - 150, cy - 20, cx - 40, cy - 50, cx, cy - 62);
      g.fill();
      g.fillRect(cx - 3, cy + 68, 6, 50); // tail
      g.fillStyle = '#000'; g.beginPath(); g.arc(cx - 22, cy - 34, 7, 0, 7); g.arc(cx + 22, cy - 34, 7, 0, 7); g.fill(); // cephalic gaps
    }, n, w, rnd);
    F.push({ name: 'manta', pts, col: pts.map((p) => lerp3(CYAN, MAG, Math.min(1, Math.abs(p[0]) / (w * 0.42)))), flap: 1 });
  }
  // 3: dusk sun with slits over three waves
  {
    const pts = sampleCanvas((g) => {
      const cx = CW / 2, cy = CH / 2 - 18;
      g.beginPath(); g.arc(cx, cy, 78, Math.PI, 0); g.fill();
      g.beginPath(); g.arc(cx, cy, 78, 0, Math.PI); g.fill();
      g.fillStyle = '#000';
      for (let k = 0; k < 5; k++) g.fillRect(cx - 90, cy + 8 + k * 14, 180, 3 + k * 1.4);
      g.fillStyle = '#fff'; g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        for (let x = 40; x <= CW - 40; x += 4) { const y = cy + 92 + k * 16 + Math.sin(x * 0.05 + k) * 5; if (x === 40) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
    }, n, w, rnd);
    F.push({ name: 'sun', pts, col: pts.map((p) => (p[1] < -w * 0.12 ? CYAN : lerp3(MAG, GOLD, Math.min(1, Math.max(0, (p[1] + w * 0.08) / (w * 0.34)))))) });
  }
  // 4: SOLANO / HEIGHTS
  {
    const pts = sampleCanvas((g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = FONT(104); g.fillText('SOLANO', CW / 2, CH / 2 - 30);
      g.font = FONT(46, '700'); g.fillText('H E I G H T S', CW / 2, CH / 2 + 50);
    }, n, w, rnd);
    F.push({ name: 'district', pts, col: pts.map((p) => (p[1] < -w * 0.04 ? RED : WHITE)) });
  }
  // 5: turning globe (3D, rotated in update)
  {
    const pts = [], R = w * 0.2, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * ga;
      pts.push([Math.cos(a) * r * R, y * R, Math.sin(a) * r * R]);
    }
    F.push({ name: 'globe', pts, col: pts.map((p) => lerp3(MAG, CYAN, p[1] / (2 * R) + 0.5)), spin: 1 });
  }
  // index-wise assignment: sort every formation the same way so drones travel short, mostly vertical paths
  for (const f of F) {
    const idx = f.pts.map((p, i) => i).sort((a, b) => (f.pts[a][0] - f.pts[b][0]) || (f.pts[a][1] - f.pts[b][1]));
    f.pts = idx.map((i) => f.pts[i]); f.col = idx.map((i) => f.col[i]);
  }
  return F;
}

export function buildDroneShow(ctx, root) {
  const S = ctx.layout.droneShow;
  if (!S) return null;
  const n = S.count || 480, w = S.w || 110;
  const rnd = mulberry(4242);
  const F = formations(n, w, rnd);
  const geo = new THREE.IcosahedronGeometry(S.size || 0.9, 1);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = vec3(5.5); // x instanceColor (applied by the node material)
  mat.fog = false; mat.lineMask = 1;
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.name = 'drone_show';
  const grp = new THREE.Group(); grp.name = 'drone_show_root';
  grp.position.set(S.x, S.y, S.z); grp.rotation.y = S.yaw || 0;
  grp.add(im); root.add(grp);
  const phase = Float32Array.from({ length: n }, () => rnd() * 6.283);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(1, 1, 1);
  const cycle = F.length * (HOLD + MOVE);
  const _pa = [0, 0, 0], _pb = [0, 0, 0]; // (reused every frame: no per-drone allocations)
  const pos = (f, i, t, out) => {
    const q = f.pts[i];
    let x = q[0], y = q[1], z = q[2];
    if (f.flap) { const ax = Math.abs(x) / (w * 0.45); y += Math.sin(t * 1.6 - ax * 1.4) * ax * w * 0.07; }
    if (f.spin) { const a = t * 0.35, c = Math.cos(a), s = Math.sin(a), x0 = x; x = x0 * c - z * s; z = x0 * s + z * c; }
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  };
  const tOff = +(new URLSearchParams(location.search).get('droneT') || 0); // (debug: jump into the cycle)
  const bound = new THREE.Sphere(new THREE.Vector3(S.x, S.y, S.z), w * 0.75), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();
  console.log(`[landmarks] drone show: ${n} drones, ${F.length} formations`);
  const state = { name: F[0].name, formed: false };
  return {
    center: new THREE.Vector3(S.x, S.y, S.z), state, // (read by the photo gig)
    update(dt, time, ctx) {
      {
        const tt = time + tOff - (ctx?.photoHold || 0), tc0 = ((tt % cycle) + cycle) % cycle, k0 = Math.floor(tc0 / (HOLD + MOVE));
        state.name = F[k0].name; state.formed = tc0 - k0 * (HOLD + MOVE) > MOVE + 0.2;
      }
      // (positions are a pure function of time: skip the work while the swarm is off-screen)
      const cam = ctx?.camera;
      if (cam && !ctx.photoFreeze) { // (photo mode: always placed, so a shot never shows a stale formation)
        cam.updateMatrixWorld();
        _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
        if (!_fr.intersectsSphere(bound)) return;
      }
      const t = time + tOff - (ctx?.photoHold || 0); // (the swarm holds its formation in photo mode)
      const tc = ((t % cycle) + cycle) % cycle;
      const k = Math.floor(tc / (HOLD + MOVE)), local = tc - k * (HOLD + MOVE);
      const A = F[(k + F.length - 1) % F.length], B = F[k];
      const col = im.instanceColor.array;
      for (let i = 0; i < n; i++) {
        // staggered wave: drones on the left leave first
        const delay = (i / n) * 1.2;
        const u = Math.min(1, Math.max(0, (local - delay) / (MOVE - 1.2)));
        const e = u * u * (3 - 2 * u);
        const a = pos(A, i, t, _pa), b = pos(B, i, t, _pb);
        const lift = Math.sin(Math.PI * e) * 4; // arc slightly toward the viewers while travelling
        P.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + Math.sin(t * 1.3 + phase[i]) * 0.25, a[2] + (b[2] - a[2]) * e + lift);
        M.compose(P, Q, SC); im.setMatrixAt(i, M);
        const ca = A.col[i], cb = B.col[i];
        // brightness blends between the formations (the star grid twinkles) and dips a little while flying
        const tw = 0.55 + 0.45 * Math.sin(t * 3.1 + phase[i] * 3);
        const bA = A.twinkle ? tw : 1, bB = B.twinkle ? tw : 1;
        const br = (bA + (bB - bA) * e) * (1 - 0.25 * Math.sin(Math.PI * e));
        col[i * 3] = (ca[0] + (cb[0] - ca[0]) * e) * br; col[i * 3 + 1] = (ca[1] + (cb[1] - ca[1]) * e) * br; col[i * 3 + 2] = (ca[2] + (cb[2] - ca[2]) * e) * br;
      }
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    },
  };
}
