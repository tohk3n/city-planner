// =============================================================================
// BUILDING MANAGEMENT SYSTEM
// =============================================================================

import { AppState } from './state.js';
import { BuildingEntity } from './entities.js';
import { getStampWorldCoords } from './stamps.js';

/**
 * Select a building by clicking on one of its hexes
 */
export function selectBuilding(col, row) {
  const foundBuilding = AppState.entities.findBuildingAt(col, row);

  if (!foundBuilding) {
    console.log('[Building Select] No building at this location');
    return null;
  }

  console.log(`[Building Select] Selected: ${foundBuilding.stampName} at [${foundBuilding.centerCol},${foundBuilding.centerRow}]`);

  highlightBuilding(foundBuilding);
  showBuildingInfo(foundBuilding);

  return foundBuilding;
}

/**
 * Highlight a building visually
 */
export function highlightBuilding(building) {
  clearBuildingHighlight();

  building.hexes.forEach(hex => {
    const hexElement = AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${hex.col}"][data-row="${hex.row}"]`);
    if (hexElement) {
      hexElement.classList.add('building-selected');
    }
  });

  AppState.selectedBuilding = building.id;
}

/**
 * Clear building highlight
 */
export function clearBuildingHighlight() {
  if (AppState.dom.polygonsGroup) {
    AppState.dom.polygonsGroup.querySelectorAll('.building-selected').forEach(hex => {
      hex.classList.remove('building-selected');
    });
  }
  AppState.selectedBuilding = null;
}

/**
 * Delete a building using entity system
 */
export function deleteBuilding(buildingId) {
  const building = AppState.entities.getBuilding(buildingId);
  if (!building) {
    console.warn(`[Building Delete] Building ${buildingId} not found`);
    return false;
  }

  console.log(`[Building Delete] Removing: ${building.stampName}`);

  // Use entity's delete method (handles cleanup)
  building.delete();

  console.log(`[Building Delete] Complete. ${AppState.entities.buildings.size} buildings remaining`);
  return true;
}

/**
 * Show building info panel
 */
export function showBuildingInfo(building) {
  const panel = document.getElementById('buildingInfoPanel');
  if (!panel) {
    console.warn('[Building Info] Panel not found in DOM');
    return;
  }

  document.getElementById('selectedBuildingName').textContent = building.stampName;
  document.getElementById('selectedBuildingId').textContent = building.id.split('_')[1] + '...' + building.id.slice(-6);
  document.getElementById('selectedBuildingCenter').textContent = `[${building.centerCol}, ${building.centerRow}]`;
  document.getElementById('selectedBuildingRotation').textContent = `${building.rotation * 60}Ã‚Â°`;
  document.getElementById('selectedBuildingTiles').textContent = building.getTileIds().join(', ');

  panel.style.display = 'block';
}

/**
 * Hide building info panel
 */
export function hideBuildingInfo() {
  const panel = document.getElementById('buildingInfoPanel');
  if (panel) {
    panel.style.display = 'none';
  }
}

/**
 * Get all buildings on a specific tile
 */
export function getBuildingsOnTile(tileId) {
  const tile = AppState.entities.getTile(tileId);
  return tile ? tile.getBuildings() : [];
}

/**
 * Check if a hex is part of any building
 */
export function isHexPartOfBuilding(col, row) {
  const building = AppState.entities.findBuildingAt(col, row);
  return building
    ? { isBuilding: true, buildingId: building.id, building }
    : { isBuilding: false };
}

/**
 * List all buildings (for debugging/UI)
 */
export function listBuildings() {
  AppState.entities.listBuildings();
}

// =============================================================================
// BUILDING REPOSITIONING
// =============================================================================

/**
 * State for repositioning mode
 */
export let repositioningState = {
  active: false,
  buildingId: null,
  originalCenter: null,
  hoverCol: null,
  hoverRow: null
};

/**
 * Start repositioning a building (pick it up)
 */
export function startRepositioning(buildingId) {
  const building = AppState.entities.getBuilding(buildingId);
  if (!building) {
    console.warn(`[Reposition] Building ${buildingId} not found`);
    return false;
  }

  console.log(`[Reposition] Picked up: ${building.stampName}`);

  repositioningState.active = true;
  repositioningState.buildingId = buildingId;
  repositioningState.originalCenter = { col: building.centerCol, row: building.centerRow };

  // Visual feedback - dim the building OVERLAYS (not base hexes)
  if (building.svgHexes && building.svgHexes.length > 0) {
    building.svgHexes.forEach(overlay => {
      if (overlay) {
        overlay.style.opacity = '0.4';
        overlay.style.filter = 'brightness(0.7)';
      }
    });
  } else {
    console.warn('[Reposition] No SVG overlays found - building may not be rendered yet');
  }

  // Change cursor
  AppState.dom.svg.style.cursor = 'move';

  // Show instruction
  showRepositionHint();

  return true;
}

