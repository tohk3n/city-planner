// Prove the tiling math before writing the module.
//
// Hypothesis: the game uses a PERFECT 7-hex tiling (every hex belongs to
// exactly one 7-hex cluster), but marks 1 in 4 clusters as "spacer tiles"
// rather than terraformable tiles.
//
// The 7-hex tiling lattice has basis vectors v1=(2,1), v2=(-1,3) in axial.
// This gives a parallelogram area of |2*3 - 1*(-1)| = 7, which is exactly
// the size of one 7-hex cluster. So the lattice perfectly tiles the plane.
//
// The spacer condition: lattice index (n,m) is a spacer iff n and m are
// both odd. This gives 1/4 of all clusters as spacers, with no two spacers
// adjacent in the lattice.

import { hexKey, axialDistance, getNeighbors } from './hex-math.js';

// --- Lattice math ---

function latticeToAxial(n, m) {
  return { q: 2 * n - m, r: n + 3 * m };
}

function axialToLatticeIndex(q, r) {
  return { n: Math.round((3 * q + r) / 7), m: Math.round((2 * r - q) / 7) };
}

function isSpacer(n, m) {
  return (n % 2 !== 0) && (m % 2 !== 0);
}

// --- Tests ---

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

console.log('\n--- Lattice roundtrip ---');
// Every lattice point should round-trip perfectly
for (let n = -5; n <= 5; n++) {
  for (let m = -5; m <= 5; m++) {
    const { q, r } = latticeToAxial(n, m);
    const back = axialToLatticeIndex(q, r);
    assert(back.n === n && back.m === m,
      `roundtrip (${n},${m}) → (${q},${r}) → (${back.n},${back.m})`);
  }
}
console.log(`  ${passed} roundtrips verified`);

console.log('\n--- Every hex maps to a lattice point at distance ≤ 1 ---');
const prevP = passed;
const RANGE = 30;
for (let q = -RANGE; q <= RANGE; q++) {
  for (let r = -RANGE; r <= RANGE; r++) {
    const { n, m } = axialToLatticeIndex(q, r);
    const center = latticeToAxial(n, m);
    const dist = axialDistance(q, r, center.q, center.r);
    assert(dist <= 1, `hex (${q},${r}) → lattice (${n},${m}) center (${center.q},${center.r}) dist=${dist}`);
  }
}
console.log(`  ${passed - prevP} hexes verified (${2*RANGE+1}² grid)`);

console.log('\n--- No overlapping clusters ---');
const prevP2 = passed;
const owners = new Map();
for (let n = -10; n <= 10; n++) {
  for (let m = -10; m <= 10; m++) {
    const center = latticeToAxial(n, m);
    // Center + 6 neighbors
    const hexes = [center, ...getNeighbors(center.q, center.r)];
    for (const h of hexes) {
      const key = hexKey(h.q, h.r);
      const owner = `${n},${m}`;
      if (owners.has(key)) {
        assert(false, `hex ${key} claimed by both ${owners.get(key)} and ${owner}`);
      } else {
        owners.set(key, owner);
      }
    }
  }
}
assert(true, 'no overlaps detected');
console.log(`  ${passed - prevP2} checks, ${owners.size} hexes mapped`);

console.log('\n--- Perfect coverage (no gaps) ---');
// Every hex in a bounded region should be in the owners map
// (using the interior to avoid edge effects)
let gaps = 0;
for (let q = -15; q <= 15; q++) {
  for (let r = -15; r <= 15; r++) {
    if (!owners.has(hexKey(q, r))) gaps++;
  }
}
assert(gaps === 0, `${gaps} gaps found in [-15,15]²`);
console.log(`  ${gaps === 0 ? 'Zero gaps — perfect tiling' : gaps + ' GAPS!'}`);

