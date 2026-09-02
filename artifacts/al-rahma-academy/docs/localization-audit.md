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

### Current behavior — SUPERSEDED, see "Stage 1 URL Closure" below

> The `?lang=<code>` query-string list below describes the model as it stood
> at the original audit date (27 August 2026). The app moved to a
> path-prefix model (`/fr/...` + `<BrowserRouter basename>`) before this
> stage, and Stage 1 URL Closure (see the dedicated section near the end of
> this document) closed the remaining redirect/canonical gaps that move
> left open. Not rewritten in place — kept here as a record of what the
> pre-migration behavior actually was.

1. On initial load, `LangProvider` checks `?lang=<code>`.
2. If the query parameter is absent or unsupported, it reads `localStorage.lang`.
3. If neither yields a supported code, it defaults to English.
4. Changing language updates local storage and React state.
5. The root `<html>` element receives the active `lang` and `dir`.

### Risks — see "Stage 1 URL Closure" for what has since been closed

- The browser language is not detected. *(still open)*
- Changing language does not update the URL. *(resolved before this stage — path prefix now IS the URL)*
- A copied internal deep link normally loses language unless `?lang=` is manually present. *(resolved — the path prefix travels with the link)*
- The initial `?lang=` value remains in the URL even after switching languages, so the visible URL can disagree with the active UI. *(resolved by Stage 1's legacy `?lang=` redirect — see below)*
- Query parameters are not included in canonical URLs. *(still open pending Stage 1b's full canonical/hreflang work)*
- Most localized views share one canonical URL, so search engines cannot index six distinct language versions. *(resolved — every language now has its own path-prefixed URL)*
- Back/forward history does not represent language changes. *(resolved — language is baked into the URL path)*
- Static `/it/` and `/fr/` pages are separate documents, not the React routes with preserved paths. *(resolved by Stage 1 — see below; those shadow files never existed on disk and the dead rewrite plugin that assumed they did has been removed)*

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

### Static language landing pages — REMOVED, see "Stage 1 URL Closure" below

> This subsection described static shadow documents at `/it/index.html` and
> `/fr/index.html`. Stage 1 URL Closure re-verified this directly against
> the repository: **no such files, or any file matching `**/index.html`
> other than the app's own root `index.html`, exist anywhere in the tracked
> tree, and no build step generates them.** `vite.config.ts`'s
> `localizedStaticPages` plugin — which rewrote `/it/`/`/fr/` requests to a
> `index.html` under those paths — was therefore rewriting to files that
> never existed; it has been removed. `/it/`, `/fr/`, `/ar/`, `/es/`,
> `/de/` are now all served identically, by the same SPA `index.html` every
> other route uses, through the general Vite dev/preview pipeline plus the
> new canonical-redirect middleware (see below) — proven directly against a
> real `vite preview` server with no static shadow files present. Kept here,
> not deleted, as a record of what the audit originally (and correctly, at
> the time) found.

Historical content, no longer accurate — only these dedicated language documents were found to exist at audit time:

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

The sitemap contains the main English-path routes plus `/it/` and `/fr/`; it does not provide language variants for internal routes or Arabic, Spanish, and German. *(Sitemap multi-language coverage remains deferred to Stage 1b — see below.)*

## Findings by severity

### Critical

1. **Language state is not represented by stable localized URLs.** *(RESOLVED by a pre-Stage-1 migration to the path-prefix model, and Stage 1 URL Closure closed the remaining redirect/canonical gaps that left open — see "Stage 1 URL Closure" below. The full canonical/hreflang/sitemap SEO layer remains Stage 1b.)*  
   A user can view six languages, but most pages have one language-neutral URL and one canonical. This breaks reliable localized deep links and prevents complete multilingual indexing.

2. **Several high-trust and high-conversion surfaces are English-only.**  
   Privacy, Terms, Refund Policy, Wishlist, AI Tutor, Community, Calendar, and most of Admin are not connected to the language context. (Attendance and Homework were on this list at the time of the original audit; both were removed as fake/preview-only pages in Stage 2 Batch 1 and no longer exist, so they are no longer a localization gap.)

3. **Static language coverage is inconsistent.** *(RESOLVED by Stage 1 URL Closure — the static shadow documents this finding described never existed on disk; the dead rewrite plugin that assumed they did has been removed. See "Stage 1 URL Closure" below.)*  
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

## Stage 1 URL Closure (canonical path-prefix model, legacy redirects, breadcrumbs)

Addendum, added by the Stage 1 URL Closure task — closes the redirect/canonical-URL gaps left open after the path-prefix migration referenced throughout this document as "resolved before/by this stage." Does not rewrite the sections above; corrective notes were added in place instead, pointing here. Ordered roughly by the task's own sections.

### The model

- English is unprefixed (`/`, `/courses/ijazah`, ...). Every other supported language (`fr`, `it`, `ar`, `es`, `de`) gets a leading `/{lang}` path segment (`/fr/`, `/fr/courses/ijazah`, ...). `en` never gets a `/en/` prefix.
- The **path prefix is the single source of truth** for the active language — not a query string, not `localStorage` alone (`localStorage['lang']` is written on every language switch purely so a *future* fresh, unprefixed visit can offer the right default; it never overrides an explicit path prefix).
- `<BrowserRouter basename>` is computed once at boot from the initial URL (`main.jsx`) — switching language is a real full-page navigation, not in-place React state.
- `src/utils/urlCanonicalize.js`'s `computeCanonicalUrl({ pathname, search })` is the **single, shared decision function** for what a canonical URL looks like. Both the Vite dev/preview server middleware (`vite.config.ts`) and the pre-mount browser runtime fallback (`src/utils/bootRedirect.js`, wired into `main.jsx` before `createRoot`) call it — neither re-implements any part of the redirect logic, so the two can never drift from each other.

### Legacy `?lang=` migration

A URL still carrying the old `?lang=<code>` query parameter is migrated to the path-prefix form in one pass:

| Input | Output |
|---|---|
| `/?lang=fr` | `/fr/` |
| `/?lang=en` | `/` |
| `/?lang=xx` (unsupported) | `/` (no prefix invented; `lang` still stripped) |
| `/courses/ijazah?lang=ar&foo=bar#lesson` | `/ar/courses/ijazah?foo=bar#lesson` |
| `/fr/courses/ijazah?lang=de&foo=bar` | `/fr/courses/ijazah?foo=bar` (an existing path prefix always wins over a conflicting `?lang=`) |

`lang` is always removed from the query string once consumed; every other query parameter is preserved, in its original relative order. An unsupported or empty `lang` value never invents a prefix — it is simply dropped.

### Trailing-slash policy

- A bare language root gets a trailing slash: `/fr` → `/fr/` (308). `/` and `/fr/` are already canonical and are never touched.
- An internal path never has a trailing slash: `/courses/` → `/courses` (308); `/fr/resources/faq/` → `/fr/resources/faq` (308, prefix kept).
- Both dimensions (legacy-lang migration and trailing-slash normalization) are resolved by the same single call to `computeCanonicalUrl()`, so a URL needing both fixes gets exactly one redirect, never a chain.
- The redirect status is **308 Permanent Redirect** (preserves method/semantics), with the canonical `pathname` + `search` in the `Location` header.

### Where the 308 actually runs

Verified against the real repository structure (`package.json`, `.replit`, `replit.md`, `vite.config.ts`, `public/_redirects`, and `artifacts/api-server`'s source) before implementing anything:

- **Vite dev** (`pnpm run dev`) and **Vite preview** (`pnpm run serve`): implemented, via a `canonicalUrlRedirect()` Vite plugin (`configureServer`/`configurePreviewServer` middleware) in `vite.config.ts`. Proven live against a real `vite preview` server — every example in the table above returns 308 with the correct `Location`, and following the redirect lands on a 200 with no further hop.
- Real static assets (favicon, robots.txt, sitemap.xml, hashed JS/CSS chunks, ...) and any `/api/*` path are explicitly excluded from this middleware (`src/utils/assetOrApiPath.js`) and are served untouched.
- **`artifacts/api-server`** (the same-origin `/api` gateway) was inspected directly: it has zero static-file-serving or frontend-routing logic of its own — only `/api/*` handlers and a pure reverse proxy to the upstream academy backend. It is not a serving layer for the frontend and was correctly left untouched.
- **Production deployment — DEFERRED, not locally provable**: the tracked `.replit`'s `[deployment]` block sets only `router = "application"` and `deploymentTarget = "autoscale"`, plus a `postBuild` hook (`pnpm store prune`) — it has **no `run` or `build` key**, so the exact command that actually serves traffic in a real Replit deployment is not stored anywhere in the tracked repo (confirmed by grepping the whole tree for `deployment.run`/`deployment.build`/a bare `run =`: zero matches outside the untouched, historical `.migration-backup/.replit`). `router = "application"` (rather than a static-file router) is *consistent with* an actual server process running — and this app exposes no `dev`/`build`/`serve` script other than `vite preview` (`serve`) as a plausible candidate — but that is an inference, not proof: the real run command lives in Replit's own platform-side deployment configuration, outside this tracked tree, and was correctly out of scope for this branch to touch. **Do not treat the 308 as proven in real production** — it is proven only against a locally-run `vite preview` server (see above). There is no additional, separately-owned production HTTP server file in the tracked tree to attach a redirect to beyond what's already covered above; no new server was invented. If a genuinely separate production edge/CDN layer is introduced later, or the real Replit run command is confirmed to be something other than `vite preview`, it will need this same 308 contract (re-using `computeCanonicalUrl()` directly, since it has zero dependencies and is trivially portable) — tracked as **deferred**, not blocking, since the runtime fallback below already covers that gap defensively today regardless of what production actually runs.
- **The server can see `pathname` and `search`, never `hash`** — an HTTP request never carries a fragment. Hash preservation is proven at the runtime-utility and browser level (`src/test/urlCanonicalize.test.js`'s `formatCanonicalHref` tests, `src/test/bootRedirect.test.js`), never claimed as server-proven.

### Runtime fallback (pre-mount)

`src/utils/bootRedirect.js`'s `runBootRedirect()` runs in `main.jsx` **before** `createRoot()` is ever called — not inside a component or effect, so there is nothing mounted for a flash to be visible in. It calls the same `computeCanonicalUrl()` on `window.location`; if the URL isn't canonical, it calls `window.location.replace()` (never `.assign()`, so the legacy URL never enters session history) and the module's `if (!redirected)` guard skips creating a React root entirely for that pass. Covers any non-canonical URL a server 308 doesn't (a static host that doesn't run the Vite middleware, a stale bookmark, etc.). Proven idempotent (a canonical URL is always a no-op, so there is no redirect loop) and proven, via a real dynamic import of `main.jsx` with `react-dom/client` mocked, to actually skip `createRoot()` on redirect and call it exactly once otherwise.

### Removed: the static-shadow-page rewrite

`vite.config.ts`'s old `localizedStaticPages` plugin rewrote `/it/` and `/fr/` requests to `{path}index.html`, assuming dedicated static documents existed there. Re-verified directly: **no such files exist anywhere in the tracked tree, and no build step generates them** (confirmed by a full-tree search and by reading `scripts/gen-sitemap.mjs`, which only emits sitemap `<loc>` entries, not HTML). The plugin has been removed outright — not replaced with a new one — and `/fr/`, `/it/`, `/ar/`, `/es/`, `/de/`, and every internal locale-prefixed route are now served by the same general SPA pipeline as every other route, through the new canonical-redirect middleware. Proven live: `/fr/`, `/it/`, `/ar/`, `/fr/resources/faq`, `/it/courses/ijazah` all return 200 with real rendered HTML against a `vite preview` server with zero static shadow files present. Building a real prerendered static-HTML pipeline (so crawlers get pre-rendered markup per language) is unrelated to this removal and remains explicitly **Stage 1b**.

### Internal links: canonical routes only

- Programmatic navigation to the site root must never use react-router's `navigate('/')` — under a non-English `basename`, react-router's own `joinPaths` special-case for a literal `"/"` produces `/fr` with **no** trailing slash (the same issue `homeHref()` already documented for `<Link to="/">`). Fixed via a new `goHome(hash)` helper in `src/utils/localePath.js` (a full `window.location.assign(homeHref(hash))`, bypassing the router's basename join entirely) — applied to `DashboardLayout.jsx`'s logout and `EnrollWizard.jsx`'s post-enrollment "Back Home" button, the two call sites re-proven live in the current code. Internal-route navigations that aren't the special root case (e.g. `navigate('/dashboard')`) were left untouched — they resolve correctly under a basename already.
- Every raw `<a href="/...">` internal anchor found on re-audit (`IsnadChain.jsx`'s `/enroll` and `/teachers`, `TermsOfService.jsx`'s `/academy/privacy`) was converted to a React Router `<Link>`, so `basename` correctly prefixes it for the active language. The one documented exception is `<a href={homeHref(...)}>`, for the same root-path reason `goHome()` exists.
- Internal links pointing at deprecated compatibility aliases (`/teachers`, `/teachers/:id`, `/course/islamic-studies`, `/blog`, `/blog/:slug`) were repointed to their canonical routes (`/academy/teachers`, `/academy/teachers/:id`, `/courses/islamic-studies`, `/resources/blog`, `/resources/blog/:slug`) across `Tutors.jsx`, `TeacherProfile.jsx`, `HadithLibrary.jsx`, `CourseIslamicStudies.jsx`, `CourseIjazah.jsx`, `Blog.jsx`, and `BlogPost.jsx` (including its `Breadcrumbs` `to` target and its JSON-LD `mainEntityOfPage`).
- **The compatibility redirects themselves are not removed** — `App.jsx` still defines `<Route path="/teachers" element={<Navigate to="/academy/teachers" replace />} />` and its siblings, since external/bookmarked links to the old paths may still exist. Only new internal code is required to use the canonical path directly.
- Two automated, whole-`src`-tree guards (`src/test/internalLinkGuards.test.js`), using Vite's own `transformWithEsbuild` + `parseAstAsync` (already a project dependency — no new package added) to inspect real JSX prop AST nodes rather than a source-text regex, now fail the suite if either pattern is reintroduced anywhere in `src` (excluding `src/test/`, and excluding `App.jsx` for the alias guard specifically, since that file is where the compatibility redirects are legitimately defined).

### BreadcrumbList JSON-LD: locale-correct URLs

`useSEO.js`'s `buildBreadcrumb()` correctly stripped the locale segment from each crumb's **name** (so a French page never showed a spurious "Fr" breadcrumb) but then built every crumb's **URL** from that same locale-stripped path — silently dropping the prefix from the URL too, so a French page's `BreadcrumbList` pointed entirely at English URLs. Fixed by rebuilding each URL via `pathFor()` (the same canonical-path builder used everywhere else in the app), so this can never drift from the redirect policy above. Example (`/fr/courses/ijazah`): `Home → https://…/fr/`, `Courses → https://…/fr/courses`, `Ijazah → https://…/fr/courses/ijazah` — names stay `Home`/`Courses`/`Ijazah`, never `Fr`.

### Explicitly deferred to Stage 1b

Not started in this task, on purpose:

- Full canonical `<link rel="canonical">` + `hreflang` alternates injection (currently the canonical tag is pathname-only and language-naive — see Findings #1/#5 above).
- A real multi-language `sitemap.xml` (route × 6 languages, reciprocal hreflang) — `scripts/gen-sitemap.mjs` still only emits the English routes plus bare `/it/`/`/fr/` and needs a rewrite once this stage's route/prefix model is the assumed input.
- `og:locale` / Open Graph per-language metadata.
- A real prerendering pipeline (pre-rendered HTML per language for crawlers).
- `FAQPage`/`Person` JSON-LD schema work.

## Audit conclusion

The project already has unusually broad locale-object coverage and a useful structural parity test. The principal gap is not missing main-dictionary keys; it is inconsistent consumption of those dictionaries across global UI, legal pages, authenticated products, auxiliary datasets, API messages, and metadata. The next localization phases should therefore work page-family by page-family, beginning with shared chrome and high-trust conversion flows, while preserving structural parity and making fallbacks observable.