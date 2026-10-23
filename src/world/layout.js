// Shared world plan. ALL systems must place content according to this layout so districts fit together.
// Units: meters. +Y up. Main avenue runs along -Z ("north"). Street level y = 0.
export const LAYOUT = {
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

// Fixed camera views used by the screenshot harness (tools/shot.mjs) and the visual critics.
// Each corresponds to a panel of ref/target_reference.jpg, plus gameplay views.
export const SHOT_VIEWS = {
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
