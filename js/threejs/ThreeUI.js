// =============================================================================
// THREE.JS UI - Minimap and compass rendering
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hexToPixel } from '../hex-math.js';

const HEIGHT_SCALE = 8;

class ThreeUI {
  constructor(controls) {
    this.controls = controls;
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.compassNeedle = document.getElementById('compassNeedle');
    this.camDistanceEl = document.getElementById('camDistance');
    this.camAngleEl = document.getElementById('camAngle');
  }

  /**
   * Update UI elements (call every frame)
   */
  update(largeTiles, heightMapMode) {
    this.updateCameraInfo();
    this.updateCompass();
    this.updateMinimap(largeTiles, heightMapMode);
  }

  /**
   * Update camera distance and angle display
   */
  updateCameraInfo() {
    if (!this.controls) return;

    const distance = Math.round(this.controls.spherical.radius);
    const angle = Math.round(this.controls.spherical.phi * 180 / Math.PI);

    if (this.camDistanceEl) {
      this.camDistanceEl.textContent = distance;
    }
    if (this.camAngleEl) {
      this.camAngleEl.textContent = angle + '°';
    }
  }

  /**
   * Update compass needle rotation
   */
  updateCompass() {
    if (!this.controls || !this.compassNeedle) return;

    const theta = this.controls.spherical.theta;
    const degrees = -theta * 180 / Math.PI;
    this.compassNeedle.style.transform = `translateX(-50%) rotate(${degrees}deg)`;
  }

  /**
   * Render minimap with camera position and terrain overview
   */
  updateMinimap(largeTiles, heightMapMode) {
    if (!this.minimapCanvas) return;

    const ctx = this.minimapCanvas.getContext('2d');
    const width = this.minimapCanvas.width;
    const height = this.minimapCanvas.height;

    // Clear
    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Calculate world bounds
    const worldWidth = CONFIG.HEX_GRID_SIZE.cols * CONFIG.HEX_SIZE * Math.sqrt(3);
    const worldHeight = CONFIG.HEX_GRID_SIZE.rows * CONFIG.HEX_SIZE * 1.5;
    const scale = Math.min(width / worldWidth, height / worldHeight);

    // Draw terrain tiles
    ctx.globalAlpha = 0.3;
    largeTiles.forEach(tile => {
      const pixelPos = hexToPixel(tile.centerCol, tile.centerRow);
      const x = (pixelPos.x - worldWidth / 2) * scale + width / 2;
      const y = (pixelPos.y - worldHeight / 2) * scale + height / 2;

      // Color by height
      const tileHeight = (tile.depth - 25) * HEIGHT_SCALE;
      const normalizedHeight = (tileHeight + 200) / 800; // 0 to 1

      if (heightMapMode) {
        // Height map colors
        if (normalizedHeight < 0.3) ctx.fillStyle = '#0066cc';
        else if (normalizedHeight < 0.5) ctx.fillStyle = '#00ccff';
        else if (normalizedHeight < 0.7) ctx.fillStyle = '#66ff66';
        else if (normalizedHeight < 0.9) ctx.fillStyle = '#ffff00';
        else ctx.fillStyle = '#ff3300';
      } else {
        // Depth colors
        const color = this.getDepthColor(tile.depth);
        ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      }

      ctx.fillRect(x - 2, y - 2, 4, 4);
    });
    ctx.globalAlpha = 1.0;

    // Draw camera position
    if (this.controls) {
      const camX = (this.controls.target.x) * scale + width / 2;
      const camY = (this.controls.target.z) * scale + height / 2;

      ctx.save();
      ctx.translate(camX, camY);
      ctx.rotate(-this.controls.spherical.theta);

      // View cone
      ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 20, -Math.PI / 6, Math.PI / 6);
      ctx.closePath();
      ctx.fill();

      // Camera dot
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Direction indicator
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -15);
      ctx.stroke();

      ctx.restore();
    }

    // Border
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }

  /**
   * Get color for depth value
   */
  getDepthColor(depth) {
    const deviation = depth - 25;

    if (deviation < -15) return 0x1a5f7a; // Deep water
    if (deviation < 0) return 0x4a7c8f;   // Shallow water
    if (deviation === 0) return 0x8b5cf6; // Sea level
    if (deviation <= 10) return 0x6ab04c; // Low hills
    if (deviation <= 35) return 0xf39c12; // Hills
    if (deviation <= 60) return 0xe67e22; // Mountains
    return 0xc0392b; // Peaks
  }
}

export default ThreeUI;