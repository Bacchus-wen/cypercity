// Prop model lookup for the restyle: original street furniture, rooftop props and cherry trees were replaced by new
// designs built by pipeline/blender/street_props.py and cherry_trees.py into models/<dir>2/ (same node names, anchors
// and material names). ?props=legacy loads the originals; a missing new file falls back to the original.
const LEGACY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('props') === 'legacy';

export async function propGltf(assets, dir, name) {
  if (!LEGACY) {
    const g = await assets.gltf(`models/${dir}2/${name}.glb`);
    if (g) return g;
  }
  return assets.gltf(`models/${dir}/${name}.glb`);
}
