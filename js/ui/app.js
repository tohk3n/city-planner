// Application orchestrator. Creates all the modules, wires them together,
// and exposes a flat action API for UI event handlers.
//
// The old architecture had AppState as a god-object with DOM refs, render
// calls, and business logic scattered across ui.js, painting.js, state.js.
// This replaces that: modules own their data, app.js owns the wiring.
//
// UI code calls app.paint(), app.terraform(), app.placeBuilding(), etc.
// It never reaches into module internals or mutates state directly.

import { axialToPixel, getHexesInRadius } from '../core/hex-math.js';
import { HexGrid, rectBounds } from '../core/grid.js';
import TileSystem from '../core/tile-system.js';
import BuildingCatalog from '../core/building-catalog.js';
import SceneManager from '../rendering/SceneManager.js';
import HexGridRenderer from '../rendering/HexGridRenderer.js';
import InteractionManager from '../rendering/InteractionManager.js';
import CameraController from '../rendering/CameraController.js';
import TerrainRenderer from '../rendering/TerrainRenderer.js';
import BuildingRenderer from '../rendering/BuildingRenderer.js';
import LabelRenderer from '../rendering/LabelRenderer.js';

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

    this._nextBuildingId = 1;
    this._callbacks = {};
  }

  // --- Lifecycle ---

  init(container, buildingJson) {
    // Load building data
    this.catalog.load(buildingJson);

    // Generate grid + tiles
    this.grid = new HexGrid(rectBounds(this.bounds.minQ, this.bounds.maxQ, this.bounds.minR, this.bounds.maxR));
    this.tiles.generate(this.bounds);

    // Scene + renderers
    this.scene = new SceneManager(container);
    this.hexGrid = new HexGridRenderer(this.scene.scene, HEX_SIZE);
    this.terrain = new TerrainRenderer(this.scene.scene, HEX_SIZE);
    this.buildingRenderer = new BuildingRenderer(this.scene.scene, HEX_SIZE);
    this.labels = new LabelRenderer(this.scene.scene, HEX_SIZE);

    // Center offset so (0,0) is screen center
    const centerPx = this._computeCenterOffset();
    this.terrain.setOffset(centerPx.x, centerPx.z);
    this.buildingRenderer.setOffset(centerPx.x, centerPx.z);
    this.labels.setOffset(centerPx.x, centerPx.z);
    this.labels.setTerrainHeightFn((q, r) => this._terrainHeight(q, r));

    // Input — InteractionManager reads renderer.domElement from sceneManager
    this.interaction = new InteractionManager(this.scene, HEX_SIZE);
    this.camera = new CameraController(this.scene);

    // Wire interaction callbacks (names match InteractionManager's API)
    this.interaction.onHexDown = (q, r, e) => this._onHexClick(q, r, e);
    this.interaction.onHexDrag = (q, r, e) => this._onHexDrag(q, r, e);
    this.interaction.onHexMove = (q, r) => this._onHexHover(q, r);
    this.interaction.onDoubleClick = (q, r) => this._onDoubleClick(q, r);

    // Initial full render via HexGrid's dirty tracking
    this.hexGrid.rebuild(this.grid);

    return this;
  }

  // --- Grid Size (user-configurable) ---

  resizeGrid(minQ, maxQ, minR, maxR) {
    this.bounds = { minQ, maxQ, minR, maxR };
    this.grid.setBounds(rectBounds(minQ, maxQ, minR, maxR));
    this.tiles.generate(this.bounds);

    const centerPx = this._computeCenterOffset();
    this.terrain.setOffset(centerPx.x, centerPx.z);
    this.buildingRenderer.setOffset(centerPx.x, centerPx.z);
    this.labels.setOffset(centerPx.x, centerPx.z);
    this.labels.refreshPositions();

    this.hexGrid.rebuild(this.grid);
    this._rebuildTerrain();
    this._rebuildBuildings();

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
      this.terrain.updateTile(tile, (q, r) => this._getColor(q, r), this.heightMapMode);
    }
    // Refresh labels and buildings sitting on these tiles
    this.labels.refreshPositions();
    this._emit('depthChange', clamped);
  }

  setBaselineDepth(depth) {
    const clamped = Math.max(0, Math.min(100, depth));
    for (const tile of this.tiles.tiles.values()) {
      tile.depth = clamped;
    }
    this._rebuildTerrain();
    this.labels.refreshPositions();
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
    if (on) {
      this.scene.setMode('perspective');
      this._rebuildTerrain();
      this._rebuildBuildings();
    } else {
      this.scene.setMode('ortho');
      this.heightMapMode = false;
    }
    this._emit('viewModeChange', on);
  }

  toggleHeightMap(on) {
    this.heightMapMode = on;
    this.terrain.recolor(this.tiles, (q, r) => this._getColor(q, r), on);
    this._emit('heightMapChange', on);
  }

  toggleBoundaries(on) {
    this.showBoundaries = on;
    // Boundary visualization is a future enhancement.
    // TerrainRenderer could add wireframe outlines per tile.
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

  // Drain the grid's dirty set into the hex renderer.
  // Single bottleneck between data mutation and visual update.
  _flushGridChanges() {
    if (!this.grid.hasChanges) return;
    const changes = this.grid.consumeChanges();
    this.hexGrid.applyChanges(this.grid, changes);
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

}