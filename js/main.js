// Entry point. Wire the modules to the DOM.
//
// The pattern: App owns state + modules. UI elements call app methods.
// App emits events back to update UI displays. One-way data flow.

import App from './ui/app.js';
import GridSizeUI from './ui/grid-size-ui.js';
import { DEFAULT_COLOR } from './core/grid.js';
import * as undo from './core/undo-stack.js';

// Building data -- loaded from the compact JSON.
import buildingData from '../data/buildings-planner-compact.json' with { type: 'json' };

const app = new App();

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewport');
  app.init(container, buildingData);

  buildColorPalette();
  wireAccordionCards();
  wireGridSizeUI();
  wireColorPalette();
  wireModeToggles();
  wireTerraformPanel();
  wireBuildingPicker();
  wireKeyboard();
  wireStatusDisplay();
  wireFileOps();
  wireGuideModal();
  wireAnimationLoop();
  updateStats();
});

// --- Accordion Cards ---
// Click a card-header to expand/collapse. Only one open at a time.
// Opening buildings = stamp mode, terrain = terraform mode, else = paint.

function wireAccordionCards() {
  const cards = document.querySelectorAll('.control-card');

  for (const card of cards) {
    const header = card.querySelector('.card-header');
    if (!header) continue;

    header.addEventListener('click', () => {
      const wasCollapsed = card.classList.contains('collapsed');
      // Collapse all
      for (const c of cards) c.classList.add('collapsed');
      // Toggle clicked
      if (wasCollapsed) card.classList.remove('collapsed');

      syncModeFromPanel();
    });

    card.addEventListener('click', (e) => {
      if (!card.classList.contains('collapsed')) return;
      if (header.contains(e.target)) return;
      for (const c of cards) c.classList.add('collapsed');
      card.classList.remove('collapsed');

      syncModeFromPanel();
    });
  }
}

// The open card determines the active mode.
// Boundaries auto-enable on terraform entry but don't auto-disable on exit.
function syncModeFromPanel() {
  const open = document.querySelector('.control-card:not(.collapsed)');
  const panel = open?.dataset.panel;

  if (panel === '2') {
    // Buildings card - enter stamp mode
    app.mode = 'stamp';
  } else if (panel === '3') {
    // Terrain card - enter terraform mode + auto-enable boundaries
    app.mode = 'terraform';
    if (!app.showBoundaries) {
      app.showBoundaries = true;
      app.toggleBoundaries(true);
      const bBtn = document.getElementById('showBoundariesBtn');
      if (bBtn) bBtn.classList.add('active');
    }
  } else {
    // Palette, grid, or anything else - back to paint
    app.mode = 'paint';
  }

  updateModeDisplay();
}

// --- Color Palette ---
// Populates #colorPalette with swatch divs. Must run before wireColorPalette.
// Old code used CONFIG.PRESET_COLORS + AppState.dom.colorGrid -- this replaces both.

// Palette based on the actual game tier progression.
// T1 gray → T10 white, matching what players see in-game.
// Second row is gravel variants (same hue, darkened) since that's
// the main visual distinction in the paving textures.
const TIER_COLORS = {
  1:  '#888888',  // Rough — gray
  2:  '#d4722a',  // Simple — orange
  3:  '#3a8a3a',  // Sturdy — green
  4:  '#3a6abf',  // Fine — blue
  5:  '#8a3ab0',  // Ornate — purple
  6:  '#b83030',  // Exquisite — red
  7:  '#c8b832',  // Flawless — yellow
  8:  '#40b8a0',  // Pristine — aquamarine
  9:  '#2a2a2a',  // Magnificent — black
  10: '#e8e8e8',  // Peerless — white
};

// Gravel = same hue but pulled toward dark. Multiply-style darken.
function gravel(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 0.5; // darken factor
  return '#' + [r, g, b].map(c => Math.round(c * f).toString(16).padStart(2, '0')).join('');
}

const PRESET_COLORS = [
  // Row 1: Tier colors (normal paving)
  TIER_COLORS[1], TIER_COLORS[2], TIER_COLORS[3], TIER_COLORS[4],
  // Row 2: Tier colors continued
  TIER_COLORS[5], TIER_COLORS[6], TIER_COLORS[7], TIER_COLORS[8],
  // Row 3: Dark tiers + gravel start
  TIER_COLORS[9], TIER_COLORS[10], gravel(TIER_COLORS[1]), gravel(TIER_COLORS[2]),
  // Row 4: More gravel + utility
  gravel(TIER_COLORS[3]), gravel(TIER_COLORS[4]), gravel(TIER_COLORS[5]), gravel(TIER_COLORS[6]),
  // Row 5: Special swatches
  'border-pattern', 'eraser', 'custom-color',
];

function buildColorPalette() {
  const palette = document.getElementById('colorPalette');
  if (!palette) return;

  palette.style.display = 'grid';
  palette.style.gridTemplateColumns = 'repeat(4, 1fr)';
  palette.style.gap = '12px';
  palette.style.padding = '4px';

  for (const color of PRESET_COLORS) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.dataset.color = color;

    if (color === 'border-pattern') {
      swatch.classList.add('border-preview');
    } else if (color === 'eraser') {
      swatch.classList.add('eraser-swatch');
    } else if (color === 'custom-color') {
      swatch.classList.add('custom-color');
    } else {
      swatch.style.background = color;
    }

    palette.appendChild(swatch);
  }

  // Default to first real color
  const first = palette.querySelector('[data-color]:not([data-color="border-pattern"]):not([data-color="eraser"]):not([data-color="custom-color"])');
  if (first) {
    first.classList.add('selected-swatch');
    app.currentColor = first.dataset.color;
  }
}

function wireColorPalette() {
  const palette = document.getElementById('colorPalette');
  if (!palette) return;

  palette.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;

    const color = swatch.dataset.color;

    if (color === 'custom-color') {
      const picker = document.getElementById('customColorPicker');
      if (picker) {
        picker.click();
        picker.addEventListener('input', (ev) => {
          app.currentColor = ev.target.value;
        }, { once: true });
      }
      return;
    }

    if (color === 'border-pattern') {
      app.currentColor = 'white';
    } else {
      app.currentColor = color;
    }

    // Clicking a color swatch opens the palette card if not already open,
    // which triggers paint mode via syncModeFromPanel
    const paletteCard = document.querySelector('[data-panel="1"]');
    if (paletteCard?.classList.contains('collapsed')) {
      const header = paletteCard.querySelector('.card-header');
      if (header) header.click();
    } else {
      // Already on palette - just make sure we're in paint mode
      app.mode = 'paint';
      updateModeDisplay();
    }

    palette.querySelectorAll('[data-color]').forEach(s => s.classList.remove('selected-swatch'));
    swatch.classList.add('selected-swatch');
    updateModeDisplay();
  });
}

// --- Grid Size ---

function wireGridSizeUI() {
  const panel = document.getElementById('gridSizePanel');
  if (!panel) return;

  const ui = new GridSizeUI(panel, (bounds) => {
    app.resizeGrid(bounds.minQ, bounds.maxQ, bounds.minR, bounds.maxR);
    updateStats();
  });

  ui.setBounds(app.bounds);
}

// --- Mode Toggles ---

function wireModeToggles() {
  // Boundaries - independent toggle, lives in palette card
  const boundariesBtn = document.getElementById('showBoundariesBtn');
  if (boundariesBtn) {
    boundariesBtn.addEventListener('click', () => {
      app.showBoundaries = !app.showBoundaries;
      app.toggleBoundaries(app.showBoundaries);
      boundariesBtn.classList.toggle('active', app.showBoundaries);
    });
  }

  // 3D toggle - lives in status bar
  const viewBtn = document.getElementById('show3DViewBtn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      app.show3D = !app.show3D;
      app.toggle3D(app.show3D);
      viewBtn.classList.toggle('active', app.show3D);
    });
  }

  // Height map - independent toggle, lives in palette card
  const hmBtn = document.getElementById('heightMapModeBtn');
  if (hmBtn) {
    hmBtn.addEventListener('click', () => {
      app.heightMapMode = !app.heightMapMode;
      app.toggleHeightMap(app.heightMapMode);
      hmBtn.classList.toggle('active', app.heightMapMode);
    });
  }

  // Brush size
  const brushDec = document.getElementById('brushSizeDecBtn');
  const brushInc = document.getElementById('brushSizeIncBtn');
  if (brushDec) brushDec.addEventListener('click', () => { app.brushSize = Math.max(1, app.brushSize - 1); updateBrushDisplay(); });
  if (brushInc) brushInc.addEventListener('click', () => { app.brushSize = Math.min(5, app.brushSize + 1); updateBrushDisplay(); });
}

// --- Terraform Panel ---

function wireTerraformPanel() {
  const slider = document.getElementById('depthSlider');
  const input = document.getElementById('depthInput');
  if (!slider || !input) return;

  const sync = (value) => {
    const v = Math.max(0, Math.min(100, parseInt(value) || 25));
    slider.value = v;
    input.value = v;
    app.setDepth(v);
  };

  slider.addEventListener('input', (e) => sync(e.target.value));
  slider.addEventListener('pointerdown', () => undo.beginBatch());
  slider.addEventListener('pointerup', () => undo.commitBatch());
  slider.addEventListener('pointerleave', () => undo.commitBatch());
  input.addEventListener('input', (e) => sync(e.target.value));

  const baselineInput = document.getElementById('baselineDepthInput');
  const baselineBtn = document.getElementById('applyBaselineBtn');
  if (baselineBtn && baselineInput) {
    baselineBtn.addEventListener('click', () => {
      app.setBaselineDepth(parseInt(baselineInput.value) || 25);
    });
  }

  app.on('tileSelectionChange', (keys) => {
    const info = document.getElementById('selectedTileInfo');
    if (info) info.textContent = keys.size > 0 ? `${keys.size} TILE(S)` : 'NONE';

    if (keys.size === 1) {
      const tile = app.tiles.tiles.get([...keys][0]);
      if (tile) {
        slider.value = tile.depth;
        input.value = tile.depth;
      }
    }
  });
}

// --- Building Picker ---

function wireBuildingPicker() {
  const categorySelect = document.getElementById('stampCategory');
  const buildingSelect = document.getElementById('stampSelector');
  const rotateBtn = document.getElementById('rotateStampBtn');
  const stampInfo = document.getElementById('stampInfo');
  if (!categorySelect || !buildingSelect) return;

  categorySelect.innerHTML = '';
  for (const cat of app.catalog.categories) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  }

  const populateBuildings = () => {
    buildingSelect.innerHTML = '';
    const cat = categorySelect.value;
    const buildings = app.catalog.getUniqueBuildings().filter(b => b.category === cat);

    for (const b of buildings) {
      const opt = document.createElement('option');
      opt.value = b.building.id;
      opt.textContent = `${b.baseName} (${b.size} hex)`;
      buildingSelect.appendChild(opt);
    }

    if (buildings.length > 0) {
      app.selectedStampId = buildings[0].building.id;
      updateStampInfo();
    }
  };

  const updateStampInfo = () => {
    if (!stampInfo || !app.selectedStampId) return;
    const b = app.catalog.get(app.selectedStampId);
    if (b) stampInfo.textContent = `${b.name} | ${b.size} hex | rot: ${app.stampRotation * 60}\u00B0`;
  };

  categorySelect.addEventListener('change', populateBuildings);
  buildingSelect.addEventListener('change', () => {
    app.selectedStampId = parseInt(buildingSelect.value);
    updateStampInfo();
  });

  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      app.rotateStamp(1);
      updateStampInfo();
    });
  }

  app.on('stampRotationChange', updateStampInfo);
  populateBuildings();
}

// --- Keyboard ---

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;

    // Undo - Ctrl+Z / Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      app.undo();
      updateStats();
      return;
    }

    if (e.key === 'q' || e.key === 'Q') {
      app.selectedBuildingId ? app.rotateSelectedBuilding(-1) : app.rotateStamp(-1);
    }
    if (e.key === 'e' || e.key === 'E' || e.key === 'r' || e.key === 'R') {
      app.selectedBuildingId ? app.rotateSelectedBuilding(1) : app.rotateStamp(1);
    }
    if (e.key === 'Escape') {
      app.selectedTileKeys.clear();
      app._clearSelectionHighlight();
      if (app.selectedBuildingId) {
        const old = app.buildings.get(app.selectedBuildingId);
        if (old) app.buildingRenderer.recolor(app.selectedBuildingId, old.color);
      }
      app.selectedBuildingId = null;

      // Open palette card which triggers paint mode via syncModeFromPanel
      const paletteHeader = document.querySelector('[data-panel="1"] .card-header');
      if (paletteHeader) paletteHeader.click();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && app.selectedBuildingId) {
      app.removeBuilding(app.selectedBuildingId);
      app.selectedBuildingId = null;
    }
    if (e.key === '+' || e.key === '=') { app.brushSize = Math.min(5, app.brushSize + 1); updateBrushDisplay(); }
    if (e.key === '-' || e.key === '_') { app.brushSize = Math.max(1, app.brushSize - 1); updateBrushDisplay(); }
    if (e.key === 'i' || e.key === 'I') {
      app.camera.invertZoom = !app.camera.invertZoom;
      console.log('[Zoom] invert:', app.camera.invertZoom);
    }
  });
}

// --- Status Display ---

