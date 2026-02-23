// HUD, main menu, level-up screen, death screen
import { WEAPONS, PASSIVES } from '/shared/constants.js';

// Weapon icon symbols for display
const WEAPON_ICONS = {
  orbit: '◎',
  bullet: '•',
  shockwave: '◉',
  laser: '─',
  mines: '⬡',
  shield: '◗',
};

const PASSIVE_ICONS = {
  speed: '⚡',
  magnet: '🧲',
  armor: '🛡',
  regen: '❤',
  critical: '💥',
  area: '◌',
};

export class UI {
  constructor() {
    this.mainMenu = document.getElementById('main-menu');
    this.nameInput = document.getElementById('name-input');
    this.btnPlay = document.getElementById('btn-play');
    this.onlineCount = document.getElementById('online-count');

    this.levelupOverlay = document.getElementById('levelup-overlay');
    this.levelupCards = document.getElementById('levelup-cards');

    this.deathScreen = document.getElementById('death-screen');
    this.deathKiller = document.getElementById('death-killer');
    this.deathStats = document.getElementById('death-stats');
    this.btnRestart = document.getElementById('btn-restart');

    this.menuParticles = document.getElementById('menu-particles');
    this.particleCtx = this.menuParticles.getContext('2d');
    this.particles = [];

    this.onPlay = null;
    this.onLevelUpChoice = null;
    this.onRestart = null;
    this.onMainMenu = null;
    this.onShop = null;

    this._initEvents();
    this._initParticles();
    this._animateParticles();
  }

