// Audio response: real mic RMS (only after user gesture) + energy of NED's synthesized voice output.
export class AudioResponse {
  constructor() { this.ctx = null; this.micStream = null; this.micAnalyser = null; this.outAnalyser = null; this.level = 0; this.source = 'none'; this.buf = new Float32Array(1024); }
  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  async startMic() {
    const ctx = this.ensureCtx();
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    const src = ctx.createMediaStreamSource(this.micStream);
    this.micAnalyser = ctx.createAnalyser(); this.micAnalyser.fftSize = 1024; src.connect(this.micAnalyser);
    this.source = 'mic';
  }
  stopMic() {
    if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
    this.micStream = null; this.micAnalyser = null; if (this.source === 'mic') this.source = 'none';
  }
  get micOn() { return !!(this.micStream && this.micStream.getAudioTracks().some(t => t.readyState === 'live')); }
  // NED's voice output: a synthesized, word-free "voice" (syllable envelopes on a filtered tone) routed
  // through an AnalyserNode, so the core reacts to the actual output signal. Resolves when playback ends.
  speak(text) {
    const ctx = this.ensureCtx();
    const an = ctx.createAnalyser(); an.fftSize = 1024; an.connect(ctx.destination); this.outAnalyser = an; this.source = 'voice';
    const master = ctx.createGain(); master.gain.value = 0.18; master.connect(an);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(master);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; const env = ctx.createGain(); env.gain.value = 0;
    osc.connect(env); env.connect(lp);
    const words = text.split(/\s+/).filter(Boolean); let t = ctx.currentTime + 0.05;
    for (const w of words) {
      const syl = Math.max(1, Math.round(w.length / 3));
      for (let i = 0; i < syl; i++) {
        const d = 0.11 + Math.random() * 0.07;
        osc.frequency.setValueAtTime(150 + Math.random() * 60, t);
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.9, t + 0.03);
        env.gain.linearRampToValueAtTime(0.0, t + d); t += d + 0.02;
      }
      t += /[.,!?]$/.test(w) ? 0.22 : 0.07;
    }
    osc.start(); osc.stop(t + 0.1);
    return new Promise(res => { osc.onended = () => { this.outAnalyser = null; if (this.source === 'voice') this.source = 'none'; res(); }; });
  }
  rms(an) { an.getFloatTimeDomainData(this.buf); let s = 0; for (const v of this.buf) s += v * v; return Math.sqrt(s / this.buf.length); }
  update() {
    const an = this.source === 'mic' ? this.micAnalyser : this.source === 'voice' ? this.outAnalyser : null;
    const raw = an ? Math.min(1, this.rms(an) * (this.source === 'mic' ? 8 : 5)) : 0;
    this.level += (raw - this.level) * (raw > this.level ? 0.35 : 0.08); // fast attack, slow release
    return this.level;
  }
}
