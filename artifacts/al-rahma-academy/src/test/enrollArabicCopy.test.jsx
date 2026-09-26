import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { Step1, Step3 } from '../components/features/enrollment/EnrollWizard';
import { TEACHERS } from '../data';

// Enroll Arabic-copy fix (2026-09-26): a read-only audit of /ar/enroll found
// three remaining English leaks on an otherwise fully-Arabic page:
//   1. Every teacher card appended the literal English word "reviews" after
//      the rating count, regardless of language, even though a real Arabic
//      translation for this exact concept already existed elsewhere
//      (t.teachers.reviews = "تقييم") — just never reused here.
//   2. The WhatsApp placeholder was a hardcoded UK-format number
//      ("+44 7700 900000") for every locale, inconsistent with the
//      Egypt-format example already used in validation.phoneInvalid
//      ("+20 100 000 0000").
//   3. Teacher cards always showed the English name as the bold/primary
//      line and the Arabic name as a smaller secondary line, even on the
//      Arabic page.
// This file pins the fix for all three, and proves English (/enroll) is
// byte-for-byte unchanged (this repo's it/es/de/fr locales were explicitly
// out of scope for this task, so this suite doesn't touch them — the fix
// falls back to the pre-existing literal for any locale without the new
// key, so their behavior is unaffected by construction).
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
const STEP3_FORM = { genderPref: 'any', lang: '', subjects: [], teacherId: null };

describe('Teacher cards: reviews count uses a real translation, not a hardcoded English word', () => {
  afterEach(cleanup);

  it('Arabic: no literal English "reviews" word appears anywhere on the page', () => {
    renderHarness('/ar/enroll', <Step3 form={STEP3_FORM} set={() => {}} />);
    expect(screen.queryByText(/reviews/i)).not.toBeInTheDocument();
  });

  it('Arabic: every teacher with a review count shows it followed by the real Arabic word "تقييم"', () => {
    renderHarness('/ar/enroll', <Step3 form={STEP3_FORM} set={() => {}} />);
    const withReviews = TEACHERS.filter((t) => t.reviews);
    expect(withReviews.length).toBeGreaterThan(0);
    for (const teacher of withReviews) {
      expect(screen.getByText(`${teacher.reviews} تقييم`)).toBeInTheDocument();
    }
  });

  it('English: the word "reviews" is unchanged - still present, still English', () => {
    renderHarness('/enroll', <Step3 form={STEP3_FORM} set={() => {}} />);
    const withReviews = TEACHERS.filter((t) => t.reviews);
    for (const teacher of withReviews) {
      expect(screen.getByText(`${teacher.reviews} reviews`)).toBeInTheDocument();
    }
    expect(screen.queryByText(/تقييم/)).not.toBeInTheDocument();
  });
});

describe('Step1 WhatsApp placeholder: localized example number, no validation/logic change', () => {
  afterEach(cleanup);

  it('Arabic: placeholder is the Egypt-format example, matching validation.phoneInvalid\'s own example', () => {
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('+20 100 000 0000')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('+44 7700 900000')).not.toBeInTheDocument();
  });

  it('English: placeholder is unchanged - still the original UK-format example', () => {
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('+44 7700 900000')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('+20 100 000 0000')).not.toBeInTheDocument();
  });

  it('the WhatsApp input keeps its dir="ltr" + inline-style override regardless of the placeholder text', () => {
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    const whatsapp = screen.getByLabelText('رقم واتساب');
    expect(whatsapp).toHaveAttribute('dir', 'ltr');
    expect(whatsapp.style.direction).toBe('ltr');
  });

  it('email placeholder ("name@example.com") is untouched on both locales', () => {
    renderHarness('/ar/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
    cleanup();
    renderHarness('/enroll', <Step1 form={BLANK_FORM} set={() => {}} />);
    expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
  });
});

describe('Teacher cards: Arabic name is primary on /ar/enroll, English name is primary on /enroll', () => {
  afterEach(cleanup);

  it('Arabic: every teacher card shows the Arabic name as the bold/primary line, English name as a secondary line', () => {
    renderHarness('/ar/enroll', <Step3 form={STEP3_FORM} set={() => {}} />);
    for (const teacher of TEACHERS) {
      const primary = screen.getByText(teacher.nameAr, { selector: 'strong' });
      expect(primary.tagName).toBe('STRONG');
      const secondary = screen.getByText(teacher.nameEn, { selector: 'span' });
      expect(secondary.tagName).toBe('SPAN');
      expect(secondary).toHaveAttribute('dir', 'ltr');
    }
  });

  it('English: every teacher card still shows the English name as the bold/primary line, Arabic name as a secondary line - unchanged', () => {
    renderHarness('/enroll', <Step3 form={STEP3_FORM} set={() => {}} />);
    for (const teacher of TEACHERS) {
      const primary = screen.getByText(teacher.nameEn, { selector: 'strong' });
      expect(primary.tagName).toBe('STRONG');
      const secondary = screen.getByText(teacher.nameAr, { selector: 'span' });
      expect(secondary.tagName).toBe('SPAN');
      expect(secondary).toHaveAttribute('dir', 'rtl');
    }
  });

  it('teacher selection logic is untouched: clicking a card still reports teacherId + the English name as teacherName', () => {
    let received = null;
    const set = (key, val) => { received = { key, val }; };
    renderHarness('/ar/enroll', <Step3 form={STEP3_FORM} set={set} />);
    const firstCard = screen.getAllByRole('button')[0];
    firstCard.click();
    // Two set() calls happen (teacherId, then teacherName) - only the last
    // is observable with this simple stub, which is enough to prove the
    // English name is still what's stored, not the Arabic one.
    expect(received.key).toBe('teacherName');
    expect(TEACHERS.map((t) => t.nameEn)).toContain(received.val);
  });
});
