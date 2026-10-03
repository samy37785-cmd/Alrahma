import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, screen, act } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Enroll from '../pages/Enroll';
import en from '../i18n/en';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import itl from '../i18n/it';

// Enroll prerender timezone safety: the read-only timezone field used to be
// initialised from Intl at module load (BLANK in Enroll.jsx), so the
// prerendered HTML froze the build machine's timezone. It now starts empty and
// is resolved after mount for a real visitor only (never under
// navigator.webdriver). Form text, steps, validation, payload shape and the API
// call are unchanged.

const submitEnrollment = vi.fn(() => Promise.resolve({ bookingRef: 'AR-TEST' }));
vi.mock('../api/enrollmentApi', () => ({ submitEnrollment: (...a) => submitEnrollment(...a) }));

useFullPageEnvironment();

const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const ZONES = ['Europe/Rome', 'Africa/Cairo', 'UTC'];
const realDTF = Intl.DateTimeFormat;
const fetchMock = vi.fn(() => Promise.reject(new Error('network disabled in test')));

function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true, writable: true });
}
// Mock Intl directly; the TZ environment variable is not honoured on Windows.
function mockZone(zone) {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function Mock() {
    return { resolvedOptions: () => ({ timeZone: zone }) };
  });
}
const tzInput = () => document.querySelector('input.field__readonly');
const userInputs = () => [...document.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main textarea')];

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  submitEnrollment.mockClear();
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.navigator.webdriver;
});

describe('under navigator.webdriver (prerender): the timezone stays empty', () => {
  for (const zone of ZONES) {
    it(`${zone}: empty value, the zone is nowhere in the DOM, no network`, async () => {
      setWebdriver(true);
      mockZone(zone);
      await mountFullPage('/fr/enroll', Enroll);
      expect(tzInput().getAttribute('value') ?? '').toBe('');
      expect(tzInput().value).toBe('');
      expect(document.body.innerHTML).not.toContain(zone);
      expect(document.body.innerHTML).not.toMatch(/Africa\/Cairo|Europe\/Rome|value="UTC"/);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(submitEnrollment).not.toHaveBeenCalled();
    });
  }

  it('every user field is empty in the initial DOM, with nothing stored or personal', async () => {
    setWebdriver(true);
    mockZone('Europe/Rome');
    window.localStorage.setItem('name', 'Stored Person');
    await mountFullPage('/fr/enroll', Enroll);
    for (const el of userInputs()) expect(el.value, el.className || el.placeholder || el.id).toBe('');
    expect(document.body.textContent).not.toContain('Stored Person');
  });

  it('the initial DOM is identical for every build-machine timezone', async () => {
    setWebdriver(true);
    const htmls = [];
    for (const zone of ZONES) {
      mockZone(zone);
      await mountFullPage('/fr/enroll', Enroll);
      htmls.push(document.querySelector('#main-content').innerHTML);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(new Set(htmls).size).toBe(1);
  });
});

describe('for a real visitor (webdriver false): resolved after mount', () => {
  for (const zone of ZONES) {
    it(`${zone}: filled after mount, nothing is requested`, async () => {
      setWebdriver(false);
      mockZone(zone);
      await mountFullPage('/enroll', Enroll);
      expect(tzInput().value).toBe(zone);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('importing the page never reads Intl (the zone only appears via the effect)', async () => {
    vi.resetModules();
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    await import('../pages/Enroll');
    expect(spy).not.toHaveBeenCalled();
  });

  it('StrictMode (effects run twice) does not change or overwrite the resolved value', async () => {
    setWebdriver(false);
    mockZone('Europe/Rome');
    await mountFullPage('/enroll', () => (
      <StrictMode>
        <Enroll />
      </StrictMode>
    ));
    expect(tzInput().value).toBe('Europe/Rome');
    expect(document.querySelectorAll('input.field__readonly')).toHaveLength(1);
  });

  it('an Intl failure leaves it empty without crashing', async () => {
    setWebdriver(false);
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function Boom() { throw new Error('no Intl'); });
    await mountFullPage('/enroll', Enroll);
    expect(tzInput().value).toBe('');
    expect(document.querySelector('h1')).not.toBeNull();
  });

  it('an unknown zone (empty string) leaves it empty', async () => {
    setWebdriver(false);
    mockZone('');
    await mountFullPage('/enroll', Enroll);
    expect(tzInput().value).toBe('');
  });
});

describe('the submitted payload still carries the visitor timezone, as before', () => {
  it('a dummy booking (mocked API) sends timezone with the same shape', async () => {
    setWebdriver(false);
    mockZone('Africa/Cairo');
    await mountFullPage('/enroll?teacher=1&plan=Noorani', Enroll);
    const type = (el, value) => fireEvent.change(el, { target: { value } });
    type(document.querySelector('input[placeholder]:not([type="email"]):not([dir])'), 'Test Person');
    type(document.querySelector('input[type="email"]'), 'test@example.com');
    type(document.getElementById('enroll-whatsapp'), '+44 7700 900000');
    const nextBtn = () => document.querySelector('.btn--green');
    fireEvent.click(nextBtn());
    await act(async () => {});
    fireEvent.click(document.querySelector('.enroll__subject-btn'));
    fireEvent.click(nextBtn());
    await act(async () => {});
    fireEvent.click(nextBtn());
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: en.enroll.step4.confirmBooking }));
    await act(async () => {});
    expect(submitEnrollment).toHaveBeenCalledTimes(1);
    const payload = submitEnrollment.mock.calls[0][0];
    expect(payload.timezone).toBe('Africa/Cairo');
    expect(payload.plan).toBe('Noorani');
    expect(payload.name).toBe('Test Person');
    expect(Object.keys(payload).sort()).toEqual(
      ['ageGroup', 'city', 'country', 'email', 'genderPref', 'lang', 'level', 'name', 'plan', 'subjects', 'teacherId', 'teacherName', 'timezone', 'times', 'whatsapp'].sort(),
    );
  });
});

describe('texts are unchanged (SHA-256 baselines from origin/main)', () => {
  it('t.enroll for en/ar/fr and the Italian entry', () => {
    expect(sha(en.enroll)).toBe('ea90e0973acb85fdbc0c940ba05d8c77634b23c75b7f9abb6daa72f7711088fb');
    expect(sha(ar.enroll)).toBe('7a981317ef37f5130fad3296af92c0d15215c32dbdf1bf42f817c1397b50534f');
    expect(sha(fr.enroll)).toBe('8d12ed33635670abdc0b67751dfc8c87ccc71c5bc64deac20e90415526ec0343');
    expect(typeof itl.enroll.step1).toBe('object');
  });
});
