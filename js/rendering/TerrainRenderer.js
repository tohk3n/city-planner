// 3D extruded terrain for the tile system.
//
// Each terraformable tile becomes a Group of 7 extruded hex prisms at
// uniform height, plus a boundary wireframe. Spacer clusters are not
// rendered — they're gaps in the terrain, visually matching the game.
//
// Geometry is cached by extrude depth. Materials cached by color hex.
// Both caches are owned here, not shared — TerrainRenderer is the only
// consumer of extruded geometry and lit materials.
//
// Uses MeshLambertMaterial (not Basic) because 3D terrain needs shading
// to read depth visually. The flat HexGridRenderer uses Basic because
// it's a top-down map where shading adds nothing.

import * as THREE from 'three';
import {
  axialToPixel, getNeighbors, getHexVertices,
  getDirectionIndex, getExternalVertices, sortVerticesByAngle,
} from '../core/hex-math.js';
import { tileKey } from '../core/tile-system.js';

const HEIGHT_SCALE = 8;
const BASELINE = -80;
const SEA_LEVEL_DEPTH = 25;
const DEFAULT_COLOR = 0x2a2838;

// Height map gradient (depth-normalized 0..1 → color)
const HEIGHT_COLORS = [
  [0.00, 0x0066cc],  // deep water
  [0.25, 0x0099ff],
  [0.40, 0x00ccff],
  [0.50, 0x66ff66],  // land
  [0.60, 0xffff00],
  [0.70, 0xff9900],
  [0.85, 0xff3300],  // peaks
  [1.00, 0xff3300],
];

export default class TerrainRenderer {
  constructor(scene, hexSize) {
    this.scene = scene;
    this.hexSize = hexSize;

    this.tileGroups = new Map(); // tileKey → THREE.Group
    this.offset = { x: 0, z: 0 }; // set by caller to match grid centering

    // Caches owned by this renderer
    this._geoCache = new Map();   // "depth" → ExtrudeGeometry
    this._matCache = new Map();   // colorHex → MeshLambertMaterial
    this._boundaryMat = new THREE.LineBasicMaterial({
      color: 0xffffff, opacity: 0.5, transparent: true,
    });
  }

  // Build terrain for all tiles in a TileSystem.
  // getColor(q, r) returns a CSS color string for a hex, or null for default.
  rebuild(tileSystem, getColor, heightMapMode = false) {
    this.clear();

    for (const tile of tileSystem.tiles.values()) {
      const group = this._buildTileGroup(tile, getColor, heightMapMode);
      this.scene.add(group);
      this.tileGroups.set(tileKey(tile.n, tile.m), group);
    }
  }

  // Rebuild a single tile after depth change.
  updateTile(tile, getColor, heightMapMode = false) {
    const key = tileKey(tile.n, tile.m);
    const old = this.tileGroups.get(key);
    if (old) {
      this.scene.remove(old);
      this._disposeGroup(old);
    }

    const group = this._buildTileGroup(tile, getColor, heightMapMode);
    this.scene.add(group);
    this.tileGroups.set(key, group);
  }

  // Fast recolor without rebuilding geometry (heightmap toggle).
  recolor(tileSystem, getColor, heightMapMode) {
    for (const [key, group] of this.tileGroups) {
      const tile = tileSystem.tiles.get(key);
      if (!tile) continue;

      const height = (tile.depth - SEA_LEVEL_DEPTH) * HEIGHT_SCALE;

      for (const child of group.children) {
        if (!child.isMesh || !child.userData.hex) continue;
        const { q, r } = child.userData.hex;
        const color = heightMapMode
          ? heightColor(height)
          : cssToHex(getColor(q, r));
        child.material = this._getMaterial(color);
      }
    }
  }

  setOffset(x, z) {
    this.offset.x = x;
    this.offset.z = z;
  }

  clear() {
    for (const group of this.tileGroups.values()) {
      this.scene.remove(group);
      this._disposeGroup(group);
    }
    this.tileGroups.clear();
  }

