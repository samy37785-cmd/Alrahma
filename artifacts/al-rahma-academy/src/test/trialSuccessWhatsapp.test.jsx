import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { TrialProvider } from '../context/TrialContext';
import { langFromPath } from '../utils/localePath';
import { site } from '../data/site';
import { getExperienceText } from '../i18n/experience';
import { getTrialWhatsappText, TRIAL_WHATSAPP_LANGS } from '../i18n/trialWhatsapp';
import {
  academyWhatsappNumber, buildBookingWhatsappLink, buildTrialWhatsappLink, buildTrialWhatsappMessage,
} from '../utils/whatsapp';

vi.mock('../api/contentApi', () => ({ submitTrial: vi.fn() }));
import { submitTrial } from '../api/contentApi';
import Trial from '../components/features/marketing/Trial';
import QuickTrialModal from '../components/ui/QuickTrialModal';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';

// PR1 of the booking-system wind-down: after a SUCCESSFUL free-trial request
// (Trial, QuickTrialModal, ExitIntentPopup) the visitor may optionally send
// the same details to the academy on WhatsApp. Guards: the follow-up only
// appears after success, opens WhatsApp only on a click, encodes every value,
// never puts the details in an <a href> or a log, and POST /api/trials,
// /enroll and the Italian metadata stay exactly as they were.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const EN = getTrialWhatsappText('en');
const QT = getExperienceText('en').quickTrial;
const EX = getExperienceText('en').exitIntent;

const PII = {
  name: 'عائشة O\'Brien & Co',
  email: 'aisha+trial@example.com',
  phone: '+39 333 123 4567',
  message: 'سؤال: 50% #1? نعم/لا\nسطر ثانٍ 🙂',
};

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <TrialProvider>{children}</TrialProvider>
      </LangProvider>
    </BrowserRouter>,
  );
}

const waButton = () => screen.queryByRole('button', { name: EN.button });

let openSpy;
let consoleSpies;

beforeEach(() => {
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
  window.gtag = vi.fn();
  window.dataLayer = [];
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete window.gtag;
  delete window.dataLayer;
});

// No console method, gtag call or dataLayer entry may carry the visitor's details.
function expectNoPiiLeaked(container) {
  const needles = [PII.email, encodeURIComponent(PII.email), PII.phone, encodeURIComponent(PII.phone), 'عائشة'];
  const seen = [
    ...consoleSpies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c))),
    ...window.gtag.mock.calls.map((c) => JSON.stringify(c)),
    JSON.stringify(window.dataLayer),
  ].join('\n');
  for (const n of needles) expect(seen).not.toContain(n);
  // The details never sit in an href (analytics outbound-click tracking and
  // the status bar only see <a href>).
  for (const el of container.querySelectorAll('[href]')) {
    const href = el.getAttribute('href');
    expect(href).not.toContain(encodeURIComponent(PII.email));
    expect(href).not.toContain(PII.email);
  }
}

