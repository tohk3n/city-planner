// Application orchestrator. Creates all the modules, wires them together,
// and exposes a flat action API for UI event handlers.
//
// The old architecture had AppState as a god-object with DOM refs, render
// calls, and business logic scattered across ui.js, painting.js, state.js.
// This replaces that: modules own their data, app.js owns the wiring.
//
// UI code calls app.paint(), app.terraform(), app.placeBuilding(), etc.
// It never reaches into module internals or mutates state directly.

import * as THREE from 'three';
import {
  axialToPixel, getHexesInRadius, getNeighbors,
  getHexVertices, getDirectionIndex, getExternalVertices, sortVerticesByAngle,
} from '../core/hex-math.js';
import { HexGrid, rectBounds } from '../core/grid.js';
import TileSystem, { isSpacerHex } from '../core/tile-system.js';
import BuildingCatalog from '../core/building-catalog.js';
import SceneManager from '../rendering/SceneManager.js';
import HexGridRenderer from '../rendering/HexGridRenderer.js';
import InteractionManager from '../rendering/InteractionManager.js';
import CameraController from '../rendering/CameraController.js';
import TerrainRenderer from '../rendering/TerrainRenderer.js';
import BuildingRenderer from '../rendering/BuildingRenderer.js';
import LabelRenderer from '../rendering/LabelRenderer.js';
import HoverPreviewRenderer from '../rendering/HoverPreviewRenderer.js';

const DEFAULT_HEX_COLOR = '#2a2838';
const DEFAULT_DEPTH = 25;
const HEX_SIZE = 20;

export default class App {
  constructor() {
    // Core data
    this.grid = null; // HexGrid, created in init() after bounds are set
    this.tiles = new TileSystem();
    this.catalog = new BuildingCatalog();
    this.buildings = new Map(); // placementId → { catalogId, q, r, rotation, color, hexes }

    // Grid bounds (user-configurable)
    this.bounds = { minQ: -50, maxQ: 49, minR: -50, maxR: 49 };

    // UI mode state
    this.mode = 'paint';           // 'paint' | 'terraform' | 'stamp'
    this.currentColor = 'red';
    this.brushSize = 1;
    this.selectedStampId = null;
    this.stampRotation = 0;
    this.selectedTileKeys = new Set();
    this.selectedBuildingId = null;
    this.show3D = false;
    this.heightMapMode = false;
    this.showBoundaries = false;

    // Renderers (initialized in init())
    this.scene = null;
    this.hexGrid = null;
    this.interaction = null;
    this.camera = null;
    this.terrain = null;
    this.buildingRenderer = null;
    this.labels = null;
    this.hoverPreview = null;

    this._nextBuildingId = 1;
    this._callbacks = {};
    this._boundaryGroup = null;
    this._depthOverlay = null;    // InstancedMesh for 2D depth heatmap
    this._depthOverlayGeo = null; // full-size hex (not 96% inset) to fill gaps
  }

  // --- Lifecycle ---

