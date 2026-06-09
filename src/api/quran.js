import axios from 'axios';

// Separate client for the public quran.com content API (NOT our backend).
const quran = axios.create({ baseURL: 'https://api.quran.com/api/v4' });

const TRANSLATION_ID = 20; // Saheeh International (English)
const RECITER_ID = 7; // Mishari Rashid al-`Afasy

// List of all 114 surahs.
export const getChapters = () =>
  quran.get('/chapters', { params: { language: 'en' } }).then((r) => r.data.chapters);

// Verses of a surah: Arabic (Uthmani) + English translation.
export const getVerses = (chapterId) =>
  quran
    .get(`/verses/by_chapter/${chapterId}`, {
      params: { translations: TRANSLATION_ID, fields: 'text_uthmani', per_page: 300 },
    })
    .then((r) => r.data.verses);

// Full-surah recitation audio URL.
export const getChapterAudio = (chapterId) =>
  quran
    .get(`/chapter_recitations/${RECITER_ID}/${chapterId}`)
    .then((r) => r.data.audio_file.audio_url);
