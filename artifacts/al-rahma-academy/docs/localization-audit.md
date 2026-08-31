# Al-Rahma Academy localization audit

Audit date: 27 August 2026

## Scope and method

This audit inventories the current React application before translation or behavior changes. It covers:

- the complete route map in `src/App.jsx`;
- the six supported interface languages;
- the main locale objects and auxiliary content dictionaries;
- language persistence, document direction, deep-link behavior, and static language landing pages;
- representative public, enrollment, authentication, dashboard, teacher, parent, admin, tool, and legal surfaces;
- client-side metadata and crawlable language URLs.

The findings were produced from static code inspection plus programmatic object-shape comparisons. This is an inventory and prioritization document only: no copy or runtime behavior was changed.

## Supported languages

| Code | Language | Direction | Current selector label | Main locale source |
|---|---|---:|---|---|
| `en` | English | LTR | `EN 🇬🇧` | `src/i18n/en.js` |
| `ar` | Arabic | RTL | `عربي 🇪🇬` | `src/i18n/ar.js` |
| `it` | Italian | LTR | `IT 🇮🇹` | `src/i18n/it.js` |
| `es` | Spanish | LTR | `ES 🇪🇸` | `src/i18n/es.js` |
| `de` | German | LTR | `DE 🇩🇪` | `src/i18n/de.js` |
| `fr` | French | LTR | `FR 🇫🇷` | `src/i18n/fr.js` |

The application language list and labels are declared in `src/i18n/index.js`. All six languages are selectable in the React application.

## Localization architecture

### Main interface dictionary

The six main locale files have exact structural parity:

- 1,180 leaf paths were found in each locale;
- no missing or extra paths were found against English;
- all locale files expose the same 42 top-level sections;
- the existing parity test also guards the structure and verifies that English has no empty strings.

Top-level sections cover marketing, navigation, tutors, FAQ, authentication, enrollment, course content, tools, dashboards, billing, checkout, errors, notifications, search, coupons, teacher/parent portals, and messages.

Structural parity is a strong guardrail, but it does not prove that:

- a component actually consumes the relevant key;
- a translated value is accurate or natural;
- arrays have equivalent item schemas;
- hard-coded text outside the locale objects is localized;
- metadata changes when the user changes language.

### Auxiliary dictionaries and content sources

| Source | Purpose | Language coverage | Audit result |
|---|---|---|---|
| `src/i18n/coursePages.js` | Ijazah and Islamic Studies course UI | all six | Exact structural parity: 20 paths per language |
| `src/i18n/content.js` | plans, values, testimonials, invoices, checkout subtitles, shared UI, tools | all six | Core compared sections have exact structural parity |
| `src/i18n/adhkarText.js` | translated dhikr meanings and virtues | `en`, `it`, `es`, `de`, `fr` | All 49 records cover all five non-Arabic languages; Arabic intentionally uses the original Arabic page data |
| `src/data/faqItems.js` | long-form FAQ content | all six | 18 items, each with six language variants |
| `src/data/marketing/teachers.js` | tutor profiles and credentials | multilingual fields with English fallback | Must be reviewed for field-by-field completeness and fallback visibility |
| `src/data/marketing/courses.js` | course structure and alphabet learning data | mixed structural and English text | Several user-facing course/alphabet values remain English data rather than locale keys |
| `src/data/islamicStudiesData.js` | hadith, curriculum, modules, source books | heavily English/Arabic | European-language course pages can expose English content |
| `src/data/quranLangs.js` | Quran reader UI, translations, tafsir lists | UI supports `en`, `ar`, `fr`, `de`, `es`, plus other reader languages | Italian reader UI falls back to English; the reader language set is not the same as the site language set |
| backend APIs | blog, courses, tutors, dashboard data, payment/auth errors | backend-defined | API-provided strings may bypass the frontend locale dictionaries |

### Explicit English fallback paths

English fallback is intentional in several places:

- `pick(map, lang)` in `src/i18n/content.js`;
- tutor title, biography, specialties, and credentials;
- FAQ item selection;
- course-page UI selection;
- non-Arabic adhkar translations;
- Quran reader UI and API-provided month names;
- inline fallback literals in footer, checkout, newsletter, Quran controls, teacher tools, and error states.

Fallbacks prevent blank screens, but they also hide untranslated content. Later passes should log or test fallbacks instead of silently treating them as complete localization.

## Route inventory

