# NED Energy Core — State-Transition Specification & Implementation Status

NED is shown as an abstract holographic energy core: a small soft golden centre, layered tilted orbital arcs, particles on orbital paths, tapered trails, occasional ripples and fine tick markings. **No face, eyes, mouth, head, body or limbs.** The centre is a soft glow, not an iris. Rings are tilted in 3D and broken into arcs so the shape never reads as an eye.

Palette: bg `#06090F`, panel `#111722`, primary `#FFB547`, core `#FFE7B0`, trails `#EF862A`, text `#F4F6FA`, secondary `#AAB5C6`. Cyan (`#5FD3E6`) is used only for small info (Online, FPS). Red (`#FF5A4E`) is used only for errors.

## Architecture (`/js`)
| Module | Role |
|---|---|
| `renderer.js` | Three.js scene (vendored r18x, MIT). Core sprite + halo (bloom limited to light sources), 4 arc rings in separate tilt/spin groups, particles, trails, ripples. Takes interpolated params, audio level and dt. Has no app logic. |
| `state.js` | `StateController`: the current state, the allowed transitions, per-state parameter targets, and `TRANSITION_MS = 450`. |
| `audio.js` | `AudioResponse`: mic RMS from a `getUserMedia` AnalyserNode (opened only after the user taps Talk; tracks are stopped when listening ends). Voice-output energy comes from an AnalyserNode on NED's synthesized output. Fast-attack / slow-release smoothing. |
| `quality.js` | Quality tiers, Auto FPS adaptation, Reduce Motion (stored setting, or `prefers-reduced-motion` by default). |
| `compact.js` | Static SVG compact core (centre + 1–2 arcs, no particles). |
| `brain.js` | Local rule-based intent engine (no network, no AI service). Normalizes text (number words become digits, punctuation is removed) and matches intents with regex and synonyms. Returns `{intent, reply, action}`. |
| `speech.js` | `Recognizer` (Web Speech API `SpeechRecognition`/`webkitSpeechRecognition`, interim results) and `Speaker` (`speechSynthesis`, best-voice picker, voice/rate settings, safety timeout). |
| `app.js` | UI wiring, conversation, timers/reminders, approval gating, render loop, visibility pause. |

**Interpolation:** on every state change, the current parameter vector (speed, tight, bright, density, ripple, stream, breathe, chaos) is eased (cubic in-out) toward the new targets over 450 ms. **Ring angles are accumulated** (`angle += dt·speed·ringSpeed`) and are never reset, so rings keep turning from where they were and only their speed changes.

## States
| State | Visuals | speed / tight / bright / density | Trigger (real event) | Allowed next |
|---|---|---|---|---|
| IDLE / Ready | steady core, slow orbit, breathing glow, rare ripple | .35 / 1.0 / .85 / .55 | default; end of speaking/task; Retry/Dismiss | sleeping, listening, thinking, working, error |
| SLEEPING | dim core, sparse particles, near-still rings | .04 / 1.05 / .30 / .10 | 90 s idle (or dev picker). Rendering is fully suspended when the tab is hidden | idle, listening |
| LISTENING | rings tighten (0.82), inward ripples driven by mic RMS | .30 / .82 / .90 / .55 | user taps Talk **and** getUserMedia succeeds. A separate "Mic on" chip + icon shows mic status | thinking, idle, error |
| THINKING | more active, organized orbits (axis wobble) | .95 / .92 / .95 / .90 | shown only while a processing promise is running. The dev picker labels it "Thinking (preview)" | speaking, working, approval, idle, error |
| SPEAKING | outward ripples + core brightening from output energy | .40 / 1.0 / 1.0 / .65 | reply playback starts; ends when playback ends | idle, listening, error |
| WORKING | directional outward particle streams, faster trails; label = real task stage | .70 / .95 / .95 / .80 | demo task steps ("Planning", "Running step 2 of 3…"). A % is shown only for the counted step 3 | approval, idle, error, speaking |
| AWAITING APPROVAL | calm steady glow, slow motion; focused modal card with Approve/Deny | .10 / 1.0 / .80 / .30 | task reaches a gated action. Step 3 does not start until Approve is tapped | working (approve), idle (deny), error |
| ERROR / PAUSED | reduced motion, red halo, icon + text message + Retry | .06 / 1.02 / .50 / .20 | mic failure, mic track ended, or simulated error. Never hidden behind a thinking animation | idle, thinking, working |

Every state change takes 450 ms. Ripples last about 1.4 s (2.2 s with Reduce Motion).

## Reduce Motion
Motion is scaled ×0.15, there is no camera parallax/sway, breathing is reduced, particles are cut by 40%, and ripples spawn at most every 0.9 s. Text labels and icons always show the state. Color is never the only signal.

