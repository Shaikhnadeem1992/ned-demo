// Audio response: real mic RMS (only after user gesture) + event-driven energy for recognition and speech output.
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
  // Event-driven energy (speech-synthesis boundaries, recognition results): browsers don't expose
  // speechSynthesis audio to WebAudio, so these kicks + a syllable envelope drive the core instead.
  kick(v = 1) { this.kickLevel = Math.max(this.kickLevel || 0, v); }
  setEnvelope(on) { this.envOn = on; }
  rms(an) { an.getFloatTimeDomainData(this.buf); let s = 0; for (const v of this.buf) s += v * v; return Math.sqrt(s / this.buf.length); }
  update() {
    const an = this.source === 'mic' ? this.micAnalyser : this.source === 'voice' ? this.outAnalyser : null;
    let raw = an ? Math.min(1, this.rms(an) * 8) : 0;
    this.kickLevel = (this.kickLevel || 0) * 0.9; raw = Math.max(raw, this.kickLevel);
    if (this.envOn) { const t = performance.now() / 1000; raw = Math.max(raw, 0.25 + 0.2 * Math.abs(Math.sin(t * 7.5)) * (0.6 + 0.4 * Math.sin(t * 1.9))); }
    this.level += (raw - this.level) * (raw > this.level ? 0.35 : 0.08); // fast attack, slow release
    return this.level;
  }
}