All routes are language-neutral React Router paths unless noted otherwise. Language is normally selected through application state rather than a language path prefix.

### Public marketing and course routes

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/` | visitors | main dictionary, with several hard-coded conversion components | localized body but English metadata and modal/search strings |
| `/courses` | visitors | main dictionary | copy and overflow review |
| `/courses/quran` | visitors | main dictionary | terminology and long translated cards |
| `/courses/arabic` | visitors | main dictionary plus English-heavy alphabet data | partial localization in instructional data |
| `/courses/ijazah` | visitors | main dictionary plus `COURSE_UI` | religious terminology consistency |
| `/courses/islamic-studies` | visitors | `COURSE_UI` plus English/Arabic content data | substantial English fallback/content exposure |
| `/courses/:id` | authenticated students | main dictionary plus API course content | backend content language is not guaranteed |

### Tools

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/tools` | visitors | main dictionary | copy and card overflow |
| `/tools/quran-reader` | visitors | separate Quran UI dictionary | Italian UI falls back to English; many Quran subcomponents have inline fallbacks |
| `/tools/adhkar` | visitors | main dictionary, Arabic source data, five-language meaning dictionary | terminology/source review; Arabic uses separate data path |
| `/tools/hadith` | visitors | main dictionary plus content/API data | display mode and source content may remain English/Arabic |
| `/tools/prayer` | visitors | main dictionary and utility constants | utility labels are mainly Arabic/English |
| `/tools/prayer-times` | visitors | main dictionary plus API month/time data | English API month fallback and locale/date formatting |
| `/tools/qibla` | visitors | main dictionary plus compass component | compass/accessibility labels and RTL geometry |
| `/tools/islamic-calendar` | visitors | main dictionary plus API month data | English API month fallback and date formatting |
| `/tools/verse-of-the-day` | visitors | local bilingual branches | non-Arabic languages receive English action labels |
| `/tools/tasbeeh` | visitors | main dictionary | RTL control placement and numeric direction |
| `/tools/arabic-alphabet` | visitors | main dictionary plus English instructional data | names and descriptions remain English in data |
| `/tools/tajweed-checker` | visitors | main dictionary | generated/API feedback language |
| `/tools/hifz-review` | visitors | main dictionary | Quran control fallback strings and RTL |

`/tools/quran` redirects to `/tools/quran-reader`.

### Resources and academy

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/resources` | visitors | main dictionary | copy and metadata review |
| `/resources/blog` | visitors | main dictionary plus backend posts | category/content language availability |
| `/resources/blog/:slug` | visitors | no `useLang` in the page | backend article body and controls may remain English |
| `/resources/faq` | visitors | 18 six-language FAQ records | terminology and answer parity |
| `/academy` | visitors | main dictionary | copy and metadata review |
| `/academy/about` | visitors | main dictionary plus six-language values | copy quality and claim consistency |
| `/academy/teachers` | visitors | multilingual tutor fields with English fallback | silent fallback and language filter labels |
| `/academy/teachers/:id` | visitors | multilingual tutor fields with English fallback | silent fallback and hard-coded language names |
| `/academy/privacy` | visitors | English-only page | legal text and metadata untranslated |
| `/academy/terms` | visitors | English-only page | legal text and metadata untranslated |
| `/academy/refund-policy` | visitors | English-only page | legal text and metadata untranslated |

### Authentication, enrollment, and payments

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/login` | visitors | main dictionary | validation and backend error messages |
| `/register` | visitors | main dictionary | validation, consent link, and backend errors |
| `/forgot-password` | visitors | main dictionary | validation/backend error strings |
| `/reset-password` | visitors | main dictionary | validation/backend error strings |
| `/enroll` | prospective students/parents | main dictionary plus plan dictionary | country names are English; email/phone placeholders are fixed; tutor/API data fallback |
| `/payment/success` | customers | main dictionary | return-state and provider message coverage |
| `/payment/cancel` | customers | main dictionary | cancellation-state and recovery copy |

