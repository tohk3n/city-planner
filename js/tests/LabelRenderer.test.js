// LabelRenderer.test.js
//
// CSS2DObject needs DOM elements with setAttribute/style. We shim the
// minimum required surface since we're testing logic, not rendering.

// --- Minimal DOM shim (before any Three.js imports) ---
if (!globalThis.document) {
  // CSS2DRenderer checks ownerDocument.defaultView.Element during scene.remove()
  const fakeWindow = { Element: class Element {} };

  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag,
        style: { cssText: '' },
        textContent: '',
        className: '',
        ownerDocument: { defaultView: fakeWindow },
        _attrs: {},
        setAttribute(k, v) { el._attrs[k] = v; },
        getAttribute(k) { return el._attrs[k]; },
        remove() {},
        addEventListener() {},
        removeEventListener() {},
      };
      return el;
    },
  };
}

import * as THREE from 'three';
import { axialToPixel } from './hex-math.js';
import LabelRenderer from './LabelRenderer.test.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, msg, eps = 0.5) {
  assert(Math.abs(a - b) < eps, `${msg} — expected ~${b}, got ${a}`);
}

function section(name) { console.log(`\n--- ${name} ---`); }

const HEX_SIZE = 20;

// =============================================================================
section('Constructor');

const scene = new THREE.Scene();
const lr = new LabelRenderer(scene, HEX_SIZE);
assertEq(lr.labels.size, 0, 'starts empty');

// =============================================================================
section('Set label');

lr.set(0, 0, 'Hello');
assertEq(lr.labels.size, 1, 'one label');
assert(lr.has(0, 0), 'has (0,0)');
assertEq(lr.getText(0, 0), 'Hello', 'text stored');
assertEq(scene.children.length, 1, 'added to scene');

// Position matches axialToPixel
const obj = lr.labels.get('0,0');
const expected = axialToPixel(0, 0, HEX_SIZE);
assertClose(obj.position.x, expected.x, 'x position');
assertClose(obj.position.z, expected.y, 'z position');

// =============================================================================
section('Update existing label');

lr.set(0, 0, 'Updated');
assertEq(lr.labels.size, 1, 'still one label');
assertEq(lr.getText(0, 0), 'Updated', 'text updated');
assertEq(scene.children.length, 1, 'no duplicate in scene');

// =============================================================================
section('Empty string removes label');

lr.set(0, 0, '');
assertEq(lr.labels.size, 0, 'empty string removes');
assert(!lr.has(0, 0), 'no longer has (0,0)');
assertEq(scene.children.length, 0, 'removed from scene');

// =============================================================================
section('Remove explicit');

lr.set(5, 3, 'Test');
assertEq(lr.labels.size, 1, 'added');
lr.remove(5, 3);
assertEq(lr.labels.size, 0, 'removed');

// Remove nonexistent — no throw
lr.remove(99, 99);

// =============================================================================
section('getText on missing');

assertEq(lr.getText(99, 99), '', 'missing label returns empty string');

// =============================================================================
section('Terrain height affects Y');

lr.setTerrainHeightFn((q, r) => q === 3 ? 100 : 0);
lr.set(3, 0, 'High');
lr.set(0, 0, 'Low');

const highObj = lr.labels.get('3,0');
const lowObj = lr.labels.get('0,0');
assert(highObj.position.y > lowObj.position.y, 'high terrain → higher Y');
assertClose(highObj.position.y, 105, 'terrain 100 + offset 5', 1);
assertClose(lowObj.position.y, 5, 'terrain 0 + offset 5', 1);

// =============================================================================
section('Offset applies');

lr.clear();
lr.setOffset(50, 75);
lr.set(0, 0, 'Offset');

const oObj = lr.labels.get('0,0');
const oPx = axialToPixel(0, 0, HEX_SIZE);
assertClose(oObj.position.x, oPx.x - 50, 'x with offset');
assertClose(oObj.position.z, oPx.y - 75, 'z with offset');

// =============================================================================
section('refreshPositions');

lr.clear();
lr.setOffset(0, 0);
lr.setTerrainHeightFn(() => 0);
lr.set(2, 2, 'Refresh');

const preY = lr.labels.get('2,2').position.y;
lr.setTerrainHeightFn(() => 50);
lr.refreshPositions();

const postY = lr.labels.get('2,2').position.y;
assert(postY > preY, 'refreshPositions updates Y');

// =============================================================================
section('loadAll');

lr.clear();
lr.loadAll([
  { q: 0, r: 0, text: 'A' },
  { q: 1, r: 0, text: 'B' },
  { q: 2, r: 0, text: '' },  // empty — should not create label
  { q: 3, r: 0, text: 'C' },
]);
assertEq(lr.labels.size, 3, 'loaded 3 labels (skipped empty)');
assertEq(lr.getText(0, 0), 'A', 'label A');
assertEq(lr.getText(1, 0), 'B', 'label B');
assertEq(lr.getText(3, 0), 'C', 'label C');

// =============================================================================
section('toJSON');

const json = lr.toJSON();
assertEq(json.length, 3, '3 entries');
assert(json.some(e => e.q === 0 && e.r === 0 && e.text === 'A'), 'has A');
assert(json.some(e => e.q === 1 && e.r === 0 && e.text === 'B'), 'has B');

// =============================================================================
section('Clear');

lr.clear();
assertEq(lr.labels.size, 0, 'empty after clear');
assertEq(scene.children.length, 0, 'scene empty after clear');

// =============================================================================
section('Dispose');

lr.set(0, 0, 'Disposable');
lr.dispose();
assertEq(lr.labels.size, 0, 'empty after dispose');

// =============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) { console.log('SOME TESTS FAILED'); process.exit(1); }
else console.log('ALL TESTS PASSED');