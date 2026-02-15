// Flat hex grid renderer using InstancedMesh.
// One InstancedMesh per unique color = one draw call per color.
// 10k hexes with 15 colors = 15 draw calls. That's nothing.
//
// Consumes HexGrid's change tracking: full rebuild or incremental
// dirty-hex updates. The grid mutates, we react.
//
// Hex geometry lives on the XZ plane at y=0. Terrain extrusion
// is TerrainRenderer's job -- this just does the flat painted grid.

import * as THREE from 'three';
import { axialToPixel, hexKey, parseHexKey } from '../core/hex-math.js';

const SQRT3 = Math.sqrt(3);

// How much to over-allocate InstancedMesh capacity.
// Growing is expensive (new mesh + copy), so we leave room.
const CAPACITY_PAD = 1.5;
const MIN_CAPACITY = 64;

export default class HexGridRenderer {
  constructor(scene, hexSize) {
    this.scene = scene;
    this.hexSize = hexSize;

    // Shared geometry for all flat hexes
    this._geometry = createFlatHexGeometry(hexSize);

    // color string â†’ ColorBatch
    this._batches = new Map();

    // hexKey â†’ { color, slot } so we know where each hex lives
    this._hexIndex = new Map();

    // World offset to center the grid at origin.
    // Set by rebuild() from grid bounds.
    this._offsetX = 0;
    this._offsetZ = 0;

    this._visible = true;
  }

  // -- Public API --

