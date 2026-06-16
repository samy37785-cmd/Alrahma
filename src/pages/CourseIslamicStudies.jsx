import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { COURSE_UI } from '../i18n/coursePages';

/* ─── Hadiths — full 16-day rotation from Al-Arba'een Al-Nawawiyyah ─── */
const HADITHS = [
  {
    arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
    en: 'Actions are but by intention, and every man shall have only that which he intended.',
    ar: 'إنما الأعمال بالنيات، وإنما لكل امرئٍ ما نوى.',
    narrator: { en: 'Umar ibn Al-Khattab (RA)', ar: 'عمر بن الخطاب (رضي الله عنه)' },
    source: { en: "Hadith 1 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الأول — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:1',
  },
  {
    arabic: 'الإِحْسَانُ أَنْ تَعْبُدَ اللَّهَ كَأَنَّكَ تَرَاهُ',
    en: 'Ihsan is to worship Allah as though you see Him — for even if you do not see Him, He sees you.',
    ar: 'الإحسان أن تعبد الله كأنك تراه، فإن لم تكن تراه فإنه يراك.',
    narrator: { en: 'Umar ibn Al-Khattab (RA) — from the Hadith of Jibreel', ar: 'عمر بن الخطاب (رضي الله عنه) — من حديث جبريل' },
    source: { en: "Hadith 2 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثاني — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:2',
  },
  {
    arabic: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ',
    en: 'Islam is built upon five pillars: testimony of faith, prayer, zakat, fasting Ramadan, and Hajj.',
    ar: 'بُني الإسلام على خمس: شهادة أن لا إله إلا الله وأن محمداً رسول الله، وإقام الصلاة، وإيتاء الزكاة، وصوم رمضان، وحج البيت.',
    narrator: { en: 'Abdullah ibn Umar (RA)', ar: 'عبد الله بن عمر (رضي الله عنه)' },
    source: { en: "Hadith 3 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثالث — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:3',
  },
  {
    arabic: 'إِنَّ أَحَدَكُمْ يُجْمَعُ خَلْقُهُ فِي بَطْنِ أُمِّهِ',
    en: 'Each of you is constituted in your mother\'s womb for forty days as a drop, then a clot, then a morsel — then the angel breathes the soul into him.',
    ar: 'إن أحدكم يُجمع خلقه في بطن أمه أربعين يوماً نطفةً، ثم يكون علقةً مثل ذلك، ثم يكون مضغةً مثل ذلك، ثم يُرسل إليه الملَك فيُنفخ فيه الروح.',
    narrator: { en: 'Abdullah ibn Mas\'ood (RA)', ar: 'عبد الله بن مسعود (رضي الله عنه)' },
    source: { en: "Hadith 4 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الرابع — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:4',
  },
  {
    arabic: 'إِنَّ الْحَلَالَ بَيِّنٌ وَإِنَّ الْحَرَامَ بَيِّنٌ',
    en: 'The lawful is clear and the unlawful is clear; between them are doubtful matters — whoever avoids them has protected his religion and honour.',
    ar: 'إن الحلال بيّن وإن الحرام بيّن، وبينهما أمور مشتبهات — فمن اتقى الشبهات فقد استبرأ لدينه وعرضه.',
    narrator: { en: "An-Nu'man ibn Bashir (RA)", ar: "النعمان بن بشير (رضي الله عنه)" },
    source: { en: "Hadith 6 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث السادس — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:6',
  },
  {
    arabic: 'الدِّينُ النَّصِيحَةُ',
    en: 'The religion is sincere advice — to Allah, His Book, His Messenger, the leaders of the Muslims, and their common people.',
    ar: 'الدين النصيحة — قلنا: لمن؟ قال: لله ولكتابه ولرسوله ولأئمة المسلمين وعامتهم.',
    narrator: { en: 'Tamim Al-Dari (RA)', ar: 'تميم الداري (رضي الله عنه)' },
    source: { en: "Hadith 7 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث السابع — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:7',
  },
  {
    arabic: 'إِنَّ اللَّهَ طَيِّبٌ لَا يَقْبَلُ إِلَّا طَيِّبًا',
    en: 'Allah is pure and accepts only what is pure. He commands the believers as He commanded the Messengers: "Eat of the good things and do righteous deeds."',
    ar: 'إن الله طيّب لا يقبل إلا طيباً، وإن الله أمر المؤمنين بما أمر به المرسلين، فقال: ﴿يَا أَيُّهَا الرُّسُلُ كُلُوا مِنَ الطَّيِّبَاتِ وَاعْمَلُوا صَالِحًا﴾.',
    narrator: { en: 'Abu Hurairah (RA)', ar: 'أبو هريرة (رضي الله عنه)' },
    source: { en: "Hadith 10 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث العاشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:10',
  },
  {
    arabic: 'دَعْ مَا يَرِيبُكَ إِلَى مَا لَا يَرِيبُكَ',
    en: 'Leave that which makes you doubt for that which does not make you doubt.',
    ar: 'دَعْ ما يَريبُك إلى ما لا يَريبُك.',
    narrator: { en: 'Al-Hassan ibn Ali (RA)', ar: 'الحسن بن علي (رضي الله عنه)' },
    source: { en: "Hadith 11 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الحادي عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:11',
  },
  {
    arabic: 'مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ تَرْكُهُ مَا لَا يَعْنِيهِ',
    en: "Part of the perfection of a person's Islam is his leaving that which does not concern him.",
    ar: 'من حسن إسلام المرء تركُه ما لا يعنيه.',
    narrator: { en: 'Abu Hurairah (RA)', ar: 'أبو هريرة (رضي الله عنه)' },
    source: { en: "Hadith 12 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثاني عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:12',
  },
  {
    arabic: 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ',
    en: 'None of you truly believes until he loves for his brother what he loves for himself.',
    ar: 'لا يؤمن أحدكم حتى يُحِبَّ لأخيه ما يحب لنفسه.',
    narrator: { en: 'Anas ibn Malik (RA)', ar: 'أنس بن مالك (رضي الله عنه)' },
    source: { en: "Hadith 13 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثالث عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:13',
  },
  {
    arabic: 'لَا تَغْضَبْ',
    en: 'Do not become angry. The man repeated his request several times and the Prophet ﷺ said: Do not become angry.',
    ar: 'قال رجل للنبي ﷺ: أوصني. قال: لا تغضب. فردّد مراراً، قال: لا تغضب.',
    narrator: { en: 'Abu Hurairah (RA)', ar: 'أبو هريرة (رضي الله عنه)' },
    source: { en: "Hadith 16 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث السادس عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:16',
  },
  {
    arabic: 'اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ',
    en: 'Fear Allah wherever you are; follow a bad deed with a good one to erase it; and treat people with good character.',
    ar: 'اتقِ الله حيثما كنت، وأتبِع السيئةَ الحسنةَ تمحُها، وخالقِ الناسَ بخُلُقٍ حسن.',
    narrator: { en: "Abu Dharr & Mu'adh ibn Jabal (RA)", ar: 'أبو ذر ومعاذ بن جبل (رضي الله عنهما)' },
    source: { en: "Hadith 18 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثامن عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:18',
  },
  {
    arabic: 'احْفَظِ اللَّهَ يَحْفَظْكَ',
    en: 'Be mindful of Allah and He will protect you. Be mindful of Allah and you will find Him before you. Know Allah in times of ease and He will know you in times of hardship.',
    ar: 'احفظ الله يحفظك، احفظ الله تجده تجاهك، تعرّف إلى الله في الرخاء يعرفك في الشدة.',
    narrator: { en: 'Abdullah ibn Abbas (RA)', ar: 'عبد الله بن عباس (رضي الله عنه)' },
    source: { en: "Hadith 19 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث التاسع عشر — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:19',
  },
  {
    arabic: 'الطُّهُورُ شَطْرُ الإِيمَانِ',
    en: 'Purity is half of faith. Alhamdulillah fills the scale. SubhanAllah and Alhamdulillah fill what is between the heavens and the earth.',
    ar: 'الطهور شطر الإيمان، والحمد لله تملأ الميزان، وسبحان الله والحمد لله تملآن ما بين السماوات والأرض.',
    narrator: { en: 'Abu Malik Al-Harith Al-Ash\'ari (RA)', ar: 'أبو مالك الحارث الأشعري (رضي الله عنه)' },
    source: { en: "Hadith 23 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الثالث والعشرون — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:23',
  },
  {
    arabic: 'مَنْ رَأَى مِنْكُمْ مُنْكَرًا فَلْيُغَيِّرْهُ بِيَدِهِ',
    en: 'Whoever among you sees an evil, let him change it with his hand; if he cannot, then with his tongue; if he cannot, then with his heart — and that is the weakest of faith.',
    ar: 'من رأى منكم منكراً فليغيّره بيده، فإن لم يستطع فبلسانه، فإن لم يستطع فبقلبه — وذلك أضعف الإيمان.',
    narrator: { en: 'Abu Sa\'eed Al-Khudri (RA)', ar: 'أبو سعيد الخدري (رضي الله عنه)' },
    source: { en: "Hadith 34 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الرابع والثلاثون — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:34',
  },
  {
    arabic: 'كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ',
    en: 'Be in the world as if you were a stranger or a traveler along a path — and count yourself among the people of the graves.',
    ar: 'كن في الدنيا كأنك غريب أو عابر سبيل — وعُدَّ نفسك من أصحاب القبور.',
    narrator: { en: 'Abdullah ibn Umar (RA)', ar: 'عبد الله بن عمر (رضي الله عنه)' },
    source: { en: "Hadith 40 — Al-Arba'een Al-Nawawiyyah", ar: 'الحديث الأربعون — الأربعون النووية' },
    url: 'https://sunnah.com/nawawi40:40',
  },
  {
    arabic: 'خَيْرُ النَّاسِ أَنْفَعُهُمْ لِلنَّاسِ',
    en: 'The best of people are those who are most beneficial to people.',
    ar: 'خير الناس أنفعهم للناس.',
    narrator: { en: 'Jabir ibn Abdullah (RA)', ar: 'جابر بن عبد الله (رضي الله عنه)' },
    source: { en: "Al-Mu'jam Al-Awsat — Al-Tabarani", ar: 'المعجم الأوسط — الطبراني' },
    url: 'https://sunnah.com/nawawi40',
  },
];

/* ─── Modules (bilingual) ─── */
const MODULES = [
  {
    num: '01',
    icon: '🌟',
    color: '#0b6e4f',
    title: { en: 'Aqeedah — Islamic Creed', ar: 'العقيدة الإسلامية' },
    duration: { en: '8 weeks', ar: '٨ أسابيع' },
    source: { en: "Islamic Creed Series — Dr. Umar Al-Ashqar", ar: 'العقيدة في ضوء الكتاب والسنة — د. عمر الأشقر' },
    sourceAr: 'العقيدة في ضوء الكتاب والسنة',
    topics: {
      en: ['Pillars of Faith (Arkan Al-Iman) — all six in depth', "Tawhid — Rububiyyah, Uluhiyyah, and Asma' wa Sifat", 'Belief in Angels, Books, and the Prophets', 'Belief in the Last Day and Divine Decree (Qadar)', 'Refutation of common theological misconceptions'],
      ar: ['أركان الإيمان الستة بالتفصيل', 'التوحيد — الربوبية والألوهية والأسماء والصفات', 'الإيمان بالملائكة والكتب والرسل', 'الإيمان باليوم الآخر والقدر خيره وشره', 'الرد على الشبهات العقدية الشائعة'],
    },
  },
  {
    num: '02',
    icon: '🕌',
    color: '#1a5fa0',
    title: { en: 'Fiqh — Islamic Jurisprudence', ar: 'الفقه الإسلامي' },
    duration: { en: '10 weeks', ar: '١٠ أسابيع' },
    source: { en: 'Al-Fiqh Al-Muyassar — King Fahd Complex', ar: 'الفقه الميسر في ضوء الكتاب والسنة — مجمع الملك فهد' },
    sourceAr: 'الفقه الميسر في ضوء الكتاب والسنة',
    topics: {
      en: ['Taharah — Wudu, Ghusl, and Tayammum in full', 'Salah — conditions, pillars, Sunnah acts, and invalidators', 'Sawm — Ramadan rules, Kaffarah, and voluntary fasts', 'Zakat — Nisab thresholds, types of wealth, valid recipients', 'Hajj & Umrah — pillars, obligations, and step-by-step rites'],
      ar: ['الطهارة — الوضوء والغسل والتيمم تفصيلاً', 'الصلاة — الشروط والأركان والسنن والمبطلات', 'الصيام — أحكام رمضان والكفارات والتطوع', 'الزكاة — النصاب وأنواع الأموال ومصارف الزكاة', 'الحج والعمرة — الأركان والواجبات والخطوات التفصيلية'],
    },
  },
  {
    num: '03',
    icon: '📖',
    color: '#7a3a8a',
    title: { en: 'Seerah — Prophetic Biography', ar: 'السيرة النبوية' },
    duration: { en: '8 weeks', ar: '٨ أسابيع' },
    source: { en: "The Sealed Nectar — Sheikh Safiur-Rahman Mubarakpuri", ar: 'الرحيق المختوم — الشيخ صفي الرحمن المباركفوري' },
    sourceAr: 'الرحيق المختوم',
    topics: {
      en: ['Pre-Islamic Arabia — the world before the Prophet ﷺ', 'Birth, childhood and early life of the Prophet ﷺ', 'The Meccan Period — first revelation, Dawah, and persecution', 'Hijrah to Madinah — the turning point of Islamic history', 'Battles, treaties, and the Opening of Mecca', "Farewell Hajj and the passing of the Prophet ﷺ"],
      ar: ['الجزيرة العربية قبل الإسلام — العالم قبل البعثة', 'مولد النبي ﷺ وطفولته وشبابه', 'المرحلة المكية — الوحي والدعوة والاضطهاد', 'الهجرة إلى المدينة — نقطة التحول في التاريخ الإسلامي', 'الغزوات والمعاهدات وفتح مكة المكرمة', 'حجة الوداع ووفاة النبي ﷺ'],
    },
  },
  {
    num: '04',
    icon: '📜',
    color: '#c07020',
    title: { en: 'Hadith & Ethics', ar: 'الحديث النبوي والأخلاق' },
    duration: { en: '6 weeks', ar: '٦ أسابيع' },
    source: { en: "Al-Arba'een Al-Nawawiyyah — Imam Al-Nawawi", ar: 'الأربعون النووية — الإمام النووي' },
    sourceAr: 'الأربعون النووية',
    topics: {
      en: ['40 core hadiths with full explanation and context', 'Introduction to Hadith sciences (Mustalah Al-Hadith)', "Islamic ethics (Akhlaq) from the Prophetic example ﷺ", 'Rights of Allah, rights of the self, rights of others', 'Practical application in modern daily life'],
      ar: ['٤٠ حديثاً أساسياً مع الشرح الكامل والسياق', 'مدخل إلى علوم الحديث (مصطلح الحديث)', 'الأخلاق الإسلامية من هديه ﷺ', 'حقوق الله وحقوق النفس وحقوق الآخرين', 'التطبيق العملي في الحياة اليومية المعاصرة'],
    },
  },
  {
    num: '05',
    icon: '✨',
    color: '#2a6a80',
    title: { en: 'Tafsir — Quranic Interpretation', ar: 'التفسير القرآني' },
    duration: { en: '8 weeks', ar: '٨ أسابيع' },
    source: { en: 'Al-Tafsir Al-Muyassar — King Fahd Complex', ar: 'التفسير الميسر — مجمع الملك فهد' },
    sourceAr: 'التفسير الميسر',
    topics: {
      en: ["Introduction to Tafsir sciences ('Ulum Al-Quran)", "Complete Tafsir of Juz 'Amma (An-Naba' to An-Nas)", 'Tafsir of key Meccan & Madinan Surahs', "Context of revelation (Asbab Al-Nuzul)", 'Linguistic analysis — Arabic roots & Quranic vocabulary'],
      ar: ['مدخل إلى علوم التفسير (علوم القرآن)', 'تفسير جزء عم كاملاً (من النبأ إلى الناس)', 'تفسير سور مكية ومدنية مختارة', 'أسباب النزول للآيات الرئيسية', 'التحليل اللغوي — جذور الكلمات والمفردات القرآنية'],
    },
  },
];

/* ─── Books (bilingual) ─── */
const BOOKS = [
  /* ── Aqeedah ── */
  {
    icon: '📗',
    title: 'Islamic Creed Series',
    ar: 'العقيدة في ضوء الكتاب والسنة',
    author: { en: 'Dr. Umar Sulayman Al-Ashqar', ar: 'د. عمر سليمان الأشقر' },
    module: { en: '🌟 Aqeedah module', ar: '🌟 وحدة العقيدة' },
    desc: {
      en: 'A comprehensive 9-volume series covering Islamic theology from its foundations — Tawhid, pillars of faith, belief in the unseen, and the Last Day. Used by Islamic universities worldwide for its scholarly depth.',
      ar: 'سلسلة شاملة من ٩ مجلدات تغطي علم العقيدة — التوحيد وأركان الإيمان والغيبيات واليوم الآخر. تُدرَّس في الجامعات الإسلامية حول العالم لرصانتها العلمية.',
    },
    topics: {
      en: ['Tawhid — all three categories in depth', 'Six pillars of Faith fully explained', 'Al-Qadar (divine decree)', 'Refutation of deviant beliefs'],
      ar: ['التوحيد — أنواعه الثلاثة بالتفصيل', 'أركان الإيمان الستة شرحاً وافياً', 'القضاء والقدر', 'الرد على الانحرافات العقدية'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  /* ── Fiqh ── */
  {
    icon: '📘',
    title: 'Al-Fiqh Al-Muyassar',
    ar: 'الفقه الميسر في ضوء الكتاب والسنة',
    author: { en: 'King Fahd Glorious Quran Printing Complex', ar: 'مجمع الملك فهد لطباعة المصحف الشريف' },
    module: { en: '🕌 Fiqh module — Primary source', ar: '🕌 وحدة الفقه — المصدر الأساسي' },
    desc: {
      en: 'A 2-volume authoritative work covering all pillars of Islamic worship — Taharah, Salah, Sawm, Zakat, and Hajj — compiled by scholars of the King Fahd Complex from Quran and authentic Sunnah.',
      ar: 'عمل علمي معتمد من مجلدين يغطي أركان العبادة الإسلامية — الطهارة والصلاة والصيام والزكاة والحج — أعده علماء مجمع الملك فهد من القرآن والسنة الصحيحة.',
    },
    topics: {
      en: ['Taharah — Wudu, Ghusl, Tayammum', 'Salah — all conditions, pillars, and nullifiers', 'Sawm — Ramadan, Kaffarah, voluntary fasts', 'Zakat thresholds & Hajj rites'],
      ar: ['الطهارة — الوضوء والغسل والتيمم', 'الصلاة — شروطها وأركانها ومبطلاتها', 'الصيام — رمضان والكفارات والتطوع', 'نصاب الزكاة ومناسك الحج'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  {
    icon: '📙',
    title: 'Bulugh Al-Maram',
    ar: 'بلوغ المرام من أدلة الأحكام',
    author: { en: 'Imam Ibn Hajar Al-Asqalani (d. 852 AH)', ar: 'الإمام ابن حجر العسقلاني (ت ٨٥٢هـ)' },
    module: { en: '🕌 Fiqh module — Supplementary', ar: '🕌 وحدة الفقه — مصدر مكمّل' },
    desc: {
      en: 'A landmark Fiqh hadith collection containing ~1,432 hadiths organised into 16 books covering all aspects of Islamic jurisprudence — from purification to business transactions, marriage, and criminal law.',
      ar: 'مجموعة حديثية فقهية بارزة تحتوي ~١٤٣٢ حديثاً مرتبة في ١٦ كتاباً تغطي جميع أبواب الفقه الإسلامي — من الطهارة إلى المعاملات والنكاح والحدود.',
    },
    topics: {
      en: ['16 books covering all Fiqh areas', 'Purification, Prayer, Fasting, Zakat, Hajj', 'Business transactions & marriage', 'Criminal law & judgements'],
      ar: ['١٦ كتاباً تغطي جميع أبواب الفقه', 'الطهارة والصلاة والصيام والزكاة والحج', 'المعاملات والنكاح', 'الحدود والقضاء'],
    },
    link: 'https://sunnah.com/bulugh',
    linkLabel: { en: 'Read online — Sunnah.com', ar: 'اقرأ أونلاين — Sunnah.com' },
  },
  /* ── Seerah ── */
  {
    icon: '📕',
    title: 'The Sealed Nectar (Ar-Raheeq Al-Makhtum)',
    ar: 'الرحيق المختوم',
    author: { en: 'Sheikh Safiur-Rahman Mubarakpuri', ar: 'الشيخ صفي الرحمن المباركفوري' },
    module: { en: '📖 Seerah module — Primary source', ar: '📖 وحدة السيرة — المصدر الأساسي' },
    desc: {
      en: "Winner of the World Muslim League's first prize for Seerah literature. The most comprehensive one-volume biography of the Prophet ﷺ — from pre-Islamic Arabia to his passing — considered the gold standard of modern Seerah.",
      ar: 'الفائز بالجائزة الأولى في مسابقة رابطة العالم الإسلامي. أشمل سيرة في مجلد واحد للنبي ﷺ من عصر ما قبل الإسلام حتى وفاته — يُعد المعيار الذهبي لكتب السيرة الحديثة.',
    },
    topics: {
      en: ['Pre-Islamic Arabia (Al-Jahiliyyah)', 'Meccan & Madinan periods in full', 'All major Ghazwat and expeditions', 'Farewell Hajj & final days of the Prophet ﷺ'],
      ar: ['الجزيرة العربية قبل الإسلام (الجاهلية)', 'العهدان المكي والمدني كاملاً', 'الغزوات والسرايا الكبرى', 'حجة الوداع وآخر أيام النبي ﷺ'],
    },
    link: null,
    linkLabel: { en: 'Provided in class', ar: 'يُوفَّر في الحصة' },
  },
  {
    icon: '📔',
    title: 'Ash-Shama\'il Al-Muhammadiyah',
    ar: 'الشمائل المحمدية',
    author: { en: 'Imam Al-Tirmidhi (d. 279 AH)', ar: 'الإمام الترمذي (ت ٢٧٩هـ)' },
    module: { en: '📖 Seerah module — Supplementary', ar: '📖 وحدة السيرة — مصدر مكمّل' },
    desc: {
      en: 'A collection of 417 hadiths across 56 chapters documenting the personal characteristics, daily habits, appearance, worship, and character of the Prophet ﷺ in intimate detail.',
      ar: 'مجموعة من ٤١٧ حديثاً في ٥٦ باباً تُوثِّق صفات النبي ﷺ الشخصية وعاداته اليومية وهيئته وعبادته وأخلاقه بتفصيل دقيق.',
    },
    topics: {
      en: ['Physical description & appearance of the Prophet ﷺ', 'Clothing, food and daily habits', 'Worship, prayer and night vigils', 'Character, laughter and social conduct'],
      ar: ['الصفات الجسمية وهيئة النبي ﷺ', 'اللباس والطعام والعادات اليومية', 'العبادة والصلاة وقيام الليل', 'الأخلاق والضحك والتعامل مع الناس'],
    },
    link: 'https://sunnah.com/shamail',
    linkLabel: { en: 'Read online — Sunnah.com (417 hadiths)', ar: 'اقرأ أونلاين — Sunnah.com (٤١٧ حديثاً)' },
  },
  /* ── Hadith & Ethics ── */
  {
    icon: '📒',
    title: "Al-Arba'een Al-Nawawiyyah",
    ar: 'الأربعون النووية',
    author: { en: 'Imam Yahya ibn Sharaf Al-Nawawi (d. 676 AH)', ar: 'الإمام يحيى بن شرف النووي (ت ٦٧٦هـ)' },
    module: { en: '📜 Hadith & Ethics — Primary source', ar: '📜 وحدة الحديث والأخلاق — المصدر الأساسي' },
    desc: {
      en: '42 hadiths chosen by Imam Al-Nawawi as the most comprehensive summary of Islamic teachings. Every single hadith is considered a foundation of the religion — the essential starting point for every Muslim student.',
      ar: '٤٢ حديثاً اختارها الإمام النووي لأنها أشمل ملخص للتعاليم الإسلامية. كل حديث ركيزة أساسية في الدين — نقطة البداية لكل طالب مسلم.',
    },
    topics: {
      en: ['42 core hadiths — the pillars of Islam & Iman', 'Ihsan — worshipping Allah as though you see Him', 'Halal, Haram, and doubtful matters', 'Anger, sincerity, and daily conduct'],
      ar: ['٤٢ حديثاً أساسياً — ركائز الإسلام والإيمان', 'الإحسان — عبادة الله كأنك تراه', 'الحلال والحرام والمشتبهات', 'الغضب والإخلاص والسلوك اليومي'],
    },
    link: 'https://sunnah.com/nawawi40',
    linkLabel: { en: 'Read all 42 hadiths — Sunnah.com', ar: 'اقرأ الأحاديث الـ ٤٢ — Sunnah.com' },
  },
  {
    icon: '📓',
    title: 'Riyad As-Salihin',
    ar: 'رياض الصالحين',
    author: { en: 'Imam Al-Nawawi (d. 676 AH)', ar: 'الإمام النووي (ت ٦٧٦هـ)' },
    module: { en: '📜 Hadith & Ethics — Supplementary', ar: '📜 وحدة الحديث والأخلاق — مصدر مكمّل' },
    desc: {
      en: 'The most widely read hadith collection for daily Islamic living — nearly 1,900 hadiths across 20 chapters covering manners, worship, social conduct, and the prohibited. An essential daily companion.',
      ar: 'أكثر مجموعات الحديث قراءةً للحياة الإسلامية اليومية — قرابة ١٩٠٠ حديثاً في ٢٠ باباً تغطي الآداب والعبادة والمعاملات والمحظورات. رفيق يومي لا غنى عنه.',
    },
    topics: {
      en: ['Good manners & social etiquette (1,900 hadiths)', 'Etiquette of eating, sleeping, travel', 'Visiting the sick & consolation', 'Prohibited actions & repentance'],
      ar: ['الآداب والأخلاق الاجتماعية (١٩٠٠ حديثاً)', 'آداب الطعام والنوم والسفر', 'عيادة المريض والتعزية', 'المحظورات والتوبة'],
    },
    link: 'https://sunnah.com/riyadussalihin',
    linkLabel: { en: 'Read online — Sunnah.com (1,900 hadiths)', ar: 'اقرأ أونلاين — Sunnah.com (١٩٠٠ حديثاً)' },
  },
  {
    icon: '📋',
    title: 'Al-Adab Al-Mufrad',
    ar: 'الأدب المفرد',
    author: { en: 'Imam Al-Bukhari (d. 256 AH)', ar: 'الإمام البخاري (ت ٢٥٦هـ)' },
    module: { en: '📜 Hadith & Ethics — Supplementary', ar: '📜 وحدة الحديث والأخلاق — مصدر مكمّل' },
    desc: {
      en: "Imam Al-Bukhari's dedicated collection of 1,322 hadiths focused entirely on Islamic conduct and character — family relations, neighbours, kindness, anger, greetings, and everyday behaviour.",
      ar: 'مجموعة الإمام البخاري المخصصة للأخلاق والآداب الإسلامية — ١٣٢٢ حديثاً تتناول حقوق الأسرة والجيران واللطف والغضب والتحية والسلوك اليومي.',
    },
    topics: {
      en: ['1,322 hadiths — 57 chapters on conduct', 'Parents, children & family rights', 'Neighbours, generosity & good character', 'Greetings, anger & social interaction'],
      ar: ['١٣٢٢ حديثاً — ٥٧ باباً في الأخلاق', 'حقوق الوالدين والأبناء والأسرة', 'حقوق الجيران والكرم وحسن الخلق', 'التحية والغضب والتعامل الاجتماعي'],
    },
    link: 'https://sunnah.com/adab',
    linkLabel: { en: 'Read online — Sunnah.com (1,322 hadiths)', ar: 'اقرأ أونلاين — Sunnah.com (١٣٢٢ حديثاً)' },
  },
  /* ── Tafsir ── */
  {
    icon: '✨',
    title: 'Al-Tafsir Al-Muyassar',
    ar: 'التفسير الميسر',
    author: { en: 'King Fahd Glorious Quran Printing Complex', ar: 'مجمع الملك فهد لطباعة المصحف الشريف' },
    module: { en: '✨ Tafsir module — Primary source', ar: '✨ وحدة التفسير — المصدر الأساسي' },
    desc: {
      en: "A scholarly yet accessible single-volume Tafsir of the complete Quran. Covers the meaning of every verse with clarity grounded in classical Islamic sources — ideal for students beginning Tafsir studies.",
      ar: 'تفسير موثوق وميسر للقرآن الكريم كاملاً في مجلد واحد. يشرح معنى كل آية بوضوح مستنداً إلى المصادر الإسلامية الكلاسيكية — مثالي للطلاب المبتدئين في التفسير.',
    },
    topics: {
      en: ['Complete Quran Tafsir in 1 volume', "Juz 'Amma (An-Naba' to An-Nas) studied fully in class", "Asbab Al-Nuzul for key verses", 'Classical Tafsir methodology explained'],
      ar: ['تفسير القرآن كاملاً في مجلد واحد', 'جزء عم (النبأ إلى الناس) يُدرَّس كاملاً في الحصص', 'أسباب النزول للآيات الرئيسية', 'منهج التفسير الكلاسيكي مشروحاً'],
    },
    link: 'https://quran.com',
    linkLabel: { en: 'Read Quran & Tafsir online — Quran.com', ar: 'اقرأ القرآن وتفسيره أونلاين — Quran.com' },
  },
];

const LEARN = {
  en: [
    "Core Aqeedah — Tawhid, all six pillars of faith, and Islamic theology",
    "Practical Fiqh — Taharah, Salah, Sawm, Zakat, and Hajj",
    "Complete Seerah — life of the Prophet ﷺ from birth to passing",
    "40 Hadiths of Imam Al-Nawawi with full explanation & daily application",
    "Tafsir of Juz 'Amma and selected Surahs with linguistic depth",
    "Islamic ethics (Akhlaq) derived from the Prophetic example",
    "Each subject taught from its authentic, primary Islamic source",
    "Lessons available in English, Arabic, Italian, French, German, or Spanish",
  ],
  ar: [
    "العقيدة الأساسية — التوحيد وأركان الإيمان الستة وعلم الكلام الإسلامي",
    "الفقه العملي — الطهارة والصلاة والصيام والزكاة والحج",
    "السيرة النبوية كاملة — من مولد النبي ﷺ حتى وفاته",
    "أربعون حديثاً للإمام النووي مع الشرح الكامل والتطبيق اليومي",
    "تفسير جزء عم وسور مختارة مع التحليل اللغوي",
    "الأخلاق الإسلامية المستمدة من سنة النبي ﷺ",
    "كل مادة تُدرَّس من مصدرها الإسلامي الأصيل",
    "الحصص متاحة بالعربية والإنجليزية والإيطالية والفرنسية والألمانية والإسبانية",
  ],
};

const FOR = {
  en: [
    { icon: '🌱', label: 'New Muslims who want a solid, structured Islamic foundation' },
    { icon: '👨‍👩‍👧', label: 'Families wanting to educate children in authentic Islamic knowledge' },
    { icon: '🌍', label: 'Western Muslims who want to learn Islam in their own language' },
    { icon: '📚', label: 'Anyone who wants source-based Islamic education — not just opinions' },
  ],
  ar: [
    { icon: '🌱', label: 'المسلمون الجدد الذين يريدون أساساً إسلامياً راسخاً ومنظماً' },
    { icon: '👨‍👩‍👧', label: 'الأسر التي تريد تعليم أطفالها العلم الإسلامي الأصيل' },
    { icon: '🌍', label: 'مسلمو الغرب الذين يريدون تعلم الإسلام بلغتهم الخاصة' },
    { icon: '📚', label: 'كل من يريد تعليماً إسلامياً مبنياً على المصادر لا مجرد آراء' },
  ],
};

const PERKS = {
  en: ['1-on-1 with certified scholar', 'Choose your starting module', 'Available in 6 languages', 'Flexible weekly schedule', 'Zoom / Skype / Google Meet', 'Cancel anytime'],
  ar: ['فردي مع عالم معتمد', 'اختر وحدتك الأولى', 'متاح بـ ٦ لغات', 'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت', 'إلغاء في أي وقت'],
};

/* ─── Book card (expandable) ─── */
function BookCard({ book, lang }) {
  const [open, setOpen] = useState(false);
  const isAr = lang === 'ar';
  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          <strong>{book.title}</strong>
          <span className="cl__book-ar" dir="rtl">{book.ar}</span>
          <span className="cl__book-author">{isAr ? book.author.ar : book.author.en}</span>
          <span className="cl__book-note">{isAr ? book.module.ar : book.module.en}</span>
        </div>
        <span className="cl__book-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="cl__book-body">
          <p className="cl__book-desc">{isAr ? book.desc.ar : book.desc.en}</p>
          <ul className="cl__book-topics">
            {(isAr ? book.topics.ar : book.topics.en).map((t) => <li key={t}>{t}</li>)}
          </ul>
          {book.link
            ? <a href={book.link} target="_blank" rel="noreferrer" className="cl__book-link">{isAr ? book.linkLabel.ar : book.linkLabel.en} ↗</a>
            : <span className="cl__book-link cl__book-link--muted">📚 {isAr ? book.linkLabel.ar : book.linkLabel.en}</span>
          }
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */
export default function CourseIslamicStudies() {
  const navigate = useNavigate();
  const { lang }  = useLang();
  const ui        = COURSE_UI[lang] || COURSE_UI.en;
  const isAr      = lang === 'ar';
  const [openModule, setOpenModule] = useState(null);

  const hadith = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    return HADITHS[dayOfYear % HADITHS.length];
  }, []);

  useSEO({
    title: isAr ? 'دورة الدراسات الإسلامية — أكاديمية الرحمة' : 'Islamic Studies Course — AL-Rahma Academy',
    description: isAr
      ? 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — ٥ وحدات يدرّسها علماء معتمدون بلغتك.'
      : 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — 5 structured modules taught by certified scholars in your own language.',
  });

  const learnList = isAr ? LEARN.ar : LEARN.en;
  const forList   = isAr ? FOR.ar   : FOR.en;
  const perks     = isAr ? PERKS.ar : PERKS.en;

  return (
    <>
      <Header />
      <main dir={ui.dir}>
        {/* Hero */}
        <section className="cl__hero" style={{ background: 'linear-gradient(145deg,#1e0a30,#7a3a8a)' }}>
          <div className="container cl__hero-inner">
            <span className="cl__hero-badge">🕌 {isAr ? '٥ وحدات دراسية متكاملة' : '5 Complete Modules'}</span>
            <h1 className="cl__hero-title">{isAr ? 'الدراسات الإسلامية' : 'Islamic Studies'}</h1>
            <p className="cl__hero-sub">
              {isAr
                ? 'منهج شامل مبني على المصادر يغطي العقيدة والفقه والسيرة والحديث والتفسير — يدرّسه علماء معتمدون بلغتك الخاصة.'
                : 'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — taught by certified scholars in your own language.'
              }
            </p>
            <div className="cl__hero-actions">
              <button className="btn btn--gold btn--lg" onClick={() => navigate('/enroll?course=islamic-studies')}>
                {ui.bookTrial}
              </button>
              <Link to="/teachers" className="btn btn--ghost-white">{ui.viewTeachers}</Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="cl__stats" style={{ background: '#1e0a30' }}>
          <div className="container cl__stats-inner">
            <div className="cl__stat"><strong>{isAr ? '٥' : '5'}</strong><span>{isAr ? 'وحدات دراسية' : 'Subject Modules'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'جميع المستويات' : 'All Levels'}</strong><span>{isAr ? 'مبتدئ ← متقدم' : 'Beginner → Advanced'}</span></div>
            <div className="cl__stat"><strong>{isAr ? 'فردي' : '1-on-1'}</strong><span>{isAr ? 'حصص خاصة' : 'Private Lessons'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٤٠ أسبوعاً' : '40 Weeks'}</strong><span>{isAr ? 'البرنامج الكامل' : 'Full Program'}</span></div>
            <div className="cl__stat"><strong>{isAr ? '٦ لغات' : '6 Lang'}</strong><span>{isAr ? 'لغات التدريس' : 'Instruction Languages'}</span></div>
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

            {/* Hadith of the Day */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.hadithDay}</h2>
              <div className="cl__hadith-card">
                <p className="cl__hadith-arabic" dir="rtl">{hadith.arabic}</p>
                <blockquote className="cl__hadith-text">
                  {isAr ? hadith.ar : hadith.en}
                </blockquote>
                <div className="cl__hadith-meta">
                  <span className="cl__hadith-narrator">— {isAr ? hadith.narrator.ar : hadith.narrator.en}</span>
                  <span className="cl__hadith-source">{isAr ? hadith.source.ar : hadith.source.en}</span>
                </div>
                {hadith.url && (
                  <a href={hadith.url} target="_blank" rel="noreferrer" className="cl__hadith-link">
                    {isAr ? 'اقرأ الحديث كاملاً — Sunnah.com ↗' : 'Read full hadith — Sunnah.com ↗'}
                  </a>
                )}
              </div>
            </Reveal>

            {/* Modules */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.modules}</h2>
              <div className="cl__stages">
                {MODULES.map((m, i) => (
                  <div
                    key={m.num}
                    className={`cl__stage${openModule === i ? ' open' : ''}`}
                    style={{ '--stage-color': m.color }}
                  >
                    <button className="cl__stage-header" onClick={() => setOpenModule(openModule === i ? null : i)}>
                      <span className="cl__stage-num" style={{ background: m.color }}>{m.icon}</span>
                      <div className="cl__stage-meta">
                        <strong>{m.num}. {isAr ? m.title.ar : m.title.en}</strong>
                        <span>{isAr ? m.duration.ar : m.duration.en}</span>
                      </div>
                      <span className="cl__stage-source cl__stage-source--ar" dir="rtl">{m.sourceAr}</span>
                      <span className="cl__stage-chevron">{openModule === i ? '▲' : '▼'}</span>
                    </button>
                    {openModule === i && (
                      <div className="cl__stage-body">
                        <p className="cl__stage-author">📚 {isAr ? m.source.ar : m.source.en}</p>
                        <ul className="cl__stage-points">
                          {(isAr ? m.topics.ar : m.topics.en).map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Books */}
            <Reveal className="cl__section">
              <h2 className="cl__section-title">{ui.authSources}</h2>
              <div className="cl__books">
                {BOOKS.map((b) => <BookCard key={b.title} book={b} lang={lang} />)}
              </div>
            </Reveal>

            {/* Who for */}
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
              <div className="cl__enroll-card-top" style={{ background: 'linear-gradient(145deg,#1e0a30,#7a3a8a)' }}>
                <span className="cl__enroll-icon">🕌</span>
                <p className="cl__enroll-title">{isAr ? 'الدراسات الإسلامية' : 'Islamic Studies'}</p>
                <p className="cl__enroll-sub">{isAr ? '٥ وحدات · جميع المستويات' : '5 Modules · All Levels'}</p>
              </div>
              <div className="cl__enroll-body">
                <p className="cl__enroll-trial">{ui.trialNote}</p>
                <ul className="cl__enroll-perks">
                  {perks.map((p) => <li key={p}>✓ {p}</li>)}
                </ul>
                <button type="button" className="btn btn--gold btn--block" onClick={() => navigate('/enroll?course=islamic-studies')}>
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
