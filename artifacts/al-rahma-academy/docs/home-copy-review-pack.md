# Home page copy review pack

Date: 2026-09-18
Status: **read-only inventory. No translation has been written into the app. No code was changed to produce this document.**

## What this file is

A literal, verbatim inventory of every English string on `/` (Home) that is either missing a translation entirely or hardcoded in English regardless of the visitor's language, confirmed directly against the live site (`https://al-rahmaacademy.com`) across `en/ar/it/es/de/fr`, desktop and mobile, in a prior read-only browser review this same session. This file exists so a human (or a separately-commissioned translator) can review and supply real `ar/it/es/de/fr` copy — it is **not** that translation.

This complements, and does not replace, the older `docs/localization-audit.md` (2026-08-27), which covers the whole site at a higher level and already flagged "`Home` uses localized FAQ schema content but an English title, description, and keywords" as one line among many. This file is the narrow, line-level breakdown for Home specifically, produced from the current code plus a live visual pass.

## Rules this document follows

- **No AI-authored translation appears anywhere below or in any code file.** Every non-English cell in the tables is empty or says `NEEDS_HUMAN_REVIEW` — never a guessed translation.
- **Quranic/Hadith text:** the one Hadith quotation on Home (in IsnadChain) is kept as the English wording already present in the code plus its already-stated source citation (`Sahih Al-Bukhari`, already in the code, not added by me). Where I additionally note the commonly-known Arabic wording for a human reviewer's convenience, it is explicitly labeled as a **reference aid to verify**, not an authored translation or a new religious attribution — the exact book/chapter/hadith-number reference still needs human/scholarly confirmation before publication.
- Nothing in `Home.jsx`, `LevelQuiz.jsx`, `IsnadChain.jsx`, any `src/i18n/*` file, `sitemap.xml`, or Supabase was touched to produce this document.
- `Home`'s registry status in `src/data/translationStatus.js` remains `legacy` for every non-English language — unchanged by this document.

## Column legend

- **English (verbatim)** — the exact string currently in the code (or, for a template, the literal template with its current interpolated values noted).
- **Where** — file and line, current as of this session.
- **Type** — `content` (visible on the page), `SEO` (title/meta/keywords), or `a11y` (accessibility-only: `aria-label`/`title` attribute, not visible body text).
- **Languages needed** — always `ar, it, es, de, fr` (`en` is the existing source and is not itself a gap).
- **Status** — always `NEEDS_HUMAN_REVIEW` in this pass. No row in this document has been translated.

---

## 1. Home SEO (title / description / keywords)

`src/pages/Home.jsx:34,38-39`

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 1.1 | `Learn the Quran Online — Al-Rahma Academy` | `Home.jsx:34` | SEO | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 1.2 | `` One-to-one online Quran, Tajweed and Arabic lessons with Al-Azhar certified tutors, trusted by ${siteFacts.totalStudents} students in ${siteFacts.countriesServed} countries. One free trial lesson — no payment needed. `` (template; current live values: `totalStudents = '1,500+'`, `countriesServed = 10`) | `Home.jsx:35-38` | SEO | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 1.3 | `learn quran online, online quran classes, quran tutor, tajweed lessons, al-azhar tutor, online islamic studies, quran for children, hifz online` | `Home.jsx:39` | SEO | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 3 source strings.**

---

## 2. LevelQuiz (entire component)

