// =============================================================================
// THREE.JS PUBLIC API - Replaces threejs-terrain.js
// =============================================================================
// Three.js loaded globally via CDN
import ThreeManager from './threejs/ThreeManager.js';

/**
 * Show 3D view
 */
export function showThreeJSView() {
  ThreeManager.show();
}

/**
 * Hide 3D view
 */
export function hideThreeJSView() {
  ThreeManager.hide();
}

/**
 * Rebuild terrain colors (fast - no geometry rebuild)
 */
export function rebuildTerrainColors() {
  ThreeManager.updateColors();
}

/**
 * Reset camera to default position
 */
export function resetCameraPosition() {
  if (ThreeManager.controls && window.THREE) {
    ThreeManager.controls.reset(
      new THREE.Vector3(0, 800, 1200),
      new THREE.Vector3(0, 0, 0)
    );
  }
}

/**
 * Update single tile mesh when depth changes
 */
export function updateTileMesh(tileId) {
  ThreeManager.updateTile(tileId);
}

/**
 * Render building mesh
 */
export function renderBuildingMesh(building) {
  ThreeManager.renderBuilding(building);
}

/**
 * Remove building mesh
 */
export function removeBuildingMesh(buildingId) {
  ThreeManager.removeBuilding(buildingId);
}

/**
 * Get performance stats
 */
export function getThreeJSStats() {
  return ThreeManager.getStats();
}

/**
 * Log performance stats
 */
export function logThreeJSStats() {
  ThreeManager.logStats();
}

// Export manager for advanced usage
export { ThreeManager };