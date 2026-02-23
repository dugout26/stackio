// Server-side Player class
// Holds authoritative state for each connected player (or bot)

import { MAP, PLAYER, LEVELING, WEAPONS, PASSIVES, EVOLUTIONS } from '../shared/constants.js';

let nextPlayerId = 1;

export class ServerPlayer {
  constructor(name, isBot = false) {
    this.id = 'p' + (nextPlayerId++);
    this.name = name;
    this.isBot = isBot;

    // Spawn at random position (away from exact center to avoid safe-zone camping)
    this.x = 200 + Math.random() * (MAP.WIDTH - 400);
    this.y = 200 + Math.random() * (MAP.HEIGHT - 400);

    this.angle = 0;
    this.moving = false;
    this.hp = PLAYER.BASE_HP;
    this.maxHp = PLAYER.BASE_HP;
    this.speed = PLAYER.BASE_SPEED;
    this.radius = PLAYER.RADIUS;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.alive = true;
    this.score = 0; // cumulative XP for leaderboard

    // Weapons: array of { key, level }
    this.weapons = [
      { key: 'orbit', level: 1 },
      { key: 'bullet', level: 1 },
    ];

    // Passives: { speed: 0, magnet: 0, armor: 0, regen: 0, critical: 0, area: 0 }
    this.passives = {};

    // Weapon internal state (timers, projectile lists managed by ServerWeapons)
    this.weaponState = {};

    // Immunity timer (ms remaining)
    this.immunity = MAP.SAFE_ZONE_DURATION;

    // Level-up pending
    this.pendingLevelUp = false;

    // Timestamps
    this.spawnTime = Date.now();
    this.lastRegenTick = Date.now();

    // Color assigned on creation
    this.color = this._randomColor();
  }

