// =============================================================================
// grid.js test suite
// Run: node grid.test.js
// =============================================================================

import {
  HexData, HexGrid, DEFAULT_COLOR,
  rectBounds, hexBounds
} from './grid.js';
import { hexKey, parseHexKey, offsetToAxial } from './hex-math.js';

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
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// =============================================================================
section('HexData basics');

const hd = new HexData(3, -2);
assertEq(hd.q, 3, 'q stored');
assertEq(hd.r, -2, 'r stored');
assertEq(hd.terrainColor, DEFAULT_COLOR, 'default terrain color');
assertEq(hd.patterned, false, 'default not patterned');
assertEq(hd.text, '', 'default empty text');
assertEq(hd.buildingId, null, 'default no building');
assertEq(hd.displayColor, DEFAULT_COLOR, 'display color = terrain when not patterned');
assertEq(hd.isDefault, true, 'fresh hex is default');

hd.terrainColor = 'red';
assertEq(hd.isDefault, false, 'modified hex is not default');
assertEq(hd.displayColor, 'red', 'display color follows terrain');

hd.patterned = true;
assertEq(hd.displayColor, 'white', 'patterned hex displays white');
assertEq(hd.isDefault, false, 'patterned hex is not default');

// =============================================================================
section('rectBounds');

const rb = rectBounds(-5, 5, -5, 5);
assertEq(rb.type, 'rect', 'rect bounds type');
assertEq(rb.minQ, -5, 'minQ');
assertEq(rb.maxQ, 5, 'maxQ');

// =============================================================================
section('hexBounds');

const hb = hexBounds(10, 0, 0);
assertEq(hb.type, 'hex', 'hex bounds type');
assertEq(hb.radius, 10, 'radius');

// =============================================================================
section('HexGrid construction - rectangular');

const grid = new HexGrid(rectBounds(0, 9, 0, 9));
assertEq(grid.hexCount, 100, 'rect 10x10 = 100 hexes');
assertEq(grid.storageSize, 100, '100 hexes in storage');
assert(grid.has(0, 0), 'has origin');
assert(grid.has(9, 9), 'has corner');
assert(!grid.has(10, 0), 'does not have out-of-bounds');
assert(grid.inBounds(5, 5), 'center is in bounds');
assert(!grid.inBounds(-1, 0), 'negative q out of bounds');

// =============================================================================
section('HexGrid construction - hexagonal');

const hexGrid = new HexGrid(hexBounds(3));
assertEq(hexGrid.hexCount, 37, 'hex radius 3 = 37 hexes');
assertEq(hexGrid.storageSize, 37, '37 hexes in storage');
assert(hexGrid.has(0, 0), 'has center');
assert(hexGrid.has(3, 0), 'has edge');
assert(hexGrid.has(-1, -2), 'has interior');
assert(!hexGrid.has(4, 0), 'does not have outside radius');
assert(hexGrid.inBounds(2, -1), 'interior is in bounds');
assert(!hexGrid.inBounds(3, 1), 'outside radius is not in bounds');

// =============================================================================
section('HexGrid get / getOrCreate');

const g2 = new HexGrid(rectBounds(0, 4, 0, 4));

const hex00 = g2.get(0, 0);
assert(hex00 !== null, 'get returns hex in bounds');
assertEq(hex00.q, 0, 'returned hex has correct q');
assertEq(hex00.r, 0, 'returned hex has correct r');

const hexNull = g2.get(10, 10);
assert(hexNull === null, 'get returns null for non-existent hex');

// getOrCreate for non-existent hex
assert(!g2.has(10, 10), 'hex (10,10) does not exist before getOrCreate');
const hexCreated = g2.getOrCreate(10, 10);
assert(hexCreated !== null, 'getOrCreate returns hex');
assertEq(hexCreated.q, 10, 'created hex has correct q');
assert(g2.has(10, 10), 'hex (10,10) exists after getOrCreate');
assertEq(g2.storageSize, 26, 'storage grew by 1');

// getOrCreate for existing hex returns same object
const hexAgain = g2.getOrCreate(0, 0);
assert(hexAgain === hex00, 'getOrCreate returns same object for existing hex');

// =============================================================================
section('Hex mutation + change tracking');

const g3 = new HexGrid(rectBounds(0, 4, 0, 4));

