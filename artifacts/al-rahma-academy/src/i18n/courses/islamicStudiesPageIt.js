// Italian Islamic Studies Content Batch: page-level Italian text for
// /it/courses/islamic-studies (SEO title/description, Course JSON-LD text,
// breadcrumb, hero, stats, enroll card, hadith placeholder/link) and the
// page's marketing lists (learn / audience / perks, module titles,
// durations and topics, book UI labels).
//
// English is the canonical source: every string here is a faithful Italian
// translation of the English literal it mirrors, with nothing added,
// strengthened or weakened.
//
// Religious-source policy (owner-approved, same as French and Ijazah):
// - Stay in source form, not translated: book titles and Arabic titles,
//   authors (with `d. N AH`), the King Fahd publisher, Arabic text, the
//   honorific, source links, and every religious/scholarly term — Aqeedah,
//   Fiqh, Seerah, Tafsir, Hadith, Tawhid, Taharah, Salah, Sawm, Zakat, Hajj,
//   Umrah, Ihsan, Wudu, Ghusl, Tayammum, Nisab, Qadar, Akhlaq, Dawah…
// - The 17 hadiths (text, narrator, source reference), the nine book
//   descriptions and their 36 topic lists are NOT in this file: their `it`
//   entries in data/islamicStudiesData.js are literal copies of `en`,
//   exactly like French (no Italian translation of hadith text or book
//   description is created without a licensed source).
// - Italian number formatting applies to numbers in UI labels only (e.g.
//   "1.900 hadith" in a link label); numbers inside the English source
//   descriptions are untouched.
// The Course JSON-LD keeps `inLanguage` (language of instruction) unchanged.
export const ISLAMIC_STUDIES_PAGE_IT = {
  seoTitle: 'Corso di Studi Islamici',
  seoDescription:
    'Un programma completo basato sulle fonti che copre Aqeedah, Fiqh, Seerah, Hadith e Tafsir — 5 moduli strutturati insegnati da studiosi certificati nella tua lingua.',
  schemaName: 'Corso di Studi Islamici',
  schemaLevel: 'Tutti i livelli',
  schemaTeaches: 'Aqeedah, Fiqh, Seerah, Hadith, Tafsir, Studi Islamici',
  breadcrumb: 'Corso di Studi Islamici',
  badge: '5 moduli completi',
  h1: 'Studi Islamici',
  heroSub:
    'Un programma completo basato sulle fonti che copre Aqeedah, Fiqh, Seerah, Hadith e Tafsir — insegnato da studiosi certificati nella tua lingua.',
  stats: [
    { value: '5', label: 'Moduli tematici' },
    { value: 'Tutti i livelli', label: 'Principiante → avanzato' },
    { value: 'Individuale', label: 'Lezioni private' },
    { value: '40 settimane', label: 'Programma completo' },
    { value: '6 lingue', label: 'Lingue di insegnamento' },
  ],
  hadithLink: "Leggi l'hadith completo — Sunnah.com ↗",
  // Plain loading-state UI copy, shown only for the moment before the client
  // picks today's hadith after hydration (and in the prerender capture, which
  // never resolves it) — not hadith/narrator/book text.
  hadithLoading: "Caricamento dell'hadith del giorno…",
  enrollTitle: 'Studi Islamici',
  enrollSub: '5 moduli · Tutti i livelli',

  learn: [
    'Aqeedah di base — Tawhid, i sei pilastri della fede e la teologia islamica',
    'Fiqh pratico — Taharah, Salah, Sawm, Zakat e Hajj',
    'Seerah completa — la vita del Profeta ﷺ dalla nascita alla morte',
    "I 40 Hadith dell'Imam Al-Nawawi con spiegazione completa e applicazione quotidiana",
    "Tafsir del Juz 'Amma e di sure selezionate con approfondimento linguistico",
    "Etica islamica (Akhlaq) derivata dall'esempio del Profeta",
    'Ogni materia insegnata dalla sua fonte islamica autentica e primaria',
    'Lezioni disponibili in inglese, arabo, italiano, francese, tedesco o spagnolo',
  ],
  audience: [
    'Nuovi musulmani che desiderano una base islamica solida e strutturata',
    'Famiglie che desiderano educare i figli a una conoscenza islamica autentica',
    "Musulmani occidentali che desiderano imparare l'Islam nella propria lingua",
    "Chiunque desideri un'istruzione islamica basata sulle fonti — non solo opinioni",
  ],
  perks: [
    'Lezioni individuali con uno studioso certificato',
    'Scegli il tuo modulo di partenza',
    'Disponibile in 6 lingue',
    'Orario settimanale flessibile',
    'Zoom / Skype / Google Meet',
    'Annulla quando vuoi',
  ],

  moduleTitles: [
    'Aqeedah — il Credo islamico',
    'Fiqh — la Giurisprudenza islamica',
    'Seerah — la Biografia del Profeta',
    'Hadith ed etica',
    "Tafsir — l'interpretazione del Corano",
  ],
  moduleDurations: ['8 settimane', '10 settimane', '8 settimane', '6 settimane', '8 settimane'],
  // 26 topics: 5 + 5 + 6 + 5 + 5.
  moduleTopics: [
    [
      'Pilastri della Fede (Arkan Al-Iman) — tutti e sei in profondità',
      "Tawhid — Rububiyyah, Uluhiyyah e Asma' wa Sifat",
      'Credere negli Angeli, nei Libri e nei Profeti',
      "Credere nell'Ultimo Giorno e nel Decreto Divino (Qadar)",
      'Confutazione dei comuni fraintendimenti teologici',
    ],
    [
      'Taharah — Wudu, Ghusl e Tayammum per intero',
      'Salah — condizioni, pilastri, atti di Sunnah e invalidanti',
      'Sawm — regole del Ramadan, Kaffarah e digiuni volontari',
      'Zakat — soglie del Nisab, tipi di ricchezza, beneficiari validi',
      'Hajj e Umrah — pilastri, obblighi e riti passo dopo passo',
    ],
    [
      'Arabia preislamica — il mondo prima del Profeta ﷺ',
      'Nascita, infanzia e prima vita del Profeta ﷺ',
      'Il periodo meccano — prima rivelazione, Dawah e persecuzione',
      'Hijrah a Medina — il punto di svolta della storia islamica',
      'Battaglie, trattati e la Conquista della Mecca',
      'Hajj di addio e morte del Profeta ﷺ',
    ],
    [
      '40 Hadith fondamentali con spiegazione completa e contesto',
      'Introduzione alle scienze del Hadith (Mustalah Al-Hadith)',
      "Etica islamica (Akhlaq) dall'esempio del Profeta ﷺ",
      'Diritti di Allah, diritti di sé stessi, diritti degli altri',
      'Applicazione pratica nella vita quotidiana moderna',
    ],
    [
      "Introduzione alle scienze del Tafsir ('Ulum Al-Quran)",
      "Tafsir completo del Juz 'Amma (da An-Naba' ad An-Nas)",
      'Tafsir delle sure meccane e medinesi principali',
      'Contesto della rivelazione (Asbab Al-Nuzul)',
      'Analisi linguistica — radici arabe e vocabolario coranico',
    ],
  ],

  // Book cards: only UI labels are Italian. Titles, authors, descriptions and
  // topics stay the source (see BOOKS in data/islamicStudiesData.js), in the
  // same order as that array.
  bookModules: [
    '🌟 Modulo Aqeedah',
    '🕌 Modulo Fiqh — Fonte primaria',
    '🕌 Modulo Fiqh — Fonte complementare',
    '📖 Modulo Seerah — Fonte primaria',
    '📖 Modulo Seerah — Fonte complementare',
    '📜 Hadith ed etica — Fonte primaria',
    '📜 Hadith ed etica — Fonte complementare',
    '📜 Hadith ed etica — Fonte complementare',
    '✨ Modulo Tafsir — Fonte primaria',
  ],
  bookLinkLabels: [
    'Fornito durante il corso',
    'Fornito durante il corso',
    'Leggi online — Sunnah.com',
    'Fornito durante il corso',
    'Leggi online — Sunnah.com (417 hadith)',
    'Leggi tutti i 42 hadith — Sunnah.com',
    'Leggi online — Sunnah.com (1.900 hadith)',
    'Leggi online — Sunnah.com (1.322 hadith)',
    'Leggi il Corano e il Tafsir online — Quran.com',
  ],
  libraryNote: '📚 Sfoglia questa raccolta completa nella nostra Biblioteca degli Hadith',
};
