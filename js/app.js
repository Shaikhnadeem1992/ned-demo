// App wiring: UI + demo flows. Visual state follows real app events (mic session, processing promise, task steps).
import { Quality } from './quality.js';
import { StateController, STATES, TRANSITION_MS } from './state.js';
import { AudioResponse } from './audio.js';
import { CoreRenderer } from './renderer.js';
import { compactSVG, COMPACT_STATES } from './compact.js';
import { processText, dueReminders, durText } from './brain.js';
import { Recognizer, Speaker, recognitionSupported, isIOS } from './speech.js';
const $ = s => document.querySelector(s);
const q = new Quality(), sc = new StateController(), audio = new AudioResponse();
const renderer = new CoreRenderer($('#core'), q);
const KEYS = ['speed','tight','bright','density','ripple','stream','breathe','chaos'];
let cur = { ...STATES.idle }, from = { ...cur }, to = { ...cur }, tStart = 0;
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
let errorInfo = null, processing = false, task = null, idleTimer = 0;

// ---- state → visuals + labels
const ICON = { idle:'●', sleeping:'☾', listening:'◉', thinking:'⋯', speaking:'◌', working:'➤', approval:'⏸', error:'⚠' };
sc.on((s, prev) => {
  from = { ...cur }; to = { ...STATES[s] }; tStart = performance.now();
  if (prev === 'listening' && s !== 'listening') { stopMic(); if (s !== 'thinking' && recog?.active) recog.abort(); }
  updateLabel(); renderPicker(); idleTimer = 0;
});
function updateLabel(stage) {
  const s = sc.state; let text = STATES[s].label;
  if (s === 'thinking' && !processing) text = 'Thinking (preview)';
  if (s === 'working' && task?.stage) text = task.stage;
  if (s === 'error' && errorInfo) text = 'Error — paused';
  $('#stateText').textContent = text; $('#stateIcon').textContent = ICON[s];
  $('#stateLabel').classList.toggle('err', s === 'error');
  $('#statusText').textContent = s === 'idle' ? 'Ready' : STATES[s].label;
}
const caption = t => $('#caption').textContent = t;
function say(who, text) { const p = document.createElement('p'); p.className = who; p.textContent = (who === 'you' ? 'You: ' : who === 'ned' ? 'NED: ' : '') + text; $('#conv').append(p); $('#conv').scrollTop = 1e9; }

// ---- mic indicator (independent of animation)
function micUI() { const on = audio.micOn; $('#micChip').className = 'chip ' + (on ? 'on' : 'off'); $('#micText').textContent = on ? 'Mic on' : 'Mic off';
  $('#talk').setAttribute('aria-pressed', on); $('#talkText').textContent = on ? 'Stop' : 'Talk'; }
function stopMic() { audio.stopMic(); micUI(); }

