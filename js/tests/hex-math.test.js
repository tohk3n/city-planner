// =============================================================================
// hex-math.js test suite
// Run: node hex-math.test.js
// =============================================================================

import {
  hexKey, parseHexKey,
  axialToPixel, pixelToAxial, pixelToAxialFractional, axialRound,
  getNeighbors, getNeighbor, getNeighborDirection, getDirections,
  axialDistance,
  getHexesInRadius, getHexRing,
  rotateCW, rotateCCW, rotateSteps, rotateCoords,
  getHexVertices, getDirectionIndex, sortVerticesByAngle, getExternalVertices,
  inBounds, inHexBounds,
  offsetToAxial, axialToOffset
} from './hex-math.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${b}, got ${a}`);
}

function assertHex(actual, eq, er, msg) {
  assert(actual.q === eq && actual.r === er,
    `${msg} — expected (${eq},${er}), got (${actual.q},${actual.r})`);
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// =============================================================================
section('hexKey / parseHexKey');

assertEq(hexKey(3, -5), '3,-5', 'hexKey positive/negative');
assertEq(hexKey(0, 0), '0,0', 'hexKey origin');
assertEq(hexKey(-10, 20), '-10,20', 'hexKey large');

const parsed = parseHexKey('3,-5');
assertHex(parsed, 3, -5, 'parseHexKey roundtrip');

const parsed0 = parseHexKey('0,0');
assertHex(parsed0, 0, 0, 'parseHexKey origin');

// Roundtrip fuzz
for (let q = -5; q <= 5; q++) {
  for (let r = -5; r <= 5; r++) {
    const rt = parseHexKey(hexKey(q, r));
    assert(rt.q === q && rt.r === r, `hexKey roundtrip (${q},${r})`);
  }
}

// =============================================================================
section('axialToPixel / pixelToAxial roundtrip');

const SIZE = 20;

// Origin should map to pixel (0, 0)
const originPx = axialToPixel(0, 0, SIZE);
assert(Math.abs(originPx.x) < 0.001 && Math.abs(originPx.y) < 0.001,
  'origin maps to pixel (0,0)');

// Test roundtrip for a grid of coordinates
let roundtripFailures = 0;
for (let q = -10; q <= 10; q++) {
  for (let r = -10; r <= 10; r++) {
    const px = axialToPixel(q, r, SIZE);
    const back = pixelToAxial(px.x, px.y, SIZE);
    if (back.q !== q || back.r !== r) roundtripFailures++;
  }
}
assertEq(roundtripFailures, 0,
  `axialToPixel↔pixelToAxial roundtrip (441 coords, ${roundtripFailures} failures)`);

// Test that pixel centers are correctly picked even with slight offsets
const testCoord = axialToPixel(3, -2, SIZE);
const nudged = pixelToAxial(testCoord.x + 1, testCoord.y - 1, SIZE);
assertHex(nudged, 3, -2, 'pixelToAxial with small offset still resolves correctly');

// =============================================================================
section('axialRound');

// Exact integers should round to themselves
assertHex(axialRound(3, -2), 3, -2, 'axialRound exact integers');

// Known fractional cases
assertHex(axialRound(0.1, -0.1), 0, 0, 'axialRound near origin');
assertHex(axialRound(0.9, 0.1), 1, 0, 'axialRound near (1,0)');

// =============================================================================
section('getNeighbors');

const neighbors = getNeighbors(0, 0);
assertEq(neighbors.length, 6, 'origin has 6 neighbors');

// Check all expected neighbors of origin
const expectedOriginNeighbors = [
  { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 },
  { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }
];
expectedOriginNeighbors.forEach((exp, i) => {
  assert(neighbors[i].q === exp.q && neighbors[i].r === exp.r,
    `origin neighbor ${i}: expected (${exp.q},${exp.r}), got (${neighbors[i].q},${neighbors[i].r})`);
});

// Neighbors should all be at distance 1
neighbors.forEach((n, i) => {
  assertEq(axialDistance(0, 0, n.q, n.r), 1, `neighbor ${i} is distance 1`);
});

// No even/odd parity issue — neighbors of (5, 3) should also be constant offsets
const nb2 = getNeighbors(5, 3);
nb2.forEach((n, i) => {
  assertEq(axialDistance(5, 3, n.q, n.r), 1,
    `neighbor ${i} of (5,3) is distance 1`);
});

// =============================================================================
section('getNeighborDirection');

assertEq(getNeighborDirection(1, -1), 0, 'NE direction');
assertEq(getNeighborDirection(1, 0), 1, 'E direction');
assertEq(getNeighborDirection(0, 1), 2, 'SE direction');
assertEq(getNeighborDirection(-1, 1), 3, 'SW direction');
assertEq(getNeighborDirection(-1, 0), 4, 'W direction');
assertEq(getNeighborDirection(0, -1), 5, 'NW direction');
assertEq(getNeighborDirection(2, 0), -1, 'non-neighbor returns -1');
assertEq(getNeighborDirection(0, 0), -1, 'self returns -1');

// =============================================================================
section('axialDistance');

assertEq(axialDistance(0, 0, 0, 0), 0, 'distance to self is 0');
assertEq(axialDistance(0, 0, 1, 0), 1, 'adjacent distance is 1');
assertEq(axialDistance(0, 0, 2, -1), 2, 'distance 2');
assertEq(axialDistance(0, 0, 3, -3), 3, 'distance 3 along axis');
assertEq(axialDistance(-2, 4, 1, -1), 5, 'distance across grid');

// Symmetry
assertEq(axialDistance(3, -1, -2, 4), axialDistance(-2, 4, 3, -1),
  'distance is symmetric');

// =============================================================================
section('getHexesInRadius');

assertEq(getHexesInRadius(0, 0, 0).length, 1, 'radius 0 = 1 hex');
assertEq(getHexesInRadius(0, 0, 1).length, 7, 'radius 1 = 7 hexes');
assertEq(getHexesInRadius(0, 0, 2).length, 19, 'radius 2 = 19 hexes');
assertEq(getHexesInRadius(0, 0, 3).length, 37, 'radius 3 = 37 hexes');

// Formula: 3*n*(n+1) + 1
for (let n = 0; n <= 6; n++) {
  const expected = 3 * n * (n + 1) + 1;
  assertEq(getHexesInRadius(0, 0, n).length, expected,
    `radius ${n} count = ${expected}`);
}

// All hexes in radius should be <= radius distance from center
const r3 = getHexesInRadius(5, -3, 3);
const outOfRange = r3.filter(h => axialDistance(5, -3, h.q, h.r) > 3);
assertEq(outOfRange.length, 0, 'all hexes in radius 3 are within distance 3');

// =============================================================================
section('getHexRing');

assertEq(getHexRing(0, 0, 0).length, 1, 'ring 0 = 1 hex (center)');
assertEq(getHexRing(0, 0, 1).length, 6, 'ring 1 = 6 hexes');
assertEq(getHexRing(0, 0, 2).length, 12, 'ring 2 = 12 hexes');
assertEq(getHexRing(0, 0, 3).length, 18, 'ring 3 = 18 hexes');

// All hexes in ring should be exactly at ring distance
const ring2 = getHexRing(0, 0, 2);
ring2.forEach(h => {
  assertEq(axialDistance(0, 0, h.q, h.r), 2,
    `ring hex (${h.q},${h.r}) should be at distance 2`);
});

// =============================================================================
section('Rotation');

// Single CW rotation: (1, 0) → (0, 1) → (-1, 1) → (-1, 0) → (0, -1) → (1, -1) → (1, 0)
const cwChain = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

for (let i = 0; i < 6; i++) {
  const next = rotateCW(cwChain[i].q, cwChain[i].r);
  const expected = cwChain[(i + 1) % 6];
  assertHex(next, expected.q, expected.r,
    `rotateCW (${cwChain[i].q},${cwChain[i].r}) → (${expected.q},${expected.r})`);
}

// CCW should be inverse of CW
const testPt = { q: 3, r: -1 };
const cw = rotateCW(testPt.q, testPt.r);
const back = rotateCCW(cw.q, cw.r);
assertHex(back, testPt.q, testPt.r, 'rotateCCW reverses rotateCW');

// 6 CW rotations = identity
let rq = 2, rr = -3;
for (let i = 0; i < 6; i++) {
  const next = rotateCW(rq, rr);
  rq = next.q;
  rr = next.r;
}
assertHex({ q: rq, r: rr }, 2, -3, '6 CW rotations = identity');

// rotateSteps
assertHex(rotateSteps(1, 0, 0), 1, 0, 'rotateSteps 0 = identity');
assertHex(rotateSteps(1, 0, 1), 0, 1, 'rotateSteps 1');
assertHex(rotateSteps(1, 0, 2), -1, 1, 'rotateSteps 2');
assertHex(rotateSteps(1, 0, 6), 1, 0, 'rotateSteps 6 = identity');
assertHex(rotateSteps(1, 0, -1), 1, -1, 'rotateSteps -1 (negative)');

// rotateCoords
const shape = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 0 }];
const rotated = rotateCoords(shape, 0);
assert(rotated[0].q === 1 && rotated[0].r === 0, 'rotateCoords 0 = copy');
assert(rotated !== shape && rotated[0] !== shape[0], 'rotateCoords returns new objects');

