import { langFromPath } from '../utils/localePath';
import { CONSENT_GRANTED, readConsent } from './consent';

// Google Analytics 4 — loaded ONLY after explicit analytics consent.
//
// The Measurement ID comes from VITE_GA_MEASUREMENT_ID (set in the Vercel
// project's environment, never committed). With no valid ID configured,
// every function here is a no-op and the consent banner is not shown.
//
// Privacy rules enforced here, not left to call sites:
//  - Nothing is loaded or sent until loadGa() runs, and the Analytics
//    component only calls it when consent === 'granted'.
//  - page_location / page_path are always origin + pathname: no query
//    string, no hash (they can carry prefilled form values or referral ids).
//  - Only the events and parameters in EVENT_PARAMS are ever sent, and each
//    value is validated against a strict pattern, so a caller cannot leak a
//    name, email, phone number or form value by accident.

export const GA_SCRIPT_ID = 'alrahma-ga4';
const MEASUREMENT_ID_RE = /^G-[A-Z0-9]{4,20}$/;

const EVENT_PARAMS = {
  page_view: ['page_path', 'page_location', 'site_lang'],
  enroll_view: ['page_path', 'site_lang'],
  enroll_step_view: ['page_path', 'site_lang', 'step'],
  whatsapp_click: ['page_path', 'site_lang'],
  email_click: ['page_path', 'site_lang'],
  faq_show_all: ['page_path', 'site_lang'],
  adhkar_category_change: ['page_path', 'site_lang', 'category'],
};

const PARAM_VALIDATORS = {
  page_path: (v) => typeof v === 'string' && /^\/[^?#\s]*$/.test(v) && v.length <= 200,
  page_location: (v) => typeof v === 'string' && /^https?:\/\/[^?#\s]+$/.test(v) && v.length <= 300,
  site_lang: (v) => typeof v === 'string' && /^[a-z]{2}$/.test(v),
  step: (v) => Number.isInteger(v) && v >= 1 && v <= 10,
  category: (v) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z_]{0,31}$/.test(v),
};

let lastPagePath = null;

export function getMeasurementId() {
  const raw = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return MEASUREMENT_ID_RE.test(id) ? id : null;
}

export function currentSiteLang() {
  return langFromPath(window.location.pathname).lang || 'en';
}

function cleanLocation() {
  return window.location.origin + window.location.pathname;
}

function isLoaded() {
  return typeof window.gtag === 'function' && !!document.getElementById(GA_SCRIPT_ID);
}

// Page components' mount effects run before the Analytics component's own
// effects, so an event fired on first render must be able to bring GA up
// itself — but only ever with a configured ID and granted consent.
function ensureActive() {
  const id = getMeasurementId();
  if (!id || readConsent() !== CONSENT_GRANTED) return false;
  loadGa(id);
  return true;
}

export function sanitizeParams(eventName, params = {}) {
  const allowed = EVENT_PARAMS[eventName];
  if (!allowed) return null;
  const out = {};
  for (const key of allowed) {
    const value = params[key];
    if (value !== undefined && PARAM_VALIDATORS[key](value)) out[key] = value;
  }
  return out;
}

// Idempotent: a second call (StrictMode, consent toggled back on, a second
// mounted component) never injects a second tag.
export function loadGa(id) {
  if (!id) return;
  window[`ga-disable-${id}`] = false;
  if (isLoaded()) return;

  window.dataLayer = window.dataLayer || [];
  // gtag must push the real `arguments` object, not an array copy.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', id, {
    send_page_view: false,
    page_location: cleanLocation(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

// Consent withdrawn: stop all further sends for this page session and remove
// the GA cookies already set. (A loaded script cannot be unloaded; the
// documented ga-disable flag makes it inert.)
export function disableGa(id) {
  if (!id) return;
  window[`ga-disable-${id}`] = true;
  lastPagePath = null;
  deleteGaCookies();
}

function deleteGaCookies() {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.replace(/^www\./, '')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

function send(eventName, params) {
  const safe = sanitizeParams(eventName, params);
  if (!safe) return;
  window.gtag('event', eventName, safe);
}

// One page_view per distinct pathname; query-string or hash-only changes do
// not count as a new page.
export function trackPageView() {
  if (!ensureActive()) return;
  const path = window.location.pathname;
  if (path === lastPagePath) return;
  lastPagePath = path;
  const location = cleanLocation();
  window.gtag('set', { page_location: location });
  send('page_view', { page_path: path, page_location: location, site_lang: currentSiteLang() });
}

export function trackEvent(eventName, params = {}) {
  if (!ensureActive()) return;
  // Keep page_view first for this page even when the event fires earlier.
  trackPageView();
  send(eventName, {
    ...params,
    page_path: window.location.pathname,
    site_lang: currentSiteLang(),
  });
}

// Test-only: module state survives between tests in the same file.
export function __resetGaForTests() {
  lastPagePath = null;
}
