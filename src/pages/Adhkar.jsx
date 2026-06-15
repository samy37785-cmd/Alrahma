import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import useSEO from '../hooks/useSEO';

/* ══════════════════════════════════════════════════════════════════
   ADHKAR DATA — based on Hisnul Muslim (حصن المسلم)
   ══════════════════════════════════════════════════════════════════ */
const ADHKAR = {
  sabah: {
    title: 'أذكار الصباح',
    icon: '🌅',
    color: '#e07820',
    items: [
      {
        id: 'sb1',
        ar: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ',
        count: 1,
        source: 'مسلم',
        fadl: 'دعاء الصباح للحفظ من شر اليوم',
      },
      {
        id: 'sb2',
        ar: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
        count: 1,
        source: 'الترمذي',
        fadl: 'ذكر الصباح بالإقرار بنعمة الله',
      },
      {
        id: 'sb3',
        ar: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ',
        count: 1,
        source: 'البخاري',
        fadl: 'سيد الاستغفار — من قاله في الصباح ومات في يومه دخل الجنة',
      },
      {
        id: 'sb4',
        ar: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ',
        count: 3,
        source: 'أبو داود',
        fadl: 'طلب العافية في الجسد والحواس',
      },
      {
        id: 'sb5',
        ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي، وَآمِنْ رَوْعَاتِي',
        count: 1,
        source: 'أبو داود وابن ماجه',
        fadl: 'جامع لخيري الدنيا والآخرة',
      },
      {
        id: 'sb6',
        ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
        count: 3,
        source: 'مسلم',
        fadl: 'من قالها ثلاثاً لم تضره حمة تلك الليلة',
      },
      {
        id: 'sb7',
        ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        count: 3,
        source: 'أبو داود والترمذي',
        fadl: 'من قالها ثلاثاً لم يضره شيء',
      },
      {
        id: 'sb8',
        ar: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
        count: 3,
        source: 'أبو داود والترمذي',
        fadl: 'حق على الله أن يُرضيه يوم القيامة',
      },
      {
        id: 'sb9',
        ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
        count: 100,
        source: 'مسلم',
        fadl: 'من قالها مئة مرة غُفرت ذنوبه ولو كانت مثل زبد البحر',
      },
      {
        id: 'sb10',
        ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
        count: 10,
        source: 'الترمذي والنسائي',
        fadl: 'عدلت من قالها عشر مرات بعتق أربع رقاب من ولد إسماعيل',
      },
    ],
  },

  masaa: {
    title: 'أذكار المساء',
    icon: '🌙',
    color: '#1a3a5c',
    items: [
      {
        id: 'ms1',
        ar: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ',
        count: 1,
        source: 'مسلم',
        fadl: 'دعاء المساء للحفظ من شر الليلة',
      },
      {
        id: 'ms2',
        ar: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
        count: 1,
        source: 'الترمذي',
        fadl: 'ذكر المساء بالإقرار بنعمة الله',
      },
      {
        id: 'ms3',
        ar: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ',
        count: 1,
        source: 'البخاري',
        fadl: 'سيد الاستغفار مساءً — من قاله في المساء ومات في ليلته دخل الجنة',
      },
      {
        id: 'ms4',
        ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
        count: 3,
        source: 'مسلم',
        fadl: 'حماية من شر الليل',
      },
      {
        id: 'ms5',
        ar: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ',
        count: 3,
        source: 'أبو داود',
        fadl: 'طلب العافية في الجسد والحواس مساءً',
      },
      {
        id: 'ms6',
        ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        count: 3,
        source: 'أبو داود والترمذي',
        fadl: 'من قالها ثلاثاً في المساء لم يصبه بلاء',
      },
    ],
  },

  nawm: {
    title: 'أذكار النوم',
    icon: '😴',
    color: '#4a2c7a',
    items: [
      {
        id: 'nw1',
        ar: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
        count: 1,
        source: 'البخاري',
        fadl: 'يُقال عند النوم',
      },
      {
        id: 'nw2',
        ar: 'اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ',
        count: 3,
        source: 'أبو داود والترمذي',
        fadl: 'حفظاً من عذاب القبر',
      },
      {
        id: 'nw3',
        ar: 'سُبْحَانَ اللَّهِ ، الْحَمْدُ لِلَّهِ ، اللَّهُ أَكْبَرُ',
        count: '٣٣ + ٣٣ + ٣٤',
        source: 'البخاري ومسلم',
        fadl: 'أفضل من خادم — قال النبي ﷺ هو خير مما سألتما',
      },
      {
        id: 'nw4',
        ar: 'اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'من مات في ليلته مات على الفطرة',
      },
      {
        id: 'nw5',
        ar: 'قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ',
        count: 3,
        source: 'أبو داود والترمذي',
        fadl: 'كافية من كل شيء — قراءتها مع المعوذتين ثلاثاً',
      },
    ],
  },

  istiqath: {
    title: 'أذكار الاستيقاظ',
    icon: '☀️',
    color: '#d4af37',
    items: [
      {
        id: 'iq1',
        ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
        count: 1,
        source: 'البخاري',
        fadl: 'أول ما يقوله المسلم عند الاستيقاظ',
      },
      {
        id: 'iq2',
        ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ الْعَلِيِّ الْعَظِيمِ',
        count: 1,
        source: 'البخاري',
        fadl: 'من قالها ثم دعا استُجيب له',
      },
      {
        id: 'iq3',
        ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ هَذَا الْيَوْمِ: فَتْحَهُ وَنَصْرَهُ وَنُورَهُ وَبَرَكَتَهُ وَهُدَاهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِيهِ وَشَرِّ مَا بَعْدَهُ',
        count: 1,
        source: 'أبو داود',
        fadl: 'طلب خيرات اليوم ودرء شروره',
      },
    ],
  },

  baadSalah: {
    title: 'أذكار بعد الصلاة',
    icon: '🤲',
    color: '#0b6e4f',
    items: [
      {
        id: 'bs1',
        ar: 'أَسْتَغْفِرُ اللَّهَ',
        count: 3,
        source: 'مسلم',
        fadl: 'الاستغفار بعد كل صلاة',
      },
      {
        id: 'bs2',
        ar: 'اللَّهُمَّ أَنْتَ السَّلَامُ، وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ',
        count: 1,
        source: 'مسلم',
        fadl: 'يُقال عقب كل صلاة',
      },
      {
        id: 'bs3',
        ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، اللَّهُمَّ لَا مَانِعَ لِمَا أَعْطَيْتَ، وَلَا مُعْطِيَ لِمَا مَنَعْتَ، وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'يُقال في دبر كل صلاة مكتوبة',
      },
      {
        id: 'bs4',
        ar: 'سُبْحَانَ اللَّهِ ، الْحَمْدُ لِلَّهِ ، اللَّهُ أَكْبَرُ',
        count: '٣٣ + ٣٣ + ٣٤',
        source: 'البخاري ومسلم',
        fadl: 'التسبيح والتحميد والتكبير بعد الصلاة — يُتمّ المئة بلا إله إلا الله',
      },
      {
        id: 'bs5',
        ar: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ',
        count: 1,
        source: 'أبو داود والنسائي',
        fadl: 'يُقال دبر كل صلاة — أوصى به النبي ﷺ معاذ بن جبل',
      },
      {
        id: 'bs6',
        ar: 'آيَةُ الْكُرْسِيِّ: اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ',
        count: 1,
        source: 'النسائي والطبراني',
        fadl: 'من قرأها دبر كل صلاة لم يمنعه من دخول الجنة إلا أن يموت',
      },
    ],
  },

  hayat: {
    title: 'أذكار الحياة اليومية',
    icon: '🏠',
    color: '#8b4513',
    items: [
      {
        id: 'hy1',
        ar: 'بِسْمِ اللَّهِ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'يُقال عند دخول المنزل — ذكر الله بين الشيطان وأهل البيت',
        context: 'دخول المنزل',
      },
      {
        id: 'hy2',
        ar: 'بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا، وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا',
        count: 1,
        source: 'أبو داود',
        fadl: 'يُقال عند دخول المنزل والخروج منه',
        context: 'دخول وخروج المنزل',
      },
      {
        id: 'hy3',
        ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'يُقال عند دخول الخلاء',
        context: 'دخول الخلاء',
      },
      {
        id: 'hy4',
        ar: 'غُفْرَانَكَ',
        count: 1,
        source: 'أبو داود والترمذي',
        fadl: 'يُقال عند الخروج من الخلاء',
        context: 'الخروج من الخلاء',
      },
      {
        id: 'hy5',
        ar: 'بِسْمِ اللَّهِ، اللَّهُمَّ بَارِكْ لَنَا فِيمَا رَزَقْتَنَا، وَقِنَا عَذَابَ النَّارِ',
        count: 1,
        source: 'ابن السني',
        fadl: 'يُقال قبل الطعام',
        context: 'قبل الطعام',
      },
      {
        id: 'hy6',
        ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ',
        count: 1,
        source: 'أبو داود والترمذي',
        fadl: 'يُقال بعد الطعام',
        context: 'بعد الطعام',
      },
      {
        id: 'hy7',
        ar: 'بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
        count: 1,
        source: 'أبو داود والترمذي',
        fadl: 'يُقال عند الخروج من المنزل — يُقال له: هُديتَ وكُفيتَ ووُقيتَ',
        context: 'الخروج من المنزل',
      },
      {
        id: 'hy8',
        ar: 'اللَّهُمَّ اجْعَلْ فِي قَلْبِي نُورًا، وَفِي لِسَانِي نُورًا، وَفِي سَمْعِي نُورًا، وَفِي بَصَرِي نُورًا',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'دعاء دخول المسجد',
        context: 'دخول المسجد',
      },
    ],
  },

  munasabat: {
    title: 'أذكار المناسبات',
    icon: '🌿',
    color: '#1a5fa0',
    items: [
      {
        id: 'mn1',
        ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا وَخَيْرَ مَا فِيهَا وَخَيْرَ مَا أُرْسِلَتْ بِهِ، وَأَعُوذُ بِكَ مِنْ شَرِّهَا وَشَرِّ مَا فِيهَا وَشَرِّ مَا أُرْسِلَتْ بِهِ',
        count: 1,
        source: 'مسلم',
        fadl: 'دعاء الريح',
        context: 'عند هبوب الريح',
      },
      {
        id: 'mn2',
        ar: 'اللَّهُمَّ اسْقِنَا غَيْثًا مُغِيثًا مَرِيئًا مَرِيعًا، نَافِعًا غَيْرَ ضَارٍّ، عَاجِلًا غَيْرَ آجِلٍ',
        count: 1,
        source: 'أبو داود',
        fadl: 'دعاء الاستسقاء',
        context: 'عند المطر',
      },
      {
        id: 'mn3',
        ar: 'مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'يُقال بعد المطر',
        context: 'بعد المطر',
      },
      {
        id: 'mn4',
        ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ',
        count: 1,
        source: 'البخاري',
        fadl: 'دعاء الهم والحزن',
        context: 'عند الهم والحزن',
      },
      {
        id: 'mn5',
        ar: 'لَا إِلَهَ إِلَّا اللَّهُ الْعَظِيمُ الْحَلِيمُ، لَا إِلَهَ إِلَّا اللَّهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لَا إِلَهَ إِلَّا اللَّهُ رَبُّ السَّمَاوَاتِ وَرَبُّ الْأَرْضِ وَرَبُّ الْعَرْشِ الْكَرِيمِ',
        count: 1,
        source: 'البخاري ومسلم',
        fadl: 'دعاء الكرب والشدة',
        context: 'عند الكرب',
      },
      {
        id: 'mn6',
        ar: 'اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ، اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاقْدِرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ، وَاقْدِرْ لِي الْخَيْرَ حَيْثُ كَانَ ثُمَّ أَرْضِنِي بِهِ',
        count: 1,
        source: 'البخاري',
        fadl: 'دعاء صلاة الاستخارة — يُذكر الأمر بدل "هذا الأمر"',
        context: 'الاستخارة',
      },
      {
        id: 'mn7',
        ar: 'اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ',
        count: 1,
        source: 'مسلم',
        fadl: 'دعاء السفر',
        context: 'عند السفر',
      },
      {
        id: 'mn8',
        ar: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ',
        count: 1,
        source: 'أبو داود والترمذي',
        fadl: 'يُقال عند ركوب السيارة والطائرة والوسيلة',
        context: 'ركوب المركبة',
      },
    ],
  },

  ruqya: {
    title: 'الرقية الشرعية',
    icon: '🛡️',
    color: '#6b2737',
    items: [
      {
        id: 'rq1',
        ar: 'بِسْمِ اللَّهِ أَرْقِيكَ، مِنْ كُلِّ شَيْءٍ يُؤْذِيكَ، مِنْ شَرِّ كُلِّ نَفْسٍ أَوْ عَيْنِ حَاسِدٍ، اللَّهُ يَشْفِيكَ، بِسْمِ اللَّهِ أَرْقِيكَ',
        count: 3,
        source: 'مسلم',
        fadl: 'رقية النبي ﷺ',
        context: 'الرقية',
      },
      {
        id: 'rq2',
        ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّةِ، مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ، وَمِنْ كُلِّ عَيْنٍ لَامَّةٍ',
        count: 3,
        source: 'البخاري',
        fadl: 'رقية الحسن والحسين — كان النبي ﷺ يرقيهما بها',
        context: 'التعوذ',
      },
      {
        id: 'rq3',
        ar: 'اللَّهُمَّ رَبَّ النَّاسِ، أَذْهِبِ الْبَأْسَ، وَاشْفِ، أَنْتَ الشَّافِي لَا شِفَاءَ إِلَّا شِفَاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا',
        count: 3,
        source: 'البخاري ومسلم',
        fadl: 'رقية المريض',
        context: 'عيادة المريض',
      },
    ],
  },
};

