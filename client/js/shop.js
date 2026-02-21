// Skin shop UI + preview
// Displays purchasable skins, handles equip, and integrates with Stripe

import { SKIN_SHAPES, SKIN_TRAILS, SKIN_EXPLOSIONS, SkinManager } from './skins.js';
import { SKIN_TIERS } from '/shared/constants.js';

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
          <button class="shop-close" id="shop-close">&times;</button>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab active" data-tab="shape">Shapes</button>
          <button class="shop-tab" data-tab="trail">Trails</button>
          <button class="shop-tab" data-tab="explosion">Effects</button>
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

    // Equip button
    this.container.querySelector('#shop-equip-btn').addEventListener('click', () => {
      if (this._selectedSkin) {
        const success = this.skinManager.equip(this._selectedType, this._selectedSkin.id);
        if (success) {
          this._renderGrid(this._currentTab);
        }
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
      default: catalog = SKIN_SHAPES;
    }

    for (const [id, skin] of Object.entries(catalog)) {
      const owned = this.skinManager.ownedSkins.has(id);
      const equipped = (type === 'shape' && this.skinManager.equippedShape === id) ||
                       (type === 'trail' && this.skinManager.equippedTrail === id) ||
                       (type === 'explosion' && this.skinManager.equippedExplosion === id);

      const card = document.createElement('div');
      card.className = 'shop-card' + (equipped ? ' equipped' : '') + (owned ? ' owned' : ' locked');
      card.innerHTML = `
        <div class="shop-card-preview">
          <canvas width="60" height="60" class="shop-card-canvas" data-skin="${id}" data-type="${type}"></canvas>
        </div>
        <div class="shop-card-name">${skin.name}</div>
        <div class="shop-card-tier" style="color: ${TIER_COLORS[skin.tier]}">${equipped ? 'EQUIPPED' : (owned ? 'OWNED' : TIER_LABELS[skin.tier])}</div>
      `;

      card.addEventListener('click', () => {
        this._selectedSkin = skin;
        this._selectedType = type;
        this._updatePreview(skin, type, owned, equipped);
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
      // Draw a trail icon
      ctx.fillStyle = '#00d4ff';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('~', 30, 38);
    } else if (type === 'explosion' && skin.draw) {
      skin.draw(ctx, 30, 30, 0.5, '#e74c3c');
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
    }
  }
}
