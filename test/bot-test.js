#!/usr/bin/env node
/**
 * STACK.io Automated Test Bot
 * Spawns multiple AI clients that connect via Socket.io and play the game.
 * Tests: connection, join, movement, level-up, respawn, game state, kill feed, leaderboard
 *
 * Usage: node test/bot-test.js [count] [duration_sec]
 *   count:        number of test bots (default: 5)
 *   duration_sec: how long to run in seconds (default: 30)
 */

import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:4000';
const BOT_COUNT = parseInt(process.argv[2]) || 5;
const DURATION = (parseInt(process.argv[3]) || 30) * 1000;

// Test result tracking
const results = {
  connected: 0,
  joined: 0,
  gameStates: 0,
  levelUps: 0,
  deaths: 0,
  leaderboards: 0,
  killFeeds: 0,
  errors: [],
  deltaUpdates: 0,
  fullSnapshots: 0,
};

console.log(`\n🎮 STACK.io Bot Test`);
console.log(`   Server: ${SERVER}`);
console.log(`   Bots: ${BOT_COUNT}`);
console.log(`   Duration: ${DURATION / 1000}s\n`);

const bots = [];

function createBot(index) {
  return new Promise((resolve) => {
    const name = `TestBot_${index}`;
    const socket = io(SERVER, {
      transports: ['websocket'],
      upgrade: false,
      timeout: 5000,
    });

    const bot = { name, socket, playerId: null, alive: false, level: 1, errors: [] };
    let inputInterval = null;

    socket.on('connect', () => {
      results.connected++;
      // Join the game
      socket.emit('join', { name });
    });

    socket.on('joined', (data) => {
      bot.playerId = data.id;
      results.joined++;
      bot.alive = true;

      // Start sending random movement input
      inputInterval = setInterval(() => {
        if (!bot.alive) return;
        const angle = Math.random() * Math.PI * 2;
        const moving = Math.random() > 0.1;
        socket.emit('input', { angle: Math.round(angle * 100) / 100, moving });
      }, 100);

      resolve(bot);
    });

    socket.on('gameState', (state) => {
      results.gameStates++;
      if (state.full) results.fullSnapshots++;
      else results.deltaUpdates++;

      // Validate state structure
      const hasPlayers = Array.isArray(state.p);
      const hasMobs = Array.isArray(state.m);
      const hasProjectiles = Array.isArray(state.pr);
      const hasOrbs = Array.isArray(state.o);

      if (!hasPlayers || !hasMobs || !hasProjectiles || !hasOrbs) {
        bot.errors.push('Invalid gameState structure');
      }
    });

    socket.on('levelUp', (data) => {
      results.levelUps++;
      bot.level++;

      // Auto-pick random option
      if (data.options && data.options.length > 0) {
        const choice = Math.floor(Math.random() * data.options.length);
        socket.emit('levelUp', { choice });
      }
    });

    socket.on('death', (data) => {
      results.deaths++;
      bot.alive = false;

      // Validate death data
      if (!data.stats || typeof data.stats.time !== 'string') {
        bot.errors.push('Invalid death data');
      }

      // Respawn after 1 second
      setTimeout(() => {
        socket.emit('respawn');
        bot.alive = true;
      }, 1000);
    });

    socket.on('leaderboard', (data) => {
      results.leaderboards++;
      if (!data.top10 || !Array.isArray(data.top10)) {
        bot.errors.push('Invalid leaderboard data');
      }
    });

    socket.on('killFeed', (data) => {
      results.killFeeds++;
    });

    socket.on('playerCount', (data) => {
      // Validate
      if (typeof data.count !== 'number') {
        bot.errors.push('Invalid playerCount');
      }
    });

    socket.on('connect_error', (err) => {
      bot.errors.push(`Connection error: ${err.message}`);
      results.errors.push(`${name}: ${err.message}`);
      resolve(bot);
    });

    socket.on('disconnect', () => {
      if (inputInterval) clearInterval(inputInterval);
    });

    // Timeout
    setTimeout(() => {
      if (!bot.playerId) {
        bot.errors.push('Join timeout');
        resolve(bot);
      }
    }, 5000);

    bots.push(bot);
  });
}

