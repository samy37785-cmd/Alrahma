import http from './http';

export const getBookmarks   = (chapterId) => http.get('/quran-bookmarks', { params: chapterId ? { chapterId } : {} }).then((r) => r.data);
export const addBookmark    = (data)      => http.post('/quran-bookmarks', data).then((r) => r.data);
export const removeBookmark = (verseKey)  => http.delete(`/quran-bookmarks/${verseKey}`).then((r) => r.data);
