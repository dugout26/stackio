// Camera follow + viewport culling
import { MAP } from '/shared/constants.js';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
  }

  follow(target) {
    this.x = target.x - this.canvas.width / 2;
    this.y = target.y - this.canvas.height / 2;
  }

  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  isVisible(wx, wy, margin = 100) {
    const sx = wx - this.x;
    const sy = wy - this.y;
    return sx > -margin && sx < this.canvas.width + margin &&
           sy > -margin && sy < this.canvas.height + margin;
  }

  get viewportLeft() { return this.x; }
  get viewportTop() { return this.y; }
  get viewportRight() { return this.x + this.canvas.width; }
  get viewportBottom() { return this.y + this.canvas.height; }
}
