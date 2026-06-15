import axios from 'axios';

const quran = axios.create({ baseURL: 'https://api.quran.com/api/v4' });

// ── Reciters (chapter_recitations + recitations endpoints) ──────────
export const RECITERS = [
  { id: 7,  name: 'Mishari Rashid al-Afasy' },
  { id: 1,  name: 'AbdulBaset AbdulSamad (Murattal)' },
  { id: 2,  name: 'AbdulBaset AbdulSamad (Mujawwad)' },
  { id: 3,  name: 'Abdur-Rahman as-Sudais' },
  { id: 4,  name: 'Abu Bakr al-Shatri' },
  { id: 6,  name: 'Mahmoud Khalil Al-Husary' },
  { id: 8,  name: 'Al-Husary (Mu\'allim / Teaching)' },
  { id: 9,  name: 'Mohamed Siddiq al-Minshawi' },
  { id: 10, name: "Sa'd al-Ghamidi" },
  { id: 11, name: 'Saud ash-Shuraym' },
  { id: 5,  name: 'Hani Rifai' },
  { id: 12, name: 'Yasser Al-Dosari' },
  { id: 13, name: 'Maher Al-Muaiqly' },
  { id: 14, name: 'Abdullah Basfar' },
  { id: 15, name: 'Ali Al-Huthaify' },
  { id: 17, name: 'Abdur-Rashid Ali Sufi (Warsh)' },
  { id: 18, name: 'Nasser Al-Qatami' },
  { id: 20, name: 'Mohamed Jibreel' },
  { id: 22, name: 'Ahmad Al-Ajmy' },
  { id: 23, name: 'Khalid Al-Qahtani' },
  { id: 26, name: 'Awad Al-Johani' },
  { id: 107, name: 'Ibrahim Al-Akhdar (Warsh)' },
  { id: 128, name: 'Mustafa Al-Laythī (Warsh)' },
];

// ── Verses by chapter (surah) ────────────────────────────────────────
export const getVerses = (chapterId, translationId = 20) => {
  const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 300 };
  if (translationId) params.translations = translationId;
  return quran.get(`/verses/by_chapter/${chapterId}`, { params }).then((r) => r.data.verses);
};

// ── Verses by Mushaf page (1-604) ───────────────────────────────────
export const getVersesByPage = (pageNum, translationId = 20) => {
  const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 50 };
  if (translationId) params.translations = translationId;
  return quran.get(`/verses/by_page/${pageNum}`, { params }).then((r) => r.data.verses);
};

// ── Verses by Juz (1-30) ────────────────────────────────────────────
export const getVersesByJuz = (juzNum, translationId = 20) => {
  const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 300 };
  if (translationId) params.translations = translationId;
  return quran.get(`/verses/by_juz/${juzNum}`, { params }).then((r) => r.data.verses);
};

// ── Full-chapter audio ───────────────────────────────────────────────
export const getChapterAudio = (chapterId, reciterId = 7) =>
  quran.get(`/chapter_recitations/${reciterId}/${chapterId}`)
    .then((r) => r.data.audio_file.audio_url);

// ── Per-verse audio for Hifz repetition ─────────────────────────────
export const getVerseAudios = (chapterId, reciterId = 7) =>
  quran.get(`/recitations/${reciterId}/by_chapter/${chapterId}`)
    .then((r) =>
      (r.data.audio_files || []).map((f) => ({
        verse_key: f.verse_key,
        url: f.url.startsWith('http') ? f.url : `https://verses.quran.com/${f.url}`,
      }))
    );

// ── Tafsir for a single verse (lazy loaded) ──────────────────────────
export const getVerseTafsir = (verseKey, tafsirId) =>
  quran.get(`/tafsirs/${tafsirId}/by_ayah/${verseKey}`, { params: { fields: 'text' } })
    .then((r) => r.data?.tafsir?.text || '');

// ── Chapter list ─────────────────────────────────────────────────────
export const getChapters = () =>
  quran.get('/chapters', { params: { language: 'en' } }).then((r) => r.data.chapters);

// ── Word / phrase search ─────────────────────────────────────────────
export const searchQuran = (q, size = 20) =>
  quran.get('/search', { params: { q, size, language: 'en' } })
    .then((r) => r.data?.search?.results || []);
