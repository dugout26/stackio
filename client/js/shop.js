// Skin shop UI + preview
// Displays purchasable skins, handles equip, and integrates with Stripe

import { SKIN_SHAPES, SKIN_TRAILS, SKIN_EXPLOSIONS, SKIN_WEAPONS, SKIN_NAMETAGS, SKIN_KILLSOUNDS, SkinManager } from './skins.js';
import { SKIN_TIERS } from '/shared/constants.js';
import { audio } from './audio.js';

const TIER_COLORS = {
  free: '#2ecc71',
  common: '#3498db',
  rare: '#9b59b6',
  legendary: '#f1c40f',
  bundle: '#e74c3c',
};

const TIER_LABELS = {
  free: 'FREE',
  common: '$0.99',
  rare: '$2.99',
  legendary: '$4.99',
  bundle: '$9.99',
};

export class Shop {
  constructor(skinManager) {
    this.skinManager = skinManager;
    this.visible = false;
    this.container = null;
    this.onLoginRequired = null;
    this.onLogout = null;
    this._buildUI();
  }

  _buildUI() {
    this.container = document.createElement('div');
    this.container.id = 'shop-overlay';
    this.container.className = 'shop-overlay';
    this.container.innerHTML = `
      <div class="shop-panel">
        <div class="shop-header">
          <h2 class="shop-title">SKIN SHOP</h2>
          <div class="shop-account" id="shop-account"></div>
          <button class="shop-close" id="shop-close">&times;</button>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab active" data-tab="shape">Shapes</button>
          <button class="shop-tab" data-tab="trail">Trails</button>
          <button class="shop-tab" data-tab="explosion">Effects</button>
          <button class="shop-tab" data-tab="weapon">Weapons</button>
          <button class="shop-tab" data-tab="nametag">Names</button>
          <button class="shop-tab" data-tab="killsound">Kill Sound</button>
        </div>
        <div class="shop-grid" id="shop-grid"></div>
        <div class="shop-preview" id="shop-preview">
          <canvas id="shop-preview-canvas" width="120" height="120"></canvas>
          <div class="shop-preview-name" id="preview-name"></div>
          <div class="shop-preview-tier" id="preview-tier"></div>
          <button class="shop-equip-btn" id="shop-equip-btn">EQUIP</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    // Close button
    this.container.querySelector('#shop-close').addEventListener('click', () => this.hide());

    // Tab switching
    const tabs = this.container.querySelectorAll('.shop-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderGrid(tab.dataset.tab);
      });
    });

    // Equip / Buy button
    this.container.querySelector('#shop-equip-btn').addEventListener('click', () => {
      if (!this._selectedSkin) return;

      const owned = this.skinManager.ownedSkins.has(this._selectedSkin.id);
      if (owned) {
        // Equip owned skin
        const success = this.skinManager.equip(this._selectedType, this._selectedSkin.id);
        if (success) {
          this._renderGrid(this._currentTab);
        }
      } else if (this._selectedSkin.tier !== 'free') {
        // Purchase via Stripe Checkout
        this._purchaseSkin(this._selectedSkin);
      }
    });

    this._currentTab = 'shape';
    this._selectedSkin = null;
    this._selectedType = null;
    this._previewCanvas = this.container.querySelector('#shop-preview-canvas');
    this._previewCtx = this._previewCanvas.getContext('2d');
  }

  show() {
    this.visible = true;
    this.container.classList.add('active');
    this._renderGrid('shape');
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('active');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  _renderGrid(type) {
    this._currentTab = type;
    const grid = this.container.querySelector('#shop-grid');
    grid.innerHTML = '';

    let catalog;
    switch (type) {
      case 'shape': catalog = SKIN_SHAPES; break;
      case 'trail': catalog = SKIN_TRAILS; break;
      case 'explosion': catalog = SKIN_EXPLOSIONS; break;
      case 'weapon': catalog = SKIN_WEAPONS; break;
      case 'nametag': catalog = SKIN_NAMETAGS; break;
      case 'killsound': catalog = SKIN_KILLSOUNDS; break;
      default: catalog = SKIN_SHAPES;
    }

    for (const [id, skin] of Object.entries(catalog)) {
      const skinId = skin.id || id;
      const owned = this.skinManager.ownedSkins.has(skinId);
      const equipped = (type === 'shape' && this.skinManager.equippedShape === skinId) ||
                       (type === 'trail' && this.skinManager.equippedTrail === skinId) ||
                       (type === 'explosion' && this.skinManager.equippedExplosion === skinId) ||
                       (type === 'weapon' && this.skinManager.equippedWeapon === skinId) ||
                       (type === 'nametag' && this.skinManager.equippedNametag === skinId) ||
                       (type === 'killsound' && this.skinManager.equippedKillsound === skinId);

      const card = document.createElement('div');
      card.className = 'shop-card' + (equipped ? ' equipped' : '') + (owned ? ' owned' : ' locked');
      card.innerHTML = `
        <div class="shop-card-preview">
          <canvas width="60" height="60" class="shop-card-canvas" data-skin="${skinId}" data-type="${type}"></canvas>
        </div>
        <div class="shop-card-name">${skin.name}</div>
        <div class="shop-card-tier" style="color: ${TIER_COLORS[skin.tier]}">${equipped ? 'EQUIPPED' : (owned ? 'OWNED' : TIER_LABELS[skin.tier])}</div>
      `;

      card.addEventListener('click', () => {
        this._selectedSkin = { ...skin, id: skinId };
        this._selectedType = type;
        this._updatePreview({ ...skin, id: skinId }, type, owned, equipped);
        // Preview kill sound on click
        if (type === 'killsound' && skin.soundId) {
          audio.previewKillSound(skin.soundId);
        }
      });

      grid.appendChild(card);

      // Draw preview on mini canvas
      const canvas = card.querySelector('.shop-card-canvas');
      this._drawCardPreview(canvas.getContext('2d'), skin, type);
    }
  }

  _drawCardPreview(ctx, skin, type) {
    ctx.clearRect(0, 0, 60, 60);
    if (type === 'shape' && skin.draw) {
      skin.draw(ctx, 30, 30, 18, '#00d4ff', 0);
    } else if (type === 'trail') {
      ctx.fillStyle = '#00d4ff';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('~', 30, 38);
    } else if (type === 'explosion' && skin.draw) {
      skin.draw(ctx, 30, 30, 0.5, '#e74c3c');
    } else if (type === 'weapon') {
      // Draw colored bullet/orb preview
      const colors = skin.dynamic && skin.getColors ? skin.getColors() : skin.colors;
      if (colors) {
        ctx.beginPath();
        ctx.arc(30, 30, 14, 0, Math.PI * 2);
        ctx.fillStyle = colors.bullet || colors.orbit || '#fff';
        ctx.fill();
        ctx.strokeStyle = colors.orbitStroke || '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (type === 'nametag') {
      // Draw styled name preview
      const style = skin.getStyle ? skin.getStyle() : { fillStyle: '#fff' };
      ctx.save();
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = style.fillStyle;
      if (style.shadowColor) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur || 0;
      }
      ctx.fillText('Player', 30, 35);
      ctx.restore();
    } else if (type === 'killsound') {
      // Speaker icon
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔊', 30, 38);
    }
  }

  _updatePreview(skin, type, owned, equipped) {
    const nameEl = this.container.querySelector('#preview-name');
    const tierEl = this.container.querySelector('#preview-tier');
    const btnEl = this.container.querySelector('#shop-equip-btn');

    nameEl.textContent = skin.name;
    tierEl.textContent = skin.tier.toUpperCase();
    tierEl.style.color = TIER_COLORS[skin.tier];

    if (equipped) {
      btnEl.textContent = 'EQUIPPED';
      btnEl.disabled = true;
    } else if (owned) {
      btnEl.textContent = 'EQUIP';
      btnEl.disabled = false;
    } else if (skin.tier === 'free') {
      btnEl.textContent = 'EQUIP';
      btnEl.disabled = false;
      this.skinManager.unlock(skin.id);
    } else {
      btnEl.textContent = `BUY ${TIER_LABELS[skin.tier]}`;
      btnEl.disabled = false;
    }

    // Animate preview
    this._drawPreview(skin, type);
  }

  _drawPreview(skin, type) {
    const ctx = this._previewCtx;
    ctx.clearRect(0, 0, 120, 120);
    if (type === 'shape' && skin.draw) {
      skin.draw(ctx, 60, 60, 35, '#00d4ff', 0);
    } else if (type === 'explosion' && skin.draw) {
      skin.draw(ctx, 60, 60, 0.4, '#e74c3c');
    } else if (type === 'weapon') {
      const colors = skin.dynamic && skin.getColors ? skin.getColors() : skin.colors;
      if (colors) {
        // Orbit preview
        ctx.beginPath();
        ctx.arc(60, 60, 22, 0, Math.PI * 2);
        ctx.fillStyle = colors.orbit || '#fff';
        ctx.fill();
        ctx.strokeStyle = colors.orbitStroke || '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Bullet preview
        ctx.beginPath();
        ctx.arc(60, 25, 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.bullet || '#fff';
        ctx.fill();
      }
    } else if (type === 'nametag') {
      const style = skin.getStyle ? skin.getStyle() : { fillStyle: '#fff' };
      ctx.save();
      ctx.font = 'bold 18px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = style.fillStyle;
      if (style.shadowColor) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur || 0;
      }
      ctx.fillText('Player', 60, 55);
      ctx.fillText('[Lv.10]', 60, 78);
      ctx.restore();
    } else if (type === 'killsound') {
      ctx.font = '40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔊', 60, 70);
    }
  }

  /** Purchase a skin via server-side Stripe Checkout */
  async _purchaseSkin(skin) {
    const btn = this.container.querySelector('#shop-equip-btn');
    btn.textContent = 'LOADING...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skinId: skin.id, tier: skin.tier }),
      });

      const data = await res.json();

      if (res.status === 401) {
        // Not logged in — prompt login
        btn.textContent = 'LOGIN TO BUY';
        btn.disabled = false;
        if (this.onLoginRequired) this.onLoginRequired();
        return;
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else if (data.unlocked) {
        // Free tier - directly unlocked
        this.skinManager.unlock(skin.id);
        this.skinManager.equip(this._selectedType, skin.id);
        this._renderGrid(this._currentTab);
      } else {
        btn.textContent = 'ERROR';
        setTimeout(() => this._updatePreview(skin, this._selectedType, false, false), 2000);
      }
    } catch (err) {
      console.error('[Shop] Purchase error:', err);
      btn.textContent = 'ERROR';
      setTimeout(() => this._updatePreview(skin, this._selectedType, false, false), 2000);
    }
  }

  /** Update account status display in shop header */
  updateAccountStatus(user) {
    const el = this.container.querySelector('#shop-account');
    if (!el) return;
    if (user) {
      el.innerHTML = `<span class="shop-account-email">${user.email}</span> <button class="shop-logout-btn" id="shop-logout">Logout</button>`;
      el.querySelector('#shop-logout').addEventListener('click', () => {
        if (this.onLogout) this.onLogout();
      });
    } else {
      el.innerHTML = `<button class="shop-login-btn" id="shop-login-btn">Login / Register</button>`;
      el.querySelector('#shop-login-btn').addEventListener('click', () => {
        if (this.onLoginRequired) this.onLoginRequired();
      });
    }
  }
}