  init(container, buildingJson) {
    // Load building data
    this.catalog.load(buildingJson);

    // Generate grid + tiles
    this.grid = new HexGrid(rectBounds(this.bounds.minQ, this.bounds.maxQ, this.bounds.minR, this.bounds.maxR));
    this.tiles.generate(this.bounds);
    this._markSpacers();

    // Scene + renderers
    this.scene = new SceneManager(container);
    this.hexGrid = new HexGridRenderer(this.scene.scene, HEX_SIZE);
    this.terrain = new TerrainRenderer(this.scene.scene, HEX_SIZE);
    this.buildingRenderer = new BuildingRenderer(this.scene.scene, HEX_SIZE);
    this.labels = new LabelRenderer(this.scene.scene, HEX_SIZE);
    this.hoverPreview = new HoverPreviewRenderer(this.scene.scene, HEX_SIZE);

    // Center offset so (0,0) is screen center
    const centerPx = this._computeCenterOffset();
    this.terrain.setOffset(centerPx.x, centerPx.z);
    this.buildingRenderer.setOffset(centerPx.x, centerPx.z);
    this.labels.setOffset(centerPx.x, centerPx.z);
    this.hoverPreview.setOffset(centerPx.x, centerPx.z);
    this.labels.setTerrainHeightFn((q, r) => this._terrainHeight(q, r));

    // Input — InteractionManager reads renderer.domElement from sceneManager
    this.interaction = new InteractionManager(this.scene, HEX_SIZE);
    this.camera = new CameraController(this.scene);

    // Wire interaction callbacks (names match InteractionManager's API)
    this.interaction.onHexDown = (q, r, e) => this._onHexClick(q, r, e);
    this.interaction.onHexDrag = (q, r, e) => this._onHexDrag(q, r, e);
    this.interaction.onHexMove = (q, r) => this._onHexHover(q, r);
    this.interaction.onDoubleClick = (q, r) => this._onDoubleClick(q, r);
    this.interaction.onLeave = () => this.hoverPreview.clear();

    // Initial full render via HexGrid's dirty tracking
    this.hexGrid.rebuild(this.grid);
    this._zoomToFit();

    return this;
  }

  // --- Grid Size (user-configurable) ---

  resizeGrid(minQ, maxQ, minR, maxR) {
    this.bounds = { minQ, maxQ, minR, maxR };
    this.grid.setBounds(rectBounds(minQ, maxQ, minR, maxR));
    this.tiles.generate(this.bounds);
    this._markSpacers();

    const centerPx = this._computeCenterOffset();
    this.terrain.setOffset(centerPx.x, centerPx.z);
    this.buildingRenderer.setOffset(centerPx.x, centerPx.z);
    this.labels.setOffset(centerPx.x, centerPx.z);
    this.hoverPreview.setOffset(centerPx.x, centerPx.z);
    this.labels.refreshPositions();

    this.hexGrid.rebuild(this.grid);

    // Fit the camera to the new grid extents
    this._zoomToFit();

    // Only rebuild 3D stuff if we're in 3D
    if (this.show3D) {
      this._rebuildTerrain();
      this._rebuildBuildings();
    }

    if (this.showBoundaries) {
      this._clearBoundaryLines();
      this._buildBoundaryLines();
    }
    if (this.heightMapMode && !this.show3D) this._refreshDepthOverlay();

    this._emit('gridResize', this.bounds);
  }

  // Convenience: set by radius (hex-shaped grid centered at origin)
  resizeGridByRadius(radius) {
    this.resizeGrid(-radius, radius, -radius, radius);
  }

