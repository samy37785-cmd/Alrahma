import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWishlist, addToWishlist, removeFromWishlist, clearWishlist } from '../api/wishlistApi';

const WISHLIST_KEY = ['wishlist'];

function isSameCourse(entry, courseId) {
  return (entry.course?._id ?? entry.course) === courseId;
}

export function useWishlist() {
  return useQuery({
    queryKey: WISHLIST_KEY,
    queryFn:  getWishlist,
  });
}

export function useAddToWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addToWishlist,
    // Optimistic: the heart toggle (useIsWishlisted) only ever compares
    // course ids, so a placeholder entry (course: courseId, no populated
    // title/level yet) is enough to flip it instantly. onSettled's
    // invalidate then replaces the placeholder with the real, populated
    // entry from the server — the placeholder is never rendered directly
    // (Wishlist.jsx only renders entries where `course` is already an
    // object) so there's no risk of a broken-looking row.
    onMutate: async (courseId) => {
      await qc.cancelQueries({ queryKey: WISHLIST_KEY });
      const previous = qc.getQueryData(WISHLIST_KEY);
      qc.setQueryData(WISHLIST_KEY, (old) => {
        const courses = old?.courses ?? [];
        if (courses.some((w) => isSameCourse(w, courseId))) return old;
        return { ...(old ?? {}), courses: [...courses, { course: courseId, addedAt: new Date().toISOString() }] };
      });
      return { previous };
    },
    onError: (err, courseId, context) => {
      if (context?.previous !== undefined) qc.setQueryData(WISHLIST_KEY, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useRemoveFromWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeFromWishlist,
    onMutate: async (courseId) => {
      await qc.cancelQueries({ queryKey: WISHLIST_KEY });
      const previous = qc.getQueryData(WISHLIST_KEY);
      qc.setQueryData(WISHLIST_KEY, (old) => ({
        ...(old ?? {}),
        courses: (old?.courses ?? []).filter((w) => !isSameCourse(w, courseId)),
      }));
      return { previous };
    },
    onError: (err, courseId, context) => {
      if (context?.previous !== undefined) qc.setQueryData(WISHLIST_KEY, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useClearWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearWishlist,
    onSuccess:  () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useIsWishlisted(courseId) {
  const { data } = useWishlist();
  return (data?.courses ?? []).some((w) => isSameCourse(w, courseId));
}
