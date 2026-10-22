import '@testing-library/jest-dom';
import { blockNetwork } from './utils/blockNetwork';
import { registerTranslations } from '../i18n';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import itDict from '../i18n/it.js';
import es from '../i18n/es.js';
import de from '../i18n/de.js';
import fr from '../i18n/fr.js';
import { registerExperienceText } from '../i18n/experience.js';
import enExperience from '../i18n/experience/en.js';
import arExperience from '../i18n/experience/ar.js';
import itExperience from '../i18n/experience/it.js';
import esExperience from '../i18n/experience/es.js';
import deExperience from '../i18n/experience/de.js';
import frExperience from '../i18n/experience/fr.js';

// No test may reach a real server (see utils/blockNetwork.js).
blockNetwork();

// The app loads one dictionary (and its interface copy) per page load
// (main.jsx); tests render any language synchronously, so all six are
// registered here.
for (const [lang, dict] of Object.entries({ en, ar, it: itDict, es, de, fr })) registerTranslations(lang, dict);
for (const [lang, copy] of Object.entries({ en: enExperience, ar: arExperience, it: itExperience, es: esExperience, de: deExperience, fr: frExperience })) registerExperienceText(lang, copy);
