// Buildings workstream: architecture of the district (facades, shopfronts, interiors, props, cables, alley, overlook).
import * as THREE from 'three/webgpu';
import { float } from 'three/tsl';
import { buildPlan, MASS } from './plan.js';
import { makeIndex, buildPods, buildStairs, buildSkybridges, buildDucts, facadeBlocks } from './megamass.js';
import { ChunkedBuckets } from './geom.js';
import { buildLotArchitecture, sideFrame } from './architecture.js';
import { ShopBuilder, SLOTS, ATLAS_SIZE, ATLAS_SOURCES } from './shops.js';
import { createFacadeMaterial, createDetailMaterial, createGlassMaterial, createNoiseTexture } from './materials.js';
import { buildProps } from './props.js';
import { buildCables } from './cables.js';
import { buildAlley } from './alley.js';
import { buildOverlook } from './overlook.js';
import { artPath, ART_RESTYLE } from '../restyleArt.js';
import { buildRooftops2 } from './rooftops2.js';
import { planLedWraps, buildLedWraps } from './ledwraps.js';
import { TOD } from '../../engine/timeOfDay.js';

async function loadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('missing ' + url);
  return createImageBitmap(await r.blob());
}

async function buildShopAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_SIZE;
  const g = cv.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  await Promise.all(Object.entries(ATLAS_SOURCES).map(async ([slot, file]) => {
    try {
      const img = await loadImage(`${import.meta.env.BASE_URL}${artPath(`textures/buildings/${file}.png`)}`);
      const [x, y, w, h] = SLOTS[slot];
      g.drawImage(img, x, y, w, h);
      img.close?.();
    } catch (e) { console.warn('[buildings] atlas slot missing', slot, e.message); }
  }));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export default {
  async init(ctx) {
    const { scene, layout: L, physics } = ctx;
    const t0 = performance.now();
    let wetness = float(1);
    try { const w = await import('../../materials/wet.js'); if (w?.wetUniforms?.wetness) wetness = w.wetUniforms.wetness; } catch { /* optional */ }

    // (restyle: the painted facade atlas of textures/buildings2/ replaces the photo atlas; ?art=legacy keeps it)
    const albedoPath = artPath('textures/buildings/atlas_albedo.png');
    const restyle = albedoPath !== 'textures/buildings/atlas_albedo.png';
    const [albedo, normal, interior, shopAtlas] = await Promise.all([
      ctx.assets.texture(albedoPath, { srgb: true, anisotropy: 8 }),
      ctx.assets.texture(artPath('textures/buildings/atlas_normal.png'), { srgb: false, anisotropy: 8 }),
      ctx.assets.texture(artPath('textures/buildings/interior_atlas.png'), { srgb: true, anisotropy: 4 }),
      buildShopAtlas(),
    ]);
    const noise = createNoiseTexture(512);
    const mats = {
      facade: createFacadeMaterial({ albedo, normal, interior, wetness, noise, restyle }),
      detail: createDetailMaterial({ atlas: shopAtlas, wetness, noise }),
      glass: createGlassMaterial({ restyle: ART_RESTYLE }),
    };
    this.mats = mats;

    // ---------- plan ----------
    const { lots } = buildPlan(L);
    const B = new ChunkedBuckets(96);
    const out = { colliders: [], lights: [], facades: [], props: null };
    for (const lot of lots) buildLotArchitecture(lot, B, out);
    // Night City massing additions (bridges first: they claim space, pods and stairs avoid them)
    if (MASS) {
      const IX = makeIndex(lots, L);
      const bridges = buildSkybridges(lots, B, L, IX);
      const pods = buildPods(lots, B, IX);
      const stairs = buildStairs(lots, B, IX);
      const ducts = buildDucts(lots, B, IX);
      console.log(`[buildings] massing: ${ducts} ducts, ${bridges.length} sky bridges (${bridges.map((b) => (b.axis === 'x' ? `z${b.c.toFixed(0)}` : `x${b.c.toFixed(0)}/z${b.z}`) + `@${b.y0.toFixed(0)}`).join(' ')}), ${pods} pods, ${stairs} stair towers`);
    }
    // restyle LED ribbons: planned before the facade API so the signage keeps clear of them
    const ledPlan = ART_RESTYLE ? planLedWraps(lots, L) : [];

    // ---------- shopfronts ----------
    const shops = new ShopBuilder(B, out);
    const OPEN = ['izakaya', 'ramen', 'bar', 'boutique', 'konbini', 'izakaya', 'ramen'];
    let prev = null;
    for (const lot of lots) {
      for (const f of lot.fronts) {
        if (!(f.shop && lot.detail === 'hi' && f.baseY >= 0)) continue;
        const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
        // force the hero ramen shop on the left of the street view (ref panel 1)
        let type = null;
        if (f.district === 'avenue' && lot.x1 <= -9 && lot.z0 < 26 && lot.z1 > 18) type = 'ramen';
        // merged podium stores are lit shops (a wide shutter or lobby read as a big black door)
        else if (lot.podium) type = ['konbini', 'pachinko', 'boutique', 'bar'][lot.id % 4];
        // never two closed/quiet fronts in a row: keeps the street level lit and alive
        else if (prev && prev.closed && Math.hypot(prev.x - cx, prev.z - cz) < 16) type = OPEN[lot.id % OPEN.length];
        f.shopType = shops.build(lot, f, { type });
        prev = { x: cx, z: cz, closed: f.shopType === 'shutter' || f.shopType === 'lobby' };
      }
    }

    // ---------- props, cables, alley, overlook ----------
    const inst = await buildProps(ctx, lots, B, out, { wetness });
    buildAlley(ctx, lots, B, out);
    buildOverlook(ctx, lots, B, out);
    buildCables(ctx, lots, B, out);

    // ---------- meshes ----------
    const group = new THREE.Group();
    group.name = 'buildings';
    let tris = 0, meshes = 0;
    for (const b of B.map.values()) {
      const geo = b.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mats[b.matKey]);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      if (b.matKey === 'glass') mesh.renderOrder = 2;
      group.add(mesh);
      tris += geo.index.count / 3; meshes++;
    }
    for (const m of inst) group.add(m);
    if (ART_RESTYLE) { try { for (const m of buildRooftops2(ctx, lots)) group.add(m); } catch (e) { console.error('[buildings] rooftops2 failed', e); } }
    if (ledPlan.length) { try { for (const m of buildLedWraps(ledPlan)) group.add(m); } catch (e) { console.error('[buildings] LED ribbons failed', e); } }
    scene.add(group);
    this.group = group;

    // ---------- lights (shop interiors spill onto sidewalks) ----------
    // budget: drop minor lights and keep at most one light per ~9m (clustered lighting cost scales with overlap)
    const kept = [];
    const cand = out.lights.filter((l) => !l.minor).sort((a, b) => b.intensity - a.intensity);
    for (const l of cand) {
      if (kept.some((k) => (k.pos[0] - l.pos[0]) ** 2 + (k.pos[1] - l.pos[1]) ** 2 + (k.pos[2] - l.pos[2]) ** 2 < 121)) continue;
      kept.push(l);
    }
    out.lights = kept;
    for (const l of out.lights) {
      // (shop spill follows the time of day: full at night, about half at dusk; before, dusk kept full-strength
      //  shop pools that read as hard orange blobs on the sidewalk)
      const pl = new THREE.PointLight(new THREE.Color(...l.color), l.intensity * (0.4 + 0.6 * TOD.lights), l.distance, 2);
      pl.position.set(...l.pos);
      pl.castShadow = false;
      group.add(pl);
    }

    // ---------- colliders ----------
    if (physics?.world && physics.RAPIER) {
      const { RAPIER, world } = physics;
      for (const c of out.colliders) {
        const d = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z);
        if (c.rotY) d.setRotation({ x: 0, y: Math.sin(c.rotY / 2), z: 0, w: Math.cos(c.rotY / 2) });
        if (c.rot) d.setRotation(c.rot);
        world.createCollider(d);
      }
    }

    // ---------- facade API ----------
    const facades = [];
    for (const lot of lots) {
      for (const f of lot.fronts) {
        const v = (lot.overhang && f.side === lot.overhangSide) ? lot.volumes[1] : lot.volumes[0];
        const fr = sideFrame(v, f.side, 0);
        const baseY = f.baseY > 0 ? f.baseY : 0;
        const height = lot.h - baseY;
        const center = new THREE.Vector3(fr.origin[0] + fr.right[0] * fr.width / 2, baseY + height / 2, fr.origin[2] + fr.right[2] * fr.width / 2);
        facades.push({
          center, normal: new THREE.Vector3(...fr.normal), right: new THREE.Vector3(...fr.right),
          width: fr.width, height, floors: lot.floors, floorHeight: lot.floorH, district: f.district,
          shopfront: !!f.shopType,
          // extras
          baseY, groundFloorHeight: lot.groundH, shopType: f.shopType || null, lane: !!f.lane, detail: lot.detail,
          style: lot.style, lotId: lot.id, overhang: (lot.overhang && f.side === lot.overhangSide) ? lot.overhang : 0, fasciaY: baseY + lot.groundH - 0.45, totalHeight: lot.h,
          // wall areas covered by pods / sky bridge ends ({a0,a1,y0,y1}, a along `right` from the centre): no signs there
          blocks: facadeBlocks(lot, f.side, fr),
        });
      }
    }
    ctx.api.buildings = { facades, lots, group };
    console.log(`[buildings] ${lots.length} lots, ${facades.length} facades, ${meshes} meshes, ${(tris / 1e6).toFixed(2)}M tris, ${out.lights.length} lights, ${out.colliders.length} colliders, ${(performance.now() - t0).toFixed(0)}ms`);
  },
  update() {},
};
