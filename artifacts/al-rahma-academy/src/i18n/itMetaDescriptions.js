// Italian SEO Meta Descriptions, Wave 1 (short pages): /it/resources/faq and
// /it/tools/adhkar previously used their on-page subtitle (t.faqPg.sub /
// t.adhkar.sub) as the <meta name="description">, which is too short for a search
// snippet. These strings are used ONLY for the <head> description; the visible
// subtitle text is unchanged. Italian only: every other language keeps whatever the
// caller passes as the fallback (same pattern as frMetaDescriptions.js).
// Each statement is visible on the page itself (FAQ questions, Adhkar categories,
// Arabic text with diacritics, sources and the repetition counter); no translation of
// any dua or hadith is created here.
// Long wave: t.about.description is also the visible About paragraph, so the About meta
// description is supplied here and the paragraph itself is unchanged.
export const IT_META_DESCRIPTIONS = {
  about: 'Chi è Al-Rahma Academy: missione, visione, valori e storia di una piattaforma di lezioni individuali online di Corano e arabo per bambini e adulti.',
  faq: 'Risposte alle domande più frequenti su lezioni online di Corano, insegnanti, prenotazione della prova gratuita, piani, rimborsi e requisiti tecnici.',
  adhkar: "Adhkar e du'a da Hisnul Muslim per mattino, sera, prima di dormire e dopo la preghiera: testo arabo con diacritici, fonti e contatore delle ripetizioni.",
};

export function pickItMetaDescription(key, lang, fallback) {
  return lang === 'it' ? IT_META_DESCRIPTIONS[key] : fallback;
}

// Remaining Italian wave: 16 pages whose description was outside 120-160 code points (teacher profiles up to 203,
// terms/refund/resources/hadith about 114-118). Head description only: every visible text, title and H1 is unchanged.
// Teachers 9 and 11 already fit and keep their on-page bio. The resources text no longer mentions the blog, which has no
// published Italian page.
export const IT_PAGE_META_DESCRIPTIONS = {
  coursesQuran: "Corsi online di Corano, Tajweed e Hifz (memorizzazione) con insegnanti certificati Al-Azhar: lezioni individuali e prova gratuita per ogni livello.",
  terms: "Termini di servizio di Al-Rahma Academy: abbonamenti e pagamento, rimborso entro 24 giorni, disdetta, prova gratuita, lezioni, tutor e protezione dei dati.",
  refund: "Politica di rimborso di Al-Rahma Academy: rimborso del primo periodo entro 24 giorni dal primo pagamento. Come funziona, cosa copre e come richiederlo.",
  resources: "Risorse di Al-Rahma Academy: domande frequenti, informazioni sull’accademia e profili degli insegnanti certificati Al-Azhar per le lezioni di Corano.",
  ijazah: "Ottieni un’Ijazah coranica con sanad ininterrotto fino al Profeta ﷺ: studia Matn Al-Jazariyyah, Al-Shatibiyyah e le sette Qira’at con studiosi di Al-Azhar.",
  islamicStudies: "Studi islamici basati sulle fonti: Aqeedah, Fiqh, Seerah, Hadith e Tafsir in 5 moduli strutturati, con studiosi certificati e lezioni nella tua lingua.",
  hadith: "Sfoglia e cerca 10 raccolte autentiche di hadith, tra cui Sahih al-Bukhari, Sahih Muslim e Sunan Abi Dawud, in arabo e inglese.",
};

export const IT_TEACHER_META_DESCRIPTIONS = {
  1: "Sami Mahmoud Abd Al-Aal, specialista in Corano e Tajweed avanzato: laureato di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
  2: "Muhammad Abd Al-Maqsoud, istruttore di Fiqh e studi islamici: laureato di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
  3: "Khairiyya Al-Muhammadi, istruttrice di Corano per bambini: laureata di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
  4: "Omnia Abd Allah, coach di Hifz e ripasso del Corano: laureata di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online su Al-Rahma Academy.",
  5: "Abd Allah Ayman, specialista in lingua araba e arabo coranico: laureato di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
  6: "Mahmoud Sami, istruttore di Tafsir e Aqeedah: laureato di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online su Al-Rahma Academy.",
  7: "Aya, istruttrice di Corano e Ijazah: laureata di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online su Al-Rahma Academy.",
  8: "Fatima Al-Rashidi, istruttrice di Corano per bisogni speciali e principianti: laureata di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
  10: "Islam Muhammad, istruttore di memorizzazione e recitazione del Corano: laureato di Al-Azhar con Ijazah e sanad connesso. Lezioni individuali online.",
};

export function pickItPageMetaDescription(key, lang, fallback) {
  return lang === 'it' ? IT_PAGE_META_DESCRIPTIONS[key] : fallback;
}

/** Italian teacher-profile description; teachers without an entry keep their on-page bio. */
export function pickItTeacherMetaDescription(id, lang, fallback) {
  return lang === 'it' ? IT_TEACHER_META_DESCRIPTIONS[id] ?? fallback : fallback;
}
