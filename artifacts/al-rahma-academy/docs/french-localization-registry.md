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

`SEO` = in the EN/AR sitemap + prerender today (`published`) or not (`unpublished`). French is `unpublished` everywhere.

## Public templates (31)

| # | Template (EN path) | AR path | FR path | Batch | FR status | EN/AR SEO | Religious review | Legal review | FR gaps found |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `/ar/` | `/fr/` | 1A | draft-review | published | **yes** (IsnadChain section, quiz Ijazah claim) | no | Batch 1A: title/description, level quiz, IsnadChain, TrustBar/TrustBadges countries, leaked strings, course labels, a11y labels |
| 2 | `/courses` | `/ar/courses` | `/fr/courses` | 1A | draft-review | published | no | no | Batch 1A: title/description |
| 3 | `/courses/quran` | `/ar/courses/quran` | `/fr/courses/quran` | 1A | draft-review | published | yes | no | Batch 1A: title/description |
| 4 | `/courses/arabic` | `/ar/courses/arabic` | `/fr/courses/arabic` | 1A | draft-review | published | no | no | Batch 1A: title/description. H1 "Alphabet arabe et italien" kept as the source says, pending owner |
| 5 | `/courses/ijazah` | `/ar/courses/ijazah` | `/fr/courses/ijazah` | 1B | partial (1B not started) | published | owner may review (Sanad/Ijazah claims) | no | Title, description, H1 and about 104 body strings EN-only (`pages/CourseIjazah.jsx` `isAr` ternaries) |
| 6 | `/courses/islamic-studies` | `/ar/courses/islamic-studies` | `/fr/courses/islamic-studies` | 1B | partial (1B not started) | unpublished | owner may review (hadith meanings from English, book descriptions) | no | About 23 page strings EN (`pages/CourseIslamicStudies.jsx`); 43 EN fields in `data/islamicStudiesData.js` incl. hadith translations |
| 7 | `/academy` | `/ar/academy` | `/fr/academy` | 1A | draft-review | published | no | no | Batch 1A: description |
| 8 | `/academy/about` | `/ar/academy/about` | `/fr/academy/about` | 1A | draft-review | published | no | no (owner narrative) | Batch 1A: H1, founder story (owner review) |
| 9 | `/academy/teachers` | `/ar/academy/teachers` | `/fr/academy/teachers` | 2 | complete | published | review teacher claims | no | — |
| 10 | `/academy/teachers/:id` (11) | `/ar/academy/teachers/:id` | `/fr/academy/teachers/:id` | 2 | complete | published | review Sanad/Ijazah claims | no | — |
| 11 | `/resources/faq` | `/ar/resources/faq` | `/fr/resources/faq` | 2 | complete | published | yes | no | — |
| 12 | `/resources` | `/ar/resources` | `/fr/resources` | 2 | partial | published | no | no | EN description |
| 13 | `/enroll` | `/ar/enroll` | `/fr/enroll` | 2 | partial | unpublished | no | yes (consent text) | EN title/description |
| 14 | `/academy/privacy` | `/ar/academy/privacy` | `/fr/academy/privacy` | 2 | partial | published | no | **yes** | GA4 section EN-only (EN/AR approved copy) |
| 15 | `/academy/terms` | `/ar/academy/terms` | `/fr/academy/terms` | 2 | complete | published | no | **yes** | — |
| 16 | `/academy/refund-policy` | `/ar/academy/refund-policy` | `/fr/academy/refund-policy` | 2 | complete | published | no | **yes** | — |
| 17 | `/tools` | `/ar/tools` | `/fr/tools` | 3 | complete | published | no | no | — |
| 18 | `/tools/adhkar` | `/ar/tools/adhkar` | `/fr/tools/adhkar` | 3 | complete | published | **yes** (dhikr meanings) | no | — |
| 19 | `/tools/tasbeeh` | `/ar/tools/tasbeeh` | `/fr/tools/tasbeeh` | 3 | partial | published | yes | no | Title, description, H1 and body EN |
| 20 | `/tools/quran-reader` | `/ar/tools/quran-reader` | `/fr/tools/quran-reader` | 3 | complete (UI) | unpublished | **yes** (translation source) | no | — |
| 21 | `/tools/hadith` | `/ar/tools/hadith` | `/fr/tools/hadith` | 3 | partial → blocked-review | unpublished | **yes** | no | EN body |
| 22 | `/tools/verse-of-the-day` | `/ar/tools/verse-of-the-day` | `/fr/tools/verse-of-the-day` | 3 | partial → blocked-review | unpublished | **yes** (FR Quran translation not chosen; shows EN translation id 20) | no | Verse translation EN |
| 23 | `/tools/arabic-alphabet` | `/ar/tools/arabic-alphabet` | `/fr/tools/arabic-alphabet` | 3 | complete | published | no | no | — |
| 24 | `/tools/prayer` | `/ar/tools/prayer` | `/fr/tools/prayer` | 4 | complete | published | no | no | — |
| 25 | `/tools/prayer-times` | `/ar/tools/prayer-times` | `/fr/tools/prayer-times` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 26 | `/tools/qibla` | `/ar/tools/qibla` | `/fr/tools/qibla` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 27 | `/tools/islamic-calendar` | `/ar/tools/islamic-calendar` | `/fr/tools/islamic-calendar` | 4 | partial | unpublished | no | no | Title, description, H1 EN |
| 28 | `/tools/tajweed-checker` | `/ar/tools/tajweed-checker` | `/fr/tools/tajweed-checker` | 4 | partial | unpublished | yes | no | Page EN |
| 29 | `/tools/hifz-review` | `/ar/tools/hifz-review` | `/fr/tools/hifz-review` | 4 | partial | unpublished | no | no | Page EN |
| 30 | `/resources/blog` | `/ar/resources/blog` | `/fr/resources/blog` | — | complete (empty listing) | unpublished | n/a | no | API returns 0 posts; out of French publication until French articles exist |
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
| 1A | `/`, `/courses`, `/courses/quran`, `/courses/arabic`, `/academy`, `/academy/about` | Draft PR, not merged |
| 1B | `/courses/ijazah`, `/courses/islamic-studies` | Not started; starts only on the owner's approval. Inventory: [french-batch1b-religious-review.md](french-batch1b-religious-review.md) |
| 2–5 | See the table above | Not started; each needs separate approval |

