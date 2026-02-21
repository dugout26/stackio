// Player class - movement, HP, XP, level
import { PLAYER, MAP, LEVELING } from '/shared/constants.js';

export class Player {
  constructor(x, y, name = 'Player') {
    this.x = x;
    this.y = y;
    this.radius = PLAYER.RADIUS;
    this.speed = PLAYER.BASE_SPEED;
    this.hp = PLAYER.BASE_HP;
    this.maxHp = PLAYER.BASE_HP;
    this.xp = 0;
    this.level = 1;
    this.name = name;
    this.angle = 0;
    this.color = '#00d4ff';
  }

  update(input) {
    // Grow with level: +1.5px per level, cap at 50
    this.radius = Math.min(PLAYER.RADIUS + (this.level - 1) * 1.5, 50);

    if (input.moving) {
      this.angle = input.angle;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;

      // Clamp to map bounds
      this.x = Math.max(this.radius, Math.min(MAP.WIDTH - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(MAP.HEIGHT - this.radius, this.y));
    }
  }

  get xpToNextLevel() {
    return LEVELING.xpFormula(this.level);
  }

  draw(ctx, camera) {
    const { x: sx, y: sy } = camera.worldToScreen(this.x, this.y);

    // Player body (circle)
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Direction indicator
    const dirX = sx + Math.cos(this.angle) * (this.radius + 6);
    const dirY = sy + Math.sin(this.angle) * (this.radius + 6);
    ctx.beginPath();
    ctx.arc(dirX, dirY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Name + level
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.name} [Lv.${this.level}]`, sx, sy - this.radius - 20);

    // HP bar
    const barWidth = 40;
    const barHeight = 5;
    const barX = sx - barWidth / 2;
    const barY = sy - this.radius - 12;
    const hpRatio = this.hp / this.maxHp;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const hpColor = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f1c40f' : '#e74c3c';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
  }
}