// ---- Talk flow: listening (real speech recognition) → thinking (local brain) → speaking (speechSynthesis) → idle
const recog = recognitionSupported ? new Recognizer() : null, speaker = new Speaker();
let pendingOffer = null; const timers = []; let timerId = 0;
function micUIrec() { micUI(); if (recog?.active) { $('#micChip').className = 'chip on'; $('#micText').textContent = 'Mic on'; $('#talk').setAttribute('aria-pressed', true); $('#talkText').textContent = 'Stop'; } }
$('#talk').onclick = async () => {
  if (sc.state === 'listening') { if (recog?.active) recog.stop(); else { stopMic(); sc.set('idle'); } return; }
  if (modal) return;
  speaker.cancel(); audio.setEnvelope(false); audio.ensureCtx();
  if (!recog) { caption('Speech recognition is not supported in this browser. Type a command below.'); $('#cmd').focus(); return; }
  if (sc.state !== 'idle' && sc.state !== 'sleeping') sc.set('idle', { force: true });
  // On iOS, opening getUserMedia alongside SpeechRecognition can conflict, so recognition takes priority there and
  // ripples are driven by recognition events instead of the analyser.
  if (!isIOS) { try { await audio.startMic(); } catch (e) { /* recognition may still work; analyser optional */ } }
  sc.set('listening'); caption('Listening…'); $('#transcript').textContent = '';
  try {
    recog.start({
      onSound: () => audio.kick(0.5),
      onInterim: t => { $('#transcript').textContent = t; caption('“' + t + '”'); audio.kick(0.7); },
      onFinal: t => { stopMic(); micUI(); if (sc.state === 'listening') { if (t) handle(t); else { sc.set('idle'); caption("I didn't hear anything. Tap Talk to try again."); } } },
      onError: err => { stopMic(); const msg = err === 'not-allowed' || err === 'service-not-allowed' ? 'Microphone or speech recognition permission was denied. Allow it in Settings › Safari, then retry. You can also type below.' : err === 'network' ? 'Speech recognition needs a connection on this device. You can type commands below.' : 'Speech recognition error: ' + err + '.';
        fail('Could not listen', msg, () => $('#talk').click()); },
    });
    micUIrec();
  } catch (e) { stopMic(); fail('Could not listen', 'Speech recognition could not start (' + (e.message || e) + ').', null); }
};
$('#cmdForm').onsubmit = e => { e.preventDefault(); const t = $('#cmd').value.trim(); if (!t) return; $('#cmd').value = ''; if (recog?.active) recog.abort(); stopMic(); speaker.cancel(); handle(t); };

