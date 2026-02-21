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

let nextOrbId = 1;

export class ServerGame {
  constructor(io) {
    this.io = io;
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
      dirChangeTimer: 1 + Math.random() * 2,
      levelUpTimer: 0,
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
          }
        }
        continue;
      }

      const timer = this.botTimers.get(botId);
      if (!timer) continue;

      // Change direction periodically
      timer.dirChangeTimer -= dt;
      if (timer.dirChangeTimer <= 0) {
        timer.dirChangeTimer = 1 + Math.random() * 2;
        bot.angle = Math.random() * Math.PI * 2;

        // Sometimes stop moving briefly
        bot.moving = Math.random() > 0.15;
      }

      // Auto level up immediately with random choices
      const state = this.levelUpState.get(botId);
      if (state && state.pending > 0) {
        const choice = Math.floor(Math.random() * state.options.length);
        const option = state.options[choice];
        bot.applyLevelUpChoice(option);

        const weapons = this.playerWeapons.get(botId);
        if (weapons) {
          weapons.ensureState(bot.weapons);
        }

        state.pending--;
        if (state.pending > 0) {
          state.options = bot.generateLevelUpOptions();
        } else {
          this.levelUpState.delete(botId);
          bot.pendingLevelUp = false;
        }
      }
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
            // Apply shield first
            let damage = hit.damage;
            const targetWeapons = this.playerWeapons.get(hit.target.id);
            if (targetWeapons && hit.target.weapons.find(w => w.key === 'shield')) {
              damage = targetWeapons.shieldAbsorb(damage);
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
            // Shield absorb
            const weapons = this.playerWeapons.get(player.id);
            if (weapons && player.weapons.find(w => w.key === 'shield')) {
              damage = weapons.shieldAbsorb(damage);
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

  // ========== SEND STATE ==========

  sendState() {
    // Serialize players
    const playerData = [];
    for (const [, player] of this.players) {
      playerData.push(player.serialize());
    }

    // Serialize mobs
    const mobData = this.mobManager.serializeAll();

    // Orb data
    const orbData = this.orbs.map(o => ({
      i: o.id,
      x: Math.round(o.x),
      y: Math.round(o.y),
      am: o.amount,
      r: Math.round(o.radius),
    }));

    // Build game state
    const gameState = {
      p: playerData,
      m: mobData,
      pr: this.projectiles,
      o: orbData,
    };

    // Send to all connected sockets
    this.io.emit('gameState', gameState);
  }

  // ========== UTILITY ==========

  getPlayerCount() {
    return this.players.size;
  }

  getRealPlayerCount() {
    return this._getRealPlayerCount();
  }
}
