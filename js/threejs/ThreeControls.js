// =============================================================================
// THREE.JS CONTROLS - Camera orbit, keyboard, and damping
// =============================================================================
import * as THREE from 'three';

class ThreeControls {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    // Target point the camera orbits around
    this.target = new THREE.Vector3(0, 0, 0);

    // Spherical coordinates for orbit
    this.spherical = new THREE.Spherical();
    this.spherical.setFromVector3(camera.position.clone().sub(this.target));

    // Mouse interaction state
    this.isRotating = false;
    this.isPanning = false;
    this.previousMousePosition = { x: 0, y: 0 };

    // Velocity for smooth damping
    this.rotationVelocity = { theta: 0, phi: 0 };
    this.panVelocity = { x: 0, y: 0 };

    // Keyboard state
    this.keyState = {};

    // Control parameters
    this.damping = 0.85;
    this.minVelocity = 0.001;
    this.moveSpeed = 30;
    this.rotateSpeed = 0.03;
    this.mouseRotateSpeed = 0.005;
    this.mousePanSpeed = 2;
    this.zoomSpeed = 0.5;

    // Track event listeners for cleanup
    this.listeners = [];

    this.setupEventListeners();
  }

  /**
   * Setup all event listeners with tracking for cleanup
   */
  setupEventListeners() {
    // Mouse controls
    this.addListener(this.canvas, 'mousedown', this.onMouseDown.bind(this));
    this.addListener(this.canvas, 'mousemove', this.onMouseMove.bind(this));
    this.addListener(this.canvas, 'mouseup', this.onMouseUp.bind(this));
    this.addListener(this.canvas, 'wheel', this.onWheel.bind(this));
    this.addListener(this.canvas, 'contextmenu', (e) => e.preventDefault());

    // Keyboard controls
    this.addListener(window, 'keydown', this.onKeyDown.bind(this));
    this.addListener(window, 'keyup', this.onKeyUp.bind(this));
  }

  /**
   * Add event listener and track it for cleanup
   */
  addListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.listeners.push({ element, event, handler });
  }

  /**
   * Mouse down - start rotation or pan
   */
  onMouseDown(e) {
    if (e.button === 0) { // Left click
      this.isRotating = true;
      this.rotationVelocity = { theta: 0, phi: 0 }; // Stop momentum
    }
    if (e.button === 2) { // Right click
      this.isPanning = true;
      this.panVelocity = { x: 0, y: 0 }; // Stop momentum
    }
    this.previousMousePosition = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }

  /**
   * Mouse move - apply rotation or pan
   */
  onMouseMove(e) {
    if (!this.isRotating && !this.isPanning) return;

    const deltaX = e.clientX - this.previousMousePosition.x;
    const deltaY = e.clientY - this.previousMousePosition.y;

    if (this.isRotating) {
      this.rotationVelocity.theta = -deltaX * this.mouseRotateSpeed;
      this.rotationVelocity.phi = -deltaY * this.mouseRotateSpeed;

      this.spherical.theta += this.rotationVelocity.theta;
      this.spherical.phi += this.rotationVelocity.phi;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));

      this.updateCameraPosition();
    }

    if (this.isPanning) {
      this.panVelocity.x = -deltaX * this.mousePanSpeed;
      this.panVelocity.y = deltaY * this.mousePanSpeed;

      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      this.camera.getWorldDirection(right);
      right.cross(up).normalize();

      this.target.add(right.multiplyScalar(this.panVelocity.x));
      this.target.add(up.multiplyScalar(this.panVelocity.y));

      this.updateCameraPosition();
    }

    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  }

  /**
   * Mouse up - stop rotation/pan
   */
  onMouseUp() {
    this.isRotating = false;
    this.isPanning = false;
  }

  /**
   * Mouse wheel - zoom in/out
   */
  onWheel(e) {
    e.preventDefault();
    this.spherical.radius += e.deltaY * this.zoomSpeed;
    this.spherical.radius = Math.max(200, Math.min(2000, this.spherical.radius));
    this.updateCameraPosition();
  }

  /**
   * Key down - track state
   */
  onKeyDown(e) {
    // Don't interfere with text input
    if (document.activeElement.tagName === 'INPUT') return;
    this.keyState[e.key.toLowerCase()] = true;
  }

  /**
   * Key up - clear state
   */
  onKeyUp(e) {
    this.keyState[e.key.toLowerCase()] = false;
  }

  /**
   * Update loop - call this every frame
   */
  update() {
    this.processKeyboard();
    this.applyDamping();
  }

  /**
   * Process keyboard input for camera movement
   */
  processKeyboard() {
    if (!this.camera) return;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0; // Keep movement horizontal
    forward.normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    let moved = false;

    // WASD movement
    if (this.keyState['w']) {
      this.target.add(forward.clone().multiplyScalar(this.moveSpeed));
      moved = true;
    }
    if (this.keyState['s']) {
      this.target.add(forward.clone().multiplyScalar(-this.moveSpeed));
      moved = true;
    }
    if (this.keyState['a']) {
      this.target.add(right.clone().multiplyScalar(-this.moveSpeed));
      moved = true;
    }
    if (this.keyState['d']) {
      this.target.add(right.clone().multiplyScalar(this.moveSpeed));
      moved = true;
    }

    // QE rotation
    if (this.keyState['q']) {
      this.spherical.theta += this.rotateSpeed;
      moved = true;
    }
    if (this.keyState['e']) {
      this.spherical.theta -= this.rotateSpeed;
      moved = true;
    }

    // RF vertical movement
    if (this.keyState['r']) {
      this.target.y += this.moveSpeed;
      moved = true;
    }
    if (this.keyState['f']) {
      this.target.y -= this.moveSpeed;
      moved = true;
    }

    if (moved) {
      this.updateCameraPosition();
    }
  }

  /**
   * Apply momentum damping for smooth feel
   */
  applyDamping() {
    // Rotation damping
    if (!this.isRotating &&
        (Math.abs(this.rotationVelocity.theta) > this.minVelocity ||
         Math.abs(this.rotationVelocity.phi) > this.minVelocity)) {

      this.spherical.theta += this.rotationVelocity.theta;
      this.spherical.phi += this.rotationVelocity.phi;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));

      this.rotationVelocity.theta *= this.damping;
      this.rotationVelocity.phi *= this.damping;

      if (Math.abs(this.rotationVelocity.theta) < this.minVelocity) {
        this.rotationVelocity.theta = 0;
      }
      if (Math.abs(this.rotationVelocity.phi) < this.minVelocity) {
        this.rotationVelocity.phi = 0;
      }

      this.updateCameraPosition();
    }

    // Pan damping
    if (!this.isPanning &&
        (Math.abs(this.panVelocity.x) > this.minVelocity ||
         Math.abs(this.panVelocity.y) > this.minVelocity)) {

      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      this.camera.getWorldDirection(right);
      right.cross(up).normalize();

      this.target.add(right.clone().multiplyScalar(this.panVelocity.x));
      this.target.add(up.clone().multiplyScalar(this.panVelocity.y));

      this.panVelocity.x *= this.damping;
      this.panVelocity.y *= this.damping;

      if (Math.abs(this.panVelocity.x) < this.minVelocity) {
        this.panVelocity.x = 0;
      }
      if (Math.abs(this.panVelocity.y) < this.minVelocity) {
        this.panVelocity.y = 0;
      }

      this.updateCameraPosition();
    }
  }

  /**
   * Update camera position from spherical coordinates
   */
  updateCameraPosition() {
    const offset = new THREE.Vector3();
    offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  /**
   * Reset camera to default position
   */
  reset(position, target) {
    if (position) {
      this.camera.position.copy(position);
    }
    if (target) {
      this.target.copy(target);
    }
    this.camera.lookAt(this.target);
    this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
  }

  /**
   * Cleanup - remove all event listeners
   */
  dispose() {
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.listeners = [];
    this.keyState = {};
  }
}

export default ThreeControls;