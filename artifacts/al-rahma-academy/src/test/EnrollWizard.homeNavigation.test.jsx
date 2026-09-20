import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { Success } from '../components/features/enrollment/EnrollWizard';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 5): the
// post-enrollment success screen's "Back Home" button used to call
// navigate('/'), which under a non-English basename produces "/fr" with
// no trailing slash. Fixed by calling goHome() instead - same fix and
// same reasoning as DashboardLayout's logout button (see
// DashboardLayout.homeNavigation.test.jsx). This proves the real button
// click, for en/fr/it.

function stubLocation(path) {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: path, search: '', hash: '', assign },
  });
  return assign;
}

async function renderSuccessAt(path) {
  render(
    <LangProvider>
      <MemoryRouter initialEntries={[path]}>
        <Success name="Amina" />
      </MemoryRouter>
    </LangProvider>,
  );
  return userEvent.setup();
}

describe('EnrollWizard Success "Back Home": safe canonical navigation, not navigate("/")', () => {
  const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', realLocationDescriptor);
  });

  it('English: "Back to Home" navigates to "/" via window.location.assign', async () => {
    const assign = stubLocation('/enroll');
    const user = await renderSuccessAt('/enroll');
    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('French: "Retour à l\'accueil" navigates to "/fr/" via window.location.assign', async () => {
    const assign = stubLocation('/fr/enroll');
    const user = await renderSuccessAt('/fr/enroll');
    await user.click(screen.getByRole('button', { name: /retour à l'accueil/i }));
    expect(assign).toHaveBeenCalledWith('/fr/');
  });

  it('Italian: "Torna alla Home" navigates to "/it/" via window.location.assign', async () => {
    const assign = stubLocation('/it/enroll');
    const user = await renderSuccessAt('/it/enroll');
    await user.click(screen.getByRole('button', { name: /torna alla home/i }));
    expect(assign).toHaveBeenCalledWith('/it/');
  });

  // Post-booking journey fix (2026-09-20): a booking request does not
  // create an account or session (Booking-First Enrollment, see
  // docs/current-project-status.md §5), so the "Go to Dashboard" button
  // that used to sit here silently bounced a fresh, unauthenticated
  // visitor into ProtectedRoute's /login redirect - a login wall they have
  // no credentials for. It's removed outright, not replaced with any
  // login/account gate; WhatsApp and "Back to Home" are the only honest
  // destinations right after a booking. This replaces the old assertion
  // that the button existed and worked.
  it('there is no "Go to Dashboard" button/link left in the success state', async () => {
    stubLocation('/enroll');
    await renderSuccessAt('/enroll');
    expect(screen.queryByRole('button', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
  });
});
