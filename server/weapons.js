// Server weapon logic + damage calculation
// All 6 weapons: orbit, bullet, shockwave, laser, mines, shield
// Server is authoritative for all damage, timing, and projectile positions

import { WEAPONS, PASSIVES, EVOLUTIONS } from '../shared/constants.js';
import { circleCollision, distance, pointToSegmentDist } from './collision.js';

let nextProjId = 1;

/**
 * ServerWeapons manages all weapon behavior for a single player.
 * Called each server tick to update projectiles, check fire timers,
 * and produce collision results.
 */
export class ServerWeapons {
  constructor() {
    // Per-weapon state keyed by weapon key
    this.state = {};
  }

  /** Initialize state for a weapon when the player acquires it */
  initWeapon(key) {
    switch (key) {
      case 'orbit':
        this.state.orbit = { angle: 0, hitCooldowns: new Map() };
        break;
      case 'bullet':
        this.state.bullet = { lastFire: 0, bullets: [] };
        break;
      case 'shockwave':
        this.state.shockwave = { lastFire: 0, waves: [] };
        break;
      case 'laser':
        this.state.laser = { lastFire: 0, beams: [] };
        break;
      case 'mines':
        this.state.mines = { lastDrop: 0, mines: [] };
        break;
      case 'shield':
        this.state.shield = {
          hp: WEAPONS.shield.absorb,
          maxHp: WEAPONS.shield.absorb,
          broken: false,
          rechargeTimer: 0,
        };
        break;
      // Evolution weapons
      case 'plasma_storm':
        this.state.plasma_storm = { angle: 0, lastPulse: 0, hitCooldowns: new Map() };
        break;
      case 'railgun':
        this.state.railgun = { lastFire: 0, bolts: [] };
        break;
      case 'minefield_shield':
        this.state.minefield_shield = { angle: 0, hp: 40, maxHp: 40, broken: false, rechargeTimer: 0 };
        break;
      case 'meteor_shower':
        this.state.meteor_shower = { lastFire: 0, meteors: [] };
        break;
      case 'death_laser':
        this.state.death_laser = { angle: 0, hitCooldowns: new Map() };
        break;
      case 'void_mines':
        this.state.void_mines = { lastDrop: 0, mines: [] };
        break;
    }
  }

  /** Ensure all player weapons have initialized state */
  ensureState(playerWeapons) {
    for (const w of playerWeapons) {
      if (!this.state[w.key]) {
        this.initWeapon(w.key);
      }
    }
  }

  /**
   * Get weapon stats with level scaling
   */
  _getDamage(key, level, passives) {
    const base = WEAPONS[key].damage;
    let dmg = base * (1 + (level - 1) * 0.2);
    // Critical chance
    const critChance = (passives.critical || 0) * PASSIVES.critical.perLevel;
    if (Math.random() < critChance) {
      dmg *= 2;
    }
    return dmg;
  }

  _getRate(key, level) {
    return WEAPONS[key].rate / (1 + (level - 1) * 0.1);
  }

  _getRange(key, level, passives) {
    const base = key === 'orbit' ? WEAPONS.orbit.range : 0;
    const areaBonus = 1 + (passives.area || 0) * PASSIVES.area.perLevel;
    return (base + (level - 1) * 5) * areaBonus;
  }