// Test Stripe API endpoint
async function testStripeEndpoint() {
  try {
    const res = await fetch(`${SERVER}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId: 'diamond', tier: 'common' }),
    });
    const data = await res.json();
    // Should return 401 (login required), 503 (not configured), or url
    if (res.status === 401 || res.status === 503 || data.url) {
      return { pass: true, msg: 'Stripe API responds correctly' };
    }
    return { pass: false, msg: `Unexpected response: ${JSON.stringify(data)}` };
  } catch (err) {
    return { pass: false, msg: `Stripe API error: ${err.message}` };
  }
}

// Test free skin checkout
async function testFreeSkinCheckout() {
  try {
    const res = await fetch(`${SERVER}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId: 'hexagon', tier: 'free' }),
    });
    const data = await res.json();
    if (data.unlocked === true) {
      return { pass: true, msg: 'Free skin checkout works' };
    }
    return { pass: false, msg: `Expected unlocked=true, got: ${JSON.stringify(data)}` };
  } catch (err) {
    return { pass: false, msg: `Free checkout error: ${err.message}` };
  }
}

async function run() {
  const startTime = Date.now();

  // Create bots
  console.log(`⏳ Spawning ${BOT_COUNT} test bots...`);
  const promises = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    promises.push(createBot(i));
    // Stagger connections
    await new Promise(r => setTimeout(r, 200));
  }
  await Promise.all(promises);
  console.log(`✅ ${results.connected}/${BOT_COUNT} connected, ${results.joined}/${BOT_COUNT} joined\n`);

  // Let them play
  console.log(`🎮 Playing for ${DURATION / 1000} seconds...`);
  await new Promise(r => setTimeout(r, DURATION));

  // Run API tests
  console.log(`\n🔌 Testing API endpoints...`);
  const stripeTest = await testStripeEndpoint();
  const freeTest = await testFreeSkinCheckout();

  // Collect errors
  for (const bot of bots) {
    for (const err of bot.errors) {
      results.errors.push(`${bot.name}: ${err}`);
    }
  }

  // Disconnect all bots
  for (const bot of bots) {
    bot.socket.disconnect();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print results
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  STACK.io Test Results (${elapsed}s)`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Connections:     ${results.connected}/${BOT_COUNT} ${results.connected === BOT_COUNT ? '✅' : '❌'}`);
  console.log(`  Joins:           ${results.joined}/${BOT_COUNT} ${results.joined === BOT_COUNT ? '✅' : '❌'}`);
  console.log(`  Game states:     ${results.gameStates} ${results.gameStates > 0 ? '✅' : '❌'}`);
  console.log(`    Full snapshots:  ${results.fullSnapshots}`);
  console.log(`    Delta updates:   ${results.deltaUpdates}`);
  console.log(`  Level ups:       ${results.levelUps} ${results.levelUps > 0 ? '✅' : '⚠️'}`);
  console.log(`  Deaths:          ${results.deaths}`);
  console.log(`  Leaderboards:    ${results.leaderboards} ${results.leaderboards > 0 ? '✅' : '❌'}`);
  console.log(`  Kill feeds:      ${results.killFeeds}`);
  console.log(`  Stripe API:      ${stripeTest.pass ? '✅' : '❌'} ${stripeTest.msg}`);
  console.log(`  Free checkout:   ${freeTest.pass ? '✅' : '❌'} ${freeTest.msg}`);

  if (results.errors.length > 0) {
    console.log(`\n  ❌ Errors (${results.errors.length}):`);
    for (const err of results.errors.slice(0, 10)) {
      console.log(`     - ${err}`);
    }
    if (results.errors.length > 10) console.log(`     ... and ${results.errors.length - 10} more`);
  } else {
    console.log(`\n  ✅ No errors!`);
  }

  // Overall pass/fail
  const passed = results.connected === BOT_COUNT &&
                 results.joined === BOT_COUNT &&
                 results.gameStates > 0 &&
                 results.leaderboards > 0 &&
                 stripeTest.pass &&
                 freeTest.pass &&
                 results.errors.length === 0;

  console.log(`\n  ${passed ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS NEED ATTENTION'}`);
  console.log(`${'='.repeat(50)}\n`);

  process.exit(passed ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