describe('buildTrialWhatsappLink (shared builder in utils/whatsapp.js)', () => {
  it('uses the academy number from data/site.js', () => {
    const href = buildTrialWhatsappLink({ name: 'Amina', email: 'a@example.com' }, EN);
    expect(href.startsWith(`https://wa.me/${site.whatsapp}?text=`)).toBe(true);
  });

  it('round-trips Arabic, symbols, emoji and line breaks exactly', () => {
    const details = { ...PII, course: 'القرآن الكريم' };
    const href = buildTrialWhatsappLink(details, getTrialWhatsappText('ar'));
    const encoded = href.split('?text=')[1];
    // Nothing that could break or split the query string survives unencoded
    // (encodeURIComponent leaves only A-Z a-z 0-9 - _ . ! ~ * ' ( ) as is).
    expect(encoded).toMatch(/^[A-Za-z0-9\-_.!~*'()%]+$/);
    expect(encoded).not.toMatch(/[\s&#?+<>"/]/);
    expect(new URL(href).searchParams.get('text')).toBe(buildTrialWhatsappMessage(details, getTrialWhatsappText('ar')));
    const text = decodeURIComponent(encoded);
    for (const v of Object.values(details)) expect(text).toContain(v);
  });

  it('contains only the intro and the fields the visitor filled in, in a fixed order', () => {
    const text = buildTrialWhatsappMessage(
      { name: ' Amina ', course: '', email: 'a@example.com', phone: '   ', source: 'exit-intent', extra: 'x' },
      EN,
    );
    expect(text).toBe(`${EN.intro}\nName: Amina\nEmail: a@example.com`);
  });

  it.each(['', '   ', ' 201039553264', '+201039553264', '0123456789', '12345', '1234567890123456', 'abc', null, undefined, 201039553264])(
    'treats %j as "no WhatsApp number configured"',
    (bad) => {
      expect(academyWhatsappNumber(bad)).toBeNull();
    },
  );

  it('accepts the configured academy number (the builder returning null is covered in trialSuccessWhatsappNoNumber)', () => {
    expect(academyWhatsappNumber(site.whatsapp)).toBe(site.whatsapp);
  });

  it('has complete copy for all six site languages', () => {
    expect([...TRIAL_WHATSAPP_LANGS].sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it']);
    for (const lang of TRIAL_WHATSAPP_LANGS) {
      const c = getTrialWhatsappText(lang);
      for (const v of [c.button, c.hint, c.intro, ...Object.values(c.labels)]) expect(v).toBeTruthy();
      expect(Object.keys(c.labels).sort()).toEqual(['course', 'email', 'message', 'name', 'phone']);
    }
    expect(getTrialWhatsappText('ar').button).toBe('إرسال التفاصيل عبر WhatsApp');
  });
});

describe('Trial (home page form)', () => {
  function fill() {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: PII.name } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: PII.email } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: PII.phone } });
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: PII.message } });
  }
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /request free trial/i }));

  it('shows no WhatsApp follow-up before submitting', () => {
    renderWithLang(<Trial />);
    fill();
    expect(waButton()).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('shows no follow-up on a validation error from the API', async () => {
    submitTrial.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Please enter a valid email.' } } });
    renderWithLang(<Trial />);
    fill();
    submit();
    await screen.findByText('Please enter a valid email.');
    expect(waButton()).toBeNull();
  });

  it('shows no follow-up when the request fails (network)', async () => {
    submitTrial.mockRejectedValueOnce({ response: null });
    renderWithLang(<Trial />);
    fill();
    submit();
    await screen.findByRole('alert');
    expect(waButton()).toBeNull();
  });

  it('after success: email-success note + button; WhatsApp opens only on click, with the sent details', async () => {
    submitTrial.mockResolvedValueOnce({ message: 'Trial request received' });
    const { container } = renderWithLang(<Trial />);
    fill();
    submit();
    const button = await screen.findByRole('button', { name: EN.button });
    expect(screen.getByRole('status')).toHaveTextContent(/thank you/i);
    expect(button.tagName).toBe('BUTTON');
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [href, target, features] = openSpy.mock.calls[0];
    expect(href.startsWith(`https://wa.me/${site.whatsapp}?text=`)).toBe(true);
    expect([target, features]).toEqual(['_blank', 'noopener,noreferrer']);
    const text = decodeURIComponent(href.split('?text=')[1]);
    for (const v of [PII.name, PII.email, PII.phone, PII.message]) expect(text).toContain(v);
    expectNoPiiLeaked(container);
  });

  // + heardFrom (audit item 8): the optional "how did you hear about us" answer, empty when skipped.
  it('keeps the POST /api/trials payload exactly as before', async () => {
    submitTrial.mockResolvedValueOnce({});
    renderWithLang(<Trial />);
    fill();
    submit();
    await waitFor(() => expect(submitTrial).toHaveBeenCalledTimes(1));
    expect(submitTrial.mock.calls[0]).toEqual([{ name: PII.name, email: PII.email, phone: PII.phone, course: '', message: PII.message, heardFrom: '' }]);
  });

  it('editing the form again removes the previous success state and button', async () => {
    submitTrial.mockResolvedValueOnce({});
    renderWithLang(<Trial />);
    fill();
    submit();
    await screen.findByRole('button', { name: EN.button });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New' } });
    expect(waButton()).toBeNull();
  });

  it('uses the Arabic copy on /ar', async () => {
    submitTrial.mockResolvedValueOnce({});
    renderWithLang(<Trial />, '/ar');
    fireEvent.change(document.getElementById('name'), { target: { value: PII.name } });
    fireEvent.change(document.getElementById('email'), { target: { value: PII.email } });
    fireEvent.submit(document.querySelector('form.trial__form'));
    fireEvent.click(await screen.findByRole('button', { name: 'إرسال التفاصيل عبر WhatsApp' }));
    const text = decodeURIComponent(openSpy.mock.calls[0][0].split('?text=')[1]);
    expect(text).toContain(getTrialWhatsappText('ar').intro);
    expect(text).toContain(`الاسم: ${PII.name}`);
  });
});

