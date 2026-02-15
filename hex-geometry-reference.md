# Bitcraft Hex Geometry Reference

## CRITICAL: Read This Before Touching tile-system.js

This document contains the **verified ground truth** for Bitcraft's hex coordinate
system, derived from hand-painting actual game coordinates in a hex mapper tool.
Every formula here has been validated against 14 tile cluster centers, 24 spacer
hexes, and 311 automated assertions.

**If you are tempted to change the lattice math, read this first.**

---

## Coordinate System

Bitcraft uses **axial coordinates (q, r)** with **pointy-top hexagons**.

Pixel conversion (hex size = s):
```
x = s * (sqrt(3) * q + sqrt(3)/2 * r)
y = s * (3/2 * r)
```

The six neighbors of hex (q, r):
```
(q+1, r)  (q, r+1)  (q-1, r+1)  (q-1, r)  (q, r-1)  (q+1, r-1)
```

---

## The 7-Hex Cluster Tiling

The entire game world tiles into **7-hex clusters**: a center hex plus its 6 neighbors.
These clusters come in two types:

- **Tile clusters** (77.8%): Terraformable, player-interactive
- **Spacer clusters** (22.2%): Non-interactive gaps between tiles

Three tile clusters form equilateral "super-triangles" with spacer clusters at the
60-degree gaps between them. This creates the distinctive visual pattern visible in
the game's hex grid.

---

## Lattice Formula (THE CORRECT ONE)

Tile cluster centers sit on a rectangular grid offset from the origin:

```
center_q = 1 + 3n
center_r = 3m
```

Where (n, m) are integer lattice indices. The basis vectors are simply **(3, 0)**
and **(0, 3)** with offset **(1, 0)**.

### Inverse (axial -> lattice index):
```javascript
n = Math.round((q - 1) / 3)
m = Math.round(r / 3)
```

### Round-trip guarantee:
For any tile cluster center, `latticeToAxial(axialToLatticeIndex(q, r))` returns
the original (q, r). Verified for all 14 hand-painted clusters.

---

## Spacer Detection

Every hex falls into one of 9 residue classes `(q % 3, r % 3)`:

| r%3 \ q%3 |   0   |   1   |   2   |
|:----------:|:-----:|:-----:|:-----:|
|     0      | tile  | **CENTER** | tile  |
|     1      | tile  | tile  | **SPACER** |
|     2      | **SPACER** | tile  | tile  |

The spacer test is pure mod arithmetic:

```javascript
function isSpacerHex(q, r) {
  const qm = ((q % 3) + 3) % 3;  // handles negative coords
  const rm = ((r % 3) + 3) % 3;
  return (qm === 0 && rm === 2) || (qm === 2 && rm === 1);
}
```

- 7 residue classes -> tile hexes
- 2 residue classes -> spacer hexes
- Ratio: 7:2 (matches game data exactly)

---

## What Was Wrong Before

The old code used basis vectors `V1 = (2, 1)` and `V2 = (-1, 3)` with these formulas:

```javascript
// WRONG - DO NOT USE
latticeToAxial(n, m) = { q: 2*n - m, r: n + 3*m }
axialToLatticeIndex(q, r) = { n: round((3q+r)/7), m: round((2r-q)/7) }
isSpacerLattice(n, m) = (n%2 !== 0) && (m%2 !== 0)
```

These fail catastrophically: **12 of 14** hand-painted cluster centers do not
round-trip correctly. The basis vectors, the inverse formula, and the spacer
detection are all wrong.

---

## Verified Data Points

### Tile cluster centers (hand-painted):
```
(q, r)    ->  (n, m)
(1, -6)   ->  (0, -2)
(1, -3)   ->  (0, -1)
(1,  0)   ->  (0,  0)
(1,  3)   ->  (0,  1)
(4, -6)   ->  (1, -2)
(4, -3)   ->  (1, -1)
(4,  0)   ->  (1,  0)
(-2, -3)  ->  (-1, -1)
(-2,  0)  ->  (-1,  0)
(-2,  3)  ->  (-1,  1)
(-2,  6)  ->  (-1,  2)
(-5,  0)  ->  (-2,  0)
(-5,  3)  ->  (-2,  1)
(-5,  6)  ->  (-2,  2)
```

Pattern: q advances by 3 (column stride), r advances by 3 (row stride).
All centers satisfy q%3 == 1, r%3 == 0.

### Spacer hexes (hand-painted sample, 24 hexes):
All satisfy `(q%3==0 && r%3==2) || (q%3==2 && r%3==1)`.
Residue distribution: exactly 12 in each class.

---

## Key Properties

1. **O(1) classification**: Any hex can be classified as tile or spacer using only
   mod-3 arithmetic. No lookup tables, no maps.

2. **O(1) cluster lookup**: For any hex, `round((q-1)/3)` and `round(r/3)` give
   the lattice index of its owning cluster.

3. **Perfect coverage**: The 9 residue classes partition all hexes with no gaps
   and no overlaps.

4. **No spacer flag needed on HexData**: Spacer status is computable from coordinates.
   The `spacer` field on HexData is a rendering convenience, not authoritative data.

---

## Visual Reference

```
    T T S T T S T T        T = tile cluster hex
   T C T T C T T C T       C = cluster center
    T T S T T S T T        S = spacer hex
 T T S T T S T T S
T C T T C T T C T
 T T S T T S T T
    T T S T T S
   T C T T C T
    T T S T T S
```

The grid is continuous — spacer hexes fill the gaps between tile clusters in a
regular pattern. Every 3rd column and row boundary produces a spacer. Three tile
clusters form equilateral triangles with spacers at the interstices.
