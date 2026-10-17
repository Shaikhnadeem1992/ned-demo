// Quality settings: Auto/High/Medium/Low + reduced motion. Auto adapts to measured FPS.
export const TIERS = {
  high:   { particles: 1400, trails: 10, pixelRatio: 2,   ticks: true },
  medium: { particles: 700,  trails: 6,  pixelRatio: 1.5, ticks: true },
  low:    { particles: 250,  trails: 3,  pixelRatio: 1,   ticks: false },
};
export class Quality {
  constructor() {
    this.mode = localStorage.getItem('ned.quality') || 'auto';
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const saved = localStorage.getItem('ned.reduceMotion');
    this.reduceMotion = saved === null ? mq.matches : saved === '1';
    this.autoTier = 'high'; this.fps = 60; this._frames = 0; this._t0 = performance.now(); this._low = 0;
    this.listeners = [];
  }
  get tier() { return this.mode === 'auto' ? this.autoTier : this.mode; }
  get settings() { return TIERS[this.tier]; }
  set(mode) { this.mode = mode; localStorage.setItem('ned.quality', mode); this.emit(); }
  setReduceMotion(v) { this.reduceMotion = v; localStorage.setItem('ned.reduceMotion', v ? '1' : '0'); this.emit(); }
  onChange(f) { this.listeners.push(f); }
  emit() { this.listeners.forEach(f => f(this)); }
  frame(now) {
    this._frames++;
    const dt = now - this._t0;
    if (dt >= 1000) {
      this.fps = this._frames * 1000 / dt; this._frames = 0; this._t0 = now;
      if (this.mode === 'auto') {
        this._low = this.fps < 45 ? this._low + 1 : 0;
        if (this._low >= 2 && this.autoTier !== 'low') {
          this.autoTier = this.autoTier === 'high' ? 'medium' : 'low'; this._low = 0; this.emit();
        }
      }
    }
  }
  resetTiming() { this._frames = 0; this._t0 = performance.now(); }
}
