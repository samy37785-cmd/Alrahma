// French Localization Batch 1B: page-level French text for /courses/ijazah
// and /courses/islamic-studies (SEO title/description, Course JSON-LD text,
// breadcrumb, hero, stats, enroll card). The pages' data lists carry their
// own `fr` entries next to `en`/`ar`.
//
// English is the canonical source: every string here is a faithful French
// translation of the English literal it replaces, with nothing added,
// strengthened or weakened. Glossary: "tajwid", "ijaza". The Course JSON-LD
// keeps `inLanguage` (the language of instruction) unchanged.
export const IJAZAH_PAGE_FR = {
  seoTitle: "Cours d'ijaza du Coran",
  seoDescription:
    "Obtenez une ijaza du Coran officielle avec un sanad continu jusqu'au Prophète ﷺ. Étudiez Matn Al-Jazariyyah, Al-Shatibiyyah et les sept qira'at auprès de savants certifiés d'Al-Azhar.",
  schemaName: "Cours de certification d'ijaza du Coran",
  schemaLevel: 'Avancé',
  schemaTeaches: "Ijaza du Coran, tajwid, Matn Al-Jazariyyah, Al-Shatibiyyah, sept qira'at",
  breadcrumb: "Cours d'ijaza du Coran",
  badge: 'Certification rare',
  h1: "Cours d'ijaza du Coran",
  heroSub:
    'Obtenez une ijaza officielle avec une chaîne de transmission continue (sanad) reliée directement au Prophète Muhammad ﷺ — et soyez autorisé à enseigner le Coran.',
  stats: [
    { value: '2+ ans', label: 'Durée moyenne' },
    { value: 'Avancé', label: 'Niveau requis' },
    { value: 'Individuel', label: 'Cours particuliers' },
    { value: '4 étapes', label: 'Programme structuré' },
  ],
  enrollTitle: 'Ijaza du Coran',
};

export const ISLAMIC_STUDIES_PAGE_FR = {
  seoTitle: "Cours d'études islamiques",
  seoDescription:
    "Un programme complet, fondé sur les sources, couvrant l'aqida, le fiqh, la sira, le hadith et le tafsir — 5 modules structurés enseignés par des savants certifiés dans votre propre langue.",
  schemaName: "Cours d'études islamiques",
  schemaLevel: 'Tous niveaux',
  schemaTeaches: 'Aqida, fiqh, sira, hadith, tafsir, études islamiques',
  breadcrumb: "Cours d'études islamiques",
  badge: '5 modules complets',
  h1: 'Études islamiques',
  heroSub:
    "Un programme complet, fondé sur les sources, couvrant l'aqida, le fiqh, la sira, le hadith et le tafsir — enseigné par des savants certifiés dans votre propre langue.",
  stats: [
    { value: '5', label: 'Modules thématiques' },
    { value: 'Tous niveaux', label: 'Débutant → avancé' },
    { value: 'Individuel', label: 'Cours particuliers' },
    { value: '40 semaines', label: 'Programme complet' },
    { value: '6 langues', label: "Langues d'enseignement" },
  ],
  hadithLink: 'Lire le hadith complet — Sunnah.com ↗',
  enrollTitle: 'Études islamiques',
  enrollSub: '5 modules · Tous niveaux',
};
