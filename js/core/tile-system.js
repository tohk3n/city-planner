// Triangular tile system for Bitcraft's 7-hex terraform clusters.
//
// GEOMETRY (verified by hand-painting hex coordinates in HexMapper):
//
// The game world tiles perfectly into 7-hex clusters (center + 6 neighbors).
// Each cluster center sits on a rectangular lattice with basis vectors (3,0)
// and (0,3), offset by (1,0):
//
//   center_q = 1 + 3n
//   center_r = 3m
//
// This means ALL cluster centers have q%3 == 1 and r%3 == 0.
//
// Every hex in the world falls into one of 9 residue classes (q%3, r%3).
// 7 of those classes belong to tile clusters, 2 are spacer hexes:
//
//   TILE residues:  (0,0) (0,1) (1,0) (1,1) (1,2) (2,0) (2,2)
//   SPACER residues: (0,2) (2,1)
//
// Spacer hexes form their own 7-hex clusters too, but they're not
// terraformable -- they're the visual gaps between tile groups.
// Groups of 3 tile clusters form equilateral "super-triangles" with
// spacer clusters at the 60-degree gaps between them.
//
// The spacer test is pure mod arithmetic -- no lattice inverse needed:
//   isSpacer(q, r) = (q%3==0 && r%3==2) || (q%3==2 && r%3==1)
//
// Lookup is O(1). No Maps needed to find which tile owns a hex.

import { hexKey, getNeighbors } from './hex-math.js';

// --- Pure lattice math (stateless) ---

// Lattice index (n, m) -> cluster center in axial coords.
export function latticeToAxial(n, m) {
  return { q: 1 + 3 * n, r: 3 * m };
}

// Axial coords -> lattice index. Only meaningful for cluster centers;
// for arbitrary hexes, use hexToClusterCenter() instead.
export function axialToLatticeIndex(q, r) {
  return {
    n: Math.round((q - 1) / 3),
    m: Math.round(r / 3),
  };
}

// Is this hex a spacer? Pure mod-3 residue test.
// 2 of 9 residue classes are spacers; 7 are tile hexes.
export function isSpacerHex(q, r) {
  const qm = ((q % 3) + 3) % 3;
  const rm = ((r % 3) + 3) % 3;
  return (qm === 0 && rm === 2) || (qm === 2 && rm === 1);
}

// Is this lattice position a spacer cluster?
// (Both n and m must be checked after converting to axial)
export function isSpacerLattice(n, m) {
  const { q, r } = latticeToAxial(n, m);
  return isSpacerHex(q, r);
}

// Given any hex, find the axial center of the cluster it belongs to.
// Works by rounding to the nearest lattice point.
export function hexToClusterCenter(q, r) {
  const { n, m } = axialToLatticeIndex(q, r);
  return latticeToAxial(n, m);
}

// Get all 7 hexes of the cluster that owns hex (q,r).
export function getClusterHexes(q, r) {
  const center = hexToClusterCenter(q, r);
  return [center, ...getNeighbors(center.q, center.r)];
}

// Find the 3 tile cluster centers that border a spacer cluster.
// Every spacer sits at the interstice of exactly 3 tile clusters
// (the "super-triangle" from the lattice geometry). Returns empty
// array if the given hex isn't actually a spacer.
export function getSpacerNeighborTiles(sq, sr) {
  if (!isSpacerHex(sq, sr)) return [];

  const seen = new Set();
  const result = [];
  for (const n of getNeighbors(sq, sr)) {
    const center = hexToClusterCenter(n.q, n.r);
    const key = center.q + ',' + center.r;
    if (!seen.has(key) && !isSpacerHex(center.q, center.r)) {
      seen.add(key);
      result.push(center);
    }
  }
  return result; // always exactly 3 for valid spacer centers
}

// Resolve a spacer cluster's depth from its 3 neighboring tile depths.
// Rule (observed in-game):
//   - If 2+ neighbors agree on a depth, use that depth
//   - If all 3 disagree, use the lowest
export function resolveSpacerDepth(depths) {
  if (depths.length < 3) return depths[0] ?? 25;

  // Check for majority (any 2 match)
  if (depths[0] === depths[1]) return depths[0];
  if (depths[0] === depths[2]) return depths[0];
  if (depths[1] === depths[2]) return depths[1];

  // All different — lowest wins
  return Math.min(...depths);
}

// Lattice key for Map storage of tile state.
export function tileKey(n, m) {
  return n + ',' + m;
}

export function parseTileKey(key) {
  const i = key.indexOf(',');
  return {
    n: parseInt(key.substring(0, i), 10),
    m: parseInt(key.substring(i + 1), 10),
  };
}

// --- Tile state management ---

export class Tile {
  constructor(n, m) {
    this.n = n;
    this.m = m;
    const c = latticeToAxial(n, m);
    this.q = c.q;
    this.r = c.r;
    this.depth = 25; // default terraform depth, sea level
  }
}

