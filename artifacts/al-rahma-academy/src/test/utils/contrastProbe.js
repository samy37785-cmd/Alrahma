// Independent text-contrast probe for real-browser tests (Accessibility Wave 4).
// Runs in the page (pass it to page.evaluate). It does NOT read any expected
// colour from the app: it takes the computed colours of every visible text
// element under `rootSel`, alpha-composites the text over the background stack
// it actually sits on (ancestor background colours, every colour stop of an
// ancestor gradient as a separate candidate, ancestor opacity), and returns the
// WCAG 2.x ratio against the WORST candidate.
//
// Returned rows: { sig, text, fg, bg, ratio, large, required, disabled, symbol }
//   large    WCAG large text (>= 24px, or >= 18.66px and weight >= 700), computed
//   required 3 for large text, 4.5 otherwise
//   disabled inside a disabled control (WCAG 1.4.3 exemption; reported, not hidden)
//   symbol   no letter or digit (icons / emoji glyphs; not text for 1.4.3)
export function contrastProbe(rootSel) {
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
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const backgrounds = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
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
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const sigOf = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => '.' + c).join('')}`;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.right <= 1 || r.left >= window.innerWidth - 1) return false; // off-canvas drawers (incl. a sub-pixel edge sliver)
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    // visually-hidden helpers (clip / 1px boxes) are not visible text
    if (r.width <= 1 && r.height <= 1) return false;
    return true;
  };

  const rows = [];
  const root = document.querySelector(rootSel);
  if (!root) return rows;
  const els = [root, ...root.querySelectorAll('*')];
  for (const el of els) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'OPTION'].includes(el.tagName.toUpperCase())) continue;
    let text = '';
    if (el.tagName === 'SELECT') text = el.selectedOptions[0]?.textContent || '';
    else if (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'hidden'].includes(el.type)) text = el.value || '';
    else text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
    text = text.replace(/\s+/g, ' ').trim();
    if (!text || !shown(el)) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color);
    const fg = { ...fg0, a: fg0.a * opacityOf(el) };
    let worst = null;
    for (const bg of backgrounds(el)) {
      const f = over(fg, bg);
      const r = ratioOf(f, bg);
      if (!worst || r < worst.ratio) worst = { ratio: r, fg: hex(f), bg: hex(bg) };
    }
    const px = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    rows.push({
      sig: sigOf(el), text: text.slice(0, 40), fg: worst.fg, bg: worst.bg,
      ratio: Math.floor(worst.ratio * 100) / 100, px, weight, large, required: large ? 3 : 4.5,
      disabled: !!el.closest('button:disabled, select:disabled, input:disabled, [aria-disabled="true"]'),
      symbol: !/[\p{L}\p{N}]/u.test(text),
    });
  }
  return rows;
}
