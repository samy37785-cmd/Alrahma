import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang, withLanguage } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';
import { site } from '../data/site';
import { IJAZAH_PAGE_FR as FR } from '../i18n/courses/religiousPagesFr';

/* ─── Static data (bilingual) ─── */
const LEARN = {
  en: [
    'Complete mastery of all Tajweed rules — Hafs & Warsh',
    'Matn Al-Jazariyyah — the master Tajweed reference by Ibn Al-Jazari',
    'Tuhfat Al-Atfal — foundational Tajweed rules in verse form',
    'Matn Al-Shatibiyyah — the Seven Mutawatir Qira\'at',
    'Makhaarij Al-Huroof — all 17 letter articulation points',
    'Sifaat Al-Huroof — inherent & incidental characteristics',
    'Rules of Waqf & Ibtida\' — stopping and restarting correctly',
    'Complete Quran recitation test before a certified Sheikh',
    'Official Ijazah certificate with Sanad to the Prophet ﷺ',
    'Authorisation to teach the Quran with your own Sanad',
  ],
  ar: [
    'إتقان كامل لجميع أحكام التجويد — رواية حفص وورش',
    'متن الجزرية للإمام ابن الجزري — المرجع الأساسي للتجويد المتقدم',
    'تحفة الأطفال للإمام الجمزوري — أحكام التجويد للمبتدئين',
    'متن الشاطبية — منهج القراءات السبع المتواترة',
    'مخارج الحروف — جميع المخارج الـ 17 تفصيلاً',
    'صفات الحروف — الصفات الذاتية والعارضة',
    'أحكام الوقف والابتداء — القواعد الكاملة',
    'اختبار ختم القرآن كاملاً أمام شيخ معتمد',
    'شهادة الإجازة الرسمية بسند متصل إلى النبي ﷺ',
    'الإذن الرسمي بتدريس القرآن الكريم وإصدار إجازات',
  ],
  fr: [
    'Maîtrise complète de toutes les règles du tajwid — Hafs et Warsh',
    'Matn Al-Jazariyyah — la référence maîtresse du tajwid, par Ibn Al-Jazari',
    'Tuhfat Al-Atfal — les règles fondamentales du tajwid sous forme de poème',
    "Matn Al-Shatibiyyah — les sept lectures (qira'at) mutawatir",
    "Points d'articulation des lettres (makharij al-huruf) — les 17 points",
    'Caractéristiques des lettres (sifat al-huruf) — intrinsèques et accidentelles',
    "Règles de la pause et de la reprise (waqf et ibtida') — s'arrêter et reprendre correctement",
    'Examen de récitation complète du Coran devant un cheikh certifié',
    "Certificat d'ijaza officiel avec un sanad remontant au Prophète ﷺ",
    "Autorisation d'enseigner le Coran avec votre propre sanad",
  ],
};

