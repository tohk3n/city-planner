// =============================================================================
// HEX COORDINATE SYSTEM & GEOMETRY
// =============================================================================

import { CONFIG } from './config.js';

/**
 * Convert offset coordinates to cube coordinates
 * Cube coords have the property that q + r + s = 0
 */
export function offsetToCube(col, row) {
  const q = col - Math.floor(row / 2);
  const r = row;
  const s = -q - r;
  return { q, r, s };
}

/**
 * Convert cube coordinates back to offset coordinates
 */
export function cubeToOffset(q, r) {
  const row = r;
  const col = q + Math.floor(r / 2);
  return [col, row];
}

/**
 * Rotate cube coordinates 60ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° clockwise
 * In cube space, rotation is just swapping and negating: (q,r,s) -> (-s,-q,-r)
 */
export function rotateCubeCW(cube) {
  return {
    q: -cube.s,
    r: -cube.q,
    s: -cube.r
  };
}

/**
 * Rotate hex coordinates by N * 60ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° clockwise
 * Uses cube coordinate system for mathematically correct rotations
 */
export function rotateCoords(coords, rotation) {
  rotation = rotation % 6;
  if (rotation === 0) {
    return coords.map(c => [...c]); // Return copy
  }

  return coords.map(([col, row]) => {
    // Convert to cube coordinates
    let cube = offsetToCube(col, row);

    // Apply rotation N times
    for (let i = 0; i < rotation; i++) {
      cube = rotateCubeCW(cube);
    }

    // Convert back to offset coordinates
    return cubeToOffset(cube.q, cube.r);
  });
}

/**
 * Convert hex grid coordinates to pixel coordinates
 */
export function hexToPixel(col, row) {
  return {
    x: CONFIG.HEX_SIZE * Math.sqrt(3) * (col + 0.5 * (row % 2)),
    y: CONFIG.HEX_SIZE * 1.5 * row
  };
}

/**
 * Get all 6 neighbors of a hex
 */
export function getHexNeighbors(col, row) {
  const isEvenRow = row % 2 === 0;
  const neighbors = [];

  if (isEvenRow) {
    neighbors.push(
      { col: col, row: row - 1 },
      { col: col + 1, row: row },
      { col: col, row: row + 1 },
      { col: col - 1, row: row + 1 },
      { col: col - 1, row: row },
      { col: col - 1, row: row - 1 }
    );
  } else {
    neighbors.push(
      { col: col + 1, row: row - 1 },
      { col: col + 1, row: row },
      { col: col + 1, row: row + 1 },
      { col: col, row: row + 1 },
      { col: col - 1, row: row },
      { col: col, row: row - 1 }
    );
  }

  return neighbors.filter(n =>
    n.col >= 0 && n.col < CONFIG.HEX_GRID_SIZE.cols &&
    n.row >= 0 && n.row < CONFIG.HEX_GRID_SIZE.rows
  );
}

/**
 * Get all hexes within a radius (brush size)
 * Uses cube coordinate distance calculation for accurate hex grid distance
 * radius 0 = center only (1 hex)
 * radius 1 = center + ring (7 hexes)
 * radius 2 = center + 2 rings (19 hexes)
 */
export function getHexesInRadius(centerCol, centerRow, radius) {
  if (radius === 0) {
    return [{ col: centerCol, row: centerRow }];
  }

  const results = [];
  const centerCube = offsetToCube(centerCol, centerRow);

  // Iterate over cube coordinate space bounded by radius
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const s = -q - r;

      // Calculate distance from center in cube space
      const distance = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;

      if (distance <= radius) {
        // Convert to offset coordinates relative to center
        const [col, row] = cubeToOffset(centerCube.q + q, centerCube.r + r);

        // Bounds check
        if (col >= 0 && col < CONFIG.HEX_GRID_SIZE.cols &&
            row >= 0 && row < CONFIG.HEX_GRID_SIZE.rows) {
          results.push({ col, row });
        }
      }
    }
  }

  return results;
}

/**
 * Create SVG polygon points string for a hex
 */
export function createHexPolygonPoints(cx, cy) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30);
    points.push(`${cx + CONFIG.HEX_SIZE * Math.cos(angle)},${cy + CONFIG.HEX_SIZE * Math.sin(angle)}`);
  }
  return points.join(',');
}

/**
 * Get the 6 vertices of a hex
 */
export function getHexVertices(centerX, centerY) {
  const vertices = [];

  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * Math.PI / 180;
    const x = centerX + CONFIG.HEX_SIZE * Math.cos(angle);
    const y = centerY + CONFIG.HEX_SIZE * Math.sin(angle);
    vertices.push({ x, y });
  }

  return vertices;
}

/**
 * Determine directional relationship of hex to center hex
 */
export function getHexDirectionalClass(hexCol, hexRow, centerCol, centerRow) {
  if (hexCol === centerCol && hexRow === centerRow) {
    return 'center';
  }

  const deltaCol = hexCol - centerCol;
  const deltaRow = hexRow - centerRow;

  const isEvenRow = centerRow % 2 === 0;

  if (isEvenRow) {
    if (deltaCol === 0 && deltaRow === -1) return 'neighbor-0';
    if (deltaCol === 1 && deltaRow === 0) return 'neighbor-1';
    if (deltaCol === 0 && deltaRow === 1) return 'neighbor-2';
    if (deltaCol === -1 && deltaRow === 1) return 'neighbor-3';
    if (deltaCol === -1 && deltaRow === 0) return 'neighbor-4';
    if (deltaCol === -1 && deltaRow === -1) return 'neighbor-5';
  } else {
    if (deltaCol === 1 && deltaRow === -1) return 'neighbor-0';
    if (deltaCol === 1 && deltaRow === 0) return 'neighbor-1';
    if (deltaCol === 1 && deltaRow === 1) return 'neighbor-2';
    if (deltaCol === 0 && deltaRow === 1) return 'neighbor-3';
    if (deltaCol === -1 && deltaRow === 0) return 'neighbor-4';
    if (deltaCol === 0 && deltaRow === -1) return 'neighbor-5';
  }

  return 'unassigned';
}

/**
 * Sort vertices by angle around a center point
 */
export function sortVerticesByAngle(vertices, center) {
  return vertices
    .filter((vertex, index, arr) => {
      return !arr.slice(0, index).some(v =>
        Math.abs(v.x - vertex.x) < 0.1 && Math.abs(v.y - vertex.y) < 0.1
      );
    })
    .sort((a, b) => {
      const angleA = Math.atan2(a.y - center.y, a.x - center.x);
      const angleB = Math.atan2(b.y - center.y, b.x - center.x);
      return angleA - angleB;
    });
}

/**
 * Get external vertices for a hex in a given position
 */
export function getExternalVerticesForPosition(position, hexVertices) {
  const externalVertexMap = {
    'neighbor-0': [5, 0, 1],
    'neighbor-1': [0, 1, 2],
    'neighbor-2': [1, 2, 3],
    'neighbor-3': [2, 3, 4],
    'neighbor-4': [3, 4, 5],
    'neighbor-5': [4, 5, 0]
  };

  const indices = externalVertexMap[position];
  if (!indices) return [];

  return indices.map(i => hexVertices[i]);
}