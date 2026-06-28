import { useCallback, useState } from 'react';

export function useQuranVerseActions({
  selectedVerses, displayVerses,
  setRevealed, setOpenTafsir, setCopiedKey, setJumpVerse,
}) {
  const [cardVerse, setCardVerse] = useState(null);
  const toggleReveal = useCallback(
    (key) => setRevealed((p) => ({ ...p, [key]: !p[key] })),
    [setRevealed],
  );

  const revealAll = useCallback(() => {
    const m = {};
    selectedVerses.forEach((v) => (m[v.verse_key] = true));
    setRevealed(m);
  }, [selectedVerses, setRevealed]);

  const hideAll = useCallback(() => setRevealed({}), [setRevealed]);

  const toggleTafsir = useCallback(
    (key) => setOpenTafsir((p) => ({ ...p, [key]: !p[key] })),
    [setOpenTafsir],
  );

  const copyVerse = useCallback(async (verse) => {
    const clean = (html = '') =>
      html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    const parts = [verse.text_uthmani];
    if (verse.translations?.[0]) parts.push(clean(verse.translations[0].text));
    parts.push(`[${verse.verse_key}]`);
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopiedKey(`copy-${verse.verse_key}`);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch { /* ignore */ }
  }, [setCopiedKey]);

  const shareVerse = useCallback(async (verse) => {
    const [s, v] = verse.verse_key.split(':');
    const url = `${window.location.origin}/tools/quran-reader#s=${s}&v=${v}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(`share-${verse.verse_key}`);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch { /* ignore */ }
  }, [setCopiedKey]);

  const doJumpVerse = useCallback((numStr) => {
    const n = parseInt(numStr);
    if (!n || n < 1) return;
    const target = displayVerses[n - 1];
    if (!target) return;
    const el = document.getElementById(`v-${target.verse_key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setJumpVerse('');
  }, [displayVerses, setJumpVerse]);

  const showCard = useCallback((verse) => setCardVerse(verse), []);
  const closeCard = useCallback(() => setCardVerse(null), []);

  return { toggleReveal, revealAll, hideAll, toggleTafsir, copyVerse, shareVerse, doJumpVerse, cardVerse, showCard, closeCard };
}