/**
 * Cancel repositioning (drop back to original position)
 */
export function cancelRepositioning() {
  if (!repositioningState.active) return;

  const building = AppState.entities.getBuilding(repositioningState.buildingId);
  if (building && building.svgHexes) {
    // Restore overlay opacity
    building.svgHexes.forEach(overlay => {
      if (overlay) {
        overlay.style.opacity = '';
        overlay.style.filter = '';
      }
    });
  }

  console.log('[Reposition] Cancelled');

  repositioningState.active = false;
  repositioningState.buildingId = null;
  repositioningState.originalCenter = null;
  repositioningState.hoverCol = null;
  repositioningState.hoverRow = null;

  // Defensive: ensure no orphaned styles or classes
  if (AppState.dom.buildingsGroup) {
    AppState.dom.buildingsGroup.querySelectorAll('.building-overlay').forEach(overlay => {
      overlay.style.opacity = '';
      overlay.style.filter = '';
    });
  }

  // Clear preview
  if (AppState.renderers.svg) {
    AppState.renderers.svg.clearHoverPreview();
  }

  // Restore cursor
  AppState.dom.svg.style.cursor = 'default';

  hideRepositionHint();
}

/**
 * Complete repositioning (place at new location)
 */
export function completeRepositioning(newCol, newRow) {
  if (!repositioningState.active) return false;

  const building = AppState.entities.getBuilding(repositioningState.buildingId);
  if (!building) {
    cancelRepositioning();
    return false;
  }

  // Attempt to move
  const success = building.moveTo(newCol, newRow);

  if (success) {
    console.log(`[Reposition] Successfully placed at [${newCol},${newRow}]`);

    // Ensure new overlays have normal styling (defensive)
    if (building.svgHexes) {
      building.svgHexes.forEach(overlay => {
        if (overlay) {
          overlay.style.opacity = '';
          overlay.style.filter = '';
        }
      });
    }

    // Re-apply selection highlight if building is still selected
    if (AppState.selectedBuilding === building.id) {
      highlightBuilding(building);
      showBuildingInfo(building);
    }
  } else {
    console.error(`[Reposition] FAILED - Invalid placement at [${newCol},${newRow}]`);

    // Restore overlay opacity on original position
    if (building.svgHexes) {
      building.svgHexes.forEach(overlay => {
        if (overlay) {
          overlay.style.opacity = '';
          overlay.style.filter = '';
        }
      });
    }

    // Show user feedback
    alert(`Cannot place building at [${newCol},${newRow}].\nCheck console for details.`);
  }

  // Clear repositioning state
  repositioningState.active = false;
  repositioningState.buildingId = null;
  repositioningState.originalCenter = null;
  repositioningState.hoverCol = null;
  repositioningState.hoverRow = null;

  // Clear preview
  if (AppState.renderers.svg) {
    AppState.renderers.svg.clearHoverPreview();
  }

  // Restore cursor
  AppState.dom.svg.style.cursor = 'default';

  hideRepositionHint();

  return success;
}

/**
 * Show repositioning preview at hover location
 */
export function showRepositionPreview(col, row) {
  if (!repositioningState.active) return;

  const building = AppState.entities.getBuilding(repositioningState.buildingId);
  if (!building) return;

  const stamp = building.getStamp();
  if (!stamp) {
    console.error('[Reposition] Cannot find stamp for preview');
    return;
  }

  // Store hover position
  repositioningState.hoverCol = col;
  repositioningState.hoverRow = row;

  // Get world coords for preview
  const worldCoords = getStampWorldCoords(stamp, col, row, building.rotation);

  // Validate position
  const validation = BuildingEntity.validate(stamp, col, row, building.rotation);

  // Show preview with appropriate styling
  if (AppState.renderers.svg) {
    AppState.renderers.svg.showStampPreview(worldCoords, building.color, validation.valid);
  }
}

/**
 * Show hint for repositioning controls
 */
export function showRepositionHint() {
  const hint = document.createElement('div');
  hint.id = 'repositionHint';
  hint.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: #00ffff;
    padding: 20px 30px;
    border-radius: 12px;
    border: 2px solid #00ffff;
    font-family: 'Orbitron', monospace;
    font-size: 14px;
    text-align: center;
    z-index: 10000;
    pointer-events: none;
    box-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
  `;
  hint.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 8px;">REPOSITIONING MODE</div>
    <div>Click to place | ESC to cancel</div>
  `;
  document.body.appendChild(hint);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    const el = document.getElementById('repositionHint');
    if (el) el.style.opacity = '0';
  }, 2500);

  setTimeout(() => {
    const el = document.getElementById('repositionHint');
    if (el) el.remove();
  }, 3000);
}

/**
 * Hide repositioning hint
 */
export function hideRepositionHint() {
  const hint = document.getElementById('repositionHint');
  if (hint) hint.remove();
}