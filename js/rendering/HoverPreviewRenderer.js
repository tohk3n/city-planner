// Hover preview overlay for paint brush and building stamps.
// Renders translucent hex footprints that follow the mouse,
// showing exactly what will be affected before you click.
//
// Separate from HexGridRenderer on purpose -- preview is transient
// visual feedback that updates every mousemove. The painted grid is
// committed state that updates on click. Different lifecycles,
// different materials, different update cadences.
//
// Fill layer: pre-allocated InstancedMesh, just update matrices + count.
// Edge layer: single LineSegments with a pre-allocated position buffer.
//   We write hex outline vertices directly -- no EdgesGeometry, no
//   instancing weirdness. 256 hexes × 6 edges × 2 verts = 3072 verts max,
//   which is nothing.

import * as THREE from 'three';
import { axialToPixel, getHexesInRadius } from '../core/hex-math.js';

// Max hexes we'd ever preview. Brush radius 6 = 127 hexes.
// Buildings top out around 30-40 hexes. 256 covers both with room.
const MAX_INSTANCES = 256;

// Each hex outline = 6 line segments = 12 vertices (pairs)
const VERTS_PER_HEX = 12;
const MAX_EDGE_VERTS = MAX_INSTANCES * VERTS_PER_HEX;

export default class HoverPreviewRenderer {
  constructor(scene, hexSize) {
    this.scene = scene;
    this.hexSize = hexSize;

    this._offsetX = 0;
    this._offsetZ = 0;

    // --- Fill layer: translucent hex faces ---
    this._geo = createPreviewHexGeometry(hexSize);
    this._fillMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._fillMesh = new THREE.InstancedMesh(this._geo, this._fillMat, MAX_INSTANCES);
    this._fillMesh.count = 0;
    this._fillMesh.frustumCulled = false;
    this._fillMesh.renderOrder = 10;

    // --- Edge layer: hex outlines as line segments ---
    // Pre-compute the 6 edge vertex offsets for a single hex (XZ plane).
    // These get translated per-hex in _setInstances.
    this._hexEdgeOffsets = computeHexEdgeOffsets(hexSize * 0.96);

    this._edgePositions = new Float32Array(MAX_EDGE_VERTS * 3);
    this._edgeGeo = new THREE.BufferGeometry();
    this._edgeGeo.setAttribute('position',
      new THREE.BufferAttribute(this._edgePositions, 3));
    // drawRange limits what actually renders without reallocating
    this._edgeGeo.setDrawRange(0, 0);

    this._edgeMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this._edgeMesh = new THREE.LineSegments(this._edgeGeo, this._edgeMat);
    this._edgeMesh.frustumCulled = false;
    this._edgeMesh.renderOrder = 11;

    scene.add(this._fillMesh);
    scene.add(this._edgeMesh);

    // Reusable to avoid per-frame allocation
    this._mat4 = new THREE.Matrix4();
    this._color = new THREE.Color();
  }

  // Must match HexGridRenderer's offset so hexes align
  setOffset(x, z) {
    this._offsetX = x;
    this._offsetZ = z;
  }

  // Paint brush preview: colored footprint matching brush size
  update(q, r, color, brushSize) {
    const radius = Math.max(0, brushSize - 1);
    const hexes = getHexesInRadius(q, r, radius);
    this._setInstances(hexes, color);
  }

  // Building stamp preview: exact footprint at current rotation
  updateStamp(q, r, relativeCoords, color) {
    const worldHexes = relativeCoords.map(c => ({ q: q + c.q, r: r + c.r }));
    this._setInstances(worldHexes, color);
  }

  clear() {
    this._fillMesh.count = 0;
    this._fillMesh.instanceMatrix.needsUpdate = true;
    this._edgeGeo.setDrawRange(0, 0);
  }

  setVisible(visible) {
    this._fillMesh.visible = visible;
    this._edgeMesh.visible = visible;
  }

  dispose() {
    this.scene.remove(this._fillMesh);
    this.scene.remove(this._edgeMesh);
    this._fillMesh.dispose();
    this._edgeMesh.dispose();
    this._geo.dispose();
    this._edgeGeo.dispose();
    this._fillMat.dispose();
    this._edgeMat.dispose();
  }

  // --- Internals ---

  _setInstances(hexes, color) {
    const count = Math.min(hexes.length, MAX_INSTANCES);

    // Update colors -- fill gets the paint color, edge gets a brighter version
    this._color.set(color);
    this._fillMat.color.copy(this._color);
    this._fillMat.needsUpdate = true;

    const hsl = {};
    this._color.getHSL(hsl);
    this._edgeMat.color.setHSL(
      hsl.h,
      Math.min(1, hsl.s * 1.3),
      Math.min(0.9, hsl.l + 0.25),
    );
    this._edgeMat.needsUpdate = true;

    const offsets = this._hexEdgeOffsets;
    const pos = this._edgePositions;
    let vi = 0; // vertex write index into the Float32Array

    for (let i = 0; i < count; i++) {
      const px = axialToPixel(hexes[i].q, hexes[i].r, this.hexSize);
      const wx = px.x - this._offsetX;
      const wz = px.y - this._offsetZ;
      const wy = 0.2; // slightly above the painted grid

      // Fill: set instance matrix
      this._mat4.identity();
      this._mat4.setPosition(wx, wy, wz);
      this._fillMesh.setMatrixAt(i, this._mat4);

      // Edge: write 6 line segments (12 vertices) for this hex
      for (let e = 0; e < 12; e++) {
        pos[vi++] = wx + offsets[e * 3];
        pos[vi++] = wy + offsets[e * 3 + 1];
        pos[vi++] = wz + offsets[e * 3 + 2];
      }
    }

    this._fillMesh.count = count;
    this._fillMesh.instanceMatrix.needsUpdate = true;

    this._edgeGeo.setDrawRange(0, count * VERTS_PER_HEX);
    this._edgeGeo.attributes.position.needsUpdate = true;
  }
}

// Pre-compute the 12 vertices (6 line segments) for a hex outline.
// Returns a flat Float32Array: [x0,y0,z0, x1,y1,z1, ...] for each segment.
// Pointy-top hex on the XZ plane (y=0).
function computeHexEdgeOffsets(insetSize) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * (Math.PI / 180);
    corners.push(
      insetSize * Math.cos(angle),
      0,
      insetSize * Math.sin(angle),
    );
  }

  // 6 edges: corner[i] → corner[(i+1)%6], each as 2 vertices
  const offsets = new Float32Array(12 * 3);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const base = i * 6; // 2 verts × 3 components
    offsets[base]     = corners[i * 3];
    offsets[base + 1] = corners[i * 3 + 1];
    offsets[base + 2] = corners[i * 3 + 2];
    offsets[base + 3] = corners[next * 3];
    offsets[base + 4] = corners[next * 3 + 1];
    offsets[base + 5] = corners[next * 3 + 2];
  }

  return offsets;
}

// 96% inset pointy-top hex on XZ plane. Same shape as the grid renderer.
function createPreviewHexGeometry(size) {
  const inset = size * 0.96;
  const verts = [0, 0, 0];
  const indices = [];

  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * (Math.PI / 180);
    verts.push(inset * Math.cos(angle), 0, inset * Math.sin(angle));
  }
  for (let i = 1; i <= 6; i++) {
    indices.push(0, i < 6 ? i + 1 : 1, i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}