// Skin system - shapes, trails, death effects
// All skins are purely cosmetic - NO gameplay advantage

// ===== SKIN CATALOG =====

export const SKIN_SHAPES = {
  // Free skins
  default: {
    id: 'default',
    name: 'Classic',
    tier: 'free',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
  },
  hexagon: {
    id: 'hexagon',
    name: 'Hexagon',
    tier: 'free',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    },
  },
  // Common ($0.99)
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    tier: 'common',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4 + angle * 0.3);
      ctx.beginPath();
      const s = radius;
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.7, 0);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },
  },
  star: {
    id: 'star',
    name: 'Star',
    tier: 'common',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * 0.2);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerA = (Math.PI * 2 / 5) * i - Math.PI / 2;
        const innerA = outerA + Math.PI / 5;
        const ox = Math.cos(outerA) * radius;
        const oy = Math.sin(outerA) * radius;
        const ix = Math.cos(innerA) * radius * 0.45;
        const iy = Math.sin(innerA) * radius * 0.45;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    },
  },
  triangle: {
    id: 'triangle',
    name: 'Tri-Force',
    tier: 'common',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * 0.15);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },
  },
  // Rare ($2.99)
  gear: {
    id: 'gear',
    name: 'Gear',
    tier: 'rare',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * 0.5);
      const teeth = 8;
      const innerR = radius * 0.7;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a1 = (Math.PI * 2 / teeth) * i;
        const a2 = a1 + Math.PI / teeth * 0.6;
        const a3 = a1 + Math.PI / teeth;
        const a4 = a1 + Math.PI / teeth * 1.4;
        ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
        ctx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
        ctx.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
        ctx.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();
      ctx.restore();
    },
  },
  eye: {
    id: 'eye',
    name: 'All-Seeing Eye',
    tier: 'rare',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      // Outer eye shape
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Iris
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a2e';
      ctx.fill();
      // Pupil (follows angle)
      const pupilDist = radius * 0.1;
      ctx.beginPath();
      ctx.arc(
        Math.cos(angle) * pupilDist,
        Math.sin(angle) * pupilDist,
        radius * 0.15, 0, Math.PI * 2
      );
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    },
  },
  // Rare ($2.99)
  tank: {
    id: 'tank',
    name: 'Tank',
    tier: 'rare',
    draw: (ctx, x, y, radius, color, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      // Tank body (rounded rectangle)
      const bw = radius * 1.6;
      const bh = radius * 1.2;
      ctx.beginPath();
      const cr = 4; // corner radius
      ctx.moveTo(-bw / 2 + cr, -bh / 2);
      ctx.lineTo(bw / 2 - cr, -bh / 2);
      ctx.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + cr);
      ctx.lineTo(bw / 2, bh / 2 - cr);
      ctx.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - cr, bh / 2);
      ctx.lineTo(-bw / 2 + cr, bh / 2);
      ctx.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - cr);
      ctx.lineTo(-bw / 2, -bh / 2 + cr);
      ctx.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + cr, -bh / 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Tracks (top and bottom)
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-bw / 2 - 2, -bh / 2 - 3, bw + 4, 5);
      ctx.fillRect(-bw / 2 - 2, bh / 2 - 2, bw + 4, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2 - 2, -bh / 2 - 3, bw + 4, 5);
      ctx.strokeRect(-bw / 2 - 2, bh / 2 - 2, bw + 4, 5);
      // Turret base (circle)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Cannon barrel
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(radius * 0.2, -3, radius * 1.0, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(radius * 0.2, -3, radius * 1.0, 6);
      ctx.restore();
    },
  },
  // Legendary ($4.99)
  crown: {
    id: 'crown',
    name: 'Crown',
    tier: 'legendary',
    draw: (ctx, x, y, radius, color, angle) => {
      // Base circle with glow
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Crown on top
      ctx.save();
      ctx.translate(x, y - radius - 4);
      const cw = radius * 1.2;
      const ch = radius * 0.5;
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(-cw / 2, ch / 2);
      ctx.lineTo(-cw / 2, -ch / 4);
      ctx.lineTo(-cw / 4, ch / 4);
      ctx.lineTo(0, -ch / 2);
      ctx.lineTo(cw / 4, ch / 4);
      ctx.lineTo(cw / 2, -ch / 4);
      ctx.lineTo(cw / 2, ch / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },
  },
  void: {
    id: 'void',
    name: 'Void',
    tier: 'legendary',
    draw: (ctx, x, y, radius, color, angle) => {
      // Outer pulsing ring
      const pulse = Math.sin(Date.now() * 0.003) * 0.15 + 0.85;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.2 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(155, 89, 182, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner dark circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, '#0a0a2e');
      grad.addColorStop(0.7, color);
      grad.addColorStop(1, 'rgba(155, 89, 182, 0.8)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#9b59b6';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Swirling particles
      for (let i = 0; i < 4; i++) {
        const a = (Date.now() * 0.002) + (Math.PI * 2 / 4) * i;
        const px = x + Math.cos(a) * radius * 0.6;
        const py = y + Math.sin(a) * radius * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(155, 89, 182, 0.8)';
        ctx.fill();
      }
    },
  },
};

// ===== TRAIL CATALOG =====

export const SKIN_TRAILS = {
  none: {
    id: 'none',
    name: 'None',
    tier: 'free',
    particles: [],
    update: () => {},
    draw: () => {},
  },
  dots: {
    id: 'dots',
    name: 'Dot Trail',
    tier: 'free',
    particles: [],
    maxParticles: 20,
    update(player, dt) {
      if (!player.moving) return;
      this.particles.push({
        x: player.x, y: player.y,
        life: 0.5, maxLife: 0.5,
        size: 3,
      });
      if (this.particles.length > this.maxParticles) this.particles.shift();
      for (const p of this.particles) p.life -= dt;
      this.particles = this.particles.filter(p => p.life > 0);
    },
    draw(ctx, camera) {
      for (const p of this.particles) {
        const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.3})`;
        ctx.fill();
      }
    },
  },
  sparkle: {
    id: 'sparkle',
    name: 'Sparkle',
    tier: 'common',
    particles: [],
    maxParticles: 30,
    update(player, dt) {
      if (!player.moving) return;
      this.particles.push({
        x: player.x + (Math.random() - 0.5) * 20,
        y: player.y + (Math.random() - 0.5) * 20,
        life: 0.6, maxLife: 0.6,
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#f1c40f' : '#00d4ff',
      });
      if (this.particles.length > this.maxParticles) this.particles.shift();
      for (const p of this.particles) p.life -= dt;
      this.particles = this.particles.filter(p => p.life > 0);
    },
    draw(ctx, camera) {
      for (const p of this.particles) {
        const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.life * 5);
        const s = p.size * alpha;
        ctx.fillStyle = p.color.replace(')', `,${alpha * 0.7})`).replace('rgb', 'rgba');
        // Draw a 4-point star
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.3, -s * 0.3);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.3, s * 0.3);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fillStyle = `${p.color}`;
        ctx.globalAlpha = alpha * 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    },
  },
  flame: {
    id: 'flame',
    name: 'Flame',
    tier: 'rare',
    particles: [],
    maxParticles: 40,
    update(player, dt) {
      if (!player.moving) return;
      const angle = player.angle + Math.PI; // Behind player
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: player.x + Math.cos(angle) * 10 + (Math.random() - 0.5) * 8,
          y: player.y + Math.sin(angle) * 10 + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * (1 + Math.random()),
          vy: Math.sin(angle) * (1 + Math.random()) - 0.5,
          life: 0.4 + Math.random() * 0.3,
          maxLife: 0.7,
          size: 4 + Math.random() * 4,
        });
      }
      if (this.particles.length > this.maxParticles) {
        this.particles.splice(0, this.particles.length - this.maxParticles);
      }
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
    },
    draw(ctx, camera) {
      for (const p of this.particles) {
        const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
        const t = p.life / p.maxLife;
        const size = p.size * t;
        // Color transition: white -> yellow -> orange -> red
        let r, g, b;
        if (t > 0.7) { r = 255; g = 255; b = 200; }
        else if (t > 0.4) { r = 255; g = 180; b = 40; }
        else { r = 230; g = 60; b = 20; }
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${t * 0.6})`;
        ctx.fill();
      }
    },
  },
  neon: {
    id: 'neon',
    name: 'Neon Stream',
    tier: 'legendary',
    particles: [],
    maxParticles: 50,
    hue: 0,
    update(player, dt) {
      this.hue = (this.hue + dt * 120) % 360;
      if (!player.moving) return;
      this.particles.push({
        x: player.x,
        y: player.y,
        life: 0.8,
        maxLife: 0.8,
        size: 5,
        hue: this.hue,
      });
      if (this.particles.length > this.maxParticles) this.particles.shift();
      for (const p of this.particles) p.life -= dt;
      this.particles = this.particles.filter(p => p.life > 0);
    },
    draw(ctx, camera) {
      if (this.particles.length < 2) return;
      // Draw connected line
      ctx.beginPath();
      let first = true;
      for (const p of this.particles) {
        const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
        if (first) { ctx.moveTo(sx, sy); first = false; }
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = `hsla(${this.hue}, 100%, 60%, 0.4)`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = `hsla(${this.hue}, 100%, 80%, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Glow dots at each point
      for (const p of this.particles) {
        const { x: sx, y: sy } = camera.worldToScreen(p.x, p.y);
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * alpha * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.5})`;
        ctx.fill();
      }
    },
  },
};

