// =============================================================================
// FILE OPERATIONS
// =============================================================================

import { AppState } from './state.js';
import { clearBuildingHighlight, hideBuildingInfo } from './building-management.js';
import { updateTileMesh, renderBuildingMesh, removeBuildingMesh } from '../threejs-api.js';

/**
 * Save plan as JSON file
 */
export async function saveAsJson() {
  const state = {
    planName: AppState.dom.planNameInput.value.trim(),
    ...AppState.entities.toJSON()
  };

  const filename = (AppState.dom.planNameInput.value.trim() || 'settlement_plan') + '.json';

  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log(`[Save] Plan saved as ${filename}`);
}

/**
 * Apply saved state to application
 */
export function applyState(state) {
  if (!state) return;

  console.log('[Load] Applying saved state...');

  // Set plan name
  AppState.dom.planNameInput.value = state.planName || '';

  // Load data via EntityManager
  AppState.entities.fromJSON(state);

  // Re-render everything
  console.log('[Load] Re-rendering...');

  // Re-render all hexes
  AppState.entities.hexes.forEach(hex => {
    AppState.renderers.svg.updateHexColor(hex);
  });

  // Re-render all tiles
  AppState.entities.tiles.forEach(tile => {
    AppState.renderers.svg.updateTileDepth(tile);
  });

  // Re-render all buildings
  AppState.entities.buildings.forEach(building => {
    AppState.renderers.svg.renderBuilding(building);
  });

  // Update 3D if active
  if (AppState.show3DView) {
    // Update terrain tiles
    AppState.entities.tiles.forEach(tile => {
      updateTileMesh(tile.id);
    });

    // Render buildings
    AppState.entities.buildings.forEach(building => {
      renderBuildingMesh(building);
    });
  }

  console.log('[Load] State applied successfully');
}

/**
 * Reset entire map
 */
export function resetMap() {
  if (!confirm('CONFIRM RESET OPERATION\n\nThis will clear all data. Continue?')) return;

  console.log('[Reset] Clearing all data...');

  // Clear via EntityManager (includes buildings, hex colors, patterns, text)
  AppState.entities.reset();

  // Clear plan name
  AppState.dom.planNameInput.value = '';

  // Clear building selection state
  if (typeof clearBuildingHighlight === 'function') {
    clearBuildingHighlight();
  }
  if (typeof hideBuildingInfo === 'function') {
    hideBuildingInfo();
  }

  // Re-render everything
  AppState.entities.hexes.forEach(hex => {
    AppState.renderers.svg.updateHexColor(hex);
  });

  AppState.entities.tiles.forEach(tile => {
    AppState.renderers.svg.updateTileDepth(tile);
  });

  // Update 3D if active
  if (AppState.show3DView) {
    // Remove all buildings first
    AppState.entities.buildings.forEach(building => {
      removeBuildingMesh(building.id);
    });

    // Rebuild terrain (all tiles reset to default depth)
    AppState.entities.tiles.forEach(tile => {
      updateTileMesh(tile.id);
    });
  }

  console.log('[Reset] Map reset complete');
}

/**
 * Setup file input handler
 */
export function setupFileInput() {
  AppState.dom.jsonFileInput.addEventListener('change', () => {
    if (!AppState.dom.jsonFileInput.files.length) return;
    const reader = new FileReader();
    reader.onload = e => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (error) {
        console.error('[Load] JSON parse error:', error);
        alert('Invalid JSON file! File is corrupted or not valid JSON.');
        return;
      }

      try {
        applyState(data);
      } catch (error) {
        console.error('[Load] Error applying state:', error);
        console.error('[Load] Stack:', error.stack);
        alert('Error loading file: ' + error.message);
      }
    };
    reader.readAsText(AppState.dom.jsonFileInput.files[0]);
    AppState.dom.jsonFileInput.value = '';
  });
}