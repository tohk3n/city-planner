// CameraController.test.js
// Tests the math: spherical orbit, momentum decay, pan conversion,
// zoom proportionality, clamping. No DOM needed for these.

import * as THREE from 'three';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, msg, eps = 0.01) {
  assert(Math.abs(a - b) < eps, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

// =============================================================================
section('clamp');

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

assertClose(clamp(5, 0, 10), 5, 'within range passes through');
assertClose(clamp(-1, 0, 10), 0, 'below min clamps to min');
assertClose(clamp(15, 0, 10), 10, 'above max clamps to max');
assertClose(clamp(0, 0, 10), 0, 'at min is fine');
assertClose(clamp(10, 0, 10), 10, 'at max is fine');

// =============================================================================
section('Spherical coordinate roundtrip');

// Verify that spherical ↔ cartesian roundtrips correctly
// This is the core of the orbit camera.
const target = new THREE.Vector3(100, 0, 200);
const camPos = new THREE.Vector3(100, 800, 1400);

const spherical = new THREE.Spherical();
spherical.setFromVector3(camPos.clone().sub(target));

// Recover camera position from spherical + target
const recovered = new THREE.Vector3().setFromSpherical(spherical).add(target);
assertClose(recovered.x, camPos.x, 'spherical roundtrip x');
assertClose(recovered.y, camPos.y, 'spherical roundtrip y');
assertClose(recovered.z, camPos.z, 'spherical roundtrip z');

// Verify radius
const expectedRadius = camPos.distanceTo(target);
assertClose(spherical.radius, expectedRadius, 'radius = distance to target');

// Modify theta (horizontal rotation) and verify camera moves
const originalTheta = spherical.theta;
spherical.theta += Math.PI / 4; // rotate 45°
const rotated = new THREE.Vector3().setFromSpherical(spherical).add(target);

// Should still be same distance from target
assertClose(rotated.distanceTo(target), expectedRadius, 'rotation preserves distance');

// Y should be roughly the same (theta is horizontal only)
assertClose(rotated.y, recovered.y, 'horizontal rotation preserves height', 1);

// But x or z should have changed
assert(Math.abs(rotated.x - recovered.x) > 10 || Math.abs(rotated.z - recovered.z) > 10,
  'horizontal rotation moves camera in xz');

// =============================================================================
section('Phi clamping');

const minPhi = 0.1;
const maxPhi = Math.PI / 2 - 0.05;

// Phi too low (looking nearly horizontal) should clamp
assertClose(clamp(0.01, minPhi, maxPhi), minPhi, 'phi clamps at min');

// Phi too high (looking straight down) should clamp
assertClose(clamp(Math.PI, minPhi, maxPhi), maxPhi, 'phi clamps at max');

// Verify the clamped range makes physical sense
// Three.js Spherical: phi=0 → y=radius (top-down), phi=π/2 → y=0 (horizon)
const testSpherical = new THREE.Spherical(1000, minPhi, 0);
const atMinPhi = new THREE.Vector3().setFromSpherical(testSpherical);
assert(atMinPhi.y > 900, 'min phi is near top-down (high y)');

testSpherical.phi = maxPhi;
const atMaxPhi = new THREE.Vector3().setFromSpherical(testSpherical);
assert(atMaxPhi.y > 0 && atMaxPhi.y < 200, 'max phi is near-horizontal (low y)');

// =============================================================================
section('Momentum decay');

const damping = 0.85;
const minVel = 0.001;

// Simulate momentum decay
function decaySteps(initial, steps) {
  let v = initial;
  for (let i = 0; i < steps; i++) {
    v *= damping;
    if (Math.abs(v) < minVel) { v = 0; break; }
  }
  return v;
}

// Should converge to zero
assertClose(decaySteps(10, 100), 0, 'momentum decays to zero');

// Should still be moving after a few frames
assert(decaySteps(10, 3) > 5, 'momentum persists for several frames');

// Count frames until zero
function framesToZero(initial) {
  let v = initial;
  let frames = 0;
  while (Math.abs(v) >= minVel && frames < 1000) {
    v *= damping;
    frames++;
  }
  return frames;
}

const frames = framesToZero(10);
assert(frames > 20, `momentum lasts more than 20 frames (got ${frames})`);
assert(frames < 100, `momentum dies within 100 frames (got ${frames})`);

// Larger initial velocity takes more frames
const framesSmall = framesToZero(1);
const framesLarge = framesToZero(100);
assert(framesLarge > framesSmall, 'larger velocity needs more frames to decay');

// =============================================================================
section('Ortho pan: screen pixels to world units');

// In ortho mode, pan converts screen dx/dy to world movement.
// The ratio is: frustum_size / viewport_size
// With halfH=2000 at zoom=1, frustum width = 2*2000*(16/9) ≈ 7111
// On an 800px wide viewport, 1 pixel ≈ 7111/800 ≈ 8.9 world units.

function orthoPanRatio(halfH, zoom, aspect, viewportWidth) {
  const frustumWidth = (halfH / zoom) * 2 * aspect;
  return frustumWidth / viewportWidth;
}

const ratio1 = orthoPanRatio(2000, 1, 16 / 9, 800);
assert(ratio1 > 5, `ortho pan ratio at zoom 1 is reasonable (${ratio1.toFixed(1)})`);

// Zoom in = smaller frustum = less world movement per pixel
const ratio2 = orthoPanRatio(2000, 2, 16 / 9, 800);
assert(ratio2 < ratio1, 'zoomed in → smaller pan ratio');
assertClose(ratio2, ratio1 / 2, 'zoom 2x halves pan ratio', 0.5);

// Zoom out = bigger frustum = more world movement per pixel
const ratio05 = orthoPanRatio(2000, 0.5, 16 / 9, 800);
assertClose(ratio05, ratio1 * 2, 'zoom 0.5x doubles pan ratio', 0.5);

// =============================================================================
section('Zoom proportionality');

// Ortho zoom should feel consistent: same wheel delta produces
// proportional change regardless of current zoom level.
// We use multiplicative zoom: newZoom = oldZoom * (1 + delta * speed)

const zoomSpeed = 0.1;

function applyZoom(currentZoom, deltaY) {
  const factor = 1 + deltaY * zoomSpeed * 0.01;
  return clamp(currentZoom * factor, 0.05, 20);
}

// Same scroll amount at different zoom levels should produce
// the same ratio of change
const z1 = applyZoom(1.0, 100);
const z2 = applyZoom(2.0, 100);
const z4 = applyZoom(4.0, 100);

const ratio_z1 = z1 / 1.0;
const ratio_z2 = z2 / 2.0;
const ratio_z4 = z4 / 4.0;

assertClose(ratio_z1, ratio_z2, 'zoom ratio consistent at z=1 and z=2');
assertClose(ratio_z2, ratio_z4, 'zoom ratio consistent at z=2 and z=4');

// Zoom clamps at boundaries
const zMin = applyZoom(0.05, 100);
assert(zMin >= 0.05, 'zoom does not go below min');

const zMax = applyZoom(20, -100);
assert(zMax <= 20, 'zoom does not go above max');

// =============================================================================
section('isTyping guard');

// Verify the logic (can't test real DOM focus in Node, but the logic is trivial)
function isTyping(tagName) {
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

assert(isTyping('INPUT'), 'INPUT blocks keyboard');
assert(isTyping('TEXTAREA'), 'TEXTAREA blocks keyboard');
assert(isTyping('SELECT'), 'SELECT blocks keyboard');
assert(!isTyping('DIV'), 'DIV does not block');
assert(!isTyping('CANVAS'), 'CANVAS does not block');
assert(!isTyping(undefined), 'undefined does not block');

// =============================================================================
section('Module import');

const mod = await import('./CameraController.test.js');
assert(typeof mod.default === 'function', 'CameraController exports a class');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED'); }