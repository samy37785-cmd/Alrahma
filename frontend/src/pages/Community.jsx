import { useState } from 'react';
import { Users, Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Skeleton } from '../components/ui/Skeleton';
import {
  useCommunityFeed,
  useMyPosts,
  useCreatePost,
  useDeletePost,
  useToggleLike,
  usePostComments,
  useCreateComment,
  useDeleteComment,
} from '../hooks/useCommunity';
import { useAuth } from '../context/AuthContext';
import '../styles/community.css';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function CommentThread({ postId }) {
  const { data: comments = [], isLoading } = usePostComments(postId);
  const createComment = useCreateComment(postId);
  const deleteComment = useDeleteComment(postId);
  const { user } = useAuth();
  const [draft, setDraft] = useState('');

  const handleSubmit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await createComment.mutateAsync({ body });
  };

  return (
    <div className="community-comments">
      {isLoading ? (
        <Skeleton height={32} radius="var(--radius-md)" />
      ) : (
        comments.map((c) => (
          <div key={c._id} className="community-comment">
            <span className="community-comment__author">{c.author?.name || 'Student'}</span>
            <span className="community-comment__body">{c.body}</span>
            {c.author?._id === user?._id && (
              <button
                type="button"
                className="community-comment__delete"
                onClick={() => deleteComment.mutate(c._id)}
                aria-label="Delete comment"
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        ))
      )}
      {comments.length === 0 && !isLoading && (
        <div className="community-comments__empty">No comments yet.</div>
      )}
      <div className="community-comments__composer">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Write a comment… (reviewed before it appears)"
          maxLength={1000}
        />
        <button type="button" onClick={handleSubmit} aria-label="Send comment">
          <Send size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, onDelete, mine = false }) {
  const toggleLike = useToggleLike();
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const liked = post.likes?.includes(user?._id);

  return (
    <div className="community-post">
      <div className="community-post__hd">
        <span className="community-post__author">{post.author?.name || 'Student'}</span>
        <span className="community-post__date">{fmtDate(post.createdAt)}</span>
        {mine && <span className={`ds-badge ds-badge--${post.status === 'approved' ? 'green' : post.status === 'rejected' ? 'red' : 'yellow'}`}>{post.status}</span>}
        {post.author?._id === user?._id && (
          <button type="button" className="community-post__delete" onClick={() => onDelete(post._id)} aria-label="Delete post">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="community-post__body">{post.body}</p>
      {post.status === 'approved' || !mine ? (
        <div className="community-post__actions">
          <button
            type="button"
            className={`community-post__action${liked ? ' community-post__action--active' : ''}`}
            onClick={() => toggleLike.mutate(post._id)}
          >
            <Heart size={14} aria-hidden="true" fill={liked ? 'currentColor' : 'none'} /> {post.likes?.length || 0}
          </button>
          <button type="button" className="community-post__action" onClick={() => setShowComments((s) => !s)}>
            <MessageCircle size={14} aria-hidden="true" /> {post.commentCount ?? 0}
          </button>
        </div>
      ) : null}
      {showComments && <CommentThread postId={post._id} />}
    </div>
  );
}

export default function Community() {
  const [tab, setTab] = useState('feed');
  const [draft, setDraft] = useState('');
  const { data: feed = { posts: [] }, isLoading: feedLoading } = useCommunityFeed();
  const { data: myPosts = [], isLoading: mineLoading } = useMyPosts();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();

  const handlePost = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await createPost.mutateAsync({ body });
  };

  return (
    <DashboardLayout>
      <div className="ds-page-hd">
        <div className="ds-page-hd__left">
          <div className="ds-page-hd__eyebrow"><Users size={12} aria-hidden="true" /> Community</div>
          <h1 className="ds-page-hd__title">Al-Rahma Community</h1>
          <p className="ds-page-hd__sub">Share reflections and connect with fellow students. Every post and comment is reviewed before it&apos;s visible to others.</p>
        </div>
      </div>

      <div className="community-composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Share a reflection with the community…"
          rows={3}
          maxLength={2000}
        />
        <button type="button" className="btn btn--green btn--sm" onClick={handlePost} disabled={!draft.trim() || createPost.isPending}>
          Post
        </button>
      </div>

      <div className="ds-tabs" style={{ marginBottom: 16 }} role="tablist">
        <button type="button" className="ds-tab" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>Feed</button>
        <button type="button" className="ds-tab" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>My Posts</button>
      </div>

      {tab === 'feed' ? (
        feedLoading ? (
          <Skeleton height={100} radius="var(--radius-md)" />
        ) : feed.posts.length === 0 ? (
          <div className="ds-empty"><div className="ds-empty__title">No posts yet</div><div className="ds-empty__desc">Be the first to share something with the community.</div></div>
        ) : (
          feed.posts.map((p) => <PostCard key={p._id} post={p} onDelete={(id) => deletePost.mutate(id)} />)
        )
      ) : mineLoading ? (
        <Skeleton height={100} radius="var(--radius-md)" />
      ) : myPosts.length === 0 ? (
        <div className="ds-empty"><div className="ds-empty__title">You haven&apos;t posted yet</div></div>
      ) : (
        myPosts.map((p) => <PostCard key={p._id} post={p} onDelete={(id) => deletePost.mutate(id)} mine />)
      )}
    </DashboardLayout>
  );
}