describe('QuickTrialModal', () => {
  function fill(email = PII.email) {
    fireEvent.change(screen.getByLabelText(QT.name), { target: { value: PII.name } });
    fireEvent.change(screen.getByLabelText(QT.email), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(new RegExp(QT.whatsapp)), { target: { value: PII.phone } });
  }
  const submit = () => fireEvent.click(screen.getByRole('button', { name: QT.submit }));

  it('shows no follow-up before submitting', () => {
    renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fill();
    expect(waButton()).toBeNull();
  });

  it('shows no follow-up on a client-side validation error (nothing is sent)', () => {
    renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fill('not-an-email');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(QT.emailInvalid);
    expect(submitTrial).not.toHaveBeenCalled();
    expect(waButton()).toBeNull();
  });

  it('shows no follow-up when the request fails', async () => {
    submitTrial.mockRejectedValueOnce(new Error('x'));
    renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fill();
    submit();
    await screen.findByText(QT.submitError);
    expect(waButton()).toBeNull();
  });

  it('after success: button opens WhatsApp only on click, with name, email and the WhatsApp number', async () => {
    submitTrial.mockResolvedValueOnce({});
    const { container } = renderWithLang(<QuickTrialModal open onClose={() => {}} />);
    fill();
    submit();
    expect(await screen.findByText(QT.successTitle)).toBeInTheDocument();
    // Payload unchanged (the modal still sends its own fields + source).
    expect(submitTrial.mock.calls[0]).toEqual([{ name: PII.name, email: PII.email, whatsapp: PII.phone, heardFrom: '', source: 'hero-quick-trial' }]);
    expect(openSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: EN.button }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const text = decodeURIComponent(openSpy.mock.calls[0][0].split('?text=')[1]);
    expect(text).toBe(`${EN.intro}\nName: ${PII.name}\nEmail: ${PII.email}\nPhone / WhatsApp: ${PII.phone}`);
    expectNoPiiLeaked(container);
  });
});

