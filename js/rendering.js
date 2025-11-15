// =============================================================================
// RENDERING FUNCTIONS
// =============================================================================

import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { hexToPixel, createHexPolygonPoints, getHexNeighbors, getHexesInRadius } from './hex-math.js';
import { createLargeTileBoundaryPath } from './tile-system.js';
import { getStampWorldCoords } from './stamps.js';

/**
 * Update SVG viewBox
 */
export function updateViewBox() {
  AppState.dom.svg.setAttribute('viewBox',
    `${AppState.viewBox.x} ${AppState.viewBox.y} ${AppState.viewBox.w} ${AppState.viewBox.h}`
  );
}

/**
 * Render the entire hex grid
 */
export function renderHexGrid() {
  for (let row = 0; row < CONFIG.HEX_GRID_SIZE.rows; row++) {
    for (let col = 0; col < CONFIG.HEX_GRID_SIZE.cols; col++) {
      const belongsToTile = findLargeTileForHex(col, row, AppState.largeTiles);
      let direction = 'unassigned';
      let tileId = null;

      if (belongsToTile) {
        direction = getHexDirectionalClass(col, row, belongsToTile.centerCol, belongsToTile.centerRow);
        tileId = belongsToTile.id;
      }

      const { x, y } = hexToPixel(col, row);
      const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hex.setAttribute('points', createHexPolygonPoints(x, y));
      hex.setAttribute('fill', '#2a2838');
      hex.classList.add('hex');
      hex.classList.add(`hex-${direction}`);
      hex.dataset.col = col;
      hex.dataset.row = row;
      hex.dataset.direction = direction;
      if (tileId) {
        hex.dataset.tileId = tileId;
      }
      AppState.dom.polygonsGroup.appendChild(hex);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y);
      text.dataset.col = col;
      text.dataset.row = row;
      text.textContent = '';
      AppState.dom.textsGroup.appendChild(text);
    }
  }
}

/**
 * Render large tile boundaries
 */
export function renderLargeTileBoundaries() {
  AppState.largeTiles.forEach(largeTile => {
    const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    boundary.setAttribute('d', createLargeTileBoundaryPath(largeTile));
    boundary.classList.add('large-tile-boundary');
    boundary.style.display = 'none';
    boundary.dataset.tileId = largeTile.id;

    // Apply depth-based styling
    updateBoundaryDepthStyle(boundary, largeTile.depth);

    AppState.dom.boundariesGroup.appendChild(boundary);
  });
}

/**
 * Update boundary visual style based on depth
 */
export function updateBoundaryDepthStyle(boundary, depth) {
  const deviation = depth - 25;

  // Stroke width increases with deviation from sea level
  const strokeWidth = 3 + Math.min(Math.abs(deviation) / 15, 3);

  // Color changes based on depth
  let strokeColor;
  if (deviation < -15) {
    // Deep water: darker blue
    strokeColor = '#1a5f7a';
  } else if (deviation < 0) {
    // Shallow water: medium blue
    strokeColor = '#4a7c8f';
  } else if (deviation === 0) {
    // Sea level: original purple
    strokeColor = '#8b5cf6';
  } else if (deviation <= 10) {
    // Low hills: green
    strokeColor = '#6ab04c';
  } else if (deviation <= 35) {
    // Hills: yellow-orange
    strokeColor = '#f39c12';
  } else if (deviation <= 60) {
    // Mountains: orange-red
    strokeColor = '#e67e22';
  } else {
    // High peaks: red
    strokeColor = '#c0392b';
  }

  // Use inline styles to override CSS
  boundary.style.stroke = strokeColor;
  boundary.style.strokeWidth = strokeWidth + 'px';

  console.log(`[Depth Update] Depth: ${depth}, Color: ${strokeColor}, Width: ${strokeWidth}px`);
}

/**
 * Render debug center markers
 */
export function renderDebugCenters() {
  AppState.largeTiles.forEach(largeTile => {
    const { x, y } = hexToPixel(largeTile.centerCol, largeTile.centerRow);
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('r', 6);
    marker.classList.add('center-debug');
    marker.style.display = 'none';
    marker.dataset.tileId = largeTile.id;
    AppState.dom.debugCentersGroup.appendChild(marker);
  });
}

/**
 * Show hover preview for painting
 */
