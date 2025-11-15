// =============================================================================
// THREE.JS MANAGER - Public API and coordinator
// =============================================================================
import * as THREE from 'three';
import ThreeScene from './ThreeScene.js';
import ThreeControls from './ThreeControls.js';
import ThreeUI from './ThreeUI.js';
import TerrainRenderer from './TerrainRenderer.js';
import BuildingRenderer from './BuildingRenderer.js';
import GeometryCache from './GeometryCache.js';
import MaterialCache from './MaterialCache.js';
import { AppState } from '../state.js';

class ThreeManager {
  constructor() {
    this.scene = null;
    this.controls = null;
    this.ui = null;
    this.terrainRenderer = null;
    this.buildingRenderer = null;
    this.geometryCache = null;
    this.materialCache = null;

    this.animationFrameId = null;
    this.isInitialized = false;

    this.appState = null;
  }

    /**
     * Set AppState reference - MUST be called before init()
     */
    setAppState(appState) {
      this.appState = appState;
      console.log('[ThreeManager] AppState injected');
    }

  /**
   * Initialize Three.js system
   */
  init() {
    if (this.isInitialized) {
      console.warn('[ThreeManager] Already initialized');
      return;
    }

    console.log('[ThreeManager] Starting initialization...');

    // Check THREE is loaded
    if (typeof THREE === 'undefined') {
      console.error('[ThreeManager] THREE.js not loaded! Check CDN in HTML.');
      return;
    }
    console.log('[ThreeManager] THREE.js loaded:', THREE.REVISION);

    const container = document.getElementById('threejsContainer');
    const canvas = document.getElementById('threejsCanvas');

    console.log('[ThreeManager] DOM elements:', {
      container: container ? 'found' : 'MISSING',
      canvas: canvas ? 'found' : 'MISSING'
    });

    if (!container || !canvas) {
      console.error('[ThreeManager] Missing DOM elements:', {
        container: !!container,
        canvas: !!canvas
      });
      return;
    }

    try {
      // Create caches first (used by renderers)
      console.log('[ThreeManager] Creating caches...');
      this.geometryCache = new GeometryCache();
      this.materialCache = new MaterialCache();

      // Initialize scene
      console.log('[ThreeManager] Initializing scene...');
      this.scene = new ThreeScene(container, canvas);
      this.scene.init();

      // Initialize controls
      console.log('[ThreeManager] Initializing controls...');
      this.controls = new ThreeControls(this.scene.camera, canvas);

      // Initialize UI
      console.log('[ThreeManager] Initializing UI...');
      this.ui = new ThreeUI(this.controls);

      // Check AppState
      console.log('[ThreeManager] Checking AppState...', {
        hasAppState: typeof this.appState !== 'undefined',
        hasEntities: this.appState?.entities ? 'yes' : 'no',
        hasLargeTiles: this.appState?.largeTiles ? 'yes' : 'no'
      });

      // Initialize renderers
      console.log('[ThreeManager] Initializing renderers...');
        this.terrainRenderer = new TerrainRenderer(
          this.scene.scene,
          this.geometryCache,
          this.materialCache,
          (col, row) => this.appState.entities.getHex(col, row)
        );

      this.buildingRenderer = new BuildingRenderer(
        this.scene.scene,
        this.geometryCache,
        this.materialCache
      );

      this.isInitialized = true;
      console.log('[ThreeManager] ✓ Initialized successfully');
    } catch (error) {
      console.error('[ThreeManager] Initialization failed:', error);
      console.error('[ThreeManager] Stack:', error.stack);
    }
  }

