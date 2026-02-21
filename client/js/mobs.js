// NPC mob spawning + AI behavior
import { MOBS, MAP } from '/shared/constants.js';

let nextMobId = 0;

export class Mob {
  constructor(type, x, y) {
    this.id = nextMobId++;
    this.type = type;
    const data = MOBS.TYPES[type];
    this.x = x;
    this.y = y;
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.xp = data.xp;
    this.size = data.size;
    this.speed = data.speed;
    this.color = data.color;
    this.sides = data.sides;
    this.angle = Math.random() * Math.PI * 2;
    this.flashTimer = 0;
    this.dead = false;
  }

  update(playerX, playerY) {
    // Move toward player if within 300 units
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 300 && dist > 0) {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
      this.angle = Math.atan2(dy, dx);
    } else {
      // Wander slowly
      this.angle += (Math.random() - 0.5) * 0.1;
      this.x += Math.cos(this.angle) * this.speed * 0.3;
      this.y += Math.sin(this.angle) * this.speed * 0.3;
    }

    // Clamp to map
    this.x = Math.max(this.size, Math.min(MAP.WIDTH - this.size, this.x));
    this.y = Math.max(this.size, Math.min(MAP.HEIGHT - this.size, this.y));

    // Flash timer countdown
    if (this.flashTimer > 0) this.flashTimer -= 1 / 60;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.flashTimer = 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  draw(ctx, camera) {
    if (!camera.isVisible(this.x, this.y, this.size + 20)) return;

    const { x: sx, y: sy } = camera.worldToScreen(this.x, this.y);
    const fillColor = this.flashTimer > 0 ? '#ff4444' : this.color;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    // Draw polygon shape
    ctx.beginPath();
    for (let i = 0; i < this.sides; i++) {
      const a = (Math.PI * 2 / this.sides) * i - Math.PI / 2;
      const px = Math.cos(a) * this.size;
      const py = Math.sin(a) * this.size;
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
    if (this.hp < this.maxHp) {
      const barW = this.size * 2;
      const barH = 3;
      const barX = sx - barW / 2;
      const barY = sy - this.size - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHp), barH);
    }
  }
}

export class MobManager {
  constructor() {
    this.mobs = [];
    this.spawnTimer = 0;
  }

  init() {
    // Spawn initial mobs
    const typeKeys = Object.keys(MOBS.TYPES);
    for (let i = 0; i < MOBS.MAX_MOBS; i++) {
      const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
      const x = Math.random() * MAP.WIDTH;
      const y = Math.random() * MAP.HEIGHT;
      this.mobs.push(new Mob(type, x, y));
    }
  }

  update(dt, playerX, playerY) {
    // Update existing mobs
    for (const mob of this.mobs) {
      mob.update(playerX, playerY);
    }

    // Remove dead mobs
    this.mobs = this.mobs.filter(m => !m.dead);

    // Respawn
    this.spawnTimer += dt;
    const spawnInterval = 1 / MOBS.RESPAWN_RATE;
    while (this.spawnTimer >= spawnInterval && this.mobs.length < MOBS.MAX_MOBS) {
      this.spawnTimer -= spawnInterval;
      this.spawnOne(playerX, playerY);
    }
  }

  spawnOne(playerX, playerY) {
    const typeKeys = Object.keys(MOBS.TYPES);
    const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];

    // Spawn away from player (at least 400 units)
    let x, y, attempts = 0;
    do {
      x = Math.random() * MAP.WIDTH;
      y = Math.random() * MAP.HEIGHT;
      attempts++;
    } while (
      Math.sqrt((x - playerX) ** 2 + (y - playerY) ** 2) < 400 &&
      attempts < 10
    );

    this.mobs.push(new Mob(type, x, y));
  }

  draw(ctx, camera) {
    for (const mob of this.mobs) {
      mob.draw(ctx, camera);
    }
  }
}
