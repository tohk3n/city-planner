// TerrainRenderer.test.js

import * as THREE from 'three';
import {
  axialToPixel, getNeighbors, getHexVertices,
  getDirectionIndex, getExternalVertices, sortVerticesByAngle,
  hexKey,
} from './hex-math.js';
import TileSystem, { tileKey, latticeToAxial } from './tile-system.js';
import TerrainRenderer from './TerrainRenderer.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, msg, eps = 0.01) {
  assert(Math.abs(a - b) < eps, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

const HEX_SIZE = 20;

// =============================================================================
section('Hex extrude shape is valid');

// Verify the hex shape used for ExtrudeGeometry
const shape = new THREE.Shape();
for (let i = 0; i < 6; i++) {
  const angle = (Math.PI / 3) * i - Math.PI / 6;
  const px = HEX_SIZE * Math.cos(angle);
  const py = HEX_SIZE * Math.sin(angle);
  if (i === 0) shape.moveTo(px, py);
  else shape.lineTo(px, py);
}
shape.closePath();

const points = shape.getPoints();
assertEq(points.length, 7, 'hex shape has 7 points (6 + close)');

// All vertices should be HEX_SIZE from origin
for (let i = 0; i < 6; i++) {
  const d = Math.sqrt(points[i].x ** 2 + points[i].y ** 2);
  assertClose(d, HEX_SIZE, `vertex ${i} at correct radius`, 0.01);
}

// Winding should be CCW for Three.js front face
const crossSum = points.slice(0, 6).reduce((sum, p, i) => {
  const next = points[(i + 1) % 6];
  return sum + (next.x - p.x) * (next.y + p.y);
}, 0);
assert(crossSum < 0, 'hex shape is counter-clockwise (Three.js convention)');

// =============================================================================
section('ExtrudeGeometry produces valid mesh');

const geo = new THREE.ExtrudeGeometry(shape, { depth: 50, bevelEnabled: false });
assert(geo.attributes.position.count > 0, 'extrude geometry has vertices');
assert(geo.index !== null || geo.attributes.position.count > 6, 'extrude geometry has faces');

const bbox = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
// Extrude goes along +Z in local space
assertClose(bbox.max.z, 50, 'extrude depth matches', 1);
assertClose(bbox.min.z, 0, 'extrude starts at z=0', 1);
geo.dispose();

// =============================================================================
section('Geometry cache deduplication');

const renderer = new TerrainRenderer(new THREE.Scene(), HEX_SIZE);

const g1 = renderer._getGeometry(50);
const g2 = renderer._getGeometry(50);
assert(g1 === g2, 'same depth returns same geometry');

const g3 = renderer._getGeometry(100);
assert(g1 !== g3, 'different depth returns different geometry');

// Rounding: 50.1 and 50.2 both round to 50.0 (nearest 0.5)
const g4 = renderer._getGeometry(50.1);
const g5 = renderer._getGeometry(50.2);
assert(g4 === g5, 'nearby depths round to same cached geometry');

// But 50.0 and 50.5 are different buckets
const g6 = renderer._getGeometry(50.0);
const g7 = renderer._getGeometry(50.5);
assert(g6 !== g7, '50.0 and 50.5 are different cache buckets');

// =============================================================================
section('Material cache deduplication');

const m1 = renderer._getMaterial(0xff0000);
const m2 = renderer._getMaterial(0xff0000);
assert(m1 === m2, 'same color returns same material');

const m3 = renderer._getMaterial(0x00ff00);
assert(m1 !== m3, 'different color returns different material');

assert(m1 instanceof THREE.MeshLambertMaterial, 'material is Lambert (lit)');

// =============================================================================
section('cssToHex conversion');

// Test the module-level function via material color
const matRed = renderer._getMaterial(new THREE.Color('red').getHex());
assertEq(matRed.color.getHex(), 0xff0000, 'CSS red → hex red');

const matDefault = renderer._getMaterial(0x2a2838);
assertEq(matDefault.color.getHex(), 0x2a2838, 'default color preserved');

// =============================================================================
section('Boundary vertex math');

// For a tile at origin, boundary should form a closed polygon
// around the 6 outer hexes
const center = { q: 0, r: 0 };
const centerPx = axialToPixel(center.q, center.r, HEX_SIZE);
const allVerts = [];

for (const nb of getNeighbors(center.q, center.r)) {
  const dir = getDirectionIndex(center.q, center.r, nb.q, nb.r);
  assert(dir >= 0 && dir <= 5, `direction ${dir} valid for neighbor (${nb.q},${nb.r})`);

  const nbPx = axialToPixel(nb.q, nb.r, HEX_SIZE);
  const verts = getHexVertices(nbPx.x, nbPx.y, HEX_SIZE);
  assertEq(verts.length, 6, `hex vertices count for (${nb.q},${nb.r})`);

  const external = getExternalVertices(dir, verts);
  assertEq(external.length, 3, `3 external vertices for direction ${dir}`);
  allVerts.push(...external);
}

assertEq(allVerts.length, 18, '6 neighbors × 3 external vertices = 18 total');

const sorted = sortVerticesByAngle(allVerts, { x: centerPx.x, y: centerPx.y });
// After dedup, should be ~12 unique vertices (hexagonal boundary).
// Exact count depends on floating point dedup threshold.
assert(sorted.length >= 10, `boundary has ${sorted.length} unique vertices (expect 12-18)`);
assert(sorted.length <= 18, `boundary not unreasonable: ${sorted.length}`);

// All boundary vertices should be roughly the same distance from center
const dists = sorted.map(v =>
  Math.sqrt((v.x - centerPx.x) ** 2 + (v.y - centerPx.y) ** 2)
);
const minDist = Math.min(...dists);
const maxDist = Math.max(...dists);
// Inner vertices at hex edge ≈ size*√3, outer at ≈ size*2
assert(minDist > HEX_SIZE * 1.2, `min boundary dist ${minDist.toFixed(1)} > ${HEX_SIZE * 1.2}`);
assert(maxDist < HEX_SIZE * 3.0, `max boundary dist ${maxDist.toFixed(1)} < ${HEX_SIZE * 3.0}`);

// =============================================================================
section('Integration: rebuild with TileSystem');

const ts = new TileSystem();
const bounds = { minQ: -10, maxQ: 10, minR: -10, maxR: 10 };
ts.generate(bounds);

const scene = new THREE.Scene();
const tr = new TerrainRenderer(scene, HEX_SIZE);

const getColor = (q, r) => '#2a2838';
tr.rebuild(ts, getColor);

assertEq(tr.tileGroups.size, ts.tiles.size,
  `rendered ${tr.tileGroups.size} tiles = TileSystem's ${ts.tiles.size}`);

// Each group should have 7 meshes + 1 boundary line = 8 children
for (const [key, group] of tr.tileGroups) {
  const meshes = group.children.filter(c => c.isMesh);
  const lines = group.children.filter(c => c.isLine);
  assertEq(meshes.length, 7, `tile ${key}: 7 hex meshes`);
  assertEq(lines.length, 1, `tile ${key}: 1 boundary line`);
}

// All groups should be in the scene
assertEq(scene.children.length, tr.tileGroups.size,
  'all groups added to scene');

// =============================================================================
section('Integration: updateTile');

const tile0 = ts.tiles.values().next().value;
const key0 = tileKey(tile0.n, tile0.m);
tile0.depth = 60;

const oldGroup = tr.tileGroups.get(key0);
tr.updateTile(tile0, getColor);

const newGroup = tr.tileGroups.get(key0);
assert(oldGroup !== newGroup, 'updateTile replaces the group');
assert(!scene.children.includes(oldGroup), 'old group removed from scene');
assert(scene.children.includes(newGroup), 'new group added to scene');

// Group size unchanged
const meshes = newGroup.children.filter(c => c.isMesh);
assertEq(meshes.length, 7, 'updated tile still has 7 meshes');

// =============================================================================
section('Integration: recolor');

// Set one tile to non-default depth for height map testing
tile0.depth = 75;
tr.updateTile(tile0, getColor);

// Recolor in height map mode
tr.recolor(ts, getColor, true);

// Verify meshes got height-based colors (not the getColor result)
const recoloredGroup = tr.tileGroups.get(key0);
const recoloredMeshes = recoloredGroup.children.filter(c => c.isMesh);
const heightColor = recoloredMeshes[0].material.color.getHex();
assert(heightColor !== 0x2a2838, `height map color ${heightColor.toString(16)} ≠ default`);

// Recolor back to normal mode
tr.recolor(ts, () => '#ff0000', false);
const normalMeshes = recoloredGroup.children.filter(c => c.isMesh);
const normalColor = normalMeshes[0].material.color.getHex();
assertEq(normalColor, 0xff0000, 'normal mode uses getColor result');

// =============================================================================
section('Clear and dispose');

const preCount = scene.children.length;
assert(preCount > 0, `scene has ${preCount} objects before clear`);

tr.clear();
assertEq(scene.children.length, 0, 'scene empty after clear');
assertEq(tr.tileGroups.size, 0, 'tileGroups empty after clear');

// Dispose should not throw
tr.dispose();
assertEq(tr._geoCache.size, 0, 'geo cache cleared after dispose');
assertEq(tr._matCache.size, 0, 'mat cache cleared after dispose');

// =============================================================================
section('Offset applies to mesh positions');

const scene2 = new THREE.Scene();
const tr2 = new TerrainRenderer(scene2, HEX_SIZE);
tr2.setOffset(100, 200);

const ts2 = new TileSystem();
ts2.generate({ minQ: 0, maxQ: 3, minR: 0, maxR: 3 });
tr2.rebuild(ts2, getColor);

// Pick one tile and check its mesh positions include the offset
const anyTile = ts2.tiles.values().next().value;
const anyKey = tileKey(anyTile.n, anyTile.m);
const anyGroup = tr2.tileGroups.get(anyKey);

const centerPxExpected = axialToPixel(anyTile.q, anyTile.r, HEX_SIZE);
const centerMesh = anyGroup.children.find(c =>
  c.isMesh && c.userData.hex?.q === anyTile.q && c.userData.hex?.r === anyTile.r
);
assert(centerMesh !== undefined, 'found center mesh');
assertClose(centerMesh.position.x, centerPxExpected.x - 100,
  'mesh x includes offset', 0.1);
assertClose(centerMesh.position.z, centerPxExpected.y - 200,
  'mesh z includes offset', 0.1);

tr2.dispose();

// =============================================================================
section('Mesh userData.hex stores axial coords');

const scene3 = new THREE.Scene();
const tr3 = new TerrainRenderer(scene3, HEX_SIZE);
const ts3 = new TileSystem();
ts3.generate({ minQ: -3, maxQ: 3, minR: -3, maxR: 3 });
tr3.rebuild(ts3, getColor);

let hexDataCount = 0;
for (const group of tr3.tileGroups.values()) {
  for (const child of group.children) {
    if (child.isMesh && child.userData.hex) {
      const { q, r } = child.userData.hex;
      assert(typeof q === 'number' && typeof r === 'number',
        `userData.hex has numeric q,r: (${q},${r})`);
      hexDataCount++;
    }
  }
}
assertEq(hexDataCount, ts3.tiles.size * 7,
  'every hex mesh has userData.hex');

tr3.dispose();

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED');