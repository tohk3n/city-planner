// building-catalog.test.js

import { rotateCoords } from '../core/hex-math.js';
import BuildingCatalog, { Building } from '../core/building-catalog.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

// Sample data in the same format as the compact JSON
const SAMPLE_DATA = {
  v: 2,
  coord: 'axial:[q,r]',
  buildings: [
    {
      id: 1020, n: 'Rough Carpentry Station', cat: 'Crafting',
      h: [[1,0],[0,0],[1,1]], t: 'Rough', bn: 'Carpentry Station',
      d: 'A workstation for making things.',
      s: { craftingSlots: 12, housingSlots: 0, housingIncome: 0,
           storageSlots: 0, refiningSlots: 0, cargoSlots: 0, tradeOrders: 0 },
    },
    {
      id: 2020, n: 'Simple Carpentry Station', cat: 'Crafting',
      h: [[1,0],[0,0],[1,1]], t: 'Simple', bn: 'Carpentry Station',
      d: 'A workstation for making things.',
    },
    {
      id: 2012, n: 'Simple Oven', cat: 'Crafting',
      h: [[0,0],[0,1],[-1,1],[-1,0],[1,0],[1,-1],[0,-1]], t: 'Simple', bn: 'Oven',
      d: 'An oven for baking.',
    },
    {
      id: 5001, n: 'Town Bank', cat: 'Empire',
      h: [[0,0],[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]], t: null,
      d: 'A bank.',
      p: [[2,-1],[2,0],[1,1],[0,2],[-1,2],[-2,1],[-2,0],[-1,-1],[0,-2],[1,-2],[2,-2],[2,-1]],
    },
    {
      id: 9001, n: 'Farming Plot', cat: 'Crafting',
      h: [[0,0]],
      d: 'A single plot.',
    },
    {
      id: 8001, n: 'Small Wall', cat: 'Structure',
      h: [[0,0],[1,0],[2,0]],
    },
    {
      id: 8002, n: 'Gate', cat: 'Structure',
      h: [[0,0],[1,0],[-1,0]],
    },
  ],
};

// =============================================================================
section('Building constructor');

const raw = SAMPLE_DATA.buildings[0];
const b = new Building(raw);
assertEq(b.id, 1020, 'id');
assertEq(b.name, 'Rough Carpentry Station', 'name');
assertEq(b.baseName, 'Carpentry Station', 'baseName from bn');
assertEq(b.category, 'Crafting', 'category');
assertEq(b.tier, 'Rough', 'tier');
assertEq(b.size, 3, 'size = hitbox length');
assert(b.description.length > 0, 'description populated');
assert(b.stats !== null, 'stats populated');
assertEq(b.hitbox.length, 3, 'hitbox parsed');
assertEq(b.hitbox[0].q, 1, 'hitbox[0].q');
assertEq(b.hitbox[0].r, 0, 'hitbox[0].r');

// Building without bn uses name as baseName
const rawFarm = SAMPLE_DATA.buildings[4];
const bFarm = new Building(rawFarm);
assertEq(bFarm.baseName, 'Farming Plot', 'baseName defaults to name');
assertEq(bFarm.tier, null, 'null tier when missing');

// Building with perimeter
const rawBank = SAMPLE_DATA.buildings[3];
const bBank = new Building(rawBank);
assert(bBank.perimeter.length > 0, 'perimeter parsed');
assertEq(bBank.perimeter[0].q, 2, 'perimeter[0].q');
assertEq(bBank.walkable.length, 0, 'empty walkable');

// =============================================================================
section('Catalog load');

const cat = new BuildingCatalog();
cat.load(SAMPLE_DATA);

assertEq(cat.buildings.size, 7, '7 buildings loaded');
assert(cat.categories.length >= 3, `${cat.categories.length} categories`);
assert(cat.categories.includes('Crafting'), 'has Crafting');
assert(cat.categories.includes('Empire'), 'has Empire');
assert(cat.categories.includes('Structure'), 'has Structure');

// =============================================================================
section('Catalog.get');

const carpentry = cat.get(1020);
assert(carpentry !== null, 'get by id');
assertEq(carpentry.name, 'Rough Carpentry Station', 'correct building');

assertEq(cat.get(99999), null, 'get unknown returns null');

// =============================================================================
section('Catalog.getTiers');

const carpTiers = cat.getTiers('Carpentry Station');
assertEq(carpTiers.length, 2, '2 tiers of Carpentry');
assert(carpTiers.some(t => t.tier === 'Rough'), 'has Rough');
assert(carpTiers.some(t => t.tier === 'Simple'), 'has Simple');

// Same hitbox shape across tiers
assertEq(carpTiers[0].size, carpTiers[1].size, 'same size across tiers');

const nope = cat.getTiers('Nonexistent');
assertEq(nope.length, 0, 'unknown baseName returns empty');

// =============================================================================
section('Catalog.getUniqueBuildings');

const unique = cat.getUniqueBuildings();
// 7 buildings but Carpentry has 2 tiers → 6 unique
assertEq(unique.length, 6, '6 unique buildings');