// Consume initial state (construction triggers no dirty, only fullRebuild)
// Actually, _populate doesn't mark dirty — only mutations do
const initial = g3.consumeChanges();
// No fullRebuild from constructor - only setBounds triggers it
assertEq(initial.dirty.size, 0, 'no dirty hexes initially');

// setColor
const painted = g3.setColor(2, 2, 'red');
assert(painted, 'setColor returns true');
assertEq(g3.get(2, 2).terrainColor, 'red', 'terrain color updated');
assertEq(g3.get(2, 2).displayColor, 'red', 'display color updated');

// No-op setColor (same color, not patterned)
const noop = g3.setColor(2, 2, 'red');
assert(!noop, 'setColor with same color returns false');

// setColor on non-existent hex
const paintBad = g3.setColor(99, 99, 'blue');
assert(!paintBad, 'setColor on non-existent hex returns false');

// setPattern
const patterned = g3.setPattern(3, 3, true);
assert(patterned, 'setPattern returns true');
assertEq(g3.get(3, 3).patterned, true, 'hex is patterned');
assertEq(g3.get(3, 3).displayColor, 'white', 'patterned hex displays white');

// setPattern clears when painting
g3.setColor(3, 3, 'blue');
assertEq(g3.get(3, 3).patterned, false, 'setColor clears pattern');

// setText
g3.setText(1, 1, 'Hello');
assertEq(g3.get(1, 1).text, 'Hello', 'text set');

// No-op setText
const textNoop = g3.setText(1, 1, 'Hello');
assert(!textNoop, 'setText with same text returns false');

// assignBuilding / clearBuilding
g3.assignBuilding(0, 0, 'bld_001');
assertEq(g3.get(0, 0).buildingId, 'bld_001', 'building assigned');

g3.clearBuilding(0, 0);
assertEq(g3.get(0, 0).buildingId, null, 'building cleared');

// clearBuilding on hex without building
const clearNoop = g3.clearBuilding(0, 0);
assert(!clearNoop, 'clearBuilding on empty hex returns false');

// setPattern on building hex should fail
g3.assignBuilding(4, 4, 'bld_002');
const patternBlocked = g3.setPattern(4, 4, true);
assert(!patternBlocked, 'setPattern blocked on building hex');

// Consume changes
const changes = g3.consumeChanges();
assert(changes.dirty.size > 0, 'dirty set is non-empty after mutations');
assert(changes.dirty.has(hexKey(2, 2)), 'painted hex is in dirty set');
assert(changes.dirty.has(hexKey(3, 3)), 'patterned hex is in dirty set');
assert(changes.dirty.has(hexKey(1, 1)), 'text hex is in dirty set');

// After consume, dirty should be empty
const afterConsume = g3.consumeChanges();
assertEq(afterConsume.dirty.size, 0, 'dirty set empty after consume');
assertEq(afterConsume.fullRebuild, false, 'no fullRebuild pending');

// =============================================================================
section('Erase');

const g4 = new HexGrid(rectBounds(0, 4, 0, 4));
g4.setColor(2, 2, 'red');
g4.setText(2, 2, 'test');
g4.assignBuilding(2, 2, 'bld_x');
g4.consumeChanges(); // clear dirty

const eraseResult = g4.erase(2, 2);
assert(eraseResult.erased, 'erase returns erased=true');
assertEq(eraseResult.buildingId, 'bld_x', 'erase returns building ID');

const erasedHex = g4.get(2, 2);
assertEq(erasedHex.terrainColor, DEFAULT_COLOR, 'terrain reset');
assertEq(erasedHex.text, '', 'text cleared');
assertEq(erasedHex.buildingId, null, 'building cleared');
assert(erasedHex.isDefault, 'erased hex is default');

const eraseDirty = g4.consumeChanges();
assert(eraseDirty.dirty.has(hexKey(2, 2)), 'erased hex is dirty');

// Erase non-existent hex
const eraseNull = g4.erase(99, 99);
assert(!eraseNull.erased, 'erase non-existent returns false');

// =============================================================================
section('Bulk operations');

const g5 = new HexGrid(rectBounds(-5, 5, -5, 5));

// paintRadius
const count = g5.paintRadius(0, 0, 1, 'green');
assertEq(count, 7, 'paintRadius r=1 paints 7 hexes');
assertEq(g5.get(0, 0).terrainColor, 'green', 'center painted');
assertEq(g5.get(1, 0).terrainColor, 'green', 'neighbor painted');

