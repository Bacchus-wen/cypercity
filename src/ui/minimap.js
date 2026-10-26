// Rotating CP2077-style minimap: static city map pre-rendered from LAYOUT, road-graph route to the active gig.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const X0 = -280, X1 = 300, Z0 = -740, Z1 = 160, S = 3; // px per meter in the static map

// colour themes: the original dark-teal map, and the restyle's ink map (pale streets on dark blocks, red route)
export const MAP_THEMES = {
  legacy: {
    bg: '#050c0f', district: '#0a171b', district2: '#09151a', lotA: '#1b3940', lotB: '#14292f', lotC: '#112328',
    lot: (k, r, g, b) => `rgb(${r},${g},${b})`, lotEdge: (k) => `rgba(94,246,255,${0.06 + k * 0.14})`,
    water: ['#0b3442', '#0e4252'], waterEdge: 'rgba(94,246,255,.35)', prom: '#26343a', palms: 'rgba(80,220,150,.5)', cherry: 'rgba(255,127,200,.55)',
    sidewalk: '#2a4249', road: '#36565e', lane: 'rgba(200,230,235,.18)', median: '#24453a', alley: '#3a2a2c', stairs: 'rgba(255,97,88,.55)',
    lanterns: 'rgba(255,90,60,.8)', bridge: '#3d5a62', rail: 'rgba(94,246,255,.10)', expressway: 'rgba(94,246,255,.08)', overpassEdge: 'rgba(94,246,255,.35)',
    plaza: '#2e4a50', plazaDeck: '#35555c', monument: 'rgba(94,246,255,.7)', monumentCore: 'rgba(255,60,90,.8)', overlook: 'rgba(94,246,255,.6)',
    viewBg: '#04090b', route: 'rgba(252,238,10,.95)', routeGlow: 'rgba(252,238,10,.8)', poi: 'rgba(94,246,255,.9)', target: '#fcee0a',
    targetEdge: 'rgba(252,238,10,.85)', targetCore: '#1a1400', cone: ['rgba(94,246,255,.28)', 'rgba(94,246,255,0)'], playerGlow: 'rgba(94,246,255,.9)',
    playerCar: '#fcee0a', player: '#e9f6f7', vignette: ['rgba(4,9,11,0)', 'rgba(4,9,11,.75)'],
  },
  ink: {
    bg: '#141116', district: '#1d191d', district2: '#1a161a', lotA: '#4a4045', lotB: '#3a3237', lotC: '#2e282c',
    lot: (k) => { const v = Math.round(40 + k * 34); return `rgb(${v + 6},${v - 2},${v + 2})`; }, lotEdge: () => 'rgba(10,8,10,.9)',
    water: ['#164a58', '#1d6070'], waterEdge: 'rgba(120,230,255,.55)', prom: '#8c8478', palms: 'rgba(60,180,110,.85)', cherry: 'rgba(60,180,110,.85)',
    sidewalk: '#9d958a', road: '#dcd4c6', lane: 'rgba(40,34,38,.45)', median: '#3d7a52', alley: '#b08a5a', stairs: 'rgba(40,30,30,.8)',
    lanterns: 'rgba(255,190,90,.9)', bridge: '#cfc7b9', rail: 'rgba(255,45,61,.22)', expressway: 'rgba(255,181,71,.2)', overpassEdge: 'rgba(255,45,61,.55)',
    plaza: '#e8e1d4', plazaDeck: '#c9c0b0', monument: 'rgba(255,45,61,.9)', monumentCore: '#141116', overlook: 'rgba(255,45,61,.9)',
    viewBg: '#141116', route: '#ff2d3d', routeGlow: 'rgba(255,45,61,.7)', poi: 'rgba(59,232,255,.95)', target: '#ff2d3d',
    targetEdge: 'rgba(255,45,61,.85)', targetCore: '#f2ede4', cone: ['rgba(255,255,255,.3)', 'rgba(255,255,255,0)'], playerGlow: 'rgba(0,0,0,.6)',
    playerCar: '#ffb547', player: '#ffffff', vignette: ['rgba(20,17,22,0)', 'rgba(20,17,22,.55)'],
    cy: 0.5, round: true, // round map: player at the centre, markers clamp to the rim
  },
};

export class Minimap {
  constructor(L, canvas, lots, theme = 'legacy') {
    this.L = L;
    this.T = MAP_THEMES[theme] || MAP_THEMES.legacy;
    this.lots = lots;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.map = this.buildStatic();
    this.graph = this.buildGraph();
    this.route = null;
    this.routeT = 0;
    this.scale = 1.7; // css px per meter
  }

