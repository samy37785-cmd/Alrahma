import { useLang } from '../../context/LangContext';

// A plain <a href="#main-content"> rendered directly in App.jsx can't call
// useLang() — App is the component that renders <LangProvider>, not a
// descendant of it, so it isn't a context consumer. This tiny wrapper is a
// genuine descendant, so it can read the current language's translated text.
export default function SkipLink() {
  const { t } = useLang();
  return <a href="#main-content" className="skip-link">{t.a11y.skipToContent}</a>;
}
