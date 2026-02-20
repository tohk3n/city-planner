// tile-system.test.js

import { hexKey, axialDistance, getNeighbors, getHexesInRadius } from './hex-math.js';
import TileSystem, {
  latticeToAxial, axialToLatticeIndex, isSpacerLattice,
  hexToClusterCenter, isSpacerHex, getClusterHexes,
  tileKey, parseTileKey, Tile,
} from './tile-system.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

// =============================================================================
section('Lattice roundtrip');

for (let n = -8; n <= 8; n++) {
  for (let m = -8; m <= 8; m++) {
    const { q, r } = latticeToAxial(n, m);
    const back = axialToLatticeIndex(q, r);
    assert(back.n === n && back.m === m,
      `(${n},${m}) → (${q},${r}) → (${back.n},${back.m})`);
  }
}

// =============================================================================
section('Every hex finds its cluster center at distance ≤ 1');

const RANGE = 25;
let maxDist = 0;
for (let q = -RANGE; q <= RANGE; q++) {
  for (let r = -RANGE; r <= RANGE; r++) {
    const center = hexToClusterCenter(q, r);
    const dist = axialDistance(q, r, center.q, center.r);
    assert(dist <= 1, `hex (${q},${r}) → center (${center.q},${center.r}) dist=${dist}`);
    if (dist > maxDist) maxDist = dist;
  }
}
assert(maxDist === 1, `max distance to center is exactly 1 (got ${maxDist})`);

// =============================================================================
section('Perfect tiling — no gaps, no overlaps');

const owners = new Map();
let overlaps = 0;
for (let n = -8; n <= 8; n++) {
  for (let m = -8; m <= 8; m++) {
    const center = latticeToAxial(n, m);
    const hexes = [center, ...getNeighbors(center.q, center.r)];
    for (const h of hexes) {
      const key = hexKey(h.q, h.r);
      if (owners.has(key)) overlaps++;
      else owners.set(key, `${n},${m}`);
    }
  }
}
assertEq(overlaps, 0, 'zero overlapping hexes');

// Check interior for gaps
let gaps = 0;
for (let q = -12; q <= 12; q++) {
  for (let r = -12; r <= 12; r++) {
    if (!owners.has(hexKey(q, r))) gaps++;
  }
}
assertEq(gaps, 0, 'zero gaps in interior');

// =============================================================================
section('Spacer classification');

// Origin is a tile (not spacer)
assert(!isSpacerLattice(0, 0), '(0,0) is a tile');
assert(!isSpacerHex(0, 0), 'origin hex is not a spacer');

// First spacer at (1,1) → axial (1,4)
assert(isSpacerLattice(1, 1), '(1,1) is a spacer');
const spacerCenter = latticeToAxial(1, 1);
assertEq(spacerCenter.q, 1, 'spacer (1,1) q');
assertEq(spacerCenter.r, 4, 'spacer (1,1) r');

// All 7 hexes of that spacer cluster are spacer hexes
const spacerHexes = getClusterHexes(spacerCenter.q, spacerCenter.r);
assertEq(spacerHexes.length, 7, 'spacer cluster has 7 hexes');
for (const h of spacerHexes) {
  assert(isSpacerHex(h.q, h.r), `spacer hex (${h.q},${h.r}) classified as spacer`);
}

const latticeNeighborOffsets = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

// Neighbors of (0,0) in lattice space — 4 tiles and 2 spacers.
// The spacer-ringed-by-tiles property is one-directional:
// every spacer's neighbors are all tiles, but tiles can border spacers.
let tileNeighbors = 0, spacerNeighbors = 0;
for (const [dn, dm] of latticeNeighborOffsets) {
  if (isSpacerLattice(dn, dm)) spacerNeighbors++;
  else tileNeighbors++;
}
assertEq(tileNeighbors, 4, 'origin has 4 tile neighbors');
assertEq(spacerNeighbors, 2, 'origin has 2 spacer neighbors');

// =============================================================================
section('No two spacers are adjacent in the lattice');

for (let n = -6; n <= 6; n++) {
  for (let m = -6; m <= 6; m++) {
    if (!isSpacerLattice(n, m)) continue;
    for (const [dn, dm] of latticeNeighborOffsets) {
      assert(!isSpacerLattice(n + dn, m + dm),
        `spacers (${n},${m}) and (${n+dn},${m+dm}) not adjacent`);
    }
  }
}

// =============================================================================
section('Each spacer has 6 tile neighbors (super-triangle structure)');

