import { useEffect, useState } from 'react';

// Analytics consent — explicit opt-in, stored only in this browser.
//
// There are exactly three states: null (the visitor has not chosen yet),
// 'granted' and 'denied'. Only 'granted' ever lets Google Analytics load
// (see ./ga.js); both null and 'denied' mean nothing is loaded or sent.
// The choice can be changed at any time from "Cookie settings" (Footer,
// Privacy page), which re-opens the banner via openConsentSettings().

export const CONSENT_STORAGE_KEY = 'alrahma.analyticsConsent.v1';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

const CHANGE_EVENT = 'alrahma:analytics-consent-change';
const OPEN_EVENT = 'alrahma:analytics-consent-open';

// The choice made in this page session, so it still applies when
// localStorage is unavailable.
let sessionConsent = null;

export function readConsent() {
  if (sessionConsent) return sessionConsent;
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null;
  } catch {
    // Storage blocked (private mode, disabled cookies): treat as "not chosen",
    // which keeps analytics off.
    return null;
  }
}

export function writeConsent(value) {
  if (value !== CONSENT_GRANTED && value !== CONSENT_DENIED) return;
  sessionConsent = value;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // Still applied for this page view through the event below.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function useAnalyticsConsent() {
  const [consent, setConsent] = useState(readConsent);
  useEffect(() => {
    const onChange = (e) => setConsent(e.detail ?? readConsent());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  return consent;
}

// Test-only: module state survives between tests in the same file.
export function __resetConsentForTests() {
  sessionConsent = null;
}

export function useConsentSettingsRequests(onOpen) {
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [onOpen]);
}