  _randomColor() {
    const colors = [
      '#00d4ff', '#2ecc71', '#e74c3c', '#f1c40f', '#9b59b6',
      '#e67e22', '#1abc9c', '#3498db', '#fd79a8', '#6c5ce7',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /** Update position based on input angle */
  update(dt) {
    // Grow radius with level
    this.radius = Math.min(PLAYER.RADIUS + (this.level - 1) * 1.5, 50);

    // Speed passive + level bonus (+2% per level)
    const speedBonus = (this.passives.speed || 0) * PASSIVES.speed.perLevel;
    const levelSpeedBonus = (this.level - 1) * 0.02;
    const currentSpeed = PLAYER.BASE_SPEED * (1 + speedBonus + levelSpeedBonus);

    if (this.moving) {
      this.x += Math.cos(this.angle) * currentSpeed;
      this.y += Math.sin(this.angle) * currentSpeed;

      // Clamp to map bounds
      this.x = Math.max(this.radius, Math.min(MAP.WIDTH - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(MAP.HEIGHT - this.radius, this.y));
    }

    // Decrease immunity
    if (this.immunity > 0) {
      this.immunity -= dt * 1000;
      if (this.immunity < 0) this.immunity = 0;
    }

    // Regen passive: +1 HP/sec per level
    const regenLevel = this.passives.regen || 0;
    if (regenLevel > 0) {
      const now = Date.now();
      if (now - this.lastRegenTick >= 1000) {
        this.lastRegenTick = now;
        this.hp = Math.min(this.maxHp, this.hp + regenLevel * PASSIVES.regen.perLevel);
      }
    }
  }

  /** Apply damage (returns actual damage dealt after armor/shield) */
  takeDamage(amount) {
    if (this.immunity > 0) return 0;

    // Armor passive reduces damage
    const armorLevel = this.passives.armor || 0;
    const reduction = armorLevel * PASSIVES.armor.perLevel;
    const finalDamage = Math.max(1, Math.round(amount * (1 - reduction)));

    this.hp -= finalDamage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return finalDamage;
  }

  /** Add XP and check for level up. Returns number of pending level-ups. */
  addXP(amount) {
    this.xp += amount;
    this.score += amount;
    let levelUps = 0;

    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.maxHp += 10;
      this.hp = this.maxHp;
      levelUps++;
    }

    return levelUps;
  }

  get xpToNextLevel() {
    return LEVELING.xpFormula(this.level);
  }

  /** Get owned weapon keys */
  getWeaponKeys() {
    return this.weapons.map(w => w.key);
  }

  /** Get weapon level */
  getWeaponLevel(key) {
    const w = this.weapons.find(w => w.key === key);
    return w ? w.level : 0;
  }

  /** Check available evolutions (both weapons at max level) */
  getAvailableEvolutions() {
    const evolutions = [];
    const ownedKeys = this.getWeaponKeys();
    const evolvedKeys = this.weapons.filter(w => w.evolved).map(w => w.key);

    for (const [evoKey, evo] of Object.entries(EVOLUTIONS)) {
      // Skip if already evolved
      if (evolvedKeys.includes(evoKey)) continue;

      // Check if player has both recipe weapons at max level
      const [w1, w2] = evo.recipe;
      const weapon1 = this.weapons.find(w => w.key === w1);
      const weapon2 = this.weapons.find(w => w.key === w2);

      if (weapon1 && weapon2 &&
          weapon1.level >= WEAPONS[w1].maxLevel &&
          weapon2.level >= WEAPONS[w2].maxLevel) {
        evolutions.push({
          type: 'evolution',
          key: evoKey,
          name: evo.name,
          description: evo.description,
          recipe: evo.recipe,
        });
      }
    }
    return evolutions;
  }

  /** Generate 3 random level-up options */
  generateLevelUpOptions() {
    const options = [];
    const pool = [];
    const ownedKeys = this.getWeaponKeys();
    const weaponKeys = Object.keys(WEAPONS);
    const passiveKeys = Object.keys(PASSIVES);

    // PRIORITY: Available evolutions always appear first
    const evolutions = this.getAvailableEvolutions();
    if (evolutions.length > 0) {
      // Show evolution as first option (guaranteed)
      options.push(evolutions[0]);
    }

    // New weapons (only base weapons, not evolved)
    for (const key of weaponKeys) {
      if (!ownedKeys.includes(key)) {
        pool.push({
          type: 'new_weapon',
          key,
          name: WEAPONS[key].name,
          description: WEAPONS[key].description,
        });
      }
    }

    // Weapon upgrades (only non-evolved base weapons)
    for (const w of this.weapons) {
      if (w.evolved) continue; // Don't upgrade evolved weapons
      if (WEAPONS[w.key] && w.level < WEAPONS[w.key].maxLevel) {
        pool.push({
          type: 'weapon_upgrade',
          key: w.key,
          name: `${WEAPONS[w.key].name} Lv.${w.level + 1}`,
          description: WEAPONS[w.key].description + ' +20% damage',
          currentLevel: w.level,
        });
      }
    }

    // Passive upgrades
    for (const key of passiveKeys) {
      const lvl = this.passives[key] || 0;
      if (lvl < PASSIVES[key].maxLevel) {
        pool.push({
          type: 'passive',
          key,
          name: PASSIVES[key].name,
          description: PASSIVES[key].description,
          currentLevel: lvl,
        });
      }
    }

    // Shuffle and fill remaining slots
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const remaining = 3 - options.length;
    for (let i = 0; i < Math.min(remaining, shuffled.length); i++) {
      options.push(shuffled[i]);
    }

    // Pad with heal if fewer than 3
    while (options.length < 3) {
      options.push({
        type: 'passive',
        key: 'heal',
        name: 'Full Heal',
        description: 'Restore all HP',
        currentLevel: 0,
      });
    }

    return options;
  }

  /** Apply a chosen level-up option */
  applyLevelUpChoice(option) {
    if (option.type === 'evolution') {
      // Weapon evolution: remove both recipe weapons, add evolved weapon
      const evo = EVOLUTIONS[option.key];
      if (evo) {
        const [w1key, w2key] = evo.recipe;
        this.weapons = this.weapons.filter(w => w.key !== w1key && w.key !== w2key);
        this.weapons.push({ key: option.key, level: 1, evolved: true });
      }
    } else if (option.type === 'new_weapon') {
      if (!this.weapons.find(w => w.key === option.key)) {
        this.weapons.push({ key: option.key, level: 1 });
      }
    } else if (option.type === 'weapon_upgrade') {
      const w = this.weapons.find(w => w.key === option.key);
      if (w && WEAPONS[option.key] && w.level < WEAPONS[option.key].maxLevel) {
        w.level++;
      }
    } else if (option.type === 'passive') {
      if (option.key === 'heal') {
        this.hp = this.maxHp;
      } else {
        this.passives[option.key] = (this.passives[option.key] || 0) + 1;
      }
    }
  }

  /** Reset for respawn */
  respawn() {
    this.x = 200 + Math.random() * (MAP.WIDTH - 400);
    this.y = 200 + Math.random() * (MAP.HEIGHT - 400);
    this.hp = PLAYER.BASE_HP;
    this.maxHp = PLAYER.BASE_HP;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.alive = true;
    this.score = 0;
    this.weapons = [
      { key: 'orbit', level: 1 },
      { key: 'bullet', level: 1 },
    ];
    this.passives = {};
    this.weaponState = {};
    this.immunity = MAP.SAFE_ZONE_DURATION;
    this.spawnTime = Date.now();
    this.pendingLevelUp = false;
    this.radius = PLAYER.RADIUS;
  }

  /** Serialize for network (compressed property names) */
  serialize() {
    return {
      i: this.id,
      n: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      a: Math.round(this.angle * 100) / 100,
      h: Math.round(this.hp),
      mh: this.maxHp,
      l: this.level,
      r: Math.round(this.radius),
      w: this.getWeaponKeys(),
      al: this.alive,
      im: this.immunity > 0,
      c: this.color,
      s: this.score,
      xp: this.xp,
      xn: this.xpToNextLevel,
    };
  }
}