  px(x) { return (x - X0) * S; }
  pz(z) { return (z - Z0) * S; }

  buildStatic() {
    const L = this.L, T = this.T;
    const c = document.createElement('canvas');
    c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
    const g = c.getContext('2d');
    const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(this.px(Math.min(x0, x1)), this.pz(Math.min(z0, z1)), Math.abs(x1 - x0) * S, Math.abs(z1 - z0) * S); };
    g.fillStyle = T.bg; g.fillRect(0, 0, c.width, c.height);
    // built-up district base
    const M2 = !!L.plaza; // restyle map: derive the district extents from the layout
    if (M2) R(L.crossStreets.xStart - 20, L.avenue.zStart + 20, L.promenade.xMin - 2, L.avenue.zEnd - 12, T.district);
    else R(-230, 90, L.promenade.xMin - 2, -460, T.district);
    R(L.river.xCenter + L.river.halfWidth + 4, 120, 290, -720, T.district2);
    // lots (seeded)
    const rnd = mulberry32(7);
    const lot = (x0, x1, z0, z1) => {
      for (let x = x0; x < x1;) {
        const w = 12 + rnd() * 22;
        for (let z = z0; z < z1;) {
          const d = 10 + rnd() * 24;
          const v = rnd();
          g.fillStyle = v > 0.92 ? T.lotA : v > 0.6 ? T.lotB : T.lotC;
          g.fillRect(this.px(x + 1.4), this.pz(z + 1.4), (Math.min(w, x1 - x) - 2.8) * S, (Math.min(d, z1 - z) - 2.8) * S);
          z += d;
        }
        x += w;
      }
    };
    const real = this.lots && this.lots.length > 20;
    if (real) {
      // real building footprints from the buildings system, shaded by height
      const sorted = [...this.lots].sort((a, b) => a.h - b.h);
      for (const b of sorted) {
        const k = Math.min(1, (b.h || 12) / 70);
        const r = Math.round(16 + k * 22), gg = Math.round(34 + k * 34), bb = Math.round(40 + k * 36);
        g.fillStyle = T.lot(k, r, gg, bb);
        const x0 = Math.min(b.x0, b.x1), z0 = Math.min(b.z0, b.z1);
        const w = Math.abs(b.x1 - b.x0), d = Math.abs(b.z1 - b.z0);
        g.fillRect(this.px(x0 + 0.5), this.pz(z0 + 0.5), (w - 1) * S, (d - 1) * S);
        g.strokeStyle = T.lotEdge(k); g.lineWidth = 1;
        g.strokeRect(this.px(x0 + 0.5), this.pz(z0 + 0.5), (w - 1) * S, (d - 1) * S);
      }
    } else {
      lot(-230, L.promenade.xMin - 3, -460, 90);
      lot(L.river.xCenter + L.river.halfWidth + 5, 290, -720, 120);
    }
    // river + promenade
    const rv = L.river;
    const grad = g.createLinearGradient(this.px(rv.xCenter - rv.halfWidth), 0, this.px(rv.xCenter + rv.halfWidth), 0);
    grad.addColorStop(0, T.water[0]); grad.addColorStop(0.5, T.water[1]); grad.addColorStop(1, T.water[0]);
    g.fillStyle = grad;
    g.fillRect(this.px(rv.xCenter - rv.halfWidth), this.pz(rv.zEnd), rv.halfWidth * 2 * S, (rv.zStart - rv.zEnd) * S);
    g.strokeStyle = T.waterEdge; g.lineWidth = 2;
    g.strokeRect(this.px(rv.xCenter - rv.halfWidth), this.pz(rv.zEnd), rv.halfWidth * 2 * S, (rv.zStart - rv.zEnd) * S);
    const pr = L.promenade;
    R(pr.xMin, pr.zStart, pr.xMax, pr.zEnd, T.prom);
    if (M2) {
      // palm dots along the canal promenade (west edge)
      g.fillStyle = T.palms;
      for (let z = pr.zStart - 4; z > pr.zEnd; z -= 12) { g.beginPath(); g.arc(this.px(pr.xMax - 1.0), this.pz(z), 1.8 * S, 0, 7); g.fill(); }
    } else {
      // cherry trees dots
      g.fillStyle = T.cherry;
      for (let z = pr.zStart - 6; z > pr.zEnd; z -= 11) { g.beginPath(); g.arc(this.px(pr.xMax - 2), this.pz(z), 2.2 * S, 0, 7); g.fill(); }
    }
    // roads (sidewalk then asphalt)
    const av = L.avenue, cs = L.crossStreets, al = L.alley;
    const SW = T.sidewalk, RD = T.road;
    R(av.x - av.roadHalfWidth - av.sidewalkWidth, av.zStart, av.x + av.roadHalfWidth + av.sidewalkWidth, av.zEnd, SW);
    for (const z of cs.zs) R(cs.xStart, z - cs.roadHalfWidth - cs.sidewalkWidth, cs.xEnd, z + cs.roadHalfWidth + cs.sidewalkWidth, SW);
    R(av.x - av.roadHalfWidth, av.zStart, av.x + av.roadHalfWidth, av.zEnd, RD);
    for (const z of cs.zs) R(cs.xStart, z - cs.roadHalfWidth, cs.xEnd, z + cs.roadHalfWidth, RD);
    // lane markings (restyle map: the planted median strip with palm dots instead of a centre line)
    g.strokeStyle = T.lane; g.lineWidth = 1; g.setLineDash([3 * S, 3 * S]);
    if (av.medianHalf) {
      g.setLineDash([]);
      R(av.x - av.medianHalf, av.zStart, av.x + av.medianHalf, av.zEnd, T.median);
      g.fillStyle = T.palms;
      for (let z = av.zStart - 8; z > av.zEnd; z -= 16) { if (cs.zs.some((c) => Math.abs(z - c) < 12)) continue; g.beginPath(); g.arc(this.px(av.x), this.pz(z), 1.6 * S, 0, 7); g.fill(); }
      g.setLineDash([3 * S, 3 * S]);
      for (const s of [-1, 1]) { const x = av.x + s * (av.medianHalf + 0.3 + av.laneWidth); g.beginPath(); g.moveTo(this.px(x), this.pz(av.zStart)); g.lineTo(this.px(x), this.pz(av.zEnd)); g.stroke(); }
    } else { g.beginPath(); g.moveTo(this.px(av.x), this.pz(av.zStart)); g.lineTo(this.px(av.x), this.pz(av.zEnd)); g.stroke(); }
    for (const z of cs.zs) { g.beginPath(); g.moveTo(this.px(cs.xStart), this.pz(z)); g.lineTo(this.px(cs.xEnd), this.pz(z)); g.stroke(); }
    g.setLineDash([]);
    // alley + stairs
    R(al.xStart, al.z - al.width / 2, al.xEnd, al.z + al.width / 2, T.alley);
    g.strokeStyle = T.stairs; g.lineWidth = 1;
    for (let x = al.stairs.xStart; x > al.stairs.xEnd; x -= 1.2) { g.beginPath(); g.moveTo(this.px(x), this.pz(al.z - al.width / 2)); g.lineTo(this.px(x), this.pz(al.z + al.width / 2)); g.stroke(); }
    // lantern dots along the alley
    g.fillStyle = T.lanterns;
    for (let x = al.xStart - 4; x > al.xEnd; x -= 6) { g.beginPath(); g.arc(this.px(x), this.pz(al.z + (x % 12 ? 1.6 : -1.6)), 0.6 * S, 0, 7); g.fill(); }
    // bridge
    for (const b of L.bridges) R(pr.xMin, b.z - 5, rv.xCenter + rv.halfWidth + 10, b.z + 5, T.bridge);
    // elevated rail + expressway (overpasses)
    const er = L.elevatedRail, ex = L.expressway;
    g.fillStyle = T.rail;
    g.fillRect(this.px(X0), this.pz(er.z - er.width / 2), (X1 - X0) * S, er.width * S);
    g.fillStyle = T.expressway;
    g.fillRect(this.px(X0), this.pz(ex.z - ex.width / 2), (X1 - X0) * S, ex.width * S);
    g.strokeStyle = T.overpassEdge; g.setLineDash([6, 4]);
    for (const [z, w] of [[er.z, er.width], [ex.z, ex.width]]) {
      g.beginPath(); g.moveTo(0, this.pz(z - w / 2)); g.lineTo(c.width, this.pz(z - w / 2)); g.stroke();
      g.beginPath(); g.moveTo(0, this.pz(z + w / 2)); g.lineTo(c.width, this.pz(z + w / 2)); g.stroke();
    }
    g.setLineDash([]);
    // central plaza: paved square, monument ring
    if (L.plaza) {
      const P = L.plaza, xi = av.x - av.roadHalfWidth - av.sidewalkWidth;
      R(P.x0, P.z0, xi, P.z1, T.plaza);
      R(P.x0, P.z0 + 3, P.x0 + 12, P.z1 - 3, T.plazaDeck);
      const mx = (P.x0 + P.x1) / 2 + 4, mz = (P.z0 + P.z1) / 2;
      g.strokeStyle = T.monument; g.lineWidth = 2;
      g.beginPath(); g.arc(this.px(mx), this.pz(mz), 10.5 * S, 0, 7); g.stroke();
      g.fillStyle = T.monumentCore; g.fillRect(this.px(mx - 1.6), this.pz(mz - 1.6), 3.2 * S, 3.2 * S);
    }
    // overlook building highlight
    const ov = L.overlook.position;
    g.strokeStyle = T.overlook; g.lineWidth = 2;
    g.strokeRect(this.px(ov[0] - 8), this.pz(ov[2] - 8), 16 * S, 16 * S);
    return c;
  }

  buildGraph() {
    const L = this.L;
    const nodes = []; const edges = [];
    const N = (x, z) => { const i = nodes.findIndex((n) => Math.abs(n[0] - x) < 0.5 && Math.abs(n[1] - z) < 0.5); if (i >= 0) return i; nodes.push([x, z]); return nodes.length - 1; };
    const chain = (pts) => { for (let i = 0; i < pts.length - 1; i++) edges.push([N(...pts[i]), N(...pts[i + 1])]); };
    const av = L.avenue, cs = L.crossStreets, al = L.alley, pr = L.promenade, px = (pr.xMin + pr.xMax) / 2;
    const M2 = !!L.plaza;
    const az = (M2 ? [av.zStart, ...cs.zs, al.z, av.zEnd] : [av.zStart, -60, al.z, -180, -300, av.zEnd]).sort((a, b) => b - a);
    chain(az.map((z) => [av.x, z]));
    for (const z of cs.zs) chain([[cs.xStart, z], [al.xEnd, z], [av.x, z], [px, z], [cs.xEnd, z]]);
    chain([[av.x, al.z], [al.xStart, al.z], [al.stairs.xStart, al.z], [al.stairs.xEnd, al.z], [al.xEnd, al.z]]);
    if (M2) {
      chain([pr.zStart, ...cs.zs, ...L.bridges.map((b) => b.z), pr.zEnd].sort((a, b) => b - a).map((z) => [px, z]));
      // plaza: across the square from the boulevard to the deck steps
      const P = L.plaza, mz = (P.z0 + P.z1) / 2;
      if (!az.includes(mz)) { const i = edges.findIndex(([a, b]) => nodes[a][0] === av.x && nodes[b][0] === av.x && (nodes[a][1] - mz) * (nodes[b][1] - mz) < 0); if (i >= 0) { const [a, b] = edges[i]; edges.splice(i, 1, [a, N(av.x, mz)], [N(av.x, mz), b]); } }
      chain([[av.x, mz], [P.x0 + 20, mz]]);
    } else chain([[px, pr.zStart], [px, -60], [px, -120], [px, -180], [px, L.bridges[0].z], [px, -300], [px, pr.zEnd]]);
    for (const b of L.bridges) chain([[px, b.z], [L.river.xCenter + L.river.halfWidth + 8, b.z]]);
    return { nodes, edges };
  }

  project(p) {
    const { nodes, edges } = this.graph;
    let best = null;
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i]; const A = nodes[a], B = nodes[b];
      const dx = B[0] - A[0], dz = B[1] - A[1]; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2));
      const q = [A[0] + dx * t, A[1] + dz * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { d, q, e: i, a, b };
    }
    return best;
  }

  computeRoute(from, to) {
    const { nodes, edges } = this.graph;
    const s = this.project(from), t = this.project(to);
    if (!s || !t) return [from, to];
    if (s.e === t.e) return [from, s.q, t.q, to];
    const n = nodes.length; const S0 = n, T0 = n + 1;
    const pos = (i) => (i === S0 ? s.q : i === T0 ? t.q : nodes[i]);
    const adj = Array.from({ length: n + 2 }, () => []);
    const link = (a, b) => { const d = Math.hypot(pos(a)[0] - pos(b)[0], pos(a)[1] - pos(b)[1]); adj[a].push([b, d]); adj[b].push([a, d]); };
    edges.forEach(([a, b]) => link(a, b));
    link(S0, s.a); link(S0, s.b); link(T0, t.a); link(T0, t.b);
    const dist = new Array(n + 2).fill(Infinity), prev = new Array(n + 2).fill(-1), done = new Array(n + 2).fill(false);
    dist[S0] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < n + 2; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity || u === T0) break;
      done[u] = true;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const path = [];
    for (let u = T0; u >= 0; u = prev[u]) path.unshift(pos(u));
    return [from, ...path, to];
  }

  draw(dt, player, yaw, target, opts = {}) {
    const cv = this.canvas, g = this.g, T = this.T;
    const dpr = opts.dpr || 1;
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const targetScale = (opts.car ? 1.05 : 1.75) * dpr;
    this.scale += (targetScale - this.scale) * Math.min(1, dt * 3);
    const k = this.scale / S;
    const rot = opts.rotate === false ? 0 : yaw;
    const cx = W / 2, cy = H * (T.cy ?? 0.56);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = T.viewBg; g.fillRect(0, 0, W, H);
    g.save();
    g.translate(cx, cy); g.rotate(rot); g.scale(k, k);
    g.translate(-this.px(player.x), -this.pz(player.z));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map, 0, 0);
    // route
    if (target) {
      this.routeT -= dt;
      if (!this.route || this.routeT <= 0) { this.route = this.computeRoute([player.x, player.z], [target.x, target.z]); this.routeT = 0.4; }
      this.route[0] = [player.x, player.z];
      g.strokeStyle = T.route; g.lineWidth = (2.6 * dpr) / k; g.lineCap = 'round'; g.lineJoin = 'round';
      g.setLineDash([2 * dpr / k, 6 * dpr / k]);
      g.lineDashOffset = -performance.now() * 0.02 * dpr / k;
      g.shadowColor = T.routeGlow; g.shadowBlur = 6 * dpr;
      g.beginPath(); this.route.forEach((p, i) => (i ? g.lineTo(this.px(p[0]), this.pz(p[1])) : g.moveTo(this.px(p[0]), this.pz(p[1])))); g.stroke();
      g.setLineDash([]); g.shadowBlur = 0;
    }
    g.restore();

    // POIs drawn in screen space (stay upright, clamp to edge)
    const toScreen = (x, z) => {
      const dx = (x - player.x) * this.scale, dz = (z - player.z) * this.scale;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [cx + dx * c - dz * s, cy + dx * s + dz * c];
    };
    const clampEdge = (p, m) => {
      if (T.round) { // round map: clamp to the inner circle
        const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy), R = Math.min(W, H) / 2 - m;
        return d > R ? [[cx + dx / d * R, cy + dy / d * R], true] : [p, false];
      }
      const x = Math.max(m, Math.min(W - m, p[0])), y = Math.max(m, Math.min(H - m, p[1]));
      return [[x, y], x !== p[0] || y !== p[1]];
    };
    for (const poi of opts.pois || []) {
      const [p] = clampEdge(toScreen(poi.x, poi.z), 10 * dpr);
      g.fillStyle = poi.color || T.poi;
      g.beginPath(); g.arc(p[0], p[1], 3 * dpr, 0, 7); g.fill();
    }
    if (target) {
      const [p, edge] = clampEdge(toScreen(target.x, target.z), 14 * dpr);
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.15;
      g.save(); g.translate(p[0], p[1]); g.rotate(Math.PI / 4); g.scale(pulse, pulse);
      g.shadowColor = T.target; g.shadowBlur = 10 * dpr;
      g.fillStyle = edge ? T.targetEdge : T.target;
      const r = 6 * dpr; g.fillRect(-r, -r, 2 * r, 2 * r);
      g.fillStyle = T.targetCore; g.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
      g.restore();
    }
    // player: view cone + arrow
    const heading = rot - yaw; // 0 when rotating map
    g.save(); g.translate(cx, cy); g.rotate(-heading);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 70 * dpr);
    cone.addColorStop(0, T.cone[0]); cone.addColorStop(1, T.cone[1]);
    g.fillStyle = cone; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 70 * dpr, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
    g.shadowColor = T.playerGlow; g.shadowBlur = 8 * dpr;
    g.fillStyle = opts.car ? T.playerCar : T.player;
    const a = 9 * dpr;
    g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.72, a * 0.8); g.lineTo(0, a * 0.38); g.lineTo(-a * 0.72, a * 0.8); g.closePath(); g.fill();
    g.restore();
    // edge vignette
    const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
    vg.addColorStop(0, T.vignette[0]); vg.addColorStop(1, T.vignette[1]);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return { cx, cy, rot };
  }
}
