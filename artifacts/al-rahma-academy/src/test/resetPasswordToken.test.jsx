import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import ResetPassword from '../pages/ResetPassword';
import { readResetToken } from '../utils/resetToken';

// Audit AR-18: reset links now carry the token in the fragment (#token=…),
// which the browser never sends to a server. Links emailed before the change
// use ?token=… and must keep working. Either way the page removes the token
// from the address bar (and so from the history) as soon as it has read it,
// and still sends it to the API on submit.

vi.mock('../api/authApi', () => ({ resetPassword: vi.fn(() => Promise.resolve({ message: 'ok' })) }));
import { resetPassword } from '../api/authApi';

const TOKEN = 'a'.repeat(64);

function openAt(url) {
  window.history.replaceState(null, '', url);
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes><Route path="/reset-password" element={<ResetPassword />} /></Routes>
      </MemoryRouter>
    </LangProvider>,
  );
}

async function submit() {
  const [pass, confirm] = document.querySelectorAll('input[type="password"]');
  fireEvent.change(pass, { target: { value: 'Str0ng-Passw0rd!' } });
  fireEvent.change(confirm, { target: { value: 'Str0ng-Passw0rd!' } });
  fireEvent.submit(pass.closest('form'));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
  return resetPassword.mock.calls[0][0];
}

beforeEach(() => { resetPassword.mockClear(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('readResetToken', () => {
  it('reads the fragment first, then the query string, else empty', () => {
    expect(readResetToken({ hash: `#token=${TOKEN}`, search: '' })).toBe(TOKEN);
    expect(readResetToken({ hash: '', search: `?token=${TOKEN}` })).toBe(TOKEN);
    expect(readResetToken({ hash: '#token=new', search: '?token=old' })).toBe('new');
    expect(readResetToken({ hash: '', search: '' })).toBe('');
  });
});

describe('ResetPassword page', () => {
  for (const [label, url] of [['#token= (new links)', `/reset-password#token=${TOKEN}`], ['?token= (links already sent)', `/reset-password?token=${TOKEN}`]]) {
    it(`${label}: removes the token from the address bar and still sends it on submit`, async () => {
      openAt(url);
      await waitFor(() => expect(window.location.href).not.toContain(TOKEN));
      expect(window.location.pathname).toBe('/reset-password');
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
      expect((await submit()).token).toBe(TOKEN);
    });
  }

  it('without a token, shows the link back to the request form and sends nothing', () => {
    openAt('/reset-password');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.querySelector('a[href="/forgot-password"]')).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