const names = unique.map(u => u.baseName);
assert(names.includes('Carpentry Station'), 'has Carpentry');
assert(names.includes('Oven'), 'has Oven');
assert(names.includes('Town Bank'), 'has Town Bank');

// Sorted by category then name
const catOrder = unique.map(u => u.category);
for (let i = 1; i < catOrder.length; i++) {
  assert(catOrder[i] >= catOrder[i-1], `sorted: ${catOrder[i-1]} ≤ ${catOrder[i]}`);
}

// =============================================================================
section('Catalog.filterByCategory');

const crafting = cat.filterByCategory('Crafting');
assert(crafting.length >= 4, `${crafting.length} crafting buildings`);
assert(crafting.every(b => b.category === 'Crafting'), 'all Crafting');

const empty = cat.filterByCategory('Nonexistent');
assertEq(empty.length, 0, 'unknown category returns empty');

// =============================================================================
section('Catalog.filter');

const sevenHex = cat.filter(b => b.size === 7);
assert(sevenHex.length >= 2, `${sevenHex.length} 7-hex buildings`);
assert(sevenHex.every(b => b.hitbox.length === 7), 'all have 7 hitbox hexes');

const singleHex = cat.filter(b => b.size === 1);
assertEq(singleHex.length, 1, '1 single-hex building');
assertEq(singleHex[0].name, 'Farming Plot', 'farming plot is 1 hex');

// =============================================================================
section('Rotation — identity');

const rotated0 = cat.getRotatedHitbox(1020, 0);
assertEq(rotated0.length, 3, 'rotation 0 preserves length');
// Should be a copy, not same reference
const original = cat.get(1020).hitbox;
assert(rotated0 !== original, 'rotation 0 returns copy');
assertEq(rotated0[0].q, original[0].q, 'rotation 0 preserves coords');
assertEq(rotated0[0].r, original[0].r, 'rotation 0 preserves coords r');

// =============================================================================
section('Rotation — 60° CW');

const rotated1 = cat.getRotatedHitbox(1020, 1);
assertEq(rotated1.length, 3, 'rotation 1 preserves length');

// Manual check: (1,0) rotated 60° CW = (0,1)
// rotateCC for (q,r) → (-r, q+r): no, CW is (q,r) → (-r, q+r)
// Actually rotateCW: (1,0) → (0, 1), (0,0) → (0, 0), (1,1) → (-1, 2)
assert(rotated1.some(c => c.q === 0 && c.r === 0), 'origin stays at origin');
assert(rotated1.some(c => c.q === 0 && c.r === 1), '(1,0) → (0,1)');
assert(rotated1.some(c => c.q === -1 && c.r === 2), '(1,1) → (-1,2)');

// =============================================================================
section('Rotation — full cycle returns to start');

const id = 2012; // Oven, 7 hexes
const r0 = cat.getRotatedHitbox(id, 0);
const r6 = cat.getRotatedHitbox(id, 6);
assertEq(r0.length, r6.length, 'full rotation preserves count');

// Each coord in r0 should appear in r6
for (const c of r0) {
  assert(r6.some(d => d.q === c.q && d.r === c.r),
    `(${c.q},${c.r}) survives full rotation`);
}

// =============================================================================
section('Rotation cache');

const first = cat.getRotatedHitbox(1020, 3);
const second = cat.getRotatedHitbox(1020, 3);
assert(first === second, 'cache returns same array reference');

// Negative rotation normalizes
const negRot = cat.getRotatedHitbox(1020, -1); // should be same as 5
const posRot = cat.getRotatedHitbox(1020, 5);
assert(negRot === posRot, 'negative rotation normalized to positive');

// Unknown id
const unknown = cat.getRotatedHitbox(99999, 0);
assertEq(unknown.length, 0, 'unknown id returns empty');

// =============================================================================
section('Full footprint rotation');

const fp = cat.getRotatedFootprint(5001, 1); // Town Bank with perimeter
assert(fp.hitbox.length === 7, 'footprint hitbox rotated');
assert(fp.perimeter.length > 0, 'footprint perimeter rotated');
assertEq(fp.walkable.length, 0, 'footprint walkable empty');

const fpUnknown = cat.getRotatedFootprint(99999, 0);
assertEq(fpUnknown.hitbox.length, 0, 'unknown footprint empty');

// =============================================================================
section('Load from string');

const cat2 = new BuildingCatalog();
cat2.load(JSON.stringify(SAMPLE_DATA));
assertEq(cat2.buildings.size, 7, 'load from string works');

// =============================================================================
section('Load bare array (no wrapper)');

const cat3 = new BuildingCatalog();
cat3.load(SAMPLE_DATA.buildings);
assertEq(cat3.buildings.size, 7, 'load bare array works');

// =============================================================================
section('Reload clears previous data');

cat.load(SAMPLE_DATA);
assertEq(cat.buildings.size, 7, 'reload produces same count');
assertEq(cat._rotationCache.size, 0, 'rotation cache cleared on reload');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED');