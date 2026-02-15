// Axial hex math for pointy-top hexagons.
// Coordinate system: (q, r) where s = -q - r is implicit.
// Game data maps directly: game.x → q, game.z → r
//
// Pixel layout (pointy-top):
//   x = size * √3 * (q + r/2)
//   y = size * 3/2 * r
//
// In Three.js, pixel y becomes world z (y is up).

const SQRT3 = Math.sqrt(3);

// Six neighbor offsets starting NE, going clockwise.
// Frozen because mutating these would be a real fun debugging session.
const DIRECTIONS = Object.freeze([
  Object.freeze({ q:  1, r: -1 }), // NE
  Object.freeze({ q:  1, r:  0 }), // E
  Object.freeze({ q:  0, r:  1 }), // SE
  Object.freeze({ q: -1, r:  1 }), // SW
  Object.freeze({ q: -1, r:  0 }), // W
  Object.freeze({ q:  0, r: -1 }), // NW
]);

// -- Keys (canonical hex identity for Map lookups) --

export function hexKey(q, r) { return `${q},${r}`; }

export function parseHexKey(key) {
  const i = key.indexOf(',');
  return {
    q: parseInt(key.substring(0, i), 10),
    r: parseInt(key.substring(i + 1), 10)
  };
}

// -- Coordinate ↔ Pixel --

export function axialToPixel(q, r, size) {
  return {
    x: size * SQRT3 * (q + r * 0.5),
    y: size * 1.5 * r
  };
}

// Cube-round: snap fractional axial to nearest hex.
// Round in cube space (q + r + s = 0) then fix whichever
// component drifted most to restore the constraint.
export function axialRound(fq, fr) {
  const fs = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const rs = Math.round(fs);

  const dq = Math.abs(rq - fq);
  const dr = Math.abs(rr - fr);
  const ds = Math.abs(rs - fs);

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  return { q: rq, r: rr };
}

export function pixelToAxial(px, py, size) {
  const r = py / (size * 1.5);
  const q = (px / (size * SQRT3)) - r * 0.5;
  return axialRound(q, r);
}

// -- Neighbors --

export function getDirections() { return DIRECTIONS; }

export function getNeighbors(q, r) {
  return DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

export function getNeighbor(q, r, dir) {
  const d = DIRECTIONS[dir];
  return { q: q + d.q, r: r + d.r };
}

// Returns 0-5 direction index, or -1 if not adjacent.
export function getNeighborDirection(dq, dr) {
  for (let i = 0; i < 6; i++) {
    if (DIRECTIONS[i].q === dq && DIRECTIONS[i].r === dr) return i;
  }
  return -1;
}

export function getDirectionIndex(fromQ, fromR, toQ, toR) {
  return getNeighborDirection(toQ - fromQ, toR - fromR);
}

// -- Distance --

export function axialDistance(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// -- Area --

// Hex count at radius n: 3n(n+1) + 1
export function getHexesInRadius(cq, cr, radius) {
  if (radius === 0) return [{ q: cq, r: cr }];

  const results = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({ q: cq + dq, r: cr + dr });
    }
  }
  return results;
}

// Walk the perimeter at exactly `radius` distance.
// Starts at direction 4 (W), walks CW through all 6 sides.
export function getHexRing(cq, cr, radius) {
  if (radius === 0) return [{ q: cq, r: cr }];

  const results = [];
  let q = cq + DIRECTIONS[4].q * radius;
  let r = cr + DIRECTIONS[4].r * radius;

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ q, r });
      q += DIRECTIONS[side].q;
      r += DIRECTIONS[side].r;
    }
  }
  return results;
}

// -- Rotation --

// 60° CW around origin. From cube rotation (q,r,s)→(-s,-q,-r),
// substituting s = -q-r gives us (q,r) → (-r, q+r)
export function rotateCW(q, r) { return { q: -r, r: q + r }; }
export function rotateCCW(q, r) { return { q: q + r, r: -q }; }

export function rotateSteps(q, r, steps) {
  steps = ((steps % 6) + 6) % 6;
  let rq = q, rr = r;
  for (let i = 0; i < steps; i++) {
    const next = rotateCW(rq, rr);
    rq = next.q;
    rr = next.r;
  }
  return { q: rq, r: rr };
}

export function rotateCoords(coords, steps) {
  steps = ((steps % 6) + 6) % 6;
  if (steps === 0) return coords.map(c => ({ q: c.q, r: c.r }));
  return coords.map(c => rotateSteps(c.q, c.r, steps));
}

// -- Pixel-space geometry --

export function getHexVertices(cx, cy, size) {
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = (60 * i - 30) * (Math.PI / 180);
    vertices.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle)
    });
  }
  return vertices;
}

export function sortVerticesByAngle(vertices, center, epsilon = 0.1) {
  const unique = vertices.filter((v, i, arr) =>
    !arr.slice(0, i).some(u =>
      Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon
    )
  );
  return unique.sort((a, b) =>
    Math.atan2(a.y - center.y, a.x - center.x) -
    Math.atan2(b.y - center.y, b.x - center.x)
  );
}

// Each neighbor direction exposes 3 vertices on the cluster boundary.
const EXTERNAL_VERTEX_MAP = [
  [5, 0, 1], [0, 1, 2], [1, 2, 3],
  [2, 3, 4], [3, 4, 5], [4, 5, 0],
];

export function getExternalVertices(direction, hexVertices) {
  const indices = EXTERNAL_VERTEX_MAP[direction];
  if (!indices) return [];
  return indices.map(i => hexVertices[i]);
}

// -- Bounds --

export function inBounds(q, r, bounds) {
  return q >= bounds.minQ && q <= bounds.maxQ &&
         r >= bounds.minR && r <= bounds.maxR;
}

export function inHexBounds(q, r, radius, cq = 0, cr = 0) {
  return axialDistance(q, r, cq, cr) <= radius;
}

// -- Legacy bridge --
// For incremental migration only. Track usages, delete when zero.

export function offsetToAxial(col, row) {
  return { q: col - Math.floor(row / 2), r: row };
}

export function axialToOffset(q, r) {
  return { col: q + Math.floor(r / 2), row: r };
}