// Sparse hex grid storage with dynamic bounds and change tracking.
// Hexes are keyed by axial "q,r" strings in a Map. Only non-default
// hexes survive serialization — the grid reconstructs from bounds
// alone, with modifications layered on top.

import { hexKey, axialDistance, getHexesInRadius, inBounds as axialInBounds } from './hex-math.js';

export const DEFAULT_COLOR = '#2a2838';
const PATTERN_COLOR = 'white';

// -- Bounds factories --

export function rectBounds(minQ, maxQ, minR, maxR) {
  return { type: 'rect', minQ, maxQ, minR, maxR };
}

export function hexBounds(radius, cq = 0, cr = 0) {
  return { type: 'hex', radius, cq, cr };
}

// -- HexData --

export class HexData {
  constructor(q, r) {
    this.q = q;
    this.r = r;
    this.terrainColor = DEFAULT_COLOR;
    this.patterned = false;
    this.text = '';
    this.buildingId = null;
  }

  get displayColor() {
    return this.patterned ? PATTERN_COLOR : this.terrainColor;
  }

  get isDefault() {
    return this.terrainColor === DEFAULT_COLOR &&
           !this.patterned &&
           this.text === '' &&
           this.buildingId === null;
  }

  _reset() {
    this.terrainColor = DEFAULT_COLOR;
    this.patterned = false;
    this.text = '';
    this.buildingId = null;
  }
}

// -- HexGrid --

export class HexGrid {
  constructor(bounds) {
    this._hexes = new Map();
    this._dirty = new Set();
    this._fullRebuild = false;
    this.bounds = bounds;
    this._populate(bounds);
  }

  // -- Accessors --

  get hexCount() { return this._countInBounds(); }
  get storageSize() { return this._hexes.size; }
  get hasChanges() { return this._dirty.size > 0 || this._fullRebuild; }

  has(q, r) { return this._hexes.has(hexKey(q, r)); }

  get(q, r) {
    return this._hexes.get(hexKey(q, r)) || null;
  }

  getOrCreate(q, r) {
    const key = hexKey(q, r);
    let hex = this._hexes.get(key);
    if (!hex) {
      hex = new HexData(q, r);
      this._hexes.set(key, hex);
    }
    return hex;
  }

  inBounds(q, r) {
    return this._checkBounds(q, r, this.bounds);
  }

  // -- Mutations (all return true/false for whether anything changed) --

  setColor(q, r, color) {
    const hex = this.get(q, r);
    if (!hex) return false;
    if (hex.terrainColor === color && !hex.patterned) return false;

    hex.terrainColor = color;
    hex.patterned = false;
    this._markDirty(q, r);
    return true;
  }

  setPattern(q, r, patterned) {
    const hex = this.get(q, r);
    if (!hex) return false;
    if (hex.buildingId) return false;
    if (hex.patterned === patterned) return false;

    hex.patterned = patterned;
    this._markDirty(q, r);
    return true;
  }

  setText(q, r, text) {
    const hex = this.get(q, r);
    if (!hex) return false;
    if (hex.text === text) return false;

    hex.text = text;
    this._markDirty(q, r);
    return true;
  }

  assignBuilding(q, r, buildingId) {
    const hex = this.get(q, r);
    if (!hex) return false;

    hex.buildingId = buildingId;
    this._markDirty(q, r);
    return true;
  }

  clearBuilding(q, r) {
    const hex = this.get(q, r);
    if (!hex || hex.buildingId === null) return false;

    hex.buildingId = null;
    this._markDirty(q, r);
    return true;
  }

  erase(q, r) {
    const hex = this.get(q, r);
    if (!hex) return { erased: false, buildingId: null };

    const buildingId = hex.buildingId;
    hex._reset();
    this._markDirty(q, r);
    return { erased: true, buildingId };
  }

  // -- Bulk operations --

  paintRadius(cq, cr, radius, color) {
    const targets = getHexesInRadius(cq, cr, radius);
    let count = 0;
    for (const { q, r } of targets) {
      if (this.has(q, r) && this.inBounds(q, r)) {
        if (this.setColor(q, r, color)) count++;
      }
    }
    return count;
  }

  reset() {
    this._hexes.forEach(hex => hex._reset());
    this._fullRebuild = true;
  }

  // -- Bounds management --

  setBounds(newBounds) {
    this.bounds = newBounds;
    this._populate(newBounds);
    this._fullRebuild = true;
  }

  requestFullRebuild() {
    this._fullRebuild = true;
  }

  // -- Change tracking --
  // Renderer calls consumeChanges() each frame. Gets the dirty set
  // and fullRebuild flag, then both are cleared. Grid mutates,
  // renderer reacts — that's the whole contract.

  consumeChanges() {
    const result = {
      dirty: new Set(this._dirty),
      fullRebuild: this._fullRebuild
    };
    this._dirty.clear();
    this._fullRebuild = false;
    return result;
  }

  // -- Iteration --

  forEach(fn) {
    this._hexes.forEach((hex, key) => fn(hex, key));
  }

  forEachInRegion(bounds, fn) {
    this._hexes.forEach(hex => {
      if (this._checkBounds(hex.q, hex.r, bounds)) fn(hex);
    });
  }

  getModifiedHexes() {
    const result = [];
    this._hexes.forEach(hex => {
      if (!hex.isDefault) result.push(hex);
    });
    return result;
  }

  // -- Serialization --

  toJSON() {
    const hexes = [];
    this._hexes.forEach(hex => {
      if (hex.isDefault) return;
      const entry = { q: hex.q, r: hex.r, color: hex.terrainColor };
      if (hex.patterned) entry.patterned = true;
      if (hex.text) entry.text = hex.text;
      if (hex.buildingId) entry.buildingId = hex.buildingId;
      hexes.push(entry);
    });

    return { version: 2, bounds: { ...this.bounds }, hexes };
  }

  fromJSON(data) {
    this.bounds = data.bounds;
    this._hexes.clear();
    this._populate(this.bounds);

    for (const h of data.hexes) {
      const hex = this.getOrCreate(h.q, h.r);
      hex.terrainColor = h.color || DEFAULT_COLOR;
      hex.patterned = h.patterned || false;
      hex.text = h.text || '';
      hex.buildingId = h.buildingId || null;
    }

    this._fullRebuild = true;
  }

  // Import v1 saves that used offset (col, row) coordinates.
  // converterFn is offsetToAxial — injected to keep legacy
  // knowledge out of the grid module.
  fromLegacyJSON(data, converterFn) {
    if (!data.hexes) return;

    for (const old of data.hexes) {
      const { q, r } = converterFn(old.col, old.row);
      const hex = this.get(q, r);
      if (!hex) continue;

      hex.terrainColor = old.terrainColor || old.color || DEFAULT_COLOR;
      hex.patterned = old.patterned || false;
      hex.text = old.text || '';
      hex.buildingId = old.buildingId || null;
    }

    this._fullRebuild = true;
  }

  // -- Internals --

  _markDirty(q, r) {
    this._dirty.add(hexKey(q, r));
  }

  _checkBounds(q, r, bounds) {
    if (bounds.type === 'rect') {
      return axialInBounds(q, r, bounds);
    }
    return axialDistance(q, r, bounds.cq || 0, bounds.cr || 0) <= bounds.radius;
  }

  // Fill storage for all hexes within bounds.
  // Existing hexes preserved — getOrCreate is idempotent.
  _populate(bounds) {
    if (bounds.type === 'rect') {
      for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
        for (let r = bounds.minR; r <= bounds.maxR; r++) {
          this.getOrCreate(q, r);
        }
      }
    } else {
      for (const { q, r } of getHexesInRadius(bounds.cq || 0, bounds.cr || 0, bounds.radius)) {
        this.getOrCreate(q, r);
      }
    }
  }

  _countInBounds() {
    let count = 0;
    this._hexes.forEach(hex => {
      if (this._checkBounds(hex.q, hex.r, this.bounds)) count++;
    });
    return count;
  }
}