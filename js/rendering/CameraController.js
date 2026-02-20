// Camera controls for ortho and perspective modes.
// Owns middle-drag (pan), right-drag (orbit), wheel (zoom),
// and keyboard (WASD pan, QE orbit, RF vertical).
// Left button is NOT ours -- InteractionManager handles hex picking.
//
// Needs update() called every frame for keyboard and momentum.

import * as THREE from 'three';

const MIDDLE = 1;
const RIGHT = 2;

const DEFAULTS = {
  // Mouse
  panSpeed: 2,
  orbitSpeed: 0.005,
  zoomSpeed: 0.1,
  // Keyboard
  keyPanSpeed: 30,
  keyOrbitSpeed: 0.03,
  keyVertSpeed: 30,
  // Momentum
  damping: 0.85,
  minVelocity: 0.001,
  // Limits
  minZoom: 0.05,
  maxZoom: 20,
  minRadius: 100,
  maxRadius: 5000,
  // Phi limits -- don't let the camera flip upside down or go underground
  minPhi: 0.1,
  maxPhi: Math.PI / 2 - 0.05,
};

export default class CameraController {
  constructor(sceneManager) {
    this.sm = sceneManager;
    this._el = sceneManager.renderer.domElement;

    // Perspective orbit state (spherical around target)
    this.target = new THREE.Vector3(0, 0, 0);
    this.spherical = new THREE.Spherical();
    this.spherical.setFromVector3(
      this.sm._persp.position.clone().sub(this.target)
    );

    // Input state
    this._keys = {};
    this._isPanning = false;
    this._isOrbiting = false;
    this._prev = { x: 0, y: 0 };

    // Momentum
    this._panVel = { x: 0, y: 0 };
    this._orbitVel = { theta: 0, phi: 0 };

    this._bind();
  }

  // Call every frame.
  update() {
    this._processKeyboard();
    this._applyMomentum();
  }

  resetView() {
    this.target.set(0, 0, 0);

    // Reset ortho
    this.sm._ortho.position.set(0, this.sm._ortho.position.y, 0);
    this.sm.setOrthoZoom(1);

    // Reset perspective
    this.sm._persp.position.set(0, 800, 1200);
    this.sm._persp.lookAt(0, 0, 0);
    this.spherical.setFromVector3(
      this.sm._persp.position.clone().sub(this.target)
    );

    this._panVel.x = this._panVel.y = 0;
    this._orbitVel.theta = this._orbitVel.phi = 0;
  }

