import { useEffect } from 'react';

/*
  Tawk.to live chat widget.
  Replace TAWK_PROPERTY_ID and TAWK_WIDGET_ID with your Tawk.to credentials.
  Get them from: https://dashboard.tawk.to → Administration → Chat Widget → Direct Chat Link

  Format: https://embed.tawk.to/{propertyId}/{widgetId}

  To disable in development, set VITE_TAWK_PROPERTY_ID="" in your .env.local
*/
const TAWK_PROPERTY_ID = import.meta.env.VITE_TAWK_PROPERTY_ID || 'YOUR_PROPERTY_ID';
const TAWK_WIDGET_ID   = import.meta.env.VITE_TAWK_WIDGET_ID   || 'default';

export default function LiveChat() {
  useEffect(() => {
    if (!TAWK_PROPERTY_ID || TAWK_PROPERTY_ID === 'YOUR_PROPERTY_ID') return;
    if (document.getElementById('tawk-script')) return;

    window.Tawk_API  = window.Tawk_API  || {};
    window.Tawk_LoadStart = new Date();

    const s = document.createElement('script');
    s.id    = 'tawk-script';
    s.async = true;
    s.src   = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.head.appendChild(s);

    return () => {
      const el = document.getElementById('tawk-script');
      if (el) el.remove();
    };
  }, []);

  return null;
}
