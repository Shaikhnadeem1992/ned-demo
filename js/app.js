// App wiring: UI + demo flows. Visual state follows real app events (mic session, processing promise, task steps).
import { Quality } from './quality.js';
import { StateController, STATES, TRANSITION_MS } from './state.js';
import { AudioResponse } from './audio.js';
import { CoreRenderer } from './renderer.js';
import { compactSVG, COMPACT_STATES } from './compact.js';
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
  if (prev === 'listening' && s !== 'listening') stopMic();
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

// ---- Talk flow: listening (real mic) → thinking (real promise) → speaking (real output energy) → idle
$('#talk').onclick = async () => {
  if (sc.state === 'listening') { stopMic(); say('you', '(spoken input — speech-to-text not included in demo)'); await think(); return reply('I heard you. This demo reacts to your real microphone level, then replies with synthesized audio.'); }
  if (!['idle','sleeping','speaking'].includes(sc.state)) return;
  try { await audio.startMic(); micUI(); sc.set('listening'); caption('Listening… the rings respond to your actual voice level.'); }
  catch (e) { fail('Microphone unavailable', (e && e.name === 'NotAllowedError') ? 'Permission was denied. Allow microphone access in Safari settings, then retry.' : 'No microphone could be opened (' + (e.name || e) + ').', () => $('#talk').click()); }
};
async function think(ms = 1600) {
  processing = true; sc.set('thinking'); updateLabel(); caption('Processing…');
  await new Promise(r => setTimeout(r, ms)); processing = false; updateLabel();
}
async function reply(text) {
  say('ned', text); caption(text); sc.set('speaking');
  await audio.speak(text); if (sc.state === 'speaking') { sc.set('idle'); caption(''); }
}

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
function approval(title, body) {
  return new Promise(res => {
    openSheet(`<h2>Approval needed</h2><p><b>${title}</b></p><p class="muted">${body}</p><div class="row"><button class="btn" id="apv">Approve</button><button class="btn ghost" id="deny">Deny</button></div>`, 'approval', true);
    $('#apv').focus();
    $('#apv').onclick = () => { closeSheet(true); res(true); }; $('#deny').onclick = () => { closeSheet(true); res(false); };
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
  openSheet(tab === 'missions' ? [$('#taskCard'), $('#convCard')] : [$('#controlCard'), $('#compactCard')]);
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
    if (s === 'speaking') audio.speak('This is a preview of NED speaking.').then(() => sc.state === 'speaking' && sc.set('idle'));
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
  if (sc.state === 'listening' && !audio.micOn) fail('Microphone stopped', 'The microphone track ended unexpectedly.', () => $('#talk').click());
}
function start() { if (!raf) { last = performance.now(); q.resetTiming(); raf = requestAnimationFrame(loop); } }
function stop() { cancelAnimationFrame(raf); raf = 0; }
document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
addEventListener('resize', () => renderer.resize());
start();
window.__ned = { sc, q, audio, renderer, get frames() { return frames; }, get running() { return !!raf; }, get params() { return { ...cur }; }, stop, start };
