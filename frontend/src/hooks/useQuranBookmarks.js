import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookmarks, addBookmark, removeBookmark } from '../api/quranBookmarkApi';
import { useAuth } from '../context/AuthContext';

const BOOKMARKS_KEY = ['quran-bookmarks'];

export function useQuranBookmarks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: BOOKMARKS_KEY,
    queryFn:  () => getBookmarks(),
    enabled:  !!user,
  });
}

export function useAddBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addBookmark,
    onSuccess:  () => qc.invalidateQueries({ queryKey: BOOKMARKS_KEY }),
  });
}

export function useRemoveBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeBookmark,
    onSuccess:  () => qc.invalidateQueries({ queryKey: BOOKMARKS_KEY }),
  });
}

export function useIsBookmarked(verseKey) {
  const { data } = useQuranBookmarks();
  return (data ?? []).some((b) => b.verseKey === verseKey);
}