`src/components/features/marketing/LevelQuiz.jsx` — zero `useLang` import, 100% hardcoded English today.

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 2.1 | `Find your course` (rendered upper-case by CSS) | `LevelQuiz.jsx:94` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.2 | `3 questions → your perfect lesson plan` | `LevelQuiz.jsx:95` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.3 | `Can your child / you read Arabic?` | `LevelQuiz.jsx:8` (question 1) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.4 | `Not yet — starting from zero` | `LevelQuiz.jsx:10` (Q1 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.5 | `A few letters — needs practice` | `LevelQuiz.jsx:11` (Q1 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.6 | `Yes, can read Arabic` | `LevelQuiz.jsx:12` (Q1 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.7 | `What is your main goal?` | `LevelQuiz.jsx:18` (question 2) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.8 | `Learn to read the Quran correctly` | `LevelQuiz.jsx:20` (Q2 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.9 | `Memorize the Quran (Hifz)` | `LevelQuiz.jsx:21` (Q2 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.10 | `Earn an Ijazah certification` | `LevelQuiz.jsx:22` (Q2 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.11 | `Islamic Studies / Arabic` | `LevelQuiz.jsx:23` (Q2 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.12 | `Who is this for?` | `LevelQuiz.jsx:29` (question 3) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.13 | `My child (under 12)` | `LevelQuiz.jsx:31` (Q3 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.14 | `My teenager (12–17)` | `LevelQuiz.jsx:32` (Q3 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.15 | `Myself (adult)` | `LevelQuiz.jsx:33` (Q3 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.16 | `Multiple family members` | `LevelQuiz.jsx:34` (Q3 option) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.17 | `Quran Reading — Noorani Qaida` (title) | `LevelQuiz.jsx:42` (recommendation: read) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.18 | `Start from the very first letter. Our tutors take complete beginners to confident Quran reading in 4–6 months.` (desc) | `LevelQuiz.jsx:43` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.19 | `🌱 Perfect for beginners` (badge) | `LevelQuiz.jsx:45` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.20 | `Quran Memorization (Hifz)` (title) | `LevelQuiz.jsx:48` (recommendation: memorize) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.21 | `A structured Hifz plan with daily revision, spaced repetition, and personal accountability — for all ages.` (desc) | `LevelQuiz.jsx:49` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.22 | `🏆 Most popular course` (badge) | `LevelQuiz.jsx:51` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.23 | `Quran Ijazah Course` (title) | `LevelQuiz.jsx:54` (recommendation: ijazah) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.24 | `Receive an Ijazah with a connected chain (sanad) back to the Prophet ﷺ — taught by Ijazah-holders themselves.` (desc) | `LevelQuiz.jsx:55` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.25 | `📜 Advanced certification` (badge) | `LevelQuiz.jsx:57` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.26 | `Islamic Studies & Arabic` (title) | `LevelQuiz.jsx:60` (recommendation: islamic) | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.27 | `Aqeedah, Fiqh, Seerah, Hadith, Tafsir — plus foundational Arabic — in your language.` (desc) | `LevelQuiz.jsx:61` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.28 | `🌍 All levels welcome` (badge) | `LevelQuiz.jsx:63` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.29 | `Your personalised recommendation` (result screen eyebrow) | `LevelQuiz.jsx:126` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.30 | `Start free trial — no card needed` (button) | `LevelQuiz.jsx:136` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.31 | `Learn more about this course` (button) | `LevelQuiz.jsx:143` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 2.32 | `← Retake quiz` (button) | `LevelQuiz.jsx:147` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 32 source strings.** Confirmed live on `/ar/`, `/it/`, `/es/`, `/de/`, `/fr/` (desktop text extraction + a full click-through of all 3 questions to the result screen on `/fr/`, plus a full accessibility-tree snapshot on `/ar/` mobile) — every one of these 32 strings renders in English regardless of the visitor's selected language. On Arabic specifically, string 2.2 and 2.3 also visually re-order due to the page's RTL direction mixing with this raw LTR text (a layout symptom of the same root cause, not a separate translation gap — see the visual review from the prior turn for screenshots).

---

## 3. IsnadChain (entire component)

`src/components/features/marketing/IsnadChain.jsx` — zero `useLang` import, 100% hardcoded English today.

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 3.1 | `Our Legacy` (rendered upper-case by CSS) | `IsnadChain.jsx:40` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.2 | `Every lesson is connected to` / `1,400 years of unbroken transmission` (two-line heading) | `IsnadChain.jsx:42-43` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.3 | `When your child learns with Al-Rahma, they join a living chain — the same Quran recited to the Prophet ﷺ, passed down generation by generation to your home.` | `IsnadChain.jsx:46-47` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.4 | `The Prophet ﷺ` (chain node name) | `IsnadChain.jsx:7` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.5 | `Received revelation in the Cave of Hira` (chain node detail) | `IsnadChain.jsx:8` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.6 | `The Companions` (chain node name) | `IsnadChain.jsx:13` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.7 | `Memorised and transmitted word-for-word` (chain node detail) | `IsnadChain.jsx:14` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.8 | `Al-Azhar University` (chain node name) | `IsnadChain.jsx:18` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.9 | `Over 1,000 years of unbroken scholarship` (chain node detail) | `IsnadChain.jsx:19` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.10 | `Our Tutors` (chain node name) | `IsnadChain.jsx:23` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.11 | `Ijazah-certified with verified sanad` (chain node detail) | `IsnadChain.jsx:24` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.12 | `Your Child` (chain node name) | `IsnadChain.jsx:28` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.13 | `Joins a 1,400-year chain of Quran learners` (chain node detail) | `IsnadChain.jsx:29` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.14 | **Hadith quotation:** `"The best of you are those who learn the Quran and teach it."` — see the dedicated note below before touching this row | `IsnadChain.jsx:71` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.15 | `— Sahih Al-Bukhari` (citation, already in the code as-is) | `IsnadChain.jsx:73` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.16 | `Give your child this gift →` (CTA link) | `IsnadChain.jsx:76` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 3.17 | `Meet our Ijazah holders` (CTA link) | `IsnadChain.jsx:79` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 17 source strings.** Confirmed live on all 5 non-English locales the same way as section 2; on Arabic, string 3.2 also visually re-orders ("years of unbroken 1,400 transmission") for the same RTL/raw-LTR-text reason.

### Row 3.14 — Hadith sourcing note (read before assigning translation)

The code already attributes this quotation to **Sahih Al-Bukhari** (row 3.15) — that attribution is unchanged from the existing source, not something this document adds. This is the well-known hadith usually rendered in Arabic as **خيركم من تعلم القرآن وعلّمه** ("The best of you are the one who learns the Qur'an and teaches it"), commonly cited to Sahih al-Bukhari (in the chapter on the merits of the Qur'an). **I have not verified the exact book/chapter/hadith-number reference against a primary or scholarly-vetted source in this session, and I am not asserting one.** Before any of the 5 target-language versions of row 3.14/3.15 are written or published:

1. A human (ideally with the relevant religious-content review authority for this site) should confirm the precise Sahih al-Bukhari reference (book and hadith number).
2. The Arabic version used on the site should be the **standard transmitted Arabic wording**, not a re-translation from the current English back into Arabic.
3. The it/es/de/fr versions should be translated from (or checked against) the verified Arabic original, not solely from the English paraphrase currently in the code.

This is flagged, not resolved, by this document — consistent with the instruction not to author a new translation or religious attribution.

---

## 4. Trial form — course dropdown options

`src/data/marketing/courses.js:57-64`, consumed by `src/components/features/marketing/Trial.jsx:3,43-45,169-171`. The dropdown's own placeholder text (`tr.placeholders.course`) **is** already translated per language — only the six option values below are not.

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 4.1 | `Quran Reading (Noorani Qaida)` | `courses.js:58` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 4.2 | `Recitation with Tajweed` | `courses.js:59` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 4.3 | `Quran Memorization (Hifz)` | `courses.js:60` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 4.4 | `Quran Ijazah` | `courses.js:61` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 4.5 | `Islamic Studies` | `courses.js:62` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 4.6 | `Arabic Language` | `courses.js:63` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 6 source strings.** Confirmed live in the Trial form's "Desired course" `<select>` on `/ar/` (mobile accessibility snapshot) and `/fr/` (desktop accessibility snapshot) — a required field in the site's primary conversion form.

---

## 5. Small hardcoded badges/CTAs inside otherwise-translated sections

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 5.1 | `Most Popular` (course row badge) | `Courses.jsx:164` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 5.2 | `Start your free trial` (CTA link text; the `→` glyph next to it is not text) | `Features.jsx:103` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 5.3 | `Featured Tutor` (spotlight tutor card badge) | `Tutors.jsx:225` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 3 source strings.**

---

## 6. "24-day" stat and country names

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 6.1 | `24-day` (the label next to it, `tb.moneyBack`, is already translated — only this numeral+word token is not) | `TrustBar.jsx:87` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 6.2 | 24 country names, one array: `UK, Germany, France, Italy, Spain, Netherlands, USA, Canada, Australia, Sweden, Norway, Belgium, Switzerland, Austria, Denmark, Portugal, Greece, Poland, Turkey, Saudi Arabia, UAE, Malaysia, Uzbekistan, Indonesia, South Africa` | `TrustBar.jsx:6-32` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 6.3 | A second, separate 15-country array (all 15 names are a subset of row 6.2's 24 — same words, second file, no shared source): `UK, Germany, France, Italy, Spain, Netherlands, Sweden, Canada, USA, Australia, Belgium, Switzerland, Austria, Portugal, Norway` | `TrustBadges.jsx:4-20` | content | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal for counting purposes: 1 ("24-day") + 24 unique country names = 25 source strings**, even though the country names physically live in two separate arrays in two files (a future fix should probably share one glossary array instead of maintaining two copies — noted here, not acted on).

---

## 7. Accessibility-only strings (`aria-label` / `title` attributes) — low priority

None of these are visible body text; they only affect screen-reader/assistive-technology users. Listed separately per your instruction.

| # | English (verbatim) | Where | Type | Languages needed | Status |
|---|---|---|---|---|---|
| 7.1 | `Live sessions available now` | `Hero.jsx:59` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.2 | `Scroll down to explore courses` (the adjacent *visible* text, `h.scroll`, is already translated — only this wrapping `aria-label` is not) | `Hero.jsx:144` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.3 | `Live lesson demo` (dialog `aria-label`) | `Hero.jsx:165` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.4 | `Live lesson demo` (iframe `title`, same text as 7.3, separate attribute) | `Hero.jsx:179` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.5 | `Close video` | `Hero.jsx:173` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.6 | `Trust signals` (section `aria-label`) | `TrustBadges.jsx:57` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.7 | `Countries represented` | `TrustBadges.jsx:125` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.8 | `Previous` (carousel arrow button, no visible text) | `MobileCarousel.jsx:29` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.9 | `Next` (carousel arrow button, no visible text) | `MobileCarousel.jsx:42` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.10 | `Introduction video for {teacher name}` (template, per-teacher) | `Tutors.jsx:73` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.11 | `Close video` (same text as 7.5, separate component/location) | `Tutors.jsx:76` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.12 | `{teacher name} introduction` (template, `title` attribute) | `Tutors.jsx:79` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.13 | `Watch {teacher name}'s introduction` (template) | `Tutors.jsx:107` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |
| 7.14 | `{n} reviews` (template, appears at two locations, same pattern) | `Tutors.jsx:124` and `Tutors.jsx:169` | a11y | ar, it, es, de, fr | NEEDS_HUMAN_REVIEW |

**Subtotal: 14 source string/pattern rows** (13 distinct wordings — 7.5 and 7.11 are the same English text in two places, counted once as a translation need, listed twice for completeness of "where").

---

## Totals — source strings needing ar/it/es/de/fr (none currently translated)

| Section | Source strings |
|---|---:|
| 1. Home SEO | 3 |
| 2. LevelQuiz | 32 |
| 3. IsnadChain | 17 |
| 4. Trial course options | 6 |
| 5. Most Popular / Start your free trial / Featured Tutor | 3 |
| 6. 24-day + country names | 25 |
| 7. Accessibility labels (low priority) | 13 (14 rows, 1 duplicate wording) |
| **Total distinct source strings** | **99** |

## Count per target language

Every one of the 99 source strings above needs the same 5 target-language versions — none exist yet for any of them on Home.

| Language | Strings still needed | Status |
|---|---:|---|
| `ar` | 99 | NEEDS_HUMAN_REVIEW |
| `it` | 99 | NEEDS_HUMAN_REVIEW |
| `es` | 99 | NEEDS_HUMAN_REVIEW |
| `de` | 99 | NEEDS_HUMAN_REVIEW |
| `fr` | 99 | NEEDS_HUMAN_REVIEW |

**No claim is made anywhere in this document that any of these 99 strings are translated or published in any language.** `src/data/translationStatus.js`'s `/` entry remains `legacy` for `ar/it/es/de/fr`, unchanged by this document.