for (let n = -4; n <= 4; n++) {
  for (let m = -4; m <= 4; m++) {
    if (!isSpacerLattice(n, m)) continue;
    let count = 0;
    for (const [dn, dm] of latticeNeighborOffsets) {
      if (!isSpacerLattice(n + dn, m + dm)) count++;
    }
    assertEq(count, 6, `spacer (${n},${m}) has 6 tile neighbors`);
  }
}

// Three pairs of those 6 neighbors form equilateral triangles at distance 3
const sn = 1, sm = 1;
const nbCenters = latticeNeighborOffsets.map(([dn, dm]) => {
  const c = latticeToAxial(sn + dn, sm + dm);
  return { n: sn + dn, m: sm + dm, q: c.q, r: c.r };
});

let pairsAt3 = 0;
for (let i = 0; i < nbCenters.length; i++) {
  for (let j = i + 1; j < nbCenters.length; j++) {
    if (axialDistance(nbCenters[i].q, nbCenters[i].r,
                      nbCenters[j].q, nbCenters[j].r) === 3) {
      pairsAt3++;
    }
  }
}
assertEq(pairsAt3, 6, '6 pairs at distance 3 (two equilateral triangles of 3 tiles)');

// =============================================================================
section('Tile key roundtrip');

for (const [n, m] of [[-5, 3], [0, 0], [100, -42]]) {
  const key = tileKey(n, m);
  const back = parseTileKey(key);
  assertEq(back.n, n, `parseTileKey n for (${n},${m})`);
  assertEq(back.m, m, `parseTileKey m for (${n},${m})`);
}

// =============================================================================
section('Tile constructor');

const tile = new Tile(3, -2);
assertEq(tile.n, 3, 'tile.n');
assertEq(tile.m, -2, 'tile.m');
const expectedCenter = latticeToAxial(3, -2);
assertEq(tile.q, expectedCenter.q, 'tile.q matches lattice');
assertEq(tile.r, expectedCenter.r, 'tile.r matches lattice');
assertEq(tile.depth, 25, 'default depth is 25');

// =============================================================================
section('TileSystem.generate — small bounds');

const ts = new TileSystem();
const bounds = { minQ: -5, maxQ: 5, minR: -5, maxR: 5 };
ts.generate(bounds);

assert(ts.tiles.size > 0, `generated ${ts.tiles.size} tiles`);

// Every generated tile is not a spacer
for (const [key, t] of ts.tiles) {
  assert(!isSpacerLattice(t.n, t.m), `tile ${key} is not a spacer`);
}

// Every tile's center is within or near bounds
for (const t of ts.tiles.values()) {
  assert(t.q >= bounds.minQ - 1 && t.q <= bounds.maxQ + 1,
    `tile center q=${t.q} near bounds`);
  assert(t.r >= bounds.minR - 1 && t.r <= bounds.maxR + 1,
    `tile center r=${t.r} near bounds`);
}

// =============================================================================
section('TileSystem.generate — hexToTile reverse map');

// Every hex in a tile's cluster should map back to that tile
for (const t of ts.tiles.values()) {
  const hexes = [{ q: t.q, r: t.r }, ...getNeighbors(t.q, t.r)];
  for (const h of hexes) {
    const found = ts.getTileForHex(h.q, h.r);
    assert(found === t, `hex (${h.q},${h.r}) maps to tile (${t.n},${t.m})`);
  }
}

// Spacer hexes should NOT be in the reverse map
const spacers = ts.getSpacerHexes(bounds);
for (const h of spacers) {
  assert(ts.getTileForHex(h.q, h.r) === undefined || ts.getTileForHex(h.q, h.r) === null,
    `spacer hex (${h.q},${h.r}) not mapped to a tile`);
}

// =============================================================================
section('TileSystem.getTileAt — O(1) math lookup');

// Tile at origin
const originTile = ts.getTileAt(0, 0);
assert(originTile !== null, 'origin is a tile');
assertEq(originTile.q, 0, 'origin tile center q');
assertEq(originTile.r, 0, 'origin tile center r');

// Neighbor of origin tile — should find the same tile
const neighborOfOrigin = ts.getTileAt(1, 0); // E neighbor of (0,0)
assert(neighborOfOrigin !== null, 'neighbor of origin finds a tile');
assertEq(neighborOfOrigin.q, originTile.q, 'same tile as origin');

// Spacer hex returns null
const spacerQ = 1, spacerR = 4; // center of spacer (1,1)
assertEq(ts.getTileAt(spacerQ, spacerR), null, 'spacer returns null');

// =============================================================================
section('TileSystem.setDepth');

assert(ts.setDepth(0, 0, 50), 'setDepth on tile returns true');
assertEq(originTile.depth, 50, 'depth updated');

assert(!ts.setDepth(spacerQ, spacerR, 30), 'setDepth on spacer returns false');

// =============================================================================
section('Serialization roundtrip');

