// Shared world plan. ALL systems must place content according to this layout so districts fit together.
// Units: meters. +Y up. Main avenue runs along -Z ("north"). Street level y = 0.
const LAYOUT_LEGACY = {
  // Main avenue (reference panel 1): road centered on x=0
  avenue: { x: 0, roadHalfWidth: 6, sidewalkWidth: 4, curbHeight: 0.15, zStart: 60, zEnd: -420 },
  // Cross streets (perpendicular, along X) at these z values
  crossStreets: { zs: [-60, -180, -300], roadHalfWidth: 5, sidewalkWidth: 3, xStart: -200, xEnd: 140 },
  // City blocks lining the avenue: buildings occupy x in [7+4, 11+blockDepth] on both sides
  blocks: { frontageOffset: 10, depth: 28, minHeight: 12, maxHeight: 60 },
  // Elevated rail + expressway crossing the avenue (panel 2 background, panel 1 overpass)
  elevatedRail: { z: -140, height: 14, width: 9, xStart: -400, xEnd: 400 },
  expressway: { z: -240, height: 22, width: 16, xStart: -400, xEnd: 400 },
  // River to the east running along Z (panel 3)
  river: { xCenter: 175, halfWidth: 35, waterLevel: -3.0, zStart: 200, zEnd: -700 },
  // Riverside promenade with cherry trees, on west bank (panel 3)
  promenade: { xMin: 128, xMax: 140, y: 0, zStart: 40, zEnd: -500 },
  bridges: [{ z: -260, deckY: 8 }],
  // Backstreet alley with stairs and lanterns (panel 4): runs west from the avenue
  alley: { z: -100, width: 4.5, xStart: -11, xEnd: -90, stairs: { xStart: -40, xEnd: -62, rise: 7 } },
  // Rooftop overlook balcony (panel 2 vantage): on east building looking north-east
  overlook: { position: [42, 26, -60], lookAt: [90, 20, -200] },
  // Skyline: mega towers placed in ring beyond these distances
  skyline: { innerRadius: 450, outerRadius: 1500, count: 140, megaTowerHeight: [150, 520] },
  // Player spawn
  spawn: { position: [3, 1.7, 20], yaw: 0 },
};

// Restyle map (default; ?map=legacy = the original layout above). Night City boulevard district: a wide boulevard
// with a planted median (two lanes each way), new cross-street spacing, the elevated rail and expressway raised and
// moved, a central plaza on the west side, a narrow concrete canal instead of the wide river (palm promenade).
const LAYOUT_MAP2 = {
  avenue: { x: 0, roadHalfWidth: 9, sidewalkWidth: 5, curbHeight: 0.15, zStart: 70, zEnd: -470, medianHalf: 1.3, lanes: 2, laneWidth: 3.6,
    bay: { z0: 29, z1: 43, depth: 2.6, taper: 3.5 } }, // kerbside pull-in bay on the east sidewalk by the spawn (player's car)
  crossStreets: { zs: [-85, -215, -360], roadHalfWidth: 5.5, sidewalkWidth: 3.5, xStart: -210, xEnd: 98 },
  blocks: { frontageOffset: 14, depth: 28, minHeight: 12, maxHeight: 60 },
  elevatedRail: { z: -150, height: 16, width: 10, xStart: -400, xEnd: 400 },
  expressway: { z: -320, height: 28, width: 18, xStart: -400, xEnd: 400 },
  river: { xCenter: 124, halfWidth: 16, waterLevel: -2.4, zStart: 220, zEnd: -720, canal: true },
  promenade: { xMin: 98, xMax: 106, y: 0, zStart: 50, zEnd: -540 },
  bridges: [{ z: -265, deckY: 6 }],
  alley: { z: -118, width: 4.5, xStart: -15, xEnd: -96, stairs: { xStart: -48, xEnd: -66, rise: 6 } },
  // skydeck tower terminating the boulevard's south end: the deck looks straight up the boulevard axis
  overlook: { position: [0.5, 50, 73.5], lookAt: [-2.5, 2, -300], tower: true },
  // central plaza (west side, between the 2nd cross street and the expressway): paved, holo monument, raised deck
  plaza: { x0: -72, x1: -14, z0: -306, z1: -232, deckY: 4.5 },
  // Solano Spire: the skyline landmark on the boulevard axis, closing the canyon's vanishing point (landmarks/spire.js)
  spire: { x: 0, z: -700, h: 420, r: 26 },
  // drone light show high above the district, west of the Spire, facing back down the boulevard (landmarks/droneshow.js)
  droneShow: { x: -66, y: 178, z: -480, w: 130, yaw: 0.1, count: 520, size: 1.0 },
  // SOLANO SPRAY drive-in respray bay in the south kerb lane of the first cross street (player/spray.js)
  spray: { x: 60, z: -80.45, w: 1.9, len: 7, kerbZ: -79.5 }, // (pad -79.5..-81.4: flush with the kerb; a car on it clears the lane traffic)
  // EL FARO taco truck at the south kerb of the second cross street (player/taco.js)
  tacoTruck: { street: 1, x: -40, len: 5.6, w: 1.55 }, // (w 1.55: outer edge 1.15 m from the lane centre - widest traffic van half width 1.10)
  // kerbside bus shelters on the boulevard (landmarks/streetkit.js; crowd walkers pass behind them)
  busShelters: [{ side: 1, z: -40, len: 4.4, depth: 2.0 }, { side: -1, z: -178, len: 4.4, depth: 2.0 }, { side: 1, z: -248, len: 4.4, depth: 2.0 }],
  skyline: { innerRadius: 450, outerRadius: 1500, count: 140, megaTowerHeight: [150, 520] },
  spawn: { position: [12.4, 1.7, 40], yaw: 0 },
};

