// Inline HSL color picker for the palette card.
// Replaces the native <input type="color"> which is buggy cross-browser.
//
// Layout (fits in ~260px panel):
//   [ SL square (hue-tinted) ] [ Hue strip ]
//   [ hex input ] [ preview swatch ]
//
// Usage:
//   const picker = new ColorPicker(parentEl, hex => app.currentColor = hex);
//   picker.open('#ff8800');
//   picker.close();

const SL_SIZE = 180;
const HUE_W = 20;
const HUE_H = SL_SIZE;

// Theme - matches index.css
const C = {
  bg1:      '#1c1917',
  bg2:      '#272220',
  border:   '#2c2623',
  fg0:      '#d4cbc4',
  fg2:      '#5e554f',
  accent:   '#d4956a',
};

export default class ColorPicker {
  constructor(parent, onChange) {
    this._parent = parent;
    this._onChange = onChange;
    this._el = null;
    this._slCanvas = null;
    this._slCtx = null;
    this._hueCanvas = null;
    this._hueCtx = null;
    this._hexInput = null;
    this._preview = null;
    this._open = false;

    // HSL state (H: 0-360, S: 0-1, L: 0-1)
    this._h = 0;
    this._s = 1;
    this._l = 0.5;

    // Drag state
    this._draggingSL = false;
    this._draggingHue = false;
  }

  get isOpen() { return this._open; }

  open(hexColor) {
    if (!this._el) this._build();
    if (hexColor && /^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      this._setFromHex(hexColor);
    }
    this._el.style.display = '';
    this._open = true;
    this._renderSL();
    this._renderHue();
    this._updateUI();
  }

  close() {
    if (!this._open) return;
    if (this._el) this._el.style.display = 'none';
    this._open = false;
  }

  toggle(hexColor) {
    this._open ? this.close() : this.open(hexColor);
  }

  // -- DOM --

  _build() {
    const el = document.createElement('div');
    el.className = 'cpk';

    // Top row: SL square + hue bar
    const row = document.createElement('div');
    row.className = 'cpk-canvases';

    const slCanvas = document.createElement('canvas');
    slCanvas.className = 'cpk-sl';
    slCanvas.width = SL_SIZE;
    slCanvas.height = SL_SIZE;
    row.appendChild(slCanvas);

    const hueCanvas = document.createElement('canvas');
    hueCanvas.className = 'cpk-hue';
    hueCanvas.width = HUE_W;
    hueCanvas.height = HUE_H;
    row.appendChild(hueCanvas);

    el.appendChild(row);

    // Bottom row: hex input + preview
    const bottom = document.createElement('div');
    bottom.className = 'cpk-bottom';

    const hashLabel = document.createElement('span');
    hashLabel.className = 'cpk-hash';
    hashLabel.textContent = '#';
    bottom.appendChild(hashLabel);

    const hexInput = document.createElement('input');
    hexInput.className = 'cpk-hex term-input';
    hexInput.type = 'text';
    hexInput.maxLength = 6;
    hexInput.spellcheck = false;
    hexInput.setAttribute('aria-label', 'Hex color');
    bottom.appendChild(hexInput);

    const preview = document.createElement('div');
    preview.className = 'cpk-preview';
    bottom.appendChild(preview);

    el.appendChild(bottom);

    this._parent.appendChild(el);
    this._el = el;
    this._slCanvas = slCanvas;
    this._slCtx = slCanvas.getContext('2d');
    this._hueCanvas = hueCanvas;
    this._hueCtx = hueCanvas.getContext('2d');
    this._hexInput = hexInput;
    this._preview = preview;

    this._wireEvents();
  }