  dispose() {
    this.clear();
    for (const geo of this._geoCache.values()) geo.dispose();
    for (const mat of this._matCache.values()) mat.dispose();
    this._boundaryMat.dispose();
    this._geoCache.clear();
    this._matCache.clear();
  }

  // -- Internals --

  _buildTileGroup(tile, getColor, heightMapMode) {
    const group = new THREE.Group();
    group.userData.tile = { n: tile.n, m: tile.m };

    const depth = tile.depth;
    const height = (depth - SEA_LEVEL_DEPTH) * HEIGHT_SCALE;
    const extrude = Math.max(1, height - BASELINE);
    const geo = this._getGeometry(extrude);

    const hexes = [{ q: tile.q, r: tile.r }, ...getNeighbors(tile.q, tile.r)];

    for (const hex of hexes) {
      const px = axialToPixel(hex.q, hex.r, this.hexSize);
      const color = heightMapMode
        ? heightColor(height)
        : cssToHex(getColor(hex.q, hex.r));

      const mesh = new THREE.Mesh(geo, this._getMaterial(color));
      mesh.position.set(px.x - this.offset.x, BASELINE, px.y - this.offset.z);
      // ExtrudeGeometry extrudes along +Z; rotate so it goes along +Y
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.hex = { q: hex.q, r: hex.r };
      group.add(mesh);
    }

    // Boundary wireframe slightly above terrain surface
    const boundary = this._buildBoundary(tile, height + 2);
    if (boundary) group.add(boundary);

    return group;
  }

  _buildBoundary(tile, y) {
    const center = { q: tile.q, r: tile.r };
    const centerPx = axialToPixel(center.q, center.r, this.hexSize);
    const allVerts = [];

    for (const nb of getNeighbors(center.q, center.r)) {
      const dir = getDirectionIndex(center.q, center.r, nb.q, nb.r);
      if (dir < 0) continue;

      const nbPx = axialToPixel(nb.q, nb.r, this.hexSize);
      const verts = getHexVertices(nbPx.x, nbPx.y, this.hexSize);
      const external = getExternalVertices(dir, verts);
      allVerts.push(...external);
    }

    const sorted = sortVerticesByAngle(allVerts, { x: centerPx.x, y: centerPx.y });
    if (sorted.length < 3) return null;

    const points = sorted.map(v =>
      new THREE.Vector3(v.x - this.offset.x, y, v.y - this.offset.z)
    );
    points.push(points[0].clone()); // close loop

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geo, this._boundaryMat);
  }

  _getGeometry(extrudeDepth) {
    // Round to 0.5 to avoid unbounded cache growth from float jitter
    const key = Math.round(extrudeDepth * 2) / 2;
    let geo = this._geoCache.get(key);
    if (geo) return geo;

    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = this.hexSize * Math.cos(angle);
      const py = this.hexSize * Math.sin(angle);
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();

    geo = new THREE.ExtrudeGeometry(shape, { depth: key, bevelEnabled: false });
    this._geoCache.set(key, geo);
    return geo;
  }

  _getMaterial(colorHex) {
    let mat = this._matCache.get(colorHex);
    if (mat) return mat;

    mat = new THREE.MeshLambertMaterial({ color: colorHex });
    this._matCache.set(colorHex, mat);
    return mat;
  }

  _disposeGroup(group) {
    for (const child of group.children) {
      // Don't dispose cached geometries or materials.
      // Only dispose boundary line geometries (unique per tile).
      if (child.isLine && child.geometry) {
        child.geometry.dispose();
      }
    }
  }
}

function cssToHex(css) {
  if (!css) return DEFAULT_COLOR;
  try { return new THREE.Color(css).getHex(); }
  catch { return DEFAULT_COLOR; }
}

function heightColor(height) {
  const t = (height - BASELINE) / (-BASELINE + 75 * HEIGHT_SCALE);
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = HEIGHT_COLORS.length - 1; i >= 0; i--) {
    if (clamped >= HEIGHT_COLORS[i][0]) return HEIGHT_COLORS[i][1];
  }
  return HEIGHT_COLORS[0][1];
}