### Authenticated student and community routes

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/dashboard` | students | main dictionary, but child components vary | English dashboard cards and date formatting |
| `/billing` | students | main dictionary plus invoice dictionary | provider/API error strings and print direction |
| `/wishlist` | students | English-only page | entire page, empty/error state, dates, and aria labels |
| `/ai-tutor` | students | English-only page | entire AI flow and generated responses |
| `/community` | students | English-only page | entire feed/composer/moderation UI |
| `/profile` | students | mixed | many account, status, certificate, and quick-link strings remain English |
| `/messages` | authenticated users | main dictionary | shared shell/notifications still expose English |
| `/calendar` | authenticated users | English-only page | page, dates, session types, empty/error states |
| `/attendance` | — | **Removed / out of current product scope** | Was a preview-only mock page (own in-code `PreviewBanner`, never connected to a real backend). Deleted in Stage 2 Batch 1 (`feat/prune-attendance-homework`); no longer routed. |
| `/homework` | — | **Removed / out of current product scope** | Same as above — preview-only mock page, deleted in the same batch; no longer routed. |

### Role-specific and admin routes

| Route | Audience | Language behavior | Main risk |
|---|---|---|---|
| `/teacher` | teachers | main dictionary at page level | student modal and supporting components contain English fallbacks |
| `/parent` | parents | main dictionary at page level | child modal and some supporting components are English |
| `/admin/login` | administrators | main dictionary | no explicit metadata/noindex hook; auth errors need review |
| `/admin` | administrators | English-only dashboard and tabs | entire console, tables, modals, errors, dates, and accessibility labels |

### Redirects and fallback

Legacy paths redirect to the current hierarchy:

- `/terms`, `/refund-policy`;
- `/quran`, `/adhkar`, `/hadith-library`, `/islamic-tools`;
- `/blog`, `/blog/:slug`, `/faq`;
- `/about`, `/teachers`, `/teachers/:id`, `/privacy`;
- `/course/ijazah`, `/course/islamic-studies`.

The wildcard route renders the localized `NotFound` page. An unused `src/pages/not-found.tsx` also exists and is not the route target.

## Language selection, persistence, and deep links

### Current behavior

1. On initial load, `LangProvider` checks `?lang=<code>`.
2. If the query parameter is absent or unsupported, it reads `localStorage.lang`.
3. If neither yields a supported code, it defaults to English.
4. Changing language updates local storage and React state.
5. The root `<html>` element receives the active `lang` and `dir`.

### Risks

- The browser language is not detected.
- Changing language does not update the URL.
- A copied internal deep link normally loses language unless `?lang=` is manually present.
- The initial `?lang=` value remains in the URL even after switching languages, so the visible URL can disagree with the active UI.
- Query parameters are not included in canonical URLs.
- Most localized views share one canonical URL, so search engines cannot index six distinct language versions.
- Back/forward history does not represent language changes.
- Static `/it/` and `/fr/` pages are separate documents, not the React routes with preserved paths.

## Metadata and static language pages

### Client-side metadata

`useSEO` sets title, description, keywords, robots, canonical, Open Graph, Twitter, breadcrumbs, and optional JSON-LD after mount.

Audit findings:

- the canonical is built from the pathname only and ignores the selected language;
- no hreflang links are generated by the hook;
- breadcrumb names are created from English URL slug words;
- metadata values are often English string literals even on otherwise localized pages;
- `Home` uses localized FAQ schema content but an English title, description, and keywords;
- public legal pages have English metadata because their full content is English;
- private pages generally do not invoke `useSEO`; crawler blocking relies mainly on `robots.txt`, route protection, and base metadata;
- client-rendered metadata depends on crawlers executing JavaScript.

### Static language landing pages

Only these dedicated language documents exist:

- `/it/`;
- `/fr/`.

There are no static `/ar/`, `/es/`, or `/de/` landing pages. English uses `/`, while the static Italian and French navigation links reference `/en/`, which is not a registered React or static language route.

The Italian and French pages:

- declare self-canonicals and hreflang only for English, Italian, French, and `x-default`;
- explicitly omit Arabic, Spanish, and German;
- link conversion actions back to `/?lang=it#trial` or `/?lang=fr#trial`;
- duplicate content, pricing, claims, schema, and navigation outside the React translation sources;
- contain visibly de-accented or awkward text in several places, especially French;
- can drift from current React claims and locale files.

The sitemap contains the main English-path routes plus `/it/` and `/fr/`; it does not provide language variants for internal routes or Arabic, Spanish, and German.

## Findings by severity

### Critical

1. **Language state is not represented by stable localized URLs.**  
   A user can view six languages, but most pages have one language-neutral URL and one canonical. This breaks reliable localized deep links and prevents complete multilingual indexing.