## Quality tiers
| Tier | Particles | Trails | Pixel ratio | Ticks |
|---|---|---|---|---|
| High | 1400 | 10 | ≤2 | yes |
| Medium | 700 | 6 | ≤1.5 | yes |
| Low | 250 | 3 | 1 | no |
In Auto mode, the app drops one tier after 2 consecutive seconds below 45 FPS. The render loop stops completely on `visibilitychange` (hidden) and restarts when the tab is visible again.

## Compact design
Static SVG: a bright centre plus 1–2 arcs, with no particles. There are variants for all 8 states (thinking = two opposed arcs, working = arc + leading dot, approval = full calm ring, error = red arc). Previews are shown at 40 px and 24 px, along with a Dynamic Island-style strip mock. Compact surfaces show no private content. **Real Dynamic Island / Lock Screen presentations require a native iOS app with ActivityKit Live Activities (SwiftUI, system-limited update frequency, mostly static or system-animated). They are not implemented here.**

## Figma component plan (NOT created; Figma is not connected)
Components planned: Core/Full (8 state variants + reduced-motion variants), Core/Compact (40/24 px × 8 states), Main screen (iPhone, Mac 5-panel), Panel card, Approval card, Error card, Dock (Talk/Camera/Create/Missions/Control), Status chips, plus Color, Type, Spacing and Control styles. Each variant would carry the parameter values from the table above as notes.

## Runtime vs exportable
- **Needs runtime rendering:** particles, tapered trails, ripples, audio-reactive brightness, additive bloom, the accumulated ring rotation, and interpolation.
- **Exportable as assets:** ring arc geometry (separate per layer, so each can be animated independently), the tick ring, the core glow texture, and the compact SVGs. An exported GLB will **not** reproduce the glow, particles or trails.

## Voice assistant (local, no external AI/API)
**Flow:** tap Talk → LISTENING (recognition runs; the live transcript shows in the caption) → final text → THINKING (only while `brain.processText` runs, a ~350 ms minimum window) → optional WORKING (timer start) / AWAITING APPROVAL (anything that opens a site) → SPEAKING (speechSynthesis) → IDLE. If recognition is unsupported, the typed command box is always available.

**Intents:** greetings, small talk, identity, help; time, date, day; timers (real countdown in Task status, chime + toast + spoken alert); reminders ("in N minutes" / "at 5 pm", stored in localStorage; they fire only while the page is open); notes (add/read/clear, localStorage); math (+ − × ÷, powers, square root, "X percent of Y"); conversions (km↔mi, °C↔°F, kg↔lb, m↔ft, cm↔in); open websites (YouTube, Google, Maps, Gmail, Wikipedia, GitHub, X, …) and web search via Google; jokes/quotes (bundled); coin and dice; panel navigation (open missions/control/create/camera); sleep, wake, Reduce Motion on/off; stop/cancel (also cancels timers). Unknown requests get an honest reply plus an offer to search, and "yes" accepts the offer. **Every website open or search goes through the AWAITING APPROVAL card first.** The tab is opened inside the Approve tap so popup blockers allow it.

**Mic and recognition on iOS:** running `getUserMedia` and `SpeechRecognition` together can conflict on iOS Safari, so on iOS the analyser is **not** opened. Ripples are driven by recognition events (sound start, interim results) instead. On desktop browsers both run, and the analyser RMS drives the ripples.

**Speaking energy:** browsers do not expose `speechSynthesis` audio to WebAudio (iOS included), so the SPEAKING pulses are **not** a measurement of the voice signal. They come from a syllable-rate envelope that runs between utterance `start` and `end`, plus kicks on `boundary` (word) events. The earlier wordless tone has been removed.

## Honest implementation status
| Item | Status |
|---|---|
| Speech-to-text | **Real**: Web Speech API. Chrome sends audio to Google's speech service and needs a connection. Safari uses Apple's on-device or Siri recognition. Not testable in headless Chromium |
| Understanding | **Real but rule-based**: fixed intents only. There is no general knowledge, no memory beyond notes and reminders, and no LLM |
| Text-to-speech | **Real** speechSynthesis with an OS voice. Quality depends on the installed voices (enhanced or premium Siri voices on iPhone sound best) |
| Speaking pulses | Event- and envelope-driven, not real output audio (see above) |
| Timers / reminders | Real, but they run only while the page is open. No background or push notifications |
| Energy core renderer, 8 states, 450 ms interpolation, rotation continuity | **Real**, tested |
| Listening response to microphone level | **Real** mic RMS on desktop browsers. On iOS it comes from recognition events |
| Thinking | Shown while the local brain processes a command. The "Run demo task" flow is still simulated |
| Demo task / approval | Simulated steps; nothing is sent anywhere |
| Camera | Not connected; never activated |
| Integrations, user data, permissions, voice prefs of the real NED app | Not present. The existing NED code was not provided, so face avatars in the real app have **not** been replaced yet |
| Dynamic Island / Lock Screen | Mock preview only |
| Figma | Not created |
| FPS | Headless Chromium (SwiftShader) held ~60 FPS on all tiers (vsync-capped). This needs checking on a real iPhone |
