import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';
import { TEACHERS, plans } from '../data';
import { PLAN_TEXT, pick } from '../i18n/content';
import en from '../i18n/en';
import ar from '../i18n/ar';

// Owner decision (2026-11-06, after the site critique): every free-trial
// button on the home page and the header's "Free Trial" open the same short
// form. A tutor's "Enroll" and a plan's button note the tutor or plan in the
// form and send it in the existing free-text message field; the level quiz
// sends its recommended course in the existing course field. The links keep
// their /enroll href, so new-tab clicks and crawlers still reach the wizard.

const submitTrial = vi.fn(() => Promise.resolve({}));
vi.mock('../api/contentApi', async (orig) => ({ ...(await orig()), submitTrial: (...a) => submitTrial(...a) }));

useFullPageEnvironment();
beforeEach(() => submitTrial.mockClear());

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });
// The form is a lazy chunk: the first open waits for its import.
const dialog = async () => {
  for (let i = 0; i < 60 && !screen.queryByRole('dialog'); i += 1) await settle();
  return screen.getByRole('dialog');
};

async function fillAndSend(d) {
  fireEvent.change(within(d).getByLabelText(/name/i), { target: { value: 'Test Visitor' } });
  fireEvent.change(within(d).getByLabelText(/email/i), { target: { value: 'test@example.com' } });
  await act(async () => { fireEvent.submit(d.querySelector('form')); });
  expect(submitTrial).toHaveBeenCalledTimes(1);
  return submitTrial.mock.calls[0][0];
}

describe('one free-trial form', () => {
  it('the header "Free Trial" link opens the short form on a plain click', async () => {
    await mountFullPage('/', Home);
    const link = document.querySelector('a.nav__cta');
    expect(link.getAttribute('href')).toBe('/enroll');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { link.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect((await dialog()).querySelector('.qtm__picked')).toBeNull();
  });

  it('a ctrl/cmd click still follows the link (new tab)', async () => {
    await mountFullPage('/', Home);
    const link = document.querySelector('a.nav__cta');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    act(() => { link.dispatchEvent(ev); });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("a tutor's Enroll notes the tutor and sends it in the message", async () => {
    await mountFullPage('/', Home);
    const card = document.querySelector('.tc3__cta').closest('article, .tc3__spotlight, section');
    const name = TEACHERS.find((t) => card.textContent.includes(t.nameEn));
    fireEvent.click(document.querySelector('.tc3__cta'));
    const d = await dialog();
    expect(d.querySelector('.qtm__picked').textContent).toContain(name.nameEn);
    const sent = await fillAndSend(d);
    expect(sent.message).toBe(`Preferred tutor: ${name.nameEn}`);
    expect(sent.source).toBe('hero-quick-trial');
  });

  it('Arabic shows the tutor name in Arabic but sends it in English', async () => {
    await mountFullPage('/ar/', Home);
    const card = document.querySelector('.tc3__cta').closest('article, .tc3__spotlight, section');
    const name = TEACHERS.find((t) => card.textContent.includes(t.nameAr));
    fireEvent.click(document.querySelector('.tc3__cta'));
    const d = await dialog();
    const box = d.querySelector('.qtm__picked');
    expect(box.textContent).toContain(ar.enroll.step4.summaryTeacher);
    expect(box.textContent).toContain(name.nameAr);
  });

  it("a plan's button notes the plan (localized) and sends its name", async () => {
    await mountFullPage('/', Home);
    const buttons = [...document.querySelectorAll('.plan .btn--block')];
    expect(buttons).toHaveLength(plans.length);
    fireEvent.click(buttons[1]);
    const d = await dialog();
    expect(d.querySelector('.qtm__picked').textContent).toContain(pick(PLAN_TEXT, 'en')[1].name);
    const sent = await fillAndSend(d);
    expect(sent.message).toBe(`Plan of interest: ${plans[1].name}`);
  });

  it('a plain trial button sends no message or course', async () => {
    await mountFullPage('/', Home);
    fireEvent.click(document.querySelector('.hero__actions .btn--gold'));
    const sent = await fillAndSend(await dialog());
    expect(sent).not.toHaveProperty('message');
    expect(sent).not.toHaveProperty('course');
  });
});
