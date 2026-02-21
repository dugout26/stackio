// Mouse + touch input handling with virtual joystick for mobile
import { PLAYER } from '/shared/constants.js';

// Detect mobile/touch device
const isMobile = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = canvas.width / 2;
    this.mouseY = canvas.height / 2;
    this.angle = 0;
    this.moving = false;
    this.mobile = isMobile();

    // Virtual joystick state
    this.joystick = {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      touchId: null,
      radius: 60,     // Outer ring radius
      knobRadius: 24,  // Inner knob radius
    };

    if (this.mobile) {
      this._initTouchControls();
    } else {
      this._initMouseControls();
    }
  }

  _initMouseControls() {
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
  }

  _initTouchControls() {
    // Touch start: create joystick where finger lands (left half only)
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (!this.joystick.active && touch.clientX < this.canvas.width * 0.6) {
          this.joystick.active = true;
          this.joystick.touchId = touch.identifier;
          this.joystick.startX = touch.clientX;
          this.joystick.startY = touch.clientY;
          this.joystick.currentX = touch.clientX;
          this.joystick.currentY = touch.clientY;
        }
      }
    }, { passive: false });

    // Touch move: update joystick knob position
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (this.joystick.active && touch.identifier === this.joystick.touchId) {
          this.joystick.currentX = touch.clientX;
          this.joystick.currentY = touch.clientY;
        }
      }
    }, { passive: false });

    // Touch end: release joystick
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (this.joystick.active && touch.identifier === this.joystick.touchId) {
          this.joystick.active = false;
          this.joystick.touchId = null;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchcancel', (e) => {
      this.joystick.active = false;
      this.joystick.touchId = null;
    }, { passive: false });
  }

  update(playerScreenX, playerScreenY) {
    if (this.mobile) {
      this._updateJoystick();
    } else {
      this._updateMouse(playerScreenX, playerScreenY);
    }
  }

  _updateMouse(playerScreenX, playerScreenY) {
    const dx = this.mouseX - playerScreenX;
    const dy = this.mouseY - playerScreenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.moving = dist > PLAYER.DEAD_ZONE;
    if (this.moving) {
      this.angle = Math.atan2(dy, dx);
    }
  }

  _updateJoystick() {
    if (!this.joystick.active) {
      this.moving = false;
      return;
    }

    const dx = this.joystick.currentX - this.joystick.startX;
    const dy = this.joystick.currentY - this.joystick.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Dead zone of 10px
    if (dist < 10) {
      this.moving = false;
      return;
    }

    this.moving = true;
    this.angle = Math.atan2(dy, dx);
  }

  /** Draw the virtual joystick (called from renderer) */
  drawJoystick(ctx) {
    if (!this.mobile) return;
    if (!this.joystick.active) return;

    const { startX, startY, currentX, currentY, radius, knobRadius } = this.joystick;

    // Calculate clamped knob position
    let dx = currentX - startX;
    let dy = currentY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let knobX = currentX;
    let knobY = currentY;

    if (dist > radius) {
      knobX = startX + (dx / dist) * radius;
      knobY = startY + (dy / dist) * radius;
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner knob
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
