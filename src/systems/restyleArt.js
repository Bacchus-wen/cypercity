// Raster art of the restyle: the original ads, posters, light boxes, billboard and shop/interior pictures are being
// replaced by original images (Codex image generation -> tools/compose_atlas.py) in textures/<dir>2/ with the same
// size and grid layout. REPLACED lists the files that already have a replacement (explicit, so nothing probes for
// missing files); ?art=legacy keeps the originals.
const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('art') === 'legacy';
const REPLACED = new Set([
  'signage/ads_grid.png', 'signage/billboard_mirai.png', 'signage/posters_atlas.png', 'signage/lightbox_atlas.png',
  'buildings/shop_ramen.png', 'buildings/shop_izakaya.png', 'buildings/shop_konbini.png', 'buildings/shop_pachinko.png',
  'buildings/vending.png', 'buildings/noren.png', 'buildings/shutter.png', 'buildings/shelves.png', 'buildings/posters.png',
  'buildings/interior_atlas.png', 'landmarks/holo_ads.png', 'landmarks/holo_ads2.png', 'landmarks/holo_ads3.png',
  'buildings/atlas_albedo.png', 'buildings/atlas_normal.png', // painted facade atlas (tools/facade_atlas.py)
]);

// English-only variants baked by tools/bake_en.mjs (Japanese lettering painted over with the restyle's own brands)
const EN = new Set([
  'signage/lightbox_atlas.png', 'signage/posters_atlas.png', 'signage/ads_grid.png', 'buildings/shop_ramen.png', 'buildings/shop_izakaya.png',
  'buildings/noren.png', 'buildings/posters.png', 'landmarks/holo_ads.png', 'landmarks/holo_ads2.png', 'landmarks/holo_ads3.png',
]);

// restyle signage (English-led Night City texts in signage/library.js) follows the same switch
export const ART_RESTYLE = !LEGACY;

export function artPath(path) {
  const key = path.replace(/^textures\//, '');
  if (LEGACY || !REPLACED.has(key)) return path;
  const i = key.indexOf('/');
  const file = EN.has(key) ? key.slice(i + 1).replace(/\.png$/, '_en.png') : key.slice(i + 1);
  return `textures/${key.slice(0, i)}2/${file}`;
}
