// Redis-backed persistent leaderboard with in-memory fallback
// Uses Redis sorted sets for O(log N) ranking when available
// Falls back to in-memory array when Redis is not configured

let redisClient = null;

const REDIS_KEY = 'stackio:leaderboard';
const MAX_ENTRIES = 100;

/**
 * Initialize Redis connection (call once at startup)
 * @returns {boolean} true if Redis connected successfully
 */
export async function initRedis() {
  if (!process.env.REDIS_URL) {
    console.log('[Leaderboard] No REDIS_URL - using in-memory fallback');
    return false;
  }

  try {
    const redis = await import('redis');
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
      // Do NOT null redisClient — redis v4 reconnects automatically
    });
    await redisClient.connect();
    console.log('[Leaderboard] Redis connected');
    return true;
  } catch (err) {
    console.error('[Leaderboard] Redis init failed:', err.message);
    redisClient = null;
    return false;
  }
}

export class Leaderboard {
  constructor() {
    this.entries = [];
  }

  /** Update or insert a player's best score */
  async update(name, score, level) {
    if (redisClient) {
      try {
        await redisClient.zAdd(REDIS_KEY, { score, value: name }, { GT: true });
        await redisClient.hSet(`${REDIS_KEY}:levels`, name, String(level));
        const count = await redisClient.zCard(REDIS_KEY);
        if (count > MAX_ENTRIES) {
          await redisClient.zRemRangeByRank(REDIS_KEY, 0, count - MAX_ENTRIES - 1);
        }
        return;
      } catch (err) {
        console.error('[Redis] Update error:', err.message);
      }
    }

    // In-memory fallback
    const existing = this.entries.find(e => e.name === name);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.level = Math.max(existing.level, level);
    } else {
      this.entries.push({ name, score, level });
    }
    this.entries.sort((a, b) => b.score - a.score);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
  }

  /** Get top N entries */
  async getTop(n = 10) {
    if (redisClient) {
      try {
        const results = await redisClient.zRangeWithScores(REDIS_KEY, -n, -1);
        results.reverse();
        const levels = await redisClient.hGetAll(`${REDIS_KEY}:levels`);
        return results.map(r => ({
          name: r.value,
          score: r.score,
          level: parseInt(levels[r.value]) || 1,
        }));
      } catch (err) {
        console.error('[Redis] GetTop error:', err.message);
      }
    }
    return this.entries.slice(0, n);
  }

  /** Clear all entries */
  async clear() {
    if (redisClient) {
      try {
        await redisClient.del(REDIS_KEY);
        await redisClient.del(`${REDIS_KEY}:levels`);
        return;
      } catch (err) { /* fall through */ }
    }
    this.entries = [];
  }
}
