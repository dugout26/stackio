// Sound effects using Web Audio API
// All sounds are generated procedurally (no external files needed)
// Game works without sound - audio is purely enhancement

const AudioCtx = window.AudioContext || window.webkitAudioContext;

class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.3;
    this.initialized = false;
  }

  /** Initialize audio context (must be called after user interaction) */
  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioCtx();
      this.initialized = true;
    } catch (e) {
      this.enabled = false;
    }
  }

  /** Toggle sound on/off */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  // ========== PROCEDURAL SOUND GENERATORS ==========

  /** Short blip for XP pickup */
  playPickup() {
    if (!this._canPlay()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.1);
  }

  /** Level up fanfare */
  playLevelUp() {
    if (!this._canPlay()) return;
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = this.ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /** Hit/damage sound */
  playHit() {
    if (!this._canPlay()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(this.volume * 0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.12);
  }

  /** Death explosion */
  playDeath() {
    if (!this._canPlay()) return;
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(this.volume * 0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    noise.start(this.ctx.currentTime);
    noise.stop(this.ctx.currentTime + 0.4);
  }

  /** Weapon fire (generic) */
  playShoot() {
    if (!this._canPlay()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(this.volume * 0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.08);
  }

  /** Evolution unlock */
  playEvolution() {
    if (!this._canPlay()) return;
    const notes = [392, 494, 587, 784]; // G4, B4, D5, G5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.25, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** Kill confirmation — plays equipped kill sound */
  playKill(soundId = 'default') {
    if (!this._canPlay()) return;

    switch (soundId) {
      case 'ding':
        this._playKillDing();
        break;
      case 'explosion':
        this._playKillExplosion();
        break;
      case 'airhorn':
        this._playKillAirhorn();
        break;
      case 'dramatic':
        this._playKillDramatic();
        break;
      default:
        this._playKillDefault();
        break;
    }
  }

  /** Preview a kill sound in the shop */
  previewKillSound(soundId) {
    this.init(); // Ensure audio ctx exists
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const wasEnabled = this.enabled;
    this.enabled = true;
    this.playKill(soundId);
    this.enabled = wasEnabled;
  }

  // --- Kill sound variants ---

  _playKillDefault() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1100, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(this.volume * 0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.15);
  }

  _playKillDing() {
    // Bright bell-like ding
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
    gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.4);
    // Harmonic overtone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 2800;
    gain2.gain.setValueAtTime(this.volume * 0.08, this.ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc2.start(this.ctx.currentTime);
    osc2.stop(this.ctx.currentTime + 0.25);
  }

  _playKillExplosion() {
    // Heavy boom with noise
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.12));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    const gain = this.ctx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(this.volume * 0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    noise.start(this.ctx.currentTime);
    noise.stop(this.ctx.currentTime + 0.5);
    // Sub bass impact
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, this.ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.3);
    subGain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
    sub.start(this.ctx.currentTime);
    sub.stop(this.ctx.currentTime + 0.35);
  }

  _playKillAirhorn() {
    // Multiple stacked frequencies
    const freqs = [350, 440, 525];
    freqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(this.volume * 0.08, this.ctx.currentTime);
      gain.gain.setValueAtTime(this.volume * 0.12, this.ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.5);
    });
  }

  _playKillDramatic() {
    // Descending ominous tones
    const notes = [784, 622, 466, 370]; // G5, Eb5, Bb4, F#4
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = this.ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  _canPlay() {
    return this.enabled && this.initialized && this.ctx && this.ctx.state === 'running';
  }
}

// Singleton export
export const audio = new AudioManager();
