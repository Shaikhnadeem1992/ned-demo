// State controller: owns the current state, allowed transitions, and per-state visual targets.
export const STATES = {
  idle:      { label: 'Ready',            speed: 0.35, tight: 1.00, bright: 0.85, density: 0.55, ripple: 0,  stream: 0, breathe: 1, chaos: 0 },
  sleeping:  { label: 'Sleeping',         speed: 0.04, tight: 1.05, bright: 0.30, density: 0.10, ripple: 0,  stream: 0, breathe: 0.4, chaos: 0 },
  listening: { label: 'Listening',        speed: 0.30, tight: 0.82, bright: 0.90, density: 0.55, ripple: -1, stream: 0, breathe: 0.3, chaos: 0 },
  thinking:  { label: 'Thinking',         speed: 0.95, tight: 0.92, bright: 0.95, density: 0.90, ripple: 0,  stream: 0, breathe: 0.2, chaos: 1 },
  speaking:  { label: 'Speaking',         speed: 0.40, tight: 1.00, bright: 1.00, density: 0.65, ripple: 1,  stream: 0, breathe: 0, chaos: 0 },
  working:   { label: 'Working',          speed: 0.70, tight: 0.95, bright: 0.95, density: 0.80, ripple: 0,  stream: 1, breathe: 0.2, chaos: 0.4 },
  approval:  { label: 'Awaiting approval',speed: 0.10, tight: 1.00, bright: 0.80, density: 0.30, ripple: 0,  stream: 0, breathe: 0.6, chaos: 0 },
  error:     { label: 'Paused — error',   speed: 0.06, tight: 1.02, bright: 0.50, density: 0.20, ripple: 0,  stream: 0, breathe: 0.2, chaos: 0 },
};
export const ALLOWED = {
  idle: ['sleeping','listening','thinking','working','error'],
  sleeping: ['idle','listening'],
  listening: ['thinking','idle','error'],
  thinking: ['speaking','working','approval','idle','error'],
  speaking: ['idle','listening','error'],
  working: ['approval','idle','error','speaking'],
  approval: ['working','idle','error'],
  error: ['idle','thinking','working'],
};
export const TRANSITION_MS = 450;
export class StateController {
  constructor() { this.state = 'idle'; this.listeners = []; this.history = []; }
  can(to) { return ALLOWED[this.state].includes(to); }
  set(to, { force = false, detail = {} } = {}) {
    if (to === this.state) return true;
    if (!force && !this.can(to)) { console.warn(`blocked transition ${this.state} -> ${to}`); return false; }
    const from = this.state; this.state = to; this.history.push({ from, to, t: performance.now() });
    this.listeners.forEach(f => f(to, from, detail)); return true;
  }
  on(f) { this.listeners.push(f); }
}
