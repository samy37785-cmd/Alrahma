import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { getCourseReviews, createReview } from '../../../api/reviewApi';

const PAGE_SIZE = 5;

function Stars({ value, size = 16 }) {
  const filled = Math.round(value);
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ fontSize: size, color: s <= filled ? '#e0a30d' : '#d8ded9', lineHeight: 1 }}>★</span>
      ))}
    </span>
  );
}

function RatingBar({ star, count, total }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', color: '#666' }}>
      <span style={{ width: 34, flexShrink: 0 }}>{star} ★</span>
      <div style={{ flex: 1, height: 8, background: '#eef2ef', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#0b6e4f' }} />
      </div>
      <span style={{ width: 26, textAlign: 'right', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

// Course Reviews — the same createReview/getCourseReviews backend endpoints
// that power the teacher-review flow (Dashboard.jsx's TutorReviewWidget),
// applied to a real course instead of a real teacher. There is no edit/
// delete-own-review endpoint on the backend (only create + admin moderate),
// so this intentionally does not offer those actions.
export default function CourseReviews({ courseId }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reviews', 'course', courseId, limit],
    queryFn: () => getCourseReviews(courseId, { limit }),
    enabled: !!courseId,
    staleTime: 60000,
  });

  const submitReview = useMutation({
    mutationFn: () => createReview({ courseId, rating, title: title.trim() || undefined, body: bodyText }),
    onSuccess: () => {
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['reviews', 'course', courseId] });
    },
  });

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const avg = data?.avg ?? 0;
  const count = data?.count ?? 0;
  const distribution = data?.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const alreadyReviewed = submitReview.isError && submitReview.error?.response?.status === 409;
  const canSubmit = rating > 0 && bodyText.trim().length > 0;

  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h2 style={{ margin: '0 0 16px', color: '#0b6e4f' }}>Reviews</h2>

      {isLoading ? (
        <p style={{ color: '#888' }}>Loading reviews…</p>
      ) : isError ? (
        <div style={{ background: '#fff8e7', border: '1px solid #f0c040', borderRadius: 10, padding: '16px 20px' }}>
          <p style={{ margin: '0 0 8px' }}>Couldn&apos;t load reviews.</p>
          <button type="button" className="btn btn--green btn--sm" onClick={() => refetch()}>Try again</button>
        </div>
      ) : (
        <>
          {/* Summary: average, star breakdown, count, distribution */}
          <div style={{
            display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24,
            padding: '16px 20px', background: '#f7faf8', borderRadius: 10,
          }}>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0b6e4f' }}>{avg.toFixed(1)}</div>
              <Stars value={avg} />
              <div style={{ fontSize: '.78rem', color: '#888', marginTop: 4 }}>
                {count} review{count === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              {[5, 4, 3, 2, 1].map((s) => (
                <RatingBar key={s} star={s} count={distribution[s] ?? 0} total={count} />
              ))}
            </div>
          </div>

          {/* Submit a review */}
          {user && (
            submitReview.isSuccess ? (
              <p style={{ color: '#0b6e4f', fontWeight: 600, marginBottom: 20 }}>
                Thanks! Your review is pending approval.
              </p>
            ) : alreadyReviewed ? (
              <p style={{ color: '#888', marginBottom: 20 }}>You&apos;ve already reviewed this course.</p>
            ) : !showForm ? (
              <button
                type="button"
                className="btn btn--green btn--sm"
                style={{ marginBottom: 24 }}
                onClick={() => setShowForm(true)}
              >
                Write a review
              </button>
            ) : (
              <div style={{ border: '1px solid #e0e8e4', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`Rate ${s} star${s === 1 ? '' : 's'}`}
                      onClick={() => setRating(s)}
                      onMouseEnter={() => setHoverRating(s)}
                      onMouseLeave={() => setHoverRating(0)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1.4rem',
                        color: s <= (hoverRating || rating) ? '#e0a30d' : '#d8ded9',
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (optional)"
                  maxLength={120}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e8e4', marginBottom: 8, boxSizing: 'border-box' }}
                />
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="Share your experience with this course"
                  maxLength={2000}
                  rows={3}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e8e4',
                    marginBottom: 10, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
                {submitReview.isError && !alreadyReviewed && (
                  <p style={{ color: '#c0392b', fontSize: '.82rem', marginBottom: 8 }}>
                    Couldn&apos;t submit your review. Please try again.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--green btn--sm"
                    disabled={!canSubmit || submitReview.isPending}
                    onClick={() => submitReview.mutate()}
                  >
                    {submitReview.isPending ? 'Submitting…' : 'Submit review'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    style={{ background: 'none', border: 'none', color: '#888' }}
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          )}

          {/* Review list */}
          {reviews.length === 0 ? (
            <p style={{ color: '#888' }}>No reviews yet. Be the first to share your experience.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reviews.map((r) => (
                <div key={r._id} style={{ borderBottom: '1px solid #eef2ef', paddingBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <Stars value={r.rating} size={13} />
                    <strong style={{ fontSize: '.85rem' }}>{r.student?.name || 'Anonymous'}</strong>
                    <span style={{ fontSize: '.75rem', color: '#aaa' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.title && <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{r.title}</p>}
                  <p style={{ margin: 0, color: '#444', fontSize: '.9rem', lineHeight: 1.6 }}>{r.body}</p>
                </div>
              ))}
              {total > reviews.length && (
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ alignSelf: 'center', background: 'none', border: 'none', color: '#0b6e4f', fontWeight: 600 }}
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
