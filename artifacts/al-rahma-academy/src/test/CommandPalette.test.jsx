import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { LANGS } from '../i18n';
import { getExperienceText } from '../i18n/experience';
import { pathFor } from '../utils/localePath';
import CommandPalette from '../components/ui/CommandPalette';

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): the
// regular-account dashboard entry used to be labeled 'studentDashboard'
// ("Student dashboard") - a raw legacy role string shown as UI copy, in
// all 6 shipped locales. Renamed to a generic 'dashboard' key. This file
// had zero prior coverage and proves, across all 6 locales:
//   - the generic dashboard entry renders with the new translated label;
//   - no "Student"/"Teacher"/"Parent" dashboard wording appears anywhere.

vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin: vi.fn(), adminMfaSetup: vi.fn(), adminMfaConfirm: vi.fn(),
  adminMfaVerify: vi.fn(), adminLogout: vi.fn(), adminRefresh: vi.fn(),
}));

function renderPaletteAt(lang) {
  window.history.pushState({}, '', pathFor('/', lang));
  return render(
    <LangProvider>
      <AdminAuthProvider>
        <MemoryRouter>
          <CommandPalette onClose={() => {}} />
        </MemoryRouter>
      </AdminAuthProvider>
    </LangProvider>,
  );
}

describe('CommandPalette: generic dashboard label, no legacy role wording, in every locale', () => {
  it.each(LANGS)('renders the generic "dashboard" label in "%s", not a role-specific one', (lang) => {
    renderPaletteAt(lang);
    const copy = getExperienceText(lang).command;
    expect(screen.getByText(copy.items.dashboard)).toBeInTheDocument();
  });

  it.each(LANGS)('never renders "Student"/"Teacher"/"Parent" dashboard wording in "%s"', (lang) => {
    renderPaletteAt(lang);
    expect(screen.queryByText(/Student dashboard|Teacher dashboard|Parent dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/لوحة الطالب|لوحة المعلم|لوحة ولي الأمر/)).not.toBeInTheDocument();
  });

  it('the admin dashboard entry is hidden for a regular (non-admin) visitor', () => {
    renderPaletteAt('en');
    const copy = getExperienceText('en').command;
    expect(screen.queryByText(copy.items.adminDashboard)).not.toBeInTheDocument();
  });
});
