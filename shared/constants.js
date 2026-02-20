// Shared constants used by both client and server

export const MAP = {
  WIDTH: 4000,
  HEIGHT: 4000,
  SAFE_ZONE_RADIUS: 200,
  SAFE_ZONE_DURATION: 5000,
  GRID_SIZE: 100,
};

export const PLAYER = {
  RADIUS: 20,
  BASE_SPEED: 3,
  BASE_HP: 100,
  XP_DROP_ON_DEATH: 0.5,
  PICKUP_RADIUS: 50,
  DEAD_ZONE: 30,
};

export const MOBS = {
  MAX_MOBS: 200,
  RESPAWN_RATE: 2,
  TYPES: {
    triangle: { hp: 20, xp: 10, size: 15, speed: 0.5, color: '#2ecc71', sides: 3 },
    square:   { hp: 50, xp: 30, size: 20, speed: 0.8, color: '#3498db', sides: 4 },
    pentagon: { hp: 100, xp: 80, size: 30, speed: 0.4, color: '#9b59b6', sides: 5 },
  },
};

export const WEAPONS = {
  orbit: {
    name: 'Orbit',
    description: 'Circles rotating around you',
    range: 80,
    damage: 5,
    count: 2,
    rotationSpeed: Math.PI * 2,
    maxLevel: 5,
  },
  bullet: {
    name: 'Bullet',
    description: 'Fires at nearest enemy',
    rate: 500,
    damage: 15,
    speed: 8,
    maxLevel: 5,
  },
  shockwave: {
    name: 'Shockwave',
    description: 'Periodic AoE pulse',
    rate: 2000,
    damage: 20,
    radius: 120,
    maxLevel: 5,
  },
  laser: {
    name: 'Laser',
    description: 'Piercing beam in move direction',
    rate: 1500,
    damage: 25,
    length: 300,
    maxLevel: 5,
  },
  mines: {
    name: 'Mines',
    description: 'Drops behind you',
    rate: 1000,
    damage: 30,
    lifetime: 5000,
    maxLevel: 5,
  },
  shield: {
    name: 'Shield',
    description: 'Blocks incoming damage',
    absorb: 20,
    recharge: 3000,
    maxLevel: 5,
  },
};

export const PASSIVES = {
  speed:    { name: 'Speed Boost', description: '+10% movement speed', perLevel: 0.1, maxLevel: 5 },
  magnet:   { name: 'Magnet',      description: '+20% XP pickup radius', perLevel: 0.2, maxLevel: 5 },
  armor:    { name: 'Armor',       description: '-10% damage taken', perLevel: 0.1, maxLevel: 5 },
  regen:    { name: 'Regen',       description: '+1 HP/sec', perLevel: 1, maxLevel: 3 },
  critical: { name: 'Critical',    description: '+5% crit chance', perLevel: 0.05, maxLevel: 5 },
  area:     { name: 'Area',        description: '+10% weapon area', perLevel: 0.1, maxLevel: 3 },
};

export const LEVELING = {
  xpFormula: (level) => level * 100 + (level * level * 10),
  OPTIONS_COUNT: 3,
};

export const NETWORK = {
  SERVER_TICK_RATE: 60,
  CLIENT_SEND_RATE: 20,
  MAX_PLAYERS_PER_ROOM: 50,
};

export const SKIN_TIERS = {
  free: { price: 0 },
  common: { price: 0.99 },
  rare: { price: 2.99 },
  legendary: { price: 4.99 },
  bundle: { price: 9.99 },
};
