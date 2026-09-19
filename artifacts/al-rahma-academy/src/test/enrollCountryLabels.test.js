import { describe, it, expect } from 'vitest';
import { COUNTRIES } from '../components/features/enrollment/EnrollWizard';
import { ENROLL_COUNTRY_NAMES_AR } from '../i18n/enroll/countries';

// Arabic Cross-Page Shell Repair (2026-09-xx): EnrollWizard.jsx's country
// <select> used to render each COUNTRIES entry as both the visible text AND
// the value submitted to the backend (form.country, sent unchanged through
// submitEnrollment()). The fix separates the two: COUNTRIES stays the exact
// submitted value, and ENROLL_COUNTRY_NAMES_AR is a DISPLAY-only lookup for
// Arabic. This test protects the submitted value from ever silently
// changing (which would happen if someone "translated" COUNTRIES itself
// instead of adding a display-only lookup), and checks the Arabic lookup
// stays complete and in sync with it.
const EXPECTED_COUNTRIES = [
  'United Kingdom', 'Italy', 'France', 'Germany', 'Spain', 'Netherlands',
  'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Denmark', 'Norway',
  'United States', 'Canada', 'Australia', 'New Zealand',
  'Egypt', 'Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Jordan', 'Morocco',
  'Tunisia', 'Algeria', 'Turkey', 'Other',
];

describe('Enroll country list: submitted value protection', () => {
  it('COUNTRIES (the value sent to the backend) is byte-for-byte unchanged', () => {
    expect(COUNTRIES).toEqual(EXPECTED_COUNTRIES);
  });

  it('every COUNTRIES entry is unaffected in type/order by the Arabic display-name addition', () => {
    expect(COUNTRIES.every((c) => typeof c === 'string')).toBe(true);
    expect(COUNTRIES.length).toBe(27);
  });
});

describe('Enroll country list: Arabic display-name completeness', () => {
  it('every COUNTRIES entry has a corresponding Arabic display name', () => {
    const missing = COUNTRIES.filter((c) => !(c in ENROLL_COUNTRY_NAMES_AR));
    expect(missing).toEqual([]);
  });

  it('no ENROLL_COUNTRY_NAMES_AR entry is orphaned (stale, no longer in COUNTRIES)', () => {
    const orphaned = Object.keys(ENROLL_COUNTRY_NAMES_AR).filter((c) => !COUNTRIES.includes(c));
    expect(orphaned).toEqual([]);
  });

  it('every Arabic display name is a non-empty string distinct from its English key (sanity: real translations, not copies)', () => {
    const notTranslated = Object.entries(ENROLL_COUNTRY_NAMES_AR)
      .filter(([en, ar]) => typeof ar !== 'string' || ar.trim() === '' || ar === en)
      .map(([en]) => en);
    expect(notTranslated).toEqual([]);
  });
});
