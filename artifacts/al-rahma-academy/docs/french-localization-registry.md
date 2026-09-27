# French Localization Registry

Tracks the French localization program for the public site. EN and AR are the published languages. French is **not** published yet: it is not in the sitemap, hreflang or prerender, and none of those change until the Batch 5 publication gate.

Baseline: `origin/main` @ `79561a4`, audited 2026-09-27 against production.

## Status values

| Status | Meaning |
|---|---|
| `complete` | Visible text, title, description and H1 are French after render |
| `partial` | French page exists but has English metadata and/or English body text |
| `blocked-review` | Needs religious or legal human review before French text can ship |
| `draft-review` | French text written in an open Draft PR, not merged, waiting for the review listed in the queue |
| `not-applicable` | Not a public SEO page: auth, admin, legacy redirect, error |

`SEO` = in the EN/AR sitemap + prerender today (`published`) or not (`unpublished`). French is `unpublished` everywhere.

## Public templates (31)

| # | Template (EN path) | AR path | FR path | Batch | FR status | EN/AR SEO | Religious review | Legal review | FR gaps found |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `/ar/` | `/fr/` | 1A | draft-review | published | **yes** (IsnadChain section, quiz Ijazah claim) | no | Batch 1A: title/description, level quiz, IsnadChain, TrustBar/TrustBadges countries, leaked strings, course labels, a11y labels |
| 2 | `/courses` | `/ar/courses` | `/fr/courses` | 1A | draft-review | published | no | no | Batch 1A: title/description |
| 3 | `/courses/quran` | `/ar/courses/quran` | `/fr/courses/quran` | 1A | draft-review | published | yes | no | Batch 1A: title/description |
| 4 | `/courses/arabic` | `/ar/courses/arabic` | `/fr/courses/arabic` | 1A | draft-review | published | no | no | Batch 1A: title/description. H1 "Alphabet arabe et italien" kept as the source says, pending owner |
| 5 | `/courses/ijazah` | `/ar/courses/ijazah` | `/fr/courses/ijazah` | 1B | blocked-review | published | **yes** (Sanad/Ijazah claims) | no | Title, description, H1 and about 104 body strings EN-only (`pages/CourseIjazah.jsx` `isAr` ternaries) |
| 6 | `/courses/islamic-studies` | `/ar/courses/islamic-studies` | `/fr/courses/islamic-studies` | 1B | blocked-review | unpublished | **yes** (hadith meanings, book descriptions) | no | About 23 page strings EN (`pages/CourseIslamicStudies.jsx`); 43 EN fields in `data/islamicStudiesData.js` incl. hadith translations |
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

## Program rules

- French text for rows marked **religious review** or **legal review** ships only after it is listed in the review queue below and approved by a named reviewer.
- No new religious, legal or teacher claims. Translate the approved EN/AR source faithfully.
- Course JSON-LD `inLanguage` describes the language of instruction (currently `en`, `ar`), not the page language. It is not changed by translation.

## Batches

| Batch | Templates | State |
|---|---|---|
| 1A | `/`, `/courses`, `/courses/quran`, `/courses/arabic`, `/academy`, `/academy/about` | Draft PR, not merged |
| 1B | `/courses/ijazah`, `/courses/islamic-studies` | Not started. Detailed list: [french-batch1b-religious-review.md](french-batch1b-religious-review.md). Starts only after the owner names a religious reviewer or an approved French translation source |
| 2–5 | See the table above | Not started; each needs separate approval |

## Review queue

No reviewer has been designated. The Reviewer column stays empty until the owner names one; no name is filled in on anyone's behalf. Everything below stays in a Draft PR and unpublished until approved.

| # | Item | Template | Source | Review needed | Reviewer | Status |
|---|---|---|---|---|---|---|
| 1 | Founder story, French translation (faithful, nothing added) | `/academy/about` | `i18n/about/founderStory.js` `fr` | **owner-review-required** | — | pending |
| 2 | IsnadChain section, French (transmission chain, Prophet ﷺ / Companions / Al-Azhar / tutors' sanad) | `/` | `i18n/home/isnadChain.js` `fr` | religious review | — | pending |
| 3 | Hadith (Sahih al-Bukhari 5027): French shows the approved Arabic original only; no French meaning written | `/` | `i18n/home/isnadChain.js` `fr.quote` | religious review: keep Arabic only, or approve a French meaning source | — | blocked-review (French meaning) |
| 4 | Level quiz, Ijazah recommendation: "chaîne connectée (sanad) remontant au Prophète ﷺ" | `/` | `i18n/home/levelQuiz.js` `fr.recommendations.ijazah` | religious review | — | pending |
| 5 | French terminology: "Tajweed" (new text) vs "tajwid" (existing `fr.js` H1/nav); "Ijazah" gender (fr.js uses both "un Ijazah" and "une ijaza"); Aqida/Sira spelling | all 1A | `fr.js`, 1A modules | French language review | — | pending |
| 6 | "Arabic & Italian Alphabet" / "Alphabet arabe et italien" H1: kept exactly as the source says | `/courses/arabic` | `fr.js` `hubs.arabic.heading` (unchanged) | owner to confirm intent | — | pending |
| 7 | "24-day" refund stat translated as "24 jours" (faithful to source) | `/` | `i18n/home/leakedStrings.js` `fr.refundWindowStat` | owner to confirm the source figure | — | pending |
| 8 | "in 17 languages" (courses/quran description, EN source) vs the hero listing 5 teaching languages | `/courses/quran`, `/` | `i18n/courses/seo.js` `quran.fr` | owner to confirm the source claim | — | pending |
| 9 | All Batch 1B items | `/courses/ijazah`, `/courses/islamic-studies` | see [french-batch1b-religious-review.md](french-batch1b-religious-review.md) | religious / owner / legal | — | not started |