export default class TileSystem {
  constructor() {
    this.tiles = new Map();     // tileKey -> Tile (terraformable tiles only)
    this.hexToTile = new Map(); // hexKey -> Tile (reverse lookup for all tile hexes)
    this.origin = { q: 0, r: 0 };
  }

  // Generate all terraformable tiles whose clusters intersect the bounds.
  // bounds: { minQ, maxQ, minR, maxR } in axial coords.
  generate(bounds) {
    this.tiles.clear();
    this.hexToTile.clear();

    // Convert bounds to lattice range with padding
    const nMin = Math.floor((bounds.minQ - 1) / 3) - 1;
    const nMax = Math.ceil((bounds.maxQ - 1) / 3) + 1;
    const mMin = Math.floor(bounds.minR / 3) - 1;
    const mMax = Math.ceil(bounds.maxR / 3) + 1;

    for (let n = nMin; n <= nMax; n++) {
      for (let m = mMin; m <= mMax; m++) {
        const center = latticeToAxial(n, m);

        // Skip if this lattice point produces a spacer cluster
        if (isSpacerHex(center.q, center.r)) continue;

        // Only include tiles whose center is within or near bounds
        if (center.q < bounds.minQ - 1 || center.q > bounds.maxQ + 1) continue;
        if (center.r < bounds.minR - 1 || center.r > bounds.maxR + 1) continue;

        const tile = new Tile(n, m);
        this.tiles.set(tileKey(n, m), tile);

        // Register reverse lookup for all 7 hexes
        const hexes = [center, ...getNeighbors(center.q, center.r)];
        for (const h of hexes) {
          this.hexToTile.set(hexKey(h.q, h.r), tile);
        }
      }
    }

    return this;
  }

  // O(1) lookup: find the tile at this hex's cluster center.
  // Returns null for spacer hexes or hexes outside the generated set.
  getTileAt(q, r) {
    if (isSpacerHex(q, r)) return null;
    const { n, m } = axialToLatticeIndex(q, r);
    return this.tiles.get(tileKey(n, m)) || null;
  }

  // Look up via the pre-built reverse map (for when you need the tile
  // that OWNS a specific hex, not just the tile AT that hex's cluster center).
  getTileForHex(q, r) {
    return this.hexToTile.get(hexKey(q, r)) || null;
  }

  // Update a tile's depth. Returns false if hex is a spacer or not generated.
  setDepth(q, r, depth) {
    const tile = this.getTileAt(q, r);
    if (!tile) return false;
    tile.depth = depth;
    return true;
  }

  // Get the effective depth at any hex, including spacers.
  // Tile hexes return their owning tile's depth directly.
  // Spacer hexes resolve from their 3 neighboring tile depths:
  //   majority wins, ties go to the lowest.
  getDepthAt(q, r) {
    // Fast path: tile hex — just look up the owning tile
    if (!isSpacerHex(q, r)) {
      const tile = this.getTileForHex(q, r);
      return tile ? tile.depth : 25;
    }

    // Spacer hex — each spacer sits between exactly 3 tile clusters.
    // Pass the spacer's own coords directly (NOT through hexToClusterCenter,
    // which rounds to the nearest tile center and breaks everything).
    const neighborCenters = getSpacerNeighborTiles(q, r);

    const depths = [];
    for (const nc of neighborCenters) {
      const { n, m } = axialToLatticeIndex(nc.q, nc.r);
      const tile = this.tiles.get(tileKey(n, m));
      depths.push(tile ? tile.depth : 25);
    }

    return resolveSpacerDepth(depths);
  }

  // Get all spacer hex coords within bounds.
  getSpacerHexes(bounds) {
    const result = [];
    for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
      for (let r = bounds.minR; r <= bounds.maxR; r++) {
        if (isSpacerHex(q, r)) result.push({ q, r });
      }
    }
    return result;
  }

  // Serialize only tiles with non-default depth.
  toJSON() {
    const data = [];
    for (const tile of this.tiles.values()) {
      if (tile.depth !== 25) {
        data.push({ n: tile.n, m: tile.m, depth: tile.depth });
      }
    }
    return data;
  }

  // Restore depths from saved data. Tiles must already be generated.
  fromJSON(data) {
    if (!data) return;
    for (const { n, m, depth } of data) {
      const tile = this.tiles.get(tileKey(n, m));
      if (tile) tile.depth = depth;
    }
  }


  // Rebuild the tile lattice for new bounds, preserving depths
  // for tiles that still exist in the new set. Tiles that fall
  // outside the new bounds are silently dropped. New tiles get
  // the default depth (25).
  regenerate(bounds) {
    const savedDepths = new Map();
    for (const [key, tile] of this.tiles) {
      if (tile.depth !== 25) savedDepths.set(key, tile.depth);
    }

    this.generate(bounds);

    for (const [key, depth] of savedDepths) {
      const tile = this.tiles.get(key);
      if (tile) tile.depth = depth;
    }

    return this;
  }
}