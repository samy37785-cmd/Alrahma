# French Localization Registry

Tracks the French localization program for the public site. EN and AR are the published languages. French is **not** published yet: it is not in the sitemap, hreflang or prerender, and none of those change until the Batch 5 publication gate.

Baseline: `origin/main` @ `79561a4`, audited 2026-09-27 against production.

## Status values

| Status | Meaning |
|---|---|
| `complete` | Visible text, title, description and H1 are French after render |
| `partial` | French page exists but has English metadata and/or English body text |
| `blocked-review` | Needs religious or legal human review before French text can ship |
| `draft-review` | French translated faithfully from the English source in an open Draft PR, not merged. The owner may review before merge; this is not a blocker |
| `source-accuracy` | The English (or EN/AR) source itself has a known error or contradiction. French follows the English source as-is; the source is fixed separately, outside the French PRs, and does not block the batch |
| `not-applicable` | Not a public SEO page: auth, admin, legacy redirect, error |
| `owner-review-recommended` | Legal or consent text translated faithfully from the English. The owner is advised to read it before French is published; it does not block the Draft |

`SEO` = in the EN/AR sitemap + prerender today (`published`) or not (`unpublished`). French is `unpublished` everywhere.

## Public templates (31)

| # | Template (EN path) | AR path | FR path | Batch | FR status | EN/AR SEO | Religious review | Legal review | FR gaps found |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `/ar/` | `/fr/` | 1A | draft-review | published | **yes** (IsnadChain section, quiz Ijazah claim) | no | Batch 1A: title/description, level quiz, IsnadChain, TrustBar/TrustBadges countries, leaked strings, course labels, a11y labels |
| 2 | `/courses` | `/ar/courses` | `/fr/courses` | 1A | draft-review | published | no | no | Batch 1A: title/description |
| 3 | `/courses/quran` | `/ar/courses/quran` | `/fr/courses/quran` | 1A | draft-review | published | yes | no | Batch 1A: title/description |
| 4 | `/courses/arabic` | `/ar/courses/arabic` | `/fr/courses/arabic` | 1A | draft-review | published | no | no | Batch 1A: title/description. H1 "Alphabet arabe et italien" kept as the source says, pending owner |
| 5 | `/courses/ijazah` | `/ar/courses/ijazah` | `/fr/courses/ijazah` | 1B | draft-review | published | owner may review (Sanad/Ijazah claims) | no | Batch 1B: title/description/OG, Course JSON-LD text, H1, hero, stats, learn list, 4 stages, 4 books, prerequisites, audience, perks, enroll card |
| 6 | `/courses/islamic-studies` | `/ar/courses/islamic-studies` | `/fr/courses/islamic-studies` | 1B | draft-review | unpublished | owner may review (hadith lines from English, book descriptions) | no | Batch 1B: title/description/OG, Course JSON-LD text, H1, hero, stats, learn list, hadith of the day (17), 5 modules, 9 books, audience, perks, enroll card |
| 7 | `/academy` | `/ar/academy` | `/fr/academy` | 1A | draft-review | published | no | no | Batch 1A: description |
| 8 | `/academy/about` | `/ar/academy/about` | `/fr/academy/about` | 1A | draft-review | published | no | no (owner narrative) | Batch 1A: H1, founder story (owner review) |
| 9 | `/academy/teachers` | `/ar/academy/teachers` | `/fr/academy/teachers` | 1C | draft-review | published | owner may review (teacher claims) | no | Batch 1C: SEO description and hero glossary ("ijaza"), hero sub "(sanad)" restored from the English, subject filters "Tajwid" / "Ijaza" / "Sira" |
| 10 | `/academy/teachers/:id` (11) | `/ar/academy/teachers/:id` | `/fr/academy/teachers/:id` | 1C | draft-review | published | owner may review (Sanad/Ijazah claims) | no | Batch 1C: 10 bios and 5 titles/specialties/credential labels (glossary; "Aqeedah" → "Aqida"), "Certificat d'ijaza", sanad line faithful to the English, French `<title>` for an unknown id |
| 11 | `/resources/faq` | `/ar/resources/faq` | `/fr/resources/faq` | 1C | draft-review | published | owner may review | no | Batch 1C: 12 of 18 items — omissions restored from the English (#2, #4, #6, #14, #17), "Quran" restored in 2 questions, glossary, "plans" → "formules", WhatsApp button label |
| 12 | `/resources` | `/ar/resources` | `/fr/resources` | 1D | draft-review | published | no | no | Batch 1D: SEO description; hero (eyebrow/H1/sub) and the 4 hub cards were already French |
| 13 | `/enroll` | `/ar/enroll` | `/fr/enroll` | 1C | draft-review | unpublished | no | owner-review-recommended (consent/booking wording) | Batch 1C: French title/description/keywords, 27 country names (submitted value unchanged), subject labels (glossary), gender-preference label, age labels, e-mail wording, phone example = the English one, success title brand name |
| 14 | `/academy/privacy` | `/ar/academy/privacy` | `/fr/academy/privacy` | 1C | draft-review | published | no | **owner-review-recommended** | Batch 1C: GA4 "Analytics cookies" section in French (from the English), "Cookie settings" button, back link. Date, contact and cookie policy unchanged |
| 15 | `/academy/terms` | `/ar/academy/terms` | `/fr/academy/terms` | 1C | draft-review | published | no | **owner-review-recommended** | Batch 1C: 5 fidelity fixes — "for any reason", "agree to be bound", "any subscription plan", "all tutor changes within 48 hours", glossary |
| 16 | `/academy/refund-policy` | `/ar/academy/refund-policy` | `/fr/academy/refund-policy` | 1C | draft-review | published | no | **owner-review-recommended** | Batch 1C: plan display name « Ijaza » |
| 17 | `/tools` | `/ar/tools` | `/fr/tools` | 3 | complete | published | no | no | Batch 1D verified: hub, badges and the free-trial modal (all validation, failure and success states) are French; no fix needed |
| 18 | `/tools/adhkar` | `/ar/tools/adhkar` | `/fr/tools/adhkar` | 3 | complete | published | **yes** (dhikr meanings) | no | — |
| 19 | `/tools/tasbeeh` | `/ar/tools/tasbeeh` | `/fr/tools/tasbeeh` | 3 | partial | published | yes | no | Title, description, H1 and body EN |
| 20 | `/tools/quran-reader` | `/ar/tools/quran-reader` | `/fr/tools/quran-reader` | 3 | complete (UI) | unpublished | **yes** (translation source) | no | — |
| 21 | `/tools/hadith` | `/ar/tools/hadith` | `/fr/tools/hadith` | 3 | partial → blocked-review | unpublished | **yes** | no | EN body |
| 22 | `/tools/verse-of-the-day` | `/ar/tools/verse-of-the-day` | `/fr/tools/verse-of-the-day` | 3 | partial → blocked-review | unpublished | **yes** (FR Quran translation not chosen; shows EN translation id 20) | no | Verse translation EN |
| 23 | `/tools/arabic-alphabet` | `/ar/tools/arabic-alphabet` | `/fr/tools/arabic-alphabet` | 3 | complete | published | no | no | — |
| 24 | `/tools/prayer` | `/ar/tools/prayer` | `/fr/tools/prayer` | 4 | complete | published | no | no | Batch 1D verified: hero and all 4 card titles/descriptions are French ("Qibla" kept as the site's existing French spelling); its 4 links go to still-deferred tools (1E), untouched |
| 25 | `/tools/prayer-times` | `/ar/tools/prayer-times` | `/fr/tools/prayer-times` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 26 | `/tools/qibla` | `/ar/tools/qibla` | `/fr/tools/qibla` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 27 | `/tools/islamic-calendar` | `/ar/tools/islamic-calendar` | `/fr/tools/islamic-calendar` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 28 | `/tools/tajweed-checker` | `/ar/tools/tajweed-checker` | `/fr/tools/tajweed-checker` | 4 | partial | unpublished | yes | no | Page EN |
| 29 | `/tools/hifz-review` | `/ar/tools/hifz-review` | `/fr/tools/hifz-review` | 4 | partial | unpublished | no | no | Page EN |
| 30 | `/resources/blog` | `/ar/resources/blog` | `/fr/resources/blog` | 1D | draft-review | unpublished | n/a | no | Batch 1D: title/description, and 2 hardcoded English JSX literals (loading aria-label, load-error message) that had no lang branch at all — en/ar keep the exact same literal, fr is a faithful translation. API still returns 0 posts; out of French SEO publication until French articles exist |
| 31 | `/resources/blog/:slug` | — | — | — | not-applicable (0 posts) | unpublished | n/a | no | — |

## Not applicable (36 routes)

| Group | Routes | Reason |
|---|---|---|
| Public functional | 6 (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/payment/success`, `/payment/cancel`) | UI already French via `fr.js`; never indexed. `/payment/success` currently renders `index` (separate EN/AR fix, not part of this program) |
| Authenticated | 9 | Private |
| Admin | 2 | Private |
| Legacy redirects | 18 | Redirect only |
| Error (`*`) | 1 | `noindex` |

## Why the page counts differ (31 templates / 40 URLs vs a 29 + 29 sitemap)

- 31 public templates = 29 static + 2 dynamic (teacher profile, blog post).
- Public URLs per language = 29 static + 11 teacher profiles + 0 blog posts = **40**.
- Sitemap/prerender per language = **29** = 18 static templates + 11 teacher profiles.
- The **11** public static templates missing from the sitemap are deliberately excluded in `scripts/prerender-routes.mjs`:
  - async fetch: `/tools/quran-reader`, `/tools/hadith`
  - geolocation: `/tools/prayer-times`, `/tools/qibla`, `/tools/islamic-calendar`
  - date-dependent: `/tools/verse-of-the-day`, `/courses/islamic-studies`
  - localStorage: `/tools/hifz-review`
  - unaudited tool: `/tools/tajweed-checker`
  - empty blog: `/resources/blog`
  - AR content gap at the time: `/enroll`
- 18 + 11 = 29 static. 29 + 11 = 40. No discrepancy.

## Translation policy (owner decision, 2026-09-27)

Applies to Batch 1A and every later batch.

- **English is the canonical source for French.** French is translated directly from the English text into natural, professional French.
- Arabic is **not** used as a source for French translation.
- No English transliteration and no Arabicised spelling: use the natural French term, consistently across the site.
- No fact, promise, number or claim that is not in the English text.
- A French PR never "corrects" the English text and never changes EN or AR output.

Religious text:

- Quran or hadith text shown in its original Arabic stays exactly as it is.
- Explanations and interface text are translated faithfully from the English.
- The French is a translation of the English page. It is never presented as an approved religious interpretation (tafsir or sharh).
- A wrong source link, or a contradiction between EN and AR, is not changed in the French PR. It is logged below as a separate `source-accuracy` issue.

Also:

- Course JSON-LD `inLanguage` describes the language of instruction (currently `en`, `ar`), not the page language. It is not changed by translation.

## Batches

| Batch | Templates | State |
|---|---|---|
| 1A | `/`, `/courses`, `/courses/quran`, `/courses/arabic`, `/academy`, `/academy/about` | Merged (PR #130) |
| 1B | `/courses/ijazah`, `/courses/islamic-studies` | Merged (PR #131). Inventory: [french-batch1b-religious-review.md](french-batch1b-religious-review.md) |
| 1C | `/academy/teachers`, `/academy/teachers/:id` (11), `/resources/faq`, `/enroll`, `/academy/privacy`, `/academy/terms`, `/academy/refund-policy`, and the shared cookie banner | Merged (PR #133) |
| 1D | `/resources`, `/tools`, `/tools/prayer`, `/resources/blog` | Draft PR, not merged. Inventory below |
| 1E | The remaining `/tools/*` pages (Quran Reader, Adhkar, Hadith, Prayer Times, Qibla, Islamic Calendar, Verse of the Day, Tasbeeh, Arabic Alphabet, Tajweed Checker, Hifz Review) | Not started; needs separate approval |
| 5 | French SEO publication gate (sitemap, hreflang, prerender) | Not started |

## Batch 1C inventory (scope audit, `origin/main` @ `8f8b014`)

Audited from `App.jsx`, `scripts/prerender-routes.mjs` and this registry. Only routes that exist were considered; none was added. There is no `/pricing`, `/contact` or `/trial` route: pricing is shown on `/` (Batch 1A) and in the enroll wizard's plan step (1C), the free-trial booking **is** `/enroll`, and contact details appear on the legal pages and in the footer.

### Included in Batch 1C

| Template | FR URLs | States checked (per language) | Distinct visible/accessible strings in French, all states (approx., header/footer included) |
|---|---|---|---|
| `/academy/teachers` | 1 | 19: loaded, every bio open, each of the 8 subject / 2 gender / 5 language filters, no-match, reset | 259 |
| `/academy/teachers/:id` | 11 dynamic (ids 1–11) + unknown id | 12 | 279 |
| `/resources/faq` | 1 | 20: loaded, all questions shown, each of the 18 answers open | 54 |
| `/enroll` | 1 | 21: each step, each of the 7 validation messages, plan choice (3), no-match tutor list, failed submit, success screen (API mocked), arrival with `?teacher=&plan=` | 357 |
| `/academy/privacy` | 1 | 2: with and without the GA section | 33 |
| `/academy/terms` | 1 | 1 | 141 |
| `/academy/refund-policy` | 1 | 1 | 132 |
| Cookie banner (shared, every page while GA is configured) | — | 1 | 6 (banner + "Cookie settings") |

7 templates + 1 shared element; 6 static + 11 dynamic = **17 French URLs**. Nothing is submitted: the booking request is mocked in tests and never sent during review.

### Deferred

| Template | To | Reason |
|---|---|---|
| `/resources` | 1D | Hub page for the tools and blog, grouped with them |
| `/tools/*` (13 templates) | 1D / 1E | Religious tools, heavy dynamic content or religious review (Quran Reader, Adhkar, Hadith, Prayer Times, …) |
| `/resources/blog`, `/resources/blog/:slug` | later | Empty listing (0 posts) |

### Not applicable

Unchanged from the table below: login / register / password pages, payment result pages, authenticated and admin pages, legacy redirects, 404 (36 routes), plus `/courses/:id` (private course content).

## Batch 1D inventory (scope audit, `origin/main` @ `1a8d498`)

Audited from `App.jsx`, `scripts/prerender-routes.mjs` and this registry. Only routes that exist were considered; none was added. Interactive religious tools, and any page reading the API, today's date, the visitor's location or `localStorage`, are deferred to Batch 1E — not because they are hard, but because their content is the tool's live output, not static UI text.

### Included in Batch 1D

| Template | Why included | States checked (per language) | What changed |
|---|---|---|---|
| `/resources` | Static hub: a hero and 4 link cards to other pages (blog, FAQ, about, teachers). No API, date or location | 1 | SEO description translated to French. The hero and the 4 cards were already French |
| `/tools` | Static hub: a hero, 6 link cards to tool pages, and a free-trial modal (form only, no external send in this review) | 6 (hub, modal open, 2 validation states, a failed and a successful mocked trial request) | Verified only — hub, badges and the modal were already fully French from earlier work; no source change was needed |
| `/tools/prayer` | Static hub: a hero and 4 link cards to `/tools/prayer-times`, `/tools/qibla`, `/tools/islamic-calendar`, `/tools/verse-of-the-day` — all 4 are 1E tools. Per the task's card-only rule, only this hub's own title/description were in scope, never the tools behind the links | 1 | Verified only — hero and all 4 card titles/descriptions were already French (`i18n/content.js` `TOOLS_TEXT.fr`, added in earlier unrelated work, not this program). "Qibla" is kept as the site's existing French spelling, not a leak |
| `/resources/blog` | The blog **index** shows only static UI chrome today: a title, category filter, and an empty-state message, because the API returns 0 posts. No article content exists to translate | 3 (loading, load-error, the empty listing — the only states production can reach) | SEO title/description translated. Two hardcoded English JSX literals with no lang branch at all (the loading aria-label, the load-error message) now read from `i18n/resources/content.js`; en/ar keep the exact same literal byte-for-byte |

4 templates, 0 new dynamic URLs (the blog has 0 posts, so `/resources/blog/:slug` renders nothing to localize). Nothing is submitted or sent: the blog API and the free-trial request are mocked in tests, and no form was submitted or link clicked externally during local review.

### Deferred to Batch 1E

| Template | Reason |
|---|---|
| `/tools/quran-reader`, `/tools/hadith` | Fetches live content from the API |
| `/tools/prayer-times`, `/tools/qibla`, `/tools/islamic-calendar` | Reads geolocation and/or today's date |
| `/tools/verse-of-the-day` | Reads today's date; picks a verse translation |
| `/tools/tasbeeh` | Reads/writes `localStorage` |
| `/tools/arabic-alphabet`, `/tools/tajweed-checker`, `/tools/hifz-review` | Interactive tool, not static UI (Hifz Review also reads `localStorage`) |

### Deferred: blog articles

`/resources/blog/:slug` stays `not-applicable`: the API returns 0 posts (`docs/french-localization-registry.md` row 31), so there is no article content to translate. No article, seed data or API contract change was made.

### Not applicable

Unchanged from the table below: login/register/password pages, payment result pages, authenticated and admin pages, legacy redirects, 404.

## Owner review (non-blocking)

Translated faithfully from the English source under the policy above. Status: `faithful-English-source translation — owner may review before merge`. None of these blocks Batch 1A. No reviewer is named; none is filled in on anyone's behalf.

| # | Item | Template | Source |
|---|---|---|---|
| 1 | Founder story | `/academy/about` | `i18n/about/founderStory.js` `fr` |
| 2 | IsnadChain section (transmission chain, tutors' sanad) | `/` | `i18n/home/isnadChain.js` `fr` |
| 3 | Level quiz, including the Ijazah recommendation | `/` | `i18n/home/levelQuiz.js` `fr` |
| 4 | SEO titles/descriptions, H1, leaked strings, course labels, country names, a11y labels | all 1A | 1A `fr` entries, `i18n/a11yLabels.js` |
| 5 | Privacy policy GA4 section, cookie banner (`owner-review-recommended`) | 1C `/academy/privacy`, every page | `pages/Privacy.jsx` `ANALYTICS_PRIVACY_COPY.fr`, `analytics/consentCopy.js` `fr` |
| 6 | Terms and refund policy fidelity fixes (`owner-review-recommended`) | 1C `/academy/terms`, `/academy/refund-policy` | `pages/TermsOfService.jsx` `translated.fr`, `pages/RefundPolicy.jsx` `fr` |
| 7 | Teacher bios and credential labels | 1C teachers, profiles | `data/marketing/teachers.js` `fr` |

## Owner decisions applied in Batch 1A (PR #130)

| # | Decision | Applied |
|---|---|---|
| D1 | Home hadith (Sahih al-Bukhari 5027): French shows a faithful French translation of the English line, not the Arabic original | `i18n/home/isnadChain.js` `fr.quote`: « Les meilleurs d'entre vous sont ceux qui apprennent le Coran et l'enseignent. » Translated from the English only; presented as a translation, not an approved interpretation; no commentary added. EN and AR unchanged |
| D2 | French glossary for Batch 1A: **tajwid**, **ijaza** (never "Tajweed" / "Ijazah") | Every French string rendered on the six 1A pages (text, a11y labels, `<option>`s, `<title>`, `<meta>`, all quiz screens). Guarded by `frenchBatch1aPages.test.jsx` |

## French glossary

| English source | French | Notes |
|---|---|---|
| Tajweed | tajwid | Lower case inside a sentence; capital only at the start of a label |
| Ijazah | ijaza (feminine: « une ijaza ») | The pricing plan's **display** name is « Ijaza ». The submitted plan value stays `Ijazah` (`data/home.js`) |

Some strings used on the 1A pages are shared with other French pages: the nav, footer, trust badges, tutors section, the FAQ item on Home, and the Home teacher cards. The glossary change therefore also shows wherever those same strings appear.

### Later work: glossary outside Batch 1A (not changed now)

French strings that still say "Tajweed" / "Ijazah" and do not render on any 1A page. They get the glossary in their own batch:

| File | Where | Count | Batch |
|---|---|---|---|
| `i18n/fr.js` | dashboard `certTypes.ijazah` | 1 (dashboard, authenticated) | Not applicable to the public program. Teachers, teacher profile and enroll lines: **done in 1C**. Blog `sub` and the resources card: **done in 1D** |
| `data/faqItems.js` `fr` | FAQ page answers | — | **Done in 1C** |
| `data/marketing/teachers.js` `fr` | bios, credential label | — | **Done in 1C** |

## Source-accuracy issues

Known errors or contradictions in the English (or EN/AR) source. French follows the English as-is. Each is fixed separately, outside the French PRs, with the owner's decision, and **does not block** its batch.

| # | Issue | Where (source) | Affects | French today |
|---|---|---|---|---|
| S1 | Teaching-language count is inconsistent within English: "in 17 languages" vs "English, Italian, French, German or Spanish" vs "English, Italian or French" | `i18n/courses/seo.js` `quran.en`; `en.js` `hubs.courses.sub`, `hubs.quran` Hifz card; `en.js` `hero.sub`; `en.js` features (line 90) | 1A `/courses/quran`, `/courses`, `/` | Translates each English sentence as written ("en 17 langues") |
| S2 | "Arabic & Italian Alphabet" H1: intent unconfirmed (the page body describes Italian phonetic equivalents) | `en.js` `hubs.arabic.heading` | 1A `/courses/arabic` | "Alphabet arabe et italien" (existing `fr.js`, unchanged) |
| S3 | Ijazah SEO description: English names "the Seven Qira'at", Arabic does not | `pages/CourseIjazah.jsx` `useSEO` description (EN vs AR) | 1B `/courses/ijazah` | Follows the English (mentions the sept qira'at) |
| S4 | Ijazah "What you'll learn" item 10: English "Authorisation to teach the Quran with your own Sanad"; Arabic adds "and issue Ijazahs" | `pages/CourseIjazah.jsx` `LEARN.en[9]` vs `LEARN.ar[9]` | 1B `/courses/ijazah` | Follows the English (teaching authorisation only) |
| S5 | Ijazah duration stat: English "Average Duration", Arabic "المدة المتوقعة" (expected duration) | `pages/CourseIjazah.jsx` stats | 1B `/courses/ijazah` | Follows the English ("Durée moyenne") |
| S6 | Islamic Studies: "40 core hadiths" / "40 Hadiths of Imam Al-Nawawi" vs the book card's "42 hadiths" | `data/islamicStudiesData.js` `MODULES[3].topics`, `LEARN[3]` vs `BOOKS[5]` | 1B `/courses/islamic-studies` | Follows each English sentence as written (40 and 42) |
| S7 | Islamic Studies learn item 1: English "Islamic theology", Arabic "علم الكلام الإسلامي" (a specific discipline) | `data/islamicStudiesData.js` `LEARN.en[0]` vs `LEARN.ar[0]` | 1B `/courses/islamic-studies` | Follows the English ("la théologie islamique") |
| S8 | Hadith "The best of people are those who are most beneficial to people" (Al-Tabarani): its link points to the Nawawi 40 collection (`sunnah.com/nawawi40`), not to this hadith | `data/islamicStudiesData.js` `HADITHS[16].url` | 1B `/courses/islamic-studies` | Same link kept (URLs are not changed by translation) |

| S9 | Enroll `<title>` says "Book Free Trial **Lessons**" (plural) while its description, the FAQ and the Terms say **one** free trial lesson | `i18n/enroll/seo.js` `en.title` | 1C `/enroll` | Follows the English (« Réserver des cours d'essai gratuits ») |
| S10 | FAQ refund answer ("If you are unhappy after your first paid month … We cannot offer refunds for lessons that have already been delivered") contradicts the Refund Policy and Terms (full refund within 24 days of the first payment, "No deductions for lessons already attended") | `data/faqItems.js` item 13 `en` vs `pages/RefundPolicy.jsx`, `pages/TermsOfService.jsx` §3 | 1C `/resources/faq`, `/academy/refund-policy` | Each page follows its own English text |
| S11 | Teacher 5 "Abd Allah Ayman": the English card button and profile use the first word of the name — "Enroll with Abd", "About Abd" ("Abd" is not a standalone name; the Arabic page already uses the full name) | `pages/Teachers.jsx` (`nameEn.split(' ')[0]`), `pages/TeacherProfile.jsx` `firstName` | 1C teachers, profile 5 | Same code, so French shows « S'inscrire avec Abd », « À propos de Abd » |
| S12 | Terms §4 and the refund policy tell customers to cancel "from your Billing page", but a booking request creates no account (Booking-First Enrollment; see the success-screen comment in `EnrollWizard.jsx`) | `pages/TermsOfService.jsx` `cancellation`, `pages/RefundPolicy.jsx` `cancellationText` | 1C `/academy/terms`, `/academy/refund-policy` | Follows the English (« depuis votre page de facturation ») |
| S13 | Privacy "Last updated: June 2026" predates the GA4 analytics section added in September 2026 (PR #129) | `pages/Privacy.jsx` `updated` | 1C `/academy/privacy` | Date kept as in the English, not changed by translation |

Also: S1 (teaching-language count) appears on 1C as well — FAQ item 5 says "English, Italian or French".

Resolved: "24-day" refund stat matches `siteFacts.refundWindowDays` (24). Not an issue.
