// =============================================================================
// TERRAIN RENDERER - Hex terrain mesh creation and management
// =============================================================================
import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { hexToPixel } from '../hex-math.js';
import { getClusterBoundaryVertices } from '../tile-system.js';

const BASELINE = -80;
const HEIGHT_SCALE = 8;

class TerrainRenderer {
  constructor(scene, geometryCache, materialCache, getHexFn) {
    this.scene = scene;
    this.geometryCache = geometryCache;
    this.materialCache = materialCache;
    this.getHexData = getHexFn;

    this.tileMeshes = new Map(); // tileId -> Group

    // Grid offset for centering
    this.centerOffsetX = (CONFIG.HEX_GRID_SIZE.cols * CONFIG.HEX_SIZE * Math.sqrt(3)) / 2;
    this.centerOffsetZ = (CONFIG.HEX_GRID_SIZE.rows * CONFIG.HEX_SIZE * 1.5) / 2;
  }

  /**
   * Build entire terrain from tiles
   */
  buildTerrain(largeTiles, heightMapMode = false) {
    console.log('[TerrainRenderer] Building terrain from', largeTiles.size, 'tiles');

    // Clear existing terrain
    this.clearTerrain();

    let meshCount = 0;
    largeTiles.forEach((tile, tileId) => {
      const mesh = this.createTileMesh(tile, heightMapMode);
      if (mesh) {
        this.scene.add(mesh);
        this.tileMeshes.set(tileId, mesh);
        meshCount++;
      }
    });

    console.log(`[TerrainRenderer] Created ${meshCount} tile meshes`);
  }

  /**
   * Create 3D mesh for a large tile (7 hexagons)
   */
  createTileMesh(tile, heightMapMode = false) {
    const group = new THREE.Group();
    group.userData.tileId = tile.id;

    const depth = tile.depth;
    const height = (depth - 25) * HEIGHT_SCALE;

    // Create each hex in the tile
    tile.hexes.forEach(hex => {
      const pixelPos = hexToPixel(hex.col, hex.row);
      const x = pixelPos.x - this.centerOffsetX;
      const z = pixelPos.y - this.centerOffsetZ;

      // Get color from entity system (not DOM!)
      const color = this.getHexColor(hex.col, hex.row, height, heightMapMode);

      const hexMesh = this.createHexMesh(x, height, z, color, depth, hex.col, hex.row);
      group.add(hexMesh);
    });

    // Add tile boundary wireframe
    const boundary = this.createTileBoundary(tile, height);
    if (boundary) group.add(boundary);

    return group;
  }

  /**
   * Create a single hex mesh
   * Uses cached geometry for performance
   */
  createHexMesh(x, y, z, color, depth, col, row) {
    // Use cached geometry - MASSIVE perf win
    const geometry = this.geometryCache.getHexGeometry(depth);
    const material = this.materialCache.getMaterial(color);

    const mesh = new THREE.Mesh(geometry, material);

    // Position at baseline, rotate to make extrusion vertical
    mesh.position.set(x, BASELINE, z);
    mesh.rotation.x = -Math.PI / 2;

    // Store hex coordinates for later updates
    mesh.userData.hexCoords = { col, row };

    // Shadows
    mesh.castShadow = false; // Terrain doesn't cast shadows (too many faces)
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Get hex color from entity system
   * Uses heightmap mode or actual painted color
   */
    getHexColor(col, row, height, heightMapMode) {
      if (heightMapMode) {
        return this.getHeightColor(height);
      }

      const hex = this.getHexData(col, row);  // ← Using injected function
      if (!hex) return 0x2a2838;

      try {
        return new THREE.Color(hex.color).getHex();
      } catch (e) {
        console.warn(`Invalid color for hex ${col},${row}:`, hex.color);
        return 0x2a2838;
        }
    }

  /**
   * Get height-based color for heightmap mode
   */
  getHeightColor(y) {
    const normalizedHeight = (y + 80) / 240; // 0 to 1

    if (normalizedHeight < 0.25) return 0x0066cc; // Deep blue
    if (normalizedHeight < 0.4) return 0x0099ff;  // Blue
    if (normalizedHeight < 0.5) return 0x00ccff;  // Cyan
    if (normalizedHeight < 0.6) return 0x66ff66;  // Green
    if (normalizedHeight < 0.7) return 0xffff00;  // Yellow
    if (normalizedHeight < 0.85) return 0xff9900; // Orange
    return 0xff3300; // Red
  }

  /**
   * Create wireframe boundary around tile
   */
  createTileBoundary(tile, height) {
    const vertices = getClusterBoundaryVertices(tile);
    if (vertices.length < 3) return null;

    const points = [];
    vertices.forEach(v => {
      const x = v.x - this.centerOffsetX;
      const z = v.y - this.centerOffsetZ;
      points.push(new THREE.Vector3(x, height + 2, z));
    });

    // Close the loop
    points.push(points[0].clone());

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      opacity: 0.6,
      transparent: true
    });

    return new THREE.Line(geometry, material);
  }

  /**
   * Update single tile when depth changes
   * Uses cached geometries so this is fast
   */
  updateTile(tileId, largeTiles, heightMapMode = false) {
    const tile = largeTiles.get(tileId);
    if (!tile || !this.tileMeshes.has(tileId)) {
      console.warn(`[TerrainRenderer] Cannot update tile ${tileId}`);
      return;
    }

    console.log(`[TerrainRenderer] Updating tile ${tileId}`);

    // Remove old mesh
    const oldMesh = this.tileMeshes.get(tileId);
    this.scene.remove(oldMesh);

    // Dispose only materials (geometries are cached and shared)
    this.disposeTileMesh(oldMesh);

    // Create new mesh with updated depth
    const newMesh = this.createTileMesh(tile, heightMapMode);
    this.scene.add(newMesh);
    this.tileMeshes.set(tileId, newMesh);
  }

  /**
   * Fast color update without rebuilding geometry
   * This is the key to making heightmap toggle instant
   */
  updateColors(largeTiles, heightMapMode) {
    console.log('[TerrainRenderer] Updating colors (fast path)');

    this.tileMeshes.forEach((tileGroup, tileId) => {
      const tile = largeTiles.get(tileId);
      if (!tile) return;

      const height = (tile.depth - 25) * HEIGHT_SCALE;

      tileGroup.children.forEach(child => {
        if (!child.isMesh || !child.userData.hexCoords) return;

        const { col, row } = child.userData.hexCoords;
        const newColor = this.getHexColor(col, row, height, heightMapMode);

        // Swap material (cheap!)
        const oldMaterial = child.material;
        child.material = this.materialCache.getMaterial(newColor);

        // Only dispose if not in cache
        if (!this.materialCache.has(oldMaterial)) {
          oldMaterial.dispose();
        }
      });
    });
  }

  /**
   * Clear all terrain meshes
   */
  clearTerrain() {
    this.tileMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      this.disposeTileMesh(mesh);
    });
    this.tileMeshes.clear();
  }

  /**
   * Dispose tile mesh safely
   * Don't dispose cached geometries/materials
   */
  disposeTileMesh(mesh) {
    mesh.traverse((child) => {
      if (child.isMesh) {
        // DON'T dispose geometry - it's cached and shared
        // Only dispose material if not in cache
        if (child.material && !this.materialCache.has(child.material)) {
          child.material.dispose();
        }
      }
      // Dispose line geometry (boundaries aren't cached)
      if (child.isLine && child.geometry) {
        child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      tileMeshes: this.tileMeshes.size
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    this.clearTerrain();
  }
}

export default TerrainRenderer;