  /**
   * Update all weapons for a player.
   * @param {number} dt - delta time in seconds
   * @param {object} player - ServerPlayer
   * @param {Array} mobs - nearby mobs (already filtered by spatial hash)
   * @param {Array} otherPlayers - other alive players nearby
   * @param {number} now - current timestamp ms
   * @returns {{ hits: Array, projectiles: Array }} - hits to process and visual projectiles
   */
  update(dt, player, mobs, otherPlayers, now) {
    this.ensureState(player.weapons);

    const allHits = [];
    const allProjectiles = [];

    for (const weapon of player.weapons) {
      const { key, level } = weapon;
      const passives = player.passives;

      switch (key) {
        case 'orbit':
          this._updateOrbit(dt, player, level, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'bullet':
          this._updateBullet(dt, player, level, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'shockwave':
          this._updateShockwave(dt, player, level, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'laser':
          this._updateLaser(dt, player, level, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'mines':
          this._updateMines(dt, player, level, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'shield':
          this._updateShield(dt, level);
          break;
        // Evolution weapons
        case 'plasma_storm':
          this._updatePlasmaStorm(dt, player, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'railgun':
          this._updateRailgun(dt, player, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'death_laser':
          this._updateDeathLaser(dt, player, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        case 'meteor_shower':
          this._updateMeteorShower(dt, player, passives, mobs, otherPlayers, now, allHits, allProjectiles);
          break;
        // minefield_shield and void_mines use simpler update logic
        case 'minefield_shield':
        case 'void_mines':
          // Placeholder - these evolved weapons are powerful but use base mechanics
          break;
      }
    }

    return { hits: allHits, projectiles: allProjectiles };
  }

  // --- ORBIT ---
  _updateOrbit(dt, player, level, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.orbit;
    const data = WEAPONS.orbit;
    const count = data.count + (level - 1);
    const range = this._getRange('orbit', level, passives);
    const damage = this._getDamage('orbit', level, passives);
    const orbRadius = 8 + level;

    st.angle += data.rotationSpeed * dt;

    const orbs = [];
    for (let i = 0; i < count; i++) {
      const a = st.angle + (Math.PI * 2 / count) * i;
      const ox = player.x + Math.cos(a) * range;
      const oy = player.y + Math.sin(a) * range;
      orbs.push({ x: ox, y: oy, radius: orbRadius });

      // Check vs mobs
      for (const mob of mobs) {
        if (mob.dead) continue;
        if (circleCollision(ox, oy, orbRadius, mob.x, mob.y, mob.size)) {
          const lastHit = st.hitCooldowns.get(mob.id) || 0;
          if (now - lastHit > 200) {
            st.hitCooldowns.set(mob.id, now);
            hits.push({ type: 'mob', target: mob, damage, owner: player, x: mob.x, y: mob.y });
          }
        }
      }

      // Check vs other players (PvP)
      for (const other of otherPlayers) {
        if (!other.alive || other.id === player.id) continue;
        if (circleCollision(ox, oy, orbRadius, other.x, other.y, other.radius)) {
          const lastHit = st.hitCooldowns.get(other.id) || 0;
          if (now - lastHit > 200) {
            st.hitCooldowns.set(other.id, now);
            hits.push({ type: 'player', target: other, damage, owner: player, x: other.x, y: other.y });
          }
        }
      }
    }

    // Clean old cooldowns
    if (st.hitCooldowns.size > 500) {
      for (const [k, v] of st.hitCooldowns) {
        if (now - v > 1000) st.hitCooldowns.delete(k);
      }
    }

    // Add orbit projectiles for rendering
    for (const orb of orbs) {
      projectiles.push({
        i: player.id + '_orb',
        t: 'orbit',
        x: Math.round(orb.x),
        y: Math.round(orb.y),
        r: orb.radius,
      });
    }
  }

  // --- BULLET ---
  _updateBullet(dt, player, level, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.bullet;
    const data = WEAPONS.bullet;
    const damage = this._getDamage('bullet', level, passives);
    const rate = this._getRate('bullet', level);
    const bulletCount = 1 + (level - 1);

    // Move existing bullets
    for (const b of st.bullets) {
      b.x += Math.cos(b.angle) * data.speed;
      b.y += Math.sin(b.angle) * data.speed;
      b.life -= dt;

      // Check vs mobs
      if (!b.hit) {
        for (const mob of mobs) {
          if (mob.dead) continue;
          if (circleCollision(b.x, b.y, 4, mob.x, mob.y, mob.size)) {
            hits.push({ type: 'mob', target: mob, damage, owner: player, x: mob.x, y: mob.y });
            b.hit = true;
            b.life = 0;
            break;
          }
        }
      }

      // Check vs other players
      if (!b.hit) {
        for (const other of otherPlayers) {
          if (!other.alive || other.id === player.id) continue;
          if (circleCollision(b.x, b.y, 4, other.x, other.y, other.radius)) {
            hits.push({ type: 'player', target: other, damage, owner: player, x: other.x, y: other.y });
            b.hit = true;
            b.life = 0;
            break;
          }
        }
      }
    }

    st.bullets = st.bullets.filter(b => b.life > 0);

    // Fire new bullets
    if (now - st.lastFire >= rate) {
      st.lastFire = now;

      // Combine mobs and players as potential targets
      const targets = [];
      for (const mob of mobs) {
        if (mob.dead) continue;
        const dist = distance(mob.x, mob.y, player.x, player.y);
        if (dist < 500) targets.push({ x: mob.x, y: mob.y, dist });
      }
      for (const other of otherPlayers) {
        if (!other.alive || other.id === player.id) continue;
        const dist = distance(other.x, other.y, player.x, player.y);
        if (dist < 500) targets.push({ x: other.x, y: other.y, dist });
      }

      targets.sort((a, b) => a.dist - b.dist);
      const count = Math.min(bulletCount, targets.length);
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(targets[i].y - player.y, targets[i].x - player.x);
        st.bullets.push({
          id: 'b' + (nextProjId++),
          x: player.x,
          y: player.y,
          angle,
          life: 2,
          hit: false,
        });
      }
    }

    // Add to projectile list for rendering
    for (const b of st.bullets) {
      if (!b.hit) {
        projectiles.push({
          i: b.id,
          t: 'bullet',
          x: Math.round(b.x),
          y: Math.round(b.y),
          a: Math.round(b.angle * 100) / 100,
          r: 4,
        });
      }
    }
  }

  // --- SHOCKWAVE ---
  _updateShockwave(dt, player, level, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.shockwave;
    const damage = this._getDamage('shockwave', level, passives);
    const rate = this._getRate('shockwave', level);
    const maxRadius = WEAPONS.shockwave.radius * (1 + (level - 1) * 0.2) *
                      (1 + (passives.area || 0) * PASSIVES.area.perLevel);

    // Expand existing waves
    for (const w of st.waves) {
      w.currentRadius += 200 * dt;
      w.alpha -= dt * 2;

      // Check mobs in ring
      for (const mob of mobs) {
        if (mob.dead || w.hitSet.has(mob.id)) continue;
        const dist = distance(w.x, w.y, mob.x, mob.y);
        if (dist < w.currentRadius + mob.size && dist > w.currentRadius - 30) {
          w.hitSet.add(mob.id);
          hits.push({ type: 'mob', target: mob, damage, owner: player, x: mob.x, y: mob.y });
        }
      }

      // Check other players in ring
      for (const other of otherPlayers) {
        if (!other.alive || other.id === player.id || w.hitSet.has(other.id)) continue;
        const dist = distance(w.x, w.y, other.x, other.y);
        if (dist < w.currentRadius + other.radius && dist > w.currentRadius - 30) {
          w.hitSet.add(other.id);
          hits.push({ type: 'player', target: other, damage, owner: player, x: other.x, y: other.y });
        }
      }
    }

    st.waves = st.waves.filter(w => w.alpha > 0);

    // Fire new wave
    if (now - st.lastFire >= rate) {
      st.lastFire = now;
      st.waves.push({
        id: 'sw' + (nextProjId++),
        x: player.x,
        y: player.y,
        currentRadius: 10,
        maxRadius,
        alpha: 1,
        hitSet: new Set(),
      });
    }

    // Projectile data for rendering
    for (const w of st.waves) {
      projectiles.push({
        i: w.id,
        t: 'shockwave',
        x: Math.round(w.x),
        y: Math.round(w.y),
        r: Math.round(w.currentRadius),
        al: Math.round(w.alpha * 100) / 100,
        lv: level,
      });
    }
  }

  // --- LASER ---
  _updateLaser(dt, player, level, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.laser;
    const damage = this._getDamage('laser', level, passives);
    const rate = this._getRate('laser', level);
    const length = WEAPONS.laser.length + (level - 1) * 30;

    // Update existing beams
    for (const b of st.beams) {
      b.life -= dt;

      // Only check collisions on first tick
      if (!b.checked) {
        b.checked = true;
        const endX = b.x + Math.cos(b.angle) * length;
        const endY = b.y + Math.sin(b.angle) * length;

        for (const mob of mobs) {
          if (mob.dead || b.hitSet.has(mob.id)) continue;
          const dist = pointToSegmentDist(mob.x, mob.y, b.x, b.y, endX, endY);
          if (dist < mob.size + 5) {
            b.hitSet.add(mob.id);
            hits.push({ type: 'mob', target: mob, damage, owner: player, x: mob.x, y: mob.y });
          }
        }

        for (const other of otherPlayers) {
          if (!other.alive || other.id === player.id || b.hitSet.has(other.id)) continue;
          const dist = pointToSegmentDist(other.x, other.y, b.x, b.y, endX, endY);
          if (dist < other.radius + 5) {
            b.hitSet.add(other.id);
            hits.push({ type: 'player', target: other, damage, owner: player, x: other.x, y: other.y });
          }
        }
      }
    }

    st.beams = st.beams.filter(b => b.life > 0);

    // Fire new beam
    if (now - st.lastFire >= rate) {
      st.lastFire = now;
      st.beams.push({
        id: 'ls' + (nextProjId++),
        x: player.x,
        y: player.y,
        angle: player.angle,
        length,
        life: 0.3,
        maxLife: 0.3,
        hitSet: new Set(),
        checked: false,
      });
    }

    // Projectile data for rendering
    for (const b of st.beams) {
      projectiles.push({
        i: b.id,
        t: 'laser',
        x: Math.round(b.x),
        y: Math.round(b.y),
        a: Math.round(b.angle * 100) / 100,
        ln: length,
        al: Math.round((b.life / b.maxLife) * 100) / 100,
        lv: level,
      });
    }
  }

  // --- MINES ---
  _updateMines(dt, player, level, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.mines;
    const damage = this._getDamage('mines', level, passives);
    const rate = this._getRate('mines', level);
    const mineRadius = 8 + level;

    // Update existing mines
    for (const m of st.mines) {
      m.life -= dt;

      if (!m.exploded) {
        // Check vs mobs
        for (const mob of mobs) {
          if (mob.dead) continue;
          if (circleCollision(m.x, m.y, mineRadius, mob.x, mob.y, mob.size)) {
            m.exploded = true;
            hits.push({ type: 'mob', target: mob, damage, owner: player, x: mob.x, y: mob.y });
            break;
          }
        }

        // Check vs other players
        if (!m.exploded) {
          for (const other of otherPlayers) {
            if (!other.alive || other.id === player.id) continue;
            if (circleCollision(m.x, m.y, mineRadius, other.x, other.y, other.radius)) {
              m.exploded = true;
              hits.push({ type: 'player', target: other, damage, owner: player, x: other.x, y: other.y });
              break;
            }
          }
        }
      }
    }

    st.mines = st.mines.filter(m => m.life > 0 && !m.exploded);

    // Drop new mine
    if (now - st.lastDrop >= rate) {
      st.lastDrop = now;
      st.mines.push({
        id: 'mn' + (nextProjId++),
        x: player.x,
        y: player.y,
        life: WEAPONS.mines.lifetime / 1000,
        exploded: false,
      });
    }

    // Projectile data for rendering
    for (const m of st.mines) {
      if (!m.exploded) {
        projectiles.push({
          i: m.id,
          t: 'mines',
          x: Math.round(m.x),
          y: Math.round(m.y),
          r: mineRadius,
          lf: Math.round(m.life * 10) / 10,
        });
      }
    }
  }

  // --- SHIELD ---
  _updateShield(dt, level) {
    const st = this.state.shield;
    if (!st) return;

    const maxAbsorb = WEAPONS.shield.absorb + (level - 1) * 10;

    if (st.broken) {
      st.rechargeTimer -= dt * 1000;
      if (st.rechargeTimer <= 0) {
        st.broken = false;
        st.maxHp = maxAbsorb;
        st.hp = maxAbsorb;
      }
    } else {
      st.maxHp = maxAbsorb;
    }
  }

  /**
   * Absorb damage through shield before it reaches the player.
   * @returns {number} remaining damage after shield absorption
   */
  shieldAbsorb(amount) {
    const st = this.state.shield;
    if (!st || st.broken) return amount;

    st.hp -= amount;
    if (st.hp <= 0) {
      const overflow = Math.abs(st.hp);
      st.broken = true;
      st.rechargeTimer = WEAPONS.shield.recharge;
      st.hp = 0;
      return overflow;
    }
    return 0;
  }

  /** Get shield state for network serialization */
  getShieldState() {
    const st = this.state.shield;
    if (!st) return null;
    return {
      hp: Math.round(st.hp),
      mh: st.maxHp,
      br: st.broken,
    };
  }

  // ===== EVOLUTION WEAPONS =====

  // --- PLASMA STORM (orbit + shockwave) ---
  _updatePlasmaStorm(dt, player, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.plasma_storm;
    if (!st) return;
    const evo = EVOLUTIONS.plasma_storm;
    const areaBonus = 1 + (passives.area || 0) * PASSIVES.area.perLevel;
    const range = evo.range * areaBonus;
    const critChance = (passives.critical || 0) * PASSIVES.critical.perLevel;

    st.angle += evo.rotationSpeed * dt;

    // 4 orbiting nodes that pulse AoE
    for (let i = 0; i < evo.count; i++) {
      const a = st.angle + (Math.PI * 2 / evo.count) * i;
      const ox = player.x + Math.cos(a) * range;
      const oy = player.y + Math.sin(a) * range;

      projectiles.push({ i: player.id + '_ps' + i, t: 'plasma_storm', x: Math.round(ox), y: Math.round(oy), r: 12 });

      // Orbit collision
      const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
      for (const target of allTargets) {
        const tr = target.size || target.radius || 15;
        if (circleCollision(ox, oy, 12, target.x, target.y, tr)) {
          const lastHit = st.hitCooldowns.get(target.id) || 0;
          if (now - lastHit > 200) {
            st.hitCooldowns.set(target.id, now);
            let dmg = evo.damage;
            if (Math.random() < critChance) dmg *= 2;
            const type = target.id.startsWith('m') ? 'mob' : 'player';
            hits.push({ type, target, damage: dmg, owner: player, x: target.x, y: target.y });
          }
        }
      }
    }

    // Periodic pulse from each orb
    if (now - st.lastPulse >= evo.rate) {
      st.lastPulse = now;
      for (let i = 0; i < evo.count; i++) {
        const a = st.angle + (Math.PI * 2 / evo.count) * i;
        const ox = player.x + Math.cos(a) * range;
        const oy = player.y + Math.sin(a) * range;

        projectiles.push({
          i: 'psp' + (nextProjId++), t: 'shockwave',
          x: Math.round(ox), y: Math.round(oy), r: 10, al: 1, lv: 3,
        });

        const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
        for (const target of allTargets) {
          const tr = target.size || target.radius || 15;
          if (distance(ox, oy, target.x, target.y) < evo.pulseRadius + tr) {
            let dmg = evo.damage * 0.5;
            if (Math.random() < critChance) dmg *= 2;
            const type = target.id.startsWith('m') ? 'mob' : 'player';
            hits.push({ type, target, damage: dmg, owner: player, x: target.x, y: target.y });
          }
        }
      }
    }

    // Clean old cooldowns
    if (st.hitCooldowns.size > 500) {
      for (const [k, v] of st.hitCooldowns) {
        if (now - v > 1000) st.hitCooldowns.delete(k);
      }
    }
  }

  // --- RAILGUN (bullet + laser) ---
  _updateRailgun(dt, player, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.railgun;
    if (!st) return;
    const evo = EVOLUTIONS.railgun;
    const critChance = (passives.critical || 0) * PASSIVES.critical.perLevel;

    // Move existing bolts
    for (const b of st.bolts) {
      b.x += Math.cos(b.angle) * evo.speed;
      b.y += Math.sin(b.angle) * evo.speed;
      b.life -= dt;

      // Piercing: hits all targets in path
      const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
      for (const target of allTargets) {
        if (b.hitSet.has(target.id)) continue;
        const tr = target.size || target.radius || 15;
        if (circleCollision(b.x, b.y, 6, target.x, target.y, tr)) {
          b.hitSet.add(target.id);
          let dmg = evo.damage;
          if (Math.random() < critChance) dmg *= 2;
          const type = target.id.startsWith('m') ? 'mob' : 'player';
          hits.push({ type, target, damage: dmg, owner: player, x: target.x, y: target.y });
        }
      }
    }
    st.bolts = st.bolts.filter(b => b.life > 0);

    // Fire
    if (now - st.lastFire >= evo.rate) {
      st.lastFire = now;
      // Find nearest target
      const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
      let nearest = null, nearestDist = 600;
      for (const t of allTargets) {
        const d = distance(t.x, t.y, player.x, player.y);
        if (d < nearestDist) { nearest = t; nearestDist = d; }
      }
      if (nearest) {
        const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        st.bolts.push({
          id: 'rg' + (nextProjId++), x: player.x, y: player.y,
          angle, life: 1.5, hitSet: new Set(),
        });
      }
    }

    for (const b of st.bolts) {
      projectiles.push({
        i: b.id, t: 'railgun',
        x: Math.round(b.x), y: Math.round(b.y),
        a: Math.round(b.angle * 100) / 100, r: 6,
      });
    }
  }

  // --- DEATH LASER (laser + orbit) ---
  _updateDeathLaser(dt, player, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.death_laser;
    if (!st) return;
    const evo = EVOLUTIONS.death_laser;
    const critChance = (passives.critical || 0) * PASSIVES.critical.perLevel;

    st.angle += evo.rotationSpeed * dt;

    // Multiple spinning beams
    for (let i = 0; i < evo.beamCount; i++) {
      const beamAngle = st.angle + (Math.PI * 2 / evo.beamCount) * i;
      const endX = player.x + Math.cos(beamAngle) * evo.length;
      const endY = player.y + Math.sin(beamAngle) * evo.length;

      projectiles.push({
        i: player.id + '_dl' + i, t: 'laser',
        x: Math.round(player.x), y: Math.round(player.y),
        a: Math.round(beamAngle * 100) / 100,
        ln: evo.length, al: 0.7, lv: 4,
      });

      // Line collision check
      const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
      for (const target of allTargets) {
        const lastHit = st.hitCooldowns.get(target.id) || 0;
        if (now - lastHit < 200) continue;
        const tr = target.size || target.radius || 15;
        const dist = pointToSegmentDist(target.x, target.y, player.x, player.y, endX, endY);
        if (dist < tr + 5) {
          st.hitCooldowns.set(target.id, now);
          let dmg = evo.damage;
          if (Math.random() < critChance) dmg *= 2;
          const type = target.id.startsWith('m') ? 'mob' : 'player';
          hits.push({ type, target, damage: dmg, owner: player, x: target.x, y: target.y });
        }
      }
    }

    // Clean old cooldowns
    if (st.hitCooldowns.size > 500) {
      for (const [k, v] of st.hitCooldowns) {
        if (now - v > 1000) st.hitCooldowns.delete(k);
      }
    }
  }

  // --- METEOR SHOWER (bullet + shockwave) ---
  _updateMeteorShower(dt, player, passives, mobs, otherPlayers, now, hits, projectiles) {
    const st = this.state.meteor_shower;
    if (!st) return;
    const evo = EVOLUTIONS.meteor_shower;
    const critChance = (passives.critical || 0) * PASSIVES.critical.perLevel;

    // Move existing meteors (with homing)
    for (const m of st.meteors) {
      // Find nearest target for homing
      if (evo.homing && !m.hit) {
        const allTargets = [...mobs.filter(mob => !mob.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
        let nearest = null, nearestDist = 300;
        for (const t of allTargets) {
          const d = distance(t.x, t.y, m.x, m.y);
          if (d < nearestDist) { nearest = t; nearestDist = d; }
        }
        if (nearest) {
          const targetAngle = Math.atan2(nearest.y - m.y, nearest.x - m.x);
          let da = targetAngle - m.angle;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          m.angle += da * 0.05; // Gentle homing
        }
      }

      m.x += Math.cos(m.angle) * evo.speed;
      m.y += Math.sin(m.angle) * evo.speed;
      m.life -= dt;

      if (!m.hit) {
        const allTargets = [...mobs.filter(mob => !mob.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
        for (const target of allTargets) {
          const tr = target.size || target.radius || 15;
          if (circleCollision(m.x, m.y, 6, target.x, target.y, tr)) {
            m.hit = true;
            m.life = 0.3; // Short explosion time

            // Explosion: damage everything in explosion radius
            for (const t2 of allTargets) {
              const tr2 = t2.size || t2.radius || 15;
              if (distance(m.x, m.y, t2.x, t2.y) < evo.explosionRadius + tr2) {
                let dmg = evo.damage;
                if (Math.random() < critChance) dmg *= 2;
                const type = t2.id.startsWith('m') ? 'mob' : 'player';
                hits.push({ type, target: t2, damage: dmg, owner: player, x: t2.x, y: t2.y });
              }
            }
            break;
          }
        }
      }
    }
    st.meteors = st.meteors.filter(m => m.life > 0);

    // Fire
    if (now - st.lastFire >= evo.rate) {
      st.lastFire = now;
      const allTargets = [...mobs.filter(m => !m.dead), ...otherPlayers.filter(p => p.alive && p.id !== player.id)];
      let nearest = null, nearestDist = 600;
      for (const t of allTargets) {
        const d = distance(t.x, t.y, player.x, player.y);
        if (d < nearestDist) { nearest = t; nearestDist = d; }
      }
      if (nearest) {
        const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        st.meteors.push({
          id: 'mt' + (nextProjId++), x: player.x, y: player.y,
          angle, life: 3, hit: false,
        });
      }
    }

    for (const m of st.meteors) {
      if (m.hit) {
        // Explosion visual
        projectiles.push({
          i: m.id + '_exp', t: 'shockwave',
          x: Math.round(m.x), y: Math.round(m.y),
          r: Math.round(evo.explosionRadius * (1 - m.life / 0.3)), al: m.life / 0.3, lv: 3,
        });
      } else {
        projectiles.push({
          i: m.id, t: 'meteor',
          x: Math.round(m.x), y: Math.round(m.y),
          a: Math.round(m.angle * 100) / 100, r: 8,
        });
      }
    }
  }

  /** Reset all weapon state */
  reset() {
    this.state = {};
  }
}