describe('ExitIntentPopup', () => {
  // The popup arms after 20 s and opens when the cursor leaves through the top.
  function openPopup() {
    vi.useFakeTimers();
    const utils = renderWithLang(<ExitIntentPopup />);
    act(() => { vi.advanceTimersByTime(20000); });
    act(() => { document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 0 })); });
    act(() => { vi.advanceTimersByTime(300); });
    return utils;
  }
  function fill(email = PII.email) {
    fireEvent.change(screen.getByPlaceholderText(EX.name), { target: { value: PII.name } });
    fireEvent.change(screen.getByPlaceholderText(EX.email), { target: { value: email } });
    fireEvent.change(screen.getByPlaceholderText(EX.whatsapp), { target: { value: PII.phone } });
  }
  const submit = () => fireEvent.click(screen.getByRole('button', { name: EX.submit }));

  it('shows no follow-up before submitting', () => {
    openPopup();
    fill();
    expect(waButton()).toBeNull();
  });

  it('shows no follow-up on a client-side validation error (nothing is sent)', () => {
    openPopup();
    fill('nope');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(EX.emailInvalid);
    expect(submitTrial).not.toHaveBeenCalled();
    expect(waButton()).toBeNull();
  });

  it('shows no follow-up when the request fails', async () => {
    submitTrial.mockRejectedValueOnce(new Error('x'));
    openPopup();
    fill();
    await act(async () => { submit(); });
    expect(screen.getByRole('alert')).toHaveTextContent(EX.submitError);
    expect(waButton()).toBeNull();
  });

  it('after success: stays open with the button (no auto-close); WhatsApp opens only on click', async () => {
    submitTrial.mockResolvedValueOnce({});
    const { container } = openPopup();
    fill();
    await act(async () => { submit(); });
    expect(screen.getByText(EX.successTitle)).toBeInTheDocument();
    expect(submitTrial.mock.calls[0]).toEqual([{ name: PII.name, email: PII.email, whatsapp: PII.phone, source: 'exit-intent' }]);
    // The old 4.5 s auto-close would have removed the button before anyone could use it.
    act(() => { vi.advanceTimersByTime(10000); });
    const button = screen.getByRole('button', { name: EN.button });
    expect(openSpy).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const text = decodeURIComponent(openSpy.mock.calls[0][0].split('?text=')[1]);
    expect(text).toBe(`${EN.intro}\nName: ${PII.name}\nEmail: ${PII.email}\nPhone / WhatsApp: ${PII.phone}`);
    expectNoPiiLeaked(container);
  });
});

describe('Scope guard: prerendered HTML, /enroll and Italian metadata are unchanged', () => {
  it('the initial (prerendered) render of each form contains no follow-up', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/it/']}>
        <LangProvider>
          <TrialProvider>
            <Trial />
            <QuickTrialModal open onClose={() => {}} />
            <ExitIntentPopup />
          </TrialProvider>
        </LangProvider>
      </MemoryRouter>,
    );
    expect(html).not.toContain('trial-wa');
    expect(html).not.toContain('wa.me/' + site.whatsapp + '?text=');
    for (const lang of TRIAL_WHATSAPP_LANGS) expect(html).not.toContain(getTrialWhatsappText(lang).button);
  });

  it('the /enroll booking WhatsApp link is byte-for-byte what it was', () => {
    expect(buildBookingWhatsappLink({ name: 'Amina', plan: 'Huffaz', bookingRef: 'AR-1' })).toBe(
      `https://wa.me/${site.whatsapp}?text=Hi%2C%20I%20just%20submitted%20a%20booking%20request%20on%20Al-Rahma%20Academy.%0AName%3A%20Amina%0APlan%3A%20Huffaz%0ABooking%20ref%3A%20AR-1`,
    );
  });

  // Pinned at origin/main 78883d6. A later PR that deliberately changes
  // /enroll or the Italian SEO updates these hashes in the same diff.
  it.each(Object.entries({
    'src/pages/Enroll.jsx': 'adc6fe07e46e5f21edcf21419f3940946655eb12eb7fed1ad9bab9fac675547d',
    'src/components/features/enrollment/EnrollWizard.jsx': '2fe22bae0e8a3e950a48bb891cd8a18efa3afb28775ed06d8272b5941c286402',
    'src/i18n/enroll/seo.js': 'b420a7d60d860877fc451434f54aa7c558a67b7d223ec81ea1b3a5f38da5aa35',
    'src/i18n/enroll/countries.js': '341fe3dfef149848fbfcaf6a87723818976b6d6b9e137f1470e059e7ac68676c',
    'src/i18n/itMetaDescriptions.js': 'bf226934a1f3f5180b6206357747df46499db592bf554c8a6b3cd81ff63c3a69',
    'src/i18n/home/seo.js': '2c199f33b4d85041e0d18ef9503e4960321f52124ef5adad6a278ded687920b8',
    'scripts/prerender-routes.mjs': '5af0f861179fdb4390d08f721c2eb9866e1b40b2225c06d1628171d7474c4678',
    'scripts/seoRoutes.mjs': '01db84ba966064e6d70b7082c0000100d077b4cb2291d873509e8ca01b4edc75',
  }))('%s is unchanged', (rel, expected) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(src).digest('hex')).toBe(expected);
  });
});