const STAGES = [
  {
    num: '01',
    color: '#0b6e4f',
    title: { en: 'Foundation', ar: 'المرحلة الأولى: التأسيس', fr: 'Fondation' },
    duration: { en: '3 – 6 months', ar: '٣ – ٦ أشهر', fr: '3 – 6 mois' },
    source: 'تحفة الأطفال',
    sourceEn: 'Tuhfat Al-Atfal',
    author: 'الإمام سليمان الجمزوري',
    points: {
      en: [
        'Revision of Arabic letter forms & pronunciation',
        'Makhaarij Al-Huroof — all 17 articulation points',
        'Sifaat Al-Huroof — inherent characteristics of each letter',
        'Noon Sakinah & Tanwin — Idghaam, Ikhfa\', Iqlab, Izhar',
        'Meem Sakinah — Idghaam Shafawi, Ikhfa\' Shafawi, Izhar Shafawi',
      ],
      ar: [
        'مراجعة أشكال الحروف العربية ونطقها الصحيح',
        'مخارج الحروف — جميع المخارج الـ 17 تفصيلاً',
        'صفات الحروف — الصفات الذاتية لكل حرف',
        'أحكام النون الساكنة والتنوين — إدغام، إخفاء، إقلاب، إظهار',
        'أحكام الميم الساكنة — إدغام شفوي، إخفاء شفوي، إظهار شفوي',
      ],
      fr: [
        'Révision des formes des lettres arabes et de leur prononciation',
        "Points d'articulation des lettres (makharij al-huruf) — les 17 points",
        'Caractéristiques des lettres (sifat al-huruf) — les caractéristiques intrinsèques de chaque lettre',
        "Nun sakina et tanwin — idgham, ikhfa', iqlab, izhar",
        "Mim sakina — idgham shafawi, ikhfa' shafawi, izhar shafawi",
      ],
    },
  },
  {
    num: '02',
    color: '#1a5fa0',
    title: { en: 'Intermediate — Tajweed', ar: 'المرحلة الثانية: التجويد المتقدم', fr: 'Intermédiaire — tajwid' },
    duration: { en: '6 – 12 months', ar: '٦ – ١٢ شهراً', fr: '6 – 12 mois' },
    source: 'متن الجزرية',
    sourceEn: 'Matn Al-Jazariyyah',
    author: 'الإمام ابن الجزري',
    points: {
      en: [
        'All Madd rules — Tabee\'i, Muttasil, Munfasil, \'Aarid, Leen',
        'Lam Al-Shamsiyyah & Al-Qamariyyah',
        'Tafkheem & Tarqeeq — heavy and light letters in detail',
        'Ra letter rules — conditions of heaviness and lightness',
        'Mutaqaribain, Mutajanisain, Mutamatilain',
        'Rules of Waqf & Ibtida\' — 12 waqf signs explained',
      ],
      ar: [
        'أحكام المدود جميعها — طبيعي، متصل، منفصل، عارض، لين',
        'اللام الشمسية واللام القمرية',
        'التفخيم والترقيق — الحروف المفخمة والمرققة تفصيلاً',
        'أحكام الراء — شروط التفخيم والترقيق',
        'المتقاربان والمتجانسان والمتماثلان',
        'أحكام الوقف والابتداء — علامات الوقف الـ 12',
      ],
      fr: [
        "Toutes les règles du madd (prolongation) — tabi'i, muttasil, munfasil, 'arid, lin",
        'Lam solaire (shamsiyya) et lam lunaire (qamariyya)',
        'Tafkhim et tarqiq — les lettres emphatiques et légères en détail',
        'Règles de la lettre ra — conditions de son emphase et de sa légèreté',
        'Mutaqaribayn, mutajanisayn, mutamathilayn',
        "Règles de la pause et de la reprise (waqf et ibtida') — les 12 signes de pause expliqués",
      ],
    },
  },
  {
    num: '03',
    color: '#7a3a8a',
    title: { en: "Advanced — Qira'at", ar: "المرحلة الثالثة: القراءات", fr: "Avancé — qira'at" },
    duration: { en: '6 – 12 months', ar: '٦ – ١٢ شهراً', fr: '6 – 12 mois' },
    source: 'متن الشاطبية',
    sourceEn: 'Matn Al-Shatibiyyah',
    author: 'الإمام الشاطبي',
    points: {
      en: [
        'The Seven Mutawatir Qira\'at and their transmitters',
        "Riwayat Hafs 'an 'Asim — the most widely recited worldwide",
        "Riwayat Warsh 'an Nafi' — used across North Africa",
        'Comparative study of all seven recitation styles',
        'Full recitation test — one Juz per session with the Sheikh',
      ],
      ar: [
        'القراءات السبع المتواترة ورواتها',
        "رواية حفص عن عاصم — الأكثر انتشاراً في العالم",
        "رواية ورش عن نافع — المنتشرة في شمال أفريقيا",
        'دراسة مقارنة لجميع أساليب القراءات السبع',
        'اختبار تلاوة كامل — جزء في كل جلسة مع الشيخ',
      ],
      fr: [
        "Les sept lectures (qira'at) mutawatir et leurs transmetteurs",
        "Riwaya de Hafs 'an 'Asim — la plus récitée au monde",
        "Riwaya de Warsh 'an Nafi' — utilisée dans toute l'Afrique du Nord",
        'Étude comparative des sept modes de récitation',
        "Examen de récitation complet — un juz' par séance avec le cheikh",
      ],
    },
  },
  {
    num: '04',
    color: '#c8920a',
    title: { en: 'Certification', ar: 'المرحلة الرابعة: الإجازة', fr: 'Certification' },
    duration: { en: '1 – 3 months', ar: '١ – ٣ أشهر', fr: '1 – 3 mois' },
    source: 'مصحف المدينة النبوية',
    sourceEn: "Madinah Mus'haf",
    sourceFr: 'Mushaf de Médine',
    author: 'مجمع الملك فهد لطباعة المصحف الشريف',
    points: {
      en: [
        'Complete Quran recitation from Al-Fatihah to An-Nas',
        'Final evaluation conducted by a certified Ijazah Sheikh',
        'Sanad documentation — unbroken chain to the Prophet ﷺ',
        'Issuance of the official signed Ijazah certificate',
        'You are now authorised to teach and issue your own Ijazah',
      ],
      ar: [
        'ختم القرآن كاملاً من الفاتحة إلى الناس',
        'اختبار نهائي أمام شيخ مجاز معتمد',
        'توثيق السند — سلسلة متصلة بالنبي ﷺ',
        'إصدار شهادة الإجازة الرسمية الموقعة',
        'أنت الآن مجاز بتدريس القرآن وإصدار إجازاتك الخاصة',
      ],
      fr: [
        "Récitation complète du Coran, d'Al-Fatiha à An-Nas",
        "Évaluation finale menée par un cheikh d'ijaza certifié",
        "Documentation du sanad — chaîne ininterrompue jusqu'au Prophète ﷺ",
        "Délivrance du certificat d'ijaza officiel signé",
        'Vous êtes désormais autorisé à enseigner et à délivrer votre propre ijaza',
      ],
    },
  },
];

