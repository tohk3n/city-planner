// =============================================================================
// UI EVENT HANDLERS & INTERACTIONS
// =============================================================================

import { CONFIG, BUILDING_STAMPS } from './config.js';
import { AppState } from './state.js';
import { renderHexGrid, renderLargeTileBoundaries, renderDebugCenters, showHoverPreview, clearHoverPreview, updateViewBox, updateTileDepth } from './rendering.js';
import { paintHex } from './painting.js';
import { selectBuilding, clearBuildingHighlight, deleteBuilding, showBuildingInfo, hideBuildingInfo, isHexPartOfBuilding, startRepositioning, cancelRepositioning, completeRepositioning, showRepositionPreview, repositioningState } from '../core/building-management.js';
import { saveAsJson, resetMap, setupFileInput } from '../core/file-ops.js';
import { showThreeJSView, hideThreeJSView, rebuildTerrainColors, resetCameraPosition } from '../threejs-api.js';

/**
 * Build color palette
 */
export function buildPalette() {
  AppState.dom.colorGrid.innerHTML = '';
  CONFIG.PRESET_COLORS.forEach(col => {
    if (col === 'border-pattern') {
      addSwatch(col, true);
    } else if (col === 'custom-color') {
      addCustomColorSwatch();
    } else if (col === 'eraser') {
      addEraserSwatch();
    } else {
      addSwatch(col, false);
    }
  });
}

export function addSwatch(color, isBorder = false) {
  const div = document.createElement('div');
  div.className = 'color-swatch';
  if (isBorder) div.classList.add('border-preview');
  else div.style.background = color;
  div.dataset.color = color;
  div.addEventListener('click', () => selectColor(color));
  AppState.dom.colorGrid.appendChild(div);
}

export function addCustomColorSwatch() {
  const div = document.createElement('div');
  div.className = 'color-swatch custom-color';
  div.dataset.color = 'custom-color';
  div.addEventListener('click', () => AppState.dom.customColorPicker.click());
  AppState.dom.colorGrid.appendChild(div);
}

export function addEraserSwatch() {
  const div = document.createElement('div');
  div.className = 'color-swatch eraser-swatch';
  div.dataset.color = 'eraser';
  div.addEventListener('click', () => selectColor('eraser'));
  AppState.dom.colorGrid.appendChild(div);
}

export function selectColor(color) {
  AppState.currentColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected-swatch'));

  if (color === AppState.customColorValue) {
    document.querySelector('.color-swatch.custom-color').classList.add('selected-swatch');
  } else {
    const swatch = document.querySelector(`[data-color="${color}"]`);
    if (swatch) swatch.classList.add('selected-swatch');
  }
}

/**
 * Zoom control
 */
export function zoom(scale) {
  AppState.viewBox.w *= scale;
  AppState.viewBox.h *= scale;
  updateViewBox();
  const zoomPercent = Math.round((800 / AppState.viewBox.w) * 100);
  document.getElementById('zoomLevel').textContent = zoomPercent + '%';
}

/**
 * Adjust brush size
 */
