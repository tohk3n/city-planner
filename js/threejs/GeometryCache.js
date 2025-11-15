// =============================================================================
// GEOMETRY CACHE - Shared hex geometries keyed by depth
// =============================================================================
import * as THREE from 'three';

const BASELINE = -80;
const HEIGHT_SCALE = 8;
const HEX_RADIUS = 20;

class GeometryCache {
  constructor() {
    this.cache = new Map(); // extrudeDepth -> geometry
    this.maxExpectedDepths = 50;
    this.sharedCubeGeometry = new THREE.BoxGeometry(25, 20, 25);
  }

  /**
   * Get or create hex geometry for a given depth
   * Geometries are cached and reused - massive perf win
   */
  getHexGeometry(depth) {
    const height = (depth - 25) * HEIGHT_SCALE;
    const extrudeDepth = Math.max(1, height - BASELINE);

    // Round to avoid cache bloat from tiny variations
    const cacheKey = Math.round(extrudeDepth);

    if (!this.cache.has(cacheKey)) {
      const shape = this._createHexShape();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: extrudeDepth,
        bevelEnabled: false
      });
      this.cache.set(cacheKey, geometry);
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Get shared cube geometry for buildings
   */
  getCubeGeometry() {
    return this.sharedCubeGeometry;
  }

  /**
   * Create hexagon shape (flat-top orientation)
   */
  _createHexShape() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = HEX_RADIUS * Math.cos(angle);
      const pz = HEX_RADIUS * Math.sin(angle);
      if (i === 0) {
        shape.moveTo(px, pz);
      } else {
        shape.lineTo(px, pz);
      }
    }
    shape.closePath();
    return shape;
  }

  /**
   * Dispose all cached geometries
   */
  dispose() {
    this.cache.forEach(geometry => geometry.dispose());
    this.cache.clear();
    if (this.sharedCubeGeometry) {
      this.sharedCubeGeometry.dispose();
    }
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      cachedGeometries: this.cache.size
    };
  }
}

export default GeometryCache;