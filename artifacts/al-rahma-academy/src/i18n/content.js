/* ══════════════════════════════════════════════════════════════════
   Per-language translations for data-driven content
   (plans, about values, testimonials).
   Static/structural data (prices, icons, colors, names, flags) stays
   in src/data/*; the text below is merged in by language at render.
   Indexed by language code — falls back to `en` when a key is missing.
   ══════════════════════════════════════════════════════════════════ */

/* ── Pricing plans: name + feature list (3 plans, in data order) ── */
/*
  Plan names use authentic Islamic educational terms across all languages.
  The Arabic names appear as subtitles; primary display names stay Islamic.
  Noorani  (نوراني)  = "filled with light" — the Noorani Qaida is the classic beginner Quran reading book
  Huffaz   (حُفَّاظ) = "guardians/memorizers of the Quran"
  Ijazah   (إجازة)  = formal certification with unbroken chain of knowledge
*/
export const PLAN_TEXT = {
  en: [
    { name: 'Noorani',  sub: 'Begin your light',   features: ['2 classes / week', '8 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Zoom or Skype'] },
    { name: 'Huffaz',   sub: 'Carry the Quran',    features: ['3 classes / week', '12 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Progress reports'] },
    { name: 'Ijazah',   sub: 'Earn your chain',    features: ['4 classes / week', '16 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Ijazah pathway support'] },
  ],
  ar: [
    { name: 'نوراني',   sub: 'ابدأ رحلة نورك',    features: ['حصتان أسبوعياً', '8 حصص شهرياً', 'ساعة لكل حصة', 'تعليم فردي', 'Zoom أو Skype'] },
    { name: 'حُفَّاظ',  sub: 'احمل القرآن',        features: ['3 حصص أسبوعياً', '12 حصة شهرياً', 'ساعة لكل حصة', 'تعليم فردي', 'تقارير متابعة'] },
    { name: 'إجازة',    sub: 'احصل على سندك',      features: ['4 حصص أسبوعياً', '16 حصة شهرياً', 'ساعة لكل حصة', 'تعليم فردي', 'دعم مسار الإجازة'] },
  ],
  it: [
    { name: 'Noorani',  sub: 'Inizia il tuo cammino di luce', features: ['2 lezioni a settimana', '8 lezioni al mese', '1 ora per lezione', 'Lezioni individuali', 'Zoom o Skype'] },
    { name: 'Huffaz',   sub: 'Custodisci il Corano',          features: ['3 lezioni a settimana', '12 lezioni al mese', '1 ora per lezione', 'Lezioni individuali', 'Rapporti sui progressi'] },
    { name: 'Ijazah',   sub: 'Ottieni la tua catena di trasmissione', features: ['4 lezioni a settimana', '16 lezioni al mese', '1 ora per lezione', 'Lezioni individuali', 'Supporto nel percorso verso l\'Ijazah'] },
  ],
  es: [
    { name: 'Noorani',  sub: 'Comienza tu camino de luz', features: ['2 clases por semana', '8 clases al mes', '1 hora por clase', 'Clases individuales', 'Zoom o Skype'] },
    { name: 'Huffaz',   sub: 'Guarda el Corán',            features: ['3 clases por semana', '12 clases al mes', '1 hora por clase', 'Clases individuales', 'Informes de progreso'] },
    { name: 'Ijazah',   sub: 'Obtén tu cadena de transmisión', features: ['4 clases por semana', '16 clases al mes', '1 hora por clase', 'Clases individuales', 'Acompañamiento en el camino hacia la Ijazah'] },
  ],
  de: [
    { name: 'Noorani',  sub: 'Beginne deinen Weg zum Licht', features: ['2 Unterrichtsstunden pro Woche', '8 Unterrichtsstunden pro Monat', '1 Stunde pro Unterricht', 'Einzelunterricht', 'Zoom oder Skype'] },
    { name: 'Huffaz',   sub: 'Bewahre den Koran',            features: ['3 Unterrichtsstunden pro Woche', '12 Unterrichtsstunden pro Monat', '1 Stunde pro Unterricht', 'Einzelunterricht', 'Fortschrittsberichte'] },
    { name: 'Ijazah',   sub: 'Erlange deine Überlieferungskette', features: ['4 Unterrichtsstunden pro Woche', '16 Unterrichtsstunden pro Monat', '1 Stunde pro Unterricht', 'Einzelunterricht', 'Begleitung auf dem Weg zur Ijazah'] },
  ],
  fr: [
    { name: 'Noorani',  sub: 'Commencez votre chemin de lumière', features: ['2 cours par semaine', '8 cours par mois', '1 heure par cours', 'Cours particuliers', 'Zoom ou Skype'] },
    { name: 'Huffaz',   sub: 'Préservez le Coran',              features: ['3 cours par semaine', '12 cours par mois', '1 heure par cours', 'Cours particuliers', 'Bilans de progression'] },
    { name: 'Ijazah',   sub: 'Obtenez votre chaîne de transmission', features: ['4 cours par semaine', '16 cours par mois', '1 heure par cours', 'Cours particuliers', 'Accompagnement vers l\'ijazah'] },
  ],
};

