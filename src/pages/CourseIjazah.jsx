import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';

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
};

const STAGES = [
  {
    num: '01',
    color: '#0b6e4f',
    title: { en: 'Foundation', ar: 'المرحلة الأولى: التأسيس' },
    duration: { en: '3 – 6 months', ar: '٣ – ٦ أشهر' },
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
    },
  },
  {
    num: '02',
    color: '#1a5fa0',
    title: { en: 'Intermediate — Tajweed', ar: 'المرحلة الثانية: التجويد المتقدم' },
    duration: { en: '6 – 12 months', ar: '٦ – ١٢ شهراً' },
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
    },
  },
  {
    num: '03',
    color: '#7a3a8a',
    title: { en: "Advanced — Qira'at", ar: "المرحلة الثالثة: القراءات" },
    duration: { en: '6 – 12 months', ar: '٦ – ١٢ شهراً' },
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
    },
  },
  {
    num: '04',
    color: '#c8920a',
    title: { en: 'Certification', ar: 'المرحلة الرابعة: الإجازة' },
    duration: { en: '1 – 3 months', ar: '١ – ٣ أشهر' },
    source: 'مصحف المدينة النبوية',
    sourceEn: "Madinah Mus'haf",
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
    },
  },
];

const BOOKS = [
  {
    icon: '📗',
    title: 'Tuhfat Al-Atfal',
    ar: 'تحفة الأطفال',
    author: { en: 'Imam Sulayman Al-Jamzouri', ar: 'الإمام سليمان الجمزوري' },
    stage: { en: 'Foundation Stage', ar: 'مرحلة التأسيس' },
    desc: {
      en: 'A didactic poem of 61 verses covering the foundational rules of Tajweed — Noon Sakinah, Tanwin, Meem Sakinah, and basic Madd rules. Memorised by every student before advancing.',
      ar: 'منظومة من 61 بيتاً تغطي أحكام التجويد الأساسية — النون الساكنة، التنوين، الميم الساكنة، وأحكام المد الأساسية. يحفظها كل طالب قبل الانتقال للمراحل المتقدمة.',
    },
    topics: {
      en: ['Noon Sakinah & Tanwin (4 rules)', 'Meem Sakinah (3 rules)', 'Basic Madd rules', 'Heavy letters (Tafkheem)'],
      ar: ['أحكام النون الساكنة والتنوين (٤ أحكام)', 'أحكام الميم الساكنة (٣ أحكام)', 'أحكام المد الأساسية', 'الحروف المفخمة'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  {
    icon: '📘',
    title: 'Matn Al-Jazariyyah',
    ar: 'متن الجزرية',
    author: { en: 'Imam Ibn Al-Jazari (d. 833 AH)', ar: 'الإمام ابن الجزري (ت ٨٣٣هـ)' },
    stage: { en: 'Intermediate Stage', ar: 'المرحلة المتوسطة' },
    desc: {
      en: 'The definitive classical reference on Tajweed — a poem of 107 verses by the greatest Tajweed scholar in Islamic history. Covers Makhaarij, Sifaat, all Madd types, and Waqf rules in full depth.',
      ar: 'المرجع الكلاسيكي الرئيسي في علم التجويد — قصيدة من ١٠٧ أبيات لأعظم عالم تجويد في التاريخ الإسلامي. تغطي المخارج والصفات وجميع أحكام المد والوقف بعمق كامل.',
    },
    topics: {
      en: ['Makhaarij Al-Huroof (17 points)', 'Sifaat Al-Huroof (18 characteristics)', 'All Madd rules', 'Waqf & Ibtida\''],
      ar: ['مخارج الحروف (١٧ مخرجاً)', 'صفات الحروف (١٨ صفة)', 'جميع أحكام المدود', 'أحكام الوقف والابتداء'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  {
    icon: '📙',
    title: 'Matn Al-Shatibiyyah',
    ar: 'متن الشاطبية',
    author: { en: "Imam Al-Shatibi (d. 590 AH)", ar: 'الإمام الشاطبي (ت ٥٩٠هـ)' },
    stage: { en: "Advanced — Qira'at", ar: 'المرحلة المتقدمة: القراءات' },
    desc: {
      en: "A celebrated poem of 1,173 verses encoding the Seven Mutawatir Qira'at. The standard reference for anyone seeking to master or teach the various Quranic recitation traditions.",
      ar: 'قصيدة مشهورة من ١١٧٣ بيتاً تضمّن القراءات السبع المتواترة. المرجع الأساسي لكل من يسعى لإتقان روايات القراءات القرآنية أو تدريسها.',
    },
    topics: {
      en: ['Seven Mutawatir Qira\'at', "Hafs 'an 'Asim", "Warsh 'an Nafi'", 'All other five Qira\'at'],
      ar: ['القراءات السبع المتواترة', "رواية حفص عن عاصم", "رواية ورش عن نافع", 'القراءات الخمس الأخرى'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  {
    icon: '📕',
    title: "Madinah Mus'haf",
    ar: 'مصحف المدينة النبوية',
    author: { en: 'King Fahd Glorious Quran Printing Complex', ar: 'مجمع الملك فهد لطباعة المصحف الشريف' },
    stage: { en: 'Certification Stage', ar: 'مرحلة الإجازة' },
    desc: {
      en: "The world's most widely distributed Mus'haf — printed by the official Saudi complex in Madinah. Used for the final certification recitation in the Hafs 'an 'Asim riwayah.",
      ar: "أكثر مصحف توزيعاً في العالم — تطبعه مجمع الملك فهد الرسمي في المدينة المنورة. يُستخدم في اختبار الإجازة النهائي برواية حفص عن عاصم.",
    },
    topics: {
      en: ["Hafs 'an 'Asim riwayah", 'Colour-coded Tajweed edition available', 'Used in the final Ijazah exam'],
      ar: ["رواية حفص عن عاصم", 'متوفر بنسخة تجويد ملوّنة', 'يُستخدم في اختبار الإجازة النهائي'],
    },
    link: 'https://quran.gov.sa',
    linkLabel: { en: 'Read Online — Official Site', ar: 'اقرأ أونلاين — الموقع الرسمي' },
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
};

const PERKS = {
  en: ['1-on-1 with certified Ijazah Sheikh', 'Flexible weekly schedule', 'Zoom / Skype / Google Meet', 'Monthly progress reports', 'Official Sanad document issued', 'Cancel anytime'],
  ar: ['فردي مع شيخ مجاز معتمد', 'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت', 'تقارير تقدم شهرية', 'وثيقة السند الرسمية', 'إلغاء في أي وقت'],
};

/* ─── Book card with expand ─── */
function BookCard({ book, lang, ui }) {
  const [open, setOpen] = useState(false);
  const isAr = lang === 'ar';
  const authorLabel = isAr ? book.author.ar : book.author.en;
  const stageLabel  = isAr ? book.stage.ar  : book.stage.en;
  const descText    = isAr ? book.desc.ar   : book.desc.en;
  const topics      = isAr ? book.topics.ar : book.topics.en;
  const linkLabel   = isAr ? book.linkLabel.ar : book.linkLabel.en;

  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          <strong>{book.title}</strong>
          <span className="cl__book-ar" dir="rtl">{book.ar}</span>
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

/* ─── Main page ─── */
export default function CourseIjazah() {
  const navigate = useNavigate();
  const { lang }  = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const isAr      = lang === 'ar';
  const [openStage, setOpenStage] = useState(null);

  useSEO({
    title: isAr ? 'دورة إجازة القرآن الكريم — أكاديمية الرحمة' : 'Quran Ijazah Course — AL-Rahma Academy',
    description: isAr
      ? 'احصل على إجازة قرآنية رسمية بسند متصل إلى النبي ﷺ. ادرس متن الجزرية والشاطبية مع علماء أزهريين معتمدين.'
      : "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars.",
  });

  const learnList = isAr ? LEARN.ar : LEARN.en;
  const prereqs   = isAr ? PREREQS.ar : PREREQS.en;
  const forList   = isAr ? FOR.ar : FOR.en;
  const perks     = isAr ? PERKS.ar : PERKS.en;

  return (
    <>
      <Header />
      <main dir={ui.dir}>
        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#062d1f,#0b6e4f)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🏅 {isAr ? 'شهادة نادرة ورفيعة' : 'Rare Certification'}</span>
            <h1 className="cl__hero-title">{isAr ? 'دورة إجازة القرآن الكريم' : 'Quran Ijazah Course'}</h1>
            <p className="cl__hero-sub">
              {isAr
                ? 'احصل على إجازة رسمية بسند متصل مباشرةً إلى النبي محمد ﷺ — ويصبح لك الحق في تدريس القرآن الكريم.'
                : "Earn a formal Ijazah with a continuous chain of transmission (Sanad) connected directly to the Prophet Muhammad ﷺ — and become authorised to teach the Quran."
              }
            </p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate('/enroll?course=ijazah')}>
                {ui.bookTrial}
              </button>
              <Link to="/teachers" className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#062d1f' }}>
          <div className="container cl__stats-inner">
            <div className="cl__stat"><strong>{isAr ? 'أكثر من سنتين' : '2+ Years'}</strong><span>{isAr ? 'المدة المتوقعة' : 'Average Duration'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'متقدم' : 'Advanced'}</strong><span>{isAr ? 'المستوى المطلوب' : 'Required Level'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'فردي' : '1-on-1'}</strong><span>{isAr ? 'حصص خاصة' : 'Private Lessons'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٤ مراحل' : '4 Stages'}</strong><span>{isAr ? 'منهج منظم' : 'Structured Curriculum'}</span></div>
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
                        <strong>{isAr ? s.title.ar : s.title.en}</strong>
                        <span>{isAr ? s.duration.ar : s.duration.en}</span>
                      </div>
                      <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{s.source}</span>
                      <span className="cl__stage-chevron">{openStage === i ? '▲' : '▼'}</span>
                    </button>
                    {openStage === i && (
                      <div className="cl__stage-body">
                        <p className="cl__stage-author">📚 {isAr ? s.source : `${s.sourceEn} — ${s.author}`}</p>
                        <ul className="cl__stage-points">
                          {(isAr ? s.points.ar : s.points.en).map((pt) => <li key={pt}>{pt}</li>)}
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
                <p className="cl__enroll-title">{isAr ? 'إجازة القرآن الكريم' : 'Quran Ijazah'}</p>
                <p className="cl__enroll-sub">🏅 {ui.officialCert}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate('/enroll?course=ijazah')}>
                  {ui.bookTrial}
                </button>
                <Link to="/teachers" className="cl__enroll-link">{ui.browseTeachers}</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
