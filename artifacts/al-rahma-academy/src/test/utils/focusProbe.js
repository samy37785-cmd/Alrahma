// Independent keyboard-focus probe for real-browser tests (Accessibility Wave 5).
// Runs in the page (pass it to page.evaluate with a selector). It reads only what the
// browser computed for the currently focused element and what is painted around it:
//
//   outline        computed style / width / offset / colour of the focus indicator
//   ratio          WCAG contrast of that indicator against the WORST background it can sit on
//                  (ancestor colours alpha-composited, every colour stop of a gradient as a
//                  separate candidate), after the element's own and its ancestors' opacity
//   effOpacity     product of the element's and all ancestors' opacity (a faded button fades
//                  its outline too)
//   hit            elementFromPoint at the centre is the element itself (nothing covers it)
//   clippedBy      the first ancestor whose overflow clip would cut the indicator, or 'viewport'
//   focusVisible   element.matches(':focus-visible')
// Position:fixed elements escape the clip of everything above them, so the walk stops there.
export function focusProbe(sel) {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bot) => {
    const a = top.a + bot.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const ch = (k) => (top[k] * top.a + bot[k] * bot.a * (1 - top.a)) / a;
    return { r: ch('r'), g: ch('g'), b: ch('b'), a };
  };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratioOf = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  const backdrops = (start) => {
    const layers = [];
    for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      const stops = img && img !== 'none' && /gradient/.test(img) ? [...img.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])) : [];
      const col = parse(cs.backgroundColor);
      if (stops.length) layers.push({ stops });
      if (col && col.a > 0) layers.push({ solid: col });
      if ((col && col.a === 1) || (stops.length && stops.every((s) => s.a === 1))) break;
    }
    let cands = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const L = layers[i];
      cands = L.solid ? cands.map((c) => over(L.solid, c)) : cands.flatMap((c) => L.stops.map((s) => over(s, c)));
    }
    return cands;
  };

  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const width = parseFloat(cs.outlineWidth) || 0;
  const offset = parseFloat(cs.outlineOffset) || 0;
  const drawn = cs.outlineStyle !== 'none' && cs.outlineStyle !== 'hidden' && width > 0;
  const ext = drawn ? Math.max(0, width + offset) : 0;
  const ring = { l: r.left - ext, t: r.top - ext, r: r.right + ext, b: r.bottom + ext };

  let effOpacity = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) effOpacity *= Number(getComputedStyle(n).opacity);

  let clippedBy = null;
  if (ring.l < -0.5 || ring.r > window.innerWidth + 0.5) clippedBy = 'viewport';
  for (let n = el; n && n !== document.documentElement && !clippedBy; n = n.parentElement) {
    const c = getComputedStyle(n);
    if (n !== el && /(hidden|clip|auto|scroll)/.test(c.overflowX + c.overflowY)) {
      const pr = n.getBoundingClientRect();
      if (ring.l < pr.left - 0.5 || ring.r > pr.right + 0.5 || ring.t < pr.top - 0.5 || ring.b > pr.bottom + 0.5) clippedBy = `${n.tagName.toLowerCase()}.${[...n.classList].join('.')}`;
    }
    if (c.position === 'fixed') break;
  }

  const o = parse(cs.outlineColor);
  let ratio = null;
  if (drawn && o) {
    const ink = { ...o, a: o.a * effOpacity };
    ratio = Infinity;
    for (const bg of backdrops(el.parentElement)) ratio = Math.min(ratio, ratioOf(over(ink, bg), bg));
    ratio = Math.floor(ratio * 100) / 100;
  }

  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return {
    sel,
    name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40),
    focusVisible: el.matches(':focus-visible'),
    focused: document.activeElement === el,
    outline: { style: cs.outlineStyle, width, offset, color: cs.outlineColor },
    drawn, ratio, effOpacity: Math.round(effOpacity * 100) / 100,
    hit: top === el || el.contains(top),
    clippedBy,
    rect: { l: r.left, t: r.top, w: r.width, h: r.height },
    inViewport: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
  };
}
