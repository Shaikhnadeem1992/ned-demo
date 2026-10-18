// Speech I/O: Web Speech API recognition (speech-to-text) + speechSynthesis (text-to-speech). Both run in the browser/OS.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const recognitionSupported = !!SR;
export const synthesisSupported = 'speechSynthesis' in window;

export class Recognizer {
  constructor() { this.rec = null; this.active = false; }
  start({ onInterim, onFinal, onEnd, onError, onSound }) {
    const r = new SR(); this.rec = r; r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let finalText = '', delivered = false;
    r.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
      onSound && onSound(); onInterim && onInterim((finalText + ' ' + interim).trim()); };
    r.onspeechstart = () => onSound && onSound(); r.onsoundstart = () => onSound && onSound();
    r.onerror = e => { this.active = false; if (e.error !== 'aborted' && e.error !== 'no-speech') onError && onError(e.error); else if (e.error === 'no-speech') { delivered = true; onFinal && onFinal(''); } };
    r.onend = () => { this.active = false; if (!delivered) { delivered = true; onFinal && onFinal(finalText.trim()); } onEnd && onEnd(); };
    this.active = true; r.start();
  }
  stop() { if (this.rec && this.active) this.rec.stop(); } // stop() delivers the final result via onend
  abort() { if (this.rec) { this.rec.onend = null; this.rec.onresult = null; this.rec.onerror = null; try { this.rec.abort(); } catch {} } this.active = false; }
}

const PREFER = [/natural/i, /neural/i, /premium/i, /enhanced/i, /siri/i, /samantha/i, /ava/i, /google us english/i, /google uk english/i, /daniel/i, /karen/i, /moira/i, /aria/i, /jenny/i];
export class Speaker {
  constructor() { this.voices = []; this.voiceURI = localStorage.getItem('ned.voice') || ''; this.rate = +(localStorage.getItem('ned.rate') || 1); this.listeners = [];
    if (synthesisSupported) { const load = () => { this.voices = speechSynthesis.getVoices(); this.listeners.forEach(f => f()); }; load(); speechSynthesis.addEventListener?.('voiceschanged', load); } }
  onVoices(f) { this.listeners.push(f); }
  englishVoices() { return this.voices.filter(v => /^en/i.test(v.lang)); }
  best() {
    const en = this.englishVoices(); const chosen = this.voices.find(v => v.voiceURI === this.voiceURI); if (chosen) return chosen;
    for (const re of PREFER) { const v = en.find(v => re.test(v.name)); if (v) return v; }
    return en.find(v => v.localService) || en[0] || null;
  }
  setVoice(uri) { this.voiceURI = uri; localStorage.setItem('ned.voice', uri); }
  setRate(r) { this.rate = r; localStorage.setItem('ned.rate', r); }
  cancel() { if (synthesisSupported) speechSynthesis.cancel(); if (this._done) this._done(); }
  // Resolves when speaking finishes (or a duration-based safety timeout fires, since some engines never fire 'end').
  speak(text, { onStart, onBoundary } = {}) {
    return new Promise(res => {
      let finished = false; const done = () => { if (finished) return; finished = true; clearTimeout(this._to); this._done = null; res(); };
      this._done = done;
      const est = 1500 + text.split(/\s+/).length * 420 / this.rate;
      if (!synthesisSupported) { onStart && onStart(); this._to = setTimeout(done, est); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); const v = this.best(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = this.rate; u.pitch = 1;
      u.onstart = () => onStart && onStart(); u.onboundary = e => onBoundary && onBoundary(e); u.onend = done; u.onerror = done;
      this._u = u; // keep a reference (Safari GC bug)
      speechSynthesis.speak(u); onStart && setTimeout(() => !finished && onStart(), 250);
      this._to = setTimeout(done, est + 4000);
    });
  }
}