/* ── About → Our Values (6 cards, in data order) ── */
export const VALUES_TEXT = {
  en: [
    { title: 'Moderation',     desc: 'We present Islam in its true balanced form — inclusive, welcoming and free from extremism, suitable for Muslim communities living in the West.' },
    { title: 'Authenticity',   desc: 'Every tutor holds a verified Ijazah with a chain of knowledge traced back to the Prophet. Our curriculum is rooted in traditional, authentic scholarship.' },
    { title: 'Contemporary',   desc: 'We combine centuries-old Islamic scholarship with modern online technology to deliver world-class Quranic education directly to your home.' },
    { title: 'Responsibility', desc: 'Every tutor is personally accountable for the progress, wellbeing and Islamic development of each student entrusted to their care.' },
    { title: 'Excellence',     desc: 'We set high academic standards and continuously raise the quality of our teaching, drawing on the best Egyptian scholarly tradition.' },
    { title: 'Transparency',   desc: 'Families receive honest, regular progress reports and open communication throughout the learning journey — no hidden fees, no surprises.' },
  ],
  ar: [
    { title: 'الوسطية',      desc: 'نقدّم الإسلام في صورته المتوازنة الحقيقية — منفتحاً ومرحِّباً وبعيداً عن التطرف، بما يناسب الجاليات المسلمة في الغرب.' },
    { title: 'الأصالة',      desc: 'كل معلم يحمل إجازة موثّقة بسند متصل إلى النبي ﷺ. ومنهجنا متجذّر في العلم الأصيل المتوارث.' },
    { title: 'المعاصرة',     desc: 'نجمع بين العلم الإسلامي العريق والتقنية الحديثة لنقدّم تعليماً قرآنياً عالمي المستوى إلى بيتك مباشرة.' },
    { title: 'المسؤولية',    desc: 'كل معلم مسؤول شخصياً عن تقدّم كل طالب وحُسن رعايته وتطوّره الإسلامي.' },
    { title: 'التميّز',      desc: 'نضع معايير أكاديمية عالية ونرفع جودة تعليمنا باستمرار، مستندين إلى أفضل التقاليد العلمية المصرية.' },
    { title: 'الشفافية',     desc: 'تتلقى الأسر تقارير تقدّم صادقة ومنتظمة وتواصلاً مفتوحاً طوال رحلة التعلّم — بلا رسوم خفية ولا مفاجآت.' },
  ],
  it: [
    { title: 'Moderazione',    desc: 'Presentiamo l\'Islam nella sua vera forma equilibrata — inclusivo, accogliente e privo di estremismo, adatto alle comunità musulmane in Occidente.' },
    { title: 'Autenticità',    desc: 'Ogni insegnante possiede un Ijazah verificato con una catena di sapere che risale al Profeta. Il nostro programma è radicato nella scienza tradizionale e autentica.' },
    { title: 'Modernità',      desc: 'Uniamo secoli di tradizione erudita islamica alla moderna tecnologia online per offrire un\'educazione coranica di livello mondiale direttamente a casa tua.' },
    { title: 'Responsabilità', desc: 'Ogni insegnante è personalmente responsabile dei progressi, del benessere e della crescita islamica di ogni studente affidato a lui.' },
    { title: 'Eccellenza',     desc: 'Fissiamo elevati standard accademici e miglioriamo costantemente la qualità del nostro insegnamento, ispirandoci alla migliore tradizione scientifica egiziana.' },
    { title: 'Trasparenza',    desc: 'Le famiglie ricevono relazioni sui progressi, puntuali e trasparenti, e una comunicazione aperta lungo tutto il percorso — senza costi nascosti né sorprese.' },
  ],
  es: [
    { title: 'Moderación',     desc: 'Presentamos el Islam en su verdadera forma equilibrada — inclusivo, acogedor y libre de extremismo, adecuado para las comunidades musulmanas en Occidente.' },
    { title: 'Autenticidad',   desc: 'Cada profesor posee un Ijazah verificado con una cadena de conocimiento que se remonta al Profeta. Nuestro plan de estudios se basa en la erudición tradicional y auténtica.' },
    { title: 'Modernidad',     desc: 'Combinamos siglos de erudición islámica con la tecnología en línea moderna para ofrecer una educación coránica de primer nivel directamente en tu hogar.' },
    { title: 'Responsabilidad',desc: 'Cada profesor es personalmente responsable del progreso, el bienestar y el desarrollo islámico de cada estudiante a su cargo.' },
    { title: 'Excelencia',     desc: 'Establecemos altos estándares académicos y elevamos continuamente la calidad de nuestra enseñanza, inspirándonos en la mejor tradición erudita egipcia.' },
    { title: 'Transparencia',  desc: 'Las familias reciben informes de progreso honestos y regulares y una comunicación abierta durante todo el proceso — sin cargos ocultos ni sorpresas.' },
  ],
  de: [
    { title: 'Ausgewogenheit', desc: 'Wir präsentieren den Islam in seiner wahren, ausgewogenen Form — inklusiv, einladend und frei von Extremismus, passend für muslimische Gemeinschaften im Westen.' },
    { title: 'Authentizität',  desc: 'Jeder Lehrer besitzt eine geprüfte Ijazah mit einer bis zum Propheten zurückreichenden Wissenskette. Unser Lehrplan wurzelt in traditioneller, authentischer Gelehrsamkeit.' },
    { title: 'Modernität',     desc: 'Wir verbinden jahrhundertealte islamische Gelehrsamkeit mit moderner Online-Technologie, um erstklassigen Koranunterricht direkt zu Ihnen nach Hause zu bringen.' },
    { title: 'Verantwortung',  desc: 'Jeder Lehrer ist persönlich für den Fortschritt, das Wohlergehen und die islamische Entwicklung jedes anvertrauten Schülers verantwortlich.' },
    { title: 'Exzellenz',      desc: 'Wir setzen hohe akademische Maßstäbe und steigern kontinuierlich die Qualität unseres Unterrichts, gestützt auf die beste ägyptische Gelehrtentradition.' },
    { title: 'Transparenz',    desc: 'Familien erhalten ehrliche, regelmäßige Fortschrittsberichte und offene Kommunikation während der gesamten Lernreise — keine versteckten Gebühren, keine Überraschungen.' },
  ],
  fr: [
    { title: 'Modération',     desc: 'Nous présentons l\'Islam dans sa véritable forme équilibrée — inclusif, accueillant et exempt d\'extrémisme, adapté aux communautés musulmanes en Occident.' },
    { title: 'Authenticité',   desc: 'Chaque enseignant détient une Ijazah vérifiée avec une chaîne de savoir remontant au Prophète. Notre programme est ancré dans une érudition traditionnelle et authentique.' },
    { title: 'Modernité',      desc: 'Nous associons des siècles d’érudition islamique à la technologie en ligne moderne pour offrir un enseignement coranique de premier ordre directement chez vous.' },
    { title: 'Responsabilité', desc: 'Chaque enseignant est personnellement responsable des progrès, du bien-être et du développement islamique de chaque élève qui lui est confié.' },
    { title: 'Excellence',     desc: 'Nous fixons des normes académiques élevées et améliorons sans cesse la qualité de notre enseignement, en nous appuyant sur la meilleure tradition savante égyptienne.' },
    { title: 'Transparence',   desc: 'Les familles reçoivent des rapports de progression honnêtes et réguliers et une communication ouverte tout au long du parcours — sans frais cachés ni surprises.' },
  ],
};

