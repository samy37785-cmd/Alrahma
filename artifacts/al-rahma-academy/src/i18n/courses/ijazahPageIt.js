// Italian Ijazah Content Batch: page-level Italian text for /it/courses/ijazah
// (SEO title/description, Course JSON-LD text, breadcrumb, hero, stats,
// enroll card) and the page's marketing lists (learn / stage points /
// prerequisites / audience / perks).
//
// English is the canonical source: every string here is a faithful Italian
// translation of the English literal it mirrors, with nothing added,
// strengthened or weakened.
//
// Religious-source policy (owner-approved, same as French): book titles,
// authors, the publisher, Arabic text, the ﷺ mark, URLs and every
// religious/scholarly term stay in their source form — Ijazah, Sanad,
// Tajweed, Qira'at, Waqf, Ibtida', Hafs, Warsh, Makhaarij, Sifaat, Madd,
// Idghaam, Ikhfa', Iqlab, Izhar, Tafkheem, Tarqeeq, Matn, Sheikh… (Italian's
// existing spelling: "Ijazah", "Tajweed", "Sanad"). Book descriptions and
// topic lists are NOT translated: they stay the literal English source in
// the BOOKS data next to this file's consumer, exactly like French.
// The Course JSON-LD keeps `inLanguage` (language of instruction) unchanged.
export const IJAZAH_PAGE_IT = {
  seoTitle: 'Corso Ijazah del Corano',
  seoDescription:
    "Ottieni un'Ijazah coranica ufficiale con un Sanad ininterrotto fino al Profeta ﷺ. Studia Matn Al-Jazariyyah, Al-Shatibiyyah e le sette Qira'at con studiosi certificati di Al-Azhar.",
  schemaName: 'Corso di certificazione Ijazah del Corano',
  schemaLevel: 'Avanzato',
  schemaTeaches: "Ijazah del Corano, Tajweed, Matn Al-Jazariyyah, Al-Shatibiyyah, sette Qira'at",
  breadcrumb: 'Corso Ijazah del Corano',
  badge: 'Certificazione rara',
  h1: 'Corso Ijazah del Corano',
  heroSub:
    "Ottieni un'Ijazah ufficiale con una catena di trasmissione ininterrotta (Sanad) collegata direttamente al Profeta Muhammad ﷺ — e diventa autorizzato a insegnare il Corano.",
  stats: [
    { value: '2+ anni', label: 'Durata media' },
    { value: 'Avanzato', label: 'Livello richiesto' },
    { value: 'Individuale', label: 'Lezioni private' },
    { value: '4 fasi', label: 'Programma strutturato' },
  ],
  enrollTitle: 'Ijazah del Corano',

  learn: [
    'Padronanza completa di tutte le regole del Tajweed — Hafs e Warsh',
    'Matn Al-Jazariyyah — il riferimento principale del Tajweed, di Ibn Al-Jazari',
    'Tuhfat Al-Atfal — le regole fondamentali del Tajweed in forma di versi',
    "Matn Al-Shatibiyyah — le sette Qira'at Mutawatir",
    'Makhaarij Al-Huroof — tutti i 17 punti di articolazione delle lettere',
    'Sifaat Al-Huroof — caratteristiche intrinseche e accidentali',
    "Regole del Waqf e dell'Ibtida' — fermarsi e riprendere correttamente",
    'Esame di recitazione completa del Corano davanti a uno Sheikh certificato',
    "Certificato ufficiale di Ijazah con Sanad fino al Profeta ﷺ",
    'Autorizzazione a insegnare il Corano con il tuo Sanad',
  ],

  stageTitles: ['Fondamenta', 'Intermedio — Tajweed', "Avanzato — Qira'at", 'Certificazione'],
  stageDurations: ['3 – 6 mesi', '6 – 12 mesi', '6 – 12 mesi', '1 – 3 mesi'],
  stagePoints: [
    [
      "Ripasso delle forme delle lettere arabe e della loro pronuncia",
      'Makhaarij Al-Huroof — tutti i 17 punti di articolazione',
      "Sifaat Al-Huroof — le caratteristiche intrinseche di ogni lettera",
      "Noon Sakinah e Tanwin — Idghaam, Ikhfa', Iqlab, Izhar",
      "Meem Sakinah — Idghaam Shafawi, Ikhfa' Shafawi, Izhar Shafawi",
    ],
    [
      "Tutte le regole del Madd — Tabee'i, Muttasil, Munfasil, 'Aarid, Leen",
      'Lam Al-Shamsiyyah e Al-Qamariyyah',
      'Tafkheem e Tarqeeq — le lettere pesanti e leggere nel dettaglio',
      'Regole della lettera Ra — condizioni di pesantezza e leggerezza',
      'Mutaqaribain, Mutajanisain, Mutamatilain',
      "Regole del Waqf e dell'Ibtida' — i 12 segni di Waqf spiegati",
    ],
    [
      "Le sette Qira'at Mutawatir e i loro trasmettitori",
      "Riwayat Hafs 'an 'Asim — la più recitata al mondo",
      "Riwayat Warsh 'an Nafi' — utilizzata in tutto il Nord Africa",
      'Studio comparativo di tutti e sette gli stili di recitazione',
      'Esame di recitazione completa — un Juz per sessione con lo Sheikh',
    ],
    [
      'Recitazione completa del Corano da Al-Fatihah ad An-Nas',
      "Valutazione finale condotta da uno Sheikh di Ijazah certificato",
      'Documentazione del Sanad — catena ininterrotta fino al Profeta ﷺ',
      "Rilascio del certificato ufficiale di Ijazah firmato",
      "Ora sei autorizzato a insegnare e a rilasciare la tua Ijazah",
    ],
  ],

  prereqs: [
    'Lettura fluente del Corano (Noorani Qaida completata)',
    'Conoscenza di base del Tajweed (livello Tuhfat Al-Atfal)',
    "Impegno a seguire almeno 3 lezioni a settimana",
    'Consigliato: programma di Hifz (memorizzazione) completato',
  ],
  audience: [
    "Studenti che hanno completato l'Hifz e desiderano una certificazione ufficiale",
    "Insegnanti di Corano che desiderano un'abilitazione all'insegnamento verificabile",
    'Musulmani di tutto il mondo che desiderano un Sanad fino al Profeta ﷺ',
    'Chi desidera la più alta qualifica coranica',
  ],
  perks: [
    "Lezioni individuali con uno Sheikh di Ijazah certificato",
    'Orario settimanale flessibile',
    'Zoom / Skype / Google Meet',
    'Report mensili sui progressi',
    'Documento ufficiale del Sanad rilasciato',
    'Annulla quando vuoi',
  ],

  // Book cards: only the non-source fields are Italian. Titles, authors
  // and descriptions/topics stay as the source (see BOOKS in CourseIjazah).
  bookStages: ['Fase di fondamenta', 'Fase intermedia', "Avanzato — Qira'at", 'Fase di certificazione'],
  bookLinkProvided: 'Fornito durante il corso',
  bookLinkOnline: 'Leggi online — sito ufficiale',
};