const rot1 = rotateCoords(shape, 1);
assertHex(rot1[0], 0, 1, 'rotateCoords step 1 first elem');

// =============================================================================
section('getDirectionIndex');

assertEq(getDirectionIndex(0, 0, 1, -1), 0, 'direction to NE neighbor');
assertEq(getDirectionIndex(0, 0, 1, 0), 1, 'direction to E neighbor');
assertEq(getDirectionIndex(5, 3, 5, 4), 2, 'direction to SE from offset pos');
assertEq(getDirectionIndex(0, 0, 2, 0), -1, 'non-neighbor returns -1');

// =============================================================================
section('getHexVertices');

const verts = getHexVertices(0, 0, 20);
assertEq(verts.length, 6, 'hex has 6 vertices');

// All vertices should be exactly `size` distance from center
verts.forEach((v, i) => {
  const dist = Math.sqrt(v.x * v.x + v.y * v.y);
  assert(Math.abs(dist - 20) < 0.001,
    `vertex ${i} distance from center = ${dist.toFixed(4)}, expected 20`);
});

// =============================================================================
section('getExternalVertices');

const testVerts = getHexVertices(100, 100, 20);
const ext = getExternalVertices(0, testVerts);
assertEq(ext.length, 3, 'direction 0 returns 3 external vertices');

