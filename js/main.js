// Entry point. Wire the modules to the DOM.
//
// The pattern: App owns state + modules. UI elements call app methods.
// App emits events back to update UI displays. One-way data flow.

import App from './ui/app.js';
import GridSizeUI from './ui/grid-size-ui.js';

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
// Click a card-header to expand/collapse. Only one open at a time
// so the sidebar doesn't overflow. Spectrum starts expanded.

function wireAccordionCards() {
  const cards = document.querySelectorAll('.control-card');
  for (const card of cards) {
    const header = card.querySelector('.card-header');
    if (!header) continue;

    // Click anywhere on the header to toggle
    header.addEventListener('click', () => {
      const wasCollapsed = card.classList.contains('collapsed');
      // Collapse all others
      for (const c of cards) c.classList.add('collapsed');
      // Toggle the clicked one
      if (wasCollapsed) card.classList.remove('collapsed');
    });

    // When collapsed, clicking the card body area (which is hidden but
    // the card padding is still there) should also expand
    card.addEventListener('click', (e) => {
      if (!card.classList.contains('collapsed')) return;
      // Only if the click wasn't on the header (which handles itself)
      if (header.contains(e.target)) return;
      const wasCollapsed = true;
      for (const c of cards) c.classList.add('collapsed');
      card.classList.remove('collapsed');
    });
  }
}

// --- Color Palette ---
// Populates #colorPalette with swatch divs. Must run before wireColorPalette.
// Old code used CONFIG.PRESET_COLORS + AppState.dom.colorGrid -- this replaces both.

const PRESET_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63',
  '#ff6b35', '#00ff88', '#00ffff', '#8b5cf6',
  '#795548', '#607d8b', '#ffffff', '#2a2838',
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
    app.mode = 'paint';

    // Deactivate stamp mode if it was on
    const stampBtn = document.getElementById('stampModeBtn');
    const stampsPanel = document.getElementById('stampsPanel');
    if (stampBtn) stampBtn.classList.remove('active');
    if (stampsPanel) stampsPanel.style.display = 'none';

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
  // Stamp mode -- toggles both mode AND panel visibility
  const stampBtn = document.getElementById('stampModeBtn');
  const stampsPanel = document.getElementById('stampsPanel');
  if (stampBtn) {
    stampBtn.addEventListener('click', () => {
      const entering = app.mode !== 'stamp';
      app.mode = entering ? 'stamp' : 'paint';
      stampBtn.classList.toggle('active', entering);
      if (stampsPanel) stampsPanel.style.display = entering ? 'flex' : 'none';
      updateModeDisplay();
    });
  }

  // Terraform mode
  const terraformBtn = document.getElementById('terraformModeBtn');
  if (terraformBtn) {
    terraformBtn.addEventListener('click', () => {
      const entering = app.mode !== 'terraform';
      app.mode = entering ? 'terraform' : 'paint';
      terraformBtn.classList.toggle('active', entering);

      if (entering && !app.showBoundaries) {
        app.showBoundaries = true;
        app.toggleBoundaries(true);
        const bBtn = document.getElementById('showBoundariesBtn');
        if (bBtn) bBtn.classList.add('active');
      }

      const panel = document.getElementById('terraformPanel');
      if (panel) panel.style.display = entering ? 'block' : 'none';
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

    if (e.key === 'q' || e.key === 'Q') app.rotateStamp(-1);
    if (e.key === 'e' || e.key === 'E' || e.key === 'r' || e.key === 'R') app.rotateStamp(1);
    if (e.key === 'Escape') {
      app.selectedTileKeys.clear();
      app.selectedBuildingId = null;
      app.mode = 'paint';

      const stampsPanel = document.getElementById('stampsPanel');
      const stampBtn = document.getElementById('stampModeBtn');
      if (stampsPanel) stampsPanel.style.display = 'none';
      if (stampBtn) stampBtn.classList.remove('active');

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
    });
  }

  if (loadBtn && fileInput) {
    loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          loadPlan(data);
        } catch (err) {
          console.error('Failed to load plan:', err);
          alert('Failed to load plan file.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset the entire map? This cannot be undone.')) return;
      app.grid.reset();
      app.tiles.generate(app.bounds);
      app.buildings.clear();
      app.buildingRenderer.clear();
      app.hexGrid.rebuild(app.grid);
      updateStats();
    });
  }
}

function loadPlan(data) {
  const nameInput = document.getElementById('planName');
  if (nameInput && data.name) nameInput.value = data.name;

  if (data.bounds) {
    app.resizeGrid(data.bounds.minQ, data.bounds.maxQ, data.bounds.minR, data.bounds.maxR);
  }

  if (data.grid) {
    app.grid.fromJSON(data.grid);
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
    app.scene.render();
  };
  loop();
}