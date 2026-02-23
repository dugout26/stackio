// Server-side game simulation (authoritative)
// Runs at 60 ticks/sec, sends state at 20 ticks/sec
// Manages players, bots, mobs, weapons, projectiles, XP orbs

import { MAP, PLAYER, MOBS, WEAPONS, PASSIVES, NETWORK } from '../shared/constants.js';
import { ServerPlayer } from './player.js';
import { ServerMobManager } from './mobs.js';
import { ServerWeapons } from './weapons.js';
import { SpatialHash, circleCollision, distance, isInSafeZone } from './collision.js';

const BOT_NAMES = [
  'Bot_Alex', 'Bot_Sam', 'Bot_Nova', 'Bot_Luna', 'Bot_Kai',
  'Bot_Zara', 'Bot_Rex', 'Bot_Ivy', 'Bot_Leo', 'Bot_Sky',
  'Bot_Ash', 'Bot_Finn', 'Bot_Mia', 'Bot_Jax', 'Bot_Rio',
  'Bot_Eve', 'Bot_Cole', 'Bot_Nyx', 'Bot_Ace', 'Bot_Zen',
];

const MIN_PLAYERS = 10; // Fill with bots if fewer real players

// Bot AI behavior weights by personality
const BOT_PERSONALITIES = ['aggressive', 'farmer', 'balanced'];

/**
 * Smart bot AI - picks best level-up option based on current state
 * Prioritizes: evolution > new weapon (if <3) > weapon upgrade > passive
 */
function botPickLevelUp(bot, options) {
  // Priority 1: Always pick evolution
  const evo = options.findIndex(o => o.type === 'evolution');
  if (evo >= 0) return evo;

  // Priority 2: New weapon if we have fewer than 3
  const weaponCount = bot.weapons.length;
  if (weaponCount < 3) {
    const newWeapon = options.findIndex(o => o.type === 'new_weapon');
    if (newWeapon >= 0) return newWeapon;
  }

  // Priority 3: Upgrade existing weapon (prefer highest level for evolution path)
  const upgrade = options.findIndex(o => o.type === 'weapon_upgrade');
  if (upgrade >= 0) return upgrade;

  // Priority 4: Passive upgrades (prefer speed & magnet early, crit later)
  const passive = options.findIndex(o => o.type === 'passive');
  if (passive >= 0) return passive;

  return Math.floor(Math.random() * options.length);
}

let nextOrbId = 1;

export class ServerGame {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId || null; // For room-scoped broadcasts
    this.players = new Map(); // id -> ServerPlayer
    this.socketToPlayer = new Map(); // socketId -> playerId
    this.playerToSocket = new Map(); // playerId -> socketId
    this.playerWeapons = new Map(); // playerId -> ServerWeapons instance

    this.mobManager = new ServerMobManager();
    this.mobManager.init();

    this.orbs = []; // XP orbs on the ground
    this.projectiles = []; // Visual projectile data for clients

    // Spatial hash for collision optimization
    this.spatialHash = new SpatialHash(MAP.GRID_SIZE, MAP.WIDTH, MAP.HEIGHT);

    // Leaderboard
    this.leaderboard = [];
    this.lastLeaderboardSend = 0;

    // Kill feed
    this.killFeed = [];

    // Callback for persistent leaderboard updates on death
    this.onPlayerDeath = null;

    // Level-up state: playerId -> { options: [...], pending: number }
    this.levelUpState = new Map();

    // Timing
    this.tickCount = 0;
    this.lastTickTime = Date.now();
    this.tickInterval = null;
    this.sendInterval = null;

