import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Google Analytics 4. The Measurement ID is supplied via the VITE_GA_ID env
// var (set it in Vercel → Settings → Environment Variables, e.g. G-XXXXXXX).
// When it's unset — local dev, previews, or before you create the GA property —
// this component is a no-op, so nothing breaks and no tracking fires.
const GA_ID = import.meta.env.VITE_GA_ID;

export default function Analytics() {
  const location = useLocation();

  // Load gtag.js once.
  useEffect(() => {
    if (!GA_ID || window.gtag) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    // We send page views manually on route change (SPA), so disable the auto one.
    gtag('config', GA_ID, { send_page_view: false });
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
