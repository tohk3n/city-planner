// 3D building meshes placed on the terrain surface.
//
// Each placed building becomes a Group of extruded hex prisms (one per
// hitbox cell) raised above the terrain at that location. The extrude
// height is fixed per building — terrain depth determines the Y base.
//
// Unlike TerrainRenderer, buildings use a slight emissive glow so they
// pop visually against the terrain. The hex geometry is shared with
// terrain (same shape, same size), but building extrusion is always
// the same height regardless of terrain depth — they sit ON the ground
// rather than being the ground.

import * as THREE from 'three';
import { axialToPixel } from '../core/hex-math.js';

const BUILDING_HEIGHT = 15;  // extrude depth for building hexes
const BUILDING_LIFT = 2;     // gap between terrain surface and building base

export default class BuildingRenderer {
  constructor(scene, hexSize) {
    this.scene = scene;
    this.hexSize = hexSize;

    this.groups = new Map();  // placementId → THREE.Group
    this.offset = { x: 0, z: 0 };

    this._geo = null;         // single shared ExtrudeGeometry
    this._matCache = new Map(); // colorHex → MeshLambertMaterial
  }

  // Place a building into the 3D scene.
  //   id:        unique placement id (caller decides the scheme)
  //   hexes:     [{q, r}] hitbox cells in world coords
  //   color:     CSS color string
  //   getTerrainHeight: (q, r) → number (terrain Y at that hex)
  add(id, hexes, color, getTerrainHeight) {
    this.remove(id);

    const group = new THREE.Group();
    group.userData.buildingId = id;

    const colorHex = cssToHex(color);
    const mat = this._getMaterial(colorHex);
    const geo = this._getGeometry();

    for (const hex of hexes) {
      const px = axialToPixel(hex.q, hex.r, this.hexSize);
      const terrainY = getTerrainHeight(hex.q, hex.r);

      const mesh = new THREE.Mesh(geo, mat);
      // Extrude goes +Z in local space, rotate so it goes +Y
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        px.x - this.offset.x,
        terrainY + BUILDING_LIFT,
        px.y - this.offset.z,
      );
      mesh.userData.hex = { q: hex.q, r: hex.r };
      group.add(mesh);
    }

    this.scene.add(group);
    this.groups.set(id, group);
  }

  remove(id) {
    const group = this.groups.get(id);
    if (!group) return;
    this.scene.remove(group);
    // Materials are cached/shared, geometry is shared. Nothing to dispose.
    this.groups.delete(id);
  }

  // Recolor an existing building (e.g. selection highlight).
  recolor(id, color) {
    const group = this.groups.get(id);
    if (!group) return;
    const mat = this._getMaterial(cssToHex(color));
    for (const child of group.children) {
      if (child.isMesh) child.material = mat;
    }
  }

  // Move a building to new hex positions (reposition after drag).
  move(id, hexes, getTerrainHeight) {
    const group = this.groups.get(id);
    if (!group) return;

    const meshes = group.children.filter(c => c.isMesh);
    // If hex count changed, rebuild instead
    if (meshes.length !== hexes.length) {
      const color = meshes[0]?.material.color.getHex() || 0xffffff;
      this.add(id, hexes, `#${color.toString(16).padStart(6, '0')}`, getTerrainHeight);
      return;
    }

    for (let i = 0; i < hexes.length; i++) {
      const px = axialToPixel(hexes[i].q, hexes[i].r, this.hexSize);
      const terrainY = getTerrainHeight(hexes[i].q, hexes[i].r);
      meshes[i].position.set(
        px.x - this.offset.x,
        terrainY + BUILDING_LIFT,
        px.y - this.offset.z,
      );
      meshes[i].userData.hex = { q: hexes[i].q, r: hexes[i].r };
    }
  }

  has(id) { return this.groups.has(id); }

  setOffset(x, z) {
    this.offset.x = x;
    this.offset.z = z;
  }

  clear() {
    for (const [id] of this.groups) this.remove(id);
  }

  dispose() {
    this.clear();
    if (this._geo) { this._geo.dispose(); this._geo = null; }
    for (const mat of this._matCache.values()) mat.dispose();
    this._matCache.clear();
  }

  // -- Internals --

  _getGeometry() {
    if (this._geo) return this._geo;

    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = this.hexSize * Math.cos(angle);
      const py = this.hexSize * Math.sin(angle);
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();

    this._geo = new THREE.ExtrudeGeometry(shape, {
      depth: BUILDING_HEIGHT, bevelEnabled: false,
    });
    return this._geo;
  }

  _getMaterial(colorHex) {
    let mat = this._matCache.get(colorHex);
    if (mat) return mat;

    const base = new THREE.Color(colorHex);
    mat = new THREE.MeshLambertMaterial({
      color: base,
      emissive: base.clone().multiplyScalar(0.15),
    });
    this._matCache.set(colorHex, mat);
    return mat;
  }
}

function cssToHex(css) {
  if (!css) return 0xffffff;
  try { return new THREE.Color(css).getHex(); }
  catch { return 0xffffff; }
}