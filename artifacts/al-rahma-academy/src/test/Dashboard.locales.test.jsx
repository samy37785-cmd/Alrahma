import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import { pathFor } from '../utils/localePath';
import { LANGS } from '../i18n';
import Dashboard from '../pages/Dashboard';

// Stage 2A (see docs/user-admin-auth-contract.md, Section 8): Dashboard.jsx
// used to read t.dashboard.roles / t.dashboard.items - keys that only exist
// on getExperienceText(lang).dashboard, not on the per-locale `t` object -
// and threw a TypeError on every render, in every locale. This headless
// render test locks the fix in across all six shipped locales and checks
// Arabic keeps RTL.

function renderDashboardAt(lang) {
  window.history.pushState({}, '', pathFor('/dashboard', lang));
  return render(
    <LangProvider>
      <QueryProvider>
        <AuthProvider>
          <AdminAuthProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Dashboard />
            </MemoryRouter>
          </AdminAuthProvider>
        </AuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

describe('Dashboard renders without the t.dashboard.roles/items crash, in every locale', () => {
  it.each(LANGS)('renders in "%s" without throwing', (lang) => {
    expect(() => renderDashboardAt(lang)).not.toThrow();
  });

  it('renders the (translated) generic-user eyebrow label, not a blank/undefined value', () => {
    const { container } = renderDashboardAt('en');
    // dashboardCopy.roles.student / dashboardCopy.items.dashboard from
    // i18n/experience.js - proves the correct source is actually being
    // read, not just that nothing threw. Scoped to the page-header eyebrow
    // element (rather than screen.getByText) since "Student"/"Dashboard"
    // also appear elsewhere on the page (nav labels, etc).
    const eyebrow = container.querySelector('.ds-page-hd__eyebrow');
    expect(eyebrow).not.toBeNull();
    expect(eyebrow.textContent).toContain('Student');
    expect(eyebrow.textContent).toContain('Dashboard');
  });

  it('Arabic keeps RTL: <html dir> is set to "rtl" while on an Arabic-locale route', () => {
    renderDashboardAt('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
  });

  it('a non-Arabic locale sets <html dir> back to "ltr"', () => {
    renderDashboardAt('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});
