// Canvas rendering - background grid, map boundary, HUD
// Updated for multiplayer: renders all players, mobs, projectiles from server state

import { MAP, MOBS } from '/shared/constants.js';

const GRID_SPACING = 80;
const GRID_COLOR = 'rgba(255, 255, 255, 0.04)';
const BOUNDARY_COLOR = 'rgba(231, 76, 60, 0.6)';
const OUTSIDE_COLOR = 'rgba(0, 0, 0, 0.7)';
const BG_COLOR = '#0a0a2e';

// Performance: detect mobile for reduced effects
const IS_MOBILE = 'ontouchstart' in window || navigator.maxTouchPoints > 0 ||
                  window.innerWidth < 768;

// Mob type visual data
const MOB_COLORS = {
  triangle: '#2ecc71',
  square: '#3498db',
  pentagon: '#9b59b6',
};
const MOB_SIDES = {
  triangle: 3,
  square: 4,
  pentagon: 5,
};

export class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;

    // FPS tracking
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.lastFpsTime = performance.now();
  }

  /** Update FPS counter (call once per frame) */
  updateFPS() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  clear() {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid(camera) {
    const ctx = this.ctx;
    const startX = Math.floor(camera.viewportLeft / GRID_SPACING) * GRID_SPACING;
    const startY = Math.floor(camera.viewportTop / GRID_SPACING) * GRID_SPACING;
    const endX = camera.viewportRight;
    const endY = camera.viewportBottom;

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = startX; x <= endX; x += GRID_SPACING) {
      if (x < 0 || x > MAP.WIDTH) continue;
      const sx = x - camera.x;
      ctx.moveTo(sx, Math.max(0, -camera.y));
      ctx.lineTo(sx, Math.min(this.canvas.height, MAP.HEIGHT - camera.y));
    }

    for (let y = startY; y <= endY; y += GRID_SPACING) {
      if (y < 0 || y > MAP.HEIGHT) continue;
      const sy = y - camera.y;
      ctx.moveTo(Math.max(0, -camera.x), sy);
      ctx.lineTo(Math.min(this.canvas.width, MAP.WIDTH - camera.x), sy);
    }

    ctx.stroke();
  }

  drawBoundary(camera) {
    const ctx = this.ctx;
    const { x: sx, y: sy } = camera.worldToScreen(0, 0);
    const w = MAP.WIDTH;
    const h = MAP.HEIGHT;

    ctx.fillStyle = OUTSIDE_COLOR;
    if (sy > 0) ctx.fillRect(0, 0, this.canvas.width, sy);
    const bottomY = sy + h;
    if (bottomY < this.canvas.height) ctx.fillRect(0, bottomY, this.canvas.width, this.canvas.height - bottomY);
    if (sx > 0) ctx.fillRect(0, sy, sx, h);
    const rightX = sx + w;
    if (rightX < this.canvas.width) ctx.fillRect(rightX, sy, this.canvas.width - rightX, h);

    ctx.strokeStyle = BOUNDARY_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, w, h);
  }

  drawSafeZone(camera) {
    const ctx = this.ctx;
    const center = camera.worldToScreen(MAP.WIDTH / 2, MAP.HEIGHT / 2);

    ctx.beginPath();
    ctx.arc(center.x, center.y, MAP.SAFE_ZONE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(46, 204, 113, 0.03)';
    ctx.fill();
  }

  // ========== MULTIPLAYER ENTITY RENDERING ==========

  /** Draw all players from server state */
  drawPlayers(players, prevPlayers, network, camera, localPlayerId, skinManager) {
    const ctx = this.ctx;

    for (const p of players) {
      if (!p.al) continue; // Not alive

      // Interpolate position
      const pos = network.interpolateEntity(p, prevPlayers);
      if (!camera.isVisible(pos.x, pos.y, 100)) continue;

      const { x: sx, y: sy } = camera.worldToScreen(pos.x, pos.y);
      const isLocal = p.i === localPlayerId;
      const radius = p.r || 20;
      const angle = p.a || 0;

      // Immunity glow
      if (p.im) {
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Player body - use skin for local player, default for others
      if (isLocal && skinManager) {
        skinManager.drawPlayer(ctx, sx, sy, radius, p.c || '#00d4ff', angle);
        // Local player white outline
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 1, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = p.c || '#00d4ff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Direction indicator
      const dirX = sx + Math.cos(angle) * (radius + 6);
      const dirY = sy + Math.sin(angle) * (radius + 6);
      ctx.beginPath();
      ctx.arc(dirX, dirY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Name + level
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.n} [Lv.${p.l}]`, sx, sy - radius - 20);

      // HP bar
      const barWidth = 40;
      const barHeight = 5;
      const barX = sx - barWidth / 2;
      const barY = sy - radius - 12;
      const hpRatio = p.h / p.mh;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      const hpColor = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f1c40f' : '#e74c3c';
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, hpRatio), barHeight);
    }
  }

  /** Draw all mobs from server state */
  drawMobs(mobs, prevMobs, network, camera) {
    const ctx = this.ctx;

    for (const m of mobs) {
      // Interpolate position
      const pos = network.interpolateEntity(m, prevMobs);
      const size = m.s || 15;
      if (!camera.isVisible(pos.x, pos.y, size + 20)) continue;

      const { x: sx, y: sy } = camera.worldToScreen(pos.x, pos.y);
      const sides = MOB_SIDES[m.t] || 3;
      const color = MOB_COLORS[m.t] || '#2ecc71';
      const angle = m.a || 0;

      // Damage flash (show red if hp < maxHp recently)
      const fillColor = color;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);

      // Draw polygon shape
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
        const px = Math.cos(a) * size;
        const py = Math.sin(a) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // HP bar (only if damaged)
      if (m.h < m.mh) {
        const barW = size * 2;
        const barH = 3;
        const barX = sx - barW / 2;
        const barY = sy - size - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(barX, barY, barW * (m.h / m.mh), barH);
      }
    }
  }

  /** Draw projectiles from server state */
  drawProjectiles(projectiles, camera) {
    const ctx = this.ctx;

    for (const p of projectiles) {
      switch (p.t) {
        case 'orbit':
          this._drawOrbit(ctx, camera, p);
          break;
        case 'bullet':
          this._drawBullet(ctx, camera, p);
          break;
        case 'shockwave':
          this._drawShockwave(ctx, camera, p);
          break;
        case 'laser':
          this._drawLaser(ctx, camera, p);
          break;
        case 'mines':
          this._drawMine(ctx, camera, p);
          break;
        // Evolution weapons
        case 'plasma_storm':
          this._drawPlasmaStorm(ctx, camera, p);
          break;
        case 'railgun':
          this._drawRailgun(ctx, camera, p);
          break;
        case 'meteor':
          this._drawMeteor(ctx, camera, p);
          break;
      }
    }
  }

  _drawOrbit(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, (p.r || 10) + 10)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sx, sy, p.r || 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawBullet(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, 10)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sx, sy, p.r || 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f';
    ctx.fill();
  }

  _drawShockwave(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, (p.r || 50) + 20)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sx, sy, p.r || 50, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 212, 255, ${(p.al || 0.5) * 0.6})`;
    ctx.lineWidth = 3 + (p.lv || 1);
    ctx.stroke();
  }

  _drawLaser(ctx, camera, p) {
    const start = camera.worldToScreen(p.x, p.y);
    const angle = p.a || 0;
    const length = p.ln || 300;
    const endX = p.x + Math.cos(angle) * length;
    const endY = p.y + Math.sin(angle) * length;
    const end = camera.worldToScreen(endX, endY);
    const alpha = p.al || 0.5;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = `rgba(231, 76, 60, ${alpha})`;
    ctx.lineWidth = 4 + (p.lv || 1) * 2;
    ctx.stroke();
    // Inner glow
    ctx.strokeStyle = `rgba(255, 200, 200, ${alpha * 0.8})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawMine(ctx, camera, p) {
    const radius = p.r || 10;
    if (!camera.isVisible(p.x, p.y, radius + 5)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 / 6) * i;
      const px = sx + Math.cos(a) * radius;
      const py = sy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const blink = Math.sin((p.lf || 1) * 8) > 0 ? 0.9 : 0.4;
    ctx.fillStyle = `rgba(231, 76, 60, ${blink})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- Evolution weapon rendering ---

  _drawPlasmaStorm(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, (p.r || 12) + 15)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    const r = p.r || 12;
    // Outer glow
    ctx.beginPath();
    ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.fill();
    // Core orb
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.5, 'rgba(0, 212, 255, 0.7)');
    grad.addColorStop(1, 'rgba(155, 89, 182, 0.4)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  _drawRailgun(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, 10)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    const r = p.r || 6;
    // Electric bolt style
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffff';
    ctx.fill();
    // Trailing line
    const a = p.a || 0;
    const tailX = sx - Math.cos(a) * 20;
    const tailY = sy - Math.sin(a) * 20;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tailX, tailY);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawMeteor(ctx, camera, p) {
    if (!camera.isVisible(p.x, p.y, 15)) return;
    const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
    const r = p.r || 8;
    // Fire trail
    const a = p.a || 0;
    for (let i = 1; i <= 4; i++) {
      const tx = sx - Math.cos(a) * i * 6;
      const ty = sy - Math.sin(a) * i * 6;
      ctx.beginPath();
      ctx.arc(tx, ty, r * (1 - i * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, ${100 + i * 30}, 20, ${0.5 - i * 0.1})`;
      ctx.fill();
    }
    // Meteor body
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** Draw XP orbs from server state */
  drawOrbs(orbs, prevOrbs, network, camera) {
    const ctx = this.ctx;

    for (const orb of orbs) {
      const pos = network.interpolateEntity(orb, prevOrbs);
      const radius = orb.r || 5;
      if (!camera.isVisible(pos.x, pos.y, radius + 5)) continue;

      const { x: sx, y: sy } = camera.worldToScreen(pos.x, pos.y);

      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
      ctx.fill();

      // Orb
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fill();
    }
  }

  // ========== HUD ==========

  drawHUD(player) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // --- XP Bar (bottom center) ---
    const xpBarW = Math.min(340, cw * 0.3);
    const xpBarH = 12;
    const xpBarX = (cw - xpBarW) / 2;
    const xpBarY = ch - 36;
    const xpToNext = player.xpToNextLevel || 1;
    const xpRatio = Math.min(player.xp / xpToNext, 1);

    // BG
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    this._roundRect(ctx, xpBarX, xpBarY, xpBarW, xpBarH, 6);
    ctx.fill();

    // Fill
    if (xpRatio > 0) {
      ctx.fillStyle = '#f1c40f';
      if (!IS_MOBILE) { ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = 8; }
      this._roundRect(ctx, xpBarX, xpBarY, xpBarW * xpRatio, xpBarH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Level badge
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 13px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Lv.${player.level}`, cw / 2, xpBarY - 8);

    // --- HP Bar (bottom left) ---
    const hpBarW = 140;
    const hpBarH = 8;
    const hpBarX = 24;
    const hpBarY = ch - 32;
    const hpRatio = player.hp / player.maxHp;

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    this._roundRect(ctx, hpBarX, hpBarY, hpBarW, hpBarH, 4);
    ctx.fill();

    const hpColor = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f1c40f' : '#e74c3c';
    if (hpRatio > 0) {
      ctx.fillStyle = hpColor;
      if (!IS_MOBILE) { ctx.shadowColor = hpColor; ctx.shadowBlur = 6; }
      this._roundRect(ctx, hpBarX, hpBarY, hpBarW * Math.max(0, hpRatio), hpBarH, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px Space Grotesk, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${player.hp}/${player.maxHp}`, hpBarX, hpBarY - 6);

    // --- FPS counter (top right, small) ---
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.fps} FPS`, cw - 10, 16);
  }

  // ========== LEADERBOARD ==========

  drawLeaderboard(leaderboard, localPlayerId, players) {
    if (!leaderboard || leaderboard.length === 0) return;

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const x = cw - 200;
    const y = 20;
    const lineHeight = 22;
    const padding = 12;
    const width = 180;
    const height = padding * 2 + lineHeight * Math.min(leaderboard.length, 10) + 24;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this._roundRect(ctx, x, y, width, height, 8);
    ctx.fill();

    // Title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 13px Space Grotesk, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LEADERBOARD', x + padding, y + padding + 12);

    // Entries
    ctx.font = '12px Space Grotesk, sans-serif';
    for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
      const entry = leaderboard[i];
      const ey = y + padding + 32 + i * lineHeight;

      // Highlight local player
      const localPlayer = players.find(p => p.i === localPlayerId);
      const isLocal = localPlayer && entry.name === localPlayer.n;

      ctx.fillStyle = isLocal ? '#00d4ff' : 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${entry.name}`, x + padding, ey);

      ctx.textAlign = 'right';
      ctx.fillText(`Lv.${entry.level}`, x + width - padding, ey);
    }
  }

  // ========== KILL FEED ==========

  drawKillFeed(killFeed) {
    if (!killFeed || killFeed.length === 0) return;

    const ctx = this.ctx;
    const x = 20;
    const startY = 20;

    for (let i = 0; i < killFeed.length; i++) {
      const entry = killFeed[i];
      const age = (Date.now() - entry.time) / 1000;
      const alpha = Math.max(0, 1 - age / 5);
      const y = startY + i * 24;

      ctx.globalAlpha = alpha;
      ctx.font = '12px Space Grotesk, sans-serif';
      ctx.textAlign = 'left';

      // Killer name
      ctx.fillStyle = '#e74c3c';
      ctx.fillText(entry.killer, x, y);

      // Arrow
      const killerWidth = ctx.measureText(entry.killer).width;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(' > ', x + killerWidth, y);

      // Victim name
      const arrowWidth = ctx.measureText(' > ').width;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(entry.victim, x + killerWidth + arrowWidth, y);

      ctx.globalAlpha = 1;
    }
  }

  // ========== MINIMAP ==========

  drawMinimap(players, mobs, localPlayerId, playerX, playerY) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const size = 140;
    const padding = 16;
    const x = cw - size - padding;
    const y = ch - size - padding - 40; // Above XP bar
    const scale = size / MAP.WIDTH;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this._roundRect(ctx, x, y, size, size, 6);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, size, size, 6);
    ctx.stroke();

    // Safe zone
    ctx.beginPath();
    ctx.arc(
      x + (MAP.WIDTH / 2) * scale,
      y + (MAP.HEIGHT / 2) * scale,
      MAP.SAFE_ZONE_RADIUS * scale,
      0, Math.PI * 2
    );
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.fill();

    // Mobs as small dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (const m of mobs) {
      const mx = x + m.x * scale;
      const my = y + m.y * scale;
      ctx.fillRect(mx, my, 1, 1);
    }

    // Other players as colored dots
    for (const p of players) {
      if (!p.al) continue;
      const px = x + p.x * scale;
      const py = y + p.y * scale;
      const isLocal = p.i === localPlayerId;

      ctx.beginPath();
      ctx.arc(px, py, isLocal ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = isLocal ? '#00d4ff' : (p.c || '#e74c3c');
      ctx.fill();
    }
  }

  // ========== UTILITY ==========

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