/* ── Testimonials placeholder data REMOVED (trust-marketing remediation) ──
   The previous TESTIMONIAL_TEXT export held fabricated quotes attributed to
   fictional students, paired with the fabricated TESTIMONIALS array that
   used to live in src/data/marketing/socialProof.js. Neither had a real
   data source (no CMS, no review API) and both were clearly marked as
   placeholder in the surrounding code comments. Publishing invented
   reviews is a trust/compliance risk (see
   docs/trust-marketing-remediation.md), so the fabricated quotes were
   deleted from source rather than merely hidden behind a flag — there is
   nothing left here to flip back on. Testimonials.jsx now renders nothing
   until real, permission-cleared student reviews are collected and wired
   to a genuine data source. ── */

/* ── Printable invoice modal labels ── */
export const INVOICE_TEXT = {
  en: { locale: 'en-GB', invoice: 'Invoice', date: 'Date', period: 'Period', subscription: 'Subscription', planWord: 'Plan', monthlyRate: 'Monthly rate', discount: 'Discount', off: 'OFF', totalPaid: 'Total paid', paid: '✓ Paid', thankYou: 'Thank you for learning with Al-Rahma Academy. May Allah bless your journey.', print: '🖨 Print / Save as PDF' },
  ar: { locale: 'ar-EG', invoice: 'فاتورة', date: 'التاريخ', period: 'الفترة', subscription: 'اشتراك', planWord: 'باقة', monthlyRate: 'السعر الشهري', discount: 'الخصم', off: 'خصم', totalPaid: 'الإجمالي المدفوع', paid: '✓ مدفوع', thankYou: 'شكراً لتعلّمك مع أكاديمية الرحمة. بارك الله في رحلتك.', print: '🖨 طباعة / حفظ PDF' },
  it: { locale: 'it-IT', invoice: 'Fattura', date: 'Data', period: 'Periodo', subscription: 'Abbonamento', planWord: 'Piano', monthlyRate: 'Tariffa mensile', discount: 'Sconto', off: 'SCONTO', totalPaid: 'Totale pagato', paid: '✓ Pagato', thankYou: 'Grazie per aver studiato con Al-Rahma Academy. Che Allah benedica il tuo percorso.', print: '🖨 Stampa / Salva come PDF' },
  es: { locale: 'es-ES', invoice: 'Factura', date: 'Fecha', period: 'Período', subscription: 'Suscripción', planWord: 'Plan', monthlyRate: 'Tarifa mensual', discount: 'Descuento', off: 'DESC.', totalPaid: 'Total pagado', paid: '✓ Pagado', thankYou: 'Gracias por aprender con Al-Rahma Academy. Que Allah bendiga tu camino.', print: '🖨 Imprimir / Guardar como PDF' },
  de: { locale: 'de-DE', invoice: 'Rechnung', date: 'Datum', period: 'Zeitraum', subscription: 'Abonnement', planWord: 'Tarif', monthlyRate: 'Monatlicher Preis', discount: 'Rabatt', off: 'RABATT', totalPaid: 'Insgesamt bezahlt', paid: '✓ Bezahlt', thankYou: 'Danke, dass Sie mit der Al-Rahma Academy lernen. Möge Allah Ihren Weg segnen.', print: '🖨 Drucken / Als PDF speichern' },
  fr: { locale: 'fr-FR', invoice: 'Facture', date: 'Date', period: 'Période', subscription: 'Abonnement', planWord: 'Forfait', monthlyRate: 'Tarif mensuel', discount: 'Remise', off: 'REMISE', totalPaid: 'Total payé', paid: '✓ Payé', thankYou: 'Merci d\'apprendre avec Al-Rahma Academy. Qu\'Allah bénisse votre parcours.', print: '🖨 Imprimer / Enregistrer en PDF' },
};

/* ── Checkout payment-method subtitles (keyed by method subKey) ── */
export const CHECKOUT_SUBS = {
  en: { cardSub: 'Secure card payment', intlSub: 'For international students' },
  ar: { cardSub: 'دفع آمن بالبطاقة', intlSub: 'للطلاب الدوليين' },
  it: { cardSub: 'Pagamento sicuro con carta', intlSub: 'Per studenti internazionali' },
  es: { cardSub: 'Pago seguro con tarjeta', intlSub: 'Para estudiantes internacionales' },
  de: { cardSub: 'Sichere Kartenzahlung', intlSub: 'Für internationale Schüler' },
  fr: { cardSub: 'Paiement par carte sécurisé', intlSub: 'Pour les étudiants internationaux' },
};