// Out of range direction
const extBad = getExternalVertices(6, testVerts);
assertEq(extBad.length, 0, 'invalid direction returns empty');

// =============================================================================
section('Bounds checking');

const bounds = { minQ: -5, maxQ: 5, minR: -5, maxR: 5 };
assert(inBounds(0, 0, bounds), 'origin in bounds');
assert(inBounds(5, 5, bounds), 'corner in bounds');
assert(inBounds(-5, -5, bounds), 'negative corner in bounds');
assert(!inBounds(6, 0, bounds), 'q=6 out of bounds');
assert(!inBounds(0, -6, bounds), 'r=-6 out of bounds');

assert(inHexBounds(0, 0, 5), 'origin in hex bounds');
assert(inHexBounds(3, -2, 5), 'distance 3 in radius 5');
assert(!inHexBounds(5, 1, 5), 'distance 6 outside radius 5');

// =============================================================================
section('Legacy bridge (offsetToAxial / axialToOffset)');

// Verify roundtrip with known offset values
// offset (0, 0) → axial (0, 0)
assertHex(offsetToAxial(0, 0), 0, 0, 'offset origin → axial origin');

// offset (5, 0) → axial (5, 0) (row 0, no shift)
assertHex(offsetToAxial(5, 0), 5, 0, 'offset (5,0) → axial (5,0)');

// offset (5, 3) → axial (5 - floor(3/2), 3) = (4, 3)
assertHex(offsetToAxial(5, 3), 4, 3, 'offset (5,3) → axial (4,3)');

// offset (2, 4) → axial (2 - floor(4/2), 4) = (0, 4)
assertHex(offsetToAxial(2, 4), 0, 4, 'offset (2,4) → axial (0,4)');

// Roundtrip fuzz
let bridgeFailures = 0;
for (let col = 0; col < 20; col++) {
  for (let row = 0; row < 20; row++) {
    const ax = offsetToAxial(col, row);
    const off = axialToOffset(ax.q, ax.r);
    if (off.col !== col || off.row !== row) bridgeFailures++;
  }
}
assertEq(bridgeFailures, 0,
  `offset↔axial bridge roundtrip (400 coords, ${bridgeFailures} failures)`);

// =============================================================================
section('Cross-validation: old offset neighbors vs new axial neighbors');

// The old system had parity-dependent neighbors. Verify that for any offset
// coordinate, converting to axial, getting neighbors, and converting back
// produces the same set as the old offset neighbor function would.
function oldGetHexNeighbors(col, row) {
  const isEvenRow = row % 2 === 0;
  if (isEvenRow) {
    return [
      { col: col, row: row - 1 },
      { col: col + 1, row: row },
      { col: col, row: row + 1 },
      { col: col - 1, row: row + 1 },
      { col: col - 1, row: row },
      { col: col - 1, row: row - 1 }
    ];
  } else {
    return [
      { col: col + 1, row: row - 1 },
      { col: col + 1, row: row },
      { col: col + 1, row: row + 1 },
      { col: col, row: row + 1 },
      { col: col - 1, row: row },
      { col: col, row: row - 1 }
    ];
  }
}

let neighborMismatches = 0;
for (let col = 1; col < 15; col++) {
  for (let row = 1; row < 15; row++) {
    const oldNeighbors = oldGetHexNeighbors(col, row);
    const ax = offsetToAxial(col, row);
    const newNeighbors = getNeighbors(ax.q, ax.r);
    const newAsOffset = newNeighbors.map(n => axialToOffset(n.q, n.r));

    // Compare sets (order may differ)
    const oldSet = new Set(oldNeighbors.map(n => `${n.col},${n.row}`));
    const newSet = new Set(newAsOffset.map(n => `${n.col},${n.row}`));

    if (oldSet.size !== newSet.size) {
      neighborMismatches++;
      continue;
    }
    for (const key of oldSet) {
      if (!newSet.has(key)) {
        neighborMismatches++;
        break;
      }
    }
  }
}
assertEq(neighborMismatches, 0,
  `old offset neighbors match new axial neighbors (196 positions, ${neighborMismatches} mismatches)`);

// =============================================================================
// Summary
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}