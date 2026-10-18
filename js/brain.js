// Local rule-based intent engine. No network, no external AI. process(text) -> { intent, reply, action? }
const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I told my computer I needed a break. It said: no problem, I will go to sleep.',
  'Why did the scarecrow win an award? He was outstanding in his field.',
  'Parallel lines have so much in common. It is a shame they will never meet.',
  'What do you call a fake noodle? An impasta.',
];
const QUOTES = [
  'The best way to predict the future is to create it. — Peter Drucker',
  'Simplicity is the ultimate sophistication. — Leonardo da Vinci',
  'Well done is better than well said. — Benjamin Franklin',
  'It always seems impossible until it is done. — Nelson Mandela',
];
const SITES = { youtube: 'https://www.youtube.com', google: 'https://www.google.com', maps: 'https://maps.google.com', 'google maps': 'https://maps.google.com',
  gmail: 'https://mail.google.com', wikipedia: 'https://www.wikipedia.org', github: 'https://github.com', x: 'https://x.com', twitter: 'https://x.com',
  instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com', amazon: 'https://www.amazon.com', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com', weather: 'https://www.google.com/search?q=weather' };
const NUMW = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100, a:1, an:1, half: 0.5 };
const rnd = a => a[Math.floor(Math.random() * a.length)];
const fmt = n => Number.isInteger(n) ? String(n) : String(+n.toFixed(4));

export function normalize(t) {
  let s = ' ' + t.toLowerCase().replace(/[’']/g, "'").replace(/[?!.,]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  // number words -> digits (handles "twenty five")
  s = s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, a, b) => NUMW[a] + NUMW[b]);
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/g, m => NUMW[m]);
  s = s.replace(/\b(a|an) (minute|hour|second|timer)/g, '1 $2').replace(/\bhalf an hour\b/g, '30 minutes').replace(/\bhalf (a|an) hour\b/g, '30 minutes');
  return s.trim();
}
const has = (s, ...ws) => ws.some(w => new RegExp('\\b' + w + '\\b').test(s));