/* ── Small shared UI strings (modals, floating buttons) ── */
export const UI_TEXT = {
  en: { close: 'Close', chooseResource: 'Choose how you’d like to start learning:', whatsapp: 'Chat on WhatsApp' },
  ar: { close: 'إغلاق', chooseResource: 'اختر كيف تحبّ أن تبدأ التعلّم:', whatsapp: 'تحدّث معنا على واتساب' },
  it: { close: 'Chiudi', chooseResource: 'Scegli come vuoi iniziare a imparare:', whatsapp: 'Scrivici su WhatsApp' },
  es: { close: 'Cerrar', chooseResource: 'Elige cómo quieres empezar a aprender:', whatsapp: 'Escríbenos por WhatsApp' },
  de: { close: 'Schließen', chooseResource: 'Wähle, wie du mit dem Lernen beginnen möchtest:', whatsapp: 'Schreib uns auf WhatsApp' },
  fr: { close: 'Fermer', chooseResource: 'Choisissez comment vous voulez commencer à apprendre :', whatsapp: 'Écrivez-nous sur WhatsApp' },
};

/* ── Islamic Tools page (prayer times, qibla, calendar, verse) ── */
const HIJRI_LATIN = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Ula','Jumada al-Akhirah','Rajab','Sha\'ban','Ramadan','Shawwal','Dhu al-Qi\'dah','Dhu al-Hijjah'];
const HIJRI_AR = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];

