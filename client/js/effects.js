// XP orbs, damage numbers, floating text effects
import { PLAYER } from '/shared/constants.js';

// --- XP Orbs ---
let nextOrbId = 0;

export class XPOrb {
  constructor(x, y, amount) {
    this.id = nextOrbId++;
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.radius = Math.min(4 + amount / 10, 10);
    this.collected = false;
    this.life = 30; // seconds before despawn
  }
}

export class OrbManager {
  constructor() {
    this.orbs = [];
  }

  spawn(x, y, amount) {
    // Scatter slightly
    const spread = 20;
    const ox = x + (Math.random() - 0.5) * spread;
    const oy = y + (Math.random() - 0.5) * spread;
    this.orbs.push(new XPOrb(ox, oy, amount));
  }

  update(dt, player, magnetLevel = 0) {
    // Magnet passive: base 50 + 20% per level
    const pickupRadius = PLAYER.PICKUP_RADIUS * (1 + magnetLevel * 0.2);
    const pullSpeed = 6 + magnetLevel * 2;
    this.currentPickupRadius = pickupRadius;
    let totalXP = 0;

    for (const orb of this.orbs) {
      if (orb.collected) continue;
      orb.life -= dt;
      if (orb.life <= 0) {
        orb.collected = true;
        continue;
      }

      const dx = player.x - orb.x;
      const dy = player.y - orb.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Magnet pull - pulls orbs toward player within pickup radius
      if (dist < pickupRadius && dist > 0) {
        const speed = pullSpeed * (1 - dist / pickupRadius + 0.3);
        orb.x += (dx / dist) * speed;
        orb.y += (dy / dist) * speed;
      }

      // Collect on contact
      if (dist < player.radius + orb.radius) {
        orb.collected = true;
        totalXP += orb.amount;
      }
    }

    this.orbs = this.orbs.filter(o => !o.collected);
    return totalXP;
  }

  drawMagnetRange(ctx, camera, playerX, playerY, magnetLevel) {
    if (magnetLevel <= 0) return;
    const { x: sx, y: sy } = camera.worldToScreen(playerX, playerY);
    const radius = this.currentPickupRadius || PLAYER.PICKUP_RADIUS;

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(241, 196, 15, ${0.08 + magnetLevel * 0.03})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  draw(ctx, camera) {
    for (const orb of this.orbs) {
      if (!camera.isVisible(orb.x, orb.y, orb.radius + 5)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(orb.x, orb.y);

      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, orb.radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
      ctx.fill();

      // Orb
      ctx.beginPath();
      ctx.arc(sx, sy, orb.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fill();
    }
  }
}

// --- Floating Text (damage numbers, +XP) ---
export class FloatingText {
  constructor(x, y, text, color = '#ffffff', duration = 0.8) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = duration;
    this.maxLife = duration;
    this.vy = -40; // float upward
    this.dead = false;
  }
}

export class FloatingTextManager {
  constructor() {
    this.texts = [];
  }

  add(x, y, text, color = '#ffffff') {
    this.texts.push(new FloatingText(x, y, text, color));
  }

  update(dt) {
    for (const t of this.texts) {
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) t.dead = true;
    }
    this.texts = this.texts.filter(t => !t.dead);
  }

  draw(ctx, camera) {
    for (const t of this.texts) {
      if (!camera.isVisible(t.x, t.y, 50)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(t.x, t.y);
      const alpha = Math.max(0, t.life / t.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 16px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, sx, sy);
      ctx.restore();
    }
  }
}
