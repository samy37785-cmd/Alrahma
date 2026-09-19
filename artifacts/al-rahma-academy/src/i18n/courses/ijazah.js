// Per-language body content for the Ijazah course page (Phase 2b
// migration, 2026-09-18). Migrated LITERALLY from the pre-migration
// CourseIjazah.jsx (LEARN/STAGES/BOOKS/PREREQS/FOR/PERKS consts + inline
// isAr-forked JSX strings) -- no content added, changed, or reworded.
// Structural (language-agnostic) fields -- stage id/num/color, book
// id/icon/title/ar/link -- live in src/data/courses/ijazah.js instead.
//
// Only en/ar are populated. it/es/de/fr stay absent -- TranslationGate
// (see src/data/translationStatus.js) is what stops those languages from
// silently falling back to English; this file does not invent placeholder
// translations to paper over that gap.

export const IJAZAH_TEXT = {
  en: {
    seo: {
      title: 'Quran Ijazah Course',
      description: "Earn a formal Quran Ijazah with a continuous Sanad to the Prophet ﷺ. Study Matn Al-Jazariyyah, Al-Shatibiyyah and the Seven Qira'at with certified Al-Azhar scholars.",
    },
    breadcrumbLabel: 'Quran Ijazah Course',
    hero: {
      badge: 'Rare Certification',
      title: 'Quran Ijazah Course',
      sub: 'Earn a formal Ijazah with a continuous chain of transmission (Sanad) connected directly to the Prophet Muhammad ﷺ — and become authorised to teach the Quran.',
    },
    stats: [
      { value: '2+ Years', label: 'Average Duration' },
      { value: 'Advanced', label: 'Required Level' },
      { value: '1-on-1', label: 'Private Lessons' },
      { value: '4 Stages', label: 'Structured Curriculum' },
    ],
    learn: [
      'Complete mastery of all Tajweed rules — Hafs & Warsh',
      'Matn Al-Jazariyyah — the master Tajweed reference by Ibn Al-Jazari',
      'Tuhfat Al-Atfal — foundational Tajweed rules in verse form',
      "Matn Al-Shatibiyyah — the Seven Mutawatir Qira'at",
      'Makhaarij Al-Huroof — all 17 letter articulation points',
      'Sifaat Al-Huroof — inherent & incidental characteristics',
      "Rules of Waqf & Ibtida' — stopping and restarting correctly",
      'Complete Quran recitation test before a certified Sheikh',
      'Official Ijazah certificate with Sanad to the Prophet ﷺ',
      'Authorisation to teach the Quran with your own Sanad',
    ],
    stages: {
      foundation: {
        title: 'Foundation',
        duration: '3 – 6 months',
        sourceLine: 'Tuhfat Al-Atfal — الإمام سليمان الجمزوري',
        points: [
          'Revision of Arabic letter forms & pronunciation',
          'Makhaarij Al-Huroof — all 17 articulation points',
          'Sifaat Al-Huroof — inherent characteristics of each letter',
          "Noon Sakinah & Tanwin — Idghaam, Ikhfa', Iqlab, Izhar",
          "Meem Sakinah — Idghaam Shafawi, Ikhfa' Shafawi, Izhar Shafawi",
        ],
      },
      intermediate: {
        title: 'Intermediate — Tajweed',
        duration: '6 – 12 months',
        sourceLine: 'Matn Al-Jazariyyah — الإمام ابن الجزري',
        points: [
          "All Madd rules — Tabee'i, Muttasil, Munfasil, 'Aarid, Leen",
          'Lam Al-Shamsiyyah & Al-Qamariyyah',
          'Tafkheem & Tarqeeq — heavy and light letters in detail',
          'Ra letter rules — conditions of heaviness and lightness',
          'Mutaqaribain, Mutajanisain, Mutamatilain',
          "Rules of Waqf & Ibtida' — 12 waqf signs explained",
        ],
      },
      qiraat: {
        title: "Advanced — Qira'at",
        duration: '6 – 12 months',
        sourceLine: 'Matn Al-Shatibiyyah — الإمام الشاطبي',
        points: [
          "The Seven Mutawatir Qira'at and their transmitters",
          "Riwayat Hafs 'an 'Asim — the most widely recited worldwide",
          "Riwayat Warsh 'an Nafi' — used across North Africa",
          'Comparative study of all seven recitation styles',
          'Full recitation test — one Juz per session with the Sheikh',
        ],
      },
      certification: {
        title: 'Certification',
        duration: '1 – 3 months',
        sourceLine: "Madinah Mus'haf — مجمع الملك فهد لطباعة المصحف الشريف",
        points: [
          'Complete Quran recitation from Al-Fatihah to An-Nas',
          'Final evaluation conducted by a certified Ijazah Sheikh',
          'Sanad documentation — unbroken chain to the Prophet ﷺ',
          'Issuance of the official signed Ijazah certificate',
          'You are now authorised to teach and issue your own Ijazah',
        ],
      },
    },
    books: {
      tuhfat: {
        author: 'Imam Sulayman Al-Jamzouri',
        stage: 'Foundation Stage',
        desc: 'A didactic poem of 61 verses covering the foundational rules of Tajweed — Noon Sakinah, Tanwin, Meem Sakinah, and basic Madd rules. Memorised by every student before advancing.',
        topics: ['Noon Sakinah & Tanwin (4 rules)', 'Meem Sakinah (3 rules)', 'Basic Madd rules', 'Heavy letters (Tafkheem)'],
        linkLabel: 'Provided in class',
      },
      jazariyyah: {
        author: 'Imam Ibn Al-Jazari (d. 833 AH)',
        stage: 'Intermediate Stage',
        desc: 'The definitive classical reference on Tajweed — a poem of 107 verses by the greatest Tajweed scholar in Islamic history. Covers Makhaarij, Sifaat, all Madd types, and Waqf rules in full depth.',
        topics: ['Makhaarij Al-Huroof (17 points)', 'Sifaat Al-Huroof (18 characteristics)', 'All Madd rules', "Waqf & Ibtida'"],
        linkLabel: 'Provided in class',
      },
      shatibiyyah: {
        author: 'Imam Al-Shatibi (d. 590 AH)',
        stage: "Advanced — Qira'at",
        desc: "A celebrated poem of 1,173 verses encoding the Seven Mutawatir Qira'at. The standard reference for anyone seeking to master or teach the various Quranic recitation traditions.",
        topics: ["Seven Mutawatir Qira'at", "Hafs 'an 'Asim", "Warsh 'an Nafi'", "All other five Qira'at"],
        linkLabel: 'Provided in class',
      },
      'madinah-mushaf': {
        author: 'King Fahd Glorious Quran Printing Complex',
        stage: 'Certification Stage',
        desc: "The world's most widely distributed Mus'haf — printed by the official Saudi complex in Madinah. Used for the final certification recitation in the Hafs 'an 'Asim riwayah.",
        topics: ["Hafs 'an 'Asim riwayah", 'Colour-coded Tajweed edition available', 'Used in the final Ijazah exam'],
        linkLabel: 'Read Online — Official Site',
      },
    },
    prereqs: [
      { icon: '📖', text: 'Fluent Quran reading (Noorani Qaida completed)' },
      { icon: '🎙️', text: 'Basic Tajweed knowledge (Tuhfat Al-Atfal level)' },
      { icon: '⏱️', text: 'Commitment to at least 3 lessons per week' },
      { icon: '🧠', text: 'Recommended: Hifz (memorization) program completed' },
    ],
    for: [
      { icon: '🎓', label: 'Students who completed Hifz and want official certification' },
      { icon: '👨‍🏫', label: 'Quran teachers who want a verifiable teaching licence' },
      { icon: '🌍', label: 'Muslims worldwide who want a Sanad to the Prophet ﷺ' },
      { icon: '🏅', label: 'Those who want the highest Quranic credential' },
    ],
    perks: [
      '1-on-1 with certified Ijazah Sheikh',
      'Flexible weekly schedule',
      'Zoom / Skype / Google Meet',
      'Monthly progress reports',
      'Official Sanad document issued',
      'Cancel anytime',
    ],
    enrollCard: { title: 'Quran Ijazah' },
  },
  ar: {
    seo: {
      title: 'دورة إجازة القرآن الكريم',
      description: 'احصل على إجازة قرآنية رسمية بسند متصل إلى النبي ﷺ. ادرس متن الجزرية والشاطبية مع علماء أزهريين معتمدين.',
    },
    breadcrumbLabel: 'دورة الإجازة',
    hero: {
      badge: 'شهادة نادرة ورفيعة',
      title: 'دورة إجازة القرآن الكريم',
      sub: 'احصل على إجازة رسمية بسند متصل مباشرةً إلى النبي محمد ﷺ — ويصبح لك الحق في تدريس القرآن الكريم.',
    },
    stats: [
      { value: 'أكثر من سنتين', label: 'المدة المتوقعة' },
      { value: 'متقدم', label: 'المستوى المطلوب' },
      { value: 'فردي', label: 'حصص خاصة' },
      { value: '٤ مراحل', label: 'منهج منظم' },
    ],
    learn: [
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
    stages: {
      foundation: {
        title: 'المرحلة الأولى: التأسيس',
        duration: '٣ – ٦ أشهر',
        sourceLine: 'تحفة الأطفال',
        points: [
          'مراجعة أشكال الحروف العربية ونطقها الصحيح',
          'مخارج الحروف — جميع المخارج الـ 17 تفصيلاً',
          'صفات الحروف — الصفات الذاتية لكل حرف',
          'أحكام النون الساكنة والتنوين — إدغام، إخفاء، إقلاب، إظهار',
          'أحكام الميم الساكنة — إدغام شفوي، إخفاء شفوي، إظهار شفوي',
        ],
      },
      intermediate: {
        title: 'المرحلة الثانية: التجويد المتقدم',
        duration: '٦ – ١٢ شهراً',
        sourceLine: 'متن الجزرية',
        points: [
          'أحكام المدود جميعها — طبيعي، متصل، منفصل، عارض، لين',
          'اللام الشمسية واللام القمرية',
          'التفخيم والترقيق — الحروف المفخمة والمرققة تفصيلاً',
          'أحكام الراء — شروط التفخيم والترقيق',
          'المتقاربان والمتجانسان والمتماثلان',
          'أحكام الوقف والابتداء — علامات الوقف الـ 12',
        ],
      },
      qiraat: {
        title: 'المرحلة الثالثة: القراءات',
        duration: '٦ – ١٢ شهراً',
        sourceLine: 'متن الشاطبية',
        points: [
          'القراءات السبع المتواترة ورواتها',
          'رواية حفص عن عاصم — الأكثر انتشاراً في العالم',
          'رواية ورش عن نافع — المنتشرة في شمال أفريقيا',
          'دراسة مقارنة لجميع أساليب القراءات السبع',
          'اختبار تلاوة كامل — جزء في كل جلسة مع الشيخ',
        ],
      },
      certification: {
        title: 'المرحلة الرابعة: الإجازة',
        duration: '١ – ٣ أشهر',
        sourceLine: 'مصحف المدينة النبوية',
        points: [
          'ختم القرآن كاملاً من الفاتحة إلى الناس',
          'اختبار نهائي أمام شيخ مجاز معتمد',
          'توثيق السند — سلسلة متصلة بالنبي ﷺ',
          'إصدار شهادة الإجازة الرسمية الموقعة',
          'أنت الآن مجاز بتدريس القرآن وإصدار إجازاتك الخاصة',
        ],
      },
    },
    books: {
      tuhfat: {
        author: 'الإمام سليمان الجمزوري',
        stage: 'مرحلة التأسيس',
        desc: 'منظومة من 61 بيتاً تغطي أحكام التجويد الأساسية — النون الساكنة، التنوين، الميم الساكنة، وأحكام المد الأساسية. يحفظها كل طالب قبل الانتقال للمراحل المتقدمة.',
        topics: ['أحكام النون الساكنة والتنوين (٤ أحكام)', 'أحكام الميم الساكنة (٣ أحكام)', 'أحكام المد الأساسية', 'الحروف المفخمة'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      jazariyyah: {
        author: 'الإمام ابن الجزري (ت ٨٣٣هـ)',
        stage: 'المرحلة المتوسطة',
        desc: 'المرجع الكلاسيكي الرئيسي في علم التجويد — قصيدة من ١٠٧ أبيات لأعظم عالم تجويد في التاريخ الإسلامي. تغطي المخارج والصفات وجميع أحكام المد والوقف بعمق كامل.',
        topics: ['مخارج الحروف (١٧ مخرجاً)', 'صفات الحروف (١٨ صفة)', 'جميع أحكام المدود', 'أحكام الوقف والابتداء'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      shatibiyyah: {
        author: 'الإمام الشاطبي (ت ٥٩٠هـ)',
        stage: 'المرحلة المتقدمة: القراءات',
        desc: 'قصيدة مشهورة من ١١٧٣ بيتاً تضمّن القراءات السبع المتواترة. المرجع الأساسي لكل من يسعى لإتقان روايات القراءات القرآنية أو تدريسها.',
        topics: ['القراءات السبع المتواترة', 'رواية حفص عن عاصم', 'رواية ورش عن نافع', 'القراءات الخمس الأخرى'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      'madinah-mushaf': {
        author: 'مجمع الملك فهد لطباعة المصحف الشريف',
        stage: 'مرحلة الإجازة',
        desc: 'أكثر مصحف توزيعاً في العالم — تطبعه مجمع الملك فهد الرسمي في المدينة المنورة. يُستخدم في اختبار الإجازة النهائي برواية حفص عن عاصم.',
        topics: ['رواية حفص عن عاصم', 'متوفر بنسخة تجويد ملوّنة', 'يُستخدم في اختبار الإجازة النهائي'],
        linkLabel: 'اقرأ أونلاين — الموقع الرسمي',
      },
    },
    prereqs: [
      { icon: '📖', text: 'قراءة القرآن بطلاقة (إتمام القاعدة النورانية)' },
      { icon: '🎙️', text: 'معرفة أساسية بأحكام التجويد (مستوى تحفة الأطفال)' },
      { icon: '⏱️', text: 'الالتزام بثلاث حصص على الأقل أسبوعياً' },
      { icon: '🧠', text: 'يُنصح: إتمام برنامج حفظ القرآن الكريم' },
    ],
    for: [
      { icon: '🎓', label: 'طلاب أتموا حفظ القرآن ويريدون شهادة رسمية' },
      { icon: '👨‍🏫', label: 'معلمو القرآن الذين يريدون ترخيصاً معتمداً للتدريس' },
      { icon: '🌍', label: 'المسلمون في كل مكان الذين يريدون سنداً إلى النبي ﷺ' },
      { icon: '🏅', label: 'كل من يسعى لنيل أرفع الشهادات القرآنية' },
    ],
    perks: [
      'فردي مع شيخ مجاز معتمد',
      'جدول أسبوعي مرن',
      'زووم / سكايب / جوجل ميت',
      'تقارير تقدم شهرية',
      'وثيقة السند الرسمية',
      'إلغاء في أي وقت',
    ],
    enrollCard: { title: 'إجازة القرآن الكريم' },
  },
};
