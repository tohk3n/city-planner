// Text labels floating above hexes in 3D space.
//
// Uses Three.js CSS2DRenderer — labels are real DOM elements positioned
// by the GPU projection, so they stay crisp at any zoom and don't burn
// draw calls. The CSS2DRenderer itself lives on SceneManager; this module
// just creates/removes the CSS2DObject wrappers.
//
// Labels live in the same scene as terrain and buildings. The CSS2D layer
// composites on top with pointerEvents:none so it never blocks hex clicks.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { axialToPixel } from '../core/hex-math.js';

const LABEL_Y_OFFSET = 5; // float slightly above terrain surface

export default class LabelRenderer {
  constructor(scene, hexSize) {
    this.scene = scene;
    this.hexSize = hexSize;
    this.labels = new Map(); // "q,r" → CSS2DObject
    this.offset = { x: 0, z: 0 };
    this._getTerrainHeight = () => 0;
  }

  setTerrainHeightFn(fn) {
    this._getTerrainHeight = fn;
  }

  setOffset(x, z) {
    this.offset.x = x;
    this.offset.z = z;
  }

  // Set or update label text at a hex. Empty string removes the label.
  set(q, r, text) {
    const key = `${q},${r}`;

    if (!text || text.trim() === '') {
      this.remove(q, r);
      return;
    }

    let obj = this.labels.get(key);

    if (obj) {
      // Update existing label text
      obj.element.textContent = text;
    } else {
      const el = document.createElement('div');
      el.className = 'hex-label-3d';
      el.textContent = text;
      applyDefaultStyle(el);

      obj = new CSS2DObject(el);
      this.labels.set(key, obj);
      this.scene.add(obj);
    }

    this._position(obj, q, r);
  }

  remove(q, r) {
    const key = `${q},${r}`;
    const obj = this.labels.get(key);
    if (!obj) return;
    this.scene.remove(obj);
    obj.element.remove();
    this.labels.delete(key);
  }

  has(q, r) {
    return this.labels.has(`${q},${r}`);
  }

  getText(q, r) {
    const obj = this.labels.get(`${q},${r}`);
    return obj ? obj.element.textContent : '';
  }

  // Rebuild all label positions (after terrain depth change or offset change).
  refreshPositions() {
    for (const [key, obj] of this.labels) {
      const [q, r] = key.split(',').map(Number);
      this._position(obj, q, r);
    }
  }

  // Bulk load from a Map or array of {q, r, text}.
  loadAll(entries) {
    this.clear();
    for (const entry of entries) {
      if (entry.text) this.set(entry.q, entry.r, entry.text);
    }
  }

  // Export all labels as [{q, r, text}].
  toJSON() {
    const result = [];
    for (const [key, obj] of this.labels) {
      const [q, r] = key.split(',').map(Number);
      result.push({ q, r, text: obj.element.textContent });
    }
    return result;
  }

  clear() {
    for (const [key, obj] of this.labels) {
      this.scene.remove(obj);
      obj.element.remove();
    }
    this.labels.clear();
  }

  dispose() {
    this.clear();
  }

  _position(obj, q, r) {
    const px = axialToPixel(q, r, this.hexSize);
    const y = this._getTerrainHeight(q, r) + LABEL_Y_OFFSET;
    obj.position.set(px.x - this.offset.x, y, px.y - this.offset.z);
  }
}

function applyDefaultStyle(el) {
  el.style.cssText = [
    'color: #fff',
    'font-family: monospace',
    'font-size: 13px',
    'font-weight: bold',
    'text-shadow: 0 0 4px #000, 0 0 8px #000',
    'pointer-events: none',
    'white-space: nowrap',
    'user-select: none',
  ].join(';');
}