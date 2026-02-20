# STACK.io - Project Configuration

## Project Overview
STACK.io is a browser-based multiplayer survival game combining Vampire Survivors auto-attack mechanics with .io game PvP. Players move with mouse/touch, weapons auto-fire, and leveling up lets you choose skills/weapons to build unique combinations.

## Tech Stack
- **Frontend**: HTML5 Canvas + Vanilla JavaScript (NO frameworks like React/Vue)
- **Backend**: Node.js + Express
- **Realtime**: Socket.io (WebSocket)
- **Database**: Redis (leaderboard) + SQLite (user accounts, skins)
- **Hosting**: Vercel (frontend) + Render (backend server)
- **Payments**: Stripe (skin purchases)
- **Ads**: Google AdSense

## Project Structure
```
stack/
├── client/
│   ├── index.html          # Main game page
│   ├── css/
│   │   └── style.css       # UI styles
│   ├── js/
│   │   ├── main.js         # Game entry point, canvas setup
│   │   ├── game.js         # Main game loop, state management
│   │   ├── player.js       # Player class (movement, HP, XP, level)
│   │   ├── weapons.js      # 6 weapon types + upgrade logic
│   │   ├── mobs.js         # NPC mob spawning + AI behavior
│   │   ├── renderer.js     # Canvas rendering (players, mobs, projectiles, effects)
│   │   ├── camera.js       # Camera follow + viewport culling
│   │   ├── input.js        # Mouse + touch input handling
│   │   ├── network.js      # Socket.io client connection
│   │   ├── ui.js           # HUD, leaderboard, level-up screen, death screen
│   │   ├── minimap.js      # Minimap rendering
│   │   ├── skins.js        # Skin system (shapes, trails, effects)
│   │   ├── shop.js         # Skin shop UI + Stripe integration
│   │   └── audio.js        # Sound effects (optional)
│   └── assets/
│       └── (minimal - geometric shapes are drawn via Canvas)
├── server/
│   ├── index.js            # Express + Socket.io server entry
│   ├── game.js             # Server-side game simulation (authoritative)
│   ├── player.js           # Server player state
│   ├── weapons.js          # Server weapon logic + damage calc
│   ├── mobs.js             # Server mob spawning + behavior
│   ├── collision.js        # Server-side collision detection
│   ├── leaderboard.js      # Redis leaderboard operations
│   ├── rooms.js            # Room/arena management (max 50 per room)
│   └── config.js           # Game balance constants
├── shared/
│   └── constants.js        # Shared constants (map size, weapon stats, etc.)
├── package.json
├── CLAUDE.md               # This file
└── README.md
```

## Architecture Rules

### Authoritative Server Model
- Server runs the TRUE game simulation at 60 ticks/sec
- Server sends state snapshots to clients at 20 ticks/sec
- Clients ONLY send input: { angle: number, levelUpChoice?: number }
- Clients do interpolation for smooth rendering between server ticks
- ALL damage calculation, collision detection, XP distribution happens on server
- NEVER trust client data for game logic

### Network Protocol (Socket.io Events)
```
Client → Server:
  'join'        : { name: string, skinId?: string }
  'input'       : { angle: number }  // movement direction in radians
  'levelUp'     : { choice: 0 | 1 | 2 }  // which of 3 options picked
  'respawn'     : {}

Server → Client:
  'gameState'   : { players: [], mobs: [], projectiles: [], orbs: [] }
  'levelUp'     : { options: [WeaponOption, WeaponOption, WeaponOption] }
  'death'       : { killerName: string, stats: { time, kills, level, xp } }
  'leaderboard' : { top10: [{ name, score, level }] }
  'killFeed'    : { killer: string, victim: string }
```

### Delta Compression
- First gameState is full snapshot
- Subsequent updates only include changed entities
- Each entity has a unique `id` field for tracking
- Removed entities sent as `{ id, removed: true }`

## Game Design Constants

### Map
- MAP_WIDTH: 4000
- MAP_HEIGHT: 4000
- SAFE_ZONE_RADIUS: 200 (center of map)
- SAFE_ZONE_DURATION: 5000 (ms, new player immunity)

### Player
- BASE_SPEED: 3
- BASE_HP: 100
- XP_DROP_ON_DEATH: 0.5 (50% of total XP)
- PICKUP_RADIUS: 50

### Mobs
- Types: triangle (easy), square (medium), pentagon (hard)
- MAX_MOBS: 200 per arena
- RESPAWN_RATE: 2 per second
- Triangle: HP 20, XP 10
- Square: HP 50, XP 30
- Pentagon: HP 100, XP 80

### Weapons (6 total for MVP)
```
1. Orbit     - circles rotating around player, range: 80, damage: 5/tick
2. Bullet    - fires at nearest enemy, rate: 500ms, damage: 15, speed: 8
3. Shockwave - periodic AoE pulse, rate: 2000ms, damage: 20, radius: 120
4. Laser     - piercing beam in move direction, rate: 1500ms, damage: 25, length: 300
5. Mines     - drops behind player, rate: 1000ms, damage: 30, lifetime: 5000ms
6. Shield    - arc blocking damage, absorbs: 20 damage, recharge: 3000ms
```

### Leveling
- Level formula: XP_needed = level * 100 + (level^2 * 10)
- On level up: pause game for this player, show 3 random options
- Options can be: new weapon, weapon upgrade (+level), passive upgrade
- Max weapon level: 5
- Max passive level: 5 (Speed), 5 (Magnet), 5 (Armor), 3 (Regen), 5 (Crit), 3 (Area)

### Skins
- Skin types: shape (character model), trail (movement effect), explosion (death effect), weapon (weapon visual)
- Skin tiers: free, common ($0.99), rare ($2.99), legendary ($4.99), bundle ($9.99)
- Skins are purely cosmetic - NO gameplay advantage

## Coding Style

### JavaScript
- Use ES6+ (const/let, arrow functions, async/await, destructuring)
- NO TypeScript (keep it simple for rapid development)
- NO build tools for MVP (no webpack/vite). Use ES modules with <script type="module">
- Use JSDoc comments for complex functions
- Prefer composition over inheritance
- Keep files under 300 lines, split if larger

### Canvas Rendering
- All game objects are geometric shapes (circles, triangles, squares, pentagons)
- Use requestAnimationFrame for render loop
- Implement viewport culling (don't render off-screen entities)
- Use object pooling for particles/projectiles to avoid GC pressure
- Target 60fps on mid-range devices

### Performance
- Use spatial hashing for collision detection (grid-based)
- Limit particle effects on mobile (detect via User-Agent or screen size)
- Compress socket messages (short property names: x, y, a, h, l, s)
- Use ArrayBuffer for position data if needed for optimization

### Error Handling
- Server: catch all errors, never crash the game loop
- Client: graceful reconnection on disconnect
- Log errors to console with timestamps

## Git Workflow
- Main branch: `main` (always deployable)
- Feature branches: `day-1`, `day-2`, etc.
- Commit often with descriptive messages
- Tag releases: `v0.1` (Day 7 beta), `v1.0` (Day 14 launch)

## Testing
- Multiplayer test: open 2 browser tabs (Chrome + Incognito)
- Mobile test: Chrome DevTools device emulation
- Performance test: Chrome DevTools Performance tab, target <16ms frame time
- Add AI bots for testing with more players: bots move randomly and auto-attack

## Important Notes
- NEVER add pay-to-win mechanics. All purchases are cosmetic only.
- Mobile support is required from Day 1 thinking, implemented Day 6.
- Keep the game playable with 200ms latency (important for global players).
- The game must work without sound (sound is optional enhancement).
- All text in the game should be in English (global market).
- Keep UI minimal - the game should be self-explanatory without tutorials.
