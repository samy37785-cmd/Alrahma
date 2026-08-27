import { useState } from 'react';
import { moderatePost, moderateComment } from '../../../api/communityApi';

export default function AdminCommunityTab({ posts, postsTotal, comments, commentsTotal, onPostsChange, onCommentsChange, onError }) {
  const [subTab, setSubTab] = useState('posts');
  const [statusFilter, setStatusFilter] = useState('pending');

  const handleModeratePost = async (id, status) => {
    try {
      const { post } = await moderatePost(id, { status });
      onPostsChange((prev) => prev.map((p) => (p._id === id ? post : p)));
    } catch (err) {
      onError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleModerateComment = async (id, status) => {
    try {
      const { comment } = await moderateComment(id, { status });
      onCommentsChange((prev) => prev.map((c) => (c._id === id ? comment : c)));
    } catch (err) {
      onError(err.response?.data?.message || 'Action failed');
    }
  };

  const visiblePosts = statusFilter === 'all' ? posts : posts.filter((p) => p.status === statusFilter);
  const visibleComments = statusFilter === 'all' ? comments : comments.filter((c) => c.status === statusFilter);
  const pendingPosts = posts.filter((p) => p.status === 'pending').length;
  const pendingComments = comments.filter((c) => c.status === 'pending').length;

  return (
    <section className="admin__panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={subTab === 'posts' ? 'btn btn--green btn--sm' : 'btn btn--sm'}
            onClick={() => setSubTab('posts')}
          >
            Posts ({pendingPosts} pending / {postsTotal} total)
          </button>
          <button
            type="button"
            className={subTab === 'comments' ? 'btn btn--green btn--sm' : 'btn btn--sm'}
            onClick={() => setSubTab('comments')}
          >
            Comments ({pendingComments} pending / {commentsTotal} total)
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      {subTab === 'posts' ? (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr><th>Student</th><th>Post</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {visiblePosts.map((p) => (
                <tr key={p._id}>
                  <td>{p.author?.name || '—'}</td>
                  <td style={{ maxWidth: 360 }}>{p.body}</td>
                  <td><span className={`admin__badge admin__badge--${p.status}`}>{p.status}</span></td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>
                    {p.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn--green btn--sm" onClick={() => handleModeratePost(p._id, 'approved')}>✓</button>
                        <button className="admin__del" onClick={() => handleModeratePost(p._id, 'rejected')}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {visiblePosts.length === 0 && (
                <tr><td colSpan="5" className="admin__empty">No posts to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr><th>Student</th><th>Comment</th><th>On post</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {visibleComments.map((c) => (
                <tr key={c._id}>
                  <td>{c.author?.name || '—'}</td>
                  <td style={{ maxWidth: 280 }}>{c.body}</td>
                  <td style={{ maxWidth: 200 }}>{c.post?.body || '—'}</td>
                  <td><span className={`admin__badge admin__badge--${c.status}`}>{c.status}</span></td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    {c.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn--green btn--sm" onClick={() => handleModerateComment(c._id, 'approved')}>✓</button>
                        <button className="admin__del" onClick={() => handleModerateComment(c._id, 'rejected')}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {visibleComments.length === 0 && (
                <tr><td colSpan="6" className="admin__empty">No comments to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
