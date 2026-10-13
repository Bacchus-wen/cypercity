// Character library: loads crowd GLBs (male/female), builds shared node materials (wet-aware, tint
// palettes) and produces SkeletonUtils clones for NPCs / the player (ctx.api.crowd.createCharacter).
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, mix, clamp, max, smoothstep, normalWorld, positionWorld, texture, uv,
  materialColor, time, sin, fract, dot, oneMinus, step,
} from 'three/tsl';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const CROWD_U = {
  wetness: uniform(1.0),
  rain: uniform(1.0),
  lightning: uniform(0.0),
};

const ACCESSORIES = ['umbrella_black', 'umbrella_clear', 'umbrella_led', 'phone'];

// Per-material tint palettes (multiplied onto the albedo texture / base colour; absolute for procedural garments).
const PALETTES = {
  cloth_msuit: [[1, 1, 1], [0.55, 0.58, 0.7], [0.45, 0.42, 0.4], [0.35, 0.35, 0.38]],
  cloth_mjacket: [[1, 1, 1], [0.45, 0.45, 0.5], [0.6, 0.45, 0.35], [0.3, 0.32, 0.38]],
  cloth_mshirt: [[1, 1, 1], [0.5, 0.6, 0.8], [0.35, 0.35, 0.35]],
  cloth_mtee: [[0.35, 0.35, 0.38], [0.18, 0.18, 0.2], [0.6, 0.62, 0.65]],
  cloth_felegant: [[1, 1, 1], [0.5, 0.55, 0.75], [0.35, 0.3, 0.3]],
  cloth_fcasual: [[1, 1, 1], [0.35, 0.35, 0.4], [0.75, 0.55, 0.6]],
  cloth_fsport: [[1, 1, 1], [0.6, 0.4, 0.5], [0.35, 0.4, 0.45]],
  hair: [[0.16, 0.13, 0.12], [0.09, 0.08, 0.08], [0.3, 0.22, 0.16], [0.12, 0.1, 0.1], [0.5, 0.2, 0.55], [0.15, 0.45, 0.6], [0.1, 0.09, 0.09], [0.75, 0.72, 0.7]],
};
// absolute linear colours for procedural garments
const GARMENT = {
  rain_black: [[0.012, 0.012, 0.014], [0.01, 0.014, 0.03], [0.02, 0.025, 0.015], [0.08, 0.006, 0.01], [0.03, 0.03, 0.032]],
  rain_red: [[0.22, 0.012, 0.02], [0.012, 0.012, 0.014], [0.35, 0.22, 0.01], [0.01, 0.07, 0.07], [0.06, 0.012, 0.09]],
  trench_tan: [[0.30, 0.24, 0.15], [0.16, 0.15, 0.12], [0.05, 0.05, 0.055], [0.04, 0.05, 0.08]],
  trench_beige: [[0.42, 0.34, 0.24], [0.2, 0.17, 0.13], [0.06, 0.06, 0.065], [0.25, 0.09, 0.06]],
  tech_black: [[0.025, 0.026, 0.03], [0.05, 0.055, 0.045], [0.06, 0.06, 0.065], [0.015, 0.02, 0.035]],
  tech_white: [[0.55, 0.56, 0.58], [0.28, 0.29, 0.31], [0.03, 0.03, 0.035], [0.35, 0.3, 0.38]],
  knit_charcoal: [[0.06, 0.06, 0.065], [0.02, 0.02, 0.022], [0.15, 0.15, 0.16], [0.02, 0.03, 0.07], [0.12, 0.02, 0.03], [0.05, 0.06, 0.035]],
  knit_grey: [[0.22, 0.21, 0.23], [0.03, 0.03, 0.035], [0.35, 0.22, 0.3], [0.04, 0.08, 0.12], [0.5, 0.48, 0.45]],
  skirt_black: [[0.02, 0.02, 0.022], [0.12, 0.03, 0.035], [0.05, 0.05, 0.06]],
  tights_black: [[0.03, 0.03, 0.035], [0.015, 0.015, 0.018]],
  boots_black: [[0.02, 0.018, 0.017], [0.05, 0.035, 0.025]],
  trim_cyan: [[0.1, 0.9, 1.0], [1.0, 0.2, 0.65], [1.0, 0.45, 0.08], [0.5, 1.0, 0.2]],
  trim_magenta: [[1.0, 0.15, 0.6], [0.1, 0.9, 1.0], [0.75, 0.3, 1.0]],
};
// fabric detail textures for procedural garments: [detail, normal, repeat, normalScale]
const FABRIC = {
  rain: ['fab_pvc', 2.5, 0.6], trench: ['fab_twill', 9, 0.7], tech: ['fab_nylon', 5, 0.8], knit: ['fab_knit', 9, 0.9],
  skirt: ['fab_twill', 10, 0.6], boots: ['fab_pvc', 4, 0.3],
};

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export class CharacterLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.sexes = {};      // sex -> { gltf, meta, templates: {outfit: Object3D}, clips: {name: AnimationClip} }
    this.matCache = new Map();
    this.textures = new Map();
  }

  async load() {
    const ctx = this.ctx;
    const load = async (sex) => {
      const [gltf, meta] = await Promise.all([
        ctx.assets.gltf(`models/crowd/${sex}.glb`),
        fetch(`/models/crowd/${sex}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!gltf || !meta) return;
      await this.prepareTextures(meta);
      const clips = {};
      for (const c of gltf.animations) clips[c.name] = c;
      const entry = { sex, gltf, meta, clips, templates: {}, lodTemplates: {}, outfits: Object.keys(meta.outfits) };
      this.sexes[sex] = entry;
      this.buildTemplates(entry);
    };
    await Promise.all([...['male', 'female'].map(load), this.loadFabrics()]);
    this.outfitList = [];
    for (const s of Object.values(this.sexes)) for (const o of s.outfits) this.outfitList.push({ sex: s.sex, outfit: o });
    return this.outfitList.length > 0;
  }

  async prepareTextures(meta) {
    const jobs = [];
    for (const [mname, t] of Object.entries(meta.textures || {})) {
      for (const [slot, path] of Object.entries(t)) {
        if (this.textures.has(path)) continue;
        const p = this.ctx.assets.texture(path, { srgb: slot === 'map' }).then((tex) => {
          if (tex) { tex.flipY = false; tex.anisotropy = 8; tex.needsUpdate = true; }
          this.textures.set(path, tex);
        });
        this.textures.set(path, null);
        jobs.push(p);
      }
    }
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------------------------------------ materials
  // One shared material per material name; per-character colour variation comes from a per-object
  // uniform (object.userData.tint) so tint variants never create new pipelines.
  tintFor(name, meta, tintIdx) {
    const kind = name.startsWith('hair') ? 'hair' : name;
    const gpal = GARMENT[name];
    if (gpal) { const c = gpal[tintIdx % gpal.length]; return new THREE.Color(c[0], c[1], c[2]); }
    const pal = PALETTES[kind];
    if (pal) { const c = pal[tintIdx % pal.length]; return new THREE.Color(c[0], c[1], c[2]); }
    const tex = meta.textures?.[name];
    if (tex?.map) return new THREE.Color(1, 1, 1);
    const mm = meta.materials?.[name];
    const c = mm?.color || [1, 1, 1];
    return new THREE.Color(c[0], c[1], c[2]);
  }

  material(name, meta) {
    if (this.matCache.has(name)) return this.matCache.get(name);
    const mm = meta.materials?.[name] || {};
    const tex = meta.textures?.[name] || {};
    const map = tex.map ? this.textures.get(tex.map) : null;
    const nmap = tex.normal ? this.textures.get(tex.normal) : null;
    const kind = name.startsWith('hair') ? 'hair' : name;
    let m;
    const W = CROWD_U.wetness;
    const isUmbrella = name.startsWith('umb_');
    const glossy = isUmbrella || name.startsWith('rain') || name.startsWith('boots') || name === 'phone_body';
    const fab = FABRIC[name.split('_')[0]];
    const tintU = uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }) => object.userData.tint);
    if (name === 'umb_clear') {
      m = new THREE.MeshPhysicalNodeMaterial({ color: 0xdfe8f0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
      m.clearcoat = 1; m.clearcoatRoughness = 0.02;
    } else if (glossy) {
      m = new THREE.MeshPhysicalNodeMaterial({ roughness: mm.roughness ?? 0.3, metalness: mm.metalness ?? 0 });
      m.clearcoat = mm.coat ?? 0.8; m.clearcoatRoughness = 0.06;
      if (isUmbrella) m.side = THREE.DoubleSide;
    } else {
      m = new THREE.MeshStandardNodeMaterial({ roughness: mm.roughness ?? 0.7, metalness: mm.metalness ?? 0 });
    }
    m.name = 'crowd_' + name;
    let detail = null, detailRep = 1;
    if (fab && !map) {
      detail = this.fabric(fab[0] + '_d.jpg', true, fab[1]); detailRep = fab[1];
      const nrm = this.fabric(fab[0] + '_n.jpg', false, fab[1]);
      if (nrm) { m.normalMap = nrm; m.normalScale = new THREE.Vector2(fab[2], fab[2]); }
    }
    if (map) m.map = map;
    if (nmap) { m.normalMap = nmap; m.normalScale = new THREE.Vector2(1, 1); }
    if (kind === 'hair' || name === 'brow' || name === 'lash') {
      m.alphaTest = 0.45;
      m.side = THREE.DoubleSide;
      m.roughness = 0.45;
    }
    if (name === 'skin') m.roughness = 0.5;
    if (name === 'eyes') m.roughness = 0.08;
    if (mm.emissiveIntensity > 0) {
      const k = name.startsWith('trim') ? 5 : mm.emissiveIntensity;
      m.emissiveNode = name.startsWith('trim') ? tintU.mul(k) : vec3(...mm.emissive).mul(k);
    }
    if (name !== 'umb_clear') {
      let colorBase = map ? texture(map).rgb.mul(tintU) : tintU;
      if (detail) colorBase = colorBase.mul(texture(detail, uv().mul(detailRep)).r.mul(2.0));
      const alpha = map ? texture(map).a : float(1);
      if (name !== 'umb_led' && name !== 'phone_screen' && name !== 'eyes') {
        // Wetness: porous darkening + thin water film gloss, strongest on up/out-facing surfaces.
        const baseRough = m.roughness;
        const porosity = name === 'skin' ? 0.15 : (glossy ? 0.05 : (kind === 'hair' ? 0.5 : 0.45));
        const up = clamp(normalWorld.y.mul(0.6).add(0.55), 0, 1);
        const wetAmt = W.mul(up);
        m.colorNode = vec4(colorBase.mul(mix(float(1), float(1 - porosity * 0.6), wetAmt)), alpha);
        const wetRough = glossy ? 0.08 : (name === 'skin' ? 0.3 : 0.42);
        m.roughnessNode = mix(float(baseRough), float(Math.min(baseRough, wetRough)), wetAmt);
      } else {
        m.colorNode = vec4(colorBase, alpha);
      }
    }
    this.matCache.set(name, m);
    return m;
  }

  fabric(file, srgb, repeat) {
    const path = 'textures/crowd/' + file;
    const k = path + '|' + repeat;
    if (this.textures.has(k)) return this.textures.get(k);
    const t = this.fabricTex?.[k] ?? null;
    return t;
  }

  async loadFabrics() {
    this.fabricTex = {};
    const jobs = [];
    for (const [f, rep] of Object.values(FABRIC).map((x) => [x[0], x[1]])) {
      for (const suf of ['_d.jpg', '_n.jpg']) {
        const path = 'textures/crowd/' + f + suf;
        const k = path + '|' + rep;
        if (k in this.fabricTex) continue;
        this.fabricTex[k] = null;
        jobs.push(this.ctx.assets.texture(path, { srgb: suf === '_d.jpg', repeat: [rep, rep] }).then((t) => {
          if (t) { t.flipY = false; t.needsUpdate = true; }
          this.fabricTex[k] = t;
        }));
      }
    }
    await Promise.all(jobs);
  }

  buildTemplates(entry) {
    const root = entry.gltf.scene;
    root.updateMatrixWorld(true);
    // find skinned meshes by name
    const byName = {};
    root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) byName[o.name] = o; if (o.isGroup && o.children.some((c) => c.isMesh)) byName[o.name] = o; });
    entry.byName = byName;
    for (const outfit of entry.outfits) {
      entry.templates[outfit] = this.makeTemplate(entry, ['outfit_' + outfit, ...ACCESSORIES]);
      entry.lodTemplates[outfit] = byName['outfit_' + outfit + '_lod1'];
    }
  }

  // Clone gltf scene and keep only listed mesh objects (multi-primitive meshes become Groups).
  makeTemplate(entry, keep) {
    const c = SkeletonUtils.clone(entry.gltf.scene);
    const remove = [];
    c.traverse((o) => {
      if ((o.isMesh || o.isSkinnedMesh) && o.parent) {
        const top = o.parent.isGroup && o.parent.name.startsWith('outfit_') || o.parent.name.startsWith('umbrella_') || o.parent.name === 'phone' ? o.parent : o;
        const nm = top.name;
        if (!keep.includes(nm)) remove.push(o);
      }
    });
    for (const o of remove) o.parent.remove(o);
    return c;
  }

  // ------------------------------------------------------------------------------------------ public
  /**
   * variant: string 'male:m_suit' | { sex, outfit, tint, hairTint, umbrella: 'black'|'clear'|'led'|null, phone, seed }
   * Returns { object, mixer, actions, play(name, fade), setAccessory(umbrella, phone), meta }
   */
  createCharacter(variant = {}) {
    if (typeof variant === 'string') {
      const [sex, outfit] = variant.split(':');
      variant = { sex, outfit };
    }
    const sexes = Object.keys(this.sexes);
    if (!sexes.length) return null;
    const seed = variant.seed ?? 1;
    const sex = this.sexes[variant.sex] ? variant.sex : sexes[seed % sexes.length];
    const entry = this.sexes[sex];
    const outfit = entry.templates[variant.outfit] ? variant.outfit : entry.outfits[seed % entry.outfits.length];
    const obj = SkeletonUtils.clone(entry.templates[outfit]);
    obj.name = `crowd_${sex}_${outfit}`;
    const tint = variant.tint ?? (seed >>> 3);
    const hairTint = variant.hairTint ?? (seed >>> 7);
    const acc = {};
    obj.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinned bounds are unreliable when animated
        o.castShadow = true; o.receiveShadow = true;
        const nm = (o.material?.name || '').replace(/^crowd_/, '');
        const isHair = nm.startsWith('hair');
        o.material = this.material(nm, entry.meta);
        o.userData.matName = nm;
        o.userData.tint = this.tintFor(nm, entry.meta, isHair ? hairTint : tint);
        const top = o.parent && (o.parent.name.startsWith('umbrella_') || o.parent.name === 'phone') ? o.parent : o;
        if (ACCESSORIES.includes(top.name)) { (acc[top.name] ||= []).push(o); o.visible = false; }
      }
    });
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const [n, clip] of Object.entries(entry.clips)) {
      const a = mixer.clipAction(clip);
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      actions[n] = a;
    }
    const sole = entry.meta.outfits[outfit]?.sole ?? 0;
    const lib = this;
    const ch = {
      object: obj, mixer, actions, sex, outfit, sole, meta: entry.meta,
      setTint(t, h) {
        obj.traverse((o) => { if (o.isMesh && o.userData.matName) o.userData.tint = lib.tintFor(o.userData.matName, entry.meta, o.userData.matName.startsWith('hair') ? h : t); });
      },
      current: null,
      clipInfo: entry.meta.clips,
      setAccessory(umbrella, phone) {
        for (const k of ACCESSORIES) for (const m of acc[k] || []) m.visible = false;
        if (umbrella) for (const m of acc['umbrella_' + umbrella] || []) m.visible = true;
        if (phone) for (const m of acc.phone || []) m.visible = true;
      },
      play(name, fade = 0.3) {
        const a = actions[name];
        if (!a || ch.current === a) return;
        if (ch.current && fade > 0) { a.setEffectiveWeight(1); ch.current.crossFadeTo(a, fade, false); }
        else { for (const x of Object.values(actions)) x.setEffectiveWeight(0); a.setEffectiveWeight(1); }
        a.time = ch.current ? ch.current.time / ch.current.getClip().duration * a.getClip().duration : 0;
        ch.current = a;
      },
      update(dt) { mixer.update(dt); },
    };
    ch.setAccessory(variant.umbrella, variant.phone);
    if (variant.clip) ch.play(variant.clip, 0);
    return ch;
  }
}

export { hashStr, ACCESSORIES };
