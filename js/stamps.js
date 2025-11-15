// =============================================================================
// BUILDING STAMPS SYSTEM
// =============================================================================

import { BUILDING_STAMPS } from './config.js';
import { offsetToCube, cubeToOffset, rotateCubeCW, rotateCoords } from './hex-math.js';

// Cache for precomputed stamp rotations
const stampGraphCache = new Map();

/**
 * Precompute all 6 rotations for each stamp
 * Use the original coordinates as-is - don't normalize
 */
export function precomputeStampRotations() {
  Object.values(BUILDING_STAMPS).flat().forEach(stamp => {
    const rotations = [];

    // Use ORIGINAL coords - no normalization!
    // The stamp designer put the coords where they want them
    for (let r = 0; r < 6; r++) {
      const rotated = rotateCoords(stamp.coords, r);
      rotations.push(rotated);
    }

    stampGraphCache.set(stamp.id, rotations);
    console.log(`Cached ${stamp.id}: ${stamp.coords.length} hexes x 6 rotations`);
  });

  console.log(`Precomputed ${stampGraphCache.size} stamps`);
}

/**
 * Get stamp coordinates in world space
 * Uses cube coordinate arithmetic for mathematically correct placement on any row
 */
export function getStampWorldCoords(stamp, centerCol, centerRow, rotation = 0) {
  const rotations = stampGraphCache.get(stamp.id);
  if (!rotations) {
    console.error(`No rotations cached for ${stamp.id}`);
    return [];
  }

  const rotated = rotations[rotation % 6];

  // Convert center to cube coordinates
  const centerCube = offsetToCube(centerCol, centerRow);

  // Translate each stamp hex using cube coordinate arithmetic
  // This is the ONLY mathematically correct way to add hex offsets
  const worldCoords = rotated.map(([localCol, localRow]) => {
    // Convert local offset to cube
    const localCube = offsetToCube(localCol, localRow);

    // Add in cube space (this handles all parity issues correctly)
    const worldCube = {
      q: centerCube.q + localCube.q,
      r: centerCube.r + localCube.r,
      s: centerCube.s + localCube.s
    };

    // Convert back to offset coordinates
    const [worldCol, worldRow] = cubeToOffset(worldCube.q, worldCube.r);

    return { col: worldCol, row: worldRow };
  });

  return worldCoords;
}