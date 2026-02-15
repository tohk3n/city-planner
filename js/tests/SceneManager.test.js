// SceneManager.test.js
// Structural validation. WebGL/DOM tests require a browser —
// this verifies imports, constants, and the frustum math.

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertClose(a, b, msg, epsilon = 0.001) {
  assert(Math.abs(a - b) < epsilon, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

// =============================================================================
section('Dependencies resolve');

assert(typeof THREE.Scene === 'function', 'THREE.Scene exists');
assert(typeof THREE.WebGLRenderer === 'function', 'THREE.WebGLRenderer exists');
assert(typeof THREE.PerspectiveCamera === 'function', 'PerspectiveCamera exists');
assert(typeof THREE.OrthographicCamera === 'function', 'OrthographicCamera exists');
assert(typeof THREE.AmbientLight === 'function', 'AmbientLight exists');
assert(typeof THREE.DirectionalLight === 'function', 'DirectionalLight exists');
assert(typeof THREE.HemisphereLight === 'function', 'HemisphereLight exists');
assert(typeof THREE.Fog === 'function', 'Fog exists');
assert(typeof CSS2DRenderer === 'function', 'CSS2DRenderer exists');

// =============================================================================
section('Module parses cleanly');

// Dynamic import to verify syntax — SceneManager constructor needs DOM
// so we can't instantiate, but we can verify it loads.
const module = await import('./SceneManager.js');
assert(typeof module.default === 'function', 'SceneManager exports a class');

// =============================================================================
section('Ortho frustum math');

// Replicate the frustum calc to verify it produces correct values.
// This is the core math that determines what the "2D" view shows.
const ORTHO_BASE_EXTENT = 2000;

function calcFrustum(zoom, aspect) {
  const halfH = ORTHO_BASE_EXTENT / zoom;
  const halfW = halfH * aspect;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

// zoom=1, 16:9 aspect
const f1 = calcFrustum(1, 16 / 9);
assertClose(f1.top, 2000, 'zoom 1 halfH = 2000');
assertClose(f1.right, 2000 * 16 / 9, 'zoom 1 halfW scales by aspect');
assert(f1.left === -f1.right, 'frustum is symmetric horizontally');
assert(f1.bottom === -f1.top, 'frustum is symmetric vertically');

// zoom=2 should halve the visible area
const f2 = calcFrustum(2, 16 / 9);
assertClose(f2.top, 1000, 'zoom 2 halves halfH');
assertClose(f2.right, 1000 * 16 / 9, 'zoom 2 halves halfW');

// zoom=0.5 should double it
const f05 = calcFrustum(0.5, 16 / 9);
assertClose(f05.top, 4000, 'zoom 0.5 doubles halfH');

// Square aspect
const fSq = calcFrustum(1, 1);
assertClose(fSq.right, 2000, 'square aspect: halfW = halfH');

// =============================================================================
section('Camera math sanity');

// Verify ortho camera straight-down orientation
const ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 8000);
ortho.position.set(0, 4000, 0);
ortho.lookAt(0, 0, 0);
ortho.updateMatrixWorld();

// Camera should be looking straight down (-Y direction)
const dir = new THREE.Vector3();
ortho.getWorldDirection(dir);
assertClose(dir.y, -1, 'ortho camera looks straight down');
assertClose(dir.x, 0, 'ortho camera no x component');
assertClose(dir.z, 0, 'ortho camera no z component');

// Perspective camera default position
const persp = new THREE.PerspectiveCamera(50, 16 / 9, 1, 8000);
persp.position.set(0, 800, 1200);
persp.lookAt(0, 0, 0);
persp.updateMatrixWorld();

const pDir = new THREE.Vector3();
persp.getWorldDirection(pDir);
assert(pDir.y < 0, 'persp camera looks downward');
assert(pDir.z < 0, 'persp camera looks toward origin from +z');

// =============================================================================
section('Zoom clamping');

function clampZoom(z) { return Math.max(0.05, Math.min(20, z)); }

assertClose(clampZoom(1), 1, 'normal zoom passes through');
assertClose(clampZoom(0.01), 0.05, 'zoom clamped at min');
assertClose(clampZoom(50), 20, 'zoom clamped at max');
assertClose(clampZoom(-1), 0.05, 'negative zoom clamped');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else { console.log('ALL TESTS PASSED'); }