import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { getTeacherReviews, createReview } from '../../../api/reviewApi';

const TUTOR_REVIEWS_PAGE_SIZE = 3;

// Real review average/count + recent-reviews list + submission form for the
// student's actual assigned tutor (user.teacher — a real User._id, unlike
// enrollment.teacherName which is only a free-text label from the public
// lead-capture form).
export function TutorReviewWidget({ teacherId }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState('');
  const [sort, setSort] = useState('recent');
  const [limit, setLimit] = useState(TUTOR_REVIEWS_PAGE_SIZE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reviews', 'teacher', teacherId, sort, limit],
    queryFn: () => getTeacherReviews(teacherId, { sort, limit }),
    enabled: !!teacherId,
    staleTime: 60000,
  });

  const submitReview = useMutation({
    mutationFn: () => createReview({ teacherId, rating, body }),
    onSuccess: () => {
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['reviews', 'teacher', teacherId] });
    },
  });

  const avg = data?.avg ?? 0;
  const count = data?.count ?? 0;
  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const filled = Math.round(avg);
  const alreadyReviewed = submitReview.isError && submitReview.error?.response?.status === 409;
  const canSubmit = rating > 0 && body.trim().length > 0;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
      {isLoading ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading rating…</div>
      ) : isError ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Couldn&apos;t load rating.
          <button
            type="button"
            className="btn btn--sm"
            style={{ borderRadius: 6, fontSize: '0.72rem', padding: '2px 8px', background: 'var(--bg-page)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 1 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={14} fill={s <= filled ? '#e0a30d' : 'none'} color={s <= filled ? '#e0a30d' : 'var(--border-default)'} />
                ))}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {count > 0 ? `${avg.toFixed(1)} (${count} review${count === 1 ? '' : 's'})` : 'No reviews yet'}
              </span>
            </div>
            {count > 1 && (
              <select
                aria-label="Sort reviews"
                value={sort}
                onChange={(e) => { setSort(e.target.value); setLimit(TUTOR_REVIEWS_PAGE_SIZE); }}
                style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}
              >
                <option value="recent">Newest</option>
                <option value="rating_desc">Highest rated</option>
                <option value="rating_asc">Lowest rated</option>
              </select>
            )}
          </div>

          {reviews.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {reviews.map((r) => (
                <div key={r._id} style={{ fontSize: '0.75rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', gap: 1, marginBottom: 4 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={11} fill={s <= r.rating ? '#e0a30d' : 'none'} color={s <= r.rating ? '#e0a30d' : 'var(--border-default)'} />
                    ))}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{r.body}</p>
                </div>
              ))}
              {total > reviews.length && (
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.72rem', padding: 0 }}
                  onClick={() => setLimit((l) => l + TUTOR_REVIEWS_PAGE_SIZE)}
                >
                  Show more reviews
                </button>
              )}
            </div>
          )}
        </>
      )}

      {submitReview.isSuccess ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Thanks! Your review is pending approval.
        </div>
      ) : alreadyReviewed ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          You&apos;ve already reviewed your tutor.
        </div>
      ) : !showForm ? (
        <button
          type="button"
          className="btn btn--sm"
          style={{ borderRadius: 8, fontSize: '0.78rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          onClick={() => setShowForm(true)}
        >
          <Star size={12} aria-hidden="true" /> Rate your tutor
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Rate ${s} star${s === 1 ? '' : 's'}`}
                onClick={() => setRating(s)}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Star size={20} fill={s <= (hoverRating || rating) ? '#e0a30d' : 'none'} color={s <= (hoverRating || rating) ? '#e0a30d' : 'var(--border-default)'} />
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell us about your experience with your tutor"
            maxLength={2000}
            rows={2}
            style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: '0.78rem', padding: 8, borderRadius: 8, border: '1px solid var(--border-default)', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'right', marginBottom: 8 }}>
            {body.length}/2000
          </div>
          {submitReview.isError && !alreadyReviewed && (
            <div style={{ fontSize: '0.72rem', color: 'var(--color-danger-text)', marginBottom: 8 }}>
              Couldn&apos;t submit your review. Please try again.
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn--green btn--sm"
              style={{ borderRadius: 8, fontSize: '0.78rem' }}
              disabled={!canSubmit || submitReview.isPending}
              onClick={() => submitReview.mutate()}
            >
              {submitReview.isPending ? 'Submitting…' : 'Submit review'}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ borderRadius: 8, fontSize: '0.78rem', background: 'none', border: 'none', color: 'var(--text-secondary)' }}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