const MAP_QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const MAP2 = MAP_QS.get('map') !== 'legacy';
export const LAYOUT = MAP2 ? LAYOUT_MAP2 : LAYOUT_LEGACY;

// Fixed camera views used by the screenshot harness (tools/shot.mjs) and the visual critics.
// Each corresponds to a panel of ref/target_reference.jpg, plus gameplay views.
const SHOT_VIEWS_LEGACY = {
  pilot:    { pos: [-5.0, 1.6, 21], look: [-7.2, 1.0, 8.0], fov: 52, desc: 'Tripo pilot: vending machine on the left sidewalk, kei car parked at the curb (?pilot=1)' },
  pilotcar: { pos: [-1.6, 1.5, -0.2], look: [-4.4, 0.9, 5.6], fov: 50, desc: 'Tripo pilot close-up: kei car front 3/4 (?pilot=1)' },
  pilotvend:{ pos: [-5.9, 1.5, 14.6], look: [-9.3, 1.0, 14.0], fov: 50, desc: 'Tripo pilot close-up: vending machine front (?pilot=1)' },
  crowd2:   { pos: [1.5, 1.45, 29.6], look: [1.5, 1.0, 23.5], fov: 50, desc: 'Crowd lineup close-up (?crowdtest=outfits|clips)' },
  crowd2umb:{ pos: [-0.4, 1.7, 27.6], look: [-0.4, 1.4, 24.5], fov: 50, desc: 'Crowd clips lineup: umbrella walk close-up (?crowdtest=clips)' },
  crowd2phone:{ pos: [2.45, 1.55, 26.4], look: [2.45, 1.3, 24.5], fov: 50, desc: 'Crowd clips lineup: phone walk close-up (?crowdtest=clips)' },
  cars:     { pos: [0.2, 1.9, 32], look: [4.6, 0.7, 15], fov: 50, desc: 'Vehicle lineup on the east kerb (?cartest)' },
  street:   { pos: [1.5, 1.6, 30], look: [0.5, 3.5, -60], fov: 55, desc: 'Ref panel 1: wet neon avenue, ramen shop on left, car ahead, overpass in distance' },
  overlook: { pos: [42, 26, -60], look: [90, 22, -200], fov: 55, desc: 'Ref panel 2: rooftop balcony railing overlooking elevated rail, giant holo billboard, skyline' },
  river:    { pos: [133, 1.7, -10], look: [150, 8, -140], fov: 55, desc: 'Ref panel 3: cherry blossom riverside promenade, lanterns, river reflecting skyline' },
  alley:    { pos: [-30, 2.2, -100], look: [-70, 6.5, -100], fov: 55, desc: 'Ref panel 4: narrow alley with stairs going up, red lanterns, hanging wires, signs' },
  aerial:   { pos: [-60, 90, 120], look: [40, 10, -200], fov: 50, desc: 'Gameplay: aerial overview of the district and skyline' },
  ground:   { pos: [-4, 0.5, 5], look: [2, 1.2, -25], fov: 60, desc: 'Gameplay: low angle on wet road surface, reflections and rain splashes' },
  avenue2:  { pos: [1, 2.2, -48], look: [0, 6, -150], fov: 55, desc: 'Street test: mid avenue (podium stores, street screens, sky bridges)' },
  detail1:  { pos: [33, 4, -33], look: [26, 18, -24], fov: 60, desc: 'Detail test: exterior duct on a back wall (step 4)' },
  mass1:    { pos: [-7, 6, -8], look: [10, 17, -32], fov: 55, desc: 'Massing test: east avenue wall, pods' },
  mass2:    { pos: [41, 4, -40], look: [30, 14, -75], fov: 60, desc: 'Massing test: east back lane' },
  mass3:    { pos: [70, 75, 10], look: [0, 20, -130], fov: 55, desc: 'Massing test: district from above (module gaps, bridges)' },
  skyeast:  { pos: [150, 45, -170], look: [300, 110, -300], fov: 55, desc: 'Skyline test: far-bank towers seen across the river' },
  skynorth: { pos: [-20, 110, -330], look: [60, 160, -700], fov: 55, desc: 'Skyline test: northern towers above the district' },
};