  // Convenience: set by rectangular dimensions
  resizeGridRect(width, height) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    this.resizeGrid(-halfW, halfW, -halfH, halfH);
  }

  getGridStats() {
    return {
      bounds: { ...this.bounds },
      hexCount: this.grid.hexCount,
      tileCount: this.tiles.tiles.size,
      buildingCount: this.buildings.size,
    };
  }

  // --- Paint ---

  paint(q, r) {
    if (!this._inBounds(q, r)) return;
    const hexes = this.brushSize <= 1
      ? [{ q, r }]
      : getHexesInRadius(q, r, this.brushSize - 1);

    for (const hex of hexes) {
      if (!this._inBounds(hex.q, hex.r)) continue;
      const color = this.currentColor === 'eraser' ? DEFAULT_HEX_COLOR : this.currentColor;
      this.grid.setColor(hex.q, hex.r, color);
    }

    this._flushGridChanges();
  }

  // --- Terraform ---

  selectTile(q, r, addToSelection = false) {
    const tile = this.tiles.getTileAt(q, r);
    if (!tile) return;

    const key = `${tile.n},${tile.m}`;

    if (!addToSelection) {
      this.selectedTileKeys.clear();
    }

    if (this.selectedTileKeys.has(key)) {
      this.selectedTileKeys.delete(key);
    } else {
      this.selectedTileKeys.add(key);
    }

    this._emit('tileSelectionChange', this.selectedTileKeys);
  }

  setDepth(depth) {
    const clamped = Math.max(0, Math.min(100, depth));
    for (const key of this.selectedTileKeys) {
      const tile = this.tiles.tiles.get(key);
      if (!tile) continue;
      tile.depth = clamped;
      this.terrain.updateTile(tile, (q, r) => this._getColor(q, r), this.heightMapMode, this.tiles);
    }
    this.labels.refreshPositions();
    if (this.heightMapMode) this._refreshDepthOverlay();
    this._emit('depthChange', clamped);
  }

  setBaselineDepth(depth) {
    const clamped = Math.max(0, Math.min(100, depth));
    for (const tile of this.tiles.tiles.values()) {
      tile.depth = clamped;
    }
    this._rebuildTerrain();
    this.labels.refreshPositions();
    if (this.heightMapMode) this._refreshDepthOverlay();
  }

  // --- Buildings ---

  placeBuilding(q, r) {
    if (!this.selectedStampId) return null;

    const hitbox = this.catalog.getRotatedHitbox(this.selectedStampId, this.stampRotation);
    const worldHexes = hitbox.map(h => ({ q: q + h.q, r: r + h.r }));

    // Collision check
    for (const hex of worldHexes) {
      if (!this._inBounds(hex.q, hex.r)) return null;
      const existing = this.grid.get(hex.q, hex.r);
      if (existing?.buildingId) return null;
    }

    const id = `bld_${this._nextBuildingId++}`;
    const building = this.catalog.get(this.selectedStampId);
    const color = this._buildingColor(building);

    // Register in grid
    for (const hex of worldHexes) {
      this.grid.assignBuilding(hex.q, hex.r, id);
    }

    const placement = {
      id,
      catalogId: this.selectedStampId,
      q, r,
      rotation: this.stampRotation,
      color,
      hexes: worldHexes,
    };
    this.buildings.set(id, placement);

    // Render
    this.buildingRenderer.add(id, worldHexes, color, (hq, hr) => this._terrainHeight(hq, hr));
    this._flushGridChanges();

    this._emit('buildingPlaced', placement);
    return placement;
  }

  removeBuilding(id) {
    const placement = this.buildings.get(id);
    if (!placement) return;

    // Clear grid ownership
    for (const hex of placement.hexes) {
      this.grid.clearBuilding(hex.q, hex.r);
    }

    this.buildings.delete(id);
    this.buildingRenderer.remove(id);

    // Grid changes from clearBuilding flow through dirty tracking
    this._flushGridChanges();

    this._emit('buildingRemoved', id);
  }

  findBuildingAt(q, r) {
    const hex = this.grid.get(q, r);
    return hex?.buildingId ? this.buildings.get(hex.buildingId) : null;
  }

  rotateStamp(direction = 1) {
    this.stampRotation = ((this.stampRotation + direction) % 6 + 6) % 6;
    this._emit('stampRotationChange', this.stampRotation);
  }

  // --- Labels ---

  setLabel(q, r, text) {
    this.labels.set(q, r, text);
    this.grid.setText(q, r, text || '');
  }

  // --- View toggles ---

  toggle3D(on) {
    this.show3D = on;
    this.hexGrid.setVisible(!on); // hide flat grid in 3D, show in 2D
    if (this._depthOverlay) this._depthOverlay.visible = !on;
    if (on) {
      this.scene.setMode('perspective');
      this._rebuildTerrain();
      this._rebuildBuildings();
    } else {
      this.scene.setMode('ortho');
      this.terrain.clear();
      this.buildingRenderer.clear();
    }
    this._emit('viewModeChange', on);
  }

  toggleHeightMap(on) {
    this.heightMapMode = on;

    // 3D mode: recolor the extruded terrain meshes
    if (this.terrain.tileGroups.size > 0) {
      this.terrain.recolor(this.tiles, (q, r) => this._getColor(q, r), on);
    }

    // 2D only: depth overlay sits at y=-0.1, would clip through 3D terrain
    this._clearDepthOverlay();
    if (on && !this.show3D) this._buildDepthOverlay();

    this._emit('heightMapChange', on);
  }

  toggleBoundaries(on) {
    this.showBoundaries = on;
    this._clearBoundaryLines();
    if (on) this._buildBoundaryLines();
    this._emit('boundariesChange', on);
  }

  // --- Event system (for UI to listen to state changes) ---

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }

  _emit(event, data) {
    const cbs = this._callbacks[event];
    if (cbs) cbs.forEach(fn => fn(data));
  }

  // --- Internals ---

  _onHexClick(q, r, e) {
    if (this.mode === 'terraform') {
      this.selectTile(q, r, e.ctrlKey || e.metaKey);
    } else if (this.mode === 'stamp') {
      this.placeBuilding(q, r);
    } else {
      // Shift-click selects building
      if (e.shiftKey) {
        const b = this.findBuildingAt(q, r);
        if (b) {
          this.selectedBuildingId = b.id;
          this._emit('buildingSelected', b);
          return;
        }
      }
      this.paint(q, r);
    }
  }

  _onHexDrag(q, r, e) {
    if (this.mode === 'paint') this.paint(q, r);
  }

  _onHexHover(q, r) {
    this._emit('hexHover', { q, r });
    this._updatePreview(q, r);
  }

  // Show what will happen if you click here.
  // Paint mode: colored footprint matching brush size.
  // Stamp mode: building shape at current rotation.
  // Terraform: no preview (tile selection is click-based).
  _updatePreview(q, r) {
    if (this.mode === 'terraform') {
      this.hoverPreview.clear();
      return;
    }

    if (this.mode === 'stamp' && this.selectedStampId) {
      const hitbox = this.catalog.getRotatedHitbox(this.selectedStampId, this.stampRotation);
      const building = this.catalog.get(this.selectedStampId);
      this.hoverPreview.updateStamp(q, r, hitbox, this._buildingColor(building));
      return;
    }

    // Paint mode (including eraser)
    const color = this.currentColor === 'eraser' ? DEFAULT_HEX_COLOR : this.currentColor;
    this.hoverPreview.update(q, r, color, this.brushSize);
  }

  _onDoubleClick(q, r) {
    this._emit('doubleClick', { q, r });
  }

  _inBounds(q, r) {
    return this.grid.inBounds(q, r);
  }

  _getColor(q, r) {
    const hex = this.grid.get(q, r);
    return hex ? hex.displayColor : DEFAULT_HEX_COLOR;
  }

  _terrainHeight(q, r) {
    const tile = this.tiles.getTileForHex(q, r);
    if (!tile) return 0;
    return (tile.depth - DEFAULT_DEPTH) * 8; // HEIGHT_SCALE
  }

  _buildingColor(building) {
    // Category-based color scheme matching old planner conventions
    const colors = {
      Crafting: 'orange',
      Storage: '#8888ff',
      Housing: 'green',
      Trade: 'cyan',
      Structure: '#888888',
      Empire: 'magenta',
      World: '#aa6633',
    };
    return colors[building.category] || 'white';
  }

  _computeCenterOffset() {
    // Center of the bounding box in pixel space
    const minPx = axialToPixel(this.bounds.minQ, this.bounds.minR, HEX_SIZE);
    const maxPx = axialToPixel(this.bounds.maxQ, this.bounds.maxR, HEX_SIZE);
    return {
      x: (minPx.x + maxPx.x) / 2,
      z: (minPx.y + maxPx.y) / 2,
    };
  }

  // Fit the ortho camera so the whole grid fills the viewport with some breathing room.
  // Perspective mode can do its own thing later.
  _zoomToFit() {
    if (this.scene.mode !== 'ortho') return;

    const minPx = axialToPixel(this.bounds.minQ, this.bounds.minR, HEX_SIZE);
    const maxPx = axialToPixel(this.bounds.maxQ, this.bounds.maxR, HEX_SIZE);
    const worldW = Math.abs(maxPx.x - minPx.x);
    const worldH = Math.abs(maxPx.y - minPx.y);
    const extent = Math.max(worldW, worldH);

    if (extent <= 0) return;

    // ORTHO_BASE_EXTENT (2000) is the half-height at zoom=1.
    // We want the grid to fill ~85% of the viewport (15% padding).
    const zoom = (2000 * 2 * 0.85) / extent;
    this.scene.setOrthoZoom(zoom);

    // Recenter the camera on the grid origin
    this.scene._ortho.position.x = 0;
    this.scene._ortho.position.z = 0;
  }

  // Drain the grid's dirty set into the hex renderer.
  // Single bottleneck between data mutation and visual update.
  _flushGridChanges() {
    if (!this.grid.hasChanges) return;
    const changes = this.grid.consumeChanges();
    this.hexGrid.applyChanges(this.grid, changes);
  }

  // Flag spacer-cluster hexes so the renderer gives them a darker shade.
  // This reveals the triangular lattice pattern that defines Bitcraft's
  // coordinate system -- 7-hex tile clusters separated by spacer gaps.
  _markSpacers() {
    this.grid.forEach(hex => {
      hex.spacer = isSpacerHex(hex.q, hex.r);
    });
  }

  _rebuildTerrain() {
    this.terrain.rebuild(this.tiles, (q, r) => this._getColor(q, r), this.heightMapMode);
  }

  _rebuildBuildings() {
    this.buildingRenderer.clear();
    for (const [id, placement] of this.buildings) {
      this.buildingRenderer.add(
        id, placement.hexes, placement.color,
        (q, r) => this._terrainHeight(q, r),
      );
    }
  }

  // Tile boundary visualization — dashed outlines around each 7-hex cluster.
  // Lives on the XZ plane at y=0.5 (just above the flat hex grid).

  _buildBoundaryLines() {
    const group = new THREE.Group();
    group.name = 'tileBoundaries';

    const mat = new THREE.LineBasicMaterial({
      color: 0x00ffff, opacity: 0.35, transparent: true,
    });

    const centerPx = this._computeCenterOffset();

    for (const tile of this.tiles.tiles.values()) {
      const points = this._tileBoundaryPoints(tile, centerPx);
      if (points.length < 3) continue;

      points.push(points[0].clone()); // close the loop
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geo, mat));
    }

    this.scene.scene.add(group);
    this._boundaryGroup = group;
  }

  _clearBoundaryLines() {
    if (!this._boundaryGroup) return;
    this.scene.scene.remove(this._boundaryGroup);
    // Dispose line geometries
    for (const child of this._boundaryGroup.children) {
      if (child.geometry) child.geometry.dispose();
    }
    if (this._boundaryGroup.children[0]?.material) {
      this._boundaryGroup.children[0].material.dispose();
    }
    this._boundaryGroup = null;
  }

  // Compute the outer boundary vertices of a 7-hex cluster.
  // For each neighbor hex, the vertices on the cluster edge are the
  // hex vertices that face OUTWARD (away from the cluster center).
  _tileBoundaryPoints(tile, centerPx) {
    const center = { q: tile.q, r: tile.r };
    const cPx = axialToPixel(center.q, center.r, HEX_SIZE);
    const allVerts = [];

    for (const nb of getNeighbors(center.q, center.r)) {
      const dir = getDirectionIndex(center.q, center.r, nb.q, nb.r);
      if (dir < 0) continue;

      const nbPx = axialToPixel(nb.q, nb.r, HEX_SIZE);
      const verts = getHexVertices(nbPx.x, nbPx.y, HEX_SIZE);
      const external = getExternalVertices(dir, verts);
      allVerts.push(...external);
    }

    const sorted = sortVerticesByAngle(allVerts, { x: cPx.x, y: cPx.y });
    return sorted.map(v =>
      new THREE.Vector3(v.x - centerPx.x, 0.5, v.y - centerPx.z)
    );
  }

  // --- Depth overlay (2D height map) ---
  // Full-size hex meshes at y=-0.1, colored by tile depth.
  // The 96%-inset painted hexes sit on top at y=0, so the 4% gap
  // reveals these depth-colored hexes as gradient "borders".
  // Single InstancedMesh with per-instance colors = 1 draw call.

  _buildDepthOverlay() {
    this._clearDepthOverlay();

    const geo = this._getDepthOverlayGeo();
    const count = this.grid.hexCount;
    if (count === 0) return;

    // White base color so instance colors pass through unmodified
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;

    const centerPx = this._computeCenterOffset();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let idx = 0;

    this.grid.forEach(hex => {
      const px = axialToPixel(hex.q, hex.r, HEX_SIZE);
      matrix.identity();
      matrix.setPosition(px.x - centerPx.x, -0.1, px.y - centerPx.z);
      mesh.setMatrixAt(idx, matrix);

      // Color by depth — tile hexes use their tile's depth,
      // spacer hexes resolve from their 3 neighboring tiles
      const depth = this.tiles.getDepthAt(hex.q, hex.r);
      color.set(depthToColor(depth));
      mesh.setColorAt(idx, color);

      idx++;
    });

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.scene.scene.add(mesh);
    this._depthOverlay = mesh;
  }

  _clearDepthOverlay() {
    if (!this._depthOverlay) return;
    this.scene.scene.remove(this._depthOverlay);
    this._depthOverlay.dispose();
    this._depthOverlay = null;
  }

  _refreshDepthOverlay() {
    if (this.show3D) return; // 2D-only feature
    this._buildDepthOverlay();
  }

  _getDepthOverlayGeo() {
    if (this._depthOverlayGeo) return this._depthOverlayGeo;

    // Full-size hex (NOT the 96% inset) so it fills the gap between painted hexes
    const verts = [];
    const indices = [];
    verts.push(0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const angle = (60 * i - 30) * (Math.PI / 180);
      verts.push(HEX_SIZE * Math.cos(angle), 0, HEX_SIZE * Math.sin(angle));
    }
    for (let i = 1; i <= 6; i++) {
      indices.push(0, i < 6 ? i + 1 : 1, i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this._depthOverlayGeo = geo;
    return geo;
  }

}

// --- Depth color gradient ---
// Maps tile depth (0-100) to a color. Sea level = 25.
// Matches the in-game terraform color convention.

const DEPTH_GRADIENT = [
  { stop: 0,   color: new THREE.Color(0x003366) }, // deep ocean
  { stop: 15,  color: new THREE.Color(0x0066cc) }, // water
  { stop: 23,  color: new THREE.Color(0x0099ff) }, // shallow
  { stop: 25,  color: new THREE.Color(0x44aa44) }, // sea level (green)
  { stop: 30,  color: new THREE.Color(0x66cc44) }, // low land
  { stop: 45,  color: new THREE.Color(0xcccc00) }, // mid
  { stop: 60,  color: new THREE.Color(0xff9900) }, // high
  { stop: 80,  color: new THREE.Color(0xff3300) }, // mountain
  { stop: 100, color: new THREE.Color(0xcc0000) }, // peak
];

const _lerpColor = new THREE.Color();

function depthToColor(depth) {
  const d = Math.max(0, Math.min(100, depth));

  // Find the two gradient stops we're between
  for (let i = 0; i < DEPTH_GRADIENT.length - 1; i++) {
    const lo = DEPTH_GRADIENT[i];
    const hi = DEPTH_GRADIENT[i + 1];
    if (d >= lo.stop && d <= hi.stop) {
      const t = (d - lo.stop) / (hi.stop - lo.stop);
      _lerpColor.copy(lo.color).lerp(hi.color, t);
      return _lerpColor.getHex();
    }
  }
  return DEPTH_GRADIENT[DEPTH_GRADIENT.length - 1].color.getHex();
}