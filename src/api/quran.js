import axios from 'axios';
import { withCache, TTL } from './cache';

const quran = axios.create({ baseURL: 'https://api.quran.com/api/v4' });

/*
 * Two separate endpoints with DIFFERENT ID spaces:
 *
 * /chapter_recitations/{id}/{chapter}  → full surah MP3  (IDs 1-15)
 * /recitations/{id}/by_chapter/{ch}    → per-verse MP3s  (IDs 1-12)
 *
 * IDs 1-10 and 12 are cross-compatible (same reciter, same ID).
 * ID 11 differs: chapter=Al-Qasim, verse=al-Tablawi  → we expose Al-Qasim
 *                (chapter-only, verseId:null)
 * IDs 13-15 exist in chapter but NOT in verse.
 *
 * `id`      → used for /chapter_recitations
 * `verseId` → used for /recitations  (null = no per-verse audio available)
 */
export const RECITERS = [
  { id: 7,  verseId: 7,    name: 'Mishari Rashid al-Afasy' },
  { id: 2,  verseId: 2,    name: 'AbdulBaset AbdulSamad (Murattal)' },
  { id: 1,  verseId: 1,    name: 'AbdulBaset AbdulSamad (Mujawwad)' },
  { id: 3,  verseId: 3,    name: 'Abdur-Rahman as-Sudais' },
  { id: 4,  verseId: 4,    name: 'Abu Bakr al-Shatri' },
  { id: 5,  verseId: 5,    name: 'Hani ar-Rifai' },
  { id: 6,  verseId: 6,    name: 'Mahmoud Khalil Al-Husary' },
  { id: 12, verseId: 12,   name: 'Al-Husary (Muallim / Teaching)' },
  { id: 8,  verseId: 8,    name: 'Minshawi (Mujawwad)' },
  { id: 9,  verseId: 9,    name: 'Minshawi (Murattal)' },
  { id: 10, verseId: 10,   name: 'Saud ash-Shuraym' },
  { id: 13, verseId: null, name: "Sa'd al-Ghamidi" },
  { id: 14, verseId: null, name: 'Fares Abbad' },
  { id: 15, verseId: null, name: 'Nasser Al-Qatami' },
  { id: 11, verseId: null, name: 'Abdul Muhsin Al-Qasim' },
];

// Map chapter recitation ID → verse recitation ID
const VERSE_ID = Object.fromEntries(
  RECITERS.filter((r) => r.verseId != null).map((r) => [r.id, r.verseId])
);

// ── Verses by chapter (surah) ────────────────────────────────────────
// Verse text is immutable scripture, so cache it for a week with stale fallback.
export const getVerses = (chapterId, translationId = 20) =>
  withCache(`verses:chapter:${chapterId}:${translationId}`, TTL.WEEK, () => {
    const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 300 };
    if (translationId) params.translations = translationId;
    return quran.get(`/verses/by_chapter/${chapterId}`, { params }).then((r) => r.data.verses);
  });

// ── Verses by Mushaf page (1-604) ───────────────────────────────────
export const getVersesByPage = (pageNum, translationId = 20) =>
  withCache(`verses:page:${pageNum}:${translationId}`, TTL.WEEK, () => {
    const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 50 };
    if (translationId) params.translations = translationId;
    return quran.get(`/verses/by_page/${pageNum}`, { params }).then((r) => r.data.verses);
  });

// ── Verses by Juz (1-30) ────────────────────────────────────────────
export const getVersesByJuz = (juzNum, translationId = 20) =>
  withCache(`verses:juz:${juzNum}:${translationId}`, TTL.WEEK, () => {
    const params = { fields: 'text_uthmani,page_number,juz_number', per_page: 300 };
    if (translationId) params.translations = translationId;
    return quran.get(`/verses/by_juz/${juzNum}`, { params }).then((r) => r.data.verses);
  });

// ── Full-chapter audio  (uses /chapter_recitations/{id})  ───────────
export const getChapterAudio = (chapterId, reciterId = 7) =>
  quran
    .get(`/chapter_recitations/${reciterId}/${chapterId}`)
    .then((r) => r.data.audio_file.audio_url);

// ── Per-verse audio for Hifz  (uses /recitations/{verseId})  ────────
// Returns [] for reciters that have no per-verse audio (IDs 11, 13-15).
export const getVerseAudios = (chapterId, reciterId = 7) => {
  const vid = VERSE_ID[reciterId];
  if (!vid) return Promise.resolve([]);
  return quran
    .get(`/recitations/${vid}/by_chapter/${chapterId}`)
    .then((r) =>
      (r.data.audio_files || []).map((f) => ({
        verse_key: f.verse_key,
        url: f.url.startsWith('http') ? f.url : `https://verses.quran.com/${f.url}`,
      }))
    );
};

// ── Tafsir for a single verse — quran.com API (returns HTML) ────────
export const getVerseTafsir = (verseKey, tafsirId) =>
  withCache(`tafsir:${tafsirId}:${verseKey}`, TTL.WEEK, () =>
    quran
      .get(`/tafsirs/${tafsirId}/by_ayah/${verseKey}`, { params: { fields: 'text' } })
      .then((r) => r.data?.tafsir?.text || '')
  );

// ── Tafsir from alquran.cloud (returns plain text) ───────────────────
const cloud = axios.create({ baseURL: 'https://api.alquran.cloud/v1' });
export const getVerseTafsirCloud = (verseKey, edition) =>
  withCache(`tafsir-cloud:${edition}:${verseKey}`, TTL.WEEK, () =>
    cloud
      .get(`/ayah/${verseKey}/${edition}`)
      .then((r) => r.data?.data?.text || '')
  );

// ── Single verse by key (e.g. "2:255") ──────────────────────────────
export const getVerse = (verseKey, translationId = 20) =>
  withCache(`verse:${verseKey}:${translationId}`, TTL.WEEK, () =>
    quran
      .get(`/verses/by_key/${verseKey}`, {
        params: { fields: 'text_uthmani', translations: translationId },
      })
      .then((r) => r.data.verse)
  );

// ── Chapter list ─────────────────────────────────────────────────────
// The 114-surah list never changes — cache it for a week with stale fallback.
export const getChapters = () =>
  withCache('chapters:en', TTL.WEEK, () =>
    quran.get('/chapters', { params: { language: 'en' } }).then((r) => r.data.chapters)
  );

// ── Word / phrase search ─────────────────────────────────────────────
export const searchQuran = (q, size = 20) =>
  quran
    .get('/search', { params: { q, size, language: 'en' } })
    .then((r) => r.data?.search?.results || []);
