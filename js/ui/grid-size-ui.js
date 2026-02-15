// Grid size configuration panel.
//
// Renders into a container element. Offers three sizing modes:
//   - Radius: hex-shaped grid, single number (good for circular claims)
//   - Rectangle: W × H (good for rectangular parcels)
//   - Custom: direct min/max Q/R bounds
//
// Emits a resize callback with {minQ, maxQ, minR, maxR} whenever the
// user applies a change. Doesn't touch app state directly — the caller
// decides what to do with the new bounds.

const PRESETS = [
  { label: 'Small (30)', mode: 'radius', value: 15 },
  { label: 'Medium (60)', mode: 'radius', value: 30 },
  { label: 'Large (100)', mode: 'radius', value: 50 },
  { label: 'Huge (150)', mode: 'radius', value: 75 },
];

export default class GridSizeUI {
  constructor(container, onResize) {
    this.container = container;
    this.onResize = onResize;
    this.mode = 'radius';
    this.radius = 50;
    this.rectW = 100;
    this.rectH = 100;
    this.custom = { minQ: -50, maxQ: 49, minR: -50, maxR: 49 };

    this._build();
  }

  // Set current values from existing bounds (e.g. after loading a save).
  setBounds(bounds) {
    this.custom = { ...bounds };
    const w = bounds.maxQ - bounds.minQ + 1;
    const h = bounds.maxR - bounds.minR + 1;
    this.rectW = w;
    this.rectH = h;
    // Approximate radius from symmetric bounds
    this.radius = Math.max(Math.abs(bounds.minQ), Math.abs(bounds.maxQ),
                           Math.abs(bounds.minR), Math.abs(bounds.maxR));
    this._updateDisplay();
  }

  _build() {
    const c = this.container;
    c.innerHTML = '';

    // Presets
    const presetRow = el('div', { style: 'display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;' });
    for (const p of PRESETS) {
      const btn = el('button', { textContent: p.label, className: 'grid-preset-btn' });
      btn.addEventListener('click', () => {
        this.mode = p.mode;
        this.radius = p.value;
        this._apply();
        this._updateDisplay();
      });
      presetRow.appendChild(btn);
    }
    c.appendChild(presetRow);

    // Mode tabs
    const tabs = el('div', { style: 'display:flex;gap:4px;margin-bottom:8px;' });
    for (const m of ['radius', 'rectangle', 'custom']) {
      const btn = el('button', {
        textContent: m.charAt(0).toUpperCase() + m.slice(1),
        className: 'grid-mode-tab',
        dataset: { mode: m },
      });
      btn.addEventListener('click', () => {
        this.mode = m;
        this._updateDisplay();
      });
      tabs.appendChild(btn);
    }
    c.appendChild(tabs);
    this._tabs = tabs;

    // Radius panel
    this._radiusPanel = el('div');
    const radiusInput = inputRow('Radius', this.radius, 5, 200, (v) => { this.radius = v; });
    this._radiusPanel.appendChild(radiusInput.row);
    this._radiusInput = radiusInput.input;
    c.appendChild(this._radiusPanel);

    // Rectangle panel
    this._rectPanel = el('div');
    const wInput = inputRow('Width', this.rectW, 10, 400, (v) => { this.rectW = v; });
    const hInput = inputRow('Height', this.rectH, 10, 400, (v) => { this.rectH = v; });
    this._rectPanel.appendChild(wInput.row);
    this._rectPanel.appendChild(hInput.row);
    this._rectWInput = wInput.input;
    this._rectHInput = hInput.input;
    c.appendChild(this._rectPanel);

    // Custom panel
    this._customPanel = el('div');
    const minQIn = inputRow('Min Q', this.custom.minQ, -500, 500, (v) => { this.custom.minQ = v; });
    const maxQIn = inputRow('Max Q', this.custom.maxQ, -500, 500, (v) => { this.custom.maxQ = v; });
    const minRIn = inputRow('Min R', this.custom.minR, -500, 500, (v) => { this.custom.minR = v; });
    const maxRIn = inputRow('Max R', this.custom.maxR, -500, 500, (v) => { this.custom.maxR = v; });
    this._customPanel.appendChild(minQIn.row);
    this._customPanel.appendChild(maxQIn.row);
    this._customPanel.appendChild(minRIn.row);
    this._customPanel.appendChild(maxRIn.row);
    this._customInputs = { minQ: minQIn.input, maxQ: maxQIn.input, minR: minRIn.input, maxR: maxRIn.input };
    c.appendChild(this._customPanel);

    // Apply button
    const applyBtn = el('button', { textContent: 'Apply Grid Size', className: 'grid-apply-btn' });
    applyBtn.addEventListener('click', () => this._apply());
    c.appendChild(applyBtn);

    // Stats display
    this._stats = el('div', { className: 'grid-stats', style: 'margin-top:8px;font-size:12px;opacity:0.7;' });
    c.appendChild(this._stats);

    this._updateDisplay();
  }

  _updateDisplay() {
    // Tab highlighting
    for (const btn of this._tabs.children) {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    }

    this._radiusPanel.style.display = this.mode === 'radius' ? 'block' : 'none';
    this._rectPanel.style.display = this.mode === 'rectangle' ? 'block' : 'none';
    this._customPanel.style.display = this.mode === 'custom' ? 'block' : 'none';

    this._radiusInput.value = this.radius;
    this._rectWInput.value = this.rectW;
    this._rectHInput.value = this.rectH;
    this._customInputs.minQ.value = this.custom.minQ;
    this._customInputs.maxQ.value = this.custom.maxQ;
    this._customInputs.minR.value = this.custom.minR;
    this._customInputs.maxR.value = this.custom.maxR;

    const bounds = this._currentBounds();
    const w = bounds.maxQ - bounds.minQ + 1;
    const h = bounds.maxR - bounds.minR + 1;
    const approxHexes = w * h;
    this._stats.textContent = `~${approxHexes.toLocaleString()} hexes (${w}×${h})`;
  }

  _currentBounds() {
    if (this.mode === 'radius') {
      return { minQ: -this.radius, maxQ: this.radius, minR: -this.radius, maxR: this.radius };
    }
    if (this.mode === 'rectangle') {
      const halfW = Math.floor(this.rectW / 2);
      const halfH = Math.floor(this.rectH / 2);
      return { minQ: -halfW, maxQ: halfW, minR: -halfH, maxR: halfH };
    }
    return { ...this.custom };
  }

  _apply() {
    const bounds = this._currentBounds();
    this._updateDisplay();
    if (this.onResize) this.onResize(bounds);
  }
}

// --- DOM helpers ---

function el(tag, props = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'textContent') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'className') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e[k] = v;
  }
  return e;
}

function inputRow(label, value, min, max, onChange) {
  const row = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;' });
  const lbl = el('label', { textContent: label, style: 'min-width:50px;font-size:13px;' });
  const input = el('input', { style: 'width:70px;' });
  input.type = 'number';
  input.value = value;
  input.min = min;
  input.max = max;
  input.addEventListener('input', () => {
    const v = Math.max(min, Math.min(max, parseInt(input.value) || 0));
    onChange(v);
  });
  row.appendChild(lbl);
  row.appendChild(input);
  return { row, input };
}