import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWishlist, addToWishlist, removeFromWishlist, clearWishlist } from '../api/wishlistApi';

const WISHLIST_KEY = ['wishlist'];

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
    onSuccess:  () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}

export function useRemoveFromWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeFromWishlist,
    onSuccess:  () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
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
  return (data?.courses ?? []).some((w) => w.course?._id === courseId || w.course === courseId);
}
