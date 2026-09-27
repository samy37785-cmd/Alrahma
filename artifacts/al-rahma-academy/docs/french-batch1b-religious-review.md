# French Batch 1B — Inventory and review notes

Inventory used for Batch 1B (`/courses/ijazah`, `/courses/islamic-studies`). Batch 1B is implemented in its own Draft PR; the `source-accuracy` rows below are tracked as S3–S8 in [french-localization-registry.md](french-localization-registry.md#source-accuracy-issues).

Batch 1B follows the translation policy in [french-localization-registry.md](french-localization-registry.md#translation-policy-owner-decision-2026-09-27):

- English is the canonical source. The Arabic hadith text stays as it is.
- Explanations and interface text are translated faithfully from the English, including the English meaning shown under each hadith.
- The French is presented as a translation of the English page, never as an approved religious interpretation.
- Rows marked **source-accuracy** are known errors or EN/AR contradictions in the source. French follows the English as-is; the source is fixed separately and does not block Batch 1B.
- No reviewer is named in this file.

Baseline: `origin/main` @ `79561a4`. Line numbers refer to that commit.

## Review types

| Code | Meaning |
|---|---|
| **R-HADITH** | Hadith: Arabic kept as-is; the English meaning is translated faithfully (owner may review) |
| **R-CLAIM** | Religious credential claim (Ijazah, Sanad, authorisation to teach): translated faithfully from English; owner may review |
| **R-TERM** | Islamic terminology: natural, consistent French term (no English transliteration) |
| **R-FACT** | Scholarly fact (book, author, date, verse/hadith count, superlative): translated as the English states it; owner may verify |
| **O-BIZ** | Business claim (duration, languages, schedule, cancellation): translated as the English states it; owner may confirm |
| **UI** | Plain interface text |

## A. `/courses/ijazah` — source `src/pages/CourseIjazah.jsx`

Before Batch 1B: title, description, H1 and all body text below rendered in **English** on `/fr/courses/ijazah` (27 `isAr ?` ternaries; `COURSE_UI.fr` section headings are already French).

### A1. Ijazah and Sanad claims (R-CLAIM)

| # | Current EN source (line) | AR counterpart | Note for reviewer |
|---|---|---|---|
| 1 | **source-accuracy (EN/AR differ)** — `useSEO` description (308): "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars." | 307 | EN mentions "the Seven Qira'at"; AR does not. Decide which is correct before translating |
| 2 | Hero badge (335): "Rare Certification" | "شهادة نادرة ورفيعة" | Superlative claim |
| 3 | Hero sub (340): "…continuous chain of transmission (Sanad) connected directly to the Prophet Muhammad ﷺ — and become authorised to teach the Quran." | 339 | Core Sanad + teaching-authorisation claim |
| 4 | LEARN[7] (22): "Complete Quran recitation test before a certified Sheikh" | 34 | |
| 5 | LEARN[8] (23): "Official Ijazah certificate with Sanad to the Prophet ﷺ" | 35 | |
| 6 | **source-accuracy (EN/AR differ)** — LEARN[9] (24): "Authorisation to teach the Quran with your own Sanad" | 36: "…وإصدار إجازات" | **EN/AR differ**: AR adds "and issue Ijazahs" |
| 7 | Stage 4 points (128–132): full recitation, final evaluation by certified Ijazah Sheikh, "Sanad documentation — unbroken chain to the Prophet ﷺ", official signed certificate, "You are now authorised to teach and issue your own Ijazah" | 135–139 | |
| 8 | PERKS (247): "1-on-1 with certified Ijazah Sheikh", "Official Sanad document issued" | 248 | |
| 9 | FOR[2] (235): "Muslims worldwide who want a Sanad to the Prophet ﷺ"; FOR[3]: "Those who want the highest Quranic credential" | 241–242 | Superlative |
| 10 | Course JSON-LD `name`/`description` (312–313), EN only | — | Batch 1B: French `name`/`description`/`educationalLevel`/`teaches` on the French page only. `inLanguage: ['en','ar']` is the language of instruction and stays unchanged |

### A2. Curriculum, Qira'at and Tajweed terms (R-TERM, R-FACT)

| # | Current EN source (line) | Note for reviewer |
|---|---|---|
| 11 | LEARN[0] (15): "Complete mastery of all Tajweed rules — Hafs & Warsh" | Scope of "all rules" and both riwayat |
| 12 | LEARN[1–3] (16–18): Matn Al-Jazariyyah / Tuhfat Al-Atfal / Matn Al-Shatibiyyah — "the Seven Mutawatir Qira'at" | EN/AR descriptions differ: AR names Imam Al-Jamzouri, EN does not |
| 13 | LEARN[4–6] (19–21): Makhaarij "all 17", Sifaat, Waqf & Ibtida' | Counts to verify |
| 14 | STAGES 1–4 titles, durations, sources, authors, points (44–139) | Terms: Idghaam, Ikhfa', Iqlab, Izhar, Madd types, Tafkheem/Tarqeeq, Mutaqaribain…; "12 waqf signs"; Stage 3 teaches the Seven Qira'at in "6 – 12 months" |
| 15 | Stage 3 points (103–107): Hafs 'an 'Asim "most widely recited worldwide", Warsh 'an Nafi' "used across North Africa" | Factual/geographic claims |

### A3. Source books (R-FACT)

| # | Book (line) | Facts to verify before translating |
|---|---|---|
| 16 | Tuhfat Al-Atfal (147–162) | Author Imam Sulayman Al-Jamzouri; "61 verses"; topics |
| 17 | Matn Al-Jazariyyah (164–179) | Ibn Al-Jazari "d. 833 AH"; "107 verses"; "the greatest Tajweed scholar in Islamic history" (superlative); "Sifaat Al-Huroof (18 characteristics)" |
| 18 | Matn Al-Shatibiyyah (181–196) | Al-Shatibi "d. 590 AH"; "1,173 verses" |
| 19 | Madinah Mus'haf (198–213) | "The world's most widely distributed Mus'haf" (superlative); link quran.gov.sa |

### A4. Business facts (O-BIZ) and interface text (UI)

| # | Current EN source (line) | Note |
|---|---|---|
| 20 | Stats (355–358): "2+ Years — Average Duration", "Advanced", "1-on-1", "4 Stages" | **source-accuracy**: EN says "Average", AR says "المتوقعة" (expected) |
| 21 | PREREQS (217–222): fluent reading, Tuhfat level, "at least 3 lessons per week", Hifz recommended | Owner to confirm |
| 22 | PERKS (247): schedule, Zoom/Skype/Meet, monthly reports, "Cancel anytime" | Owner to confirm; "Cancel anytime" also needs legal review against the refund policy |
| 23 | Title/H1/breadcrumb/enroll card (305, 331, 336, 446), BookCard `linkLabel` | UI |

## B. `/courses/islamic-studies` — sources `src/pages/CourseIslamicStudies.jsx`, `src/data/islamicStudiesData.js`, `src/components/features/courses/IslamicStudiesBookCard.jsx`

Before Batch 1B: title, description, H1, the hadith card meaning and all body text rendered in **English** on `/fr/courses/islamic-studies` (27 `isAr` ternaries; `COURSE_UI.fr` headings are already French). The page is date-dependent (hadith of the day) and not prerendered.

### B1. Hadith of the day — 17 hadiths (R-HADITH)

`HADITHS` (`islamicStudiesData.js` 1–138). Each entry has the Arabic `arabic` text (shown on every language), an English meaning `en`, an Arabic `ar` text, `narrator`, `source` and a sunnah.com `url`. Under the policy, French keeps `arabic` unchanged and translates the English `en` meaning faithfully, presented as a translation of the English, not an approved interpretation. The notes below are for the owner's optional review; only H17 is a `source-accuracy` issue.

| # | Hadith (Arabic incipit) | Source given | Reviewer note |
|---|---|---|---|
| H1 | إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ | Nawawi 40 #1 | |
| H2 | الإِحْسَانُ أَنْ تَعْبُدَ اللَّهَ كَأَنَّكَ تَرَاهُ | Nawawi 40 #2 | Excerpt of the Hadith of Jibreel |
| H3 | بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ | Nawawi 40 #3 | |
| H4 | إِنَّ أَحَدَكُمْ يُجْمَعُ خَلْقُهُ فِي بَطْنِ أُمِّهِ | Nawawi 40 #4 | EN meaning is abridged |
| H5 | إِنَّ الْحَلَالَ بَيِّنٌ | Nawawi 40 #6 | EN meaning is abridged |
| H6 | الدِّينُ النَّصِيحَةُ | Nawawi 40 #7 | |
| H7 | إِنَّ اللَّهَ طَيِّبٌ | Nawawi 40 #10 | Contains a Quran verse (Al-Mu'minun 23:51); a French verse meaning also needs an approved Quran translation |
| H8 | دَعْ مَا يَرِيبُكَ | Nawawi 40 #11 | |
| H9 | مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ | Nawawi 40 #12 | |
| H10 | لَا يُؤْمِنُ أَحَدُكُمْ | Nawawi 40 #13 | |
| H11 | لَا تَغْضَبْ | Nawawi 40 #16 | |
| H12 | اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ | Nawawi 40 #18 | Two narrators |
| H13 | احْفَظِ اللَّهَ يَحْفَظْكَ | Nawawi 40 #19 | EN meaning is abridged |
| H14 | الطُّهُورُ شَطْرُ الإِيمَانِ | Nawawi 40 #23 | EN meaning is abridged |
| H15 | مَنْ رَأَى مِنْكُمْ مُنْكَرًا | Nawawi 40 #34 | |
| H16 | كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ | Nawawi 40 #40 | |
| H17 | خَيْرُ النَّاسِ أَنْفَعُهُمْ لِلنَّاسِ | Al-Tabarani, Al-Mu'jam Al-Awsat | **source-accuracy**: its `url` points to the Nawawi 40 collection, not to this hadith |

Also in the hadith card: narrator names (`narrator.en`), source labels (`source.en`), link label "Read full hadith — Sunnah.com ↗" (UI).

### B2. Modules — 5 (R-TERM, R-FACT)

`MODULES` (140–196): titles, durations (8/10/8/6/8 weeks = the "40 Weeks" stat), source book per module, 5–6 topics each.

| # | Module | Reviewer note |
|---|---|---|
| 24 | Aqeedah — Islamic Creed | Topics include Tawhid categories, Qadar, "Refutation of common theological misconceptions" (doctrinal wording) |
| 25 | Fiqh — Islamic Jurisprudence | Worship rulings; madhhab not stated |
| 26 | Seerah — Prophetic Biography | |
| 27 | Hadith & Ethics | **source-accuracy**: "40 core hadiths" here vs "42 hadiths" in the Nawawi book card |
| 28 | Tafsir — Quranic Interpretation | Juz 'Amma, Asbab Al-Nuzul |

### B3. Source books — 9 (R-FACT)

`BOOKS` (198–326), rendered by `IslamicStudiesBookCard.jsx`: title, Arabic title, author, module, description, topics, link label.

| # | Book | Facts to verify before translating |
|---|---|---|
| 29 | Islamic Creed Series — Dr. Umar Al-Ashqar | "9-volume"; "used by Islamic universities worldwide" |
| 30 | Al-Fiqh Al-Muyassar — King Fahd Complex | "2-volume authoritative work" |
| 31 | Bulugh Al-Maram — Ibn Hajar (d. 852 AH) | "~1,432 hadiths in 16 books" |
| 32 | The Sealed Nectar — Mubarakpuri | "Winner of the World Muslim League's first prize"; "gold standard of modern Seerah" (superlative) |
| 33 | Ash-Shama'il Al-Muhammadiyah — Al-Tirmidhi (d. 279 AH) | "417 hadiths across 56 chapters" |
| 34 | Al-Arba'een Al-Nawawiyyah — Al-Nawawi (d. 676 AH) | "42 hadiths"; "every single hadith is considered a foundation of the religion" |
| 35 | Riyad As-Salihin — Al-Nawawi | "nearly 1,900 hadiths across 20 chapters"; "most widely read" (superlative) |
| 36 | Al-Adab Al-Mufrad — Al-Bukhari (d. 256 AH) | "1,322 hadiths — 57 chapters" |
| 37 | Al-Tafsir Al-Muyassar — King Fahd Complex | Link label points to quran.com |

### B4. Page text, claims and business facts

| # | Current EN source | Type | Note |
|---|---|---|---|
| 38 | `useSEO` title/description (`CourseIslamicStudies.jsx` 29–32), hero H1/sub (60–64) | R-TERM + UI | "taught by certified scholars" is a credential claim (R-CLAIM) |
| 39 | Course JSON-LD `name`/`description`/`teaches` (35–41), EN only | — | Batch 1B: French `name`/`description`/`educationalLevel`/`teaches` on the French page only; `inLanguage` unchanged |
| 40 | LEARN (`islamicStudiesData.js` 329–338) | R-TERM | **source-accuracy**: EN "Islamic theology" vs AR "علم الكلام الإسلامي" (a specific discipline) |
| 41 | LEARN[7] / PERKS: "Lessons available in English, Arabic, Italian, French, German, or Spanish", "Available in 6 languages", stat "6 Lang" | O-BIZ | Owner to confirm instruction languages |
| 42 | FOR (352–357): "New Muslims…", "Western Muslims…", "…not just opinions" | UI + R-TERM | |
| 43 | PERKS (367): "1-on-1 with certified scholar", "Cancel anytime" | R-CLAIM / O-BIZ | "Cancel anytime" also needs legal review |
| 44 | Stats (79–83), badge "5 Complete Modules", enroll card "5 Modules · All Levels" | UI / O-BIZ | |

## Counts

| Page | R-HADITH | R-CLAIM | R-TERM / R-FACT | O-BIZ | UI | EN/AR differences found |
|---|---|---|---|---|---|---|
| `/courses/ijazah` | 0 | 10 | 9 | 3 | 1 | 3 (#1, #6, #20) |
| `/courses/islamic-studies` | 17 hadiths (+1 Quran verse inside H7) | 2 | 15 | 2 | 3 | 2 (#27, #40) + 1 source link (H17) |

The `source-accuracy` rows are in the current published EN/AR source. Fixing them is an EN/AR change outside the French PRs, needs the owner's decision, and does not block Batch 1B.
