// Minimap overlay for perspective (3D) mode.
// Single canvas: terrain overview + camera frustum + compass rose.
// Top-right of viewport. No extra DOM beyond one wrapper + one canvas.
//
// Lifecycle: create once, show/hide with 3D toggle, call update() per frame.

import { axialToPixel } from '../core/hex-math.js';

const MAP_W = 160;
const MAP_H = 160;

const COMPASS_FONT = '7px monospace';
const COMPASS_BOLD = '600 8px monospace';

// Theme colors - mirrors index.css :root, hardcoded to skip DOM lookups.
const C = {
  bg:       '#1c1917',
  bgDark:   '#121010',
  border:   '#2c2623',
  borderHi: '#3f3835',
  fg0:      '#d4cbc4',
  fg1:      '#968a82',
  fg2:      '#5e554f',
  accent:   '#d4956a',
  accent4:  '#e07850',
};

export default class ViewportHUD {
  constructor(viewport, hexSize) {
    this._viewport = viewport;
    this._hexSize = hexSize;
    this._el = null;
    this._canvas = null;
    this._ctx = null;
    this._visible = false;
  }

  show() {
    if (this._visible) return;
    if (!this._el) this._build();
    this._el.style.display = '';
    this._visible = true;
  }

  hide() {
    if (!this._visible) return;
    if (this._el) this._el.style.display = 'none';
    this._visible = false;
  }

  // Per-frame. Redraws the whole canvas (it's tiny, no partial-update needed).
  update(cam, tiles, bounds) {
    if (!this._visible || !this._ctx) return;
    const ctx = this._ctx;

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = C.bgDark;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    this._drawTerrain(ctx, tiles, bounds);
    this._drawCamera(ctx, cam, bounds);
    this._drawCompass(ctx, cam);
    this._drawBorder(ctx);
  }

  dispose() {
    if (this._el) { this._el.remove(); this._el = null; }
    this._canvas = null;
    this._ctx = null;
    this._visible = false;
  }

  // -- DOM --

  _build() {
    const wrap = document.createElement('div');
    wrap.className = 'hud-minimap';
    wrap.style.display = 'none';

    const label = document.createElement('div');
    label.className = 'hud-minimap-label';
    label.textContent = 'map';
    wrap.appendChild(label);

    const canvas = document.createElement('canvas');
    canvas.className = 'hud-minimap-canvas';
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    wrap.appendChild(canvas);

    this._viewport.appendChild(wrap);
    this._el = wrap;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
  }

  // -- Canvas layers --

  _worldTransform(bounds) {
    const size = this._hexSize;
    const minPx = axialToPixel(bounds.minQ, bounds.minR, size);
    const maxPx = axialToPixel(bounds.maxQ, bounds.maxR, size);
    const worldW = maxPx.x - minPx.x;
    const worldH = maxPx.y - minPx.y;
    if (worldW === 0 || worldH === 0) return null;

    // Inset from edges so compass labels don't overlap terrain
    const inset = 18;
    const scale = Math.min(
      (MAP_W - inset * 2) / worldW,
      (MAP_H - inset * 2) / worldH,
    );
    return {
      scale,
      cx: MAP_W / 2,
      cy: MAP_H / 2,
      midX: (minPx.x + maxPx.x) / 2,
      midY: (minPx.y + maxPx.y) / 2,
    };
  }

  _drawTerrain(ctx, tiles, bounds) {
    const t = this._worldTransform(bounds);
    if (!t) return;

    ctx.globalAlpha = 0.5;
    for (const tile of tiles.tiles.values()) {
      const px = axialToPixel(tile.q, tile.r, this._hexSize);
      const sx = (px.x - t.midX) * t.scale + t.cx;
      const sy = (px.y - t.midY) * t.scale + t.cy;
      ctx.fillStyle = depthColor(tile.depth);
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    ctx.globalAlpha = 1.0;
  }

  _drawCamera(ctx, cam, bounds) {
    if (!cam) return;
    const t = this._worldTransform(bounds);
    if (!t) return;

    // cam.target lives on the Three.js XZ plane.
    // world-x = pixel-x, world-z = pixel-y (axialToPixel convention).
    const sx = (cam.target.x) * t.scale + t.cx;
    const sy = (cam.target.z) * t.scale + t.cy;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-cam.spherical.theta);

    // View cone
    ctx.fillStyle = C.accent + '33';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 18, -Math.PI / 5, Math.PI / 5);
    ctx.closePath();
    ctx.fill();

    // Direction line
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -12);
    ctx.stroke();

    // Dot
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawCompass(ctx, cam) {
    // Terrain is drawn in fixed world orientation (north = canvas up).
    // Cardinals are fixed labels so you always know which edge is which.
    // The camera cone already shows look direction.
    const cx = MAP_W / 2;
    const cy = MAP_H / 2;

    const cardinals = [
      { label: 'N', x: cx,          y: 8,           highlight: true },
      { label: 'S', x: cx,          y: MAP_H - 6,   highlight: false },
      { label: 'E', x: MAP_W - 6,   y: cy,          highlight: false },
      { label: 'W', x: 7,           y: cy,          highlight: false },
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const c of cardinals) {
      ctx.font = c.highlight ? COMPASS_BOLD : COMPASS_FONT;
      ctx.fillStyle = c.highlight ? C.accent4 : C.fg2;
      ctx.fillText(c.label, c.x, c.y);
    }
  }

  _drawBorder(ctx) {
    ctx.strokeStyle = C.borderHi;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MAP_W - 1, MAP_H - 1);
  }
}

// Simplified depth palette for the minimap overview.
function depthColor(depth) {
  if (depth < 20) return '#0066cc';
  if (depth < 25) return '#0099ff';
  if (depth < 30) return '#44aa44';
  if (depth < 45) return '#66cc44';
  if (depth < 65) return '#cccc00';
  if (depth < 85) return '#ff9900';
  return '#cc3300';
}