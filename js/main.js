// Entry point. Wire the modules to the DOM.
//
// The pattern: App owns state + modules. UI elements call app methods.
// App emits events back to update UI displays. One-way data flow.

import App from './ui/app.js';
import GridSizeUI from './ui/grid-size-ui.js';

// Building data — loaded from the compact JSON.
// In production, fetch() this or embed it. For now, import.
import buildingData from '../data/buildings-planner-compact.json' with { type: 'json' };

const app = new App();

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewport');
  app.init(container, buildingData);

  wireGridSizeUI();
  wireColorPalette();
  wireModeToggles();
  wireTerraformPanel();
  wireBuildingPicker();
  wireKeyboard();
  wireStatusDisplay();
  wireAnimationLoop();
});

// --- Grid Size ---

function wireGridSizeUI() {
  const panel = document.getElementById('gridSizePanel');
  if (!panel) return;

  const ui = new GridSizeUI(panel, (bounds) => {
    app.resizeGrid(bounds.minQ, bounds.maxQ, bounds.minR, bounds.maxR);
    updateStats();
  });

  // Sync initial bounds
  ui.setBounds(app.bounds);
}

// --- Color Palette ---

function wireColorPalette() {
  const palette = document.getElementById('colorPalette');
  if (!palette) return;

  palette.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;

    const color = swatch.dataset.color;

    // Handle special swatches
    if (color === 'custom-color') {
      const picker = document.getElementById('customColorPicker');
      if (picker) {
        picker.click();
        picker.addEventListener('input', (e) => {
          app.currentColor = e.target.value;
        }, { once: true });
      }
      return;
    }

    app.currentColor = color;
    app.mode = 'paint';

    // Update active state
    palette.querySelectorAll('[data-color]').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
  });
}

// --- Mode Toggles ---

function wireModeToggles() {
  // Stamp mode
  const stampBtn = document.getElementById('stampModeBtn');
  if (stampBtn) {
    stampBtn.addEventListener('click', () => {
      app.mode = app.mode === 'stamp' ? 'paint' : 'stamp';
      stampBtn.classList.toggle('active', app.mode === 'stamp');
      updateModeDisplay();
    });
  }

  // Terraform mode
  const terraformBtn = document.getElementById('terraformModeBtn');
  if (terraformBtn) {
    terraformBtn.addEventListener('click', () => {
      app.mode = app.mode === 'terraform' ? 'paint' : 'terraform';
      terraformBtn.classList.toggle('active', app.mode === 'terraform');

      // Auto-enable boundaries in terraform mode
      if (app.mode === 'terraform' && !app.showBoundaries) {
        app.toggleBoundaries(true);
        const bBtn = document.getElementById('showBoundariesBtn');
        if (bBtn) bBtn.classList.add('active');
      }

      const panel = document.getElementById('terraformPanel');
      if (panel) panel.style.display = app.mode === 'terraform' ? 'block' : 'none';
      updateModeDisplay();
    });
  }

  // Boundaries
  const boundariesBtn = document.getElementById('showBoundariesBtn');
  if (boundariesBtn) {
    boundariesBtn.addEventListener('click', () => {
      app.showBoundaries = !app.showBoundaries;
      app.toggleBoundaries(app.showBoundaries);
      boundariesBtn.classList.toggle('active', app.showBoundaries);
    });
  }

  // 3D toggle
  const viewBtn = document.getElementById('show3DViewBtn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      app.show3D = !app.show3D;
      app.toggle3D(app.show3D);
      viewBtn.classList.toggle('active', app.show3D);
    });
  }

  // Height map
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
  input.addEventListener('input', (e) => sync(e.target.value));

  // Baseline
  const baselineInput = document.getElementById('baselineDepthInput');
  const baselineBtn = document.getElementById('applyBaselineBtn');
  if (baselineBtn && baselineInput) {
    baselineBtn.addEventListener('click', () => {
      app.setBaselineDepth(parseInt(baselineInput.value) || 25);
    });
  }

  // Update slider when tile selection changes
  app.on('tileSelectionChange', (keys) => {
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
  if (!categorySelect || !buildingSelect) return;

  // Populate categories
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
      opt.textContent = `${b.baseName} (${b.size})`;
      buildingSelect.appendChild(opt);
    }

    // Auto-select first
    if (buildings.length > 0) {
      app.selectedStampId = buildings[0].building.id;
    }
  };

  categorySelect.addEventListener('change', populateBuildings);
  buildingSelect.addEventListener('change', () => {
    app.selectedStampId = parseInt(buildingSelect.value);
  });

  populateBuildings();
}

// --- Keyboard ---

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    if (e.key === 'q' || e.key === 'Q') app.rotateStamp(-1);
    if (e.key === 'e' || e.key === 'E' || e.key === 'r' || e.key === 'R') app.rotateStamp(1);
    if (e.key === 'Escape') {
      app.selectedTileKeys.clear();
      app.selectedBuildingId = null;
      app.mode = 'paint';
      updateModeDisplay();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && app.selectedBuildingId) {
      app.removeBuilding(app.selectedBuildingId);
      app.selectedBuildingId = null;
    }
    if (e.key === '+' || e.key === '=') { app.brushSize = Math.min(5, app.brushSize + 1); updateBrushDisplay(); }
    if (e.key === '-' || e.key === '_') { app.brushSize = Math.max(1, app.brushSize - 1); updateBrushDisplay(); }
  });
}

// --- Status Display ---

function wireStatusDisplay() {
  const coordsDisplay = document.getElementById('coordinatesDisplay');
  const modeDisplay = document.getElementById('modeStatusDisplay');

  app.on('hexHover', ({ q, r }) => {
    if (coordsDisplay) coordsDisplay.textContent = `q:${q} r:${r}`;
  });

  // Double-click → text label
  app.on('doubleClick', ({ q, r }) => {
    const current = app.labels.getText(q, r);
    const text = prompt('Label:', current);
    if (text !== null) app.setLabel(q, r, text);
  });

  // Unsaved changes warning
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });
}

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
  if (el) el.textContent = `${stats.hexCount} hexes, ${stats.tileCount} tiles`;
}

// --- Render Loop ---

function wireAnimationLoop() {
  const loop = () => {
    requestAnimationFrame(loop);
    app.scene.render();
  };
  loop();
}