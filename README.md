# NED — Energy Core Demo
Standalone web demo of NED's abstract holographic energy core. Open `index.html` via any static server. See `SPEC.md`. Three.js (MIT) is vendored in `/vendor`. There are no paid dependencies.

## Home screen install
Open the site in Safari on iPhone, tap Share, then Add to Home Screen. NED gets its own icon, opens full screen, and works offline after the first visit (`sw.js` caches every file). Bump `VERSION` in `sw.js` whenever files change so installed copies update.
