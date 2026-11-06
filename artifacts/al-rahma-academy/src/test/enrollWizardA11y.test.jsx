import { describe, it, expect } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Enroll from '../pages/Enroll';
import en from '../i18n/en';

// Site critique (2026-11-06): on /enroll three step-1 fields had no label tied
// to them (the required name field was announced only by its placeholder), the
// choice tiles never said which ones were picked, a validation error was not
// announced, and a new step left a phone visitor under its fields.

useFullPageEnvironment();

const s1 = en.enroll.step1;

describe('/enroll step 1 is labelled and announces its state', () => {
  it('ties every field to its label, with autofill hints', async () => {
    await mountFullPage('/enroll', Enroll);
    expect(screen.getByLabelText(s1.fullName)).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText(s1.email)).toHaveAttribute('autocomplete', 'email');
    const whatsapp = screen.getByLabelText(s1.whatsapp);
    expect(whatsapp).toHaveAttribute('type', 'tel');
    expect(whatsapp).toHaveAttribute('autocomplete', 'tel');
    expect(screen.getByLabelText(s1.city)).toHaveAttribute('id', 'enroll-city');
    expect(screen.getByLabelText(s1.timezone)).toHaveAttribute('readonly');
  });

  it('time tiles report whether they are picked', async () => {
    await mountFullPage('/enroll', Enroll);
    const tile = document.querySelector('.enroll__time-btn');
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks the current step in the progress bar', async () => {
    await mountFullPage('/enroll', Enroll);
    const current = document.querySelectorAll('.enroll__step-item[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain(en.enroll.steps.aboutYou);
  });

  it('announces a validation error', async () => {
    await mountFullPage('/enroll', Enroll);
    fireEvent.click(screen.getByRole('button', { name: en.enroll.nav.continue }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.enroll.validation.nameRequired);
  });

  it('moves focus to the new step title after Continue', async () => {
    await mountFullPage('/enroll', Enroll);
    fireEvent.change(screen.getByLabelText(s1.fullName), { target: { value: 'Test Visitor' } });
    fireEvent.change(screen.getByLabelText(s1.email), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(s1.whatsapp), { target: { value: '+39 000 000 0000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.enroll.nav.continue }));
    });
    const title = document.querySelector('.enroll__card h2');
    expect(title.textContent).toBe(en.enroll.step2.title);
    expect(document.activeElement).toBe(title);
  });
});
