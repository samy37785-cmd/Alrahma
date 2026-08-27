import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangProvider, useLang } from '../context/LangContext';
import QuickTrialModal from '../components/ui/QuickTrialModal';

function LanguageHarness() {
  const { lang, setLang } = useLang();
  const location = useLocation();
  return (
    <>
      <output aria-label="language">{lang}</output>
      <output aria-label="location">{`${location.pathname}${location.search}${location.hash}`}</output>
      <button type="button" onClick={() => setLang('en')}>English</button>
      <Link to="/tools#reader">Tools</Link>
    </>
  );
}

describe('language routing and document direction', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/courses?lang=ar#quran');
  });

  it('reads the deep-link language and applies Arabic document attributes', async () => {
    render(
      <BrowserRouter>
        <LangProvider>
          <LanguageHarness />
        </LangProvider>
      </BrowserRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('language')).toHaveTextContent('ar'));
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('keeps the selected language in the URL across route changes', async () => {
    render(
      <BrowserRouter>
        <LangProvider>
          <LanguageHarness />
        </LangProvider>
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => {
      expect(screen.getByLabelText('location')).toHaveTextContent('/courses?lang=en#quran');
    });

    fireEvent.click(screen.getByRole('link', { name: 'Tools' }));
    await waitFor(() => {
      expect(screen.getByLabelText('location')).toHaveTextContent('/tools?lang=en#reader');
    });
  });

  it.each(['it', 'es', 'de', 'fr'])(
    'loads and preserves the %s language on a deep-link route',
    async (locale) => {
      window.history.replaceState({}, '', `/courses?lang=${locale}#quran`);

      render(
        <BrowserRouter>
          <LangProvider>
            <LanguageHarness />
          </LangProvider>
        </BrowserRouter>,
      );

      await waitFor(() => expect(screen.getByLabelText('language')).toHaveTextContent(locale));
      expect(document.documentElement).toHaveAttribute('lang', locale);
      expect(document.documentElement).toHaveAttribute('dir', 'ltr');

      fireEvent.click(screen.getByRole('link', { name: 'Tools' }));
      await waitFor(() => {
        expect(screen.getByLabelText('location')).toHaveTextContent(`/tools?lang=${locale}#reader`);
      });
    },
  );

  it('renders representative conversion UI in Arabic', () => {
    render(
      <BrowserRouter>
        <LangProvider>
          <QuickTrialModal open onClose={() => {}} />
        </LangProvider>
      </BrowserRouter>,
    );

    expect(screen.getByRole('dialog', { name: 'احجز تجربتك المجانية' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'احجز حصتي المجانية' })).toBeInTheDocument();
  });
});