import { useEffect } from 'react';

/*
 * ContentGuard — a lightweight copyright notice in the browser console.
 *
 * NOTE: We deliberately do NOT block right-click, text selection, copy, or the
 * DevTools shortcuts. Those measures are trivially bypassed, hurt real users
 * (accessibility tools, password managers, people quoting an ayah), and give a
 * false sense of security. A public website's front-end is always readable by
 * the browser — real protection belongs on the backend/API, which is where the
 * paid course content is actually gated (see the server-side resource guard).
 *
 * All this component does now is print a friendly ownership notice for anyone
 * who opens the console. It renders nothing.
 */
export default function ContentGuard() {
  useEffect(() => {
    if (!import.meta.env.PROD) return; // keep the console clean while developing
    try {
      console.log(
        '%c⛔ محتوى محمي — Al-Rahma Academy © ' + new Date().getFullYear(),
        'color:#0b6e4f;font-size:16px;font-weight:bold'
      );
      console.log(
        '%cهذا الموقع وكل محتواه ملكية خاصة. النسخ أو إعادة الاستخدام غير مصرّح به.',
        'color:#666;font-size:12px'
      );
    } catch { /* ignore */ }
  }, []);

  return null;
}
