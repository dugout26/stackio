// Game entry point - canvas setup, UI flow, network connection
import { Game } from './game.js';
import { UI } from './ui.js';
import { Network } from './network.js';
import { SkinManager } from './skins.js';
import { Shop } from './shop.js';
import { audio } from './audio.js';

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

// ========== AUTH STATE ==========
let currentUser = null;

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      skinManager.syncFromServer(data.user.skins);
      shop.updateAccountStatus(currentUser);
      updateAccountButton();
    }
  } catch (e) {
    // Not logged in
  }
}

async function handleLogin(email, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  currentUser = data.user;
  skinManager.syncFromServer(data.user.skins);
  shop.updateAccountStatus(currentUser);
  updateAccountButton();

  // Link current game session to account
  if (network.socket) {
    network.socket.emit('linkAccount', { userId: currentUser.id });
  }

  hideAuthModal();
}

async function handleRegister(email, password) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      existingSkins: skinManager.getOwnedSkinIds(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  currentUser = data.user;
  skinManager.syncFromServer(data.user.skins);
  shop.updateAccountStatus(currentUser);
  updateAccountButton();

  // Link current game session to account
  if (network.socket) {
    network.socket.emit('linkAccount', { userId: currentUser.id });
  }

  hideAuthModal();
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  shop.updateAccountStatus(null);
  updateAccountButton();
}

// ========== AUTH MODAL ==========
let authOverlay = null;

function buildAuthModal() {
  const el = document.createElement('div');
  el.id = 'auth-overlay';
  el.className = 'auth-overlay';
  el.innerHTML = `
    <div class="auth-panel">
      <div class="auth-header">
        <h2 class="auth-title">ACCOUNT</h2>
        <button class="auth-close" id="auth-close">&times;</button>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">LOGIN</button>
        <button class="auth-tab" data-tab="register">REGISTER</button>
      </div>
      <div class="auth-form" id="auth-form-login">
        <input type="email" id="auth-email-login" class="auth-input" placeholder="Email" autocomplete="email">
        <input type="password" id="auth-pass-login" class="auth-input" placeholder="Password" autocomplete="current-password">
        <button class="auth-submit" id="auth-btn-login">LOGIN</button>
        <div class="auth-error" id="auth-error-login"></div>
      </div>
      <div class="auth-form" id="auth-form-register" style="display:none">
        <input type="email" id="auth-email-reg" class="auth-input" placeholder="Email" autocomplete="email">
        <input type="password" id="auth-pass-reg" class="auth-input" placeholder="Password (6+ chars)" autocomplete="new-password">
        <input type="password" id="auth-pass-reg-confirm" class="auth-input" placeholder="Confirm password" autocomplete="new-password">
        <button class="auth-submit" id="auth-btn-register">CREATE ACCOUNT</button>
        <div class="auth-error" id="auth-error-register"></div>
      </div>
    </div>
  `;

  // Close
  el.querySelector('#auth-close').addEventListener('click', hideAuthModal);

  // Tab switching
  const tabs = el.querySelectorAll('.auth-tab');
  const formLogin = el.querySelector('#auth-form-login');
  const formRegister = el.querySelector('#auth-form-register');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'login') {
        formLogin.style.display = 'flex';
        formRegister.style.display = 'none';
      } else {
        formLogin.style.display = 'none';
        formRegister.style.display = 'flex';
      }
    });
  });

  // Login submit
  el.querySelector('#auth-btn-login').addEventListener('click', async () => {
    const email = el.querySelector('#auth-email-login').value.trim();
    const password = el.querySelector('#auth-pass-login').value;
    const errEl = el.querySelector('#auth-error-login');
    errEl.textContent = '';
    try {
      await handleLogin(email, password);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  // Register submit
  el.querySelector('#auth-btn-register').addEventListener('click', async () => {
    const email = el.querySelector('#auth-email-reg').value.trim();
    const password = el.querySelector('#auth-pass-reg').value;
    const confirm = el.querySelector('#auth-pass-reg-confirm').value;
    const errEl = el.querySelector('#auth-error-register');
    errEl.textContent = '';

    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match';
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters';
      return;
    }

    try {
      await handleRegister(email, password);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  // Enter key support
  el.querySelector('#auth-pass-login').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.querySelector('#auth-btn-login').click();
  });
  el.querySelector('#auth-pass-reg-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.querySelector('#auth-btn-register').click();
  });

  document.body.appendChild(el);
  return el;
}

function showAuthModal() {
  if (!authOverlay) authOverlay = buildAuthModal();
  authOverlay.classList.add('active');
}

function hideAuthModal() {
  if (authOverlay) authOverlay.classList.remove('active');
}

// ========== ACCOUNT BUTTON (menu nav) ==========
function updateAccountButton() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  btn.textContent = currentUser ? 'LOGOUT' : 'ACCOUNT';
}

// Wire account button
const btnAccount = document.getElementById('btn-account');
if (btnAccount) {
  btnAccount.addEventListener('click', () => {
    if (currentUser) {
      handleLogout();
    } else {
      showAuthModal();
    }
  });
}

// Wire shop callbacks
shop.onLoginRequired = () => showAuthModal();
shop.onLogout = () => handleLogout();

// ========== GAME FLOW ==========

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

  // Only hide cursor on desktop during gameplay (mobile uses joystick)
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    canvas.classList.add('playing');
  }

  // Initialize audio on first user interaction
  audio.init();

  // Join the server with skin info
  network.join(name, skinManager.getEquipped());

  // Wait for join confirmation, then start game
  network.onJoined = () => {
    game = new Game(canvas, ctx, network, ui, skinManager);
    game.start();

    // Link account to game session if logged in
    if (currentUser && network.socket) {
      network.socket.emit('linkAccount', { userId: currentUser.id });
    }
  };
};

// Restart button -> respawn
ui.onRestart = () => {
  ui.hideDeath();
  network.sendRespawn();

  // Hide cursor on desktop for gameplay
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    canvas.classList.add('playing');
  }

  // Re-create game loop (state resets on server)
  if (game) game.stop();
  game = new Game(canvas, ctx, network, ui, skinManager);
  game.start();
};

// Main menu button -> back to title screen
ui.onMainMenu = () => {
  ui.hideDeath();
  canvas.classList.remove('playing');

  // Stop current game loop
  if (game) {
    game.stop();
    game = null;
  }

  // Disconnect and reconnect (clean state)
  network.disconnect();
  network.connect();

  // Re-wire player count listener after reconnect
  network.onPlayerCount = (data) => {
    const el = document.getElementById('online-count');
    if (el) el.textContent = `${data.count} players online`;
  };

  // Show main menu
  ui.showMenu();
};

// Check auth state on load
checkAuth();

// Push AdSense ads on page load (menu ad)
try {
  (window.adsbygoogle = window.adsbygoogle || []).push({});
} catch (e) { /* AdSense not ready */ }

// Show menu on load
ui.showMenu();
