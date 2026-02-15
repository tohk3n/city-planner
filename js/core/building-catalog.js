// Canonical building catalog loaded from game data.
//
// The JSON comes from the Bitcraft API scraper -- every building with
// its hitbox, perimeter, and walkable footprints in axial [q,r] coords.
// Multiple tiers of the same building (Rough→Magnificent) usually share
// the same shape, so we deduplicate by baseName and index unique shapes.
//
// This module is pure data. It doesn't know about rendering, placement
// validation, or UI. Callers get footprint coords and rotate them.

import { rotateCoords } from './hex-math.js';

export class Building {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.n;
    this.baseName = raw.bn || raw.n;
    this.category = raw.cat;
    this.tier = raw.t || null;
    this.description = raw.d || '';
    this.lightRadius = raw.lr || 0;
    this.stats = raw.s || null;

    // Footprints as {q, r}[] -- parsed once at load time
    this.hitbox = toCoords(raw.h);
    this.perimeter = toCoords(raw.p);
    this.walkable = toCoords(raw.w);

    this.size = this.hitbox.length;
  }
}

export default class BuildingCatalog {
  constructor() {
    this.buildings = new Map();    // id → Building
    this.byBaseName = new Map();   // baseName → Building[] (all tiers)
    this.byCategory = new Map();   // category → Building[]
    this.categories = [];
    this._rotationCache = new Map(); // `${id}:${rot}` → {q,r}[]
  }

  load(json) {
    let data = typeof json === 'string' ? JSON.parse(json) : json;
    // Vite JSON imports wrap in { default: ... }
    if (data.default) data = data.default;
    // Compact format uses 'b', full format uses 'buildings'
    const list = data.buildings || data.b || (Array.isArray(data) ? data : []);

    this.buildings.clear();
    this.byBaseName.clear();
    this.byCategory.clear();
    this._rotationCache.clear();

    for (const raw of list) {
      const b = new Building(raw);
      this.buildings.set(b.id, b);

      if (!this.byBaseName.has(b.baseName)) this.byBaseName.set(b.baseName, []);
      this.byBaseName.get(b.baseName).push(b);

      if (!this.byCategory.has(b.category)) this.byCategory.set(b.category, []);
      this.byCategory.get(b.category).push(b);
    }

    this.categories = [...this.byCategory.keys()].sort();
    return this;
  }

  get(id) {
    return this.buildings.get(id) || null;
  }

  // All tiers of a building. Returns the lowest tier first.
  getTiers(baseName) {
    return this.byBaseName.get(baseName) || [];
  }

  // Unique base names per category -- the "pick a building" list for the UI.
  // Returns [{baseName, category, size, building}] with one entry per shape.
  getUniqueBuildings() {
    const seen = new Set();
    const result = [];

    for (const b of this.buildings.values()) {
      if (seen.has(b.baseName)) continue;
      seen.add(b.baseName);
      result.push({
        baseName: b.baseName,
        category: b.category,
        size: b.size,
        building: b,
      });
    }

    return result.sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.baseName.localeCompare(b.baseName);
    });
  }

  // Hitbox coords rotated by N—60° CW. Cached because the same building
  // at the same rotation gets requested many times (hover preview, placement).
  getRotatedHitbox(id, rotation) {
    const steps = ((rotation % 6) + 6) % 6;
    const key = `${id}:${steps}`;

    let cached = this._rotationCache.get(key);
    if (cached) return cached;

    const b = this.buildings.get(id);
    if (!b) return [];

    cached = steps === 0
      ? b.hitbox.map(c => ({ q: c.q, r: c.r }))
      : rotateCoords(b.hitbox, steps);

    this._rotationCache.set(key, cached);
    return cached;
  }

  // Full footprint (hitbox + walkable + perimeter) rotated.
  // Used for rendering the complete building preview.
  getRotatedFootprint(id, rotation) {
    const steps = ((rotation % 6) + 6) % 6;
    const b = this.buildings.get(id);
    if (!b) return { hitbox: [], walkable: [], perimeter: [] };

    return {
      hitbox: this.getRotatedHitbox(id, rotation),
      walkable: steps === 0 ? b.walkable : rotateCoords(b.walkable, steps),
      perimeter: steps === 0 ? b.perimeter : rotateCoords(b.perimeter, steps),
    };
  }

  // Filter helpers

  filterByCategory(category) {
    return this.byCategory.get(category) || [];
  }

  filter(fn) {
    const result = [];
    for (const b of this.buildings.values()) {
      if (fn(b)) result.push(b);
    }
    return result;
  }
}

// [q,r] arrays → {q, r} objects
function toCoords(arr) {
  if (!arr || !arr.length) return [];
  return arr.map(c => ({ q: c[0], r: c[1] }));
}