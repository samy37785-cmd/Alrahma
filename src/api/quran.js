import axios from 'axios';

// Separate client for the public quran.com content API (NOT our backend).
const quran = axios.create({ baseURL: 'https://api.quran.com/api/v4' });

const TRANSLATION_ID = 20; // Saheeh International (English)

export const RECITERS = [
  { id: 7,  name: 'Mishari Rashid al-Afasy' },
  { id: 1,  name: 'AbdulBaset AbdulSamad (Murattal)' },
  { id: 2,  name: 'AbdulBaset AbdulSamad (Mujawwad)' },
  { id: 3,  name: 'Abdur-Rahman as-Sudais' },
  { id: 4,  name: 'Abu Bakr al-Shatri' },
  { id: 6,  name: 'Mahmoud Khalil Al-Husary' },
  { id: 9,  name: 'Mohamed Siddiq al-Minshawi' },
  { id: 10, name: "Sa'd al-Ghamidi" },
  { id: 11, name: 'Saud ash-Shuraym' },
  { id: 5,  name: 'Hani Rifai' },
];

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

// Full-surah recitation audio URL for a given reciter.
export const getChapterAudio = (chapterId, reciterId = 7) =>
  quran
    .get(`/chapter_recitations/${reciterId}/${chapterId}`)
    .then((r) => r.data.audio_file.audio_url);