// paintRadius on partially out-of-bounds area
const g5b = new HexGrid(rectBounds(0, 2, 0, 2));
const edgeCount = g5b.paintRadius(0, 0, 2, 'blue');
// Not all 19 hexes will be in bounds, but the ones that are should paint
assert(edgeCount > 0, 'paintRadius at edge paints some hexes');
assert(edgeCount < 19, 'paintRadius at edge paints fewer than full radius');

// reset
g5.reset();
assertEq(g5.get(0, 0).terrainColor, DEFAULT_COLOR, 'reset clears color');
assert(g5.consumeChanges().fullRebuild, 'reset triggers fullRebuild');

// =============================================================================
section('setBounds (resize)');

const g6 = new HexGrid(rectBounds(0, 4, 0, 4));
g6.setColor(2, 2, 'red');
g6.consumeChanges();

// Expand bounds
g6.setBounds(rectBounds(0, 9, 0, 9));
assertEq(g6.hexCount, 100, 'expanded to 100');
assert(g6.storageSize >= 100, 'storage has at least 100');

// Old data preserved
assertEq(g6.get(2, 2).terrainColor, 'red', 'existing data preserved after expand');

// New hex created
assert(g6.has(8, 8), 'new hex exists after expand');
assertEq(g6.get(8, 8).terrainColor, DEFAULT_COLOR, 'new hex has default color');

const expandChanges = g6.consumeChanges();
assert(expandChanges.fullRebuild, 'setBounds triggers fullRebuild');

// Shrink bounds — data outside new bounds is preserved in storage
g6.setColor(8, 8, 'blue');
g6.consumeChanges();

g6.setBounds(rectBounds(0, 4, 0, 4));
assert(!g6.inBounds(8, 8), '(8,8) is outside new bounds');
assert(g6.has(8, 8), '(8,8) still in storage');
assertEq(g6.get(8, 8).terrainColor, 'blue', 'data preserved outside bounds');

// =============================================================================
section('Iteration');

const g7 = new HexGrid(rectBounds(0, 2, 0, 2));
g7.setColor(1, 1, 'red');

let iterCount = 0;
let foundRed = false;
g7.forEach((hex, key) => {
  iterCount++;
  if (hex.q === 1 && hex.r === 1 && hex.terrainColor === 'red') foundRed = true;
});
assertEq(iterCount, 9, 'forEach visits all 9 hexes in 3x3 grid');
assert(foundRed, 'forEach found the red hex');

// forEachInRegion
let regionCount = 0;
g7.forEachInRegion(rectBounds(0, 1, 0, 1), (hex) => {
  regionCount++;
});
assertEq(regionCount, 4, 'forEachInRegion visits 4 hexes in 2x2 sub-region');

// getModifiedHexes
g7.setColor(0, 0, 'blue');
const modified = g7.getModifiedHexes();
assertEq(modified.length, 2, 'getModifiedHexes returns 2 modified hexes');

// =============================================================================
section('Serialization');

const g8 = new HexGrid(rectBounds(-2, 2, -2, 2));
g8.setColor(0, 0, 'red');
g8.setColor(1, -1, 'blue');
g8.setPattern(-1, 1, true);
g8.setText(2, 0, 'marker');
g8.assignBuilding(0, 1, 'bld_test');

const json = g8.toJSON();
assertEq(json.version, 2, 'version is 2');
assertEq(json.bounds.type, 'rect', 'bounds saved');
assertEq(json.hexes.length, 5, '5 non-default hexes saved');

// Verify sparse — default hexes not included
const totalInBounds = g8.hexCount; // 25
assert(json.hexes.length < totalInBounds, 'serialization is sparse');

// Verify individual hex data
const redHex = json.hexes.find(h => h.q === 0 && h.r === 0);
assertEq(redHex.color, 'red', 'red hex color saved');
assert(!('patterned' in redHex), 'non-patterned hex omits patterned field');

const patHex = json.hexes.find(h => h.q === -1 && h.r === 1);
assert(patHex.patterned === true, 'patterned hex saved');

const textHex = json.hexes.find(h => h.q === 2 && h.r === 0);
assertEq(textHex.text, 'marker', 'text saved');

// Deserialize into new grid
const g9 = new HexGrid(rectBounds(0, 0, 0, 0)); // dummy bounds, overwritten by fromJSON
g9.fromJSON(json);

