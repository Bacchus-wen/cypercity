// Landmarks workstream: elevated rail + trains, expressway, river + embankments + promenade furniture,
// cherry blossom trees + petals, bridge, distant skyline megatowers with holo ads.
import * as THREE from 'three/webgpu';
import { loadTextures, U } from './materials.js';
import { buildRail } from './rail.js';
import { buildExpressway } from './expressway.js';
import { buildSkyline } from './skyline.js';
import { buildSkyline2 } from './skyline2.js';
import { buildRiver } from './river.js';
import { buildTrees } from './trees.js';
import { buildBridge } from './bridge.js';
import { buildProps } from './props.js';
import { buildPalms } from './palms.js';
import { buildPlaza, plazaPalmSpots } from './plaza.js';
import { buildIntersectionHolos } from './holo.js';
import { buildStreetKit } from './streetkit.js';
import { buildBoats } from './boats.js';
import { buildSpire } from './spire.js';
import { buildDroneShow } from './droneshow.js';
import { buildSprayBooth } from '../player/spray.js';
import { buildPigeons } from './pigeons.js';
import { ContactShadows, addFootprint } from '../../engine/contactShadows.js';
import { buildTacoTruck } from '../player/taco.js';

const optional = async (name, fn) => {
  try { return await fn(); } catch (e) { console.error(`[landmarks] ${name} failed`, e); return null; }
};

// palm positions of the restyle map: along the canal promenade (inner side, away from the rail) and on the median
function palmSpots(L) {
  const P = L.promenade, A = L.avenue, cz = L.crossStreets;
  const near = (z, c, d) => Math.abs(z - c) < d;
  const promenade = [], median = [];
  let k = 0;
  for (let z = P.zStart - 4; z > P.zEnd + 4; z -= 12) {
    if (L.bridges.some((b) => near(z, b.z, 14)) || near(z, L.elevatedRail.z, 7) || near(z, L.expressway.z, 11)) continue;
    // along the railing, clear of the promenade walking lane (crowd lane spans the middle of the promenade)
    promenade.push({ x: P.xMax - 1.0 - (k % 2) * 0.3, z, rot: k * 1.37, scale: 0.92 + (k % 3) * 0.06, s: 1 });
    k++;
  }
  if (A.medianHalf) {
    for (let z = A.zStart - 10; z > A.zEnd + 10; z -= 16) {
      if (cz.zs.some((c) => near(z, c, cz.roadHalfWidth + 9)) || near(z, L.elevatedRail.z, 4) || near(z, L.expressway.z, 4)) continue;
      median.push({ x: 0, z, rot: z * 0.91, scale: 1.0 });
    }
  }
  return { promenade, median };
}

