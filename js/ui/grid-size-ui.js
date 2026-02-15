// Grid size — maps Bitcraft claim tiers to hex grid bounds.
//
// In-game, settlements start small and unlock larger claims as they
// tier up. Claims go from ~1k to ~10k tile hexes in increments of ~1k.
// This UI exposes that as a simple slider so players think in game
// terms, not coordinate math.
//
// "Advanced" toggle reveals the raw radius/rect/custom controls for
// people who need exact bounds (modders, testing, etc).
//
// The radius-to-tile-count mapping was computed by actually running
// the spacer test across all hexes at each radius. The 7/9 ratio
// is asymptotic; exact counts vary by lattice alignment.

import { isSpacerHex } from '../core/tile-system.js';

// Pre-computed: radius that gets closest to each 1k tier.
// Exact tile counts from brute-force spacer test, not estimates.
const CLAIM_TIERS = [
  { label: 'Tier 1',  target: 1000,  radius: 17, tiles: 949   },
  { label: 'Tier 2',  target: 2000,  radius: 25, tiles: 2023  },
  { label: 'Tier 3',  target: 3000,  radius: 31, tiles: 3087  },
  { label: 'Tier 4',  target: 4000,  radius: 35, tiles: 3913  },
  { label: 'Tier 5',  target: 5000,  radius: 40, tiles: 5103  },
  { label: 'Tier 6',  target: 6000,  radius: 43, tiles: 5887  },
  { label: 'Tier 7',  target: 7000,  radius: 47, tiles: 7009  },
  { label: 'Tier 8',  target: 8000,  radius: 50, tiles: 7923  },
  { label: 'Tier 9',  target: 9000,  radius: 53, tiles: 8893  },
  { label: 'Tier 10', target: 10000, radius: 56, tiles: 9919  },
];

export default class GridSizeUI {
  constructor(container, onResize) {
    this.container = container;
    this.onResize = onResize;

    // Default: Tier 5 (~5k tiles)
    this.tierIndex = 4;

    // Advanced mode state (hidden by default)
    this._advanced = false;
    this._advMode = 'radius';
    this._advRadius = 50;
    this._advRectW = 100;
    this._advRectH = 100;
    this._advCustom = { minQ: -50, maxQ: 49, minR: -50, maxR: 49 };

    this._build();
  }

  // Restore from saved bounds (loading a plan file).
  // Try to match a tier; fall back to advanced if it doesn't fit.
  setBounds(bounds) {
    const radius = Math.max(Math.abs(bounds.minQ), Math.abs(bounds.maxQ),
                            Math.abs(bounds.minR), Math.abs(bounds.maxR));
    const w = bounds.maxQ - bounds.minQ + 1;
    const h = bounds.maxR - bounds.minR + 1;

    const tierMatch = CLAIM_TIERS.findIndex(t => t.radius === radius);
    if (tierMatch >= 0 && w === h) {
      this.tierIndex = tierMatch;
      this._advanced = false;
    } else {
      this._advanced = true;
      this._advRadius = radius;
      this._advRectW = w;
      this._advRectH = h;
      this._advCustom = { ...bounds };
    }

    this._updateDisplay();
  }

