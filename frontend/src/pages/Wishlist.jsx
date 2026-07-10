import { Link } from 'react-router-dom';
import { Heart, BookOpen } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useWishlist, useRemoveFromWishlist, useClearWishlist } from '../hooks/useWishlist';

export default function Wishlist() {
  const { data, isLoading, isError, refetch } = useWishlist();
  const removeMutation = useRemoveFromWishlist();
  const clearMutation = useClearWishlist();

  // Only render entries whose course is already populated — an in-flight
  // optimistic add (see useAddToWishlist) briefly stores just the raw
  // courseId until the server responds and the query is invalidated.
  const courses = (data?.courses ?? []).filter((w) => w.course && typeof w.course === 'object');

  return (
    <DashboardLayout>
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><Heart size={12} aria-hidden="true" /> Wishlist</div>
          <h1 className="ds-page-hd__title">
            My Wishlist{!isLoading && !isError && courses.length > 0 && ` (${courses.length})`}
          </h1>
          <p className="ds-page-hd__sub">Courses you&apos;re considering enrolling in.</p>
        </div>
        {courses.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            style={{ borderRadius: 8, background: 'var(--bg-page)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', alignSelf: 'flex-start' }}
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            {clearMutation.isPending ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>

      <div className="ds-card">
        <div className="ds-card__body" style={{ padding: isLoading || isError || courses.length === 0 ? '32px 24px' : 18 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center' }}>
              <div className="ds-skel" style={{ width: '60%', height: 16, margin: '0 auto 10px' }} />
              <div className="ds-skel" style={{ width: '40%', height: 14, margin: '0 auto' }} />
            </div>
          ) : isError ? (
            <div className="ds-empty">
              <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1.1rem' }}>⚠️</div>
              <div className="ds-empty__title" style={{ fontSize: '0.9rem' }}>Couldn&apos;t load your wishlist.</div>
              <button
                type="button"
                className="btn btn--sm"
                style={{ marginTop: 10, borderRadius: 8 }}
                onClick={() => refetch()}
              >
                Try again
              </button>
            </div>
          ) : courses.length === 0 ? (
            <div className="ds-empty">
              <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1.1rem' }}>💭</div>
              <div className="ds-empty__title" style={{ fontSize: '0.9rem' }}>Your wishlist is empty</div>
              <div className="ds-empty__desc" style={{ fontSize: '0.78rem' }}>
                Save courses you&apos;re interested in from your dashboard to find them here later.
              </div>
              <Link to="/dashboard" className="btn btn--green btn--sm" style={{ marginTop: 12, borderRadius: 8 }}>
                Browse courses →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courses.map(({ course, addedAt }) => (
                <div
                  key={course._id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                    background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 10,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: 'var(--color-primary-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BookOpen size={18} aria-hidden="true" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {course.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {course.level || 'All levels'}{addedAt && ` · saved ${new Date(addedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Link to={`/courses/${course._id}`} className="btn btn--green btn--sm" style={{ borderRadius: 8, fontSize: '0.78rem', flexShrink: 0 }}>
                    View
                  </Link>
                  <button
                    type="button"
                    aria-label={`Remove ${course.title} from wishlist`}
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(course._id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                  >
                    <Heart size={18} fill="#e0405d" color="#e0405d" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
