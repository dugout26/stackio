// All 6 weapon types + upgrade logic
import { WEAPONS } from '/shared/constants.js';

let nextProjectileId = 0;

// --- Orbit Weapon ---
export class OrbitWeapon {
  constructor() {
    this.key = 'orbit';
    this.level = 1;
    this.angle = 0;
    this.orbs = [];
    this.hitCooldowns = new Map();
  }

  get data() { return WEAPONS.orbit; }
  get count() { return this.data.count + (this.level - 1); }
  get damage() { return this.data.damage * (1 + (this.level - 1) * 0.2); }
  get range() { return this.data.range + (this.level - 1) * 5; }

  update(dt, playerX, playerY) {
    this.angle += this.data.rotationSpeed * dt;
    this.orbs = [];
    for (let i = 0; i < this.count; i++) {
      const a = this.angle + (Math.PI * 2 / this.count) * i;
      this.orbs.push({
        x: playerX + Math.cos(a) * this.range,
        y: playerY + Math.sin(a) * this.range,
        radius: 8 + this.level,
      });
    }
  }

  checkCollision(mobs, now) {
    const hits = [];
    for (const orb of this.orbs) {
      for (const mob of mobs) {
        if (mob.dead) continue;
        const dx = orb.x - mob.x;
        const dy = orb.y - mob.y;
        if (dx * dx + dy * dy < (orb.radius + mob.size) ** 2) {
          const lastHit = this.hitCooldowns.get(mob.id) || 0;
          if (now - lastHit > 200) {
            this.hitCooldowns.set(mob.id, now);
            hits.push({ mob, damage: this.damage, x: mob.x, y: mob.y });
          }
        }
      }
    }
    if (this.hitCooldowns.size > 500) {
      for (const [k, v] of this.hitCooldowns) {
        if (now - v > 1000) this.hitCooldowns.delete(k);
      }
    }
    return hits;
  }

  draw(ctx, camera) {
    for (const orb of this.orbs) {
      if (!camera.isVisible(orb.x, orb.y, orb.radius + 10)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(orb.x, orb.y);
      ctx.beginPath();
      ctx.arc(sx, sy, orb.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

// --- Bullet Weapon ---
export class BulletWeapon {
  constructor() {
    this.key = 'bullet';
    this.level = 1;
    this.bullets = [];
    this.lastFire = 0;
  }

  get data() { return WEAPONS.bullet; }
  get damage() { return this.data.damage * (1 + (this.level - 1) * 0.2); }
  get rate() { return this.data.rate / (1 + (this.level - 1) * 0.1); }
  get bulletCount() { return 1 + (this.level - 1); }

  update(dt, playerX, playerY, mobs, now) {
    for (const b of this.bullets) {
      b.x += Math.cos(b.angle) * this.data.speed;
      b.y += Math.sin(b.angle) * this.data.speed;
      b.life -= dt;
    }
    this.bullets = this.bullets.filter(b => b.life > 0);

    if (now - this.lastFire >= this.rate && mobs.length > 0) {
      this.lastFire = now;
      const sorted = mobs
        .filter(m => !m.dead)
        .map(m => ({ mob: m, dist: Math.sqrt((m.x - playerX) ** 2 + (m.y - playerY) ** 2) }))
        .filter(m => m.dist < 500)
        .sort((a, b) => a.dist - b.dist);

      const count = Math.min(this.bulletCount, sorted.length);
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(sorted[i].mob.y - playerY, sorted[i].mob.x - playerX);
        this.bullets.push({ id: nextProjectileId++, x: playerX, y: playerY, angle, radius: 4, life: 2, damage: this.damage, hit: false });
      }
    }
  }

  checkCollision(mobs) {
    const hits = [];
    for (const b of this.bullets) {
      if (b.hit) continue;
      for (const mob of mobs) {
        if (mob.dead) continue;
        const dx = b.x - mob.x;
        const dy = b.y - mob.y;
        if (dx * dx + dy * dy < (b.radius + mob.size) ** 2) {
          hits.push({ mob, damage: b.damage, x: mob.x, y: mob.y });
          b.hit = true;
          b.life = 0;
          break;
        }
      }
    }
    return hits;
  }

  draw(ctx, camera) {
    for (const b of this.bullets) {
      if (!camera.isVisible(b.x, b.y, 10)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(b.x, b.y);
      ctx.beginPath();
      ctx.arc(sx, sy, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fill();
    }
  }
}

// --- Shockwave Weapon ---
export class ShockwaveWeapon {
  constructor() {
    this.key = 'shockwave';
    this.level = 1;
    this.lastFire = 0;
    this.waves = [];
  }

  get data() { return WEAPONS.shockwave; }
  get damage() { return this.data.damage * (1 + (this.level - 1) * 0.2); }
  get rate() { return this.data.rate / (1 + (this.level - 1) * 0.1); }
  get radius() { return this.data.radius * (1 + (this.level - 1) * 0.2); }

  update(dt, playerX, playerY, mobs, now) {
    // Expand existing waves
    for (const w of this.waves) {
      w.currentRadius += 200 * dt;
      w.alpha -= dt * 2;
    }
    this.waves = this.waves.filter(w => w.alpha > 0);

    if (now - this.lastFire >= this.rate) {
      this.lastFire = now;
      this.waves.push({ x: playerX, y: playerY, currentRadius: 10, maxRadius: this.radius, alpha: 1, hit: new Set() });
    }
  }

  checkCollision(mobs, now) {
    const hits = [];
    for (const w of this.waves) {
      for (const mob of mobs) {
        if (mob.dead || w.hit.has(mob.id)) continue;
        const dx = w.x - mob.x;
        const dy = w.y - mob.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < w.currentRadius + mob.size && dist > w.currentRadius - 30) {
          w.hit.add(mob.id);
          hits.push({ mob, damage: this.damage, x: mob.x, y: mob.y });
        }
      }
    }
    return hits;
  }

  draw(ctx, camera) {
    for (const w of this.waves) {
      if (!camera.isVisible(w.x, w.y, w.currentRadius + 20)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(w.x, w.y);
      ctx.beginPath();
      ctx.arc(sx, sy, w.currentRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 212, 255, ${w.alpha * 0.6})`;
      ctx.lineWidth = 3 + this.level;
      ctx.stroke();
    }
  }
}

// --- Laser Weapon ---
export class LaserWeapon {
  constructor() {
    this.key = 'laser';
    this.level = 1;
    this.lastFire = 0;
    this.beams = [];
  }

  get data() { return WEAPONS.laser; }
  get damage() { return this.data.damage * (1 + (this.level - 1) * 0.2); }
  get rate() { return this.data.rate / (1 + (this.level - 1) * 0.1); }
  get length() { return this.data.length + (this.level - 1) * 30; }

  update(dt, playerX, playerY, mobs, now, playerAngle) {
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);

    if (now - this.lastFire >= this.rate) {
      this.lastFire = now;
      this.beams.push({
        x: playerX, y: playerY,
        angle: playerAngle || 0,
        length: this.length,
        life: 0.3,
        maxLife: 0.3,
        hit: new Set(),
      });
    }
  }

  checkCollision(mobs) {
    const hits = [];
    for (const b of this.beams) {
      const endX = b.x + Math.cos(b.angle) * b.length;
      const endY = b.y + Math.sin(b.angle) * b.length;

      for (const mob of mobs) {
        if (mob.dead || b.hit.has(mob.id)) continue;
        // Point-to-line-segment distance
        const dist = this._pointToSegDist(mob.x, mob.y, b.x, b.y, endX, endY);
        if (dist < mob.size + 5) {
          b.hit.add(mob.id);
          hits.push({ mob, damage: this.damage, x: mob.x, y: mob.y });
        }
      }
    }
    return hits;
  }

  _pointToSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx, projY = ay + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  draw(ctx, camera) {
    for (const b of this.beams) {
      const start = camera.worldToScreen(b.x, b.y);
      const endX = b.x + Math.cos(b.angle) * b.length;
      const endY = b.y + Math.sin(b.angle) * b.length;
      const end = camera.worldToScreen(endX, endY);

      const alpha = b.life / b.maxLife;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = `rgba(231, 76, 60, ${alpha})`;
      ctx.lineWidth = 4 + this.level * 2;
      ctx.stroke();
      // Inner glow
      ctx.strokeStyle = `rgba(255, 200, 200, ${alpha * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

// --- Mines Weapon ---
export class MinesWeapon {
  constructor() {
    this.key = 'mines';
    this.level = 1;
    this.lastDrop = 0;
    this.mines = [];
  }

  get data() { return WEAPONS.mines; }
  get damage() { return this.data.damage * (1 + (this.level - 1) * 0.2); }
  get rate() { return this.data.rate / (1 + (this.level - 1) * 0.1); }

  update(dt, playerX, playerY, mobs, now) {
    for (const m of this.mines) m.life -= dt;
    this.mines = this.mines.filter(m => m.life > 0 && !m.exploded);

    if (now - this.lastDrop >= this.rate) {
      this.lastDrop = now;
      this.mines.push({
        x: playerX, y: playerY,
        radius: 8 + this.level,
        life: this.data.lifetime / 1000,
        damage: this.damage,
        exploded: false,
      });
    }
  }

  checkCollision(mobs) {
    const hits = [];
    for (const m of this.mines) {
      if (m.exploded) continue;
      for (const mob of mobs) {
        if (mob.dead) continue;
        const dx = m.x - mob.x;
        const dy = m.y - mob.y;
        if (dx * dx + dy * dy < (m.radius + mob.size) ** 2) {
          m.exploded = true;
          hits.push({ mob, damage: m.damage, x: mob.x, y: mob.y });
          break;
        }
      }
    }
    return hits;
  }

  draw(ctx, camera) {
    for (const m of this.mines) {
      if (!camera.isVisible(m.x, m.y, m.radius + 5)) continue;
      const { x: sx, y: sy } = camera.worldToScreen(m.x, m.y);
      // Hexagon shape
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i;
        const px = sx + Math.cos(a) * m.radius;
        const py = sy + Math.sin(a) * m.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Blink based on lifetime
      const blink = Math.sin(m.life * 8) > 0 ? 0.9 : 0.4;
      ctx.fillStyle = `rgba(231, 76, 60, ${blink})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// --- Shield Weapon ---
export class ShieldWeapon {
  constructor() {
    this.key = 'shield';
    this.level = 1;
    this.hp = WEAPONS.shield.absorb;
    this.maxHp = WEAPONS.shield.absorb;
    this.rechargeTimer = 0;
    this.broken = false;
  }

  get data() { return WEAPONS.shield; }
  get absorb() { return this.data.absorb + (this.level - 1) * 10; }

  update(dt) {
    if (this.broken) {
      this.rechargeTimer -= dt * 1000;
      if (this.rechargeTimer <= 0) {
        this.broken = false;
        this.maxHp = this.absorb;
        this.hp = this.maxHp;
      }
    }
  }

  takeDamage(amount) {
    if (this.broken) return amount;
    this.hp -= amount;
    if (this.hp <= 0) {
      const overflow = Math.abs(this.hp);
      this.broken = true;
      this.rechargeTimer = this.data.recharge;
      return overflow;
    }
    return 0;
  }

  checkCollision() { return []; }

  draw(ctx, camera, playerX, playerY, playerAngle) {
    if (this.broken) return;
    const { x: sx, y: sy } = camera.worldToScreen(playerX, playerY);
    const shieldAngle = playerAngle + Math.PI; // Behind player
    const arcSize = Math.PI * 0.6;

    ctx.beginPath();
    ctx.arc(sx, sy, 35 + this.level * 3, shieldAngle - arcSize / 2, shieldAngle + arcSize / 2);
    const alpha = this.hp / this.maxHp;
    ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 + alpha * 0.5})`;
    ctx.lineWidth = 4 + this.level;
    ctx.stroke();
  }
}

// --- Weapon class mapping ---
const WEAPON_CLASSES = {
  orbit: OrbitWeapon,
  bullet: BulletWeapon,
  shockwave: ShockwaveWeapon,
  laser: LaserWeapon,
  mines: MinesWeapon,
  shield: ShieldWeapon,
};

// --- Weapon Manager ---
export class WeaponManager {
  constructor() {
    this.weapons = [];
    this.weapons.push(new OrbitWeapon());
    this.weapons.push(new BulletWeapon());
    this.playerAngle = 0;
  }

  getOwnedWeaponKeys() {
    return this.weapons.map(w => w.key);
  }

  getWeaponLevel(key) {
    const w = this.weapons.find(w => w.key === key);
    return w ? w.level : 0;
  }

  addWeapon(key) {
    const Cls = WEAPON_CLASSES[key];
    if (Cls && !this.weapons.find(w => w.key === key)) {
      this.weapons.push(new Cls());
    }
  }

  upgradeWeapon(key) {
    const w = this.weapons.find(w => w.key === key);
    if (w) w.level++;
  }

  update(dt, playerX, playerY, mobs, now, playerAngle) {
    this.playerAngle = playerAngle;
    for (const w of this.weapons) {
      if (w instanceof ShieldWeapon) {
        w.update(dt);
      } else if (w instanceof LaserWeapon) {
        w.update(dt, playerX, playerY, mobs, now, playerAngle);
      } else if (w instanceof OrbitWeapon) {
        w.update(dt, playerX, playerY);
      } else {
        w.update(dt, playerX, playerY, mobs, now);
      }
    }
  }

  checkCollisions(mobs, now) {
    const allHits = [];
    for (const w of this.weapons) {
      if (w instanceof OrbitWeapon) {
        allHits.push(...w.checkCollision(mobs, now));
      } else if (w instanceof ShieldWeapon) {
        // Shield doesn't hit mobs
      } else {
        allHits.push(...w.checkCollision(mobs));
      }
    }
    return allHits;
  }

  draw(ctx, camera, playerX, playerY, playerAngle) {
    for (const w of this.weapons) {
      if (w instanceof ShieldWeapon) {
        w.draw(ctx, camera, playerX, playerY, playerAngle);
      } else {
        w.draw(ctx, camera);
      }
    }
  }
}
