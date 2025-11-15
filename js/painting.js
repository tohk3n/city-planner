// =============================================================================
// PAINTING SYSTEM
// =============================================================================

import { AppState } from './state.js';
import { getHexNeighbors, getHexesInRadius } from './hex-math.js';
import { getStampWorldCoords } from './stamps.js';
import { clearHoverPreview } from './rendering.js';
import { renderBuildingMesh } from './threejs-api.js';

/**
 * Paint a hex (or stamp)
 */
export function paintHex(hexElement) {
  if (!hexElement || hexElement.tagName.toLowerCase() !== 'polygon') return;

  const col = +hexElement.dataset.col;
  const row = +hexElement.dataset.row;

  if (AppState.stampMode && AppState.selectedStamp) {
    applyStamp(col, row);
  } else {
    // paintSingleHex now respects brushSize for all painting
    paintSingleHex(col, row);
  }
}

/**
 * Paint a single hex (or brush area based on brushSize)
 */
export function paintSingleHex(col, row) {
  const hex = AppState.entities.getHex(col, row);
  if (!hex) return;

  // Get all hexes in brush radius
  const radius = AppState.brushSize - 1; // brushSize 1 = radius 0 (single hex)
  const hexesToPaint = getHexesInRadius(col, row, radius);

  let painted = false;

  hexesToPaint.forEach(({ col, row }) => {
    let success = false;

    if (AppState.currentColor === 'eraser') {
      success = AppState.entities.eraseHex(col, row);
    } else if (AppState.currentColor === 'border-pattern') {
      success = AppState.entities.setBorderPattern(col, row);
    } else {
      success = AppState.entities.paintHex(col, row, AppState.currentColor);
    }

    if (success) {
      const hex = AppState.entities.getHex(col, row);
      if (hex) {
        AppState.renderers.svg.updateHexColor(hex);
        painted = true;
      }
    }
  });

  // Update 3D if needed
  if (painted && AppState.show3DView && AppState.renderers.three.scene) {
    // 3D hex updates would go here when implemented
    // For now, full terrain rebuild on next update
  }
}

/**
 * Paint large hex (center + 6 neighbors)
 */
export function paintLargeHex(col, row) {
  let success = false;

  if (AppState.currentColor === 'eraser') {
    const painted = AppState.entities.paintLargeHex(col, row, null);
    success = painted > 0;
  } else if (AppState.currentColor === 'border-pattern') {
    const hexesToPaint = [
      { col, row },
      ...getHexNeighbors(col, row)
    ];

    hexesToPaint.forEach(coord => {
      if (AppState.entities.setBorderPattern(coord.col, coord.row)) {
        const hex = AppState.entities.getHex(coord.col, coord.row);
        if (hex) AppState.renderers.svg.updateHexColor(hex);
      }
    });
    success = true;
  } else {
    const painted = AppState.entities.paintLargeHex(col, row, AppState.currentColor);
    success = painted > 0;
  }

  if (success) {
    const hexesToUpdate = [
      { col, row },
      ...getHexNeighbors(col, row)
    ];

    hexesToUpdate.forEach(coord => {
      const hex = AppState.entities.getHex(coord.col, coord.row);
      if (hex) {
        AppState.renderers.svg.updateHexColor(hex);
      }
    });
  }
}

/**
 * Apply a building stamp
 */
export function applyStamp(centerCol, centerRow) {
  if (!AppState.stampMode || !AppState.selectedStamp) return false;

  const building = AppState.entities.placeBuilding(
    AppState.selectedStamp,
    centerCol,
    centerRow,
    AppState.currentStampRotation
  );

  if (!building) {
    console.warn('[Paint] Failed to place building');
    return false;
  }

  console.log(`[Paint] Placed building: ${building.stampName} at [${centerCol},${centerRow}]`);

  // Render building via SVG renderer
  AppState.renderers.svg.renderBuilding(building);

  // Render in 3D if active
  if (AppState.show3DView) {
    renderBuildingMesh(building);
  }

  return true;
}