  _build() {
    const c = this.container;
    c.innerHTML = '';

    // -- Tier slider --
    this._tierSection = el('div');

    const sliderRow = el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px;' });
    this._tierSlider = el('input', { style: 'flex:1;accent-color:var(--accent-cyan);' });
    this._tierSlider.type = 'range';
    this._tierSlider.min = 0;
    this._tierSlider.max = CLAIM_TIERS.length - 1;
    this._tierSlider.value = this.tierIndex;
    this._tierSlider.addEventListener('input', () => {
      this.tierIndex = parseInt(this._tierSlider.value);
      this._updateTierDisplay();
    });
    sliderRow.appendChild(this._tierSlider);
    this._tierSection.appendChild(sliderRow);

    this._tierInfo = el('div', {
      style: 'text-align:center;font-family:"Orbitron",monospace;font-size:13px;color:var(--accent-cyan);margin-bottom:8px;',
    });
    this._tierSection.appendChild(this._tierInfo);

    const applyBtn = el('button', {
      textContent: 'APPLY CLAIM SIZE',
      className: 'grid-apply-btn',
    });
    applyBtn.addEventListener('click', () => this._applyTier());
    this._tierSection.appendChild(applyBtn);

    c.appendChild(this._tierSection);

    // -- Advanced toggle (small, out of the way) --
    const advToggle = el('button', {
      textContent: 'ADVANCED \u25b8',
      style: 'background:none;border:none;color:var(--text-muted);font-family:"Rajdhani",sans-serif;font-size:11px;cursor:pointer;padding:4px 0;margin-top:6px;',
    });
    advToggle.addEventListener('click', () => {
      this._advanced = !this._advanced;
      this._updateDisplay();
    });
    c.appendChild(advToggle);
    this._advToggle = advToggle;

    // -- Advanced panel --
    this._advPanel = el('div', { style: 'margin-top:8px;' });

    const tabs = el('div', { style: 'display:flex;gap:4px;margin-bottom:8px;' });
    for (const m of ['radius', 'rectangle', 'custom']) {
      const btn = el('button', {
        textContent: m.charAt(0).toUpperCase() + m.slice(1),
        className: 'grid-mode-tab',
        dataset: { mode: m },
      });
      btn.addEventListener('click', () => { this._advMode = m; this._updateDisplay(); });
      tabs.appendChild(btn);
    }
    this._advPanel.appendChild(tabs);
    this._advTabs = tabs;

    this._advRadiusPanel = el('div');
    const ri = inputRow('Radius', this._advRadius, 5, 200, v => { this._advRadius = v; });
    this._advRadiusPanel.appendChild(ri.row);
    this._advRadiusInput = ri.input;
    this._advPanel.appendChild(this._advRadiusPanel);

    this._advRectPanel = el('div');
    const wi = inputRow('Width', this._advRectW, 10, 400, v => { this._advRectW = v; });
    const hi = inputRow('Height', this._advRectH, 10, 400, v => { this._advRectH = v; });
    this._advRectPanel.appendChild(wi.row);
    this._advRectPanel.appendChild(hi.row);
    this._advRectWInput = wi.input;
    this._advRectHInput = hi.input;
    this._advPanel.appendChild(this._advRectPanel);

    this._advCustomPanel = el('div');
    const ci = {};
    for (const k of ['minQ', 'maxQ', 'minR', 'maxR']) {
      const row = inputRow(k, this._advCustom[k], -500, 500, v => { this._advCustom[k] = v; });
      this._advCustomPanel.appendChild(row.row);
      ci[k] = row.input;
    }
    this._advCustomInputs = ci;
    this._advPanel.appendChild(this._advCustomPanel);

    const advApply = el('button', { textContent: 'APPLY', className: 'grid-apply-btn' });
    advApply.addEventListener('click', () => this._applyAdvanced());
    this._advPanel.appendChild(advApply);

    c.appendChild(this._advPanel);

    // -- Stats readout --
    this._stats = el('div', {
      className: 'grid-stats',
      style: 'margin-top:8px;font-size:12px;opacity:0.7;',
    });
    c.appendChild(this._stats);

    this._updateDisplay();
  }

  _updateDisplay() {
    this._updateTierDisplay();
    this._advPanel.style.display = this._advanced ? 'block' : 'none';
    this._advToggle.textContent = this._advanced ? 'ADVANCED \u25be' : 'ADVANCED \u25b8';

    if (this._advanced) {
      for (const btn of this._advTabs.children) {
        btn.classList.toggle('active', btn.dataset.mode === this._advMode);
      }
      this._advRadiusPanel.style.display = this._advMode === 'radius' ? 'block' : 'none';
      this._advRectPanel.style.display = this._advMode === 'rectangle' ? 'block' : 'none';
      this._advCustomPanel.style.display = this._advMode === 'custom' ? 'block' : 'none';

      this._advRadiusInput.value = this._advRadius;
      this._advRectWInput.value = this._advRectW;
      this._advRectHInput.value = this._advRectH;
      for (const k of ['minQ', 'maxQ', 'minR', 'maxR']) {
        this._advCustomInputs[k].value = this._advCustom[k];
      }
    }
  }

  _updateTierDisplay() {
    const tier = CLAIM_TIERS[this.tierIndex];
    this._tierSlider.value = this.tierIndex;
    this._tierInfo.textContent = `${tier.label} \u00b7 ~${tier.target.toLocaleString()} tiles`;
  }

  _applyTier() {
    const tier = CLAIM_TIERS[this.tierIndex];
    const r = tier.radius;
    const bounds = { minQ: -r, maxQ: r, minR: -r, maxR: r };
    this._showStats(bounds, tier.tiles);
    if (this.onResize) this.onResize(bounds);
  }

  _applyAdvanced() {
    const bounds = this._advancedBounds();
    const tileCount = countTileHexes(bounds);
    this._showStats(bounds, tileCount);
    if (this.onResize) this.onResize(bounds);
  }

  _advancedBounds() {
    if (this._advMode === 'radius') {
      const r = this._advRadius;
      return { minQ: -r, maxQ: r, minR: -r, maxR: r };
    }
    if (this._advMode === 'rectangle') {
      const halfW = Math.floor(this._advRectW / 2);
      const halfH = Math.floor(this._advRectH / 2);
      return { minQ: -halfW, maxQ: halfW, minR: -halfH, maxR: halfH };
    }
    return { ...this._advCustom };
  }

  _showStats(bounds, tileCount) {
    const w = bounds.maxQ - bounds.minQ + 1;
    const h = bounds.maxR - bounds.minR + 1;
    this._stats.textContent = `${tileCount.toLocaleString()} tile hexes (${w}\u00d7${h} grid)`;
  }
}

// Brute-force tile count. Only runs when user clicks Apply,
// so O(n^2) over bounds is totally fine.
function countTileHexes(bounds) {
  let count = 0;
  for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      if (!isSpacerHex(q, r)) count++;
    }
  }
  return count;
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