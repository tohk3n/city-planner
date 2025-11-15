// =============================================================================
// LARGE TILE SYSTEM
// =============================================================================

import { CONFIG } from './config.js';
import { hexToPixel, getHexNeighbors, sortVerticesByAngle, getExternalVerticesForPosition, getHexVertices, getHexDirectionalClass } from './hex-math.js';

/**
 * Generate all large tile center positions for the grid
 */
export function generateLargeTileCenters(W, H) {
  const offsets = [
    [1, 4],   // r=0
    [9, 12],  // r=1
    [3, 6],   // r=2
    [0, 11],  // r=3
    [5, 8],   // r=4
    [2, 13],  // r=5
    [7, 10],  // r=6
  ];

  const centers = [];
  for (let x = 0; x < W; x++) {
    const [a, b] = offsets[x % 7];
    for (const base of [a, b]) {
      for (let k = -Math.ceil(H/14); k <= Math.ceil(H/14); k++) {
        const y = base + 14 * k;
        if (y >= 0 && y < H) {
          centers.push([x, y]);
        }
      }
    }
  }
  return centers;
}

/**
 * Create a large tile object
 */
export function createLargeTile(centerCol, centerRow, depth = 25) {
  return {
    centerCol,
    centerRow,
    depth,
    id: `${centerCol},${centerRow}`,
    hexes: getLargeTileHexes(centerCol, centerRow)
  };
}

/**
 * Get all hexes that belong to a large tile (center + 6 neighbors)
 */
export function getLargeTileHexes(centerCol, centerRow) {
  const hexes = [{ col: centerCol, row: centerRow }];
  const neighbors = getHexNeighbors(centerCol, centerRow);
  return hexes.concat(neighbors);
}

/**
 * Find which large tile a hex belongs to
 */
export function findLargeTileForHex(col, row, largeTiles) {
  for (const [tileId, largeTile] of largeTiles) {
    const hexExists = largeTile.hexes.some(hex => hex.col === col && hex.row === row);
    if (hexExists) {
      return largeTile;
    }
  }
  return null;
}

/**
 * Create SVG path for large tile boundary
 */
export function createLargeTileBoundaryPath(largeTile) {
  const vertices = getClusterBoundaryVertices(largeTile);

  if (vertices.length < 3) return '';

  let path = `M ${vertices[0].x} ${vertices[0].y}`;

  for (let i = 1; i < vertices.length; i++) {
    path += ` L ${vertices[i].x} ${vertices[i].y}`;
  }

  path += ' Z';
  return path;
}

/**
 * Get boundary vertices for a cluster of hexes
 */
export function getClusterBoundaryVertices(largeTile) {
  const vertices = [];
  const center = hexToPixel(largeTile.centerCol, largeTile.centerRow);

  largeTile.hexes.forEach(hex => {
    const position = getHexDirectionalClass(hex.col, hex.row, largeTile.centerCol, largeTile.centerRow);

    if (position === 'center') return;

    const hexPixel = hexToPixel(hex.col, hex.row);
    const hexVertices = getHexVertices(hexPixel.x, hexPixel.y);

    const externalVertices = getExternalVerticesForPosition(position, hexVertices);
    vertices.push(...externalVertices);
  });

  return sortVerticesByAngle(vertices, center);
}