2. **Several high-trust and high-conversion surfaces are English-only.**  
   Privacy, Terms, Refund Policy, Wishlist, AI Tutor, Community, Calendar, and most of Admin are not connected to the language context. (Attendance and Homework were on this list at the time of the original audit; both were removed as fake/preview-only pages in Stage 2 Batch 1 and no longer exist, so they are no longer a localization gap.)

3. **Static language coverage is inconsistent.**  
   Only Italian and French have dedicated landing documents; their links include a non-existent `/en/` path and omit three supported languages.

### High

4. **English strings remain in shared global UI.**  
   Header search/theme/account labels, command palette, dashboard shell, notification surfaces, quick-trial modal, exit-intent popup, and multiple accessibility labels can appear in English in every language.

5. **Metadata is not language-aware.**  
   Localized body copy can be paired with English titles/descriptions, English breadcrumbs, and a language-neutral canonical.

6. **Enrollment is only partially localized.**  
   Country names are English, fixed placeholders use English-oriented examples, and tutor/content/API values may fall back to English.

7. **Quran reader language support diverges from site language support.**  
   Italian is absent from the Quran UI dictionary and therefore falls back to English. Quran controls contain many inline English fallbacks.

8. **Islamic Studies and Arabic alphabet content use mixed-language data sources.**  
   European users can receive translated chrome around English curriculum, book, letter-name, or explanation data.

### Medium

9. **Backend and API error strings bypass the locale system.**  
   Authentication, checkout, teacher tools, and other mutations frequently display `response.data.message` directly.

10. **Dates, times, numbers, and currency are not consistently locale-driven.**  
    Utility date functions use `en-GB`; some dashboard dates use browser defaults; prayer/calendar components fall back to English API names; Arabic numeric and bidirectional display needs explicit checking.

11. **Silent English fallbacks make coverage difficult to measure.**  
    Existing fallbacks should be retained for resilience but instrumented or tested so missing translations are visible.

12. **Religious terminology is not governed by a shared glossary.**  
    Variants include Quran/Coran/Koran, tutor/teacher/instructor, Tajweed, Hifz, Ijazah, Sanad, Aqeedah, Fiqh, Seerah, Tafsir, Juz/Jouz/Dschuz, and “in shaa Allah.” Transliteration and explanatory style vary across files.

13. **Claims and quantities drift between sources.**  
    Tutor/student/lesson counts and language availability are repeated in locale files, static pages, schema, and marketing data, increasing translation and trust risk.

### Low

14. **Language labels use country flags.**  
    Flags can imply a country rather than a language; Arabic is represented only by Egypt and English only by the UK.

15. **`Skip to main content` is hard-coded in English.**

16. **Direction-sensitive arrows are embedded in translated strings.**  
    Arrow glyphs and “back” patterns should be verified in Arabic rather than assuming string order alone is sufficient.

## RTL-sensitive areas

Arabic correctly sets `dir="rtl"` on the document root. The following areas require visual and keyboard verification:

- desktop navigation dropdown alignment and mobile drawer open/close direction;
- account/user menus, notification badges, and command palette;
- course cards, pricing cards, progress steppers, charts, and trend arrows;
- enrollment step connectors, teacher cards, language grid, country selector, and payment summary;
- phone numbers, email addresses, coupon codes, prices, percentages, dates, times, and IDs inside RTL containers;
- Quran sidebars, floating bars, audio controls, range inputs, bookmark/note controls, and tafsir panels;
- prayer-time tables, compass bearings, calendar grids, and geographic coordinates;
- dashboard sidebar collapse, mobile bottom navigation, data tables, pagination, charts, and modal close buttons;
- printable invoice and certificate layouts;
- legal lists and mixed Arabic/Latin links;
- toast, validation, API error, and empty-state placement.

Use direction-neutral CSS properties where possible (`margin-inline`, `padding-inline`, `inset-inline`, logical borders) and isolate LTR values with `dir="ltr"` where needed.

## Translation overflow risks

Highest-risk languages and components:

- **German:** navigation labels, course titles, buttons, badges, plan features, dashboard cards, filters, and table headings.
- **French:** headings, consent copy, FAQ answers, enrollment summaries, tool descriptions, and legal text.
- **Spanish/Italian:** enrollment buttons, form labels, course cards, and narrow mobile menus.
- **Arabic:** bidirectional values, cards with fixed icon/text order, progress steppers, charts, tables, and arrow-bearing links.

Verification widths should include at least 320, 375, 768, 1024, and 1440 pixels, with 200% browser zoom and long test values.