// camera presets of the restyle map (dev / test lineups keep their legacy positions)
const SHOT_VIEWS_MAP2 = {
  street:   { pos: [10.9, 1.65, 47], look: [1.2, 4.5, -64], fov: 55, desc: 'Boulevard from the east sidewalk: palms on the median, podium stores, sky bridges' },
  boulevard:{ pos: [-2.9, 1.7, 30], look: [-1.2, 5.5, -110], fov: 55, desc: 'Inner southbound lane looking up the boulevard: median palms, elevated rail' },
  overlook: { pos: [0.5, 50, 73.5], look: [-2.5, 2, -300], fov: 55, desc: 'Skydeck at the south end: straight up the boulevard (median palms, rail, expressway, skyline)' },
  plaza:    { pos: [-19, 1.9, -296], look: [-48, 9, -252], fov: 58, desc: 'Central plaza: holo monument, deck, palms' },
  canal:    { pos: [106.8, 1.7, -40], look: [118, 1.5, -200], fov: 55, desc: 'At the canal railing looking up the canal: palms, lamp masts, bridge, rail' },
  river:    { pos: [106.8, 1.7, -40], look: [118, 1.5, -200], fov: 55, desc: '(alias of canal)' },
  alley:    { pos: [-32, 2.2, -118], look: [-74, 6.5, -118], fov: 55, desc: 'Back alley with stairs' },
  aerial:   { pos: [-90, 100, 130], look: [20, 10, -230], fov: 50, desc: 'Aerial overview of the district and skyline' },
  ground:   { pos: [-4.5, 0.5, 15], look: [3, 1.2, -15], fov: 60, desc: 'Low angle on the wet road surface' },
  avenue2:  { pos: [11.5, 2.2, -60], look: [0, 6, -185], fov: 55, desc: 'Mid boulevard: podium stores, street screens, sky bridges' },
  mass2:    { pos: [45, 4, -40], look: [34, 14, -75], fov: 60, desc: 'East back lane' },
  mass3:    { pos: [70, 80, 10], look: [0, 20, -160], fov: 55, desc: 'District from above' },
  skyeast:  { pos: [110, 45, -180], look: [260, 110, -300], fov: 55, desc: 'Skyline: far-bank towers across the canal' },
  skynorth: { pos: [-20, 110, -360], look: [60, 160, -720], fov: 55, desc: 'Skyline: northern towers above the district' },
  kerb:     { pos: [12.8, 1.7, -52], look: [9.8, 1.3, -38], fov: 55, desc: 'East kerb: bus shelter, hydrant, intersection hologram beyond' },
  bus:      { pos: [12.2, 1.7, -24], look: [6.5, 1.5, -41], fov: 55, desc: 'Line 42 bus at the east shelter' },
  drones:   { pos: [-55, 7.6, -262], look: [-60, 100, -470], fov: 60, desc: 'Drone light show from the plaza deck' },
  spray:    { pos: [49, 2.2, -88], look: [60, 1.5, -80.5], fov: 55, desc: 'SOLANO SPRAY respray bay on Crosstown' },
  taco:     { pos: [-33.2, 1.75, -207.3], look: [-40, 1.5, -210.3], fov: 58, desc: 'EL FARO taco truck on the second cross street' },
  pigeons:  { pos: [-30, 1.1, -258], look: [-22, 0.2, -248], fov: 50, desc: 'Pigeons pecking on the plaza paving' },
  holo:     { pos: [6, 2.0, -40], look: [0, 22, -85], fov: 60, desc: 'Looking up at the first intersection hologram' },
  ledfins:  { pos: [-4, 2.0, -150], look: [6, 24, -215], fov: 60, desc: 'Mid boulevard looking up at LED fins on the towers' },
  bridge:   { pos: [119, 8.2, -258], look: [125, 0, -170], fov: 55, desc: 'From the canal bridge looking north: boats, rail, palms' },
  spiretele:{ pos: [0.5, 50, 73.5], look: [0, 150, -700], fov: 22, desc: 'Telephoto from the skydeck to the Solano Spire' },
};
export const SHOT_VIEWS = MAP2 ? { ...SHOT_VIEWS_LEGACY, ...SHOT_VIEWS_MAP2 } : SHOT_VIEWS_LEGACY;