// ===== DEATH EFFECT CATALOG =====

export const SKIN_EXPLOSIONS = {
  default: {
    id: 'default',
    name: 'Standard',
    tier: 'free',
    draw: (ctx, x, y, progress, color) => {
      // Simple expanding ring
      const radius = 30 + progress * 60;
      const alpha = 1 - progress;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(231, 76, 60, ${alpha * 0.6})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    },
  },
  burst: {
    id: 'burst',
    name: 'Particle Burst',
    tier: 'common',
    draw: (ctx, x, y, progress, color) => {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        const dist = progress * 80;
        const px = x + Math.cos(angle) * dist;
        const py = y + Math.sin(angle) * dist;
        const alpha = 1 - progress;
        const size = 4 * (1 - progress);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`;
        ctx.fill();
      }
    },
  },
  nova: {
    id: 'nova',
    name: 'Supernova',
    tier: 'legendary',
    draw: (ctx, x, y, progress, color) => {
      // Multiple expanding rings
      for (let ring = 0; ring < 3; ring++) {
        const ringProgress = Math.max(0, progress - ring * 0.15);
        if (ringProgress <= 0) continue;
        const radius = ringProgress * 100;
        const alpha = (1 - ringProgress) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const hue = (ring * 40 + progress * 200) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.lineWidth = 4 - ring;
        ctx.stroke();
      }
      // Central flash
      if (progress < 0.3) {
        const flashAlpha = (1 - progress / 0.3) * 0.8;
        const flashRadius = 20 * (1 - progress / 0.3);
        ctx.beginPath();
        ctx.arc(x, y, flashRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fill();
      }
    },
  },
};

// ===== WEAPON SKIN CATALOG =====

export const SKIN_WEAPONS = {
  default: {
    id: 'default_weapon',
    name: 'Standard',
    tier: 'free',
    colors: {
      orbit: 'rgba(255,255,255,0.9)',
      orbitStroke: '#00d4ff',
      bullet: '#f1c40f',
      laser: 'rgba(231, 76, 60, __ALPHA__)',
      laserInner: 'rgba(255, 200, 200, __ALPHA__)',
      shockwave: 'rgba(0, 212, 255, __ALPHA__)',
      mine: 'rgba(231, 76, 60, __ALPHA__)',
    },
  },
  gold_weapon: {
    id: 'gold_weapon',
    name: 'Gold',
    tier: 'common',
    colors: {
      orbit: 'rgba(241,196,15,0.9)',
      orbitStroke: '#f39c12',
      bullet: '#f1c40f',
      laser: 'rgba(241, 196, 15, __ALPHA__)',
      laserInner: 'rgba(255, 240, 150, __ALPHA__)',
      shockwave: 'rgba(241, 196, 15, __ALPHA__)',
      mine: 'rgba(241, 196, 15, __ALPHA__)',
    },
  },
  neon_weapon: {
    id: 'neon_weapon',
    name: 'Neon Blue',
    tier: 'common',
    colors: {
      orbit: 'rgba(0,212,255,0.9)',
      orbitStroke: '#00ffff',
      bullet: '#00ffff',
      laser: 'rgba(0, 212, 255, __ALPHA__)',
      laserInner: 'rgba(200, 255, 255, __ALPHA__)',
      shockwave: 'rgba(0, 255, 255, __ALPHA__)',
      mine: 'rgba(0, 212, 255, __ALPHA__)',
    },
  },
  fire_weapon: {
    id: 'fire_weapon',
    name: 'Inferno',
    tier: 'rare',
    colors: {
      orbit: 'rgba(255,100,20,0.9)',
      orbitStroke: '#e74c3c',
      bullet: '#ff6b35',
      laser: 'rgba(255, 100, 20, __ALPHA__)',
      laserInner: 'rgba(255, 200, 50, __ALPHA__)',
      shockwave: 'rgba(255, 100, 20, __ALPHA__)',
      mine: 'rgba(255, 80, 20, __ALPHA__)',
    },
  },
  plasma_weapon: {
    id: 'plasma_weapon',
    name: 'Plasma',
    tier: 'legendary',
    dynamic: true, // Uses animated hue
    getColors: () => {
      const hue = (Date.now() * 0.1) % 360;
      return {
        orbit: `hsla(${hue}, 100%, 70%, 0.9)`,
        orbitStroke: `hsla(${hue}, 100%, 50%, 1)`,
        bullet: `hsl(${hue}, 100%, 60%)`,
        laser: `hsla(${hue}, 100%, 60%, __ALPHA__)`,
        laserInner: `hsla(${hue}, 100%, 85%, __ALPHA__)`,
        shockwave: `hsla(${hue}, 100%, 60%, __ALPHA__)`,
        mine: `hsla(${hue}, 100%, 50%, __ALPHA__)`,
      };
    },
  },
};

// ===== NAMETAG SKIN CATALOG =====

export const SKIN_NAMETAGS = {
  default_name: {
    id: 'default_name',
    name: 'Standard',
    tier: 'free',
    getStyle: () => ({
      fillStyle: '#ffffff',
      shadowColor: null,
      shadowBlur: 0,
    }),
  },
  gold_name: {
    id: 'gold_name',
    name: 'Gold',
    tier: 'common',
    getStyle: () => ({
      fillStyle: '#f1c40f',
      shadowColor: '#f39c12',
      shadowBlur: 4,
    }),
  },
  red_name: {
    id: 'red_name',
    name: 'Crimson',
    tier: 'common',
    getStyle: () => ({
      fillStyle: '#e74c3c',
      shadowColor: '#c0392b',
      shadowBlur: 4,
    }),
  },
  rainbow_name: {
    id: 'rainbow_name',
    name: 'Rainbow',
    tier: 'rare',
    getStyle: () => {
      const hue = (Date.now() * 0.1) % 360;
      return {
        fillStyle: `hsl(${hue}, 100%, 65%)`,
        shadowColor: `hsl(${hue}, 100%, 50%)`,
        shadowBlur: 6,
      };
    },
  },
  glow_name: {
    id: 'glow_name',
    name: 'Neon Glow',
    tier: 'rare',
    getStyle: () => ({
      fillStyle: '#00ffff',
      shadowColor: '#00d4ff',
      shadowBlur: 10,
    }),
  },
  fire_name: {
    id: 'fire_name',
    name: 'Inferno',
    tier: 'legendary',
    getStyle: () => {
      const flicker = Math.sin(Date.now() * 0.008) * 0.15 + 0.85;
      return {
        fillStyle: `rgba(255, ${Math.floor(140 * flicker)}, 20, 1)`,
        shadowColor: '#e74c3c',
        shadowBlur: 12 * flicker,
      };
    },
  },
};

// ===== KILL SOUND CATALOG =====

export const SKIN_KILLSOUNDS = {
  default_killsound: {
    id: 'default_killsound',
    name: 'Standard',
    tier: 'free',
    soundId: 'default',
  },
  ding_killsound: {
    id: 'ding_killsound',
    name: 'Ding!',
    tier: 'common',
    soundId: 'ding',
  },
  explosion_killsound: {
    id: 'explosion_killsound',
    name: 'Explosion',
    tier: 'common',
    soundId: 'explosion',
  },
  airhorn_killsound: {
    id: 'airhorn_killsound',
    name: 'Air Horn',
    tier: 'rare',
    soundId: 'airhorn',
  },
  dramatic_killsound: {
    id: 'dramatic_killsound',
    name: 'Dramatic',
    tier: 'rare',
    soundId: 'dramatic',
  },
};

// ===== PLAYER SKIN STATE =====

/**
 * SkinManager handles the currently equipped skins for a player
 * and provides render methods.
 */
export class SkinManager {
  constructor() {
    // Death effect state
    this.deathEffects = []; // { x, y, progress, color, explosionId }

    // Load from localStorage or use defaults
    const saved = this._loadFromStorage();
    this.equippedShape = saved.equippedShape || 'default';
    this.equippedTrail = saved.equippedTrail || 'none';
    this.equippedExplosion = saved.equippedExplosion || 'default';
    this.equippedWeapon = saved.equippedWeapon || 'default_weapon';
    this.equippedNametag = saved.equippedNametag || 'default_name';
    this.equippedKillsound = saved.equippedKillsound || 'default_killsound';
    this.ownedSkins = new Set(saved.ownedSkins || [
      'default', 'hexagon', 'none', 'dots',
      'default_weapon', 'default_name', 'default_killsound',
    ]);
  }

  _loadFromStorage() {
    try {
      const data = localStorage.getItem('stackio_skins');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  _saveToStorage() {
    try {
      localStorage.setItem('stackio_skins', JSON.stringify({
        equippedShape: this.equippedShape,
        equippedTrail: this.equippedTrail,
        equippedExplosion: this.equippedExplosion,
        equippedWeapon: this.equippedWeapon,
        equippedNametag: this.equippedNametag,
        equippedKillsound: this.equippedKillsound,
        ownedSkins: [...this.ownedSkins],
      }));
    } catch (e) { /* ignore storage errors */ }
  }

  /** Equip a skin if owned */
  equip(type, id) {
    if (!this.ownedSkins.has(id)) return false;
    switch (type) {
      case 'shape': this.equippedShape = id; break;
      case 'trail': this.equippedTrail = id; break;
      case 'explosion': this.equippedExplosion = id; break;
      case 'weapon': this.equippedWeapon = id; break;
      case 'nametag': this.equippedNametag = id; break;
      case 'killsound': this.equippedKillsound = id; break;
    }
    this._saveToStorage();
    return true;
  }

  /** Add a skin to owned set */
  unlock(id) {
    this.ownedSkins.add(id);
    this._saveToStorage();
  }

  /** Merge skins from server (called after login) */
  syncFromServer(skinIds) {
    if (!Array.isArray(skinIds)) return;
    for (const id of skinIds) {
      this.ownedSkins.add(id);
    }
    this._saveToStorage();
  }

  /** Get array of owned skin IDs */
  getOwnedSkinIds() {
    return [...this.ownedSkins];
  }

  /** Draw the player body using equipped shape skin */
  drawPlayer(ctx, x, y, radius, color, angle) {
    const shape = SKIN_SHAPES[this.equippedShape] || SKIN_SHAPES.default;
    shape.draw(ctx, x, y, radius, color, angle);
  }

  /** Update trail particles */
  updateTrail(player, dt) {
    const trail = SKIN_TRAILS[this.equippedTrail];
    if (trail && trail.update) trail.update(player, dt);
  }

  /** Draw trail behind player */
  drawTrail(ctx, camera) {
    const trail = SKIN_TRAILS[this.equippedTrail];
    if (trail && trail.draw) trail.draw(ctx, camera);
  }

  /** Trigger death effect */
  triggerDeath(x, y, color) {
    this.deathEffects.push({
      x, y, progress: 0, color,
      explosionId: this.equippedExplosion,
    });
  }

  /** Update and draw death effects */
  updateDeathEffects(dt, ctx, camera) {
    for (const fx of this.deathEffects) {
      fx.progress += dt * 1.5;
      if (fx.progress > 1) continue;
      const { x: sx, y: sy } = camera.worldToScreen(fx.x, fx.y);
      const explosion = SKIN_EXPLOSIONS[fx.explosionId] || SKIN_EXPLOSIONS.default;
      explosion.draw(ctx, sx, sy, fx.progress, fx.color);
    }
    this.deathEffects = this.deathEffects.filter(fx => fx.progress < 1);
  }

  /** Get weapon skin colors for rendering */
  getWeaponColors() {
    const skin = SKIN_WEAPONS[this.equippedWeapon] || SKIN_WEAPONS.default;
    if (skin.dynamic && skin.getColors) {
      return skin.getColors();
    }
    return skin.colors;
  }

  /** Get nametag style for rendering */
  getNametag() {
    const tag = SKIN_NAMETAGS[this.equippedNametag] || SKIN_NAMETAGS.default_name;
    return tag.getStyle();
  }

  /** Get kill sound ID */
  getKillSoundId() {
    const ks = SKIN_KILLSOUNDS[this.equippedKillsound] || SKIN_KILLSOUNDS.default_killsound;
    return ks.soundId;
  }

  /** Get equipped skin IDs for network (to show to other players) */
  getEquipped() {
    return {
      shape: this.equippedShape,
      trail: this.equippedTrail,
      explosion: this.equippedExplosion,
      weapon: this.equippedWeapon,
      nametag: this.equippedNametag,
      killsound: this.equippedKillsound,
    };
  }

  /** Get all skin data for shop display */
  static getAllSkins() {
    const all = [];
    for (const [id, skin] of Object.entries(SKIN_SHAPES)) {
      all.push({ ...skin, type: 'shape' });
    }
    for (const [id, skin] of Object.entries(SKIN_TRAILS)) {
      all.push({ id: skin.id, name: skin.name, tier: skin.tier, type: 'trail' });
    }
    for (const [id, skin] of Object.entries(SKIN_EXPLOSIONS)) {
      all.push({ ...skin, type: 'explosion' });
    }
    for (const [id, skin] of Object.entries(SKIN_WEAPONS)) {
      all.push({ id: skin.id, name: skin.name, tier: skin.tier, type: 'weapon' });
    }
    for (const [id, skin] of Object.entries(SKIN_NAMETAGS)) {
      all.push({ id: skin.id, name: skin.name, tier: skin.tier, type: 'nametag' });
    }
    for (const [id, skin] of Object.entries(SKIN_KILLSOUNDS)) {
      all.push({ id: skin.id, name: skin.name, tier: skin.tier, type: 'killsound' });
    }
    return all;
  }
}
