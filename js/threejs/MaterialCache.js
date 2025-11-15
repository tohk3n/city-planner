import * as THREE from 'three';

class MaterialCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  getMaterial(color) {
    const key = typeof color === 'number' ? color : color.toString(16);
    
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const material = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, material);
      return material;
    }

    // Evict oldest if cache full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldMaterial = this.cache.get(oldestKey);
      oldMaterial.dispose();
      this.cache.delete(oldestKey);
    }

    const material = new THREE.MeshLambertMaterial({ color });
    this.cache.set(key, material);
    return material;
  }

  has(material) {
    for (const cached of this.cache.values()) {
      if (cached === material) return true;
    }
    return false;
  }

  dispose() {
    this.cache.forEach(material => material.dispose());
    this.cache.clear();
  }

  getStats() {
    return {
      cachedMaterials: this.cache.size,
      maxMaterials: this.maxSize
    };
  }
}

export default MaterialCache;