function wireStatusDisplay() {
  const coordsDisplay = document.getElementById('coordinatesDisplay');

  app.on('hexHover', ({ q, r }) => {
    if (coordsDisplay) coordsDisplay.textContent = `Q: ${q} | R: ${r}`;
  });

  app.on('doubleClick', ({ q, r }) => {
    const current = app.labels.getText(q, r);
    const text = prompt('Label:', current);
    if (text !== null) app.setLabel(q, r, text);
  });

  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });
}

// --- File Ops ---

function wireFileOps() {
  const saveBtn = document.getElementById('saveJsonBtn');
  const loadBtn = document.getElementById('loadJsonBtn');
  const resetBtn = document.getElementById('resetBtn');
  const fileInput = document.getElementById('jsonFileInput');

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      console.log('[Save] triggered');
      const planName = document.getElementById('planName')?.value || 'settlement';
      const data = {
        version: 2,
        name: planName,
        bounds: app.bounds,
        grid: app.grid.toJSON(),
        tiles: app.tiles.toJSON(),
        buildings: [...app.buildings.values()].map(b => ({
          catalogId: b.catalogId,
          q: b.q, r: b.r,
          rotation: b.rotation,
        })),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${planName.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('[Save] done:', data.grid.hexes.length, 'hexes,', data.tiles.length, 'tiles,', data.buildings.length, 'buildings');
    });
  }

  if (loadBtn && fileInput) {
    loadBtn.addEventListener('click', () => {
      console.log('[Load] file picker opening');
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      console.log('[Load] reading file:', file.name);

      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try {
          data = JSON.parse(reader.result);
        } catch (err) {
          console.error('[Load] JSON parse failed:', err);
          alert('Invalid JSON file.');
          return;
        }
        try {
          loadPlan(data);
          console.log('[Load] plan applied');
        } catch (err) {
          console.error('[Load] apply failed:', err);
          alert('Error loading plan: ' + err.message);
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset the entire map? This cannot be undone.')) return;
      console.log('[Reset] clearing');
      app.grid.reset();
      app.tiles.generate(app.bounds);
      app._markSpacers();
      app.buildings.clear();
      app.buildingRenderer.clear();
      app.hexGrid.rebuild(app.grid);
      undo.clear();
      updateStats();
      console.log('[Reset] done');
    });
  }
}

function loadPlan(data) {
  undo.clear();
  const nameInput = document.getElementById('planName');
  if (nameInput && data.name) nameInput.value = data.name;

  if (data.bounds) {
    app.resizeGrid(data.bounds.minQ, data.bounds.maxQ, data.bounds.minR, data.bounds.maxR);
  }

  if (data.grid) {
    app.grid.fromJSON(data.grid);
    // fromJSON clears + repopulates the grid, which creates fresh HexData
    // objects without spacer flags. Re-mark them so the renderer shades
    // spacer hexes correctly.
    app._markSpacers();
    app.hexGrid.rebuild(app.grid);
  }

  if (data.tiles) {
    app.tiles.fromJSON(data.tiles);
  }

  // Replay building placements through the normal API for collision + rendering
  if (data.buildings) {
    app.buildings.clear();
    app.buildingRenderer.clear();
    const savedStamp = app.selectedStampId;
    const savedRot = app.stampRotation;
    for (const b of data.buildings) {
      app.selectedStampId = b.catalogId;
      app.stampRotation = b.rotation || 0;
      app.placeBuilding(b.q, b.r);
    }
    app.selectedStampId = savedStamp;
    app.stampRotation = savedRot;
  }

  updateStats();
}

// --- Guide Modal ---
// Handled by js/ui/walkthrough.js
function wireGuideModal() {}

// --- UI Helpers ---

function updateModeDisplay() {
  const el = document.getElementById('modeStatusDisplay');
  if (el) el.textContent = app.mode.toUpperCase() + ' MODE';
}

function updateBrushDisplay() {
  const el = document.getElementById('brushSizeDisplay');
  if (el) el.textContent = app.brushSize;
}

function updateStats() {
  const stats = app.getGridStats();
  const el = document.getElementById('gridStatsDisplay');
  if (el) el.textContent = `${stats.hexCount.toLocaleString()} hexes, ${stats.tileCount.toLocaleString()} tiles`;
}

// --- Render Loop ---
// camera.update() drives keyboard pan and momentum damping.

function wireAnimationLoop() {
  const loop = () => {
    requestAnimationFrame(loop);
    app.camera.update();
    if (app.show3D) app.hud.update(app.camera, app.tiles, app.bounds);
    app.scene.render();
  };
  loop();
}