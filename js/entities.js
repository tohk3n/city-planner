// =============================================================================
// ENTITY SYSTEM - Unified Data Model
// =============================================================================

import { CONFIG, BUILDING_STAMPS } from './config.js';
import { AppState } from './state.js'
import { getStampWorldCoords } from './stamps.js';
import { findLargeTileForHex, getLargeTileHexes } from './tile-system.js';
import { updateTileMesh, renderBuildingMesh, removeBuildingMesh } from './threejs-api.js';
import { getHexNeighbors } from './hex-math.js';

/**
 * TerrainTile - Represents a large tile (7-hex cluster)
 * Single source of truth for tile state
 */
export class TerrainTile {
  constructor(id, centerCol, centerRow, depth = 25) {
    this.id = id;
    this.centerCol = centerCol;
    this.centerRow = centerRow;
    this.depth = depth;
    this.hexes = getLargeTileHexes(centerCol, centerRow);

    // Rendering references (set by renderers)
    this.svgBoundary = null;      // SVG path element
    this.svgDebugMarker = null;   // SVG circle element
    this.threeMesh = null;        // Three.js Group

    // Relationships
    this.buildings = new Set();   // BuildingEntity references on this tile
  }

  /**
   * Update tile depth and sync all renderers
   */
  updateDepth(newDepth) {
    if (this.depth === newDepth) return;

    this.depth = newDepth;

    // Notify renderers
    if (AppState.renderers.svg) {
      AppState.renderers.svg.updateTileDepth(this);
    }

    // Update 3D terrain if active
    if (AppState.show3DView) {
      updateTileMesh(this.id);
    }
  }

  /**
   * Add building to this tile
   */
  addBuilding(building) {
    this.buildings.add(building);
  }

  /**
   * Remove building from this tile
   */
  removeBuilding(building) {
    this.buildings.delete(building);
  }

  /**
   * Get all buildings on this tile
   */
  getBuildings() {
    return Array.from(this.buildings);
  }

  /**
   * Check if tile has any buildings
   */
  hasBuildings() {
    return this.buildings.size > 0;
  }
}

/**
 * BuildingEntity - Represents a placed building
 * Single source of truth for building state
 */