export function adjustBrushSize(delta) {
  const newSize = AppState.brushSize + delta;
  if (newSize >= 1 && newSize <= AppState.maxBrushSize) {
    AppState.brushSize = newSize;
    
    // Sync large hex mode state with brush size
    const wasLargeHexMode = AppState.largeHexMode;
    AppState.largeHexMode = (newSize === 2);
    
    // Update button state if it changed
    if (wasLargeHexMode !== AppState.largeHexMode && AppState.dom.largeHexModeBtn) {
      AppState.dom.largeHexModeBtn.classList.toggle('active', AppState.largeHexMode);
    }
    
    // Update display
    if (AppState.dom.brushSizeDisplay) {
      AppState.dom.brushSizeDisplay.textContent = AppState.brushSize;
    }
    
    // Update mode status
    if (newSize === 2 && !AppState.stampMode) {
      AppState.dom.modeStatusDisplay.textContent = 'LARGE HEX MODE';
    } else if (newSize !== 2 && !AppState.stampMode) {
      AppState.dom.modeStatusDisplay.textContent = 'PAINT MODE';
    }
    
    console.log(`[UI] Brush size: ${AppState.brushSize}`);
  }
}

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
  // Zoom controls
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(1.1));
  document.getElementById('zoomInBtn').addEventListener('click', () => zoom(1 / 1.1));

  // Brush size controls (check if elements exist first)
  const brushDecBtn = document.getElementById('brushSizeDecBtn');
  const brushIncBtn = document.getElementById('brushSizeIncBtn');
  if (brushDecBtn && brushIncBtn) {
    brushDecBtn.addEventListener('click', () => adjustBrushSize(-1));
    brushIncBtn.addEventListener('click', () => adjustBrushSize(1));
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Brush size: + and - keys (with or without shift)
    if ((e.key === '=' || e.key === '+') && !e.target.matches('input, textarea')) {
      e.preventDefault();
      adjustBrushSize(1);
    }
    if ((e.key === '-' || e.key === '_') && !e.target.matches('input, textarea')) {
      e.preventDefault();
      adjustBrushSize(-1);
    }
    
    // ESC key: clear selections in terraform mode
    if (e.key === 'Escape' && AppState.terraformMode) {
      clearTileSelections();
    }
  });

  // Large hex mode toggle (convenience wrapper for brush size 2)
  AppState.dom.largeHexModeBtn.addEventListener('click', () => {
    AppState.largeHexMode = !AppState.largeHexMode;
    AppState.dom.largeHexModeBtn.classList.toggle('active', AppState.largeHexMode);
    
    // Set brush size based on mode
    if (AppState.largeHexMode) {
      AppState.brushSize = 2;
      AppState.dom.modeStatusDisplay.textContent = 'LARGE HEX MODE';
    } else {
      AppState.brushSize = 1;
      AppState.dom.modeStatusDisplay.textContent = AppState.stampMode ? 'STAMP MODE' : 'PAINT MODE';
    }
    
    // Update brush size display
    if (AppState.dom.brushSizeDisplay) {
      AppState.dom.brushSizeDisplay.textContent = AppState.brushSize;
    }
    
    if (AppState.stampMode && AppState.largeHexMode) {
      AppState.stampMode = false;
      document.getElementById('stampModeBtn').classList.remove('active');
      document.getElementById('stampsPanel').style.display = 'none';
    }
  });

  // Boundaries toggle
  AppState.dom.showBoundariesBtn.addEventListener('click', () => {
    AppState.showBoundaries = !AppState.showBoundaries;
    AppState.dom.showBoundariesBtn.classList.toggle('active', AppState.showBoundaries);
    AppState.dom.showBoundariesBtn.textContent = AppState.showBoundaries ? 'SHOW BOUNDARIES ✓' : 'SHOW BOUNDARIES';

    AppState.dom.boundariesGroup.querySelectorAll('.large-tile-boundary').forEach(boundary => {
      boundary.style.display = AppState.showBoundaries ? 'block' : 'none';
    });
  });

  // Debug centers toggle
  AppState.dom.debugCentersBtn.addEventListener('click', () => {
    AppState.debugCenters = !AppState.debugCenters;
    AppState.dom.debugCentersBtn.classList.toggle('active', AppState.debugCenters);
    AppState.dom.debugCentersBtn.textContent = AppState.debugCenters ? 'LARGE TILE CENTERS ✓' : 'LARGE TILE CENTERS';

    AppState.dom.debugCentersGroup.querySelectorAll('.center-debug').forEach(marker => {
      marker.style.display = AppState.debugCenters ? 'block' : 'none';
    });
  });

  // 3D view toggle
  AppState.dom.show3DViewBtn.addEventListener('click', () => {
    AppState.show3DView = !AppState.show3DView;
    AppState.dom.show3DViewBtn.classList.toggle('active', AppState.show3DView);
    AppState.dom.show3DViewBtn.textContent = AppState.show3DView ? '3D TERRAIN VIEW ✓' : '3D TERRAIN VIEW';

    if (AppState.show3DView) {
      showThreeJSView();
      
      // Disable terraform mode in 3D view (not implemented)
      if (AppState.terraformMode) {
        AppState.terraformMode = false;
        AppState.dom.terraformModeBtn.classList.remove('active');
        AppState.dom.terraformModeBtn.textContent = 'TERRAFORM MODE';
      }
      AppState.dom.terraformModeBtn.disabled = true;
      AppState.dom.terraformModeBtn.style.opacity = '0.5';
      AppState.dom.terraformModeBtn.style.cursor = 'not-allowed';
      AppState.dom.terraformModeBtn.title = 'Terraform mode only works in 2D view';
      
      // Enable height map mode in 3D view
      if (AppState.dom.heightMapModeBtn) {
        AppState.dom.heightMapModeBtn.disabled = false;
        AppState.dom.heightMapModeBtn.style.opacity = '1';
        AppState.dom.heightMapModeBtn.style.cursor = 'pointer';
        AppState.dom.heightMapModeBtn.title = '';
      }
    } else {
      hideThreeJSView();
      
      // Re-enable terraform mode in 2D view
      AppState.dom.terraformModeBtn.disabled = false;
      AppState.dom.terraformModeBtn.style.opacity = '1';
      AppState.dom.terraformModeBtn.style.cursor = 'pointer';
      AppState.dom.terraformModeBtn.title = '';
      
      // Disable height map mode in 2D view (only makes sense in 3D)
      if (AppState.dom.heightMapModeBtn) {
        if (AppState.heightMapMode) {
          AppState.heightMapMode = false;
          AppState.dom.heightMapModeBtn.classList.remove('active');
          AppState.dom.heightMapModeBtn.textContent = 'HEIGHT MAP COLORS';
        }
        AppState.dom.heightMapModeBtn.disabled = true;
        AppState.dom.heightMapModeBtn.style.opacity = '0.5';
        AppState.dom.heightMapModeBtn.style.cursor = 'not-allowed';
        AppState.dom.heightMapModeBtn.title = 'Height map colors only work in 3D view';
      }
    }
  });

  // Reset camera button (for Three.js view)
  document.getElementById('resetCamera').addEventListener('click', () => {
    if (AppState.show3DView) {
      resetCameraPosition();
    }
  });

  // Height map mode toggle (only works in 3D view)
  if (AppState.dom.heightMapModeBtn) {
    AppState.dom.heightMapModeBtn.addEventListener('click', () => {
      if (!AppState.show3DView) {
        alert('Enable 3D Terrain View first!');
        return;
      }

      AppState.heightMapMode = !AppState.heightMapMode;
      AppState.dom.heightMapModeBtn.classList.toggle('active', AppState.heightMapMode);
      AppState.dom.heightMapModeBtn.textContent = AppState.heightMapMode ? 'HEIGHT MAP COLORS ✓' : 'HEIGHT MAP COLORS';

      // Rebuild terrain with new colors
      rebuildTerrainColors();
    });
  }

  // Terraform mode toggle
  AppState.dom.terraformModeBtn.addEventListener('click', () => {
    AppState.terraformMode = !AppState.terraformMode;
    AppState.dom.terraformModeBtn.classList.toggle('active', AppState.terraformMode);
    AppState.dom.terraformModeBtn.textContent = AppState.terraformMode ? 'TERRAFORM MODE ✓' : 'TERRAFORM MODE';

    const panel = document.getElementById('terraformPanel');
    if (AppState.terraformMode) {
      panel.style.display = 'block';
      AppState.dom.modeStatusDisplay.textContent = 'TERRAFORM MODE';
      // Enable boundaries when entering terraform mode
      if (!AppState.showBoundaries) {
        AppState.showBoundaries = true;
        AppState.dom.showBoundariesBtn.classList.add('active');
        AppState.dom.showBoundariesBtn.textContent = 'SHOW BOUNDARIES ✓';
        AppState.dom.boundariesGroup.querySelectorAll('.large-tile-boundary').forEach(boundary => {
          boundary.style.display = 'block';
        });
      }
    } else {
      panel.style.display = 'none';
      AppState.dom.modeStatusDisplay.textContent = 'PAINT MODE';
      
      // Clear all selections when exiting terraform mode
      clearTileSelections();
    }
  });

  // Depth slider sync
  AppState.dom.depthSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    AppState.dom.depthInput.value = value;
    updateSelectedTileDepth(parseInt(value));
  });

  AppState.dom.depthInput.addEventListener('input', (e) => {
    const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    e.target.value = value;
    AppState.dom.depthSlider.value = value;
    updateSelectedTileDepth(value);
  });

  // Baseline depth controls
  const baselineDepthInput = document.getElementById('baselineDepthInput');
  if (baselineDepthInput) {
    baselineDepthInput.addEventListener('input', (e) => {
      const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      e.target.value = value;
      AppState.baselineDepth = value;
    });
  }

  const applyBaselineBtn = document.getElementById('applyBaselineBtn');
  if (applyBaselineBtn) {
    applyBaselineBtn.addEventListener('click', () => {
      if (AppState.selectedTileIds.size > 0) {
        // Apply to selected tiles
        AppState.selectedTileIds.forEach(tileId => {
          updateTileDepth(tileId, AppState.baselineDepth);
        });
        console.log(`[Terraform] Applied baseline depth ${AppState.baselineDepth} to ${AppState.selectedTileIds.size} tiles`);
      } else {
        // No selection - apply to all tiles
        if (confirm(`Apply baseline depth ${AppState.baselineDepth} to ALL tiles?`)) {
          AppState.largeTiles.forEach((tile, tileId) => {
            updateTileDepth(tileId, AppState.baselineDepth);
          });
          console.log(`[Terraform] Applied baseline depth ${AppState.baselineDepth} to all tiles`);
        }
      }
      // Update display to match new depth
      updateSelectedTilesDisplay();
    });
  }

  // File operations
  document.getElementById('saveJsonBtn').addEventListener('click', saveAsJson);
  document.getElementById('loadJsonBtn').addEventListener('click', () => AppState.dom.jsonFileInput.click());
  document.getElementById('resetBtn').addEventListener('click', resetMap);

  // Guide modal — handled by js/ui/walkthrough.js

  // Custom color picker
  AppState.dom.customColorPicker.addEventListener('change', (e) => {
    AppState.customColorValue = e.target.value;
    AppState.currentColor = AppState.customColorValue;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected-swatch'));
    document.querySelector('.color-swatch.custom-color').classList.add('selected-swatch');
    document.querySelector('.color-swatch.custom-color').style.background = AppState.customColorValue;
  });

  // Canvas interactions
  setupCanvasInteractions();

  // Building management
  setupBuildingManagement();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R' || e.key === 'e' || e.key === 'E') {
      if (AppState.selectedStamp) {
        AppState.currentStampRotation = (AppState.currentStampRotation + 1) % 6;
        updateStampInfo();
      }
    } else if (e.key === 'q' || e.key === 'Q') {
      if (AppState.selectedStamp) {
        AppState.currentStampRotation = (AppState.currentStampRotation + 5) % 6; // +5 is same as -1 in mod 6
        updateStampInfo();
      }
    }
  });

  // Warn on close
  window.addEventListener('beforeunload', e => {
    e.preventDefault();
    e.returnValue = 'UNSAVED CHANGES DETECTED';
  });
}

/**
 * Setup canvas mouse interactions
 */
export function setupCanvasInteractions() {
  let isDragging = false, moved = false;
  let dragStartX = 0, dragStartY = 0;
  let isPainting = false;

  AppState.dom.svg.addEventListener('mousedown', e => {
    // Repositioning mode - ignore all other mouse actions
    if (repositioningState.active) {
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      isDragging = true;
      moved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    } else if (e.button === 0 && e.target.tagName.toLowerCase() === 'polygon') {
      e.preventDefault();

      const col = +e.target.dataset.col;
      const row = +e.target.dataset.row;

      // Check if in terraform mode - select tile instead of painting
      if (AppState.terraformMode) {
        const tileId = e.target.dataset.tileId;
        if (tileId) {
          // Ctrl/Cmd+click for multi-select
          if (e.ctrlKey || e.metaKey) {
            toggleTileSelection(tileId);
          } else {
            selectTileForTerraform(tileId, false); // Clear previous selection
          }
        }
      }
      // Shift+click - building selection or repositioning
      else if (e.shiftKey) {
        const foundBuilding = AppState.entities.findBuildingAt(col, row);

        // If clicking on the currently selected building, start repositioning
        if (foundBuilding && AppState.selectedBuilding === foundBuilding.id) {
          startRepositioning(foundBuilding.id);
        }
        // Otherwise, select the building
        else {
          selectBuilding(col, row);
        }
      }
      // Normal painting/stamping
      else {
        isPainting = true;
        paintHex(e.target);
      }
    }
  });

  AppState.dom.svg.addEventListener('mousemove', e => {
    if (isDragging) {
      moved = true;
      const dx = (e.clientX - dragStartX) * (AppState.viewBox.w / AppState.dom.svg.clientWidth);
      const dy = (e.clientY - dragStartY) * (AppState.viewBox.h / AppState.dom.svg.clientHeight);
      AppState.viewBox.x -= dx;
      AppState.viewBox.y -= dy;
      updateViewBox();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
    // Repositioning preview
    else if (repositioningState.active && e.target.tagName.toLowerCase() === 'polygon') {
      const col = +e.target.dataset.col;
      const row = +e.target.dataset.row;
      showRepositionPreview(col, row);
      AppState.dom.coordinatesDisplay.textContent = `REPOSITIONING TO: [${col},${row}]`;
    }
    // Normal painting
    else if (isPainting && e.target.tagName.toLowerCase() === 'polygon' && !e.shiftKey) {
      paintHex(e.target);
    }
    // Normal hover
    else if (!isPainting && e.target.tagName.toLowerCase() === 'polygon') {
      showHoverPreview(e.target);
      const col = e.target.dataset.col;
      const row = e.target.dataset.row;
      const tileId = e.target.dataset.tileId;

      // Show if hex is part of a building
      const buildingCheck = isHexPartOfBuilding(+col, +row);
      const buildingInfo = buildingCheck.isBuilding ? ` | BUILDING: ${buildingCheck.building.stampName}` : '';

      AppState.dom.coordinatesDisplay.textContent = `COL: ${col} | ROW: ${row}${buildingInfo}`;
      AppState.dom.tileInfoDisplay.textContent = tileId ? `TILE: ${tileId}` : 'TILE: --';
    }
  });

  document.addEventListener('mouseup', (e) => {
    // Complete repositioning on left click release (use stored hover position)
    if (repositioningState.active && e.button === 0 &&
        repositioningState.hoverCol !== null && repositioningState.hoverRow !== null) {
      completeRepositioning(repositioningState.hoverCol, repositioningState.hoverRow);
    }

    isDragging = false;
    isPainting = false;
  });

  AppState.dom.svg.addEventListener('mouseleave', () => {
    clearHoverPreview();
    AppState.dom.coordinatesDisplay.textContent = 'COL: -- | ROW: --';
    AppState.dom.tileInfoDisplay.textContent = 'TILE: --';
  });

  AppState.dom.svg.addEventListener('wheel', e => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    zoom(scale);
  });

  AppState.dom.svg.addEventListener('dblclick', e => {
    if (e.target.tagName.toLowerCase() === 'polygon' && !moved) {
      showTextInput(e.target, e.clientX, e.clientY);
    }
  });
}

/**
 * Show text input for labeling
 */
export function showTextInput(hex, clientX, clientY) {
  const col = +hex.dataset.col;
  const row = +hex.dataset.row;
  const textEl = AppState.dom.textsGroup.querySelector(`text[data-col="${col}"][data-row="${row}"]`);

  AppState.dom.textInput.style.left = `${clientX + 10}px`;
  AppState.dom.textInput.style.top = `${clientY}px`;
  AppState.dom.textInput.value = textEl.textContent || '';
  AppState.dom.textInput.style.display = 'block';
  AppState.dom.textInput.focus();
  AppState.dom.textInput.select();

  const hideInput = () => {
    textEl.textContent = AppState.dom.textInput.value.trim();
    AppState.dom.textInput.style.display = 'none';
  };

  AppState.dom.textInput.onkeydown = (e) => {
    if (e.key === 'Enter') hideInput();
  };
  AppState.dom.textInput.onblur = hideInput;
}

/**
 * Setup stamp system UI
 */
export function setupStampSystem() {
  const stampModeBtn = document.getElementById('stampModeBtn');
  const stampsPanel = document.getElementById('stampsPanel');
  const stampCategory = document.getElementById('stampCategory');
  const stampSelector = document.getElementById('stampSelector');
  const rotateStampBtn = document.getElementById('rotateStampBtn');

  Object.keys(BUILDING_STAMPS).forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    stampCategory.appendChild(option);
  });

  stampModeBtn.addEventListener('click', () => {
    AppState.stampMode = !AppState.stampMode;

    if (AppState.stampMode) {
      stampModeBtn.classList.add('active');
      stampModeBtn.textContent = 'BUILDING STAMPS';
      stampsPanel.style.display = 'flex';
      AppState.dom.modeStatusDisplay.textContent = 'STAMP MODE';
      if (AppState.largeHexMode) {
        AppState.largeHexMode = false;
        AppState.dom.largeHexModeBtn.classList.remove('active');
        AppState.dom.largeHexModeBtn.textContent = 'LARGE HEX MODE';
      }
    } else {
      stampModeBtn.classList.remove('active');
      stampModeBtn.textContent = 'BUILDING STAMPS';
      stampsPanel.style.display = 'none';
      AppState.dom.modeStatusDisplay.textContent = 'PAINT MODE';
      clearHoverPreview();
      AppState.selectedStamp = null;
    }
  });

  stampCategory.addEventListener('change', () => {
    const category = stampCategory.value;
    stampSelector.innerHTML = '<option value="">SELECT BUILDING</option>';

    if (category && BUILDING_STAMPS[category]) {
      BUILDING_STAMPS[category].forEach(stamp => {
        const option = document.createElement('option');
        option.value = stamp.id;
        option.textContent = stamp.name;
        stampSelector.appendChild(option);
      });
    }

    AppState.selectedStamp = null;
    clearHoverPreview();
    updateStampInfo();
  });

  stampSelector.addEventListener('change', () => {
    const stampId = stampSelector.value;
    const category = stampCategory.value;

    if (category && stampId && BUILDING_STAMPS[category]) {
      AppState.selectedStamp = BUILDING_STAMPS[category].find(s => s.id === stampId);
      AppState.currentStampRotation = 0;
    } else {
      AppState.selectedStamp = null;
    }

    clearHoverPreview();
    updateStampInfo();
  });

  rotateStampBtn.addEventListener('click', () => {
    if (AppState.selectedStamp) {
      AppState.currentStampRotation = (AppState.currentStampRotation + 1) % 6;
      updateStampInfo();
    }
  });
}