ts.setDepth(0, 0, 50);
// Find another tile to modify
const anotherTile = [...ts.tiles.values()].find(t => t.n !== 0 || t.m !== 0);
if (anotherTile) ts.setDepth(anotherTile.q, anotherTile.r, 10);

const json = ts.toJSON();
assert(json.length >= 1, `serialized ${json.length} non-default tiles`);
assert(json.every(d => d.depth !== 25), 'only non-default depths serialized');

// Restore into fresh system
const ts2 = new TileSystem();
ts2.generate(bounds);
ts2.fromJSON(json);

const restored = ts2.getTileAt(0, 0);
assertEq(restored.depth, 50, 'depth restored from JSON');

if (anotherTile) {
  const restored2 = ts2.getTileAt(anotherTile.q, anotherTile.r);
  assertEq(restored2.depth, 10, 'second tile depth restored');
}

// =============================================================================
section('getSpacerHexes');

const smallBounds = { minQ: -2, maxQ: 4, minR: -2, maxR: 6 };
const ts3 = new TileSystem();
ts3.generate(smallBounds);

const spacerList = ts3.getSpacerHexes(smallBounds);
assert(spacerList.length > 0, `found ${spacerList.length} spacer hexes`);

// Every returned hex should be classified as spacer
for (const h of spacerList) {
  assert(isSpacerHex(h.q, h.r), `returned hex (${h.q},${h.r}) is a spacer`);
}

// Every returned hex should be within bounds
for (const h of spacerList) {
  assert(h.q >= smallBounds.minQ && h.q <= smallBounds.maxQ,
    `spacer hex q=${h.q} in bounds`);
  assert(h.r >= smallBounds.minR && h.r <= smallBounds.maxR,
    `spacer hex r=${h.r} in bounds`);
}

// =============================================================================
section('Large grid — tile count sanity');

const largeBounds = { minQ: -50, maxQ: 50, minR: -50, maxR: 50 };
const tsLarge = new TileSystem();
tsLarge.generate(largeBounds);

// ~10,000 hexes in bounds. Each tile covers 7 hexes, 3/4 of lattice points
// are tiles. Expected: ~10000 / 7 * 0.75 ≈ 1071 tiles (rough).
assert(tsLarge.tiles.size > 500, `large grid: ${tsLarge.tiles.size} tiles (expected ~1000+)`);
assert(tsLarge.tiles.size < 2000, `large grid: ${tsLarge.tiles.size} tiles not unreasonable`);

// hexToTile should have 7 × tiles.size entries
assertEq(tsLarge.hexToTile.size, tsLarge.tiles.size * 7,
  `reverse map has 7 entries per tile`);

// =============================================================================
section('Coverage: tiles + spacers = all hexes in region');

const checkBounds = { minQ: -8, maxQ: 8, minR: -8, maxR: 8 };
const tsCheck = new TileSystem();
tsCheck.generate(checkBounds);

const tileHexSet = new Set();
for (const t of tsCheck.tiles.values()) {
  tileHexSet.add(hexKey(t.q, t.r));
  for (const nb of getNeighbors(t.q, t.r)) {
    tileHexSet.add(hexKey(nb.q, nb.r));
  }
}

const spacerHexSet = new Set();
for (const h of tsCheck.getSpacerHexes(checkBounds)) {
  spacerHexSet.add(hexKey(h.q, h.r));
}

// Check every hex in bounds is either tile or spacer
let uncovered = 0;
for (let q = checkBounds.minQ; q <= checkBounds.maxQ; q++) {
  for (let r = checkBounds.minR; r <= checkBounds.maxR; r++) {
    const key = hexKey(q, r);
    if (!tileHexSet.has(key) && !spacerHexSet.has(key)) uncovered++;
  }
}
assertEq(uncovered, 0, 'every hex in bounds is either tile or spacer');

// No hex is BOTH tile and spacer
let both = 0;
for (const key of tileHexSet) {
  if (spacerHexSet.has(key)) both++;
}
assertEq(both, 0, 'no hex is both tile and spacer');

// =============================================================================
section('Negative coordinates work');

assert(!isSpacerHex(-5, -3), 'negative coords: classification works');
const negCenter = hexToClusterCenter(-5, -3);
const negDist = axialDistance(-5, -3, negCenter.q, negCenter.r);
assert(negDist <= 1, 'negative coords: finds correct cluster center');

const negBounds = { minQ: -100, maxQ: -80, minR: -100, maxR: -80 };
const tsNeg = new TileSystem();
tsNeg.generate(negBounds);
assert(tsNeg.tiles.size > 0, `negative region: ${tsNeg.tiles.size} tiles`);

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED');