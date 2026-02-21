// Game entry point - canvas setup, UI flow, network connection
import { Game } from './game.js';
import { UI } from './ui.js';
import { Network } from './network.js';
import { SkinManager } from './skins.js';
import { Shop } from './shop.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const ui = new UI();
const network = new Network();
const skinManager = new SkinManager();
const shop = new Shop(skinManager);
let game = null;

// Connect to server immediately (for player count display)
network.connect();

// Update player count on menu
network.onPlayerCount = (data) => {
  const el = document.getElementById('online-count');
  if (el) el.textContent = `${data.count} players online`;
};

// Shop button in menu
ui.onShop = () => {
  shop.toggle();
};

// Play button -> join game
ui.onPlay = (name) => {
  ui.hideMenu();
  shop.hide();

  // Only hide cursor on desktop (mobile uses joystick)
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    canvas.style.cursor = 'none';
  }

  // Join the server with skin info
  network.join(name, skinManager.getEquipped());

  // Wait for join confirmation, then start game
  network.onJoined = () => {
    game = new Game(canvas, ctx, network, ui, skinManager);
    game.start();
  };
};

// Restart button -> respawn
ui.onRestart = () => {
  ui.hideDeath();
  network.sendRespawn();

  // Re-create game loop (state resets on server)
  if (game) game.stop();
  game = new Game(canvas, ctx, network, ui, skinManager);
  game.start();
};

// Show menu on load
ui.showMenu();
