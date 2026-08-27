import { Heart } from 'lucide-react';
import { useIsWishlisted, useAddToWishlist, useRemoveFromWishlist } from '../../hooks/useWishlist';

// Reusable heart-toggle for any real course card. Guards against navigating
// the enclosing <Link> (course cards across the app wrap the whole card in a
// link to /courses/:id) and against double-submits while a mutation is
// already in flight.
export default function WishlistButton({ courseId, size = 18 }) {
  const isWishlisted = useIsWishlisted(courseId);
  const addMutation = useAddToWishlist();
  const removeMutation = useRemoveFromWishlist();
  const isPending = addMutation.isPending || removeMutation.isPending;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;
    if (isWishlisted) removeMutation.mutate(courseId);
    else addMutation.mutate(courseId);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={isWishlisted}
      style={{
        background: 'none', border: 'none', cursor: isPending ? 'default' : 'pointer',
        padding: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, opacity: isPending ? 0.6 : 1,
      }}
    >
      <Heart
        size={size}
        fill={isWishlisted ? '#e0405d' : 'none'}
        color={isWishlisted ? '#e0405d' : 'var(--text-secondary)'}
        aria-hidden="true"
      />
    </button>
  );
}