// French Religious-Content Safety Correction: book titles, descriptions
// and topic lists stay in their source language on the French page --
// `title`/`ar` are shown as-is (no `titleFr` is read anywhere; the field
// was removed from the one entry that had one), and `desc.fr`/`topics.fr`
// are literal copies of `desc.en`/`topics.en`, not French translations.
// `author`, `stage`, `link` and `linkLabel` are unaffected -- they are
// not book title/description/topic content and were already faithful,
// non-religious-text translations. Exported so tests can assert this
// directly against the real data instead of duplicating it.
export const BOOKS = [
  {
    icon: '📗',
    title: 'Tuhfat Al-Atfal',
    ar: 'تحفة الأطفال',
    author: { en: 'Imam Sulayman Al-Jamzouri', ar: 'الإمام سليمان الجمزوري', fr: 'Imam Sulayman Al-Jamzouri' },
    stage: { en: 'Foundation Stage', ar: 'مرحلة التأسيس', fr: 'Étape de fondation' },
    desc: {
      en: 'A didactic poem of 61 verses covering the foundational rules of Tajweed — Noon Sakinah, Tanwin, Meem Sakinah, and basic Madd rules. Memorised by every student before advancing.',
      ar: 'منظومة من 61 بيتاً تغطي أحكام التجويد الأساسية — النون الساكنة، التنوين، الميم الساكنة، وأحكام المد الأساسية. يحفظها كل طالب قبل الانتقال للمراحل المتقدمة.',
      fr: 'A didactic poem of 61 verses covering the foundational rules of Tajweed — Noon Sakinah, Tanwin, Meem Sakinah, and basic Madd rules. Memorised by every student before advancing.',
    },
    topics: {
      en: ['Noon Sakinah & Tanwin (4 rules)', 'Meem Sakinah (3 rules)', 'Basic Madd rules', 'Heavy letters (Tafkheem)'],
      ar: ['أحكام النون الساكنة والتنوين (٤ أحكام)', 'أحكام الميم الساكنة (٣ أحكام)', 'أحكام المد الأساسية', 'الحروف المفخمة'],
      fr: ['Noon Sakinah & Tanwin (4 rules)', 'Meem Sakinah (3 rules)', 'Basic Madd rules', 'Heavy letters (Tafkheem)'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة', fr: 'Fourni pendant le cours' },
  },
  {
    icon: '📘',
    title: 'Matn Al-Jazariyyah',
    ar: 'متن الجزرية',
    author: { en: 'Imam Ibn Al-Jazari (d. 833 AH)', ar: 'الإمام ابن الجزري (ت ٨٣٣هـ)', fr: 'Imam Ibn Al-Jazari (m. 833 H)' },
    stage: { en: 'Intermediate Stage', ar: 'المرحلة المتوسطة', fr: 'Étape intermédiaire' },
    desc: {
      en: 'The definitive classical reference on Tajweed — a poem of 107 verses by the greatest Tajweed scholar in Islamic history. Covers Makhaarij, Sifaat, all Madd types, and Waqf rules in full depth.',
      ar: 'المرجع الكلاسيكي الرئيسي في علم التجويد — قصيدة من ١٠٧ أبيات لأعظم عالم تجويد في التاريخ الإسلامي. تغطي المخارج والصفات وجميع أحكام المد والوقف بعمق كامل.',
      fr: 'The definitive classical reference on Tajweed — a poem of 107 verses by the greatest Tajweed scholar in Islamic history. Covers Makhaarij, Sifaat, all Madd types, and Waqf rules in full depth.',
    },
    topics: {
      en: ['Makhaarij Al-Huroof (17 points)', 'Sifaat Al-Huroof (18 characteristics)', 'All Madd rules', 'Waqf & Ibtida\''],
      ar: ['مخارج الحروف (١٧ مخرجاً)', 'صفات الحروف (١٨ صفة)', 'جميع أحكام المدود', 'أحكام الوقف والابتداء'],
      fr: ['Makhaarij Al-Huroof (17 points)', 'Sifaat Al-Huroof (18 characteristics)', 'All Madd rules', 'Waqf & Ibtida\''],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة', fr: 'Fourni pendant le cours' },
  },
  {
    icon: '📙',
    title: 'Matn Al-Shatibiyyah',
    ar: 'متن الشاطبية',
    author: { en: "Imam Al-Shatibi (d. 590 AH)", ar: 'الإمام الشاطبي (ت ٥٩٠هـ)', fr: 'Imam Al-Shatibi (m. 590 H)' },
    stage: { en: "Advanced — Qira'at", ar: 'المرحلة المتقدمة: القراءات', fr: "Avancé — qira'at" },
    desc: {
      en: "A celebrated poem of 1,173 verses encoding the Seven Mutawatir Qira'at. The standard reference for anyone seeking to master or teach the various Quranic recitation traditions.",
      ar: 'قصيدة مشهورة من ١١٧٣ بيتاً تضمّن القراءات السبع المتواترة. المرجع الأساسي لكل من يسعى لإتقان روايات القراءات القرآنية أو تدريسها.',
      fr: "A celebrated poem of 1,173 verses encoding the Seven Mutawatir Qira'at. The standard reference for anyone seeking to master or teach the various Quranic recitation traditions.",
    },
    topics: {
      en: ['Seven Mutawatir Qira\'at', "Hafs 'an 'Asim", "Warsh 'an Nafi'", 'All other five Qira\'at'],
      ar: ['القراءات السبع المتواترة', "رواية حفص عن عاصم", "رواية ورش عن نافع", 'القراءات الخمس الأخرى'],
      fr: ['Seven Mutawatir Qira\'at', "Hafs 'an 'Asim", "Warsh 'an Nafi'", 'All other five Qira\'at'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة', fr: 'Fourni pendant le cours' },
  },
  {
    icon: '📕',
    title: "Madinah Mus'haf",
    ar: 'مصحف المدينة النبوية',
    author: { en: 'King Fahd Glorious Quran Printing Complex', ar: 'مجمع الملك فهد لطباعة المصحف الشريف', fr: "Complexe du roi Fahd pour l'impression du Noble Coran" },
    stage: { en: 'Certification Stage', ar: 'مرحلة الإجازة', fr: 'Étape de certification' },
    desc: {
      en: "The world's most widely distributed Mus'haf — printed by the official Saudi complex in Madinah. Used for the final certification recitation in the Hafs 'an 'Asim riwayah.",
      ar: "أكثر مصحف توزيعاً في العالم — تطبعه مجمع الملك فهد الرسمي في المدينة المنورة. يُستخدم في اختبار الإجازة النهائي برواية حفص عن عاصم.",
      fr: "The world's most widely distributed Mus'haf — printed by the official Saudi complex in Madinah. Used for the final certification recitation in the Hafs 'an 'Asim riwayah.",
    },
    topics: {
      en: ["Hafs 'an 'Asim riwayah", 'Colour-coded Tajweed edition available', 'Used in the final Ijazah exam'],
      ar: ["رواية حفص عن عاصم", 'متوفر بنسخة تجويد ملوّنة', 'يُستخدم في اختبار الإجازة النهائي'],
      fr: ["Hafs 'an 'Asim riwayah", 'Colour-coded Tajweed edition available', 'Used in the final Ijazah exam'],
    },
    link: 'https://quran.gov.sa',
    linkLabel: { en: 'Read Online — Official Site', ar: 'اقرأ أونلاين — الموقع الرسمي', fr: 'Lire en ligne — site officiel' },
  },
];

const PREREQS = {
  en: [
    { icon: '📖', text: 'Fluent Quran reading (Noorani Qaida completed)' },
    { icon: '🎙️', text: 'Basic Tajweed knowledge (Tuhfat Al-Atfal level)' },
    { icon: '⏱️', text: 'Commitment to at least 3 lessons per week' },
    { icon: '🧠', text: 'Recommended: Hifz (memorization) program completed' },
  ],
  ar: [
    { icon: '📖', text: 'قراءة القرآن بطلاقة (إتمام القاعدة النورانية)' },
    { icon: '🎙️', text: 'معرفة أساسية بأحكام التجويد (مستوى تحفة الأطفال)' },
    { icon: '⏱️', text: 'الالتزام بثلاث حصص على الأقل أسبوعياً' },
    { icon: '🧠', text: 'يُنصح: إتمام برنامج حفظ القرآن الكريم' },
  ],
  fr: [
    { icon: '📖', text: 'Lecture fluide du Coran (Qaida Nourania terminée)' },
    { icon: '🎙️', text: 'Connaissances de base en tajwid (niveau Tuhfat Al-Atfal)' },
    { icon: '⏱️', text: 'Engagement à suivre au moins 3 cours par semaine' },
    { icon: '🧠', text: 'Recommandé : programme de hifz (mémorisation) terminé' },
  ],
};

const FOR = {
  en: [
    { icon: '🎓', label: 'Students who completed Hifz and want official certification' },
    { icon: '👨‍🏫', label: 'Quran teachers who want a verifiable teaching licence' },
    { icon: '🌍', label: 'Muslims worldwide who want a Sanad to the Prophet ﷺ' },
    { icon: '🏅', label: 'Those who want the highest Quranic credential' },
  ],
  ar: [
    { icon: '🎓', label: 'طلاب أتموا حفظ القرآن ويريدون شهادة رسمية' },
    { icon: '👨‍🏫', label: 'معلمو القرآن الذين يريدون ترخيصاً معتمداً للتدريس' },
    { icon: '🌍', label: 'المسلمون في كل مكان الذين يريدون سنداً إلى النبي ﷺ' },
    { icon: '🏅', label: 'كل من يسعى لنيل أرفع الشهادات القرآنية' },
  ],
  fr: [
    { icon: '🎓', label: 'Étudiants ayant terminé le hifz et souhaitant une certification officielle' },
    { icon: '👨‍🏫', label: "Enseignants du Coran souhaitant une licence d'enseignement vérifiable" },
    { icon: '🌍', label: 'Musulmans du monde entier souhaitant un sanad remontant au Prophète ﷺ' },
    { icon: '🏅', label: 'Ceux qui recherchent la plus haute qualification coranique' },
  ],
};

const PERKS = {
  en: ['1-on-1 with certified Ijazah Sheikh', 'Flexible weekly schedule', 'Zoom / Skype / Google Meet', 'Monthly progress reports', 'Official Sanad document issued', 'Cancel anytime'],
  ar: ['فردي مع شيخ مجاز معتمد', 'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت', 'تقارير تقدم شهرية', 'وثيقة السند الرسمية', 'إلغاء في أي وقت'],
  fr: ["Cours particuliers avec un cheikh d'ijaza certifié", 'Emploi du temps hebdomadaire flexible', 'Zoom / Skype / Google Meet', 'Rapports de progression mensuels', 'Document officiel du sanad délivré', 'Annulation à tout moment'],
};

/* ─── Book card with expand ─── */
function BookCard({ book, lang }) {
  const [open, setOpen] = useState(false);
  const isAr = lang === 'ar';
  const isFr = lang === 'fr';
  const authorLabel = isAr ? book.author.ar : isFr ? book.author.fr : book.author.en;
  const stageLabel  = isAr ? book.stage.ar  : isFr ? book.stage.fr  : book.stage.en;
  const descText    = isAr ? book.desc.ar   : isFr ? book.desc.fr   : book.desc.en;
  const topics      = isAr ? book.topics.ar : isFr ? book.topics.fr : book.topics.en;
  const linkLabel   = isAr ? book.linkLabel.ar : isFr ? book.linkLabel.fr : book.linkLabel.en;

  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          {/* Language Closure Phase 5 (policy approved by محمود): book.ar is the
              approved primary Arabic title on the Arabic page -- book.title
              (English) was previously shown as primary regardless of lang.
              The secondary Arabic line is now redundant with the primary on
              the Arabic page (would duplicate the same text), so it only
              renders when the primary title is English; no new subtitle
              text or Latin name is invented for either language. */}
          <strong>{isAr ? book.ar : (isFr && book.titleFr) || book.title}</strong>
          {!isAr && <span className="cl__book-ar" dir="rtl">{book.ar}</span>}
          <span className="cl__book-author">{authorLabel}</span>
          <span className="cl__book-note">{stageLabel}</span>
        </div>
        <span className="cl__book-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="cl__book-body">
          <p className="cl__book-desc">{descText}</p>
          <ul className="cl__book-topics">
            {topics.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {book.link
            ? <a href={book.link} target="_blank" rel="noreferrer" className="cl__book-link">{linkLabel} ↗</a>
            : <span className="cl__book-link cl__book-link--muted">📚 {linkLabel}</span>
          }
        </div>
      )}
    </div>
  );
}

// French Localization Batch 1B: the Course JSON-LD text fields in French;
// every other field, inLanguage included, is left as it is.
function localizeSchema(isFr, schema) {
  if (!isFr) return schema;
  return {
    ...schema,
    name: FR.schemaName,
    description: FR.seoDescription,
    educationalLevel: FR.schemaLevel,
    teaches: FR.schemaTeaches,
  };
}

/* ─── Main page ─── */
export default function CourseIjazah() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const isAr      = lang === 'ar';
  const isFr      = lang === 'fr';
  const [openStage, setOpenStage] = useState(null);

  useSEO({
    title: isAr ? 'دورة إجازة القرآن الكريم' : isFr ? FR.seoTitle : 'Quran Ijazah Course',
    description: isAr
      ? 'احصل على إجازة قرآنية رسمية بسند متصل إلى النبي ﷺ. ادرس متن الجزرية والشاطبية مع علماء أزهريين معتمدين.'
      : isFr ? FR.seoDescription
      : "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars.",
    // French: the same Course object with its text fields in French;
    // inLanguage (language of instruction) is unchanged.
    schema: localizeSchema(isFr, {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Quran Ijazah Certification Course',
      description: "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars.",
      provider: { '@type': 'EducationalOrganization', name: 'Al-Rahma Academy', sameAs: site.origin },
      educationalLevel: 'Advanced',
      inLanguage: ['en', 'ar'],
      teaches: 'Quran Ijazah, Tajweed, Matn Al-Jazariyyah, Al-Shatibiyyah, Seven Qira\'at',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    }),
  });

  const learnList = isAr ? LEARN.ar : isFr ? LEARN.fr : LEARN.en;
  const prereqs   = isAr ? PREREQS.ar : isFr ? PREREQS.fr : PREREQS.en;
  const forList   = isAr ? FOR.ar : isFr ? FOR.fr : FOR.en;
  const perks     = isAr ? PERKS.ar : isFr ? PERKS.fr : PERKS.en;

  return (
    <>
      <Header />
      <main id="main-content" dir={ui.dir}>
        <Breadcrumbs items={[{ label: t.nav.courses, to: '/courses' }, { label: isAr ? 'دورة الإجازة' : isFr ? FR.breadcrumb : 'Quran Ijazah Course' }]} />
        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#062d1f,#0b6e4f)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🏅 {isAr ? 'شهادة نادرة ورفيعة' : isFr ? FR.badge : 'Rare Certification'}</span>
            <h1 className="cl__hero-title">{isAr ? 'دورة إجازة القرآن الكريم' : isFr ? FR.h1 : 'Quran Ijazah Course'}</h1>
            <p className="cl__hero-sub">
              {isAr
                ? 'احصل على إجازة رسمية بسند متصل مباشرةً إلى النبي محمد ﷺ — ويصبح لك الحق في تدريس القرآن الكريم.'
                : isFr ? FR.heroSub
                : "Earn a formal Ijazah with a continuous chain of transmission (Sanad) connected directly to the Prophet Muhammad ﷺ — and become authorised to teach the Quran."
              }
            </p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate(withLanguage('/enroll?course=ijazah', lang))}>
                {ui.bookTrial}
              </button>
              <Link to={withLanguage('/academy/teachers', lang)} className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#062d1f' }}>
          <div className="container cl__stats-inner">
            <div className="cl__stat"><strong>{isAr ? 'أكثر من سنتين' : isFr ? FR.stats[0].value : '2+ Years'}</strong><span>{isAr ? 'المدة المتوقعة' : isFr ? FR.stats[0].label : 'Average Duration'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'متقدم' : isFr ? FR.stats[1].value : 'Advanced'}</strong><span>{isAr ? 'المستوى المطلوب' : isFr ? FR.stats[1].label : 'Required Level'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'فردي' : isFr ? FR.stats[2].value : '1-on-1'}</strong><span>{isAr ? 'حصص خاصة' : isFr ? FR.stats[2].label : 'Private Lessons'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٤ مراحل' : isFr ? FR.stats[3].value : '4 Stages'}</strong><span>{isAr ? 'منهج منظم' : isFr ? FR.stats[3].label : 'Structured Curriculum'}</span></div>
            <div className="cl__stat"><strong>🏅</strong><span>{ui.officialCert}</span></div>
          </div>
        </div>

        {/* Body */}
        <div className="container cl__body">
          <div className="cl__left">

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whatYoullLearn}</h2>
              <ul className="cl__learn-list">
                {learnList.map((pt) => (
                  <li key={pt} className="cl__learn-item">
                    <span className="cl__check">✓</span><span>{pt}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.curriculum}</h2>
              <div className="cl__stages">
                {STAGES.map((s, i) => (
                  <div
                    key={s.num}
                    className={`cl__stage${openStage === i ? ' open' : ''}`}
                    style={{ '--stage-color': s.color }}
                  >
                    <button className="cl__stage-header" onClick={() => setOpenStage(openStage === i ? null : i)}>
                      <span className="cl__stage-num" style={{ background: s.color }}>{s.num}</span>
                      <div className="cl__stage-meta">
                        <strong>{isAr ? s.title.ar : isFr ? s.title.fr : s.title.en}</strong>
                        <span>{isAr ? s.duration.ar : isFr ? s.duration.fr : s.duration.en}</span>
                      </div>
                      <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{s.source}</span>
                      <span className="cl__stage-chevron">{openStage === i ? '▲' : '▼'}</span>
                    </button>
                    {openStage === i && (
                      <div className="cl__stage-body">
                        <p className="cl__stage-author">📚 {isAr ? s.source : `${(isFr && s.sourceFr) || s.sourceEn} — ${s.author}`}</p>
                        <ul className="cl__stage-points">
                          {(isAr ? s.points.ar : isFr ? s.points.fr : s.points.en).map((pt) => <li key={pt}>{pt}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.sources}</h2>
              <div className="cl__books">
                {BOOKS.map((b) => <BookCard key={b.title} book={b} lang={lang} ui={ui} />)}
              </div>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.prerequisites}</h2>
              <div className="cl__prereqs">
                {prereqs.map((p) => (
                  <div key={p.text} className="cl__prereq">
                    <span className="cl__prereq-icon">{p.icon}</span>
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.whoFor}</h2>
              <div className="cl__for-grid">
                {forList.map((item) => (
                  <div key={item.label} className="cl__for-item">
                    <span>{item.icon}</span><span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>

          </div>

          {/* Sticky enroll card */}
          <div className="cl__right">
            <div className="cl__enroll-card">
              <div className="cl__enroll-card-top" style={{ background: 'linear-gradient(145deg,#062d1f,#0b6e4f)' }}>
                <span className="cl__enroll-icon">📜</span>
                <p className="cl__enroll-title">{isAr ? 'إجازة القرآن الكريم' : isFr ? FR.enrollTitle : 'Quran Ijazah'}</p>
                <p className="cl__enroll-sub">🏅 {ui.officialCert}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate(withLanguage('/enroll?course=ijazah', lang))}>
                  {ui.bookTrial}
                </button>
                <Link to={withLanguage('/academy/teachers', lang)} className="cl__enroll-link">{ui.browseTeachers}</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
