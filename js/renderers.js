// =============================================================================
// RENDERER ABSTRACTION LAYER
// =============================================================================

import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { hexToPixel, createHexPolygonPoints, getHexNeighbors, getHexDirectionalClass } from './hex-math.js';
import { createLargeTileBoundaryPath, findLargeTileForHex } from './tile-system.js';
import MaterialCache from './threejs/MaterialCache.js'

/**
 * SVGRenderer - Handles all SVG/DOM rendering
 */
export class SVGRenderer {
  constructor() {
    this.svg = null;
    this.groups = {
      polygons: null,
      texts: null,
      borderX: null,
      boundaries: null,
      debugCenters: null,
      hoverPreview: null,
      stampPreview: null
    };
    this.appState = null; // Store reference to avoid circular import
  }

  /**
   * Initialize renderer with DOM references
   */
  initialize(svgElement, groups, appState) {
    this.svg = svgElement;
    this.groups = groups;
    this.appState = appState;
    console.log('[SVGRenderer] Initialized');
  }

  /**
   * Render entire hex grid
   */
  renderHexGrid(entityManager) {
    const cols = CONFIG.HEX_GRID_SIZE.cols;
    const rows = CONFIG.HEX_GRID_SIZE.rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const hexData = entityManager.getHex(col, row);
        const tile = findLargeTileForHex(col, row, entityManager.tiles);

        let direction = 'unassigned';
        let tileId = null;

        if (tile) {
          direction = getHexDirectionalClass(col, row, tile.centerCol, tile.centerRow);
          tileId = tile.id;
        }

        const { x, y } = hexToPixel(col, row);

        // Create hex polygon
        const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        hex.setAttribute('points', createHexPolygonPoints(x, y));
        hex.setAttribute('fill', hexData.color);
        hex.classList.add('hex');
        hex.classList.add(`hex-${direction}`);
        hex.dataset.col = col;
        hex.dataset.row = row;
        hex.dataset.direction = direction;
        if (tileId) {
          hex.dataset.tileId = tileId;
        }
        this.groups.polygons.appendChild(hex);

        // Create text element
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.dataset.col = col;
        text.dataset.row = row;
        text.textContent = hexData.text;
        this.groups.texts.appendChild(text);
      }
    }

    console.log('[SVGRenderer] Rendered hex grid');
  }

  /**
   * Render all tile boundaries
   */
  renderTileBoundaries(entityManager, showBoundaries) {
    entityManager.tiles.forEach(tile => {
      const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      boundary.setAttribute('d', createLargeTileBoundaryPath(tile));
      boundary.classList.add('large-tile-boundary');
      boundary.style.display = showBoundaries ? 'block' : 'none';
      boundary.dataset.tileId = tile.id;

      // Apply depth-based styling
      this.updateBoundaryDepthStyle(boundary, tile.depth);

      this.groups.boundaries.appendChild(boundary);

      // Store reference
      tile.svgBoundary = boundary;
    });

    console.log('[SVGRenderer] Rendered tile boundaries');
  }

  /**
   * Render debug center markers
   */
  renderDebugCenters(entityManager, showCenters) {
    entityManager.tiles.forEach(tile => {
      const { x, y } = hexToPixel(tile.centerCol, tile.centerRow);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', 6);
      marker.classList.add('center-debug');
      marker.style.display = showCenters ? 'block' : 'none';
      marker.dataset.tileId = tile.id;
      this.groups.debugCenters.appendChild(marker);

      // Store reference
      tile.svgDebugMarker = marker;
    });

    console.log('[SVGRenderer] Rendered debug centers');
  }

  /**
   * Update single hex color
   */
  updateHexColor(hexData) {
    const hex = this.groups.polygons.querySelector(
      `polygon[data-col="${hexData.col}"][data-row="${hexData.row}"]`
    );

    if (!hex) return;

    // Remove border X if exists
    this.removeBorderX(hexData.col, hexData.row);

    if (hexData.patterned) {
      hex.setAttribute('fill', 'white');
      hex.setAttribute('data-patterned', 'true');
      this.addBorderX(hex, hexData.col, hexData.row);
    } else {
      hex.setAttribute('fill', hexData.color);
      hex.removeAttribute('data-patterned');
    }
  }

  /**
   * Update hex text
   */
  updateHexText(hexData) {
    const text = this.groups.texts.querySelector(
      `text[data-col="${hexData.col}"][data-row="${hexData.row}"]`
    );

    if (text) {
      text.textContent = hexData.text;
    }
  }

  /**
   * Update tile depth visual style
   */
  updateTileDepth(tile) {
    if (tile.svgBoundary) {
      this.updateBoundaryDepthStyle(tile.svgBoundary, tile.depth);
    }
  }

  /**
   * Update boundary visual style based on depth
   */
  updateBoundaryDepthStyle(boundary, depth) {
    const deviation = depth - 25;
    const strokeWidth = 3 + Math.min(Math.abs(deviation) / 15, 3);

    let strokeColor;
    if (deviation < -15) strokeColor = '#1a5f7a';
    else if (deviation < 0) strokeColor = '#4a7c8f';
    else if (deviation === 0) strokeColor = '#8b5cf6';
    else if (deviation <= 10) strokeColor = '#6ab04c';
    else if (deviation <= 35) strokeColor = '#f39c12';
    else if (deviation <= 60) strokeColor = '#e67e22';
    else strokeColor = '#c0392b';

    boundary.style.stroke = strokeColor;
    boundary.style.strokeWidth = strokeWidth + 'px';
  }

  /**
   * Render building on grid (as overlay, not replacement)
   */
  renderBuilding(building) {
    // Defensive: ensure array is empty before rendering
    // (Should be cleared by removeBuilding, but be explicit)
    if (building.svgHexes.length > 0) {
      console.warn(`[SVGRenderer] Building ${building.id} has ${building.svgHexes.length} existing overlays - cleaning up`);
      building.svgHexes.forEach(overlay => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      });
      building.svgHexes = [];
    }

    building.hexes.forEach(hex => {
      const hexElement = this.groups.polygons.querySelector(
        `polygon[data-col="${hex.col}"][data-row="${hex.row}"]`
      );

      if (hexElement) {
        // Create building overlay in buildings group
        const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        overlay.setAttribute('points', hexElement.getAttribute('points'));
        overlay.setAttribute('fill', building.color);
        overlay.setAttribute('fill-opacity', '0.75');
        overlay.setAttribute('stroke', building.color);
        overlay.setAttribute('stroke-width', '2');
        overlay.classList.add('building-overlay');
        overlay.dataset.buildingId = building.id;
        overlay.dataset.col = hex.col;
        overlay.dataset.row = hex.row;

        // Add to buildings group (renders above terrain)
        if (this.groups.buildings) {
          this.groups.buildings.appendChild(overlay);
        } else {
          // Fallback: add after polygons group
          this.groups.polygons.parentNode.appendChild(overlay);
        }

        building.svgHexes.push(overlay);
      }
    });

    console.log(`[SVGRenderer] Rendered building ${building.stampName} with ${building.svgHexes.length} overlays`);
  }

  /**
   * Remove building from SVG
   */
  removeBuilding(building) {
    console.log(`[SVGRenderer] Removing building overlays: ${building.svgHexes.length} elements`);

    // Remove building overlay elements
    let removedCount = 0;
    building.svgHexes.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        removedCount++;
      } else if (overlay) {
        console.warn('[SVGRenderer] Overlay has no parent:', overlay);
      }
    });

    console.log(`[SVGRenderer] Removed ${removedCount} overlays from DOM`);
    building.svgHexes = [];

    // Update underlying hexes to show terrain
    building.hexes.forEach(hex => {
      const hexData = this.appState.entities.getHex(hex.col, hex.row);
      if (hexData) {
        this.updateHexColor(hexData);
      }
    });
  }

  /**
   * Highlight building
   */
  highlightBuilding(building) {
    building.svgHexes.forEach(hex => {
      hex.classList.add('building-selected');
    });
  }

  /**
   * Clear building highlight
   */
  clearBuildingHighlight() {
    this.groups.polygons.querySelectorAll('.building-selected').forEach(hex => {
      hex.classList.remove('building-selected');
    });
  }

  /**
   * Add border X pattern
   */
  addBorderX(hex, col, row) {
    const points = hex.getAttribute('points').split(',');
    let xs = [], ys = [];
    for (let i = 0; i < points.length; i += 2) {
      xs.push(parseFloat(points[i]));
      ys.push(parseFloat(points[i + 1]));
    }
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('border-x');
    g.dataset.col = col;
    g.dataset.row = row;

    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', cx - 6);
    line1.setAttribute('y1', cy - 6);
    line1.setAttribute('x2', cx + 6);
    line1.setAttribute('y2', cy + 6);
    line1.setAttribute('stroke', '#333');
    line1.setAttribute('stroke-width', '2');
    g.appendChild(line1);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', cx - 6);
    line2.setAttribute('y1', cy + 6);
    line2.setAttribute('x2', cx + 6);
    line2.setAttribute('y2', cy - 6);
    line2.setAttribute('stroke', '#333');
    line2.setAttribute('stroke-width', '2');
    g.appendChild(line2);

    this.groups.borderX.appendChild(g);
  }

  /**
   * Remove border X pattern
   */
  removeBorderX(col, row) {
    const old = this.groups.borderX.querySelector(`g[data-col="${col}"][data-row="${row}"]`);
    if (old) this.groups.borderX.removeChild(old);
  }

  /**
   * Show hover preview
   */
  showHoverPreview(hexesToHighlight, color, isPatterned) {
    this.clearHoverPreview();

    hexesToHighlight.forEach(coord => {
      const targetHex = this.groups.polygons.querySelector(
        `polygon[data-col="${coord.col}"][data-row="${coord.row}"]`
      );
      if (!targetHex) return;

      const previewHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      previewHex.setAttribute('points', targetHex.getAttribute('points'));
      previewHex.classList.add('hex-hover-preview');

      let previewColor = color;
      if (color === 'eraser') previewColor = '#2a2838';
      else if (color === 'border-pattern') previewColor = 'white';

      previewHex.setAttribute('fill', previewColor);
      this.groups.hoverPreview.appendChild(previewHex);
    });
  }

  /**
   * Show stamp preview
   */
  showStampPreview(worldCoords, stampColor, isValid) {
    this.clearHoverPreview();

    worldCoords.forEach(coord => {
      const targetHex = this.groups.polygons.querySelector(
        `polygon[data-col="${coord.col}"][data-row="${coord.row}"]`
      );

      if (targetHex) {
        const previewHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        previewHex.setAttribute('points', targetHex.getAttribute('points'));
        previewHex.setAttribute('fill', stampColor);
        previewHex.classList.add('stamp-preview');

        if (isValid) {
          previewHex.classList.add('valid');
        } else {
          previewHex.classList.add('invalid');
        }

        this.groups.stampPreview.appendChild(previewHex);
      }
    });
  }

  /**
   * Clear hover preview
   */
  clearHoverPreview() {
    this.groups.hoverPreview.innerHTML = '';
    this.groups.stampPreview.innerHTML = '';
  }

  /**
   * Toggle boundaries visibility
   */
  toggleBoundaries(show) {
    this.groups.boundaries.querySelectorAll('.large-tile-boundary').forEach(boundary => {
      boundary.style.display = show ? 'block' : 'none';
    });
  }

  /**
   * Toggle debug centers visibility
   */
  toggleDebugCenters(show) {
    this.groups.debugCenters.querySelectorAll('.center-debug').forEach(marker => {
      marker.style.display = show ? 'block' : 'none';
    });
  }
}

