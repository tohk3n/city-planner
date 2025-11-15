// =============================================================================
// BUILDING RENDERER - Building mesh creation and management
// =============================================================================
import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { hexToPixel } from '../hex-math.js';

const HEIGHT_SCALE = 8;

class BuildingRenderer {
  constructor(scene, geometryCache, materialCache) {
    this.scene = scene;
    this.geometryCache = geometryCache;
    this.materialCache = materialCache;

    this.buildingMeshes = new Map(); // buildingId -> Group

    // Grid offset for centering
    this.centerOffsetX = (CONFIG.HEX_GRID_SIZE.cols * CONFIG.HEX_SIZE * Math.sqrt(3)) / 2;
    this.centerOffsetZ = (CONFIG.HEX_GRID_SIZE.rows * CONFIG.HEX_SIZE * 1.5) / 2;
  }

  /**
   * Render a building as 3D mesh
   */
  renderBuilding(building) {
    if (!this.scene) return;

    // Remove old mesh if exists
    this.removeBuilding(building.id);

    const group = new THREE.Group();
    group.userData.buildingId = building.id;

    // Get base height from first tile
    const firstTile = Array.from(building.tiles)[0];
    if (!firstTile) {
      console.warn(`[BuildingRenderer] No tiles for building ${building.id}`);
      return;
    }

    const baseHeight = (firstTile.depth - 25) * HEIGHT_SCALE;

    // Create a cube for each hex in the building
    building.hexes.forEach(hex => {
      const pixelPos = hexToPixel(hex.col, hex.row);
      const x = pixelPos.x - this.centerOffsetX;
      const z = pixelPos.y - this.centerOffsetZ;

      const material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(building.color),
        emissive: new THREE.Color(building.color).multiplyScalar(0.15)
      });

      // Use shared geometry
      const cube = new THREE.Mesh(this.geometryCache.getCubeGeometry(), material);
      cube.position.set(x, baseHeight + 10, z); // 10 units above terrain
      cube.castShadow = false;
      cube.receiveShadow = false;

      group.add(cube);
    });

    this.scene.add(group);
    this.buildingMeshes.set(building.id, group);
    building.threeMesh = group;

    console.log(`[BuildingRenderer] Rendered ${building.stampName} with ${building.hexes.length} cubes`);
  }

  /**
   * Remove building mesh
   */
  removeBuilding(buildingId) {
    const mesh = this.buildingMeshes.get(buildingId);
    if (!mesh) return;

    this.scene.remove(mesh);

    // Dispose materials but NOT shared geometry
    mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.material) child.material.dispose();
        // DON'T dispose geometry - it's shared cube geometry
        if (child.geometry && child.geometry !== this.geometryCache.getCubeGeometry()) {
          child.geometry.dispose();
        }
      }
    });

    this.buildingMeshes.delete(buildingId);
    console.log(`[BuildingRenderer] Removed building ${buildingId}`);
  }

  /**
   * Clear all buildings
   */
  clearBuildings() {
    this.buildingMeshes.forEach((mesh, id) => {
      this.removeBuilding(id);
    });
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      buildingMeshes: this.buildingMeshes.size
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    this.clearBuildings();
  }
}

export default BuildingRenderer;