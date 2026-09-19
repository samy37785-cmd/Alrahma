import { useLang } from '../../context/LangContext';
import { isPublished } from '../../data/translationStatus';
import TranslationInProgress from './TranslationInProgress';

// Single enforcement point for "may this (route, lang) be rendered" --
// used both for direct URL access (e.g. opening /de/courses/ijazah
// directly) and for switcher-driven navigation (LangSwitcher only shows a
// hint badge; this gate is what actually stops English content from
// rendering as if it were the target language). See
// src/data/translationStatus.js for the registry this reads.
export default function TranslationGate({ route, children }) {
  const { lang } = useLang();
  if (!isPublished(route, lang)) {
    return <TranslationInProgress route={route} />;
  }
  return children;
}