  dispose() {
    this._el.removeEventListener('mousedown', this._onMouseDown);
    this._el.removeEventListener('mousemove', this._onMouseMove);
    this._el.removeEventListener('mouseup', this._onMouseUp);
    this._el.removeEventListener('wheel', this._onWheel);
    this._el.removeEventListener('contextmenu', this._onCtx);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  // -- Internals --

  _bind() {
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onCtx = e => e.preventDefault();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    this._el.addEventListener('mousedown', this._onMouseDown);
    this._el.addEventListener('mousemove', this._onMouseMove);
    this._el.addEventListener('mouseup', this._onMouseUp);
    this._el.addEventListener('wheel', this._onWheel, { passive: false });
    this._el.addEventListener('contextmenu', this._onCtx);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // -- Mouse handlers --

  _onMouseDown(e) {
    if (e.button === MIDDLE) {
      e.preventDefault();
      this._isPanning = true;
      this._panVel.x = this._panVel.y = 0;
    } else if (e.button === RIGHT) {
      this._isOrbiting = true;
      this._orbitVel.theta = this._orbitVel.phi = 0;
    }
    this._prev.x = e.clientX;
    this._prev.y = e.clientY;
  }

  _onMouseMove(e) {
    const dx = e.clientX - this._prev.x;
    const dy = e.clientY - this._prev.y;
    this._prev.x = e.clientX;
    this._prev.y = e.clientY;

    if (this._isPanning) {
      this._applyPan(dx, dy);
    } else if (this._isOrbiting && this.sm.mode === 'perspective') {
      this._applyOrbit(dx, dy);
    }
  }

  _onMouseUp(e) {
    if (e.button === MIDDLE) this._isPanning = false;
    if (e.button === RIGHT) this._isOrbiting = false;
  }

  _onWheel(e) {
    e.preventDefault();

    if (this.sm.mode === 'ortho') {
      // Zoom toward/away from cursor.
      // Multiply by current zoom so it feels proportional at all levels.
      const factor = 1 + e.deltaY * DEFAULTS.zoomSpeed * 0.01;
      this.sm.setOrthoZoom(this.sm.orthoZoom * factor);
    } else {
      this.spherical.radius += e.deltaY * DEFAULTS.zoomSpeed * 2;
      this.spherical.radius = clamp(
        this.spherical.radius, DEFAULTS.minRadius, DEFAULTS.maxRadius
      );
      this._updatePerspCamera();
    }
  }

  // -- Keyboard --

  _onKeyDown(e) {
    if (isTyping()) return;
    this._keys[e.key.toLowerCase()] = true;
  }

  _onKeyUp(e) {
    this._keys[e.key.toLowerCase()] = false;
  }

  _processKeyboard() {
    const k = this._keys;
    if (this.sm.mode === 'ortho') {
      this._processKeyboardOrtho(k);
    } else {
      this._processKeyboardPersp(k);
    }
  }

  _processKeyboardOrtho(k) {
    const cam = this.sm._ortho;
    // Scale speed by zoom so it feels consistent
    const speed = DEFAULTS.keyPanSpeed / this.sm.orthoZoom;
    let moved = false;

    if (k['w']) { cam.position.z -= speed; moved = true; }
    if (k['s']) { cam.position.z += speed; moved = true; }
    if (k['a']) { cam.position.x -= speed; moved = true; }
    if (k['d']) { cam.position.x += speed; moved = true; }

    // Zoom keys as alternative to wheel
    if (k['r']) { this.sm.setOrthoZoom(this.sm.orthoZoom * 1.02); moved = true; }
    if (k['f']) { this.sm.setOrthoZoom(this.sm.orthoZoom * 0.98); moved = true; }
  }

  _processKeyboardPersp(k) {
    // WASD: pan the orbit target along the ground plane
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.sm._persp.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    let moved = false;

    if (k['w']) { this.target.add(forward.clone().multiplyScalar(DEFAULTS.keyPanSpeed)); moved = true; }
    if (k['s']) { this.target.add(forward.clone().multiplyScalar(-DEFAULTS.keyPanSpeed)); moved = true; }
    if (k['a']) { this.target.add(right.clone().multiplyScalar(-DEFAULTS.keyPanSpeed)); moved = true; }
    if (k['d']) { this.target.add(right.clone().multiplyScalar(DEFAULTS.keyPanSpeed)); moved = true; }

    if (k['q']) { this.spherical.theta += DEFAULTS.keyOrbitSpeed; moved = true; }
    if (k['e']) { this.spherical.theta -= DEFAULTS.keyOrbitSpeed; moved = true; }

    if (k['r']) { this.target.y += DEFAULTS.keyVertSpeed; moved = true; }
    if (k['f']) { this.target.y -= DEFAULTS.keyVertSpeed; moved = true; }

    if (moved) this._updatePerspCamera();
  }

  // -- Pan / Orbit application --

  _applyPan(dx, dy) {
    if (this.sm.mode === 'ortho') {
      // In ortho, screen pixels map directly to world units
      // via the frustum size / viewport size ratio.
      const cam = this.sm._ortho;
      const viewW = (cam.right - cam.left);
      const viewH = (cam.top - cam.bottom);
      const elW = this._el.clientWidth;
      const elH = this._el.clientHeight;

      cam.position.x -= dx * (viewW / elW);
      cam.position.z -= dy * (viewH / elH);

      // Store velocity for momentum
      this._panVel.x = -dx * DEFAULTS.panSpeed;
      this._panVel.y = dy * DEFAULTS.panSpeed;
    } else {
      // Perspective: move target in camera-relative ground plane
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      this.sm._persp.getWorldDirection(right);
      right.cross(up).normalize();

      this._panVel.x = -dx * DEFAULTS.panSpeed;
      this._panVel.y = dy * DEFAULTS.panSpeed;

      this.target.add(right.clone().multiplyScalar(this._panVel.x));
      this.target.add(up.clone().multiplyScalar(this._panVel.y));

      this._updatePerspCamera();
    }
  }

  _applyOrbit(dx, dy) {
    this._orbitVel.theta = -dx * DEFAULTS.orbitSpeed;
    this._orbitVel.phi = -dy * DEFAULTS.orbitSpeed;

    this.spherical.theta += this._orbitVel.theta;
    this.spherical.phi += this._orbitVel.phi;
    this.spherical.phi = clamp(
      this.spherical.phi, DEFAULTS.minPhi, DEFAULTS.maxPhi
    );

    this._updatePerspCamera();
  }

  // -- Momentum --

  _applyMomentum() {
    const d = DEFAULTS.damping;
    const min = DEFAULTS.minVelocity;

    // Orbit momentum (perspective only, only when not actively dragging)
    if (!this._isOrbiting && this.sm.mode === 'perspective') {
      if (Math.abs(this._orbitVel.theta) > min || Math.abs(this._orbitVel.phi) > min) {
        this.spherical.theta += this._orbitVel.theta;
        this.spherical.phi += this._orbitVel.phi;
        this.spherical.phi = clamp(
          this.spherical.phi, DEFAULTS.minPhi, DEFAULTS.maxPhi
        );

        this._orbitVel.theta *= d;
        this._orbitVel.phi *= d;
        if (Math.abs(this._orbitVel.theta) < min) this._orbitVel.theta = 0;
        if (Math.abs(this._orbitVel.phi) < min) this._orbitVel.phi = 0;

        this._updatePerspCamera();
      }
    }

    // Pan momentum (perspective only -- ortho pan is direct position manipulation)
    if (!this._isPanning && this.sm.mode === 'perspective') {
      if (Math.abs(this._panVel.x) > min || Math.abs(this._panVel.y) > min) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        this.sm._persp.getWorldDirection(right);
        right.cross(up).normalize();

        this.target.add(right.clone().multiplyScalar(this._panVel.x));
        this.target.add(up.clone().multiplyScalar(this._panVel.y));

        this._panVel.x *= d;
        this._panVel.y *= d;
        if (Math.abs(this._panVel.x) < min) this._panVel.x = 0;
        if (Math.abs(this._panVel.y) < min) this._panVel.y = 0;

        this._updatePerspCamera();
      }
    }
  }

  _updatePerspCamera() {
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.sm._persp.position.copy(this.target).add(offset);
    this.sm._persp.lookAt(this.target);
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function isTyping() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}