assertEq(g9.bounds.minQ, -2, 'bounds restored');
assertEq(g9.get(0, 0).terrainColor, 'red', 'red hex restored');
assertEq(g9.get(1, -1).terrainColor, 'blue', 'blue hex restored');
assertEq(g9.get(-1, 1).patterned, true, 'pattern restored');
assertEq(g9.get(2, 0).text, 'marker', 'text restored');
assertEq(g9.get(0, 1).buildingId, 'bld_test', 'building assignment restored');

// Unmodified hexes should be default
assertEq(g9.get(2, 2).terrainColor, DEFAULT_COLOR, 'unmodified hex is default');

const loadChanges = g9.consumeChanges();
assert(loadChanges.fullRebuild, 'fromJSON triggers fullRebuild');

// =============================================================================
section('Legacy v1 import (offset coordinates)');

const legacyData = {
  hexes: [
    { col: 5, row: 3, color: 'red', terrainColor: 'red', patterned: false, text: '', buildingId: null },
    { col: 2, row: 4, color: 'blue', terrainColor: 'blue', patterned: false, text: 'old', buildingId: null },
    { col: 0, row: 0, color: '#2a2838', terrainColor: '#2a2838', patterned: true, text: '', buildingId: null },
  ]
};

const g10 = new HexGrid(rectBounds(-10, 10, -10, 10));
g10.fromLegacyJSON(legacyData, offsetToAxial);

// offset (5, 3) → axial (4, 3)
assertEq(g10.get(4, 3).terrainColor, 'red', 'legacy offset (5,3) → axial (4,3) red');

// offset (2, 4) → axial (0, 4)
assertEq(g10.get(0, 4).terrainColor, 'blue', 'legacy offset (2,4) → axial (0,4) blue');
assertEq(g10.get(0, 4).text, 'old', 'legacy text preserved');

// offset (0, 0) → axial (0, 0), patterned
assertEq(g10.get(0, 0).patterned, true, 'legacy patterned preserved');

const legacyChanges = g10.consumeChanges();
assert(legacyChanges.fullRebuild, 'legacy import triggers fullRebuild');

// =============================================================================
section('hasChanges');

const g11 = new HexGrid(rectBounds(0, 2, 0, 2));
g11.consumeChanges(); // clear any initial state

assert(!g11.hasChanges, 'no changes after consume');

g11.setColor(0, 0, 'red');
assert(g11.hasChanges, 'hasChanges after setColor');

g11.consumeChanges();
assert(!g11.hasChanges, 'no changes after second consume');

g11.requestFullRebuild();
assert(g11.hasChanges, 'hasChanges after requestFullRebuild');

// =============================================================================
section('Hex-shaped grid iteration');

const g12 = new HexGrid(hexBounds(2));
let hexGridCount = 0;
g12.forEach(() => hexGridCount++);
assertEq(hexGridCount, 19, 'hex-shaped grid with radius 2 iterates 19 hexes');

// Verify all iterated hexes are within radius
g12.forEach((hex) => {
  const dist = Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(-hex.q - hex.r);
  assert(dist / 2 <= 2, `hex (${hex.q},${hex.r}) is within radius 2`);
});

// =============================================================================
section('Large grid performance sanity');

const tStart = performance.now();
const bigGrid = new HexGrid(hexBounds(50)); // 7,651 hexes
const tPopulate = performance.now();

assertEq(bigGrid.hexCount, 3 * 50 * 51 + 1, 'radius 50 hex count correct');
assert(bigGrid.storageSize === bigGrid.hexCount, 'all hexes populated');

// Bulk paint
let paintCount = 0;
bigGrid.forEach(hex => {
  bigGrid.setColor(hex.q, hex.r, 'green');
  paintCount++;
});
const tPaint = performance.now();

assertEq(paintCount, bigGrid.hexCount, 'painted all hexes');

// Consume
const bigChanges = bigGrid.consumeChanges();
assertEq(bigChanges.dirty.size, bigGrid.hexCount, 'all hexes dirty after full paint');
const tConsume = performance.now();

console.log(`  Populate ${bigGrid.hexCount} hexes: ${(tPopulate - tStart).toFixed(1)}ms`);
console.log(`  Paint all: ${(tPaint - tPopulate).toFixed(1)}ms`);
console.log(`  Consume changes: ${(tConsume - tPaint).toFixed(1)}ms`);
assert((tPaint - tStart) < 1000, 'bulk operations complete under 1 second');

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