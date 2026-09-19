// Per-language content for /courses/islamic-studies. Phase 2c migration
// (2026-09-18): moved literally, unchanged, from the isAr-forked consts/
// ternaries previously inline in CourseIslamicStudies.jsx,
// src/data/islamicStudiesData.js and IslamicStudiesBookCard.jsx. Mirrors
// src/i18n/courses/ijazah.js's shape and its Phase 2b/2b-review rules:
//
// - Only en/ar are populated. it/es/de/fr are deliberately absent (not
//   migrated yet, stay 'draft' in src/data/translationStatus.js) --
//   TranslationGate continues to block them from showing this (English)
//   content as if it were their own translation.
// - hadiths/modules/books are keyed by the same ids used in the structural
//   module src/data/courses/islamic-studies.js.
// - books['arbaeen-nawawiyyah'] is the only book with a libraryNote field --
//   this mirrors the original data (only that one book links to the Hadith
//   Library), it is not a migration gap.
// - This is the module's root object recognised by
//   LANGUAGE_CONTENT_ROOT_EXCEPTIONS in
//   src/test/noHardcodedBilingualContent.test.js as a legitimate partial-
//   language content source (see that file for why, and its narrow scope).

export const ISLAMIC_STUDIES_TEXT = {
  en: {
    seo: {
      title: 'Islamic Studies Course',
      description: 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
    },
    breadcrumbLabel: 'Islamic Studies Course',
    hero: {
      badge: '5 Complete Modules',
      title: 'Islamic Studies',
      sub: 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — taught by certified scholars in your own language.',
    },
    stats: [
      { value: '5', label: 'Subject Modules' },
      { value: 'All Levels', label: 'Beginner → Advanced' },
      { value: '1-on-1', label: 'Private Lessons' },
      { value: '40 Weeks', label: 'Full Program' },
      { value: '6 Lang', label: 'Instruction Languages' },
    ],
    learn: [
      'Core Aqeedah — Tawhid, all six pillars of faith, and Islamic theology',
      'Practical Fiqh — Taharah, Salah, Sawm, Zakat, and Hajj',
      'Complete Seerah — life of the Prophet ﷺ from birth to passing',
      '40 Hadiths of Imam Al-Nawawi with full explanation & daily application',
      "Tafsir of Juz 'Amma and selected Surahs with linguistic depth",
      'Islamic ethics (Akhlaq) derived from the Prophetic example',
      'Each subject taught from its authentic, primary Islamic source',
      'Lessons available in English, Arabic, Italian, French, German, or Spanish',
    ],
    hadithReadLink: 'Read full hadith — Sunnah.com ↗',
    hadiths: {
      'nawawi-1': {
        text: 'Actions are but by intention, and every man shall have only that which he intended.',
        narrator: 'Umar ibn Al-Khattab (RA)',
        source: "Hadith 1 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-2': {
        text: 'Ihsan is to worship Allah as though you see Him — for even if you do not see Him, He sees you.',
        narrator: 'Umar ibn Al-Khattab (RA) — from the Hadith of Jibreel',
        source: "Hadith 2 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-3': {
        text: 'Islam is built upon five pillars: testimony of faith, prayer, zakat, fasting Ramadan, and Hajj.',
        narrator: 'Abdullah ibn Umar (RA)',
        source: "Hadith 3 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-4': {
        text: 'Each of you is constituted in your mother\'s womb for forty days as a drop, then a clot, then a morsel — then the angel breathes the soul into him.',
        narrator: 'Abdullah ibn Mas\'ood (RA)',
        source: "Hadith 4 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-6': {
        text: 'The lawful is clear and the unlawful is clear; between them are doubtful matters — whoever avoids them has protected his religion and honour.',
        narrator: "An-Nu'man ibn Bashir (RA)",
        source: "Hadith 6 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-7': {
        text: 'The religion is sincere advice — to Allah, His Book, His Messenger, the leaders of the Muslims, and their common people.',
        narrator: 'Tamim Al-Dari (RA)',
        source: "Hadith 7 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-10': {
        text: 'Allah is pure and accepts only what is pure. He commands the believers as He commanded the Messengers: "Eat of the good things and do righteous deeds."',
        narrator: 'Abu Hurairah (RA)',
        source: "Hadith 10 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-11': {
        text: 'Leave that which makes you doubt for that which does not make you doubt.',
        narrator: 'Al-Hassan ibn Ali (RA)',
        source: "Hadith 11 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-12': {
        text: "Part of the perfection of a person's Islam is his leaving that which does not concern him.",
        narrator: 'Abu Hurairah (RA)',
        source: "Hadith 12 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-13': {
        text: 'None of you truly believes until he loves for his brother what he loves for himself.',
        narrator: 'Anas ibn Malik (RA)',
        source: "Hadith 13 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-16': {
        text: 'Do not become angry. The man repeated his request several times and the Prophet ﷺ said: Do not become angry.',
        narrator: 'Abu Hurairah (RA)',
        source: "Hadith 16 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-18': {
        text: 'Fear Allah wherever you are; follow a bad deed with a good one to erase it; and treat people with good character.',
        narrator: "Abu Dharr & Mu'adh ibn Jabal (RA)",
        source: "Hadith 18 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-19': {
        text: 'Be mindful of Allah and He will protect you. Be mindful of Allah and you will find Him before you. Know Allah in times of ease and He will know you in times of hardship.',
        narrator: 'Abdullah ibn Abbas (RA)',
        source: "Hadith 19 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-23': {
        text: 'Purity is half of faith. Alhamdulillah fills the scale. SubhanAllah and Alhamdulillah fill what is between the heavens and the earth.',
        narrator: 'Abu Malik Al-Harith Al-Ash\'ari (RA)',
        source: "Hadith 23 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-34': {
        text: 'Whoever among you sees an evil, let him change it with his hand; if he cannot, then with his tongue; if he cannot, then with his heart — and that is the weakest of faith.',
        narrator: 'Abu Sa\'eed Al-Khudri (RA)',
        source: "Hadith 34 — Al-Arba'een Al-Nawawiyyah",
      },
      'nawawi-40': {
        text: 'Be in the world as if you were a stranger or a traveler along a path — and count yourself among the people of the graves.',
        narrator: 'Abdullah ibn Umar (RA)',
        source: "Hadith 40 — Al-Arba'een Al-Nawawiyyah",
      },
      'tabarani-khair-annas': {
        text: 'The best of people are those who are most beneficial to people.',
        narrator: 'Jabir ibn Abdullah (RA)',
        source: "Al-Mu'jam Al-Awsat — Al-Tabarani",
      },
    },
    modules: {
      aqeedah: {
        title: 'Aqeedah — Islamic Creed',
        duration: '8 weeks',
        source: 'Islamic Creed Series — Dr. Umar Al-Ashqar',
        topics: [
          'Pillars of Faith (Arkan Al-Iman) — all six in depth',
          "Tawhid — Rububiyyah, Uluhiyyah, and Asma' wa Sifat",
          'Belief in Angels, Books, and the Prophets',
          'Belief in the Last Day and Divine Decree (Qadar)',
          'Refutation of common theological misconceptions',
        ],
      },
      fiqh: {
        title: 'Fiqh — Islamic Jurisprudence',
        duration: '10 weeks',
        source: 'Al-Fiqh Al-Muyassar — King Fahd Complex',
        topics: [
          'Taharah — Wudu, Ghusl, and Tayammum in full',
          'Salah — conditions, pillars, Sunnah acts, and invalidators',
          'Sawm — Ramadan rules, Kaffarah, and voluntary fasts',
          'Zakat — Nisab thresholds, types of wealth, valid recipients',
          'Hajj & Umrah — pillars, obligations, and step-by-step rites',
        ],
      },
      seerah: {
        title: 'Seerah — Prophetic Biography',
        duration: '8 weeks',
        source: 'The Sealed Nectar — Sheikh Safiur-Rahman Mubarakpuri',
        topics: [
          'Pre-Islamic Arabia — the world before the Prophet ﷺ',
          'Birth, childhood and early life of the Prophet ﷺ',
          'The Meccan Period — first revelation, Dawah, and persecution',
          'Hijrah to Madinah — the turning point of Islamic history',
          'Battles, treaties, and the Opening of Mecca',
          'Farewell Hajj and the passing of the Prophet ﷺ',
        ],
      },
      'hadith-ethics': {
        title: 'Hadith & Ethics',
        duration: '6 weeks',
        source: "Al-Arba'een Al-Nawawiyyah — Imam Al-Nawawi",
        topics: [
          '40 core hadiths with full explanation and context',
          'Introduction to Hadith sciences (Mustalah Al-Hadith)',
          'Islamic ethics (Akhlaq) from the Prophetic example ﷺ',
          'Rights of Allah, rights of the self, rights of others',
          'Practical application in modern daily life',
        ],
      },
      tafsir: {
        title: 'Tafsir — Quranic Interpretation',
        duration: '8 weeks',
        source: 'Al-Tafsir Al-Muyassar — King Fahd Complex',
        topics: [
          "Introduction to Tafsir sciences ('Ulum Al-Quran)",
          "Complete Tafsir of Juz 'Amma (An-Naba' to An-Nas)",
          'Tafsir of key Meccan & Madinan Surahs',
          'Context of revelation (Asbab Al-Nuzul)',
          'Linguistic analysis — Arabic roots & Quranic vocabulary',
        ],
      },
    },
    books: {
      'islamic-creed-series': {
        author: 'Dr. Umar Sulayman Al-Ashqar',
        module: '🌟 Aqeedah module',
        desc: "A comprehensive 9-volume series covering Islamic theology from its foundations — Tawhid, pillars of faith, belief in the unseen, and the Last Day. Used by Islamic universities worldwide for its scholarly depth.",
        topics: [
          'Tawhid — all three categories in depth',
          'Six pillars of Faith fully explained',
          'Al-Qadar (divine decree)',
          'Refutation of deviant beliefs',
        ],
        linkLabel: 'Provided in class',
      },
      'fiqh-al-muyassar': {
        author: 'King Fahd Glorious Quran Printing Complex',
        module: '🕌 Fiqh module — Primary source',
        desc: 'A 2-volume authoritative work covering all pillars of Islamic worship — Taharah, Salah, Sawm, Zakat, and Hajj — compiled by scholars of the King Fahd Complex from Quran and authentic Sunnah.',
        topics: [
          'Taharah — Wudu, Ghusl, Tayammum',
          'Salah — all conditions, pillars, and nullifiers',
          'Sawm — Ramadan, Kaffarah, voluntary fasts',
          'Zakat thresholds & Hajj rites',
        ],
        linkLabel: 'Provided in class',
      },
      'bulugh-al-maram': {
        author: 'Imam Ibn Hajar Al-Asqalani (d. 852 AH)',
        module: '🕌 Fiqh module — Supplementary',
        desc: 'A landmark Fiqh hadith collection containing ~1,432 hadiths organised into 16 books covering all aspects of Islamic jurisprudence — from purification to business transactions, marriage, and criminal law.',
        topics: [
          '16 books covering all Fiqh areas',
          'Purification, Prayer, Fasting, Zakat, Hajj',
          'Business transactions & marriage',
          'Criminal law & judgements',
        ],
        linkLabel: 'Read online — Sunnah.com',
      },
      'sealed-nectar': {
        author: 'Sheikh Safiur-Rahman Mubarakpuri',
        module: '📖 Seerah module — Primary source',
        desc: "Winner of the World Muslim League's first prize for Seerah literature. The most comprehensive one-volume biography of the Prophet ﷺ — from pre-Islamic Arabia to his passing — considered the gold standard of modern Seerah.",
        topics: [
          'Pre-Islamic Arabia (Al-Jahiliyyah)',
          'Meccan & Madinan periods in full',
          'All major Ghazwat and expeditions',
          'Farewell Hajj & final days of the Prophet ﷺ',
        ],
        linkLabel: 'Provided in class',
      },
      shamail: {
        author: 'Imam Al-Tirmidhi (d. 279 AH)',
        module: '📖 Seerah module — Supplementary',
        desc: 'A collection of 417 hadiths across 56 chapters documenting the personal characteristics, daily habits, appearance, worship, and character of the Prophet ﷺ in intimate detail.',
        topics: [
          'Physical description & appearance of the Prophet ﷺ',
          'Clothing, food and daily habits',
          'Worship, prayer and night vigils',
          'Character, laughter and social conduct',
        ],
        linkLabel: 'Read online — Sunnah.com (417 hadiths)',
      },
      'arbaeen-nawawiyyah': {
        author: 'Imam Yahya ibn Sharaf Al-Nawawi (d. 676 AH)',
        module: '📜 Hadith & Ethics — Primary source',
        desc: '42 hadiths chosen by Imam Al-Nawawi as the most comprehensive summary of Islamic teachings. Every single hadith is considered a foundation of the religion — the essential starting point for every Muslim student.',
        topics: [
          '42 core hadiths — the pillars of Islam & Iman',
          'Ihsan — worshipping Allah as though you see Him',
          'Halal, Haram, and doubtful matters',
          'Anger, sincerity, and daily conduct',
        ],
        linkLabel: 'Read all 42 hadiths — Sunnah.com',
        libraryNote: '📚 Browse this full collection in our Hadith Library',
      },
      'riyad-as-saliheen': {
        author: 'Imam Al-Nawawi (d. 676 AH)',
        module: '📜 Hadith & Ethics — Supplementary',
        desc: 'The most widely read hadith collection for daily Islamic living — nearly 1,900 hadiths across 20 chapters covering manners, worship, social conduct, and the prohibited. An essential daily companion.',
        topics: [
          'Good manners & social etiquette (1,900 hadiths)',
          'Etiquette of eating, sleeping, travel',
          'Visiting the sick & consolation',
          'Prohibited actions & repentance',
        ],
        linkLabel: 'Read online — Sunnah.com (1,900 hadiths)',
      },
      'adab-al-mufrad': {
        author: 'Imam Al-Bukhari (d. 256 AH)',
        module: '📜 Hadith & Ethics — Supplementary',
        desc: "Imam Al-Bukhari's dedicated collection of 1,322 hadiths focused entirely on Islamic conduct and character — family relations, neighbours, kindness, anger, greetings, and everyday behaviour.",
        topics: [
          '1,322 hadiths — 57 chapters on conduct',
          'Parents, children & family rights',
          'Neighbours, generosity & good character',
          'Greetings, anger & social interaction',
        ],
        linkLabel: 'Read online — Sunnah.com (1,322 hadiths)',
      },
      'tafsir-al-muyassar': {
        author: 'King Fahd Glorious Quran Printing Complex',
        module: '✨ Tafsir module — Primary source',
        desc: 'A scholarly yet accessible single-volume Tafsir of the complete Quran. Covers the meaning of every verse with clarity grounded in classical Islamic sources — ideal for students beginning Tafsir studies.',
        topics: [
          'Complete Quran Tafsir in 1 volume',
          "Juz 'Amma (An-Naba' to An-Nas) studied fully in class",
          'Asbab Al-Nuzul for key verses',
          'Classical Tafsir methodology explained',
        ],
        linkLabel: 'Read Quran & Tafsir online — Quran.com',
      },
    },
    for: [
      { icon: '🌱', label: 'New Muslims who want a solid, structured Islamic foundation' },
      { icon: '👨‍👩‍👧', label: 'Families wanting to educate children in authentic Islamic knowledge' },
      { icon: '🌍', label: 'Western Muslims who want to learn Islam in their own language' },
      { icon: '📚', label: 'Anyone who wants source-based Islamic education — not just opinions' },
    ],
    perks: ['1-on-1 with certified scholar', 'Choose your starting module', 'Available in 6 languages', 'Flexible weekly schedule', 'Zoom / Skype / Google Meet', 'Cancel anytime'],
    enrollCard: { title: 'Islamic Studies', sub: '5 Modules · All Levels' },
  },
  ar: {
    seo: {
      title: 'دورة الدراسات الإسلامية',
      description: 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — ٥ وحدات يدرّسها علماء معتمدون بلغتك.',
    },
    breadcrumbLabel: 'الدراسات الإسلامية',
    hero: {
      badge: '٥ وحدات دراسية متكاملة',
      title: 'الدراسات الإسلامية',
      sub: 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — يدرّسه علماء معتمدون بلغتك الخاصة.',
    },
    stats: [
      { value: '٥', label: 'وحدات دراسية' },
      { value: 'جميع المستويات', label: 'مبتدئ ← متقدم' },
      { value: 'فردي', label: 'حصص خاصة' },
      { value: '٤٠ أسبوعاً', label: 'البرنامج الكامل' },
      { value: '٦ لغات', label: 'لغات التدريس' },
    ],
    learn: [
      'العقيدة الأساسية — التوحيد وأركان الإيمان الستة وعلم الكلام الإسلامي',
      'الفقه العملي — الطهارة والصلاة والصيام والزكاة والحج',
      'السيرة النبوية كاملة — من مولد النبي ﷺ حتى وفاته',
      'أربعون حديثاً للإمام النووي مع الشرح الكامل والتطبيق اليومي',
      'تفسير جزء عم وسور مختارة مع التحليل اللغوي',
      'الأخلاق الإسلامية المستمدة من سنة النبي ﷺ',
      'كل مادة تُدرَّس من مصدرها الإسلامي الأصيل',
      'الحصص متاحة بالعربية والإنجليزية والإيطالية والفرنسية والألمانية والإسبانية',
    ],
    hadithReadLink: 'اقرأ الحديث كاملاً — Sunnah.com ↗',
    hadiths: {
      'nawawi-1': {
        text: 'إنما الأعمال بالنيات، وإنما لكل امرئٍ ما نوى.',
        narrator: 'عمر بن الخطاب (رضي الله عنه)',
        source: 'الحديث الأول — الأربعون النووية',
      },
      'nawawi-2': {
        text: 'الإحسان أن تعبد الله كأنك تراه، فإن لم تكن تراه فإنه يراك.',
        narrator: 'عمر بن الخطاب (رضي الله عنه) — من حديث جبريل',
        source: 'الحديث الثاني — الأربعون النووية',
      },
      'nawawi-3': {
        text: 'بُني الإسلام على خمس: شهادة أن لا إله إلا الله وأن محمداً رسول الله، وإقام الصلاة، وإيتاء الزكاة، وصوم رمضان، وحج البيت.',
        narrator: 'عبد الله بن عمر (رضي الله عنه)',
        source: 'الحديث الثالث — الأربعون النووية',
      },
      'nawawi-4': {
        text: 'إن أحدكم يُجمع خلقه في بطن أمه أربعين يوماً نطفةً، ثم يكون علقةً مثل ذلك، ثم يكون مضغةً مثل ذلك، ثم يُرسل إليه الملَك فيُنفخ فيه الروح.',
        narrator: 'عبد الله بن مسعود (رضي الله عنه)',
        source: 'الحديث الرابع — الأربعون النووية',
      },
      'nawawi-6': {
        text: 'إن الحلال بيّن وإن الحرام بيّن، وبينهما أمور مشتبهات — فمن اتقى الشبهات فقد استبرأ لدينه وعرضه.',
        narrator: 'النعمان بن بشير (رضي الله عنه)',
        source: 'الحديث السادس — الأربعون النووية',
      },
      'nawawi-7': {
        text: 'الدين النصيحة — قلنا: لمن؟ قال: لله ولكتابه ولرسوله ولأئمة المسلمين وعامتهم.',
        narrator: 'تميم الداري (رضي الله عنه)',
        source: 'الحديث السابع — الأربعون النووية',
      },
      'nawawi-10': {
        text: 'إن الله طيّب لا يقبل إلا طيباً، وإن الله أمر المؤمنين بما أمر به المرسلين، فقال: ﴿يَا أَيُّهَا الرُّسُلُ كُلُوا مِنَ الطَّيِّبَاتِ وَاعْمَلُوا صَالِحًا﴾.',
        narrator: 'أبو هريرة (رضي الله عنه)',
        source: 'الحديث العاشر — الأربعون النووية',
      },
      'nawawi-11': {
        text: 'دَعْ ما يَريبُك إلى ما لا يَريبُك.',
        narrator: 'الحسن بن علي (رضي الله عنه)',
        source: 'الحديث الحادي عشر — الأربعون النووية',
      },
      'nawawi-12': {
        text: 'من حسن إسلام المرء تركُه ما لا يعنيه.',
        narrator: 'أبو هريرة (رضي الله عنه)',
        source: 'الحديث الثاني عشر — الأربعون النووية',
      },
      'nawawi-13': {
        text: 'لا يؤمن أحدكم حتى يُحِبَّ لأخيه ما يحب لنفسه.',
        narrator: 'أنس بن مالك (رضي الله عنه)',
        source: 'الحديث الثالث عشر — الأربعون النووية',
      },
      'nawawi-16': {
        text: 'قال رجل للنبي ﷺ: أوصني. قال: لا تغضب. فردّد مراراً، قال: لا تغضب.',
        narrator: 'أبو هريرة (رضي الله عنه)',
        source: 'الحديث السادس عشر — الأربعون النووية',
      },
      'nawawi-18': {
        text: 'اتقِ الله حيثما كنت، وأتبِع السيئةَ الحسنةَ تمحُها، وخالقِ الناسَ بخُلُقٍ حسن.',
        narrator: 'أبو ذر ومعاذ بن جبل (رضي الله عنهما)',
        source: 'الحديث الثامن عشر — الأربعون النووية',
      },
      'nawawi-19': {
        text: 'احفظ الله يحفظك، احفظ الله تجده تجاهك، تعرّف إلى الله في الرخاء يعرفك في الشدة.',
        narrator: 'عبد الله بن عباس (رضي الله عنه)',
        source: 'الحديث التاسع عشر — الأربعون النووية',
      },
      'nawawi-23': {
        text: 'الطهور شطر الإيمان، والحمد لله تملأ الميزان، وسبحان الله والحمد لله تملآن ما بين السماوات والأرض.',
        narrator: 'أبو مالك الحارث الأشعري (رضي الله عنه)',
        source: 'الحديث الثالث والعشرون — الأربعون النووية',
      },
      'nawawi-34': {
        text: 'من رأى منكم منكراً فليغيّره بيده، فإن لم يستطع فبلسانه، فإن لم يستطع فبقلبه — وذلك أضعف الإيمان.',
        narrator: 'أبو سعيد الخدري (رضي الله عنه)',
        source: 'الحديث الرابع والثلاثون — الأربعون النووية',
      },
      'nawawi-40': {
        text: 'كن في الدنيا كأنك غريب أو عابر سبيل — وعُدَّ نفسك من أصحاب القبور.',
        narrator: 'عبد الله بن عمر (رضي الله عنه)',
        source: 'الحديث الأربعون — الأربعون النووية',
      },
      'tabarani-khair-annas': {
        text: 'خير الناس أنفعهم للناس.',
        narrator: 'جابر بن عبد الله (رضي الله عنه)',
        source: 'المعجم الأوسط — الطبراني',
      },
    },
    modules: {
      aqeedah: {
        title: 'العقيدة الإسلامية',
        duration: '٨ أسابيع',
        source: 'العقيدة في ضوء الكتاب والسنة — د. عمر الأشقر',
        topics: [
          'أركان الإيمان الستة بالتفصيل',
          'التوحيد — الربوبية والألوهية والأسماء والصفات',
          'الإيمان بالملائكة والكتب والرسل',
          'الإيمان باليوم الآخر والقدر خيره وشره',
          'الرد على الشبهات العقدية الشائعة',
        ],
      },
      fiqh: {
        title: 'الفقه الإسلامي',
        duration: '١٠ أسابيع',
        source: 'الفقه الميسر في ضوء الكتاب والسنة — مجمع الملك فهد',
        topics: [
          'الطهارة — الوضوء والغسل والتيمم تفصيلاً',
          'الصلاة — الشروط والأركان والسنن والمبطلات',
          'الصيام — أحكام رمضان والكفارات والتطوع',
          'الزكاة — النصاب وأنواع الأموال ومصارف الزكاة',
          'الحج والعمرة — الأركان والواجبات والخطوات التفصيلية',
        ],
      },
      seerah: {
        title: 'السيرة النبوية',
        duration: '٨ أسابيع',
        source: 'الرحيق المختوم — الشيخ صفي الرحمن المباركفوري',
        topics: [
          'الجزيرة العربية قبل الإسلام — العالم قبل البعثة',
          'مولد النبي ﷺ وطفولته وشبابه',
          'المرحلة المكية — الوحي والدعوة والاضطهاد',
          'الهجرة إلى المدينة — نقطة التحول في التاريخ الإسلامي',
          'الغزوات والمعاهدات وفتح مكة المكرمة',
          'حجة الوداع ووفاة النبي ﷺ',
        ],
      },
      'hadith-ethics': {
        title: 'الحديث النبوي والأخلاق',
        duration: '٦ أسابيع',
        source: 'الأربعون النووية — الإمام النووي',
        topics: [
          '٤٠ حديثاً أساسياً مع الشرح الكامل والسياق',
          'مدخل إلى علوم الحديث (مصطلح الحديث)',
          'الأخلاق الإسلامية من هديه ﷺ',
          'حقوق الله وحقوق النفس وحقوق الآخرين',
          'التطبيق العملي في الحياة اليومية المعاصرة',
        ],
      },
      tafsir: {
        title: 'التفسير القرآني',
        duration: '٨ أسابيع',
        source: 'التفسير الميسر — مجمع الملك فهد',
        topics: [
          'مدخل إلى علوم التفسير (علوم القرآن)',
          'تفسير جزء عم كاملاً (من النبأ إلى الناس)',
          'تفسير سور مكية ومدنية مختارة',
          'أسباب النزول للآيات الرئيسية',
          'التحليل اللغوي — جذور الكلمات والمفردات القرآنية',
        ],
      },
    },
    books: {
      'islamic-creed-series': {
        author: 'د. عمر سليمان الأشقر',
        module: '🌟 وحدة العقيدة',
        desc: 'سلسلة شاملة من ٩ مجلدات تغطي علم العقيدة — التوحيد وأركان الإيمان والغيبيات واليوم الآخر. تُدرَّس في الجامعات الإسلامية حول العالم لرصانتها العلمية.',
        topics: ['التوحيد — أنواعه الثلاثة بالتفصيل', 'أركان الإيمان الستة شرحاً وافياً', 'القضاء والقدر', 'الرد على الانحرافات العقدية'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      'fiqh-al-muyassar': {
        author: 'مجمع الملك فهد لطباعة المصحف الشريف',
        module: '🕌 وحدة الفقه — المصدر الأساسي',
        desc: 'عمل علمي معتمد من مجلدين يغطي أركان العبادة الإسلامية — الطهارة والصلاة والصيام والزكاة والحج — أعده علماء مجمع الملك فهد من القرآن والسنة الصحيحة.',
        topics: ['الطهارة — الوضوء والغسل والتيمم', 'الصلاة — شروطها وأركانها ومبطلاتها', 'الصيام — رمضان والكفارات والتطوع', 'نصاب الزكاة ومناسك الحج'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      'bulugh-al-maram': {
        author: 'الإمام ابن حجر العسقلاني (ت ٨٥٢هـ)',
        module: '🕌 وحدة الفقه — مصدر مكمّل',
        desc: 'مجموعة حديثية فقهية بارزة تحتوي ~١٤٣٢ حديثاً مرتبة في ١٦ كتاباً تغطي جميع أبواب الفقه الإسلامي — من الطهارة إلى المعاملات والنكاح والحدود.',
        topics: ['١٦ كتاباً تغطي جميع أبواب الفقه', 'الطهارة والصلاة والصيام والزكاة والحج', 'المعاملات والنكاح', 'الحدود والقضاء'],
        linkLabel: 'اقرأ أونلاين — Sunnah.com',
      },
      'sealed-nectar': {
        author: 'الشيخ صفي الرحمن المباركفوري',
        module: '📖 وحدة السيرة — المصدر الأساسي',
        desc: 'الفائز بالجائزة الأولى في مسابقة رابطة العالم الإسلامي. أشمل سيرة في مجلد واحد للنبي ﷺ من عصر ما قبل الإسلام حتى وفاته — يُعد المعيار الذهبي لكتب السيرة الحديثة.',
        topics: ['الجزيرة العربية قبل الإسلام (الجاهلية)', 'العهدان المكي والمدني كاملاً', 'الغزوات والسرايا الكبرى', 'حجة الوداع وآخر أيام النبي ﷺ'],
        linkLabel: 'يُوفَّر في الحصة',
      },
      shamail: {
        author: 'الإمام الترمذي (ت ٢٧٩هـ)',
        module: '📖 وحدة السيرة — مصدر مكمّل',
        desc: 'مجموعة من ٤١٧ حديثاً في ٥٦ باباً تُوثِّق صفات النبي ﷺ الشخصية وعاداته اليومية وهيئته وعبادته وأخلاقه بتفصيل دقيق.',
        topics: ['الصفات الجسمية وهيئة النبي ﷺ', 'اللباس والطعام والعادات اليومية', 'العبادة والصلاة وقيام الليل', 'الأخلاق والضحك والتعامل مع الناس'],
        linkLabel: 'اقرأ أونلاين — Sunnah.com (٤١٧ حديثاً)',
      },
      'arbaeen-nawawiyyah': {
        author: 'الإمام يحيى بن شرف النووي (ت ٦٧٦هـ)',
        module: '📜 وحدة الحديث والأخلاق — المصدر الأساسي',
        desc: '٤٢ حديثاً اختارها الإمام النووي لأنها أشمل ملخص للتعاليم الإسلامية. كل حديث ركيزة أساسية في الدين — نقطة البداية لكل طالب مسلم.',
        topics: ['٤٢ حديثاً أساسياً — ركائز الإسلام والإيمان', 'الإحسان — عبادة الله كأنك تراه', 'الحلال والحرام والمشتبهات', 'الغضب والإخلاص والسلوك اليومي'],
        linkLabel: 'اقرأ الأحاديث الـ ٤٢ — Sunnah.com',
        libraryNote: '📚 تصفح هذا الكتاب كاملاً في مكتبة الحديث',
      },
      'riyad-as-saliheen': {
        author: 'الإمام النووي (ت ٦٧٦هـ)',
        module: '📜 وحدة الحديث والأخلاق — مصدر مكمّل',
        desc: 'أكثر مجموعات الحديث قراءةً للحياة الإسلامية اليومية — قرابة ١٩٠٠ حديثاً في ٢٠ باباً تغطي الآداب والعبادة والمعاملات والمحظورات. رفيق يومي لا غنى عنه.',
        topics: ['الآداب والأخلاق الاجتماعية (١٩٠٠ حديثاً)', 'آداب الطعام والنوم والسفر', 'عيادة المريض والتعزية', 'المحظورات والتوبة'],
        linkLabel: 'اقرأ أونلاين — Sunnah.com (١٩٠٠ حديثاً)',
      },
      'adab-al-mufrad': {
        author: 'الإمام البخاري (ت ٢٥٦هـ)',
        module: '📜 وحدة الحديث والأخلاق — مصدر مكمّل',
        desc: 'مجموعة الإمام البخاري المخصصة للأخلاق والآداب الإسلامية — ١٣٢٢ حديثاً تتناول حقوق الأسرة والجيران واللطف والغضب والتحية والسلوك اليومي.',
        topics: ['١٣٢٢ حديثاً — ٥٧ باباً في الأخلاق', 'حقوق الوالدين والأبناء والأسرة', 'حقوق الجيران والكرم وحسن الخلق', 'التحية والغضب والتعامل الاجتماعي'],
        linkLabel: 'اقرأ أونلاين — Sunnah.com (١٣٢٢ حديثاً)',
      },
      'tafsir-al-muyassar': {
        author: 'مجمع الملك فهد لطباعة المصحف الشريف',
        module: '✨ وحدة التفسير — المصدر الأساسي',
        desc: 'تفسير موثوق وميسر للقرآن الكريم كاملاً في مجلد واحد. يشرح معنى كل آية بوضوح مستنداً إلى المصادر الإسلامية الكلاسيكية — مثالي للطلاب المبتدئين في التفسير.',
        topics: ['تفسير القرآن كاملاً في مجلد واحد', 'جزء عم (النبأ إلى الناس) يُدرَّس كاملاً في الحصص', 'أسباب النزول للآيات الرئيسية', 'منهج التفسير الكلاسيكي مشروحاً'],
        linkLabel: 'اقرأ القرآن وتفسيره أونلاين — Quran.com',
      },
    },
    for: [
      { icon: '🌱', label: 'المسلمون الجدد الذين يريدون أساساً إسلامياً راسخاً ومنظماً' },
      { icon: '👨‍👩‍👧', label: 'الأسر التي تريد تعليم أطفالها العلم الإسلامي الأصيل' },
      { icon: '🌍', label: 'مسلمو الغرب الذين يريدون تعلم الإسلام بلغتهم الخاصة' },
      { icon: '📚', label: 'كل من يريد تعليماً إسلامياً مبنياً على المصادر لا مجرد آراء' },
    ],
    perks: ['فردي مع عالم معتمد', 'اختر وحدتك الأولى', 'متاح بـ ٦ لغات', 'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت', 'إلغاء في أي وقت'],
    enrollCard: { title: 'الدراسات الإسلامية', sub: '٥ وحدات · جميع المستويات' },
  },
};
