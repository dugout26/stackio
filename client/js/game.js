// Main game loop and state management
// CLIENT-SIDE: receives authoritative state from server, renders it
// Only sends input (angle, moving) to server

import { Camera } from './camera.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { MAP } from '/shared/constants.js';
import { audio } from './audio.js';

export class Game {
  constructor(canvas, ctx, network, ui, skinManager) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.network = network;
    this.ui = ui;
    this.skinManager = skinManager;
    this.renderer = new Renderer(canvas, ctx);
    this.renderer.setSkinManager(skinManager);
    this.camera = new Camera(canvas);
    this.input = new Input(canvas);

    this.running = false;
    this.lastTime = 0;

    // Local player position (for camera, derived from server state)
    this.localPlayerX = MAP.WIDTH / 2;
    this.localPlayerY = MAP.HEIGHT / 2;

    // Leaderboard data
    this.leaderboard = [];

    // Kill feed (last 5 entries with timestamps)
    this.killFeed = [];

    // Level-up state
    this.paused = false;

    // Wire up network callbacks
    this._setupNetworkCallbacks();
  }

  _setupNetworkCallbacks() {
    // Level-up options received from server
    this.network.onLevelUp = (data) => {
      this.paused = true;
      this.canvas.classList.remove('playing'); // Show cursor for card selection
      audio.playLevelUp();
      this.ui.showLevelUp(data.options);
    };

    // Level-up UI choice
    this.ui.onLevelUpChoice = (index, opt) => {
      this.network.sendLevelUp(index);
      this.paused = false;
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (!isMobile) {
        this.canvas.classList.add('playing'); // Hide cursor again
      }
    };

    // Death notification
    this.network.onDeath = (data) => {
      this.canvas.classList.remove('playing'); // Show cursor for death screen buttons
      audio.playDeath();
      // Trigger death effect at player's last position
      if (this.skinManager) {
        this.skinManager.triggerDeath(this.localPlayerX, this.localPlayerY, '#e74c3c');
      }
      this.ui.showDeath({
        killer: data.killerName,
        time: data.stats.time,
        level: data.stats.level,
        kills: data.stats.kills,
        xp: data.stats.xp,
      });
    };

    // Leaderboard update
    this.network.onLeaderboard = (data) => {
      this.leaderboard = data.top10 || [];
    };

    // Kill feed
    this.network.onKillFeed = (data) => {
      // Play kill sound if local player got the kill (using equipped kill sound)
      const localPlayer = this.network.getLocalPlayer();
      if (localPlayer && data.killer === localPlayer.n) {
        const killSoundId = this.skinManager ? this.skinManager.getKillSoundId() : 'default';
        audio.playKill(killSoundId);
      }
      this.killFeed.push({
        killer: data.killer,
        victim: data.victim,
        time: Date.now(),
      });
      // Keep only last 5
      if (this.killFeed.length > 5) {
        this.killFeed.shift();
      }
    };

    // Player count
    this.network.onPlayerCount = (data) => {
      const el = document.getElementById('online-count');
      if (el) el.textContent = `${data.count} players online`;
    };
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  loop(time) {
    if (!this.running) return;

    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Get local player from server state
    const localPlayer = this.network.getLocalPlayer();
    if (!localPlayer) return;

    // Interpolate local player position for smooth camera
    const interp = this.network.interpolateEntity(localPlayer, this.network.prevPlayers);
    this.localPlayerX = interp.x;
    this.localPlayerY = interp.y;

    // Update input based on mouse position relative to player screen pos
    const playerScreen = this.camera.worldToScreen(this.localPlayerX, this.localPlayerY);
    this.input.update(playerScreen.x, playerScreen.y);

    // Send input to server
    if (this.input.moving && !this.paused) {
      this.network.sendInput(this.input.angle, true);
    } else {
      this.network.sendInput(this.input.angle, false);
    }

    // Update camera to follow local player
    this.camera.follow({ x: this.localPlayerX, y: this.localPlayerY });

    // Clean old kill feed entries (older than 5 seconds)
    const now = Date.now();
    this.killFeed = this.killFeed.filter(f => now - f.time < 5000);
  }

  render() {
    const localPlayer = this.network.getLocalPlayer();
    const dt = 1 / 60; // Approximate dt for trail updates

    this.renderer.updateFPS();
    this.renderer.clear();
    this.renderer.drawGrid(this.camera);
    this.renderer.drawBoundary(this.camera);
    this.renderer.drawSafeZone(this.camera);

    // Draw XP orbs
    this.renderer.drawOrbs(this.network.orbs, this.network.prevOrbs, this.network, this.camera);

    // Draw mobs
    this.renderer.drawMobs(this.network.mobs, this.network.prevMobs, this.network, this.camera);

    // Update & draw trail (behind player)
    if (localPlayer && this.skinManager) {
      this.skinManager.updateTrail({
        x: this.localPlayerX,
        y: this.localPlayerY,
        angle: localPlayer.a || 0,
        moving: localPlayer.al,
      }, dt);
      this.skinManager.drawTrail(this.ctx, this.camera);
    }

    // Draw all players (with skin for local player)
    this.renderer.drawPlayers(
      this.network.players,
      this.network.prevPlayers,
      this.network,
      this.camera,
      this.network.playerId,
      this.skinManager
    );

    // Draw projectiles (pass localPlayerId for weapon skins)
    this.renderer.drawProjectiles(this.network.projectiles, this.camera, this.network.playerId);

    // Draw death effects
    if (this.skinManager) {
      this.skinManager.updateDeathEffects(dt, this.ctx, this.camera);
    }

    // Draw HUD (using local player data)
    if (localPlayer) {
      this.renderer.drawHUD({
        hp: localPlayer.h,
        maxHp: localPlayer.mh,
        xp: localPlayer.xp || 0,
        level: localPlayer.l,
        xpToNextLevel: localPlayer.xn || (localPlayer.l * 100 + (localPlayer.l * localPlayer.l * 10)),
      });
    }

    // Draw leaderboard
    this.renderer.drawLeaderboard(this.leaderboard, this.network.playerId, this.network.players);

    // Draw kill feed
    this.renderer.drawKillFeed(this.killFeed);

    // Draw minimap
    this.renderer.drawMinimap(
      this.network.players,
      this.network.mobs,
      this.network.playerId,
      this.localPlayerX,
      this.localPlayerY
    );

    // Draw crosshair cursor (desktop) or virtual joystick (mobile)
    this.renderer.drawCrosshair(this.input.mouseX, this.input.mouseY);
    this.input.drawJoystick(this.ctx);
  }
}
