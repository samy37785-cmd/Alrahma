import { useEffect } from 'react';

/*
 * ContentGuard — deterrent layer against casual copying of the site.
 *
 * IMPORTANT: This is a DETERRENT, not real security. A public website's
 * front-end is always readable by the browser, so a determined user can
 * still bypass this. Real protection belongs on the backend/API.
 *
 * It blocks: right-click menu, text copy/cut/selection, image dragging,
 * and common DevTools / view-source shortcuts. It deliberately leaves
 * form fields usable and does NOT block printing (invoices need it).
 *
 * Active only in the production build, so local development isn't hindered.
 */

const isEditable = (el) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export default function ContentGuard() {
  useEffect(() => {
    if (!import.meta.env.PROD) return; // don't get in the way while developing

    const block = (e) => { if (!isEditable(e.target)) e.preventDefault(); };

    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      // F12 (DevTools)
      if (e.key === 'F12') { e.preventDefault(); return; }
      // Ctrl+Shift+I / J / C (DevTools, console, inspector)
      if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) { e.preventDefault(); return; }
      // Ctrl+U (view source) / Ctrl+S (save page)
      if (e.ctrlKey && !e.shiftKey && ['u', 's'].includes(k) && !isEditable(e.target)) { e.preventDefault(); }
    };

    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-select');

    // Friendly warning for anyone who opens the console anyway.
    try {
      console.log('%c⛔ محتوى محمي — Al-Rahma Academy © ' + new Date().getFullYear(),
        'color:#0b6e4f;font-size:16px;font-weight:bold');
      console.log('%cهذا الموقع وكل محتواه ملكية خاصة. النسخ أو إعادة الاستخدام غير مصرّح به.',
        'color:#666;font-size:12px');
    } catch { /* ignore */ }

    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', block);
      document.removeEventListener('selectstart', block);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-select');
    };
  }, []);

  return null;
}