function parseDuration(s) {
  let sec = 0, found = false; const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g; let m;
  while ((m = re.exec(s))) { found = true; const v = parseFloat(m[1]), u = m[2][0]; sec += u === 'h' ? v * 3600 : u === 'm' ? v * 60 : v; }
  return found ? Math.round(sec) : null;
}
export const durText = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`, s && `${s} second${s > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 seconds'; };

function math(s) {
  let e = s.replace(/^(what is|what's|whats|calculate|compute|how much is|solve|tell me)\s+/, '').replace(/\?$/, '');
  let m = e.match(/^(\d+(?:\.\d+)?)\s*(%|percent) of (\d+(?:\.\d+)?)$/);
  if (m) return `${m[1]} percent of ${m[3]} is ${fmt(m[1] * m[3] / 100)}.`;
  m = e.match(/^square root of (\d+(?:\.\d+)?)$/); if (m) return `The square root of ${m[1]} is ${fmt(Math.sqrt(m[1]))}.`;
  e = e.replace(/\b(times|multiplied by|x)\b/g, '*').replace(/\b(divided by|over)\b/g, '/').replace(/\bplus\b|\band\b/g, '+')
       .replace(/\b(minus|less)\b/g, '-').replace(/\b(to the power of|power)\b/g, '**').replace(/\bsquared\b/g, '**2').replace(/×/g, '*').replace(/÷/g, '/');
  if (!/\d/.test(e) || !/^[\d\s.+\-*/()]+$/.test(e) || !/[+\-*/]/.test(e)) return null;
  try { const v = Function('"use strict";return (' + e + ')')(); if (typeof v !== 'number' || !isFinite(v)) return 'That does not give a finite number.';
    return `${e.replace(/\*\*/g, ' to the power of ').replace(/\*/g, ' times ').replace(/\//g, ' divided by ').replace(/\s+/g, ' ').trim()} is ${fmt(v)}.`; } catch { return null; }
}
const UNITS = {
  km: ['km','kilometer','kilometers','kilometre','kilometres'], mi: ['mile','miles','mi'], kg: ['kg','kilo','kilos','kilogram','kilograms'],
  lb: ['lb','lbs','pound','pounds'], c: ['c','celsius','centigrade','degrees celsius'], f: ['f','fahrenheit','degrees fahrenheit'],
  m: ['m','meter','meters','metre','metres'], ft: ['ft','foot','feet'], cm: ['cm','centimeter','centimeters'], in: ['inch','inches','in'],
};
const CONV = { 'km>mi': v => v * 0.621371, 'mi>km': v => v * 1.609344, 'kg>lb': v => v * 2.204623, 'lb>kg': v => v * 0.453592,
  'c>f': v => v * 9 / 5 + 32, 'f>c': v => (v - 32) * 5 / 9, 'm>ft': v => v * 3.28084, 'ft>m': v => v * 0.3048, 'cm>in': v => v / 2.54, 'in>cm': v => v * 2.54 };
const unitOf = w => Object.keys(UNITS).find(k => UNITS[k].includes(w.trim()));
function convert(s) {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*(?:degrees\s+)?([a-z]+(?: [a-z]+)?)\s+(?:to|in|into)\s+(?:degrees\s+)?([a-z]+)/); if (!m) return null;
  let a = unitOf(m[2]) || unitOf(m[2].split(' ')[0]), b = unitOf(m[3]); if (!a || !b) return null;
  const f = CONV[a + '>' + b]; if (!f) return `I can't convert ${m[2]} to ${m[3]}.`;
  const name = { km: 'kilometers', mi: 'miles', kg: 'kilograms', lb: 'pounds', c: '°C', f: '°F', m: 'meters', ft: 'feet', cm: 'centimeters', in: 'inches' };
  return `${m[1]} ${name[a]} is ${fmt(+f(parseFloat(m[1])).toFixed(2))} ${name[b]}.`;
}
function parseWhen(s, now = new Date()) {
  const d = parseDuration(s.split(/\bin\b/).slice(1).join(' ') || ''); if (/\bin\b/.test(s) && d) return new Date(now.getTime() + d * 1000);
  const m = s.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)?/); if (!m) return null;
  let h = +m[1], mi = +(m[2] || 0); const ap = (m[3] || '').replace(' ', ''); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  const t = new Date(now); t.setHours(h, mi, 0, 0); if (t <= now) t.setDate(t.getDate() + 1); return t;
}
const store = { get: k => JSON.parse(localStorage.getItem(k) || '[]'), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };

export function processText(raw, now = new Date()) {
  const s = normalize(raw); const R = (intent, reply, action) => ({ intent, reply, action });
  if (!s) return R('empty', "I didn't catch anything. Try again?");
  if (/^(stop|cancel|never ?mind|be quiet|shut up|quiet|enough|stop talking)$/.test(s)) return R('stop', 'Okay.', { type: 'stop' });
  // timers
  if (has(s, 'cancel', 'stop', 'delete') && has(s, 'timers?')) return R('timer.cancel', 'Cancelling your timers.', { type: 'timerCancel' });
  if (has(s, 'timer', 'countdown', 'count down') || /^(remind me |wake me )?in \d/.test(s) && !has(s, 'remind')) {
    const d = parseDuration(s); if (!d) return R('timer.ask', 'For how long? Say, for example, "set a timer for 5 minutes".');
    return R('timer.set', `Timer set for ${durText(d)}.`, { type: 'timer', seconds: d });
  }
  // reminders
  if (/\b(remind me|reminder|set a reminder)\b/.test(s)) {
    if (has(s, 'list', 'show', 'what are', 'read')) { const r = store.get('ned.reminders'); return R('reminder.list', r.length ? 'Your reminders: ' + r.map(x => `${x.text} at ${new Date(x.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`).join('; ') + '.' : 'You have no reminders.'); }
    if (has(s, 'clear', 'delete')) { store.set('ned.reminders', []); return R('reminder.clear', 'All reminders cleared.'); }
    const at = parseWhen(s, now); let text = s.replace(/.*remind me (to |about )?/, '').replace(/\b(in \d.*|at \d.*)$/, '').replace(/^(to |about )/, '').trim() || 'your reminder';
    if (!at) return R('reminder.ask', 'When should I remind you? Try "remind me to call mom in 10 minutes" or "at 5 pm".');
    const list = store.get('ned.reminders'); list.push({ text, at: at.getTime() }); store.set('ned.reminders', list);
    return R('reminder.set', `Okay, I'll remind you to ${text} at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, while NED is open.`, { type: 'reminder' });
  }
  // notes
  if (has(s, 'notes?')) {
    const notes = store.get('ned.notes');
    if (has(s, 'clear', 'delete', 'erase', 'remove')) { store.set('ned.notes', []); return R('note.clear', 'All notes deleted.'); }
    if (has(s, 'read', 'show', 'list', 'what are', 'my notes')) return R('note.read', notes.length ? `You have ${notes.length} note${notes.length > 1 ? 's' : ''}: ` + notes.map((n, i) => `${i + 1}, ${n}`).join('. ') + '.' : 'You have no notes yet.');
    const m = s.match(/(?:note|notes)(?: that| down| saying)?[: ]+(.+)/) || s.match(/(?:add|take|make|write|save)(?: a)? (.+?) (?:to|in) (?:my )?notes?/);
    const t = m && m[1].replace(/^(that|down|to|:)\s*/, '').trim();
    if (t && !/^(add|take|make|write)$/.test(t)) { notes.push(t); store.set('ned.notes', notes); return R('note.add', `Saved to notes: "${t}".`); }
    return R('note.ask', 'What should the note say? Try "note buy milk".');
  }
  if (/^(write down|remember that|remember) (.+)/.test(s)) { const t = s.replace(/^(write down|remember that|remember) /, ''); const n = store.get('ned.notes'); n.push(t); store.set('ned.notes', n); return R('note.add', `Saved to notes: "${t}".`); }
  // time / date
  if (/\b(what time|the time|time is it|current time|time now)\b/.test(s) || s === 'time') return R('time', `It's ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`);
  if (/\b(what day|which day|day is it|day today)\b/.test(s)) return R('day', `Today is ${now.toLocaleDateString([], { weekday: 'long' })}.`);
  if (/\b(date|today's date|what is today)\b/.test(s)) return R('date', `Today is ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`);
  // conversions & math
  const cv = convert(s); if (cv) return R('convert', cv);
  const mt = math(s); if (mt) return R('math', mt);
  // state / settings
  if (/\b(go to sleep|sleep|good night|goodnight)\b/.test(s) && !has(s, 'timer')) return R('state.sleep', 'Going to sleep. Tap Talk to wake me.', { type: 'state', state: 'sleeping' });
  if (/\b(wake up|wake)\b/.test(s)) return R('state.wake', "I'm awake.", { type: 'state', state: 'idle' });
  if (/reduce(d)? motion|less motion|reduce animation/.test(s)) { const off = has(s, 'off', 'disable') || /turn off|stop reduc/.test(s); return R('setting.motion', `Reduce Motion ${off ? 'off' : 'on'}.`, { type: 'reduceMotion', value: !off }); }
  // web
  let m = s.match(/^(?:search(?: the web| google)?(?: for)?|google|look up|find|search up)\s+(.+)/);
  if (m) return R('web.search', `Search the web for "${m[1]}"? I'll open Google in a new tab once you approve.`, { type: 'open', url: 'https://www.google.com/search?q=' + encodeURIComponent(m[1]), label: `Search Google for “${m[1]}”`, approval: true });
  m = s.match(/^(?:open|go to|launch|show me|take me to|start)\s+(.+)/);
  if (m) { const site = m[1].replace(/^the /, '').replace(/ (app|website|site)$/, '');
    if (/^(missions?|tasks?)$/.test(site)) return R('nav', 'Opening Missions.', { type: 'nav', tab: 'missions' });
    if (/^(control|settings|controls)$/.test(site)) return R('nav', 'Opening Control.', { type: 'nav', tab: 'control' });
    if (/^(create)$/.test(site)) return R('nav', 'Opening Create.', { type: 'nav', tab: 'create' });
    if (/^(camera)$/.test(site)) return R('nav', 'Camera is not connected in this demo.', { type: 'nav', tab: 'camera' });
    const url = SITES[site] || (/^[a-z0-9-]+\.[a-z.]{2,}$/.test(site.replace(/ dot /g, '.')) ? 'https://' + site.replace(/ dot /g, '.') : null);
    if (url) return R('web.open', `Open ${site}? Approve and I'll open it in a new tab.`, { type: 'open', url, label: `Open ${site}`, approval: true });
    return R('web.unknown', `I don't know a website called ${site}. I can search the web for it.`, { type: 'offerSearch', query: site });
  }
  // fun
  if (has(s, 'joke', 'funny', 'make me laugh')) return R('joke', rnd(JOKES));
  if (has(s, 'quote', 'inspire', 'inspiration', 'motivate', 'motivation')) return R('quote', rnd(QUOTES));
  if (/flip (a )?coin|heads or tails|toss (a )?coin/.test(s)) return R('coin', `It's ${Math.random() < .5 ? 'heads' : 'tails'}.`);
  if (/roll (a |the )?(die|dice)|dice roll/.test(s)) { const n = Math.min(6, +(s.match(/roll (\d) dice/) || [0, 1])[1]); const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)); return R('dice', n > 1 ? `You rolled ${r.join(', ')}, total ${r.reduce((a, b) => a + b)}.` : `You rolled a ${r[0]}.`); }
  // small talk
  if (/^(hi|hello|hey|hiya|yo|good (morning|afternoon|evening)|hey ned|hi ned|hello ned|namaste|salam|assalamualaikum)( ned)?$/.test(s)) return R('greet', rnd(['Hello! How can I help?', 'Hi there. What can I do for you?', 'Hey! I am listening.']));
  if (/how are you|how's it going|how are things|how do you do/.test(s)) return R('smalltalk', "I'm running smoothly, thanks for asking. How can I help?");
  if (/who are you|what are you|your name|who made you|introduce yourself/.test(s)) return R('identity', "I'm NED, a voice assistant that runs entirely in this browser. No cloud AI: everything I understand comes from built-in rules.");
  if (/what can you do|help|what do you do|commands|capabilities/.test(s)) return R('help', 'I can tell the time and date, set timers and reminders, take notes, do math and unit conversions, open websites or search the web after you approve, tell jokes, flip a coin or roll dice, and open Missions or Control.');
  if (/^(thanks|thank you|thank you ned|cheers|thx)/.test(s)) return R('thanks', "You're welcome.");
  if (/^(bye|goodbye|see you|later)/.test(s)) return R('bye', 'Goodbye. Tap Talk any time.');
  if (/^(yes|yeah|yep|sure|ok|okay)$/.test(s)) return R('affirm', 'Okay. What would you like me to do?');
  return R('unknown', `I'm not sure how to help with "${raw.trim()}" yet. Want me to search the web for it?`, { type: 'offerSearch', query: raw.trim() });
}
export function dueReminders(now = Date.now()) {
  const list = store.get('ned.reminders'), due = list.filter(r => r.at <= now); if (due.length) store.set('ned.reminders', list.filter(r => r.at > now)); return due;
}