  _wireEvents() {
    // SL canvas
    const slDown = (e) => {
      this._draggingSL = true;
      this._pickSL(e);
    };
    this._slCanvas.addEventListener('pointerdown', slDown);

    // Hue canvas
    const hueDown = (e) => {
      this._draggingHue = true;
      this._pickHue(e);
    };
    this._hueCanvas.addEventListener('pointerdown', hueDown);

    // Shared move/up on window so drag works outside canvas bounds
    window.addEventListener('pointermove', (e) => {
      if (this._draggingSL) this._pickSL(e);
      if (this._draggingHue) this._pickHue(e);
    });
    window.addEventListener('pointerup', () => {
      this._draggingSL = false;
      this._draggingHue = false;
    });

    // Hex input
    this._hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._applyHexInput();
      }
      // Stop propagation so typing hex doesn't trigger app shortcuts
      e.stopPropagation();
    });
    this._hexInput.addEventListener('blur', () => this._applyHexInput());
  }

  // -- Interaction --

  _pickSL(e) {
    const rect = this._slCanvas.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, SL_SIZE);
    const y = clamp(e.clientY - rect.top, 0, SL_SIZE);

    // x axis = saturation (0 left to 1 right)
    // y axis = lightness (1 top to 0 bottom)
    this._s = x / SL_SIZE;
    this._l = 1 - (y / SL_SIZE);
    this._emitColor();
    this._renderSL();  // redraw crosshair
    this._updateUI();
  }

  _pickHue(e) {
    const rect = this._hueCanvas.getBoundingClientRect();
    const y = clamp(e.clientY - rect.top, 0, HUE_H);
    this._h = (y / HUE_H) * 360;
    this._emitColor();
    this._renderSL();  // SL gradient changes with hue
    this._renderHue(); // redraw indicator
    this._updateUI();
  }

  _applyHexInput() {
    const raw = this._hexInput.value.replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      this._setFromHex('#' + raw);
      this._renderSL();
      this._renderHue();
      this._updateUI();
      this._emitColor();
    } else {
      // Revert to current color
      this._updateUI();
    }
  }

  _emitColor() {
    const hex = hslToHex(this._h, this._s, this._l);
    this._onChange(hex);
  }

  // -- Rendering --

  _renderSL() {
    const ctx = this._slCtx;
    const w = SL_SIZE;
    const h = SL_SIZE;

    // Draw the SL gradient for current hue.
    // Each pixel: x maps to saturation, y maps to lightness.
    // Using ImageData for per-pixel control.
    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let y = 0; y < h; y++) {
      const l = 1 - y / h;
      for (let x = 0; x < w; x++) {
        const s = x / w;
        const [r, g, b] = hslToRgb(this._h, s, l);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Crosshair at current S,L
    const cx = this._s * w;
    const cy = (1 - this._l) * h;

    ctx.strokeStyle = this._l > 0.5 ? '#000' : '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  _renderHue() {
    const ctx = this._hueCtx;
    const w = HUE_W;
    const h = HUE_H;

    // Vertical hue gradient, full saturation/lightness
    for (let y = 0; y < h; y++) {
      const hue = (y / h) * 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(0, y, w, 1);
    }

    // Indicator line at current hue
    const iy = (this._h / 360) * h;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, iy);
    ctx.lineTo(w, iy);
    ctx.stroke();

    // Darken the stroke edges so it's visible on bright hues
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, iy - 1);
    ctx.lineTo(w, iy - 1);
    ctx.moveTo(0, iy + 1);
    ctx.lineTo(w, iy + 1);
    ctx.stroke();
  }

  _updateUI() {
    const hex = hslToHex(this._h, this._s, this._l);
    this._hexInput.value = hex.slice(1);
    this._preview.style.background = hex;
  }

  // -- Color conversion --

  _setFromHex(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    this._l = (max + min) / 2;

    if (d === 0) {
      this._h = 0;
      this._s = 0;
    } else {
      this._s = this._l > 0.5
        ? d / (2 - max - min)
        : d / (max + min);

      if (max === r) this._h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) this._h = ((b - r) / d + 2) * 60;
      else this._h = ((r - g) / d + 4) * 60;
    }
  }
}

// -- Pure color math --

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }