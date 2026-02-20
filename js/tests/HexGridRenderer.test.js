// HexGridRenderer.test.js
// Tests geometry creation, positioning math, and batch management.
// InstancedMesh needs WebGL. Mock the renderer-dependent parts
// and test everything else against real Three.js objects.

import * as THREE from 'three';
import { hexKey, axialToPixel } from './hex-math.js';
import { HexGrid, rectBounds, hexBounds, DEFAULT_COLOR } from './grid.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, msg, eps = 0.01) {
  assert(Math.abs(a - b) < eps, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

// =============================================================================
section('Flat hex geometry');

// Reproduce the geometry creation logic to validate it
function createTestHexGeometry(size) {
  const vertices = [];
  const indices = [];
  vertices.push(0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * (Math.PI / 180);
    vertices.push(size * Math.cos(angle), 0, size * Math.sin(angle));
  }
  for (let i = 1; i <= 6; i++) {
    indices.push(0, i < 6 ? i + 1 : 1, i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const hexGeo = createTestHexGeometry(20);
const posAttr = hexGeo.getAttribute('position');

assertEq(posAttr.count, 7, '7 vertices: center + 6 outer');
assertEq(hexGeo.index.count, 18, '18 index entries: 6 triangles × 3');

// Center vertex at origin
assertClose(posAttr.getX(0), 0, 'center x = 0');
assertClose(posAttr.getY(0), 0, 'center y = 0');
assertClose(posAttr.getZ(0), 0, 'center z = 0');

// All outer vertices should be exactly `size` from center
for (let i = 1; i <= 6; i++) {
  const x = posAttr.getX(i);
  const y = posAttr.getY(i);
  const z = posAttr.getZ(i);
  const dist = Math.sqrt(x * x + y * y + z * z);
  assertClose(dist, 20, `vertex ${i} distance from center`);
  assertClose(y, 0, `vertex ${i} y = 0 (flat)`);
}

// All normals should point up (0, 1, 0) for a flat hex on XZ
const normAttr = hexGeo.getAttribute('normal');
for (let i = 0; i < normAttr.count; i++) {
  assertClose(normAttr.getY(i), 1, `normal ${i} points up`, 0.1);
}

// =============================================================================
section('Matrix positioning');

// Verify hex-to-world position transform
const HEX_SIZE = 20;

function makeMatrix(q, r, offsetX, offsetZ) {
  const px = axialToPixel(q, r, HEX_SIZE);
  const m = new THREE.Matrix4();
  m.setPosition(px.x - offsetX, 0, px.y - offsetZ);
  return m;
}

// Origin hex with no offset should be at world (0, 0, 0)
const m00 = makeMatrix(0, 0, 0, 0);
const pos00 = new THREE.Vector3();
pos00.setFromMatrixPosition(m00);
assertClose(pos00.x, 0, 'origin hex x = 0');
assertClose(pos00.y, 0, 'origin hex y = 0');
assertClose(pos00.z, 0, 'origin hex z = 0');

// Hex (1, 0) should be one hex-width to the right
const m10 = makeMatrix(1, 0, 0, 0);
const pos10 = new THREE.Vector3();
pos10.setFromMatrixPosition(m10);
assertClose(pos10.x, HEX_SIZE * Math.sqrt(3), 'hex (1,0) x = size * √3');
assertClose(pos10.z, 0, 'hex (1,0) z = 0');

// Hex (0, 1) should be offset right and down
const m01 = makeMatrix(0, 1, 0, 0);
const pos01 = new THREE.Vector3();
pos01.setFromMatrixPosition(m01);
assertClose(pos01.x, HEX_SIZE * Math.sqrt(3) * 0.5, 'hex (0,1) x = size * √3 / 2');
assertClose(pos01.z, HEX_SIZE * 1.5, 'hex (0,1) z = size * 1.5');

// =============================================================================
section('Grid centering offset');

// For a rect grid (0,9) x (0,9), the center should be at the midpoint
// of the pixel extents of corner hexes
function computeOffset(grid) {
  const b = grid.bounds;
  if (b.type === 'rect') {
    const minPx = axialToPixel(b.minQ, b.minR, HEX_SIZE);
    const maxPx = axialToPixel(b.maxQ, b.maxR, HEX_SIZE);
    return {
      x: (minPx.x + maxPx.x) / 2,
      z: (minPx.y + maxPx.y) / 2
    };
  }
  const center = axialToPixel(b.cq || 0, b.cr || 0, HEX_SIZE);
  return { x: center.x, z: center.y };
}

const rectGrid = new HexGrid(rectBounds(0, 9, 0, 9));
const rectOff = computeOffset(rectGrid);
assert(rectOff.x > 0, 'rect offset x is positive (grid in positive q space)');
assert(rectOff.z > 0, 'rect offset z is positive (grid in positive r space)');

// Symmetric grid around origin should have ~zero offset
const symGrid = new HexGrid(rectBounds(-5, 5, -5, 5));
const symOff = computeOffset(symGrid);
assertClose(symOff.x, 0, 'symmetric grid offset x ≈ 0');
assertClose(symOff.z, 0, 'symmetric grid offset z ≈ 0');

// Hex-shaped grid centered at origin
const hexGrid = new HexGrid(hexBounds(10));
const hexOff = computeOffset(hexGrid);
assertClose(hexOff.x, 0, 'hex grid offset x = 0');
assertClose(hexOff.z, 0, 'hex grid offset z = 0');

// =============================================================================
section('Swap-with-last bookkeeping');

// Simulate the batch data structure and removal logic
// without needing WebGL
function createMockBatch(keys) {
  const keyToSlot = new Map();
  const slotToKey = new Map();
  keys.forEach((k, i) => {
    keyToSlot.set(k, i);
    slotToKey.set(i, k);
  });
  return { keyToSlot, slotToKey, count: keys.length };
}

function removeFromMockBatch(batch, key) {
  const slot = batch.keyToSlot.get(key);
  if (slot === undefined) return false;

  const lastSlot = batch.count - 1;

  if (slot !== lastSlot) {
    const swappedKey = batch.slotToKey.get(lastSlot);
    batch.keyToSlot.set(swappedKey, slot);
    batch.slotToKey.set(slot, swappedKey);
  }

  batch.keyToSlot.delete(key);
  batch.slotToKey.delete(lastSlot);
  batch.count--;
  return true;
}

// Setup: 5 hexes in a batch
const batch = createMockBatch(['a', 'b', 'c', 'd', 'e']);
assertEq(batch.count, 5, 'initial count = 5');

// Remove from middle — 'c' at slot 2, 'e' (last) should swap in
removeFromMockBatch(batch, 'c');
assertEq(batch.count, 4, 'count = 4 after removal');
assert(!batch.keyToSlot.has('c'), 'removed key gone');
assertEq(batch.keyToSlot.get('e'), 2, 'last key swapped to vacated slot');
assertEq(batch.slotToKey.get(2), 'e', 'slot 2 now points to swapped key');

// Remove from end — no swap needed
removeFromMockBatch(batch, 'd');
assertEq(batch.count, 3, 'count = 3 after end removal');
assert(!batch.keyToSlot.has('d'), 'end key gone');

// Remove all remaining
removeFromMockBatch(batch, 'a');
removeFromMockBatch(batch, 'e');
removeFromMockBatch(batch, 'b');
assertEq(batch.count, 0, 'batch empty after removing all');
assertEq(batch.keyToSlot.size, 0, 'no keys remain');
assertEq(batch.slotToKey.size, 0, 'no slots remain');

// =============================================================================
section('Swap-with-last stress test');

// Create a large batch and randomly remove in shuffled order.
// Invariant: at every step, keyToSlot and slotToKey must be consistent.
const N = 500;
const stressKeys = [];
for (let i = 0; i < N; i++) stressKeys.push(`hex_${i}`);
const stressBatch = createMockBatch([...stressKeys]);

// Shuffle removal order
const removeOrder = [...stressKeys].sort(() => Math.random() - 0.5);

let invariantViolations = 0;
for (const key of removeOrder) {
  removeFromMockBatch(stressBatch, key);

  // Check invariant: every key in keyToSlot has a matching slotToKey entry
  for (const [k, s] of stressBatch.keyToSlot) {
    if (stressBatch.slotToKey.get(s) !== k) invariantViolations++;
  }
  // Check: all slots 0..count-1 are occupied
  for (let s = 0; s < stressBatch.count; s++) {
    if (!stressBatch.slotToKey.has(s)) invariantViolations++;
  }
}

assertEq(invariantViolations, 0,
  `swap-with-last invariant held across ${N} random removals`);
assertEq(stressBatch.count, 0, 'stress batch fully emptied');

// =============================================================================
section('Color grouping logic');

// Simulate what rebuild() does: group hexes by color
const colorGrid = new HexGrid(rectBounds(0, 4, 0, 4));
colorGrid.setColor(0, 0, 'red');
colorGrid.setColor(1, 0, 'red');
colorGrid.setColor(2, 0, 'blue');
colorGrid.setColor(3, 0, 'blue');
colorGrid.setColor(4, 0, 'blue');

const groups = new Map();
colorGrid.forEach(hex => {
  const color = hex.displayColor;
  if (!groups.has(color)) groups.set(color, []);
  groups.get(color).push(hex);
});

assertEq(groups.get('red').length, 2, '2 red hexes');
assertEq(groups.get('blue').length, 3, '3 blue hexes');
assertEq(groups.get(DEFAULT_COLOR).length, 20, '20 default hexes (25 total - 5 painted)');
assertEq(groups.size, 3, '3 unique colors');

// =============================================================================
section('Capacity growth math');

const CAPACITY_PAD = 1.5;
const MIN_CAPACITY = 64;

function calcCapacity(expected) {
  return Math.max(MIN_CAPACITY, Math.ceil(expected * CAPACITY_PAD));
}

assertEq(calcCapacity(10), 64, 'small count gets minimum capacity');
assertEq(calcCapacity(100), 150, '100 expected → 150 capacity');
assertEq(calcCapacity(1000), 1500, '1000 expected → 1500 capacity');

// Growth step
function growCapacity(current) {
  return Math.ceil(current * CAPACITY_PAD);
}
assertEq(growCapacity(64), 96, 'grow from 64 → 96');
assertEq(growCapacity(150), 225, 'grow from 150 → 225');

// =============================================================================
section('Module import');

const mod = await import('./HexGridRenderer.js');
assert(typeof mod.default === 'function', 'HexGridRenderer exports a class');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED'); }