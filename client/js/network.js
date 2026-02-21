// Socket.io client connection
// Connects to server, sends input, receives authoritative game state
// Client-side interpolation between server ticks for smooth rendering

import { NETWORK } from '/shared/constants.js';

export class Network {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.playerId = null;

    // Game state from server
    this.players = [];
    this.mobs = [];
    this.projectiles = [];
    this.orbs = [];

    // Previous state for interpolation
    this.prevPlayers = [];
    this.prevMobs = [];
    this.prevOrbs = [];

    // State timestamps for interpolation
    this.lastStateTime = 0;
    this.stateInterval = 1000 / NETWORK.CLIENT_SEND_RATE; // ~50ms

    // Input send rate limiter
    this.lastInputSend = 0;
    this.inputInterval = 1000 / NETWORK.CLIENT_SEND_RATE;

    // Event callbacks
    this.onJoined = null;
    this.onGameState = null;
    this.onLevelUp = null;
    this.onDeath = null;
    this.onLeaderboard = null;
    this.onKillFeed = null;
    this.onPlayerCount = null;
    this.onDisconnect = null;
  }

  /** Connect to the server */
  connect() {
    // Socket.io is loaded via CDN script tag
    this.socket = io({
      transports: ['websocket'],
      upgrade: false,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Network] Connected to server');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('[Network] Disconnected from server');
      if (this.onDisconnect) this.onDisconnect();
    });

    // Player joined confirmation
    this.socket.on('joined', (data) => {
      this.playerId = data.id;
      console.log('[Network] Joined as', this.playerId);
      if (this.onJoined) this.onJoined(data);
    });

    // Game state update
    this.socket.on('gameState', (state) => {
      // Store previous state for interpolation
      this.prevPlayers = this.players;
      this.prevMobs = this.mobs;
      this.prevOrbs = this.orbs;
      this.lastStateTime = performance.now();

      // Update current state
      this.players = state.p || [];
      this.mobs = state.m || [];
      this.projectiles = state.pr || [];
      this.orbs = state.o || [];

      if (this.onGameState) this.onGameState(state);
    });

    // Level up options
    this.socket.on('levelUp', (data) => {
      if (this.onLevelUp) this.onLevelUp(data);
    });

    // Death notification
    this.socket.on('death', (data) => {
      if (this.onDeath) this.onDeath(data);
    });

    // Leaderboard update
    this.socket.on('leaderboard', (data) => {
      if (this.onLeaderboard) this.onLeaderboard(data);
    });

    // Kill feed
    this.socket.on('killFeed', (data) => {
      if (this.onKillFeed) this.onKillFeed(data);
    });

    // Player count
    this.socket.on('playerCount', (data) => {
      if (this.onPlayerCount) this.onPlayerCount(data);
    });
  }

  /** Send join request */
  join(name, skinData) {
    if (this.socket) {
      this.socket.emit('join', { name, skin: skinData });
    }
  }

  /** Send input (angle + moving state), rate-limited */
  sendInput(angle, moving) {
    const now = performance.now();
    if (now - this.lastInputSend < this.inputInterval) return;
    this.lastInputSend = now;

    if (this.socket && this.connected) {
      this.socket.emit('input', {
        angle: Math.round(angle * 100) / 100,
        moving,
      });
    }
  }

  /** Send level-up choice */
  sendLevelUp(choiceIndex) {
    if (this.socket) {
      this.socket.emit('levelUp', { choice: choiceIndex });
    }
  }

  /** Send respawn request */
  sendRespawn() {
    if (this.socket) {
      this.socket.emit('respawn');
    }
  }

  /** Get the local player data from the latest state */
  getLocalPlayer() {
    if (!this.playerId) return null;
    return this.players.find(p => p.i === this.playerId) || null;
  }

  /**
   * Interpolate between previous and current state.
   * Returns interpolation factor (0 = prev state, 1 = current state).
   */
  getInterpolationFactor() {
    if (this.lastStateTime === 0) return 1;
    const elapsed = performance.now() - this.lastStateTime;
    return Math.min(elapsed / this.stateInterval, 1);
  }

  /**
   * Get interpolated position for an entity.
   * Finds entity in previous state and lerps toward current position.
   */
  interpolateEntity(current, prevList) {
    const t = this.getInterpolationFactor();
    if (t >= 1) return { x: current.x, y: current.y };

    const prev = prevList.find(p => p.i === current.i);
    if (!prev) return { x: current.x, y: current.y };

    return {
      x: prev.x + (current.x - prev.x) * t,
      y: prev.y + (current.y - prev.y) * t,
    };
  }

  /** Disconnect from server */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.playerId = null;
  }
}