  // Full rebuild from grid state. Called on load, resize, reset.
  rebuild(grid) {
    this.clear();
    this._computeOffset(grid);

    // Group hexes by display color
    const colorGroups = new Map();
    grid.forEach(hex => {
      const color = hex.displayColor;
      if (!colorGroups.has(color)) colorGroups.set(color, []);
      colorGroups.get(color).push(hex);
    });

    // Create one InstancedMesh per color
    for (const [color, hexes] of colorGroups) {
      const batch = this._createBatch(color, hexes.length);
      for (const hex of hexes) {
        this._addToBatch(batch, hex.q, hex.r, color);
      }
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Incremental update from grid's dirty set.
  // Call this after grid.consumeChanges() gives you the dirty keys.
  applyChanges(grid, changes) {
    if (changes.fullRebuild) {
      this.rebuild(grid);
      return;
    }

    for (const key of changes.dirty) {
      const { q, r } = parseHexKey(key);
      const hex = grid.get(q, r);
      if (!hex) continue;

      const newColor = hex.displayColor;
      const existing = this._hexIndex.get(key);

      if (existing && existing.color === newColor) {
        // Color unchanged -- position can't change for a hex, so nothing to do.
        continue;
      }

      // Remove from old batch if it existed
      if (existing) {
        this._removeFromBatch(existing.color, key);
      }

      // Add to new batch
      const batch = this._getOrCreateBatch(newColor);
      this._addToBatch(batch, q, r, newColor);
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }

    // Clean up empty batches
    for (const [color, batch] of this._batches) {
      if (batch.count === 0) {
        this.scene.remove(batch.mesh);
        batch.mesh.dispose();
        this._batches.delete(color);
      }
    }
  }

  // Hide/show all batches without destroying them.
  // Used when switching to 3D terrain so the flat grid
  // doesn't z-fight with extruded meshes.
  setVisible(visible) {
    this._visible = visible;
    for (const batch of this._batches.values()) {
      batch.mesh.visible = visible;
    }
  }

  clear() {
    for (const batch of this._batches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this._batches.clear();
    this._hexIndex.clear();
  }

  dispose() {
    this.clear();
    this._geometry.dispose();
  }

  // -- Internals --

  _computeOffset(grid) {
    // Center the grid at world origin based on bounds.
    const b = grid.bounds;
    if (b.type === 'rect') {
      const minPx = axialToPixel(b.minQ, b.minR, this.hexSize);
      const maxPx = axialToPixel(b.maxQ, b.maxR, this.hexSize);
      this._offsetX = (minPx.x + maxPx.x) / 2;
      this._offsetZ = (minPx.y + maxPx.y) / 2;
    } else {
      // Hex bounds -- center is the center hex's pixel position
      const center = axialToPixel(b.cq || 0, b.cr || 0, this.hexSize);
      this._offsetX = center.x;
      this._offsetZ = center.y;
    }
  }

  _createBatch(color, expectedCount) {
    const capacity = Math.max(MIN_CAPACITY, Math.ceil(expectedCount * CAPACITY_PAD));
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.InstancedMesh(this._geometry, material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.visible = this._visible;

    this.scene.add(mesh);

    const batch = {
      mesh,
      material,
      capacity,
      count: 0,
      // Bidirectional index: slotâ†’hexKey
      keyToSlot: new Map(),
      slotToKey: new Map(),
    };

    this._batches.set(color, batch);
    return batch;
  }

  _getOrCreateBatch(color) {
    return this._batches.get(color) || this._createBatch(color, MIN_CAPACITY);
  }

  _addToBatch(batch, q, r, color) {
    const key = hexKey(q, r);

    // Grow if at capacity
    if (batch.count >= batch.capacity) {
      this._growBatch(batch, color);
    }

    const slot = batch.count;
    const matrix = this._makeMatrix(q, r);
    batch.mesh.setMatrixAt(slot, matrix);

    batch.keyToSlot.set(key, slot);
    batch.slotToKey.set(slot, key);
    batch.count++;

    this._hexIndex.set(key, { color, slot });
  }

  // Swap-with-last removal. Avoids gaps in the instance array
  // without shifting everything down.
  _removeFromBatch(color, key) {
    const batch = this._batches.get(color);
    if (!batch) return;

    const slot = batch.keyToSlot.get(key);
    if (slot === undefined) return;

    const lastSlot = batch.count - 1;

    if (slot !== lastSlot) {
      // Copy last instance's matrix into the vacated slot
      const tempMatrix = new THREE.Matrix4();
      batch.mesh.getMatrixAt(lastSlot, tempMatrix);
      batch.mesh.setMatrixAt(slot, tempMatrix);

      // Update the swapped hex's bookkeeping
      const swappedKey = batch.slotToKey.get(lastSlot);
      batch.keyToSlot.set(swappedKey, slot);
      batch.slotToKey.set(slot, swappedKey);

      // Update the global index for the swapped hex
      const swappedEntry = this._hexIndex.get(swappedKey);
      if (swappedEntry) swappedEntry.slot = slot;
    }

    batch.keyToSlot.delete(key);
    batch.slotToKey.delete(lastSlot);
    batch.count--;
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;

    this._hexIndex.delete(key);
  }

  // Replace the InstancedMesh with a larger one, copying existing matrices.
  _growBatch(batch, color) {
    const newCapacity = Math.ceil(batch.capacity * CAPACITY_PAD);
    const newMesh = new THREE.InstancedMesh(this._geometry, batch.material, newCapacity);
    newMesh.frustumCulled = false;
    newMesh.visible = this._visible;

    // Copy existing instance matrices
    const tempMatrix = new THREE.Matrix4();
    for (let i = 0; i < batch.count; i++) {
      batch.mesh.getMatrixAt(i, tempMatrix);
      newMesh.setMatrixAt(i, tempMatrix);
    }
    newMesh.count = batch.count;
    newMesh.instanceMatrix.needsUpdate = true;

    // Swap in scene
    this.scene.remove(batch.mesh);
    batch.mesh.dispose();
    this.scene.add(newMesh);

    batch.mesh = newMesh;
    batch.capacity = newCapacity;
  }

  _makeMatrix(q, r) {
    const px = axialToPixel(q, r, this.hexSize);
    const matrix = new THREE.Matrix4();
    matrix.setPosition(px.x - this._offsetX, 0, px.y - this._offsetZ);
    return matrix;
  }
}

// Flat pointy-top hex on the XZ plane. Vertices at y=0.
// Uses BufferGeometry directly -- no Shape/Extrude overhead.
function createFlatHexGeometry(size) {
  // 96% of full size so gaps between adjacent hexes make the grid visible
  const inset = size * 0.96;
  const vertices = [];
  const indices = [];

  // Center vertex
  vertices.push(0, 0, 0);

  // 6 outer vertices (pointy-top)
  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * (Math.PI / 180);
    vertices.push(
      inset * Math.cos(angle), // x
      0,                        // y (flat)
      inset * Math.sin(angle)   // z
    );
  }

  // 6 triangles: center â†’ vertex[i] â†’ vertex[i+1]
  for (let i = 1; i <= 6; i++) {
    indices.push(0, i < 6 ? i + 1 : 1, i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}