export function updateStampInfo() {
  const stampInfo = document.getElementById('stampInfo');
  if (AppState.selectedStamp) {
    stampInfo.textContent = `${AppState.selectedStamp.name} (${AppState.selectedStamp.size}) - ${AppState.currentStampRotation * 60}°`;
  } else {
    stampInfo.textContent = '';
  }
}

/**
 * Track selected tile for terraform mode
 */
let selectedTileForTerraform = null;

/**
 * Toggle a tile in/out of multi-selection
 */
export function toggleTileSelection(tileId) {
  const tile = AppState.largeTiles.get(tileId);
  if (!tile) return;

  if (AppState.selectedTileIds.has(tileId)) {
    // Deselect
    AppState.selectedTileIds.delete(tileId);
    const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tileId}"]`);
    if (boundary) {
      boundary.classList.remove('selected-tile');
    }
  } else {
    // Select
    AppState.selectedTileIds.add(tileId);
    const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tileId}"]`);
    if (boundary) {
      boundary.classList.add('selected-tile');
    }
  }

  updateSelectedTilesDisplay();
}

/**
 * Clear all tile selections
 */
export function clearTileSelections() {
  // Clear visual highlights
  AppState.selectedTileIds.forEach(tileId => {
    const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tileId}"]`);
    if (boundary) {
      boundary.classList.remove('selected-tile');
    }
  });
  
  AppState.selectedTileIds.clear();
  selectedTileForTerraform = null;
  updateSelectedTilesDisplay();
}