    // Bot management
    this.bots = new Map(); // id -> ServerPlayer
    this.botTimers = new Map(); // botId -> { dirChangeTimer, levelUpTimer }
  }

  /** Start the game loops */
  start() {
    console.log(`[${new Date().toISOString()}] Game simulation started`);

    // Main game loop at 60 ticks/sec
    this.tickInterval = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Game tick error:`, err);
      }
    }, 1000 / NETWORK.SERVER_TICK_RATE);

    // Send state at 20 ticks/sec
    this.sendInterval = setInterval(() => {
      try {
        this.sendState();
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Send state error:`, err);
      }
    }, 1000 / NETWORK.CLIENT_SEND_RATE);

    // Fill with bots initially
    this._manageBots();
  }

  /** Stop the game loops */
  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.sendInterval) clearInterval(this.sendInterval);
  }

  // ========== PLAYER MANAGEMENT ==========

  /** Add a real player */
  addPlayer(socketId, name) {
    const player = new ServerPlayer(name, false);
    this.players.set(player.id, player);
    this.socketToPlayer.set(socketId, player.id);
    this.playerToSocket.set(player.id, socketId);

    // Init weapons
    const weapons = new ServerWeapons();
    weapons.ensureState(player.weapons);
    this.playerWeapons.set(player.id, weapons);

    // Remove bots to make room
    this._manageBots();

    console.log(`[${new Date().toISOString()}] Player joined: ${name} (${player.id})`);
    return player;
  }

  /** Remove a real player */
  removePlayer(socketId) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;

    const player = this.players.get(playerId);
    if (player) {
      // Drop XP orbs on disconnect
      if (player.alive && player.score > 0) {
        this._dropXPOrbs(player);
      }
      console.log(`[${new Date().toISOString()}] Player left: ${player.name} (${player.id})`);
    }

    this.players.delete(playerId);
    this.socketToPlayer.delete(socketId);
    this.playerToSocket.delete(playerId);
    this.playerWeapons.delete(playerId);
    this.levelUpState.delete(playerId);

    // Add bots to fill
    this._manageBots();
  }

  /** Handle player input */
  handleInput(socketId, data) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || !player.alive) return;

    if (typeof data.angle === 'number' && isFinite(data.angle)) {
      player.angle = data.angle;
      player.moving = true;
    }
    if (data.moving === false) {
      player.moving = false;
    }
  }

  /** Handle level up choice */
  handleLevelUp(socketId, data) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || !player.alive) return;

    const state = this.levelUpState.get(playerId);
    if (!state || state.pending <= 0) return;

    const choiceIndex = data.choice;
    if (typeof choiceIndex !== 'number' || choiceIndex < 0 || choiceIndex >= state.options.length) return;

    const option = state.options[choiceIndex];
    player.applyLevelUpChoice(option);

    // Re-init weapon state if new weapon was added
    const weapons = this.playerWeapons.get(playerId);
    if (weapons) {
      weapons.ensureState(player.weapons);
    }

    state.pending--;

    if (state.pending > 0) {
      // Generate new options for next level
      state.options = player.generateLevelUpOptions();
      const socketId = this.playerToSocket.get(playerId);
      if (socketId) {
        this.io.to(socketId).emit('levelUp', { options: state.options });
      }
    } else {
      this.levelUpState.delete(playerId);
      player.pendingLevelUp = false;
    }
  }

  /** Handle respawn */
  handleRespawn(socketId) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    player.respawn();
    const weapons = this.playerWeapons.get(playerId);
    if (weapons) {
      weapons.reset();
      weapons.ensureState(player.weapons);
    }
    this.levelUpState.delete(playerId);
  }

  /** Link a playing socket to a user account (guest → registered) */
  linkPlayerToAccount(socketId, userId) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (player) {
      player.userId = userId;
    }
  }

  // ========== BOT MANAGEMENT ==========

  _manageBots() {
    const realCount = this._getRealPlayerCount();
    const totalNeeded = MIN_PLAYERS;
    const botsNeeded = Math.max(0, totalNeeded - realCount);
    const currentBots = this.bots.size;

    if (currentBots < botsNeeded) {
      // Add bots
      for (let i = 0; i < botsNeeded - currentBots; i++) {
        this._addBot();
      }
    } else if (currentBots > botsNeeded) {
      // Remove excess bots
      let toRemove = currentBots - botsNeeded;
      for (const [botId] of this.bots) {
        if (toRemove <= 0) break;
        this._removeBot(botId);
        toRemove--;
      }
    }
  }

  _addBot() {
    const usedNames = new Set();
    for (const [, p] of this.players) {
      usedNames.add(p.name);
    }
    const available = BOT_NAMES.filter(n => !usedNames.has(n));
    const name = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : 'Bot_' + Math.floor(Math.random() * 9999);

    const bot = new ServerPlayer(name, true);
    this.players.set(bot.id, bot);
    this.bots.set(bot.id, bot);

    const weapons = new ServerWeapons();
    weapons.ensureState(bot.weapons);
    this.playerWeapons.set(bot.id, weapons);

    this.botTimers.set(bot.id, {
      dirChangeTimer: 0.5 + Math.random() * 1,
      levelUpTimer: 0,
      personality: BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)],
      targetId: null,         // Current target entity id
      state: 'roam',          // roam | farm | hunt | flee | collect
      stateTimer: 0,
    });
  }

  _removeBot(botId) {
    this.players.delete(botId);
    this.bots.delete(botId);
    this.playerWeapons.delete(botId);
    this.botTimers.delete(botId);
    this.levelUpState.delete(botId);
  }

  _getRealPlayerCount() {
    let count = 0;
    for (const [, p] of this.players) {
      if (!p.isBot) count++;
    }
    return count;
  }

  _updateBots(dt) {
    for (const [botId, bot] of this.bots) {
      if (!bot.alive) {
        // Respawn bot after 3 seconds
        const timer = this.botTimers.get(botId);
        if (timer) {
          timer.levelUpTimer += dt;
          if (timer.levelUpTimer > 3) {
            bot.respawn();
            const weapons = this.playerWeapons.get(botId);
            if (weapons) {
              weapons.reset();
              weapons.ensureState(bot.weapons);
            }
            this.levelUpState.delete(botId);
            timer.levelUpTimer = 0;
            timer.state = 'roam';
            timer.targetId = null;
          }
        }
        continue;
      }

      const timer = this.botTimers.get(botId);
      if (!timer) continue;

      // --- Smart level up ---
      const lvState = this.levelUpState.get(botId);
      if (lvState && lvState.pending > 0) {
        const choice = botPickLevelUp(bot, lvState.options);
        const option = lvState.options[choice];
        bot.applyLevelUpChoice(option);

        const weapons = this.playerWeapons.get(botId);
        if (weapons) {
          weapons.ensureState(bot.weapons);
        }

        lvState.pending--;
        if (lvState.pending > 0) {
          lvState.options = bot.generateLevelUpOptions();
        } else {
          this.levelUpState.delete(botId);
          bot.pendingLevelUp = false;
        }
        continue; // Skip movement while leveling
      }

      // --- AI State Machine ---
      timer.stateTimer -= dt;
      timer.dirChangeTimer -= dt;

      const hpRatio = bot.hp / bot.maxHp;
      const personality = timer.personality || 'balanced';

      // Gather nearby info
      const nearbyMobs = this.spatialHash.query(bot.x, bot.y, 400)
        .filter(e => e.id && e.id.startsWith('m') && !e.dead);
      const nearbyPlayers = [];
      for (const [, p] of this.players) {
        if (p.id !== botId && p.alive) {
          const dx = p.x - bot.x;
          const dy = p.y - bot.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 500) nearbyPlayers.push({ player: p, dist });
        }
      }

      // Find nearest XP orb
      let nearestOrb = null;
      let nearestOrbDist = Infinity;
      for (const orb of this.orbs) {
        const dx = orb.x - bot.x;
        const dy = orb.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist < nearestOrbDist) {
          nearestOrb = orb;
          nearestOrbDist = dist;
        }
      }

      // State transitions
      if (timer.stateTimer <= 0) {
        // Re-evaluate state
        if (hpRatio < 0.25) {
          // Low HP → flee to safe zone
          timer.state = 'flee';
          timer.stateTimer = 2 + Math.random();
        } else if (nearestOrb && nearestOrbDist < 150) {
          // Nearby orbs → collect them
          timer.state = 'collect';
          timer.stateTimer = 1;
        } else if (personality === 'aggressive' && nearbyPlayers.length > 0) {
          // Aggressive bots hunt weak players
          const weakTarget = nearbyPlayers
            .filter(np => np.player.hp / np.player.maxHp < 0.5 && np.dist < 350)
            .sort((a, b) => a.dist - b.dist)[0];
          if (weakTarget) {
            timer.state = 'hunt';
            timer.targetId = weakTarget.player.id;
            timer.stateTimer = 3 + Math.random() * 2;
          } else {
            timer.state = 'farm';
            timer.stateTimer = 2 + Math.random() * 2;
          }
        } else if (nearbyMobs.length > 0) {
          // Farm mobs
          timer.state = 'farm';
          timer.stateTimer = 2 + Math.random() * 2;
        } else {
          // Roam to find mobs
          timer.state = 'roam';
          timer.stateTimer = 1.5 + Math.random() * 2;
        }
      }

      // Execute state behavior
      bot.moving = true;

      switch (timer.state) {
        case 'flee': {
          // Flee AWAY from nearest threat (not always to center)
          const nearestThreat = nearbyPlayers
            .filter(np => np.dist < 300)
            .sort((a, b) => a.dist - b.dist)[0];
          if (nearestThreat) {
            // Run away from attacker
            bot.angle = Math.atan2(bot.y - nearestThreat.player.y, bot.x - nearestThreat.player.x);
          } else {
            // No visible threat — pick a random safe direction
            bot.angle = Math.random() * Math.PI * 2;
          }
          bot.angle += (Math.random() - 0.5) * 0.4;
          break;
        }

        case 'collect': {
          // Move toward nearest XP orb
          if (nearestOrb) {
            bot.angle = Math.atan2(nearestOrb.y - bot.y, nearestOrb.x - bot.x);
          } else {
            timer.state = 'roam';
          }
          break;
        }

        case 'hunt': {
          // Chase target player
          const target = this.players.get(timer.targetId);
          if (target && target.alive) {
            const dx = target.x - bot.x;
            const dy = target.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            bot.angle = Math.atan2(dy, dx);
            // Predict target movement slightly
            if (target.moving) {
              bot.angle += (Math.random() - 0.5) * 0.2;
            }
            // Give up if too far
            if (dist > 600) {
              timer.state = 'roam';
              timer.targetId = null;
            }
          } else {
            timer.state = 'roam';
            timer.targetId = null;
          }
          break;
        }

        case 'farm': {
          // Move toward nearest mob
          if (nearbyMobs.length > 0) {
            // Pick closest mob
            let closest = nearbyMobs[0];
            let closestDist = Infinity;
            for (const mob of nearbyMobs) {
              const dx = mob.x - bot.x;
              const dy = mob.y - bot.y;
              const d = dx * dx + dy * dy;
              if (d < closestDist) {
                closestDist = d;
                closest = mob;
              }
            }
            const dx = closest.x - bot.x;
            const dy = closest.y - bot.y;
            bot.angle = Math.atan2(dy, dx);
            // Circle around mob slightly instead of running straight at it
            const dist = Math.sqrt(closestDist);
            if (dist < 60) {
              bot.angle += Math.PI / 4; // Orbit around it
            }
          } else {
            timer.state = 'roam';
          }
          break;
        }

        case 'roam':
        default: {
          // Wander around the map — spread out, don't cluster at center
          if (timer.dirChangeTimer <= 0) {
            timer.dirChangeTimer = 1 + Math.random() * 2;

            // Only steer away from map edges, otherwise roam freely
            const edgeDist = 200;
            const centerX = MAP.WIDTH / 2;
            const centerY = MAP.HEIGHT / 2;
            const distToCenter = Math.sqrt((bot.x - centerX) ** 2 + (bot.y - centerY) ** 2);

            if (bot.x < edgeDist || bot.x > MAP.WIDTH - edgeDist ||
                bot.y < edgeDist || bot.y > MAP.HEIGHT - edgeDist) {
              // Near edge — steer inward
              bot.angle = Math.atan2(centerY - bot.y, centerX - bot.x);
              bot.angle += (Math.random() - 0.5) * 1.5; // Wide spread
            } else if (distToCenter < 400) {
              // Too close to center — spread outward
              bot.angle = Math.atan2(bot.y - centerY, bot.x - centerX);
              bot.angle += (Math.random() - 0.5) * 2.0; // Wide scatter
            } else {
              // Normal roam — random direction
              bot.angle = Math.random() * Math.PI * 2;
            }

            // Occasionally pause
            bot.moving = Math.random() > 0.15;
          }
          break;
        }
      }

      // Keep within map bounds
      const margin = 50;
      if (bot.x < margin) bot.angle = 0;
      else if (bot.x > MAP.WIDTH - margin) bot.angle = Math.PI;
      if (bot.y < margin) bot.angle = Math.PI / 2;
      else if (bot.y > MAP.HEIGHT - margin) bot.angle = -Math.PI / 2;
    }
  }

  // ========== GAME TICK ==========

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.05);
    this.lastTickTime = now;
    this.tickCount++;

    // Update bots
    this._updateBots(dt);

    // Update all players (movement)
    for (const [, player] of this.players) {
      if (player.alive) {
        player.update(dt);
      }
    }

    // Get list of alive players for mob AI
    const alivePlayers = [];
    for (const [, player] of this.players) {
      if (player.alive) alivePlayers.push(player);
    }

    // Update mobs
    this.mobManager.update(dt, alivePlayers);

    // Build spatial hash
    this.spatialHash.clear();
    for (const mob of this.mobManager.mobs) {
      if (!mob.dead) this.spatialHash.insert(mob);
    }
    for (const player of alivePlayers) {
      this.spatialHash.insert(player);
    }

    // Collect all projectile visuals this tick
    this.projectiles = [];

    // Process weapons for each alive player
    for (const player of alivePlayers) {
      if (player.pendingLevelUp) continue; // Paused for level-up

      const weapons = this.playerWeapons.get(player.id);
      if (!weapons) continue;

      // Get nearby entities from spatial hash
      const nearbyMobs = this.spatialHash.query(player.x, player.y, 600)
        .filter(e => e.id && e.id.startsWith('m') && !e.dead);
      const nearbyPlayers = this.spatialHash.query(player.x, player.y, 600)
        .filter(e => e.id && e.id.startsWith('p') && e.alive && e.id !== player.id);

      const { hits, projectiles } = weapons.update(dt, player, nearbyMobs, nearbyPlayers, now);

      // Collect projectiles
      for (const p of projectiles) {
        this.projectiles.push(p);
      }

      // Process hits
      for (const hit of hits) {
        if (hit.type === 'mob') {
          const killed = hit.target.takeDamage(hit.damage);
          if (killed) {
            player.kills++;
            // Spawn XP orbs from mob
            this._spawnMobOrbs(hit.target);
          }
        } else if (hit.type === 'player') {
          // PvP: check safe zone
          const attackerInSafe = isInSafeZone(player.x, player.y, MAP.WIDTH, MAP.HEIGHT, MAP.SAFE_ZONE_RADIUS);
          const targetInSafe = isInSafeZone(hit.target.x, hit.target.y, MAP.WIDTH, MAP.HEIGHT, MAP.SAFE_ZONE_RADIUS);

          if (!attackerInSafe && !targetInSafe) {
            // Apply shield first (base shield or fortress evolution)
            let damage = hit.damage;
            const targetWeapons = this.playerWeapons.get(hit.target.id);
            if (targetWeapons) {
              if (hit.target.weapons.find(w => w.key === 'minefield_shield')) {
                damage = targetWeapons.fortressShieldAbsorb(damage);
              } else if (hit.target.weapons.find(w => w.key === 'shield')) {
                damage = targetWeapons.shieldAbsorb(damage);
              }
            }
            if (damage > 0) {
              hit.target.takeDamage(damage);
            }

            // Check if target died
            if (!hit.target.alive) {
              this._onPlayerKill(player, hit.target);
            }
          }
        }
      }
    }

    // Mob-player contact damage
    this._processMobContactDamage(now, alivePlayers);

    // XP orb pickup
    this._processOrbPickup(dt, alivePlayers);

    // Update leaderboard periodically
    if (now - this.lastLeaderboardSend >= 1000) {
      this.lastLeaderboardSend = now;
      this._updateLeaderboard();
    }
  }

  // ========== MOB CONTACT DAMAGE ==========

  _processMobContactDamage(now, players) {
    for (const player of players) {
      if (!player.alive || player.immunity > 0) continue;

      const nearbyMobs = this.spatialHash.query(player.x, player.y, player.radius + 50)
        .filter(e => e.id && e.id.startsWith('m') && !e.dead);

      for (const mob of nearbyMobs) {
        if (circleCollision(player.x, player.y, player.radius, mob.x, mob.y, mob.size)) {
          // Push mob away
          const dx = player.x - mob.x;
          const dy = player.y - mob.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            mob.x -= (dx / dist) * 2;
            mob.y -= (dy / dist) * 2;
          }

          // Contact damage every 500ms
          if (!mob._lastPlayerHit) mob._lastPlayerHit = {};
          const lastHit = mob._lastPlayerHit[player.id] || 0;
          if (now - lastHit > 500) {
            mob._lastPlayerHit[player.id] = now;

            let damage = 5;
            // Shield absorb (fortress evolution or base shield)
            const weapons = this.playerWeapons.get(player.id);
            if (weapons) {
              if (player.weapons.find(w => w.key === 'minefield_shield')) {
                damage = weapons.fortressShieldAbsorb(damage);
              } else if (player.weapons.find(w => w.key === 'shield')) {
                damage = weapons.shieldAbsorb(damage);
              }
            }
            if (damage > 0) {
              player.takeDamage(damage);
            }

            if (!player.alive) {
              this._onPlayerKilledByMob(player);
              break;
            }
          }
        }
      }
    }
  }

  // ========== XP ORBS ==========

  _spawnMobOrbs(mob) {
    const spread = 20;
    this.orbs.push({
      id: 'o' + (nextOrbId++),
      x: mob.x + (Math.random() - 0.5) * spread,
      y: mob.y + (Math.random() - 0.5) * spread,
      amount: mob.xp,
      radius: Math.min(4 + mob.xp / 10, 10),
      life: 30,
    });
  }

  _dropXPOrbs(player) {
    const totalXP = Math.floor(player.score * PLAYER.XP_DROP_ON_DEATH);
    if (totalXP <= 0) return;

    // Split into multiple orbs
    const orbCount = Math.min(10, Math.max(1, Math.floor(totalXP / 20)));
    const xpPerOrb = Math.floor(totalXP / orbCount);

    for (let i = 0; i < orbCount; i++) {
      const angle = (Math.PI * 2 / orbCount) * i;
      const dist = 20 + Math.random() * 30;
      this.orbs.push({
        id: 'o' + (nextOrbId++),
        x: player.x + Math.cos(angle) * dist,
        y: player.y + Math.sin(angle) * dist,
        amount: xpPerOrb,
        radius: Math.min(4 + xpPerOrb / 10, 12),
        life: 30,
      });
    }
  }

  _processOrbPickup(dt, players) {
    for (const orb of this.orbs) {
      orb.life -= dt;
      if (orb.life <= 0) {
        orb.collected = true;
        continue;
      }

      for (const player of players) {
        if (!player.alive) continue;

        const magnetLevel = player.passives.magnet || 0;
        const pickupRadius = PLAYER.PICKUP_RADIUS * (1 + magnetLevel * 0.2);
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Magnet pull
        if (dist < pickupRadius && dist > 0) {
          const pullSpeed = 6 + magnetLevel * 2;
          const speed = pullSpeed * (1 - dist / pickupRadius + 0.3);
          orb.x += (dx / dist) * speed * dt * 60; // Normalize for dt
          orb.y += (dy / dist) * speed * dt * 60;
        }

        // Collect on contact
        if (dist < player.radius + orb.radius) {
          orb.collected = true;
          const levelUps = player.addXP(orb.amount);

          if (levelUps > 0) {
            this._triggerLevelUp(player, levelUps);
          }
          break; // Only one player can collect each orb
        }
      }
    }

    this.orbs = this.orbs.filter(o => !o.collected);
  }

  // ========== LEVEL UP ==========

  _triggerLevelUp(player, count) {
    let state = this.levelUpState.get(player.id);
    if (state) {
      state.pending += count;
    } else {
      state = {
        options: player.generateLevelUpOptions(),
        pending: count,
      };
      this.levelUpState.set(player.id, state);
    }

    player.pendingLevelUp = true;

    // Send level-up options to client (only for real players)
    if (!player.isBot) {
      const socketId = this.playerToSocket.get(player.id);
      if (socketId) {
        this.io.to(socketId).emit('levelUp', { options: state.options });
      }
    }
  }

  // ========== DEATH & KILLS ==========

  _onPlayerKill(killer, victim) {
    killer.kills++;

    // Drop XP orbs
    this._dropXPOrbs(victim);

    // Kill feed
    const feedEntry = { killer: killer.name, victim: victim.name };
    this.killFeed.push(feedEntry);
    this.io.emit('killFeed', feedEntry);

    // Record to persistent leaderboard
    if (this.onPlayerDeath) {
      this.onPlayerDeath(victim.name, victim.score, victim.level, victim.userId || null);
    }

    // Send death to victim
    if (!victim.isBot) {
      const socketId = this.playerToSocket.get(victim.id);
      if (socketId) {
        const elapsed = Date.now() - victim.spawnTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        this.io.to(socketId).emit('death', {
          killerName: killer.name,
          stats: {
            time: `${mins}m ${secs}s`,
            kills: victim.kills,
            level: victim.level,
            xp: victim.score,
          },
        });
      }
    }
  }

  _onPlayerKilledByMob(player) {
    // Drop XP orbs
    this._dropXPOrbs(player);

    // Record to persistent leaderboard
    if (this.onPlayerDeath) {
      this.onPlayerDeath(player.name, player.score, player.level, player.userId || null);
    }

    // Kill feed
    const feedEntry = { killer: 'a mob', victim: player.name };
    this.killFeed.push(feedEntry);
    this.io.emit('killFeed', feedEntry);

    // Send death
    if (!player.isBot) {
      const socketId = this.playerToSocket.get(player.id);
      if (socketId) {
        const elapsed = Date.now() - player.spawnTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        this.io.to(socketId).emit('death', {
          killerName: null,
          stats: {
            time: `${mins}m ${secs}s`,
            kills: player.kills,
            level: player.level,
            xp: player.score,
          },
        });
      }
    }
  }

  // ========== LEADERBOARD ==========

  _updateLeaderboard() {
    const entries = [];
    for (const [, player] of this.players) {
      if (player.alive) {
        entries.push({
          name: player.name,
          score: player.score,
          level: player.level,
        });
      }
    }
    entries.sort((a, b) => b.score - a.score);
    this.leaderboard = entries.slice(0, 10);
    this.io.emit('leaderboard', { top10: this.leaderboard });
  }

  // ========== SEND STATE (Delta Compression) ==========

  sendState() {
    // Serialize current state
    const playerData = [];
    for (const [, player] of this.players) {
      playerData.push(player.serialize());
    }
    const mobData = this.mobManager.serializeAll();
    const orbData = this.orbs.map(o => ({
      i: o.id,
      x: Math.round(o.x),
      y: Math.round(o.y),
      am: o.amount,
      r: Math.round(o.radius),
    }));

    // Compute deltas against previous state
    const sendCount = this.tickCount;
    const isFull = !this._prevState || sendCount % 100 === 0; // Full snapshot every ~5 sec

    let gameState;
    if (isFull) {
      gameState = {
        full: true,
        p: playerData,
        m: mobData,
        pr: this.projectiles,
        o: orbData,
      };
    } else {
      gameState = {
        p: this._computeDelta(this._prevState.p, playerData),
        m: this._computeDelta(this._prevState.m, mobData),
        pr: this.projectiles, // projectiles always full
        o: this._computeDelta(this._prevState.o, orbData),
      };
    }

    // Store for next delta
    this._prevState = { p: playerData, m: mobData, o: orbData };

    this.io.emit('gameState', gameState);
  }

  /** Compute delta between previous and current entity arrays */
  _computeDelta(prev, current) {
    if (!prev) return current;

    const prevMap = new Map();
    for (const e of prev) prevMap.set(e.i, e);

    const delta = [];

    // Changed or new entities
    for (const e of current) {
      const p = prevMap.get(e.i);
      if (!p || e.x !== p.x || e.y !== p.y || e.h !== p.h || e.al !== p.al || e.l !== p.l) {
        delta.push(e);
      }
      prevMap.delete(e.i);
    }

    // Removed entities
    for (const [id] of prevMap) {
      delta.push({ i: id, rm: true });
    }

    return delta;
  }

  // ========== UTILITY ==========

  getPlayerCount() {
    return this.players.size;
  }

  getRealPlayerCount() {
    return this._getRealPlayerCount();
  }
}
