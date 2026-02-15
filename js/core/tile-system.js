// Triangular tile system for Bitcraft's 7-hex terraform clusters.
//
// The game world is perfectly tiled by 7-hex clusters (center + 6 neighbors).
// 3/4 of clusters are terraformable TILES; 1/4 are SPACER clusters that
// create the triangular visual pattern between tile groups.
//
// The tiling is a lattice with basis vectors v1=(2,1) and v2=(-1,3) in axial
// coordinates. These have hex-distance 3 and are 60° apart — the minimum
// non-overlapping packing of radius-1 hex clusters.
//
// Spacer clusters occur at lattice positions where both indices are odd.
// This produces: no two spacers adjacent, each spacer ringed by 6 tiles,
// and groups of 3 tiles forming equilateral "super-triangles" with a spacer
// at the center.
//
// Lookup is O(1) — no Maps needed to find which tile owns a hex. The lattice
// inverse (simple division by 7 + round) is mathematically guaranteed to
// produce the correct result because the max fractional error (3/7 ≈ 0.43)
// is below the 0.5 rounding threshold.

import { hexKey, getNeighbors, axialDistance } from './hex-math.js';

// Lattice basis vectors
const V1_Q = 2, V1_R = 1;   // hex distance 3
const V2_Q = -1, V2_R = 3;  // hex distance 3

// --- Pure lattice math (stateless, no allocation where avoidable) -----------

export function latticeToAxial(n, m) {
  return { q: 2 * n - m, r: n + 3 * m };
}

export function axialToLatticeIndex(q, r) {
  return {
    n: Math.round((3 * q + r) / 7),
    m: Math.round((2 * r - q) / 7),
  };
}

export function isSpacerLattice(n, m) {
  return (n % 2 !== 0) && (m % 2 !== 0);
}

// Given any hex, find the axial center of the cluster it belongs to.
export function hexToClusterCenter(q, r) {
  const { n, m } = axialToLatticeIndex(q, r);
  return latticeToAxial(n, m);
}

// Is this hex part of a spacer cluster?
export function isSpacerHex(q, r) {
  const { n, m } = axialToLatticeIndex(q, r);
  return isSpacerLattice(n, m);
}

// Get all 7 hexes of the cluster that owns hex (q,r).
export function getClusterHexes(q, r) {
  const center = hexToClusterCenter(q, r);
  return [center, ...getNeighbors(center.q, center.r)];
}

// Lattice key for Map storage of tile state.
export function tileKey(n, m) {
  return `${n},${m}`;
}

export function parseTileKey(key) {
  const i = key.indexOf(',');
  return {
    n: parseInt(key.substring(0, i), 10),
    m: parseInt(key.substring(i + 1), 10),
  };
}

// --- Tile state management --------------------------------------------------

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
    this.tiles = new Map();     // tileKey → Tile (terraformable tiles only)
    this.hexToTile = new Map(); // hexKey → Tile (reverse lookup for all tile hexes)
    this.origin = { q: 0, r: 0 };
  }

  // Generate all terraformable tiles whose clusters intersect the bounds.
  // bounds: { minQ, maxQ, minR, maxR } in axial coords.
  generate(bounds) {
    this.tiles.clear();
    this.hexToTile.clear();

    // Convert bound corners to lattice range with padding
    const corners = [
      axialToLatticeIndex(bounds.minQ, bounds.minR),
      axialToLatticeIndex(bounds.maxQ, bounds.minR),
      axialToLatticeIndex(bounds.minQ, bounds.maxR),
      axialToLatticeIndex(bounds.maxQ, bounds.maxR),
    ];
    const nMin = Math.min(...corners.map(c => c.n)) - 1;
    const nMax = Math.max(...corners.map(c => c.n)) + 1;
    const mMin = Math.min(...corners.map(c => c.m)) - 1;
    const mMax = Math.max(...corners.map(c => c.m)) + 1;

    for (let n = nMin; n <= nMax; n++) {
      for (let m = mMin; m <= mMax; m++) {
        if (isSpacerLattice(n, m)) continue;

        const center = latticeToAxial(n, m);

        // Only include tiles whose center is within or near bounds.
        // A cluster can overlap the bounds even if its center is 1 hex outside.
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

  // O(1) lookup via math — doesn't need generate() to have been called.
  // Returns the Tile if it exists in the generated set, null otherwise.
  getTileAt(q, r) {
    const { n, m } = axialToLatticeIndex(q, r);
    if (isSpacerLattice(n, m)) return null;
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

  // Get all spacer hex keys within bounds (for rendering them differently).
  getSpacerHexes(bounds) {
    const result = [];
    const corners = [
      axialToLatticeIndex(bounds.minQ, bounds.minR),
      axialToLatticeIndex(bounds.maxQ, bounds.minR),
      axialToLatticeIndex(bounds.minQ, bounds.maxR),
      axialToLatticeIndex(bounds.maxQ, bounds.maxR),
    ];
    const nMin = Math.min(...corners.map(c => c.n)) - 1;
    const nMax = Math.max(...corners.map(c => c.n)) + 1;
    const mMin = Math.min(...corners.map(c => c.m)) - 1;
    const mMax = Math.max(...corners.map(c => c.m)) + 1;

    for (let n = nMin; n <= nMax; n++) {
      for (let m = mMin; m <= mMax; m++) {
        if (!isSpacerLattice(n, m)) continue;
        const center = latticeToAxial(n, m);
        const hexes = [center, ...getNeighbors(center.q, center.r)];
        for (const h of hexes) {
          if (h.q >= bounds.minQ && h.q <= bounds.maxQ &&
              h.r >= bounds.minR && h.r <= bounds.maxR) {
            result.push(h);
          }
        }
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
}