import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Google Analytics 4 — set VITE_GA_ID in Vercel env vars (e.g. G-XXXXXXX).
const GA_ID = import.meta.env.VITE_GA_ID;
// Microsoft Clarity — set VITE_CLARITY_ID in env vars (e.g. abc123xyz).
const CLARITY_ID = import.meta.env.VITE_CLARITY_ID;

export default function Analytics() {
  const location = useLocation();

  // Load GA4 + Clarity once on mount.
  useEffect(() => {
    // ── Google Analytics 4 ─────────────────────────────────────
    if (GA_ID && !window.gtag) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', GA_ID, { send_page_view: false });
    }

    // ── Microsoft Clarity ──────────────────────────────────────
    if (CLARITY_ID && !window.clarity) {
      window.clarity = window.clarity || function () {
        (window.clarity.q = window.clarity.q || []).push(arguments);
      };
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
      document.head.appendChild(s);
    }
  }, []);

  // Report a page view on every client-side navigation.
  useEffect(() => {
    if (!GA_ID || !window.gtag) return;
    window.gtag('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location]);

  return null;
}