export function showHoverPreview(hex) {
  if (!hex || hex.tagName.toLowerCase() !== 'polygon') return;

  if (AppState.stampMode && AppState.selectedStamp) {
    showStampPreview(hex);
    return;
  }

  clearHoverPreview();

  // Use brush size to determine affected hexes
  const col = +hex.dataset.col;
  const row = +hex.dataset.row;
  const radius = AppState.brushSize - 1;
  const hexesToHighlight = getHexesInRadius(col, row, radius);

  hexesToHighlight.forEach(coord => {
    const targetHex = AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${coord.col}"][data-row="${coord.row}"]`);
    if (!targetHex) return;

    const previewHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    previewHex.setAttribute('points', targetHex.getAttribute('points'));

    // Simple preview: semi-transparent color, no glow
    let previewColor;
    if (AppState.currentColor === 'eraser') {
      previewColor = '#2a2838';
    } else if (AppState.currentColor === 'border-pattern') {
      previewColor = 'white';
    } else {
      previewColor = AppState.currentColor;
    }

    previewHex.setAttribute('fill', previewColor);
    previewHex.setAttribute('opacity', '0.5');
    previewHex.setAttribute('stroke', 'yellow');
    previewHex.setAttribute('stroke-width', '1');
    previewHex.setAttribute('pointer-events', 'none'); // Don't block mouse events

    AppState.dom.hoverPreviewGroup.appendChild(previewHex);
  });
}

/**
 * Show stamp preview
 */
export function showStampPreview(hex) {
  if (!AppState.stampMode || !AppState.selectedStamp || !hex) return;

  clearHoverPreview();

  const centerCol = +hex.dataset.col;
  const centerRow = +hex.dataset.row;
  const worldCoords = getStampWorldCoords(AppState.selectedStamp, centerCol, centerRow, AppState.currentStampRotation);

  console.log(`[PREVIEW] Expected ${worldCoords.length} hexes, Hover at [${centerCol},${centerRow}]`);

  let drawnCount = 0;
  worldCoords.forEach(coord => {
    const targetHex = AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${coord.col}"][data-row="${coord.row}"]`);
    if (targetHex) {
      drawnCount++;
      const previewHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      previewHex.setAttribute('points', targetHex.getAttribute('points'));
      previewHex.setAttribute('fill', AppState.selectedStamp.color);
      previewHex.classList.add('stamp-preview');

      if (coord.col >= 0 && coord.col < CONFIG.HEX_GRID_SIZE.cols && coord.row >= 0 && coord.row < CONFIG.HEX_GRID_SIZE.rows) {
        previewHex.classList.add('valid');
      } else {
        previewHex.classList.add('invalid');
      }

      AppState.dom.stampPreviewGroup.appendChild(previewHex);
    } else {
      console.warn(`[PREVIEW] Could not find hex at [${coord.col},${coord.row}]`);
    }
  });

  console.log(`[PREVIEW] Actually drew ${drawnCount} hexes`);
  if (drawnCount !== worldCoords.length) {
    console.error(`[PREVIEW] MISMATCH! Expected ${worldCoords.length} but drew ${drawnCount}`);
  }
}

/**
 * Clear all hover previews
 */
export function clearHoverPreview() {
  AppState.dom.hoverPreviewGroup.innerHTML = '';
  AppState.dom.stampPreviewGroup.innerHTML = '';
}

/**
 * Add border X pattern to a hex
 */
export function addBorderX(hex) {
  const col = +hex.dataset.col, row = +hex.dataset.row;
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

  AppState.dom.borderXGroup.appendChild(g);
}

/**
 * Remove border X pattern from a hex
 */
export function removeBorderX(col, row) {
  const old = AppState.dom.borderXGroup.querySelector(`g[data-col="${col}"][data-row="${row}"]`);
  if (old) AppState.dom.borderXGroup.removeChild(old);
}

/**
 * Update stats display
 */
export function updateStats() {
  document.getElementById('tileCount').textContent = AppState.largeTiles.size;
}

/**
 * Apply 3D transforms to SVG container
 */
export function apply3DView() {
  const container = document.getElementById('svgContainer');
  const svg = AppState.dom.svg;

  if (AppState.show3DView) {
    container.style.perspective = '1200px';
    container.style.perspectiveOrigin = '50% 50%';
    svg.style.transformStyle = 'preserve-3d';
    svg.style.transform = 'rotateX(45deg)';
    svg.style.transition = 'transform 0.6s ease';

    // Apply translateZ to tiles in batches for better performance
    updateTileDepthsBatched();
  } else {
    container.style.perspective = 'none';
    svg.style.transform = 'none';

    // Remove translateZ from all tiles in batches
    clearTile3DBatched();
  }
}

/**
 * Update all tile depths in batches using requestAnimationFrame
 */
export function updateTileDepthsBatched() {
  const tiles = Array.from(AppState.largeTiles.values());
  const BATCH_SIZE = 50; // Process 50 tiles per frame
  let index = 0;

  function processBatch() {
    const end = Math.min(index + BATCH_SIZE, tiles.length);

    for (let i = index; i < end; i++) {
      updateSingleTile3D(tiles[i]);
    }

    index = end;

    if (index < tiles.length) {
      requestAnimationFrame(processBatch);
    } else {
      console.log('[3D View] All tiles transformed');
    }
  }

  console.log(`[3D View] Starting batched transform of ${tiles.length} tiles...`);
  requestAnimationFrame(processBatch);
}

/**
 * Clear 3D transforms in batches
 */
export function clearTile3DBatched() {
  const tiles = Array.from(AppState.largeTiles.values());
  const BATCH_SIZE = 50;
  let index = 0;

  function processBatch() {
    const end = Math.min(index + BATCH_SIZE, tiles.length);

    for (let i = index; i < end; i++) {
      const tile = tiles[i];
      const hexes = tile.hexes.map(h =>
        AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${h.col}"][data-row="${h.row}"]`)
      ).filter(Boolean);

      hexes.forEach(hex => {
        hex.style.transform = '';
      });

      const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tile.id}"]`);
      if (boundary) boundary.style.transform = '';

      const center = AppState.dom.debugCentersGroup.querySelector(`circle[data-tile-id="${tile.id}"]`);
      if (center) center.style.transform = '';
    }

    index = end;

    if (index < tiles.length) {
      requestAnimationFrame(processBatch);
    }
  }

  requestAnimationFrame(processBatch);
}

/**
 * Update depth-based transforms for all tiles
 */
export function updateTileDepths() {
  const Z_SCALE = 2; // Multiplier for depth effect

  AppState.largeTiles.forEach(tile => {
    const zOffset = (tile.depth - 25) * Z_SCALE;

    // Apply to all hexes in the tile
    const hexes = tile.hexes.map(h =>
      AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${h.col}"][data-row="${h.row}"]`)
    ).filter(Boolean);

    hexes.forEach(hex => {
      hex.style.transformStyle = 'preserve-3d';
      hex.style.transform = `translateZ(${zOffset}px)`;
    });

    // Apply to boundary
    const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tile.id}"]`);
    if (boundary) {
      boundary.style.transformStyle = 'preserve-3d';
      boundary.style.transform = `translateZ(${zOffset}px)`;
    }

    // Apply to debug center
    const center = AppState.dom.debugCentersGroup.querySelector(`circle[data-tile-id="${tile.id}"]`);
    if (center) {
      center.style.transformStyle = 'preserve-3d';
      center.style.transform = `translateZ(${zOffset}px)`;
    }
  });
}

/**
 * Update a single tile's depth
 */
export function updateTileDepth(tileId, newDepth) {
  const tile = AppState.largeTiles.get(tileId);
  if (!tile) return;

  tile.depth = newDepth;

  // Update boundary visual style
  const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tileId}"]`);
  if (boundary) {
    updateBoundaryDepthStyle(boundary, newDepth);
  }

  // Update Three.js mesh if 3D view is active
  if (AppState.show3DView && typeof updateTileMesh === 'function') {
    updateTileMesh(tileId);
  }

  // Update old CSS 3D transforms if needed (fallback)
  if (AppState.show3DView && typeof updateSingleTile3D === 'function') {
    updateSingleTile3D(tile);
  }
}

/**
 * Update 3D transform for a single tile (performance optimization)
 */
export function updateSingleTile3D(tile) {
  const Z_SCALE = 2;
  const zOffset = (tile.depth - 25) * Z_SCALE;

  // Apply to all hexes in this tile
  const hexes = tile.hexes.map(h =>
    AppState.dom.polygonsGroup.querySelector(`polygon[data-col="${h.col}"][data-row="${h.row}"]`)
  ).filter(Boolean);

  hexes.forEach(hex => {
    hex.style.transformStyle = 'preserve-3d';
    hex.style.transform = `translateZ(${zOffset}px)`;
  });

  // Apply to boundary
  const boundary = AppState.dom.boundariesGroup.querySelector(`path[data-tile-id="${tile.id}"]`);
  if (boundary) {
    boundary.style.transformStyle = 'preserve-3d';
    boundary.style.transform = `translateZ(${zOffset}px)`;
  }

  // Apply to debug center
  const center = AppState.dom.debugCentersGroup.querySelector(`circle[data-tile-id="${tile.id}"]`);
  if (center) {
    center.style.transformStyle = 'preserve-3d';
    center.style.transform = `translateZ(${zOffset}px)`;
  }
}