  _initEvents() {
    this.btnPlay.addEventListener('click', () => {
      const name = this.nameInput.value.trim() || 'Player';
      if (this.onPlay) this.onPlay(name);
    });

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnPlay.click();
      }
    });

    this.btnRestart.addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });

    // Main menu button on death screen
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
      btnMenu.addEventListener('click', () => {
        if (this.onMainMenu) this.onMainMenu();
      });
    }

    // Shop button (first .btn-nav)
    const navButtons = document.querySelectorAll('.btn-nav');
    if (navButtons[0]) {
      navButtons[0].addEventListener('click', () => {
        if (this.onShop) this.onShop();
      });
    }

    // Leaderboard button (second .btn-nav)
    const lbOverlay = document.getElementById('leaderboard-overlay');
    if (navButtons[1] && lbOverlay) {
      navButtons[1].addEventListener('click', () => {
        lbOverlay.classList.add('active');
        this._fetchLeaderboard();
      });
      const lbClose = document.getElementById('leaderboard-close');
      if (lbClose) {
        lbClose.addEventListener('click', () => {
          lbOverlay.classList.remove('active');
        });
      }
    }

    // How To Play button (third .btn-nav)
    const htpOverlay = document.getElementById('howtoplay-overlay');
    if (navButtons[2] && htpOverlay) {
      navButtons[2].addEventListener('click', () => {
        htpOverlay.classList.add('active');
      });
      const htpClose = document.getElementById('howtoplay-close');
      if (htpClose) {
        htpClose.addEventListener('click', () => {
          htpOverlay.classList.remove('active');
        });
      }
    }

    // Share button on death screen
    const btnShare = document.querySelector('.btn-share');
    if (btnShare) {
      btnShare.addEventListener('click', () => {
        const text = 'I just played STACK.io! Can you beat my score? 🎮';
        const url = window.location.href;
        if (navigator.share) {
          navigator.share({ title: 'STACK.io', text, url }).catch(() => {});
        } else {
          // Fallback: copy to clipboard
          navigator.clipboard.writeText(`${text} ${url}`).then(() => {
            btnShare.textContent = 'COPIED!';
            setTimeout(() => { btnShare.textContent = 'SHARE'; }, 2000);
          }).catch(() => {});
        }
      });
    }
  }

  // --- Menu Particles ---
  _initParticles() {
    this.menuParticles.width = window.innerWidth;
    this.menuParticles.height = window.innerHeight;
    window.addEventListener('resize', () => {
      this.menuParticles.width = window.innerWidth;
      this.menuParticles.height = window.innerHeight;
    });

    const shapes = [3, 4, 5]; // triangle, square, pentagon
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: 6 + Math.random() * 14,
        sides: shapes[Math.floor(Math.random() * shapes.length)],
        speed: 0.2 + Math.random() * 0.4,
        angle: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.03 + Math.random() * 0.06,
      });
    }
  }

  _animateParticles() {
    const ctx = this.particleCtx;
    const w = this.menuParticles.width;
    const h = this.menuParticles.height;

    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;
      p.rotation += p.rotSpeed;

      if (p.x < -50) p.x = w + 50;
      if (p.x > w + 50) p.x = -50;
      if (p.y < -50) p.y = h + 50;
      if (p.y > h + 50) p.y = -50;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      for (let i = 0; i < p.sides; i++) {
        const a = (Math.PI * 2 / p.sides) * i - Math.PI / 2;
        const px = Math.cos(a) * p.size;
        const py = Math.sin(a) * p.size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(0, 212, 255, ${p.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    if (this.mainMenu.style.display !== 'none') {
      requestAnimationFrame(() => this._animateParticles());
    }
  }

  // --- Screen transitions ---
  showMenu() {
    this.mainMenu.style.display = 'flex';
    this.levelupOverlay.classList.remove('active');
    this.deathScreen.classList.remove('active');
    this._animateParticles();
  }

  hideMenu() {
    this.mainMenu.style.display = 'none';
  }

  // --- Level Up ---
  showLevelUp(options) {
    this.levelupCards.innerHTML = '';
    this.levelupOverlay.classList.add('active');

    options.forEach((opt, index) => {
      const card = document.createElement('div');
      card.className = 'levelup-card';

      let icon, badge, badgeClass, levelText;

      if (opt.type === 'evolution') {
        icon = '✦';
        badge = 'EVOLVE';
        badgeClass = 'badge-evolution';
        levelText = '';
      } else if (opt.type === 'new_weapon') {
        icon = WEAPON_ICONS[opt.key] || '?';
        badge = 'NEW';
        badgeClass = 'badge-new';
        levelText = '';
      } else if (opt.type === 'weapon_upgrade') {
        icon = WEAPON_ICONS[opt.key] || '?';
        badge = 'UPGRADE';
        badgeClass = 'badge-upgrade';
        levelText = `Lv.${opt.currentLevel} → Lv.${opt.currentLevel + 1}`;
      } else {
        icon = PASSIVE_ICONS[opt.key] || '?';
        badge = 'PASSIVE';
        badgeClass = 'badge-passive';
        levelText = opt.currentLevel > 0
          ? `Lv.${opt.currentLevel} → Lv.${opt.currentLevel + 1}`
          : 'Lv.1';
      }

      card.innerHTML = `
        <span class="card-badge ${badgeClass}">${badge}</span>
        <div class="card-icon">${icon}</div>
        <div class="card-name">${opt.name}</div>
        <div class="card-desc">${opt.description}</div>
        ${levelText ? `<div class="card-level">${levelText}</div>` : ''}
      `;

      card.addEventListener('click', () => {
        this.levelupOverlay.classList.remove('active');
        if (this.onLevelUpChoice) this.onLevelUpChoice(index, opt);
      });

      this.levelupCards.appendChild(card);
    });
  }

  hideLevelUp() {
    this.levelupOverlay.classList.remove('active');
  }

  // --- Death Screen ---
  showDeath(stats) {
    this.deathScreen.classList.add('active');
    this.deathKiller.textContent = stats.killer
      ? `Killed by: ${stats.killer}`
      : 'Killed by a mob';

    this.deathStats.innerHTML = `
      <div class="stat-item">
        <div class="stat-icon">⏱</div>
        <div class="stat-info">
          <span class="stat-label">Survival Time</span>
          <span class="stat-value">${stats.time}</span>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">⭐</div>
        <div class="stat-info">
          <span class="stat-label">Level Reached</span>
          <span class="stat-value">Lv.${stats.level}</span>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">💀</div>
        <div class="stat-info">
          <span class="stat-label">Kills</span>
          <span class="stat-value">${stats.kills}</span>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">✨</div>
        <div class="stat-info">
          <span class="stat-label">XP Earned</span>
          <span class="stat-value">${stats.xp.toLocaleString()}</span>
        </div>
      </div>
    `;
  }

  hideDeath() {
    this.deathScreen.classList.remove('active');
  }

  // --- Leaderboard ---
  async _fetchLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      const entries = data.top || [];

      if (entries.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#888;">No scores yet. Play to be the first!</p>';
        return;
      }

      list.innerHTML = entries.map((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `<div class="lb-entry">
          <span class="lb-rank">${medal}</span>
          <span class="lb-name">${e.name}</span>
          <span class="lb-score">Lv.${e.level} — ${e.score.toLocaleString()} XP</span>
        </div>`;
      }).join('');
    } catch {
      list.innerHTML = '<p style="text-align:center; color:#888;">Could not load leaderboard</p>';
    }
  }
}
