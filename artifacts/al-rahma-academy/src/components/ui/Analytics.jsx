import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { site } from '../../data/site';
import { CONSENT_GRANTED, useAnalyticsConsent } from '../../analytics/consent';
import { getMeasurementId, loadGa, disableGa, trackPageView, trackEvent } from '../../analytics/ga';

// Consent-aware Google Analytics 4 (see src/analytics/ga.js for the privacy
// rules and docs/analytics.md for configuration). Renders nothing.

// Only links to the academy's own WhatsApp number / email address count as
// contact clicks; recipient-less WhatsApp share links do not. The number and the
// address themselves are never sent — only the event name.
export function contactEventForHref(href) {
  if (typeof href !== 'string') return null;
  if (href.startsWith(`https://wa.me/${site.whatsapp}`)) return 'whatsapp_click';
  if (href.toLowerCase().startsWith(`mailto:${site.email.toLowerCase()}`)) return 'email_click';
  return null;
}

export default function Analytics() {
  const location = useLocation();
  const consent = useAnalyticsConsent();
  const id = getMeasurementId();
  const enabled = !!id && consent === CONSENT_GRANTED;

  useEffect(() => {
    if (!id) return;
    if (enabled) loadGa(id);
    else disableGa(id);
  }, [id, enabled]);

  // location.pathname is basename-relative (/enroll under /ar); trackPageView
  // reads the full window.location.pathname itself.
  useEffect(() => {
    if (enabled) trackPageView();
  }, [enabled, location.pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onClick = (e) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      const eventName = link ? contactEventForHref(link.getAttribute('href')) : null;
      if (eventName) trackEvent(eventName);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enabled]);

  return null;
}