/**
 * Update the UI to show selected tile count/info
 */
function updateSelectedTilesDisplay() {
  const count = AppState.selectedTileIds.size;
  const display = document.getElementById('selectedTileInfo');
  
  if (count === 0) {
    display.textContent = 'NONE';
    // Reset depth controls to baseline
    AppState.dom.depthSlider.value = AppState.baselineDepth;
    AppState.dom.depthInput.value = AppState.baselineDepth;
  } else if (count === 1) {
    const tileId = Array.from(AppState.selectedTileIds)[0];
    const tile = AppState.largeTiles.get(tileId);
    display.textContent = tileId;
    if (tile) {
      AppState.dom.depthSlider.value = tile.depth;
      AppState.dom.depthInput.value = tile.depth;
    }
  } else {
    display.textContent = `${count} TILES`;
    // Show average depth for multi-select
    let totalDepth = 0;
    AppState.selectedTileIds.forEach(tileId => {
      const tile = AppState.largeTiles.get(tileId);
      if (tile) totalDepth += tile.depth;
    });
    const avgDepth = Math.round(totalDepth / count);
    AppState.dom.depthSlider.value = avgDepth;
    AppState.dom.depthInput.value = avgDepth;
  }
}

/**
 * Update depth of currently selected tiles (supports multi-select)
 */