export default {
  async init(ctx) {
    const root = new THREE.Group();
    root.name = 'landmarks';
    ctx.scene.add(root);
    this.root = root;
    const tex = await loadTextures(ctx);
    this.tex = tex;
    this.updaters = [];

    // Debug fallback: when the ground system is not loaded (?only=...), add a simple dark floor with a river cut-out
    const hasGround = ctx.engine?.systems?.some((s) => s.name === 'ground');
    if (!hasGround) {
      const R = ctx.layout.river;
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x0c0c0e, roughness: 0.7 });
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2000).rotateX(-Math.PI / 2), m);
      w.position.set(R.xCenter - R.halfWidth - 700, 0, -300); root.add(w);
      const e = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2000).rotateX(-Math.PI / 2), m);
      e.position.set(R.xCenter + R.halfWidth + 700, 0, -300); root.add(e);
    }

    const api = {};
    const rail = await optional('rail', () => buildRail(ctx, tex, root));
    if (rail) { api.rail = rail.api; this.updaters.push(rail.update); }
    const ex = await optional('expressway', () => buildExpressway(ctx, tex, root));
    if (ex) api.expressway = ex.api;
    const river = await optional('river', () => buildRiver(ctx, tex, root));
    if (river) { api.river = river.api; this.river = river; }
    // restyle map: fan palms (canal promenade, boulevard median, plaza) instead of the cherry trees; central plaza
    const L = ctx.layout;
    let trees = null;
    if (L.plaza) {
      const spots = palmSpots(L);
      await optional('palms', () => buildPalms(ctx, root, [...spots.promenade, ...spots.median, ...plazaPalmSpots(L)].map((s, i) => ({ variant: i * 7 % 4, ...s }))));
      trees = { spots: spots.promenade };
      const plaza = await optional('plaza', () => buildPlaza(ctx, tex, root));
      if (plaza) this.updaters.push(plaza.update);
      const holos = await optional('holos', () => buildIntersectionHolos(ctx, tex, root));
      if (holos) this.updaters.push(holos.update);
      await optional('streetkit', () => buildStreetKit(ctx, tex, root));
      const boats = await optional('boats', () => buildBoats(ctx, root));
      if (boats) this.updaters.push(boats.update);
      const spire = await optional('spire', () => buildSpire(ctx, root));
      if (spire) this.updaters.push(spire.update);
      const drones = await optional('droneShow', () => buildDroneShow(ctx, root));
      if (drones) { api.droneShow = drones; this.updaters.push(drones.update); }
      // (flying pigeons keep out of the palm crowns: canal promenade row + plaza palms)
      const palmsAll = [...palmSpots(L).promenade, ...plazaPalmSpots(L)];
      for (const p of [...palmsAll, ...palmSpots(L).median]) addFootprint(ctx, p.x, p.y ?? ctx.api.ground?.heightAt?.(p.x, p.z) ?? 0.15, p.z, 1.3 * (p.scale ?? 1));
      const crowns = palmsAll.flatMap((p) => {
        const y = p.y ?? 0, sc = p.scale ?? 1;
        return [{ x: p.x, z: p.z, r: 0.5, y0: y, y1: y + 12 * sc }, { x: p.x, z: p.z, r: 3.2 * sc, y0: y + 5 * sc, y1: y + 12 * sc }]; // trunk + crown
      });
      const pigeons = await optional('pigeons', () => buildPigeons(ctx, root, crowns));
      if (pigeons) { api.pigeons = pigeons.api; this.updaters.push(pigeons.update); }
      const taco = await optional('tacoTruck', () => buildTacoTruck(ctx, root));
      if (taco) this.updaters.push(taco.update);
      const booth = await optional('sprayBooth', () => buildSprayBooth(ctx, root));
      if (booth) { api.sprayBooth = booth; this.updaters.push(booth.update); }
    } else trees = await optional('trees', () => buildTrees(ctx, tex, root));
    await optional('props', () => buildProps(ctx, tex, root, trees?.spots || []));
    const br = await optional('bridge', () => buildBridge(ctx, tex, root));
    if (br) api.bridges = br.api;
    // restyle skyline (Night City direction) by default; ?skyline=legacy builds the original towers
    const legacySky = new URLSearchParams(location.search).get('skyline') === 'legacy';
    const sky = await optional('skyline', () => (legacySky ? buildSkyline(ctx, tex, root) : buildSkyline2(ctx, tex, root)));
    if (sky) api.skyline = { towers: sky.towers.map((t) => ({ x: t.x, z: t.z, w: t.w, d: t.d, h: t.h })) };
    ctx.api.landmarks = api;
  },

  // The river's planar reflection re-renders the whole scene from a mirrored camera, nested inside the scene pass
  // (one render call deeper), into its own half-float target. Compile that pass up front like the main one; otherwise
  // its pipelines are built synchronously on the first frame the water is drawn.
  async precompile(ctx) {
    const base = this.river?.reflector?.reflector;
    if (!base || !ctx.engine.compilePass) return;
    const cam = base.getVirtualCamera(ctx.camera);
    const water = this.river.water.material;
    water.visible = false; // the reflector hides its own surface while rendering
    try {
      await ctx.engine.compilePass(ctx.scene, cam, { renderTarget: base.getRenderTarget(cam), callDepth: ctx.engine.sceneDepth + 1, label: 'reflections', weight: 0.25 });
    } finally {
      water.visible = true;
    }
  },

  update(dt, t, ctx) {
    // first frame: every system has registered its street-furniture footprints by now - draw them in one batch
    if (!this._fp && ctx.footprints?.length) {
      this._fp = new ContactShadows(ctx.scene, ctx.footprints.length, { shape: 'ellipse', strength: 0.6, name: 'static_contact_shadows' });
      this._fp.begin(); for (const f of ctx.footprints) this._fp.add(...f); this._fp.end();
      this._fp.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }
    U.wet.value = ctx.weather?.wetness ?? 1;
    U.lightning.value = ctx.weather?.lightning ?? 0;
    for (const u of this.updaters) u(dt, t, ctx);
  },
};