export const TOOLS_TEXT = {
  en: {
    eyebrow: 'Islamic Tools',
    tabs: { prayer: 'Prayer Times', qibla: 'Qibla', calendar: 'Islamic Calendar', verse: 'Verse of the Day' },
    calcMethod: '⚙ Calculation method', asrSchool: '🕮 Asr method', timeFormat: '🕒 Time format',
    notify: '🔔 Prayer alert', enableNotify: 'Enable alerts', before: 'before', minute: 'min',
    changeCity: '📍 Change city', search: 'Search', cityPlaceholder: 'e.g. Cairo, London, Paris…',
    nextPrayerLbl: 'Next prayer', timeRemaining: 'Time remaining',
    errRefetch: 'Could not refresh.', errCity: 'City not found. Use the English name.', noLocation: '🔒 Location not allowed. Search your city above.',
    upcoming: 'next ⟵',
    monthShow: '📅 Show full month timetable', monthHide: '📅 Hide month timetable',
    cols: { date: 'Date', Fajr: 'Fajr', Sunrise: 'Sunrise', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    prayers: { Fajr: 'Fajr', Sunrise: 'Sunrise', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    extras: { Imsak: 'Imsak (Suhoor)', Midnight: 'Midnight', Lastthird: 'Last third (Qiyam)' },
    asrSchools: ['Standard (Shafii/Maliki/Hanbali)', 'Hanafi'],
    toolCards: { prayer: 'Accurate prayer times for your location with live countdown, prayer alerts, and a full monthly timetable.', qibla: 'Find the Qibla direction from anywhere in the world with bearing degrees and a live compass for mobile.', calendar: 'Today’s Hijri date with countdowns to Ramadan, Eid al-Fitr, Eid al-Adha, and a full Hijri months reference.', verse: 'A handpicked Quran verse for each day of the month with English translation.' },
    qibla: { title: '🕋 Qibla Direction', fromNorth: 'from North', distance: 'distance to Makkah', enableCompass: '🧭 Enable live compass (mobile)', compassLive: '✅ Live compass on — point your phone ↑', allowFirst: '📍 Allow location from the "Prayer Times" tab first', goToPrayer: 'Go to Prayer Times ←', kaabaTitle: '🕌 The Holy Kaaba', kaabaText: 'The Holy Kaaba is the first house built for mankind, located in Makkah, Saudi Arabia. Muslims worldwide face it during prayer. Coordinates: 21.3891° N, 39.8579° E.' },
    cal: { setDate: 'Search your city in the "Prayer Times" tab to set the Hijri date', monthWord: 'Month of', upcoming: 'Upcoming Islamic Occasions', ramadan: 'Blessed month of Ramadan', eidFitr: 'Eid al-Fitr', eidAdha: 'Eid al-Adha', today: 'Today 🎉', days: 'days', monthsTitle: 'Hijri Months', months: HIJRI_LATIN },
    verse: { title: '🌟 Verse of the Day', ref: 'Surah' },
  },
  ar: {
    eyebrow: 'أدوات إسلامية',
    tabs: { prayer: 'مواقيت الصلاة', qibla: 'القبلة', calendar: 'التقويم الإسلامي', verse: 'آية اليوم' },
    calcMethod: '⚙ طريقة الحساب', asrSchool: '🕮 مذهب العصر', timeFormat: '🕒 صيغة الوقت',
    notify: '🔔 تنبيه الصلاة', enableNotify: 'تفعيل التنبيهات', before: 'قبل', minute: 'دقيقة',
    changeCity: '📍 تغيير المدينة', search: 'بحث', cityPlaceholder: 'مثال: Cairo, London, Paris…',
    nextPrayerLbl: 'الصلاة القادمة', timeRemaining: 'الوقت المتبقي',
    errRefetch: 'تعذر إعادة الجلب.', errCity: 'المدينة غير موجودة. استخدم الاسم بالإنجليزية.', noLocation: '🔒 لم يُسمح بالموقع. ابحث عن مدينتك أعلاه.',
    upcoming: 'قادمة ⟵',
    monthShow: '📅 عرض مواقيت الشهر كامل', monthHide: '📅 إخفاء جدول الشهر',
    cols: { date: 'التاريخ', Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
    prayers: { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
    extras: { Imsak: 'الإمساك (السحور)', Midnight: 'منتصف الليل', Lastthird: 'الثلث الأخير (قيام)' },
    asrSchools: ['الجمهور (شافعي/مالكي/حنبلي)', 'الحنفي'],
    toolCards: { prayer: 'مواقيت صلاة دقيقة لموقعك مع عداد تنازلي مباشر، ومنبه الصلاة، وجدول شهري كامل.', qibla: 'اعرف اتجاه القبلة من أي مكان في العالم بالدرجات والمسافة، مع بوصلة حية على الهاتف.', calendar: 'التاريخ الهجري لليوم مع العد التنازلي لرمضان والعيدين، ومرجع أشهر السنة الهجرية.', verse: 'آية قرآنية مختارة لكل يوم من أيام الشهر مع ترجمتها بالإنجليزية.' },
    qibla: { title: '🕋 اتجاه القبلة', fromNorth: 'الاتجاه من الشمال', distance: 'المسافة إلى مكة', enableCompass: '🧭 تفعيل البوصلة الحية (للهاتف)', compassLive: '✅ البوصلة الحية مفعّلة — وجّه هاتفك ↑', allowFirst: '📍 يجب السماح بالموقع من تبويب "مواقيت الصلاة" أولاً', goToPrayer: 'الذهاب لمواقيت الصلاة ←', kaabaTitle: '🕌 الكعبة المشرفة', kaabaText: 'الكعبة المشرفة هي أول بيت وُضع للناس، تقع في مدينة مكة المكرمة بالمملكة العربية السعودية. إليها يتوجه المسلمون في جميع أنحاء العالم أثناء الصلاة. إحداثياتها: 21.3891° شمالاً، 39.8579° شرقاً.' },
    cal: { setDate: 'ابحث عن مدينتك في تبويب "مواقيت الصلاة" لتحديد التاريخ الهجري', monthWord: 'شهر', upcoming: 'المناسبات الإسلامية القادمة', ramadan: 'شهر رمضان المبارك', eidFitr: 'عيد الفطر المبارك', eidAdha: 'عيد الأضحى المبارك', today: 'اليوم 🎉', days: 'يوماً', monthsTitle: 'الأشهر الهجرية', months: HIJRI_AR },
    verse: { title: '🌟 آية اليوم', ref: 'سورة' },
  },
  it: {
    eyebrow: 'Strumenti islamici',
    tabs: { prayer: 'Orari di preghiera', qibla: 'Qibla', calendar: 'Calendario islamico', verse: 'Versetto del giorno' },
    calcMethod: '⚙ Metodo di calcolo', asrSchool: '🕮 Metodo Asr', timeFormat: '🕒 Formato ora',
    notify: '🔔 Avviso preghiera', enableNotify: 'Attiva avvisi', before: 'prima di', minute: 'min',
    changeCity: '📍 Cambia città', search: 'Cerca', cityPlaceholder: 'es. Cairo, Londra, Parigi…',
    nextPrayerLbl: 'Prossima preghiera', timeRemaining: 'Tempo rimanente',
    errRefetch: 'Impossibile aggiornare.', errCity: 'Città non trovata. Usa il nome in inglese.', noLocation: '🔒 Posizione non consentita. Cerca la tua città sopra.',
    upcoming: 'prossima ⟵',
    monthShow: '📅 Mostra gli orari del mese', monthHide: '📅 Nascondi gli orari del mese',
    cols: { date: 'Data', Fajr: 'Fajr', Sunrise: 'Alba', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    prayers: { Fajr: 'Fajr', Sunrise: 'Alba', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    extras: { Imsak: 'Imsak (Suhur)', Midnight: 'Mezzanotte', Lastthird: 'Ultimo terzo (Qiyam)' },
    asrSchools: ['Standard (Shafii/Maliki/Hanbali)', 'Hanafita'],
    toolCards: { prayer: 'Orari di preghiera precisi per la tua posizione con conto alla rovescia in tempo reale, avvisi e calendario mensile completo.', qibla: 'Trova la direzione della Qibla da qualsiasi luogo del mondo con i gradi di orientamento e una bussola in tempo reale per dispositivi mobili.', calendar: 'La data egiriana di oggi con il conto alla rovescia per Ramadan, Eid al-Fitr, Eid al-Adha e un riferimento completo ai mesi egiriani.', verse: 'Un versetto del Corano selezionato per ogni giorno del mese con traduzione italiana.' },
    qibla: { title: '🕋 Direzione della Qibla', fromNorth: 'rispetto al Nord', distance: 'distanza dalla Mecca', enableCompass: '🧭 Attiva la bussola in tempo reale (cellulare)', compassLive: '✅ Bussola in tempo reale attiva — orienta il telefono ↑', allowFirst: '📍 Consenti prima l’accesso alla posizione dalla scheda "Orari di preghiera"', goToPrayer: 'Vai agli orari di preghiera ←', kaabaTitle: '🕌 La Sacra Kaaba', kaabaText: 'La Sacra Kaaba è la prima casa eretta per l’umanità e si trova alla Mecca, in Arabia Saudita. I musulmani di tutto il mondo si rivolgono verso di essa durante la preghiera. Coordinate: 21.3891° N, 39.8579° E.' },
    cal: { setDate: 'Cerca la tua città nella scheda "Orari di preghiera" per impostare la data dell’Egira', monthWord: 'Mese di', upcoming: 'Prossime ricorrenze islamiche', ramadan: 'Il mese benedetto di Ramadan', eidFitr: 'Eid al-Fitr', eidAdha: 'Eid al-Adha', today: 'Oggi 🎉', days: 'giorni', monthsTitle: 'Mesi dell’Egira', months: HIJRI_LATIN },
    verse: { title: '🌟 Versetto del giorno', ref: 'Sura' },
  },
  es: {
    eyebrow: 'Herramientas islámicas',
    tabs: { prayer: 'Horarios de oración', qibla: 'Alquibla', calendar: 'Calendario islámico', verse: 'Versículo del día' },
    calcMethod: '⚙ Método de cálculo', asrSchool: '🕮 Método de Asr', timeFormat: '🕒 Formato de hora',
    notify: '🔔 Aviso de oración', enableNotify: 'Activar avisos', before: 'antes de', minute: 'min',
    changeCity: '📍 Cambiar ciudad', search: 'Buscar', cityPlaceholder: 'ej. El Cairo, Londres, París…',
    nextPrayerLbl: 'Próxima oración', timeRemaining: 'Tiempo restante',
    errRefetch: 'No se pudo actualizar.', errCity: 'Ciudad no encontrada. Usa el nombre en inglés.', noLocation: '🔒 Ubicación no permitida. Busca tu ciudad arriba.',
    upcoming: 'próxima ⟵',
    monthShow: '📅 Mostrar los horarios del mes', monthHide: '📅 Ocultar los horarios del mes',
    cols: { date: 'Fecha', Fajr: 'Fajr', Sunrise: 'Amanecer', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    prayers: { Fajr: 'Fajr', Sunrise: 'Amanecer', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    extras: { Imsak: 'Imsak (Suhur)', Midnight: 'Medianoche', Lastthird: 'Último tercio (Qiyam)' },
    asrSchools: ['Estándar (Shafii/Maliki/Hanbali)', 'Hanafí'],
    toolCards: { prayer: 'Horarios de oración precisos para tu ubicación con cuenta atrás en directo, alertas de oración y un calendario mensual completo.', qibla: 'Encuentra la dirección de la Qibla desde cualquier lugar del mundo con grados de orientación y una brújula en directo para móviles.', calendar: 'La fecha hégira de hoy con cuentas atrás para Ramadán, Eid al-Fitr, Eid al-Adha y una referencia completa de los meses hégiras.', verse: 'Un versículo del Corán seleccionado para cada día del mes con traducción al español.' },
    qibla: { title: '🕋 Dirección de la alquibla', fromNorth: 'respecto al Norte', distance: 'distancia hasta La Meca', enableCompass: '🧭 Activar brújula en tiempo real (móvil)', compassLive: '✅ Brújula en tiempo real activa — orienta el teléfono ↑', allowFirst: '📍 Permite primero el acceso a la ubicación desde la pestaña "Horarios de oración"', goToPrayer: 'Ir a los horarios de oración ←', kaabaTitle: '🕌 La Sagrada Kaaba', kaabaText: 'La Sagrada Kaaba es la primera casa erigida para la humanidad y está situada en La Meca, Arabia Saudí. Los musulmanes de todo el mundo se orientan hacia ella durante la oración. Coordenadas: 21.3891° N, 39.8579° E.' },
    cal: { setDate: 'Busca tu ciudad en la pestaña "Horarios de oración" para establecer la fecha hégira', monthWord: 'Mes de', upcoming: 'Próximas celebraciones islámicas', ramadan: 'El bendito mes de Ramadán', eidFitr: 'Eid al-Fitr', eidAdha: 'Eid al-Adha', today: 'Hoy 🎉', days: 'días', monthsTitle: 'Meses de la Hégira', months: HIJRI_LATIN },
    verse: { title: '🌟 Versículo del día', ref: 'Sura' },
  },
  de: {
    eyebrow: 'Islamische Werkzeuge',
    tabs: { prayer: 'Gebetszeiten', qibla: 'Qibla', calendar: 'Islamischer Kalender', verse: 'Vers des Tages' },
    calcMethod: '⚙ Berechnungsmethode', asrSchool: '🕮 Asr-Methode', timeFormat: '🕒 Zeitformat',
    notify: '🔔 Gebetserinnerung', enableNotify: 'Erinnerungen aktivieren', before: 'vor', minute: 'Min.',
    changeCity: '📍 Stadt ändern', search: 'Suchen', cityPlaceholder: 'z. B. Kairo, London, Paris…',
    nextPrayerLbl: 'Nächstes Gebet', timeRemaining: 'Verbleibende Zeit',
    errRefetch: 'Aktualisierung fehlgeschlagen.', errCity: 'Stadt nicht gefunden. Verwende den englischen Namen.', noLocation: '🔒 Standort nicht erlaubt. Suche oben deine Stadt.',
    upcoming: 'nächstes ⟵',
    monthShow: '📅 Monatsplan anzeigen', monthHide: '📅 Monatsplan ausblenden',
    cols: { date: 'Datum', Fajr: 'Fadschr', Sunrise: 'Sonnenaufgang', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Ischa' },
    prayers: { Fajr: 'Fadschr', Sunrise: 'Sonnenaufgang', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Ischa' },
    extras: { Imsak: 'Imsak (Suhur)', Midnight: 'Mitternacht', Lastthird: 'Letztes Drittel (Qiyam)' },
    asrSchools: ['Standard (Schafii/Maliki/Hanbali)', 'Hanafi'],
    toolCards: { prayer: 'Genaue Gebetszeiten für deinen Standort mit Live-Countdown, Gebetsbenachrichtigungen und vollständigem Monatsplan.', qibla: 'Finde die Qibla-Richtung von überall auf der Welt mit Gradangabe und Live-Kompass für Mobilgeräte.', calendar: 'Das heutige Hidschra-Datum mit Countdowns zu Ramadan, Eid al-Fitr, Eid al-Adha und einer vollständigen Übersicht der Hidschra-Monate.', verse: 'Ein ausgewählter Koranvers für jeden Tag des Monats mit deutscher Übersetzung.' },
    qibla: { title: '🕋 Qibla-Richtung', fromNorth: 'von Norden aus', distance: 'Entfernung nach Mekka', enableCompass: '🧭 Live-Kompass aktivieren (Mobilgerät)', compassLive: '✅ Live-Kompass aktiv — richte dein Telefon aus ↑', allowFirst: '📍 Erlaube zuerst den Standortzugriff im Tab „Gebetszeiten“', goToPrayer: 'Zu den Gebetszeiten ←', kaabaTitle: '🕌 Die Heilige Kaaba', kaabaText: 'Die Heilige Kaaba ist das erste für die Menschheit errichtete Haus und befindet sich in Mekka, Saudi-Arabien. Muslime auf der ganzen Welt richten sich beim Gebet nach ihr aus. Koordinaten: 21.3891° N, 39.8579° O.' },
    cal: { setDate: 'Suche deine Stadt im Tab „Gebetszeiten“, um das Hidschra-Datum festzulegen', monthWord: 'Monat', upcoming: 'Bevorstehende islamische Anlässe', ramadan: 'Der gesegnete Monat Ramadan', eidFitr: 'Eid al-Fitr', eidAdha: 'Eid al-Adha', today: 'Heute 🎉', days: 'Tage', monthsTitle: 'Hidschra-Monate', months: HIJRI_LATIN },
    verse: { title: '🌟 Vers des Tages', ref: 'Sure' },
  },
  fr: {
    eyebrow: 'Outils islamiques',
    tabs: { prayer: 'Horaires de prière', qibla: 'Qibla', calendar: 'Calendrier islamique', verse: 'Verset du jour' },
    calcMethod: '⚙ Méthode de calcul', asrSchool: '🕮 Méthode Asr', timeFormat: '🕒 Format de l\'heure',
    notify: '🔔 Alerte de prière', enableNotify: 'Activer les alertes', before: 'avant', minute: 'min',
    changeCity: '📍 Changer de ville', search: 'Rechercher', cityPlaceholder: 'ex. Le Caire, Londres, Paris…',
    nextPrayerLbl: 'Prochaine prière', timeRemaining: 'Temps restant',
    errRefetch: 'Échec de l\'actualisation.', errCity: 'Ville introuvable. Utilisez le nom en anglais.', noLocation: '🔒 Localisation non autorisée. Cherchez votre ville ci-dessus.',
    upcoming: 'prochaine ⟵',
    monthShow: '📅 Afficher les horaires du mois', monthHide: '📅 Masquer les horaires du mois',
    cols: { date: 'Date', Fajr: 'Fajr', Sunrise: 'Lever du soleil', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    prayers: { Fajr: 'Fajr', Sunrise: 'Lever du soleil', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    extras: { Imsak: 'Imsak (Souhour)', Midnight: 'Minuit', Lastthird: 'Dernier tiers (Qiyam)' },
    asrSchools: ['Standard (Chafii/Maliki/Hanbali)', 'Hanafite'],
    toolCards: { prayer: 'Horaires de prière précis pour votre position avec compte à rebours en direct, alertes de prière et calendrier mensuel complet.', qibla: 'Trouvez la direction de la Qibla depuis n’importe où dans le monde avec les degrés d’orientation et une boussole en direct sur mobile.', calendar: 'La date hégirienne du jour avec les comptes à rebours vers le Ramadan, l’Aïd al-Fitr, l’Aïd al-Adha et une référence complète des mois hégiriens.', verse: 'Un verset du Coran sélectionné pour chaque jour du mois avec traduction française.' },
    qibla: { title: '🕋 Direction de la Qibla', fromNorth: 'par rapport au Nord', distance: 'distance jusqu’à La Mecque', enableCompass: '🧭 Activer la boussole en temps réel (mobile)', compassLive: '✅ Boussole en temps réel activée — orientez votre téléphone ↑', allowFirst: '📍 Autorisez d’abord la localisation dans l’onglet « Horaires de prière »', goToPrayer: 'Aller aux horaires de prière ←', kaabaTitle: '🕌 La Sainte Kaaba', kaabaText: 'La Sainte Kaaba est la première maison érigée pour l’humanité et se situe à La Mecque, en Arabie saoudite. Les musulmans du monde entier s’orientent vers elle pendant la prière. Coordonnées : 21.3891° N, 39.8579° E.' },
    cal: { setDate: 'Cherchez votre ville dans l’onglet « Horaires de prière » pour définir la date hégirienne', monthWord: 'Mois de', upcoming: 'Prochaines fêtes islamiques', ramadan: 'Le mois béni de Ramadan', eidFitr: 'Aïd al-Fitr', eidAdha: 'Aïd al-Adha', today: 'Aujourd’hui 🎉', days: 'jours', monthsTitle: 'Mois de l’Hégire', months: HIJRI_LATIN },
    verse: { title: '🌟 Verset du jour', ref: 'Sourate' },
  },
};

export const TOOLS_HUB_TEXT = {
  en: { badges: [{ label: '⭐ Most Popular', cls: 'hub-badge--gold' }, null, null, { label: '🕌 Daily Use', cls: 'hub-badge--green' }, null, { label: '🆕 New', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'Take the next step', heading: 'Love these tools? Learn with a certified tutor.', sub: 'Our free tools are just a glimpse of what you get with Al-Rahma Academy. Join one-to-one lessons with Al-Azhar certified tutors and transform your Quran learning journey.', bullets: ['60-minute free trial lesson — no payment required', 'Personalised curriculum for your level', 'Female tutors available for sisters', 'Flexible scheduling, 24/7'], button: 'Book a Free Trial Lesson', note: 'No credit card · Cancel anytime · Reply within 24 hours' } },
  ar: { badges: [{ label: '⭐ الأكثر استخداماً', cls: 'hub-badge--gold' }, null, null, { label: '🕌 للاستخدام اليومي', cls: 'hub-badge--green' }, null, { label: '🆕 جديد', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'خذ الخطوة التالية', heading: 'أعجبتك هذه الأدوات؟ تعلّم مع معلم معتمد.', sub: 'أدواتنا المجانية ليست سوى لمحة مما تحصل عليه مع أكاديمية الرحمة. انضم إلى دروس فردية مع معلمين معتمدين من الأزهر وحوّل رحلة تعلّمك للقرآن.', bullets: ['درس تجريبي مجاني لمدة 60 دقيقة — لا يلزم الدفع', 'منهج شخصي يناسب مستواك', 'معلمات متاحات للأخوات', 'مواعيد مرنة على مدار الساعة'], button: 'احجز درساً تجريبياً مجانياً', note: 'لا حاجة لبطاقة ائتمان · ألغِ في أي وقت · نرد خلال 24 ساعة' } },
  it: { badges: [{ label: '⭐ Più popolare', cls: 'hub-badge--gold' }, null, null, { label: '🕌 Uso quotidiano', cls: 'hub-badge--green' }, null, { label: '🆕 Novità', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'Fai il prossimo passo', heading: 'Ti piacciono questi strumenti? Impara con un insegnante certificato.', sub: 'I nostri strumenti gratuiti sono solo un assaggio di ciò che trovi in Al-Rahma Academy. Partecipa a lezioni individuali con insegnanti certificati di Al-Azhar e trasforma il tuo percorso di apprendimento del Corano.', bullets: ['Lezione di prova gratuita di 60 minuti — nessun pagamento richiesto', 'Programma personalizzato per il tuo livello', 'Insegnanti donne disponibili per le sorelle', 'Orari flessibili, 24/7'], button: 'Prenota una lezione di prova gratuita', note: 'Nessuna carta richiesta · Annulla in qualsiasi momento · Risposta entro 24 ore' } },
  es: { badges: [{ label: '⭐ Más popular', cls: 'hub-badge--gold' }, null, null, { label: '🕌 Uso diario', cls: 'hub-badge--green' }, null, { label: '🆕 Nuevo', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'Da el siguiente paso', heading: '¿Te gustan estas herramientas? Aprende con un tutor certificado.', sub: 'Nuestras herramientas gratuitas son solo una muestra de lo que recibes con Al-Rahma Academy. Únete a clases individuales con tutores certificados por Al-Azhar y transforma tu aprendizaje del Corán.', bullets: ['Lección de prueba gratuita de 60 minutos — no se requiere pago', 'Programa personalizado para tu nivel', 'Tutoras disponibles para hermanas', 'Horarios flexibles, 24/7'], button: 'Reserva una lección de prueba gratuita', note: 'Sin tarjeta de crédito · Cancela cuando quieras · Respondemos en 24 horas' } },
  de: { badges: [{ label: '⭐ Am beliebtesten', cls: 'hub-badge--gold' }, null, null, { label: '🕌 Tägliche Nutzung', cls: 'hub-badge--green' }, null, { label: '🆕 Neu', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'Mach den nächsten Schritt', heading: 'Gefallen dir diese Tools? Lerne mit einer zertifizierten Lehrkraft.', sub: 'Unsere kostenlosen Tools sind nur ein kleiner Einblick in das Angebot der Al-Rahma Academy. Nimm Einzelunterricht bei Al-Azhar-zertifizierten Lehrkräften und gestalte deine Reise zum Koran neu.', bullets: ['60-minütige kostenlose Probestunde — keine Zahlung erforderlich', 'Persönlicher Lehrplan für dein Niveau', 'Lehrerinnen für Schwestern verfügbar', 'Flexible Terminplanung, rund um die Uhr'], button: 'Kostenlose Probestunde buchen', note: 'Keine Kreditkarte · Jederzeit kündbar · Antwort innerhalb von 24 Stunden' } },
  fr: { badges: [{ label: '⭐ Le plus populaire', cls: 'hub-badge--gold' }, null, null, { label: '🕌 Usage quotidien', cls: 'hub-badge--green' }, null, { label: '🆕 Nouveau', cls: 'hub-badge--blue' }], stats: [], cta: { eyebrow: 'Passez à l’étape suivante', heading: 'Vous aimez ces outils ? Apprenez avec un enseignant certifié.', sub: 'Nos outils gratuits ne sont qu’un aperçu de ce que vous offre Al-Rahma Academy. Rejoignez des cours individuels avec des enseignants certifiés par Al-Azhar et transformez votre apprentissage du Coran.', bullets: ['Cours d’essai gratuit de 60 minutes — aucun paiement requis', 'Programme personnalisé selon votre niveau', 'Enseignantes disponibles pour les sœurs', 'Horaires flexibles, 24 h/24 et 7 j/7'], button: 'Réserver un cours d’essai gratuit', note: 'Aucune carte bancaire · Annulez à tout moment · Réponse sous 24 heures' } },
};

/* Helper: pick a language array/object with fallback to English. */
export const pick = (map, lang) => map[lang] || map.en;

