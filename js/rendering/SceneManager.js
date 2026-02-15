// Scene infrastructure: WebGL renderer, CSS2D label renderer, dual cameras,
// and lighting. Owns the rendering pipeline but not the content or the
// animation loop -- the caller decides when to call render().
//
// Two camera modes:
//   'ortho'       -- top-down flat view (the "2D" mode)
//   'perspective'  -- orbitable 3D view
// Both look at the same scene. Switching is just swapping which camera
// gets passed to the renderers.

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const BG_COLOR = 0x0a0a0f;

const PERSPECTIVE_DEFAULTS = {
  fov: 50,
  near: 1,
  far: 8000,
  distance: 1200,
  height: 800,
};

// How many world units fit in the ortho view at zoom=1.
// Tuned so the default view roughly matches a 100-hex-radius grid.
const ORTHO_BASE_EXTENT = 2000;

export default class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);

    this._mode = 'ortho';
    this._orthoZoom = 1;

    this._initRenderers();
    this._initCameras();
    this._initLights();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // -- Public API --

  get camera() {
    return this._mode === 'ortho' ? this._ortho : this._persp;
  }

  get mode() { return this._mode; }

  setMode(mode) {
    if (mode !== 'ortho' && mode !== 'perspective') return;
    if (mode === this._mode) return;

    // Carry the look-at target across so the view doesn't jump.
    // In ortho, position.x/z IS the look target (camera looks straight down).
    // In perspective, the target is wherever the camera points.
    if (mode === 'ortho') {
      this._ortho.position.x = this._persp.position.x;
      this._ortho.position.z = this._persp.position.z;
      this._updateOrthoFrustum();
    } else {
      // Swing perspective camera to look at ortho's center from above
      this._persp.position.set(
        this._ortho.position.x,
        PERSPECTIVE_DEFAULTS.height,
        this._ortho.position.z + PERSPECTIVE_DEFAULTS.distance
      );
      this._persp.lookAt(
        this._ortho.position.x, 0, this._ortho.position.z
      );
    }

    this._mode = mode;
    this.scene.fog = mode === 'perspective'
      ? new THREE.Fog(BG_COLOR, 2000, 6000)
      : null;
  }

  get orthoZoom() { return this._orthoZoom; }

  setOrthoZoom(zoom) {
    this._orthoZoom = Math.max(0.05, Math.min(20, zoom));
    this._updateOrthoFrustum();
  }

  render() {
    const cam = this.camera;
    this.renderer.render(this.scene, cam);
    this.labelRenderer.render(this.scene, cam);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);

    this._persp.aspect = w / h;
    this._persp.updateProjectionMatrix();

    this._aspect = w / h;
    this._updateOrthoFrustum();
  }

  getStats() {
    const info = this.renderer.info;
    return {
      triangles: info.render.triangles,
      calls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    // CSS2DRenderer has no dispose -- just remove its DOM element
    this.labelRenderer.domElement.remove();
  }

  // -- Internals --

  _initRenderers() {
    // WebGL
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    // Shadows off by default -- they cost 35+ FPS on large grids.
    // TerrainRenderer or caller can enable per-light if needed.
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    // CSS2D overlay for text labels. Sits on top of the WebGL canvas,
    // passes pointer events through so the canvas stays interactive.
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);
  }

  _initCameras() {
    const { fov, near, far, distance, height } = PERSPECTIVE_DEFAULTS;
    this._aspect = this.container.clientWidth / this.container.clientHeight || 1;

    // Perspective -- classic orbitable 3D camera
    this._persp = new THREE.PerspectiveCamera(fov, this._aspect, near, far);
    this._persp.position.set(0, height, distance);
    this._persp.lookAt(0, 0, 0);

    // Orthographic -- top-down "2D" view
    // Frustum updated by _updateOrthoFrustum whenever zoom or aspect changes.
    this._ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, far);
    this._ortho.position.set(0, far / 2, 0);
    // Up = -Z so screen-up maps to decreasing r (north on the hex map).
    // Without this, lookAt from +Y with default up=(0,1,0) is degenerate
    // and THREE resolves it unpredictably.
    this._ortho.up.set(0, 0, -1);
    this._ortho.lookAt(0, 0, 0);
    // Rotate so +q (axial east) points screen-right and +r (axial SE) points screen-down-right.
    // Default lookAt(0,0,0) from above gives us -Z = up on screen. We want the hex grid's
    // natural orientation, which is already handled by axialToPixel mapping x→screen-x, y→screen-z.
    // No extra rotation needed -- the ortho camera looks down Y and the grid lives on the XZ plane.
    this._updateOrthoFrustum();
  }

  _updateOrthoFrustum() {
    const halfH = ORTHO_BASE_EXTENT / this._orthoZoom;
    const halfW = halfH * (this._aspect || 1);

    this._ortho.left = -halfW;
    this._ortho.right = halfW;
    this._ortho.top = halfH;
    this._ortho.bottom = -halfH;
    this._ortho.updateProjectionMatrix();
  }

  _initLights() {
    // Ambient -- base so nothing is pure black
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Directional -- primary light, no shadows (see note in _initRenderers)
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(500, 800, 300);
    this.scene.add(sun);

    // Hemisphere -- subtle sky/ground gradient for depth cues
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4a3a2a, 0.3));
  }
}