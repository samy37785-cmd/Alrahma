// Shared trigger for the self-hosted Amiri (Arabic) webfont — see main.jsx
// for why it's not loaded eagerly for every page. Split out so pages whose
// content is mostly Arabic script (Teachers, Quran) can call it immediately
// on mount instead of waiting for the generic idle-callback: those pages
// measured the largest layout shift in field testing, because on a throttled
// mobile connection the gap between "fallback font paints" and "Amiri swaps
// in" (font-display: swap) stretches out and the reflow becomes visible.
// Starting the fetch as soon as the page mounts — rather than after idle —
// shrinks that gap. Idempotent: dynamic import() is deduped by the module
// cache, so calling this from both main.jsx and a page component is safe.
let triggered = false;

export function loadArabicFontsNow() {
  if (triggered) return;
  triggered = true;
  import('@fontsource/amiri/arabic-400.css');
  import('@fontsource/amiri/arabic-700.css');
}

export function loadArabicFontsIdle() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadArabicFontsNow, { timeout: 2000 });
  } else {
    setTimeout(loadArabicFontsNow, 1200);
  }
}