## Owner review (non-blocking)

Translated faithfully from the English source under the policy above. Status: `faithful-English-source translation — owner may review before merge`. None of these blocks Batch 1A. No reviewer is named; none is filled in on anyone's behalf.

| # | Item | Template | Source |
|---|---|---|---|
| 1 | Founder story | `/academy/about` | `i18n/about/founderStory.js` `fr` |
| 2 | IsnadChain section (transmission chain, tutors' sanad) | `/` | `i18n/home/isnadChain.js` `fr` |
| 3 | Level quiz, including the Ijazah recommendation | `/` | `i18n/home/levelQuiz.js` `fr` |
| 4 | SEO titles/descriptions, H1, leaked strings, course labels, country names, a11y labels | all 1A | 1A `fr` entries, `i18n/a11yLabels.js` |

## Open decisions for the owner (Batch 1A)

| # | Item | Current state in PR #130 | Why it is open |
|---|---|---|---|
| D1 | Home hadith (Sahih al-Bukhari 5027) | French shows the Arabic original (`ar.quote`), with no French meaning | The English page shows only the English meaning, not the Arabic. The policy keeps the Arabic original *where it is already shown* and translates from the English. The owner decides: (a) keep the Arabic original, or (b) show the French translation of the English line, as a translation, not an approved interpretation |
| D2 | Terminology in the new 1A text | "Tajweed", "Ijazah" (English transliterations), "Hifz" | The policy asks for the natural French term. Proposal: "tajwid" (already the French H1 of `/courses/quran`), "ijaza", "mémorisation (hifz)". `fr.js` also has "Tajweed"/"Ijazah" on 31 lines outside the 1A text |

## Source-accuracy issues

Known errors or contradictions in the English (or EN/AR) source. French follows the English as-is. Each is fixed separately, outside the French PRs, with the owner's decision, and **does not block** its batch.

| # | Issue | Where (source) | Affects | French today |
|---|---|---|---|---|
| S1 | Teaching-language count is inconsistent within English: "in 17 languages" vs "English, Italian, French, German or Spanish" vs "English, Italian or French" | `i18n/courses/seo.js` `quran.en`; `en.js` `hubs.courses.sub`, `hubs.quran` Hifz card; `en.js` `hero.sub`; `en.js` features (line 90) | 1A `/courses/quran`, `/courses`, `/` | Translates each English sentence as written ("en 17 langues") |
| S2 | "Arabic & Italian Alphabet" H1: intent unconfirmed (the page body describes Italian phonetic equivalents) | `en.js` `hubs.arabic.heading` | 1A `/courses/arabic` | "Alphabet arabe et italien" (existing `fr.js`, unchanged) |
| S3 | Batch 1B: EN/AR differences (Ijazah SEO description, LEARN[9], duration stat; Islamic Studies "40" vs "42" hadiths, "Islamic theology" vs "علم الكلام") and a hadith source link pointing to the wrong collection (H17) | See [french-batch1b-religious-review.md](french-batch1b-religious-review.md) | 1B | Not translated (1B not started) |

Resolved: "24-day" refund stat matches `siteFacts.refundWindowDays` (24). Not an issue.
