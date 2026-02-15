// BuildingRenderer.test.js

import * as THREE from 'three';
import { axialToPixel } from './hex-math.js';
import BuildingRenderer from './BuildingRenderer.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, msg, eps = 0.5) {
  assert(Math.abs(a - b) < eps, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

const HEX_SIZE = 20;
const flatHeight = () => 0; // terrain at Y=0

// =============================================================================
section('Constructor');

const scene = new THREE.Scene();
const br = new BuildingRenderer(scene, HEX_SIZE);
assertEq(br.groups.size, 0, 'starts empty');
assertEq(br.hexSize, HEX_SIZE, 'hex size stored');

// =============================================================================
section('Add building');

const hexes3 = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }];
br.add('b1', hexes3, 'red', flatHeight);

assertEq(br.groups.size, 1, 'one group');
assert(br.has('b1'), 'has b1');
assertEq(scene.children.length, 1, 'added to scene');

const group = br.groups.get('b1');
const meshes = group.children.filter(c => c.isMesh);
assertEq(meshes.length, 3, '3 hex meshes');

// Each mesh should have userData.hex
for (const mesh of meshes) {
  assert(mesh.userData.hex, 'mesh has userData.hex');
  assert(typeof mesh.userData.hex.q === 'number', 'hex.q is number');
}

// Material should have emissive
assert(meshes[0].material.emissive instanceof THREE.Color, 'has emissive');
assert(meshes[0].material.emissive.r > 0, 'emissive is nonzero');

// =============================================================================
section('Geometry shared across all meshes');

const geo = meshes[0].geometry;
for (const mesh of meshes) {
  assert(mesh.geometry === geo, 'all meshes share geometry');
}

// =============================================================================
section('Position uses axialToPixel with offset');

br.setOffset(100, 200);
br.add('b2', [{ q: 5, r: 3 }], 'blue', flatHeight);

const b2group = br.groups.get('b2');
const b2mesh = b2group.children[0];
const expected = axialToPixel(5, 3, HEX_SIZE);
assertClose(b2mesh.position.x, expected.x - 100, 'x includes offset');
assertClose(b2mesh.position.z, expected.y - 200, 'z includes offset');

// =============================================================================
section('Terrain height lifts building');

const hillHeight = (q, r) => q === 0 ? 50 : 0;
br.add('b3', [{ q: 0, r: 0 }, { q: 1, r: 0 }], 'green', hillHeight);

const b3meshes = br.groups.get('b3').children.filter(c => c.isMesh);
const onHill = b3meshes.find(m => m.userData.hex.q === 0);
const offHill = b3meshes.find(m => m.userData.hex.q === 1);

assert(onHill.position.y > offHill.position.y, 'hill hex is higher');
assertClose(onHill.position.y, 52, 'hill hex at terrain + lift', 1);
assertClose(offHill.position.y, 2, 'flat hex at 0 + lift', 1);

// =============================================================================
section('Remove building');

assertEq(br.has('b1'), true, 'b1 exists before remove');
br.remove('b1');
assertEq(br.has('b1'), false, 'b1 gone after remove');
assert(!scene.children.includes(group), 'removed from scene');

// Remove nonexistent — no throw
br.remove('nonexistent');

// =============================================================================
section('Add replaces existing');

br.add('b2', [{ q: 0, r: 0 }], 'yellow', flatHeight);
assertEq(br.groups.size, 2, 'still 2 groups (b2 replaced, b3 kept)');
const b2replaced = br.groups.get('b2');
assertEq(b2replaced.children.filter(c => c.isMesh).length, 1, 'replaced with 1 hex');

// =============================================================================
section('Recolor');

br.add('rc', [{ q: 0, r: 0 }], 'red', flatHeight);
const rcMat1 = br.groups.get('rc').children[0].material;
assertEq(rcMat1.color.getHex(), 0xff0000, 'starts red');

br.recolor('rc', 'blue');
const rcMat2 = br.groups.get('rc').children[0].material;
assertEq(rcMat2.color.getHex(), 0x0000ff, 'recolored to blue');

// Recolor nonexistent — no throw
br.recolor('nope', 'green');

// =============================================================================
section('Move — same hex count');

const moveHexes = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
br.add('mv', moveHexes, 'cyan', flatHeight);

const newHexes = [{ q: 5, r: 5 }, { q: 6, r: 5 }];
br.move('mv', newHexes, flatHeight);

const mvMeshes = br.groups.get('mv').children.filter(c => c.isMesh);
assertEq(mvMeshes.length, 2, 'still 2 meshes after move');

// Check coords updated
const coords = mvMeshes.map(m => `${m.userData.hex.q},${m.userData.hex.r}`).sort();
assert(coords.includes('5,5'), 'moved to (5,5)');
assert(coords.includes('6,5'), 'moved to (6,5)');

// =============================================================================
section('Move — hex count changed triggers rebuild');

br.add('mvr', [{ q: 0, r: 0 }], 'white', flatHeight);
br.move('mvr', [{ q: 1, r: 0 }, { q: 2, r: 0 }], flatHeight);

const mvrMeshes = br.groups.get('mvr').children.filter(c => c.isMesh);
assertEq(mvrMeshes.length, 2, 'rebuilt with new hex count');

// =============================================================================
section('Material cache');

br.add('mc1', [{ q: 0, r: 0 }], 'red', flatHeight);
br.add('mc2', [{ q: 1, r: 0 }], 'red', flatHeight);

const mat1 = br.groups.get('mc1').children[0].material;
const mat2 = br.groups.get('mc2').children[0].material;
assert(mat1 === mat2, 'same color shares material instance');

// =============================================================================
section('Clear');

const preCount = br.groups.size;
assert(preCount > 0, `has ${preCount} buildings before clear`);
br.clear();
assertEq(br.groups.size, 0, 'empty after clear');

// =============================================================================
section('Dispose');

br.add('disp', [{ q: 0, r: 0 }], 'red', flatHeight);
br.dispose();
assertEq(br.groups.size, 0, 'groups empty after dispose');
assertEq(br._geo, null, 'geometry cleared');
assertEq(br._matCache.size, 0, 'material cache cleared');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED');