// Server mob spawning + AI behavior
// All mob logic is authoritative on the server

import { MAP, MOBS } from '../shared/constants.js';

let nextMobId = 1;

export class ServerMob {
  constructor(type, x, y) {
    this.id = 'm' + (nextMobId++);
    this.type = type;
    const data = MOBS.TYPES[type];
    this.x = x;
    this.y = y;
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.xp = data.xp;
    this.size = data.size;
    this.speed = data.speed;
    this.sides = data.sides;
    this.angle = Math.random() * Math.PI * 2;
    this.dead = false;
    this.wanderTimer = 0;
    this.wanderAngle = this.angle;
  }

  /**
   * Update mob AI: chase nearest player if within 300 units, otherwise wander
   * @param {number} dt - delta time in seconds
   * @param {Array} players - array of alive players for targeting
   */
  update(dt, players) {
    if (this.dead) return;

    // Find nearest alive player within chase range
    let nearestDist = Infinity;
    let nearestPlayer = null;

    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 300 && dist < nearestDist) {
        nearestDist = dist;
        nearestPlayer = p;
      }
    }

    if (nearestPlayer && nearestDist > 0) {
      // Chase player
      const dx = nearestPlayer.x - this.x;
      const dy = nearestPlayer.y - this.y;
      this.angle = Math.atan2(dy, dx);
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
    } else {
      // Wander
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 3;
        this.wanderAngle = Math.random() * Math.PI * 2;
      }
      this.angle += (this.wanderAngle - this.angle) * 0.05;
      this.x += Math.cos(this.angle) * this.speed * 0.3;
      this.y += Math.sin(this.angle) * this.speed * 0.3;
    }

    // Clamp to map bounds
    this.x = Math.max(this.size, Math.min(MAP.WIDTH - this.size, this.x));
    this.y = Math.max(this.size, Math.min(MAP.HEIGHT - this.size, this.y));
  }

  /**
   * Apply damage to mob
   * @returns {boolean} true if mob died
   */
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  /** Serialize for network */
  serialize() {
    return {
      i: this.id,
      t: this.type,
      x: Math.round(this.x),
      y: Math.round(this.y),
      h: Math.round(this.hp),
      mh: this.maxHp,
      s: this.size,
      a: Math.round(this.angle * 100) / 100,
    };
  }
}

export class ServerMobManager {
  constructor() {
    this.mobs = [];
    this.spawnTimer = 0;
  }

  /** Populate the map with initial mobs */
  init() {
    const typeKeys = Object.keys(MOBS.TYPES);
    for (let i = 0; i < MOBS.MAX_MOBS; i++) {
      const type = this._weightedRandomType(typeKeys);
      const x = Math.random() * MAP.WIDTH;
      const y = Math.random() * MAP.HEIGHT;
      this.mobs.push(new ServerMob(type, x, y));
    }
  }

  /** Weighted random: triangles more common, pentagons rare */
  _weightedRandomType(keys) {
    const r = Math.random();
    if (r < 0.5) return 'triangle';
    if (r < 0.85) return 'square';
    return 'pentagon';
  }

  /**
   * Update all mobs and handle respawning
   * @param {number} dt - delta time in seconds
   * @param {Array} players - array of alive players
   */
  update(dt, players) {
    // Update living mobs
    for (const mob of this.mobs) {
      if (!mob.dead) {
        mob.update(dt, players);
      }
    }

    // Remove dead mobs
    this.mobs = this.mobs.filter(m => !m.dead);

    // Respawn mobs
    this.spawnTimer += dt;
    const spawnInterval = 1 / MOBS.RESPAWN_RATE;
    while (this.spawnTimer >= spawnInterval && this.mobs.length < MOBS.MAX_MOBS) {
      this.spawnTimer -= spawnInterval;
      this._spawnOne(players);
    }
  }

  /** Spawn a single mob away from all players */
  _spawnOne(players) {
    const type = this._weightedRandomType();

    let x, y, attempts = 0;
    do {
      x = Math.random() * MAP.WIDTH;
      y = Math.random() * MAP.HEIGHT;
      attempts++;

      // Check distance from all players
      let tooClose = false;
      for (const p of players) {
        if (!p.alive) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < 400 * 400) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) break;
    } while (attempts < 10);

    this.mobs.push(new ServerMob(type, x, y));
  }

  /** Get mob by id */
  getById(id) {
    return this.mobs.find(m => m.id === id);
  }

  /** Serialize all living mobs */
  serializeAll() {
    return this.mobs.filter(m => !m.dead).map(m => m.serialize());
  }
}