const CATEGORY_KEYS = Object.keys(ADHKAR);

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function Adhkar() {
  useSEO({
    title: 'الأذكار والأدعية — Al-Rahma Academy',
    description: 'مكتبة متكاملة للأذكار اليومية من حصن المسلم — أذكار الصباح والمساء والنوم والصلاة.',
  });

  const [cat,    setCat]    = useState('sabah');
  const [search, setSearch] = useState('');

  /* localStorage persistence */
  const [done,   setDone]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('adhkar-done') || '{}'); } catch { return {}; }
  });
  const [counts, setCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('adhkar-counts') || '{}'); } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('adhkar-done',   JSON.stringify(done));   }, [done]);
  useEffect(() => { localStorage.setItem('adhkar-counts', JSON.stringify(counts)); }, [counts]);

  const toggleDone = useCallback((id) => setDone((d) => ({ ...d, [id]: !d[id] })), []);

  const tap = useCallback((id) => {
    setCounts((c) => {
      const n = (c[id] || 0) + 1;
      if (navigator.vibrate) navigator.vibrate(20);
      return { ...c, [id]: n };
    });
  }, []);

  const resetItem = useCallback((id) => {
    setCounts((c) => { const n = { ...c }; delete n[id]; return n; });
    setDone((d)   => { const n = { ...d }; delete n[id]; return n; });
  }, []);

  const resetAll = () => {
    setDone({}); setCounts({});
    localStorage.removeItem('adhkar-done');
    localStorage.removeItem('adhkar-counts');
  };

  /* Filtered items for search */
  const searchLower = search.trim().toLowerCase();
  const filteredCats = searchLower
    ? CATEGORY_KEYS.map((key) => ({
        key,
        items: ADHKAR[key].items.filter(
          (item) => item.ar.includes(search.trim()) || (item.fadl || '').toLowerCase().includes(searchLower)
        ),
      })).filter((c) => c.items.length > 0)
    : [{ key: cat, items: ADHKAR[cat].items }];

  const activeCat = ADHKAR[cat];
  const doneCount = activeCat.items.filter((i) => done[i.id]).length;
  const totalDone = Object.values(done).filter(Boolean).length;

  return (
    <>
      <Header />
      <main className="adhkar__main">

        {/* Hero */}
        <section className="adhkar__hero">
          <div className="container adhkar__hero-inner">
            <p className="eyebrow">من حصن المسلم</p>
            <h1>مكتبة الأذكار والأدعية</h1>
            <p className="adhkar__hero-sub">أذكار يومية بتشكيل كامل مع الفضائل والمصادر</p>
            {totalDone > 0 && (
              <div className="adhkar__hero-progress">
                <span>أتممت اليوم: {totalDone} ذكراً</span>
                <button className="adhkar__reset-all" onClick={resetAll}>إعادة تعيين الكل</button>
              </div>
            )}
          </div>
        </section>

        <div className="container adhkar__layout">

          {/* Category sidebar */}
          <aside className="adhkar__sidebar">
            <div className="adhkar__search-wrap">
              <input
                className="adhkar__search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 ابحث في الأذكار…"
                dir="rtl"
              />
              {search && (
                <button className="adhkar__search-clear" onClick={() => setSearch('')}>✕</button>
              )}
            </div>

            <nav className="adhkar__cats">
              {CATEGORY_KEYS.map((key) => {
                const c = ADHKAR[key];
                const dCnt = c.items.filter((i) => done[i.id]).length;
                return (
                  <button
                    key={key}
                    className={`adhkar__cat-btn${cat === key && !search ? ' active' : ''}`}
                    onClick={() => { setCat(key); setSearch(''); }}
                    style={{ '--cat-color': c.color }}
                  >
                    <span className="adhkar__cat-icon">{c.icon}</span>
                    <span className="adhkar__cat-name">{c.title}</span>
                    {dCnt > 0 && (
                      <span className="adhkar__cat-badge">{dCnt}/{c.items.length}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <section className="adhkar__content">
            {!search && (
              <div className="adhkar__cat-header" style={{ '--cat-color': activeCat.color }}>
                <span className="adhkar__ch-icon">{activeCat.icon}</span>
                <div>
                  <h2 className="adhkar__ch-title">{activeCat.title}</h2>
                  <p className="adhkar__ch-progress">
                    {doneCount} / {activeCat.items.length} مكتمل
                  </p>
                </div>
                <div className="adhkar__ch-bar-wrap">
                  <div className="adhkar__ch-bar" style={{ width: `${Math.round(doneCount / activeCat.items.length * 100)}%`, background: 'var(--cat-color)' }} />
                </div>
              </div>
            )}

            {search && filteredCats.length === 0 && (
              <div className="adhkar__no-results">
                <p>لا توجد نتائج لـ "{search}"</p>
              </div>
            )}

            {filteredCats.map(({ key, items }) => (
              <div key={key}>
                {search && <h3 className="adhkar__search-cat-title">{ADHKAR[key].icon} {ADHKAR[key].title}</h3>}
                <div className="adhkar__list">
                  {items.map((item, idx) => {
                    const itemDone  = done[item.id]   || false;
                    const itemCount = counts[item.id] || 0;
                    const target    = typeof item.count === 'number' ? item.count : null;
                    const reachedTarget = target && itemCount >= target;

                    return (
                      <div
                        key={item.id}
                        className={`adhkar__card${itemDone ? ' done' : ''}${reachedTarget ? ' reached' : ''}`}
                        style={{ '--cat-color': ADHKAR[key].color }}
                      >
                        {/* Number */}
                        <div className="adhkar__card-num">{idx + 1}</div>

                        {/* Context badge */}
                        {item.context && (
                          <div className="adhkar__context-badge">{item.context}</div>
                        )}

                        {/* Arabic text */}
                        <p className="adhkar__ar" dir="rtl" lang="ar">{item.ar}</p>

                        {/* Benefit */}
                        {item.fadl && (
                          <p className="adhkar__fadl" dir="rtl">💡 {item.fadl}</p>
                        )}

                        {/* Footer */}
                        <div className="adhkar__card-footer">
                          <div className="adhkar__meta">
                            <span className="adhkar__source">📖 {item.source}</span>
                            <span className="adhkar__count-target">
                              {typeof item.count === 'number' ? `${item.count}×` : item.count}
                            </span>
                          </div>

                          <div className="adhkar__actions">
                            {/* Tap counter */}
                            <button
                              className={`adhkar__tap${reachedTarget ? ' adhkar__tap--done' : ''}`}
                              onClick={() => tap(item.id)}
                              title="اضغط للعد"
                            >
                              {reachedTarget ? '✓' : itemCount > 0 ? itemCount : '◉'}
                            </button>

                            {/* Reset item */}
                            {(itemCount > 0 || itemDone) && (
                              <button className="adhkar__reset-btn" onClick={() => resetItem(item.id)} title="إعادة تعيين">
                                ↺
                              </button>
                            )}

                            {/* Done toggle */}
                            <button
                              className={`adhkar__done-btn${itemDone ? ' on' : ''}`}
                              onClick={() => toggleDone(item.id)}
                              title={itemDone ? 'إلغاء التأشير' : 'تأشير كمكتمل'}
                            >
                              {itemDone ? '✅ تم' : '☐ تم'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
