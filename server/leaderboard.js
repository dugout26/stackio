// Redis leaderboard operations
// Placeholder for Redis-backed persistent leaderboard
// Currently the in-memory leaderboard is managed in server/game.js
// This module will be used when Redis is configured for production

export class Leaderboard {
  constructor() {
    this.entries = [];
  }

  /** Update or insert a player's score */
  update(name, score, level) {
    const existing = this.entries.find(e => e.name === name);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.level = Math.max(existing.level, level);
    } else {
      this.entries.push({ name, score, level });
    }
    this.entries.sort((a, b) => b.score - a.score);
    if (this.entries.length > 100) {
      this.entries = this.entries.slice(0, 100);
    }
  }

  /** Get top N entries */
  getTop(n = 10) {
    return this.entries.slice(0, n);
  }

  /** Clear all entries */
  clear() {
    this.entries = [];
  }
}
