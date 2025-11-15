// =============================================================================
// MAIN INITIALIZATION
// =============================================================================

import { AppState, initDOMReferences, createSVGGroups, initEntityManager, initTileEntities, initRenderers } from './state.js';
import { precomputeStampRotations } from './stamps.js';
import { updateViewBox } from './rendering.js';
import { buildPalette, setupStampSystem, setupEventListeners, selectColor } from './ui.js';
import { setupFileInput } from './file-ops.js';
import ThreeManager from './threejs/ThreeManager.js';

/**
 * Initialize the application
 */
function init() {
  console.log('Bitcraft Settlement Planner - Initializing...');

  // 1. Initialize DOM references
  initDOMReferences();
  console.log('[Init] DOM references initialized');

  // 2. Create SVG structure
  createSVGGroups();
  console.log('[Init] SVG groups created');

  // 3. Initialize Entity Manager
  initEntityManager();
  console.log('[Init] Entity manager ready');

  // 4. Initialize tile entities
  initTileEntities();
  console.log('[Init] Tile entities ready');

  // 5. Initialize Renderers
  initRenderers();
  console.log('[Init] Renderers ready');

  // 6. Precompute stamp rotations (MUST be before any stamp operations)
  precomputeStampRotations();
  console.log('[Init] Stamp rotations precomputed');

  // 7. Setup SVG viewBox
  updateViewBox();

  // 8. Render initial grid state via new renderer system
  AppState.renderers.svg.renderHexGrid(AppState.entities);
  AppState.renderers.svg.renderTileBoundaries(AppState.entities, AppState.showBoundaries);
  AppState.renderers.svg.renderDebugCenters(AppState.entities, AppState.debugCenters);
  console.log('[Init] Initial render complete');

  // 9. Build UI
  buildPalette();
  setupStampSystem();
  console.log('[Init] UI built');

  // 10. Setup event listeners
  setupEventListeners();
  setupFileInput();
  console.log('[Init] Event listeners attached');

  // 11. Initialize ThreeManager with AppState
  ThreeManager.setAppState(AppState); // ADD THIS
  console.log('[Init] ThreeManager configured');

  // 12. Update stats
  if (typeof updateStats === 'function') {
    updateStats();
  }

  // 13. Select default color
  selectColor('red');

  console.log(`[Init] Complete: ${AppState.entities.tiles.size} tiles, ${AppState.entities.hexes.size} hexes`);
  console.log('[Init] Ready!');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}