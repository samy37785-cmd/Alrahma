import '@testing-library/jest-dom';
import { registerTranslations } from '../i18n';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import itDict from '../i18n/it.js';
import es from '../i18n/es.js';
import de from '../i18n/de.js';
import fr from '../i18n/fr.js';

// The app loads one dictionary per page load (main.jsx); tests render any
// language synchronously, so all six are registered here.
for (const [lang, dict] of Object.entries({ en, ar, it: itDict, es, de, fr })) registerTranslations(lang, dict);