async function think(ms = 1600) {
  processing = true; sc.set('thinking', { force: true }); updateLabel(); caption('Processing…');
  await new Promise(r => setTimeout(r, ms)); processing = false; updateLabel();
}
async function handle(text) {
  say('you', text); processing = true; sc.set('thinking', { force: true }); updateLabel(); caption('Thinking…');
  const t0 = performance.now();
  let res = processText(text);
  if (res.intent === 'affirm' && pendingOffer) { const q2 = pendingOffer; res = { intent: 'web.search', reply: `Search the web for "${q2}"? Approve to open Google.`, action: { type: 'open', url: 'https://www.google.com/search?q=' + encodeURIComponent(q2), label: `Search Google for “${q2}”`, approval: true } }; }
  pendingOffer = null;
  await new Promise(r => setTimeout(r, Math.max(0, 350 - (performance.now() - t0)))); // brief, real processing window
  processing = false; window.__lastIntent = res.intent;
  const a = res.action || {};
  if (a.type === 'open') {
    sc.set('approval', { force: true }); caption(res.reply); say('ned', res.reply);
    const ok = await approval(a.label, `This opens <b>${a.url.replace(/^https:\/\//, '').split('/')[0]}</b> in a new tab. Nothing happens unless you approve.`, a.url);
    return ok ? reply('Opened it in a new tab.', false) : reply("Okay, I won't open it.", false);
  }
  if (a.type === 'offerSearch') pendingOffer = a.query;
  if (a.type === 'stop') { speaker.cancel(); audio.setEnvelope(false); sc.set('idle', { force: true }); caption(''); say('ned', 'Okay.'); return; }
  if (a.type === 'timer') { task = { stage: 'Starting timer' }; sc.set('working', { force: true }); taskUI(); await sleep(600); task = null; taskUI(); startTimer(a.seconds); }
  if (a.type === 'timerCancel') { timers.splice(0).forEach(t => clearInterval(t.iv)); timersUI(); }
  if (a.type === 'reduceMotion') { q.setReduceMotion(a.value); $('#rm').checked = a.value; }
  if (a.type === 'reminder') remindersUI();
  await reply(res.reply);
  if (a.type === 'nav') { const b = document.querySelector(`.dock [data-tab=${a.tab}]`); b && b.click(); }
  if (a.type === 'state') sc.set(a.state, { force: true });
}
async function reply(text, log = true) {
  if (log) say('ned', text); else say('ned', text);
  caption(text); sc.set('speaking', { force: true });
  await speaker.speak(text, { onStart: () => audio.setEnvelope(true), onBoundary: () => audio.kick(1) });
  audio.setEnvelope(false); if (sc.state === 'speaking') { sc.set('idle'); }
}
function chime() { try { const c = audio.ensureCtx(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(.2, c.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .8); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .9); } catch {} }
function notify(title, text) {
  const n = document.createElement('div'); n.className = 'toast card'; n.setAttribute('role', 'alert');
  n.innerHTML = `<b>⏰ ${title}</b><div>${text}</div><button class="btn ghost">Dismiss</button>`; n.querySelector('button').onclick = () => n.remove();
  $('#toasts').append(n); chime(); alerts.push(text); flushAlerts();
}
const alerts = [];
function flushAlerts() { if (!alerts.length) return; if (['idle','sleeping'].includes(sc.state) && !modal) reply(alerts.shift(), true).then(flushAlerts); else setTimeout(flushAlerts, 400); }
function startTimer(sec) {
  const t = { id: ++timerId, end: Date.now() + sec * 1000, total: sec }; timers.push(t);
  t.iv = setInterval(() => { if (Date.now() >= t.end) { clearInterval(t.iv); timers.splice(timers.indexOf(t), 1); notify('Timer done', `Your ${durText(sec)} timer is done.`); } timersUI(); }, 250); timersUI();
}
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function timersUI() { $('#timers').innerHTML = timers.map(t => `<div class="timer">⏱ ${mmss(t.end - Date.now())} left <span class="muted small">(${durText(t.total)})</span></div>`).join(''); }
function remindersUI() { const r = JSON.parse(localStorage.getItem('ned.reminders') || '[]'); $('#reminders').innerHTML = r.map(x => `<div class="muted small">🔔 ${x.text} — ${new Date(x.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`).join(''); }
setInterval(() => { dueReminders().forEach(r => notify('Reminder', `Reminder: ${r.text}.`)); remindersUI(); }, 1000); remindersUI();
// voice settings
function voicesUI() { const vs = speaker.englishVoices(), best = speaker.best();
  $('#voice').innerHTML = vs.length ? vs.map(v => `<option value="${v.voiceURI}" ${best && v.voiceURI === best.voiceURI ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join('') : '<option>System default</option>'; }
speaker.onVoices(voicesUI); voicesUI();
$('#voice').onchange = e => speaker.setVoice(e.target.value);
$('#rate').value = speaker.rate; $('#rateVal').textContent = speaker.rate.toFixed(1) + '×';
$('#rate').oninput = e => { speaker.setRate(+e.target.value); $('#rateVal').textContent = (+e.target.value).toFixed(1) + '×'; };
$('#testVoice').onclick = () => reply('Hello, I am NED. This is my voice.');
if (!recog) $('#recogNote').textContent = 'Speech recognition is not supported in this browser — type commands instead.';

// ---- demo task: working stages → approval → working → done
const sleep = ms => new Promise(r => setTimeout(r, ms));
function taskUI() {
  $('#taskStatus').textContent = task ? task.stage : 'No task running.'; if (task) caption(task.stage);
  $('#taskBarWrap').hidden = !(task && task.pct != null); if (task?.pct != null) $('#taskBar').style.width = task.pct + '%';
  if (sc.state === 'working') updateLabel();
}
$('#runTask').onclick = async () => {
  if (task || !['idle','error'].includes(sc.state)) return;
  closeSheet(); say('you', 'Run demo task: summarize project notes and draft a message.');
  await think(900);
  task = { stage: 'Planning' }; sc.set('working'); taskUI(); await sleep(1300);
  task.stage = 'Running step 1 of 3 — reading notes'; taskUI(); await sleep(1300);
  task.stage = 'Running step 2 of 3 — drafting summary'; taskUI(); await sleep(1300);
  task.stage = 'Waiting for your approval'; taskUI(); sc.set('approval'); caption('Approval needed before NED continues.');
  const ok = await approval('Send the drafted summary (simulated)', 'NED wants to send the drafted summary to “Team (demo)”. Nothing has been sent. This action is simulated in the demo.');
  if (!ok) { task = null; taskUI(); sc.set('idle'); say('ned', 'Okay, I did not send it. Task stopped.'); caption('Denied — nothing was sent.'); return; }
  sc.set('working'); task.stage = 'Running step 3 of 3 — sending'; task.pct = 0; taskUI();
  for (let i = 1; i <= 20; i++) { await sleep(90); task.pct = i * 5; task.stage = `Running step 3 of 3 — sending ${task.pct}%`; taskUI(); }
  task = null; taskUI(); await reply('Done. The summary was sent in this simulation.');
};
function approval(title, body, url) {
  return new Promise(res => {
    openSheet(`<h2>Approval needed</h2><p><b>${title}</b></p><p class="muted">${body}</p><div class="row"><button class="btn" id="apv">Approve</button><button class="btn ghost" id="deny">Deny</button></div>`, 'approval', true);
    $('#apv').focus();
    $('#apv').onclick = () => { if (url) window.__opened = window.open(url, '_blank', 'noopener') || url; closeSheet(true); res(true); }; $('#deny').onclick = () => { closeSheet(true); res(false); };
  });
}
function fail(title, msg, retry) {
  stopMic(); processing = false; task = null; taskUI(); errorInfo = { title, msg };
  sc.set('error', { force: true }); caption(title);
  openSheet(`<div class="errHead">⚠ <span>${title}</span></div><p>${msg}</p><div class="row"><button class="btn danger" id="retry">Retry</button><button class="btn ghost" id="dismiss">Dismiss</button></div>`, 'error', true);
  $('#retry').onclick = () => { closeSheet(true); errorInfo = null; sc.set('idle', { force: true }); caption(''); retry && retry(); };
  $('#dismiss').onclick = () => { closeSheet(true); errorInfo = null; sc.set('idle', { force: true }); caption(''); };
}
$('#simErr').onclick = () => { closeSheet(); fail('Connection lost (simulated)', 'NED could not reach its service. Your data is safe; nothing was changed.', null); };

// ---- sheets (iPhone focused cards) / panels (wide)
let sheetHome = null, modal = false;
function openSheet(html, cls = '', isModal = false) {
  restoreCard(); const sh = $('#sheet'); sh.className = 'sheet card ' + cls; modal = isModal;
  if (typeof html === 'string') sh.innerHTML = html; else { sh.innerHTML = ''; sheetHome = []; html.forEach(n => { sheetHome.push([n, n.parentNode]); sh.append(n); }); sh.insertAdjacentHTML('beforeend', '<div class="row"><button class="btn ghost" id="closeSheet">Close</button></div>'); $('#closeSheet').onclick = () => closeSheet(); }
  $('#overlay').hidden = false;
}
function restoreCard() { if (sheetHome) { sheetHome.forEach(([n, p]) => p.append(n)); sheetHome = null; } }
function closeSheet(force) { if (modal && !force) return; restoreCard(); $('#overlay').hidden = true; modal = false; document.querySelectorAll('.dock button').forEach(b => b.classList.remove('act')); }
$('#overlay').onclick = e => { if (e.target.id === 'overlay') closeSheet(); };
const wide = () => matchMedia('(min-width:1000px)').matches;
document.querySelectorAll('.dock [data-tab]').forEach(b => b.onclick = () => {
  if (modal) return; const tab = b.dataset.tab;
  if (tab === 'camera') return openSheet('<h2>Camera</h2><p>Camera is <b>not connected in this demo</b>. NED never turns the camera on to animate the core.</p><div class="row"><button class="btn ghost" onclick="document.getElementById(\'overlay\').hidden=true">Close</button></div>');
  if (tab === 'create') return openSheet('<h2>Create</h2><p class="muted">Start a demo task to see Working → Approval states.</p><div class="row"><button class="btn" id="c1">Run demo task</button><button class="btn ghost" id="c2">Simulate error</button></div>'), $('#c1').onclick = () => $('#runTask').click(), $('#c2').onclick = () => $('#simErr').click();
  if (wide()) { const el = tab === 'missions' ? $('#taskCard') : $('#controlCard'); el.scrollIntoView({ behavior: 'smooth' }); el.animate([{ borderColor: '#FFB547' }, { borderColor: 'rgba(255,181,71,.28)' }], 800); return; }
  b.classList.add('act');
  openSheet(tab === 'missions' ? [$('#convCard'), $('#taskCard')] : [$('#controlCard'), $('#compactCard')]);
});

// ---- settings
$('#rm').checked = q.reduceMotion; $('#rm').onchange = e => q.setReduceMotion(e.target.checked);
$('#qual').value = q.mode; $('#qual').onchange = e => q.set(e.target.value);
$('#showFps').onchange = e => $('#fpsChip').hidden = !e.target.checked;
const tierInfo = () => $('#tierInfo').textContent = `Active tier: ${q.tier}${q.mode === 'auto' ? ' (auto)' : ''} · ${q.settings.particles} particles${q.reduceMotion ? ' · reduced motion' : ''}`;
q.onChange(tierInfo); tierInfo();
function renderPicker() {
  $('#picker').innerHTML = Object.keys(STATES).map(s => `<button data-s="${s}" class="${s === sc.state ? 'cur' : ''}">${STATES[s].label}</button>`).join('');
  $('#picker').querySelectorAll('button').forEach(b => b.onclick = () => {
    const s = b.dataset.s; if (s === 'error') return fail('Preview error', 'Developer preview of the error state.', null);
    if (s === 'listening') { closeSheet(); return $('#talk').click(); } // real mic only
    if (sc.state === 'listening') stopMic();
    sc.set(s, { force: true }); caption(s === 'speaking' ? 'Preview: speaking pulses follow real output audio.' : 'Developer preview: ' + STATES[s].label);
    if (s === 'speaking') reply('This is a preview of NED speaking.');
  });
}
renderPicker();
// ---- compact previews
for (const [sel, size] of [['#compact40', 40], ['#compact24', 24]]) $(sel).innerHTML = COMPACT_STATES.map(s => `<figure>${compactSVG(s, size)}<figcaption>${size === 40 ? STATES[s].label.split(' ')[0] : ''}</figcaption></figure>`).join('');
$('#island').innerHTML = ['idle','listening','thinking','speaking','working','sleeping'].map(s => `<div class="pill">${compactSVG(s, 24)}<span>${STATES[s].label}</span></div>`).join('');

// ---- loop with visibility pause
let raf = 0, last = performance.now(), frames = 0;
function loop(now) {
  raf = requestAnimationFrame(loop); frames++;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; q.frame(now);
  const k = ease(Math.min(1, (now - tStart) / TRANSITION_MS)); for (const key of KEYS) cur[key] = from[key] + (to[key] - from[key]) * k;
  const level = audio.update();
  renderer.frame(cur, level, dt, { error: sc.state === 'error' });
  if (!$('#fpsChip').hidden) $('#fpsChip').textContent = q.fps.toFixed(0) + ' fps · ' + q.tier;
  if (sc.state === 'idle' && !task) { idleTimer += dt; if (idleTimer > 90) { sc.set('sleeping'); caption('Sleeping. Tap Talk to wake.'); } }
  if (sc.state === 'listening' && !audio.micOn && !recog?.active) fail('Microphone stopped', 'The microphone track ended unexpectedly.', () => $('#talk').click());
}
function start() { if (!raf) { last = performance.now(); q.resetTiming(); raf = requestAnimationFrame(loop); } }
function stop() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
addEventListener('resize', () => renderer.resize());
start();
window.__ned = { handle, speaker, timers, sc, q, audio, renderer, get frames() { return frames; }, get running() { return !!raf; }, get params() { return { ...cur }; }, stop, start };
