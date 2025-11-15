// =============================================================================
// APPLICATION STATE
// =============================================================================

import { CONFIG } from './config.js';
import { EntityManager } from './entities.js';
import { generateLargeTileCenters } from './tile-system.js';
import { SVGRenderer } from './renderers.js';

export const AppState = {
  // Entity management
  entities: null, // EntityManager instance

  // Renderers
  renderers: {
    svg: null
  },

  // Drawing state
  currentColor: 'red',
  customColorValue: '#ff0000',
  brushSize: 1, // 1-5, controls paint radius
  maxBrushSize: 5,

  // Mode toggles
  largeHexMode: false,
  stampMode: false,
  showBoundaries: false,
  debugCenters: false,
  terraformMode: false,
  show3DView: false,
  heightMapMode: false,

  // Stamp state
  selectedStamp: null,
  currentStampRotation: 0,

  // Selection state
  selectedTileId: null,
  selectedTileIds: new Set(), // Multi-select for terraform
  selectedBuildingId: null,

  // Terraform state
  baselineDepth: 25, // Default depth for bulk operations

  // View state
  viewBox: { x: 0, y: 0, w: 4444.44, h: 3333.33 }, // 18% zoom

  // DOM references (legacy - will migrate away)
  dom: {
    svg: null,
    planNameInput: null,
    jsonFileInput: null,
    textInput: null,
    coordinatesDisplay: null,
    tileInfoDisplay: null,
    modeStatusDisplay: null,
    largeHexModeBtn: null,
    showBoundariesBtn: null,
    debugCentersBtn: null,
    terraformModeBtn: null,
    show3DViewBtn: null,
    heightMapModeBtn: null,
    depthSlider: null,
    depthInput: null,
    colorGrid: null,
    customColorPicker: null,
    brushSizeDisplay: null
  }
};

/**
 * Initialize DOM references
 */
export function initDOMReferences() {
  AppState.dom.svg = document.getElementById('hexMap');
  AppState.dom.colorGrid = document.getElementById('colorGrid');
  AppState.dom.customColorPicker = document.getElementById('customColorPicker');
  AppState.dom.planNameInput = document.getElementById('planName');
  AppState.dom.jsonFileInput = document.getElementById('jsonFileInput');
  AppState.dom.textInput = document.getElementById('textInput');
  AppState.dom.coordinatesDisplay = document.getElementById('coordinates');
  AppState.dom.tileInfoDisplay = document.getElementById('tileInfo');
  AppState.dom.modeStatusDisplay = document.getElementById('mode-status');
  AppState.dom.largeHexModeBtn = document.getElementById('largeHexModeBtn');
  AppState.dom.showBoundariesBtn = document.getElementById('showBoundariesBtn');
  AppState.dom.debugCentersBtn = document.getElementById('debugCentersBtn');
  AppState.dom.terraformModeBtn = document.getElementById('terraformModeBtn');
  AppState.dom.show3DViewBtn = document.getElementById('show3DViewBtn');
  AppState.dom.heightMapModeBtn = document.getElementById('heightMapModeBtn');
  AppState.dom.depthSlider = document.getElementById('depthSlider');
  AppState.dom.depthInput = document.getElementById('depthInput');
  AppState.dom.brushSizeDisplay = document.getElementById('brushSizeDisplay');
}

/**
 * Create SVG groups
 */
export function createSVGGroups() {
  AppState.dom.polygonsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.buildingsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.textsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.borderXGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.boundariesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.debugCentersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.hoverPreviewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  AppState.dom.stampPreviewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // Order matters: terrain first, then buildings on top
  AppState.dom.svg.appendChild(AppState.dom.polygonsGroup);
  AppState.dom.svg.appendChild(AppState.dom.buildingsGroup);  // Buildings render above terrain
  AppState.dom.svg.appendChild(AppState.dom.textsGroup);
  AppState.dom.svg.appendChild(AppState.dom.borderXGroup);
  AppState.dom.svg.appendChild(AppState.dom.boundariesGroup);
  AppState.dom.svg.appendChild(AppState.dom.debugCentersGroup);
  AppState.dom.svg.appendChild(AppState.dom.hoverPreviewGroup);
  AppState.dom.svg.appendChild(AppState.dom.stampPreviewGroup);
}

/**
 * Initialize entity manager
 */
export function initEntityManager() {
  AppState.entities = new EntityManager();
  AppState.entities.initializeHexes(CONFIG.HEX_GRID_SIZE.cols, CONFIG.HEX_GRID_SIZE.rows);
  console.log('[State] EntityManager initialized');
}

/**
 * Initialize tile entities
 */
export function initTileEntities() {
  const centers = generateLargeTileCenters(CONFIG.HEX_GRID_SIZE.cols, CONFIG.HEX_GRID_SIZE.rows);
  AppState.entities.initializeTiles(centers);
  console.log('[State] Tile entities initialized');
}

/**
 * Initialize renderers
 */
export function initRenderers() {
  // Initialize SVG renderer
  AppState.renderers.svg = new SVGRenderer();
  AppState.renderers.svg.initialize(AppState.dom.svg, {
    polygons: AppState.dom.polygonsGroup,
    buildings: AppState.dom.buildingsGroup,
    texts: AppState.dom.textsGroup,
    borderX: AppState.dom.borderXGroup,
    boundaries: AppState.dom.boundariesGroup,
    debugCenters: AppState.dom.debugCentersGroup,
    hoverPreview: AppState.dom.hoverPreviewGroup,
    stampPreview: AppState.dom.stampPreviewGroup
  }, AppState);

  // Three.js renderer uses legacy system (threejs-terrain.js)
  // No class instance needed - functions called directly
  AppState.renderers.three = null;

  console.log('[State] Renderers initialized');
}

// Backwards compatibility shim - provides old interface for unmigrated code
// TODO: Remove once all code migrated to entity system
Object.defineProperty(AppState, 'largeTiles', {
  get() {
    if (!this.entities) return new Map();
    return this.entities.tiles;
  }
});

Object.defineProperty(AppState, 'placedBuildings', {
  get() {
    if (!this.entities) return new Map();
    return this.entities.buildings;
  }
});

// Backwards compatibility for selectedBuilding
Object.defineProperty(AppState, 'selectedBuilding', {
  get() {
    return this.selectedBuildingId;
  },
  set(value) {
    this.selectedBuildingId = value;
  }
});