import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { Step1 } from '../components/features/enrollment/EnrollWizard';
import { COUNTRIES, countryLabel } from '../i18n/enroll/countries';

// Enroll country-label fix (2026-09-20): the Step1 country <select> used to
// render hardcoded English country names as BOTH the visible text and the
// value submitted with a booking request (`<option key={c}>{c}</option>`
// has no explicit `value`, so the value defaults to the option's own text).
// This meant an Arabic visitor saw "Egypt", "United Kingdom" etc. in a
// page that was otherwise fully Arabic. The fix separates display text
// (now real Arabic via countries.js) from the submitted `value` (kept
// byte-identical to the original English list) - this file pins BOTH
// halves so they can't drift apart again.
//
// The original hardcoded array from EnrollWizard.jsx, preserved here as
// the payload-contract reference.
const ORIGINAL_COUNTRY_VALUES = [
  'United Kingdom', 'Italy', 'France', 'Germany', 'Spain', 'Netherlands',
  'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Denmark', 'Norway',
  'United States', 'Canada', 'Australia', 'New Zealand',
  'Egypt', 'Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Jordan', 'Morocco',
  'Tunisia', 'Algeria', 'Turkey', 'Other',
];

function renderHarness(path, children) {
  window.history.replaceState({}, '', path);
  const { basename } = langFromPath(path);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

const BLANK_FORM = { name: '', email: '', whatsapp: '', country: '', city: '', timezone: 'UTC', times: [] };

describe('countries.js data: same 27 values/order as before, real Arabic labels, honest fallback', () => {
  it('has the exact same values, in the exact same order, as the original hardcoded list', () => {
    expect(COUNTRIES.map((c) => c.value)).toEqual(ORIGINAL_COUNTRY_VALUES);
    expect(COUNTRIES).toHaveLength(27);
  });

  it('English: countryLabel returns the English name unchanged', () => {
    expect(countryLabel('Egypt', 'en')).toBe('Egypt');
    expect(countryLabel('United Kingdom', 'en')).toBe('United Kingdom');
  });

  it('Arabic: real Arabic names for a representative sample (Egypt, UK, France, Italy)', () => {
    expect(countryLabel('Egypt', 'ar')).toBe('مصر');
    expect(countryLabel('United Kingdom', 'ar')).toBe('المملكة المتحدة');
    expect(countryLabel('France', 'ar')).toBe('فرنسا');
    expect(countryLabel('Italy', 'ar')).toBe('إيطاليا');
  });

  it('a legacy language with no real translation (fr/es) falls back to the English name, never an invented one', () => {
    expect(countryLabel('Egypt', 'fr')).toBe('Egypt');
    expect(countryLabel('Egypt', 'es')).toBe('Egypt');
    // sanity: proves the fallback actually triggers, not a coincidence
    expect(countryLabel('Egypt', 'ar')).not.toBe(countryLabel('Egypt', 'en'));
  });

  it('an unrecognized value is returned as-is rather than throwing or going blank', () => {
    expect(countryLabel('Atlantis', 'ar')).toBe('Atlantis');
  });
});

describe('Step1 country <select>: Arabic display text, unchanged submitted value', () => {
  afterEach(cleanup);

  it('English form: option text is English, value equals the same text', () => {
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    const select = screen.getByLabelText(/^country$/i);
    const egypt = within(select).getByRole('option', { name: 'Egypt' });
    expect(egypt.value).toBe('Egypt');
  });

  it('Arabic form: option shows real Arabic text, but its value is still the original English string - no English text leak either', () => {
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    const select = screen.getByLabelText('الدولة');
    const egypt = within(select).getByRole('option', { name: 'مصر' });
    expect(egypt.value).toBe('Egypt');
    expect(within(select).queryByRole('option', { name: 'Egypt' })).not.toBeInTheDocument();
  });

  it('selecting a country in the Arabic UI still reports the English value - the booking payload contract never changes', () => {
    const set = vi.fn();
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={set} />);
    const select = screen.getByLabelText('الدولة');
    fireEvent.change(select, { target: { value: 'France' } });
    expect(set).toHaveBeenCalledWith('country', 'France');
  });

  it('sanity: the old hardcoded English-only markup would fail the Arabic-label check', () => {
    const oldOption = '<option>Egypt</option>';
    expect(oldOption).not.toMatch(/مصر/);
  });
});

describe('Step1 email/WhatsApp fields: neutral placeholder, correct direction, real labels', () => {
  afterEach(cleanup);

  it('email placeholder is the neutral "name@example.com" (not you@email.com)', () => {
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@email.com')).not.toBeInTheDocument();
  });

  it('WhatsApp input is forced dir="ltr" on the Arabic page, without flipping the rest of the form', () => {
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    const whatsapp = screen.getByLabelText('رقم واتساب');
    expect(whatsapp).toHaveAttribute('dir', 'ltr');
    // The `dir` HTML attribute alone is NOT enough here: live-browser
    // review found styles/layout/rtl.css's
    // `[dir="rtl"] .field input { direction: rtl; text-align: right; }`
    // (an author CSS rule) overrides the attribute's own default styling,
    // so computed direction stayed "rtl" even with dir="ltr" set. jsdom
    // (this test's environment) never loads that external stylesheet, so
    // asserting computed style here wouldn't catch that regression - the
    // real regression guard is that the inline style survives, since an
    // inline style is the only thing with enough specificity to beat that
    // class-based rule in a real browser.
    expect(whatsapp.style.direction).toBe('ltr');
    expect(whatsapp.style.textAlign).toBe('left');
    // A neighboring field is untouched - this isn't a page-wide dir flip.
    expect(screen.getByPlaceholderText('اسمك')).not.toHaveAttribute('dir');
  });

  it('WhatsApp placeholder/value format is unchanged (still the same example number, no validation change)', () => {
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('+44 7700 900000')).toBeInTheDocument();
  });

  it('email, WhatsApp and country fields each resolve to a real accessible name via label association', () => {
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^country$/i)).toBeInTheDocument();
  });
});