export class BuildingEntity {
  constructor(stamp, centerCol, centerRow, rotation = 0) {
    this.id = `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.stampId = stamp.id;
    this.stampName = stamp.name;
    this.stampSize = stamp.size;
    this.centerCol = centerCol;
    this.centerRow = centerRow;
    this.rotation = rotation;
    this.color = stamp.color;

    // Calculate world coordinates
    this.hexes = getStampWorldCoords(stamp, centerCol, centerRow, rotation);

    // Determine which tiles this building occupies
    this.tiles = new Set();
    this.hexes.forEach(hex => {
      const tile = findLargeTileForHex(hex.col, hex.row, AppState.entities.tiles);
      if (tile) {
        this.tiles.add(tile);
        tile.addBuilding(this);
      }
    });

    // Ground height (from first tile)
    this.groundHeight = this.tiles.size > 0
      ? Array.from(this.tiles)[0].depth
      : 25;

    // Rendering references (set by renderers)
    this.svgHexes = [];          // Array of SVG polygon elements
    this.threeMesh = null;       // Three.js Group or Mesh
  }

  /**
   * Get stamp object from stampId
   */
  getStamp() {
    // Search all categories for this stamp
    for (const category of Object.values(BUILDING_STAMPS)) {
      const stamp = category.find(s => s.id === this.stampId);
      if (stamp) return stamp;
    }
    console.error(`[BuildingEntity] Stamp not found: ${this.stampId}`);
    return null;
  }

  /**
   * Validate building can be placed
   * All tiles must be same depth
   */
  static validate(stamp, centerCol, centerRow, rotation) {
    const hexes = getStampWorldCoords(stamp, centerCol, centerRow, rotation);

    // Check all hexes are in bounds
    const allInBounds = hexes.every(hex =>
      hex.col >= 0 && hex.col < CONFIG.HEX_GRID_SIZE.cols &&
      hex.row >= 0 && hex.row < CONFIG.HEX_GRID_SIZE.rows
    );

    if (!allInBounds) {
      return { valid: false, reason: 'Out of bounds' };
    }

    // Check all tiles have same depth
    const affectedTiles = new Set();
    hexes.forEach(hex => {
      const tile = findLargeTileForHex(hex.col, hex.row, AppState.entities.tiles);
      if (tile) affectedTiles.add(tile);
    });

    if (affectedTiles.size > 1) {
      const depths = Array.from(affectedTiles).map(t => t.depth);
      const firstDepth = depths[0];
      if (!depths.every(d => d === firstDepth)) {
        return { valid: false, reason: 'Buildings cannot span tiles with different depths' };
      }
    }

    return { valid: true };
  }

  /**
   * Move building to new location
   */
  moveTo(newCenterCol, newCenterRow) {
    const stamp = this.getStamp();
    if (!stamp) {
      console.error(`[Building Move] Cannot find stamp for ${this.stampName}`);
      return false;
    }

    // Validate new position
    const validation = BuildingEntity.validate(stamp, newCenterCol, newCenterRow, this.rotation);
    if (!validation.valid) {
      console.warn(`[Building Move] Cannot move to [${newCenterCol},${newCenterRow}]: ${validation.reason}`);
      return false;
    }

    console.log(`[Building Move] Moving ${this.stampName} from [${this.centerCol},${this.centerRow}] to [${newCenterCol},${newCenterRow}]`);

    // Remove from renderers FIRST (while this.hexes still points to OLD position)
    if (AppState.renderers.svg) {
      AppState.renderers.svg.removeBuilding(this);
    }
    // Remove from 3D if active
    if (AppState.show3DView) {
      removeBuildingMesh(this.id);
    }

    // Clear old hex assignments
    this.hexes.forEach(hex => {
      const hexData = AppState.entities.getHex(hex.col, hex.row);
      if (hexData) {
        hexData.clearBuilding();
      }
    });

    // Clear from old tiles
    this.tiles.forEach(tile => tile.removeBuilding(this));
    this.tiles.clear();

    // Update center position
    this.centerCol = newCenterCol;
    this.centerRow = newCenterRow;

    // Recalculate hexes at new position
    const worldCoords = getStampWorldCoords(stamp, newCenterCol, newCenterRow, this.rotation);
    this.hexes = worldCoords.map(coord => ({ col: coord.col, row: coord.row }));

    // Assign to new tiles and hexes
    const affectedTiles = new Set();
    this.hexes.forEach(hex => {
      const hexData = AppState.entities.getHex(hex.col, hex.row);
      if (hexData) {
        hexData.assignToBuilding(this.id, this.color);
      }

      const tile = findLargeTileForHex(hex.col, hex.row, AppState.entities.tiles);
      if (tile) {
        affectedTiles.add(tile);
      }
    });

    affectedTiles.forEach(tile => {
      tile.addBuilding(this);
      this.tiles.add(tile);
    });

    // Render at new position
    if (AppState.renderers.svg) {
      AppState.renderers.svg.renderBuilding(this);
    }
    // Render in 3D if active
    if (AppState.show3DView) {
      renderBuildingMesh(this);
    }

    console.log(`[Building Move] Successfully moved to [${newCenterCol},${newCenterRow}]`);
    return true;
  }

  /**
   * Delete building and clean up all references
   */
  delete() {
    console.log(`[Building Delete] Removing: ${this.stampName} (${this.id})`);

    // Clear selection highlight FIRST (before renderer cleanup)
    if (AppState.selectedBuilding === this.id) {
      if (typeof clearBuildingHighlight === 'function') {
        clearBuildingHighlight();
      }
      AppState.selectedBuilding = null;
      if (typeof hideBuildingInfo === 'function') {
        hideBuildingInfo();
      }
    }

    // Clear hex assignments (must happen before renderer cleanup)
    this.hexes.forEach(hex => {
      const hexData = AppState.entities.getHex(hex.col, hex.row);
      if (hexData) {
        hexData.clearBuilding();
      }
    });

    // Clear renderers (this will remove overlays and restore terrain)
    if (AppState.renderers.svg) {
      AppState.renderers.svg.removeBuilding(this);
    }
    // Remove from 3D if active
    if (AppState.show3DView) {
      removeBuildingMesh(this.id);
    }

    // Remove from tiles
    this.tiles.forEach(tile => tile.removeBuilding(this));

    // Remove from global registry
    AppState.entities.buildings.delete(this.id);
  }

  /**
   * Get tile IDs this building occupies
   */
  getTileIds() {
    return Array.from(this.tiles).map(t => t.id);
  }

  /**
   * Check if building contains a specific hex
   */
  containsHex(col, row) {
    return this.hexes.some(hex => hex.col === col && hex.row === row);
  }
}

/**
 * HexData - Represents individual hex state
 * For hex-level painting (non-building hexes)
 */
export class HexData {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.terrainColor = '#2a2838';  // Underlying terrain
    this.color = '#2a2838';          // Display color (may be building)
    this.patterned = false;
    this.text = '';
    this.buildingId = null;
  }

  /**
   * Update hex color (terrain layer)
   */
  setColor(color) {
    // Always update terrain color (buildings are separate layer)
    this.terrainColor = color;

    // Only update display color if not covered by building
    if (!this.buildingId) {
      this.color = color;
    }

    this.patterned = false;

    if (AppState.renderers.svg) {
      AppState.renderers.svg.updateHexColor(this);
    }

    // Update 3D if active
    if (AppState.show3DView && AppState.renderers.three && AppState.renderers.three.scene) {
      const tile = findLargeTileForHex(this.col, this.row, AppState.entities.tiles);
      if (tile) {
        AppState.renderers.three.updateTileDepth(tile);
      }
    }

    return true;
  }

  /**
   * Set pattern mode
   */
  setPattern(isPatterned) {
    if (this.buildingId) return false;

    this.patterned = isPatterned;
    if (isPatterned) {
      this.color = 'white';
    }

    if (AppState.renderers.svg) {
      AppState.renderers.svg.updateHexColor(this);
    }

    // Update 3D if active
    if (AppState.show3DView && AppState.renderers.three && AppState.renderers.three.scene) {
      const tile = findLargeTileForHex(this.col, this.row, AppState.entities.tiles);
      if (tile) {
        AppState.renderers.three.updateTileDepth(tile);
      }
    }

    return true;
  }

  /**
   * Set text label
   */
  setText(text) {
    this.text = text;

    if (AppState.renderers.svg) {
      AppState.renderers.svg.updateHexText(this);
    }
  }

  /**
   * Mark hex as part of building (doesn't change visual)
   */
  assignToBuilding(buildingId) {
    this.buildingId = buildingId;
    // Don't change color - building is separate visual layer
  }

  /**
   * Clear building assignment (restore terrain)
   */
  clearBuilding() {
    this.buildingId = null;
    // Terrain color unchanged, just clear ownership
  }

  /**
   * Check if hex is part of a building
   */
  isBuilding() {
    return this.buildingId !== null;
  }
}

/**
 * EntityManager - Central registry for all entities
 */
export class EntityManager {
  constructor() {
    this.tiles = new Map();      // tileId -> TerrainTile
    this.buildings = new Map();  // buildingId -> BuildingEntity
    this.hexes = new Map();      // "col,row" -> HexData
  }

  /**
   * Initialize hex data for entire grid
   */
  initializeHexes(cols, rows) {
    console.log(`[EntityManager] Initializing ${cols}x${rows} hex grid...`);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${col},${row}`;
        this.hexes.set(key, new HexData(col, row));
      }
    }

    console.log(`[EntityManager] Initialized ${this.hexes.size} hexes`);
  }

  /**
   * Get hex data
   */
  getHex(col, row) {
    const key = `${col},${row}`;
    return this.hexes.get(key);
  }

  /**
   * Get tile by ID
   */
  getTile(tileId) {
    return this.tiles.get(tileId);
  }

  /**
   * Get building by ID
   */
  getBuilding(buildingId) {
    return this.buildings.get(buildingId);
  }

  /**
   * Find building at hex location
   */
  findBuildingAt(col, row) {
    const hex = this.getHex(col, row);
    if (hex && hex.buildingId) {
      return this.buildings.get(hex.buildingId);
    }
    return null;
  }

  /**
   * Add building to registry
   */
  addBuilding(building) {
    this.buildings.set(building.id, building);

    // Mark hexes as belonging to building (but don't change color)
    building.hexes.forEach(hex => {
      const hexData = this.getHex(hex.col, hex.row);
      if (hexData) {
        hexData.buildingId = building.id;  // Just mark ownership, don't change color
      }
    });

    console.log(`[EntityManager] Added building ${building.stampName} (${building.id})`);
  }

  /**
   * Remove building from registry
   */
  removeBuilding(buildingId) {
    const building = this.buildings.get(buildingId);
    if (!building) return false;

    // Clear hex assignments
    building.hexes.forEach(hex => {
      const hexData = this.getHex(hex.col, hex.row);
      if (hexData) {
        hexData.clearBuilding();
      }
    });

    // Delete building (this also removes from tiles)
    building.delete();

    return true;
  }

  /**
   * Initialize tiles from centers
   */
  initializeTiles(centers) {
    console.log(`[EntityManager] Initializing ${centers.length} terrain tiles...`);

    centers.forEach(([col, row]) => {
      const tile = new TerrainTile(`${col},${row}`, col, row);
      this.tiles.set(tile.id, tile);
    });

    console.log(`[EntityManager] Initialized ${this.tiles.size} tiles`);
  }

  /**
   * Get all tiles as array
   */
  getTiles() {
    return Array.from(this.tiles.values());
  }

  /**
   * Get all buildings as array
   */
  getBuildings() {
    return Array.from(this.buildings.values());
  }

  /**
   * Paint a single hex
   */
  paintHex(col, row, color) {
    const hex = this.getHex(col, row);
    if (!hex) return false;
    return hex.setColor(color);
  }

  /**
   * Erase a hex (reset to default)
   */
  /**
   * Erase a hex (reset to default)
   */
  eraseHex(col, row) {
    const hex = this.getHex(col, row);
    if (!hex) return false;

    // If hex is part of a building, delete the whole building
    if (hex.buildingId) {
      const building = this.buildings.get(hex.buildingId);
      if (building) {
        console.log(`[EntityManager] Eraser removing building: ${building.stampName}`);
        building.delete();
        return true;
      }
    }

    return hex.setColor('#2a2838');
  }

  /**
   * Set border pattern on hex
   */
  setBorderPattern(col, row) {
    const hex = this.getHex(col, row);
    if (!hex) return false;
    return hex.setPattern(true);
  }

  /**
   * Paint large hex (center + 6 neighbors)
   */
  paintLargeHex(col, row, color) {
    const hexesToPaint = [{ col, row }, ...getHexNeighbors(col, row)];
    let painted = 0;

    hexesToPaint.forEach(coord => {
      const hex = this.getHex(coord.col, coord.row);
      if (hex && hex.setColor(color || '#2a2838')) {
        painted++;
      }
    });

    return painted;
  }

  /**
   * Place a building stamp
   */
  placeBuilding(stamp, centerCol, centerRow, rotation) {
    // Validate placement
    const validation = BuildingEntity.validate(stamp, centerCol, centerRow, rotation);
    if (!validation.valid) {
      console.warn(`[EntityManager] Cannot place building: ${validation.reason}`);
      return null;
    }

    // Create building entity
    const building = new BuildingEntity(stamp, centerCol, centerRow, rotation);

    // Add to registry
    this.addBuilding(building);

    return building;
  }

  /**
   * Clear all data
   */
  reset() {
    // Clear buildings first
    this.getBuildings().forEach(building => building.delete());

    // Reset tiles to default depth
    this.tiles.forEach(tile => {
      tile.depth = 25;
      tile.buildings.clear();
    });

    // Reset hexes - clear everything back to default
    this.hexes.forEach(hex => {
      hex.buildingId = null;
      hex.color = '#2a2838';         // Display color
      hex.terrainColor = '#2a2838';  // Underlying terrain
      hex.patterned = false;
      hex.text = '';
    });

    console.log('[EntityManager] Reset complete');
  }

  /**
   * Serialize state to JSON
   */
  toJSON() {
    const hexData = [];
    this.hexes.forEach(hex => {
      // Only save non-default hexes to reduce file size
      if (hex.color !== '#2a2838' || hex.terrainColor !== '#2a2838' || hex.patterned || hex.text || hex.buildingId) {
        hexData.push({
          col: hex.col,
          row: hex.row,
          color: hex.color,
          terrainColor: hex.terrainColor,
          patterned: hex.patterned,
          text: hex.text,
          buildingId: hex.buildingId
        });
      }
    });

    const tileData = [];
    this.tiles.forEach(tile => {
      // Only save tiles with non-default depth
      if (tile.depth !== 25) {
        tileData.push({
          id: tile.id,
          centerCol: tile.centerCol,
          centerRow: tile.centerRow,
          depth: tile.depth
        });
      }
    });

    const buildingData = [];
    this.buildings.forEach(building => {
      buildingData.push({
        stampName: building.stampName,
        centerCol: building.centerCol,
        centerRow: building.centerRow,
        rotation: building.rotation,
        color: building.color,
        id: building.id
      });
    });

    return {
      hexes: hexData,
      tiles: tileData,
      buildings: buildingData
    };
  }

  /**
   * Load state from JSON
   */
  fromJSON(data) {
    if (!data) return;

    console.log('[EntityManager] Loading state from JSON...');

    // Clear existing state
    this.reset();

    // Load tiles
    if (data.tiles) {
      data.tiles.forEach(tileData => {
        const tile = this.tiles.get(tileData.id);
        if (tile) {
          tile.depth = tileData.depth;
        }
      });
      console.log(`[EntityManager] Loaded ${data.tiles.length} tiles`);
    }

    // Load hexes
    if (data.hexes) {
      data.hexes.forEach(hexData => {
        const hex = this.getHex(hexData.col, hexData.row);
        if (hex) {
          hex.color = hexData.color;
          hex.terrainColor = hexData.terrainColor || hexData.color; // Fallback for old saves
          hex.patterned = hexData.patterned || false;
          hex.text = hexData.text || '';
          hex.buildingId = hexData.buildingId || null;
        }
      });
      console.log(`[EntityManager] Loaded ${data.hexes.length} hexes`);
    }

    // Load buildings
    if (data.buildings) {
      data.buildings.forEach(buildingData => {
        const building = this.placeBuilding(
          buildingData.stampName,
          buildingData.centerCol,
          buildingData.centerRow,
          buildingData.rotation
        );

        if (building && buildingData.color) {
          building.color = buildingData.color;
        }
      });
      console.log(`[EntityManager] Loaded ${data.buildings.length} buildings`);
    }

    console.log('[EntityManager] State loaded successfully');
  }
}