// Compact core: static SVG (bright centre + 1–2 arcs, no particles). Used for small sizes / system-surface previews.
const ARC = { // state -> arcs [startDeg, sweepDeg, radiusFrac, opacity], centre opacity
  idle:      { arcs: [[200, 250, .78, .9]], c: .9 },
  sleeping:  { arcs: [[220, 120, .78, .35]], c: .35 },
  listening: { arcs: [[200, 250, .62, .95], [30, 120, .86, .5]], c: .9 },
  thinking:  { arcs: [[0, 110, .78, .9], [180, 110, .78, .9]], c: .85 },
  speaking:  { arcs: [[200, 250, .72, .95], [20, 300, .92, .35]], c: 1 },
  working:   { arcs: [[300, 200, .78, .95]], c: .9, arrow: true },
  approval:  { arcs: [[0, 359.9, .78, .55]], c: .8, pause: true },
  error:     { arcs: [[200, 250, .78, .9]], c: .6, red: true },
};
function arcPath(cx, r, a0, sw) {
  const rad = d => d * Math.PI / 180, x0 = cx + r * Math.cos(rad(a0)), y0 = cx + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sw)), y1 = cx + r * Math.sin(rad(a0 + sw));
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${sw > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
let uid = 0;
export function compactSVG(state, size = 40) {
  const d = ARC[state] || ARC.idle, h = size / 2, id = 'cg' + (uid++), col = d.red ? '#FF5A4E' : '#FFB547';
  const sw = Math.max(1.2, size / 18);
  const arcs = d.arcs.map(([a, s, rf, o]) => `<path d="${arcPath(h, h * rf, a, s)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${o}"/>`).join('');
  const extra = d.arrow ? `<circle cx="${h + h * .78}" cy="${h}" r="${sw * .9}" fill="#FFE7B0"/>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="NED ${state}">
  <defs><radialGradient id="${id}"><stop offset="0" stop-color="#FFE7B0"/><stop offset=".35" stop-color="#FFB547" stop-opacity=".55"/><stop offset="1" stop-color="#FFB547" stop-opacity="0"/></radialGradient></defs>
  <circle cx="${h}" cy="${h}" r="${h * .5}" fill="url(#${id})" opacity="${d.c}"/>${arcs}${extra}</svg>`;
}
export const COMPACT_STATES = Object.keys(ARC);
