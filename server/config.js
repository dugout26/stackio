// Game balance constants (server-side overrides)
// These override shared/constants.js values when needed for server tuning
// Currently all values come from shared/constants.js

export const SERVER_CONFIG = {
  // Bot management
  MIN_PLAYERS: 10,
  BOT_RESPAWN_DELAY: 3, // seconds

  // Mob contact damage
  MOB_CONTACT_DAMAGE: 5,
  MOB_CONTACT_COOLDOWN: 500, // ms

  // Weapon collision search radius
  WEAPON_SEARCH_RADIUS: 600,

  // XP orb lifetime
  ORB_LIFETIME: 30, // seconds

  // Kill XP drop
  DEATH_XP_DROP_RATIO: 0.5, // 50% of total score
  MAX_DEATH_ORBS: 10,
};
