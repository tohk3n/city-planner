// Pointer-to-hex picking for ortho and perspective cameras.
// Converts screen events into axial hex coordinates and delivers
// them via callbacks. Knows nothing about painting, buildings,
// or game state — the caller decides what a click means.
//
// Ortho picking: unproject to y=0 plane. Pure math, O(1).
// Perspective picking: ray-plane intersection at y=0. Same deal,
//   just a different unproject path. No mesh raycasting needed
//   for a flat grid.
//
// When terrain elevation exists, perspective mode will need mesh
// raycasting. That's TerrainRenderer's problem — it can provide
// a getHexAtRay(raycaster) method and this class will call it.

import * as THREE from 'three';
import { pixelToAxial, hexKey } from '../core/hex-math.js';

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

// Reused across frames to avoid allocation
const _ndc = new THREE.Vector2();
const _vec3 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0

export default class InteractionManager {
  constructor(sceneManager, hexSize) {
    this.sceneManager = sceneManager;
    this.hexSize = hexSize;

    // The element we listen on — the WebGL canvas
    this._el = sceneManager.renderer.domElement;

    // World offset applied to all renderers. Must match so we can
    // convert world coords (which have the offset baked in) back
    // to raw pixel coords for pixelToAxial.
    this._offsetX = 0;
    this._offsetZ = 0;

    // State
    this._dragging = false;
    this._lastHexKey = null;   // avoid repeat-firing on same hex

    // Callbacks. Caller sets these directly.
    // All receive (q, r, event) except onLeave which gets ().
    this.onHexDown = null;     // left press on a hex
    this.onHexMove = null;     // hover (not dragging)
    this.onHexDrag = null;     // left held, moved to new hex
    this.onHexUp = null;       // left released
    this.onLeave = null;       // pointer left the canvas
    this.onDoubleClick = null; // double-click on a hex

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this._onContextMenu = e => e.preventDefault();

    this._el.addEventListener('pointerdown', this._onPointerDown);
    this._el.addEventListener('pointermove', this._onPointerMove);
    this._el.addEventListener('pointerup', this._onPointerUp);
    this._el.addEventListener('pointerleave', this._onPointerLeave);
    this._el.addEventListener('dblclick', this._onDblClick);
    this._el.addEventListener('contextmenu', this._onContextMenu);
  }

  // Must be called with the same offset as all renderers so picking
  // agrees with what's on screen. World coords have the offset
  // subtracted; we add it back to get raw pixel coords for pixelToAxial.
  setOffset(x, z) {
    this._offsetX = x;
    this._offsetZ = z;
  }

  // Convert screen pixel to axial hex. Returns { q, r } or null
  // if the pointer isn't over the ground plane (e.g. perspective
  // camera looking at the sky).
  screenToAxial(screenX, screenY) {
    const rect = this._el.getBoundingClientRect();
    _ndc.set(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1
    );

    const camera = this.sceneManager.camera;
    const world = this._ndcToWorld(_ndc, camera);
    if (!world) return null;

    // Renderers position hexes at (pixelPos - offset), so world coords
    // are in offset-adjusted space. Add offset back to get raw pixel
    // coords that pixelToAxial expects.
    return pixelToAxial(world.x + this._offsetX, world.z + this._offsetZ, this.hexSize);
  }

  dispose() {
    this._el.removeEventListener('pointerdown', this._onPointerDown);
    this._el.removeEventListener('pointermove', this._onPointerMove);
    this._el.removeEventListener('pointerup', this._onPointerUp);
    this._el.removeEventListener('pointerleave', this._onPointerLeave);
    this._el.removeEventListener('dblclick', this._onDblClick);
    this._el.removeEventListener('contextmenu', this._onContextMenu);
  }

  // -- Internals --

  // Unproject NDC to the y=0 world plane.
  // Ortho: camera.unproject gives a point on the near plane,
  //   but we need where it hits y=0. For a top-down ortho camera,
  //   the unprojected x/z ARE the world x/z (y is just camera height).
  // Perspective: build a ray from camera through NDC, intersect y=0.
  _ndcToWorld(ndc, camera) {
    if (camera.isOrthographicCamera) {
      _vec3.set(ndc.x, ndc.y, 0).unproject(camera);
      // Ortho unproject gives a point at the near plane.
      // We want x and z on the ground plane. For a camera looking
      // straight down, unprojected x/z are already ground coords.
      return { x: _vec3.x, z: _vec3.z };
    }

    // Perspective: ray from camera through the click point
    _vec3.set(ndc.x, ndc.y, 0.5).unproject(camera);
    _ray.origin.copy(camera.position);
    _ray.direction.copy(_vec3).sub(camera.position).normalize();

    const target = new THREE.Vector3();
    const hit = _ray.intersectPlane(_plane, target);
    if (!hit) return null;

    return { x: target.x, z: target.z };
  }

  _onPointerDown(e) {
    if (e.button !== LEFT) return;

    this._dragging = true;
    this._lastHexKey = null;

    const hex = this.screenToAxial(e.clientX, e.clientY);
    if (!hex) return;

    this._lastHexKey = hexKey(hex.q, hex.r);
    this.onHexDown?.(hex.q, hex.r, e);
  }

  _onPointerMove(e) {
    const hex = this.screenToAxial(e.clientX, e.clientY);
    if (!hex) {
      // Off the plane — treat as leave
      if (this._lastHexKey !== null) {
        this._lastHexKey = null;
        this.onLeave?.();
      }
      return;
    }

    const key = hexKey(hex.q, hex.r);
    if (key === this._lastHexKey) return; // still on same hex
    this._lastHexKey = key;

    if (this._dragging) {
      this.onHexDrag?.(hex.q, hex.r, e);
    } else {
      this.onHexMove?.(hex.q, hex.r, e);
    }
  }

  _onPointerUp(e) {
    if (e.button !== LEFT) return;

    this._dragging = false;

    const hex = this.screenToAxial(e.clientX, e.clientY);
    if (!hex) return;

    this.onHexUp?.(hex.q, hex.r, e);
  }

  _onPointerLeave() {
    this._dragging = false;
    this._lastHexKey = null;
    this.onLeave?.();
  }

  _onDblClick(e) {
    const hex = this.screenToAxial(e.clientX, e.clientY);
    if (!hex) return;

    this.onDoubleClick?.(hex.q, hex.r, e);
  }
}