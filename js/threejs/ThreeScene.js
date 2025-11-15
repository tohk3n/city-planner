// =============================================================================
// THREE.JS SCENE - Scene setup, camera, renderer, lighting
// =============================================================================
import * as THREE from 'three';

const TERRAIN_CONFIG = {
  CAMERA_DISTANCE: 1200,
  CAMERA_HEIGHT: 800,
  FOV: 50,
  NEAR: 1,
  FAR: 5000,
  FOG_NEAR: 1000,
  FOG_FAR: 3000
};

class ThreeScene {
  constructor(container, canvas) {
    this.container = container;
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  /**
   * Initialize the Three.js scene
   */
  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.Fog(0x0a0a0f, TERRAIN_CONFIG.FOG_NEAR, TERRAIN_CONFIG.FOG_FAR);

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      TERRAIN_CONFIG.FOV,
      aspect,
      TERRAIN_CONFIG.NEAR,
      TERRAIN_CONFIG.FAR
    );
    this.camera.position.set(0, TERRAIN_CONFIG.CAMERA_HEIGHT, TERRAIN_CONFIG.CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    this.setupLighting();

    // Visual aids
    this.addReferenceGrid();
    this.addAxesHelper();

    // Handle resize
    window.addEventListener('resize', this.onResize.bind(this));

    console.log('[ThreeScene] Initialized:', {
      aspect,
      cameraPosition: this.camera.position,
      rendererSize: `${this.renderer.domElement.width}x${this.renderer.domElement.height}`
    });
  }

  /**
   * Setup scene lighting
   */
  setupLighting() {
    // Ambient light - base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Directional light (sun) - main light source
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 800, 300);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -1000;
    dirLight.shadow.camera.right = 1000;
    dirLight.shadow.camera.top = 1000;
    dirLight.shadow.camera.bottom = -1000;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 2000;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    // Hemisphere light - softer shadows and ambient occlusion
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a3a2a, 0.3);
    this.scene.add(hemiLight);
  }

  /**
   * Add reference grid at sea level
   */
  addReferenceGrid() {
    const gridSize = 2500;
    const divisions = 50;
    const grid = new THREE.GridHelper(gridSize, divisions, 0x00ffff, 0x333333);
    grid.position.y = 0; // Sea level
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    this.scene.add(grid);

    // Sea level plane for reference
    const seaPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshBasicMaterial({
        color: 0x0066aa,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      })
    );
    seaPlane.rotation.x = -Math.PI / 2;
    seaPlane.position.y = -0.5;
    this.scene.add(seaPlane);
  }

  /**
   * Add coordinate axes for orientation
   */
  addAxesHelper() {
    const axesHelper = new THREE.AxesHelper(300);
    axesHelper.position.y = 1;
    this.scene.add(axesHelper);

    // Axis markers (red = X, blue = Z)
    const xMarker = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    xMarker.position.set(320, 1, 0);
    this.scene.add(xMarker);

    const zMarker = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    );
    zMarker.position.set(0, 1, 320);
    this.scene.add(zMarker);
  }

  /**
   * Handle window resize
   */
  onResize() {
    if (!this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Render the scene
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get renderer info for debugging
   */
  getStats() {
    return {
      triangles: this.renderer.info.render.triangles,
      calls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    window.removeEventListener('resize', this.onResize.bind(this));
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

export default ThreeScene;