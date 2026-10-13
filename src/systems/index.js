// System registry. Order matters (init order). Each system lives in its own folder, owned by one workstream.
// Systems are loaded with isolated dynamic imports so a broken module never takes down the rest of the game.
// URL params: ?only=a,b  (load subset)   ?skip=a,b  (exclude)
const ORDER = [
  'atmosphere', // sky, fog, volumetrics, environment lighting
  'ground',     // roads, sidewalks, puddles, wet surface materials
  'buildings',  // architecture, shopfronts, interiors, rooftop clutter, wires
  'landmarks',  // elevated rail + train, expressway, river, promenade, cherry trees, bridge, skyline
  'signage',    // neon signs, holo billboards, lanterns, street lamps (and their lights)
  'vehicles',   // parked cars, traffic, flying cars, drivable car
  'crowd',      // pedestrians
  'weather',    // rain, splashes, drips, mist, lightning
  'player',     // controller, camera, HUD
  'audio',      // ambience
];

const qs = new URLSearchParams(location.search);
const only = qs.get('only')?.split(',');
const skip = qs.get('skip')?.split(',') || [];

const loaded = await Promise.all(ORDER.filter((n) => (!only || only.includes(n)) && !skip.includes(n)).map(async (name) => {
  try {
    const mod = await import(`./${name}/index.js`);
    return { name, ...mod.default };
  } catch (e) {
    console.error(`[systems] failed to load "${name}"`, e);
    return null;
  }
}));

export const SYSTEMS = loaded.filter(Boolean);