  /**
   * Show 3D view
   */
  show() {
    console.log('[ThreeManager] show() called');

    if (!this.isInitialized) {
      console.log('[ThreeManager] Not initialized, calling init()...');
      this.init();

      if (!this.isInitialized) {
        console.error('[ThreeManager] Init failed, cannot show 3D view');
        return;
      }
    }

    const container = document.getElementById('threejsContainer');
    const minimap = document.getElementById('minimap');
    const compass = document.getElementById('compass');

    console.log('[ThreeManager] Showing UI elements:', {
      container: container ? 'found' : 'MISSING',
      minimap: minimap ? 'found' : 'MISSING',
      compass: compass ? 'found' : 'MISSING'
    });

    if (!container) {
      console.error('[ThreeManager] Cannot find threejsContainer element!');
      return;
    }

    container.style.display = 'block';
    if (minimap) minimap.style.display = 'block';
    if (compass) compass.style.display = 'flex';

    // CRITICAL: Force resize after making container visible
    // Container was display:none, so canvas was 0x0
    // Now container is visible, we need to resize the canvas
    setTimeout(() => {
      if (this.scene && this.scene.renderer && this.scene.camera) {
        const width = container.clientWidth;
        const height = container.clientHeight;

        console.log('[ThreeManager] Resizing canvas to:', width, 'x', height);

        this.scene.camera.aspect = width / height;
        this.scene.camera.updateProjectionMatrix();
        this.scene.renderer.setSize(width, height);
      }
    }, 0);

    console.log('[ThreeManager] Container display set to:', container.style.display);
    console.log('[ThreeManager] Container dimensions:', {
      width: container.clientWidth,
      height: container.clientHeight,
      offsetWidth: container.offsetWidth,
      offsetHeight: container.offsetHeight
    });

    // Check this.appState
    if (!this.appState || !this.appState.largeTiles) {
      console.error('[ThreeManager] this.appState or largeTiles not available!', {
        hasAppState: !!this.appState,
        hasLargeTiles: this.appState?.largeTiles ? 'yes' : 'no'
      });
      return;
    }

    console.log('[ThreeManager] AppState status:', {
      tilesCount: this.appState.largeTiles.size,
      heightMapMode: this.appState.heightMapMode,
      buildingsCount: this.appState.entities?.buildings?.size || 0
    });

    try {
      // Build terrain
      console.log('[ThreeManager] Building terrain...');
      this.terrainRenderer.buildTerrain(this.appState.largeTiles, this.appState.heightMapMode);

      // Render existing buildings
      let buildingCount = 0;
      if (this.appState.entities && this.appState.entities.buildings) {
        this.appState.entities.buildings.forEach(building => {
          this.buildingRenderer.renderBuilding(building);
          buildingCount++;
        });
        if (buildingCount > 0) {
          console.log(`[ThreeManager] Rendered ${buildingCount} buildings`);
        }
      }

      // Start animation loop
      console.log('[ThreeManager] Starting animation...');
      this.startAnimation();

      console.log('[ThreeManager] ✓ 3D view activated successfully');
    } catch (error) {
      console.error('[ThreeManager] Error during show():', error);
      console.error('[ThreeManager] Stack:', error.stack);
    }
  }

  /**
   * Hide 3D view
   */
  hide() {
    const container = document.getElementById('threejsContainer');
    const minimap = document.getElementById('minimap');
    const compass = document.getElementById('compass');

    container.style.display = 'none';
    if (minimap) minimap.style.display = 'none';
    if (compass) compass.style.display = 'none';

    // Stop animation
    this.stopAnimation();

    console.log('[ThreeManager] 3D view deactivated');
  }

  /**
   * Start animation loop - THE ONLY RAF LOOP
   */
  startAnimation() {
    if (this.animationFrameId) return; // Already running

    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      // Update controls (keyboard, damping)
      if (this.controls) {
        this.controls.update();
      }

      // Update UI (minimap, compass)
      if (this.ui) {
        this.ui.update(this.appState.largeTiles, this.appState.heightMapMode);
      }

      // Render scene
      if (this.scene) {
        this.scene.render();
      }
    };

    animate();
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update single tile when depth changes
   */
  updateTile(tileId) {
    if (this.terrainRenderer) {
      this.terrainRenderer.updateTile(tileId, this.appState.largeTiles, this.appState.heightMapMode);
    }
  }

  /**
   * Update all terrain colors (fast - no geometry rebuild)
   */
  updateColors() {
    if (this.terrainRenderer) {
      this.terrainRenderer.updateColors(this.appState.largeTiles, this.appState.heightMapMode);
    }
  }

  /**
   * Render a building
   */
  renderBuilding(building) {
    if (this.buildingRenderer) {
      this.buildingRenderer.renderBuilding(building);
    }
  }

  /**
   * Remove a building
   */
  removeBuilding(buildingId) {
    if (this.buildingRenderer) {
      this.buildingRenderer.removeBuilding(buildingId);
    }
  }

  /**
   * Get performance stats
   */
  getStats() {
    if (!this.isInitialized) return null;

    return {
      ...this.scene.getStats(),
      ...this.geometryCache.getStats(),
      ...this.materialCache.getStats(),
      ...this.terrainRenderer.getStats(),
      ...this.buildingRenderer.getStats()
    };
  }

  /**
   * Log performance stats to console
   */
  logStats() {
    const stats = this.getStats();
    if (stats) {
      console.log('[ThreeManager] Performance Stats:', stats);
    }
  }

  /**
   * Complete cleanup
   */
  dispose() {
    this.stopAnimation();

    if (this.controls) this.controls.dispose();
    if (this.terrainRenderer) this.terrainRenderer.dispose();
    if (this.buildingRenderer) this.buildingRenderer.dispose();
    if (this.geometryCache) this.geometryCache.dispose();
    if (this.materialCache) this.materialCache.dispose();
    if (this.scene) this.scene.dispose();

    this.isInitialized = false;
    console.log('[ThreeManager] Disposed');
  }
}

export default new ThreeManager();