/**
 * ThreeRenderer - Handles all Three.js 3D rendering
 */
export class ThreeRenderer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.tileMeshes = new Map();  // tileId -> Group
    this.buildingMeshes = new Map(); // buildingId -> Mesh/Group
    this.animationFrameId = null;
    this.appState = null; // Store reference to avoid circular import

    // Geometry cache for performance
    this.geometryCache = new Map();
    this.materialCache = new Map();

    this.config = {
      HEX_RADIUS: 20,
      HEIGHT_SCALE: 8,
      BASELINE: -80,
      CAMERA_DISTANCE: 1200,
      CAMERA_HEIGHT: 800,
      CAMERA_ANGLE: Math.PI / 4
    };
  }

  /**
   * Initialize Three.js scene
   */
  initialize(container, canvas, appState) {
    console.log('[ThreeRenderer] Initializing...');

    this.appState = appState;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.Fog(0x0a0a0f, 1000, 3000);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 5000);
    this.resetCamera();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Setup controls, lighting, reference grid
    this.setupControls(canvas);
    this.setupLighting();
    this.addReferenceGrid();
    this.addAxesHelper();

    // Handle resize
    window.addEventListener('resize', () => this.onResize(container));

    console.log('[ThreeRenderer] Initialized');
  }

  /**
   * Setup camera controls
   */
  setupControls(canvas) {
    const target = new THREE.Vector3(0, 0, 0);
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(this.camera.position.clone().sub(target));

    let isRotating = false;
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };

    let rotationVelocity = { theta: 0, phi: 0 };
    let panVelocity = { x: 0, y: 0 };
    const damping = 0.85;
    const minVelocity = 0.001;

    const updateCameraPosition = () => {
      const offset = new THREE.Vector3();
      offset.setFromSpherical(spherical);
      this.camera.position.copy(target).add(offset);
      this.camera.lookAt(target);
    };

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isRotating = true;
        rotationVelocity = { theta: 0, phi: 0 };
      }
      if (e.button === 2) {
        isPanning = true;
        panVelocity = { x: 0, y: 0 };
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isRotating && !isPanning) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (isRotating) {
        const rotateSpeed = 0.005;
        rotationVelocity.theta = -deltaX * rotateSpeed;
        rotationVelocity.phi = -deltaY * rotateSpeed;

        spherical.theta += rotationVelocity.theta;
        spherical.phi += rotationVelocity.phi;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

        updateCameraPosition();
      }

      if (isPanning) {
        const panSpeed = 2;
        panVelocity.x = -deltaX * panSpeed;
        panVelocity.y = deltaY * panSpeed;

        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        this.camera.getWorldDirection(right);
        right.cross(up).normalize();

        target.add(right.multiplyScalar(panVelocity.x));
        target.add(up.multiplyScalar(panVelocity.y));

        updateCameraPosition();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
      isRotating = false;
      isPanning = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      spherical.radius += e.deltaY * 0.5;
      spherical.radius = Math.max(200, Math.min(2000, spherical.radius));
      updateCameraPosition();
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard controls
    const keyState = {};
    const moveSpeed = 30;
    const rotateSpeed = 0.03;

    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      keyState[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      keyState[e.key.toLowerCase()] = false;
    });

    const processKeyboard = () => {
      if (!this.camera || !this.appState.show3DView) {
        requestAnimationFrame(processKeyboard);
        return;
      }

      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (keyState['w']) target.add(forward.clone().multiplyScalar(moveSpeed));
      if (keyState['s']) target.add(forward.clone().multiplyScalar(-moveSpeed));
      if (keyState['a']) target.add(right.clone().multiplyScalar(-moveSpeed));
      if (keyState['d']) target.add(right.clone().multiplyScalar(moveSpeed));
      if (keyState['q']) spherical.theta += rotateSpeed;
      if (keyState['e']) spherical.theta -= rotateSpeed;
      if (keyState['r']) target.y += moveSpeed;
      if (keyState['f']) target.y -= moveSpeed;

      if (keyState['w'] || keyState['s'] || keyState['a'] || keyState['d'] ||
          keyState['q'] || keyState['e'] || keyState['r'] || keyState['f']) {
        updateCameraPosition();
      }

      requestAnimationFrame(processKeyboard);
    };
    processKeyboard();

    // Apply damping
    const applyDamping = () => {
      if (!isRotating && (Math.abs(rotationVelocity.theta) > minVelocity || Math.abs(rotationVelocity.phi) > minVelocity)) {
        spherical.theta += rotationVelocity.theta;
        spherical.phi += rotationVelocity.phi;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

        rotationVelocity.theta *= damping;
        rotationVelocity.phi *= damping;

        if (Math.abs(rotationVelocity.theta) < minVelocity) rotationVelocity.theta = 0;
        if (Math.abs(rotationVelocity.phi) < minVelocity) rotationVelocity.phi = 0;

        updateCameraPosition();
      }

      if (!isPanning && (Math.abs(panVelocity.x) > minVelocity || Math.abs(panVelocity.y) > minVelocity)) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        this.camera.getWorldDirection(right);
        right.cross(up).normalize();

        target.add(right.clone().multiplyScalar(panVelocity.x));
        target.add(up.clone().multiplyScalar(panVelocity.y));

        panVelocity.x *= damping;
        panVelocity.y *= damping;

        if (Math.abs(panVelocity.x) < minVelocity) panVelocity.x = 0;
        if (Math.abs(panVelocity.y) < minVelocity) panVelocity.y = 0;

        updateCameraPosition();
      }

      requestAnimationFrame(applyDamping);
    };
    applyDamping();

    this.controls = { target, spherical, updateCameraPosition };
  }

  /**
   * Setup scene lighting
   */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 800, 300);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -1000;
    dirLight.shadow.camera.right = 1000;
    dirLight.shadow.camera.top = 1000;
    dirLight.shadow.camera.bottom = -1000;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a3a2a, 0.3);
    this.scene.add(hemiLight);
  }

  /**
   * Add reference grid
   */
  addReferenceGrid() {
    const gridSize = 2500;
    const divisions = 50;
    const grid = new THREE.GridHelper(gridSize, divisions, 0x00ffff, 0x333333);
    grid.position.y = 0;
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    this.scene.add(grid);

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
   * Add axes helper
   */
  addAxesHelper() {
    const axesHelper = new THREE.AxesHelper(300);
    axesHelper.position.y = 1;
    this.scene.add(axesHelper);
  }

  /**
   * Reset camera to default position
   */
  resetCamera() {
    this.camera.position.set(0, this.config.CAMERA_HEIGHT, this.config.CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.spherical.setFromVector3(this.camera.position);
    }
  }

  /**
   * Get or create shared hex geometry
   */
  getHexGeometry(extrudeDepth) {
    const key = `hex_${extrudeDepth.toFixed(1)}`;

    if (this.geometryCache.has(key)) {
      return this.geometryCache.get(key);
    }

    const shape = new THREE.Shape();
    const radius = this.config.HEX_RADIUS;

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = radius * Math.cos(angle);
      const pz = radius * Math.sin(angle);

      if (i === 0) {
        shape.moveTo(px, pz);
      } else {
        shape.lineTo(px, pz);
      }
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeDepth,
      bevelEnabled: false
    });

    this.geometryCache.set(key, geometry);
    return geometry;
  }

  /**
   * Render all terrain tiles
   */
  renderTerrain(entityManager) {
    console.log('[ThreeRenderer] Building terrain...');

    entityManager.tiles.forEach(tile => {
      const mesh = this.createTileMesh(tile, entityManager);
      if (mesh) {
        this.scene.add(mesh);
        this.tileMeshes.set(tile.id, mesh);
        tile.threeMesh = mesh;
      }
    });

    console.log(`[ThreeRenderer] Created ${this.tileMeshes.size} tile meshes`);
  }

  /**
   * Create mesh for a single tile
   */
  createTileMesh(tile, entityManager) {
    const group = new THREE.Group();
    group.userData.tileId = tile.id;

    const height = (tile.depth - 25) * this.config.HEIGHT_SCALE;
    const extrudeDepth = Math.max(1, height - this.config.BASELINE);

    tile.hexes.forEach(hex => {
      const pixelPos = hexToPixel(hex.col, hex.row);
      const x = pixelPos.x - (CONFIG.HEX_GRID_SIZE.cols * CONFIG.HEX_SIZE * Math.sqrt(3)) / 2;
      const z = pixelPos.y - (CONFIG.HEX_GRID_SIZE.rows * CONFIG.HEX_SIZE * 1.5) / 2;

      // Get color from HexData
      const hexData = entityManager.getHex(hex.col, hex.row);
      let displayColor;

      if (this.appState.heightMapMode) {
        displayColor = this.getHeightColor(height);
      } else {
        try {
          displayColor = new THREE.Color(hexData.color).getHex();
        } catch (e) {
          displayColor = 0x2a2838;
        }
      }

      const hexMesh = this.createHexMesh(x, height, z, displayColor, extrudeDepth);
      group.add(hexMesh);
    });

    // Add boundary wireframe
    const boundary = this.createTileBoundaryWireframe(tile, height);
    if (boundary) group.add(boundary);

    return group;
  }

  /**
   * Create single hex mesh
   */
  createHexMesh(x, y, z, color, extrudeDepth) {
    const geometry = this.getHexGeometry(extrudeDepth);
    const heightFactor = (y + 80) / 240;
    const material = MemoryCache.getMaterial(color, heightFactor);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, this.config.BASELINE, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Create tile boundary wireframe
   */
  createTileBoundaryWireframe(tile, height) {
    const vertices = getClusterBoundaryVertices(tile);
    if (vertices.length < 3) return null;

    const points = [];
    const centerOffsetX = (CONFIG.HEX_GRID_SIZE.cols * CONFIG.HEX_SIZE * Math.sqrt(3)) / 2;
    const centerOffsetZ = (CONFIG.HEX_GRID_SIZE.rows * CONFIG.HEX_SIZE * 1.5) / 2;

    vertices.forEach(v => {
      const x = v.x - centerOffsetX;
      const z = v.y - centerOffsetZ;
      points.push(new THREE.Vector3(x, height + 2, z));
    });

    points.push(points[0].clone());

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
      opacity: 0.6,
      transparent: true
    });

    return new THREE.Line(geometry, material);
  }

  /**
   * Update single tile mesh
   */
  updateTileDepth(tile) {
    const oldMesh = this.tileMeshes.get(tile.id);
    if (oldMesh) {
      this.scene.remove(oldMesh);
      oldMesh.traverse((child) => {
        if (child.isMesh) {
          if (child.material) child.material.dispose();
          // Don't dispose geometry - it's cached
        }
      });
    }

    const newMesh = this.createTileMesh(tile, this.appState.entities);
    this.scene.add(newMesh);
    this.tileMeshes.set(tile.id, newMesh);
    tile.threeMesh = newMesh;
  }

  /**
   * Rebuild all terrain colors (for height map toggle)
   */
  rebuildTerrainColors(entityManager) {
    console.log('[ThreeRenderer] Rebuilding terrain colors...');

    this.tileMeshes.forEach((mesh, tileId) => {
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.dispose();
        }
      });
      this.scene.remove(mesh);
    });
    this.tileMeshes.clear();

    entityManager.tiles.forEach(tile => {
      const mesh = this.createTileMesh(tile, entityManager);
      if (mesh) {
        this.scene.add(mesh);
        this.tileMeshes.set(tile.id, mesh);
        tile.threeMesh = mesh;
      }
    });

    console.log('[ThreeRenderer] Rebuild complete');
  }

  /**
   * Get height-based color
   */
  getHeightColor(y) {
    const normalizedHeight = (y + 80) / 240;

    if (normalizedHeight < 0.25) return 0x0066cc;
    if (normalizedHeight < 0.4) return 0x0099ff;
    if (normalizedHeight < 0.5) return 0x00ccff;
    if (normalizedHeight < 0.6) return 0x66ff66;
    if (normalizedHeight < 0.7) return 0xffff00;
    if (normalizedHeight < 0.85) return 0xff9900;
    return 0xff3300;
  }

  /**
   * Start animation loop
   */
  startAnimation() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
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
   * Handle window resize
   */
  onResize(container) {
    if (!this.camera || !this.renderer) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.stopAnimation();

    // Dispose cached geometries
    this.geometryCache.forEach(geom => geom.dispose());
    this.geometryCache.clear();

    // Dispose tile meshes
    this.tileMeshes.forEach(mesh => {
      mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.material) child.material.dispose();
        }
      });
      this.scene.remove(mesh);
    });
    this.tileMeshes.clear();

    if (this.renderer) {
      this.renderer.dispose();
    }

    console.log('[ThreeRenderer] Disposed');
  }
}