export function updateSelectedTileDepth(newDepth) {
  if (AppState.selectedTileIds.size === 0) return;
  
  // Update all selected tiles
  AppState.selectedTileIds.forEach(tileId => {
    updateTileDepth(tileId, newDepth);
  });
}

/**
 * Select a tile for terraforming (single select, clears others unless multi-select)
 */
export function selectTileForTerraform(tileId, keepExisting = false) {
  const tile = AppState.largeTiles.get(tileId);
  if (!tile) return;

  // Clear previous selections if not multi-selecting
  if (!keepExisting) {
    clearTileSelections();
  }

  // Add to selection
  AppState.selectedTileIds.add(tileId);
  selectedTileForTerraform = tileId;

  // Add selection highlight to boundary
  const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tileId}"]`);
  if (boundary) {
    boundary.classList.add('selected-tile');
  }

  updateSelectedTilesDisplay();
}
/**
 * Setup building management event listeners
 */
export function setupBuildingManagement() {
  // Delete button
  const deleteBtn = document.getElementById('deleteBuildingBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (AppState.selectedBuilding) {
        if (confirm('Delete this building?')) {
          deleteBuilding(AppState.selectedBuilding);
        }
      }
    });
  }

  // Deselect button
  const deselectBtn = document.getElementById('deselectBuildingBtn');
  if (deselectBtn) {
    deselectBtn.addEventListener('click', () => {
      clearBuildingHighlight();
      hideBuildingInfo();
    });
  }

  // Keyboard shortcut: Delete key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (AppState.selectedBuilding && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        if (confirm('Delete selected building?')) {
          deleteBuilding(AppState.selectedBuilding);
        }
      }
    }

    // Escape to cancel repositioning or deselect
    if (e.key === 'Escape') {
      // If repositioning, cancel it
      if (repositioningState.active) {
        cancelRepositioning();
      }
      // Otherwise, deselect building
      else {
        clearBuildingHighlight();
        hideBuildingInfo();
      }
    }
  });
}