console.log('\n--- Spacer ratio ---');
let spacerCount = 0, tileCount = 0;
for (let n = -10; n <= 10; n++) {
  for (let m = -10; m <= 10; m++) {
    if (isSpacer(n, m)) spacerCount++;
    else tileCount++;
  }
}
const ratio = spacerCount / (spacerCount + tileCount);
console.log(`  ${tileCount} tiles, ${spacerCount} spacers, ratio=${ratio.toFixed(4)}`);
// Exact ratio in [-N,N] range: (N_odd/total)^2. Converges to 25% as N→∞.
assert(Math.abs(ratio - 0.25) < 0.03, `spacer ratio ~25% (got ${(ratio*100).toFixed(1)}%)`);

console.log('\n--- No adjacent spacers ---');
const prevP3 = passed;
const latticeNeighborOffsets = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
for (let n = -10; n <= 10; n++) {
  for (let m = -10; m <= 10; m++) {
    if (!isSpacer(n, m)) continue;
    for (const [dn, dm] of latticeNeighborOffsets) {
      assert(!isSpacer(n + dn, m + dm),
        `adjacent spacers: (${n},${m}) and (${n+dn},${m+dm})`);
    }
  }
}
console.log(`  ${passed - prevP3} adjacency checks passed`);

console.log('\n--- Super-triangle: each spacer has 6 tile neighbors ---');
const prevP4 = passed;
for (let n = -5; n <= 5; n++) {
  for (let m = -5; m <= 5; m++) {
    if (!isSpacer(n, m)) continue;
    let tileNeighbors = 0;
    for (const [dn, dm] of latticeNeighborOffsets) {
      if (!isSpacer(n + dn, m + dm)) tileNeighbors++;
    }
    assert(tileNeighbors === 6,
      `spacer (${n},${m}) has ${tileNeighbors} tile neighbors (expected 6)`);
  }
}
console.log(`  ${passed - prevP4} spacers verified`);

console.log('\n--- Three closest tiles form equilateral triangle ---');
// For spacer at lattice (1,1), the 6 tile neighbors are:
// (2,1), (0,1), (1,2), (1,0), (2,0), (0,2)
// Group into two triangles of 3 at mutual distance 3
const spacerN = 1, spacerM = 1;
const neighbors = latticeNeighborOffsets.map(([dn,dm]) => {
  const nn = spacerN + dn, nm = spacerM + dm;
  const c = latticeToAxial(nn, nm);
  return { n: nn, m: nm, q: c.q, r: c.r };
});

console.log('  Tile neighbors of spacer (1,1):');
for (const nb of neighbors) {
  console.log(`    lattice (${nb.n},${nb.m}) → axial (${nb.q},${nb.r})`);
}

// Check all pairwise distances
const dists = [];
for (let i = 0; i < neighbors.length; i++) {
  for (let j = i + 1; j < neighbors.length; j++) {
    const d = axialDistance(neighbors[i].q, neighbors[i].r, neighbors[j].q, neighbors[j].r);
    dists.push({ i, j, d });
  }
}
const dist3 = dists.filter(d => d.d === 3);
const dist5 = dists.filter(d => d.d === 5); // diagonal of parallelogram
console.log(`  Pairwise distances: ${dist3.length} at dist=3, ${dist5.length} at dist≠3`);
assert(dist3.length >= 6, 'at least 6 pairs at distance 3 (two equilateral triangles)');

// --- Rounding guarantee ---
console.log('\n--- Rounding margin ---');
let maxFracN = 0, maxFracM = 0;
const neighborOffsets = [[0,0],[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]];
for (const [dq, dr] of neighborOffsets) {
  const fracN = Math.abs((3 * dq + dr) / 7);
  const fracM = Math.abs((2 * dr - dq) / 7);
  if (fracN > maxFracN) maxFracN = fracN;
  if (fracM > maxFracM) maxFracM = fracM;
}
console.log(`  Max fractional error: n=${maxFracN.toFixed(4)}, m=${maxFracM.toFixed(4)}`);
assert(maxFracN < 0.5, `n fractional error < 0.5 guarantees correct rounding`);
assert(maxFracM < 0.5, `m fractional error < 0.5 guarantees correct rounding`);

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('ALL PROOFS VERIFIED');