## Prioritized execution checklist

| Priority | Language | Page family | Severity | Required work | Verification path |
|---:|---|---|---|---|---|
| 1 | all | language switching/deep links | Critical | decide canonical locale URL model; preserve route and language when switching | open nested route in every language, refresh, copy URL, new browser session, back/forward |
| 2 | `en`, `ar` | global header/footer/modals/search | High | move remaining hard-coded strings and aria labels into locale sources | desktop/mobile navigation; keyboard-only; screen-reader labels; both directions |
| 3 | `en`, `ar` | auth/enrollment/payment | High | review copy, validation, countries, consent links, API errors, RTL form flow | submit empty/invalid/valid forms; payment success/cancel; 320–1440 px |
| 4 | `en`, `ar` | legal pages | Critical | localize Privacy, Terms, and Refund Policy with version parity | compare every heading/list/link; print view; RTL mixed values |
| 5 | `en`, `ar` | student/dashboard flows | Critical | localize English-only pages and shared dashboard components | authenticated student walkthrough including empty/error/loading states |
| 6 | `en`, `ar` | teacher/parent/admin | High | complete child modals, tables, errors, dates, and admin console policy | role-based walkthrough at desktop/tablet; table overflow and modal focus |
| 7 | `en`, `ar` | tools/Quran | High | remove inline English fallbacks where six-language UI is expected; verify reader direction | Quran reader controls, notes/bookmarks/audio, prayer/calendar/qibla, offline/error states |
| 8 | `it`, `es`, `de`, `fr` | public marketing/course/resource pages | High | native-quality copy and terminology pass; remove language-specific source errors | page-by-page route matrix, responsive screenshots, link/form smoke tests |
| 9 | `it`, `es`, `de`, `fr` | auth/enrollment/dashboard | High | mirror accepted English/Arabic key usage and validate long strings | full account/enrollment journey per language; loading/error/empty states |
| 10 | all | content dictionaries/API content | High | define policy for unavailable content and visible fallback indicators | force missing tutor/blog/course translations; verify explicit fallback behavior |
| 11 | all | religious glossary | Medium | approve transliteration, translation, honorific, capitalization, and explanation rules | automated term search plus native-language review |
| 12 | all | locale formatting | Medium | centralize date, number, time, plural, and currency formatting | fixed-date snapshots and browser timezone matrix |
| 13 | all | SEO/AEO/GEO | Critical | implement localized canonical/hreflang/metadata/schema and reconcile static pages | inspect rendered head and raw HTML; sitemap validation; rich-result checks |
| 14 | all | final regression | Critical | run locale-route matrix and responsive/RTL/browser verification | fresh browser context, build, tests, no untranslated-string scan |

## Acceptance baseline for downstream tasks

Later localization tasks should preserve these invariants:

- all six main locale objects keep exact key/type parity;
- no user-facing key is added to only one locale;
- English fallback remains a last-resort resilience mechanism, not the normal localized result;
- backend identifiers and form values remain stable while labels are translated;
- Arabic receives semantic RTL behavior, not only translated text;
- legal and payment claims remain semantically identical across languages;
- religious terms follow one approved glossary;
- user-visible dates, times, numbers, currencies, and plural forms use the active locale;
- each localized public page has a verifiable language-aware metadata strategy;
- accessibility strings are localized with the visible interface.

## Recommended automated guardrails

1. Extend parity checks to validate array item shapes and all auxiliary dictionaries.
2. Add a test that fails when a supported site language falls back in the Quran UI.
3. Add route-level tests for `html[lang]`, `html[dir]`, refresh persistence, and deep links.
4. Add a localized metadata test matrix for representative public routes.
5. Add a controlled allowlist-based scan for hard-coded JSX text and inline English fallback literals.
6. Add authenticated component tests for dashboard empty/error/loading states in Arabic and German.
7. Add visual regression coverage for Arabic RTL and long German/French strings.
8. Add a fallback telemetry or development warning mechanism for missing localized content.

## Audit conclusion

The project already has unusually broad locale-object coverage and a useful structural parity test. The principal gap is not missing main-dictionary keys; it is inconsistent consumption of those dictionaries across global UI, legal pages, authenticated products, auxiliary datasets, API messages, and metadata. The next localization phases should therefore work page-family by page-family, beginning with shared chrome and high-trust conversion flows, while preserving structural parity and making fallbacks observable.