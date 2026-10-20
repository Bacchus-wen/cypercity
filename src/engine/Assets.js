import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { ANIME } from './AnimeLook.js';

// Anime look: photographic surface textures (asphalt, pavers, concrete, bark, facade atlas) are downscaled on load so
// their fine grain disappears and only large colour blocks and patterns remain. Illustrated textures (signs, posters,
// shop interiors, holo ads) are left alone.
const ANIME_FLATTEN = [/^textures\/ground\/(?!litter|petals)/, /^textures\/landmarks\/(bark|concrete|stonewall|wood_slats)/, /^textures\/buildings\/atlas_(albedo|normal)/];
const ANIME_FLATTEN_FACTOR = 4;

// Provisional anime palette for the facade atlas (until the user's visual references arrive): darker, cooler,
// less saturated walls so the neon reads against a violet-grey base instead of milky beige.
const ANIME_GRADE = { 'textures/buildings/atlas_albedo.png': { filter: 'saturate(0.7) brightness(0.8)', tint: 'rgb(214,208,255)' } };

function downscale(t, f, grade) {
  const img = t.image;
  if (!img || !img.width) return;
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.round(img.width / f));
  c.height = Math.max(16, Math.round(img.height / f));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (grade?.filter) g.filter = grade.filter;
  g.drawImage(img, 0, 0, c.width, c.height);
  if (grade?.tint) { g.filter = 'none'; g.globalCompositeOperation = 'multiply'; g.fillStyle = grade.tint; g.fillRect(0, 0, c.width, c.height); }
  t.image = c;
}

// Asset cache. Paths are relative to /assets (Vite publicDir), e.g. 'textures/asphalt/albedo.png'.
export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.texLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this.hdrLoader = new HDRLoader();
    this.cache = new Map();
  }

  // opts: { srgb: bool (true for albedo/emissive), repeat: [x,y], anisotropy }
  texture(path, opts = {}) {
    const key = 'tex:' + path + JSON.stringify(opts);
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.texLoader.loadAsync(import.meta.env.BASE_URL + path).then((t) => {
      t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
      t.anisotropy = opts.anisotropy ?? 16;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      if (ANIME && ANIME_FLATTEN.some((r) => r.test(path))) downscale(t, path.startsWith('textures/ground/') ? 12 * ANIME_FLATTEN_FACTOR : ANIME_FLATTEN_FACTOR, ANIME_GRADE[path]); // ground: base colour only, shapes come from the procedural patches/markings
      t.needsUpdate = true;
      return t;
    }).catch((e) => { console.warn('[assets] missing texture', path, e?.message); return null; });
    this.cache.set(key, p);
    return p;
  }

  gltf(path) {
    const key = 'gltf:' + path;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.gltfLoader.loadAsync(import.meta.env.BASE_URL + path).catch((e) => { console.warn('[assets] missing gltf', path, e?.message); return null; });
    this.cache.set(key, p);
    return p;
  }

  hdr(path) {
    const key = 'hdr:' + path;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.hdrLoader.loadAsync(import.meta.env.BASE_URL + path).catch(() => null);
    this.cache.set(key, p);
    return p;
  }
}
