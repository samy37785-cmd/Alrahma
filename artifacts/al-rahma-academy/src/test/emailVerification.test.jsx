import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import VerifyEmail from '../pages/VerifyEmail';
import EmailVerifyBanner from '../components/ui/EmailVerifyBanner';

// Audit AR-02: the email-confirmation link opens /verify-email#token=…; the
// page removes the token from the address bar, sends it once and reports the
// result. The dashboard banner shows only while /api/auth/me says
// emailVerified: false, and can send the link again.

vi.mock('../api/authApi', () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));
import { verifyEmail, resendVerification } from '../api/authApi';

const TOKEN = 'b'.repeat(64);

function openVerify(url) {
  window.history.replaceState(null, '', url);
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes><Route path="/verify-email" element={<VerifyEmail />} /></Routes>
      </MemoryRouter>
    </LangProvider>,
  );
}

const banner = (me) => render(<LangProvider><EmailVerifyBanner me={me} /></LangProvider>);

beforeEach(() => { verifyEmail.mockReset(); resendVerification.mockReset(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('VerifyEmail page', () => {
  it('sends the token once, removes it from the address bar and shows success', async () => {
    verifyEmail.mockResolvedValue({ message: 'Email confirmed.' });
    openVerify(`/verify-email#token=${TOKEN}`);
    await screen.findByText('Your email is confirmed. Thank you!');
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith(TOKEN);
    expect(window.location.href).not.toContain(TOKEN);
    expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe('/dashboard');
  });

  it('shows the invalid-link message when the API refuses the token', async () => {
    verifyEmail.mockRejectedValue(new Error('400'));
    openVerify(`/verify-email#token=${TOKEN}`);
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid or has expired/);
  });

  it('without a token, calls nothing and shows the invalid-link message', () => {
    openVerify('/verify-email');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});

describe('EmailVerifyBanner', () => {
  it('renders nothing for a confirmed account, a pre-existing one, or no data yet', () => {
    for (const me of [{ emailVerified: true }, {}, undefined, null]) {
      const { container } = banner(me);
      expect(container.innerHTML, JSON.stringify(me)).toBe('');
      cleanup();
    }
  });

  it('for an unconfirmed account, names the email and sends the link again', async () => {
    resendVerification.mockResolvedValue({ message: 'Confirmation email sent.' });
    banner({ emailVerified: false, email: 'guest@example.com' });
    expect(screen.getByText(/guest@example\.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    await screen.findByText('Sent. Check your inbox.');
    expect(resendVerification).toHaveBeenCalledTimes(1);
  });

  it('says so when sending fails', async () => {
    resendVerification.mockRejectedValue(new Error('500'));
    banner({ emailVerified: false, email: 'guest@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Send the link again' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not send/));
  });
});
